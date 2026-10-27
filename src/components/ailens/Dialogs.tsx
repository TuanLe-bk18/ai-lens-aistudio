import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
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
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={onClose}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-foreground shadow-xl backdrop:bg-player/60 sm:p-6 no-print"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <Btn size="sm" variant="ghost" aria-label="Đóng hộp thoại" onClick={onClose}>
          <X className="size-5" />
        </Btn>
      </div>
      {children}
    </dialog>
  );
}

const fieldClass =
  'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40';

function ApiKeyModal({ app, onClose }: { app: AiLensController; onClose: () => void }) {
  const [checking, setChecking] = useState<boolean>(true);
  const [hasServerKey, setHasServerKey] = useState<boolean>(app.serverHasKey);

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const hasKey = Boolean(data?.hasServerApiKey);
        setHasServerKey(hasKey);
        app.setServerHasKey(hasKey);
      })
      .catch(() => {
        if (cancelled) return;
        setHasServerKey(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Dialog title="Cấu hình Gemini API Key" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onClose();
        }}
        className="space-y-4"
      >
        {checking ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3.5 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Đang kiểm tra kết nối máy chủ (/api/health)...</span>
          </div>
        ) : hasServerKey ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-300/80 bg-emerald-50/90 p-3.5 text-sm text-emerald-950">
            <p className="font-semibold text-emerald-950 flex items-center gap-1.5">
              <span className="flex size-4.5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                ✓
              </span>
              <span>Máy chủ đã sẵn sàng</span>
            </p>
            <p className="text-xs text-emerald-900 leading-relaxed">
              Máy chủ đã tích hợp sẵn Gemini API. Người dùng và những người được chia sẻ ứng dụng{' '}
              <strong className="font-semibold text-emerald-950">hoàn toàn không cần nhập API Key</strong>. Hệ
              thống tự động phân tích video và hỗ trợ AI Cố vấn sư phạm qua máy chủ an toàn. Bạn chỉ cần nhập
              khóa dưới đây nếu muốn sử dụng khóa thanh toán cá nhân riêng.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-300/90 bg-amber-50/95 p-3.5 text-sm text-amber-950">
            <p className="font-semibold text-amber-950 flex items-center gap-1.5">
              <AlertTriangle className="size-4.5 text-amber-600 shrink-0" />
              <span>Chưa nhận được API Key từ AI Studio, vui lòng dán key vào ô dưới đây</span>
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              Hệ thống vẫn tự động kích hoạt cơ chế trả lời mẫu (mock reply) cho AI Cố vấn và bộ dữ liệu kiểm
              chuẩn dự phòng cho 6 clip thực nghiệm. Để phân tích video thực nghiệm mới trực tiếp qua Gemini AI,
              vui lòng dán API Key cá nhân của bạn.
            </p>
            <div className="pt-0.5">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-950 hover:text-primary underline underline-offset-3"
              >
                <span>Nhấn vào đây để tạo và lấy API Key tại Google AI Studio</span>
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        )}

        <label className="block space-y-1.5 text-sm font-medium">
          <span>{hasServerKey ? 'Gemini API Key (Tùy chọn)' : 'Gemini API Key'}</span>
          <input
            aria-label="Gemini API Key"
            autoFocus
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={app.customApiKey}
            onChange={(event) => app.setCustomApiKey(event.target.value)}
            placeholder={
              hasServerKey
                ? 'Để trống để dùng khóa máy chủ tích hợp sẵn...'
                : 'Dán mã Gemini API Key (AIzaSy...) vào đây...'
            }
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
              Xóa khóa riêng & dùng lại mặc định
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {hasServerKey
              ? 'Mặc định: Sử dụng khóa máy chủ của ứng dụng (hoàn toàn tự động, không yêu cầu thiết lập).'
              : 'Trạng thái: Trợ lý AI đang sẵn sàng ở chế độ gợi ý mẫu sư phạm (offline mock).'}
          </p>
        )}

        <details className="text-xs text-muted-foreground rounded-lg border border-border p-2.5">
          <summary className="cursor-pointer font-medium text-foreground">Mô hình AI & Cơ chế dự phòng</summary>
          <p className="mt-2 leading-relaxed">
            Hệ thống phân tích video sử dụng mô hình đa phương thức <strong>gemini-3.5-flash-lite</strong> (dự
            phòng tự động <strong>gemini-3.1-flash-lite</strong>) với khả năng đồng bộ khẩu hình và lời thoại
            (Speaker Diarization). Đối với 6 clip thực nghiệm mặc định và AI Cố vấn, hệ thống luôn sẵn sàng bộ dữ
            liệu kiểm chuẩn và phản hồi mẫu giúp giáo viên sử dụng mượt mà không bị gián đoạn.
          </p>
        </details>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Btn type="submit" variant="primary">
            Lưu & Đóng
          </Btn>
        </div>
      </form>
    </Dialog>
  );
}

export function AppDialogs({ app }: { app: AiLensController }) {
  return (
    <>
      {app.showAddModal && (
        <Dialog title="Bổ sung minh chứng AI bỏ sót" onClose={() => app.setShowAddModal(false)}>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              app.handleAddManualEvidence();
            }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Ghi lại hành vi quan sát được và mốc thời gian để có thể kiểm chứng từ nguồn gốc.
            </p>
            {app.newEvError && (
              <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">
                {app.newEvError}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Nguồn minh chứng</span>
                <select
                  className={fieldClass}
                  value={app.newEvSourceId}
                  onChange={(event) => app.setNewEvSourceId(event.target.value)}
                >
                  {app.session.sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.id} · {source.durationSeconds}s
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Tiêu chí</span>
                <select
                  className={fieldClass}
                  value={app.newEvCriterion}
                  onChange={(event) => app.setNewEvCriterion(event.target.value as CriterionCode)}
                >
                  {app.rubricIndicators.map((indicator) => (
                    <option key={indicator.criterionCode} value={indicator.criterionCode}>
                      {indicator.criterionCode} · {indicator.checklistTitle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Giây bắt đầu</span>
                <input
                  className={fieldClass}
                  type="number"
                  step="any"
                  value={app.newEvStart}
                  onChange={(event) => app.setNewEvStart(Number(event.target.value))}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Giây kết thúc</span>
                <input
                  className={fieldClass}
                  type="number"
                  step="any"
                  value={app.newEvEnd}
                  onChange={(event) => app.setNewEvEnd(Number(event.target.value))}
                />
              </label>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Ai đã tham gia?</legend>
              <div className="flex flex-wrap gap-2">
                {app.session.students.map(({ code }) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={app.newEvStudents.includes(code)}
                    onClick={() =>
                      app.setNewEvStudents((previous) =>
                        previous.includes(code)
                          ? previous.filter((student) => student !== code)
                          : [...previous, code]
                      )
                    }
                    className={cn(
                      'min-h-11 rounded-xl border px-4 text-sm font-semibold',
                      app.newEvStudents.includes(code)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-card'
                    )}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Mô tả hành vi quan sát được</span>
              <textarea
                autoFocus
                rows={3}
                value={app.newEvBehavior}
                onChange={(event) => app.setNewEvBehavior(event.target.value)}
                placeholder="Em đã làm gì hoặc nói gì trong đoạn này?"
                className={fieldClass}
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Btn variant="ghost" onClick={() => app.setShowAddModal(false)}>
                Hủy
              </Btn>
              <Btn type="submit" variant="primary">
                Lưu minh chứng
              </Btn>
            </div>
          </form>
        </Dialog>
      )}

      {app.showApiKeyModal && (
        <ApiKeyModal app={app} onClose={() => app.setShowApiKeyModal(false)} />
      )}
    </>
  );
}
