import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FlipHorizontal2,
  ImagePlus,
  Loader2,
  RefreshCw,
  RotateCw,
  Sparkles,
  SquareCheckBig,
  Volume2,
  VolumeX,
  Zap,
  ZapOff,
  AlertTriangle,
} from 'lucide-react';
import {
  ANSWER_CHOICES,
  AnswerChoice,
  FiducialDetectionResult,
  GradedPaper,
  Quiz,
  Student,
} from '../types';
import { buildSheetTemplate } from '../omr/sheetTemplates';
import {
  detectFullFrameFiducials,
  detectViewfinderFiducials,
  processAndGradeSheet,
} from '../omr/omrEngine';
import { generateSyntheticCameraPhoto } from '../omr/sheetRenderer';
import { playScanErrorSound, playScanSuccessSound } from '../utils/sound';

interface CameraScannerProps {
  quiz: Quiz;
  students: Student[];
  papers: GradedPaper[];
  mode: 'grade' | 'key';
  onPaperGraded: (paper: GradedPaper) => void;
  onKeyScanned?: (answers: Record<number, AnswerChoice[]>) => void;
  onInspectPaper?: (paper: GradedPaper) => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  quiz,
  students,
  papers,
  mode,
  onPaperGraded,
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Align all 4 black corner squares inside the corner brackets');
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
      // Auto-link student from roster by 5-digit Student ID
      const matched = paper.studentCode
        ? students.find((s) => s.studentCode === paper.studentCode)
        : undefined;
      const enriched: GradedPaper = matched ? { ...paper, studentId: matched.id } : paper;

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
        setScanToast(`Answer Key imported (${Object.keys(keyMap).length} questions detected)`);
      } else {
        onPaperGraded(enriched);
        setLastPaper(enriched);
        const label = matched ? matched.name : enriched.studentCode ? `No. NDP ${enriched.studentCode}` : 'Kertas Pelajar';
        setScanToast(`${label}: ${enriched.score}/${enriched.maxScore} (${Math.round(enriched.percentage)}%)`);
      }

      if (continuousMode) {
        cooldownUntilRef.current = performance.now() + 2400;
        setTimeout(() => setScanToast(null), 2200);
      }
    },
    [students, soundEnabled, mode, onKeyScanned, onPaperGraded, continuousMode]
  );

  const captureFromVideo = useCallback(
    (forcedCorners?: [ { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number } ]) => {
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
        setStatusMsg('Could not locate all 4 corner squares. Ensure good lighting & full sheet visibility.');
        return;
      }

      const paper = processAndGradeSheet(
        fullImg,
        corners,
        template,
        quiz,
        latestDetectionRef.current?.sharpness ?? 100
      );
      handleGradedResult(paper);
    },
    [template, quiz, soundEnabled, handleGradedResult]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setLastPaper(null);
    lockStreakRef.current = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API unavailable in this browser context (HTTPS or localhost required). Use Upload Photo or Simulate Photo below.');
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
      const msg = err instanceof Error ? err.message : 'Unable to access camera';
      setCameraError(`Camera access failed: ${msg}. You can still upload a sheet photo or test with a simulated scan below.`);
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

      // Run fiducial detection ~12-15 FPS to stay super smooth on mobile & laptop CPUs
      if (now - lastTick < 75) return;
      lastTick = now;

      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.videoWidth === 0 || video.videoHeight === 0) return;
      if (!continuousMode && lastPaper) return;

      // Downscale frame to ~480px width for fast fiducial tracking
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

      // Draw viewfinder overlay
      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }
      const oCtx = overlay.getContext('2d')!;
      oCtx.clearRect(0, 0, overlay.width, overlay.height);

      // Dim outside sheet area slightly
      const [gTL, gTR, gBR, gBL] = det.guideRects;
      const sx = gTL.x * overlay.width;
      const sy = gTL.y * overlay.height;
      const sw = (gTR.x + gTR.w - gTL.x) * overlay.width;
      const sh = (gBR.y + gBR.h - gTL.y) * overlay.height;

      oCtx.fillStyle = 'rgba(2, 6, 23, 0.36)';
      oCtx.fillRect(0, 0, overlay.width, sy);
      oCtx.fillRect(0, sy + sh, overlay.width, overlay.height - (sy + sh));
      oCtx.fillRect(0, sy, sx, sh);
      oCtx.fillRect(sx + sw, sy, overlay.width - (sx + sw), sh);

      // Draw 4 corner guide boxes (green when locked, white/amber when searching)
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

      // Draw locked quad perimeter
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

      // Auto-capture stability gate
      if (now < cooldownUntilRef.current) {
        setStatusMsg('Ready for next paper in a moment…');
        lockStreakRef.current = 0;
        return;
      }

      if (det.allLocked && det.isSharp) {
        lockStreakRef.current++;
        setStatusMsg(`All 4 corners locked! Holding steady (${lockStreakRef.current}/4)…`);
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
          setStatusMsg('Corners locked — hold phone steady for focus…');
        } else {
          setStatusMsg(`Locked ${locked}/4 corner squares — align black squares inside brackets`);
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

  // Process uploaded image file (JPG/PNG photo of a printed sheet)
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
        setCameraError('Could not detect all 4 black corner fiducial squares in this photo. Make sure the whole answer sheet is visible with good contrast.');
      } else {
        const paper = processAndGradeSheet(imgData, corners, template, quiz, 140);
        handleGradedResult(paper);
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  // 1-Click realistic synthetic test scan (runs the REAL OMR computer vision pipeline!)
  const handleSimulateScan = async () => {
    setBusy(true);
    setCameraError(null);
    try {
      const stu = students[Math.floor(Math.random() * students.length)] ?? {
        studentCode: '22210001',
        name: 'Pelajar Contoh',
      };
      const answers: Record<number, AnswerChoice[]> = {};
      for (const q of template.questions) {
        const rule = quiz.answerKey[q.questionNumber];
        const r = Math.random();
        if (mode === 'key') {
          answers[q.questionNumber] = [ANSWER_CHOICES[Math.floor(Math.random() * ANSWER_CHOICES.length)]];
        } else if (rule && rule.correctAnswers.length > 0 && r < 0.78) {
          // ~78% correct
          answers[q.questionNumber] = [rule.correctAnswers[0]];
        } else if (r < 0.94) {
          // wrong choice
          const wrongPool = ANSWER_CHOICES.filter((c) => !rule?.correctAnswers.includes(c));
          answers[q.questionNumber] = [wrongPool[Math.floor(Math.random() * wrongPool.length)]];
        } else {
          // blank
          answers[q.questionNumber] = [];
        }
      }

      const { canvas } = await generateSyntheticCameraPhoto(
        template,
        answers,
        stu.studentCode,
        stu.name,
        { rotate180: simUpsideDown, quizTitle: quiz.name }
      );
      const ctx = canvas.getContext('2d')!;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const corners = detectFullFrameFiducials(imgData.data, canvas.width, canvas.height);
      if (!corners) {
        setCameraError('Synthetic scan fiducial detection failed unexpectedly.');
      } else {
        const paper = processAndGradeSheet(imgData, corners, template, quiz, 180);
        handleGradedResult(paper);
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setBusy(false);
    }
  };

  // Keep displayed preview synced if user edits answers in PaperReviewModal
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
    <div className="space-y-4">
      {/* Scanner Mode Header & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                mode === 'key'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {mode === 'key' ? 'KEY SCAN MODE' : 'PAPER GRADING MODE'}
            </span>
            <span className="text-xs font-medium text-slate-500">{template.name}</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{quiz.name}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!cameraActive ? (
            <button
              onClick={startCamera}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Camera className="h-4 w-4" />
              Start Live Camera
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900"
            >
              Stop Camera
            </button>
          )}

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <ImagePlus className="h-4 w-4 text-sky-600" />
            Upload Photo
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
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
            title="Generates a tilted, shadowed photo of a filled sheet and grades it through the live OMR engine"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Simulate Camera Scan
          </button>
        </div>
      </div>

      {/* Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(e) => setAutoCapture(e.target.checked)}
              className="h-4 w-4 rounded accent-emerald-600"
            />
            Auto-Capture when locked
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={continuousMode}
              onChange={(e) => setContinuousMode(e.target.checked)}
              className="h-4 w-4 rounded accent-emerald-600"
            />
            Continuous Stack Scan
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={simUpsideDown}
              onChange={(e) => setSimUpsideDown(e.target.checked)}
              className="h-4 w-4 rounded accent-indigo-600"
            />
            <RotateCw className="h-3.5 w-3.5 text-indigo-600" />
            Test 180° Upside-Down Flip
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100"
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-emerald-600" /> : <VolumeX className="h-3.5 w-3.5 text-slate-400" />}
            Sound
          </button>
          {cameraActive && (
            <>
              <button
                onClick={() => {
                  setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'));
                  setTimeout(() => startCamera(), 50);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100"
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
                Flip Cam
              </button>
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium ${
                    torchOn
                      ? 'border-amber-300 bg-amber-100 text-amber-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {torchOn ? <Zap className="h-3.5 w-3.5" /> : <ZapOff className="h-3.5 w-3.5" />}
                  Flash
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>{cameraError}</div>
        </div>
      )}

      {scanToast && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <span>{scanToast}</span>
          </div>
          {displayedPaper && onInspectPaper && mode === 'grade' && (
            <button
              onClick={() => onInspectPaper(displayedPaper)}
              className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30"
            >
              Review Paper →
            </button>
          )}
        </div>
      )}

      {/* Main Split Workspace: Live Viewfinder + Instant Graded Preview */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Camera Viewfinder Panel */}
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
              <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-300">
                <div className="mb-4 rounded-2xl bg-slate-800/80 p-5">
                  <Camera className="h-12 w-12 text-emerald-400" />
                </div>
                <h3 className="text-base font-bold text-white">Live OMR Viewfinder Ready</h3>
                <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-400">
                  Point your webcam or phone rear camera at a printed SnapGrade sheet. Align the 4 black corner squares inside the green brackets for automatic perspective correction and instant grading.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={startCamera}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Enable Camera
                  </button>
                  <button
                    onClick={handleSimulateScan}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Run Simulated Scan
                  </button>
                </div>
              </div>
            )}

            {/* Live HUD Overlay when camera active */}
            {cameraActive && (
              <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-xl bg-slate-900/85 px-3.5 py-2 text-xs text-white backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        lockedCount === 4 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-medium">{statusMsg}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-300">
                    Focus: {sharpness}
                  </span>
                </div>

                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => captureFromVideo()}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-bold text-slate-900 shadow-lg hover:bg-emerald-50"
                  >
                    <SquareCheckBig className="h-4 w-4 text-emerald-600" />
                    Capture & Grade Now
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instant Graded Overlay Preview Panel */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {displayedPaper ? 'Warped & Graded Result' : 'Instant Graded Overlay'}
            </h3>
            {displayedPaper && (
              <div className="flex items-center gap-2">
                {mode === 'grade' && onInspectPaper && (
                  <button
                    onClick={() => onInspectPaper(displayedPaper)}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Edit / Review Answers
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
                  Next Paper
                </button>
              </div>
            )}
          </div>

          {displayedPaper ? (
            <div className="flex flex-1 flex-col gap-3">
              {/* Score KPI bar */}
              <div className="grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Score</div>
                  <div className="text-lg font-extrabold text-slate-900">
                    {displayedPaper.score}/{displayedPaper.maxScore}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Percent</div>
                  <div
                    className={`text-lg font-extrabold ${
                      displayedPaper.percentage >= 70
                        ? 'text-emerald-600'
                        : displayedPaper.percentage >= 50
                          ? 'text-amber-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {displayedPaper.percentage}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">No. NDP</div>
                  <div className="font-mono text-xs font-bold text-blue-800 sm:text-sm">
                    {displayedPaper.studentCode || '—'}
                  </div>
                  {matchedStudent && (
                    <div className="truncate text-[10px] font-medium text-slate-600">
                      {matchedStudent.name}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Engine</div>
                  <div className="font-mono text-sm font-bold text-slate-800">
                    {displayedPaper.diagnostics.processingMs}ms
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {displayedPaper.diagnostics.rotated180 ? 'Auto-flipped 180°' : 'Upright'}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Correct ({displayedPaper.correctCount})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> Wrong ({displayedPaper.wrongCount})
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-500" /> Expected Answer
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-600" /> No. NDP (8 Digit)
                </span>
                {displayedPaper.diagnostics.glareWarning && (
                  <span className="text-amber-700">⚠ Glare detected</span>
                )}
              </div>

              {/* Annotated rectified image */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src={displayedPaper.annotatedImageDataUrl}
                  alt="Graded answer sheet overlay"
                  className="mx-auto max-h-[520px] w-auto object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
              <SquareCheckBig className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No sheet scanned yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                Scan via live camera, upload a photo, or click <strong>Simulate Camera Scan</strong> to see perspective unwarping, adaptive darkness scoring, and instant bubble grading.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
