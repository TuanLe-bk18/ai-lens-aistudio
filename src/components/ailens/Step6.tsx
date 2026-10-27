import { useEffect, useRef } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ClipboardCheck,
  History,
  PlayCircle,
  Printer,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { RUBRIC_INDICATORS } from '../../data/rubricData';
import {
  buildStudentLearningRecommendation,
  evaluateDecisionValidity,
  getAcceptedPersonalEvidences,
  type DecisionValidityResult,
} from '../../domain/validation';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import type { AssistanceContext, EvidenceItem } from '../../types';
import { Btn, Card, Code, LevelChip, Notice, Segmented, Status, cn } from './kit';
import { StepNav } from './Shell';

const CONTEXT_LABELS: Record<AssistanceContext, string> = {
  independent: 'Tự thực hiện',
  guided: 'Có hướng dẫn',
  unknown: 'Chưa xác định',
};

export function Step6({ app }: { app: AiLensController }) {
  const reportRef = useRef<HTMLDivElement>(null);
  const { session, metrics } = app;
  const student = session.students.find((item) => item.code === app.portfolioStudent) ?? session.students[0];

  useEffect(() => {
    let expandedForPrint: HTMLDetailsElement[] = [];
    const preparePrint = () => {
      if (expandedForPrint.length) return;
      // Print the complete selected report, including normally collapsed rationale and transcripts.
      expandedForPrint = Array.from(reportRef.current?.querySelectorAll<HTMLDetailsElement>('details:not([open])') ?? []);
      expandedForPrint.forEach((details) => { details.open = true; });
    };
    const restoreDisclosures = () => {
      expandedForPrint.forEach((details) => { details.open = false; });
      expandedForPrint = [];
    };
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', restoreDisclosures);
    return () => {
      window.removeEventListener('beforeprint', preparePrint);
      window.removeEventListener('afterprint', restoreDisclosures);
      restoreDisclosures();
    };
  }, [student?.code]);

  if (!student) return <Notice>Phiên chưa có học sinh để lập hồ sơ năng lực.</Notice>;

  const rows = (app.rubricIndicators || RUBRIC_INDICATORS).map((indicator) => ({
    indicator,
    validity: evaluateDecisionValidity(session, student.code, indicator.indicatorCode),
    accepted: getAcceptedPersonalEvidences(session.evidences, student.code, indicator.indicatorCode),
  }));
  const acceptedIds = new Set(rows.flatMap((row) => row.accepted.map((evidence) => evidence.id)));
  const acceptedEvidence = session.evidences.filter((evidence) => acceptedIds.has(evidence.id));
  const recommendation = buildStudentLearningRecommendation(session, student.code);
  const staleCount = rows.filter((row) => row.validity.status === 'stale_needs_review').length;
  const stats = [
    {
      icon: Users,
      label: 'HS có minh chứng cá nhân hợp lệ',
      value: `${metrics.studentsWithAcceptedEvidence}/${metrics.totalStudents}`,
      hint: 'Chỉ tính minh chứng đã duyệt, không còn phản hồi chờ xử lý.',
    },
    {
      icon: ShieldCheck,
      label: 'Minh chứng đồng thuận / tổng thẻ',
      value: `${metrics.agreedCount}/${metrics.totalEvidences}`,
      hint: `${metrics.acceptedCount} thẻ được GV duyệt · ${metrics.pendingTeacherCount} ca chờ GV.`,
    },
    {
      icon: ClipboardCheck,
      label: 'Ô năng lực có kết luận hợp lệ',
      value: `${metrics.concludedLevelCells}/${metrics.totalCells}`,
      hint: `${metrics.insufficientCells} ô chưa có mức hợp lệ, gồm ${metrics.staleCells} ô cần duyệt lại.`,
    },
    {
      icon: History,
      label: 'Phiên bản hồ sơ · lịch sử',
      value: `v${session.sessionRevision}`,
      hint: `${session.auditLog.length} bản ghi kiểm toán trong phiên.`,
    },
  ];

  return (
    <div className="ailens-portfolio space-y-6">
      <style>{`
        @media print {
          body:has(.ailens-portfolio) header,
          body:has(.ailens-portfolio) nav,
          .ailens-portfolio .no-print { display: none !important; }
          .ailens-portfolio { color: black; }
          .ailens-portfolio-report { width: 100%; font-size: 10pt; }
          .ailens-portfolio-report .portfolio-columns { display: block !important; }
          .ailens-portfolio-report .portfolio-columns > section + section { margin-top: 1.25rem; }
          .ailens-portfolio-report .portfolio-indicator,
          .ailens-portfolio-report .portfolio-recommendation { break-inside: avoid; }
          .ailens-portfolio-report details::details-content { content-visibility: visible !important; }
          .ailens-portfolio-report details > :not(summary) { display: block !important; }
          .ailens-portfolio-report summary { list-style: none; }
          .ailens-portfolio-report .disclosure-chevron { display: none; }
          .ailens-portfolio-report .shadow-soft { box-shadow: none; }
        }
      `}</style>
      <div className="no-print grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Số liệu toàn phiên">
        {stats.map(({ icon: Icon, label, value, hint }) => (
          <Card key={label} className="p-4">
            <Icon className="size-5 text-muted-foreground" />
            <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={session.students.map((item) => item.code)}
          value={student.code}
          onChange={app.setPortfolioStudent}
        />
        <Btn onClick={() => window.print()}><Printer className="size-4" />In hồ sơ {student.code}</Btn>
      </div>

      <div ref={reportRef} key={student.code} className="ailens-portfolio-report space-y-6">
        <div>
          <h1 className="text-lg font-bold">Hồ sơ năng lực khoa học tự nhiên cá nhân</h1>
          <p className="mt-1 text-sm text-muted-foreground">{session.gradeSubject} · {session.lessonTitle}</p>
          <p className="text-sm text-muted-foreground">{session.activityTitle}</p>
        </div>
        <Card className="space-y-3 p-5 print:shadow-none">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-2xl font-bold">{student.code}</h2>
            <p className="text-muted-foreground">{student.seatLabel}</p>
          </div>
          <p className="text-sm"><b>Vai trò thực nghiệm ghi nhận:</b> {student.mainObservedRole}</p>
          <p className="text-sm text-muted-foreground"><b>Đặc điểm vị trí:</b> {student.visualPosition}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <p>Mã phiên: {session.sessionId} · v{session.sessionRevision}</p>
            <p>Rubric: {session.rubricVersion}</p>
            <p>Chế độ: {session.mode === 'demo_verified' ? 'Dữ liệu demo đã kiểm chứng' : 'Phân tích AI trực tiếp'}</p>
          </div>
        </Card>

        {staleCount > 0 && (
          <div role="status" className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-foreground">
            <strong>{staleCount} chỉ số cần giáo viên duyệt lại.</strong> Các mức cũ không được tính là kết luận hợp lệ trong hồ sơ này.
            <Btn variant="ghost" size="sm" className="no-print ml-2" onClick={() => app.setActiveStep(5)}>Về Bước 5 <ArrowRight className="size-4" /></Btn>
          </div>
        )}

        <div className="portfolio-columns grid items-start gap-6 lg:grid-cols-2">
          <section aria-labelledby="portfolio-competency-title">
            <h2 id="portfolio-competency-title" className="mb-3 font-semibold">Tổng quan năng lực</h2>
            <Card className="divide-y divide-border">
              {rows.map(({ indicator, validity, accepted }) => (
                <details key={indicator.indicatorCode} className="portfolio-indicator" open={validity.status === 'stale_needs_review'}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                    <Code>{indicator.criterionCode}</Code>
                    <span className="min-w-0 flex-1 text-sm font-medium">{indicator.checklistTitle}</span>
                    <Conclusion validity={validity} evidenceCount={accepted.length} />
                    <ChevronDown className="disclosure-chevron size-4 shrink-0 text-muted-foreground" />
                  </summary>
                  <div className="space-y-3 break-words px-4 pb-4 text-sm">
                    {validity.status === 'stale_needs_review' ? (
                      <div className="rounded-xl bg-warning-soft p-3 text-warning-foreground">
                        <p>{validity.staleReason}</p>
                        {validity.decision && <p className="mt-1">Mức trước đó: {validity.decision.level} (đã hết hiệu lực).</p>}
                      </div>
                    ) : !validity.decision ? (
                      <p className="text-muted-foreground">{accepted.length > 0 ? 'Có minh chứng được duyệt nhưng giáo viên chưa chốt mức năng lực.' : 'Chưa có kết luận hoặc đủ minh chứng cá nhân. Chưa quan sát thấy không đồng nghĩa với chưa đạt.'}</p>
                    ) : validity.status === 'insufficient_evidence' ? (
                      <p className="text-muted-foreground">Giáo viên ghi nhận chưa đủ minh chứng; đây không phải kết luận học sinh chưa đạt năng lực.</p>
                    ) : null}
                    {validity.decision && (
                      <>
                        <div>
                          <h3 className="font-medium">{validity.status === 'stale_needs_review' ? 'Nhận định lần chốt trước (hết hiệu lực)' : 'Nhận định chuyên môn đã lưu'}</h3>
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{validity.decision.rationale}</p>
                        </div>
                        <p><b>Bối cảnh đã lưu:</b> {CONTEXT_LABELS[validity.decision.assistanceContext]}</p>
                        <p className="text-xs text-muted-foreground">Chốt lúc: {new Date(validity.decision.decidedAt).toLocaleString('vi-VN')}</p>
                        <div>
                          <h3 className="font-medium">Tham chiếu tại lần chốt</h3>
                          {validity.decision.acceptedEvidenceRefs.length ? (
                            <ul className="mt-1 space-y-1">
                              {validity.decision.acceptedEvidenceRefs.map((ref) => {
                                const evidence = session.evidences.find((item) => item.id === ref.id);
                                return (
                                  <li key={`${ref.id}-${ref.revision}`}>
                                    {evidence ? (
                                      <>
                                        <button type="button" className="text-left text-primary underline-offset-2 hover:underline print:text-foreground" onClick={() => { app.setActiveStep(2); app.playEvidenceClip(evidence); }}>
                                          {ref.id} v{ref.revision} · {evidence.sourceId}
                                        </button>
                                        {evidence.revision !== ref.revision && <span className="ml-1 text-warning-foreground">(nguồn hiện tại v{evidence.revision}, không phải bản tham chiếu cũ)</span>}
                                      </>
                                    ) : (
                                      <span className="text-warning-foreground">{ref.id} v{ref.revision} — không còn trong phiên</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : <p className="mt-1 text-muted-foreground">Không có tham chiếu minh chứng trong quyết định.</p>}
                        </div>
                      </>
                    )}
                    <p className="text-muted-foreground">Minh chứng cá nhân hợp lệ hiện tại: {accepted.map((evidence) => `${evidence.id} v${evidence.revision}`).join(', ') || 'Chưa có'}</p>
                  </div>
                </details>
              ))}
            </Card>
          </section>

          <section aria-labelledby="portfolio-evidence-title">
            <h2 id="portfolio-evidence-title" className="mb-3 font-semibold">Minh chứng cá nhân đã xác thực ({acceptedEvidence.length})</h2>
            <Card className="divide-y divide-border p-2">
              {acceptedEvidence.length === 0 && <p className="p-4 text-sm text-muted-foreground">Chưa có minh chứng cá nhân được GV duyệt và không còn phản hồi chờ xử lý.</p>}
              {acceptedEvidence.map((evidence) => <PortfolioEvidence key={evidence.id} app={app} evidence={evidence} />)}
            </Card>
          </section>
        </div>

        <div className="grid gap-3 md:grid-cols-3 print:grid-cols-1">
          {[
            { title: 'Điểm mạnh', icon: Star, items: recommendation.strengths, className: 'bg-success-soft', titleClassName: 'text-success', empty: 'Chưa có kết luận năng lực hợp lệ hoặc đang chờ giáo viên duyệt lại.' },
            { title: 'Cần phát triển / bổ sung minh chứng', icon: AlertCircle, items: recommendation.areasToDevelop, className: 'bg-warning-soft', titleClassName: 'text-warning-foreground', empty: 'Không có nội dung cần bổ sung trong khuyến nghị hiện tại.' },
            { title: 'Nhiệm vụ tiếp theo', icon: ArrowRight, items: recommendation.nextTasks, className: 'bg-primary-soft', titleClassName: 'text-accent-foreground', empty: 'Không có nhiệm vụ bổ sung trong khuyến nghị hiện tại.' },
          ].map(({ title, icon: Icon, items, className, titleClassName, empty }) => (
            <section key={title} className={cn('portfolio-recommendation rounded-2xl p-5', className)}>
              <h2 className={cn('flex items-center gap-2 font-semibold', titleClassName)}><Icon className="size-4 shrink-0" />{title}</h2>
              {items.length ? (
                <ul className="mt-2 list-disc space-y-2 pl-4 text-sm">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
              ) : <p className="mt-2 text-sm">{empty}</p>}
            </section>
          ))}
        </div>
      </div>

      <Card className="no-print">
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
            <History className="size-4 shrink-0 text-muted-foreground" />Lịch sử thay đổi toàn phiên
            <span className="font-normal text-muted-foreground">({session.auditLog.length})</span>
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </summary>
          {session.auditLog.length ? (
            <ol className="max-h-96 divide-y divide-border overflow-y-auto px-5 pb-5 text-sm">
              {session.auditLog.map((log) => (
                <li key={log.id} className="space-y-1 break-words py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <time dateTime={log.timestamp} className="text-xs tabular-nums text-muted-foreground">{new Date(log.timestamp).toLocaleString('vi-VN')}</time>
                    <b>{log.actor}</b>
                    <span className="text-xs text-muted-foreground">{log.id}</span>
                  </div>
                  <p className="font-medium">{log.action}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{log.detail}</p>
                </li>
              ))}
            </ol>
          ) : <p className="px-5 pb-5 text-sm text-muted-foreground">Chưa có bản ghi kiểm toán.</p>}
        </details>
      </Card>
      <div className="no-print"><StepNav app={app} /></div>
    </div>
  );
}

function Conclusion({ validity, evidenceCount }: { validity: DecisionValidityResult; evidenceCount: number }) {
  if (validity.status === 'stale_needs_review') return <Status tone="review">Cần duyệt lại</Status>;
  if (validity.status === 'valid') return <LevelChip level={validity.effectiveLevel} />;
  if (!validity.decision && evidenceCount > 0) return <Status tone="info">Chờ chốt</Status>;
  return <LevelChip level="insufficient_evidence" />;
}

function PortfolioEvidence({ app, evidence }: { app: AiLensController; evidence: EvidenceItem }) {
  const source = app.session.sources.find((item) => item.id === evidence.sourceId);
  return (
    <details>
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl p-3 text-left hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <PlayCircle className="mt-0.5 size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            <b>{evidence.id}</b>{' '}
            <span className="text-muted-foreground">· v{evidence.revision} · {evidence.criterionCode} · {evidence.sourceId} {formatTime(evidence.startSeconds)}–{formatTime(evidence.endSeconds)}</span>
          </span>
          <span className="line-clamp-2 text-sm print:line-clamp-none">{evidence.observableBehavior}</span>
          <span className="no-print mt-1 block text-xs text-primary">Xem đầy đủ minh chứng và lời thoại</span>
        </span>
        <ChevronDown className="disclosure-chevron mt-1 size-4 shrink-0 text-muted-foreground" />
      </summary>
      <div className="space-y-3 break-words px-3 pb-4 text-sm">
        <Btn size="sm" className="no-print" onClick={() => { app.setActiveStep(2); app.playEvidenceClip(evidence); }}>
          <PlayCircle className="size-4" />Mở nguồn ở Bước 2
        </Btn>
        <p className="whitespace-pre-wrap">{evidence.observableBehavior}</p>
        <p className="text-xs text-muted-foreground">Chỉ số {evidence.indicatorCode} · HS: {evidence.studentCodes.join(', ')} · {evidence.teacherStatus === 'modified_accepted' ? 'GV duyệt theo điều chỉnh' : 'GV đã duyệt'}</p>
        {evidence.spokenTranscript && <blockquote className="whitespace-pre-wrap rounded-xl bg-ai-soft p-3"><b>Lời thoại minh chứng:</b> “{evidence.spokenTranscript}”</blockquote>}
        {evidence.teacherNote && <p><b>Ghi nhận GV:</b> {evidence.teacherNote}</p>}
        {evidence.limitations && <p><b>Giới hạn:</b> {evidence.limitations}</p>}
        {evidence.agenticNote && <p><b>Ghi chú phân tích:</b> {evidence.agenticNote}</p>}
        {source && <p className="text-xs text-muted-foreground">Nguồn: {source.title} · {source.filename} · Thời lượng {formatTime(source.durationSeconds)}</p>}
        {source?.mediaMissing && <p className="rounded-xl bg-warning-soft p-3 text-warning-foreground">Tệp nguồn không còn trên thiết bị. Cần tải lại nguồn tại Bước 2 để xem; nội dung minh chứng đã lưu vẫn được hiển thị đầy đủ.</p>}
        {source?.transcriptSegments?.length ? (
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer font-medium">Transcript nguồn đầy đủ ({source.transcriptSegments.length} đoạn)</summary>
            <ol className="mt-3 space-y-3">
              {source.transcriptSegments.map((segment) => (
                <li key={segment.id}>
                  <p className="text-xs font-medium text-muted-foreground">{segment.speakerCode} · {formatTime(segment.startSeconds)}–{formatTime(segment.endSeconds)}</p>
                  <p className="whitespace-pre-wrap">{segment.text}</p>
                  {segment.acousticNote && <p className="text-xs text-muted-foreground">Lưu ý âm thanh: {segment.acousticNote}</p>}
                  {!!segment.linkedCriteria?.length && <p className="text-xs text-muted-foreground">Tiêu chí liên quan: {segment.linkedCriteria.join(', ')}</p>}
                </li>
              ))}
            </ol>
          </details>
        ) : !evidence.spokenTranscript ? <p className="text-muted-foreground">Nguồn này chưa có transcript được lưu.</p> : null}
      </div>
    </details>
  );
}
