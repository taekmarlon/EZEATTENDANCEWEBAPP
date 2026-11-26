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
} from 'lucide-react';
import {
  extractFaceDescriptorFromInput,
  hasLegacyFaceEnrollment,
  isCompatibleFaceDescriptor,
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

  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      return;
    }

    let cancelled = false;
    setIsInitializing(true);
    setErrorMsg(null);

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
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to start camera.');
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen, facingMode]);

  const compatibleDescriptors = descriptors.filter(isCompatibleFaceDescriptor);
  const legacyOnly = compatibleDescriptors.length === 0 && hasLegacyFaceEnrollment(descriptors);

  const handleCaptureLiveSample = async () => {
    if (!videoRef.current || isCapturing) return;
    if (compatibleDescriptors.length >= MAX_SAMPLES) {
      showToast('Maximum of 3 face angle samples reached. Reset to re-enroll.', 'info');
      return;
    }

    setIsCapturing(true);
    setErrorMsg(null);
    try {
      const extracted = await extractFaceDescriptorFromInput(videoRef.current);
      if (typeof extracted.realScore === 'number' && extracted.realScore < 0.4) {
        throw new Error('Could not verify live face quality. Avoid glare or screen reflections.');
      }
      const next = [...compatibleDescriptors, extracted.descriptor].slice(0, MAX_SAMPLES);
      onChange(next);
      showToast(
        `Captured HD Face ID sample ${next.length}/${MAX_SAMPLES} for ${studentName || 'student'}.`
      );
      if (next.length >= MAX_SAMPLES) {
        setCameraOpen(false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to extract face features.');
    } finally {
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
      setErrorMsg(err instanceof Error ? err.message : 'Could not detect face in uploaded portrait.');
    } finally {
      setIsCapturing(false);
    }
  };

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
              Capture 1–3 aligned HD angles (0.4m – 1.0m) using MobileFaceNet AI.
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

      {errorMsg && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-[11px] text-rose-800">
          <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!cameraOpen ? (
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
      ) : (
        <div className="space-y-2.5 bg-slate-900 rounded-xl p-3 text-white">
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video max-h-52 mx-auto flex items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
            {isInitializing && (
              <div className="absolute inset-0 bg-slate-950/75 flex flex-col items-center justify-center gap-2 text-xs">
                <Loader2 size={20} className="animate-spin text-violet-400" />
                <span>Starting HD camera...</span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-28 h-36 rounded-full border-2 border-dashed border-violet-300/80" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-semibold"
              >
                <SwitchCamera size={13} /> Flip Camera
              </button>
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-semibold text-slate-300"
              >
                <X size={13} /> Close
              </button>
            </div>

            <button
              type="button"
              disabled={isInitializing || isCapturing || compatibleDescriptors.length >= MAX_SAMPLES}
              onClick={() => void handleCaptureLiveSample()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {isCapturing ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              {isCapturing
                ? 'Analyzing Face...'
                : `Capture Angle ${compatibleDescriptors.length + 1}/${MAX_SAMPLES}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
