/**
 * Client-side image optimization utility.
 * Automatically resizes large images and compresses them into efficient WebP/JPEG format
 * to minimize IndexedDB storage footprint and prevent UI memory bloat.
 */

export interface OptimizeImageOptions {
  maxDimension?: number;
  quality?: number;
  targetFormat?: 'image/webp' | 'image/jpeg';
}

export async function compressAndResizeImage(
  fileOrDataUrl: File | string,
  options: OptimizeImageOptions = {}
): Promise<{ dataUrl: string; width: number; height: number; originalSize: number; compressedSize: number }> {
  const {
    maxDimension = 1280,
    quality = 0.82,
    targetFormat = 'image/webp',
  } = options;

  let originalDataUrl: string;
  let originalSize = 0;

  if (typeof fileOrDataUrl === 'string') {
    originalDataUrl = fileOrDataUrl;
    originalSize = Math.round((originalDataUrl.length * 3) / 4);
  } else {
    originalSize = fileOrDataUrl.size;
    originalDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    });
  }

  // If already SVG or tiny (under 25KB), don't alter
  if (originalDataUrl.startsWith('data:image/svg') || (originalSize < 25 * 1024 && !originalDataUrl.startsWith('data:image/bmp'))) {
    return {
      dataUrl: originalDataUrl,
      width: 0,
      height: 0,
      originalSize,
      compressedSize: originalSize,
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;

      // Scale down if dimensions exceed maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          dataUrl: originalDataUrl,
          width: img.width,
          height: img.height,
          originalSize,
          compressedSize: originalSize,
        });
        return;
      }

      // Smooth scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let compressedDataUrl = canvas.toDataURL(targetFormat, quality);

      // Fallback if browser doesn't support webp export (falls back to original format or jpeg)
      if (targetFormat === 'image/webp' && !compressedDataUrl.startsWith('data:image/webp')) {
        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      }

      const compressedSize = Math.round((compressedDataUrl.length * 3) / 4);

      // If compressed version is somehow larger than original, keep original
      if (compressedSize >= originalSize && originalSize > 0) {
        resolve({
          dataUrl: originalDataUrl,
          width: img.width,
          height: img.height,
          originalSize,
          compressedSize: originalSize,
        });
        return;
      }

      resolve({
        dataUrl: compressedDataUrl,
        width,
        height,
        originalSize,
        compressedSize,
      });
    };

    img.onerror = () => {
      // On error, fallback gracefully to original
      resolve({
        dataUrl: originalDataUrl,
        width: 0,
        height: 0,
        originalSize,
        compressedSize: originalSize,
      });
    };

    img.src = originalDataUrl;
  });
}
