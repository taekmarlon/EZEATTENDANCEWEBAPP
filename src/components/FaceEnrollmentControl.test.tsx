import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FaceEnrollmentControl from './FaceEnrollmentControl';
import { ToastProvider } from '../context/ToastContext';

const mockProbeEnrollmentFrame = vi.fn();
const mockPlayTone = vi.fn();
const mockEnsureCameraPermission = vi.fn();

vi.mock('../utils/cameraPermission', () => ({
  ensureCameraPermission: () => mockEnsureCameraPermission(),
}));

vi.mock('../services/faceRecognition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/faceRecognition')>();
  return {
    ...actual,
    probeEnrollmentFrame: (...args: unknown[]) => mockProbeEnrollmentFrame(...args),
    playCheckinSuccessTone: () => mockPlayTone(),
  };
});

describe('FaceEnrollmentControl', () => {
  const stopTrack = vi.fn();
  const mockGetUserMedia = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureCameraPermission.mockResolvedValue({ granted: true });
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
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 1280,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a large enrollment camera overlay and auto-captures when face aligns steadily', async () => {
    const sample192 = new Array(192).fill(0.05);
    mockProbeEnrollmentFrame
      .mockResolvedValueOnce({
        ready: true,
        statusMessage: 'Face locked cleanly — hold steady to auto-capture...',
      })
      .mockResolvedValueOnce({
        ready: true,
        descriptor: sample192,
        statusMessage: 'Captured Face ID sample cleanly!',
      })
      .mockResolvedValue({
        ready: false,
        statusMessage: 'Center your face inside the large oval guide...',
      });

    const onChange = vi.fn();
    render(
      <ToastProvider>
        <FaceEnrollmentControl
          studentName="Maria Santos"
          descriptors={[]}
          onChange={onChange}
        />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Live Camera Enroll/i }));

    expect(screen.getByText(/Enroll Face ID · Maria Santos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Auto: ON/i })).toBeInTheDocument();

    await waitFor(
      () => {
        expect(onChange).toHaveBeenCalledWith([sample192]);
      },
      { timeout: 2500 }
    );

    expect(mockPlayTone).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Auto: ON/i }));
    expect(screen.getByRole('button', { name: /Auto: OFF/i })).toBeInTheDocument();
  });
});
