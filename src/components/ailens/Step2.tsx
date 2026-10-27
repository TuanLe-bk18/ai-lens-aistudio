import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  MessageSquareQuote,
  Play,
  Plus,
  ScanEye,
  Sparkles,
} from 'lucide-react';
import { RUBRIC_INDICATORS } from '../../data/rubricData';
import { deriveEvidenceReviewStatus } from '../../domain/validation';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import type { EvidenceItem } from '../../types';
import { StepNav } from './Shell';
import { Btn, Card, Code, EvidenceStatus, Notice, StudentDot, cn } from './kit';

const TIME_LINK_REGEX =
  /\b(VID\d+)\s*\((\d{2}):(\d{2})[–-](\d{2}):(\d{2})\)|\b(VID\d+)\s+(\d{2}):(\d{2})[–-](\d{2}):(\d{2})\b|\b(VID\d+)\s*\((\d{1,2})[–-](\d{1,2})s\)|\b(\d{2}):(\d{2})(?:[–-](\d{2}):(\d{2}))?\b|\bgiây\s+(\d{1,2})(?:[–-](\d{1,2}))?\b/g;

function renderTextWithTimeLinks(
  text: string,
  defaultSourceId: string,
  defaultEndSeconds: number,
  onJump: (sourceId: string, startSeconds: number, endSeconds: number) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TIME_LINK_REGEX)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    const fullMatch = match[0];
    let targetSourceId = defaultSourceId;
    let startSeconds = 0;
    let endSeconds = defaultEndSeconds;

    if (match[1]) {
      // VID03 (00:36–00:41)
      targetSourceId = match[1];
      startSeconds = Number(match[2]) * 60 + Number(match[3]);
      endSeconds = Number(match[4]) * 60 + Number(match[5]);
    } else if (match[6]) {
      // VID05 00:34–00:39
      targetSourceId = match[6];
      startSeconds = Number(match[7]) * 60 + Number(match[8]);
      endSeconds = Number(match[9]) * 60 + Number(match[10]);
    } else if (match[11]) {
      // VID05 (34–39s)
      targetSourceId = match[11];
      startSeconds = Number(match[12]);
      endSeconds = Number(match[13]);
    } else if (match[14] !== undefined) {
      // 00:01–00:11 or 00:05
      startSeconds = Number(match[14]) * 60 + Number(match[15]);
      endSeconds =
        match[16] !== undefined
          ? Number(match[16]) * 60 + Number(match[17])
          : Math.min(defaultEndSeconds, startSeconds + 4);
    } else if (match[18] !== undefined) {
      // giây 06 or giây 01–11
      startSeconds = Number(match[18]);
      endSeconds =
        match[19] !== undefined
          ? Number(match[19])
          : Math.min(defaultEndSeconds, startSeconds + 4);
    }

    if (endSeconds <= startSeconds) {
      endSeconds = startSeconds + 4;
    }

    nodes.push(
      <button
        type="button"
        key={`${matchIndex}-${fullMatch}`}
        onClick={() => onJump(targetSourceId, startSeconds, endSeconds)}
        title={`Chuyển tới ${targetSourceId} · ${formatTime(startSeconds)}–${formatTime(endSeconds)}`}
        className="inline cursor-pointer rounded px-0.5 font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:bg-primary-soft hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {fullMatch}
      </button>
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function isUnclear(evidence: EvidenceItem) {
  return (
    evidence.clarity !== 'clear' ||
    evidence.subjectScope === 'unknown' ||
    evidence.studentCodes.length === 0 ||
    deriveEvidenceReviewStatus(evidence) === 'unclear'
  );
}

export function Step2({ app }: { app: AiLensController }) {
  const [filter, setFilter] = useState<string>('all');
  const { session, selectedSourceId, currentVideoTime, activeEvidenceId, analyzingSourceId } = app;
  const currentSource = session.sources.find((source) => source.id === selectedSourceId) || session.sources[0];
  const activeIndicators =
    app.rubricIndicators && app.rubricIndicators.length > 0
      ? app.rubricIndicators
      : RUBRIC_INDICATORS;

  const criterionCodes = Array.from(
    new Set([
      ...activeIndicators.map((i) => i.criterionCode),
      ...session.evidences.map((e) => e.criterionCode),
    ])
  );

  const filterOptions: { value: string; label: string; isCustom?: boolean }[] = [
    { value: 'all', label: 'Tất cả' },
    ...criterionCodes.map((code) => ({
      value: code,
      label: code,
      isCustom: !['TC1', 'TC2', 'TC3', 'TC4', 'TC5'].includes(code),
    })),
    { value: 'unclear', label: 'Chưa rõ' },
  ];

  const list = session.evidences.filter(
    (evidence) =>
      filter === 'all' || (filter === 'unclear' ? isUnclear(evidence) : evidence.criterionCode === filter)
  );

  if (!currentSource) {
    return (
      <div className="space-y-4">
        <Notice>Chưa có nguồn minh chứng. Quay lại bước Nguồn & Bảng kiểm để tải video hoặc ảnh phiếu học tập.</Notice>
        <StepNav app={app} nextLabel="Cho học sinh tự kiểm chứng" />
      </div>
    );
  }

  const isImage = currentSource.mediaType === 'worksheet_image';
  const duration = Math.max(1, currentSource.durationSeconds);
  const markers = session.evidences.filter((evidence) => evidence.sourceId === currentSource.id);
  const transcript = currentSource.transcriptSegments || [];
  const hasAnalysis = Boolean(currentSource.processingModeUsed || markers.some((evidence) => evidence.origin === 'ai'));
  const isAnalyzing = analyzingSourceId !== null;

  const selectSource = (sourceId: string) => {
    app.videoRef.current?.pause();
    app.setSelectedSourceId(sourceId);
    app.setClipStopTime(null);
    app.setCurrentVideoTime(0);
    app.setActiveEvidenceId(null);
    if (sourceId === currentSource.id && app.videoRef.current) app.videoRef.current.currentTime = 0;
  };

  const seek = (time: number) => {
    app.setClipStopTime(null);
    if (app.videoRef.current) {
      app.videoRef.current.currentTime = time;
      app.setCurrentVideoTime(app.videoRef.current.currentTime);
    }
  };

  const jumpToVideoSegment = (
    sourceId: string,
    startSeconds: number,
    endSeconds: number,
    evidenceId?: string
  ) => {
    if (evidenceId) app.setActiveEvidenceId(evidenceId);
    app.setSelectedSourceId(sourceId);
    app.setClipStopTime(endSeconds);
    app.setCurrentVideoTime(startSeconds);
    setTimeout(() => {
      if (app.videoRef.current) {
        app.videoRef.current.currentTime = startSeconds;
        app.videoRef.current.play().catch(() => {});
        app.videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 120);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,52fr)_minmax(0,48fr)] [&>*]:min-w-0">
        <section aria-label="Trình xem và phân tích nguồn minh chứng" className="space-y-3">
          <div role="group" aria-label="Chọn nguồn minh chứng" className="flex gap-2 overflow-x-auto pb-1">
            {session.sources.map((source) => (
              <button
                type="button"
                key={source.id}
                onClick={() => selectSource(source.id)}
                aria-pressed={source.id === currentSource.id}
                title={`${source.title}${source.mediaMissing ? ' — Tệp cục bộ không có trên máy này' : ''}`}
                className={cn(
                  'shrink-0 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  source.id === currentSource.id
                    ? 'border-primary bg-primary-soft font-medium shadow-xs'
                    : 'border-border bg-card opacity-80 hover:bg-muted hover:opacity-100'
                )}
              >
                <span className="block font-semibold">
                  {source.id}
                  {source.mediaMissing && <span className="ml-1 text-warning-foreground">!</span>}
                </span>
                <span className="block max-w-32 truncate text-xs text-muted-foreground">
                  {source.title.replace(/^Clip \d+: /, '')}
                </span>
              </button>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="relative flex aspect-video items-center justify-center bg-player text-player-foreground">
              {isImage ? (
                <img src={currentSource.videoUrl} alt={currentSource.title} className="size-full object-contain" />
              ) : (
                <video
                  ref={app.videoRef}
                  key={currentSource.videoUrl}
                  src={currentSource.videoUrl}
                  poster={currentSource.thumbnailUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`${currentSource.id} — ${currentSource.title}`}
                  onTimeUpdate={app.handleVideoTimeUpdate}
                  className="size-full object-contain"
                />
              )}
              <span className="pointer-events-none absolute left-3 top-3 rounded-lg bg-card/90 px-2 py-1 text-xs font-semibold text-foreground">
                {currentSource.id}
              </span>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <h2 className="min-w-0 text-sm font-medium text-foreground">{currentSource.title}</h2>
                <span className="shrink-0 tabular-nums">
                  {isImage
                    ? 'Ảnh phiếu / vở ghi'
                    : `${formatTime(currentVideoTime)} / ${formatTime(currentSource.durationSeconds)}`}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ScanEye className="size-4 text-primary shrink-0" />
                    <span>Bộ tiêu chí AI đang soi chiếu video ({activeIndicators.length} tiêu chí):</span>
                  </div>
                  {activeIndicators.length > 5 && (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                      Có {activeIndicators.length - 5} tiêu chí tùy biến mới
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Tiêu chí AI soi chiếu">
                  {activeIndicators.map((ind) => {
                    const isCustom = !['TC1', 'TC2', 'TC3', 'TC4', 'TC5'].includes(ind.criterionCode);
                    const isSelectedFilter = filter === ind.criterionCode;
                    return (
                      <button
                        type="button"
                        key={ind.criterionCode}
                        onClick={() => setFilter(isSelectedFilter ? 'all' : ind.criterionCode)}
                        title={`${ind.criterionCode} (Chỉ số ${ind.indicatorCode} - ${ind.checklistTitle})\nCần tìm: ${ind.aiLookFor}\nMinh chứng: ${ind.requiredEvidence}`}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                          isSelectedFilter
                            ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                            : isCustom
                            ? 'border-emerald-300 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100'
                            : 'border-border bg-card hover:bg-muted text-foreground'
                        )}
                      >
                        <span className="font-bold">{ind.criterionCode}</span>
                        <span className="max-w-28 truncate">{ind.checklistTitle}</span>
                        {isCustom && (
                          <span className="rounded-full bg-emerald-200/90 px-1 text-[10px] font-semibold text-emerald-900">
                            Mới
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {currentSource.mediaMissing && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-foreground"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Tệp cục bộ không có trên máy này; quay lại Nguồn & Bảng kiểm để tải lại tệp trước khi xem hoặc phân tích.
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">
                  Mốc minh chứng trên {currentSource.id} · {markers.length} đoạn (bấm mốc để phát)
                </p>
                <div className="relative mt-1 h-8 rounded-lg focus-within:ring-2 focus-within:ring-ring/40">
                  <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
                  {!isImage && (
                    <input
                      type="range"
                      min={0}
                      max={currentSource.durationSeconds}
                      step={0.1}
                      value={Math.min(currentVideoTime, currentSource.durationSeconds)}
                      onChange={(event) => seek(Number(event.target.value))}
                      aria-label={`Tua video ${currentSource.id}`}
                      aria-valuetext={`${formatTime(currentVideoTime)} trên ${formatTime(currentSource.durationSeconds)}`}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                  )}
                  {markers.map((evidence) => {
                    const left = Math.min(98, Math.max(0, (evidence.startSeconds / duration) * 100));
                    const width = Math.min(
                      100 - left,
                      Math.max(2, ((evidence.endSeconds - evidence.startSeconds) / duration) * 100)
                    );
                    return (
                      <button
                        type="button"
                        key={evidence.id}
                        onClick={() => app.playEvidenceClip(evidence)}
                        aria-label={`${evidence.id} · ${evidence.criterionCode} · ${formatTime(evidence.startSeconds)}–${formatTime(evidence.endSeconds)}`}
                        aria-pressed={activeEvidenceId === evidence.id}
                        title={`${evidence.id} · ${evidence.criterionCode} · ${formatTime(evidence.startSeconds)}–${formatTime(evidence.endSeconds)}`}
                        className={cn(
                          'absolute top-1/2 z-10 h-3 -translate-y-1/2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          activeEvidenceId === evidence.id ? 'bg-primary' : 'bg-ai/60 hover:bg-ai'
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    );
                  })}
                  {!isImage && (
                    <div
                      className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-foreground"
                      style={{ left: `${Math.min(100, Math.max(0, (currentVideoTime / duration) * 100))}%` }}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2" aria-busy={isAnalyzing}>
                <Btn variant="primary" disabled={isAnalyzing} onClick={() => app.handleAnalyzeWithGemini(currentSource)}>
                  {isAnalyzing ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Sparkles className="size-4 shrink-0" />}
                  {isAnalyzing
                    ? `Đang phân tích ${analyzingSourceId}…`
                    : `${hasAnalysis ? 'Phân tích lại' : 'Phân tích'} ${isImage ? 'ảnh' : 'video'} này`}
                </Btn>
                <Btn
                  variant="outline"
                  onClick={() => {
                    app.setNewEvSourceId(currentSource.id);
                    app.setShowAddModal(true);
                  }}
                >
                  <Plus className="size-4 shrink-0" />
                  Thêm minh chứng thủ công
                </Btn>
              </div>
              {isAnalyzing && (
                <p role="status" className="text-xs text-muted-foreground">
                  Gemini đang xử lý {analyzingSourceId}. Kết quả sẽ cập nhật khi API hoàn tất.
                </p>
              )}
              {app.aiError && (
                <div
                  role="alert"
                  className="space-y-2 rounded-xl bg-destructive-soft p-3 text-sm text-destructive"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p className="min-w-0 break-words">
                      <strong>Thông báo API: </strong>
                      {app.aiError}
                    </p>
                  </div>
                  {app.customApiKey && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Btn
                        size="sm"
                        variant="outline"
                        className="bg-card text-foreground text-xs"
                        onClick={() => {
                          app.setCustomApiKey('');
                          app.setAiError(null);
                          app.handleAnalyzeWithGemini(currentSource);
                        }}
                      >
                        Xóa khóa riêng & thử lại với cấu hình máy chủ
                      </Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          <details key={`agentic-${currentSource.id}`} open className="group rounded-xl border border-primary/20 bg-primary-soft/10 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
              <ScanEye className="size-4 shrink-0 text-primary" />
              <span className="flex-1">Tiến trình AI Agentic soi chiếu Video & Đối chiếu Rubric · {currentSource.id}</span>
              <span className="text-xs text-muted-foreground">{currentSource.agenticSteps?.length || 0} bước soi chiếu</span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            {currentSource.agenticSteps && currentSource.agenticSteps.length > 0 ? (
              <div className="mt-3 space-y-2">
                {currentSource.agenticSteps.map((step) => (
                  <div key={step.stepNumber} className="rounded-xl border border-border bg-card p-3 text-xs shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                      <div className="flex items-center gap-2 text-foreground">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                          {step.stepNumber}
                        </span>
                        <span>
                          {step.actionType === 'scan_transcript'
                            ? 'Bước A: Quét kênh âm thanh & bóc tách lời thoại'
                            : step.actionType === 'zoom_frames_high_fps'
                            ? 'Bước B: Zoom khung hình xác thực người nói (khẩu hình & cử chỉ)'
                            : 'Bước C: Soi chiếu & đối chiếu bảng kiểm Rubric'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">{step.timeWindow}</span>
                    </div>
                    <p className="mt-1.5 text-muted-foreground leading-relaxed pl-7">{step.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-card p-3 text-xs text-muted-foreground space-y-1">
                <p>
                  Chưa có tiến trình soi chiếu cho nguồn này. Bấm <strong>&quot;Phân tích {isImage ? 'ảnh' : 'video'} này&quot;</strong> để kích hoạt AI Agentic soi chiếu video theo toàn bộ {activeIndicators.length} tiêu chí Rubric.
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {activeIndicators.map((ind) => (
                    <span key={ind.criterionCode} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px]">
                      {ind.criterionCode}: {ind.checklistTitle}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </details>

          <details key={`transcript-${currentSource.id}`} className="group rounded-xl border border-border bg-card px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <MessageSquareQuote className="size-4 shrink-0 text-primary" />
              <span className="flex-1">Lời thoại đồng bộ · {currentSource.id}</span>
              <span className="text-xs text-muted-foreground">{transcript.length} lượt</span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            {transcript.length > 0 ? (
              <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {transcript.map((segment) => {
                  const isCurrent = currentVideoTime >= segment.startSeconds && currentVideoTime <= segment.endSeconds;
                  return (
                    <button
                      type="button"
                      key={segment.id}
                      onClick={() => app.seekToTranscriptSegment(segment)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={cn(
                        'block w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        isCurrent ? 'border-primary bg-primary-soft' : 'border-border bg-background hover:bg-muted'
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-primary underline decoration-primary/40 underline-offset-2">
                          {formatTime(segment.startSeconds)}–{formatTime(segment.endSeconds)}
                        </span>
                        <span className="font-semibold">
                          {segment.speakerCode === 'NHOM' ? 'Cả nhóm' : segment.speakerCode}
                        </span>
                        {segment.linkedCriteria?.map((criterion) => (
                          <Code key={criterion}>{criterion}</Code>
                        ))}
                      </span>
                      <span className="mt-1 block text-sm italic leading-relaxed text-foreground">
                        “{segment.text}”
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                {isImage
                  ? 'Nguồn ảnh không có lời thoại đồng bộ.'
                  : 'Chưa có bản bóc băng cho nguồn này. Bấm phân tích video để trích xuất lời thoại tự động.'}
              </p>
            )}
          </details>
        </section>

        <section aria-labelledby="evidence-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="evidence-title" className="font-semibold">
              Minh chứng ({list.length}/{session.evidences.length})
            </h2>
            <div role="group" aria-label="Lọc minh chứng theo tiêu chí hoặc độ rõ" className="flex flex-wrap gap-1">
              {filterOptions.map(({ value, label, isCustom }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  title={
                    value === 'unclear'
                      ? 'Chưa rõ, chỉ rõ một phần, chưa xác định học sinh hoặc phản hồi kiểm chứng chưa rõ'
                      : undefined
                  }
                  className={cn(
                    'h-8 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    filter === value
                      ? 'bg-foreground text-background font-semibold'
                      : isCustom
                      ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-medium'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {label}
                  {isCustom && ' ✨'}
                </button>
              ))}
            </div>
          </div>
          {filter === 'unclear' && (
            <p className="mb-3 text-xs text-muted-foreground">
              Bao gồm minh chứng rõ một phần, chưa rõ, chưa xác định học sinh hoặc có phản hồi kiểm chứng chưa rõ.
            </p>
          )}
          <div className="space-y-3 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
            {list.map((evidence) => {
              const selected = activeEvidenceId === evidence.id;
              return (
                <article
                  key={evidence.id}
                  className={cn(
                    'rounded-2xl border bg-card p-4 transition-all',
                    selected ? 'border-primary bg-primary-soft/30 shadow-xs' : 'border-border hover:border-primary/30'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{evidence.id}</span>
                    <Code>
                      {evidence.criterionCode} · {evidence.indicatorCode}
                    </Code>
                    <button
                      type="button"
                      onClick={() => app.playEvidenceClip(evidence)}
                      aria-pressed={selected}
                      aria-label={`Xem ${evidence.id} trên ${evidence.sourceId}, ${formatTime(evidence.startSeconds)}–${formatTime(evidence.endSeconds)}`}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary underline decoration-primary/50 underline-offset-4 transition-colors hover:bg-primary-soft hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <Play className="size-3 shrink-0 fill-current" />
                      {evidence.sourceId} · {formatTime(evidence.startSeconds)}–{formatTime(evidence.endSeconds)}
                    </button>
                    <div className="flex flex-wrap items-center gap-1">
                      {evidence.studentCodes.length > 0 ? (
                        evidence.studentCodes.map((student) => <StudentDot key={student} code={student} />)
                      ) : (
                        <span className="text-xs font-medium text-warning-foreground">
                          Chưa rõ chủ thể (unknown)
                        </span>
                      )}
                    </div>
                    <div className="ml-auto">
                      <EvidenceStatus evidence={evidence} />
                    </div>
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-foreground">
                    {renderTextWithTimeLinks(
                      evidence.observableBehavior,
                      evidence.sourceId,
                      evidence.endSeconds,
                      (srcId, start, end) => jumpToVideoSegment(srcId, start, end, evidence.id)
                    )}
                  </p>

                  {evidence.spokenTranscript && (
                    <blockquote className="mt-2.5 rounded-xl border-l-3 border-ai bg-ai-soft/70 px-3.5 py-2.5 text-sm leading-relaxed">
                      <span className="font-semibold not-italic text-foreground">Lời thoại: </span>
                      <span className="italic text-foreground/90">
                        {renderTextWithTimeLinks(
                          evidence.spokenTranscript,
                          evidence.sourceId,
                          evidence.endSeconds,
                          (srcId, start, end) => jumpToVideoSegment(srcId, start, end, evidence.id)
                        )}
                      </span>
                    </blockquote>
                  )}

                  {evidence.limitations && (
                    <p className="mt-2 rounded-lg bg-warning-soft px-3 py-1.5 text-xs text-warning-foreground">
                      <strong>Lưu ý góc quay: </strong>
                      {renderTextWithTimeLinks(
                        evidence.limitations,
                        evidence.sourceId,
                        evidence.endSeconds,
                        (srcId, start, end) => jumpToVideoSegment(srcId, start, end, evidence.id)
                      )}
                    </p>
                  )}

                  {evidence.teacherNote && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <strong className="text-foreground/80">Ghi chú GV: </strong>
                      {renderTextWithTimeLinks(
                        evidence.teacherNote,
                        evidence.sourceId,
                        evidence.endSeconds,
                        (srcId, start, end) => jumpToVideoSegment(srcId, start, end, evidence.id)
                      )}
                    </p>
                  )}
                </article>
              );
            })}
            {list.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                <p>
                  {session.evidences.length === 0
                    ? 'Chưa có minh chứng. Phân tích một nguồn hoặc thêm minh chứng thủ công.'
                    : 'Không có minh chứng phù hợp với bộ lọc này.'}
                </p>
                {filter !== 'all' && (
                  <Btn variant="ghost" size="sm" className="mt-2" onClick={() => setFilter('all')}>
                    Xem tất cả minh chứng
                  </Btn>
                )}
              </Card>
            )}
          </div>
        </section>
      </div>
      <StepNav app={app} nextLabel="Cho học sinh tự kiểm chứng" />
    </div>
  );
}
