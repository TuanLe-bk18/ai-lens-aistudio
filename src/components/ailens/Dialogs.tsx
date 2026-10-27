import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { RUBRIC_INDICATORS } from '../../data/rubricData';
import type { AiLensController } from '../../hooks/useAiLens';
import type { CriterionCode } from '../../types';
import { Btn, cn } from './kit';

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={onClose} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-player/60 sm:p-6 no-print">
    <div className="mb-5 flex items-start justify-between gap-3"><h2 id="dialog-title" className="text-lg font-semibold">{title}</h2><Btn size="sm" variant="ghost" aria-label="Đóng hộp thoại" onClick={onClose}><X className="size-5" /></Btn></div>
    {children}
  </dialog>;
}

const fieldClass = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40';

export function AppDialogs({ app }: { app: AiLensController }) {
  return <>
    {app.showAddModal && <Dialog title="Bổ sung minh chứng AI bỏ sót" onClose={() => app.setShowAddModal(false)}>
      <form noValidate onSubmit={(event) => { event.preventDefault(); app.handleAddManualEvidence(); }} className="space-y-4">
        <p className="text-sm text-muted-foreground">Ghi lại hành vi quan sát được và mốc thời gian để có thể kiểm chứng từ nguồn gốc.</p>
        {app.newEvError && <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">{app.newEvError}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium"><span>Nguồn minh chứng</span><select className={fieldClass} value={app.newEvSourceId} onChange={(event) => app.setNewEvSourceId(event.target.value)}>{app.session.sources.map((source) => <option key={source.id} value={source.id}>{source.id} · {source.durationSeconds}s</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Tiêu chí</span><select className={fieldClass} value={app.newEvCriterion} onChange={(event) => app.setNewEvCriterion(event.target.value as CriterionCode)}>{RUBRIC_INDICATORS.map((indicator) => <option key={indicator.criterionCode} value={indicator.criterionCode}>{indicator.criterionCode} · {indicator.checklistTitle}</option>)}</select></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Giây bắt đầu</span><input className={fieldClass} type="number" step="any" value={app.newEvStart} onChange={(event) => app.setNewEvStart(Number(event.target.value))} /></label>
          <label className="space-y-1.5 text-sm font-medium"><span>Giây kết thúc</span><input className={fieldClass} type="number" step="any" value={app.newEvEnd} onChange={(event) => app.setNewEvEnd(Number(event.target.value))} /></label>
        </div>
        <fieldset><legend className="mb-2 text-sm font-medium">Ai đã tham gia?</legend><div className="flex flex-wrap gap-2">{app.session.students.map(({ code }) => <button key={code} type="button" aria-pressed={app.newEvStudents.includes(code)} onClick={() => app.setNewEvStudents((previous) => previous.includes(code) ? previous.filter((student) => student !== code) : [...previous, code])} className={cn('min-h-11 rounded-xl border px-4 text-sm font-semibold', app.newEvStudents.includes(code) ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card')}>{code}</button>)}</div></fieldset>
        <label className="block space-y-1.5 text-sm font-medium"><span>Mô tả hành vi quan sát được</span><textarea autoFocus rows={3} value={app.newEvBehavior} onChange={(event) => app.setNewEvBehavior(event.target.value)} placeholder="Em đã làm gì hoặc nói gì trong đoạn này?" className={fieldClass} /></label>
        <div className="flex justify-end gap-2 border-t border-border pt-4"><Btn variant="ghost" onClick={() => app.setShowAddModal(false)}>Hủy</Btn><Btn type="submit" variant="primary">Lưu minh chứng</Btn></div>
      </form>
    </Dialog>}
    {app.showApiKeyModal && <Dialog title="Cấu hình Gemini API Key" onClose={() => app.setShowApiKeyModal(false)}>
      <form onSubmit={(event) => { event.preventDefault(); app.setShowApiKeyModal(false); }} className="space-y-4">
        <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-300/80 bg-emerald-50/90 p-3.5 text-sm">
          <p className="font-semibold text-emerald-950 flex items-center gap-1.5">
            <span className="flex size-4.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">✓</span>
            <span>Máy chủ đã tích hợp sẵn Gemini API (Khuyên dùng)</span>
          </p>
          <p className="text-xs text-emerald-900 leading-relaxed">
            Người dùng và những người được chia sẻ ứng dụng <strong className="font-semibold text-emerald-950">hoàn toàn không cần nhập API Key</strong>. Hệ thống tự động phân tích video thông qua máy chủ an toàn. Bạn chỉ cần nhập khóa dưới đây nếu muốn sử dụng khóa thanh toán cá nhân riêng.
          </p>
        </div>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Gemini API Key (Tùy chọn)</span>
          <input
            autoFocus
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={app.customApiKey}
            onChange={(event) => app.setCustomApiKey(event.target.value)}
            placeholder="Để trống để dùng khóa máy chủ tích hợp sẵn..."
            className={cn(fieldClass, 'font-mono text-xs')}
          />
        </label>
        {app.customApiKey ? (
          <div className="flex items-center justify-between rounded-lg bg-warning-soft/60 px-3 py-2 text-xs text-warning-foreground">
            <span>Đang kích hoạt khóa riêng phiên này</span>
            <button
              type="button"
              onClick={() => app.setCustomApiKey('')}
              className="text-primary hover:underline font-semibold cursor-pointer"
            >
              Xóa khóa riêng & dùng lại khóa máy chủ
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Mặc định: Sử dụng khóa máy chủ của ứng dụng (hoàn toàn tự động, không yêu cầu thiết lập).
          </p>
        )}
        <details className="text-xs text-muted-foreground rounded-lg border border-border p-2.5">
          <summary className="cursor-pointer font-medium text-foreground">Mô hình AI & Cơ chế dự phòng</summary>
          <p className="mt-2 leading-relaxed">
            Hệ thống phân tích video sử dụng mô hình đa phương thức <strong>gemini-3.5-flash-lite</strong> với khả năng đồng bộ khẩu hình và lời thoại (Speaker Diarization). Đối với 6 clip thực nghiệm mặc định, hệ thống luôn sẵn sàng bộ dữ liệu kiểm chuẩn dự phòng giúp giáo viên phân tích tức thì.
          </p>
        </details>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Btn type="submit" variant="primary">Lưu & Đóng</Btn>
        </div>
      </form>
    </Dialog>}
  </>;
}
