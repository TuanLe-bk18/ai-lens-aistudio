import { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronRight,
  PlayCircle,
  Plus,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import { RUBRIC_INDICATORS } from '../../data/rubricData';
import {
  canConcludeCompetencyLevel,
  evaluateDecisionValidity,
  getAcceptedPersonalEvidences,
  getPeerReviews,
  getSelfReviews,
  needsTeacherAttention,
  type DecisionValidityResult,
} from '../../domain/validation';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import type {
  AssistanceContext,
  CompetencyLevel,
  EvidenceItem,
  IndicatorCode,
  RubricIndicator,
  StudentCode,
} from '../../types';
import { Btn, Card, Code, LevelChip, Notice, Segmented, Status, StudentDot, cn } from './kit';
import { StepNav } from './Shell';

const CONTEXT_LABELS: Record<AssistanceContext, string> = {
  independent: 'Tự thực hiện',
  guided: 'Có hướng dẫn',
  unknown: 'Chưa xác định',
};

export function Step5({ app }: { app: AiLensController }) {
  const [tab, setTab] = useState<'queue' | 'decide'>('queue');

  return (
    <div className="space-y-5">
      <Notice>AI đề xuất minh chứng; giáo viên quyết định mức năng lực.</Notice>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div className="flex" role="tablist" aria-label="Giáo viên xử lý và chốt mức" onKeyDown={(event) => {
                  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
                  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                    : event.key === 'ArrowRight' ? (index + 1) % tabs.length
                    : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
                  if (next === null) return;
                  event.preventDefault();
                  setTab(next === 0 ? 'queue' : 'decide');
                  tabs[next]?.focus();
                }}>
          {([
            ['queue', `Cần xử lý (${app.metrics.pendingTeacherCount})`],
            ['decide', 'Chốt năng lực'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              id={`teacher-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              aria-controls={`teacher-panel-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Btn
          size="sm"
          className="mb-2"
          onClick={() => {
            app.setNewEvError(null);
            app.setShowAddModal(true);
          }}
        >
          <Plus className="size-4" />Bổ sung minh chứng
        </Btn>
      </div>

      {app.decisionAlert && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
          <p className="min-w-0 flex-1"><strong>Kiểm tra điều kiện chốt mức:</strong> {app.decisionAlert}</p>
          <Btn variant="ghost" size="sm" aria-label="Đóng thông báo chốt mức" onClick={() => app.setDecisionAlert(null)}>
            <X className="size-4" />
          </Btn>
        </div>
      )}

      <div id={`teacher-panel-${tab}`} role="tabpanel" aria-labelledby={`teacher-tab-${tab}`}>
        {tab === 'queue' ? (
          <Queue app={app} onDone={() => setTab('decide')} />
        ) : (
          <Decide app={app} onReviewQueue={() => setTab('queue')} />
        )}
      </div>
      <StepNav app={app} nextLabel="Xem hồ sơ năng lực" />
    </div>
  );
}

function Queue({ app, onDone }: { app: AiLensController; onDone: () => void }) {
  const evidences = app.session.evidences.filter((evidence) =>
    app.teacherFilter === 'all' || needsTeacherAttention(evidence),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base">
          <b>{app.metrics.pendingTeacherCount} ca cần GV xử lý</b>{' '}
          <span className="text-muted-foreground">· {app.metrics.agreedCount} thẻ đồng thuận</span>
        </p>
        <Segmented
          options={['priority', 'all']}
          value={app.teacherFilter}
          onChange={app.setTeacherFilter}
          render={(value) => value === 'priority'
            ? `Cần xử lý (${app.metrics.pendingTeacherCount})`
            : `Tất cả (${app.session.evidences.length})`}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Bao gồm mọi thẻ chờ giáo viên duyệt, đề nghị sửa và phản hồi chưa được giải quyết — không chỉ các ca mâu thuẫn.
      </p>
      {app.metrics.pendingTeacherCount === 0 && (
        <Card className="flex flex-col items-center gap-3 border-success/30 bg-success-soft p-8 text-center">
          <p className="font-semibold">Đã xử lý hết các ca đang chờ giáo viên.</p>
          <Btn variant="primary" onClick={onDone}>Sang chốt năng lực <ChevronRight className="size-4" /></Btn>
        </Card>
      )}
      {evidences.length === 0 && app.teacherFilter === 'all' && (
        <Card className="p-6 text-sm text-muted-foreground">Phiên chưa có minh chứng. Giáo viên có thể bổ sung bằng nút phía trên.</Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {evidences.map((evidence) => <QueueCard key={evidence.id} app={app} evidence={evidence} />)}
      </div>
    </div>
  );
}

function QueueCard({ app, evidence }: { app: AiLensController; evidence: EvidenceItem }) {
  const selfReviews = getSelfReviews(evidence);
  const peerReviews = getPeerReviews(evidence);
  const proposals = selfReviews.filter((review) => review.status === 'propose_edit' && !review.resolvedByTeacher);
  const activeProposal = proposals[0];
  const pending = needsTeacherAttention(evidence);

  const openSource = () => {
    app.setActiveStep(2);
    app.playEvidenceClip(evidence);
  };

  return (
    <Card className={cn('flex flex-col p-5', pending && 'border-warning/40')}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b>{evidence.id}</b>
        <span className="text-xs text-muted-foreground">v{evidence.revision}</span>
        <Code>{evidence.criterionCode} · {evidence.indicatorCode}</Code>
        <span className="text-muted-foreground">{evidence.sourceId} · {formatTime(evidence.startSeconds)}–{formatTime(evidence.endSeconds)}</span>
        <Btn size="sm" variant="ghost" className="ml-auto" onClick={openSource}>
          <PlayCircle className="size-4" />Mở nguồn
        </Btn>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Status tone={pending ? 'warning' : evidence.teacherStatus === 'rejected' ? 'danger' : 'success'}>
          {pending ? 'Cần GV xử lý' : evidence.teacherStatus === 'modified_accepted' ? 'Đã duyệt điều chỉnh' : evidence.teacherStatus === 'accepted' ? 'Đã duyệt' : 'Đã bác bỏ'}
        </Status>
        <span className="text-xs text-muted-foreground">
          {evidence.subjectScope === 'individual' ? 'Minh chứng cá nhân' : evidence.subjectScope === 'group' ? 'Minh chứng nhóm' : 'Chưa rõ chủ thể'}
          {' · '}{evidence.clarity === 'clear' ? 'Rõ ràng' : evidence.clarity === 'partial' ? 'Rõ một phần' : 'Chưa rõ'}
        </span>
      </div>
      <dl className="mt-4 flex-1 space-y-3 break-words text-sm">
        <ReviewRow
          icon={<Sparkles className="size-4 shrink-0 text-ai" />}
          label={evidence.origin === 'ai' ? 'AI đề xuất' : evidence.origin === 'teacher_added' ? 'GV bổ sung' : 'HS bổ sung'}
        >
          <p className="whitespace-pre-wrap">{evidence.observableBehavior}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {evidence.studentCodes.length ? evidence.studentCodes.map((code) => <StudentDot key={code} code={code} />) : <span className="text-muted-foreground">Chưa xác định học sinh</span>}
          </div>
        </ReviewRow>
        {selfReviews.length === 0 && <ReviewRow icon={<User className="size-4 shrink-0" />} label="Tự kiểm chứng"><span className="text-muted-foreground">Chưa có phản hồi.</span></ReviewRow>}
        {selfReviews.map((review, index) => (
          <ReviewRow key={`${review.reviewerCode}-${index}`} icon={<User className="size-4 shrink-0" />} label={`${review.reviewerCode} (tự)`}>
            <p className="font-medium">
              {review.status === 'confirmed' ? 'Xác nhận' : review.status === 'propose_edit' ? 'Đề nghị điều chỉnh' : 'Chưa rõ'}
              {review.resolvedByTeacher && <span className="font-normal text-muted-foreground"> · Đã được GV xử lý</span>}
            </p>
            <p className="whitespace-pre-wrap text-muted-foreground">{review.note}</p>
            {review.proposedStudentCodes && <p>Danh sách HS đề nghị: {review.proposedStudentCodes.join(', ') || 'Chưa xác định'}</p>}
            {review.proposedCriterionCode && <p>Tiêu chí đề nghị: {review.proposedCriterionCode}</p>}
            {(review.proposedStartSeconds !== undefined || review.proposedEndSeconds !== undefined) && (
              <p className="text-muted-foreground">Mốc đề nghị: {formatTime(review.proposedStartSeconds ?? evidence.startSeconds)}–{formatTime(review.proposedEndSeconds ?? evidence.endSeconds)}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{new Date(review.updatedAt).toLocaleString('vi-VN')}</p>
          </ReviewRow>
        ))}
        {peerReviews.length === 0 && <ReviewRow icon={<Users className="size-4 shrink-0" />} label="Kiểm chứng chéo"><span className="text-muted-foreground">Chưa có phản hồi.</span></ReviewRow>}
        {peerReviews.map((review, index) => (
          <ReviewRow key={`${review.reviewerCode}-${review.targetStudentCode ?? 'card'}-${index}`} icon={<Users className="size-4 shrink-0" />} label={`${review.reviewerCode} (chéo)`}>
            <p className="font-medium">
              {review.status === 'agreed' ? 'Đồng ý' : review.status === 'disputed' ? 'Không đồng ý / cần GV xem lại' : 'Chưa rõ'}
              {review.targetStudentCode && ` · Đối chiếu ${review.targetStudentCode}`}
              {review.resolvedByTeacher && <span className="font-normal text-muted-foreground"> · Đã được GV xử lý</span>}
            </p>
            <p className="whitespace-pre-wrap text-muted-foreground">{review.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">{new Date(review.updatedAt).toLocaleString('vi-VN')}</p>
          </ReviewRow>
        ))}
      </dl>
      {(evidence.spokenTranscript || evidence.limitations || evidence.agenticNote) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-primary">Lời thoại và lưu ý minh chứng</summary>
          <div className="mt-2 space-y-2 whitespace-pre-wrap rounded-xl bg-muted p-3">
            {evidence.spokenTranscript && <p><b>Lời thoại:</b> “{evidence.spokenTranscript}”</p>}
            {evidence.limitations && <p><b>Giới hạn:</b> {evidence.limitations}</p>}
            {evidence.agenticNote && <p><b>Ghi chú phân tích:</b> {evidence.agenticNote}</p>}
          </div>
        </details>
      )}
      {evidence.teacherNote && <p className="mt-3 text-sm text-muted-foreground"><b>Ghi nhận GV:</b> {evidence.teacherNote}</p>}
      {activeProposal && (proposals.length > 1 || activeProposal.proposedStartSeconds !== undefined || activeProposal.proposedEndSeconds !== undefined) && (
        <p className="mt-3 rounded-xl bg-warning-soft p-3 text-xs text-warning-foreground">
          Duyệt điều chỉnh áp dụng danh sách HS và tiêu chí từ đề nghị của {activeProposal.reviewerCode}; không gộp các đề nghị khác hoặc cập nhật mốc thời gian.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        {activeProposal && (
          <Btn variant="primary" className="h-auto min-h-10 py-2" onClick={() => app.handleTeacherResolveEvidence(evidence, 'accept_student_edit')}>
            Chấp nhận điều chỉnh ({activeProposal.reviewerCode})
          </Btn>
        )}
        <Btn variant="outline" onClick={() => app.handleTeacherResolveEvidence(evidence, 'accept_ai')}>Duyệt nguyên trạng</Btn>
        <Btn variant="ghost" className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => app.handleTeacherResolveEvidence(evidence, 'reject')}>Bác bỏ</Btn>
      </div>
    </Card>
  );
}

function ReviewRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-2">
      <dt className="flex items-start gap-1.5 font-medium text-muted-foreground">{icon}{label}</dt>
      <dd className="min-w-0 leading-relaxed">{children}</dd>
    </div>
  );
}

function DecisionStatus({ validity, evidenceCount }: { validity: DecisionValidityResult; evidenceCount: number }) {
  if (validity.status === 'stale_needs_review') return <Status tone="review">Cần duyệt lại</Status>;
  if (validity.status === 'valid') return <Status tone="success">Đã chốt</Status>;
  if (!validity.decision && evidenceCount > 0) return <Status tone="info">Chờ chốt</Status>;
  return <Status tone="neutral">Chưa đủ minh chứng</Status>;
}

function Decide({ app, onReviewQueue }: { app: AiLensController; onReviewQueue: () => void }) {
  const activeIndicators = app.rubricIndicators || RUBRIC_INDICATORS;
  const [selectedStudent, setSelectedStudent] = useState<StudentCode>(app.portfolioStudent);
  const [openIndicator, setOpenIndicator] = useState<IndicatorCode | null>(null);
  const student = app.session.students.find((item) => item.code === selectedStudent) ?? app.session.students[0];
  const indicator = activeIndicators.find((item) => item.indicatorCode === openIndicator);

  if (!student) return <Notice>Phiên chưa có học sinh để chốt năng lực.</Notice>;

  return (
    <div className="space-y-4">
      <Segmented
        options={app.session.students.map((item) => item.code)}
        value={student.code}
        onChange={(value) => { setSelectedStudent(value); setOpenIndicator(null); }}
        render={(code) => (
          <span className="inline-flex items-center gap-1.5">
            {code}
            {activeIndicators.some((item) => evaluateDecisionValidity(app.session, code, item.indicatorCode).status === 'stale_needs_review') && (
              <span className="size-1.5 rounded-full bg-warning" role="img" aria-label="Có chỉ số cần duyệt lại" />
            )}
          </span>
        )}
      />
      <p className="text-sm text-muted-foreground">{student.seatLabel} · Chọn một chỉ số để kiểm tra minh chứng và chốt mức.</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Card className="divide-y divide-border overflow-hidden">
          {activeIndicators.map((item) => {
            const accepted = getAcceptedPersonalEvidences(app.session.evidences, student.code, item.indicatorCode);
            const validity = evaluateDecisionValidity(app.session, student.code, item.indicatorCode);
            return (
              <button
                key={item.indicatorCode}
                type="button"
                onClick={() => setOpenIndicator(item.indicatorCode)}
                aria-pressed={openIndicator === item.indicatorCode}
                className={cn('flex w-full flex-wrap items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40', openIndicator === item.indicatorCode && 'bg-primary-soft/50')}
              >
                <Code>{item.criterionCode}</Code>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.checklistTitle}</p>
                  <p className="text-sm text-muted-foreground">{accepted.length} minh chứng cá nhân đã duyệt</p>
                  {validity.status === 'stale_needs_review' && <p className="mt-1 text-xs text-warning-foreground">{validity.staleReason}</p>}
                </div>
                {validity.status === 'valid' && <LevelChip level={validity.effectiveLevel} />}
                <DecisionStatus validity={validity} evidenceCount={accepted.length} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </Card>
        {indicator ? (
          <DecisionPanel
            key={`${student.code}-${indicator.indicatorCode}`}
            app={app}
            studentCode={student.code}
            indicator={indicator}
            onClose={() => setOpenIndicator(null)}
            onReviewQueue={onReviewQueue}
          />
        ) : (
          <Card className="hidden p-8 text-center text-sm text-muted-foreground lg:block">Chọn một chỉ số để xem minh chứng và chốt mức.</Card>
        )}
      </div>
    </div>
  );
}

function DecisionPanel({ app, studentCode, indicator, onClose, onReviewQueue }: {
  app: AiLensController;
  studentCode: StudentCode;
  indicator: RubricIndicator;
  onClose: () => void;
  onReviewQueue: () => void;
}) {
  const validity = evaluateDecisionValidity(app.session, studentCode, indicator.indicatorCode);
  const accepted = getAcceptedPersonalEvidences(app.session.evidences, studentCode, indicator.indicatorCode);
  const [level, setLevel] = useState<CompetencyLevel | undefined>(() =>
    validity.status === 'stale_needs_review' ? undefined : validity.decision?.level,
  );
  useEffect(() => {
    // A session import/reset replaces the saved decision, not just the panel's props.
    setLevel(validity.status === 'stale_needs_review' ? undefined : validity.decision?.level);
  }, [validity.decision, validity.status]);
  const context = app.getCellAssistanceContext(studentCode, indicator.indicatorCode);
  const decisionContext = level === 'insufficient_evidence' ? 'unknown' : context;
  const check = level ? canConcludeCompetencyLevel(app.session.evidences, studentCode, indicator.indicatorCode, level, decisionContext) : undefined;
  const levelAvailability = (target: CompetencyLevel) => canConcludeCompetencyLevel(app.session.evidences, studentCode, indicator.indicatorCode, target, context);
  const blockedReason = check && !check.allowed ? check.reason : !level ? levelAvailability('M1').reason : undefined;

  return (
    <Card className="space-y-4 self-start p-5 lg:sticky lg:top-32">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{studentCode} · {indicator.criterionCode} · {indicator.indicatorCode}</p>
          <h3 className="font-semibold">{indicator.checklistTitle}</h3>
        </div>
        <Btn variant="ghost" size="sm" aria-label="Đóng bảng chốt mức" onClick={onClose}><X className="size-4" /></Btn>
      </div>
      {validity.status === 'stale_needs_review' && (
        <div role="status" className="rounded-xl bg-warning-soft p-3 text-sm text-warning-foreground">
          <strong>Kết luận trước đã hết hiệu lực.</strong> {validity.staleReason}
        </div>
      )}
      <div>
        <h4 className="mb-1.5 text-sm font-medium">Minh chứng cá nhân đã duyệt ({accepted.length})</h4>
        {accepted.length === 0 ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Chưa có minh chứng cá nhân hợp lệ. “Chưa quan sát thấy” không đồng nghĩa với “chưa đạt”. Cần duyệt hoặc thu thập thêm minh chứng.</p>
        ) : (
          <ul className="space-y-1.5">
            {accepted.map((evidence) => (
              <li key={evidence.id}>
                <button
                  type="button"
                  onClick={() => { app.setActiveStep(2); app.playEvidenceClip(evidence); }}
                  className="flex w-full items-start gap-2 rounded-lg p-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <PlayCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <b>{evidence.id} · v{evidence.revision}</b>{' '}
                    <span className="text-muted-foreground">{evidence.sourceId} {formatTime(evidence.startSeconds)}–{formatTime(evidence.endSeconds)}</span>
                    <span className="mt-0.5 block break-words">{evidence.observableBehavior}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-1.5 text-sm font-medium">Bối cảnh thực hiện</h4>
        <Segmented<AssistanceContext>
          options={['independent', 'guided', 'unknown']}
          value={context}
          onChange={(value) => app.handleSetCellAssistanceContext(studentCode, indicator.indicatorCode, value)}
          render={(value) => CONTEXT_LABELS[value]}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">Không mặc định tự chủ. M2–M3 yêu cầu tự thực hiện; có hướng dẫn chỉ có thể chốt M1.</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Mức năng lực dự kiến</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['M1', 'M2', 'M3'] as const).map((target) => {
            const availability = levelAvailability(target);
            return (
              <button
                key={target}
                type="button"
                disabled={!availability.allowed}
                title={availability.reason}
                aria-pressed={level === target}
                onClick={() => setLevel(target)}
                className={cn('rounded-xl border p-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', level === target ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40')}
              >
                <span className="block text-sm font-bold">{target}</span>
                <span className="mt-0.5 block text-muted-foreground">{indicator.levels[target]}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={level === 'insufficient_evidence'}
          onClick={() => setLevel('insufficient_evidence')}
          className={cn('mt-2 w-full rounded-xl border p-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', level === 'insufficient_evidence' ? 'border-foreground bg-muted' : 'border-border hover:bg-muted')}
        >
          Chưa đủ minh chứng
        </button>
      </fieldset>
      {blockedReason && <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm text-warning-foreground">{blockedReason}</p>}
      {blockedReason && <Btn variant="ghost" size="sm" onClick={onReviewQueue}>Xem hàng đợi minh chứng <ChevronRight className="size-4" /></Btn>}
      <p className="text-xs text-muted-foreground">
        Nhận định được tự động tạo theo rubric khi chốt, không nhập lý do riêng.
        {level === 'insufficient_evidence' && ' “Chưa đủ minh chứng” có thể lưu với bối cảnh chưa xác định, không phải kết luận chưa đạt.'}
      </p>
      {validity.decision && (
        <details className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{validity.status === 'stale_needs_review' ? 'Nhận định lần chốt trước (hết hiệu lực)' : 'Nhận định đã lưu (chỉ đọc)'}</summary>
          <div className="mt-2 space-y-2 break-words text-muted-foreground">
            <p>{validity.decision.rationale}</p>
            <p>Bối cảnh đã lưu: {CONTEXT_LABELS[validity.decision.assistanceContext]}</p>
            <p>Căn cứ: {validity.decision.acceptedEvidenceRefs.map((ref) => `${ref.id} v${ref.revision}`).join(', ') || 'Không có tham chiếu minh chứng'}</p>
          </div>
        </details>
      )}
      <Btn
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!level || !check?.allowed}
        onClick={() => {
          if (!level) return;
          if (level === 'insufficient_evidence') app.handleSetCellAssistanceContext(studentCode, indicator.indicatorCode, 'unknown');
          app.handleSetTeacherDecision(studentCode, indicator.indicatorCode, level, decisionContext);
        }}
      >
        {validity.decision ? 'Chốt lại quyết định' : 'Chốt mức'}
      </Btn>
    </Card>
  );
}
