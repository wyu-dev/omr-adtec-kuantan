import { createWorker, Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.-/@",
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Preprocess a cropped NAMA write-in strip (upscale 2x + remove bottom guide line + contrast threshold)
 * so Tesseract can read handwritten or printed Malaysian student names accurately.
 */
async function preprocessNameStrip(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const scale = 2;
  const w = img.width * scale;
  const h = img.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Compute brightness stats ignoring bottom 15% (where the printed underline sits)
  let sum = 0;
  let count = 0;
  const cutoffY = Math.floor(h * 0.85);
  for (let y = 0; y < cutoffY; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const g = (d[idx] * 77 + d[idx + 1] * 150 + d[idx + 2] * 29) >> 8;
      sum += g;
      count++;
    }
  }
  const avg = count > 0 ? sum / count : 220;
  const thresh = Math.max(85, avg - 36);

  // Soft contrast enhancement + erase printed horizontal rule in bottom 12%
  const eraseLineY = Math.floor(h * 0.88);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (y >= eraseLineY) {
        d[idx] = 255;
        d[idx + 1] = 255;
        d[idx + 2] = 255;
        continue;
      }
      const g = (d[idx] * 77 + d[idx + 1] * 150 + d[idx + 2] * 29) >> 8;
      const out = g < thresh ? 0 : g < thresh + 25 ? 110 : 255;
      d[idx] = out;
      d[idx + 1] = out;
      d[idx + 2] = out;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

function cleanRecognizedName(raw: string): string {
  const cleaned = raw
    .replace(/\r?\n/g, ' ')
    .replace(/[^A-Za-z '@./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2) return '';
  // Normalize to clean Title Case if all uppercase or messy casing
  return cleaned
    .split(' ')
    .filter((w) => w.length > 0)
    .map((w) =>
      w.toLowerCase() === 'bin' || w.toLowerCase() === 'binti' || w.toLowerCase() === 'a/l' || w.toLowerCase() === 'a/p'
        ? w.toLowerCase()
        : w[0].toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(' ');
}

/**
 * Run in-browser handwriting/text OCR on the cropped NAMA write-in strip.
 */
export async function recognizeStudentNameFromCrop(nameLineDataUrl: string): Promise<string> {
  try {
    const processed = await preprocessNameStrip(nameLineDataUrl);
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(processed);
    return cleanRecognizedName(data.text || '');
  } catch {
    return '';
  }
}
