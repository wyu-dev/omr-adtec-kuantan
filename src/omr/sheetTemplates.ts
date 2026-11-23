import {
  ANSWER_CHOICES,
  AnswerChoice,
  AnswerSheetTemplate,
  CircleLoc,
  COURSE_CODES,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  NDP_DIGIT_COUNT,
  Point2D,
  QuestionBubbleRow,
  SEMESTER_CODES,
  StudentIdDigitGroup,
} from '../types';

const WARP_W = 900;
const WARP_H = 1200;
const FID_SIZE = 44;
const PRIMARY_FIDUCIALS: [Point2D, Point2D, Point2D, Point2D] = [
  { x: 55, y: 55 },     // Top-Left
  { x: 845, y: 55 },    // Top-Right
  { x: 845, y: 1145 },  // Bottom-Right
  { x: 55, y: 1145 },   // Bottom-Left
];
const CURVE_FIDUCIALS: Point2D[] = [
  { x: 55, y: 600 },
  { x: 845, y: 600 },
];
const ORIENTATION_DOT: CircleLoc = { x: 118, y: 55, r: 9, label: 'ORI' };
const ORIENTATION_BLANK: CircleLoc = { x: 782, y: 1145, r: 9, label: 'BLK' };

export function clampQuestionCount(count: number): number {
  const n = Math.round(Number(count) || 20);
  return Math.max(MIN_QUESTION_COUNT, Math.min(MAX_QUESTION_COUNT, n));
}

function makeQuestionRow(
  questionNumber: number,
  startX: number,
  y: number,
  colStep: number,
  r: number,
  labelOffsetX: number
): QuestionBubbleRow {
  const bubbles = {} as Record<AnswerChoice, CircleLoc>;
  ANSWER_CHOICES.forEach((ch, idx) => {
    bubbles[ch] = {
      x: startX + idx * colStep,
      y,
      r,
      label: ch,
    };
  });
  return {
    questionNumber,
    labelX: startX - labelOffsetX,
    labelY: y,
    bubbles,
  };
}

/**
 * Large 8-digit vertical No. NDP Pelajar bubble grid (Left block: x=98..482, y=186..514).
 */
function buildNdpGrid(): {
  box: { x: number; y: number; w: number; h: number };
  digits: StudentIdDigitGroup[];
} {
  const box = { x: 98, y: 186, w: 384, h: 328 };
  const digits: StudentIdDigitGroup[] = [];
  const startX = 139;
  const colStep = 43;
  const headerY = 224;
  const startY = 256;
  const rowStep = 26.8;
  const r = 10.4;

  for (let d = 0; d < NDP_DIGIT_COUNT; d++) {
    const cx = startX + d * colStep;
    const bubbles: CircleLoc[] = [];
    for (let v = 0; v <= 9; v++) {
      bubbles.push({
        x: cx,
        y: startY + v * rowStep,
        r,
        label: String(v),
      });
    }
    digits.push({
      digitIndex: d,
      headerX: cx,
      headerY,
      bubbles,
    });
  }

  return { box, digits };
}

/**
 * Horizontal KURSUS bubble row (Right-Top: x=496..802, y=186..272)
 * AUTO, CSB, FSL, IT, JE, KIMP, REL, TPM, TPP
 */
function buildCourseBubbles(): {
  box: { x: number; y: number; w: number; h: number };
  bubbles: CircleLoc[];
} {
  const box = { x: 496, y: 186, w: 306, h: 86 };
  const startX = 517;
  const step = 33;
  const cy = 249;
  const r = 9.8;
  const bubbles: CircleLoc[] = COURSE_CODES.map((code, idx) => ({
    x: startX + idx * step,
    y: cy,
    r,
    label: code,
  }));
  return { box, bubbles };
}

/**
 * Horizontal SEMESTER bubble row (Right-Mid: x=496..802, y=282..362)
 * 1, 2, 3, 4, 5
 */
function buildSemesterBubbles(): {
  box: { x: number; y: number; w: number; h: number };
  bubbles: CircleLoc[];
} {
  const box = { x: 496, y: 282, w: 306, h: 80 };
  const startX = 543;
  const step = 53;
  const cy = 337;
  const r = 11.5;
  const bubbles: CircleLoc[] = SEMESTER_CODES.map((sem, idx) => ({
    x: startX + idx * step,
    y: cy,
    r,
    label: sem,
  }));
  return { box, bubbles };
}

/**
 * Dynamically generate a pixel-accurate OMR Answer Sheet template for ANY manual question count (1..60):
 * - Top-right QR code box (`qrRect`) for automatic quiz/key pairing
 * - 3-field top info box (`NAMA`, `NO. KAD PENGENALAN`, `TARIKH`) + dedicated NAMA line OCR crop
 * - Left: 8-digit No. NDP bubbles | Right: Horizontal KURSUS (9) + Horizontal SEMESTER (1-5) + Arahan
 * - Lower grid: Dynamic 1..60 A–D questions grouped in 5-row blocks with adaptive bubble sizing
 * - Footer: Left `Disemak oleh:` box + Right `KEPUTUSAN MARKAH` (`Jawapan Betul` + `Peratus`) box
 */
export function buildSheetTemplate(rawQuestionCount: number): AnswerSheetTemplate {
  const questionCount = clampQuestionCount(rawQuestionCount);
  const ndp = buildNdpGrid();
  const course = buildCourseBubbles();
  const semester = buildSemesterBubbles();
  const questions: QuestionBubbleRow[] = [];

  // Dedicated lower question zone: x=[98..802], y=[552..1034]
  const areaTop = 552;
  const areaBottom = 1034;

  let colStarts: number[];
  let colStep: number;
  let labelOffset: number;
  let r: number;
  let maxRowStep: number;
  let groupGap: number;

  if (questionCount <= 5) {
    colStarts = [358];
    colStep = 64;
    labelOffset = 52;
    r = 17.5;
    maxRowStep = 76;
    groupGap = 0;
  } else if (questionCount <= 10) {
    colStarts = [366];
    colStep = 58;
    labelOffset = 48;
    r = 16.0;
    maxRowStep = 47.0;
    groupGap = 24;
  } else if (questionCount <= 20) {
    colStarts = [194, 558];
    colStep = 54;
    labelOffset = 46;
    r = 15.2;
    maxRowStep = 47.0;
    groupGap = 24;
  } else if (questionCount <= 30) {
    colStarts = [164, 400, 636];
    colStep = 42;
    labelOffset = 37;
    r = 14.0;
    maxRowStep = 47.5;
    groupGap = 24;
  } else if (questionCount <= 45) {
    colStarts = [166, 402, 638];
    colStep = 38;
    labelOffset = 35;
    r = 11.4;
    maxRowStep = 30.6;
    groupGap = 15;
  } else {
    colStarts = [148, 330, 512, 694];
    colStep = 31;
    labelOffset = 28;
    r = 10.2;
    maxRowStep = 30.8;
    groupGap = 14;
  }

  const numCols = colStarts.length;
  const rawRowsPerCol = Math.ceil(questionCount / numCols);
  const rowsPerCol = questionCount <= 5 ? questionCount : Math.max(5, Math.ceil(rawRowsPerCol / 5) * 5);
  const gapsPerCol = Math.max(0, Math.floor((rowsPerCol - 1) / 5));

  const availableH = areaBottom - areaTop - r * 2 - gapsPerCol * groupGap;
  const rowStep =
    rowsPerCol <= 1
      ? 0
      : Math.min(maxRowStep, Math.floor((availableH / (rowsPerCol - 1)) * 10) / 10);

  const totalUsedH = (rowsPerCol - 1) * rowStep + gapsPerCol * groupGap + r * 2;
  const startY =
    questionCount <= 5
      ? areaTop + r + Math.max(0, (areaBottom - areaTop - totalUsedH) * 0.35)
      : areaTop + r;

  for (let i = 0; i < questionCount; i++) {
    const colIdx = Math.floor(i / rowsPerCol);
    const rowIdx = i % rowsPerCol;
    const blockIdx = Math.floor(rowIdx / 5);
    const qNum = i + 1;
    const y = startY + rowIdx * rowStep + blockIdx * groupGap;
    questions.push(
      makeQuestionRow(
        qNum,
        colStarts[colIdx],
        y,
        colStep,
        r,
        labelOffset
      )
    );
  }

  return {
    id: `custom-${questionCount}q-v3-qr-kursus-sem`,
    name: `Borang OMR ${questionCount} Soalan (A–D)`,
    questionCount,
    warpWidth: WARP_W,
    warpHeight: WARP_H,
    fiducialSize: FID_SIZE,
    primaryFiducials: PRIMARY_FIDUCIALS,
    curveFiducials: CURVE_FIDUCIALS,
    curveFiducialSize: 22,
    orientationDot: ORIENTATION_DOT,
    orientationBlank: ORIENTATION_BLANK,
    qrRect: { x: 706, y: 10, w: 92, h: 92 },
    nameCropRect: { x: 98, y: 112, w: 704, h: 66 },
    nameLineCropRect: { x: 162, y: 115, w: 626, h: 28 },
    reviewerBoxRect: { x: 98, y: 1046, w: 476, h: 68 },
    scoreBoxRect: { x: 588, y: 1046, w: 214, h: 68 },
    studentIdLayout: 'vertical',
    studentIdBox: ndp.box,
    studentIdDigits: ndp.digits,
    courseBox: course.box,
    courseBubbles: course.bubbles,
    semesterBox: semester.box,
    semesterBubbles: semester.bubbles,
    questions,
  };
}
