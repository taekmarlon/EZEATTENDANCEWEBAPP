import { useState } from 'react';
import { Download, Smartphone, Apple, X, FileDown } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { generateAppleMobileConfig } from '../utils/appleProfile';
import { downloadTextFile } from '../utils/export';
import { isNativePlatform } from '../utils/platform';
import { useToast } from '../context/ToastContext';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'compact';
}

async function fetchIconBase64(): Promise<string | undefined> {
  try {
    const res = await fetch('/apple-touch-icon.png');
    if (!res.ok) return undefined;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return undefined;
  }
}

export default function PWAInstallButton({ variant = 'sidebar' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { showToast } = useToast();

  const [showGuide, setShowGuide] = useState(false);
  const [activeOsTab, setActiveOsTab] = useState<'apple' | 'android'>(() =>
    isIOS ? 'apple' : 'android'
  );
  const [profileUrl, setProfileUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
    return 'https://';
  });
  const [isDownloadingProfile, setIsDownloadingProfile] = useState(false);

  // Suppress inside installed PWA or inside native Android APK
  if (isInstalled || isNativePlatform()) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setActiveOsTab(isIOS ? 'apple' : 'android');
    setShowGuide(true);
  };

  const handleDownloadAppleProfile = async () => {
    setIsDownloadingProfile(true);
    try {
      const iconBase64 = await fetchIconBase64();
      const xml = generateAppleMobileConfig({
        appUrl: profileUrl,
        label: 'EZ Center',
        iconBase64,
      });
      await downloadTextFile(
        'EZ-Center-iOS.mobileconfig',
        xml,
        'application/x-apple-aspen-config'
      );
      showToast('Downloaded EZ-Center-iOS.mobileconfig profile.');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Could not create Apple profile.',
        'error'
      );
    } finally {
      setIsDownloadingProfile(false);
    }
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Download size={14} />
          Install App
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
        >
          <Smartphone size={15} />
          Install on Phone / Apple
        </button>
      )}

      {showGuide && (
        <div
          className="no-print fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                  {activeOsTab === 'apple' ? <Apple size={16} /> : <Smartphone size={16} />}
                </div>
                <h3 className="text-sm font-bold text-slate-900">Install EZ Center Portal</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
                aria-label="Close install instructions"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-3 border-b border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => setActiveOsTab('apple')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeOsTab === 'apple'
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Apple (iPhone / iPad / Mac)
              </button>
              <button
                type="button"
                onClick={() => setActiveOsTab('android')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  activeOsTab === 'android'
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Android (Chrome PWA)
              </button>
            </div>

            <div className="p-5 text-xs text-slate-600 space-y-4 leading-relaxed">
              {activeOsTab === 'apple' ? (
                <>
                  <div>
                    <p className="font-bold text-slate-800 mb-1.5">
                      Option 1 — Safari “Add to Home Screen” (Recommended)
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5">
                      <li>
                        Open your deployed app URL directly in <strong>Safari</strong> on iPhone or
                        iPad (or <strong>File → Add to Dock</strong> in Safari on macOS).
                      </li>
                      <li>
                        Tap the <strong>Share</strong> icon in the toolbar, then tap{' '}
                        <strong>Add to Home Screen</strong> → <strong>Add</strong>.
                      </li>
                      <li>
                        Launches full-screen with offline caching and live Supabase database sync.
                      </li>
                    </ol>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <p className="font-bold text-slate-800">
                      Option 2 — One-Tap iOS Web Clip Profile (.mobileconfig)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Download an Apple Configuration Profile to distribute a pre-configured Home
                      Screen app icon to teachers’ iPhones/iPads (requires your hosted HTTPS URL):
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={profileUrl}
                        onChange={(e) => setProfileUrl(e.target.value)}
                        placeholder="https://your-ez-center-url.vercel.app"
                        className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-violet-500"
                      />
                      <button
                        type="button"
                        disabled={isDownloadingProfile || !profileUrl.trim()}
                        onClick={handleDownloadAppleProfile}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FileDown size={13} />
                        {isDownloadingProfile ? 'Building...' : '.mobileconfig'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    Open this portal URL in <strong>Google Chrome</strong> or{' '}
                    <strong>Microsoft Edge</strong> on your phone or desktop.
                  </li>
                  <li>
                    Tap the browser menu (<strong>⋮</strong>) and choose{' '}
                    <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </li>
                  <li>
                    Runs as an installable full-screen Web App with offline shell caching and live
                    Supabase sync.
                  </li>
                </ol>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
