import { GoogleGenAI, Type } from '@google/genai';
import mammoth from 'mammoth';
import { RubricIndicator } from '../types';
import { RUBRIC_INDICATORS } from '../data/rubricData';

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
];

export interface ExtractedRubricResult {
  lessonTitle: string;
  gradeSubject: string;
  activityTitle: string;
  rubricVersion: string;
  summary: string;
  indicators: RubricIndicator[];
}

export interface RubricChatResult {
  reply: string;
  hasRubricUpdate: boolean;
  suggestedRubric?: RubricIndicator[];
}

const RUBRIC_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    lessonTitle: {
      type: Type.STRING,
      description: 'Tên bài học hoặc chủ đề KHTN được đề cập trong tài liệu',
    },
    gradeSubject: {
      type: Type.STRING,
      description: 'Lớp và môn học, ví dụ: Khoa học tự nhiên 7 (THCS)',
    },
    activityTitle: {
      type: Type.STRING,
      description: 'Tên hoạt động hoặc bài thực hành/thí nghiệm cụ thể',
    },
    summary: {
      type: Type.STRING,
      description: 'Tóm tắt ngắn gọn các tiêu chí đã trích xuất và lưu ý quan sát thực tế',
    },
    indicators: {
      type: Type.ARRAY,
      description: 'Danh sách các chỉ số và tiêu chí rubric đánh giá năng lực',
      items: {
        type: Type.OBJECT,
        properties: {
          indicatorCode: {
            type: Type.STRING,
            description: 'Mã chỉ số năng lực thành phần (ví dụ 2.3, 2.4, 2.5, 2.6, 3.2 hoặc mã tương đương)',
          },
          criterionCode: {
            type: Type.STRING,
            description: 'Mã tiêu chí bảng kiểm (ví dụ TC1, TC2, TC3, TC4, TC5, TC6...)',
          },
          componentName: {
            type: Type.STRING,
            description: 'Tên thành tố năng lực KHTN (ví dụ: 2. Tìm tòi, khám phá thế giới tự nhiên)',
          },
          indicatorTitle: {
            type: Type.STRING,
            description: 'Tiêu đề đầy đủ của chỉ số năng lực (ví dụ: 2.3. Đề xuất phương án thí nghiệm...)',
          },
          checklistTitle: {
            type: Type.STRING,
            description: 'Tiêu đề ngắn gọn hiển thị trên thẻ bảng kiểm (ví dụ: 2.3. Đề xuất phương án)',
          },
          aiLookFor: {
            type: Type.STRING,
            description: 'Hành vi, cử chỉ, lời nói, thao tác của học sinh mà AI cần tìm kiếm qua video/lời thoại',
          },
          requiredEvidence: {
            type: Type.STRING,
            description: 'Minh chứng bắt buộc cần có để xác thực (video, lời nói, bảng số liệu, ảnh phiếu)',
          },
          levels: {
            type: Type.OBJECT,
            properties: {
              M1: { type: Type.STRING, description: 'Mức 1: Làm được khi có hướng dẫn/gợi ý' },
              M2: { type: Type.STRING, description: 'Mức 2: Tự thực hiện độc lập, đúng quy trình' },
              M3: { type: Type.STRING, description: 'Mức 3: Thực hiện thành thạo, chủ động, phân tích sâu' },
            },
            required: ['M1', 'M2', 'M3'],
          },
          note: {
            type: Type.STRING,
            description: 'Lưu ý sư phạm hoặc hướng dẫn kiểm chứng (nếu có)',
          },
        },
        required: [
          'indicatorCode',
          'criterionCode',
          'componentName',
          'indicatorTitle',
          'checklistTitle',
          'aiLookFor',
          'requiredEvidence',
          'levels',
        ],
      },
    },
  },
  required: ['lessonTitle', 'gradeSubject', 'activityTitle', 'summary', 'indicators'],
};

export async function extractRubricFromDocument(params: {
  apiKey: string;
  fileName: string;
  fileType: string;
  fileBase64?: string;
  text?: string;
  currentContext?: { lessonTitle?: string; gradeSubject?: string; activityTitle?: string };
}): Promise<ExtractedRubricResult> {
  const { apiKey, fileName, fileType, fileBase64, text, currentContext } = params;
  const ai = new GoogleGenAI({ apiKey });

  let textContent = text || '';
  const isDocx =
    fileName.toLowerCase().endsWith('.docx') ||
    fileType.includes('wordprocessingml') ||
    fileType.includes('docx');
  const isPdf =
    fileName.toLowerCase().endsWith('.pdf') ||
    fileType === 'application/pdf';

  if (isDocx && fileBase64) {
    try {
      const buffer = Buffer.from(fileBase64, 'base64');
      const docxResult = await mammoth.extractRawText({ buffer });
      textContent = docxResult.value || '';
    } catch (err: any) {
      console.warn('[AI-LENS] Mammoth docx extraction fallback:', err?.message);
    }
  }

  const promptText = `
Bạn là chuyên gia thẩm định và xây dựng Rubric đánh giá năng lực thực hành môn Khoa học Tự nhiên (KHTN) theo Chương trình Giáo dục phổ thông 2018 (GDPT 2018).
Dưới đây là tài liệu Rubric / Giáo án / Đề cương do giáo viên cung cấp:
Tên tệp: "${fileName}"
Bối cảnh hiện tại: ${currentContext?.gradeSubject || 'Khoa học tự nhiên'} · ${currentContext?.lessonTitle || 'Bài thực hành KHTN'} · ${currentContext?.activityTitle || 'Nhiệm vụ thực nghiệm'}.

NHIỆM VỤ CỦA BẠN:
1. Đọc kỹ toàn bộ nội dung tài liệu.
2. Trích xuất hoặc tổng hợp bộ tiêu chí Rubric đánh giá năng lực thực hành KHTN thành các tiêu chí (TC1, TC2, TC3...).
3. Với mỗi tiêu chí, làm rõ:
   - componentName: Thành phần năng lực (1. Nhận thức KHTN; 2. Tìm tòi, khám phá thế giới tự nhiên; 3. Vận dụng kiến thức, kỹ năng).
   - indicatorCode: Mã chỉ số (ví dụ: 2.3, 2.4, 2.5, 2.6, 3.2...).
   - criterionCode: Mã tiêu chí (TC1, TC2, TC3...).
   - indicatorTitle: Tiêu đề năng lực đầy đủ.
   - checklistTitle: Tiêu đề ngắn gọn cho bảng kiểm.
   - aiLookFor: ĐẶC BIỆT QUAN TRỌNG: Mô tả cụ thể các hành vi, lời nói, thao tác của học sinh trong phòng học/thí nghiệm mà mô hình AI và camera lớp học có thể nhận diện được.
   - requiredEvidence: Bằng chứng cần có (đoạn video thao tác, câu nói đối thoại, số liệu đo, bảng ghi...).
   - levels: Chuẩn 3 mức độ biểu hiện:
     * M1: Thực hiện được khi có hướng dẫn / nhắc nhở / gợi ý.
     * M2: Tự thực hiện đúng kỹ thuật, độc lập, hoàn thành nhiệm vụ.
     * M3: Thực hiện thành thạo, chủ động phân tích, giải thích nguyên nhân, phát hiện sai số hoặc đề xuất cải tiến.
   - note: Lưu ý thêm nếu có.

Nếu tài liệu chỉ là đề bài hoặc kế hoạch bài dạy sơ bộ, hãy chủ động xây dựng đầy đủ bộ 4-6 tiêu chí chuẩn theo đúng tiến trình phương pháp thực nghiệm KHTN GDPT 2018.
Trích xuất ra định dạng JSON theo đúng schema quy định.
`;

  const contents: any[] = [];
  if (isPdf && fileBase64) {
    contents.push({
      role: 'user',
      parts: [
        {
          inlineData: {
            data: fileBase64,
            mimeType: 'application/pdf',
          },
        },
        { text: promptText },
      ],
    });
  } else {
    contents.push({
      role: 'user',
      parts: [
        {
          text: `${promptText}\n\n--- NỘI DUNG TÀI LIỆU ---\n${textContent || 'Tài liệu không có văn bản trực tiếp.'}`,
        },
      ],
    });
  }

  let lastError: any;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: RUBRIC_JSON_SCHEMA,
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.indicators && Array.isArray(parsed.indicators) && parsed.indicators.length > 0) {
        return {
          lessonTitle: parsed.lessonTitle || currentContext?.lessonTitle || 'Bài học thực hành KHTN',
          gradeSubject: parsed.gradeSubject || currentContext?.gradeSubject || 'Khoa học tự nhiên (THCS)',
          activityTitle: parsed.activityTitle || currentContext?.activityTitle || 'Hoạt động thực nghiệm',
          rubricVersion: `v-custom-${new Date().toISOString().slice(0, 10)}`,
          summary: parsed.summary || 'Trích xuất thành công tiêu chí Rubric từ tài liệu của giáo viên.',
          indicators: parsed.indicators,
        };
      }
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      if (
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('404') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand')
      ) {
        continue;
      }
      if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
        const heuristic = parseRubricHeuristically(textContent, currentContext);
        return {
          lessonTitle: currentContext?.lessonTitle || 'Bài học thực hành KHTN',
          gradeSubject: currentContext?.gradeSubject || 'Khoa học tự nhiên (THCS)',
          activityTitle: currentContext?.activityTitle || 'Hoạt động thực nghiệm',
          rubricVersion: `v-local-${new Date().toISOString().slice(0, 10)}`,
          summary: `Đã trích xuất cấu trúc văn bản (${heuristic.length} tiêu chí). Thầy/cô có thể kiểm tra và tinh chỉnh lại trong bảng biên tập.`,
          indicators: heuristic,
        };
      }
      throw err;
    }
  }

  const fallbackIndicators = parseRubricHeuristically(textContent, currentContext);
  return {
    lessonTitle: currentContext?.lessonTitle || 'Bài học thực hành KHTN',
    gradeSubject: currentContext?.gradeSubject || 'Khoa học tự nhiên (THCS)',
    activityTitle: currentContext?.activityTitle || 'Hoạt động thực nghiệm',
    rubricVersion: 'v-fallback-template',
    summary: 'Đã đề xuất bộ Rubric mẫu chuẩn GDPT 2018 phù hợp với nhiệm vụ thực hành KHTN.',
    indicators: fallbackIndicators.length > 0 ? fallbackIndicators : RUBRIC_INDICATORS,
  };
}

function parseRubricHeuristically(
  text: string,
  context?: { lessonTitle?: string; gradeSubject?: string; activityTitle?: string }
): RubricIndicator[] {
  if (!text || text.trim().length === 0) {
    return RUBRIC_INDICATORS;
  }

  const criteriaBlocks = text.split(/(?=Tiêu chí\s*\d+|Tiêu chí\s*[A-Z]|TC\d+:)/i);
  if (criteriaBlocks.length <= 1) {
    return RUBRIC_INDICATORS;
  }

  const results: RubricIndicator[] = [];
  criteriaBlocks.forEach((block, idx) => {
    const trimmed = block.trim();
    if (!trimmed || trimmed.length < 15) return;

    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] || `Tiêu chí ${idx + 1}`;
    const code = `TC${idx + 1}`;

    let m1 = 'Thực hiện được một phần yêu cầu khi có sự hướng dẫn, nhắc nhở của giáo viên.';
    let m2 = 'Tự giác thực hiện đầy đủ, đúng quy trình theo kế hoạch đã đề ra.';
    let m3 = 'Thao tác thuần thục, giải thích rõ nguyên nhân, làm chủ dữ liệu và hỗ trợ nhóm.';

    lines.forEach((line) => {
      if (/^[-*•]?\s*M1[:\.\s-]/i.test(line)) {
        m1 = line.replace(/^[-*•]?\s*M1[:\.\s-]/i, '').trim() || m1;
      } else if (/^[-*•]?\s*M2[:\.\s-]/i.test(line)) {
        m2 = line.replace(/^[-*•]?\s*M2[:\.\s-]/i, '').trim() || m2;
      } else if (/^[-*•]?\s*M3[:\.\s-]/i.test(line)) {
        m3 = line.replace(/^[-*•]?\s*M3[:\.\s-]/i, '').trim() || m3;
      }
    });

    const indicatorCode = `2.${idx + 3}`;
    results.push({
      indicatorCode,
      criterionCode: code,
      componentName: '2. Tìm tòi, khám phá thế giới tự nhiên',
      indicatorTitle: firstLine.replace(/^[-*•]\s*/, ''),
      checklistTitle: firstLine.replace(/^[-*•]\s*/, '').slice(0, 50),
      aiLookFor: `Hành vi học sinh tương ứng với: ${firstLine.slice(0, 60)} (theo dõi thao tác, thảo luận nhóm, ghi chép).`,
      requiredEvidence: 'Đoạn video thao tác rõ mặt hoặc lời thoại ghi nhận tương tác trong nhóm.',
      levels: {
        M1: m1,
        M2: m2,
        M3: m3,
      },
    });
  });

  return results.length > 0 ? results : RUBRIC_INDICATORS;
}

export async function chatRubricBrainstorming(params: {
  apiKey: string;
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  currentRubric: RubricIndicator[];
  lessonContext?: { lessonTitle?: string; gradeSubject?: string; activityTitle?: string };
}): Promise<RubricChatResult> {
  const { apiKey, message, history = [], currentRubric, lessonContext } = params;
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
Bạn là "AI Đồng hành Sư phạm & Cố vấn Rubric KHTN" (Senior Science Assessment Expert) theo Chương trình Giáo dục phổ thông 2018 Việt Nam.
Bối cảnh nhiệm vụ:
- Môn/Lớp: ${lessonContext?.gradeSubject || 'Khoa học tự nhiên'}
- Tên bài học: ${lessonContext?.lessonTitle || 'Bài thực hành KHTN'}
- Tên hoạt động: ${lessonContext?.activityTitle || 'Thí nghiệm thực hành'}

BỘ RUBRIC HIỆN TẠI ĐANG SOẠN THẢO (${currentRubric.length} tiêu chí):
${JSON.stringify(currentRubric, null, 2)}

NHIỆM VỤ:
1. Trò chuyện, tư vấn sư phạm, brainstorming và phản biện chuyên môn với giáo viên:
   - Giúp điều chỉnh tiêu chí cho phù hợp với trang thiết bị thực tế của nhà trường (ví dụ: dùng cổng quang điện, dùng đồng hồ bấm giây, đo thể tích, làm tiêu bản hiển vi, an toàn hóa chất...).
   - Tối ưu mô tả hành vi ("AI cần tìm") để camera và micro ghi hình lớp học có thể nhận diện được hành vi của học sinh.
   - Chuẩn hóa các mức M1 (có hướng dẫn), M2 (tự làm đúng), M3 (thành thạo, giải thích, làm chủ sai số).
2. Khi giáo viên yêu cầu sửa đổi, thêm mới, tách nhỏ, gộp hoặc viết lại rubric:
   - Hãy trả lời phân tích sư phạm rõ ràng trong "reply".
   - Đồng thời trả về "hasRubricUpdate": true và mảng "suggestedRubric" hoàn chỉnh chứa toàn bộ danh sách tiêu chí sau khi đã cập nhật theo yêu cầu của giáo viên!
   - Nếu câu hỏi chỉ mang tính tham khảo/trao đổi lý thuyết và chưa cần thay đổi bảng Rubric, đặt "hasRubricUpdate": false và "suggestedRubric": null.
`;

  const CHAT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      reply: {
        type: Type.STRING,
        description: 'Câu trả lời tư vấn sư phạm bằng tiếng Việt, giải thích lý do sư phạm và cách điều chỉnh.',
      },
      hasRubricUpdate: {
        type: Type.BOOLEAN,
        description: 'True nếu có đề xuất cập nhật/chỉnh sửa danh sách tiêu chí Rubric.',
      },
      suggestedRubric: {
        type: Type.ARRAY,
        description: 'Toàn bộ danh sách tiêu chí Rubric cập nhật sau khi đã áp dụng thay đổi (nếu hasRubricUpdate là true)',
        items: {
          type: Type.OBJECT,
          properties: {
            indicatorCode: { type: Type.STRING },
            criterionCode: { type: Type.STRING },
            componentName: { type: Type.STRING },
            indicatorTitle: { type: Type.STRING },
            checklistTitle: { type: Type.STRING },
            aiLookFor: { type: Type.STRING },
            requiredEvidence: { type: Type.STRING },
            levels: {
              type: Type.OBJECT,
              properties: {
                M1: { type: Type.STRING },
                M2: { type: Type.STRING },
                M3: { type: Type.STRING },
              },
              required: ['M1', 'M2', 'M3'],
            },
            note: { type: Type.STRING },
          },
          required: [
            'indicatorCode',
            'criterionCode',
            'componentName',
            'indicatorTitle',
            'checklistTitle',
            'aiLookFor',
            'requiredEvidence',
            'levels',
          ],
        },
      },
    },
    required: ['reply', 'hasRubricUpdate'],
  };

  const formattedHistory = history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }],
  }));

  const contents = [
    ...formattedHistory,
    {
      role: 'user',
      parts: [{ text: message }],
    },
  ];

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: CHAT_SCHEMA,
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return {
        reply: parsed.reply || 'Đã phân tích yêu cầu của thầy/cô về bộ Rubric.',
        hasRubricUpdate: Boolean(parsed.hasRubricUpdate && parsed.suggestedRubric?.length),
        suggestedRubric: parsed.suggestedRubric || undefined,
      };
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('404') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand')
      ) {
        continue;
      }
      if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
        return generateOfflineRubricChatFallback(message, currentRubric, lessonContext);
      }
      throw err;
    }
  }

  return generateOfflineRubricChatFallback(message, currentRubric, lessonContext);
}

function generateOfflineRubricChatFallback(
  message: string,
  currentRubric: RubricIndicator[],
  _lessonContext?: { lessonTitle?: string; gradeSubject?: string; activityTitle?: string }
): RubricChatResult {
  const lower = (message || '').toLowerCase();

  // Case 1: An toàn & vệ sinh
  if (lower.includes('an toàn') || lower.includes('vệ sinh') || lower.includes('dọn dẹp')) {
    const nextIdx = currentRubric.length + 1;
    const criterionCode = `TC${nextIdx}`;
    const indicatorCode = `2.${nextIdx}`;
    const newIndicator: RubricIndicator = {
      criterionCode,
      indicatorCode,
      checklistTitle: 'Tuân thủ an toàn thí nghiệm & Vệ sinh khu vực thực hành',
      componentName: 'Kỹ năng an toàn khoa học & Vệ sinh phòng bộ môn',
      indicatorTitle: 'Thực hiện đúng quy tắc an toàn khi thao tác dụng cụ, không gây nguy hiểm và thu dọn sạch sẽ sau thực hành.',
      aiLookFor: 'Học sinh mang kính/găng tay bảo hộ (nếu có), thao tác cẩn thận không làm rơi vỡ dụng cụ đo, chủ động thu dọn vật liệu và lau sạch bàn thí nghiệm sau khi đo xong.',
      requiredEvidence: 'Hành vi thu gom dụng cụ, lau bàn thí nghiệm, bỏ rác/vật liệu thử đúng nơi quy định hoặc nhắc nhở bạn cùng nhóm giữ an toàn.',
      levels: {
        M1: 'Cần giáo viên hoặc nhóm trưởng nhắc nhở mới thực hiện thu dọn dụng cụ hoặc giữ an toàn.',
        M2: 'Chủ động thao tác an toàn, tự giác thu dọn dụng cụ và lau sạch bàn thí nghiệm sau khi đo xong.',
        M3: 'Thực hiện an toàn tuyệt đối, chủ động kiểm soát rủi ro, nhắc nhở và hỗ trợ bạn cùng nhóm tuân thủ vệ sinh và an toàn.',
      },
      note: 'AI camera theo dõi hành vi an toàn trong suốt quá trình và đặc biệt tập trung ở 5-10 phút cuối tiết thực hành.',
    };

    const exists = currentRubric.some(
      (c) => c.checklistTitle.toLowerCase().includes('an toàn') || c.indicatorTitle.toLowerCase().includes('an toàn')
    );
    const updated = exists ? currentRubric : [...currentRubric, newIndicator];

    return {
      reply: 'Chào thầy/cô! Tôi đã xây dựng và bổ sung Tiêu chí "Tuân thủ an toàn thí nghiệm & Vệ sinh khu vực thực hành" theo đúng chuẩn phân hóa M1–M3 của GDPT 2018. Tiêu chí này được thiết kế với các chỉ dấu hành vi cụ thể (thu dọn đồ dùng, lau bàn, thao tác cẩn trọng) để camera lớp học có thể nhận diện rõ ràng. Thầy/cô vui lòng xem bản thảo và bấm nút "Áp dụng đề xuất" bên dưới để đưa vào bảng biên tập.',
      hasRubricUpdate: true,
      suggestedRubric: updated,
    };
  }

  // Case 2: Cổng quang điện hoặc đồng hồ bấm giây
  if (lower.includes('cổng quang') || lower.includes('quang điện') || lower.includes('đồng hồ')) {
    const updated = currentRubric.map((c) => {
      if (c.criterionCode === 'TC2' || c.checklistTitle.toLowerCase().includes('dụng cụ') || c.checklistTitle.toLowerCase().includes('đo')) {
        return {
          ...c,
          checklistTitle: 'Lắp ráp và kết nối cổng quang điện với đồng hồ đo thời gian hiện số',
          indicatorTitle: 'Bố trí hai cổng quang điện trên máng nghiêng, kết nối chính xác dây tín hiệu vào đồng hồ hiện số ở chế độ đo thích hợp.',
          aiLookFor: 'Học sinh căn chỉnh khoảng cách giữa 2 cổng quang, cắm giắc tín hiệu chắc chắn, bật nguồn đồng hồ đo thời gian và chọn đúng thang đo.',
          levels: {
            M1: 'Cần bạn hoặc giáo viên hướng dẫn cách nối giắc và chọn chế độ đo trên đồng hồ.',
            M2: 'Tự lắp đặt đúng 2 cổng quang và chọn chế độ đo thời gian phù hợp.',
            M3: 'Lắp đặt chuẩn xác, kiểm tra độ nhạy của cảm biến quang trước khi thả xe và khắc phục được lỗi báo sai tín hiệu.',
          },
        };
      }
      return c;
    });

    return {
      reply: 'Tôi đã cập nhật Tiêu chí thực hành với Cổng quang điện và Đồng hồ hiện số: chuẩn hóa thao tác lắp đặt cảm biến, cắm giắc tín hiệu và phân hóa rõ rệt M1–M3. Thầy/cô có thể bấm "Áp dụng đề xuất" để cập nhật ngay vào bảng kiểm.',
      hasRubricUpdate: true,
      suggestedRubric: updated,
    };
  }

  // Case 3: Phân hóa M2 và M3 hoặc xử lý sai số
  if (lower.includes('m2') || lower.includes('m3') || lower.includes('sai số')) {
    const updated = currentRubric.map((c) => {
      if (c.criterionCode === 'TC5' || c.checklistTitle.toLowerCase().includes('sai số') || c.checklistTitle.toLowerCase().includes('kết quả')) {
        return {
          ...c,
          levels: {
            M1: 'Biết tính giá trị trung bình từ các lần đo khi có giáo viên hướng dẫn.',
            M2: 'Tự tính đúng vận tốc trung bình và sai số tuyệt đối của phép đo qua ít nhất 3 lần thả xe.',
            M3: 'Làm chủ phép đo, phân tích được nguyên nhân sai số dụng cụ và sai số thao tác, đề xuất giải pháp giảm thiểu sai số.',
          },
        };
      }
      return c;
    });

    return {
      reply: 'Tôi đã phân định ranh giới định lượng rất rõ giữa M2 và M3: M2 yêu cầu tự tính đúng giá trị trung bình và sai số; M3 đòi hỏi phân tích được nguồn gốc sai số (thao tác, dụng cụ, ma sát) và đề xuất cải tiến. Thầy/cô bấm "Áp dụng đề xuất" để sử dụng.',
      hasRubricUpdate: true,
      suggestedRubric: updated,
    };
  }

  // Default pedagogical guidance fallback
  return {
    reply: `Cố vấn AI ghi nhận yêu cầu: "${message}". Để đảm bảo tính sư phạm thực chứng theo GDPT 2018, tiêu chí nên phân rã rõ thành 3 mức M1 (cần hỗ trợ), M2 (chủ động làm đúng), M3 (thành thạo, giải thích nguyên lý). Thầy/cô có thể kiểm tra cấu hình API Key trong mục "Thiết lập", hoặc thực hiện tinh chỉnh trực tiếp ngay tại tab "Biên tập Rubric".`,
    hasRubricUpdate: false,
  };
}
