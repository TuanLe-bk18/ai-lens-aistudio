import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_VIDEO_SOURCES, INITIAL_DEMO_SESSION } from './src/data/rubricData';
import { analyzeClassroomMediaWithGemini } from './src/services/geminiVideoService';
import {
  extractRubricFromDocument,
  chatRubricBrainstorming,
} from './src/services/geminiRubricService';
import { StudentSeatProfile, VideoProcessingMode } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnv() {
  const envCandidates = ['.env.local', '.env'];
  for (const envFile of envCandidates) {
    const fullPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        content.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const k = trimmed.slice(0, eqIdx).trim();
              const v = trimmed.slice(eqIdx + 1).trim();
              if (k && (!process.env[k] || process.env[k] === 'MY_GEMINI_API_KEY')) {
                process.env[k] = v;
              }
            }
          }
        });
      } catch {
        // ignore
      }
    }
  }
}
loadLocalEnv();

export function getActiveGeminiApiKey(req?: Request): string {
  const headerKey = (req?.headers?.['x-gemini-api-key'] as string)?.trim();
  if (headerKey && headerKey !== 'MY_GEMINI_API_KEY') {
    return headerKey;
  }
  loadLocalEnv();
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
    return envKey;
  }
  return '';
}

export async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Serve real classroom videos with HTTP Range support for instant timestamp seeking
  const videosDir = path.join(__dirname, 'videos');
  if (fs.existsSync(videosDir)) {
    app.use('/videos', express.static(videosDir, { acceptRanges: true }));
  }

  app.get('/api/health', (req, res) => {
    const activeKey = getActiveGeminiApiKey(req);
    res.json({
      status: 'ok',
      hasServerApiKey: Boolean(activeKey),
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      agenticModels: ['gemini-3.5-flash-lite'],
      fallbackModel: 'gemini-3.5-flash-lite',
      supportedProcessingModes: ['AGENTIC', 'STATIC'],
      endpoints: ['/api/analyze', '/api/analyze-video'],
    });
  });

  const handleAnalyzeRequest = async (req: Request, res: Response) => {
    try {
      const headerKey = (req.headers['x-gemini-api-key'] as string)?.trim();
      const apiKey = getActiveGeminiApiKey(req);

      const {
        sourceId,
        customBase64,
        customMimeType,
        customDurationSeconds,
        processingMode,
        students,
        rubricIndicators,
      }: {
        sourceId: string;
        customBase64?: string;
        customMimeType?: string;
        customDurationSeconds?: number;
        processingMode?: VideoProcessingMode;
        students: StudentSeatProfile[];
        rubricIndicators?: any[];
      } = req.body || {};

      if (!sourceId) {
        res.status(400).json({ error: 'Thiếu mã nguồn dữ liệu (sourceId).' });
        return;
      }

      let base64Data = customBase64;
      let mimeType = customMimeType || 'video/mp4';
      let durationSeconds =
        typeof customDurationSeconds === 'number' && customDurationSeconds > 0
          ? customDurationSeconds
          : 45;

      if (!base64Data) {
        const knownSource = DEFAULT_VIDEO_SOURCES.find((s) => s.id === sourceId);
        if (!knownSource) {
          res.status(404).json({
            error: `Không tìm thấy nguồn video đóng gói sẵn (${sourceId}). Với video/ảnh tự tải lên, trình duyệt cần gửi kèm dữ liệu tệp (customBase64).`,
          });
          return;
        }
        const filePath = path.join(__dirname, 'videos', 'demo', knownSource.filename);
        if (!fs.existsSync(filePath)) {
          console.log(`[AI-LENS] Video file ${knownSource.filename} not found on disk, serving verified reference evidence for ${sourceId}`);
          const fallbackEvidences = INITIAL_DEMO_SESSION.evidences.filter((e) => e.sourceId === sourceId);
          res.json({
            model: `${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'} (Bản đối chiếu kiểm chuẩn)`,
            processingModeUsed: knownSource.processingModeUsed || 'AGENTIC',
            usedFilesApi: false,
            sourceId,
            transcriptSegments: knownSource.transcriptSegments || [],
            agenticSteps: knownSource.agenticSteps || [],
            evidences: fallbackEvidences,
          });
          return;
        }
        const buffer = fs.readFileSync(filePath);
        base64Data = buffer.toString('base64');
        mimeType = knownSource.mimeType || 'video/mp4';
        durationSeconds = knownSource.durationSeconds;
      }

      if (!apiKey) {
        res.status(400).json({
          error:
            'Chưa cấu hình GEMINI_API_KEY trên server. Bạn có thể nhập API Key ở phần cấu hình nhanh hoặc sử dụng Chế độ Phiên Thực Nghiệm Mẫu.',
        });
        return;
      }

      let result;
      try {
        result = await analyzeClassroomMediaWithGemini({
          apiKey,
          sourceId,
          base64Data,
          mimeType,
          durationSeconds,
          students: students || [],
          processingMode: processingMode || 'AGENTIC',
          rubricIndicators,
        });
      } catch (firstErr: any) {
        // If client provided a custom key that was invalid, but server has a valid GEMINI_API_KEY, retry with server key
        const firstErrMsg = String(firstErr?.message || '');
        const serverKey = getActiveGeminiApiKey();
        if (
          headerKey &&
          serverKey &&
          serverKey !== headerKey &&
          (firstErrMsg.includes('API_KEY_INVALID') || firstErrMsg.includes('API key not valid'))
        ) {
          try {
            console.log('[AI-LENS] Custom API key invalid, retrying with server GEMINI_API_KEY...');
            result = await analyzeClassroomMediaWithGemini({
              apiKey: serverKey,
              sourceId,
              base64Data,
              mimeType,
              durationSeconds,
              students: students || [],
              processingMode: processingMode || 'AGENTIC',
              rubricIndicators,
            });
          } catch (retryErr: any) {
            firstErr = retryErr;
          }
        }

        if (!result) {
          // If it's a packaged demo video (VID01 - VID06) and Gemini call fails (due to quota, key, or temporary downtime),
          // gracefully fall back to the pre-packaged verified rubric evidence
          const knownSource = DEFAULT_VIDEO_SOURCES.find((s) => s.id === sourceId);
          if (knownSource) {
            console.log(`[AI-LENS] Serving verified reference evidence for ${sourceId}`);
            const fallbackEvidences = INITIAL_DEMO_SESSION.evidences.filter((e) => e.sourceId === sourceId);
            res.json({
              model: `${process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'} (Bản đối chiếu kiểm chuẩn)`,
              processingModeUsed: knownSource.processingModeUsed || 'AGENTIC',
              usedFilesApi: false,
              sourceId,
              transcriptSegments: knownSource.transcriptSegments || [],
              agenticSteps: knownSource.agenticSteps || [],
              evidences: fallbackEvidences,
            });
            return;
          }

          // For custom uploaded files, parse and translate error nicely
          const rawMsg = String(firstErr?.message || '');
          let cleanError = 'Lỗi khi gọi Gemini Agentic Video API phân tích nguồn dữ liệu.';
          if (rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('API key not valid')) {
            cleanError = 'Khóa API Gemini không hợp lệ (API key not valid). Vui lòng kiểm tra lại cấu hình GEMINI_API_KEY.';
          } else if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('high demand')) {
            cleanError = 'Hệ thống Gemini hiện đang có lượng truy cập cao. Vui lòng thử lại sau giây lát.';
          } else if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
            cleanError = 'Đã đạt giới hạn yêu cầu Gemini API (Quota Limit). Vui lòng thử lại sau ít phút.';
          } else if (rawMsg) {
            try {
              const jsonStart = rawMsg.indexOf('{');
              if (jsonStart !== -1) {
                const parsed = JSON.parse(rawMsg.slice(jsonStart));
                if (parsed?.error?.message) {
                  cleanError = parsed.error.message;
                }
              } else {
                cleanError = rawMsg;
              }
            } catch {
              cleanError = rawMsg;
            }
          }
          res.status(500).json({ error: cleanError });
          return;
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Lỗi khi xử lý yêu cầu phân tích nguồn dữ liệu.',
      });
    }
  };

  app.post('/api/analyze', handleAnalyzeRequest);
  app.post('/api/analyze-video', handleAnalyzeRequest);

  app.post('/api/rubric/extract', async (req: Request, res: Response) => {
    try {
      const apiKey = getActiveGeminiApiKey(req);
      if (!apiKey) {
        res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ hoặc qua mục Thiết lập.' });
        return;
      }
      const { fileName, fileType, fileBase64, text, currentContext } = req.body || {};
      if (!fileName && !text) {
        res.status(400).json({ error: 'Thiếu thông tin tệp hoặc văn bản tài liệu.' });
        return;
      }
      const result = await extractRubricFromDocument({
        apiKey,
        fileName: fileName || 'tailieu_rubric.txt',
        fileType: fileType || 'text/plain',
        fileBase64,
        text,
        currentContext,
      });
      res.json(result);
    } catch (err: any) {
      let cleanError = err?.message || 'Lỗi khi trích xuất Rubric bằng Gemini AI.';
      if (cleanError.includes('API key not valid') || cleanError.includes('API_KEY_INVALID')) {
        cleanError = 'Khóa Gemini API không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra cấu hình API Key.';
      }
      res.status(500).json({ error: cleanError });
    }
  });

  app.post('/api/rubric/chat', async (req: Request, res: Response) => {
    try {
      const apiKey = getActiveGeminiApiKey(req);
      if (!apiKey) {
        res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ hoặc qua mục Thiết lập.' });
        return;
      }
      const { message, history, currentRubric, lessonContext } = req.body || {};
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Thiếu nội dung câu hỏi/yêu cầu.' });
        return;
      }
      const result = await chatRubricBrainstorming({
        apiKey,
        message,
        history,
        currentRubric: currentRubric || [],
        lessonContext,
      });
      res.json(result);
    } catch (err: any) {
      let cleanError = err?.message || 'Lỗi khi trao đổi với AI Cố vấn.';
      if (cleanError.includes('API key not valid') || cleanError.includes('API_KEY_INVALID')) {
        cleanError = 'Khóa Gemini API không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra cấu hình API Key.';
      }
      res.status(500).json({ error: cleanError });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI-LENS Server running at http://localhost:${PORT}`);
  });
}

startServer();
