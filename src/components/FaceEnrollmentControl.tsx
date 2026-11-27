import { useState, useRef, useEffect } from 'react';
import {
  ScanFace,
  Camera,
  Sparkles,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  SwitchCamera,
  X,
  Zap,
} from 'lucide-react';
import {
  extractFaceDescriptorFromInput,
  hasLegacyFaceEnrollment,
  isCompatibleFaceDescriptor,
  playCheckinSuccessTone,
  probeEnrollmentFrame,
} from '../services/faceRecognition';
import { ensureCameraPermission } from '../utils/cameraPermission';
import { useToast } from '../context/ToastContext';

interface FaceEnrollmentControlProps {
  studentName: string;
  portraitSrc?: string;
  descriptors: number[][];
  onChange: (nextDescriptors: number[][]) => void;
}

const MAX_SAMPLES = 3;

export default function FaceEnrollmentControl({
  studentName,
  portraitSrc,
  descriptors,
  onChange,
}: FaceEnrollmentControlProps) {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const compatibleDescriptors = descriptors.filter(isCompatibleFaceDescriptor);
  const legacyOnly = compatibleDescriptors.length === 0 && hasLegacyFaceEnrollment(descriptors);

  const descriptorsRef = useRef<number[][]>(compatibleDescriptors);
  descriptorsRef.current = compatibleDescriptors;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const studentNameRef = useRef(studentName);
  studentNameRef.current = studentName;

  const isCapturingRef = useRef(false);
  const readyStreakRef = useRef(0);
  const cooldownUntilRef = useRef(0);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [autoCapture, setAutoCapture] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<'scanning' | 'warning' | 'locking' | 'captured'>(
    'scanning'
  );
  const [liveHint, setLiveHint] = useState('Center your face inside the large oval guide...');

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!cameraOpen) {
      stopCameraStream();
      readyStreakRef.current = 0;
      cooldownUntilRef.current = 0;
      return;
    }

    let cancelled = false;
    let scanTimer: number | null = null;
    let closeTimer: number | null = null;

    setIsInitializing(true);
    setErrorMsg(null);
    setLiveState('scanning');
    setLiveHint('Starting HD camera & Face AI...');
    readyStreakRef.current = 0;

    const start = async () => {
      try {
        const perm = await ensureCameraPermission();
        if (!perm.granted) {
          throw new Error(perm.message || 'Camera permission denied.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (!cancelled) {
          setIsInitializing(false);
          setLiveState('scanning');
          setLiveHint(
            autoCapture
              ? 'Position face inside the oval — auto-capturing when aligned...'
              : 'Position face inside the oval and tap Capture Angle.'
          );
        }

        scanTimer = window.setInterval(async () => {
          if (cancelled || !videoRef.current || isCapturingRef.current) return;
          if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) return;

          const currentCount = descriptorsRef.current.length;
          if (currentCount >= MAX_SAMPLES) return;

          const nowMs = Date.now();
          if (nowMs < cooldownUntilRef.current) {
            return;
          }

          if (!autoCapture) {
            isCapturingRef.current = true;
            try {
              const probe = await probeEnrollmentFrame(videoRef.current, false);
              if (cancelled) return;
              if (probe.ready) {
                setLiveState('locking');
                setLiveHint('Face aligned cleanly — tap Capture below!');
              } else {
                setLiveState('warning');
                setLiveHint(probe.statusMessage);
              }
            } catch {
              // Ignore transient preview errors while camera warms
            } finally {
              isCapturingRef.current = false;
            }
            return;
          }

          isCapturingRef.current = true;
          try {
            const shouldExtractNow = readyStreakRef.current >= 1;
            const probe = await probeEnrollmentFrame(videoRef.current, shouldExtractNow);
            if (cancelled) return;

            if (!probe.ready) {
              readyStreakRef.current = 0;
              setLiveState('warning');
              setLiveHint(probe.statusMessage);
              return;
            }

            if (!shouldExtractNow) {
              readyStreakRef.current = 1;
              setLiveState('locking');
              setLiveHint(probe.statusMessage);
              return;
            }

            if (probe.descriptor) {
              const next = [...descriptorsRef.current, probe.descriptor].slice(0, MAX_SAMPLES);
              descriptorsRef.current = next;
              readyStreakRef.current = 0;
              onChangeRef.current(next);
              playCheckinSuccessTone();

              setErrorMsg(null);
              setLiveState('captured');

              if (next.length >= MAX_SAMPLES) {
                setLiveHint(`All ${MAX_SAMPLES}/${MAX_SAMPLES} HD Face ID samples captured!`);
                showToastRef.current(
                  `Enrolled ${MAX_SAMPLES}/${MAX_SAMPLES} HD Face ID samples for ${
                    studentNameRef.current || 'student'
                  }.`
                );
                closeTimer = window.setTimeout(() => {
                  if (!cancelled) setCameraOpen(false);
                }, 650);
              } else {
                cooldownUntilRef.current = Date.now() + 1400;
                const angleTip =
                  next.length === 1
                    ? 'Saved 1/3! Slightly turn head or hold for sample 2/3...'
                    : 'Saved 2/3! Slight opposite angle or smile for sample 3/3...';
                setLiveHint(angleTip);
                showToastRef.current(
                  `Auto-captured HD sample ${next.length}/${MAX_SAMPLES} for ${
                    studentNameRef.current || 'student'
                  }.`
                );
              }
            }
          } catch (err) {
            if (!cancelled) {
              readyStreakRef.current = 0;
              setLiveState('warning');
              setLiveHint(err instanceof Error ? err.message : 'Hold steady under clear lighting.');
            }
          } finally {
            isCapturingRef.current = false;
          }
        }, 250);
      } catch (err) {
        if (!cancelled) {
          setIsInitializing(false);
          setErrorMsg(err instanceof Error ? err.message : 'Unable to start camera.');
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (scanTimer !== null) window.clearInterval(scanTimer);
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      stopCameraStream();
    };
  }, [cameraOpen, facingMode, autoCapture]);

  const handleCaptureLiveSample = async () => {
    if (!videoRef.current || isCapturingRef.current || isCapturing) return;
    if (descriptorsRef.current.length >= MAX_SAMPLES) {
      showToast('Maximum of 3 face angle samples reached. Reset to re-enroll.', 'info');
      return;
    }

    isCapturingRef.current = true;
    setIsCapturing(true);
    setErrorMsg(null);
    try {
      const extracted = await extractFaceDescriptorFromInput(videoRef.current);
      if (typeof extracted.realScore === 'number' && extracted.realScore < 0.4) {
        throw new Error('Could not verify live face quality. Avoid glare or screen reflections.');
      }
      const next = [...descriptorsRef.current, extracted.descriptor].slice(0, MAX_SAMPLES);
      descriptorsRef.current = next;
      readyStreakRef.current = 0;
      cooldownUntilRef.current = Date.now() + 1200;
      onChange(next);
      playCheckinSuccessTone();
      setLiveState('captured');
      setLiveHint(`Captured HD sample ${next.length}/${MAX_SAMPLES}!`);
      showToast(
        `Captured HD Face ID sample ${next.length}/${MAX_SAMPLES} for ${studentName || 'student'}.`
      );
      if (next.length >= MAX_SAMPLES) {
        setCameraOpen(false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to extract face features.');
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
    }
  };

  const handleExtractFromPortrait = async () => {
    if (!portraitSrc || isCapturing) return;
    setIsCapturing(true);
    setErrorMsg(null);
    try {
      const extracted = await extractFaceDescriptorFromInput(portraitSrc);
      const next = [...compatibleDescriptors, extracted.descriptor].slice(0, MAX_SAMPLES);
      onChange(next);
      showToast('Enrolled HD Face ID sample directly from student portrait.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not detect face in uploaded portrait.'
      );
    } finally {
      setIsCapturing(false);
    }
  };

  const ovalRingClass =
    liveState === 'captured'
      ? 'border-emerald-400 shadow-[0_0_28px_rgba(52,211,153,0.55)]'
      : liveState === 'locking'
      ? 'border-sky-400 shadow-[0_0_24px_rgba(56,189,248,0.5)]'
      : liveState === 'warning'
      ? 'border-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.35)]'
      : 'border-violet-300/85 border-dashed';

  return (
    <div className="p-4 bg-slate-50/90 border border-slate-200 rounded-xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
            <ScanFace size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Face Recognition ID</span>
              {compatibleDescriptors.length > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 size={10} /> HD Enrolled ({compatibleDescriptors.length}/{MAX_SAMPLES}{' '}
                  samples)
                </span>
              ) : legacyOnly ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  Upgrade Required (Legacy ID)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                  Not Enrolled
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Capture 1–3 aligned HD angles (0.4m – 1.0m) with hands-free Auto-Capture.
            </p>
          </div>
        </div>

        {(compatibleDescriptors.length > 0 || legacyOnly) && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
          >
            <Trash2 size={11} /> Clear Face Data
          </button>
        )}
      </div>

      {legacyOnly && !errorMsg && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-[11px] text-amber-900">
          <AlertCircle size={14} className="text-amber-700 shrink-0 mt-0.5" />
          <span>
            This student has older FaceRes data. Capture 1–3 fresh HD samples below to upgrade
            to high-precision MobileFaceNet recognition.
          </span>
        </div>
      )}

      {errorMsg && !cameraOpen && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-[11px] text-rose-800">
          <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isCapturing || compatibleDescriptors.length >= MAX_SAMPLES}
          onClick={() => setCameraOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          <Camera size={13} />
          {compatibleDescriptors.length > 0
            ? `Add Camera Angle (${compatibleDescriptors.length}/${MAX_SAMPLES})`
            : legacyOnly
            ? 'Re-Enroll in HD'
            : 'Live Camera Enroll'}
        </button>

        {portraitSrc && compatibleDescriptors.length < MAX_SAMPLES && (
          <button
            type="button"
            disabled={isCapturing}
            onClick={() => void handleExtractFromPortrait()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {isCapturing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Use Portrait Photo
          </button>
        )}
      </div>

      {/* Large Full-Viewport HD Enrollment Scanner Modal */}
      {cameraOpen && (
        <div
          className="no-print fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-5 bg-slate-950/85 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setCameraOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl h-[92dvh] sm:h-auto sm:max-h-[92vh] bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-violet-700 via-violet-600 to-indigo-600 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <ScanFace size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">
                    Enroll Face ID · {studentName || 'Student'}
                  </h3>
                  <p className="text-[11px] text-violet-100">
                    Samples captured: {compatibleDescriptors.length}/{MAX_SAMPLES}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setAutoCapture((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    autoCapture
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'bg-white/15 text-slate-200 hover:bg-white/25'
                  }`}
                >
                  <Zap size={12} />
                  {autoCapture ? 'Auto: ON' : 'Auto: OFF'}
                </button>
                <button
                  type="button"
                  aria-label="Close enrollment camera"
                  onClick={() => setCameraOpen(false)}
                  className="p-2 rounded-lg bg-white/10 hover:bg-rose-500/80 text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Large Camera Viewfinder */}
            <div className="relative flex-1 min-h-[340px] sm:min-h-[430px] bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              {/* Large Centered Oval Alignment Frame */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`w-56 h-72 sm:w-64 sm:h-80 rounded-full border-4 transition-all duration-200 ${ovalRingClass}`}
                />
              </div>

              {/* Sample Progress Dots Overlay */}
              <div className="pointer-events-none absolute top-3 left-3 right-3 flex items-center justify-center gap-2">
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md border ${
                      idx < compatibleDescriptors.length
                        ? 'bg-emerald-600/90 border-emerald-400 text-white'
                        : 'bg-slate-900/75 border-slate-700 text-slate-300'
                    }`}
                  >
                    Angle {idx + 1}
                    {idx < compatibleDescriptors.length ? ' ✓' : ''}
                  </span>
                ))}
              </div>

              {isInitializing && (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2.5 text-sm">
                  <Loader2 size={28} className="animate-spin text-violet-400" />
                  <span>Starting HD camera &amp; Face AI...</span>
                </div>
              )}

              {/* Live Guidance Banner inside Viewfinder */}
              <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex justify-center">
                <div
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold backdrop-blur-md border shadow-lg text-center max-w-md ${
                    liveState === 'captured'
                      ? 'bg-emerald-600/90 border-emerald-400 text-white'
                      : liveState === 'locking'
                      ? 'bg-sky-600/90 border-sky-400 text-white'
                      : liveState === 'warning'
                      ? 'bg-amber-600/90 border-amber-400 text-white'
                      : 'bg-slate-900/80 border-slate-700 text-slate-100'
                  }`}
                >
                  {liveHint}
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="mx-4 mt-3 p-2.5 bg-rose-950/80 border border-rose-700 rounded-lg flex items-start gap-2 text-xs text-rose-200">
                <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Modal Footer Controls */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold"
                >
                  <SwitchCamera size={14} /> Flip Camera
                </button>
                <button
                  type="button"
                  onClick={() => setCameraOpen(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-300"
                >
                  <X size={14} /> Close
                </button>
              </div>

              <button
                type="button"
                disabled={
                  isInitializing || isCapturing || compatibleDescriptors.length >= MAX_SAMPLES
                }
                onClick={() => void handleCaptureLiveSample()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 shadow-sm"
              >
                {isCapturing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                {isCapturing
                  ? 'Analyzing Face...'
                  : `Capture Now (${compatibleDescriptors.length + 1}/${MAX_SAMPLES})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
