export type CriterionCode = 'TC1' | 'TC2' | 'TC3' | 'TC4' | 'TC5' | (string & {});
export type IndicatorCode = '2.3' | '2.4' | '2.5' | '2.6' | '3.2' | (string & {});
export type CompetencyLevel = 'M1' | 'M2' | 'M3' | 'insufficient_evidence';
export type StudentCode = 'HS01' | 'HS02' | 'HS03' | 'HS04' | (string & {});
export type SubjectScope = 'individual' | 'group' | 'unknown';
export type ClarityLevel = 'clear' | 'partial' | 'unclear';
export type AssistanceContext = 'independent' | 'guided' | 'unknown';
export type VideoProcessingMode = 'AGENTIC' | 'STATIC';

export interface RubricIndicator {
  indicatorCode: IndicatorCode;
  criterionCode: CriterionCode;
  componentName: string;
  indicatorTitle: string;
  checklistTitle: string;
  aiLookFor: string;
  requiredEvidence: string;
  levels: {
    M1: string;
    M2: string;
    M3: string;
  };
  note?: string;
}

export interface RubricChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedRubric?: RubricIndicator[];
}

export interface StudentSeatProfile {
  code: StudentCode;
  seatLabel: string;
  visualPosition: string;
  mainObservedRole: string;
}

export interface TranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number;
  speakerCode: StudentCode | 'NHOM';
  text: string;
  acousticNote?: string;
  linkedCriteria?: CriterionCode[];
}

export interface AgenticInspectionStep {
  stepNumber: number;
  actionType: 'scan_transcript' | 'zoom_frames_high_fps' | 'cross_check_rubric';
  timeWindow: string;
  detail: string;
}

export interface VideoSourceItem {
  id: string;
  title: string;
  stageLabel: string;
  filename: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  sizeBytes: number;
  description: string;
  expectedCriteria: CriterionCode[];
  mediaType?: 'video' | 'worksheet_image';
  mimeType?: string;
  isCustomUpload?: boolean;
  mediaMissing?: boolean;
  transcriptSegments?: TranscriptSegment[];
  agenticSteps?: AgenticInspectionStep[];
  processingModeUsed?: VideoProcessingMode;
}

export interface SelfReviewRecord {
  reviewerCode: StudentCode;
  recordedBy: 'student' | 'teacher_assisted';
  status: 'confirmed' | 'propose_edit' | 'unclear';
  note: string;
  proposedStudentCodes?: StudentCode[];
  proposedCriterionCode?: CriterionCode;
  proposedStartSeconds?: number;
  proposedEndSeconds?: number;
  evidenceRevision?: number;
  resolvedByTeacher?: boolean;
  updatedAt: string;
}

export interface PeerReviewRecord {
  reviewerCode: StudentCode;
  targetStudentCode?: StudentCode;
  recordedBy: 'student' | 'teacher_assisted';
  status: 'agreed' | 'disputed' | 'unclear';
  note: string;
  evidenceRevision?: number;
  resolvedByTeacher?: boolean;
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  revision: number;
  sourceId: string;
  startSeconds: number;
  endSeconds: number;
  criterionCode: CriterionCode;
  indicatorCode: IndicatorCode;
  subjectScope: SubjectScope;
  studentCodes: StudentCode[];
  observableBehavior: string;
  spokenTranscript?: string;
  modality?: 'visual_and_audio' | 'visual_only' | 'audio_transcript';
  agenticNote?: string;
  clarity: ClarityLevel;
  origin: 'ai' | 'student_added' | 'teacher_added';
  limitations?: string;
  selfReview?: SelfReviewRecord;
  peerReview?: PeerReviewRecord;
  selfReviews?: SelfReviewRecord[];
  peerReviews?: PeerReviewRecord[];
  teacherStatus: 'pending' | 'accepted' | 'modified_accepted' | 'rejected';
  resolvedAtRevision?: number;
  teacherNote?: string;
  createdAt: string;
}

export interface TeacherDecisionItem {
  studentCode: StudentCode;
  indicatorCode: IndicatorCode;
  level: CompetencyLevel;
  assistanceContext: AssistanceContext;
  acceptedEvidenceRefs: { id: string; revision: number }[];
  rationale: string;
  isStale?: boolean;
  decidedAt: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}

export interface SessionState {
  sessionId: string;
  lessonTitle: string;
  gradeSubject: string;
  activityTitle: string;
  rubricVersion: string;
  rubricIndicators?: RubricIndicator[];
  mode: 'demo_verified' | 'live_ai' | 'custom';
  sessionRevision: number;
  students: StudentSeatProfile[];
  sources: VideoSourceItem[];
  evidences: EvidenceItem[];
  decisions: TeacherDecisionItem[];
  auditLog: AuditEvent[];
  lastAnalyzedAt?: string;
}
