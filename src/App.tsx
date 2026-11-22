import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Camera,
  CheckSquare,
  Download,
  FileSpreadsheet,
  KeyRound,
  Plus,
  Printer,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';
import {
  AnswerChoice,
  GradedPaper,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  Quiz,
  Student,
} from './types';
import { clampQuestionCount } from './omr/sheetTemplates';
import { regradePaper } from './omr/omrEngine';
import { ADTEC_LOGO_DATA_URL } from './assets/adtecLogo';
import {
  exportQuizResultsCsv,
  loadPapers,
  loadQuizzes,
  loadStudents,
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

type TabId = 'scan' | 'key' | 'papers' | 'analysis' | 'students' | 'sheets';

const QUICK_QUESTION_PRESETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];

export function App() {
  const [quizzes, setQuizzes] = useState<Quiz[]>(() => loadQuizzes());
  const [activeQuizId, setActiveQuizId] = useState<string>(() => loadQuizzes()[0]?.id ?? '');
  const [students, setStudents] = useState<Student[]>(() => loadStudents());
  const [papers, setPapers] = useState<GradedPaper[]>(() => loadPapers());

  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [scanMode, setScanMode] = useState<'grade' | 'key'>('grade');
  const [reviewPaperId, setReviewPaperId] = useState<string | null>(null);
  const [showNewQuizModal, setShowNewQuizModal] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  } | null>(null);

  // Listen for browser PWA install prompt
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
    if (res.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  // New quiz modal fields (manual question count)
  const [newQuizName, setNewQuizName] = useState('');
  const [newQuizClass, setNewQuizClass] = useState('DKM Semester 2');
  const [newQuizCount, setNewQuizCount] = useState<number>(30);

  useEffect(() => saveQuizzes(quizzes), [quizzes]);
  useEffect(() => saveStudents(students), [students]);
  useEffect(() => savePapers(papers), [papers]);

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

  const handlePaperGraded = (paper: GradedPaper) => {
    setPapers((prev) => [paper, ...prev]);
  };

  const handleUpdatePaper = (updated: GradedPaper) => {
    setPapers((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleDeletePaper = (paperId: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== paperId));
  };

  const handleDownloadCsv = () => {
    if (!activeQuiz) return;
    const csv = exportQuizResultsCsv(activeQuiz, quizPapers, students);
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

  const navItems: Array<{ id: TabId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'scan', label: 'Imbas Kamera', icon: <Camera className="h-4 w-4" /> },
    { id: 'key', label: 'Skema Jawapan', icon: <KeyRound className="h-4 w-4" /> },
    { id: 'papers', label: 'Kertas Disemak', icon: <CheckSquare className="h-4 w-4" />, badge: quizPapers.length },
    { id: 'analysis', label: 'Analisis Item', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'students', label: 'Pelajar (NDP)', icon: <Users className="h-4 w-4" />, badge: students.length },
    { id: 'sheets', label: 'Cetak Borang', icon: <Printer className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navbar with ADTEC JTM Kampus Kuantan Logo */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <img
              src="./pwa-192.png"
              alt="Ikon Aplikasi OMR ADTEC"
              className="h-10 w-10 rounded-xl shadow-sm ring-1 ring-slate-200"
            />
            <img
              src={ADTEC_LOGO_DATA_URL}
              alt="Logo ADTEC JTM Kampus Kuantan"
              className="h-10 w-auto object-contain"
            />
            <div className="hidden border-l border-slate-200 pl-3 sm:block">
              <h1 className="text-sm font-extrabold tracking-tight text-blue-950">
                Sistem Semakan <span className="text-amber-500">OMR</span>
              </h1>
              <p className="text-[11px] font-medium text-slate-500">
                Pengimbas OMR Kamera • No. NDP 8 Digit • Simpanan Lokal Peranti
              </p>
            </div>
          </div>

          {/* Quiz Selector + New Quiz */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Pilih Ujian Aktif"
              value={activeQuiz?.id ?? ''}
              onChange={(e) => setActiveQuizId(e.target.value)}
              className="max-w-[330px] rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} ({q.questionCount} Soalan)
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowNewQuizModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-950"
            >
              <Plus className="h-4 w-4" />
              Ujian Baru
            </button>

            {installPrompt && (
              <button
                onClick={handleInstallPwa}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
                title="Pasang sebagai aplikasi PWA di telefon / desktop"
              >
                <Smartphone className="h-4 w-4 text-amber-600" />
                Pasang App
              </button>
            )}

            {quizzes.length > 1 && activeQuiz && (
              <button
                onClick={() => handleDeleteQuiz(activeQuiz.id)}
                className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="Padam ujian semasa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-t border-slate-100 bg-white">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-1.5">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.id === 'scan') setScanMode('grade');
                    setActiveTab(item.id);
                  }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    active
                      ? 'bg-blue-50 text-blue-900 ring-1 ring-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {typeof item.badge === 'number' && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                        active ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-5">
        {activeQuiz && activeTab === 'scan' && (
          <CameraScanner
            quiz={activeQuiz}
            students={students}
            papers={quizPapers}
            mode={scanMode}
            onPaperGraded={handlePaperGraded}
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
                <h2 className="text-lg font-bold text-slate-900">
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-800 px-4 py-2 text-xs font-bold text-white hover:bg-blue-900"
                >
                  <Camera className="h-4 w-4" />
                  Imbas Kertas Lagi
                </button>
                <button
                  onClick={handleDownloadCsv}
                  disabled={quizPapers.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  Eksport CSV
                </button>
              </div>
            </div>

            {quizPapers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
                <FileSpreadsheet className="mb-3 h-10 w-10 text-slate-300" />
                <h3 className="text-base font-bold text-slate-700">Tiada Kertas Disemak Lagi</h3>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Pergi ke tab <strong>Imbas Kamera</strong> untuk menyemak kertas jawapan pelajar menggunakan kamera telefon/komputer, muat naik gambar, atau simulasi imbasan.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quizPapers.map((p) => {
                  const stu = students.find(
                    (s) => s.id === p.studentId || (p.studentCode && s.studentCode === p.studentCode)
                  );
                  const displayName = p.studentNameOverride || stu?.name || 'Pelajar Belum Ditetapkan';
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
                          <div className="mt-0.5 font-mono text-xs text-slate-500">
                            NDP: {p.studentCode || '—'} • {new Date(p.scannedAt).toLocaleTimeString()}
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
                            {p.percentage}%
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500">
                            {p.score}/{p.maxScore} m
                          </div>
                        </div>
                      </div>

                      {p.nameCropDataUrl && (
                        <img
                          src={p.nameCropDataUrl}
                          alt="Keratan nama pelajar"
                          className="mt-3 max-h-12 w-full rounded-lg border border-slate-100 bg-slate-50 object-contain"
                        />
                      )}

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] font-medium text-slate-500">
                        <span className="text-emerald-700">✓ {p.correctCount}</span>
                        <span className="text-rose-600">✗ {p.wrongCount}</span>
                        <span>Kosong: {p.blankCount}</span>
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
          <StudentsManager students={students} onChangeStudents={setStudents} />
        )}

        {activeQuiz && activeTab === 'sheets' && (
          <PrintableSheetsView
            defaultQuestionCount={activeQuiz.questionCount}
            defaultTitle={activeQuiz.name}
          />
        )}
      </main>

      {/* Paper Review Modal */}
      {reviewPaper && activeQuiz && (
        <PaperReviewModal
          paper={reviewPaper}
          quiz={activeQuiz}
          students={students}
          onClose={() => setReviewPaperId(null)}
          onUpdatePaper={handleUpdatePaper}
          onDeletePaper={handleDeletePaper}
        />
      )}

      {/* Create Quiz Modal (Manual Question Count 1..100) */}
      {showNewQuizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleCreateQuiz}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-blue-950">Cipta Ujian Baru</h3>
              <img src={ADTEC_LOGO_DATA_URL} alt="ADTEC JTM Kuantan" className="h-7 w-auto" />
            </div>
            <p className="text-xs text-slate-500">
              Tetapkan sebarang bilangan soalan secara manual (1 hingga 60 soalan). Saiz bulatan akan dilaras secara automatik supaya borang sentiasa kemas dan penuh.
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
                  Kursus / Bengkel
                </label>
                <input
                  id="new-quiz-class"
                  type="text"
                  placeholder="cth: DKM Semester 2"
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
                    className="w-28 rounded-xl border border-blue-300 bg-blue-50/50 px-3 py-2 text-center font-mono text-base font-extrabold text-blue-900 focus:border-blue-600 focus:outline-none"
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
                Cipta & Tetapkan Skema
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
