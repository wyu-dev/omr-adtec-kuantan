import {
  ANSWER_CHOICES,
  AnswerChoice,
  AnswerSheetTemplate,
  CircleLoc,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  NDP_DIGIT_COUNT,
  Point2D,
  QuestionBubbleRow,
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
 * Build the canonical 8-digit vertical No. NDP Pelajar bubble grid.
 * Shared across ALL custom question counts (1..100).
 */
function buildNdpGrid(): {
  box: { x: number; y: number; w: number; h: number };
  digits: StudentIdDigitGroup[];
} {
  const box = { x: 98, y: 186, w: 328, h: 242 };
  const digits: StudentIdDigitGroup[] = [];
  const startX = 136;
  const colStep = 36;
  const headerY = 216;
  const startY = 238;
  const rowStep = 20.0;
  const r = 8.0;

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
 * Dynamically generate a pixel-accurate OMR Answer Sheet template for ANY manual question count (1..100)
 * with A–D choices grouped cleanly into 5-row blocks (1–5, gap, 6–10, gap, 11–15, ...),
 * larger title & student info header, 8-digit No. NDP grid, and split bottom-right MARKAH (Betul + %) box.
 */
export function buildSheetTemplate(rawQuestionCount: number): AnswerSheetTemplate {
  const questionCount = clampQuestionCount(rawQuestionCount);
  const ndp = buildNdpGrid();
  const questions: QuestionBubbleRow[] = [];

  // Dedicated lower question zone: x=[98..802], y=[460..1034]
  const areaTop = 460;
  const areaBottom = 1034;

  let colStarts: number[];
  let colStep: number;
  let labelOffset: number;
  let r: number;
  let maxRowStep: number;
  let groupGap: number;

  if (questionCount <= 10) {
    colStarts = [385];
    colStep = 50;
    labelOffset = 44;
    r = 13.0;
    maxRowStep = 43;
    groupGap = 18;
  } else if (questionCount <= 20) {
    colStarts = [204, 560];
    colStep = 46;
    labelOffset = 40;
    r = 12.2;
    maxRowStep = 43;
    groupGap = 18;
  } else if (questionCount <= 30) {
    colStarts = [166, 400, 634];
    colStep = 36;
    labelOffset = 34;
    r = 11.4;
    maxRowStep = 43;
    groupGap = 18;
  } else if (questionCount <= 45) {
    colStarts = [166, 400, 634];
    colStep = 36;
    labelOffset = 34;
    r = 10.6;
    maxRowStep = 33.5;
    groupGap = 14;
  } else if (questionCount <= 60) {
    colStarts = [148, 330, 512, 694];
    colStep = 31;
    labelOffset = 28;
    r = 9.8;
    maxRowStep = 33.5;
    groupGap = 14;
  } else if (questionCount <= 80) {
    colStarts = [148, 330, 512, 694];
    colStep = 31;
    labelOffset = 28;
    r = 9.0;
    maxRowStep = 26.5;
    groupGap = 10;
  } else {
    colStarts = [148, 330, 512, 694];
    colStep = 31;
    labelOffset = 28;
    r = 8.2;
    maxRowStep = 22.0;
    groupGap = 7;
  }

  const numCols = colStarts.length;
  const rawRowsPerCol = Math.ceil(questionCount / numCols);
  const rowsPerCol = Math.max(5, Math.ceil(rawRowsPerCol / 5) * 5);
  const gapsPerCol = Math.max(0, Math.floor((rowsPerCol - 1) / 5));

  const availableH = areaBottom - areaTop - r * 2 - gapsPerCol * groupGap;
  const rowStep =
    rowsPerCol <= 1
      ? 0
      : Math.min(maxRowStep, Math.floor((availableH / (rowsPerCol - 1)) * 10) / 10);

  const startY = areaTop + r;

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
    id: `custom-${questionCount}q-abcd-g5`,
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
    nameCropRect: { x: 98, y: 114, w: 704, h: 64 },
    scoreBoxRect: { x: 588, y: 1046, w: 214, h: 68 },
    studentIdLayout: 'vertical',
    studentIdBox: ndp.box,
    studentIdDigits: ndp.digits,
    questions,
  };
}
