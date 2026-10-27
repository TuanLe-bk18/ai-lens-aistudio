import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, KeyRound, Printer, RefreshCw, ScanEye, Settings, Sparkles, Upload, X } from 'lucide-react';
import type { AiLensController } from '../../hooks/useAiLens';
import { Btn, cn } from './kit';

export const STEPS = ['Nguồn & Bảng kiểm', 'AI tìm minh chứng', 'HS tự kiểm chứng', 'Kiểm chứng chéo', 'GV xử lý & chốt mức', 'Hồ sơ năng lực'];

export function Shell({ app, children }: { app: AiLensController; children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showResetDemoConfirm, setShowResetDemoConfirm] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const activeStepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeStepRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    window.scrollTo({ top: 0 });
  }, [app.activeStep]);
  useEffect(() => {
    if (!settingsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [settingsOpen]);
  const printReport = () => {
    app.setActiveStep(6);
    setTimeout(() => window.print(), 200);
  };

  return <div className="min-h-screen">
    <a href="#main-content" className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Đến nội dung chính</a>
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur no-print">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:gap-4 md:px-6">
        <div className="flex shrink-0 items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ScanEye className="size-4.5" aria-hidden="true" /></span><span className="font-bold tracking-tight">AI-LENS</span></div>
        <div className="hidden h-6 w-px bg-border sm:block" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{app.session.gradeSubject} · {app.session.lessonTitle}</p>
          <p className="truncate text-xs text-muted-foreground">Nhóm thực hành · {app.session.students.length} học sinh · <span className="text-success">● {app.session.mode === 'live_ai' ? 'Gemini Live' : 'Phiên mẫu đã kiểm chứng'}</span></p>
        </div>
        <Btn variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={printReport}><Download className="size-4" aria-hidden="true" />Xuất báo cáo</Btn>
        <div className="relative" ref={settingsRef}>
          <Btn variant="ghost" size="sm" aria-label="Thiết lập" aria-expanded={settingsOpen} aria-controls="session-settings" onClick={() => setSettingsOpen(!settingsOpen)}><Settings className="size-4" aria-hidden="true" /><span className="hidden md:inline">Thiết lập</span></Btn>
          {settingsOpen && <div id="session-settings" className="absolute right-0 top-full mt-2 w-72 space-y-1 rounded-2xl border border-border bg-card p-2 shadow-lg">
            <p className="px-3 py-2 text-xs text-muted-foreground">Dữ liệu được lưu trên trình duyệt · v{app.session.sessionRevision}</p>
            <Btn variant="ghost" className="w-full justify-start text-left" onClick={() => { setSettingsOpen(false); app.setShowApiKeyModal(true); }}><KeyRound className="size-4" />{app.serverHasKey || app.customApiKey ? 'API Key: Sẵn sàng' : 'Cấu hình Gemini API Key'}</Btn>
            <Btn variant="ghost" className="w-full justify-start" onClick={() => { app.handleExportJson(); setSettingsOpen(false); }}><Download className="size-4" />Xuất JSON</Btn>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring/40"><Upload className="size-4" />Nhập JSON<input aria-label="Nhập JSON" type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { app.handleImportJson(event); setSettingsOpen(false); }} /></label>
            <Btn variant="ghost" className="w-full justify-start" onClick={() => { setSettingsOpen(false); printReport(); }}><Printer className="size-4" />In / Xuất PDF</Btn>
            <div className="border-t border-border pt-1">
              <Btn
                variant="ghost"
                className="w-full justify-start text-destructive hover:bg-destructive-soft hover:text-destructive"
                onClick={() => {
                  setSettingsOpen(false);
                  setShowResetDemoConfirm(true);
                }}
              >
                <RefreshCw className="size-4" />
                Khôi phục dữ liệu gốc
              </Btn>
            </div>
          </div>}
        </div>
      </div>
      <nav className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] md:px-6" aria-label="Các bước">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const active = app.activeStep === number;
          const previous = number < app.activeStep;
          return <div key={label} className="flex shrink-0 items-center gap-1.5">
            {index > 0 && <span className={cn('h-px w-4 md:w-8', previous || active ? 'bg-primary/50' : 'bg-border')} />}
            <button type="button" ref={active ? activeStepRef : undefined} aria-current={active ? 'step' : undefined} aria-label={`Bước ${number}: ${label}`} title={label} onClick={() => app.setActiveStep(number)} className={cn('flex min-h-8 cursor-pointer items-center gap-2 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', active ? 'bg-primary-soft pl-1 pr-3 text-accent-foreground' : 'px-0.5')}>
              <span className={cn('flex size-6 items-center justify-center rounded-full text-xs font-semibold', active && 'bg-primary text-primary-foreground', previous && 'bg-success-soft text-success', !active && !previous && 'border border-border text-muted-foreground')}>{previous ? <Check className="size-3.5" aria-hidden="true" /> : number}</span>
              {active && <span className="whitespace-nowrap">{label}</span>}
            </button>
          </div>;
        })}
      </nav>
    </header>
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none md:px-6">
      {app.storageWarning && <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning-foreground no-print"><span>{app.storageWarning}</span><button type="button" aria-label="Đóng cảnh báo lưu trữ" onClick={() => app.setStorageWarning(null)}><X className="size-4" /></button></div>}
      {children}
    </main>

    {showResetDemoConfirm && (
      <div
        role="alertdialog"
        aria-modal="true"
        className="fixed inset-0 z-60 flex items-center justify-center bg-player/70 p-4 backdrop-blur-xs no-print"
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6 animate-in fade-in duration-150">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <RefreshCw className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-foreground">
                Khôi phục phiên mẫu ban đầu?
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Dữ liệu phiên hiện tại và tệp đã tải lên sẽ bị xóa và thay thế bằng phiên thực nghiệm mẫu. Bạn có thể xuất JSON trước nếu muốn giữ lại.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-border pt-4">
            <Btn variant="ghost" onClick={() => setShowResetDemoConfirm(false)}>
              Hủy bỏ
            </Btn>
            <Btn
              variant="primary"
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                setShowResetDemoConfirm(false);
                void app.handleResetDemo();
              }}
            >
              <RefreshCw className="size-4" />
              <span>Xác nhận khôi phục</span>
            </Btn>
          </div>
        </div>
      </div>
    )}
  </div>;
}

export function StepNav({ app, nextLabel, nextDisabled, children }: { app: AiLensController; nextLabel?: string; nextDisabled?: boolean; children?: ReactNode }) {
  return <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 no-print">
    {app.activeStep > 1 ? <Btn variant="ghost" className="min-w-0 text-left" onClick={() => app.setActiveStep(app.activeStep - 1)}><ChevronLeft className="size-4 shrink-0" />{STEPS[app.activeStep - 2]}</Btn> : <span />}
    <div className="ml-auto flex items-center gap-3">{children}{app.activeStep < 6 && <Btn variant="primary" size="lg" disabled={nextDisabled} onClick={() => app.setActiveStep(app.activeStep + 1)}>{nextLabel || `Tiếp: ${STEPS[app.activeStep]}`}<ChevronRight className="size-4 shrink-0" /></Btn>}</div>
  </div>;
}
