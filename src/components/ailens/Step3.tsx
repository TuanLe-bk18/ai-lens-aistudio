import { useState } from 'react';
import { Check, ChevronDown, PencilLine, PlayCircle, Plus } from 'lucide-react';
import { RUBRIC_INDICATORS } from '../../data/rubricData';
import { getSelfReviews } from '../../domain/validation';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import type { EvidenceItem, SelfReviewRecord } from '../../types';
import { Btn, Card, Code, Notice, Segmented, Status, StudentDot, Thumb, cn } from './kit';
import { StepNav } from './Shell';

export function Step3({ app }: { app: AiLensController }) {
  const [showOtherEvidence, setShowOtherEvidence] = useState(false);
  const { session, selectedSelfStudent } = app;
  const isMine = (ev: EvidenceItem) =>
    ev.studentCodes.includes(selectedSelfStudent) ||
    getSelfReviews(ev).some((review) => review.reviewerCode === selectedSelfStudent);
  const mine = session.evidences.filter(isMine);
  const others = session.evidences.filter((ev) => !isMine(ev));
  const reviewedCount = mine.filter((ev) =>
    getSelfReviews(ev).some((review) => review.reviewerCode === selectedSelfStudent)
  ).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="text-center">
        <h2 id="self-student-label" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Em là ai trong nhóm?
        </h2>
        <div className="mt-3" role="group" aria-labelledby="self-student-label">
          <Segmented
            options={session.students.map((student) => student.code)}
            value={selectedSelfStudent}
            onChange={(student) => {
              app.setSelectedSelfStudent(student);
              app.setEditingSelfEvId(null);
              setShowOtherEvidence(false);
            }}
            size="lg"
          />
        </div>
        <p className="mt-3 text-base" aria-live="polite">
          <b>{mine.length} minh chứng</b> liên quan đến bạn · đã phản hồi {reviewedCount}/{mine.length}
        </p>
      </div>

      <div className="space-y-3" aria-label={`Minh chứng liên quan đến ${selectedSelfStudent}`}>
        {mine.map((ev) => <SelfEvidenceCard key={ev.id} ev={ev} app={app} />)}
        {mine.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            Chưa có minh chứng gán cho bạn hoặc phản hồi của bạn. Em có thể tìm trong
            “Minh chứng khác / Báo AI gán thiếu” hoặc bổ sung minh chứng bên dưới.
          </Card>
        )}
      </div>

      <section className="space-y-3" aria-label="Tìm minh chứng AI gán thiếu hoặc nhầm">
        <Btn
          variant="outline"
          size="lg"
          className="h-auto min-h-12 w-full justify-between gap-3 py-3 text-left"
          aria-expanded={showOtherEvidence}
          aria-controls="other-self-evidence"
          onClick={() => setShowOtherEvidence((open) => !open)}
        >
          <span>Minh chứng khác / Báo AI gán thiếu ({others.length})</span>
          <ChevronDown aria-hidden="true" className={cn('size-5 shrink-0 transition-transform', showOtherEvidence && 'rotate-180')} />
        </Btn>
        {showOtherEvidence && (
          <div id="other-self-evidence" className="space-y-3">
            <Notice>
              Em vẫn có thể đề nghị sửa trên bất kỳ minh chứng nào, kể cả khi AI chưa ghi tên em.
              Đề nghị sẽ được lưu riêng cho {selectedSelfStudent} để giáo viên xem xét.
            </Notice>
            {others.map((ev) => <SelfEvidenceCard key={ev.id} ev={ev} app={app} />)}
            {others.length === 0 && (
              <Card className="p-5 text-center text-sm text-muted-foreground">
                Tất cả minh chứng hiện có đều nằm trong danh sách liên quan đến bạn ở trên.
              </Card>
            )}
          </div>
        )}
      </section>

      <div className="text-center">
        <Btn
          variant="outline"
          size="lg"
          className="h-auto min-h-12 max-w-full py-3"
          onClick={() => {
            app.setNewEvStudents([selectedSelfStudent]);
            app.setShowAddModal(true);
          }}
        >
          <Plus className="size-5 shrink-0" aria-hidden="true" />
          Bổ sung minh chứng AI bỏ sót
        </Btn>
      </div>
      <StepNav app={app} nextLabel="Tiếp: Kiểm chứng chéo" />
    </div>
  );
}

function SelfEvidenceCard({ ev, app }: { ev: EvidenceItem; app: AiLensController }) {
  const student = app.selectedSelfStudent;
  const isAttributed = ev.studentCodes.includes(student);
  const reviews = [...getSelfReviews(ev)].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const myReview = reviews.find((review) => review.reviewerCode === student);
  const otherReviews = reviews.filter((review) => review.reviewerCode !== student);
  const source = app.session.sources.find((item) => item.id === ev.sourceId);
  const openClip = () => {
    app.setActiveStep(2);
    app.playEvidenceClip(ev);
  };

  return (
    <Card className="p-4 md:p-5" role="article" aria-labelledby={`self-evidence-${ev.id}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <Thumb
          small
          label={formatTime(ev.startSeconds)}
          src={source?.thumbnailUrl}
          alt={`Xem minh chứng ${ev.id} từ ${ev.sourceId}, ${formatTime(ev.startSeconds)} đến ${formatTime(ev.endSeconds)}`}
          onClick={openClip}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <h3 id={`self-evidence-${ev.id}`} className="font-semibold">{ev.id}</h3>
            <Code>{ev.criterionCode} · {ev.indicatorCode}</Code>
            <span className="text-muted-foreground">
              {ev.sourceId} · {formatTime(ev.startSeconds)}–{formatTime(ev.endSeconds)}
            </span>
            {!isAttributed && <Status tone="info">Chưa được gán tên em</Status>}
            {ev.origin !== 'ai' && (
              <Status tone="neutral">{ev.origin === 'student_added' ? 'HS bổ sung' : 'GV bổ sung'}</Status>
            )}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-base leading-relaxed">{ev.observableBehavior}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Học sinh được gán trên minh chứng">
            {ev.studentCodes.map((code) => <StudentDot key={code} code={code} />)}
            {ev.studentCodes.length === 0 && <span className="text-sm text-muted-foreground">Chưa rõ người thực hiện</span>}
          </div>
        </div>
      </div>
      {ev.spokenTranscript && (
        <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-primary-soft p-3 text-sm leading-relaxed">
          <span className="font-medium">Lời thoại: </span>“{ev.spokenTranscript}”
        </blockquote>
      )}
      {ev.limitations && <p className="mt-2 text-sm text-muted-foreground">Giới hạn quan sát: {ev.limitations}</p>}

      {myReview && (
        <div className="mt-4" aria-live="polite">
          <SelfResponse review={myReview} mine />
        </div>
      )}
      {otherReviews.length > 0 && (
        <details className="mt-3 rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer py-1 text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            Phản hồi của các bạn khác ({otherReviews.length})
          </summary>
          <div className="mt-2 space-y-2">
            {otherReviews.map((review, index) => (
              <SelfResponse key={`${review.reviewerCode}-${index}`} review={review} />
            ))}
          </div>
        </details>
      )}

      {app.editingSelfEvId === ev.id ? (
        <FixEditor ev={ev} app={app} />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isAttributed && (
            <Btn
              variant="success"
              size="lg"
              className="h-auto min-h-12 flex-1 py-3 sm:flex-none"
              aria-label={`${myReview ? 'Xác nhận lại' : 'Xác nhận đúng'} minh chứng ${ev.id} cho ${student}`}
              onClick={() => app.handleConfirmSelfReview(ev)}
            >
              <Check className="size-5 shrink-0" aria-hidden="true" />
              {myReview?.status === 'confirmed' ? 'Xác nhận lại' : 'Đúng với em'}
            </Btn>
          )}
          <Btn
            variant="warn"
            size="lg"
            className="h-auto min-h-12 flex-1 py-3 sm:flex-none"
            aria-label={`Đề nghị chỉnh sửa minh chứng ${ev.id} bởi ${student}`}
            onClick={() => app.handleOpenProposeEdit(ev)}
          >
            <PencilLine className="size-5 shrink-0" aria-hidden="true" />
            {myReview ? 'Thay đổi phản hồi' : isAttributed ? 'Cần sửa' : 'Báo AI gán thiếu / nhầm'}
          </Btn>
          <Btn
            variant="ghost"
            className="w-full sm:ml-auto sm:w-auto"
            aria-label={`Xem lại đoạn video của minh chứng ${ev.id}`}
            onClick={openClip}
          >
            <PlayCircle className="size-4 shrink-0" aria-hidden="true" />Xem lại clip
          </Btn>
        </div>
      )}
    </Card>
  );
}

function SelfResponse({ review, mine = false }: { review: SelfReviewRecord; mine?: boolean }) {
  const confirmed = review.status === 'confirmed';
  const proposed = review.status === 'propose_edit';
  const date = new Date(review.updatedAt);
  return (
    <div className={cn(
      'space-y-2 rounded-xl border px-4 py-3 text-sm',
      confirmed ? 'border-success/30 bg-success-soft' : 'border-warning/40 bg-warning-soft'
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[15px] font-medium">
          {confirmed ? <Check className="mr-1 inline size-4" aria-hidden="true" /> : <PencilLine className="mr-1 inline size-4" aria-hidden="true" />}
          {mine ? 'Em' : review.reviewerCode}{confirmed ? ' đã xác nhận đúng' : proposed ? ' đề nghị sửa' : ' chưa xác định rõ'}
        </p>
        {review.resolvedByTeacher && <Status tone="neutral">Đã được GV xử lý</Status>}
      </div>
      {review.note && <p className="whitespace-pre-wrap break-words leading-relaxed">{review.note}</p>}
      {review.proposedStudentCodes !== undefined && (
        <p>Đề nghị người thực hiện: <b>{review.proposedStudentCodes.join(', ') || 'Chưa xác định'}</b></p>
      )}
      {review.proposedCriterionCode && <p>Đề nghị tiêu chí: <b>{review.proposedCriterionCode}</b></p>}
      {(review.proposedStartSeconds !== undefined || review.proposedEndSeconds !== undefined) && (
        <p>
          Mốc đề nghị: {review.proposedStartSeconds !== undefined ? formatTime(review.proposedStartSeconds) : '—'}
          –{review.proposedEndSeconds !== undefined ? formatTime(review.proposedEndSeconds) : '—'}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {review.reviewerCode}
        {Number.isFinite(date.getTime()) && <> · <time dateTime={review.updatedAt}>{date.toLocaleString('vi-VN')}</time></>}
      </p>
    </div>
  );
}

function FixEditor({ ev, app }: { ev: EvidenceItem; app: AiLensController }) {
  return (
    <div className="mt-4 space-y-4 rounded-xl bg-muted p-4" role="region" aria-labelledby={`self-fix-${ev.id}`}>
      <h4 id={`self-fix-${ev.id}`} className="font-semibold">
        Đề nghị sửa {ev.id} · {app.selectedSelfStudent}
      </h4>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Ai đã tham gia đoạn này?</legend>
        <div className="flex flex-wrap gap-2">
          {app.session.students.map(({ code }) => (
            <button
              key={code}
              type="button"
              aria-pressed={app.proposeStudents.includes(code)}
              onClick={() => app.setProposeStudents((previous) =>
                previous.includes(code) ? previous.filter((item) => item !== code) : [...previous, code]
              )}
              className={cn(
                'min-h-11 min-w-20 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                app.proposeStudents.includes(code) ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'
              )}
            >{code}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Có thể bỏ chọn tất cả nếu chưa xác định được người thực hiện.</p>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Thuộc tiêu chí nào?</legend>
        <div className="flex flex-wrap gap-2">
          {RUBRIC_INDICATORS.map((indicator) => (
            <button
              key={indicator.criterionCode}
              type="button"
              title={indicator.indicatorTitle}
              aria-pressed={app.proposeCriterion === indicator.criterionCode}
              onClick={() => app.setProposeCriterion(indicator.criterionCode)}
              className={cn(
                'min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                app.proposeCriterion === indicator.criterionCode ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'
              )}
            >
              {indicator.criterionCode} · {indicator.checklistTitle}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`self-note-${ev.id}`} className="mb-2 block text-sm font-medium">
          Vì sao cần sửa? / Mô tả bổ sung (không bắt buộc)
        </label>
        <textarea
          id={`self-note-${ev.id}`}
          value={app.proposeNote}
          onChange={(event) => app.setProposeNote(event.target.value)}
          rows={3}
          placeholder="Ví dụ: Em cũng giữ thước nhưng bị bạn che…"
          className="w-full rounded-xl border border-input bg-card p-3 text-[15px] outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Đề nghị được lưu để giáo viên xem xét, chưa thay đổi thông tin minh chứng.
        Nếu để trống lý do, hệ thống dùng ghi chú mặc định.
      </p>
      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" size="lg" onClick={() => app.handleSaveProposeEdit(ev)}>Gửi đề nghị</Btn>
        <Btn variant="ghost" size="lg" onClick={() => app.setEditingSelfEvId(null)}>Hủy</Btn>
        <Btn variant="ghost" size="lg" onClick={() => {
          app.setActiveStep(2);
          app.playEvidenceClip(ev);
        }}>
          <PlayCircle className="size-4 shrink-0" aria-hidden="true" />Xem lại clip
        </Btn>
      </div>
    </div>
  );
}
