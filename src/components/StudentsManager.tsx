import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Filter,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  COURSE_CODES,
  CourseCode,
  GradedPaper,
  InstructorProfile,
  NDP_DIGIT_COUNT,
  Quiz,
  SEMESTER_CODES,
  SemesterCode,
  Student,
} from '../types';
import { ADTEC_LOGO_DATA_URL } from '../assets/adtecLogo';
import {
  buildStudentGradebookRows,
  exportGradebookToExcel,
} from '../utils/gradebookExport';

interface StudentsManagerProps {
  students: Student[];
  quizzes: Quiz[];
  papers: GradedPaper[];
  instructor: InstructorProfile;
  onChangeStudents: (students: Student[]) => void;
  onInspectPaper?: (paperId: string) => void;
}

export const StudentsManager: React.FC<StudentsManagerProps> = ({
  students,
  quizzes,
  papers,
  instructor,
  onChangeStudents,
  onInspectPaper,
}) => {
  const [name, setName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [course, setCourse] = useState<CourseCode>('IT');
  const [semester, setSemester] = useState<SemesterCode>('1');
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterCourse, setFilterCourse] = useState<string>('ALL');
  const [filterSemester, setFilterSemester] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (filterCourse !== 'ALL' && s.course !== filterCourse) return false;
      if (filterSemester !== 'ALL' && s.semester !== filterSemester) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.studentCode.includes(q)) return false;
      return true;
    });
  }, [students, filterCourse, filterSemester, searchQuery]);

  // Display quizzes oldest -> newest so columns read naturally left-to-right (Ujian 1, Ujian 2, ...)
  const orderedQuizzes = useMemo(
    () => [...quizzes].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [quizzes]
  );

  // Aggregate scores across ALL quizzes by 8-digit No. NDP
  const gradebookRows = useMemo(
    () => buildStudentGradebookRows(filteredStudents, orderedQuizzes, papers),
    [filteredStudents, orderedQuizzes, papers]
  );

  const classAverages = useMemo(() => {
    const perQuiz: Record<string, number | null> = {};
    for (const q of orderedQuizzes) {
      const vals = gradebookRows
        .map((r) => r.byQuiz[q.id]?.percentage)
        .filter((v): v is number => typeof v === 'number');
      perQuiz[q.id] =
        vals.length > 0
          ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
          : null;
    }
    const overallVals = gradebookRows
      .map((r) => r.averagePercentage)
      .filter((v): v is number => typeof v === 'number');
    const overall =
      overallVals.length > 0
        ? Math.round((overallVals.reduce((a, b) => a + b, 0) / overallVals.length) * 10) / 10
        : null;
    return { perQuiz, overall };
  }, [gradebookRows, orderedQuizzes]);

  const hasActiveFilter =
    filterCourse !== 'ALL' || filterSemester !== 'ALL' || searchQuery.trim().length > 0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const digitsOnly = studentCode.replace(/\D/g, '');
    if (digitsOnly.length !== NDP_DIGIT_COUNT) {
      setError(`No. NDP mestilah tepat ${NDP_DIGIT_COUNT} digit nombor (cth: 22210005).`);
      return;
    }
    if (!name.trim()) return;
    setError(null);

    const existingIdx = students.findIndex((s) => s.studentCode === digitsOnly);
    if (existingIdx >= 0) {
      const updated = [...students];
      updated[existingIdx] = {
        ...updated[existingIdx],
        name: name.trim(),
        course,
        semester,
      };
      onChangeStudents(updated);
    } else {
      const next: Student = {
        id: `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        studentCode: digitsOnly,
        course,
        semester,
      };
      onChangeStudents([next, ...students]);
    }
    setName('');
    setStudentCode('');
  };

  const removeStudent = (id: string) => {
    onChangeStudents(students.filter((s) => s.id !== id));
  };

  const handleExportExcel = () => {
    exportGradebookToExcel({
      rows: gradebookRows,
      quizzes: orderedQuizzes,
      filterCourse,
      filterSemester,
      instructorName: instructor.name,
    });
  };

  const handlePrintReport = () => {
    window.print();
  };

  const courseDisplay = filterCourse === 'ALL' ? 'Semua Kursus' : filterCourse;
  const semDisplay = filterSemester === 'ALL' ? 'Semua Semester' : `Semester ${filterSemester}`;

  return (
    <div className="space-y-4">
      {/* Add Student Form (hidden when printing) */}
      <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-800" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Pelajar &amp; Rekod Markah Terkumpul (Mengikut No. NDP)
              </h2>
              <p className="text-xs text-slate-500">
                Semua markah ujian pelajar dikumpulkan secara automatik berdasarkan 8 digit No. NDP. Tapis mengikut Kursus/Semester untuk eksport Excel atau cetak.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleAdd} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <input
            type="text"
            inputMode="numeric"
            aria-label="No. NDP 8 digit"
            maxLength={NDP_DIGIT_COUNT}
            placeholder="No. NDP (8 Digit)"
            value={studentCode}
            onChange={(e) => {
              setStudentCode(e.target.value.replace(/\D/g, '').slice(0, NDP_DIGIT_COUNT));
              setError(null);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
            required
          />
          <input
            type="text"
            aria-label="Nama Penuh Pelajar"
            placeholder="Nama Penuh Pelajar"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
            required
          />
          <select
            aria-label="Pilih Kursus"
            value={course}
            onChange={(e) => setCourse(e.target.value as CourseCode)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            {COURSE_CODES.map((c) => (
              <option key={c} value={c}>
                Kursus: {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Pilih Semester"
            value={semester}
            onChange={(e) => setSemester(e.target.value as SemesterCode)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            {SEMESTER_CODES.map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-800 px-4 py-2 text-xs font-bold text-white hover:bg-blue-900"
          >
            <UserPlus className="h-4 w-4" />
            Tambah / Kemaskini
          </button>
        </form>

        {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
      </div>

      {/* Filter + Export Excel & Print Action Bar (hidden when printing) */}
      <div className="no-print space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Filter className="h-4 w-4 text-blue-700" />
            Tapis:
          </div>

          <select
            aria-label="Tapis mengikut Kursus"
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">Semua Kursus</option>
            {COURSE_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Tapis mengikut Semester"
            value={filterSemester}
            onChange={(e) => setFilterSemester(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">Semua Semester</option>
            {SEMESTER_CODES.map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[150px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="Cari nama atau No. NDP"
              placeholder="Cari nama / No. NDP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setFilterCourse('ALL');
                setFilterSemester('ALL');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-800">
            Menunjukkan {gradebookRows.length} / {students.length} pelajar • {orderedQuizzes.length} penilaian
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={gradebookRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition active:scale-95 hover:bg-emerald-700 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Eksport Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={handlePrintReport}
              disabled={gradebookRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition active:scale-95 hover:bg-blue-950 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Cetak Markah
            </button>
          </div>
        </div>
      </div>

      {/* Printable Official ADTEC Gradebook Wrapper */}
      <div className="print-grade-report overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Official Print-Only Header */}
        <div className="hidden print:block border-b-2 border-blue-900 px-6 pb-4 pt-2">
          <div className="flex items-center justify-between gap-4">
            <img
              src={ADTEC_LOGO_DATA_URL}
              alt="Logo ADTEC JTM Kampus Kuantan"
              className="h-14 w-auto object-contain"
            />
            <div className="text-right">
              <h1 className="text-lg font-extrabold text-blue-950">
                REKOD MARKAH PENILAIAN PELAJAR (OMR)
              </h1>
              <p className="text-xs font-semibold text-slate-600">
                ADTEC JTM Kampus Kuantan • Tarikh Cetakan: {new Date().toLocaleDateString('ms-MY')}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-6 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 border border-slate-200">
            <span>Kursus: {courseDisplay}</span>
            <span>Semester: {semDisplay}</span>
            <span>Bilangan Pelajar: {gradebookRows.length}</span>
            <span>Bilangan Penilaian: {orderedQuizzes.length}</span>
          </div>
        </div>

        {/* Aggregated Gradebook Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-3 text-center">Bil</th>
                <th className="px-3 py-3">No. NDP</th>
                <th className="px-3 py-3 min-w-[160px]">Nama Pelajar</th>
                <th className="px-3 py-3">Kursus</th>
                <th className="px-3 py-3">Sem</th>
                {orderedQuizzes.map((q, qIdx) => (
                  <th
                    key={q.id}
                    className="px-3 py-3 text-center min-w-[105px]"
                    title={`${q.name} (${q.questionCount} Soalan)`}
                  >
                    <div className="truncate max-w-[130px] mx-auto font-extrabold text-blue-950 normal-case">
                      {q.name.length > 18 ? `U${qIdx + 1}: ${q.name.slice(0, 14)}…` : q.name}
                    </div>
                    <div className="text-[9.5px] font-semibold text-slate-400">
                      ({q.questionCount} Soalan)
                    </div>
                  </th>
                ))}
                <th className="bg-blue-50/70 px-3 py-3 text-center text-blue-950">
                  Purata (%)
                </th>
                <th className="no-print px-3 py-3 text-right">Padam</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gradebookRows.map((row, idx) => (
                <tr key={row.student.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2.5 font-mono font-bold text-blue-800">
                    {row.student.studentCode}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">
                    {row.student.name}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.student.course ? (
                      <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 font-bold text-indigo-800 ring-1 ring-indigo-200 print:ring-0 print:bg-transparent print:text-slate-900">
                        {row.student.course}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.student.semester ? (
                      <span className="inline-flex rounded-md bg-teal-50 px-2 py-0.5 font-bold text-teal-800 ring-1 ring-teal-200 print:ring-0 print:bg-transparent print:text-slate-900">
                        {row.student.semester}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  {orderedQuizzes.map((q) => {
                    const cell = row.byQuiz[q.id];
                    if (!cell) {
                      return (
                        <td key={q.id} className="px-3 py-2.5 text-center text-slate-300">
                          —
                        </td>
                      );
                    }
                    const colorCls =
                      cell.percentage >= 70
                        ? 'text-emerald-700 bg-emerald-50 ring-emerald-200'
                        : cell.percentage >= 50
                          ? 'text-amber-700 bg-amber-50 ring-amber-200'
                          : 'text-rose-700 bg-rose-50 ring-rose-200';
                    return (
                      <td key={q.id} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onInspectPaper?.(cell.paperId)}
                          className={`inline-flex flex-col items-center rounded-lg px-2 py-1 ring-1 transition hover:opacity-85 print:ring-0 print:bg-transparent print:text-slate-900 ${colorCls}`}
                          title="Klik untuk semak kertas pelajar"
                        >
                          <span className="font-extrabold leading-tight">
                            {Math.round(cell.percentage)}%
                          </span>
                          <span className="font-mono text-[10px] opacity-80">
                            {cell.correctCount}/{cell.totalQuestions}
                          </span>
                        </button>
                      </td>
                    );
                  })}

                  <td className="bg-blue-50/40 px-3 py-2.5 text-center font-extrabold text-blue-950">
                    {row.averagePercentage !== null ? `${row.averagePercentage}%` : '—'}
                  </td>

                  <td className="no-print px-3 py-2.5 text-right">
                    <button
                      onClick={() => removeStudent(row.student.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Padam pelajar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {gradebookRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7 + orderedQuizzes.length}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    Tiada pelajar sepadan dengan tapisan dipilih.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Class Average Summary Footer Row */}
            {gradebookRows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-extrabold text-slate-800">
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-right uppercase tracking-wide text-[11px]">
                    Purata Kelas ({courseDisplay} • {semDisplay}):
                  </td>
                  {orderedQuizzes.map((q) => (
                    <td key={q.id} className="px-3 py-2.5 text-center font-mono text-blue-900">
                      {classAverages.perQuiz[q.id] !== null
                        ? `${classAverages.perQuiz[q.id]}%`
                        : '—'}
                    </td>
                  ))}
                  <td className="bg-blue-100/70 px-3 py-2.5 text-center font-mono text-blue-950">
                    {classAverages.overall !== null ? `${classAverages.overall}%` : '—'}
                  </td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Official Print-Only Sign-Off Footer (Disemak oleh:) */}
        <div className="hidden print:flex items-end justify-between border-t border-slate-300 px-6 pb-4 pt-8 text-xs text-slate-800">
          <div>
            <p className="font-bold text-blue-950">Disemak oleh:</p>
            <div className="mt-2 h-12 flex items-end">
              {instructor.signatureDataUrl ? (
                <img
                  src={instructor.signatureDataUrl}
                  alt="Tandatangan Pengajar"
                  className="max-h-12 w-auto object-contain"
                />
              ) : (
                <div className="w-48 border-b border-dashed border-slate-400" />
              )}
            </div>
            <p className="mt-1 font-bold text-slate-900">
              ({instructor.name || '................................................'})
            </p>
            <p className="text-[10.5px] text-slate-500">Pengajar, ADTEC JTM Kampus Kuantan</p>
          </div>
          <div className="text-right text-[10.5px] text-slate-500">
            <p>Tarikh: {new Date().toLocaleDateString('ms-MY')}</p>
            <p>Dijana melalui Sistem Semakan OMR ADTEC JTM Kampus Kuantan</p>
          </div>
        </div>
      </div>
    </div>
  );
};
