import { useRef, useState, useEffect, ChangeEvent } from 'react';
import { Camera, X } from 'lucide-react';
import { compressLogoImage, compressPortraitImage, getInitials } from '../utils/image';
import { useToast } from '../context/ToastContext';

interface AvatarProps {
  src?: string;
  name: string;
  fallbackText?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'slate' | 'violet' | 'dark';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[10px] rounded-md',
  sm: 'w-9 h-9 text-xs rounded-lg',
  md: 'w-11 h-11 text-sm rounded-lg',
  lg: 'w-14 h-14 text-base rounded-xl',
  xl: 'w-20 h-20 text-xl rounded-xl',
};

const TONE_CLASSES: Record<NonNullable<AvatarProps['tone']>, string> = {
  slate: 'bg-slate-100 text-slate-600 border border-slate-200',
  violet: 'bg-violet-50 text-violet-700 border border-violet-200',
  dark: 'bg-slate-800 text-slate-200 border border-slate-700',
};

export function PortraitAvatar({
  src,
  name,
  fallbackText,
  size = 'md',
  tone = 'slate',
  className = '',
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={`${name || 'Profile'} photo`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${SIZE_CLASSES[size]} object-cover shrink-0 border border-slate-200 bg-white ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={name || 'Profile'}
      className={`${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]} flex items-center justify-center font-bold tracking-tight shrink-0 select-none ${className}`}
    >
      {fallbackText ?? getInitials(name)}
    </div>
  );
}

interface PhotoUploaderProps {
  label: string;
  nameForFallback: string;
  fallbackText?: string;
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  size?: 'sm' | 'md' | 'lg';
  compressMode?: 'portrait' | 'logo';
  canRemove?: boolean;
}

export function PhotoUploader({
  label,
  nameForFallback,
  fallbackText,
  value,
  onChange,
  size = 'md',
  compressMode = 'portrait',
  canRemove = true,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const { showToast } = useToast();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    try {
      const compressed =
        compressMode === 'logo'
          ? await compressLogoImage(file)
          : await compressPortraitImage(file);
      onChange(compressed);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Failed to process image.',
        'error'
      );
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <PortraitAvatar
          src={value}
          name={nameForFallback || label}
          fallbackText={fallbackText}
          size={size}
          tone="violet"
        />
        {value && canRemove && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            title={`Remove ${label.toLowerCase()}`}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-rose-600 transition-colors shadow-sm"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={processing}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Camera size={13} />
            {processing ? 'Processing...' : value ? 'Change Image' : 'Upload Image'}
          </button>
        </div>
      </div>
    </div>
  );
}
