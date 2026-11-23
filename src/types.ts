export type AnswerChoice = 'A' | 'B' | 'C' | 'D';
export const ANSWER_CHOICES: AnswerChoice[] = ['A', 'B', 'C', 'D'];

export const COURSE_CODES = [
  'AUTO',
  'CSB',
  'FSL',
  'IT',
  'JE',
  'KIMP',
  'REL',
  'TPM',
  'TPP',
] as const;
export type CourseCode = (typeof COURSE_CODES)[number];

export const SEMESTER_CODES = ['1', '2', '3', '4', '5'] as const;
export type SemesterCode = (typeof SEMESTER_CODES)[number];

export const MIN_QUESTION_COUNT = 1;
export const MAX_QUESTION_COUNT = 60;
export const NDP_DIGIT_COUNT = 8;

export interface Point2D {
  x: number;
  y: number;
}

export interface Rect2D {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleLoc {
  x: number;
  y: number;
  r: number;
  label: string;
}

export interface QuestionBubbleRow {
  questionNumber: number; // 1-based
  labelX: number;
  labelY: number;
  bubbles: Record<AnswerChoice, CircleLoc>;
}

export interface StudentIdDigitGroup {
  digitIndex: number; // 0..7 (8-digit No. NDP)
  headerX: number;
  headerY: number;
  bubbles: CircleLoc[]; // 0..9
}

export interface InstructorProfile {
  name: string;
  signatureDataUrl?: string;
}

export interface AnswerSheetTemplate {
  id: string;
  name: string;
  questionCount: number;
  warpWidth: number;
  warpHeight: number;
  fiducialSize: number;
  /** TL, TR, BR, BL canonical centers */
  primaryFiducials: [Point2D, Point2D, Point2D, Point2D];
  /** Intermediate curve-check fiducials (Mid-Left, Mid-Right) */
  curveFiducials: Point2D[];
  curveFiducialSize: number;
  /** Orientation dot (dark) and symmetric blank check point (white) */
  orientationDot: CircleLoc;
  orientationBlank: CircleLoc;
  /** Top-right QR code box encoding quiz/answer-key identity */
  qrRect: Rect2D;
  /** Top student header info box (NAMA, NO. KAD PENGENALAN, TARIKH) */
  nameCropRect: Rect2D;
  /** Dedicated NAMA write-in strip for handwriting OCR */
  nameLineCropRect: Rect2D;
  /** Bottom-left Disemak oleh (Tandatangan & Nama Pengajar) box */
  reviewerBoxRect: Rect2D;
  /** Bottom-right KEPUTUSAN MARKAH (Jawapan Betul + Peratus) box */
  scoreBoxRect: Rect2D;
  studentIdLayout: 'vertical';
  studentIdBox: Rect2D;
  studentIdDigits: StudentIdDigitGroup[];
  /** Horizontal KURSUS bubbles (AUTO, CSB, FSL, IT, JE, KIMP, REL, TPM, TPP) */
  courseBox: Rect2D;
  courseBubbles: CircleLoc[];
  /** Horizontal SEMESTER bubbles (1, 2, 3, 4, 5) */
  semesterBox: Rect2D;
  semesterBubbles: CircleLoc[];
  questions: QuestionBubbleRow[];
}

export interface QuestionKeyRule {
  correctAnswers: AnswerChoice[];
  points: number;
}

export interface Quiz {
  id: string;
  name: string;
  className: string;
  /** Custom manual question count (1..60) */
  questionCount: number;
  createdAt: string;
  answerKey: Record<number, QuestionKeyRule>;
}

export interface Student {
  id: string;
  /** 8-digit No. NDP pelajar (e.g. "22210001") */
  studentCode: string;
  name: string;
  course: CourseCode | '';
  semester: SemesterCode | '';
}

export type BubbleMarkStatus = 'single' | 'blank' | 'multiple';

export interface QuestionDetection {
  questionNumber: number;
  selected: AnswerChoice[];
  status: BubbleMarkStatus;
  scores: Record<AnswerChoice, number>;
  confidence: number;
  isCorrect: boolean;
  pointsEarned: number;
  maxPoints: number;
  expectedAnswers: AnswerChoice[];
}

export interface GradedPaper {
  id: string;
  quizId: string;
  scannedAt: string;
  /** Decoded 8-digit No. NDP */
  studentCode: string;
  /** Decoded horizontal KURSUS bubble */
  detectedCourse: CourseCode | '';
  /** Decoded horizontal SEMESTER bubble */
  detectedSemester: SemesterCode | '';
  /** Handwritten student name extracted via OCR */
  ocrName?: string;
  /** Quiz auto-paired from top-right QR code (if detected) */
  qrMatchedQuizId?: string;
  qrMatchedQuizName?: string;
  studentId?: string;
  studentNameOverride?: string;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  multiCount: number;
  /** Base64 JPEG of the warped sheet with visual grading overlay */
  annotatedImageDataUrl: string;
  /** Base64 JPEG of the cropped student header box */
  nameCropDataUrl?: string;
  /** Base64 PNG of the isolated handwritten NAMA line (for OCR) */
  nameLineDataUrl?: string;
  questions: QuestionDetection[];
  diagnostics: {
    sharpness: number;
    rotated180: boolean;
    glareWarning: boolean;
    curveScore: number;
    processingMs: number;
    qrRaw?: string | null;
  };
}

export interface FiducialDetectionResult {
  corners: [Point2D | null, Point2D | null, Point2D | null, Point2D | null];
  allLocked: boolean;
  sharpness: number;
  isSharp: boolean;
  guideRects: [Rect2D, Rect2D, Rect2D, Rect2D];
}
