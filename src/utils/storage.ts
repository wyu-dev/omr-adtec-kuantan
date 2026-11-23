import {
  ANSWER_CHOICES,
  AnswerChoice,
  COURSE_CODES,
  CourseCode,
  GradedPaper,
  InstructorProfile,
  NDP_DIGIT_COUNT,
  QuestionKeyRule,
  Quiz,
  SEMESTER_CODES,
  SemesterCode,
  Student,
} from '../types';
import { clampQuestionCount } from '../omr/sheetTemplates';

const STORAGE_KEYS = {
  QUIZZES: 'adtec_kuantan_omr_quizzes_v2',
  STUDENTS: 'adtec_kuantan_omr_students_v3',
  PAPERS: 'adtec_kuantan_omr_papers_v2',
  INSTRUCTOR: 'adtec_kuantan_omr_instructor_v1',
};

const DEFAULT_25Q_ANSWERS: AnswerChoice[] = [
  'A', 'C', 'B', 'D', 'A',
  'D', 'B', 'C', 'A', 'D',
  'B', 'D', 'C', 'A', 'B',
  'C', 'A', 'D', 'B', 'C',
  'D', 'B', 'A', 'C', 'D',
];

export function createDefaultQuiz(): Quiz {
  const answerKey: Record<number, QuestionKeyRule> = {};
  DEFAULT_25Q_ANSWERS.forEach((ans, idx) => {
    answerKey[idx + 1] = { correctAnswers: [ans], points: 1 };
  });
  return {
    id: 'quiz_adtec_demo',
    name: 'Ujian Teori Teknologi Komputer — Modul 1',
    className: 'IT Sem 2',
    questionCount: 25,
    createdAt: new Date().toISOString(),
    answerKey,
  };
}

export function createDefaultStudents(): Student[] {
  return [
    { id: 'stu_1', studentCode: '22210001', name: 'Muhammad Aiman Hakimi', course: 'IT', semester: '2' },
    { id: 'stu_2', studentCode: '22210002', name: 'Nurul Izzati Syahirah', course: 'CSB', semester: '2' },
    { id: 'stu_3', studentCode: '22210003', name: 'Ahmad Daniel Farhan', course: 'AUTO', semester: '3' },
    { id: 'stu_4', studentCode: '22210004', name: 'Siti Aisyah Humaira', course: 'TPM', semester: '1' },
  ];
}

export function normalizeNdp(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, NDP_DIGIT_COUNT);
}

export function loadInstructorProfile(): InstructorProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INSTRUCTOR);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === 'string') {
        return {
          name: parsed.name,
          signatureDataUrl: typeof parsed.signatureDataUrl === 'string' ? parsed.signatureDataUrl : undefined,
        };
      }
    }
  } catch {
    // ignore
  }
  return { name: '' };
}

export function saveInstructorProfile(profile: InstructorProfile): void {
  localStorage.setItem(STORAGE_KEYS.INSTRUCTOR, JSON.stringify(profile));
}

export function loadQuizzes(): Quiz[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUIZZES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((q) => {
          const cleanKey: Record<number, QuestionKeyRule> = {};
          if (q.answerKey && typeof q.answerKey === 'object') {
            for (const [k, rule] of Object.entries(q.answerKey as Record<string, QuestionKeyRule>)) {
              const filtered = (rule?.correctAnswers ?? []).filter((c) =>
                ANSWER_CHOICES.includes(c as AnswerChoice)
              ) as AnswerChoice[];
              cleanKey[Number(k)] = {
                correctAnswers: filtered,
                points: rule?.points ?? 1,
              };
            }
          }
          return {
            ...q,
            answerKey: cleanKey,
            questionCount: clampQuestionCount(
              q.questionCount ??
                (q.templateId === '100q' ? 60 : q.templateId === '50q' ? 50 : 20)
            ),
          };
        });
      }
    }
  } catch {
    // ignore corrupted storage
  }
  const initial = [createDefaultQuiz()];
  saveQuizzes(initial);
  return initial;
}

export function saveQuizzes(quizzes: Quiz[]): void {
  localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(quizzes));
}

export function loadStudents(): Student[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => ({
          id: s.id ?? `stu_${Math.random().toString(36).slice(2, 7)}`,
          studentCode: String(s.studentCode ?? ''),
          name: String(s.name ?? ''),
          course: COURSE_CODES.includes(s.course as CourseCode) ? (s.course as CourseCode) : '',
          semester: SEMESTER_CODES.includes(s.semester as SemesterCode) ? (s.semester as SemesterCode) : '',
        }));
      }
    }
  } catch {
    // ignore
  }
  const initial = createDefaultStudents();
  saveStudents(initial);
  return initial;
}

export function saveStudents(students: Student[]): void {
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
}

export function loadPapers(): GradedPaper[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PAPERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function savePapers(papers: GradedPaper[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PAPERS, JSON.stringify(papers));
  } catch {
    const trimmed = papers.map((p, idx) =>
      idx > 25 ? { ...p, annotatedImageDataUrl: '' } : p
    );
    try {
      localStorage.setItem(STORAGE_KEYS.PAPERS, JSON.stringify(trimmed));
    } catch {
      // ignore
    }
  }
}

export function exportQuizResultsCsv(
  quiz: Quiz,
  papers: GradedPaper[],
  students: Student[],
  instructorName = ''
): string {
  const qCount = clampQuestionCount(quiz.questionCount);
  const headers = [
    'No. NDP',
    'Nama Pelajar',
    'Kursus',
    'Semester',
    'Betul',
    'Bil. Soalan',
    'Peratus',
    'Salah',
    'Kosong',
    'Disemak Oleh',
    'Masa Imbasan',
    ...Array.from({ length: qCount }, (_, i) => `S${i + 1}`),
  ];

  const rows = papers.map((p) => {
    const stu = students.find(
      (s) => s.id === p.studentId || (p.studentCode && s.studentCode === p.studentCode)
    );
    const name = p.studentNameOverride || stu?.name || p.ocrName || 'Belum Ditetapkan';
    const course = p.detectedCourse || stu?.course || '';
    const semester = p.detectedSemester || stu?.semester || '';
    const qCols = Array.from({ length: qCount }, (_, i) => {
      const q = p.questions.find((item) => item.questionNumber === i + 1);
      return q ? q.selected.join('+') : '';
    });
    return [
      `="${p.studentCode || ''}"`,
      `"${name.replace(/"/g, '""')}"`,
      course,
      semester ? `Sem ${semester}` : '',
      p.correctCount,
      qCount,
      `${p.percentage}%`,
      p.wrongCount,
      p.blankCount,
      `"${instructorName.replace(/"/g, '""')}"`,
      p.scannedAt,
      ...qCols,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
