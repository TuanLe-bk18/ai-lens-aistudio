import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, MediaProcessing, Type } from '@google/genai';
import {
  CRITERION_TO_INDICATOR,
  RUBRIC_INDICATORS,
} from '../data/rubricData';
import {
  AgenticInspectionStep,
  CriterionCode,
  EvidenceItem,
  RubricIndicator,
  StudentSeatProfile,
  TranscriptSegment,
  VideoProcessingMode,
} from '../types';

export interface AnalyzeVideoInput {
  apiKey: string;
  sourceId: string;
  base64Data: string;
  mimeType: string;
  durationSeconds: number;
  students: StudentSeatProfile[];
  processingMode?: VideoProcessingMode;
  rubricIndicators?: RubricIndicator[];
}

export interface AnalyzeVideoResult {
  model: string;
  processingModeUsed: VideoProcessingMode;
  usedFilesApi: boolean;
  sourceId: string;
  transcriptSegments: TranscriptSegment[];
  agenticSteps: AgenticInspectionStep[];
  evidences: EvidenceItem[];
}

const AGENTIC_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

export async function analyzeClassroomMediaWithGemini(
  input: AnalyzeVideoInput
): Promise<AnalyzeVideoResult> {
  const {
    apiKey,
    sourceId,
    base64Data,
    mimeType,
    durationSeconds,
    students,
    processingMode = 'AGENTIC',
    rubricIndicators,
  } = input;

  const ai = new GoogleGenAI({ apiKey });
  const isImage = mimeType.startsWith('image/');
  const requestedMode: VideoProcessingMode = isImage ? 'STATIC' : processingMode;

  const seatMapText = (students || [])
    .map(
      (s) =>
        `- ${s.code} (${s.seatLabel}): ${s.visualPosition}. Vai trò thường gặp: ${s.mainObservedRole}`
    )
    .join('\n');

  const indicatorsToUse = rubricIndicators && rubricIndicators.length > 0 ? rubricIndicators : RUBRIC_INDICATORS;
  const validCriterionCodes = Array.from(
    new Set(indicatorsToUse.map((r) => r.criterionCode).filter(Boolean))
  );
  if (validCriterionCodes.length === 0) {
    validCriterionCodes.push('TC1', 'TC2', 'TC3', 'TC4', 'TC5');
  }

  const checklistText = indicatorsToUse
    .map(
      (r) =>
        `- ${r.criterionCode} (Chỉ số ${r.indicatorCode} - ${r.checklistTitle}): Cần tìm "${r.aiLookFor}". Minh chứng: "${r.requiredEvidence}"`
    )
    .join('\n');

  const promptText = `Bạn là hệ thống Agentic Video Understanding & Audio-Visual Speaker Diarization của AI-LENS phục vụ đánh giá năng lực Khoa học tự nhiên 7 (Bài 8: Đo tốc độ của ô tô đồ chơi chạy trên mặt dốc).

1. SƠ ĐỒ VỊ TRÍ & DẤU HIỆU NHẬN DIỆN HÌNH ẢNH 4 HỌC SINH TRONG NHÓM (CỰC KỲ QUAN TRỌNG ĐỂ XÁC ĐỊNH "AI NÓI GÌ"):
${seatMapText}

2. BẢNG KIỂM THU THẬP BẰNG CHỨNG (${validCriterionCodes.join(', ')}):
${checklistText}

3. QUY TRÌNH AGENTIC VIDEO & AUDIO-VISUAL SPEAKER GROUNDING BẮT BUỘC:
- Bước A (Scan Audio & Transcript): Lắng nghe toàn bộ kênh âm thanh tiếng Việt trong ${
    isImage ? 'ảnh' : `video (${durationSeconds} giây)`
  }, tách riêng từng lượt lời thoại ngắn của từng cá nhân kèm mốc thời gian chính xác [startSeconds, endSeconds]. KHÔNG gộp lời thoại của nhiều người vào cùng một câu.
- Bước B (Audio-Visual Speaker Diarization — Xác thực "Ai nói gì" bằng hình ảnh):
  * TUYỆT ĐỐI KHÔNG đoán người nói chỉ bằng âm sắc giọng nói vì 4 học sinh nữ có giọng rất giống nhau.
  * BẮT BUỘC zoom khung hình tại đúng giây [startSeconds, endSeconds] của câu thoại để đối chiếu 3 bằng chứng hình ảnh:
    (1) Khẩu hình (Lip-sync): Môi/miệng của học sinh nào đang mở và cử động khớp với câu nói? (Ví dụ: học sinh đang mím môi nhìn điện thoại hoặc đang cúi đầu mím môi ghi vở thì KHÔNG PHẢI là người đang nói).
    (2) Cử chỉ tay (Hand gesture): Tay của ai đang vung lên minh họa, chỉ vào SGK, giơ tay nhận nhiệm vụ ("Để tớ cho"), hoặc khoát tay?
    (3) Đạo cụ cầm tay (Object ownership): Người nói "lấy băng dính của tớ đi" phải là người đang cầm cuộn băng dính trên tay; người đọc kết quả đồng hồ bấm giây phải là người cầm điện thoại; người đọc số đo trên thước phải là người đang cúi nhìn vạch thước.
  * Ghi rõ bằng chứng hình ảnh xác thực người nói vào trường \`acousticNote\` của mỗi câu thoại (ví dụ: "HS01 (Trái-Ngoài): Môi cử động + hai tay cầm cuộn băng dính kéo dán lên mặt bàn").
- Bước C (Cross-check Rubric): Kết hợp cả Hành vi hình ảnh (observableBehavior) VÀ Lời nói nguyên văn đã định danh đúng người nói (spokenTranscript) để tạo danh sách thẻ minh chứng cá nhân hóa chính xác từng học sinh.
- NGUYÊN TẮC TRUNG THỰC: Không suy diễn khi chưa đủ bằng chứng. Nếu góc quay khuất hoặc không rõ ai nói/làm, đặt subjectScope = "unknown". Không tự chấm mức M1-M3.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      transcriptSegments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            startSeconds: { type: Type.NUMBER },
            endSeconds: { type: Type.NUMBER },
            speakerCode: {
              type: Type.STRING,
              enum: ['HS01', 'HS02', 'HS03', 'HS04', 'NHOM'],
            },
            text: { type: Type.STRING },
            acousticNote: { type: Type.STRING },
            linkedCriteria: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                enum: validCriterionCodes,
              },
            },
          },
          required: ['startSeconds', 'endSeconds', 'speakerCode', 'text'],
        },
      },
      agenticSteps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            stepNumber: { type: Type.INTEGER },
            actionType: {
              type: Type.STRING,
              enum: ['scan_transcript', 'zoom_frames_high_fps', 'cross_check_rubric'],
            },
            timeWindow: { type: Type.STRING },
            detail: { type: Type.STRING },
          },
          required: ['stepNumber', 'actionType', 'timeWindow', 'detail'],
        },
      },
      evidences: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            startSeconds: { type: Type.NUMBER },
            endSeconds: { type: Type.NUMBER },
            criterionCode: {
              type: Type.STRING,
              enum: validCriterionCodes,
            },
            subjectScope: {
              type: Type.STRING,
              enum: ['individual', 'group', 'unknown'],
            },
            studentCodes: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
                enum: ['HS01', 'HS02', 'HS03', 'HS04'],
              },
            },
            observableBehavior: { type: Type.STRING },
            spokenTranscript: { type: Type.STRING },
            modality: {
              type: Type.STRING,
              enum: ['visual_and_audio', 'visual_only', 'audio_transcript'],
            },
            agenticNote: { type: Type.STRING },
            clarity: {
              type: Type.STRING,
              enum: ['clear', 'partial', 'unclear'],
            },
            limitations: { type: Type.STRING },
          },
          required: [
            'startSeconds',
            'endSeconds',
            'criterionCode',
            'subjectScope',
            'studentCodes',
            'observableBehavior',
            'clarity',
          ],
        },
      },
    },
    required: ['transcriptSegments', 'agenticSteps', 'evidences'],
  };

  // Upload via Files API when using AGENTIC video understanding (recommended by official Gemini docs)
  let uploadedFileUri: string | undefined;
  let uploadedFileName: string | undefined;
  let tempFilePath: string | undefined;

  if (!isImage && requestedMode === 'AGENTIC') {
    try {
      const safeId = String(sourceId).replace(/[^a-zA-Z0-9_-]/g, '');
      const ext = mimeType.includes('webm') ? '.webm' : '.mp4';
      tempFilePath = path.join(
        os.tmpdir(),
        `ailens_${safeId || 'src'}_${Date.now()}${ext}`
      );
      fs.writeFileSync(tempFilePath, Buffer.from(base64Data, 'base64'));

      let uploaded = await ai.files.upload({
        file: tempFilePath,
        config: { mimeType },
      });

      let pollCount = 0;
      while (uploaded.state === 'PROCESSING' && pollCount < 15) {
        await new Promise((r) => setTimeout(r, 1500));
        uploaded = await ai.files.get({ name: uploaded.name! });
        pollCount += 1;
      }

      if (uploaded.uri && uploaded.state !== 'FAILED') {
        uploadedFileUri = uploaded.uri;
        uploadedFileName = uploaded.name;
      }
    } catch {
      // Fallback to inlineData if Files API upload fails
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // ignore cleanup error
        }
      }
    }
  }

  const preferredModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const candidateModels = Array.from(
    new Set([preferredModel, 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])
  );

  let response: any;
  let usedModel = preferredModel;
  let actualProcessingMode: VideoProcessingMode = requestedMode;
  let lastError: any;

  try {
    for (const modelName of candidateModels) {
      try {
        const supportsAgentic = AGENTIC_MODELS.some((m) => modelName.startsWith(m));
        const modeForThisModel: VideoProcessingMode =
          requestedMode === 'AGENTIC' && supportsAgentic ? 'AGENTIC' : 'STATIC';

        const mediaPart: any = uploadedFileUri
          ? {
              fileData: {
                fileUri: uploadedFileUri,
                mimeType,
              },
              ...(supportsAgentic
                ? {
                    mediaProcessing:
                      modeForThisModel === 'AGENTIC'
                        ? MediaProcessing.AGENTIC
                        : MediaProcessing.STATIC,
                  }
                : {}),
            }
          : {
              inlineData: {
                data: base64Data,
                mimeType,
              },
              ...(supportsAgentic && !isImage
                ? {
                    mediaProcessing:
                      modeForThisModel === 'AGENTIC'
                        ? MediaProcessing.AGENTIC
                        : MediaProcessing.STATIC,
                  }
                : {}),
            };

        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [mediaPart, { text: promptText }],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        usedModel = modelName;
        actualProcessingMode = modeForThisModel;
        break;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        if (
          msg.includes('404') ||
          msg.includes('not found') ||
          msg.includes('NOT_FOUND') ||
          msg.includes('not supported') ||
          msg.includes('media_processing') ||
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED')
        ) {
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      throw lastError || new Error('Không thể gọi Gemini API với các model hiện có.');
    }

    const rawText = response.text || '{"transcriptSegments":[],"agenticSteps":[],"evidences":[]}';
    const parsed = JSON.parse(rawText);
    const nowIso = new Date().toISOString();

    const transcriptSegments: TranscriptSegment[] = (
      parsed.transcriptSegments || []
    ).map((seg: any, idx: number) => {
      const start = Math.max(0, Math.floor(Number(seg.startSeconds) || 0));
      const end = Math.min(
        Math.ceil(durationSeconds),
        Math.max(start + 1, Math.ceil(Number(seg.endSeconds) || start + 3))
      );
      return {
        id: `TR-${sourceId}-${idx + 1}`,
        startSeconds: start,
        endSeconds: end,
        speakerCode: seg.speakerCode || 'NHOM',
        text: seg.text || '',
        acousticNote: seg.acousticNote || undefined,
        linkedCriteria: Array.isArray(seg.linkedCriteria) ? seg.linkedCriteria : undefined,
      };
    });

    const agenticSteps: AgenticInspectionStep[] = (parsed.agenticSteps || []).map(
      (st: any, idx: number) => ({
        stepNumber: Number(st.stepNumber) || idx + 1,
        actionType: st.actionType || 'scan_transcript',
        timeWindow: st.timeWindow || '00:00 - 00:15',
        detail: st.detail || '',
      })
    );

    const mappedEvidences: EvidenceItem[] = (parsed.evidences || []).map(
      (item: any, idx: number) => {
        const criterionCode = (item.criterionCode || 'TC2') as CriterionCode;
        const start = Math.max(
          0,
          Math.min(
            Math.max(0, Math.floor(durationSeconds) - 1),
            Math.floor(Number(item.startSeconds) || 0)
          )
        );
        const end = Math.min(
          Math.ceil(durationSeconds),
          Math.max(start + 1, Math.ceil(Number(item.endSeconds) || start + 4))
        );

        const matchedIndicator = indicatorsToUse.find((r) => r.criterionCode === criterionCode);
        const indicatorCode = matchedIndicator?.indicatorCode || CRITERION_TO_INDICATOR[criterionCode] || '2.4';

        return {
          id: `EV-AI-${sourceId}-${Date.now().toString().slice(-4)}-${idx + 1}`,
          revision: 1,
          sourceId,
          startSeconds: start,
          endSeconds: end,
          criterionCode,
          indicatorCode,
          subjectScope: item.subjectScope || 'individual',
          studentCodes: Array.isArray(item.studentCodes) ? item.studentCodes : [],
          observableBehavior: item.observableBehavior || '',
          spokenTranscript: item.spokenTranscript || undefined,
          modality: item.modality || 'visual_and_audio',
          agenticNote: item.agenticNote || undefined,
          clarity: item.clarity || 'clear',
          origin: 'ai' as const,
          limitations: item.limitations || undefined,
          selfReviews: [],
          peerReviews: [],
          teacherStatus: 'pending' as const,
          createdAt: nowIso,
        };
      }
    );

    return {
      model: usedModel,
      processingModeUsed: actualProcessingMode,
      usedFilesApi: Boolean(uploadedFileUri),
      sourceId,
      transcriptSegments,
      agenticSteps,
      evidences: mappedEvidences,
    };
  } finally {
    if (uploadedFileName) {
      try {
        await ai.files.delete({ name: uploadedFileName });
      } catch {
        // ignore delete cleanup error
      }
    }
  }
}
