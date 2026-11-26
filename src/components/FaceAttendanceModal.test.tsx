import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import FaceAttendanceModal from './FaceAttendanceModal';
import { ToastProvider } from '../context/ToastContext';
import { DEFAULT_SYSTEM_SETTINGS } from '../services/permissions';
import { School, Specialization } from '../types';

const mockUpdateAttendance = vi.fn();
const mockGetFaceEngine = vi.fn();
const mockAnalyzeVideoFrame = vi.fn();
const mockPlayTone = vi.fn();
const mockEnsureCameraPermission = vi.fn();

vi.mock('../store', () => ({
  useStore: () => ({
    updateAttendance: mockUpdateAttendance,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
  }),
}));

vi.mock('../utils/cameraPermission', () => ({
  ensureCameraPermission: () => mockEnsureCameraPermission(),
}));

vi.mock('../services/faceRecognition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/faceRecognition')>();
  return {
    ...actual,
    getFaceEngine: () => mockGetFaceEngine(),
    analyzeVideoFrameForAttendance: (...args: unknown[]) => mockAnalyzeVideoFrame(...args),
    playCheckinSuccessTone: () => mockPlayTone(),
  };
});

describe('FaceAttendanceModal', () => {
  const stopTrack = vi.fn();
  const mockGetUserMedia = vi.fn();

  const enrolledStudent = {
    id: 'st-piano-1',
    name: 'Maria Santos',
    rollNo: '001',
    gradeLevel: 'Grade 8',
    gender: 'Female',
    contactNo: '',
    teacherName: 'Ms. Reyes',
    faceDescriptors: [new Array(192).fill(0.2)],
    attendance: {},
    evaluations: [],
  };

  const pianoSpec: Specialization = {
    id: 'sp-piano',
    name: 'Piano',
    students: [enrolledStudent],
    rubricCriteria: [],
  };

  const guitarSpec: Specialization = {
    id: 'sp-guitar',
    name: 'Guitar',
    students: [
      {
        ...enrolledStudent,
        id: 'st-guitar-1',
        name: 'Carlos Reyes',
      },
    ],
    rubricCriteria: [],
  };

  const school: School = {
    id: 'sch-1',
    name: 'EZ Conservatory',
    specializations: [pianoSpec, guitarSpec],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureCameraPermission.mockResolvedValue({ granted: true });
    mockGetFaceEngine.mockResolvedValue({ backend: 'webgl', human: {}, mobileFaceNet: {} });
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: mockGetUserMedia },
    });

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state, legacy upgrade notice, class vs whole-school scope, and kiosk toggle', async () => {
    const emptySpec: Specialization = {
      id: 'sp-empty',
      name: 'Voice',
      students: [
        {
          ...enrolledStudent,
          id: 'st-legacy',
          name: 'Legacy User',
          faceDescriptors: [new Array(1024).fill(0.1)],
        },
      ],
      rubricCriteria: [],
    };
    const emptySchool: School = {
      id: 'sch-empty',
      name: 'Solo School',
      specializations: [emptySpec],
    };

    const { rerender } = render(
      <ToastProvider>
        <FaceAttendanceModal
          isOpen
          school={emptySchool}
          spec={emptySpec}
          onClose={vi.fn()}
        />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/No Enrolled Faces Found/i)).toBeInTheDocument();
      expect(screen.getByText(/need one-time HD re-enrollment/i)).toBeInTheDocument();
    });

    rerender(
      <ToastProvider>
        <FaceAttendanceModal isOpen school={school} spec={pianoSpec} onClose={vi.fn()} />
      </ToastProvider>
    );

    expect(screen.getByText(/1 enrolled face/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Whole School Kiosk/i }));
    expect(screen.getByText(/2 enrolled faces/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Kiosk Lock/i }));
    expect(screen.getByRole('button', { name: /Exit Kiosk/i })).toBeInTheDocument();
  });

  it('requires 3 consecutive verified frames before logging Present with face_kiosk metadata', async () => {
    mockAnalyzeVideoFrame.mockResolvedValue({
      hasFace: true,
      qualityStatus: 'ok',
      livenessStatus: 'pass',
      blinkDetected: false,
      match: {
        matched: true,
        ambiguous: false,
        student: enrolledStudent,
        confidence: 0.92,
        runnerUpConfidence: 0.25,
        livenessStatus: 'pass',
      },
    });

    render(
      <ToastProvider>
        <FaceAttendanceModal isOpen school={school} spec={pianoSpec} onClose={vi.fn()} />
      </ToastProvider>
    );

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    await waitFor(
      () => {
        expect(mockAnalyzeVideoFrame).toHaveBeenCalledTimes(3);
        expect(mockUpdateAttendance).toHaveBeenCalledWith(
          'sch-1',
          'sp-piano',
          'st-piano-1',
          todayStr,
          'Present',
          { method: 'face_kiosk', confidence: 0.92 }
        );
      },
      { timeout: 3000 }
    );

    expect(mockPlayTone).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Checked In \(1\)/i)).toBeInTheDocument();
  });

  it('blocks too-far / spoofed frames and never logs attendance', async () => {
    mockAnalyzeVideoFrame
      .mockResolvedValueOnce({
        hasFace: true,
        qualityStatus: 'too_far',
        qualityMessage: 'Move slightly closer to the camera (0.4m – 1.1m) for accurate Face ID.',
        livenessStatus: 'pass',
        blinkDetected: false,
        match: null,
      })
      .mockResolvedValue({
        hasFace: true,
        qualityStatus: 'ok',
        livenessStatus: 'spoof_rejected',
        blinkDetected: false,
        match: null,
      });

    render(
      <ToastProvider>
        <FaceAttendanceModal isOpen school={school} spec={pianoSpec} onClose={vi.fn()} />
      </ToastProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText(/Move slightly closer to the camera/i)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    await waitFor(
      () => {
        expect(screen.getByText(/Photo \/ screen spoofing suspected/i)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    expect(mockUpdateAttendance).not.toHaveBeenCalled();
    expect(mockPlayTone).not.toHaveBeenCalled();
  });
});
