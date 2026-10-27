import {
  CheckCircle2,
  ClipboardList,
  Image as ImageIcon,
  Plus,
  Users,
  Video,
} from 'lucide-react';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import { StepNav } from './Shell';
import { Card, Status, Thumb, cn } from './kit';
import { StudentSeating } from './StudentSeating';
import { Checklist } from './Checklist';
import { RubricWorkspace } from './RubricWorkspace';

export function Step1({ app }: { app: AiLensController }) {
  const { session, selectedSourceId } = app;
  const currentSource = session.sources.find((source) => source.id === selectedSourceId) || session.sources[0];
  const videoCount = session.sources.filter((source) => source.mediaType !== 'worksheet_image').length;
  const imageCount = session.sources.length - videoCount;
  const missingCount = session.sources.filter((source) => source.mediaMissing).length;

  return (
    <div className="space-y-8">
      <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{session.lessonTitle}</p>
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
        <div className="mb-3">
          <h2 id="sources-title" className="text-base font-semibold">Nguồn minh chứng</h2>
          <p className="text-sm text-muted-foreground">Sắp xếp theo diễn tiến thí nghiệm · chọn nguồn để xem chi tiết</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {session.sources.map((source) => {
            const isSelected = selectedSourceId === source.id;
            return (
              <div key={source.id} className="min-w-0 space-y-1.5">
                <div
                  className={cn(
                    'rounded-xl transition-all duration-200',
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
        {currentSource && (
          <details key={currentSource.id} className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              Chi tiết nguồn · {currentSource.id}
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <h3 className="font-semibold">{currentSource.title}</h3>
                <p className="mt-1 text-primary">{currentSource.stageLabel}</p>
                <p className="mt-2 leading-relaxed text-muted-foreground">{currentSource.description}</p>
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

      <StudentSeating students={session.students} />

      <Checklist
        gradeSubject={session.gradeSubject}
        indicators={app.rubricIndicators}
        onOpenWorkspace={() => app.setShowRubricWorkspace(true)}
      />

      {app.showRubricWorkspace && (
        <RubricWorkspace app={app} onClose={() => app.setShowRubricWorkspace(false)} />
      )}

      <StepNav app={app} nextLabel="Bắt đầu phân tích minh chứng" />
    </div>
  );
}
