export type AnswerChoice = 'A' | 'B' | 'C' | 'D';
export const ANSWER_CHOICES: AnswerChoice[] = ['A', 'B', 'C', 'D'];

export const MIN_QUESTION_COUNT = 1;
export const MAX_QUESTION_COUNT = 100;
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
  nameCropRect: Rect2D;
  /** Bottom-right official score box (MARKAH %) */
  scoreBoxRect: Rect2D;
  studentIdLayout: 'vertical';
  studentIdBox: Rect2D;
  studentIdDigits: StudentIdDigitGroup[];
  questions: QuestionBubbleRow[];
}

export interface QuestionKeyRule {
  correctAnswers: AnswerChoice[]; // supports 1 or multiple accepted answers
  points: number;
}

export interface Quiz {
  id: string;
  name: string;
  className: string;
  /** Custom manual question count (1..100) */
  questionCount: number;
  createdAt: string;
  answerKey: Record<number, QuestionKeyRule>; // questionNumber -> rule
}

export interface Student {
  id: string;
  /** 8-digit No. NDP pelajar (e.g. "22210001") */
  studentCode: string;
  name: string;
  className: string;
}

export type BubbleMarkStatus = 'single' | 'blank' | 'multiple';

export interface QuestionDetection {
  questionNumber: number;
  selected: AnswerChoice[];
  status: BubbleMarkStatus;
  scores: Record<AnswerChoice, number>; // relative darkness 0..1
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
  /** Base64 JPEG of the cropped student name box */
  nameCropDataUrl?: string;
  /** Raw detected answers (can be manually overridden in review) */
  questions: QuestionDetection[];
  diagnostics: {
    sharpness: number;
    rotated180: boolean;
    glareWarning: boolean;
    curveScore: number;
    processingMs: number;
  };
}

export interface FiducialDetectionResult {
  /** TL, TR, BR, BL in image coordinates, or null if not locked */
  corners: [Point2D | null, Point2D | null, Point2D | null, Point2D | null];
  allLocked: boolean;
  sharpness: number;
  isSharp: boolean;
  /** Viewfinder guide rects (normalized 0..1) */
  guideRects: [Rect2D, Rect2D, Rect2D, Rect2D];
}
