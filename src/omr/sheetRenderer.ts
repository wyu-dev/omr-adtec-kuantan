import {
  ANSWER_CHOICES,
  AnswerChoice,
  AnswerSheetTemplate,
  CourseCode,
  InstructorProfile,
  NDP_DIGIT_COUNT,
  SemesterCode,
} from '../types';
import { ADTEC_LOGO_DATA_URL } from '../assets/adtecLogo';
import { solveHomography, warpPerspective } from './omrEngine';

export interface SheetRenderOptions {
  quizTitle?: string;
  qrDataUrl?: string;
  instructor?: InstructorProfile;
}

/**
 * Render an exact vector SVG of the ADTEC JTM Kampus Kuantan OMR Answer Sheet:
 * - Official logo + Quiz Title (top left/center) + Scannable Quiz QR Code (top right)
 * - 3-field top info box (NAMA, NO. KAD PENGENALAN, TARIKH) with dedicated wide NAMA row for OCR
 * - Left: 8-digit No. NDP grid | Right: Horizontal KURSUS (9) + Horizontal SEMESTER (1-5) + Arahan
 * - Dynamic 1..60 A–D questions grouped in 5-row blocks with adaptive bubble size
 * - Bottom-left: Disemak oleh (Tandatangan & Nama Pengajar) | Bottom-right: KEPUTUSAN MARKAH (Betul + %)
 */
export function buildSheetSvgMarkup(
  template: AnswerSheetTemplate,
  options?: SheetRenderOptions | string
): string {
  const opts: SheetRenderOptions =
    typeof options === 'string' ? { quizTitle: options } : options ?? {};
  const quizTitle = opts.quizTitle || 'Penilaian Teori / Ujian OMR';
  const qrDataUrl = opts.qrDataUrl;
  const instructorName = opts.instructor?.name?.trim() || '';
  const instructorSig = opts.instructor?.signatureDataUrl;

  const { warpWidth: W, warpHeight: H, fiducialSize: FS } = template;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#ffffff;font-family:Arial,Helvetica,sans-serif;">`
  );
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);

  // 4 Primary Corner Fiducial Squares
  for (const fp of template.primaryFiducials) {
    parts.push(
      `<rect x="${fp.x - FS / 2}" y="${fp.y - FS / 2}" width="${FS}" height="${FS}" fill="#000000"/>`
    );
  }

  // Mid-Edge Curve Check Fiducials
  const CS = template.curveFiducialSize;
  for (const cf of template.curveFiducials) {
    parts.push(
      `<rect x="${cf.x - CS / 2}" y="${cf.y - CS / 2}" width="${CS}" height="${CS}" fill="#000000"/>`
    );
  }

  // Top-Left Orientation Calibration Dot
  parts.push(
    `<circle cx="${template.orientationDot.x}" cy="${template.orientationDot.y}" r="${template.orientationDot.r}" fill="#000000"/>`
  );

  // Official ADTEC JTM Kampus Kuantan Logo (centered across x=138..694 -> center x=416)
  parts.push(
    `<image href="${ADTEC_LOGO_DATA_URL}" x="341" y="10" width="150" height="58" preserveAspectRatio="xMidYMid meet"/>`
  );

  // Larger Quiz Title & Subtitle (centered at x=416 so zero collision with Top-Right QR at x=706..798)
  parts.push(
    `<text x="416" y="87" text-anchor="middle" font-size="18" font-weight="800" fill="#1e3a8a">${escapeXml(quizTitle)}</text>`
  );
  parts.push(
    `<text x="416" y="103" text-anchor="middle" font-size="10.8" fill="#475569">Borang Jawapan OMR (${template.questionCount} Soalan • Pilihan A–D) • Hitamkan bulatan sepenuhnya</text>`
  );

  // Top-Right Quiz Answer-Key QR Code Box (x=706..798, y=10..102)
  const qr = template.qrRect;
  parts.push(
    `<rect x="${qr.x - 2}" y="${qr.y - 2}" width="${qr.w + 4}" height="${qr.h + 4}" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>`
  );
  if (qrDataUrl) {
    parts.push(
      `<image href="${qrDataUrl}" x="${qr.x}" y="${qr.y}" width="${qr.w}" height="${qr.h}" preserveAspectRatio="xMidYMid meet"/>`
    );
  } else {
    parts.push(
      `<text x="${qr.x + qr.w / 2}" y="${qr.y + qr.h / 2 + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="#94a3b8">QR SKEMA</text>`
    );
  }
  parts.push(
    `<text x="${qr.x + qr.w / 2}" y="${qr.y + qr.h + 9}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#64748b">QR SKEMA AUTO</text>`
  );

  // Top Student Info Header Box (3 Fields: NAMA, NO. KAD PENGENALAN, TARIKH)
  const nb = template.nameCropRect;
  parts.push(
    `<rect x="${nb.x}" y="${nb.y}" width="${nb.w}" height="${nb.h}" rx="6" fill="none" stroke="#1e3a8a" stroke-width="1.8"/>`
  );

  // Row 1: Full-width spacious NAMA line (ideal for handwriting OCR!)
  const r1y = nb.y + 25;
  parts.push(
    `<text x="${nb.x + 12}" y="${r1y}" font-size="12.5" font-weight="700" fill="#0f172a">NAMA:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 62}" y1="${r1y + 3}" x2="${nb.x + nb.w - 14}" y2="${r1y + 3}" stroke="#94a3b8" stroke-width="1.3"/>`
  );

  // Row 2: NO. KAD PENGENALAN | TARIKH
  const r2y = nb.y + 54;
  parts.push(
    `<text x="${nb.x + 12}" y="${r2y}" font-size="12.5" font-weight="700" fill="#0f172a">NO. KAD PENGENALAN:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 174}" y1="${r2y + 3}" x2="${nb.x + 448}" y2="${r2y + 3}" stroke="#94a3b8" stroke-width="1.3"/>`
  );
  parts.push(
    `<text x="${nb.x + 462}" y="${r2y}" font-size="12.5" font-weight="700" fill="#0f172a">TARIKH:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 524}" y1="${r2y + 3}" x2="${nb.x + nb.w - 14}" y2="${r2y + 3}" stroke="#94a3b8" stroke-width="1.3"/>`
  );

  // Left: Large 8-Digit NO. NDP Pelajar Bubble Grid Box (x=98..482, y=186..514)
  const sb = template.studentIdBox;
  parts.push(
    `<rect x="${sb.x}" y="${sb.y}" width="${sb.w}" height="${sb.h}" rx="7" fill="none" stroke="#1e3a8a" stroke-width="1.8"/>`
  );
  parts.push(
    `<text x="${sb.x + sb.w / 2}" y="${sb.y + 19}" text-anchor="middle" font-size="12.5" font-weight="800" fill="#1e3a8a">NO. NDP PELAJAR (8 DIGIT)</text>`
  );

  for (const dg of template.studentIdDigits) {
    parts.push(
      `<rect x="${dg.headerX - 13}" y="${dg.headerY - 11}" width="26" height="22" rx="3.5" fill="#f8fafc" stroke="#475569" stroke-width="1.4"/>`
    );
    for (const b of dg.bubbles) {
      parts.push(
        `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#ffffff" stroke="#64748b" stroke-width="1.45"/>`
      );
      parts.push(
        `<text x="${b.x}" y="${b.y + 3.6}" text-anchor="middle" font-size="10.2" fill="#94a3b8">${b.label}</text>`
      );
    }
  }

  // Right-Top: Horizontal KURSUS Box (AUTO, CSB, FSL, IT, JE, KIMP, REL, TPM, TPP)
  const cb = template.courseBox;
  parts.push(
    `<rect x="${cb.x}" y="${cb.y}" width="${cb.w}" height="${cb.h}" rx="7" fill="none" stroke="#1e3a8a" stroke-width="1.6"/>`
  );
  parts.push(
    `<text x="${cb.x + cb.w / 2}" y="${cb.y + 17}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#1e3a8a">KURSUS (HITAMKAN SATU)</text>`
  );
  for (const b of template.courseBubbles) {
    parts.push(
      `<text x="${b.x}" y="${b.y - b.r - 6}" text-anchor="middle" font-size="9.2" font-weight="700" fill="#1e293b">${b.label}</text>`
    );
    parts.push(
      `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#ffffff" stroke="#64748b" stroke-width="1.4"/>`
    );
  }

  // Right-Mid: Horizontal SEMESTER Box (1, 2, 3, 4, 5)
  const semb = template.semesterBox;
  parts.push(
    `<rect x="${semb.x}" y="${semb.y}" width="${semb.w}" height="${semb.h}" rx="7" fill="none" stroke="#1e3a8a" stroke-width="1.6"/>`
  );
  parts.push(
    `<text x="${semb.x + semb.w / 2}" y="${semb.y + 17}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#1e3a8a">SEMESTER (HITAMKAN SATU)</text>`
  );
  for (const b of template.semesterBubbles) {
    parts.push(
      `<text x="${b.x}" y="${b.y - b.r - 5}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1e293b">Sem ${b.label}</text>`
    );
    parts.push(
      `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#ffffff" stroke="#64748b" stroke-width="1.45"/>`
    );
    parts.push(
      `<text x="${b.x}" y="${b.y + 4}" text-anchor="middle" font-size="10.5" fill="#94a3b8">${b.label}</text>`
    );
  }

  // Right-Bot: Compact ARAHAN MENJAWAB Card (x=496..802, y=372..514, h=142)
  const ix = 496;
  const iy = 372;
  const iw = 306;
  const ih = 142;
  parts.push(
    `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>`
  );
  parts.push(
    `<text x="${ix + iw / 2}" y="${iy + 19}" text-anchor="middle" font-size="11.5" font-weight="800" fill="#1e3a8a">ARAHAN MENJAWAB</text>`
  );
  parts.push(
    `<text x="${ix + 14}" y="${iy + 39}" font-size="10.2" fill="#334155">1. Tulis NAMA dengan huruf besar yang jelas.</text>`
  );
  parts.push(
    `<text x="${ix + 14}" y="${iy + 55}" font-size="10.2" fill="#334155">2. Hitamkan 8 digit NDP, KURSUS &amp; SEMESTER.</text>`
  );
  parts.push(
    `<text x="${ix + 14}" y="${iy + 71}" font-size="10.2" fill="#334155">3. Guna pensel 2B/pen gelap. Jangan conteng QR/penjuru.</text>`
  );

  // Compact Visual Correct vs Incorrect Legend
  parts.push(
    `<circle cx="${ix + 44}" cy="${iy + 96}" r="9.5" fill="#111827" stroke="#111827" stroke-width="1.4"/>`
  );
  parts.push(
    `<text x="${ix + 60}" y="${iy + 100}" font-size="11" font-weight="700" fill="#15803d">BETUL</text>`
  );
  parts.push(
    `<circle cx="${ix + 160}" cy="${iy + 96}" r="9.5" fill="#ffffff" stroke="#475569" stroke-width="1.4"/>`
  );
  parts.push(
    `<line x1="${ix + 153}" y1="${iy + 89}" x2="${ix + 167}" y2="${iy + 103}" stroke="#dc2626" stroke-width="2"/>`
  );
  parts.push(
    `<line x1="${ix + 167}" y1="${iy + 89}" x2="${ix + 153}" y2="${iy + 103}" stroke="#dc2626" stroke-width="2"/>`
  );
  parts.push(
    `<text x="${ix + 176}" y="${iy + 100}" font-size="11" font-weight="700" fill="#b91c1c">SALAH</text>`
  );

  parts.push(
    `<rect x="${ix + 14}" y="${iy + 114}" width="${iw - 28}" height="20" rx="4" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>`
  );
  parts.push(
    `<text x="${ix + iw / 2}" y="${iy + 127.5}" text-anchor="middle" font-size="9.6" font-weight="700" fill="#1e3a8a">ADTEC JTM KAMPUS KUANTAN • ${template.questionCount} SOALAN (A–D)</text>`
  );

  // Divider line above Question Grid
  parts.push(
    `<line x1="98" y1="526" x2="802" y2="526" stroke="#cbd5e1" stroke-width="1.2"/>`
  );

  // Column A B C D Headers above each unique question column
  const seenCols = new Set<number>();
  for (const q of template.questions) {
    const colKey = Math.round(q.bubbles.A.x);
    if (seenCols.has(colKey)) continue;
    seenCols.add(colKey);
    const hdrY = Math.min(544, Math.round(q.labelY - q.bubbles.A.r - 10));
    const hdrFont = Math.max(11, Math.min(15, Math.round(q.bubbles.A.r * 0.92)));
    for (const ch of ANSWER_CHOICES) {
      const b = q.bubbles[ch];
      parts.push(
        `<text x="${b.x}" y="${hdrY}" text-anchor="middle" font-size="${hdrFont}" font-weight="800" fill="#1e3a8a">${ch}</text>`
      );
    }
  }

  // Group backdrop cards around each 5-question block (1–5, 6–10, 11–15...)
  const groups = new Map<string, typeof template.questions>();
  for (const q of template.questions) {
    const colKey = Math.round(q.bubbles.A.x);
    const blockIdx = Math.floor((q.questionNumber - 1) / 5);
    const key = `${colKey}_${blockIdx}`;
    const arr = groups.get(key) ?? [];
    arr.push(q);
    groups.set(key, arr);
  }
  for (const [, grp] of groups) {
    if (grp.length === 0) continue;
    const first = grp[0];
    const last = grp[grp.length - 1];
    const r = first.bubbles.A.r;
    const padLeft = r >= 14 ? 30 : 24;
    const padY = r >= 14 ? 5 : 3.5;
    const boxX = first.labelX - padLeft;
    const boxY = first.labelY - r - padY;
    const boxW = first.bubbles.D.x - boxX + r + 10;
    const boxH = last.labelY - first.labelY + r * 2 + padY * 2;
    parts.push(
      `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>`
    );
  }

  // Question Bubbles (dynamic 1..60, A–D only)
  for (const q of template.questions) {
    const firstB = q.bubbles.A;
    parts.push(
      `<text x="${q.labelX}" y="${q.labelY + Math.round(firstB.r * 0.38)}" text-anchor="end" font-size="${Math.max(11, Math.min(18, Math.round(firstB.r * 1.1)))}" font-weight="700" fill="#1e293b">${q.questionNumber}</text>`
    );

    for (const ch of ANSWER_CHOICES) {
      const b = q.bubbles[ch];
      parts.push(
        `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#ffffff" stroke="#64748b" stroke-width="${b.r >= 14 ? 1.6 : 1.4}"/>`
      );
      parts.push(
        `<text x="${b.x}" y="${b.y + Math.round(b.r * 0.36)}" text-anchor="middle" font-size="${Math.max(8.5, Math.min(15, Math.round(b.r * 0.88)))}" fill="#9ca3af">${ch}</text>`
      );
    }
  }

  // Bottom-Left: Official "Disemak oleh:" Box (Tandatangan & Nama Pengajar)
  const rv = template.reviewerBoxRect;
  parts.push(
    `<rect x="${rv.x}" y="${rv.y}" width="${rv.w}" height="${rv.h}" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>`
  );
  parts.push(
    `<text x="${rv.x + 12}" y="${rv.y + 18}" font-size="11" font-weight="700" fill="#1e3a8a">Disemak oleh:</text>`
  );
  // Signature line (left half of reviewer box)
  if (instructorSig) {
    parts.push(
      `<image href="${instructorSig}" x="${rv.x + 102}" y="${rv.y + 4}" width="130" height="42" preserveAspectRatio="xMidYMid meet"/>`
    );
  }
  parts.push(
    `<line x1="${rv.x + 98}" y1="${rv.y + 46}" x2="${rv.x + 252}" y2="${rv.y + 46}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="3,2"/>`
  );
  parts.push(
    `<text x="${rv.x + 175}" y="${rv.y + 60}" text-anchor="middle" font-size="9.5" fill="#64748b">(Tandatangan)</text>`
  );
  // Instructor Name line (right half of reviewer box)
  parts.push(
    `<line x1="${rv.x + 270}" y1="${rv.y + 46}" x2="${rv.x + rv.w - 14}" y2="${rv.y + 46}" stroke="#94a3b8" stroke-width="1.2"/>`
  );
  parts.push(
    `<text x="${rv.x + 270 + (rv.w - 284) / 2}" y="${rv.y + 41}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0f172a">${escapeXml(instructorName)}</text>`
  );
  parts.push(
    `<text x="${rv.x + 270 + (rv.w - 284) / 2}" y="${rv.y + 60}" text-anchor="middle" font-size="9.5" fill="#64748b">(${escapeXml(instructorName ? 'Nama Pengajar' : 'Nama Pengajar')})</text>`
  );

  // Bottom-Right: Split KEPUTUSAN MARKAH Box (JAWAPAN BETUL + PERATUS)
  const sc = template.scoreBoxRect;
  const midX = sc.x + Math.round(sc.w * 0.5);
  parts.push(
    `<rect x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${sc.h}" rx="6" fill="#ffffff" stroke="#1e3a8a" stroke-width="1.8"/>`
  );
  parts.push(
    `<path d="M ${sc.x} ${sc.y + 6} Q ${sc.x} ${sc.y} ${sc.x + 6} ${sc.y} L ${sc.x + sc.w - 6} ${sc.y} Q ${sc.x + sc.w} ${sc.y} ${sc.x + sc.w} ${sc.y + 6} L ${sc.x + sc.w} ${sc.y + 20} L ${sc.x} ${sc.y + 20} Z" fill="#1e3a8a"/>`
  );
  parts.push(
    `<text x="${sc.x + sc.w / 2}" y="${sc.y + 14}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#ffffff">KEPUTUSAN MARKAH</text>`
  );
  parts.push(
    `<line x1="${midX}" y1="${sc.y + 20}" x2="${midX}" y2="${sc.y + sc.h}" stroke="#cbd5e1" stroke-width="1.2"/>`
  );
  parts.push(
    `<text x="${sc.x + (midX - sc.x) / 2}" y="${sc.y + 32}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#64748b">JAWAPAN BETUL</text>`
  );
  parts.push(
    `<text x="${midX - 10}" y="${sc.y + sc.h - 10}" text-anchor="end" font-size="15" font-weight="700" fill="#cbd5e1">/ ${template.questionCount}</text>`
  );
  parts.push(
    `<text x="${midX + (sc.x + sc.w - midX) / 2}" y="${sc.y + 32}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#64748b">PERATUS</text>`
  );
  parts.push(
    `<text x="${sc.x + sc.w - 12}" y="${sc.y + sc.h - 10}" text-anchor="end" font-size="18" font-weight="700" fill="#cbd5e1">%</text>`
  );

  // Subtle footer strip below boxes (y=1132..1142, clear of bottom fiducials x=33..77 and x=823..867)
  parts.push(
    `<text x="450" y="1148" text-anchor="middle" font-size="9.5" fill="#94a3b8">ADTEC JTM KAMPUS KUANTAN • SISTEM SEMAKAN OMR</text>`
  );

  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a realistic synthetic camera photo of a filled ADTEC JTM answer sheet
 * including the real top-right Quiz QR code, 8-digit NDP, KURSUS & SEMESTER bubbles,
 * handwritten-style NAMA (readable by OCR!), and A–D answers.
 */
export async function generateSyntheticCameraPhoto(
  template: AnswerSheetTemplate,
  answers: Record<number, AnswerChoice[]>,
  studentCode: string,
  studentName: string,
  options?: {
    rotate180?: boolean;
    quizTitle?: string;
    qrDataUrl?: string;
    course?: CourseCode | '';
    semester?: SemesterCode | '';
    instructor?: InstructorProfile;
  }
): Promise<{ canvas: HTMLCanvasElement; dataUrl: string }> {
  const svg = buildSheetSvgMarkup(template, {
    quizTitle: options?.quizTitle ?? 'Penilaian Teori OMR',
    qrDataUrl: options?.qrDataUrl,
    instructor: options?.instructor,
  });
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  URL.revokeObjectURL(url);

  const flatCanvas = document.createElement('canvas');
  flatCanvas.width = template.warpWidth;
  flatCanvas.height = template.warpHeight;
  const ctx = flatCanvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const padded = studentCode
    .replace(/\D/g, '')
    .padStart(NDP_DIGIT_COUNT, '0')
    .slice(0, NDP_DIGIT_COUNT);

  // Write clear block-letter student name (Row 1) + No. K/P & Tarikh (Row 2)
  const nb = template.nameCropRect;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(studentName.toUpperCase(), nb.x + 70, nb.y + 24);
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('030514-06-0821', nb.x + 184, nb.y + 53);
  ctx.fillText(new Date().toLocaleDateString('ms-MY'), nb.x + 534, nb.y + 53);

  // Shade large 8-digit No. NDP bubbles + write digits in top boxes
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < template.studentIdDigits.length; d++) {
    const digitChar = padded[d];
    const digit = Number(digitChar);
    const dg = template.studentIdDigits[d];
    ctx.fillStyle = '#0f172a';
    ctx.fillText(digitChar, dg.headerX, dg.headerY);
    const b = dg.bubbles[digit];
    if (b && !Number.isNaN(digit)) {
      drawRealisticBubbleFill(ctx, b.x, b.y, b.r);
    }
  }

  // Shade Horizontal KURSUS bubble
  if (options?.course) {
    const cb = template.courseBubbles.find((b) => b.label === options.course);
    if (cb) drawRealisticBubbleFill(ctx, cb.x, cb.y, cb.r);
  }

  // Shade Horizontal SEMESTER bubble
  if (options?.semester) {
    const sb = template.semesterBubbles.find((b) => b.label === options.semester);
    if (sb) drawRealisticBubbleFill(ctx, sb.x, sb.y, sb.r);
  }

  // Shade Question bubbles (A–D)
  for (const q of template.questions) {
    const marks = answers[q.questionNumber] ?? [];
    for (const ch of marks) {
      const b = q.bubbles[ch];
      if (b) drawRealisticBubbleFill(ctx, b.x, b.y, b.r);
    }
  }

  if (options?.rotate180) {
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = flatCanvas.width;
    rotCanvas.height = flatCanvas.height;
    const rCtx = rotCanvas.getContext('2d')!;
    rCtx.translate(rotCanvas.width, rotCanvas.height);
    rCtx.rotate(Math.PI);
    rCtx.drawImage(flatCanvas, 0, 0);
    ctx.clearRect(0, 0, flatCanvas.width, flatCanvas.height);
    ctx.drawImage(rotCanvas, 0, 0);
  }

  const camW = 1080;
  const camH = 1440;
  const flatData = ctx.getImageData(0, 0, flatCanvas.width, flatCanvas.height);

  const quad: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ] = [
    { x: 105, y: 120 },
    { x: 965, y: 145 },
    { x: 995, y: 1325 },
    { x: 82, y: 1300 },
  ];

  const srcCorners: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ] = [
    { x: 0, y: 0 },
    { x: flatCanvas.width, y: 0 },
    { x: flatCanvas.width, y: flatCanvas.height },
    { x: 0, y: flatCanvas.height },
  ];

  const H = solveHomography(quad, srcCorners);
  const warpedCam = warpPerspective(
    flatData.data,
    flatData.width,
    flatData.height,
    camW,
    camH,
    H
  );

  const d = warpedCam.data;
  for (let y = 0; y < camH; y++) {
    for (let x = 0; x < camW; x++) {
      const idx = (y * camW + x) * 4;
      const denom = H[6] * x + H[7] * y + H[8];
      const fx = (H[0] * x + H[1] * y + H[2]) / denom;
      const fy = (H[3] * x + H[4] * y + H[5]) / denom;
      if (fx < 0 || fy < 0 || fx >= flatCanvas.width || fy >= flatCanvas.height) {
        d[idx] = 138;
        d[idx + 1] = 116;
        d[idx + 2] = 94;
        d[idx + 3] = 255;
      } else {
        const light = 0.82 + 0.18 * (x / camW) - 0.10 * (y / camH);
        const noise = (Math.random() - 0.5) * 5;
        d[idx] = Math.max(0, Math.min(255, d[idx] * light + noise));
        d[idx + 1] = Math.max(0, Math.min(255, d[idx + 1] * light + noise));
        d[idx + 2] = Math.max(0, Math.min(255, d[idx + 2] * light + noise));
      }
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = camW;
  outCanvas.height = camH;
  outCanvas.getContext('2d')!.putImageData(warpedCam, 0, 0);

  return {
    canvas: outCanvas,
    dataUrl: outCanvas.toDataURL('image/jpeg', 0.9),
  };
}

function drawRealisticBubbleFill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
) {
  ctx.save();
  const ox = (Math.random() - 0.5) * 1.4;
  const oy = (Math.random() - 0.5) * 1.4;
  ctx.fillStyle = 'rgba(24, 28, 36, 0.93)';
  ctx.beginPath();
  ctx.ellipse(
    cx + ox,
    cy + oy,
    r * (0.86 + Math.random() * 0.1),
    r * (0.84 + Math.random() * 0.1),
    Math.random() * Math.PI,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}
