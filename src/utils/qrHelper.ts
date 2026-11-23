import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { Quiz, Rect2D } from '../types';

export interface DecodedQuizQr {
  quizId: string;
  questionCount: number;
}

/** Compact QR payload so printed QR code has large, easy-to-scan modules */
export function encodeQuizQrPayload(quizId: string, questionCount: number): string {
  return `OMR1:${quizId}|${questionCount}`;
}

export function parseQuizQrPayload(raw: string | null | undefined): DecodedQuizQr | null {
  if (!raw || !raw.startsWith('OMR1:')) return null;
  const body = raw.slice(5);
  const sep = body.lastIndexOf('|');
  if (sep <= 0) return null;
  const quizId = body.slice(0, sep).trim();
  const questionCount = Number(body.slice(sep + 1).trim());
  if (!quizId || !Number.isFinite(questionCount) || questionCount < 1) return null;
  return { quizId, questionCount };
}

/** Generate a crisp PNG Data URL QR code for a quiz answer key */
export async function generateQuizQrDataUrl(quiz: Pick<Quiz, 'id' | 'questionCount'>): Promise<string> {
  const payload = encodeQuizQrPayload(quiz.id, quiz.questionCount);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * Decode the top-right QR code from a warped 900x1200 OMR sheet ImageData.
 * Runs a fast direct pass, then a contrast-stretched fallback pass for dim/shadowed scans.
 */
export function decodeQrFromWarpedSheet(warped: ImageData, qrRect: Rect2D): string | null {
  const pad = 16;
  const x0 = Math.max(0, Math.floor(qrRect.x - pad));
  const y0 = Math.max(0, Math.floor(qrRect.y - pad));
  const x1 = Math.min(warped.width, Math.ceil(qrRect.x + qrRect.w + pad));
  const y1 = Math.min(warped.height, Math.ceil(qrRect.y + qrRect.h + pad));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 24 || ch < 24) return null;

  const crop = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcRow = ((y0 + y) * warped.width + x0) * 4;
    const dstRow = y * cw * 4;
    crop.set(warped.data.subarray(srcRow, srcRow + cw * 4), dstRow);
  }

  // Pass 1: Direct RGBA decode
  const res1 = jsQR(crop, cw, ch, { inversionAttempts: 'dontInvert' });
  if (res1?.data) return res1.data;

  // Pass 2: High-contrast grayscale stretched decode (handles uneven lighting/shadows)
  let minL = 255;
  let maxL = 0;
  const lum = new Uint8Array(cw * ch);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    const v = (crop[j] * 77 + crop[j + 1] * 150 + crop[j + 2] * 29) >> 8;
    lum[i] = v;
    if (v < minL) minL = v;
    if (v > maxL) maxL = v;
  }
  const span = Math.max(1, maxL - minL);
  const boosted = new Uint8ClampedArray(cw * ch * 4);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    const norm = ((lum[i] - minL) * 255) / span;
    const bin = norm < 135 ? 0 : 255;
    boosted[j] = bin;
    boosted[j + 1] = bin;
    boosted[j + 2] = bin;
    boosted[j + 3] = 255;
  }
  const res2 = jsQR(boosted, cw, ch, { inversionAttempts: 'attemptBoth' });
  return res2?.data ?? null;
}
