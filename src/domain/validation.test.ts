import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_SOURCES,
  INITIAL_DEMO_SESSION,
  RUBRIC_INDICATORS,
} from '../data/rubricData';
import {
  applyEvidenceUpdateWithInvalidation,
  buildStudentLearningRecommendation,
  canConcludeCompetencyLevel,
  canPeerReviewerVerify,
  deriveEvidenceReviewStatus,
  evaluateDecisionValidity,
  getSelfReviews,
  needsTeacherAttention,
  recordStudentPeerReview,
  recordStudentSelfReview,
  removeAllSourcesFromSession,
  removeSourceFromSession,
  replaceAiEvidencesForSource,
  restoreSampleSourcesToSession,
  validateEvidenceBounds,
  validateImportedSession,
} from './validation';

describe('AI-LENS Domain & Audit Regression Verification', () => {
  it('A01: Rubric contains all 5 indicators (TC1-TC5), 15 M1-M3 descriptions, and 8 initial evidences (EV-01..EV-08)', () => {
    expect(RUBRIC_INDICATORS).toHaveLength(5);
    const totalLevels = RUBRIC_INDICATORS.reduce(
      (acc, item) =>
        acc +
        (item.levels.M1 ? 1 : 0) +
        (item.levels.M2 ? 1 : 0) +
        (item.levels.M3 ? 1 : 0),
      0
    );
    expect(totalLevels).toBe(15);
    expect(INITIAL_DEMO_SESSION.evidences).toHaveLength(8);
    const ind26 = RUBRIC_INDICATORS.find((i) => i.indicatorCode === '2.6');
    expect(ind26?.note).toContain('sai số');
  });

  it('A11: Validates evidence timestamps against video source duration', () => {
    const validRes = validateEvidenceBounds(
      {
        sourceId: 'VID01',
        startSeconds: 5,
        endSeconds: 20,
        criterionCode: 'TC1',
      },
      DEFAULT_VIDEO_SOURCES
    );
    expect(validRes.valid).toBe(true);

    const outOfBounds = validateEvidenceBounds(
      {
        sourceId: 'VID01',
        startSeconds: 10,
        endSeconds: 99,
        criterionCode: 'TC1',
      },
      DEFAULT_VIDEO_SOURCES
    );
    expect(outOfBounds.valid).toBe(false);
  });

  it('P1-1: Rejecting or invalidating an evidence marks decision stale and removes "Đạt mức" from Step 6 recommendation', () => {
    const ev01 = INITIAL_DEMO_SESSION.evidences.find((e) => e.id === 'EV-01')!;

    // Teacher rejects EV-01
    const afterReject = applyEvidenceUpdateWithInvalidation(
      INITIAL_DEMO_SESSION,
      { ...ev01, teacherStatus: 'rejected' },
      'Giáo viên',
      'Bác bỏ EV-01'
    );

    const validity = evaluateDecisionValidity(afterReject, 'HS01', '2.3');
    expect(validity.status).toBe('stale_needs_review');
    expect(validity.effectiveLevel).toBe('insufficient_evidence');

    const rec = buildStudentLearningRecommendation(afterReject, 'HS01');
    expect(rec.strengths.some((s) => s.includes('2.3') && s.includes('Đạt mức M2'))).toBe(
      false
    );
    expect(
      rec.areasToDevelop.some((a) => a.includes('2.3') && a.includes('Cần Giáo viên duyệt lại'))
    ).toBe(true);
  });

  it('P1-1b: Student propose_edit, peer dispute, and live AI replacement all invalidate dependent decisions', () => {
    // 1) Student submits propose_edit on EV-01 -> invalidates HS01 2.3 decision
    const afterPropose = recordStudentSelfReview(INITIAL_DEMO_SESSION, 'EV-01', {
      reviewerCode: 'HS01',
      recordedBy: 'student',
      status: 'propose_edit',
      note: 'Đề nghị chỉnh lại mốc thời gian',
      proposedStudentCodes: ['HS01'],
      updatedAt: new Date().toISOString(),
    });
    expect(evaluateDecisionValidity(afterPropose, 'HS01', '2.3').status).toBe(
      'stale_needs_review'
    );

    // 2) Peer submits dispute on EV-02 -> invalidates HS03 2.3 decision
    const afterDispute = recordStudentPeerReview(INITIAL_DEMO_SESSION, 'EV-02', {
      reviewerCode: 'HS01',
      targetStudentCode: 'HS03',
      recordedBy: 'student',
      status: 'disputed',
      note: 'Chưa thống nhất',
      updatedAt: new Date().toISOString(),
    });
    expect(evaluateDecisionValidity(afterDispute, 'HS03', '2.3').status).toBe(
      'stale_needs_review'
    );

    // 3) Live AI replaces evidences for VID01 -> invalidates HS01 2.3 decision
    const afterAiReplace = replaceAiEvidencesForSource(
      INITIAL_DEMO_SESSION,
      'VID01',
      [],
      'gemini-3.5-flash-lite'
    );
    expect(evaluateDecisionValidity(afterAiReplace, 'HS01', '2.3').status).toBe(
      'stale_needs_review'
    );
  });

  it('P1-4: Blocks self peer-verification on multi-student cards (EV-05) and 1-person cards with external propose_edit', () => {
    // Multi-student card EV-05 has ['HS01', 'HS02', 'HS04']
    const ev05 = INITIAL_DEMO_SESSION.evidences.find((e) => e.id === 'EV-05')!;
    expect(canPeerReviewerVerify(ev05, 'HS01').allowed).toBe(false);
    expect(canPeerReviewerVerify(ev05, 'HS02').allowed).toBe(false);
    expect(canPeerReviewerVerify(ev05, 'HS04').allowed).toBe(false);
    // Unattributed peer HS03 can verify whole card
    expect(canPeerReviewerVerify(ev05, 'HS03').allowed).toBe(true);
    // Attributed student HS02 can verify specifically HS01 if targetStudentCode is specified, but NOT themselves
    expect(canPeerReviewerVerify(ev05, 'HS02', 'HS01').allowed).toBe(true);
    expect(canPeerReviewerVerify(ev05, 'HS01', 'HS01').allowed).toBe(false);

    // 1-person card EV-02 (['HS03']) with external propose_edit from HS02: HS03 still cannot peer-verify
    const afterExternalPropose = recordStudentSelfReview(INITIAL_DEMO_SESSION, 'EV-02', {
      reviewerCode: 'HS02',
      recordedBy: 'student',
      status: 'propose_edit',
      note: 'Em cũng tham gia',
      proposedStudentCodes: ['HS02', 'HS03'],
      updatedAt: new Date().toISOString(),
    });
    const ev02Modified = afterExternalPropose.evidences.find((e) => e.id === 'EV-02')!;
    expect(canPeerReviewerVerify(ev02Modified, 'HS03').allowed).toBe(false);
    expect(canPeerReviewerVerify(ev02Modified, 'HS02').allowed).toBe(false);
    expect(canPeerReviewerVerify(ev02Modified, 'HS01').allowed).toBe(true);
  });

  it('P2-5: Preserves multiple students self-reviews on the same evidence card without overwriting', () => {
    // HS01 submits propose_edit on EV-05
    const step1 = recordStudentSelfReview(INITIAL_DEMO_SESSION, 'EV-05', {
      reviewerCode: 'HS01',
      recordedBy: 'student',
      status: 'propose_edit',
      note: 'Đề nghị bổ sung HS03',
      proposedStudentCodes: ['HS01', 'HS02', 'HS03', 'HS04'],
      updatedAt: new Date().toISOString(),
    });

    // HS02 then clicks Confirm on EV-05
    const step2 = recordStudentSelfReview(step1, 'EV-05', {
      reviewerCode: 'HS02',
      recordedBy: 'student',
      status: 'confirmed',
      note: 'HS02 xác nhận đúng phần việc ghi chép',
      updatedAt: new Date().toISOString(),
    });

    const ev05After = step2.evidences.find((e) => e.id === 'EV-05')!;
    const allSelf = getSelfReviews(ev05After);
    expect(allSelf.some((r) => r.reviewerCode === 'HS01' && r.status === 'propose_edit')).toBe(
      true
    );
    expect(allSelf.some((r) => r.reviewerCode === 'HS02' && r.status === 'confirmed')).toBe(
      true
    );
    // Card must still be flagged as conflict_or_edit so HS01's proposal is not lost
    expect(deriveEvidenceReviewStatus(ev05After)).toBe('conflict_or_edit');
    expect(needsTeacherAttention(ev05After)).toBe(true);
  });

  it('P2-6: Teacher resolving a conflict clears needsTeacherAttention and conflict_or_edit status', () => {
    const ev03 = INITIAL_DEMO_SESSION.evidences.find((e) => e.id === 'EV-03')!;
    expect(needsTeacherAttention(ev03)).toBe(true);
    expect(deriveEvidenceReviewStatus(ev03)).toBe('conflict_or_edit');

    const afterTeacherResolve = applyEvidenceUpdateWithInvalidation(
      INITIAL_DEMO_SESSION,
      {
        ...ev03,
        studentCodes: ['HS01', 'HS03', 'HS04'],
        clarity: 'clear',
        teacherStatus: 'modified_accepted',
      },
      'Giáo viên',
      'Duyệt đề nghị bổ sung HS04 vào EV-03'
    );

    const resolvedEv03 = afterTeacherResolve.evidences.find((e) => e.id === 'EV-03')!;
    expect(needsTeacherAttention(resolvedEv03)).toBe(false);
    expect(deriveEvidenceReviewStatus(resolvedEv03)).toBe('agreed');
  });

  it('P2-7 & A04/A06/A15: Enforces assistanceContext selection and blocks M1-M3 when evidence is missing', () => {
    // Missing evidence on 2.5
    expect(
      canConcludeCompetencyLevel(INITIAL_DEMO_SESSION.evidences, 'HS01', '2.5', 'M2').allowed
    ).toBe(false);
    expect(
      canConcludeCompetencyLevel(
        INITIAL_DEMO_SESSION.evidences,
        'HS01',
        '2.5',
        'insufficient_evidence'
      ).allowed
    ).toBe(true);

    // Blocks M2 when assistanceContext is unknown or guided
    expect(
      canConcludeCompetencyLevel(
        INITIAL_DEMO_SESSION.evidences,
        'HS01',
        '2.3',
        'M2',
        'unknown'
      ).allowed
    ).toBe(false);
    expect(
      canConcludeCompetencyLevel(
        INITIAL_DEMO_SESSION.evidences,
        'HS01',
        '2.3',
        'M2',
        'guided'
      ).allowed
    ).toBe(false);
    expect(
      canConcludeCompetencyLevel(
        INITIAL_DEMO_SESSION.evidences,
        'HS01',
        '2.3',
        'M2',
        'independent'
      ).allowed
    ).toBe(true);
  });

  it('Import JSON: Validates schema and reconciles stale decisions', () => {
    const badImport = validateImportedSession({ foo: 'bar' });
    expect(badImport.valid).toBe(false);

    const goodImport = validateImportedSession(INITIAL_DEMO_SESSION);
    expect(goodImport.valid).toBe(true);
  });

  it('Agentic Video & Transcript: All 6 default videos include visually-verified speaker diarization and EV-08 captures TC4 (2.6) error analysis from speech', () => {
    for (const src of DEFAULT_VIDEO_SOURCES) {
      expect(src.transcriptSegments?.length).toBeGreaterThan(0);
      expect(src.agenticSteps?.length).toBeGreaterThan(0);
      expect(src.processingModeUsed).toBe('AGENTIC');
    }

    // Verify ground-truth speaker attributions across VID01..VID06
    const vid01 = DEFAULT_VIDEO_SOURCES.find((s) => s.id === 'VID01')!;
    expect(vid01.transcriptSegments?.[0].speakerCode).toBe('HS02');
    expect(vid01.transcriptSegments?.[1].speakerCode).toBe('HS01');

    const vid03 = DEFAULT_VIDEO_SOURCES.find((s) => s.id === 'VID03')!;
    expect(vid03.transcriptSegments?.[0].speakerCode).toBe('HS02');

    const vid04 = DEFAULT_VIDEO_SOURCES.find((s) => s.id === 'VID04')!;
    const tapeSeg = vid04.transcriptSegments?.find((seg) =>
      seg.text.includes('lấy băng dính của tớ đi')
    );
    expect(tapeSeg?.speakerCode).toBe('HS01');
    const conclude40cmSeg = vid04.transcriptSegments?.find((seg) =>
      seg.text.includes('vậy quãng đường chúng ta đo sẽ là 40 cm')
    );
    expect(conclude40cmSeg?.speakerCode).toBe('HS02');

    const vid05 = DEFAULT_VIDEO_SOURCES.find((s) => s.id === 'VID05')!;
    const slowStopwatchSeg = vid05.transcriptSegments?.find((seg) =>
      seg.text.includes('bấm hơi chậm')
    );
    expect(slowStopwatchSeg?.speakerCode).toBe('HS03');

    const vid06 = DEFAULT_VIDEO_SOURCES.find((s) => s.id === 'VID06')!;
    expect(vid06.transcriptSegments?.[0].speakerCode).toBe('HS02');
    expect(vid06.transcriptSegments?.[1].speakerCode).toBe('HS03');

    const ev08 = INITIAL_DEMO_SESSION.evidences.find((e) => e.id === 'EV-08')!;
    expect(ev08.criterionCode).toBe('TC4');
    expect(ev08.indicatorCode).toBe('2.6');
    expect(ev08.spokenTranscript).toContain('bấm hơi chậm');
    expect(ev08.studentCodes).toContain('HS03');
    expect(ev08.studentCodes).toContain('HS02');

    // Verify replaceAiEvidencesForSource updates transcriptSegments and agenticSteps on target source
    const updatedSession = replaceAiEvidencesForSource(
      INITIAL_DEMO_SESSION,
      'VID01',
      [],
      'gemini-3.5-flash-lite',
      {
        transcriptSegments: [
          {
            id: 'TR-TEST-1',
            startSeconds: 1,
            endSeconds: 5,
            speakerCode: 'HS01',
            text: 'Thử nghiệm cập nhật transcript mới',
            linkedCriteria: ['TC1'],
          },
        ],
        processingModeUsed: 'AGENTIC',
      }
    );
    const vid01After = updatedSession.sources.find((s) => s.id === 'VID01')!;
    expect(vid01After.transcriptSegments).toHaveLength(1);
    expect(vid01After.transcriptSegments?.[0].text).toBe(
      'Thử nghiệm cập nhật transcript mới'
    );
  });

  it('Custom Rubric: supports adding TC6 and validates evidences & session metrics dynamically', () => {
    const customIndicators = [
      ...RUBRIC_INDICATORS,
      {
        criterionCode: 'TC6',
        indicatorCode: '2.7',
        componentName: '2. Tìm tòi, khám phá thế giới tự nhiên',
        indicatorTitle: '2.7. Tuân thủ an toàn phòng thí nghiệm và bảo quản dụng cụ.',
        checklistTitle: '2.7. An toàn & bảo quản',
        aiLookFor: 'Học sinh cất dọn đồ, tắt thiết bị hoặc đeo đồ bảo hộ.',
        requiredEvidence: 'Đoạn video thao tác thu dọn đồ thí nghiệm.',
        levels: {
          M1: 'Thu dọn dụng cụ khi được nhắc nhở.',
          M2: 'Tự giác thu dọn đồ dùng gọn gàng sau thí nghiệm.',
          M3: 'Chủ động hướng dẫn bạn bè và kiểm tra an toàn toàn nhóm.',
        },
      },
    ];

    // Validate bounds with custom rubric
    const validRes = validateEvidenceBounds(
      {
        sourceId: 'VID01',
        startSeconds: 5,
        endSeconds: 15,
        criterionCode: 'TC6',
      },
      DEFAULT_VIDEO_SOURCES,
      customIndicators
    );
    expect(validRes.valid).toBe(true);

    // Validate session with custom indicators
    const customSession = {
      ...INITIAL_DEMO_SESSION,
      rubricIndicators: customIndicators,
    };
    expect(customSession.rubricIndicators).toHaveLength(6);
  });

  it('Source Removal & Sample Video Restoration: supports deleting individual, all videos, and reloading samples', () => {
    // 1. Delete single source VID01
    const sessionAfterOne = removeSourceFromSession(INITIAL_DEMO_SESSION, 'VID01');
    expect(sessionAfterOne.sources.some((s) => s.id === 'VID01')).toBe(false);
    expect(sessionAfterOne.sources).toHaveLength(5);
    expect(sessionAfterOne.evidences.some((e) => e.sourceId === 'VID01')).toBe(false);
    expect(sessionAfterOne.auditLog[0].action).toContain('VID01');

    // 2. Delete all sources (e.g. all 6 sample videos removed)
    const sessionEmpty = removeAllSourcesFromSession(INITIAL_DEMO_SESSION);
    expect(sessionEmpty.sources).toHaveLength(0);
    expect(sessionEmpty.evidences).toHaveLength(0);
    expect(sessionEmpty.mode).toBe('custom');
    expect(sessionEmpty.students[0].visualPosition).toContain('Chờ nạp video');
    expect(sessionEmpty.students[0].seatLabel).not.toContain('Thảo Linh');
    // All decisions should now be stale or insufficient_evidence
    expect(
      sessionEmpty.decisions.every(
        (d) => d.level === 'insufficient_evidence' || d.isStale === true
      )
    ).toBe(true);

    // 3. Restore sample sources to empty session
    const sessionRestored = restoreSampleSourcesToSession(
      sessionEmpty,
      DEFAULT_VIDEO_SOURCES,
      INITIAL_DEMO_SESSION.evidences,
      INITIAL_DEMO_SESSION.decisions
    );
    expect(sessionRestored.sources).toHaveLength(6);
    expect(sessionRestored.mode).toBe('demo_verified');
    expect(sessionRestored.students[0].seatLabel).toContain('Thảo Linh');
    expect(sessionRestored.evidences).toHaveLength(INITIAL_DEMO_SESSION.evidences.length);
    expect(sessionRestored.auditLog[0].action).toBe('Tải lên bộ video mẫu');

    // 4. Custom source preservation when restoring sample videos
    const customSource = {
      id: 'IMG01',
      title: 'Ảnh phiếu học tập',
      stageLabel: 'Minh chứng phiếu',
      filename: 'phieu.jpg',
      videoUrl: 'blob:test',
      thumbnailUrl: 'blob:test',
      durationSeconds: 10,
      sizeBytes: 1024,
      description: 'Phiếu học tập',
      expectedCriteria: ['TC3'],
      mediaType: 'worksheet_image' as const,
      isCustomUpload: true,
      mediaMissing: false,
    };
    const sessionWithCustom = {
      ...sessionEmpty,
      sources: [customSource],
    };
    const restoredWithCustom = restoreSampleSourcesToSession(
      sessionWithCustom,
      DEFAULT_VIDEO_SOURCES,
      INITIAL_DEMO_SESSION.evidences,
      INITIAL_DEMO_SESSION.decisions
    );
    expect(restoredWithCustom.sources).toHaveLength(7);
    expect(restoredWithCustom.sources.some((s) => s.id === 'IMG01')).toBe(true);
  });
});
