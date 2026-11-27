import type { Config, FaceResult, GestureResult, Human } from '@vladmandic/human';
import { FaceRecognitionSettings, Student } from '../types';
import { DEFAULT_FACE_RECOGNITION_SETTINGS } from './permissions';

export const MOBILEFACENET_DIM = 192;
export const ARCFACE_INPUT_SIZE = 112;

/**
 * Canonical 5-point facial landmark coordinates in 112x112 ArcFace / MobileFaceNet space:
 * [viewerLeftEye, viewerRightEye, noseTip, viewerLeftMouth, viewerRightMouth]
 */
export const ARCFACE_DST_5PT: readonly [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export type FaceLivenessStatus = 'pass' | 'spoof_rejected' | 'blink_required' | 'no_face';
export type FaceQualityStatus =
  | 'ok'
  | 'no_face'
  | 'too_far'
  | 'bad_pose'
  | 'low_confidence'
  | 'bad_lighting'
  | 'no_landmarks';

export interface FaceQualityCheck {
  ok: boolean;
  status: FaceQualityStatus;
  message?: string;
}

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
  qualityStatus: FaceQualityStatus;
  qualityMessage?: string;
  livenessStatus: FaceLivenessStatus;
  realScore?: number;
  liveScore?: number;
  descriptor?: number[];
  blinkDetected: boolean;
  match: FaceMatchOutcome | null;
}

interface GraphModelLike {
  execute: (input: unknown) => unknown;
}

interface LoadedFaceRuntime {
  human: Human;
  mobileFaceNet: GraphModelLike;
  backend: 'webgl' | 'cpu';
}

let runtimePromise: Promise<LoadedFaceRuntime> | null = null;
let alignmentCanvas: HTMLCanvasElement | null = null;

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
        square: false,
      },
      mesh: {
        enabled: true,
        modelPath: 'facemesh.json',
        keepInvalid: false,
      },
      description: {
        enabled: false,
        modelPath: 'faceres.json',
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
 * Lazy-loads the upgraded on-device face stack:
 * - Full-range MediaPipe face detector (`facemesh-detection-full`)
 * - 468-point FaceMesh geometry for 5-point affine alignment & blink detection
 * - Anti-spoofing + Passive Liveness models
 * - Dedicated Sirius-AI `MobileFaceNet` (192-d ArcFace-family embeddings)
 */
export async function getFaceEngine(): Promise<LoadedFaceRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const { Human: HumanClass } = await import('@vladmandic/human');

      const initWithBackend = async (backend: 'webgl' | 'cpu'): Promise<LoadedFaceRuntime> => {
        const human = new HumanClass(createHumanConfig(backend));
        await human.load();
        await human.warmup();
        const mobileFaceNet = (await human.tf.loadGraphModel(
          '/models/mobilefacenet.json'
        )) as GraphModelLike;

        // Warm up MobileFaceNet shader compilation once so live scanning has minimal lag
        const warmupTensor = human.tf.zeros([1, ARCFACE_INPUT_SIZE, ARCFACE_INPUT_SIZE, 3], 'float32');
        const warmupOut = mobileFaceNet.execute(warmupTensor);
        human.tf.dispose([warmupTensor, warmupOut]);

        return { human, mobileFaceNet, backend };
      };

      try {
        return await initWithBackend('webgl');
      } catch {
        return await initWithBackend('cpu');
      }
    })().catch((err) => {
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}

export function isCompatibleFaceDescriptor(vec: unknown): vec is number[] {
  return Array.isArray(vec) && vec.length === MOBILEFACENET_DIM;
}

export function hasLegacyFaceEnrollment(descriptors?: number[][]): boolean {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return false;
  return descriptors.some((d) => Array.isArray(d) && d.length >= 64 && d.length !== MOBILEFACENET_DIM);
}

export function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm <= 1e-12) return vec;
  return vec.map((v) => v / norm);
}

export function compactDescriptor(raw: number[]): number[] {
  return l2Normalize(raw).map((val) => Math.round(val * 100000) / 100000);
}

/**
 * Computes biometric similarity (0..1) between two descriptors:
 * - For 192-d MobileFaceNet vectors: L2-normalized cosine similarity.
 * - For legacy 512+/1024-d vectors: calibrated Human Euclidean similarity.
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

  if (descriptor1.length === MOBILEFACENET_DIM) {
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < descriptor1.length; i++) {
      const a = descriptor1[i];
      const b = descriptor2[i];
      dot += a * b;
      norm1 += a * a;
      norm2 += b * b;
    }
    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (!Number.isFinite(denom) || denom <= 1e-12) return 0;
    const cos = Math.max(0, Math.min(1, dot / denom));
    return Math.round(cos * 1000) / 1000;
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

function averagePoints(
  pts: readonly (readonly (number | undefined)[])[] | undefined
): [number, number] | null {
  if (!pts || pts.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    const x = p?.[0];
    const y = p?.[1];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}

/**
 * Extracts 5 canonical facial keypoints [viewerLeftEye, viewerRightEye, noseTip, viewerLeftMouth, viewerRightMouth]
 * from FaceMesh landmarks/annotations for affine alignment into 112x112 MobileFaceNet space.
 */
export function extractFivePointLandmarks(
  face: Pick<FaceResult, 'mesh' | 'annotations'>
): [number, number][] | null {
  const annotations = face.annotations || ({} as FaceResult['annotations']);
  const mesh = Array.isArray(face.mesh) ? face.mesh : [];

  const eyeA =
    averagePoints([
      ...(annotations.rightEyeUpper0 || []),
      ...(annotations.rightEyeLower0 || []),
    ]) ||
    (mesh.length >= 468 && mesh[33] && mesh[133]
      ? averagePoints([mesh[33], mesh[133]])
      : null);

  const eyeB =
    averagePoints([
      ...(annotations.leftEyeUpper0 || []),
      ...(annotations.leftEyeLower0 || []),
    ]) ||
    (mesh.length >= 468 && mesh[362] && mesh[263]
      ? averagePoints([mesh[362], mesh[263]])
      : null);

  const nose =
    (annotations.noseTip?.[0] && annotations.noseTip[0].length >= 2
      ? ([annotations.noseTip[0][0], annotations.noseTip[0][1]] as [number, number])
      : null) ||
    (mesh.length >= 468 && mesh[1] ? ([mesh[1][0], mesh[1][1]] as [number, number]) : null);

  const lipsLower = annotations.lipsLowerOuter;
  const mouthA =
    lipsLower && lipsLower.length >= 2
      ? ([lipsLower[0][0], lipsLower[0][1]] as [number, number])
      : mesh.length >= 468 && mesh[61]
      ? ([mesh[61][0], mesh[61][1]] as [number, number])
      : null;

  const mouthB =
    lipsLower && lipsLower.length >= 2
      ? ([lipsLower[lipsLower.length - 1][0], lipsLower[lipsLower.length - 1][1]] as [
          number,
          number,
        ])
      : mesh.length >= 468 && mesh[291]
      ? ([mesh[291][0], mesh[291][1]] as [number, number])
      : null;

  if (!eyeA || !eyeB || !nose || !mouthA || !mouthB) {
    return null;
  }

  const [viewerLeftEye, viewerRightEye] = eyeA[0] <= eyeB[0] ? [eyeA, eyeB] : [eyeB, eyeA];
  const [viewerLeftMouth, viewerRightMouth] =
    mouthA[0] <= mouthB[0] ? [mouthA, mouthB] : [mouthB, mouthA];

  // Ensure valid inter-ocular separation to guard against degenerate detections
  if (Math.hypot(viewerRightEye[0] - viewerLeftEye[0], viewerRightEye[1] - viewerLeftEye[1]) < 8) {
    return null;
  }

  return [viewerLeftEye, viewerRightEye, nose, viewerLeftMouth, viewerRightMouth];
}

/**
 * Closed-form least-squares 2D similarity matrix mapping `src` -> `dst`:
 * x' = a*x - b*y + tx, y' = b*x + a*y + ty
 * Canvas setTransform args: (a, b, -b, a, tx, ty)
 */
export function computeSimilarityTransform(
  src: readonly [number, number][],
  dst: readonly [number, number][] = ARCFACE_DST_5PT
): { a: number; b: number; tx: number; ty: number } | null {
  const n = src.length;
  if (n < 2 || n !== dst.length) return null;

  let mx = 0;
  let my = 0;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(src[i][0]) || !Number.isFinite(src[i][1])) return null;
    mx += src[i][0];
    my += src[i][1];
    nx += dst[i][0];
    ny += dst[i][1];
  }
  mx /= n;
  my /= n;
  nx /= n;
  ny /= n;

  let denom = 0;
  let numA = 0;
  let numB = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - mx;
    const py = src[i][1] - my;
    const qx = dst[i][0] - nx;
    const qy = dst[i][1] - ny;
    denom += px * px + py * py;
    numA += px * qx + py * qy;
    numB += px * qy - py * qx;
  }

  if (denom <= 1e-6) return null;

  const a = numA / denom;
  const b = numB / denom;
  const tx = nx - (a * mx - b * my);
  const ty = ny - (b * mx + a * my);
  return { a, b, tx, ty };
}

/**
 * Evaluates frame geometry, box confidence, face scale (distance), and frontal head pose
 * so blurry distant/side-profile frames are never matched against wrong students.
 */
export function evaluateFaceQuality(
  face: Pick<FaceResult, 'box' | 'boxScore' | 'faceScore' | 'score' | 'rotation' | 'mesh' | 'annotations'> | null,
  _frameWidth: number,
  frameHeight: number,
  mode: 'enroll' | 'kiosk'
): FaceQualityCheck {
  if (!face) {
    return { ok: false, status: 'no_face' };
  }

  const boxScore = typeof face.boxScore === 'number' ? face.boxScore : face.score ?? 1;
  const faceScore = typeof face.faceScore === 'number' ? face.faceScore : face.score ?? 1;
  if (boxScore < 0.45 || faceScore < 0.6) {
    return {
      ok: false,
      status: 'low_confidence',
      message: 'Face unclear — hold still under even front lighting.',
    };
  }

  const box = face.box || [0, 0, 0, 0];
  const boxHeight = Math.max(box[2] || 0, box[3] || 0);
  const minRatio = mode === 'kiosk' ? 0.13 : 0.1;
  const minPx = mode === 'kiosk' ? 68 : 48;
  if (boxHeight < minPx || (frameHeight > 0 && boxHeight / frameHeight < minRatio)) {
    return {
      ok: false,
      status: 'too_far',
      message: 'Move slightly closer to the camera (0.4m – 1.1m) for accurate Face ID.',
    };
  }

  const yaw = Math.abs(face.rotation?.angle?.yaw ?? 0);
  const pitch = Math.abs(face.rotation?.angle?.pitch ?? 0);
  const maxYaw = mode === 'kiosk' ? 0.42 : 0.52;
  const maxPitch = mode === 'kiosk' ? 0.38 : 0.45;
  if (yaw > maxYaw || pitch > maxPitch) {
    return {
      ok: false,
      status: 'bad_pose',
      message: 'Look straight toward the camera (avoid turning side-on).',
    };
  }

  return { ok: true, status: 'ok' };
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
 * Matches a live descriptor against compatible enrolled student descriptors
 * with weighted multi-angle scoring and a strict runner-up separation margin.
 */
export function findBestStudentFaceMatch(
  descriptor: number[],
  students: Student[],
  threshold = DEFAULT_FACE_RECOGNITION_SETTINGS.matchThreshold,
  marginThreshold = 0.08
): Omit<FaceMatchOutcome, 'livenessStatus' | 'realScore' | 'liveScore'> {
  const enrolled = students.filter(
    (st) =>
      Array.isArray(st.faceDescriptors) &&
      st.faceDescriptors.some((sample) => Array.isArray(sample) && sample.length === descriptor.length)
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
    const compatibleSamples = (st.faceDescriptors || []).filter(
      (sample) => Array.isArray(sample) && sample.length === descriptor.length
    );
    if (compatibleSamples.length === 0) continue;

    const sampleScores = compatibleSamples
      .map((sample) => computeFaceSimilarity(descriptor, sample))
      .sort((a, b) => b - a);

    // Blend top match with top-2 mean when multi-angle samples exist to reject single noisy spikes
    const studentScore =
      sampleScores.length > 1
        ? 0.85 * sampleScores[0] + 0.15 * ((sampleScores[0] + sampleScores[1]) / 2)
        : sampleScores[0];

    if (studentScore > bestScore) {
      runnerUpScore = bestScore;
      bestScore = studentScore;
      bestStudent = st;
    } else if (studentScore > runnerUpScore) {
      runnerUpScore = studentScore;
    }
  }

  const roundedBest = Math.round(bestScore * 1000) / 1000;
  const roundedRunnerUp = Math.round(runnerUpScore * 1000) / 1000;

  if (!bestStudent || roundedBest < threshold) {
    return {
      matched: false,
      ambiguous: false,
      student: bestStudent,
      confidence: roundedBest,
      runnerUpConfidence: roundedRunnerUp,
    };
  }

  const ambiguous = enrolled.length > 1 && roundedBest - roundedRunnerUp < marginThreshold;
  return {
    matched: !ambiguous,
    ambiguous,
    student: bestStudent,
    confidence: roundedBest,
    runnerUpConfidence: roundedRunnerUp,
  };
}

function getAlignmentCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!alignmentCanvas) {
    alignmentCanvas = document.createElement('canvas');
    alignmentCanvas.width = ARCFACE_INPUT_SIZE;
    alignmentCanvas.height = ARCFACE_INPUT_SIZE;
  }
  const ctx = alignmentCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context for face alignment.');
  }
  return { canvas: alignmentCanvas, ctx };
}

/**
 * Warps a detected face into canonical 112x112 ArcFace alignment using 5 facial landmarks
 * and computes a 192-d L2-normalized embedding using MobileFaceNet_TF (`(px - 127.5) / 128`).
 */
async function extractAlignedMobileFaceNetEmbedding(
  runtime: LoadedFaceRuntime,
  target: HTMLVideoElement | HTMLImageElement,
  face: FaceResult
): Promise<number[]> {
  const srcPts = extractFivePointLandmarks(face);
  if (!srcPts) {
    throw new Error('Could not locate facial landmarks clearly. Face the camera straight-on.');
  }

  const matrix = computeSimilarityTransform(srcPts, ARCFACE_DST_5PT);
  if (!matrix) {
    throw new Error('Could not align facial geometry. Hold steady and try again.');
  }

  const { w, h } = getSourceDimensions(target);
  const { canvas, ctx } = getAlignmentCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ARCFACE_INPUT_SIZE, ARCFACE_INPUT_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(matrix.a, matrix.b, -matrix.b, matrix.a, matrix.tx, matrix.ty);
  ctx.drawImage(target, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Build [-1, 1] RGB Float32Array directly from aligned 112x112 canvas pixels (avoids tf.browser.fromPixels().toFloat() issues)
  const pixelData = ctx.getImageData(0, 0, ARCFACE_INPUT_SIZE, ARCFACE_INPUT_SIZE).data;
  const totalPixels = ARCFACE_INPUT_SIZE * ARCFACE_INPUT_SIZE;
  const floatRgb = new Float32Array(totalPixels * 3);
  let pIdx = 0;
  let fIdx = 0;
  let lumaSum = 0;
  for (let i = 0; i < totalPixels; i++) {
    const r = pixelData[pIdx++];
    const g = pixelData[pIdx++];
    const b = pixelData[pIdx++];
    pIdx++; // skip alpha
    lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
    floatRgb[fIdx++] = (r - 127.5) * 0.0078125;
    floatRgb[fIdx++] = (g - 127.5) * 0.0078125;
    floatRgb[fIdx++] = (b - 127.5) * 0.0078125;
  }

  const meanLuma = lumaSum / totalPixels;
  if (meanLuma < 20 || meanLuma > 246) {
    throw new Error('Face crop lighting is too dark or overexposed. Adjust lighting.');
  }

  const { tf } = runtime.human;
  const inputTensor = tf.tensor4d(
    floatRgb,
    [1, ARCFACE_INPUT_SIZE, ARCFACE_INPUT_SIZE, 3],
    'float32'
  );

  let outputTensor: unknown;
  try {
    outputTensor = runtime.mobileFaceNet.execute(inputTensor);
    const typedData = await (outputTensor as { data: () => Promise<ArrayLike<number>> }).data();
    return compactDescriptor(Array.from(typedData));
  } finally {
    tf.dispose(inputTensor);
    if (outputTensor) tf.dispose(outputTensor);
  }
}

function getSourceDimensions(target: HTMLVideoElement | HTMLImageElement): { w: number; h: number } {
  if ('videoWidth' in target) {
    return { w: target.videoWidth || target.width || 640, h: target.videoHeight || target.height || 480 };
  }
  return { w: target.naturalWidth || target.width || 480, h: target.naturalHeight || target.height || 480 };
}

/**
 * Analyzes one video frame for live face check-in:
 * 1) Full-range face detection + FaceMesh landmarks
 * 2) Distance, sharpness/confidence, lighting & frontal pose quality gate
 * 3) Anti-spoofing + passive liveness + optional active blink confirmation
 * 4) 5-point aligned 112x112 MobileFaceNet embedding & strict similarity match
 */
export async function analyzeVideoFrameForAttendance(
  videoEl: HTMLVideoElement,
  students: Student[],
  settings: FaceRecognitionSettings,
  sessionBlinkConfirmed: boolean
): Promise<LiveFrameEvaluation> {
  const runtime = await getFaceEngine();
  const result = await runtime.human.detect(videoEl);
  const face = result.face?.[0];

  if (!face) {
    return {
      hasFace: false,
      qualityStatus: 'no_face',
      livenessStatus: 'no_face',
      blinkDetected: false,
      match: null,
    };
  }

  const { w, h } = getSourceDimensions(videoEl);
  const quality = evaluateFaceQuality(face, w, h, 'kiosk');
  const liveness = evaluateLivenessGate(face, result.gesture || [], settings, sessionBlinkConfirmed);

  if (!quality.ok) {
    return {
      hasFace: true,
      box: face.box,
      qualityStatus: quality.status,
      qualityMessage: quality.message,
      livenessStatus: liveness.status,
      realScore: liveness.realScore,
      liveScore: liveness.liveScore,
      blinkDetected: liveness.blinkNow,
      match: null,
    };
  }

  if (liveness.status !== 'pass') {
    return {
      hasFace: true,
      box: face.box,
      qualityStatus: 'ok',
      livenessStatus: liveness.status,
      realScore: liveness.realScore,
      liveScore: liveness.liveScore,
      blinkDetected: liveness.blinkNow,
      match: null,
    };
  }

  let descriptor: number[];
  try {
    descriptor = await extractAlignedMobileFaceNetEmbedding(runtime, videoEl, face);
  } catch (err) {
    return {
      hasFace: true,
      box: face.box,
      qualityStatus: 'bad_lighting',
      qualityMessage: err instanceof Error ? err.message : 'Face alignment failed — look straight ahead.',
      livenessStatus: liveness.status,
      realScore: liveness.realScore,
      liveScore: liveness.liveScore,
      blinkDetected: liveness.blinkNow,
      match: null,
    };
  }

  const baseMatch = findBestStudentFaceMatch(descriptor, students, settings.matchThreshold);
  return {
    hasFace: true,
    box: face.box,
    qualityStatus: 'ok',
    livenessStatus: liveness.status,
    realScore: liveness.realScore,
    liveScore: liveness.liveScore,
    descriptor,
    blinkDetected: liveness.blinkNow,
    match: {
      ...baseMatch,
      livenessStatus: liveness.status,
      realScore: liveness.realScore,
      liveScore: liveness.liveScore,
    },
  };
}

/**
 * Captures one high-precision aligned 192-d MobileFaceNet descriptor from either
 * the enrollment camera video feed or an uploaded portrait image.
 */
export async function extractFaceDescriptorFromInput(
  input: HTMLVideoElement | HTMLImageElement | string
): Promise<{ descriptor: number[]; realScore?: number; liveScore?: number }> {
  const runtime = await getFaceEngine();

  const target: HTMLVideoElement | HTMLImageElement =
    typeof input === 'string' ? await loadImageForDetection(input) : input;

  if ('videoWidth' in target && (target.readyState < 2 || target.videoWidth === 0)) {
    throw new Error('Camera feed is still warming up. Wait a moment and tap Capture again.');
  }

  const result = await runtime.human.detect(target);
  if (!result.face || result.face.length === 0) {
    throw new Error('No face detected. Ensure your face is well-lit and centered in frame.');
  }
  const face = result.face[0];
  const { w, h } = getSourceDimensions(target);
  const quality = evaluateFaceQuality(face, w, h, 'enroll');
  if (!quality.ok) {
    throw new Error(quality.message || 'Face quality check failed. Move closer and look straight ahead.');
  }

  const descriptor = await extractAlignedMobileFaceNetEmbedding(runtime, target, face);
  return {
    descriptor,
    realScore: typeof face.real === 'number' ? face.real : undefined,
    liveScore: typeof face.live === 'number' ? face.live : undefined,
  };
}

/**
 * Checks a live enrollment video frame for proper framing, lighting, landmarks, and liveness.
 * Set `captureEmbedding = true` on consecutive steady frames to extract and return the 192-d descriptor.
 */
export async function probeEnrollmentFrame(
  videoEl: HTMLVideoElement,
  captureEmbedding = false
): Promise<{
  ready: boolean;
  statusMessage: string;
  descriptor?: number[];
  realScore?: number;
}> {
  if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    return { ready: false, statusMessage: 'Warming up HD camera feed...' };
  }

  const runtime = await getFaceEngine();
  const result = await runtime.human.detect(videoEl);
  const face = result.face?.[0];
  if (!face) {
    return { ready: false, statusMessage: 'Center your face inside the large oval guide...' };
  }

  const realScore = typeof face.real === 'number' ? face.real : undefined;
  if (realScore !== undefined && realScore < 0.4) {
    return {
      ready: false,
      realScore,
      statusMessage: 'Present a live face clearly (avoid screen glare or photos).',
    };
  }

  const { w, h } = getSourceDimensions(videoEl);
  const quality = evaluateFaceQuality(face, w, h, 'enroll');
  if (!quality.ok) {
    return {
      ready: false,
      realScore,
      statusMessage: quality.message || 'Move slightly closer and look straight ahead.',
    };
  }

  const landmarks = extractFivePointLandmarks(face);
  if (!landmarks) {
    return {
      ready: false,
      realScore,
      statusMessage: 'Align both eyes, nose, and mouth clearly inside the oval.',
    };
  }

  if (!captureEmbedding) {
    return {
      ready: true,
      realScore,
      statusMessage: 'Face locked cleanly — hold steady to auto-capture...',
    };
  }

  const descriptor = await extractAlignedMobileFaceNetEmbedding(runtime, videoEl, face);
  return {
    ready: true,
    realScore,
    descriptor,
    statusMessage: 'Captured Face ID sample cleanly!',
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
      reject(
        new Error('Could not read portrait image for face extraction. Use Live Camera Enrollment instead.')
      );
    img.src = src;
  });
}

/**
 * Plays a gentle short chime when attendance is logged via Face Check-In.
 */
export function playCheckinSuccessTone(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
