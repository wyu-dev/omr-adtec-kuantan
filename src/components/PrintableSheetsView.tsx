import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileImage, Printer, QrCode } from 'lucide-react';
import { InstructorProfile, MAX_QUESTION_COUNT, MIN_QUESTION_COUNT, Quiz } from '../types';
import { buildSheetTemplate, clampQuestionCount } from '../omr/sheetTemplates';
import { buildSheetSvgMarkup } from '../omr/sheetRenderer';
import { generateQuizQrDataUrl } from '../utils/qrHelper';

interface PrintableSheetsViewProps {
  quiz: Quiz;
  instructor: InstructorProfile;
}

const QUICK_COUNTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];

export const PrintableSheetsView: React.FC<PrintableSheetsViewProps> = ({
  quiz,
  instructor,
}) => {
  const [questionCount, setQuestionCount] = useState<number>(
    clampQuestionCount(quiz.questionCount)
  );
  const [title, setTitle] = useState(quiz.name);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    setQuestionCount(clampQuestionCount(quiz.questionCount));
    setTitle(quiz.name);
  }, [quiz.id, quiz.questionCount, quiz.name]);

  useEffect(() => {
    let active = true;
    generateQuizQrDataUrl({ id: quiz.id, questionCount }).then((url) => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [quiz.id, questionCount]);

  const template = useMemo(() => buildSheetTemplate(questionCount), [questionCount]);
  const svgMarkup = useMemo(
    () =>
      buildSheetSvgMarkup(template, {
        quizTitle: title || 'Penilaian Teori / Ujian OMR',
        qrDataUrl,
        instructor,
      }),
    [template, title, qrDataUrl, instructor]
  );

  const downloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adtec-kuantan-omr-${template.questionCount}soalan.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = async () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    URL.revokeObjectURL(url);

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = template.warpWidth * scale;
    canvas.height = template.warpHeight * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `adtec-kuantan-omr-${template.questionCount}soalan.png`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="print-question-count"
                className="mb-1 block text-xs font-bold text-slate-600"
              >
                Bilangan Soalan Manual (1–60)
              </label>
              <input
                id="print-question-count"
                type="number"
                min={MIN_QUESTION_COUNT}
                max={MAX_QUESTION_COUNT}
                value={questionCount}
                onChange={(e) => setQuestionCount(clampQuestionCount(Number(e.target.value)))}
                className="w-28 rounded-xl border border-blue-300 bg-blue-50/40 px-3 py-2 font-mono text-sm font-extrabold text-blue-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="print-sheet-title"
                className="mb-1 block text-xs font-bold text-slate-600"
              >
                Tajuk Ujian / Penilaian
              </label>
              <input
                id="print-sheet-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-64 sm:w-72 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
                placeholder="Tajuk ujian..."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-800 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-900"
            >
              <Printer className="h-4 w-4" />
              Cetak / PDF
            </button>
            <button
              onClick={downloadPng}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileImage className="h-4 w-4 text-sky-600" />
              PNG
            </button>
            <button
              onClick={downloadSvg}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4 text-indigo-600" />
              SVG
            </button>
          </div>
        </div>

        {/* QR Auto-Pair Notice + Quick Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-semibold text-slate-500">Pilihan Pantas:</span>
            {QUICK_COUNTS.map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setQuestionCount(cnt)}
                className={`rounded-lg px-2 py-1 font-bold transition ${
                  questionCount === cnt
                    ? 'bg-blue-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cnt}
              </button>
            ))}
          </div>

          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
            <QrCode className="h-3.5 w-3.5" />
            QR Skema &ldquo;{quiz.name}&rdquo; dibenamkan di penjuru kanan atas
          </span>
        </div>
      </div>

      {/* Exact Vector Sheet Preview */}
      <div className="print-only-sheet mx-auto max-w-[780px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-md">
        <div
          className="[&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    </div>
  );
};
