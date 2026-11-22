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
 * Large, spacious 8-digit vertical No. NDP Pelajar bubble grid.
 */
function buildNdpGrid(): {
  box: { x: number; y: number; w: number; h: number };
  digits: StudentIdDigitGroup[];
} {
  const box = { x: 98, y: 190, w: 392, h: 326 };
  const digits: StudentIdDigitGroup[] = [];
  const startX = 140;
  const colStep = 44;
  const headerY = 230;
  const startY = 262;
  const rowStep = 26.8;
  const r = 10.6;

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
 * Dynamically generate a pixel-accurate OMR Answer Sheet template for ANY manual question count (1..60).
 * Adaptive bubble sizing ensures fewer questions (e.g. 10, 20, 30) automatically scale up
 * with larger bubbles and spacing so the answer zone always looks balanced and full.
 */
export function buildSheetTemplate(rawQuestionCount: number): AnswerSheetTemplate {
  const questionCount = clampQuestionCount(rawQuestionCount);
  const ndp = buildNdpGrid();
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
    // 1 centered column, extra-large bold bubbles filling the zone cleanly
    colStarts = [358];
    colStep = 64;
    labelOffset = 52;
    r = 17.5;
    maxRowStep = 76;
    groupGap = 0;
  } else if (questionCount <= 10) {
    // 1 centered column, 2 blocks of 5 with large r=16 bubbles
    colStarts = [366];
    colStep = 58;
    labelOffset = 48;
    r = 16.0;
    maxRowStep = 47.0;
    groupGap = 24;
  } else if (questionCount <= 20) {
    // 2 wide columns x up to 10 rows (2 blocks of 5 per col) with large r=15.2 bubbles
    colStarts = [194, 558];
    colStep = 54;
    labelOffset = 46;
    r = 15.2;
    maxRowStep = 47.0;
    groupGap = 24;
  } else if (questionCount <= 30) {
    // 3 generous columns x up to 10 rows (2 blocks of 5 per col) with large r=14.0 bubbles filling full height & width!
    colStarts = [164, 400, 636];
    colStep = 42;
    labelOffset = 37;
    r = 14.0;
    maxRowStep = 47.5;
    groupGap = 24;
  } else if (questionCount <= 45) {
    // 3 balanced columns x up to 15 rows (3 blocks of 5 per col)
    colStarts = [166, 402, 638];
    colStep = 38;
    labelOffset = 35;
    r = 11.4;
    maxRowStep = 30.6;
    groupGap = 15;
  } else {
    // 4 clean columns x up to 15 rows (46..60 -> 1-15, 16-30, 31-45, 46-60)
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

  // For tiny sets (1..5), gently center vertically inside the answer zone
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
    id: `custom-${questionCount}q-abcd-g5-adaptive`,
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
    nameCropRect: { x: 98, y: 114, w: 704, h: 66 },
    scoreBoxRect: { x: 588, y: 1046, w: 214, h: 68 },
    studentIdLayout: 'vertical',
    studentIdBox: ndp.box,
    studentIdDigits: ndp.digits,
    questions,
  };
}
