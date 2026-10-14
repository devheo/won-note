import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, AlertCircle } from 'lucide-react';
import { wonbeeDexieDB } from '../../services/storage/dexieDb';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  title?: string;
  skeletonClassName?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = '이미지',
  className = '',
  style,
  onClick,
  title,
  skeletonClassName = '',
  ...props
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Resolve asset:// to blob URL
  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    async function resolveSrc() {
      if (!src) {
        setResolvedSrc('');
        return;
      }
      if (src.startsWith('asset://')) {
        const assetId = src.replace('asset://', '');
        try {
          const asset = await wonbeeDexieDB.getAsset(assetId);
          if (asset && asset.blob && isMounted) {
            objectUrl = URL.createObjectURL(asset.blob);
            setResolvedSrc(objectUrl);
            return;
          }
        } catch (err) {
          console.warn('[LazyImage] Failed to resolve asset:', err);
        }
      }
      if (isMounted) {
        setResolvedSrc(src);
      }
    }

    resolveSrc();

    return () => {
      isMounted = false;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_) {}
      }
    };
  }, [src]);

  // 2. Intersection Observer for viewport-based lazy loading
  useEffect(() => {
    if (!resolvedSrc) return;

    const el = containerRef.current;
    if (!el) return;

    // Fallback if IntersectionObserver is not supported
    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '120px', // Pre-fetch 120px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [resolvedSrc]);

  // 3. Memory Cleanup: Revoke Blob URLs on unmount
  useEffect(() => {
    return () => {
      if (resolvedSrc && resolvedSrc.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(resolvedSrc);
        } catch (err) {
          console.warn('[LazyImage] Failed to revoke blob URL:', err);
        }
      }
    };
  }, [resolvedSrc]);

  // Reset state if resolvedSrc changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [resolvedSrc]);

  if (!resolvedSrc) {
    return (
      <div className={`flex items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-400 p-2 rounded ${className}`}>
        <ImageIcon className="w-4 h-4 opacity-50" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-block overflow-hidden ${className}`}
      style={style}
    >
      {/* Animated Skeleton Placeholder while loading or before entering viewport */}
      {(!isVisible || !isLoaded) && !hasError && (
        <div
          className={`absolute inset-0 bg-stone-200 dark:bg-stone-800 animate-pulse rounded flex items-center justify-center text-stone-400 dark:text-stone-600 ${skeletonClassName}`}
        >
          <ImageIcon className="w-4 h-4 opacity-40 animate-bounce" />
        </div>
      )}

      {/* Fallback UI if image fails to load */}
      {hasError && (
        <div className="w-full h-full min-h-[40px] flex items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 rounded p-2 text-[11px] gap-1">
          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>로드 실패</span>
        </div>
      )}

      {/* Actual Lazy Image Element */}
      {isVisible && !hasError && (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          onClick={onClick}
          title={title}
          className={`${className} transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          {...props}
        />
      )}
    </div>
  );
};
