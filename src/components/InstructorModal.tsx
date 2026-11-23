import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, UserCheck, X } from 'lucide-react';
import { InstructorProfile } from '../types';

interface InstructorModalProps {
  profile: InstructorProfile;
  isFirstTime?: boolean;
  onSave: (profile: InstructorProfile) => void;
  onClose: () => void;
}

export const InstructorModal: React.FC<InstructorModalProps> = ({
  profile,
  isFirstTime,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(profile.name);
  const [hasStroke, setHasStroke] = useState(Boolean(profile.signatureDataUrl));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (profile.signatureDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = profile.signatureDataUrl;
    }
  }, [profile.signatureDataUrl]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setHasStroke(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const sigUrl =
      hasStroke && canvasRef.current ? canvasRef.current.toDataURL('image/png') : undefined;
    onSave({ name: trimmed, signatureDataUrl: sigUrl });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-900">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-blue-950">
                {isFirstTime ? 'Tetapkan Profil Pengajar' : 'Profil Pengajar (PWA Ini)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Disimpan sekali dalam peranti ini &amp; digunakan untuk semua penilaian.
              </p>
            </div>
          </div>
          {!isFirstTime && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="instructor-name-input"
              className="mb-1 block text-xs font-bold text-slate-700"
            >
              Nama Pengajar (Ruang &ldquo;Disemak oleh&rdquo;)
            </label>
            <input
              id="instructor-name-input"
              type="text"
              required
              autoFocus
              placeholder="cth: En. Ahmad Faizal bin Ramli"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                <PenLine className="h-3.5 w-3.5 text-blue-700" />
                Tandatangan Digital (Pilihan)
              </label>
              <button
                type="button"
                onClick={clearSignature}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-rose-600"
              >
                <Eraser className="h-3 w-3" />
                Padam
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={360}
              height={110}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full touch-none rounded-xl border border-dashed border-slate-300 bg-slate-50 cursor-crosshair"
            />
            <p className="mt-1 text-[10.5px] text-slate-400">
              Biarkan kosong jika anda lebih selesa menandatangani secara manual pada kertas bercetak.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {!isFirstTime && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
          )}
          <button
            type="submit"
            className="rounded-xl bg-blue-800 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-900"
          >
            Simpan Profil Pengajar
          </button>
        </div>
      </form>
    </div>
  );
};
