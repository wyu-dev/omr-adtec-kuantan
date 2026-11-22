import { ANSWER_CHOICES, AnswerChoice, AnswerSheetTemplate, NDP_DIGIT_COUNT } from '../types';
import { ADTEC_LOGO_DATA_URL } from '../assets/adtecLogo';
import { solveHomography, warpPerspective } from './omrEngine';

/**
 * Render an exact vector SVG of the ADTEC JTM Kampus Kuantan OMR Answer Sheet:
 * - Official logo centered at top
 * - 5-field header box (Nama, No. Kad Pengenalan, NDP, Kursus, Semester)
 * - 8-digit No. NDP grid + Arahan Menjawab
 * - Dynamic 1..100 questions (A–D) grouped neatly in 5-row blocks with clear gaps & A–D column headers
 * - Official bottom-right MARKAH (%) box
 */
export function buildSheetSvgMarkup(
  template: AnswerSheetTemplate,
  quizTitle = 'Penilaian Teori / Ujian OMR'
): string {
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

  // Official ADTEC JTM Kampus Kuantan Logo (exact 2.60:1 ratio)
  parts.push(
    `<image href="${ADTEC_LOGO_DATA_URL}" x="372" y="12" width="156" height="60" preserveAspectRatio="xMidYMid meet"/>`
  );

  // Quiz Title & Subtitle
  parts.push(
    `<text x="${W / 2}" y="86" text-anchor="middle" font-size="14" font-weight="700" fill="#1e3a8a">${escapeXml(quizTitle)}</text>`
  );
  parts.push(
    `<text x="${W / 2}" y="99" text-anchor="middle" font-size="9.8" fill="#475569">Borang Jawapan OMR (${template.questionCount} Soalan • Pilihan A–D) • Hitamkan bulatan sepenuhnya</text>`
  );

  // Student Info Header Box (5 Fields in 2 Clean Rows: Nama, No. Kad Pengenalan, NDP, Kursus, Semester)
  const nb = template.nameCropRect;
  parts.push(
    `<rect x="${nb.x}" y="${nb.y}" width="${nb.w}" height="${nb.h}" rx="6" fill="none" stroke="#1e3a8a" stroke-width="1.7"/>`
  );

  // Row 1: NAMA | NO. KAD PENGENALAN
  const r1y = nb.y + 20;
  parts.push(
    `<text x="${nb.x + 10}" y="${r1y}" font-size="10.5" font-weight="700" fill="#1e293b">NAMA:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 52}" y1="${r1y + 2}" x2="${nb.x + 374}" y2="${r1y + 2}" stroke="#94a3b8" stroke-width="1.2"/>`
  );
  parts.push(
    `<text x="${nb.x + 384}" y="${r1y}" font-size="10.5" font-weight="700" fill="#1e293b">NO. KAD PENGENALAN:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 520}" y1="${r1y + 2}" x2="${nb.x + nb.w - 12}" y2="${r1y + 2}" stroke="#94a3b8" stroke-width="1.2"/>`
  );

  // Row 2: NDP | KURSUS | SEMESTER
  const r2y = nb.y + 43;
  parts.push(
    `<text x="${nb.x + 10}" y="${r2y}" font-size="10.5" font-weight="700" fill="#1e293b">NDP:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 42}" y1="${r2y + 2}" x2="${nb.x + 164}" y2="${r2y + 2}" stroke="#94a3b8" stroke-width="1.2"/>`
  );
  parts.push(
    `<text x="${nb.x + 174}" y="${r2y}" font-size="10.5" font-weight="700" fill="#1e293b">KURSUS:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 230}" y1="${r2y + 2}" x2="${nb.x + 516}" y2="${r2y + 2}" stroke="#94a3b8" stroke-width="1.2"/>`
  );
  parts.push(
    `<text x="${nb.x + 526}" y="${r2y}" font-size="10.5" font-weight="700" fill="#1e293b">SEMESTER:</text>`
  );
  parts.push(
    `<line x1="${nb.x + 596}" y1="${r2y + 2}" x2="${nb.x + nb.w - 12}" y2="${r2y + 2}" stroke="#94a3b8" stroke-width="1.2"/>`
  );

  // 8-Digit NO. NDP Pelajar Bubble Grid Box (Left)
  const sb = template.studentIdBox;
  parts.push(
    `<rect x="${sb.x}" y="${sb.y}" width="${sb.w}" height="${sb.h}" rx="6" fill="none" stroke="#1e3a8a" stroke-width="1.6"/>`
  );
  parts.push(
    `<text x="${sb.x + sb.w / 2}" y="${sb.y + 15}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1e3a8a">NO. NDP PELAJAR (8 DIGIT)</text>`
  );

  for (const dg of template.studentIdDigits) {
    parts.push(
      `<rect x="${dg.headerX - 11}" y="${dg.headerY - 9}" width="22" height="17" rx="2.5" fill="none" stroke="#64748b" stroke-width="1.2"/>`
    );
    for (const b of dg.bubbles) {
      parts.push(
        `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#ffffff" stroke="#64748b" stroke-width="1.3"/>`
      );
      parts.push(
        `<text x="${b.x}" y="${b.y + 3.1}" text-anchor="middle" font-size="${Math.round(b.r * 0.96)}" fill="#94a3b8">${b.label}</text>`
      );
    }
  }

  // Instructions Card (Right of 8-Digit NDP Box)
  const ix = 442;
  const iy = sb.y;
  const iw = 360;
  const ih = sb.h;
  parts.push(
    `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>`
  );
  parts.push(
    `<text x="${ix + iw / 2}" y="${iy + 22}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#1e3a8a">ARAHAN MENJAWAB</text>`
  );
  parts.push(
    `<line x1="${ix + 18}" y1="${iy + 31}" x2="${ix + iw - 18}" y2="${iy + 31}" stroke="#e2e8f0" stroke-width="1"/>`
  );
  parts.push(
    `<text x="${ix + 20}" y="${iy + 51}" font-size="11.2" fill="#334155">1. Tulis dan hitamkan 8 digit No. NDP anda.</text>`
  );
  parts.push(
    `<text x="${ix + 20}" y="${iy + 71}" font-size="11.2" fill="#334155">2. Gunakan pensel 2B atau pen berdakwat gelap.</text>`
  );
  parts.push(
    `<text x="${ix + 20}" y="${iy + 91}" font-size="11.2" fill="#334155">3. Hitamkan satu pilihan jawapan (A, B, C atau D).</text>`
  );
  parts.push(
    `<text x="${ix + 20}" y="${iy + 111}" font-size="11.2" fill="#334155">4. Padam dengan bersih jika menukar jawapan.</text>`
  );
  parts.push(
    `<text x="${ix + 20}" y="${iy + 131}" font-size="11.2" fill="#334155">5. Jangan conteng 4 petak hitam di penjuru kertas.</text>`
  );

  // Visual Correct vs Incorrect Mark Legend
  parts.push(
    `<circle cx="${ix + 48}" cy="${iy + 168}" r="10.5" fill="#111827" stroke="#111827" stroke-width="1.5"/>`
  );
  parts.push(
    `<text x="${ix + 67}" y="${iy + 172}" font-size="11.5" font-weight="700" fill="#15803d">BETUL</text>`
  );
  parts.push(
    `<circle cx="${ix + 178}" cy="${iy + 168}" r="10.5" fill="#ffffff" stroke="#475569" stroke-width="1.5"/>`
  );
  parts.push(
    `<line x1="${ix + 171}" y1="${iy + 161}" x2="${ix + 185}" y2="${iy + 175}" stroke="#dc2626" stroke-width="2"/>`
  );
  parts.push(
    `<line x1="${ix + 185}" y1="${iy + 161}" x2="${ix + 171}" y2="${iy + 175}" stroke="#dc2626" stroke-width="2"/>`
  );
  parts.push(
    `<text x="${ix + 197}" y="${iy + 172}" font-size="11.5" font-weight="700" fill="#b91c1c">SALAH</text>`
  );

  parts.push(
    `<rect x="${ix + 20}" y="${iy + 200}" width="${iw - 40}" height="32" rx="6" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>`
  );
  parts.push(
    `<text x="${ix + iw / 2}" y="${iy + 220}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e3a8a">ADTEC JTM KAMPUS KUANTAN • ${template.questionCount} SOALAN (A–D)</text>`
  );

  // Divider line above Question Grid
  parts.push(
    `<line x1="98" y1="424" x2="802" y2="424" stroke="#cbd5e1" stroke-width="1.2"/>`
  );

  // Column A B C D Headers above each unique question column
  const seenCols = new Set<number>();
  for (const q of template.questions) {
    const colKey = Math.round(q.bubbles.A.x);
    if (seenCols.has(colKey)) continue;
    seenCols.add(colKey);
    const hdrY = 442;
    for (const ch of ANSWER_CHOICES) {
      const b = q.bubbles[ch];
      parts.push(
        `<text x="${b.x}" y="${hdrY}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1e3a8a">${ch}</text>`
      );
    }
  }

  // Draw crisp subtle group backdrop cards around each 5-question block (1–5, 6–10, 11–15...)
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
    const boxX = first.labelX - 24;
    const boxY = first.labelY - r - 3;
    const boxW = first.bubbles.D.x - boxX + r + 8;
    const boxH = last.labelY - first.labelY + r * 2 + 6;
    parts.push(
      `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="5" fill="#f8fafc" stroke="#e2e8f0" stroke-width="0.9"/>`
    );
  }

  // Question Bubbles (dynamic 1..100, A–D only; light gray letters inside bubbles for maximum OMR contrast)
  for (const q of template.questions) {
    const firstB = q.bubbles.A;
    parts.push(
      `<text x="${q.labelX}" y="${q.labelY + Math.round(firstB.r * 0.38)}" text-anchor="end" font-size="${Math.max(10, Math.round(firstB.r * 1.15))}" font-weight="700" fill="#1e293b">${q.questionNumber}</text>`
    );

    for (const ch of ANSWER_CHOICES) {
      const b = q.bubbles[ch];
      parts.push(
        `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#ffffff" stroke="#64748b" stroke-width="1.35"/>`
      );
      parts.push(
        `<text x="${b.x}" y="${b.y + Math.round(b.r * 0.36)}" text-anchor="middle" font-size="${Math.max(8, Math.round(b.r * 0.90))}" fill="#9ca3af">${ch}</text>`
      );
    }
  }

  // Official Bottom-Right Score Box: MARKAH (%)
  const sc = template.scoreBoxRect;
  parts.push(
    `<rect x="${sc.x}" y="${sc.y}" width="${sc.w}" height="${sc.h}" rx="6" fill="#ffffff" stroke="#1e3a8a" stroke-width="1.8"/>`
  );
  parts.push(
    `<path d="M ${sc.x} ${sc.y + 6} Q ${sc.x} ${sc.y} ${sc.x + 6} ${sc.y} L ${sc.x + sc.w - 6} ${sc.y} Q ${sc.x + sc.w} ${sc.y} ${sc.x + sc.w} ${sc.y + 6} L ${sc.x + sc.w} ${sc.y + 20} L ${sc.x} ${sc.y + 20} Z" fill="#1e3a8a"/>`
  );
  parts.push(
    `<text x="${sc.x + sc.w / 2}" y="${sc.y + 14}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#ffffff">MARKAH (%)</text>`
  );
  parts.push(
    `<text x="${sc.x + sc.w - 14}" y="${sc.y + sc.h - 14}" text-anchor="end" font-size="20" font-weight="700" fill="#cbd5e1">%</text>`
  );

  // Footer (aligned left/middle clear of bottom-right score box)
  parts.push(
    `<text x="98" y="1098" font-size="10" fill="#64748b">ADTEC JTM KAMPUS KUANTAN • SISTEM SEMAKAN OMR</text>`
  );
  parts.push(
    `<text x="98" y="1112" font-size="9.5" fill="#94a3b8">Pastikan 4 petak hitam di penjuru kertas jelas dan tidak dilipat semasa imbasan kamera.</text>`
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
 * Generate a realistic synthetic camera photo of a filled ADTEC JTM answer sheet.
 */
export async function generateSyntheticCameraPhoto(
  template: AnswerSheetTemplate,
  answers: Record<number, AnswerChoice[]>,
  studentCode: string,
  studentName: string,
  options?: { rotate180?: boolean; quizTitle?: string }
): Promise<{ canvas: HTMLCanvasElement; dataUrl: string }> {
  const svg = buildSheetSvgMarkup(template, options?.quizTitle ?? 'Penilaian Teori OMR');
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

  const padded = studentCode.replace(/\D/g, '').padStart(NDP_DIGIT_COUNT, '0').slice(0, NDP_DIGIT_COUNT);

  // Write realistic handwritten student header info (5 fields in 2 rows)
  const nb = template.nameCropRect;
  ctx.fillStyle = '#1e293b';
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText(studentName, nb.x + 60, nb.y + 19);
  ctx.fillText('030514-06-0821', nb.x + 526, nb.y + 19);
  ctx.fillText(padded, nb.x + 48, nb.y + 42);
  ctx.fillText('Teknologi Komputer', nb.x + 236, nb.y + 42);
  ctx.fillText('Sem 2', nb.x + 604, nb.y + 42);

  // Shade 8-digit No. NDP bubbles + write digits in top boxes
  ctx.font = 'bold 12px monospace';
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

  // Project sheet onto a realistic desk background with slight 3D perspective tilt + lighting gradient
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
        const light = 0.80 + 0.20 * (x / camW) - 0.12 * (y / camH);
        const noise = (Math.random() - 0.5) * 6;
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
  ctx.fillStyle = 'rgba(28, 32, 40, 0.92)';
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
