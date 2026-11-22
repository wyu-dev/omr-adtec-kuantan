import React, { useState } from 'react';
import { Trash2, UserPlus, Users } from 'lucide-react';
import { NDP_DIGIT_COUNT, Student } from '../types';

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
  const [className, setClassName] = useState('DKM Semester 2');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const digitsOnly = studentCode.replace(/\D/g, '');
    if (digitsOnly.length !== NDP_DIGIT_COUNT) {
      setError(`No. NDP mestilah tepat ${NDP_DIGIT_COUNT} digit nombor (cth: 22210005).`);
      return;
    }
    if (!name.trim()) return;
    setError(null);
    const next: Student = {
      id: `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      studentCode: digitsOnly,
      className: className.trim() || 'Umum',
    };
    onChangeStudents([...students, next]);
    setName('');
    setStudentCode('');
  };

  const removeStudent = (id: string) => {
    onChangeStudents(students.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-800" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Senarai Pelajar & No. NDP</h2>
            <p className="text-xs text-slate-500">
              No. NDP pelajar terdiri daripada <strong>8 digit nombor</strong> dan dipadankan secara automatik semasa imbasan kertas jawapan OMR.
            </p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="grid gap-2.5 sm:grid-cols-4">
          <input
            type="text"
            inputMode="numeric"
            aria-label="No. NDP 8 digit"
            maxLength={NDP_DIGIT_COUNT}
            placeholder="No. NDP 8 Digit (cth: 22210005)"
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
          <input
            type="text"
            aria-label="Kursus atau Kelas"
            placeholder="Kursus / Bengkel"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-800 px-4 py-2 text-xs font-bold text-white hover:bg-blue-900"
          >
            <UserPlus className="h-4 w-4" />
            Tambah Pelajar
          </button>
        </form>

        {error && (
          <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">No. NDP (8 Digit)</th>
              <th className="px-4 py-3">Nama Pelajar</th>
              <th className="px-4 py-3">Kursus / Kelas</th>
              <th className="px-4 py-3 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-2.5 font-mono font-bold text-blue-800">{s.studentCode}</td>
                <td className="px-4 py-2.5 font-semibold text-slate-900">{s.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.className}</td>
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
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Tiada pelajar didaftarkan lagi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
