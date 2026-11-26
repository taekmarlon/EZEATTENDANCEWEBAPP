import { describe, it, expect } from 'vitest';
import {
  compactDescriptor,
  computeFaceSimilarity,
  evaluateLivenessGate,
  findBestStudentFaceMatch,
} from './faceRecognition';
import { DEFAULT_FACE_RECOGNITION_SETTINGS } from './permissions';
import { Student } from '../types';

function makeVector(seed: number, length = 1024): number[] {
  const vec: number[] = [];
  for (let i = 0; i < length; i++) {
    vec.push(Math.sin(seed * (i + 1) * 0.13) * 0.5);
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

describe('faceRecognition engine helpers', () => {
  it('computes calibrated similarity and matches the highest-scoring enrolled student', () => {
    const vAna = makeVector(1.5);
    const vBen = makeVector(8.2);
    const liveAnaSlightOffset = vAna.map((n, idx) => n + (idx % 3 === 0 ? 0.004 : -0.003));

    const students = [
      makeStudent('st-1', 'Ana Reyes', [vAna]),
      makeStudent('st-2', 'Ben Cruz', [vBen]),
      makeStudent('st-3', 'Unenrolled Student'),
    ];

    expect(computeFaceSimilarity(vAna, vAna)).toBe(1);
    const res = findBestStudentFaceMatch(liveAnaSlightOffset, students, 0.62);
    expect(res.matched).toBe(true);
    expect(res.ambiguous).toBe(false);
    expect(res.student?.id).toBe('st-1');
    expect(res.confidence).toBeGreaterThanOrEqual(0.62);
  });

  it('rejects ambiguous lookalike matches when runner-up is within safety margin', () => {
    const base = makeVector(4.0);
    const twinA = base;
    const twinB = base.map((n, i) => n + (i === 0 ? 0.001 : 0));

    const res = findBestStudentFaceMatch(base, [
      makeStudent('st-a', 'Twin A', [twinA]),
      makeStudent('st-b', 'Twin B', [twinB]),
    ], 0.62, 0.04);

    expect(res.matched).toBe(false);
    expect(res.ambiguous).toBe(true);
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
