import React, { useMemo, useState } from 'react';
import { Filter, RotateCcw, Search, Trash2, UserPlus, Users } from 'lucide-react';
import {
  COURSE_CODES,
  CourseCode,
  NDP_DIGIT_COUNT,
  SEMESTER_CODES,
  SemesterCode,
  Student,
} from '../types';

interface StudentsManagerProps {
  students: Student[];
  onChangeStudents: (students: Student[]) => void;
}

export const StudentsManager: React.FC<StudentsManagerProps> = ({
  students,
  onChangeStudents,
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

    // Update existing NDP if duplicate, else add new
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

  return (
    <div className="space-y-4">
      {/* Add Student Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-800" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Senarai Pelajar (NDP, Kursus &amp; Semester)</h2>
            <p className="text-xs text-slate-500">
              Pelajar baharu yang diimbas melalui kamera (NDP 8 digit, Kursus, Semester &amp; OCR Nama) turut direkodkan secara automatik di sini.
            </p>
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

      {/* Filter Bar (Kursus + Semester + Search) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
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

          <div className="relative flex-1 min-w-[160px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="Cari nama atau No. NDP"
              placeholder="Cari nama atau No. NDP..."
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

          <span className="ml-auto rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800">
            {filteredStudents.length} / {students.length} pelajar
          </span>
        </div>
      </div>

      {/* Responsive Table / Cards */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">No. NDP</th>
                <th className="px-4 py-3">Nama Pelajar</th>
                <th className="px-4 py-3">Kursus</th>
                <th className="px-4 py-3">Semester</th>
                <th className="px-4 py-3 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-mono font-bold text-blue-800">{s.studentCode}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{s.name}</td>
                  <td className="px-4 py-2.5">
                    {s.course ? (
                      <span className="inline-flex rounded-lg bg-indigo-50 px-2 py-0.5 font-bold text-indigo-800 ring-1 ring-indigo-200">
                        {s.course}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.semester ? (
                      <span className="inline-flex rounded-lg bg-teal-50 px-2 py-0.5 font-bold text-teal-800 ring-1 ring-teal-200">
                        Sem {s.semester}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => removeStudent(s.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Padam pelajar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Tiada pelajar sepadan dengan tapisan dipilih.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
