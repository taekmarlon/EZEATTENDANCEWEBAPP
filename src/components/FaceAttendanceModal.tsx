import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  ScanFace,
  SwitchCamera,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Eye,
  Users,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { School, Specialization, Student } from '../types';
import { useStore } from '../store';
import { useToast } from '../context/ToastContext';
import { DEFAULT_FACE_RECOGNITION_SETTINGS } from '../services/permissions';
import {
  analyzeVideoFrameForAttendance,
  getFaceEngine,
  hasLegacyFaceEnrollment,
  isCompatibleFaceDescriptor,
  playCheckinSuccessTone,
} from '../services/faceRecognition';
import { ensureCameraPermission } from '../utils/cameraPermission';
import { PortraitAvatar } from './Avatar';

interface FaceAttendanceModalProps {
  isOpen: boolean;
  school: School;
  spec: Specialization;
  onClose: () => void;
}

interface ScanLogItem {
  id: string;
  studentName: string;
  specName: string;
  photo?: string;
  confidence: number;
  timeLabel: string;
  alreadyMarked: boolean;
}

const REQUIRED_MATCH_STREAK = 3;

export default function FaceAttendanceModal({
  isOpen,
  school,
  spec,
  onClose,
}: FaceAttendanceModalProps) {
  const { updateAttendance, systemSettings } = useStore();
  const { showToast } = useToast();

  const settings = systemSettings.faceRecognitionSettings || DEFAULT_FACE_RECOGNITION_SETTINGS;

  const [scanScope, setScanScope] = useState<'class' | 'school'>('class');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [kioskMode, setKioskMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);

  const [statusKind, setStatusKind] = useState<
    'loading' | 'ready' | 'quality' | 'verifying' | 'matched' | 'spoof' | 'blink' | 'ambiguous' | 'error'
  >('loading');
  const [statusMessage, setStatusMessage] = useState('Loading high-precision MobileFaceNet models...');
  const [backendLabel, setBackendLabel] = useState('');
  const [recentScans, setRecentScans] = useState<ScanLogItem[]>([]);
  const [lastMatchedBanner, setLastMatchedBanner] = useState<ScanLogItem | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cooldownMapRef = useRef<Map<string, number>>(new Map());
  const matchStreakRef = useRef<{ studentId: string; count: number; sumConfidence: number } | null>(
    null
  );
  const blinkConfirmedRef = useRef<boolean>(false);
  const isDetectingRef = useRef<boolean>(false);

  const { candidateEntries, legacyEnrolledCount } = useMemo(() => {
    const entries: { specId: string; specName: string; student: Student }[] = [];
    let legacyCount = 0;
    const inspectSpec = (sp: Specialization) => {
      for (const st of sp.students) {
        if (st.faceDescriptors?.some(isCompatibleFaceDescriptor)) {
          entries.push({ specId: sp.id, specName: sp.name, student: st });
        } else if (hasLegacyFaceEnrollment(st.faceDescriptors)) {
          legacyCount++;
        }
      }
    };

    if (scanScope === 'class') {
      inspectSpec(spec);
    } else {
      for (const sp of school.specializations) {
        inspectSpec(sp);
      }
    }
    return { candidateEntries: entries, legacyEnrolledCount: legacyCount };
  }, [scanScope, school.specializations, spec]);

  const candidateStudents = useMemo(
    () => candidateEntries.map((e) => e.student),
    [candidateEntries]
  );

  // Keep latest refs accessible inside timer interval cleanly
  const candidateEntriesRef = useRef(candidateEntries);
  candidateEntriesRef.current = candidateEntries;
  const candidateStudentsRef = useRef(candidateStudents);
  candidateStudentsRef.current = candidateStudents;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    setSoundEnabled(settings.soundEnabled);
  }, [settings.soundEnabled]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let scanTimer: number | null = null;

    const cleanupMedia = () => {
      if (scanTimer !== null) {
        window.clearInterval(scanTimer);
        scanTimer = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const init = async () => {
      setStatusKind('loading');
      setStatusMessage('Initializing HD MobileFaceNet + Full-Range Face AI (~9 MB)...');

      try {
        const perm = await ensureCameraPermission();
        if (!perm.granted) {
          throw new Error(perm.message || 'Camera permission denied.');
        }

        const [{ backend }, stream] = await Promise.all([
          getFaceEngine(),
          navigator.mediaDevices.getUserMedia({
            video: {
              facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }),
        ]);

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        setBackendLabel(backend.toUpperCase());
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatusKind('ready');
        setStatusMessage(
          candidateStudentsRef.current.length === 0
            ? 'No students in this scope have HD MobileFaceNet Face IDs enrolled yet.'
            : 'Camera active — position face ~0.4m–1.1m straight ahead.'
        );

        scanTimer = window.setInterval(async () => {
          if (cancelled || isDetectingRef.current || !videoRef.current) return;
          if (videoRef.current.readyState < 2) return;
          if (candidateStudentsRef.current.length === 0) return;

          isDetectingRef.current = true;
          try {
            const evalRes = await analyzeVideoFrameForAttendance(
              videoRef.current,
              candidateStudentsRef.current,
              settings,
              blinkConfirmedRef.current
            );

            if (cancelled) return;

            if (!evalRes.hasFace) {
              blinkConfirmedRef.current = false;
              matchStreakRef.current = null;
              setStatusKind('ready');
              setStatusMessage('Position student face inside the oval guide (0.4m – 1.1m)...');
              return;
            }

            if (evalRes.blinkDetected) {
              blinkConfirmedRef.current = true;
            }

            if (evalRes.qualityStatus && evalRes.qualityStatus !== 'ok') {
              matchStreakRef.current = null;
              setStatusKind('quality');
              setStatusMessage(
                evalRes.qualityMessage || 'Move closer and look straight at the camera.'
              );
              return;
            }

            if (evalRes.livenessStatus === 'spoof_rejected') {
              matchStreakRef.current = null;
              setStatusKind('spoof');
              setStatusMessage(
                'Photo / screen spoofing suspected. Present a live face in good lighting.'
              );
              return;
            }

            if (evalRes.livenessStatus === 'blink_required') {
              matchStreakRef.current = null;
              setStatusKind('blink');
              setStatusMessage('Liveness check: blink once slowly to confirm check-in.');
              return;
            }

            const match = evalRes.match;
            if (!match) return;

            if (match.ambiguous) {
              matchStreakRef.current = null;
              setStatusKind('ambiguous');
              setStatusMessage('Multiple close face matches detected — step closer and hold still.');
              return;
            }

            if (match.matched && match.student) {
              const matchedStudent = match.student;
              const entry = candidateEntriesRef.current.find(
                (item) => item.student.id === matchedStudent.id
              );
              const targetSpecId = entry?.specId || spec.id;
              const targetSpecName = entry?.specName || spec.name;

              const nowMs = Date.now();
              const cooldownMs = Math.max(5, settings.cooldownSeconds) * 1000;
              const prevTime = cooldownMapRef.current.get(matchedStudent.id) || 0;

              if (nowMs - prevTime < cooldownMs) {
                matchStreakRef.current = null;
                blinkConfirmedRef.current = false;
                setStatusKind('matched');
                setStatusMessage(
                  `Verified ${matchedStudent.name} (${Math.round(match.confidence * 100)}%)`
                );
                return;
              }

              // Multi-frame consecutive agreement (3 frames) prevents single-frame false positives
              const prevStreak = matchStreakRef.current;
              const nextCount =
                prevStreak && prevStreak.studentId === matchedStudent.id
                  ? prevStreak.count + 1
                  : 1;
              const nextSum =
                prevStreak && prevStreak.studentId === matchedStudent.id
                  ? prevStreak.sumConfidence + match.confidence
                  : match.confidence;

              matchStreakRef.current = {
                studentId: matchedStudent.id,
                count: nextCount,
                sumConfidence: nextSum,
              };

              if (nextCount < REQUIRED_MATCH_STREAK) {
                setStatusKind('verifying');
                setStatusMessage(
                  `Verifying ${matchedStudent.name}... (${nextCount}/${REQUIRED_MATCH_STREAK})`
                );
                return;
              }

              const avgConfidence = Math.round((nextSum / nextCount) * 1000) / 1000;
              matchStreakRef.current = null;
              blinkConfirmedRef.current = false;
              cooldownMapRef.current.set(matchedStudent.id, nowMs);

              const todayStr = format(new Date(), 'yyyy-MM-dd');
              const alreadyMarked = matchedStudent.attendance?.[todayStr] === 'Present';

              updateAttendance(school.id, targetSpecId, matchedStudent.id, todayStr, 'Present', {
                method: 'face_kiosk',
                confidence: avgConfidence,
              });

              if (soundEnabledRef.current) {
                playCheckinSuccessTone();
              }

              const logItem: ScanLogItem = {
                id: `${matchedStudent.id}-${nowMs}`,
                studentName: matchedStudent.name,
                specName: targetSpecName,
                photo: matchedStudent.photo,
                confidence: Math.round(avgConfidence * 100),
                timeLabel: format(new Date(), 'h:mm:ss a'),
                alreadyMarked,
              };

              setLastMatchedBanner(logItem);
              setRecentScans((prev) => [logItem, ...prev].slice(0, 12));
              setStatusKind('matched');
              setStatusMessage(
                alreadyMarked
                  ? `${matchedStudent.name} already Present today (${logItem.confidence}% match)`
                  : `Present logged for ${matchedStudent.name} (${logItem.confidence}% match)`
              );
              showToast(
                alreadyMarked
                  ? `${matchedStudent.name} verified (${logItem.confidence}%).`
                  : `Face Check-In: ${matchedStudent.name} marked Present (${logItem.confidence}%).`
              );
            } else {
              matchStreakRef.current = null;
              setStatusKind('ready');
              setStatusMessage('Face detected — not matched yet (ensure closer lighting)...');
            }
          } catch (err) {
            if (!cancelled) {
              matchStreakRef.current = null;
              setStatusKind('error');
              setStatusMessage(err instanceof Error ? err.message : 'Face scan failed.');
            }
          } finally {
            isDetectingRef.current = false;
          }
        }, 200);
      } catch (err) {
        if (!cancelled) {
          setStatusKind('error');
          setStatusMessage(err instanceof Error ? err.message : 'Failed to initialize camera.');
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      cleanupMedia();
    };
  }, [isOpen, facingMode, school.id, spec.id, spec.name, settings, updateAttendance, showToast]);

  if (!isOpen) return null;

  const ringClass =
    statusKind === 'matched'
      ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.45)]'
      : statusKind === 'verifying'
      ? 'border-sky-400 shadow-[0_0_22px_rgba(56,189,248,0.45)]'
      : statusKind === 'spoof' || statusKind === 'error'
      ? 'border-rose-400 shadow-[0_0_20px_rgba(251,113,133,0.4)]'
      : statusKind === 'blink' || statusKind === 'ambiguous' || statusKind === 'quality'
      ? 'border-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.35)]'
      : 'border-violet-300/80';

  return (
    <div
      className={`no-print fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm ${
        kioskMode ? 'p-0' : 'p-3 sm:p-5'
      }`}
      onClick={() => !kioskMode && onClose()}
    >
      <div
        className={`bg-white flex flex-col overflow-hidden shadow-2xl ${
          kioskMode
            ? 'w-full h-[100dvh] rounded-none'
            : 'w-full max-w-4xl rounded-2xl border border-slate-200 max-h-[92vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-violet-700 via-violet-600 to-indigo-600 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <ScanFace size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold truncate">
                  Face Recognition Attendance
                </h2>
                {backendLabel && (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/20 text-white">
                    ON-DEVICE · {backendLabel}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-violet-100 truncate">
                {school.name} · {scanScope === 'class' ? spec.name : 'All Specializations (Kiosk)'} ·{' '}
                {candidateStudents.length} enrolled face{candidateStudents.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              title={soundEnabled ? 'Mute check-in chime' : 'Enable check-in chime'}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button
              type="button"
              onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
              title="Switch Front/Back Camera"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors"
            >
              <SwitchCamera size={14} />
              <span className="hidden sm:inline">Flip</span>
            </button>
            <button
              type="button"
              onClick={() => setKioskMode((k) => !k)}
              title={kioskMode ? 'Exit Fullscreen Kiosk' : 'Enter Door Kiosk Mode'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors"
            >
              {kioskMode ? <Unlock size={14} /> : <Lock size={14} />}
              <span className="hidden sm:inline">{kioskMode ? 'Exit Kiosk' : 'Kiosk Lock'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close face scanner"
              className="p-2 rounded-lg bg-white/10 hover:bg-rose-500/80 text-white transition-colors"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-50">
          {/* Left: Live Viewfinder */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            {/* Scope & Liveness Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex p-1 bg-white border border-slate-200 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setScanScope('class')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    scanScope === 'class'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {spec.name} Only
                </button>
                <button
                  type="button"
                  onClick={() => setScanScope('school')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    scanScope === 'school'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Whole School Kiosk
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-semibold">
                {settings.requireLiveness && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                    <Sparkles size={11} /> Anti-Spoof Active
                  </span>
                )}
                {settings.requireBlinkChallenge && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                    <Eye size={11} /> Blink Required
                  </span>
                )}
              </div>
            </div>

            {/* Camera Stage */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] sm:aspect-video flex items-center justify-center border border-slate-300 shadow-sm">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              {/* Face Alignment Guide */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`w-44 h-56 sm:w-52 sm:h-64 rounded-full border-4 transition-all duration-200 ${ringClass}`}
                />
              </div>

              {statusKind === 'loading' && (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 text-white p-6 text-center">
                  <Loader2 size={28} className="animate-spin text-violet-400" />
                  <p className="text-xs sm:text-sm font-semibold">{statusMessage}</p>
                </div>
              )}

              {lastMatchedBanner && statusKind === 'matched' && (
                <div className="absolute bottom-4 left-4 right-4 bg-emerald-600/95 backdrop-blur-md text-white rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <PortraitAvatar
                      src={lastMatchedBanner.photo}
                      name={lastMatchedBanner.studentName}
                      size="sm"
                      tone="dark"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">
                        {lastMatchedBanner.studentName}
                      </div>
                      <div className="text-[11px] text-emerald-100 truncate">
                        {lastMatchedBanner.specName} · {lastMatchedBanner.confidence}% Match ·{' '}
                        {lastMatchedBanner.alreadyMarked ? 'Verified Present' : 'Marked Present'}
                      </div>
                    </div>
                  </div>
                  <CheckCircle2 size={24} className="shrink-0 text-white" />
                </div>
              )}
            </div>

            {/* Live Status Bar */}
            <div
              className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                statusKind === 'spoof' || statusKind === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : statusKind === 'blink' || statusKind === 'ambiguous' || statusKind === 'quality'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : statusKind === 'verifying'
                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                  : statusKind === 'matched'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              {statusKind === 'spoof' || statusKind === 'error' ? (
                <ShieldAlert size={15} className="shrink-0" />
              ) : statusKind === 'blink' ? (
                <Eye size={15} className="shrink-0" />
              ) : statusKind === 'matched' ? (
                <CheckCircle2 size={15} className="shrink-0" />
              ) : (
                <ScanFace size={15} className="shrink-0 text-violet-600" />
              )}
              <span>{statusMessage}</span>
            </div>
          </div>

          {/* Right: Recent Face Check-Ins Today */}
          <div className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-violet-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Checked In ({recentScans.length})
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {format(new Date(), 'MMM d')}
              </span>
            </div>

            {legacyEnrolledCount > 0 && (
              <div className="m-3 mb-0 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                <strong>{legacyEnrolledCount} student(s)</strong> need one-time HD re-enrollment in
                their student profile to upgrade from legacy FaceRes to MobileFaceNet.
              </div>
            )}

            {candidateStudents.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2 my-auto">
                <ScanFace size={26} className="mx-auto text-slate-300" />
                <p className="font-semibold text-slate-700">No Enrolled Faces Found</p>
                <p>
                  Open a student profile in the roster and use <strong>Live Camera Enroll</strong>{' '}
                  or <strong>Use Portrait Photo</strong> first.
                </p>
              </div>
            ) : recentScans.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 my-auto">
                Waiting for the first student to step in front of the camera...
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-y-auto max-h-[360px]">
                {recentScans.map((scan) => (
                  <div key={scan.id} className="px-4 py-3 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PortraitAvatar
                        src={scan.photo}
                        name={scan.studentName}
                        size="xs"
                        tone="violet"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {scan.studentName}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {scan.specName} · {scan.timeLabel}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 shrink-0">
                      {scan.confidence}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 leading-relaxed">
              <strong>Kiosk Tip:</strong> Enable <em>Screen Pinning</em> (Android) or{' '}
              <em>Guided Access</em> (iOS) with balanced front lighting for entrance mounting.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
