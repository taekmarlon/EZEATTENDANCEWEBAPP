import { describe, it, expect } from 'vitest';
import {
  ARCFACE_DST_5PT,
  MOBILEFACENET_DIM,
  compactDescriptor,
  computeFaceSimilarity,
  computeSimilarityTransform,
  evaluateFaceQuality,
  evaluateLivenessGate,
  findBestStudentFaceMatch,
} from './faceRecognition';
import { DEFAULT_FACE_RECOGNITION_SETTINGS } from './permissions';
import { Student } from '../types';

function makeVector(seed: number, length = MOBILEFACENET_DIM): number[] {
  const vec: number[] = [];
  for (let i = 0; i < length; i++) {
    vec.push(Math.sin(seed * (i + 1) * 0.37) + Math.cos((seed + 1) * (i + 3) * 0.19));
  }
  return compactDescriptor(vec);
}

function makeStudent(id: string, name: string, faceDescriptors?: number[][]): Student {
  return {
    id,
    name,
    rollNo: '',
    gradeLevel: 'Grade 8',
    gender: 'Female',
    contactNo: '',
    teacherName: 'Coach Marlon',
    faceDescriptors,
    attendance: {},
    evaluations: [],
  };
}

describe('faceRecognition MobileFaceNet + alignment engine helpers', () => {
  it('computes L2-normalized cosine similarity for 192-d vectors, rejects legacy dims, and matches the top student', () => {
    const vAna = makeVector(1.5);
    const vBen = makeVector(8.2);
    const liveAnaSlightOffset = compactDescriptor(
      vAna.map((n, idx) => n + (idx % 3 === 0 ? 0.004 : -0.003))
    );
    const legacyFaceResVec = makeVector(1.5, 1024);

    const students = [
      makeStudent('st-1', 'Ana Reyes', [vAna]),
      makeStudent('st-2', 'Ben Cruz', [vBen]),
      makeStudent('st-legacy', 'Legacy Student', [legacyFaceResVec]),
      makeStudent('st-3', 'Unenrolled Student'),
    ];

    expect(vAna.length).toBe(MOBILEFACENET_DIM);
    expect(computeFaceSimilarity(vAna, vAna)).toBe(1);
    expect(computeFaceSimilarity(vAna, legacyFaceResVec)).toBe(0);

    const res = findBestStudentFaceMatch(liveAnaSlightOffset, students, 0.62, 0.08);
    expect(res.matched).toBe(true);
    expect(res.ambiguous).toBe(false);
    expect(res.student?.id).toBe('st-1');
    expect(res.confidence).toBeGreaterThanOrEqual(0.62);
  });

  it('rejects ambiguous matches when runner-up is within the 0.08 safety margin', () => {
    const base = makeVector(4.0);
    const twinA = base;
    const twinB = compactDescriptor(base.map((n, i) => n + (i < 6 ? 0.004 : 0)));

    const res = findBestStudentFaceMatch(
      base,
      [makeStudent('st-a', 'Twin A', [twinA]), makeStudent('st-b', 'Twin B', [twinB])],
      0.62,
      0.08
    );

    expect(res.matched).toBe(false);
    expect(res.ambiguous).toBe(true);
  });

  it('solves an accurate 2D similarity matrix for 5-point ArcFace landmark alignment', () => {
    const scale = 2.5;
    const theta = 0.22;
    const tx = 180;
    const ty = 95;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Invert canonical points into a tilted/scaled 720p video frame
    const srcPts = ARCFACE_DST_5PT.map(([dx, dy]) => {
      const sx = scale * (cosT * dx - sinT * dy) + tx;
      const sy = scale * (sinT * dx + cosT * dy) + ty;
      return [sx, sy] as [number, number];
    });

    const m = computeSimilarityTransform(srcPts, ARCFACE_DST_5PT);
    expect(m).not.toBeNull();

    for (let i = 0; i < ARCFACE_DST_5PT.length; i++) {
      const [sx, sy] = srcPts[i];
      const [dx, dy] = ARCFACE_DST_5PT[i];
      const px = m!.a * sx - m!.b * sy + m!.tx;
      const py = m!.b * sx + m!.a * sy + m!.ty;
      expect(px).toBeCloseTo(dx, 2);
      expect(py).toBeCloseTo(dy, 2);
    }
  });

  it('rejects faces that are too small/far or turned side-on before running matching', () => {
    const tooFar = evaluateFaceQuality(
      {
        box: [300, 200, 52, 54],
        boxScore: 0.92,
        faceScore: 0.92,
        score: 0.92,
        mesh: [],
        annotations: {} as never,
      },
      1280,
      720,
      'kiosk'
    );
    expect(tooFar.ok).toBe(false);
    expect(tooFar.status).toBe('too_far');

    const turnedSideways = evaluateFaceQuality(
      {
        box: [400, 150, 220, 240],
        boxScore: 0.95,
        faceScore: 0.95,
        score: 0.95,
        rotation: { angle: { yaw: 0.65, pitch: 0.05, roll: 0.01 }, matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], gaze: { bearing: 0, strength: 0 } },
        mesh: [],
        annotations: {} as never,
      },
      1280,
      720,
      'kiosk'
    );
    expect(turnedSideways.ok).toBe(false);
    expect(turnedSideways.status).toBe('bad_pose');

    const goodFrontal = evaluateFaceQuality(
      {
        box: [400, 150, 220, 240],
        boxScore: 0.95,
        faceScore: 0.95,
        score: 0.95,
        rotation: { angle: { yaw: 0.1, pitch: -0.05, roll: 0.02 }, matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], gaze: { bearing: 0, strength: 0 } },
        mesh: [],
        annotations: {} as never,
      },
      1280,
      720,
      'kiosk'
    );
    expect(goodFrontal.ok).toBe(true);
    expect(goodFrontal.status).toBe('ok');
  });

  it('blocks printed-photo or screen spoofs and enforces optional eye-blink confirmation', () => {
    const spoofCheck = evaluateLivenessGate(
      { real: 0.21, live: 0.78, annotations: {} as never },
      [],
      DEFAULT_FACE_RECOGNITION_SETTINGS,
      false
    );
    expect(spoofCheck.status).toBe('spoof_rejected');

    const waitBlink = evaluateLivenessGate(
      { real: 0.89, live: 0.86, annotations: {} as never },
      [],
      { ...DEFAULT_FACE_RECOGNITION_SETTINGS, requireBlinkChallenge: true },
      false
    );
    expect(waitBlink.status).toBe('blink_required');

    const blinkGesturePass = evaluateLivenessGate(
      { real: 0.89, live: 0.86, annotations: {} as never },
      [{ face: 0, gesture: 'blink left eye' }],
      { ...DEFAULT_FACE_RECOGNITION_SETTINGS, requireBlinkChallenge: true },
      false
    );
    expect(blinkGesturePass.status).toBe('pass');
    expect(blinkGesturePass.blinkNow).toBe(true);
  });
});
