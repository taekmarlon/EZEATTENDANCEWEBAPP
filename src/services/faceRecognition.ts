import type { Config, FaceResult, GestureResult, Human } from '@vladmandic/human';
import { FaceRecognitionSettings, Student } from '../types';
import { DEFAULT_FACE_RECOGNITION_SETTINGS } from './permissions';

export type FaceLivenessStatus = 'pass' | 'spoof_rejected' | 'blink_required' | 'no_face';

export interface FaceMatchOutcome {
  matched: boolean;
  ambiguous: boolean;
  student: Student | null;
  confidence: number;
  runnerUpConfidence: number;
  livenessStatus: FaceLivenessStatus;
  realScore?: number;
  liveScore?: number;
}

export interface LiveFrameEvaluation {
  hasFace: boolean;
  box?: [number, number, number, number];
  livenessStatus: FaceLivenessStatus;
  realScore?: number;
  liveScore?: number;
  descriptor?: number[];
  blinkDetected: boolean;
  match: FaceMatchOutcome | null;
}

let humanInstancePromise: Promise<Human> | null = null;
let activeBackendName = 'webgl';

function createHumanConfig(backend: 'webgl' | 'cpu'): Partial<Config> {
  return {
    modelBasePath: '/models/',
    backend,
    softwareKernels: true,
    async: true,
    warmup: 'face',
    cacheModels: true,
    cacheSensitivity: 0,
    deallocate: true,
    debug: false,
    filter: {
      enabled: true,
      equalization: false,
      flip: false,
      return: false,
    },
    gesture: { enabled: true },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    segmentation: { enabled: false },
    face: {
      enabled: true,
      detector: {
        enabled: true,
        modelPath: 'blazeface.json',
        rotation: true,
        maxDetected: 1,
        skipFrames: 0,
        skipTime: 0,
        minConfidence: 0.45,
      },
      mesh: {
        enabled: true,
        modelPath: 'facemesh.json',
        keepInvalid: false,
      },
      description: {
        enabled: true,
        modelPath: 'faceres.json',
        skipFrames: 0,
        skipTime: 0,
        minConfidence: 0.25,
      },
      antispoof: {
        enabled: true,
        modelPath: 'antispoof.json',
        skipFrames: 0,
        skipTime: 0,
      },
      liveness: {
        enabled: true,
        modelPath: 'liveness.json',
        skipFrames: 0,
        skipTime: 0,
      },
      iris: { enabled: false },
      emotion: { enabled: false },
      attention: { enabled: false },
    },
  };
}

/**
 * Lazy-loads the @vladmandic/human face engine and local models from /models/.
 * Automatically falls back to CPU kernels if WebGL initialization fails on older devices.
 */
export async function getFaceEngine(): Promise<{ human: Human; backend: string }> {
  if (!humanInstancePromise) {
    humanInstancePromise = (async () => {
      const { Human: HumanClass } = await import('@vladmandic/human');
      try {
        const instance = new HumanClass(createHumanConfig('webgl'));
        await instance.load();
        await instance.warmup();
        activeBackendName = 'webgl';
        return instance;
      } catch {
        const cpuInstance = new HumanClass(createHumanConfig('cpu'));
        await cpuInstance.load();
        await cpuInstance.warmup();
        activeBackendName = 'cpu';
        return cpuInstance;
      }
    })().catch((err) => {
      humanInstancePromise = null;
      throw err;
    });
  }
  const human = await humanInstancePromise;
  return { human, backend: activeBackendName };
}

/**
 * Computes Human-calibrated normalized Euclidean similarity (0..1) between two embeddings.
 * Matches @vladmandic/human match.similarity defaults (order=2, multiplier=25, min=0.2, max=0.8).
 */
export function computeFaceSimilarity(descriptor1: number[], descriptor2: number[]): number {
  if (
    !Array.isArray(descriptor1) ||
    !Array.isArray(descriptor2) ||
    descriptor1.length < 64 ||
    descriptor1.length !== descriptor2.length
  ) {
    return 0;
  }

  let sumSq = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sumSq += diff * diff;
  }
  const dist = Math.round(100 * 25 * sumSq) / 100;
  if (dist === 0) return 1;
  const root = Math.sqrt(dist);
  const norm = (1 - root / 100 - 0.2) / (0.8 - 0.2);
  return Math.round(100 * Math.max(Math.min(norm, 1), 0)) / 100;
}

export function compactDescriptor(raw: number[]): number[] {
  return raw.map((val) => Math.round(val * 100000) / 100000);
}

/**
 * Computes normalized Eye Aspect Ratio from FaceMesh upper/lower eye contour points
 * for active blink challenge verification alongside Human gesture detection.
 */
export function detectBlinkInFrame(
  face: Pick<FaceResult, 'annotations'>,
  gestures: GestureResult[] = []
): boolean {
  const hasGestureBlink = gestures.some(
    (g) => 'face' in g && (g.gesture === 'blink left eye' || g.gesture === 'blink right eye')
  );
  if (hasGestureBlink) return true;

  const annotations = face.annotations;
  if (!annotations) return false;

  const ratios: number[] = [];
  for (const [upperKey, lowerKey] of [
    ['leftEyeUpper0', 'leftEyeLower0'],
    ['rightEyeUpper0', 'rightEyeLower0'],
  ] as const) {
    const upper = annotations[upperKey];
    const lower = annotations[lowerKey];
    if (!upper?.length || !lower?.length || upper.length < 4 || lower.length < 4) continue;
    const width = Math.hypot(
      upper[upper.length - 1][0] - upper[0][0],
      upper[upper.length - 1][1] - upper[0][1]
    );
    if (width <= 0) continue;
    const midIdx = Math.floor(upper.length / 2);
    const height = Math.hypot(upper[midIdx][0] - lower[midIdx][0], upper[midIdx][1] - lower[midIdx][1]);
    ratios.push(height / width);
  }

  if (ratios.length === 0) return false;
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return avgRatio < 0.16;
}

export function evaluateLivenessGate(
  face: Pick<FaceResult, 'real' | 'live' | 'annotations'> | null,
  gestures: GestureResult[],
  settings: FaceRecognitionSettings,
  sessionBlinkConfirmed: boolean
): { status: FaceLivenessStatus; blinkNow: boolean; realScore?: number; liveScore?: number } {
  if (!face) {
    return { status: 'no_face', blinkNow: false };
  }

  const realScore = typeof face.real === 'number' ? face.real : undefined;
  const liveScore = typeof face.live === 'number' ? face.live : undefined;
  const blinkNow = detectBlinkInFrame(face, gestures);

  if (settings.requireLiveness) {
    const failsAntiSpoof = realScore !== undefined && realScore < 0.45;
    const failsLiveModel = liveScore !== undefined && liveScore < 0.45;
    if (failsAntiSpoof || failsLiveModel) {
      return { status: 'spoof_rejected', blinkNow, realScore, liveScore };
    }
  }

  if (settings.requireBlinkChallenge && !sessionBlinkConfirmed && !blinkNow) {
    return { status: 'blink_required', blinkNow, realScore, liveScore };
  }

  return { status: 'pass', blinkNow, realScore, liveScore };
}

/**
 * Matches a live descriptor against enrolled student descriptors with runner-up ambiguity margin.
 */
export function findBestStudentFaceMatch(
  descriptor: number[],
  students: Student[],
  threshold = DEFAULT_FACE_RECOGNITION_SETTINGS.matchThreshold,
  marginThreshold = 0.04
): Omit<FaceMatchOutcome, 'livenessStatus' | 'realScore' | 'liveScore'> {
  const enrolled = students.filter(
    (st) => Array.isArray(st.faceDescriptors) && st.faceDescriptors.length > 0
  );

  if (enrolled.length === 0 || descriptor.length < 64) {
    return {
      matched: false,
      ambiguous: false,
      student: null,
      confidence: 0,
      runnerUpConfidence: 0,
    };
  }

  let bestStudent: Student | null = null;
  let bestScore = 0;
  let runnerUpScore = 0;

  for (const st of enrolled) {
    let studentBest = 0;
    for (const sample of st.faceDescriptors || []) {
      const score = computeFaceSimilarity(descriptor, sample);
      if (score > studentBest) studentBest = score;
    }

    if (studentBest > bestScore) {
      runnerUpScore = bestScore;
      bestScore = studentBest;
      bestStudent = st;
    } else if (studentBest > runnerUpScore) {
      runnerUpScore = studentBest;
    }
  }

  if (!bestStudent || bestScore < threshold) {
    return {
      matched: false,
      ambiguous: false,
      student: bestStudent,
      confidence: bestScore,
      runnerUpConfidence: runnerUpScore,
    };
  }

  const ambiguous = enrolled.length > 1 && bestScore - runnerUpScore < marginThreshold;
  return {
    matched: !ambiguous,
    ambiguous,
    student: bestStudent,
    confidence: bestScore,
    runnerUpConfidence: runnerUpScore,
  };
}

/**
 * Analyzes one video frame for live face check-in, checking liveness/anti-spoof first
 * and only running recognition match if liveness gates pass.
 */
export async function analyzeVideoFrameForAttendance(
  videoEl: HTMLVideoElement,
  students: Student[],
  settings: FaceRecognitionSettings,
  sessionBlinkConfirmed: boolean
): Promise<LiveFrameEvaluation> {
  const { human } = await getFaceEngine();
  const result = await human.detect(videoEl);
  const face = result.face?.[0];

  if (!face) {
    return {
      hasFace: false,
      livenessStatus: 'no_face',
      blinkDetected: false,
      match: null,
    };
  }

  const liveness = evaluateLivenessGate(face, result.gesture || [], settings, sessionBlinkConfirmed);
  const descriptor =
    face.embedding && face.embedding.length >= 64 ? compactDescriptor(face.embedding) : undefined;

  let match: FaceMatchOutcome | null = null;
  if (liveness.status === 'pass' && descriptor) {
    const baseMatch = findBestStudentFaceMatch(descriptor, students, settings.matchThreshold);
    match = {
      ...baseMatch,
      livenessStatus: liveness.status,
      realScore: liveness.realScore,
      liveScore: liveness.liveScore,
    };
  }

  return {
    hasFace: true,
    box: face.box,
    livenessStatus: liveness.status,
    realScore: liveness.realScore,
    liveScore: liveness.liveScore,
    descriptor,
    blinkDetected: liveness.blinkNow,
    match,
  };
}

/**
 * Captures one high-confidence descriptor from either a video element (enrollment camera)
 * or an image source (uploaded portrait photo).
 */
export async function extractFaceDescriptorFromInput(
  input: HTMLVideoElement | HTMLImageElement | string
): Promise<{ descriptor: number[]; realScore?: number; liveScore?: number }> {
  const { human } = await getFaceEngine();

  let target: HTMLVideoElement | HTMLImageElement;
  if (typeof input === 'string') {
    target = await loadImageForDetection(input);
  } else {
    target = input;
  }

  const result = await human.detect(target);
  if (!result.face || result.face.length === 0) {
    throw new Error('No face detected. Ensure your face is well-lit and centered in frame.');
  }
  const face = result.face[0];
  if (!face.embedding || face.embedding.length < 64) {
    throw new Error('Could not extract facial features. Move closer and hold steady.');
  }

  return {
    descriptor: compactDescriptor(face.embedding),
    realScore: typeof face.real === 'number' ? face.real : undefined,
    liveScore: typeof face.live === 'number' ? face.live : undefined,
  };
}

function loadImageForDetection(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Could not read portrait image for face extraction. Use Live Camera Enrollment instead.'));
    img.src = src;
  });
}

/**
 * Plays a gentle short chime when attendance is logged via Face Check-In.
 */
export function playCheckinSuccessTone(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 300);
  } catch {
    // Ignore audio context autoplay restrictions cleanly
  }
}
