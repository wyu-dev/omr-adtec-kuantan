import * as XLSX from 'xlsx';
import { GradedPaper, Quiz, Student } from '../types';

export interface QuizCellResult {
  paperId: string;
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  scannedAt: string;
}

export interface StudentGradebookRow {
  student: Student;
  /** quizId -> latest graded paper result for this student */
  byQuiz: Record<string, QuizCellResult | undefined>;
  completedQuizzes: number;
  averagePercentage: number | null;
}

/**
 * Aggregate all scanned papers across ALL quizzes by 8-digit No. NDP (with studentId fallback).
 * If a student was scanned more than once for the same quiz, the most recent scan is used.
 */
export function buildStudentGradebookRows(
  students: Student[],
  quizzes: Quiz[],
  papers: GradedPaper[]
): StudentGradebookRow[] {
  // Index latest paper per (studentCode or studentId) + quizId
  const latestByNdp = new Map<string, GradedPaper>();
  const latestById = new Map<string, GradedPaper>();

  for (const p of papers) {
    if (p.studentCode && !p.studentCode.includes('_')) {
      const key = `${p.studentCode}__${p.quizId}`;
      const existing = latestByNdp.get(key);
      if (!existing || p.scannedAt > existing.scannedAt) {
        latestByNdp.set(key, p);
      }
    }
    if (p.studentId) {
      const key = `${p.studentId}__${p.quizId}`;
      const existing = latestById.get(key);
      if (!existing || p.scannedAt > existing.scannedAt) {
        latestById.set(key, p);
      }
    }
  }

  return students.map((student) => {
    const byQuiz: Record<string, QuizCellResult | undefined> = {};
    let pctSum = 0;
    let completed = 0;

    for (const q of quizzes) {
      const matched =
        latestByNdp.get(`${student.studentCode}__${q.id}`) ??
        latestById.get(`${student.id}__${q.id}`);

      if (matched) {
        byQuiz[q.id] = {
          paperId: matched.id,
          correctCount: matched.correctCount,
          totalQuestions: matched.questions.length || q.questionCount,
          percentage: matched.percentage,
          scannedAt: matched.scannedAt,
        };
        pctSum += matched.percentage;
        completed++;
      }
    }

    const averagePercentage =
      completed > 0 ? Math.round((pctSum / completed) * 10) / 10 : null;

    return {
      student,
      byQuiz,
      completedQuizzes: completed,
      averagePercentage,
    };
  });
}

/**
 * Export the filtered student gradebook to a genuine multi-sheet Excel (.xlsx) workbook:
 * - Sheet 1 ("Markah (%)"): Numeric percentage columns for easy Excel sorting/formulas + Purata (%)
 * - Sheet 2 ("Butiran Betul"): Exact fraction strings (e.g. "20/25") per quiz
 */
export function exportGradebookToExcel(params: {
  rows: StudentGradebookRow[];
  quizzes: Quiz[];
  filterCourse: string;
  filterSemester: string;
  instructorName: string;
}): void {
  const { rows, quizzes, filterCourse, filterSemester, instructorName } = params;
  const courseLabel = filterCourse === 'ALL' ? 'Semua Kursus' : filterCourse;
  const semLabel = filterSemester === 'ALL' ? 'Semua Semester' : `Semester ${filterSemester}`;
  const todayStr = new Date().toLocaleDateString('ms-MY');

  // --- Sheet 1: Ringkasan Markah (%) ---
  const sheet1Data: Array<Array<string | number>> = [
    ['ADTEC JTM KAMPUS KUANTAN — REKOD MARKAH PENILAIAN OMR'],
    [`Kursus: ${courseLabel}`, `Semester: ${semLabel}`, `Disemak oleh: ${instructorName || '-'}`, `Tarikh: ${todayStr}`],
    [],
    [
      'Bil',
      'No. NDP',
      'Nama Pelajar',
      'Kursus',
      'Semester',
      ...quizzes.map((q) => `${q.name} (%)`),
      'Purata (%)',
    ],
  ];

  rows.forEach((r, idx) => {
    const quizCells = quizzes.map((q) => {
      const cell = r.byQuiz[q.id];
      return cell ? Math.round(cell.percentage * 10) / 10 : '-';
    });
    sheet1Data.push([
      idx + 1,
      r.student.studentCode,
      r.student.name,
      r.student.course || '-',
      r.student.semester ? `Sem ${r.student.semester}` : '-',
      ...quizCells,
      r.averagePercentage !== null ? r.averagePercentage : '-',
    ]);
  });

  // Add class average summary row
  const avgPerQuiz = quizzes.map((q) => {
    const vals = rows
      .map((r) => r.byQuiz[q.id]?.percentage)
      .filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return '-';
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  });
  const overallAvgs = rows
    .map((r) => r.averagePercentage)
    .filter((v): v is number => typeof v === 'number');
  const classOverallAvg =
    overallAvgs.length > 0
      ? Math.round((overallAvgs.reduce((a, b) => a + b, 0) / overallAvgs.length) * 10) / 10
      : '-';

  sheet1Data.push([]);
  sheet1Data.push(['', '', 'PURATA KELAS (%)', '', '', ...avgPerQuiz, classOverallAvg]);

  // --- Sheet 2: Butiran Jawapan Betul (contoh: 20/25) ---
  const sheet2Data: Array<Array<string | number>> = [
    ['ADTEC JTM KAMPUS KUANTAN — BUTIRAN BILANGAN JAWAPAN BETUL'],
    [`Kursus: ${courseLabel}`, `Semester: ${semLabel}`, `Disemak oleh: ${instructorName || '-'}`, `Tarikh: ${todayStr}`],
    [],
    [
      'Bil',
      'No. NDP',
      'Nama Pelajar',
      'Kursus',
      'Semester',
      ...quizzes.map((q) => `${q.name} (/${q.questionCount})`),
      'Purata (%)',
    ],
  ];

  rows.forEach((r, idx) => {
    const quizCells = quizzes.map((q) => {
      const cell = r.byQuiz[q.id];
      return cell ? `${cell.correctCount}/${cell.totalQuestions} (${Math.round(cell.percentage)}%)` : '-';
    });
    sheet2Data.push([
      idx + 1,
      r.student.studentCode,
      r.student.name,
      r.student.course || '-',
      r.student.semester ? `Sem ${r.student.semester}` : '-',
      ...quizCells,
      r.averagePercentage !== null ? `${r.averagePercentage}%` : '-',
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);

  // Set clean readable column widths
  const colWidths = [
    { wch: 5 },  // Bil
    { wch: 13 }, // No. NDP
    { wch: 28 }, // Nama
    { wch: 9 },  // Kursus
    { wch: 10 }, // Semester
    ...quizzes.map((q) => ({ wch: Math.max(16, Math.min(28, q.name.length + 6)) })),
    { wch: 13 }, // Purata
  ];
  ws1['!cols'] = colWidths;
  ws2['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws1, 'Markah (%)');
  XLSX.utils.book_append_sheet(wb, ws2, 'Butiran Betul');

  const safeCourse = filterCourse === 'ALL' ? 'SemuaKursus' : filterCourse;
  const safeSem = filterSemester === 'ALL' ? 'SemuaSem' : `Sem${filterSemester}`;
  const dateSlug = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Rekod-Markah-${safeCourse}-${safeSem}-${dateSlug}.xlsx`);
}
