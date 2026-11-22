/**
 * Web runtime platform helpers for the browser / PWA build.
 */
export function isNativePlatform(): boolean {
  return false;
}

export function getRuntimePlatform(): 'android' | 'ios' | 'web' {
  return 'web';
}
