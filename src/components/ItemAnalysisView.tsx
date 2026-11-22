import React, { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { ANSWER_CHOICES, AnswerChoice, GradedPaper, Quiz } from '../types';
import { buildSheetTemplate } from '../omr/sheetTemplates';

interface ItemAnalysisViewProps {
  quiz: Quiz;
  papers: GradedPaper[];
}

export const ItemAnalysisView: React.FC<ItemAnalysisViewProps> = ({ quiz, papers }) => {
  const [sortBy, setSortBy] = useState<'number' | 'hardest' | 'easiest'>('number');
  const template = buildSheetTemplate(quiz.questionCount);

  const stats = useMemo(() => {
    const total = papers.length;
    const rows = template.questions.map((q) => {
      const rule = quiz.answerKey[q.questionNumber];
      const expected = rule?.correctAnswers ?? [];
      const counts: Record<AnswerChoice | 'BLANK' | 'MULTI', number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        BLANK: 0,
        MULTI: 0,
      };
      let correct = 0;
      for (const p of papers) {
        const det = p.questions.find((item) => item.questionNumber === q.questionNumber);
        if (!det) continue;
        if (det.isCorrect) correct++;
        if (det.status === 'blank') counts.BLANK++;
        else if (det.status === 'multiple') counts.MULTI++;
        else if (det.selected[0]) counts[det.selected[0]]++;
      }
      const pctCorrect = total > 0 ? Math.round((correct / total) * 100) : 0;
      return {
        questionNumber: q.questionNumber,
        expected,
        counts,
        correct,
        pctCorrect,
      };
    });

    if (sortBy === 'hardest') rows.sort((a, b) => a.pctCorrect - b.pctCorrect);
    if (sortBy === 'easiest') rows.sort((a, b) => b.pctCorrect - a.pctCorrect);
    return rows;
  }, [papers, quiz, template, sortBy]);

  const summary = useMemo(() => {
    if (papers.length === 0) return { avg: 0, min: 0, max: 0, median: 0 };
    const pcts = papers.map((p) => p.percentage).sort((a, b) => a - b);
    const avg = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;
    const mid = Math.floor(pcts.length / 2);
    const median =
      pcts.length % 2 === 1 ? pcts[mid] : Math.round(((pcts[mid - 1] + pcts[mid]) / 2) * 10) / 10;
    return { avg, min: pcts[0], max: pcts[pcts.length - 1], median };
  }, [papers]);

  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
        <BarChart3 className="mb-3 h-10 w-10 text-slate-300" />
        <h3 className="text-base font-bold text-slate-700">No Item Analysis Data Yet</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Imbas sekurang-kurangnya satu kertas jawapan pelajar untuk melihat ketepatan mengikut soalan dan taburan pilihan A–D.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Class Score Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Papers Graded</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">{papers.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Class Average</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-600">{summary.avg}%</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Median</div>
          <div className="mt-1 text-2xl font-extrabold text-sky-600">{summary.median}%</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Min / Max</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-800">
            {Math.round(summary.min)}% – {Math.round(summary.max)}%
          </div>
        </div>
      </div>

      {/* Sort bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span className="text-sm font-bold text-slate-800">Per-Question Response Distribution</span>
        <div className="flex items-center gap-1.5 text-xs">
          {(['number', 'hardest', 'easiest'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded-lg px-2.5 py-1 font-semibold capitalize transition ${
                sortBy === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'number' ? 'Q#' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Question rows */}
      <div className="space-y-2">
        {stats.map((row) => (
          <div
            key={row.questionNumber}
            className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 w-9 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-800">
                  Q{row.questionNumber}
                </span>
                <span className="text-xs text-slate-500">
                  Key: <strong className="text-emerald-700">{row.expected.join('/') || 'None'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      row.pctCorrect >= 70
                        ? 'bg-emerald-500'
                        : row.pctCorrect >= 45
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                    style={{ width: `${row.pctCorrect}%` }}
                  />
                </div>
                <span className="w-16 text-right font-mono text-xs font-bold text-slate-800">
                  {row.pctCorrect}% ({row.correct}/{papers.length})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-[11px]">
              {ANSWER_CHOICES.map((ch) => {
                const cnt = row.counts[ch];
                const pct = papers.length > 0 ? Math.round((cnt / papers.length) * 100) : 0;
                const isKey = row.expected.includes(ch);
                return (
                  <div
                    key={ch}
                    className={`rounded-lg border px-2 py-1 ${
                      isKey
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-slate-100 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex justify-between font-bold">
                      <span>{ch}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/80">
                      <div
                        className={`h-full rounded-full ${isKey ? 'bg-emerald-600' : 'bg-slate-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-slate-500">
                <div className="flex justify-between font-bold">
                  <span>—/2+</span>
                  <span>
                    {Math.round(((row.counts.BLANK + row.counts.MULTI) / papers.length) * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{
                      width: `${Math.round(((row.counts.BLANK + row.counts.MULTI) / papers.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
