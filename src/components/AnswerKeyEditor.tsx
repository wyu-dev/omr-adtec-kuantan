import React, { useEffect, useState } from 'react';
import { Camera, Check, QrCode, Shuffle, Trash2 } from 'lucide-react';
import {
  ANSWER_CHOICES,
  AnswerChoice,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  Quiz,
} from '../types';
import { buildSheetTemplate, clampQuestionCount } from '../omr/sheetTemplates';
import { generateQuizQrDataUrl } from '../utils/qrHelper';

interface AnswerKeyEditorProps {
  quiz: Quiz;
  onUpdateQuiz: (updated: Quiz) => void;
  onScanKeyRequest: () => void;
}

export const AnswerKeyEditor: React.FC<AnswerKeyEditorProps> = ({
  quiz,
  onUpdateQuiz,
  onScanKeyRequest,
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const template = buildSheetTemplate(quiz.questionCount);

  useEffect(() => {
    let active = true;
    generateQuizQrDataUrl(quiz).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
  }, [quiz.id, quiz.questionCount]);

  const definedCount = template.questions.filter(
    (q) => (quiz.answerKey[q.questionNumber]?.correctAnswers.length ?? 0) > 0
  ).length;
  const totalPoints = template.questions.reduce((sum, q) => {
    const r = quiz.answerKey[q.questionNumber];
    return sum + (r && r.correctAnswers.length > 0 ? r.points : 0);
  }, 0);

  const handleQuestionCountChange = (rawVal: number) => {
    const nextCount = clampQuestionCount(rawVal);
    onUpdateQuiz({
      ...quiz,
      questionCount: nextCount,
    });
  };

  const toggleAnswer = (qNum: number, choice: AnswerChoice, multiSelect: boolean) => {
    const existing = quiz.answerKey[qNum] ?? { correctAnswers: [], points: 1 };
    let nextAnswers: AnswerChoice[];
    if (multiSelect) {
      nextAnswers = existing.correctAnswers.includes(choice)
        ? existing.correctAnswers.filter((c) => c !== choice)
        : [...existing.correctAnswers, choice].sort();
    } else {
      nextAnswers =
        existing.correctAnswers.includes(choice) && existing.correctAnswers.length === 1
          ? []
          : [choice];
    }

    onUpdateQuiz({
      ...quiz,
      answerKey: {
        ...quiz.answerKey,
        [qNum]: { ...existing, correctAnswers: nextAnswers },
      },
    });
  };

  const setPoints = (qNum: number, points: number) => {
    const existing = quiz.answerKey[qNum] ?? { correctAnswers: [], points: 1 };
    onUpdateQuiz({
      ...quiz,
      answerKey: {
        ...quiz.answerKey,
        [qNum]: { ...existing, points: Math.max(0, Math.min(100, points)) },
      },
    });
  };

  const fillRandomKey = () => {
    const nextKey = { ...quiz.answerKey };
    for (let i = 1; i <= template.questionCount; i++) {
      nextKey[i] = {
        correctAnswers: [ANSWER_CHOICES[Math.floor(Math.random() * ANSWER_CHOICES.length)]],
        points: nextKey[i]?.points ?? 1,
      };
    }
    onUpdateQuiz({ ...quiz, answerKey: nextKey });
  };

  const clearKey = () => {
    onUpdateQuiz({ ...quiz, answerKey: {} });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {qrUrl && (
            <div
              className="hidden shrink-0 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs sm:block"
              title="QR Code unik untuk padanan skema automatik semasa imbasan"
            >
              <img src={qrUrl} alt="QR Code Skema Jawapan" className="h-14 w-14" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                Skema Jawapan — {quiz.name}
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              {definedCount}/{template.questionCount} soalan ditetapkan • {totalPoints} jumlah markah
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <QrCode className="h-3.5 w-3.5" />
              QR unik dijana — pengimbas akan memadankan skema ini secara automatik!
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5">
            <label htmlFor="key-question-count" className="text-xs font-bold text-blue-900">
              Bil. Soalan:
            </label>
            <input
              id="key-question-count"
              type="number"
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              value={quiz.questionCount}
              onChange={(e) => handleQuestionCountChange(Number(e.target.value))}
              className="w-16 rounded-lg border border-blue-300 bg-white px-2 py-1 text-center font-mono text-xs font-bold text-blue-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <button
            onClick={onScanKeyRequest}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600"
          >
            <Camera className="h-4 w-4" />
            Imbas Skema
          </button>
          <button
            onClick={fillRandomKey}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Isi Rawak
          </button>
          <button
            onClick={clearKey}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Padam
          </button>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {template.questions.map((q) => {
          const rule = quiz.answerKey[q.questionNumber] ?? { correctAnswers: [], points: 1 };
          return (
            <div
              key={q.questionNumber}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 text-right font-mono text-sm font-bold text-slate-700">
                  {q.questionNumber}.
                </span>
                <div className="flex items-center gap-1.5">
                  {ANSWER_CHOICES.map((ch) => {
                    const active = rule.correctAnswers.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={(e) => toggleAnswer(q.questionNumber, ch, e.shiftKey)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition active:scale-90 ${
                          active
                            ? 'border-blue-800 bg-blue-800 text-white shadow-xs'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        {active ? (
                          <span className="flex items-center">
                            {ch}
                            <Check className="ml-0.5 hidden h-2.5 w-2.5" />
                          </span>
                        ) : (
                          ch
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label={`Markah soalan ${q.questionNumber}`}
                  min={0}
                  max={100}
                  step={0.5}
                  value={rule.points}
                  onChange={(e) => setPoints(q.questionNumber, Number(e.target.value) || 0)}
                  className="w-12 rounded-lg border border-slate-200 px-1.5 py-1 text-center font-mono text-xs font-semibold text-slate-700 focus:border-blue-600 focus:outline-none"
                  title="Markah"
                />
                <span className="text-[11px] text-slate-400">m</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
