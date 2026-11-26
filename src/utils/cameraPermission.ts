export interface CameraPermissionStatus {
  granted: boolean;
  message?: string;
}

/**
 * Ensures browser mediaDevices APIs are available before requesting camera stream.
 */
export async function ensureCameraPermission(): Promise<CameraPermissionStatus> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      message: 'Live camera streaming requires HTTPS or a browser supporting camera capture.',
    };
  }

  return { granted: true };
}
