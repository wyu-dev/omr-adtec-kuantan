import {
  ANSWER_CHOICES,
  AnswerChoice,
  AnswerSheetTemplate,
  BubbleMarkStatus,
  CircleLoc,
  COURSE_CODES,
  CourseCode,
  FiducialDetectionResult,
  GradedPaper,
  InstructorProfile,
  Point2D,
  QuestionDetection,
  Quiz,
  Rect2D,
  SEMESTER_CODES,
  SemesterCode,
} from '../types';
import { buildSheetTemplate } from './sheetTemplates';
import { decodeQrFromWarpedSheet, parseQuizQrPayload } from '../utils/qrHelper';

/** Convert RGBA ImageData to single-channel grayscale Uint8Array */
export function toGrayscale(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    // Rec. 601 luminance
    gray[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return gray;
}

/** Build integral image (summed-area table) for O(1) box mean adaptive thresholding */
export function buildIntegralImage(gray: Uint8Array, w: number, h: number): Float64Array {
  const stride = w + 1;
  const sat = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const gRow = y * w;
    const prevRow = y * stride;
    const currRow = (y + 1) * stride;
    for (let x = 0; x < w; x++) {
      rowSum += gray[gRow + x];
      sat[currRow + x + 1] = sat[prevRow + x + 1] + rowSum;
    }
  }
  return sat;
}

function boxMean(
  sat: Float64Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const ax = Math.max(0, Math.min(w, x0));
  const ay = Math.max(0, Math.min(h, y0));
  const bx = Math.max(ax + 1, Math.min(w, x1));
  const by = Math.max(ay + 1, Math.min(h, y1));
  const stride = w + 1;
  const sum =
    sat[by * stride + bx] -
    sat[ay * stride + bx] -
    sat[by * stride + ax] +
    sat[ay * stride + ax];
  return sum / ((bx - ax) * (by - ay));
}

/**
 * Laplacian variance sharpness estimator (modeled on SheetReader::getSharpness2023).
 * Samples a central stride grid for fast 30fps live evaluation.
 */
export function computeSharpness(gray: Uint8Array, w: number, h: number): number {
  const x0 = Math.floor(w * 0.15);
  const x1 = Math.floor(w * 0.85);
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.floor(h * 0.85);
  const step = Math.max(2, Math.floor(Math.min(w, h) / 180));

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = y0; y < y1; y += step) {
    const row = y * w;
    for (let x = x0; x < x1; x += step) {
      const idx = row + x;
      const lap =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - w] -
        gray[idx + w];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

interface CandidateSquare {
  cx: number;
  cy: number;
  w: number;
  h: number;
  area: number;
  score: number;
}

/**
 * Connected-component solid dark square finder inside a given ROI
 * (modeled on squareFinder::findSquareInRoiMat & findExactSquare).
 */
export function findSquareInRoi(
  gray: Uint8Array,
  sat: Float64Array,
  imgW: number,
  imgH: number,
  roi: Rect2D,
  expectedSideMin: number,
  expectedSideMax: number,
  preferCorner?: 'TL' | 'TR' | 'BR' | 'BL'
): CandidateSquare | null {
  const rx = Math.max(2, Math.floor(roi.x));
  const ry = Math.max(2, Math.floor(roi.y));
  const rw = Math.min(imgW - rx - 2, Math.floor(roi.w));
  const rh = Math.min(imgH - ry - 2, Math.floor(roi.h));
  if (rw < 12 || rh < 12) return null;

  const winRadius = Math.max(18, Math.round(expectedSideMax * 1.1));
  const mask = new Uint8Array(rw * rh);

  // Adaptive dark thresholding using integral image
  for (let y = 0; y < rh; y++) {
    const gy = ry + y;
    const gRow = gy * imgW;
    const mRow = y * rw;
    for (let x = 0; x < rw; x++) {
      const gx = rx + x;
      const localMean = boxMean(
        sat,
        imgW,
        imgH,
        gx - winRadius,
        gy - winRadius,
        gx + winRadius,
        gy + winRadius
      );
      const val = gray[gRow + gx];
      // Pixel is dark if substantially darker than local neighborhood and not bright gray
      if (val < localMean - 26 && val < 155) {
        mask[mRow + x] = 1;
      }
    }
  }

  const visited = new Uint8Array(rw * rh);
  const queue = new Int32Array(rw * rh);
  const minArea = expectedSideMin * expectedSideMin * 0.55;
  const maxArea = expectedSideMax * expectedSideMax * 1.45;

  let best: CandidateSquare | null = null;

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const start = y * rw + x;
      if (mask[start] !== 1 || visited[start]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let minX = x,
        maxX = x,
        minY = y,
        maxY = y;
      let sumX = 0,
        sumY = 0;
      let area = 0;

      while (head < tail) {
        const idx = queue[head++];
        const cx = idx % rw;
        const cy = (idx / rw) | 0;
        area++;
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // 4-connected neighbors
        if (cx > 0) {
          const n = idx - 1;
          if (mask[n] === 1 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cx + 1 < rw) {
          const n = idx + 1;
          if (mask[n] === 1 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cy > 0) {
          const n = idx - rw;
          if (mask[n] === 1 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (cy + 1 < rh) {
          const n = idx + rw;
          if (mask[n] === 1 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      if (area < minArea || area > maxArea) continue;
      // Reject blobs touching the ROI boundary (often desk edge or shadow)
      if (minX <= 0 || minY <= 0 || maxX >= rw - 1 || maxY >= rh - 1) continue;

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw < expectedSideMin * 0.7 || bh < expectedSideMin * 0.7) continue;
      if (bw > expectedSideMax * 1.35 || bh > expectedSideMax * 1.35) continue;

      const aspect = bw / bh;
      if (aspect < 0.65 || aspect > 1.55) continue;

      const fillRatio = area / (bw * bh);
      // Solid square has fillRatio close to 0.85..1.0 (even slightly rotated ~0.68+)
      if (fillRatio < 0.64) continue;

      // Verify bright white quiet-zone surround vs dark interior
      const absMinX = rx + minX;
      const absMinY = ry + minY;
      const absMaxX = rx + maxX + 1;
      const absMaxY = ry + maxY + 1;
      const innerMean = boxMean(
        sat,
        imgW,
        imgH,
        absMinX + Math.floor(bw * 0.2),
        absMinY + Math.floor(bh * 0.2),
        absMaxX - Math.floor(bw * 0.2),
        absMaxY - Math.floor(bh * 0.2)
      );

      const pad = Math.max(4, Math.round(Math.max(bw, bh) * 0.35));
      const outerBox = boxMean(
        sat,
        imgW,
        imgH,
        absMinX - pad,
        absMinY - pad,
        absMaxX + pad,
        absMaxY + pad
      );
      const outerArea = (bw + 2 * pad) * (bh + 2 * pad);
      const ringMean = (outerBox * outerArea - innerMean * (bw * bh)) / Math.max(1, outerArea - bw * bh);
      const contrast = ringMean - innerMean;
      if (contrast < 42 || innerMean > 125) continue;

      // Score candidate: prefer high solidity, square aspect, strong contrast, larger fiducial area, and expected corner bias
      const aspectPenalty = Math.abs(1 - aspect);
      const solidityScore = Math.min(1, fillRatio / 0.92);
      const contrastScore = Math.min(1, contrast / 140);
      const areaNorm = Math.min(1, Math.sqrt(area) / Math.max(1, expectedSideMax * 0.55));
      let cornerBonus = 0;
      const relX = sumX / area / rw;
      const relY = sumY / area / rh;
      if (preferCorner === 'TL') cornerBonus = (1 - relX) * 0.22 + (1 - relY) * 0.22;
      if (preferCorner === 'TR') cornerBonus = relX * 0.22 + (1 - relY) * 0.22;
      if (preferCorner === 'BR') cornerBonus = relX * 0.22 + relY * 0.22;
      if (preferCorner === 'BL') cornerBonus = (1 - relX) * 0.22 + relY * 0.22;

      const score =
        solidityScore * 0.35 +
        contrastScore * 0.25 +
        areaNorm * 0.25 +
        (1 - aspectPenalty) * 0.15 +
        cornerBonus;
      if (!best || score > best.score) {
        best = {
          cx: rx + sumX / area,
          cy: ry + sumY / area,
          w: bw,
          h: bh,
          area,
          score,
        };
      }
    }
  }

  return best;
}

/**
 * Viewfinder guide boxes in normalized coordinates (0..1) matching 3:4 portrait sheet framing.
 */
export function getViewfinderGuides(frameW: number, frameH: number): [Rect2D, Rect2D, Rect2D, Rect2D] {
  const frameAspect = frameW / frameH;
  const targetAspect = 0.72; // slightly narrower than 3:4 to give margin
  let sheetW: number;
  let sheetH: number;
  if (frameAspect > targetAspect) {
    sheetH = 0.86;
    sheetW = (sheetH * frameH * targetAspect) / frameW;
  } else {
    sheetW = 0.88;
    sheetH = (sheetW * frameW) / (targetAspect * frameH);
  }
  const left = (1 - sheetW) / 2;
  const top = (1 - sheetH) / 2;
  const boxW = Math.min(0.24, sheetW * 0.27);
  const boxH = Math.min(0.20, sheetH * 0.20);

  return [
    { x: left, y: top, w: boxW, h: boxH },                                     // TL
    { x: left + sheetW - boxW, y: top, w: boxW, h: boxH },                     // TR
    { x: left + sheetW - boxW, y: top + sheetH - boxH, w: boxW, h: boxH },     // BR
    { x: left, y: top + sheetH - boxH, w: boxW, h: boxH },                     // BL
  ];
}

/**
 * Live camera frame fiducial tracker (modeled on Viewfinder + SheetReader::ProcessFram).
 */
export function detectViewfinderFiducials(
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): FiducialDetectionResult {
  const gray = toGrayscale(rgba, w, h);
  const sat = buildIntegralImage(gray, w, h);
  const guideRects = getViewfinderGuides(w, h);
  const minDim = Math.min(w, h);
  const sideMin = Math.max(8, minDim * 0.018);
  const sideMax = Math.max(24, minDim * 0.095);

  const labels: Array<'TL' | 'TR' | 'BR' | 'BL'> = ['TL', 'TR', 'BR', 'BL'];
  const corners: [Point2D | null, Point2D | null, Point2D | null, Point2D | null] = [
    null,
    null,
    null,
    null,
  ];

  for (let i = 0; i < 4; i++) {
    const g = guideRects[i];
    const roi: Rect2D = {
      x: g.x * w,
      y: g.y * h,
      w: g.w * w,
      h: g.h * h,
    };
    const found = findSquareInRoi(gray, sat, w, h, roi, sideMin, sideMax, labels[i]);
    if (found) {
      corners[i] = { x: found.cx, y: found.cy };
    }
  }

  let allLocked = corners.every((c) => c !== null);
  // Sanity geometry check: ensure quadrilateral is convex and reasonable size
  if (allLocked) {
    const [tl, tr, br, bl] = corners as [Point2D, Point2D, Point2D, Point2D];
    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
    const ratioW = Math.min(topW, botW) / Math.max(topW, botW);
    const ratioH = Math.min(leftH, rightH) / Math.max(leftH, rightH);
    if (ratioW < 0.72 || ratioH < 0.72 || topW < w * 0.25 || leftH < h * 0.35) {
      allLocked = false;
    }
  }

  const sharpness = computeSharpness(gray, w, h);
  return {
    corners,
    allLocked,
    sharpness,
    isSharp: sharpness >= 45,
    guideRects,
  };
}

/**
 * Full-frame fiducial detection for uploaded static photos or loosely framed captures.
 */
export function detectFullFrameFiducials(
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): [Point2D, Point2D, Point2D, Point2D] | null {
  const gray = toGrayscale(rgba, w, h);
  const sat = buildIntegralImage(gray, w, h);
  const minDim = Math.min(w, h);
  const sideMin = Math.max(8, minDim * 0.015);
  const sideMax = Math.max(30, minDim * 0.11);

  const halfW = w * 0.52;
  const halfH = h * 0.52;
  const quads: Array<{ roi: Rect2D; corner: 'TL' | 'TR' | 'BR' | 'BL' }> = [
    { roi: { x: 0, y: 0, w: halfW, h: halfH }, corner: 'TL' },
    { roi: { x: w - halfW, y: 0, w: halfW, h: halfH }, corner: 'TR' },
    { roi: { x: w - halfW, y: h - halfH, w: halfW, h: halfH }, corner: 'BR' },
    { roi: { x: 0, y: h - halfH, w: halfW, h: halfH }, corner: 'BL' },
  ];

  const found: Point2D[] = [];
  for (const q of quads) {
    const sq = findSquareInRoi(gray, sat, w, h, q.roi, sideMin, sideMax, q.corner);
    if (!sq) return null;
    found.push({ x: sq.cx, y: sq.cy });
  }
  return [found[0], found[1], found[2], found[3]];
}

/**
 * Solve 8-DOF projective homography H such that H * [dx, dy, 1]^T ~ [sx, sy, 1]^T.
 * Maps canonical template coordinates (dst) -> source camera image coordinates (src)
 * for crisp inverse bilinear perspective warping.
 */
export function solveHomography(
  dst: [Point2D, Point2D, Point2D, Point2D],
  src: [Point2D, Point2D, Point2D, Point2D]
): number[] {
  // Build 8x9 augmented matrix A * h = b
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const x = dst[i].x;
    const y = dst[i].y;
    const u = src[i].x;
    const v = src[i].y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < 8; r++) {
      const v = Math.abs(A[r][col]);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmp = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmp;
    }
    const pivot = A[col][col] || 1e-12;
    for (let c = col; c < 9; c++) A[col][c] /= pivot;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      for (let c = col; c < 9; c++) {
        A[r][c] -= factor * A[col][c];
      }
    }
  }

  return [
    A[0][8], A[1][8], A[2][8],
    A[3][8], A[4][8], A[5][8],
    A[6][8], A[7][8], 1,
  ];
}

/** Perspective warp source ImageData into canonical template dimensions */
export function warpPerspective(
  srcData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  H: number[]
): ImageData {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H;

  for (let y = 0; y < dstH; y++) {
    const rowOff = y * dstW * 4;
    for (let x = 0; x < dstW; x++) {
      const denom = h6 * x + h7 * y + h8;
      const sx = (h0 * x + h1 * y + h2) / denom;
      const sy = (h3 * x + h4 * y + h5) / denom;
      const outIdx = rowOff + x * 4;

      if (sx < 0 || sy < 0 || sx >= srcW - 1 || sy >= srcH - 1) {
        out[outIdx] = 245;
        out[outIdx + 1] = 245;
        out[outIdx + 2] = 245;
        out[outIdx + 3] = 255;
        continue;
      }

      const x0 = sx | 0;
      const y0 = sy | 0;
      const dx = sx - x0;
      const dy = sy - y0;
      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx * dy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;

      out[outIdx] =
        srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      out[outIdx + 1] =
        srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
      out[outIdx + 2] =
        srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
      out[outIdx + 3] = 255;
    }
  }
  return new ImageData(out, dstW, dstH);
}

/** Rotate an ImageData 180 degrees in-place */
function rotateImageData180(img: ImageData): ImageData {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const srcIdx = i * 4;
    const dstIdx = (total - 1 - i) * 4;
    out[dstIdx] = data[srcIdx];
    out[dstIdx + 1] = data[srcIdx + 1];
    out[dstIdx + 2] = data[srcIdx + 2];
    out[dstIdx + 3] = 255;
  }
  return new ImageData(out, width, height);
}

/**
 * Sample mean intensity inside a circle of radius `r` centered at `(cx, cy)`.
 */
function sampleCircleMean(
  gray: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number
): number {
  const rSq = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    const row = y * w;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dySq <= rSq) {
        sum += gray[row + x];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 255;
}

/**
 * DTrans-style bubble darkness analyzer:
 * 1. Measures local paper background brightness in an outer annulus (immune to shadows/uneven lighting).
 * 2. Performs local center offset refinement (±3px) to handle minor print/warp jitter.
 * 3. Computes normalized relative darkness = (localPaperBg - innerMean) / localPaperBg.
 */
function measureBubbleDarkness(
  gray: Uint8Array,
  w: number,
  h: number,
  circle: CircleLoc
): { relativeDarkness: number; localBg: number; innerMean: number } {
  const { x: cx, y: cy, r } = circle;

  // 1. Sample outer paper annulus [1.35r .. 1.85r] and take 75th percentile (pure paper, ignores borders/text)
  const bgSamples: number[] = [];
  const rInSq = (r * 1.32) ** 2;
  const rOutSq = (r * 1.85) ** 2;
  const x0 = Math.max(0, Math.floor(cx - r * 1.9));
  const x1 = Math.min(w - 1, Math.ceil(cx + r * 1.9));
  const y0 = Math.max(0, Math.floor(cy - r * 1.9));
  const y1 = Math.min(h - 1, Math.ceil(cy + r * 1.9));
  for (let y = y0; y <= y1; y += 2) {
    const dy = y - cy;
    const dySq = dy * dy;
    const row = y * w;
    for (let x = x0; x <= x1; x += 2) {
      const dx = x - cx;
      const dSq = dx * dx + dySq;
      if (dSq >= rInSq && dSq <= rOutSq) {
        bgSamples.push(gray[row + x]);
      }
    }
  }
  bgSamples.sort((a, b) => a - b);
  const localBg =
    bgSamples.length > 0 ? bgSamples[Math.floor(bgSamples.length * 0.75)] : 220;

  // 2. Local center offset refinement (±2px step 1) on core interior (0.64r ignores the thin printed outline ring!)
  const innerR = Math.max(3, r * 0.64);
  let bestInnerMean = sampleCircleMean(gray, w, h, cx, cy, innerR);
  const shifts = [-2, -1, 0, 1, 2];
  for (const dy of shifts) {
    for (const dx of shifts) {
      if (dx === 0 && dy === 0) continue;
      const m = sampleCircleMean(gray, w, h, cx + dx, cy + dy, innerR);
      if (m < bestInnerMean) {
        bestInnerMean = m;
      }
    }
  }

  const denom = Math.max(50, localBg);
  const relativeDarkness = Math.max(0, Math.min(1, (localBg - bestInnerMean) / denom));
  return { relativeDarkness, localBg, innerMean: bestInnerMean };
}

/** Check mid-edge curve fiducials (modeled on SheetReader::CurveCheck) */
function evaluateCurveQuality(
  gray: Uint8Array,
  w: number,
  h: number,
  template: AnswerSheetTemplate
): number {
  let hits = 0;
  for (const cf of template.curveFiducials) {
    const inner = sampleCircleMean(gray, w, h, cf.x, cf.y, template.curveFiducialSize * 0.35);
    const outer = sampleCircleMean(gray, w, h, cf.x + template.curveFiducialSize * 1.2, cf.y, 8);
    if (outer - inner > 40 && inner < 130) {
      hits++;
    }
  }
  return template.curveFiducials.length > 0 ? hits / template.curveFiducials.length : 1;
}

/**
 * Compute adaptive sheet-wide darkness baseline & mark threshold
 * (modeled on DTrans::getRelativeDarknessForAllAnswers + distStatsForCollection).
 */
function computeAdaptiveThreshold(allDarknessValues: number[]): {
  baseline: number;
  markThreshold: number;
} {
  if (allDarknessValues.length === 0) {
    return { baseline: 0.08, markThreshold: 0.30 };
  }
  const sorted = [...allDarknessValues].sort((a, b) => a - b);
  // Most bubbles (~80%) are unmarked! Median of lower 70% accurately estimates empty bubble darkness (including faint printed letter)
  const lowSlice = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.72)));
  const baseline = lowSlice[Math.floor(lowSlice.length * 0.5)];
  const p95Low = lowSlice[Math.floor(lowSlice.length * 0.95)];
  const spread = Math.max(0.04, p95Low - baseline);

  // Threshold sits cleanly above unmarked noise floor, clamped to sane OMR bounds
  const markThreshold = Math.max(0.24, Math.min(0.46, baseline + Math.max(0.16, spread * 3.0)));
  return { baseline, markThreshold };
}

/**
 * Classify bubbles in a single question row (or ID digit group) using both global threshold
 * and per-row relative gap (immune to light pencil vs heavy marker differences).
 */
function classifyRowScores<T extends string>(
  keys: T[],
  scores: Record<T, number>,
  baseline: number,
  globalThreshold: number
): { selected: T[]; status: BubbleMarkStatus; confidence: number } {
  const entries = keys
    .map((k) => ({ key: k, score: scores[k] }))
    .sort((a, b) => b.score - a.score);

  const top = entries[0];
  const second = entries[1];
  const rowMedian = entries[Math.floor(entries.length * 0.6)]?.score ?? baseline;

  // Dynamic row threshold ensures faint marks stand out clearly from their own row's blank bubbles
  const effectiveThresh = Math.max(globalThreshold * 0.85, rowMedian + 0.14);

  const marked = entries.filter(
    (e) =>
      e.score >= effectiveThresh &&
      // Secondary marks must also be reasonably close to the strongest mark (filters light erasures!)
      e.score >= top.score * 0.62 &&
      e.score - rowMedian >= 0.13
  );

  if (marked.length === 0) {
    const confidence = Math.max(0, Math.min(1, 1 - (top.score - rowMedian) / 0.25));
    return { selected: [], status: 'blank', confidence };
  }

  if (marked.length === 1) {
    const gap = top.score - (second?.score ?? rowMedian);
    const confidence = Math.max(0.4, Math.min(1, gap / 0.25));
    return { selected: [marked[0].key], status: 'single', confidence };
  }

  return {
    selected: marked.map((m) => m.key).sort(),
    status: 'multiple',
    confidence: 0.75,
  };
}

/**
 * Full end-to-end OMR grading pipeline:
 * 1. Homography perspective warp from detected 4 corner fiducials
 * 2. Orientation dot verification + auto-180° flip
 * 3. Top-right QR code decode -> automatic Quiz & Answer Key pairing!
 * 4. Curve & glare diagnostics
 * 5. 8-digit No. NDP + Horizontal KURSUS + Horizontal SEMESTER bubble decoding
 * 6. Question bubble scoring & grading against the auto-paired (or fallback) Quiz answer key
 * 7. Visual annotation overlay + Header/Name line crops for handwriting OCR
 */
export function processAndGradeSheet(
  sourceImageData: ImageData,
  corners: [Point2D, Point2D, Point2D, Point2D],
  fallbackTemplate: AnswerSheetTemplate,
  fallbackQuiz: Quiz,
  sharpness = 120,
  options?: {
    allQuizzes?: Quiz[];
    instructor?: InstructorProfile;
    allowQrAutoPair?: boolean;
  }
): GradedPaper {
  const t0 = performance.now();

  // 1. Solve Homography & Warp into canonical 900x1200 template space
  const H = solveHomography(fallbackTemplate.primaryFiducials, corners);
  let warped = warpPerspective(
    sourceImageData.data,
    sourceImageData.width,
    sourceImageData.height,
    fallbackTemplate.warpWidth,
    fallbackTemplate.warpHeight,
    H
  );

  let gray = toGrayscale(warped.data, warped.width, warped.height);

  // 2. Orientation check (auto-rotate 180° if sheet was placed upside down)
  const oriDotMean = sampleCircleMean(
    gray,
    warped.width,
    warped.height,
    fallbackTemplate.orientationDot.x,
    fallbackTemplate.orientationDot.y,
    fallbackTemplate.orientationDot.r * 0.7
  );
  const oriBlankMean = sampleCircleMean(
    gray,
    warped.width,
    warped.height,
    fallbackTemplate.orientationBlank.x,
    fallbackTemplate.orientationBlank.y,
    fallbackTemplate.orientationBlank.r * 0.7
  );
  let rotated180 = false;
  if (oriBlankMean + 25 < oriDotMean) {
    warped = rotateImageData180(warped);
    gray = toGrayscale(warped.data, warped.width, warped.height);
    rotated180 = true;
  }

  // 3. Top-right QR Code Auto-Pairing!
  let quiz = fallbackQuiz;
  let template = fallbackTemplate;
  let qrRaw: string | null = null;
  let qrMatchedQuizId: string | undefined;
  let qrMatchedQuizName: string | undefined;

  if (options?.allowQrAutoPair !== false) {
    qrRaw = decodeQrFromWarpedSheet(warped, fallbackTemplate.qrRect);
    const parsed = parseQuizQrPayload(qrRaw);
    if (parsed && options?.allQuizzes?.length) {
      const matched = options.allQuizzes.find((q) => q.id === parsed.quizId);
      if (matched) {
        quiz = matched;
        template = buildSheetTemplate(matched.questionCount);
        qrMatchedQuizId = matched.id;
        qrMatchedQuizName = matched.name;
      }
    }
  }

  // 4. Curve check
  const curveScore = evaluateCurveQuality(gray, warped.width, warped.height, template);

  // 5. Measure Question bubbles, 8-digit No. NDP bubbles, KURSUS bubbles, & SEMESTER bubbles
  const allDarkness: number[] = [];
  let brightBgCount = 0;
  let totalBubbles = 0;

  const rawQuestionScores: Array<Record<AnswerChoice, number>> = [];
  for (const q of template.questions) {
    const scores = {} as Record<AnswerChoice, number>;
    for (const ch of ANSWER_CHOICES) {
      const m = measureBubbleDarkness(gray, warped.width, warped.height, q.bubbles[ch]);
      scores[ch] = m.relativeDarkness;
      allDarkness.push(m.relativeDarkness);
      if (m.localBg > 251) brightBgCount++;
      totalBubbles++;
    }
    rawQuestionScores.push(scores);
  }

  const rawIdScores: Array<Record<string, number>> = [];
  for (const dg of template.studentIdDigits) {
    const scores: Record<string, number> = {};
    for (const b of dg.bubbles) {
      const m = measureBubbleDarkness(gray, warped.width, warped.height, b);
      scores[b.label] = m.relativeDarkness;
      allDarkness.push(m.relativeDarkness);
    }
    rawIdScores.push(scores);
  }

  const rawCourseScores = {} as Record<CourseCode, number>;
  for (const cb of template.courseBubbles) {
    const m = measureBubbleDarkness(gray, warped.width, warped.height, cb);
    rawCourseScores[cb.label as CourseCode] = m.relativeDarkness;
    allDarkness.push(m.relativeDarkness);
  }

  const rawSemesterScores = {} as Record<SemesterCode, number>;
  for (const sb of template.semesterBubbles) {
    const m = measureBubbleDarkness(gray, warped.width, warped.height, sb);
    rawSemesterScores[sb.label as SemesterCode] = m.relativeDarkness;
    allDarkness.push(m.relativeDarkness);
  }

  const glareWarning = totalBubbles > 0 && brightBgCount / totalBubbles > 0.35;
  const { baseline, markThreshold } = computeAdaptiveThreshold(allDarkness);

  // 6a. Decode 8-digit No. NDP
  const digitLabels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const decodedDigits: string[] = [];
  for (let d = 0; d < template.studentIdDigits.length; d++) {
    const cls = classifyRowScores(digitLabels, rawIdScores[d], baseline, markThreshold);
    decodedDigits.push(cls.status === 'single' ? cls.selected[0] : '_');
  }
  const studentCode = decodedDigits.every((c) => c === '_') ? '' : decodedDigits.join('');

  // 6b. Decode Horizontal KURSUS
  const courseCls = classifyRowScores(
    [...COURSE_CODES],
    rawCourseScores,
    baseline,
    markThreshold
  );
  const detectedCourse: CourseCode | '' =
    courseCls.status === 'single' ? courseCls.selected[0] : '';

  // 6c. Decode Horizontal SEMESTER
  const semCls = classifyRowScores(
    [...SEMESTER_CODES],
    rawSemesterScores,
    baseline,
    markThreshold
  );
  const detectedSemester: SemesterCode | '' =
    semCls.status === 'single' ? semCls.selected[0] : '';

  // 7. Classify & grade every question
  const questions: QuestionDetection[] = [];
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let multiCount = 0;

  for (let i = 0; i < template.questions.length; i++) {
    const qRow = template.questions[i];
    const qNum = qRow.questionNumber;
    const scores = rawQuestionScores[i];
    const cls = classifyRowScores(ANSWER_CHOICES, scores, baseline, markThreshold);

    const rule = quiz.answerKey[qNum];
    const expected = rule?.correctAnswers ?? [];
    const pts = rule?.points ?? 1;

    let isCorrect = false;
    let pointsEarned = 0;
    if (expected.length > 0) {
      maxScore += pts;
      if (cls.status === 'single' && expected.includes(cls.selected[0])) {
        isCorrect = true;
        pointsEarned = pts;
        score += pts;
        correctCount++;
      } else {
        wrongCount++;
      }
    }

    if (cls.status === 'blank') blankCount++;
    if (cls.status === 'multiple') multiCount++;

    questions.push({
      questionNumber: qNum,
      selected: cls.selected,
      status: cls.status,
      scores,
      confidence: cls.confidence,
      isCorrect,
      pointsEarned,
      maxPoints: expected.length > 0 ? pts : 0,
      expectedAnswers: expected,
    });
  }

  // 8. Render visual grading overlay onto warped canvas
  const canvas = document.createElement('canvas');
  canvas.width = warped.width;
  canvas.height = warped.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(warped, 0, 0);

  // Extract Full Header Crop + Isolated NAMA Write-in Line Crop (before annotations!)
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = template.nameCropRect.w;
  nameCanvas.height = template.nameCropRect.h;
  nameCanvas
    .getContext('2d')!
    .drawImage(
      canvas,
      template.nameCropRect.x,
      template.nameCropRect.y,
      template.nameCropRect.w,
      template.nameCropRect.h,
      0,
      0,
      template.nameCropRect.w,
      template.nameCropRect.h
    );
  const nameCropDataUrl = nameCanvas.toDataURL('image/jpeg', 0.85);

  const lineCanvas = document.createElement('canvas');
  lineCanvas.width = template.nameLineCropRect.w;
  lineCanvas.height = template.nameLineCropRect.h;
  lineCanvas
    .getContext('2d')!
    .drawImage(
      canvas,
      template.nameLineCropRect.x,
      template.nameLineCropRect.y,
      template.nameLineCropRect.w,
      template.nameLineCropRect.h,
      0,
      0,
      template.nameLineCropRect.w,
      template.nameLineCropRect.h
    );
  const nameLineDataUrl = lineCanvas.toDataURL('image/png');

  // Highlight QR code border green if auto-paired
  if (qrMatchedQuizId) {
    const qr = template.qrRect;
    ctx.strokeStyle = '#16a34a';
    ctx.lineWidth = 3;
    ctx.strokeRect(qr.x - 3, qr.y - 3, qr.w + 6, qr.h + 6);
  }

  // Draw 8-digit No. NDP rings in cyan
  ctx.lineWidth = 3;
  for (let d = 0; d < template.studentIdDigits.length; d++) {
    const ch = decodedDigits[d];
    if (ch !== '_') {
      const b = template.studentIdDigits[d].bubbles[Number(ch)];
      if (b) {
        ctx.strokeStyle = '#0284c7';
        ctx.fillStyle = 'rgba(14, 165, 233, 0.25)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // Draw KURSUS ring in indigo
  if (detectedCourse) {
    const cb = template.courseBubbles.find((b) => b.label === detectedCourse);
    if (cb) {
      ctx.strokeStyle = '#4f46e5';
      ctx.fillStyle = 'rgba(79, 70, 229, 0.24)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cb.x, cb.y, cb.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Draw SEMESTER ring in teal
  if (detectedSemester) {
    const sb = template.semesterBubbles.find((b) => b.label === detectedSemester);
    if (sb) {
      ctx.strokeStyle = '#0d9488';
      ctx.fillStyle = 'rgba(13, 148, 136, 0.24)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sb.x, sb.y, sb.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Draw Question grading markers
  for (let i = 0; i < template.questions.length; i++) {
    const qRow = template.questions[i];
    const det = questions[i];

    if (!det.isCorrect && det.expectedAnswers.length > 0) {
      for (const exp of det.expectedAnswers) {
        const b = qRow.bubbles[exp];
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const sel of det.selected) {
      const b = qRow.bubbles[sel];
      const hasKey = det.expectedAnswers.length > 0;
      const color = !hasKey ? '#2563eb' : det.isCorrect ? '#16a34a' : '#dc2626';
      const fill = !hasKey
        ? 'rgba(37, 99, 235, 0.28)'
        : det.isCorrect
          ? 'rgba(22, 163, 74, 0.30)'
          : 'rgba(220, 38, 38, 0.30)';
      ctx.strokeStyle = color;
      ctx.fillStyle = fill;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Stamp saved Instructor Name into bottom-left Disemak oleh box if configured
  const instName = options?.instructor?.name?.trim();
  if (instName) {
    const rv = template.reviewerBoxRect;
    const nameAreaX = rv.x + 270;
    const nameAreaW = rv.w - 284;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(nameAreaX, rv.y + 24, nameAreaW, 20);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(instName, nameAreaX + nameAreaW / 2, rv.y + 35);
  }

  // Render both correct count (e.g. 20/25) and percentage (e.g. 80%) cleanly inside the split bottom-right KEPUTUSAN MARKAH box
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
  const sc = template.scoreBoxRect;
  const midX = sc.x + Math.round(sc.w * 0.5);
  const leftCx = sc.x + (midX - sc.x) / 2;
  const rightCx = midX + (sc.x + sc.w - midX) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sc.x + 3, sc.y + 35, midX - sc.x - 5, sc.h - 38);
  ctx.fillRect(midX + 2, sc.y + 35, sc.x + sc.w - midX - 5, sc.h - 38);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const valY = sc.y + 51;

  if (maxScore > 0) {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText(`${correctCount}/${template.questionCount}`, leftCx, valY);

    ctx.fillStyle = pct >= 70 ? '#15803d' : pct >= 50 ? '#d97706' : '#dc2626';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`${Math.round(pct)}%`, rightCx, valY);
  } else {
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('SKEMA', leftCx, valY);
    ctx.fillText('OK', rightCx, valY);
  }

  const annotatedImageDataUrl = canvas.toDataURL('image/jpeg', 0.86);
  const processingMs = Math.round(performance.now() - t0);

  return {
    id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    quizId: quiz.id,
    scannedAt: new Date().toISOString(),
    studentCode,
    detectedCourse,
    detectedSemester,
    qrMatchedQuizId,
    qrMatchedQuizName,
    score,
    maxScore,
    percentage: pct,
    correctCount,
    wrongCount,
    blankCount,
    multiCount,
    annotatedImageDataUrl,
    nameCropDataUrl,
    nameLineDataUrl,
    questions,
    diagnostics: {
      sharpness: Math.round(sharpness),
      rotated180,
      glareWarning,
      curveScore,
      processingMs,
      qrRaw,
    },
  };
}

/** Recompute a paper's score totals after manual answer edit or answer key change */
export function regradePaper(paper: GradedPaper, quiz: Quiz): GradedPaper {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let multiCount = 0;

  const updatedQuestions: QuestionDetection[] = paper.questions.map((q) => {
    const rule = quiz.answerKey[q.questionNumber];
    const expected = rule?.correctAnswers ?? [];
    const pts = rule?.points ?? 1;
    const status: BubbleMarkStatus =
      q.selected.length === 0 ? 'blank' : q.selected.length === 1 ? 'single' : 'multiple';

    let isCorrect = false;
    let pointsEarned = 0;
    if (expected.length > 0) {
      maxScore += pts;
      if (status === 'single' && expected.includes(q.selected[0])) {
        isCorrect = true;
        pointsEarned = pts;
        score += pts;
        correctCount++;
      } else {
        wrongCount++;
      }
    }
    if (status === 'blank') blankCount++;
    if (status === 'multiple') multiCount++;

    return {
      ...q,
      status,
      isCorrect,
      pointsEarned,
      maxPoints: expected.length > 0 ? pts : 0,
      expectedAnswers: expected,
    };
  });

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
  return {
    ...paper,
    score,
    maxScore,
    percentage,
    correctCount,
    wrongCount,
    blankCount,
    multiCount,
    questions: updatedQuestions,
  };
}
