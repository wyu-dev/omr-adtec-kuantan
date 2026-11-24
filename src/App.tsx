import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Camera,
  CheckSquare,
  Download,
  FileSpreadsheet,
  KeyRound,
  Plus,
  Printer,
  QrCode,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  AnswerChoice,
  CourseCode,
  GradedPaper,
  InstructorProfile,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  Quiz,
  SemesterCode,
  Student,
} from './types';
import { clampQuestionCount } from './omr/sheetTemplates';
import { regradePaper } from './omr/omrEngine';
import { ADTEC_LOGO_DATA_URL } from './assets/adtecLogo';
import {
  exportQuizResultsCsv,
  loadInstructorProfile,
  loadPapers,
  loadQuizzes,
  loadStudents,
  saveInstructorProfile,
  savePapers,
  saveQuizzes,
  saveStudents,
} from './utils/storage';
import { CameraScanner } from './components/CameraScanner';
import { AnswerKeyEditor } from './components/AnswerKeyEditor';
import { PaperReviewModal } from './components/PaperReviewModal';
import { ItemAnalysisView } from './components/ItemAnalysisView';
import { PrintableSheetsView } from './components/PrintableSheetsView';
import { StudentsManager } from './components/StudentsManager';
import { InstructorModal } from './components/InstructorModal';
import { LandingPage } from './components/LandingPage';

type TabId = 'scan' | 'key' | 'papers' | 'analysis' | 'students' | 'sheets';

const LANDING_SEEN_KEY = 'adtec_kuantan_omr_seen_landing_v1';
const QUICK_QUESTION_PRESETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];

export function App() {
  const [showLanding, setShowLanding] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#panduan') return true;
    try {
      return localStorage.getItem(LANDING_SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [quizzes, setQuizzes] = useState<Quiz[]>(() => loadQuizzes());
  const [activeQuizId, setActiveQuizId] = useState<string>(() => loadQuizzes()[0]?.id ?? '');
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [papers, setPapers] = useState<GradedPaper[]>(() => loadPapers());
  const [instructor, setInstructor] = useState<InstructorProfile>(() => loadInstructorProfile());

  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [scanMode, setScanMode] = useState<'grade' | 'key'>('grade');
  const [reviewPaperId, setReviewPaperId] = useState<string | null>(null);
  const [showNewQuizModal, setShowNewQuizModal] = useState(false);
  const [showInstructorModal, setShowInstructorModal] = useState(false);

  const [installPrompt, setInstallPrompt] = useState<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(
        e as unknown as {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
        }
      );
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const res = await installPrompt.userChoice;
    if (res.outcome === 'accepted') setInstallPrompt(null);
  };

  // New quiz modal fields
  const [newQuizName, setNewQuizName] = useState('');
  const [newQuizClass, setNewQuizClass] = useState('IT Sem 2');
  const [newQuizCount, setNewQuizCount] = useState<number>(30);

  useEffect(() => saveQuizzes(quizzes), [quizzes]);
  useEffect(() => saveStudents(students), [students]);
  useEffect(() => savePapers(papers), [papers]);
  useEffect(() => saveInstructorProfile(instructor), [instructor]);

  const activeQuiz = useMemo(
    () => quizzes.find((q) => q.id === activeQuizId) ?? quizzes[0],
    [quizzes, activeQuizId]
  );

  const quizPapers = useMemo(
    () => papers.filter((p) => p.quizId === activeQuiz?.id),
    [papers, activeQuiz]
  );

  const reviewPaper = useMemo(
    () => papers.find((p) => p.id === reviewPaperId) ?? null,
    [papers, reviewPaperId]
  );

  const handleCreateQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuizName.trim()) return;
    const count = clampQuestionCount(newQuizCount);
    const created: Quiz = {
      id: `quiz_${Date.now()}`,
      name: newQuizName.trim(),
      className: newQuizClass.trim() || 'Umum',
      questionCount: count,
      createdAt: new Date().toISOString(),
      answerKey: {},
    };
    setQuizzes((prev) => [created, ...prev]);
    setActiveQuizId(created.id);
    setNewQuizName('');
    setShowNewQuizModal(false);
    setActiveTab('key');
  };

  const handleDeleteQuiz = (id: string) => {
    if (quizzes.length <= 1) return;
    const remaining = quizzes.filter((q) => q.id !== id);
    setQuizzes(remaining);
    setPapers((prev) => prev.filter((p) => p.quizId !== id));
    if (activeQuizId === id && remaining[0]) {
      setActiveQuizId(remaining[0].id);
    }
  };

  const handleUpdateQuiz = (updated: Quiz) => {
    setQuizzes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    setPapers((prev) =>
      prev.map((p) => (p.quizId === updated.id ? regradePaper(p, updated) : p))
    );
  };

  const handleKeyScanned = (answers: Record<number, AnswerChoice[]>) => {
    if (!activeQuiz) return;
    const nextKey = { ...activeQuiz.answerKey };
    for (const [qStr, choices] of Object.entries(answers)) {
      const qNum = Number(qStr);
      nextKey[qNum] = {
        correctAnswers: choices,
        points: nextKey[qNum]?.points ?? 1,
      };
    }
    handleUpdateQuiz({ ...activeQuiz, answerKey: nextKey });
    setScanMode('grade');
  };

  const handlePaperGraded = useCallback((paper: GradedPaper) => {
    setPapers((prev) => [paper, ...prev]);
  }, []);

  const handleUpdatePaper = useCallback((updated: GradedPaper) => {
    setPapers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handleDeletePaper = useCallback((paperId: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== paperId));
  }, []);

  const handleUpsertStudentFromScan = useCallback(
    (info: {
      studentCode: string;
      name?: string;
      course?: CourseCode | '';
      semester?: SemesterCode | '';
    }): string | undefined => {
      const cleanCode = info.studentCode.replace(/\D/g, '');
      if (cleanCode.length !== 8) return undefined;

      let resolvedId: string | undefined;
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.studentCode === cleanCode);
        if (idx >= 0) {
          resolvedId = prev[idx].id;
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            name:
              next[idx].name && !next[idx].name.startsWith('Pelajar ')
                ? next[idx].name
                : info.name || next[idx].name,
            course: info.course || next[idx].course,
            semester: info.semester || next[idx].semester,
          };
          return next;
        }
        const newId = `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        resolvedId = newId;
        return [
          {
            id: newId,
            studentCode: cleanCode,
            name: info.name || `Pelajar ${cleanCode}`,
            course: info.course || '',
            semester: info.semester || '',
          },
          ...prev,
        ];
      });
      return resolvedId;
    },
    []
  );

  const handleDownloadCsv = () => {
    if (!activeQuiz) return;
    const csv = exportQuizResultsCsv(activeQuiz, quizPapers, students, instructor.name);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeQuiz.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-markah.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const avgPct = useMemo(() => {
    if (quizPapers.length === 0) return null;
    const sum = quizPapers.reduce((acc, p) => acc + p.percentage, 0);
    return Math.round((sum / quizPapers.length) * 10) / 10;
  }, [quizPapers]);

  const navItems: Array<{
    id: TabId;
    shortLabel: string;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    { id: 'scan', shortLabel: 'Imbas', label: 'Imbas Kamera', icon: <Camera className="h-5 w-5" /> },
    { id: 'key', shortLabel: 'Skema', label: 'Skema Jawapan', icon: <KeyRound className="h-5 w-5" /> },
    {
      id: 'papers',
      shortLabel: 'Kertas',
      label: 'Kertas Disemak',
      icon: <CheckSquare className="h-5 w-5" />,
      badge: quizPapers.length,
    },
    { id: 'analysis', shortLabel: 'Analisis', label: 'Analisis Item', icon: <BarChart3 className="h-5 w-5" /> },
    {
      id: 'students',
      shortLabel: 'Pelajar',
      label: 'Pelajar (NDP)',
      icon: <Users className="h-5 w-5" />,
      badge: students.length,
    },
    { id: 'sheets', shortLabel: 'Cetak', label: 'Cetak Borang', icon: <Printer className="h-5 w-5" /> },
  ];

  const handleEnterApp = (targetTab?: TabId) => {
    try {
      localStorage.setItem(LANDING_SEEN_KEY, '1');
    } catch {
      // ignore
    }
    if (window.location.hash === '#panduan') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (targetTab) {
      if (targetTab === 'scan') setScanMode('grade');
      setActiveTab(targetTab);
    }
    setShowLanding(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (showLanding) {
    return (
      <LandingPage
        onEnterApp={handleEnterApp}
        onOpenInstructorSetup={() => setShowInstructorModal(true)}
        canInstallPwa={Boolean(installPrompt)}
        onInstallPwa={handleInstallPwa}
        hasInstructorName={Boolean(instructor.name.trim())}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Compact Mobile-First Top Header */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <img
              src="./pwa-192.png"
              alt="Ikon Aplikasi OMR ADTEC"
              className="h-9 w-9 rounded-xl shadow-xs ring-1 ring-slate-200"
            />
            <img
              src={ADTEC_LOGO_DATA_URL}
              alt="Logo ADTEC JTM Kampus Kuantan"
              className="h-8 w-auto object-contain sm:h-9"
            />
            <div className="hidden border-l border-slate-200 pl-2.5 md:block">
              <h1 className="text-sm font-extrabold tracking-tight text-blue-950">
                Sistem Semakan <span className="text-amber-500">OMR</span>
              </h1>
              <p className="text-[10.5px] font-medium text-slate-500">
                QR Auto-Padan • NDP 8 Digit • Simpanan Lokal
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Reopen Landing Page / Panduan Pengguna */}
            <button
              type="button"
              onClick={() => {
                setShowLanding(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition active:scale-95 hover:bg-slate-100"
              title="Buka halaman panduan cara guna sistem OMR"
            >
              <BookOpen className="h-3.5 w-3.5 text-blue-800" />
              <span className="hidden sm:inline">Panduan</span>
            </button>

            {/* Lecturer Profile Pill (saved once per PWA!) */}
            <button
              type="button"
              onClick={() => setShowInstructorModal(true)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition active:scale-95 ${
                instructor.name
                  ? 'border-blue-200 bg-blue-50/70 text-blue-900 hover:bg-blue-100'
                  : 'border-amber-300 bg-amber-50 text-amber-900 animate-pulse hover:bg-amber-100'
              }`}
              title="Tetapkan Nama Pengajar & Tandatangan untuk ruang 'Disemak oleh'"
            >
              <UserCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[115px] truncate sm:max-w-[160px]">
                {instructor.name || 'Isi Nama Pengajar'}
              </span>
            </button>

            <select
              aria-label="Pilih Ujian Aktif"
              value={activeQuiz?.id ?? ''}
              onChange={(e) => setActiveQuizId(e.target.value)}
              className="max-w-[175px] rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none sm:max-w-[260px]"
            >
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} ({q.questionCount}S)
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowNewQuizModal(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-blue-900 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition active:scale-95 hover:bg-blue-950"
              title="Cipta Penilaian Baru"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Penilaian Baru</span>
            </button>

            {installPrompt && (
              <button
                onClick={handleInstallPwa}
                className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                title="Pasang sebagai aplikasi PWA"
              >
                <Smartphone className="h-3.5 w-3.5 text-amber-600" />
                <span className="hidden sm:inline">Pasang</span>
              </button>
            )}

            {quizzes.length > 1 && activeQuiz && (
              <button
                onClick={() => handleDeleteQuiz(activeQuiz.id)}
                className="rounded-xl border border-slate-200 p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Padam ujian semasa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content with bottom safe padding for mobile bottom nav */}
      <main className="mx-auto max-w-7xl px-3 py-4 pb-28 sm:px-4 sm:py-5 sm:pb-28">
        {activeQuiz && activeTab === 'scan' && (
          <CameraScanner
            quiz={activeQuiz}
            allQuizzes={quizzes}
            students={students}
            papers={quizPapers}
            instructor={instructor}
            mode={scanMode}
            onPaperGraded={handlePaperGraded}
            onPaperUpdated={handleUpdatePaper}
            onAutoPairedQuiz={(qid) => setActiveQuizId(qid)}
            onUpsertStudentFromScan={handleUpsertStudentFromScan}
            onKeyScanned={handleKeyScanned}
            onInspectPaper={(p) => setReviewPaperId(p.id)}
          />
        )}

        {activeQuiz && activeTab === 'key' && (
          <AnswerKeyEditor
            quiz={activeQuiz}
            onUpdateQuiz={handleUpdateQuiz}
            onScanKeyRequest={() => {
              setScanMode('key');
              setActiveTab('scan');
            }}
          />
        )}

        {activeQuiz && activeTab === 'papers' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                  Kertas Disemak — {activeQuiz.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {quizPapers.length} kertas disemak ({activeQuiz.questionCount} soalan)
                  {avgPct !== null ? ` • Purata Kelas: ${avgPct}%` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setScanMode('grade');
                    setActiveTab('scan');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-900"
                >
                  <Camera className="h-4 w-4" />
                  Imbas Lagi
                </button>
                <button
                  onClick={handleDownloadCsv}
                  disabled={quizPapers.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  CSV
                </button>
              </div>
            </div>

            {quizPapers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
                <FileSpreadsheet className="mb-3 h-10 w-10 text-slate-300" />
                <h3 className="text-base font-bold text-slate-700">Tiada Kertas Disemak Lagi</h3>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Tekan tab <strong>Imbas</strong> di bawah untuk menyemak kertas jawapan pelajar. QR Code di kanan atas akan memadankan skema secara automatik.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quizPapers.map((p) => {
                  const stu = students.find(
                    (s) => s.id === p.studentId || (p.studentCode && s.studentCode === p.studentCode)
                  );
                  const displayName =
                    p.studentNameOverride || stu?.name || p.ocrName || 'Pelajar Belum Ditetapkan';
                  const course = p.detectedCourse || stu?.course || '';
                  const sem = p.detectedSemester || stu?.semester || '';
                  return (
                    <div
                      key={p.id}
                      onClick={() => setReviewPaperId(p.id)}
                      className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-blue-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-800">
                            {displayName}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-500">
                            <span>NDP: {p.studentCode || '—'}</span>
                            {course && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.2 font-sans font-bold text-indigo-800">
                                {course}
                              </span>
                            )}
                            {sem && (
                              <span className="rounded bg-teal-50 px-1.5 py-0.2 font-sans font-bold text-teal-800">
                                Sem {sem}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`text-lg font-extrabold ${
                              p.percentage >= 70
                                ? 'text-emerald-600'
                                : p.percentage >= 50
                                  ? 'text-amber-600'
                                  : 'text-rose-600'
                            }`}
                          >
                            {Math.round(p.percentage)}%
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500">
                            {p.correctCount}/{p.questions.length} betul
                          </div>
                        </div>
                      </div>

                      {p.nameCropDataUrl && (
                        <img
                          src={p.nameCropDataUrl}
                          alt="Keratan maklumat pelajar"
                          className="mt-2.5 max-h-12 w-full rounded-lg border border-slate-100 bg-slate-50 object-contain"
                        />
                      )}

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500">
                        <span className="text-emerald-700">✓ {p.correctCount}</span>
                        <span className="text-rose-600">✗ {p.wrongCount}</span>
                        {p.qrMatchedQuizId && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700">
                            <QrCode className="h-3 w-3" /> QR
                          </span>
                        )}
                        <span className="font-semibold text-blue-700 group-hover:underline">
                          Semak →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeQuiz && activeTab === 'analysis' && (
          <ItemAnalysisView quiz={activeQuiz} papers={quizPapers} />
        )}

        {activeTab === 'students' && (
          <StudentsManager
            students={students}
            quizzes={quizzes}
            papers={papers}
            instructor={instructor}
            onChangeStudents={setStudents}
            onInspectPaper={(paperId) => setReviewPaperId(paperId)}
          />
        )}

        {activeQuiz && activeTab === 'sheets' && (
          <PrintableSheetsView quiz={activeQuiz} instructor={instructor} />
        )}
      </main>

      {/* Mobile-First Animated Bottom Navigation Dock */}
      <nav
        aria-label="Navigasi Utama"
        className="no-print safe-bottom-pad fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-6 gap-0.5 px-1.5 pt-1.5">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'scan') setScanMode('grade');
                  setActiveTab(item.id);
                }}
                className={`relative flex flex-col items-center justify-center rounded-2xl py-1.5 transition-all duration-200 active:scale-90 ${
                  active ? 'text-blue-900' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {/* Sliding/expanding active top accent pill */}
                <span
                  className={`absolute top-0 h-1 rounded-full bg-amber-500 transition-all duration-300 ${
                    active ? 'w-8 opacity-100' : 'w-0 opacity-0'
                  }`}
                />

                <div
                  className={`relative flex h-8 w-11 items-center justify-center rounded-xl transition-colors duration-200 ${
                    active ? 'nav-icon-active bg-blue-100/90 text-blue-900' : 'bg-transparent'
                  }`}
                >
                  {item.icon}
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-extrabold text-white shadow-xs ${
                        active ? 'bg-blue-900' : 'bg-slate-500'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>

                <span
                  className={`mt-0.5 text-[10px] leading-tight transition-all duration-200 ${
                    active ? 'font-extrabold text-blue-950' : 'font-semibold text-slate-500'
                  }`}
                >
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Instructor Profile Modal (Nama Pengajar & Tandatangan) */}
      {showInstructorModal && (
        <InstructorModal
          profile={instructor}
          onSave={setInstructor}
          onClose={() => setShowInstructorModal(false)}
        />
      )}

      {/* Paper Review Modal */}
      {reviewPaper && activeQuiz && (
        <PaperReviewModal
          paper={reviewPaper}
          quiz={quizzes.find((q) => q.id === reviewPaper.quizId) ?? activeQuiz}
          students={students}
          onClose={() => setReviewPaperId(null)}
          onUpdatePaper={handleUpdatePaper}
          onDeletePaper={handleDeletePaper}
        />
      )}

      {/* Create Quiz Modal */}
      {showNewQuizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleCreateQuiz}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-blue-950">Cipta Penilaian Baru</h3>
              <img src={ADTEC_LOGO_DATA_URL} alt="ADTEC JTM Kuantan" className="h-7 w-auto" />
            </div>
            <p className="text-xs text-slate-500">
              Tetapkan sebarang bilangan soalan secara manual (1 hingga 60 soalan). QR Code unik skema akan dijana secara automatik.
            </p>

            <div className="mt-4 space-y-3.5">
              <div>
                <label htmlFor="new-quiz-name" className="mb-1 block text-xs font-bold text-slate-700">
                  Nama Ujian / Modul
                </label>
                <input
                  id="new-quiz-name"
                  type="text"
                  required
                  autoFocus
                  placeholder="cth: Peperiksaan Akhir — Teknologi Kimpalan"
                  value={newQuizName}
                  onChange={(e) => setNewQuizName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="new-quiz-class" className="mb-1 block text-xs font-bold text-slate-700">
                  Catatan Kursus / Kumpulan
                </label>
                <input
                  id="new-quiz-class"
                  type="text"
                  placeholder="cth: IT / KIMP Sem 2"
                  value={newQuizClass}
                  onChange={(e) => setNewQuizClass(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="new-quiz-count" className="mb-1 block text-xs font-bold text-slate-700">
                  Bilangan Soalan Manual ({MIN_QUESTION_COUNT} – {MAX_QUESTION_COUNT})
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="new-quiz-count"
                    type="number"
                    min={MIN_QUESTION_COUNT}
                    max={MAX_QUESTION_COUNT}
                    required
                    value={newQuizCount}
                    onChange={(e) => setNewQuizCount(Number(e.target.value))}
                    className="w-24 rounded-xl border border-blue-300 bg-blue-50/50 px-3 py-2 text-center font-mono text-base font-extrabold text-blue-900 focus:border-blue-600 focus:outline-none"
                  />
                  <input
                    type="range"
                    aria-label="Pelaras bilangan soalan"
                    min={MIN_QUESTION_COUNT}
                    max={MAX_QUESTION_COUNT}
                    value={clampQuestionCount(newQuizCount)}
                    onChange={(e) => setNewQuizCount(Number(e.target.value))}
                    className="flex-1 accent-blue-800"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_QUESTION_PRESETS.map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setNewQuizCount(n)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                        newQuizCount === n
                          ? 'bg-blue-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewQuizModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-xl bg-blue-800 px-4 py-2 text-xs font-bold text-white hover:bg-blue-900"
              >
                Cipta &amp; Jana QR Skema
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
