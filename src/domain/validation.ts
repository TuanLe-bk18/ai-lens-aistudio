import {
  CRITERION_TO_INDICATOR,
  RUBRIC_INDICATORS,
} from '../data/rubricData';
import {
  AgenticInspectionStep,
  AssistanceContext,
  CompetencyLevel,
  CriterionCode,
  EvidenceItem,
  IndicatorCode,
  PeerReviewRecord,
  SelfReviewRecord,
  SessionState,
  StudentCode,
  TeacherDecisionItem,
  TranscriptSegment,
  VideoProcessingMode,
  VideoSourceItem,
} from '../types';

export type DerivedReviewStatus =
  | 'agreed'
  | 'conflict_or_edit'
  | 'unclear'
  | 'unreviewed';

export interface DecisionValidityResult {
  status: 'valid' | 'stale_needs_review' | 'insufficient_evidence';
  effectiveLevel: CompetencyLevel;
  staleReason?: string;
  decision?: TeacherDecisionItem;
}

export function getSelfReviews(ev: EvidenceItem): SelfReviewRecord[] {
  if (Array.isArray(ev.selfReviews) && ev.selfReviews.length > 0) {
    return ev.selfReviews;
  }
  return ev.selfReview ? [ev.selfReview] : [];
}

export function getPeerReviews(ev: EvidenceItem): PeerReviewRecord[] {
  if (Array.isArray(ev.peerReviews) && ev.peerReviews.length > 0) {
    return ev.peerReviews;
  }
  return ev.peerReview ? [ev.peerReview] : [];
}

export function hasUnresolvedSelfEdit(ev: EvidenceItem): boolean {
  const reviews = getSelfReviews(ev);
  return reviews.some(
    (r) =>
      r.status === 'propose_edit' &&
      !r.resolvedByTeacher &&
      (ev.resolvedAtRevision === undefined ||
        (r.evidenceRevision ?? ev.revision) > ev.resolvedAtRevision ||
        ev.teacherStatus === 'pending')
  );
}

export function hasUnresolvedPeerDispute(ev: EvidenceItem): boolean {
  const reviews = getPeerReviews(ev);
  return reviews.some(
    (r) =>
      r.status === 'disputed' &&
      !r.resolvedByTeacher &&
      (ev.resolvedAtRevision === undefined ||
        (r.evidenceRevision ?? ev.revision) > ev.resolvedAtRevision ||
        ev.teacherStatus === 'pending')
  );
}

export function validateEvidenceBounds(
  ev: Pick<EvidenceItem, 'startSeconds' | 'endSeconds' | 'sourceId' | 'criterionCode'>,
  sources: VideoSourceItem[]
): { valid: boolean; error?: string } {
  const source = sources.find((s) => s.id === ev.sourceId);
  if (!source) {
    return { valid: false, error: `Không tìm thấy nguồn video ${ev.sourceId}` };
  }
  if (ev.startSeconds < 0 || ev.endSeconds <= ev.startSeconds) {
    return {
      valid: false,
      error: `Mốc thời gian không hợp lệ (${ev.startSeconds}s - ${ev.endSeconds}s)`,
    };
  }
  if (ev.endSeconds > Math.ceil(source.durationSeconds) + 1) {
    return {
      valid: false,
      error: `Mốc kết thúc (${ev.endSeconds}s) vượt quá thời lượng video (${source.durationSeconds}s)`,
    };
  }
  if (!CRITERION_TO_INDICATOR[ev.criterionCode]) {
    return { valid: false, error: `Mã tiêu chí không hợp lệ: ${ev.criterionCode}` };
  }
  return { valid: true };
}

export function deriveEvidenceReviewStatus(ev: EvidenceItem): DerivedReviewStatus {
  if (hasUnresolvedSelfEdit(ev) || hasUnresolvedPeerDispute(ev)) {
    return 'conflict_or_edit';
  }
  if (
    ev.teacherStatus === 'accepted' ||
    ev.teacherStatus === 'modified_accepted'
  ) {
    const selfs = getSelfReviews(ev);
    const peers = getPeerReviews(ev);
    if (selfs.length > 0 || peers.length > 0 || ev.resolvedAtRevision !== undefined) {
      return 'agreed';
    }
  }
  if (ev.clarity === 'unclear' || ev.subjectScope === 'unknown' || ev.studentCodes.length === 0) {
    return 'unclear';
  }
  const selfs = getSelfReviews(ev);
  const peers = getPeerReviews(ev);
  if (selfs.length === 0 && peers.length === 0) {
    return 'unreviewed';
  }
  if (
    selfs.some((s) => s.status === 'unclear' && !s.resolvedByTeacher) ||
    peers.some((p) => p.status === 'unclear' && !p.resolvedByTeacher)
  ) {
    return 'unclear';
  }
  if (
    selfs.some((s) => s.status === 'confirmed') &&
    peers.some((p) => p.status === 'agreed')
  ) {
    return 'agreed';
  }
  return 'unreviewed';
}

export function needsTeacherAttention(ev: EvidenceItem): boolean {
  if (ev.teacherStatus === 'pending') {
    return true;
  }
  if (hasUnresolvedSelfEdit(ev) || hasUnresolvedPeerDispute(ev)) {
    return true;
  }
  return false;
}

export function canPeerReviewerVerify(
  ev: EvidenceItem,
  peerStudentCode: StudentCode,
  targetStudentCode?: StudentCode
): { allowed: boolean; reason?: string } {
  if (targetStudentCode && targetStudentCode === peerStudentCode) {
    return {
      allowed: false,
      reason: 'Học sinh không được tự kiểm chứng chéo cho chính mình.',
    };
  }

  // Sole attributed student on a 1-person card can never peer-verify that card
  if (ev.studentCodes.length === 1 && ev.studentCodes[0] === peerStudentCode) {
    return {
      allowed: false,
      reason: 'Người kiểm chứng chéo phải khác với học sinh đang được đánh giá chính trên thẻ.',
    };
  }

  const selfReviews = getSelfReviews(ev);
  const activeProposeEdits = selfReviews.filter(
    (sr) => sr.status === 'propose_edit' && !sr.resolvedByTeacher
  );

  // Author of an active propose_edit can never peer-verify their own proposal
  if (activeProposeEdits.some((sr) => sr.reviewerCode === peerStudentCode)) {
    return {
      allowed: false,
      reason: 'Người kiểm chứng chéo phải khác với học sinh vừa gửi đề nghị chỉnh sửa.',
    };
  }

  // If a non-attributed student proposed an edit (e.g. HS04 claiming missing attribution on EV-03),
  // another student in the group (including HS03) may peer-verify that student's proposal.
  const hasExternalMissingAttributionProposal = activeProposeEdits.some(
    (sr) => !ev.studentCodes.includes(sr.reviewerCode)
  );

  if (!targetStudentCode) {
    if (ev.studentCodes.includes(peerStudentCode) && !hasExternalMissingAttributionProposal) {
      return {
        allowed: false,
        reason:
          'Học sinh có tên trong thẻ minh chứng không được tự kiểm chứng chéo chung cho cả thẻ. Hãy chọn bạn khác trong nhóm hoặc chỉ định rõ bạn cần kiểm chứng.',
      };
    }
    if (
      activeProposeEdits.length === 0 &&
      selfReviews.some((sr) => sr.reviewerCode === peerStudentCode)
    ) {
      return {
        allowed: false,
        reason: 'Người kiểm chứng chéo phải khác với người vừa tự kiểm chứng.',
      };
    }
  } else {
    const validTargets = new Set<StudentCode>([
      ...ev.studentCodes,
      ...selfReviews.map((s) => s.reviewerCode),
    ]);
    if (!validTargets.has(targetStudentCode)) {
      return {
        allowed: false,
        reason: `Học sinh ${targetStudentCode} không phải là đối tượng trên thẻ minh chứng này.`,
      };
    }
  }

  return { allowed: true };
}

export function reconcileSessionDecisions(
  evidences: EvidenceItem[],
  decisions: TeacherDecisionItem[]
): TeacherDecisionItem[] {
  return decisions.map((dec) => {
    if (dec.level === 'insufficient_evidence') {
      return dec;
    }

    // 1. Every referenced evidence must still exist at the exact revision and remain accepted & attributed
    const allRefsValid =
      dec.acceptedEvidenceRefs.length > 0 &&
      dec.acceptedEvidenceRefs.every((ref) => {
        const found = evidences.find((e) => e.id === ref.id);
        if (!found) return false;
        if (found.revision !== ref.revision) return false;
        if (
          found.teacherStatus !== 'accepted' &&
          found.teacherStatus !== 'modified_accepted'
        ) {
          return false;
        }
        if (found.subjectScope !== 'individual') return false;
        if (!found.studentCodes.includes(dec.studentCode)) return false;
        if (needsTeacherAttention(found)) return false;
        return true;
      });

    // 2. Check if there is any pending dispute/edit involving this student & indicator
    const hasPendingConflict = evidences.some(
      (ev) =>
        ev.indicatorCode === dec.indicatorCode &&
        needsTeacherAttention(ev) &&
        (ev.studentCodes.includes(dec.studentCode) ||
          getSelfReviews(ev).some((sr) =>
            sr.proposedStudentCodes?.includes(dec.studentCode)
          ))
    );

    if (!allRefsValid || hasPendingConflict) {
      return { ...dec, isStale: true };
    }
    return dec;
  });
}

export function upsertSelfReviewOnEvidence(
  ev: EvidenceItem,
  newRecord: SelfReviewRecord
): EvidenceItem {
  const existing = getSelfReviews(ev);
  const recordWithRev: SelfReviewRecord = {
    ...newRecord,
    evidenceRevision: ev.revision,
    resolvedByTeacher: false,
  };
  const filtered = existing.filter((r) => r.reviewerCode !== newRecord.reviewerCode);
  const updatedList = [...filtered, recordWithRev];

  const primarySelfReview =
    updatedList.find((r) => r.status === 'propose_edit' && !r.resolvedByTeacher) ||
    recordWithRev;

  return {
    ...ev,
    teacherStatus: newRecord.status === 'propose_edit' ? 'pending' : ev.teacherStatus,
    selfReview: primarySelfReview,
    selfReviews: updatedList,
  };
}

export function upsertPeerReviewOnEvidence(
  ev: EvidenceItem,
  newRecord: PeerReviewRecord
): EvidenceItem {
  const existing = getPeerReviews(ev);
  const recordWithRev: PeerReviewRecord = {
    ...newRecord,
    evidenceRevision: ev.revision,
    resolvedByTeacher: false,
  };
  const filtered = existing.filter(
    (r) =>
      !(
        r.reviewerCode === newRecord.reviewerCode &&
        (r.targetStudentCode || '') === (newRecord.targetStudentCode || '')
      )
  );
  const updatedList = [...filtered, recordWithRev];

  const primaryPeerReview =
    updatedList.find((r) => r.status === 'disputed' && !r.resolvedByTeacher) ||
    recordWithRev;

  return {
    ...ev,
    teacherStatus: newRecord.status === 'disputed' ? 'pending' : ev.teacherStatus,
    peerReview: primaryPeerReview,
    peerReviews: updatedList,
  };
}

export function recordStudentSelfReview(
  state: SessionState,
  evidenceId: string,
  review: SelfReviewRecord,
  actorLabel?: string
): SessionState {
  const target = state.evidences.find((e) => e.id === evidenceId);
  if (!target) return state;

  const updatedEv = upsertSelfReviewOnEvidence(target, review);
  const newEvidences = state.evidences.map((e) => (e.id === evidenceId ? updatedEv : e));
  const newDecisions = reconcileSessionDecisions(newEvidences, state.decisions);

  return {
    ...state,
    sessionRevision: state.sessionRevision + 1,
    evidences: newEvidences,
    decisions: newDecisions,
    auditLog: [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor:
          actorLabel ||
          (review.recordedBy === 'student'
            ? `${review.reviewerCode} (Tự kiểm chứng)`
            : `GV ghi nhận hộ ${review.reviewerCode}`),
        action:
          review.status === 'propose_edit'
            ? `Gửi đề nghị chỉnh sửa cho ${evidenceId}`
            : `Xác nhận thẻ minh chứng ${evidenceId}`,
        detail: review.note,
      },
      ...state.auditLog,
    ],
  };
}

export function recordStudentPeerReview(
  state: SessionState,
  evidenceId: string,
  review: PeerReviewRecord,
  actorLabel?: string
): SessionState {
  const target = state.evidences.find((e) => e.id === evidenceId);
  if (!target) return state;

  const updatedEv = upsertPeerReviewOnEvidence(target, review);
  const newEvidences = state.evidences.map((e) => (e.id === evidenceId ? updatedEv : e));
  const newDecisions = reconcileSessionDecisions(newEvidences, state.decisions);

  return {
    ...state,
    sessionRevision: state.sessionRevision + 1,
    evidences: newEvidences,
    decisions: newDecisions,
    auditLog: [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor:
          actorLabel ||
          (review.recordedBy === 'student'
            ? `${review.reviewerCode} (Kiểm chứng chéo)`
            : `GV ghi nhận hộ ${review.reviewerCode}`),
        action: `${review.status === 'agreed' ? 'Đồng thuận' : 'Báo mâu thuẫn'} tại ${evidenceId}`,
        detail: review.note,
      },
      ...state.auditLog,
    ],
  };
}

export function applyEvidenceUpdateWithInvalidation(
  state: SessionState,
  updatedEvidence: EvidenceItem,
  actor: string,
  actionDetail: string
): SessionState {
  const nextRevision = updatedEvidence.revision + 1;
  const isResolvedByTeacher = updatedEvidence.teacherStatus !== 'pending';

  const resolvedSelfReviews = getSelfReviews(updatedEvidence).map((sr) =>
    isResolvedByTeacher ? { ...sr, resolvedByTeacher: true } : sr
  );
  const resolvedPeerReviews = getPeerReviews(updatedEvidence).map((pr) =>
    isResolvedByTeacher ? { ...pr, resolvedByTeacher: true } : pr
  );

  const bumpedEvidence: EvidenceItem = {
    ...updatedEvidence,
    revision: nextRevision,
    indicatorCode: CRITERION_TO_INDICATOR[updatedEvidence.criterionCode],
    resolvedAtRevision: isResolvedByTeacher ? nextRevision : updatedEvidence.resolvedAtRevision,
    selfReview: updatedEvidence.selfReview
      ? {
          ...updatedEvidence.selfReview,
          resolvedByTeacher: isResolvedByTeacher
            ? true
            : updatedEvidence.selfReview.resolvedByTeacher,
        }
      : undefined,
    peerReview: updatedEvidence.peerReview
      ? {
          ...updatedEvidence.peerReview,
          resolvedByTeacher: isResolvedByTeacher
            ? true
            : updatedEvidence.peerReview.resolvedByTeacher,
        }
      : undefined,
    selfReviews: resolvedSelfReviews,
    peerReviews: resolvedPeerReviews,
  };

  const newEvidences = state.evidences.map((e) =>
    e.id === bumpedEvidence.id ? bumpedEvidence : e
  );

  const newDecisions = reconcileSessionDecisions(newEvidences, state.decisions);

  return {
    ...state,
    sessionRevision: state.sessionRevision + 1,
    evidences: newEvidences,
    decisions: newDecisions,
    auditLog: [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor,
        action: `Cập nhật minh chứng ${bumpedEvidence.id} (v${bumpedEvidence.revision})`,
        detail: actionDetail,
      },
      ...state.auditLog,
    ],
  };
}

export function replaceAiEvidencesForSource(
  state: SessionState,
  sourceId: string,
  newEvidencesForSource: EvidenceItem[],
  modelName: string,
  extraSourceUpdate?: {
    transcriptSegments?: TranscriptSegment[];
    agenticSteps?: AgenticInspectionStep[];
    processingModeUsed?: VideoProcessingMode;
  }
): SessionState {
  const remaining = state.evidences.filter(
    (e) => !(e.sourceId === sourceId && e.origin === 'ai')
  );
  const mergedEvidences = [...remaining, ...newEvidencesForSource];
  const reconciledDecisions = reconcileSessionDecisions(mergedEvidences, state.decisions);

  const updatedSources = extraSourceUpdate
    ? state.sources.map((s) =>
        s.id === sourceId
          ? {
              ...s,
              transcriptSegments:
                extraSourceUpdate.transcriptSegments ?? s.transcriptSegments,
              agenticSteps: extraSourceUpdate.agenticSteps ?? s.agenticSteps,
              processingModeUsed:
                extraSourceUpdate.processingModeUsed ?? s.processingModeUsed,
            }
          : s
      )
    : state.sources;

  return {
    ...state,
    mode: 'live_ai',
    sessionRevision: state.sessionRevision + 1,
    lastAnalyzedAt: new Date().toISOString(),
    sources: updatedSources,
    evidences: mergedEvidences,
    decisions: reconciledDecisions,
    auditLog: [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: `AI-LENS (${modelName} • ${
          extraSourceUpdate?.processingModeUsed || 'AGENTIC'
        })`,
        action: `Phân tích Live API nguồn ${sourceId}`,
        detail: `Trích xuất ${
          extraSourceUpdate?.transcriptSegments?.length || 0
        } đoạn lời thoại (Transcript) và ${
          newEvidencesForSource.length
        } minh chứng mới từ nguồn ${sourceId}; tự động kiểm tra lại hiệu lực các kết luận liên quan.`,
      },
      ...state.auditLog,
    ],
  };
}

export function getAcceptedPersonalEvidences(
  evidences: EvidenceItem[],
  studentCode: StudentCode,
  indicatorCode: IndicatorCode
): EvidenceItem[] {
  return evidences.filter(
    (ev) =>
      ev.indicatorCode === indicatorCode &&
      (ev.teacherStatus === 'accepted' || ev.teacherStatus === 'modified_accepted') &&
      ev.subjectScope === 'individual' &&
      ev.studentCodes.includes(studentCode) &&
      !needsTeacherAttention(ev)
  );
}

export function evaluateDecisionValidity(
  state: SessionState,
  studentCode: StudentCode,
  indicatorCode: IndicatorCode
): DecisionValidityResult {
  const decision = state.decisions.find(
    (d) => d.studentCode === studentCode && d.indicatorCode === indicatorCode
  );
  if (!decision || decision.level === 'insufficient_evidence') {
    return {
      status: 'insufficient_evidence',
      effectiveLevel: 'insufficient_evidence',
      decision,
    };
  }

  if (decision.isStale) {
    return {
      status: 'stale_needs_review',
      effectiveLevel: 'insufficient_evidence',
      staleReason:
        'Minh chứng làm căn cứ đã thay đổi, bị bác bỏ hoặc phát sinh phản hồi mới. Cần Giáo viên duyệt lại ở Bước 5.',
      decision,
    };
  }

  const reconciled = reconcileSessionDecisions(state.evidences, [decision])[0];
  if (reconciled.isStale) {
    return {
      status: 'stale_needs_review',
      effectiveLevel: 'insufficient_evidence',
      staleReason:
        'Minh chứng tham chiếu không còn hợp lệ hoặc đang chờ xử lý mâu thuẫn. Cần Giáo viên duyệt lại ở Bước 5.',
      decision: reconciled,
    };
  }

  const acceptedEvs = getAcceptedPersonalEvidences(
    state.evidences,
    studentCode,
    indicatorCode
  );
  if (acceptedEvs.length === 0) {
    return {
      status: 'stale_needs_review',
      effectiveLevel: 'insufficient_evidence',
      staleReason: 'Không còn minh chứng cá nhân hợp lệ cho chỉ số này.',
      decision: { ...decision, isStale: true },
    };
  }

  return {
    status: 'valid',
    effectiveLevel: decision.level,
    decision,
  };
}

export function canConcludeCompetencyLevel(
  evidences: EvidenceItem[],
  studentCode: StudentCode,
  indicatorCode: IndicatorCode,
  targetLevel: CompetencyLevel,
  assistanceContext?: AssistanceContext
): { allowed: boolean; reason?: string } {
  if (targetLevel === 'insufficient_evidence') {
    return { allowed: true };
  }

  const hasPendingDispute = evidences.some(
    (ev) =>
      ev.indicatorCode === indicatorCode &&
      (ev.studentCodes.includes(studentCode) ||
        getSelfReviews(ev).some((sr) =>
          sr.proposedStudentCodes?.includes(studentCode)
        )) &&
      needsTeacherAttention(ev)
  );
  if (hasPendingDispute) {
    return {
      allowed: false,
      reason: 'Còn minh chứng có đề nghị sửa hoặc mâu thuẫn chưa được Giáo viên xử lý.',
    };
  }

  const accepted = getAcceptedPersonalEvidences(evidences, studentCode, indicatorCode);
  if (accepted.length === 0) {
    return {
      allowed: false,
      reason:
        'Chưa có minh chứng cá nhân được duyệt cho chỉ số này. Hãy chọn "Chưa đủ minh chứng" hoặc duyệt/bổ sung minh chứng trước.',
    };
  }

  if (assistanceContext === 'unknown') {
    return {
      allowed: false,
      reason:
        'Vui lòng xác nhận rõ bối cảnh thực hiện ("Có hướng dẫn" hoặc "Tự thực hiện") trước khi chốt mức M1–M3.',
    };
  }

  if ((targetLevel === 'M2' || targetLevel === 'M3') && assistanceContext === 'guided') {
    return {
      allowed: false,
      reason: `Mức ${targetLevel} đòi hỏi học sinh tự chủ thực hiện. Nếu học sinh thực hiện khi có hướng dẫn/gợi ý, hãy chọn M1 hoặc cập nhật lại bối cảnh.`,
    };
  }

  return { allowed: true };
}

export function computeSessionMetrics(state: SessionState) {
  const totalEvidences = state.evidences.length;
  const acceptedCount = state.evidences.filter(
    (e) => e.teacherStatus === 'accepted' || e.teacherStatus === 'modified_accepted'
  ).length;
  const agreedCount = state.evidences.filter(
    (e) => deriveEvidenceReviewStatus(e) === 'agreed'
  ).length;
  const conflictCount = state.evidences.filter(
    (e) => deriveEvidenceReviewStatus(e) === 'conflict_or_edit'
  ).length;
  const pendingTeacherCount = state.evidences.filter((e) =>
    needsTeacherAttention(e)
  ).length;

  const studentsWithAcceptedEvidence = state.students.filter((st) =>
    state.evidences.some(
      (ev) =>
        (ev.teacherStatus === 'accepted' || ev.teacherStatus === 'modified_accepted') &&
        ev.subjectScope === 'individual' &&
        ev.studentCodes.includes(st.code) &&
        !needsTeacherAttention(ev)
    )
  ).length;

  const totalCells = state.students.length * RUBRIC_INDICATORS.length; // 4 * 5 = 20
  let concludedLevelCells = 0;
  let staleCells = 0;
  for (const st of state.students) {
    for (const ind of RUBRIC_INDICATORS) {
      const val = evaluateDecisionValidity(state, st.code, ind.indicatorCode);
      if (val.status === 'valid' && val.effectiveLevel !== 'insufficient_evidence') {
        concludedLevelCells += 1;
      } else if (val.status === 'stale_needs_review') {
        staleCells += 1;
      }
    }
  }
  const insufficientCells = totalCells - concludedLevelCells;

  return {
    totalEvidences,
    acceptedCount,
    agreedCount,
    conflictCount,
    pendingTeacherCount,
    studentsWithAcceptedEvidence,
    totalStudents: state.students.length,
    totalCells,
    concludedLevelCells,
    staleCells,
    insufficientCells,
  };
}

export function buildStudentLearningRecommendation(
  state: SessionState,
  studentCode: StudentCode
): {
  strengths: string[];
  areasToDevelop: string[];
  nextTasks: string[];
} {
  const strengths: string[] = [];
  const areasToDevelop: string[] = [];
  const nextTasks: string[] = [];

  for (const ind of RUBRIC_INDICATORS) {
    const validity = evaluateDecisionValidity(state, studentCode, ind.indicatorCode);

    if (validity.status === 'stale_needs_review') {
      areasToDevelop.push(
        `Chỉ số ${ind.indicatorCode} (${ind.checklistTitle}): Cần Giáo viên duyệt lại — Kết luận trước đó (${validity.decision?.level}) đã hết hiệu lực do minh chứng thay đổi hoặc bị bác bỏ.`
      );
      nextTasks.push(
        `Cần duyệt lại ${ind.indicatorCode}: Giáo viên kiểm tra lại minh chứng và chốt lại mức năng lực ở Bước 5 trước khi xuất hồ sơ.`
      );
      continue;
    }

    const level = validity.effectiveLevel;
    const decision = validity.decision;

    if (level === 'M2' || level === 'M3') {
      strengths.push(
        `Chỉ số ${ind.indicatorCode} (${ind.checklistTitle}): Đạt mức ${level} — ${decision?.rationale || ind.levels[level]}`
      );
      if (level === 'M2') {
        nextTasks.push(
          `Nâng cao ${ind.indicatorCode} lên M3: Chủ động giải thích vì sao cần đo lặp lại 3 lần và giữ ổn định góc nghiêng mặt dốc.`
        );
      }
    } else if (level === 'M1') {
      strengths.push(
        `Chỉ số ${ind.indicatorCode} (${ind.checklistTitle}): Bước đầu thực hiện được thao tác cơ bản (Mức M1) khi có hướng dẫn.`
      );
      areasToDevelop.push(
        `Chỉ số ${ind.indicatorCode}: Cần rèn tính tự chủ khi thực hiện quy trình mà không phụ thuộc gợi ý.`
      );
      nextTasks.push(
        `Nhiệm vụ rèn luyện ${ind.indicatorCode} (M1 → M2): Tự thực hiện trọn vẹn thao tác ${ind.checklistTitle.toLowerCase()} và ghi kết quả 3 lần đo độc lập.`
      );
    } else {
      areasToDevelop.push(
        `Chỉ số ${ind.indicatorCode} (${ind.checklistTitle}): Chưa quan sát thấy đủ minh chứng cá nhân trong các đoạn video hiện tại (Không đồng nghĩa với chưa đạt năng lực).`
      );
      if (
        ind.indicatorCode === '2.5' ||
        ind.indicatorCode === '2.6' ||
        ind.indicatorCode === '3.2'
      ) {
        nextTasks.push(
          `Thu thập bổ sung cho ${ind.indicatorCode}: Chụp ảnh bảng số liệu 3 lần đo trong vở ghi, tính tốc độ v = s/t và giải thích nguyên nhân chênh lệch thời gian giữa các lần bấm giờ.`
        );
      } else {
        nextTasks.push(
          `Thu thập bổ sung cho ${ind.indicatorCode}: Thực hiện và quay bổ sung thao tác cá nhân cho hoạt động "${ind.checklistTitle}".`
        );
      }
    }
  }

  return { strengths, areasToDevelop, nextTasks };
}

export function validateImportedSession(raw: unknown): {
  valid: boolean;
  session?: SessionState;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Tệp JSON không đúng định dạng đối tượng.' };
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.sessionId !== 'string' ||
    !Array.isArray(obj.students) ||
    !Array.isArray(obj.sources) ||
    !Array.isArray(obj.evidences) ||
    !Array.isArray(obj.decisions)
  ) {
    return {
      valid: false,
      error: 'Tệp JSON thiếu các trường bắt buộc của phiên AI-LENS (sessionId, students, sources, evidences, decisions).',
    };
  }
  const session = obj as unknown as SessionState;
  const reconciledDecisions = reconcileSessionDecisions(
    session.evidences,
    session.decisions
  );
  return {
    valid: true,
    session: {
      ...session,
      decisions: reconciledDecisions,
    },
  };
}
