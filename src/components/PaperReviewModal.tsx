import React from 'react';
import { CheckCircle2, Trash2, UserCheck, X, XCircle } from 'lucide-react';
import { ANSWER_CHOICES, AnswerChoice, GradedPaper, Quiz, Student } from '../types';
import { regradePaper } from '../omr/omrEngine';

interface PaperReviewModalProps {
  paper: GradedPaper;
  quiz: Quiz;
  students: Student[];
  onClose: () => void;
  onUpdatePaper: (updated: GradedPaper) => void;
  onDeletePaper: (paperId: string) => void;
}

export const PaperReviewModal: React.FC<PaperReviewModalProps> = ({
  paper,
  quiz,
  students,
  onClose,
  onUpdatePaper,
  onDeletePaper,
}) => {
  const toggleStudentAnswer = (qNum: number, choice: AnswerChoice) => {
    const nextQuestions = paper.questions.map((q) => {
      if (q.questionNumber !== qNum) return q;
      const has = q.selected.includes(choice);
      const selected = has ? q.selected.filter((c) => c !== choice) : [choice];
      return { ...q, selected };
    });
    const regraded = regradePaper({ ...paper, questions: nextQuestions }, quiz);
    onUpdatePaper(regraded);
  };

  const assignStudent = (studentId: string) => {
    const stu = students.find((s) => s.id === studentId);
    onUpdatePaper({
      ...paper,
      studentId: stu?.id,
      studentCode: stu ? stu.studentCode : paper.studentCode,
      studentNameOverride: stu ? undefined : paper.studentNameOverride,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Paper Review — {paper.score}/{paper.maxScore} ({paper.percentage}%)
            </h3>
            <p className="text-xs text-slate-500">
              Scanned {new Date(paper.scannedAt).toLocaleString()} • Click any bubble on the right to manually override an answer
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onDeletePaper(paper.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Paper
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 overflow-y-auto lg:grid-cols-2">
          {/* Left: Warped Sheet Image + Student Assignment */}
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 lg:border-r lg:border-b-0">
            {/* Student Assign Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <UserCheck className="h-4 w-4 text-blue-700" />
                  Pelajar (No. NDP Dikesan: <span className="font-mono text-blue-800">{paper.studentCode || 'Tiada'}</span>)
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  aria-label="Pilih pelajar dari senarai"
                  value={paper.studentId ?? ''}
                  onChange={(e) => assignStudent(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                >
                  <option value="">-- Pilih dari Senarai Pelajar --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentCode} — {s.name} ({s.className})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  aria-label="Nama pelajar manual"
                  placeholder="Atau taip nama manual..."
                  value={paper.studentNameOverride ?? ''}
                  onChange={(e) =>
                    onUpdatePaper({
                      ...paper,
                      studentId: undefined,
                      studentNameOverride: e.target.value,
                    })
                  }
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800"
                />
              </div>

              {paper.nameCropDataUrl && (
                <div className="mt-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Handwritten Header Crop
                  </div>
                  <img
                    src={paper.nameCropDataUrl}
                    alt="Student name box crop"
                    className="max-h-14 w-full rounded-lg border border-slate-200 object-contain bg-white"
                  />
                </div>
              )}
            </div>

            {paper.annotatedImageDataUrl ? (
              <img
                src={paper.annotatedImageDataUrl}
                alt="Annotated scanned sheet"
                className="mx-auto max-h-[600px] w-auto rounded-xl border border-slate-200 bg-white shadow-xs"
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
                Image preview trimmed to preserve browser storage quota.
              </div>
            )}
          </div>

          {/* Right: Question-by-question manual edit */}
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Detected Answers ({paper.correctCount} Correct • {paper.wrongCount} Wrong • {paper.blankCount} Blank)
              </h4>
            </div>
            <div className="space-y-1.5">
              {paper.questions.map((q) => (
                <div
                  key={q.questionNumber}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                    q.expectedAnswers.length === 0
                      ? 'border-slate-200 bg-white'
                      : q.isCorrect
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-rose-200 bg-rose-50/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 text-right font-mono font-bold text-slate-700">
                      {q.questionNumber}.
                    </span>
                    <div className="flex items-center gap-1">
                      {ANSWER_CHOICES.map((ch) => {
                        const isSel = q.selected.includes(ch);
                        const isExp = q.expectedAnswers.includes(ch);
                        return (
                          <button
                            key={ch}
                            onClick={() => toggleStudentAnswer(q.questionNumber, ch)}
                            className={`flex h-7 w-7 items-center justify-center rounded-full border font-bold transition ${
                              isSel && q.isCorrect
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : isSel && !q.isCorrect
                                  ? 'border-rose-600 bg-rose-600 text-white'
                                  : isExp
                                    ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-300/60'
                                    : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                            }`}
                            title={`Darkness: ${Math.round((q.scores[ch] ?? 0) * 100)}%`}
                          >
                            {ch}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">
                      Key: <strong className="text-slate-800">{q.expectedAnswers.join('/') || '—'}</strong>
                    </span>
                    {q.expectedAnswers.length > 0 &&
                      (q.isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-600" />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
