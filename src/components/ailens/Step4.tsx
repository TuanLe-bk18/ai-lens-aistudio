import { useState } from 'react';
import { Check, ChevronDown, Flag, Lock, MessageSquare, PlayCircle, Sparkles, Users } from 'lucide-react';
import { canPeerReviewerVerify, getPeerReviews, getSelfReviews } from '../../domain/validation';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import type { EvidenceItem, PeerReviewRecord, SelfReviewRecord, StudentCode } from '../../types';
import { Btn, Card, Code, Notice, Segmented, Status, StudentDot, cn } from './kit';
import { StepNav } from './Shell';

function candidateTargets(ev: EvidenceItem): StudentCode[] {
  return Array.from(new Set([
    ...ev.studentCodes,
    ...getSelfReviews(ev).map((review) => review.reviewerCode),
  ]));
}

export function Step4({ app }: { app: AiLensController }) {
  const [showLocked, setShowLocked] = useState(false);
  const reviewer = app.selectedPeerReviewer;
  // A shared card belongs in the main list if any target is eligible, even when
  // whole-card verification is blocked. Target selection never bypasses validation.
  const canReview = (ev: EvidenceItem) =>
    canPeerReviewerVerify(ev, reviewer).allowed ||
    candidateTargets(ev).some((target) => canPeerReviewerVerify(ev, reviewer, target).allowed);
  const eligible = app.session.evidences.filter(canReview);
  const locked = app.session.evidences.filter((ev) => !canReview(ev));
  const reviewedCount = eligible.filter((ev) =>
    getPeerReviews(ev).some((review) => review.reviewerCode === reviewer)
  ).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="text-center">
        <h2 id="peer-reviewer-label" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Ai đang kiểm chứng?
        </h2>
        <div className="mt-3" role="group" aria-labelledby="peer-reviewer-label">
          <Segmented
            options={app.session.students.map((student) => student.code)}
            value={reviewer}
            onChange={(student) => {
              app.setSelectedPeerReviewer(student);
              setShowLocked(false);
            }}
            size="lg"
          />
        </div>
        <p className="mt-3" aria-live="polite">
          Bạn có thể kiểm chứng <b>{eligible.length} minh chứng</b> cho bạn khác
          <span className="mt-1 block text-sm text-muted-foreground">Đã gửi ý kiến trên {reviewedCount}/{eligible.length} thẻ</span>
        </p>
      </div>

      <Notice>
        Không tự kiểm chứng cho chính mình. Với thẻ nhiều người, em vẫn có thể chọn rõ
        một bạn khác nếu quy tắc độc lập cho phép. Mỗi bạn đều có thể gửi ý kiến riêng.
      </Notice>

      <div className="space-y-4" aria-label={`Minh chứng ${reviewer} có thể kiểm chứng`}>
        {eligible.map((ev) => <PeerEvidenceCard key={ev.id} ev={ev} app={app} />)}
        {eligible.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            {app.session.evidences.length === 0
              ? 'Chưa có minh chứng. Hãy tìm hoặc bổ sung minh chứng ở bước trước.'
              : 'Hiện em chưa đủ điều kiện kiểm chứng các thẻ này. Xem lý do ở danh sách bên dưới hoặc chọn một bạn khác để kiểm chứng.'}
          </Card>
        )}
      </div>

      <section className="space-y-3" aria-label="Minh chứng chưa đủ điều kiện kiểm chứng">
        <Btn
          variant="outline"
          size="lg"
          className="h-auto min-h-12 w-full justify-between gap-3 py-3 text-left"
          aria-expanded={showLocked}
          aria-controls="locked-peer-evidence"
          onClick={() => setShowLocked((open) => !open)}
        >
          <span className="flex items-center gap-2">
            <Lock className="size-4 shrink-0" aria-hidden="true" />
            Minh chứng chưa thể kiểm chứng ({locked.length}) · Xem lý do
          </span>
          <ChevronDown className={cn('size-5 shrink-0 transition-transform', showLocked && 'rotate-180')} aria-hidden="true" />
        </Btn>
        {showLocked && (
          <div id="locked-peer-evidence" className="space-y-4">
            {locked.map((ev) => <PeerEvidenceCard key={ev.id} ev={ev} app={app} />)}
            {locked.length === 0 && (
              <Card className="p-5 text-center text-sm text-muted-foreground">
                Không có thẻ bị khóa hoàn toàn. Với từng thẻ, hãy chọn phạm vi kiểm chứng phù hợp.
              </Card>
            )}
          </div>
        )}
      </section>
      <StepNav app={app} nextLabel="Chuyển cho giáo viên" />
    </div>
  );
}

type Opinion =
  | { kind: 'self'; review: SelfReviewRecord }
  | { kind: 'peer'; review: PeerReviewRecord };

function PeerEvidenceCard({ ev, app }: { ev: EvidenceItem; app: AiLensController }) {
  const selfReviews = getSelfReviews(ev);
  const peerReviews = getPeerReviews(ev);
  const targets = candidateTargets(ev);
  const target = app.peerTargetMap[ev.id] || undefined;
  const check = canPeerReviewerVerify(ev, app.selectedPeerReviewer, target);
  const myReview = peerReviews.find((review) =>
    review.reviewerCode === app.selectedPeerReviewer && review.targetStudentCode === target
  );
  const opinions: Opinion[] = [
    ...selfReviews.map((review) => ({ kind: 'self' as const, review })),
    ...peerReviews.map((review) => ({ kind: 'peer' as const, review })),
  ];
  opinions.sort((a, b) => a.review.updatedAt.localeCompare(b.review.updatedAt));
  const targetLabel = target ? `riêng cho ${target}` : 'cho toàn thẻ';
  const source = app.session.sources.find((item) => item.id === ev.sourceId);

  return (
    <Card className="p-4 md:p-5" role="article" aria-labelledby={`peer-evidence-${ev.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <h3 id={`peer-evidence-${ev.id}`} className="font-semibold">{ev.id}</h3>
        <Code>{ev.criterionCode} · {ev.indicatorCode}</Code>
        <span className="text-muted-foreground">
          {ev.sourceId} · {formatTime(ev.startSeconds)}–{formatTime(ev.endSeconds)}
        </span>
        <div className="flex flex-wrap gap-1 sm:ml-auto" aria-label="Học sinh được gán trên minh chứng">
          {ev.studentCodes.map((student) => <StudentDot key={student} code={student} />)}
          {ev.studentCodes.length === 0 && <Status tone="neutral">Chưa rõ người thực hiện</Status>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {peerReviews.length > 0 && <Status tone="info">{peerReviews.length} ý kiến kiểm chứng chéo</Status>}
        <Btn
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label={`Xem lại đoạn video của minh chứng ${ev.id}`}
          onClick={() => {
            app.setActiveStep(2);
            app.playEvidenceClip(ev);
          }}
        >
          <PlayCircle className="size-4 shrink-0" aria-hidden="true" />Xem lại clip
        </Btn>
      </div>

      <ol className="mt-4 space-y-4 border-l-2 border-border pl-3 sm:pl-4" aria-label={`Quan sát và ý kiến theo thời gian của ${ev.id}`}>
        <li>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ai">
            {ev.origin === 'ai' ? <Sparkles className="size-3.5" aria-hidden="true" /> : <MessageSquare className="size-3.5" aria-hidden="true" />}
            {ev.origin === 'ai' ? 'AI quan sát' : ev.origin === 'student_added' ? 'Học sinh bổ sung' : 'Giáo viên bổ sung'}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-base leading-relaxed">{ev.observableBehavior}</p>
          {source && <p className="mt-1 text-xs text-muted-foreground">Nguồn: {source.title}</p>}
          {ev.spokenTranscript && (
            <blockquote className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-primary-soft p-3 text-sm leading-relaxed">
              <b>Lời thoại: </b>“{ev.spokenTranscript}”
            </blockquote>
          )}
          {ev.limitations && <p className="mt-2 text-sm text-muted-foreground">Giới hạn quan sát: {ev.limitations}</p>}
        </li>
        {selfReviews.length === 0 && (
          <li className="text-sm text-muted-foreground">Chưa có phản hồi tự kiểm chứng.</li>
        )}
        {opinions.map((opinion, index) => (
          <OpinionItem key={`${opinion.kind}-${opinion.review.reviewerCode}-${index}`} opinion={opinion} />
        ))}
        {peerReviews.length === 0 && (
          <li className="text-sm text-muted-foreground">Chưa có ý kiến kiểm chứng chéo.</li>
        )}
      </ol>

      <div className="mt-4 space-y-3 border-t border-border pt-4" aria-label={`Ý kiến kiểm chứng của ${app.selectedPeerReviewer} trên ${ev.id}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Ý kiến của bạn · {app.selectedPeerReviewer}
        </p>
        <div>
          <label htmlFor={`peer-target-${ev.id}`} className="mb-2 block text-sm font-medium">
            Em đang kiểm chứng cho ai?
          </label>
          <select
            id={`peer-target-${ev.id}`}
            value={target || ''}
            onChange={(event) => app.setPeerTargetMap((previous) => ({
              ...previous,
              [ev.id]: event.target.value as StudentCode | '',
            }))}
            aria-describedby={!check.allowed ? `peer-lock-${ev.id}` : undefined}
            className="min-h-12 w-full rounded-xl border border-input bg-card px-3 py-2 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="">Kiểm chứng toàn thẻ (nếu đủ điều kiện độc lập)</option>
            {target && !targets.includes(target) && (
              <option value={target} disabled>{target} — không còn là đối tượng trên thẻ</option>
            )}
            {targets.map((code) => {
              const targetCheck = canPeerReviewerVerify(ev, app.selectedPeerReviewer, code);
              return (
                <option key={code} value={code} title={targetCheck.reason}>
                  Kiểm chứng riêng cho {code}{!targetCheck.allowed ? ' — không đủ điều kiện' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {!check.allowed && (
          <div id={`peer-lock-${ev.id}`} className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm" role="status">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>{check.reason}</p>
          </div>
        )}
        {myReview && (
          <div className="space-y-1 rounded-xl border border-border bg-muted px-4 py-3 text-sm" aria-live="polite">
            <p className="font-medium">
              {myReview.status === 'agreed' ? 'Bạn đã đồng ý' : myReview.status === 'disputed' ? 'Bạn đã đề nghị giáo viên xem lại' : 'Bạn chưa xác định rõ'} {targetLabel}.
            </p>
            <p className="text-muted-foreground">Gửi lại để cập nhật ý kiến này; các ý kiến của bạn khác và các đối tượng khác vẫn được giữ.</p>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => app.setPeerNoteDraft((previous) => ({ ...previous, [ev.id]: myReview.note }))}
            >Dùng lại ghi chú đã lưu</Btn>
          </div>
        )}
        <div>
          <label htmlFor={`peer-note-${ev.id}`} className="mb-2 block text-sm font-medium">
            Ghi chú của {app.selectedPeerReviewer} {targetLabel} (không bắt buộc)
          </label>
          <textarea
            id={`peer-note-${ev.id}`}
            value={app.peerNoteDraft[ev.id] || ''}
            onChange={(event) => app.setPeerNoteDraft((previous) => ({ ...previous, [ev.id]: event.target.value }))}
            rows={2}
            placeholder="Em quan sát thấy gì? Điều gì cần giáo viên xem lại?"
            className="w-full rounded-xl border border-input bg-card p-3 text-[15px] outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn
            variant="success"
            size="lg"
            className="h-auto min-h-12 flex-1 py-3 sm:flex-none"
            disabled={!check.allowed}
            title={check.reason}
            aria-describedby={!check.allowed ? `peer-lock-${ev.id}` : undefined}
            aria-label={`${app.selectedPeerReviewer} xác nhận đồng ý ${targetLabel} trên minh chứng ${ev.id}`}
            onClick={() => app.handlePeerVerify(ev, 'agreed')}
          >
            <Check className="size-5 shrink-0" aria-hidden="true" />
            {myReview?.status === 'agreed' ? 'Xác nhận lại đồng ý' : 'Đồng ý'}
          </Btn>
          <Btn
            variant="warn"
            size="lg"
            className="h-auto min-h-12 flex-1 py-3 sm:flex-none"
            disabled={!check.allowed}
            title={check.reason}
            aria-describedby={!check.allowed ? `peer-lock-${ev.id}` : undefined}
            aria-label={`Đề nghị giáo viên xem lại ${targetLabel} trên minh chứng ${ev.id}`}
            onClick={() => app.handlePeerVerify(ev, 'disputed')}
          >
            <Flag className="size-5 shrink-0" aria-hidden="true" />Cần giáo viên xem lại
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function OpinionItem({ opinion }: { opinion: Opinion }) {
  const { review } = opinion;
  const positive = opinion.kind === 'self' ? opinion.review.status === 'confirmed' : opinion.review.status === 'agreed';
  const unclear = review.status === 'unclear';
  const date = new Date(review.updatedAt);
  return (
    <li className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {opinion.kind === 'self' ? <MessageSquare className="size-3.5" aria-hidden="true" /> : <Users className="size-3.5" aria-hidden="true" />}
          {opinion.kind === 'self' ? 'Tự kiểm chứng' : 'Kiểm chứng chéo'} · {review.reviewerCode}
          {opinion.kind === 'peer' && ` → ${opinion.review.targetStudentCode || 'Toàn thẻ'}`}
        </p>
        <Status tone={positive ? 'success' : unclear ? 'neutral' : 'warning'}>
          {unclear ? 'Chưa rõ' : opinion.kind === 'self' ? positive ? 'Đúng với em' : 'Đề nghị sửa' : positive ? 'Đồng ý' : 'Cần GV xem lại'}
        </Status>
        {review.resolvedByTeacher && <Status tone="neutral">Đã được GV xử lý</Status>}
      </div>
      {review.note && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{review.note}</p>}
      {opinion.kind === 'self' && (
        <div className="space-y-1 text-sm">
          {opinion.review.proposedStudentCodes !== undefined && (
            <p>Đề nghị người thực hiện: <b>{opinion.review.proposedStudentCodes.join(', ') || 'Chưa xác định'}</b></p>
          )}
          {opinion.review.proposedCriterionCode && <p>Đề nghị tiêu chí: <b>{opinion.review.proposedCriterionCode}</b></p>}
          {(opinion.review.proposedStartSeconds !== undefined || opinion.review.proposedEndSeconds !== undefined) && (
            <p>
              Mốc đề nghị: {opinion.review.proposedStartSeconds !== undefined ? formatTime(opinion.review.proposedStartSeconds) : '—'}
              –{opinion.review.proposedEndSeconds !== undefined ? formatTime(opinion.review.proposedEndSeconds) : '—'}
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {Number.isFinite(date.getTime()) && <time dateTime={review.updatedAt}>{date.toLocaleString('vi-VN')}</time>}
        {review.evidenceRevision !== undefined && <> · Phiên bản minh chứng {review.evidenceRevision}</>}
      </p>
    </li>
  );
}
