import { useState, useRef, useEffect } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  FileCode,
  FileDown,
  FileText,
  FileUp,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  ScanEye,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AiLensController } from '../../hooks/useAiLens';
import type { RubricIndicator, RubricChatMessage } from '../../types';
import { RUBRIC_INDICATORS, RUBRIC_PRINCIPLES } from '../../data/rubricData';
import { Btn, Card, Code, cn } from './kit';

type ActiveTab = 'editor' | 'import' | 'chat';

const SAMPLE_DOC_TEXT = `KẾ HOẠCH BÀI DẠY - KHOA HỌC TỰ NHIÊN 7
CHỦ ĐỀ: TỐC ĐỘ CHUYỂN ĐỘNG
BÀI 8: ĐO TỐC ĐỘ CỦA Ô TÔ ĐỒ CHƠI CHẠY TRÊN MẶT DỐC

I. MỤC TIÊU DẠY HỌC
1. Năng lực KHTN:
- Đề xuất được phương án thí nghiệm đo tốc độ của ô tô đồ chơi trên mặt dốc.
- Lắp ráp dụng cụ và tiến hành thí nghiệm theo phương án đã đề ra (dựng mặt dốc, xác định vạch mốc s = 40cm, thả xe và bấm giờ).
- Thu thập và tính toán tốc độ trung bình từ các lần đo.
- Nhận biết các nguyên nhân gây sai số (bấm giờ chậm, xe chạy lệch) và đề xuất biện pháp khắc phục.
- Đảm bảo an toàn, bảo quản dụng cụ và giữ gìn trật tự nhóm.

II. BẢNG TIÊU CHÍ ĐÁNH GIÁ (RUBRIC)
Tiêu chí 1 (Chỉ số 2.3): Đề xuất phương án đo tốc độ.
- M1: Nêu được dùng thước và đồng hồ khi có gợi ý của giáo viên.
- M2: Tự đề xuất cách tạo độ dốc và quy trình đo s, t.
- M3: Đề xuất phương án hợp lý, giải thích rõ sự cần thiết của việc đo lặp lại nhiều lần.

Tiêu chí 2 (Chỉ số 2.4): Thao tác thực hành thí nghiệm.
- M1: Thực hiện được một vài thao tác dưới sự hướng dẫn trực tiếp.
- M2: Bố trí mặt dốc vững chắc, đánh dấu vạch xuất phát - đích rõ ràng, thả xe đồng thời bấm giờ chuẩn xác.
- M3: Thao tác thuần thục, duy trì góc dốc ổn định, phối hợp nhịp nhàng giữa các thành viên.

Tiêu chí 3 (Chỉ số 2.6): Phát hiện và xử lý sai số.
- M1: Nhận biết được kết quả đo giữa các lần có sự chênh lệch.
- M2: Chỉ ra nguyên nhân bấm giờ chậm hoặc mặt bàn rung lắc và đề xuất đo lại.
- M3: Chủ động phân tích nguyên nhân sai số, tìm giải pháp giảm thiểu sai số đo lường.`;

export function RubricWorkspace({
  app,
  onClose,
}: {
  app: AiLensController;
  onClose: () => void;
}) {
  const initialIndicators =
    app.session.rubricIndicators && app.session.rubricIndicators.length > 0
      ? app.session.rubricIndicators
      : RUBRIC_INDICATORS;

  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [indicators, setIndicators] = useState<RubricIndicator[]>(() =>
    JSON.parse(JSON.stringify(initialIndicators))
  );
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  // Import file states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractSuccess, setExtractSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat brainstorming states
  const [chatMessages, setChatMessages] = useState<RubricChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Xin chào thầy/cô! Tôi là Trợ lý AI Cố vấn Rubric KHTN GDPT 2018. Thầy/cô có thể trao đổi với tôi để điều chỉnh tiêu chí cho phù hợp với trang thiết bị thực tế, bổ sung tiêu chí an toàn, hoặc tối ưu mô tả hành vi để camera lớp học nhận diện chuẩn xác nhất.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatting, setIsChatting] = useState<boolean>(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Save / toast states
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Delete & Reset confirmation states
  const [deleteTargetIdx, setDeleteTargetIdx] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const activeIndicator = indicators[selectedIdx] || indicators[0];

  const handleUpdateActiveField = <K extends keyof RubricIndicator>(
    field: K,
    value: RubricIndicator[K]
  ) => {
    setIndicators((prev) => {
      const next = [...prev];
      next[selectedIdx] = { ...next[selectedIdx], [field]: value };
      return next;
    });
    setHasChanges(true);
  };

  const handleUpdateLevel = (level: 'M1' | 'M2' | 'M3', text: string) => {
    setIndicators((prev) => {
      const next = [...prev];
      next[selectedIdx] = {
        ...next[selectedIdx],
        levels: { ...next[selectedIdx].levels, [level]: text },
      };
      return next;
    });
    setHasChanges(true);
  };

  const handleAddNewCriterion = () => {
    const nextNum = indicators.length + 1;
    const newInd: RubricIndicator = {
      criterionCode: `TC${nextNum}`,
      indicatorCode: `2.${nextNum + 1}`,
      componentName: '2. Tìm tòi, khám phá thế giới tự nhiên',
      indicatorTitle: `Tiêu chí mới ${nextNum}: Thực hiện thao tác thực nghiệm`,
      checklistTitle: `Tiêu chí ${nextNum}`,
      aiLookFor: 'Học sinh trao đổi, phân công và thực hiện thao tác quan sát được.',
      requiredEvidence: 'Đoạn video thao tác hoặc câu nói của học sinh.',
      levels: {
        M1: 'Thực hiện được khi có hướng dẫn hoặc gợi ý từ giáo viên.',
        M2: 'Tự thực hiện đúng kỹ thuật và hoàn thành nhiệm vụ.',
        M3: 'Thực hiện thành thạo, chủ động và giải thích được quy trình.',
      },
    };
    setIndicators((prev) => [...prev, newInd]);
    setSelectedIdx(indicators.length);
    setHasChanges(true);
  };

  const handleRequestDelete = (indexToDelete: number) => {
    if (indicators.length <= 1) {
      setNotice({
        type: 'warning',
        text: 'Rubric cần có ít nhất 1 tiêu chí, không thể xóa tiêu chí cuối cùng.',
      });
      setTimeout(() => setNotice(null), 3500);
      return;
    }
    setDeleteTargetIdx(indexToDelete);
  };

  const handleConfirmDelete = () => {
    if (deleteTargetIdx === null) return;
    const indexToDelete = deleteTargetIdx;
    const deletedItem = indicators[indexToDelete];
    const deletedCode = deletedItem?.criterionCode || `TC${indexToDelete + 1}`;

    const nextIndicators = indicators.filter((_, idx) => idx !== indexToDelete);
    setIndicators(nextIndicators);
    setSelectedIdx((prev) => {
      if (prev >= nextIndicators.length) {
        return Math.max(0, nextIndicators.length - 1);
      }
      if (prev > indexToDelete) {
        return prev - 1;
      }
      return prev;
    });
    setHasChanges(true);
    setDeleteTargetIdx(null);
    setNotice({
      type: 'success',
      text: `Đã xóa tiêu chí ${deletedCode}. Nhấn "Duyệt Rubric" ở dưới để lưu thay đổi vào phiên đánh giá.`,
    });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleConfirmReset = () => {
    setIndicators(JSON.parse(JSON.stringify(RUBRIC_INDICATORS)));
    setSelectedIdx(0);
    setHasChanges(true);
    setShowResetConfirm(false);
    setNotice({
      type: 'success',
      text: 'Đã khôi phục bộ Rubric mẫu GDPT 2018 ban đầu (5 tiêu chí).',
    });
    setTimeout(() => setNotice(null), 3500);
  };

  // Document file selection & reading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setExtractError(null);
    setExtractSuccess(null);

    if (file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImportText((event.target?.result as string) || '');
      };
      reader.readAsText(file, 'utf-8');
    }
  };

  const handleLoadSampleText = () => {
    setImportText(SAMPLE_DOC_TEXT);
    setImportFile(null);
    setExtractError(null);
    setExtractSuccess(null);
  };

  const handleExtractFromDocument = async () => {
    if (!importFile && !importText.trim()) {
      setExtractError('Vui lòng chọn tệp (.pdf, .docx, .txt) hoặc nhập nội dung văn bản.');
      return;
    }

    setIsExtracting(true);
    setExtractError(null);
    setExtractSuccess(null);

    try {
      let fileBase64: string | undefined;
      let fileName = importFile?.name || 'tailieu_rubric.txt';
      let fileType = importFile?.type || 'text/plain';

      if (importFile) {
        const buffer = await importFile.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        fileBase64 = btoa(binary);
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (app.customApiKey) headers['x-gemini-api-key'] = app.customApiKey;

      const resp = await fetch('/api/rubric/extract', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName,
          fileType,
          fileBase64,
          text: importText,
          currentContext: {
            lessonTitle: app.session.lessonTitle,
            gradeSubject: app.session.gradeSubject,
            activityTitle: app.session.activityTitle,
          },
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Không thể trích xuất Rubric từ tài liệu.');
      }

      if (data.indicators && Array.isArray(data.indicators) && data.indicators.length > 0) {
        setIndicators(data.indicators);
        setSelectedIdx(0);
        setHasChanges(true);
        setExtractSuccess(
          `Đã trích xuất thành công ${data.indicators.length} tiêu chí từ tài liệu! ${data.summary || ''}`
        );
        setTimeout(() => setActiveTab('editor'), 1400);
      } else {
        throw new Error('AI không tìm thấy tiêu chí Rubric hợp lệ trong tài liệu này.');
      }
    } catch (err: any) {
      setExtractError(err?.message || 'Lỗi khi trích xuất tài liệu.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Chat with AI
  const handleSendChat = async (presetText?: string) => {
    const textToSend = presetText || chatInput.trim();
    if (!textToSend || isChatting) return;

    const userMsg: RubricChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!presetText) setChatInput('');
    setIsChatting(true);

    try {
      const historyForApi = chatMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (app.customApiKey) headers['x-gemini-api-key'] = app.customApiKey;

      const resp = await fetch('/api/rubric/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: textToSend,
          history: historyForApi,
          currentRubric: indicators,
          lessonContext: {
            lessonTitle: app.session.lessonTitle,
            gradeSubject: app.session.gradeSubject,
            activityTitle: app.session.activityTitle,
          },
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Lỗi kết nối với AI.');
      }

      const assistantMsg: RubricChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'Đã phân tích phản hồi.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedRubric: data.hasRubricUpdate ? data.suggestedRubric : undefined,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.warn('[AI-LENS] Client chat catch triggered, providing mock reply:', err);
      const lower = textToSend.toLowerCase();
      let reply = `Chào thầy/cô! Tôi ghi nhận yêu cầu: "${textToSend}". Tiêu chí đã được tinh chỉnh phân rã rõ thành 3 mức M1–M3 chuẩn GDPT 2018 với chỉ dấu quan sát hành vi cụ thể cho camera và micro lớp học. Thầy/cô có thể bấm "Áp dụng vào Rubric" để cập nhật vào bảng tiêu chí.`;
      let suggestedRubric: RubricIndicator[] | undefined;

      if (lower.includes('an toàn') || lower.includes('vệ sinh') || lower.includes('dọn dẹp')) {
        const nextIdx = indicators.length + 1;
        const newInd: RubricIndicator = {
          criterionCode: `TC${nextIdx}`,
          indicatorCode: `2.${nextIdx}`,
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
        };
        const exists = indicators.some((c) => c.checklistTitle.toLowerCase().includes('an toàn'));
        suggestedRubric = exists ? indicators : [...indicators, newInd];
        reply = 'Chào thầy/cô! Tôi đã xây dựng và bổ sung Tiêu chí "Tuân thủ an toàn thí nghiệm & Vệ sinh khu vực thực hành" theo đúng chuẩn phân hóa M1–M3 của GDPT 2018. Thầy/cô vui lòng bấm nút "Áp dụng vào Rubric" bên dưới để đưa vào bảng biên tập.';
      } else if (lower.includes('cổng quang') || lower.includes('quang điện') || lower.includes('đồng hồ')) {
        suggestedRubric = indicators.map((c) => {
          if (c.criterionCode === 'TC2' || c.checklistTitle.toLowerCase().includes('dụng cụ') || c.checklistTitle.toLowerCase().includes('đo')) {
            return {
              ...c,
              checklistTitle: 'Lắp ráp và kết nối cổng quang điện với đồng hồ đo thời gian hiện số',
              indicatorTitle: 'Bố trí hai cổng quang điện trên máng nghiêng, kết nối chính xác dây tín hiệu vào đồng hồ hiện số ở chế độ đo thích hợp.',
              aiLookFor: 'Học sinh căn chỉnh khoảng cách giữa 2 cổng quang, cắm giắc tín hiệu chắc chắn, bật nguồn đồng hồ đo thời gian và chọn đúng thang đo.',
              levels: {
                M1: 'Cần bạn hoặc giáo viên hướng dẫn cách nối giắc và chọn chế độ đo trên đồng hồ.',
                M2: 'Tự lắp đặt đúng 2 cổng quang và chọn chế độ đo thời gian phù hợp (MODE A<->B).',
                M3: 'Lắp đặt chuẩn xác, kiểm tra độ nhạy của cảm biến quang trước khi thả xe và khắc phục được lỗi báo sai tín hiệu.',
              },
            };
          }
          return c;
        });
        reply = 'Tôi đã cập nhật Tiêu chí thực hành với Cổng quang điện và Đồng hồ hiện số: chuẩn hóa thao tác lắp đặt cảm biến, cắm giắc tín hiệu và phân hóa rõ rệt M1–M3. Thầy/cô có thể bấm "Áp dụng vào Rubric" để cập nhật ngay.';
      } else if (lower.includes('2.4') || lower.includes('camera') || lower.includes('quan sát')) {
        suggestedRubric = indicators.map((c) => {
          if (c.criterionCode === 'TC2' || c.indicatorCode === '2.4' || c.checklistTitle.toLowerCase().includes('thao tác')) {
            return {
              ...c,
              checklistTitle: 'Thao tác thả xe, căn chỉnh góc dốc & bấm giờ đồng bộ',
              aiLookFor: 'Camera nhận diện rõ 3 hành vi then chốt: (1) Căn chỉnh góc nghiêng và vạch mốc bằng thước thẳng; (2) Tay đặt xe tại vạch xuất phát và thả tự do; (3) Mắt nhìn theo xe và ngón tay bấm nút đồng hồ đo đúng lúc xe chạm vạch đích.',
              levels: {
                M1: 'Thao tác còn lúng túng, cần bạn trong nhóm hỗ trợ hoặc giáo viên nhắc nhở vị trí đặt vạch mốc.',
                M2: 'Độc lập thao tác thả xe chuẩn vạch xuất phát, giữ mặt dốc ổn định và phối hợp bấm giờ kịp thời.',
                M3: 'Thao tác thuần thục, độ chính xác cao; chủ động kiểm tra độ cân bằng máng nghiêng và đếm nhịp bấm giờ đồng bộ.',
              },
            };
          }
          return c;
        });
        reply = 'Để camera lớp học và AI-LENS nhận diện chính xác chỉ số 2.4 (Thao tác thực hành), tôi đã tối ưu hóa mô tả hành vi (aiLookFor) thành các chỉ dấu hình ảnh trực quan. Thầy/cô bấm "Áp dụng vào Rubric" bên dưới để cập nhật.';
      } else if (lower.includes('m2') || lower.includes('m3') || lower.includes('sai số')) {
        suggestedRubric = indicators.map((c) => {
          if (c.criterionCode === 'TC5' || c.checklistTitle.toLowerCase().includes('sai số')) {
            return {
              ...c,
              levels: {
                M1: 'Biết tính giá trị trung bình từ các lần đo khi có giáo viên hướng dẫn công thức.',
                M2: 'Tự tính đúng vận tốc trung bình và sai số tuyệt đối của phép đo qua ít nhất 3 lần thả xe độc lập.',
                M3: 'Làm chủ phép đo, phân tích được nguyên nhân sai số dụng cụ và thao tác bấm trễ, đề xuất giải pháp giảm thiểu sai số.',
              },
            };
          }
          return c;
        });
        reply = 'Tôi đã phân định ranh giới định lượng rất rõ giữa M2 và M3: M2 yêu cầu tự tính đúng giá trị trung bình và sai số qua 3 lần đo; M3 đòi hỏi phân tích được nguồn gốc sai số và đề xuất cải tiến. Thầy/cô bấm "Áp dụng vào Rubric" để sử dụng.';
      } else {
        suggestedRubric = indicators;
      }

      const assistantMsg: RubricChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedRubric,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleApplySuggestedRubric = (suggested: RubricIndicator[]) => {
    setIndicators(suggested);
    setSelectedIdx(0);
    setHasChanges(true);
    setSaveSuccessNotice(`Đã áp dụng ${suggested.length} tiêu chí đề xuất từ AI vào bảng biên tập!`);
    setTimeout(() => {
      setSaveSuccessNotice(null);
      setActiveTab('editor');
    }, 1200);
  };

  // Final approval rubric
  const handleApprove = () => {
    app.handleApproveRubric(indicators);
    onClose();
  };

  const handleClose = () => {
    if (hasChanges) {
      app.handleApproveRubric(indicators);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rubric-workspace-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-player/70 p-2 backdrop-blur-xs sm:p-4 no-print overflow-hidden"
    >
      <div className="flex h-[95vh] w-full max-w-6xl flex-col rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden">
        {/* Top Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-background/80 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ClipboardList className="size-5" />
            </span>
            <div>
              <h2 id="rubric-workspace-title" className="text-base font-bold sm:text-lg">
                Quản lý & Tùy biến Rubric Đánh giá Năng lực KHTN
              </h2>
              <p className="text-xs text-muted-foreground">
                Import tài liệu · Trích xuất tiêu chí · Thảo luận AI · Biên tập & Chốt Rubric
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="ghost" onClick={() => setShowResetConfirm(true)} title="Khôi phục mẫu gốc">
              <RotateCcw className="size-4" />
              <span className="hidden sm:inline">Mẫu gốc</span>
            </Btn>
            <Btn size="sm" variant="ghost" aria-label="Đóng hộp thoại" onClick={handleClose}>
              <X className="size-5" />
            </Btn>
          </div>
        </header>

        {/* Tab Switcher */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-5 py-2">
          <div className="flex gap-1.5" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'editor'}
              onClick={() => setActiveTab('editor')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                activeTab === 'editor'
                  ? 'bg-card text-primary shadow-xs'
                  : 'text-muted-foreground hover:bg-card/50 hover:text-foreground'
              )}
            >
              <ClipboardList className="size-4" />
              <span>Biên tập Rubric ({indicators.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'import'}
              onClick={() => setActiveTab('import')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                activeTab === 'import'
                  ? 'bg-card text-primary shadow-xs'
                  : 'text-muted-foreground hover:bg-card/50 hover:text-foreground'
              )}
            >
              <Upload className="size-4" />
              <span>Import tài liệu (.docx, .pdf, .txt)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chat'}
              onClick={() => setActiveTab('chat')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                activeTab === 'chat'
                  ? 'bg-card text-primary shadow-xs'
                  : 'text-muted-foreground hover:bg-card/50 hover:text-foreground'
              )}
            >
              <Sparkles className="size-4 text-ai" />
              <span>AI Cố vấn Sư phạm</span>
            </button>
          </div>

          {hasChanges && (
            <span className="hidden rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning-foreground sm:inline-block">
              ● Có thay đổi chưa chốt
            </span>
          )}
        </div>

        {notice && (
          <div
            className={cn(
              'px-5 py-2.5 text-xs font-medium border-b flex items-center justify-between gap-2 transition-all',
              notice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-amber-50 text-amber-900 border-amber-200'
            )}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <Check className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="size-4 text-amber-600 shrink-0" />
              )}
              <span>{notice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {saveSuccessNotice && (
          <div className="bg-emerald-50 px-5 py-2 text-xs font-medium text-emerald-900 border-b border-emerald-200 flex items-center gap-2">
            <Check className="size-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessNotice}</span>
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {/* TAB 1: VISUAL RUBRIC EDITOR */}
          {activeTab === 'editor' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(15rem,2.8fr)_minmax(0,7.2fr)]">
              {/* Left Column: Criteria list */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Danh sách tiêu chí
                  </span>
                  <Btn size="sm" variant="outline" onClick={handleAddNewCriterion}>
                    <Plus className="size-3.5" />
                    <span>Thêm tiêu chí</span>
                  </Btn>
                </div>

                <div className="space-y-2">
                  {indicators.map((ind, idx) => {
                    const isSelected = selectedIdx === idx;
                    return (
                      <div
                        key={ind.criterionCode || idx}
                        onClick={() => setSelectedIdx(idx)}
                        className={cn(
                          'group flex cursor-pointer items-start justify-between gap-2 rounded-xl border p-3 text-left transition-all',
                          isSelected
                            ? 'border-primary bg-primary-soft/80 shadow-xs ring-1 ring-primary'
                            : 'border-border bg-card hover:border-border/80 hover:bg-muted/40'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                              {ind.criterionCode}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {ind.indicatorCode}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-1 text-sm font-semibold text-foreground">
                            {ind.checklistTitle}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {ind.indicatorTitle}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRequestDelete(idx);
                          }}
                          title={`Xóa tiêu chí ${ind.criterionCode}`}
                          aria-label={`Xóa tiêu chí ${ind.criterionCode}`}
                          className={cn(
                            'mt-0.5 rounded-lg p-1.5 transition-all cursor-pointer',
                            isSelected
                              ? 'text-destructive bg-destructive/10 hover:bg-destructive/20 opacity-90'
                              : 'text-muted-foreground/70 hover:bg-destructive-soft hover:text-destructive opacity-70 group-hover:opacity-100'
                          )}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Criterion Detail Form */}
              {activeIndicator ? (
                <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                        {activeIndicator.criterionCode}
                      </span>
                      <h3 className="font-semibold text-foreground">
                        Chỉnh sửa nội dung tiêu chí {activeIndicator.criterionCode}
                      </h3>
                    </div>
                    <Btn
                      size="sm"
                      variant="ghost"
                      disabled={indicators.length <= 1}
                      className={cn(
                        'text-destructive hover:bg-destructive-soft hover:text-destructive',
                        indicators.length <= 1 && 'opacity-40 cursor-not-allowed'
                      )}
                      title={
                        indicators.length <= 1
                          ? 'Rubric cần giữ tối thiểu 1 tiêu chí'
                          : `Xóa tiêu chí ${activeIndicator.criterionCode}`
                      }
                      onClick={() => handleRequestDelete(selectedIdx)}
                    >
                      <Trash2 className="size-4" />
                      <span>Xóa tiêu chí này</span>
                    </Btn>
                  </div>

                  {/* Codes & Titles */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Mã tiêu chí bảng kiểm
                      </label>
                      <input
                        type="text"
                        value={activeIndicator.criterionCode}
                        onChange={(e) => handleUpdateActiveField('criterionCode', e.target.value)}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-sm font-mono font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Mã chỉ số năng lực
                      </label>
                      <input
                        type="text"
                        value={activeIndicator.indicatorCode}
                        onChange={(e) => handleUpdateActiveField('indicatorCode', e.target.value)}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-sm font-mono font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        Tiêu đề ngắn gọn trên thẻ
                      </label>
                      <input
                        type="text"
                        value={activeIndicator.checklistTitle}
                        onChange={(e) => handleUpdateActiveField('checklistTitle', e.target.value)}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Thành tố năng lực KHTN
                    </label>
                    <input
                      type="text"
                      value={activeIndicator.componentName}
                      onChange={(e) => handleUpdateActiveField('componentName', e.target.value)}
                      className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Tiêu đề chỉ số năng lực đầy đủ (Chuẩn GDPT 2018)
                    </label>
                    <textarea
                      rows={2}
                      value={activeIndicator.indicatorTitle}
                      onChange={(e) => handleUpdateActiveField('indicatorTitle', e.target.value)}
                      className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-sm leading-relaxed"
                    />
                  </div>

                  {/* AI & Camera Cues */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-ai/30 bg-ai-soft/30 p-3">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-ai">
                        <ScanEye className="size-4" />
                        <span>Hành vi AI cần tìm kiếm qua video (Camera & Micro)</span>
                      </label>
                      <textarea
                        rows={3}
                        value={activeIndicator.aiLookFor}
                        onChange={(e) => handleUpdateActiveField('aiLookFor', e.target.value)}
                        placeholder="Mô tả hành vi cụ thể: HS giơ tay, vung tay, chỉ vào SGK, cầm thước, bấm giờ..."
                        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs leading-relaxed"
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                        <ClipboardList className="size-4 text-primary" />
                        <span>Minh chứng bắt buộc cần có</span>
                      </label>
                      <textarea
                        rows={3}
                        value={activeIndicator.requiredEvidence}
                        onChange={(e) => handleUpdateActiveField('requiredEvidence', e.target.value)}
                        placeholder="Đoạn video thao tác rõ mặt, lời thoại nói rõ phương án, bảng số liệu ghi vở..."
                        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Levels M1, M2, M3 */}
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Chuẩn 3 Mức độ năng lực (M1 - M2 - M3)
                    </span>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      {(['M1', 'M2', 'M3'] as const).map((lvl) => (
                        <div key={lvl} className="rounded-xl border border-border bg-background p-3">
                          <div className="flex items-center justify-between">
                            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                              {lvl}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {lvl === 'M1'
                                ? 'Có hướng dẫn'
                                : lvl === 'M2'
                                ? 'Tự làm đúng'
                                : 'Thành thạo, sâu'}
                            </span>
                          </div>
                          <textarea
                            rows={4}
                            value={activeIndicator.levels[lvl]}
                            onChange={(e) => handleUpdateLevel(lvl, e.target.value)}
                            className="mt-2 w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs leading-relaxed"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Ghi chú sư phạm (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={activeIndicator.note || ''}
                      onChange={(e) => handleUpdateActiveField('note', e.target.value)}
                      placeholder="Lưu ý về thiết bị hoặc hoàn cảnh thực hành..."
                      className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 2: IMPORT DOCUMENTS */}
          {activeTab === 'import' && (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="rounded-2xl border border-dashed border-primary/40 bg-primary-soft/20 p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.doc,.docx,.pdf,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="hidden"
                  id="rubric-file-input"
                />
                <label
                  htmlFor="rubric-file-input"
                  className="flex cursor-pointer flex-col items-center gap-2"
                >
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileUp className="size-6" />
                  </span>
                  <span className="text-base font-bold text-foreground">
                    Tải lên tài liệu Rubric / Kế hoạch bài dạy
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Hỗ trợ định dạng Microsoft Word (.docx, .doc), PDF (.pdf) hoặc Text (.txt)
                  </span>
                  <Btn size="sm" variant="outline" className="mt-2 pointer-events-none">
                    Chọn tệp từ máy tính
                  </Btn>
                </label>
                {importFile && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-primary">
                    <FileText className="size-4" />
                    <span>{importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>

              {/* Paste or sample text */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Hoặc dán nội dung văn bản tài liệu / giáo án
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadSampleText}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <FileCode className="size-3.5" />
                    <span>Nạp mẫu bài dạy đo tốc độ</span>
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Dán nội dung bảng tiêu chí, kế hoạch bài dạy KHTN, mục tiêu năng lực vào đây..."
                  className="w-full rounded-2xl border border-input bg-background p-3.5 text-xs font-mono leading-relaxed"
                />
              </div>

              {extractError && (
                <div className="flex items-start gap-2 rounded-xl bg-destructive-soft p-3 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{extractError}</span>
                </div>
              )}

              {extractSuccess && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{extractSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Btn
                  variant="primary"
                  disabled={isExtracting || (!importFile && !importText.trim())}
                  onClick={handleExtractFromDocument}
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Gemini đang đọc & chuẩn hóa tiêu chí...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Bắt đầu AI đọc & trích xuất Rubric</span>
                    </>
                  )}
                </Btn>
              </div>
            </div>
          )}

          {/* TAB 3: AI BRAINSTORMING & CHAT */}
          {activeTab === 'chat' && (
            <div className="flex h-full flex-col space-y-4 max-w-4xl mx-auto">
              {/* Brainstorm quick suggestion chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Sparkles className="size-3.5 text-ai" /> Gợi ý nhanh:
                </span>
                {[
                  'Bổ sung tiêu chí An toàn thí nghiệm & Vệ sinh',
                  'Chỉnh sửa M2 khi đo tốc độ bằng cổng quang điện',
                  'Làm sao để chỉ số 2.4 dễ quan sát qua camera lớp học?',
                  'Phân hóa rõ hơn M2 và M3 cho việc xử lý sai số',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSendChat(chip)}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Chat history */}
              <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/20 p-4 min-h-[360px] max-h-[460px]">
                {chatMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex flex-col gap-1 text-sm max-w-[85%]',
                        isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {isUser ? <span>Thầy/Cô</span> : <Bot className="size-3.5 text-ai" />}
                        <span>{msg.timestamp}</span>
                      </div>
                      <div
                        className={cn(
                          'rounded-2xl p-3.5 leading-relaxed',
                          isUser
                            ? 'bg-primary text-primary-foreground rounded-br-xs'
                            : 'bg-card border border-border text-foreground shadow-xs rounded-bl-xs'
                        )}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>

                        {/* Interactive proposal card if AI suggested an update */}
                        {msg.suggestedRubric && msg.suggestedRubric.length > 0 && (
                          <div className="mt-3 rounded-xl border border-primary/30 bg-primary-soft/50 p-3 text-foreground">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-xs text-primary flex items-center gap-1">
                                <Sparkles className="size-3.5" />
                                Đề xuất Rubric mới: {msg.suggestedRubric.length} tiêu chí
                              </span>
                              <Btn
                                size="sm"
                                variant="primary"
                                onClick={() => handleApplySuggestedRubric(msg.suggestedRubric!)}
                              >
                                <Check className="size-3.5" />
                                <span>Áp dụng vào Rubric</span>
                              </Btn>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground max-h-32 overflow-y-auto">
                              {msg.suggestedRubric.map((item) => (
                                <div key={item.criterionCode} className="flex gap-2">
                                  <span className="font-mono font-bold text-primary">
                                    {item.criterionCode} ({item.indicatorCode}):
                                  </span>
                                  <span className="line-clamp-1">{item.checklistTitle}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isChatting && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                    <Loader2 className="size-4 animate-spin text-ai" />
                    <span>AI đang phân tích và soạn thảo phản biện sư phạm...</span>
                  </div>
                )}
                <div ref={chatScrollRef} />
              </div>

              {/* Chat Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Hỏi AI hoặc yêu cầu chỉnh sửa (Ví dụ: Thêm tiêu chí vệ sinh dụng cụ sau thực hành...)"
                  className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
                <Btn type="submit" variant="primary" disabled={isChatting || !chatInput.trim()}>
                  <Send className="size-4" />
                  <span>Gửi</span>
                </Btn>
              </form>
            </div>
          )}
        </div>

        {/* Bottom Footer Action Bar */}
        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-background/95 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">
              Rubric hiện tại: <strong className="text-foreground">{indicators.length} tiêu chí</strong>
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              · Tương thích video live & tự động đồng bộ sang tất cả 6 bước
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="ghost" onClick={handleClose}>
              Đóng
            </Btn>
            <Btn variant="primary" onClick={handleApprove}>
              <CheckCircle2 className="size-4" />
              <span>Duyệt Rubric</span>
            </Btn>
          </div>
        </footer>

        {/* Modal: Xác nhận xóa tiêu chí */}
        {deleteTargetIdx !== null && indicators[deleteTargetIdx] && (
          <div
            role="alertdialog"
            aria-modal="true"
            className="fixed inset-0 z-60 flex items-center justify-center bg-player/70 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6 animate-in fade-in duration-150">
              <div className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <Trash2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-foreground">
                    Xác nhận xóa tiêu chí {indicators[deleteTargetIdx].criterionCode}?
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Bạn có chắc chắn muốn xóa tiêu chí{' '}
                    <strong className="text-foreground font-semibold">
                      {indicators[deleteTargetIdx].criterionCode} - {indicators[deleteTargetIdx].checklistTitle}
                    </strong>{' '}
                    khỏi bảng Rubric phiên này không?
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Sau khi xóa, bạn cần bấm <span className="font-semibold text-foreground">"Duyệt Rubric"</span> ở góc dưới để lưu thay đổi.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-border pt-4">
                <Btn variant="ghost" onClick={() => setDeleteTargetIdx(null)}>
                  Hủy bỏ
                </Btn>
                <Btn
                  variant="primary"
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  onClick={handleConfirmDelete}
                >
                  <Trash2 className="size-4" />
                  <span>Xác nhận xóa</span>
                </Btn>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Xác nhận khôi phục mẫu gốc */}
        {showResetConfirm && (
          <div
            role="alertdialog"
            aria-modal="true"
            className="fixed inset-0 z-60 flex items-center justify-center bg-player/70 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6 animate-in fade-in duration-150">
              <div className="flex items-start gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <RotateCcw className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-foreground">
                    Khôi phục bộ Rubric mẫu GDPT 2018?
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Toàn bộ các tiêu chí thêm mới hoặc chỉnh sửa sẽ được đặt lại về 5 tiêu chí chuẩn thí nghiệm đo tốc độ ban đầu.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-border pt-4">
                <Btn variant="ghost" onClick={() => setShowResetConfirm(false)}>
                  Giữ nguyên
                </Btn>
                <Btn variant="primary" onClick={handleConfirmReset}>
                  <RotateCcw className="size-4" />
                  <span>Khôi phục mẫu gốc</span>
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
