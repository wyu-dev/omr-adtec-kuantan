import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FlipHorizontal2,
  ImagePlus,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCw,
  ScanText,
  Sparkles,
  SquareCheckBig,
  Volume2,
  VolumeX,
  Zap,
  ZapOff,
} from 'lucide-react';
import {
  ANSWER_CHOICES,
  AnswerChoice,
  COURSE_CODES,
  CourseCode,
  FiducialDetectionResult,
  GradedPaper,
  InstructorProfile,
  Quiz,
  SEMESTER_CODES,
  SemesterCode,
  Student,
} from '../types';
import { buildSheetTemplate } from '../omr/sheetTemplates';
import {
  detectFullFrameFiducials,
  detectViewfinderFiducials,
  processAndGradeSheet,
} from '../omr/omrEngine';
import { generateSyntheticCameraPhoto } from '../omr/sheetRenderer';
import { generateQuizQrDataUrl } from '../utils/qrHelper';
import { recognizeStudentNameFromCrop } from '../utils/handwritingOcr';
import { playScanErrorSound, playScanSuccessSound } from '../utils/sound';

interface CameraScannerProps {
  quiz: Quiz;
  allQuizzes: Quiz[];
  students: Student[];
  papers: GradedPaper[];
  instructor: InstructorProfile;
  mode: 'grade' | 'key';
  onPaperGraded: (paper: GradedPaper) => void;
  onPaperUpdated: (paper: GradedPaper) => void;
  onAutoPairedQuiz: (quizId: string) => void;
  onUpsertStudentFromScan: (info: {
    studentCode: string;
    name?: string;
    course?: CourseCode | '';
    semester?: SemesterCode | '';
  }) => string | undefined;
  onKeyScanned?: (answers: Record<number, AnswerChoice[]>) => void;
  onInspectPaper?: (paper: GradedPaper) => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  quiz,
  allQuizzes,
  students,
  papers,
  instructor,
  mode,
  onPaperGraded,
  onPaperUpdated,
  onAutoPairedQuiz,
  onUpsertStudentFromScan,
  onKeyScanned,
  onInspectPaper,
}) => {
  const template = buildSheetTemplate(quiz.questionCount);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lockStreakRef = useRef<number>(0);
  const cooldownUntilRef = useRef<number>(0);
  const latestDetectionRef = useRef<FiducialDetectionResult | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [continuousMode, setContinuousMode] = useState(false);
  const [enableOcr, setEnableOcr] = useState(true);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Selaraskan 4 petak hitam penjuru di dalam bingkai');
  const [lockedCount, setLockedCount] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastPaper, setLastPaper] = useState<GradedPaper | null>(null);
  const [simUpsideDown, setSimUpsideDown] = useState(false);
  const [scanToast, setScanToast] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleGradedResult = useCallback(
    (paper: GradedPaper) => {
      // Auto-switch active quiz if Top-Right QR matched another quiz
      if (mode === 'grade' && paper.qrMatchedQuizId && paper.qrMatchedQuizId !== quiz.id) {
        onAutoPairedQuiz(paper.qrMatchedQuizId);
      }

      // Auto-link or record student by 8-digit No. NDP + detected Kursus + Semester
      let linkedStudentId = paper.studentId;
      const existingStu = paper.studentCode
        ? students.find((s) => s.studentCode === paper.studentCode)
        : undefined;

      if (existingStu) {
        linkedStudentId = existingStu.id;
        // Fill in missing Kursus / Semester on roster if detected on sheet
        if ((paper.detectedCourse && !existingStu.course) || (paper.detectedSemester && !existingStu.semester)) {
          onUpsertStudentFromScan({
            studentCode: existingStu.studentCode,
            name: existingStu.name,
            course: paper.detectedCourse || existingStu.course,
            semester: paper.detectedSemester || existingStu.semester,
          });
        }
      } else if (paper.studentCode && !paper.studentCode.includes('_') && mode === 'grade') {
        linkedStudentId = onUpsertStudentFromScan({
          studentCode: paper.studentCode,
          course: paper.detectedCourse,
          semester: paper.detectedSemester,
        });
      }

      const enriched: GradedPaper = linkedStudentId
        ? { ...paper, studentId: linkedStudentId }
        : paper;

      if (soundEnabled) playScanSuccessSound();

      if (mode === 'key' && onKeyScanned) {
        const keyMap: Record<number, AnswerChoice[]> = {};
        for (const q of enriched.questions) {
          if (q.selected.length > 0) {
            keyMap[q.questionNumber] = q.selected;
          }
        }
        onKeyScanned(keyMap);
        setLastPaper(enriched);
        setScanToast(`Skema Jawapan diimport (${Object.keys(keyMap).length} soalan dikesan)`);
      } else {
        onPaperGraded(enriched);
        setLastPaper(enriched);
        const label = existingStu
          ? existingStu.name
          : enriched.studentCode
            ? `NDP ${enriched.studentCode}`
            : 'Kertas Pelajar';
        const qrTag = enriched.qrMatchedQuizName ? ` • QR: ${enriched.qrMatchedQuizName}` : '';
        setScanToast(
          `${label}: ${enriched.correctCount}/${enriched.questions.length} (${Math.round(enriched.percentage)}%)${qrTag}`
        );

        // Run Handwriting OCR asynchronously on the isolated NAMA strip
        if (enableOcr && enriched.nameLineDataUrl) {
          setOcrRunning(true);
          recognizeStudentNameFromCrop(enriched.nameLineDataUrl)
            .then((ocrName) => {
              if (!ocrName) return;
              let finalStudentId = enriched.studentId;
              if (enriched.studentCode && !enriched.studentCode.includes('_')) {
                // Only update roster name if student was newly auto-created or unnamed
                if (!existingStu) {
                  finalStudentId = onUpsertStudentFromScan({
                    studentCode: enriched.studentCode,
                    name: ocrName,
                    course: enriched.detectedCourse,
                    semester: enriched.detectedSemester,
                  });
                }
              }
              const updatedPaper: GradedPaper = {
                ...enriched,
                ocrName,
                studentId: finalStudentId,
                studentNameOverride:
                  !existingStu && !enriched.studentNameOverride ? ocrName : enriched.studentNameOverride,
              };
              onPaperUpdated(updatedPaper);
              setLastPaper((prev) => (prev?.id === updatedPaper.id ? updatedPaper : prev));
            })
            .finally(() => setOcrRunning(false));
        }
      }

      if (continuousMode) {
        cooldownUntilRef.current = performance.now() + 2400;
        setTimeout(() => setScanToast(null), 2200);
      }
    },
    [
      mode,
      quiz.id,
      students,
      soundEnabled,
      enableOcr,
      continuousMode,
      onAutoPairedQuiz,
      onUpsertStudentFromScan,
      onKeyScanned,
      onPaperGraded,
      onPaperUpdated,
    ]
  );

  const captureFromVideo = useCallback(
    (
      forcedCorners?: [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ]
    ) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;

      const capCanvas = document.createElement('canvas');
      capCanvas.width = video.videoWidth;
      capCanvas.height = video.videoHeight;
      const ctx = capCanvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const fullImg = ctx.getImageData(0, 0, capCanvas.width, capCanvas.height);

      let corners = forcedCorners;
      if (!corners) {
        corners = detectFullFrameFiducials(fullImg.data, fullImg.width, fullImg.height) ?? undefined;
      }

      if (!corners) {
        if (soundEnabled) playScanErrorSound();
        setStatusMsg('4 petak penjuru tidak dikesan. Pastikan pencahayaan baik & keseluruhan borang kelihatan.');
        return;
      }

      const paper = processAndGradeSheet(
        fullImg,
        corners,
        template,
        quiz,
        latestDetectionRef.current?.sharpness ?? 100,
        {
          allQuizzes,
          instructor,
          allowQrAutoPair: mode === 'grade',
        }
      );
      handleGradedResult(paper);
    },
    [template, quiz, allQuizzes, instructor, mode, soundEnabled, handleGradedResult]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setLastPaper(null);
    lockStreakRef.current = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'API Kamera tidak tersedia dalam konteks ini (memerlukan HTTPS atau localhost). Guna Muat Naik Gambar atau Simulasi di bawah.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(Boolean(caps?.torch));
      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengakses kamera';
      setCameraError(
        `Akses kamera gagal: ${msg}. Anda masih boleh muat naik gambar borang atau cuba Simulasi Imbasan.`
      );
    }
  }, [facingMode, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // ignore unsupported torch
    }
  };

  // Real-time viewfinder detection loop
  useEffect(() => {
    if (!cameraActive) return;
    let cancelled = false;
    let lastTick = 0;

    const tick = (now: number) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);

      if (now - lastTick < 75) return;
      lastTick = now;

      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.videoWidth === 0 || video.videoHeight === 0) return;
      if (!continuousMode && lastPaper) return;

      const targetW = 480;
      const scale = targetW / video.videoWidth;
      const targetH = Math.round(video.videoHeight * scale);

      let work = workCanvasRef.current;
      if (!work) {
        work = document.createElement('canvas');
        workCanvasRef.current = work;
      }
      if (work.width !== targetW || work.height !== targetH) {
        work.width = targetW;
        work.height = targetH;
      }
      const wCtx = work.getContext('2d', { willReadFrequently: true })!;
      wCtx.drawImage(video, 0, 0, targetW, targetH);
      const frame = wCtx.getImageData(0, 0, targetW, targetH);

      const det = detectViewfinderFiducials(frame.data, targetW, targetH);
      latestDetectionRef.current = det;
      const locked = det.corners.filter(Boolean).length;
      setLockedCount(locked);
      setSharpness(Math.round(det.sharpness));

      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }
      const oCtx = overlay.getContext('2d')!;
      oCtx.clearRect(0, 0, overlay.width, overlay.height);

      const [gTL, gTR, gBR] = det.guideRects;
      const sx = gTL.x * overlay.width;
      const sy = gTL.y * overlay.height;
      const sw = (gTR.x + gTR.w - gTL.x) * overlay.width;
      const sh = (gBR.y + gBR.h - gTL.y) * overlay.height;

      oCtx.fillStyle = 'rgba(2, 6, 23, 0.36)';
      oCtx.fillRect(0, 0, overlay.width, sy);
      oCtx.fillRect(0, sy + sh, overlay.width, overlay.height - (sy + sh));
      oCtx.fillRect(0, sy, sx, sh);
      oCtx.fillRect(sx + sw, sy, overlay.width - (sx + sw), sh);

      const invScale = 1 / scale;
      det.guideRects.forEach((g, idx) => {
        const isLocked = det.corners[idx] !== null;
        const gx = g.x * overlay.width;
        const gy = g.y * overlay.height;
        const gw = g.w * overlay.width;
        const gh = g.h * overlay.height;

        oCtx.strokeStyle = isLocked ? '#22c55e' : 'rgba(255,255,255,0.85)';
        oCtx.lineWidth = isLocked ? 5 : 3;
        oCtx.strokeRect(gx, gy, gw, gh);

        if (isLocked) {
          oCtx.fillStyle = 'rgba(34, 197, 94, 0.16)';
          oCtx.fillRect(gx, gy, gw, gh);
          const pt = det.corners[idx]!;
          const px = pt.x * invScale;
          const py = pt.y * invScale;
          oCtx.fillStyle = '#22c55e';
          oCtx.beginPath();
          oCtx.arc(px, py, 9, 0, Math.PI * 2);
          oCtx.fill();
          oCtx.strokeStyle = '#ffffff';
          oCtx.lineWidth = 2.5;
          oCtx.stroke();
        }
      });

      if (det.allLocked) {
        const pts = det.corners.map((c) => ({ x: c!.x * invScale, y: c!.y * invScale }));
        oCtx.strokeStyle = det.isSharp ? '#4ade80' : '#facc15';
        oCtx.lineWidth = 3;
        oCtx.beginPath();
        oCtx.moveTo(pts[0].x, pts[0].y);
        oCtx.lineTo(pts[1].x, pts[1].y);
        oCtx.lineTo(pts[2].x, pts[2].y);
        oCtx.lineTo(pts[3].x, pts[3].y);
        oCtx.closePath();
        oCtx.stroke();
      }

      if (now < cooldownUntilRef.current) {
        setStatusMsg('Sedia untuk kertas seterusnya…');
        lockStreakRef.current = 0;
        return;
      }

      if (det.allLocked && det.isSharp) {
        lockStreakRef.current++;
        setStatusMsg(`4 penjuru dikunci! Stabil (${lockStreakRef.current}/4)…`);
        if (autoCapture && lockStreakRef.current >= 4) {
          lockStreakRef.current = 0;
          const fullCorners = det.corners.map((c) => ({
            x: c!.x * invScale,
            y: c!.y * invScale,
          })) as [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
          ];
          captureFromVideo(fullCorners);
        }
      } else {
        lockStreakRef.current = Math.max(0, lockStreakRef.current - 1);
        if (det.allLocked && !det.isSharp) {
          setStatusMsg('Penjuru dikunci — pegang telefon dengan stabil untuk fokus…');
        } else {
          setStatusMsg(`Dikunci ${locked}/4 petak penjuru — selaraskan di dalam bingkai`);
        }
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [cameraActive, autoCapture, continuousMode, lastPaper, captureFromVideo]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setCameraError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      const corners = detectFullFrameFiducials(imgData.data, w, h);
      if (!corners) {
        if (soundEnabled) playScanErrorSound();
        setCameraError(
          'Gagal mengesan kesemua 4 petak penjuru hitam. Pastikan keseluruhan borang kelihatan jelas.'
        );
      } else {
        const paper = processAndGradeSheet(imgData, corners, template, quiz, 140, {
          allQuizzes,
          instructor,
          allowQrAutoPair: mode === 'grade',
        });
        handleGradedResult(paper);
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Gagal memproses gambar');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  // Realistic synthetic test scan (includes real QR code, KURSUS, SEMESTER, 8-digit NDP & readable Name)
  const handleSimulateScan = async () => {
    setBusy(true);
    setCameraError(null);
    try {
      const pickNewStudent = Math.random() < 0.35;
      const randomCourse = COURSE_CODES[Math.floor(Math.random() * COURSE_CODES.length)];
      const randomSem = SEMESTER_CODES[Math.floor(Math.random() * SEMESTER_CODES.length)];
      const stu =
        !pickNewStudent && students.length > 0
          ? students[Math.floor(Math.random() * students.length)]
          : {
              studentCode: `2221${String(Math.floor(1000 + Math.random() * 8999))}`,
              name: 'FARIS HAKIM ZAINAL',
              course: randomCourse,
              semester: randomSem,
            };

      const answers: Record<number, AnswerChoice[]> = {};
      for (const q of template.questions) {
        const rule = quiz.answerKey[q.questionNumber];
        const r = Math.random();
        if (mode === 'key') {
          answers[q.questionNumber] = [
            ANSWER_CHOICES[Math.floor(Math.random() * ANSWER_CHOICES.length)],
          ];
        } else if (rule && rule.correctAnswers.length > 0 && r < 0.8) {
          answers[q.questionNumber] = [rule.correctAnswers[0]];
        } else if (r < 0.94) {
          const wrongPool = ANSWER_CHOICES.filter((c) => !rule?.correctAnswers.includes(c));
          answers[q.questionNumber] = [wrongPool[Math.floor(Math.random() * wrongPool.length)]];
        } else {
          answers[q.questionNumber] = [];
        }
      }

      const qrDataUrl = await generateQuizQrDataUrl(quiz);
      const { canvas } = await generateSyntheticCameraPhoto(
        template,
        answers,
        stu.studentCode,
        stu.name,
        {
          rotate180: simUpsideDown,
          quizTitle: quiz.name,
          qrDataUrl,
          course: stu.course || randomCourse,
          semester: stu.semester || randomSem,
          instructor,
        }
      );
      const ctx = canvas.getContext('2d')!;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const corners = detectFullFrameFiducials(imgData.data, canvas.width, canvas.height);
      if (!corners) {
        setCameraError('Simulasi gagal mengesan 4 petak penjuru.');
      } else {
        const paper = processAndGradeSheet(imgData, corners, template, quiz, 180, {
          allQuizzes,
          instructor,
          allowQrAutoPair: mode === 'grade',
        });
        handleGradedResult(paper);
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Simulasi gagal');
    } finally {
      setBusy(false);
    }
  };

  const displayedPaper = lastPaper
    ? papers.find((p) => p.id === lastPaper.id) ?? lastPaper
    : null;

  const matchedStudent = displayedPaper
    ? students.find(
        (s) =>
          s.id === displayedPaper.studentId ||
          (displayedPaper.studentCode && s.studentCode === displayedPaper.studentCode)
      )
    : undefined;

  return (
    <div className="space-y-3.5">
      {/* Scanner Header & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                mode === 'key'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {mode === 'key' ? 'IMBAS SKEMA' : 'IMBAS KERTAS PELAJAR'}
            </span>
            {mode === 'grade' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                <QrCode className="h-3 w-3" />
                QR Auto-Padan Aktif
              </span>
            )}
          </div>
          <h2 className="mt-1 truncate text-base font-bold text-slate-900 sm:text-lg">
            {quiz.name}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!cameraActive ? (
            <button
              onClick={startCamera}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 hover:bg-emerald-700 sm:text-sm"
            >
              <Camera className="h-4 w-4" />
              Buka Kamera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white transition active:scale-95 hover:bg-slate-900 sm:text-sm"
            >
              Tutup Kamera
            </button>
          )}

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition active:scale-95 hover:bg-slate-50 sm:text-sm">
            <ImagePlus className="h-4 w-4 text-sky-600" />
            Muat Naik
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={handleSimulateScan}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-bold text-indigo-700 transition active:scale-95 hover:bg-indigo-100 disabled:opacity-60 sm:text-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Simulasi
          </button>
        </div>
      </div>

      {/* Compact Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] text-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(e) => setAutoCapture(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-emerald-600"
            />
            Auto-Tangkap
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
            <input
              type="checkbox"
              checked={continuousMode}
              onChange={(e) => setContinuousMode(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-emerald-600"
            />
            Imbasan Berterusan
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
            <input
              type="checkbox"
              checked={enableOcr}
              onChange={(e) => setEnableOcr(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-blue-700"
            />
            <ScanText className="h-3.5 w-3.5 text-blue-700" />
            OCR Nama
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
            <input
              type="checkbox"
              checked={simUpsideDown}
              onChange={(e) => setSimUpsideDown(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-indigo-600"
            />
            <RotateCw className="h-3.5 w-3.5 text-indigo-600" />
            Uji 180°
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100"
          >
            {soundEnabled ? (
              <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-slate-400" />
            )}
            Bunyi
          </button>
          {cameraActive && (
            <>
              <button
                onClick={() => {
                  setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'));
                  setTimeout(() => startCamera(), 50);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600"
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
                Tukar
              </button>
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold ${
                    torchOn
                      ? 'border-amber-300 bg-amber-100 text-amber-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {torchOn ? <Zap className="h-3.5 w-3.5" /> : <ZapOff className="h-3.5 w-3.5" />}
                  Lampu
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>{cameraError}</div>
        </div>
      )}

      {scanToast && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md sm:text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{scanToast}</span>
          </div>
          {displayedPaper && onInspectPaper && mode === 'grade' && (
            <button
              onClick={() => onInspectPaper(displayedPaper)}
              className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold hover:bg-white/30"
            >
              Semak →
            </button>
          )}
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Live Camera Viewfinder */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
          <div className="relative aspect-[3/4] w-full bg-slate-950">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
            />
            <canvas
              ref={overlayRef}
              className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                cameraActive ? 'block' : 'hidden'
              }`}
            />

            {!cameraActive && (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-300">
                <div className="mb-3 rounded-2xl bg-slate-800/80 p-4">
                  <Camera className="h-10 w-10 text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold text-white sm:text-base">
                  Pengimbas Kamera OMR Sedia
                </h3>
                <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-400">
                  Halakan kamera pada borang OMR. Sistem akan mengesan 4 petak penjuru, membaca <strong>QR Skema</strong> di kanan atas secara automatik, menyahkod <strong>NDP, Kursus, Semester, Tulisan Nama (OCR)</strong> dan menyemak jawapan serta-merta.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={startCamera}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    Aktifkan Kamera
                  </button>
                  <button
                    onClick={handleSimulateScan}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                  >
                    Cuba Simulasi Imbasan
                  </button>
                </div>
              </div>
            )}

            {cameraActive && (
              <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-xl bg-slate-900/85 px-3 py-2 text-xs text-white backdrop-blur">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        lockedCount === 4 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="truncate font-medium">{statusMsg}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-300">
                    Fokus: {sharpness}
                  </span>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={() => captureFromVideo()}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-bold text-slate-900 shadow-lg active:scale-95"
                  >
                    <SquareCheckBig className="h-4 w-4 text-emerald-600" />
                    Tangkap &amp; Semak Sekarang
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instant Graded Overlay Preview Panel */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">
              {displayedPaper ? 'Keputusan Semakan OMR' : 'Pratonton Keputusan Imbasan'}
            </h3>
            {displayedPaper && (
              <div className="flex items-center gap-1.5">
                {mode === 'grade' && onInspectPaper && (
                  <button
                    onClick={() => onInspectPaper(displayedPaper)}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    Semak / Sunting
                  </button>
                )}
                <button
                  onClick={() => {
                    setLastPaper(null);
                    setScanToast(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Seterusnya
                </button>
              </div>
            )}
          </div>

          {displayedPaper ? (
            <div className="flex flex-1 flex-col gap-3">
              {/* QR Auto-Pair & OCR Info Bar */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {displayedPaper.qrMatchedQuizName ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 ring-1 ring-emerald-200">
                    <QrCode className="h-3.5 w-3.5" />
                    QR Padan: {displayedPaper.qrMatchedQuizName}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                    Skema Semasa
                  </span>
                )}

                {displayedPaper.detectedCourse && (
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-bold text-indigo-800 ring-1 ring-indigo-200">
                    Kursus: {displayedPaper.detectedCourse}
                  </span>
                )}
                {displayedPaper.detectedSemester && (
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 font-bold text-teal-800 ring-1 ring-teal-200">
                    Sem {displayedPaper.detectedSemester}
                  </span>
                )}
                {ocrRunning && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Membaca tulisan nama…
                  </span>
                )}
                {!ocrRunning && displayedPaper.ocrName && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-bold text-blue-900 ring-1 ring-blue-200">
                    <ScanText className="h-3 w-3" />
                    OCR: {displayedPaper.ocrName}
                  </span>
                )}
              </div>

              {/* Score KPI Grid */}
              <div className="grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                <div>
                  <div className="text-[10px] font-medium text-slate-500">Betul</div>
                  <div className="text-base font-extrabold text-slate-900 sm:text-lg">
                    {displayedPaper.correctCount}/{displayedPaper.questions.length}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-slate-500">Peratus</div>
                  <div
                    className={`text-base font-extrabold sm:text-lg ${
                      displayedPaper.percentage >= 70
                        ? 'text-emerald-600'
                        : displayedPaper.percentage >= 50
                          ? 'text-amber-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {Math.round(displayedPaper.percentage)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-slate-500">No. NDP</div>
                  <div className="font-mono text-xs font-bold text-blue-800 sm:text-sm">
                    {displayedPaper.studentCode || '—'}
                  </div>
                  <div className="truncate text-[10px] font-medium text-slate-600">
                    {displayedPaper.studentNameOverride ||
                      matchedStudent?.name ||
                      displayedPaper.ocrName ||
                      '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-slate-500">Kelajuan</div>
                  <div className="font-mono text-xs font-bold text-slate-800 sm:text-sm">
                    {displayedPaper.diagnostics.processingMs}ms
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {displayedPaper.diagnostics.rotated180 ? 'Auto 180°' : 'Tegak'}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-2.5 text-[10.5px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Betul ({displayedPaper.correctCount})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Salah ({displayedPaper.wrongCount})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-600" /> NDP
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" /> Kursus
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-600" /> Sem
                </span>
              </div>

              {/* Annotated Rectified Sheet */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src={displayedPaper.annotatedImageDataUrl}
                  alt="Hasil semakan borang OMR"
                  className="mx-auto max-h-[520px] w-auto object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
              <SquareCheckBig className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">Tiada kertas diimbas lagi</p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                Buka kamera, muat naik gambar, atau tekan <strong>Simulasi</strong> untuk menguji QR Auto-Padan, OCR Nama, NDP 8 digit, Kursus, Semester, dan semakan automatik.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
