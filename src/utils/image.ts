const TARGET_SIZE = 192;
const MAX_CELL_SAFE_LENGTH = 42000;

async function decodeImageFile(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode the selected image.'));
    image.src = dataUrl;
  });
}

function encodeBoundedJpeg(canvas: HTMLCanvasElement): string {
  const qualities = [0.78, 0.65, 0.52, 0.4];
  for (const quality of qualities) {
    const output = canvas.toDataURL('image/jpeg', quality);
    if (output.length <= MAX_CELL_SAFE_LENGTH) {
      return output;
    }
  }

  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = 128;
  smallCanvas.height = 128;
  const sCtx = smallCanvas.getContext('2d');
  if (sCtx) {
    sCtx.drawImage(canvas, 0, 0, 128, 128);
    return smallCanvas.toDataURL('image/jpeg', 0.65);
  }

  return canvas.toDataURL('image/jpeg', 0.4);
}

async function compressSquareImage(file: File, fit: 'cover' | 'contain'): Promise<string> {
  const img = await decodeImageFile(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing is not supported in this browser.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (fit === 'cover') {
    const minSide = Math.min(srcW, srcH);
    const sx = (srcW - minSide) / 2;
    const sy = (srcH - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, TARGET_SIZE, TARGET_SIZE);
  } else {
    const padding = 10;
    const maxDraw = TARGET_SIZE - padding * 2;
    const scale = Math.min(maxDraw / srcW, maxDraw / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const dx = (TARGET_SIZE - drawW) / 2;
    const dy = (TARGET_SIZE - drawH) / 2;
    ctx.drawImage(img, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
  }

  return encodeBoundedJpeg(canvas);
}

/**
 * Compresses and center-crops an uploaded portrait photo into a crisp 192x192 JPEG Data URL.
 * Guarantees the resulting string stays safely below Google Sheets' 50,000-character per-cell limit.
 */
export async function compressPortraitImage(file: File): Promise<string> {
  return compressSquareImage(file, 'cover');
}

/**
 * Compresses a school logo/crest with aspect-fit padding so wide or tall emblems never clip.
 */
export async function compressLogoImage(file: File): Promise<string> {
  return compressSquareImage(file, 'contain');
}

export function getInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
