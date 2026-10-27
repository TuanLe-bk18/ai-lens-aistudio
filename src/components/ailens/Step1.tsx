import { useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Image as ImageIcon,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import type { VideoSourceItem } from '../../types';
import { StepNav } from './Shell';
import { Card, Status, Thumb, cn } from './kit';
import { StudentSeating } from './StudentSeating';
import { Checklist } from './Checklist';
import { RubricWorkspace } from './RubricWorkspace';

export function Step1({ app }: { app: AiLensController }) {
  const { session, selectedSourceId } = app;
  const [sourceToDelete, setSourceToDelete] = useState<VideoSourceItem | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState<boolean>(false);
  const [showEditLessonModal, setShowEditLessonModal] = useState<boolean>(false);
  const [draftLessonTitle, setDraftLessonTitle] = useState<string>(session.lessonTitle);
  const [draftActivityTitle, setDraftActivityTitle] = useState<string>(session.activityTitle);

  const currentSource = session.sources.find((source) => source.id === selectedSourceId) || session.sources[0];
  const videoCount = session.sources.filter((source) => source.mediaType !== 'worksheet_image').length;
  const imageCount = session.sources.length - videoCount;
  const missingCount = session.sources.filter((source) => source.mediaMissing).length;

  return (
    <div className="space-y-8">
      <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{session.lessonTitle}</p>
            <button
              type="button"
              onClick={() => {
                setDraftLessonTitle(session.lessonTitle);
                setDraftActivityTitle(session.activityTitle);
                setShowEditLessonModal(true);
              }}
              title="Chỉnh sửa thông tin bài học và hoạt động"
              className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{session.activityTitle}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Video className="size-4" />{videoCount} video</span>
            {imageCount > 0 && <span className="inline-flex items-center gap-1.5"><ImageIcon className="size-4" />{imageCount} ảnh</span>}
            <span className="inline-flex items-center gap-1.5"><Users className="size-4" />{session.students.length} học sinh</span>
            <span className="inline-flex items-center gap-1.5"><ClipboardList className="size-4" />Rubric {session.rubricVersion}</span>
          </div>
        </div>
        {missingCount > 0 ? (
          <Status tone="warning">{missingCount} nguồn cần tải lại tệp cục bộ</Status>
        ) : session.sources.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
            <CheckCircle2 className="size-5 shrink-0" />Phiên đã sẵn sàng để phân tích
          </div>
        ) : (
          <Status tone="neutral">Chưa có nguồn minh chứng</Status>
        )}
      </Card>

      <section aria-labelledby="sources-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="sources-title" className="text-base font-semibold">Nguồn minh chứng</h2>
            <p className="text-sm text-muted-foreground">Sắp xếp theo diễn tiến thí nghiệm · chọn nguồn để xem chi tiết</p>
          </div>
          {session.sources.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                title="Xoá tất cả video/nguồn khỏi đầu vào phân tích"
              >
                <Trash2 className="size-3.5" />
                <span>Xoá tất cả ({session.sources.length})</span>
              </button>
            </div>
          )}
        </div>

        {session.sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/60 p-8 text-center sm:p-12">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Video className="size-7" />
            </div>
            <h3 className="text-lg font-bold">Chưa có video hoặc ảnh nào trong đầu vào phân tích</h3>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground leading-relaxed">
              Bạn đã xoá hết các video mẫu. Hãy tải lên bộ video thực nghiệm mẫu hoặc tự tải lên video/ảnh phiếu học tập mới để bắt đầu phân tích.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={app.handleLoadSampleVideos}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="size-4" />
                <span>Tải lên bộ video mẫu</span>
              </button>

              <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-xl border border-input bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-xs transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring/40">
                <Plus className="size-4" />
                <span>Tải thêm video/ảnh phiếu</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp"
                  onChange={app.handleCustomVideoUpload}
                  aria-label="Tải thêm video hoặc ảnh phiếu học tập, vở ghi"
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {session.sources.map((source) => {
              const isSelected = selectedSourceId === source.id;
              return (
                <div key={source.id} className="group relative min-w-0 space-y-1.5">
                  <div
                    className={cn(
                      'relative rounded-xl transition-all duration-200',
                      isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md'
                    )}
                  >
                    <Thumb
                      light
                      selected={isSelected}
                      label={source.id}
                      src={source.thumbnailUrl}
                      alt={`${source.id} — ${source.title}`}
                      onClick={() => app.setSelectedSourceId(source.id)}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSourceToDelete(source);
                      }}
                      title={`Xoá nguồn ${source.id}`}
                      aria-label={`Xoá nguồn ${source.id}`}
                      className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-lg bg-background/90 text-muted-foreground shadow-xs backdrop-blur-xs transition hover:bg-destructive hover:text-destructive-foreground focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p
                    className={cn(
                      'line-clamp-2 text-sm leading-snug transition-colors duration-200',
                      isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
                    )}
                    title={source.title}
                  >
                    {source.title.replace(/^Clip \d+: /, '')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {source.id} · {source.mediaType === 'worksheet_image' ? 'Ảnh phiếu / vở' : `${source.durationSeconds.toFixed(1)}s`}
                    {source.expectedCriteria.length > 0 && ` · ${source.expectedCriteria.join(', ')}`}
                  </p>
                  {source.mediaMissing && <Status tone="warning">Tệp không có trên máy</Status>}
                </div>
              );
            })}
            <label className="relative flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 self-start rounded-xl border border-dashed border-input text-sm text-muted-foreground transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring/40">
              <Plus className="size-5" />
              <span>Tải thêm</span>
              <span className="text-xs">Video / Ảnh phiếu</span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp"
                onChange={app.handleCustomVideoUpload}
                aria-label="Tải thêm video hoặc ảnh phiếu học tập, vở ghi"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        )}

        {currentSource && (
          <details key={currentSource.id} className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              Chi tiết nguồn · {currentSource.id}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{currentSource.title}</h3>
                  <p className="mt-1 text-primary">{currentSource.stageLabel}</p>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{currentSource.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSourceToDelete(currentSource)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground transition"
                >
                  <Trash2 className="size-3.5" />
                  <span>Xoá video này</span>
                </button>
              </div>
              <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Tệp gốc</dt><dd className="mt-0.5 break-all">{currentSource.filename}</dd></div>
                <div><dt className="text-muted-foreground">Dung lượng / Định dạng</dt><dd className="mt-0.5">{(currentSource.sizeBytes / 1024 / 1024).toFixed(1)} MB · {currentSource.mimeType || (currentSource.mediaType === 'worksheet_image' ? 'Ảnh' : 'Video')}</dd></div>
                <div><dt className="text-muted-foreground">Loại nguồn</dt><dd className="mt-0.5">{currentSource.mediaType === 'worksheet_image' ? 'Ảnh Phiếu học tập / Vở ghi' : `Video · ${formatTime(currentSource.durationSeconds)} (${currentSource.durationSeconds}s)`}</dd></div>
                <div><dt className="text-muted-foreground">Tiêu chí dự kiến</dt><dd className="mt-0.5">{currentSource.expectedCriteria.join(', ') || 'Chưa xác định'}</dd></div>
                <div><dt className="text-muted-foreground">Lưu trữ</dt><dd className="mt-0.5">{currentSource.isCustomUpload ? 'Tệp tải lên · lưu cục bộ trong IndexedDB' : 'Nguồn thực nghiệm có sẵn'}</dd></div>
              </dl>
              {currentSource.mediaMissing && (
                <p role="alert" className="rounded-lg bg-warning-soft p-3 text-warning-foreground">Tệp cục bộ không có trên máy này; vui lòng tải lại tệp để xem/phân tích.</p>
              )}
            </div>
          </details>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Hỗ trợ MP4, WebM, MOV và ảnh JPG, PNG, WebP. Tệp tải lên được lưu trong IndexedDB để khôi phục sau F5 nếu trình duyệt hỗ trợ.</p>
      </section>

      <StudentSeating app={app} />

      <Checklist
        gradeSubject={session.gradeSubject}
        indicators={app.rubricIndicators}
        onOpenWorkspace={() => app.setShowRubricWorkspace(true)}
      />

      {app.showRubricWorkspace && (
        <RubricWorkspace app={app} onClose={() => app.setShowRubricWorkspace(false)} />
      )}

      <StepNav
        app={app}
        nextLabel="Bắt đầu phân tích minh chứng"
        nextDisabled={session.sources.length === 0}
      />

      {/* Modal: Xác nhận xoá 1 nguồn */}
      {sourceToDelete && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-player/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6 animate-in fade-in duration-150">
            <div className="flex items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-foreground">
                  Xác nhận xoá nguồn {sourceToDelete.id}?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Bạn có chắc muốn xoá video{' '}
                  <strong className="text-foreground font-semibold">
                    {sourceToDelete.title}
                  </strong>{' '}
                  khỏi đầu vào phân tích?
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Các minh chứng và dữ liệu kiểm chứng gắn liền với video này cũng sẽ được gỡ bỏ khỏi phiên.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setSourceToDelete(null)}
                className="rounded-xl border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => {
                  app.handleDeleteSource(sourceToDelete.id);
                  setSourceToDelete(null);
                }}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition"
              >
                Xác nhận xoá
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận xoá tất cả nguồn */}
      {showClearAllConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-player/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6 animate-in fade-in duration-150">
            <div className="flex items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-foreground">
                  Xoá toàn bộ {session.sources.length} nguồn minh chứng?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Bạn có chắc chắn muốn xoá tất cả video khỏi đầu vào phân tích của phiên này?
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sau khi xoá hết, bạn có thể bấm <span className="font-semibold text-foreground">"Tải lên bộ video mẫu"</span> để nạp lại 6 video thực nghiệm mẫu bất cứ lúc nào.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(false)}
                className="rounded-xl border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => {
                  app.handleDeleteAllSources();
                  setShowClearAllConfirm(false);
                }}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition"
              >
                Xoá tất cả
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Đổi thông tin bài học & hoạt động */}
      {showEditLessonModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-player/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">
                Đổi thông tin bài học & hoạt động
              </h3>
              <button
                type="button"
                onClick={() => setShowEditLessonModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <label className="block space-y-1.5">
                <span className="font-medium">Tên chương / Bài học</span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={draftLessonTitle}
                  onChange={(e) => setDraftLessonTitle(e.target.value)}
                  placeholder="Ví dụ: Chương III: Tốc độ — Bài 8: Tốc độ chuyển động"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="font-medium">Tên hoạt động / thí nghiệm</span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={draftActivityTitle}
                  onChange={(e) => setDraftActivityTitle(e.target.value)}
                  placeholder="Ví dụ: Thí nghiệm: Đo tốc độ của ô tô đồ chơi"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowEditLessonModal(false)}
                className="rounded-xl border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => {
                  app.handleUpdateLessonInfo(draftLessonTitle, draftActivityTitle);
                  setShowEditLessonModal(false);
                }}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
              >
                Lưu thông tin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
