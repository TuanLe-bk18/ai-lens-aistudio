import React, { useEffect, useRef, useState } from 'react';
import {
  CRITERION_TO_INDICATOR,
  DEFAULT_VIDEO_SOURCES,
  INITIAL_DEMO_SESSION,
  RUBRIC_INDICATORS,
} from '../data/rubricData';
import {
  applyEvidenceUpdateWithInvalidation,
  canConcludeCompetencyLevel,
  canPeerReviewerVerify,
  computeSessionMetrics,
  getAcceptedPersonalEvidences,
  getSelfReviews,
  reconcileSessionDecisions,
  recordStudentPeerReview,
  recordStudentSelfReview,
  removeAllSourcesFromSession,
  removeSourceFromSession,
  replaceAiEvidencesForSource,
  restoreSampleSourcesToSession,
  validateEvidenceBounds,
  validateImportedSession,
} from '../domain/validation';
import {
  blobToBase64,
  clearAllCustomMediaFromIndexedDb,
  deleteCustomMediaFromIndexedDb,
  inspectVideoFileMetadata,
  loadCustomMediaFromIndexedDb,
  saveCustomMediaToIndexedDb,
} from '../storage/mediaStore';
import {
  AssistanceContext,
  AuditEvent,
  CompetencyLevel,
  CriterionCode,
  EvidenceItem,
  IndicatorCode,
  RubricIndicator,
  SessionState,
  StudentCode,
  StudentSeatProfile,
  TranscriptSegment,
  VideoProcessingMode,
  VideoSourceItem,
} from '../types';

const STORAGE_KEY = 'ai_lens_session_v5_highres_verified';

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function useAiLens() {
  const [session, setSession] = useState<SessionState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const validated = validateImportedSession(parsed);
        if (validated.valid && validated.session && Array.isArray(validated.session.sources)) {
          return validated.session;
        }
      }
    } catch {
      // ignore initial parse error
    }
    return INITIAL_DEMO_SESSION;
  });

  const [activeStep, setActiveStep] = useState<number>(1);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('VID01');
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>('EV-01');
  const [clipStopTime, setClipStopTime] = useState<number | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const customBlobsRef = useRef<Map<string, { blob: Blob; mimeType: string }>>(new Map());

  // Step 2: Live AI analysis states (including Gemini Agentic Video Understanding mode)
  const [analyzingSourceId, setAnalyzingSourceId] = useState<string | null>(null);
  const [processingMode, setProcessingMode] = useState<VideoProcessingMode>('AGENTIC');
  const [aiError, setAiError] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [serverHasKey, setServerHasKey] = useState<boolean>(false);

  // Rubric customization & AI Advisor workspace
  const [showRubricWorkspace, setShowRubricWorkspace] = useState<boolean>(false);

  // Step 2/3: Manual evidence addition modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newEvSourceId, setNewEvSourceId] = useState<string>('VID05');
  const [newEvStart, setNewEvStart] = useState<number>(5);
  const [newEvEnd, setNewEvEnd] = useState<number>(15);
  const [newEvCriterion, setNewEvCriterion] = useState<CriterionCode>('TC2');
  const [newEvStudents, setNewEvStudents] = useState<StudentCode[]>(['HS01']);
  const [newEvBehavior, setNewEvBehavior] = useState<string>('');
  const [newEvError, setNewEvError] = useState<string | null>(null);

  // Step 3: Self-review state
  const [selectedSelfStudent, setSelectedSelfStudent] = useState<StudentCode>('HS04');
  const [selfRecordedBy, setSelfRecordedBy] = useState<'student' | 'teacher_assisted'>('student');
  const [editingSelfEvId, setEditingSelfEvId] = useState<string | null>(null);
  const [proposeStudents, setProposeStudents] = useState<StudentCode[]>([]);
  const [proposeCriterion, setProposeCriterion] = useState<CriterionCode>('TC2');
  const [proposeNote, setProposeNote] = useState<string>('');

  // Step 4: Peer-review state
  const [selectedPeerReviewer, setSelectedPeerReviewer] = useState<StudentCode>('HS03');
  const [peerRecordedBy, setPeerRecordedBy] = useState<'student' | 'teacher_assisted'>('student');
  const [peerTargetMap, setPeerTargetMap] = useState<Record<string, StudentCode | ''>>({});
  const [peerNoteDraft, setPeerNoteDraft] = useState<Record<string, string>>({});

  // Step 5: Teacher queue & decision state
  const [teacherFilter, setTeacherFilter] = useState<'priority' | 'all'>('priority');
  const [decisionAlert, setDecisionAlert] = useState<string | null>(null);
  const [assistanceDrafts, setAssistanceDrafts] = useState<Record<string, AssistanceContext>>({});

  // Step 6: Portfolio student tab
  const [portfolioStudent, setPortfolioStudent] = useState<StudentCode>('HS01');

  // Persist session to localStorage with explicit quota/error warning
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      setStorageWarning(null);
    } catch (err: any) {
      setStorageWarning(
        `Cảnh báo lưu trữ trình duyệt: Không thể ghi trạng thái vào localStorage (${
          err?.message || 'Vượt dung lượng'
        }). Hãy xuất file JSON để tránh mất dữ liệu.`
      );
    }
  }, [session]);

  // Rehydrate custom uploaded video/image blobs from IndexedDB on F5 reload
  useEffect(() => {
    let cancelled = false;
    async function rehydrateCustomMedia() {
      const customSources = session.sources.filter((s) => s.isCustomUpload);
      if (customSources.length === 0) return;

      const updatedSources: VideoSourceItem[] = [];
      let changed = false;

      for (const src of session.sources) {
        if (!src.isCustomUpload) {
          updatedSources.push(src);
          continue;
        }
        const record = await loadCustomMediaFromIndexedDb(src.id);
        if (record && record.blob) {
          customBlobsRef.current.set(src.id, {
            blob: record.blob,
            mimeType: record.mimeType || src.mimeType || 'video/mp4',
          });
          const freshObjectUrl = URL.createObjectURL(record.blob);
          updatedSources.push({
            ...src,
            videoUrl: freshObjectUrl,
            thumbnailUrl: record.thumbnailDataUrl || src.thumbnailUrl,
            durationSeconds: record.durationSeconds || src.durationSeconds,
            mediaMissing: false,
          });
          changed = true;
        } else {
          updatedSources.push({
            ...src,
            mediaMissing: true,
          });
          changed = true;
        }
      }

      if (!cancelled && changed) {
        setSession((prev) => ({
          ...prev,
          sources: updatedSources,
        }));
      }
    }
    rehydrateCustomMedia();
    return () => {
      cancelled = true;
    };
    // Run once on mount to restore custom media URLs after F5
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data?.hasServerApiKey) setServerHasKey(true);
      })
      .catch(() => {});
  }, []);

  const currentSource =
    session.sources.find((s) => s.id === selectedSourceId) || session.sources[0];

  const playEvidenceClip = (ev: EvidenceItem) => {
    setActiveEvidenceId(ev.id);
    setSelectedSourceId(ev.sourceId);
    setClipStopTime(ev.endSeconds);
    setCurrentVideoTime(ev.startSeconds);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = ev.startSeconds;
        videoRef.current.play().catch(() => {});
      }
    }, 120);
  };

  const seekToTranscriptSegment = (seg: TranscriptSegment) => {
    setClipStopTime(seg.endSeconds);
    setCurrentVideoTime(seg.startSeconds);
    if (videoRef.current) {
      videoRef.current.currentTime = seg.startSeconds;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    const now = videoRef.current.currentTime;
    setCurrentVideoTime(now);
    if (clipStopTime !== null && now >= clipStopTime) {
      videoRef.current.pause();
      setClipStopTime(null);
    }
  };

  const handleResetDemo = async () => {
    localStorage.removeItem(STORAGE_KEY);
    customBlobsRef.current.clear();
    await clearAllCustomMediaFromIndexedDb();
    setSession(INITIAL_DEMO_SESSION);
    setSelectedSourceId('VID01');
    setActiveEvidenceId('EV-01');
    setAiError(null);
    setDecisionAlert(null);
    setStorageWarning(null);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI-LENS-HoSo-${session.sessionId}-v${session.sessionRevision}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const check = validateImportedSession(parsed);
        if (!check.valid || !check.session) {
          setStorageWarning(check.error || 'Tệp JSON nhập vào không hợp lệ.');
          return;
        }
        setSession(check.session);
        setSelectedSourceId(check.session.sources[0]?.id || 'VID01');
        setStorageWarning(null);
      } catch {
        setStorageWarning('Không thể đọc tệp JSON. Vui lòng kiểm tra định dạng tệp.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCustomVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const isImage = file.type.startsWith('image/');
    const meta = await inspectVideoFileMetadata(file);
    const objectUrl = URL.createObjectURL(file);
    const nextIndex = session.sources.length + 1;
    const newId = isImage ? `IMG0${nextIndex}` : `VID0${nextIndex}`;
    const mimeType = file.type || (isImage ? 'image/jpeg' : 'video/mp4');

    customBlobsRef.current.set(newId, { blob: file, mimeType });
    const savedIdb = await saveCustomMediaToIndexedDb({
      sourceId: newId,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      durationSeconds: meta.durationSeconds,
      thumbnailDataUrl: meta.thumbnailDataUrl,
      blob: file,
      createdAt: new Date().toISOString(),
    });

    if (!savedIdb) {
      setStorageWarning(
        'Trình duyệt không hỗ trợ lưu IndexedDB cho tệp tải lên; tệp chỉ tồn tại trong phiên hiện tại.'
      );
    }

    const newSource: VideoSourceItem = {
      id: newId,
      title: isImage ? `Phiếu học tập/Vở ghi: ${file.name}` : `Clip tải lên: ${file.name}`,
      stageLabel: isImage
        ? 'Minh chứng Phiếu học tập / Vở ghi (TC3, TC4, TC5)'
        : 'Video thực hành bổ sung',
      filename: file.name,
      videoUrl: objectUrl,
      thumbnailUrl: meta.thumbnailDataUrl || '/thumbnails/VID05.jpg',
      durationSeconds: meta.durationSeconds,
      sizeBytes: file.size,
      description: isImage
        ? 'Ảnh chụp vở ghi / phiếu học tập bổ sung để kiểm chứng phân tích kết quả (2.5), sai số (2.6) và vận dụng (3.2).'
        : 'Video thực hành do giáo viên/nhóm tải lên trực tiếp trong phiên (đã lưu IndexedDB).',
      expectedCriteria: isImage ? ['TC3', 'TC4', 'TC5'] : ['TC1', 'TC2', 'TC3'],
      mediaType: isImage ? 'worksheet_image' : 'video',
      mimeType,
      isCustomUpload: true,
      mediaMissing: false,
    };

    setSession((prev) => ({
      ...prev,
      sessionRevision: prev.sessionRevision + 1,
      sources: [...prev.sources, newSource],
      auditLog: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: 'Giáo viên',
          action: `Tải lên nguồn minh chứng mới (${newId})`,
          detail: `Tệp: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB, thời lượng ${
            meta.durationSeconds
          }s)`,
        },
        ...prev.auditLog,
      ],
    }));
    setSelectedSourceId(newId);
  };

  const handleDeleteSource = async (sourceId: string) => {
    const targetSource = session.sources.find((s) => s.id === sourceId);
    if (!targetSource) return;

    if (targetSource.isCustomUpload) {
      customBlobsRef.current.delete(sourceId);
      await deleteCustomMediaFromIndexedDb(sourceId);
    }

    setSession((prev) => removeSourceFromSession(prev, sourceId));

    const remainingSources = session.sources.filter((s) => s.id !== sourceId);
    if (selectedSourceId === sourceId) {
      setSelectedSourceId(remainingSources[0]?.id || '');
    }

    if (newEvSourceId === sourceId) {
      setNewEvSourceId(remainingSources[0]?.id || '');
    }

    const activeEv = session.evidences.find((e) => e.id === activeEvidenceId);
    if (activeEv && activeEv.sourceId === sourceId) {
      const remainingEvidences = session.evidences.filter((e) => e.sourceId !== sourceId);
      setActiveEvidenceId(remainingEvidences[0]?.id || null);
    }
  };

  const handleDeleteAllSources = async () => {
    customBlobsRef.current.clear();
    await clearAllCustomMediaFromIndexedDb();

    setSession((prev) => removeAllSourcesFromSession(prev));
    setSelectedSourceId('');
    setNewEvSourceId('');
    setActiveEvidenceId(null);
  };

  const handleLoadSampleVideos = () => {
    setSession((prev) =>
      restoreSampleSourcesToSession(
        prev,
        DEFAULT_VIDEO_SOURCES,
        INITIAL_DEMO_SESSION.evidences,
        INITIAL_DEMO_SESSION.decisions
      )
    );
    setSelectedSourceId('VID01');
    setNewEvSourceId('VID05');
    setActiveEvidenceId('EV-01');
  };

  const handleUpdateStudent = (code: StudentCode, updates: Partial<StudentSeatProfile>) => {
    setSession((prev) => ({
      ...prev,
      sessionRevision: prev.sessionRevision + 1,
      students: prev.students.map((st) => (st.code === code ? { ...st, ...updates } : st)),
      auditLog: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: 'Giáo viên',
          action: `Cập nhật thông tin học sinh (${code})`,
          detail: `Đã chỉnh sửa thông tin nhận diện/vị trí của học sinh ${code}.`,
        },
        ...prev.auditLog,
      ],
    }));
  };

  const handleUpdateLessonInfo = (lessonTitle: string, activityTitle: string) => {
    setSession((prev) => ({
      ...prev,
      lessonTitle: lessonTitle.trim() || prev.lessonTitle,
      activityTitle: activityTitle.trim() || prev.activityTitle,
      sessionRevision: prev.sessionRevision + 1,
      auditLog: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: 'Giáo viên',
          action: 'Cập nhật tiêu đề bài học & hoạt động',
          detail: `Tên bài: ${lessonTitle} | Hoạt động: ${activityTitle}`,
        },
        ...prev.auditLog,
      ],
    }));
  };

  const handleAnalyzeWithGemini = async (source: VideoSourceItem) => {
    setAnalyzingSourceId(source.id);
    setAiError(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (customApiKey.trim()) {
        headers['x-gemini-api-key'] = customApiKey.trim();
      }

      let customBase64: string | undefined;
      let customMimeType = source.mimeType || 'video/mp4';

      if (source.isCustomUpload) {
        let blobEntry = customBlobsRef.current.get(source.id);
        if (!blobEntry) {
          const fromIdb = await loadCustomMediaFromIndexedDb(source.id);
          if (fromIdb?.blob) {
            blobEntry = { blob: fromIdb.blob, mimeType: fromIdb.mimeType };
            customBlobsRef.current.set(source.id, blobEntry);
          }
        }
        if (!blobEntry) {
          throw new Error(
            `Không tìm thấy dữ liệu tệp gốc của ${source.id} trong bộ nhớ trình duyệt. Vui lòng tải lại tệp.`
          );
        }
        customBase64 = await blobToBase64(blobEntry.blob);
        customMimeType = blobEntry.mimeType || customMimeType;
      }

      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceId: source.id,
          customBase64,
          customMimeType,
          customDurationSeconds: source.durationSeconds,
          students: session.students,
          processingMode,
          rubricIndicators: session.rubricIndicators || undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Không thể phân tích nguồn dữ liệu qua API.');
      }

      const newEvs: EvidenceItem[] = data.evidences || [];
      setSession((prev) =>
        replaceAiEvidencesForSource(
          prev,
          source.id,
          newEvs,
          data.model || 'gemini-3.5-flash-lite',
          {
            transcriptSegments: data.transcriptSegments,
            agenticSteps: data.agenticSteps,
            processingModeUsed: data.processingModeUsed || processingMode,
          }
        )
      );
    } catch (err: any) {
      setAiError(err?.message || 'Lỗi kết nối Gemini API.');
    } finally {
      setAnalyzingSourceId(null);
    }
  };

  const handleApproveRubric = (newIndicators: RubricIndicator[]) => {
    setSession((prev) => {
      const nowIso = new Date().toISOString();
      const auditItem: AuditEvent = {
        id: `aud_${Date.now()}`,
        timestamp: nowIso,
        actor: 'Giáo viên',
        action: `Duyệt & chốt Rubric (${newIndicators.length} tiêu chí)`,
        detail: `Đã chuẩn hóa tiêu chí đánh giá cho bài học ${prev.lessonTitle}.`,
      };
      const customCodes = newIndicators
        .map((i) => i.criterionCode)
        .filter((c) => !['TC1', 'TC2', 'TC3', 'TC4', 'TC5'].includes(c));
      const updatedSources = prev.sources.map((src) => ({
        ...src,
        expectedCriteria: Array.from(new Set([...src.expectedCriteria, ...customCodes])),
      }));
      return {
        ...prev,
        sources: updatedSources,
        rubricIndicators: newIndicators,
        rubricVersion: `Tùy biến GDPT 2018 (${newIndicators.length} tiêu chí)`,
        sessionRevision: (prev.sessionRevision || 1) + 1,
        auditLog: [auditItem, ...prev.auditLog],
      };
    });
    setShowRubricWorkspace(false);
  };

  const handleAddManualEvidence = () => {
    setNewEvError(null);
    const check = validateEvidenceBounds(
      {
        sourceId: newEvSourceId,
        startSeconds: newEvStart,
        endSeconds: newEvEnd,
        criterionCode: newEvCriterion,
      },
      session.sources,
      session.rubricIndicators
    );
    if (!check.valid) {
      setNewEvError(check.error || 'Dữ liệu không hợp lệ');
      return;
    }
    if (!newEvBehavior.trim()) {
      setNewEvError('Vui lòng nhập mô tả hành vi quan sát được trong đoạn video.');
      return;
    }

    const matchedInd = (session.rubricIndicators || RUBRIC_INDICATORS).find((r) => r.criterionCode === newEvCriterion);
    const indicatorCode = matchedInd?.indicatorCode || CRITERION_TO_INDICATOR[newEvCriterion] || '2.4';
    const isTeacherStep = activeStep === 5;
    const newItem: EvidenceItem = {
      id: `EV-MAN-${Date.now().toString().slice(-3)}`,
      revision: 1,
      sourceId: newEvSourceId,
      startSeconds: newEvStart,
      endSeconds: newEvEnd,
      criterionCode: newEvCriterion,
      indicatorCode,
      subjectScope: newEvStudents.length > 0 ? 'individual' : 'unknown',
      studentCodes: newEvStudents,
      observableBehavior: newEvBehavior.trim(),
      clarity: 'clear',
      origin: activeStep === 3 ? 'student_added' : 'teacher_added',
      selfReviews: [],
      peerReviews: [],
      teacherStatus: isTeacherStep ? 'accepted' : 'pending',
      resolvedAtRevision: isTeacherStep ? 1 : undefined,
      createdAt: new Date().toISOString(),
    };

    setSession((prev) => {
      const nextEvidences = [...prev.evidences, newItem];
      return {
        ...prev,
        sessionRevision: prev.sessionRevision + 1,
        evidences: nextEvidences,
        decisions: reconcileSessionDecisions(nextEvidences, prev.decisions),
        auditLog: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: new Date().toISOString(),
            actor: activeStep === 3 ? `${selectedSelfStudent} (Bổ sung)` : 'Giáo viên',
            action: `Bổ sung minh chứng ${newItem.id} tại ${newEvSourceId}`,
            detail: `${newEvCriterion} (${formatTime(newEvStart)} - ${formatTime(
              newEvEnd
            )}): ${newEvBehavior.trim()}`,
          },
          ...prev.auditLog,
        ],
      };
    });
    setShowAddModal(false);
    setNewEvBehavior('');
  };

  // Step 3 handlers
  const handleConfirmSelfReview = (ev: EvidenceItem) => {
    setSession((prev) =>
      recordStudentSelfReview(prev, ev.id, {
        reviewerCode: selectedSelfStudent,
        recordedBy: selfRecordedBy,
        status: 'confirmed',
        note: `Học sinh ${selectedSelfStudent} xác nhận đúng hành vi và thời điểm.`,
        updatedAt: new Date().toISOString(),
      })
    );
  };

  const handleOpenProposeEdit = (ev: EvidenceItem) => {
    const existingByThisStudent = getSelfReviews(ev).find(
      (r) => r.reviewerCode === selectedSelfStudent
    );
    setEditingSelfEvId(ev.id);
    setProposeStudents(
      existingByThisStudent?.proposedStudentCodes ||
        (ev.studentCodes.includes(selectedSelfStudent)
          ? ev.studentCodes
          : [...ev.studentCodes, selectedSelfStudent])
    );
    setProposeCriterion(existingByThisStudent?.proposedCriterionCode || ev.criterionCode);
    setProposeNote(
      existingByThisStudent?.note ||
        `Đề nghị cập nhật danh sách học sinh thực hiện tại ${ev.sourceId}.`
    );
  };

  const handleSaveProposeEdit = (ev: EvidenceItem) => {
    const noteText =
      proposeNote.trim() || 'Đề nghị chỉnh sửa thông tin gán minh chứng.';
    setSession((prev) =>
      recordStudentSelfReview(prev, ev.id, {
        reviewerCode: selectedSelfStudent,
        recordedBy: selfRecordedBy,
        status: 'propose_edit',
        note: noteText,
        proposedStudentCodes: proposeStudents,
        proposedCriterionCode: proposeCriterion,
        proposedStartSeconds: ev.startSeconds,
        proposedEndSeconds: ev.endSeconds,
        updatedAt: new Date().toISOString(),
      })
    );
    setEditingSelfEvId(null);
  };

  // Step 4 handlers
  const handlePeerVerify = (ev: EvidenceItem, status: 'agreed' | 'disputed') => {
    const explicitTarget = peerTargetMap[ev.id] || undefined;
    const check = canPeerReviewerVerify(ev, selectedPeerReviewer, explicitTarget);
    if (!check.allowed) {
      alert(check.reason);
      return;
    }
    const targetLabel = explicitTarget ? ` (đối với ${explicitTarget})` : '';
    const noteText =
      peerNoteDraft[ev.id]?.trim() ||
      (status === 'agreed'
        ? `Bạn ${selectedPeerReviewer} xác nhận đồng ý với minh chứng${targetLabel}.`
        : `Bạn ${selectedPeerReviewer} báo chưa thống nhất${targetLabel} và đề nghị Giáo viên kiểm tra lại.`);

    setSession((prev) =>
      recordStudentPeerReview(prev, ev.id, {
        reviewerCode: selectedPeerReviewer,
        targetStudentCode: explicitTarget,
        recordedBy: peerRecordedBy,
        status,
        note: noteText,
        updatedAt: new Date().toISOString(),
      })
    );
  };

  // Step 5 handlers
  const handleTeacherResolveEvidence = (
    ev: EvidenceItem,
    resolution: 'accept_ai' | 'accept_student_edit' | 'reject'
  ) => {
    const activeProposal =
      getSelfReviews(ev).find((r) => r.status === 'propose_edit' && !r.resolvedByTeacher) ||
      ev.selfReview;

    if (resolution === 'accept_student_edit' && activeProposal?.status === 'propose_edit') {
      const newStudents = activeProposal.proposedStudentCodes || ev.studentCodes;
      const newCrit = activeProposal.proposedCriterionCode || ev.criterionCode;
      const matchedInd = (session.rubricIndicators || RUBRIC_INDICATORS).find((r) => r.criterionCode === newCrit);
      const indicatorCode = matchedInd?.indicatorCode || CRITERION_TO_INDICATOR[newCrit] || '2.4';
      const modifiedEv: EvidenceItem = {
        ...ev,
        studentCodes: newStudents,
        subjectScope: newStudents.length > 0 ? 'individual' : 'unknown',
        criterionCode: newCrit,
        indicatorCode,
        clarity: 'clear',
        teacherStatus: 'modified_accepted',
        teacherNote: `GV chấp nhận đề nghị bổ sung/điều chỉnh của ${activeProposal.reviewerCode}.`,
      };
      setSession((prev) =>
        applyEvidenceUpdateWithInvalidation(
          prev,
          modifiedEv,
          'Giáo viên',
          `Duyệt đề nghị sửa của ${activeProposal.reviewerCode}: Gán [${newStudents.join(
            ', '
          )}] cho ${newCrit}.`
        )
      );
      return;
    }

    const updated: EvidenceItem = {
      ...ev,
      teacherStatus: resolution === 'reject' ? 'rejected' : 'accepted',
      teacherNote:
        resolution === 'reject'
          ? 'GV bác bỏ: Minh chứng chưa đủ độ rõ ràng.'
          : 'GV xác nhận minh chứng hợp lệ.',
    };

    setSession((prev) =>
      applyEvidenceUpdateWithInvalidation(
        prev,
        updated,
        'Giáo viên',
        resolution === 'reject'
          ? `Bác bỏ thẻ minh chứng ${ev.id}`
          : `Duyệt thẻ minh chứng ${ev.id}`
      )
    );
  };

  const getCellAssistanceContext = (
    studentCode: StudentCode,
    indicatorCode: IndicatorCode
  ): AssistanceContext => {
    const key = `${studentCode}_${indicatorCode}`;
    if (assistanceDrafts[key]) {
      return assistanceDrafts[key];
    }
    const existing = session.decisions.find(
      (d) => d.studentCode === studentCode && d.indicatorCode === indicatorCode
    );
    return existing?.assistanceContext || 'unknown';
  };

  const handleSetCellAssistanceContext = (
    studentCode: StudentCode,
    indicatorCode: IndicatorCode,
    ctx: AssistanceContext
  ) => {
    const key = `${studentCode}_${indicatorCode}`;
    setAssistanceDrafts((prev) => ({ ...prev, [key]: ctx }));
  };

  const handleSetTeacherDecision = (
    studentCode: StudentCode,
    indicatorCode: IndicatorCode,
    level: CompetencyLevel,
    assistanceContext: AssistanceContext = 'unknown'
  ) => {
    setDecisionAlert(null);
    const check = canConcludeCompetencyLevel(
      session.evidences,
      studentCode,
      indicatorCode,
      level,
      assistanceContext
    );
    if (!check.allowed) {
      setDecisionAlert(
        `Không thể chốt mức ${level} cho ${studentCode} (Chỉ số ${indicatorCode}): ${check.reason}`
      );
      return;
    }

    const acceptedEvs = getAcceptedPersonalEvidences(
      session.evidences,
      studentCode,
      indicatorCode
    );
    const activeRubric =
      session.rubricIndicators && session.rubricIndicators.length > 0
        ? session.rubricIndicators
        : RUBRIC_INDICATORS;
    const rubricInd = activeRubric.find((r) => r.indicatorCode === indicatorCode) || activeRubric[0];

    const newDecision = {
      studentCode,
      indicatorCode,
      level,
      assistanceContext,
      acceptedEvidenceRefs: acceptedEvs.map((e) => ({ id: e.id, revision: e.revision })),
      rationale:
        level === 'insufficient_evidence'
          ? 'Chưa quan sát thấy đủ minh chứng cá nhân trong các clip hiện tại; cần thu thập bổ sung từ vở ghi/phiếu học tập.'
          : rubricInd.levels[level],
      isStale: false,
      decidedAt: new Date().toISOString(),
    };

    setSession((prev) => {
      const filtered = prev.decisions.filter(
        (d) => !(d.studentCode === studentCode && d.indicatorCode === indicatorCode)
      );
      return {
        ...prev,
        sessionRevision: prev.sessionRevision + 1,
        decisions: [...filtered, newDecision],
        auditLog: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: new Date().toISOString(),
            actor: 'Giáo viên',
            action: `Chốt đánh giá ${studentCode} — Chỉ số ${indicatorCode}`,
            detail:
              level === 'insufficient_evidence'
                ? 'Trạng thái: Chưa đủ minh chứng (Cần thu bổ sung)'
                : `Đạt mức ${level} [Bối cảnh: ${
                    assistanceContext === 'independent'
                      ? 'Tự thực hiện'
                      : assistanceContext === 'guided'
                      ? 'Có hướng dẫn'
                      : 'Chưa xác định'
                  }] (${acceptedEvs.map((e) => e.id).join(', ')})`,
          },
          ...prev.auditLog,
        ],
      };
    });
  };

  const metrics = computeSessionMetrics(session);

  return {
    session,
    setSession,
    activeStep,
    setActiveStep,
    selectedSourceId,
    setSelectedSourceId,
    activeEvidenceId,
    setActiveEvidenceId,
    clipStopTime,
    setClipStopTime,
    currentVideoTime,
    setCurrentVideoTime,
    storageWarning,
    setStorageWarning,
    analyzingSourceId,
    setAnalyzingSourceId,
    processingMode,
    setProcessingMode,
    aiError,
    setAiError,
    customApiKey,
    setCustomApiKey,
    showApiKeyModal,
    setShowApiKeyModal,
    serverHasKey,
    setServerHasKey,
    showRubricWorkspace,
    setShowRubricWorkspace,
    handleApproveRubric,
    rubricIndicators:
      session.rubricIndicators && session.rubricIndicators.length > 0
        ? session.rubricIndicators
        : RUBRIC_INDICATORS,
    showAddModal,
    setShowAddModal,
    newEvSourceId,
    setNewEvSourceId,
    newEvStart,
    setNewEvStart,
    newEvEnd,
    setNewEvEnd,
    newEvCriterion,
    setNewEvCriterion,
    newEvStudents,
    setNewEvStudents,
    newEvBehavior,
    setNewEvBehavior,
    newEvError,
    setNewEvError,
    selectedSelfStudent,
    setSelectedSelfStudent,
    selfRecordedBy,
    setSelfRecordedBy,
    editingSelfEvId,
    setEditingSelfEvId,
    proposeStudents,
    setProposeStudents,
    proposeCriterion,
    setProposeCriterion,
    proposeNote,
    setProposeNote,
    selectedPeerReviewer,
    setSelectedPeerReviewer,
    peerRecordedBy,
    setPeerRecordedBy,
    peerTargetMap,
    setPeerTargetMap,
    peerNoteDraft,
    setPeerNoteDraft,
    teacherFilter,
    setTeacherFilter,
    decisionAlert,
    setDecisionAlert,
    assistanceDrafts,
    setAssistanceDrafts,
    portfolioStudent,
    setPortfolioStudent,
    videoRef,
    customBlobsRef,
    playEvidenceClip,
    seekToTranscriptSegment,
    handleVideoTimeUpdate,
    handleResetDemo,
    handleExportJson,
    handleImportJson,
    handleCustomVideoUpload,
    handleDeleteSource,
    handleDeleteAllSources,
    handleLoadSampleVideos,
    handleUpdateStudent,
    handleUpdateLessonInfo,
    handleAnalyzeWithGemini,
    handleAddManualEvidence,
    handleConfirmSelfReview,
    handleOpenProposeEdit,
    handleSaveProposeEdit,
    handlePeerVerify,
    handleTeacherResolveEvidence,
    getCellAssistanceContext,
    handleSetCellAssistanceContext,
    handleSetTeacherDecision,
    metrics,
    currentSource,
  };
}

export type AiLensController = ReturnType<typeof useAiLens>;
