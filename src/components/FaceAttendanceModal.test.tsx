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

vi.mock('../services/faceRecognition', () => ({
  getFaceEngine: () => mockGetFaceEngine(),
  analyzeVideoFrameForAttendance: (...args: unknown[]) => mockAnalyzeVideoFrame(...args),
  playCheckinSuccessTone: () => mockPlayTone(),
}));

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
    faceDescriptors: [new Array(1024).fill(0.2)],
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
    mockGetFaceEngine.mockResolvedValue({ backend: 'webgl', human: {} });
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

  it('shows empty state when no enrolled faces exist and supports class vs whole-school scope and kiosk toggle', async () => {
    const emptySpec: Specialization = {
      id: 'sp-empty',
      name: 'Voice',
      students: [],
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

  it('logs Present with face_kiosk metadata on a verified live face match and plays chime', async () => {
    mockAnalyzeVideoFrame.mockResolvedValue({
      hasFace: true,
      livenessStatus: 'passed',
      blinkDetected: false,
      match: {
        matched: true,
        ambiguous: false,
        student: enrolledStudent,
        confidence: 0.92,
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
        expect(mockUpdateAttendance).toHaveBeenCalledWith(
          'sch-1',
          'sp-piano',
          'st-piano-1',
          todayStr,
          'Present',
          { method: 'face_kiosk', confidence: 0.92 }
        );
      },
      { timeout: 2500 }
    );

    expect(mockPlayTone).toHaveBeenCalled();
    expect(screen.getByText(/Checked In \(1\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('Maria Santos').length).toBeGreaterThanOrEqual(1);
  });

  it('blocks spoofed frames without marking attendance', async () => {
    mockAnalyzeVideoFrame.mockResolvedValue({
      hasFace: true,
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
        expect(screen.getByText(/Photo \/ screen spoofing suspected/i)).toBeInTheDocument();
      },
      { timeout: 2500 }
    );

    expect(mockUpdateAttendance).not.toHaveBeenCalled();
    expect(mockPlayTone).not.toHaveBeenCalled();
  });
});
