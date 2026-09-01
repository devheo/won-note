import React, { useState, useEffect } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Copy,
  Check,
  Maximize,
  Minimize,
  RefreshCcw,
} from 'lucide-react';

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  altText?: string;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  altText = '이미지 미리보기',
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset controls when image changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setIsCopied(false);
    }
  }, [isOpen, imageUrl]);

  // Keyboard shortcut listener (Escape to close, +/- to zoom)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z + 0.25, 4));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(z - 0.25, 0.5));
      } else if (e.key === '0') {
        setZoom(1);
        setPosition({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `wonbee_image_${Date.now()}.png`;
    a.click();
  };

  const handleCopy = async () => {
    try {
      if (imageUrl.startsWith('data:image/png;base64,')) {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } else {
        await navigator.clipboard.writeText(imageUrl);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch {
      await navigator.clipboard.writeText(imageUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between p-4 bg-stone-950/90 backdrop-blur-md animate-in fade-in select-none"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Toolbar */}
      <div
        className="w-full max-w-4xl flex items-center justify-between text-stone-200 py-2 px-4 rounded-2xl bg-stone-900/80 border border-stone-700/60 shadow-xl z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-amber-400">🖼️ 이미지 뷰어</span>
          <span className="text-xs text-stone-400 truncate max-w-xs">{altText}</span>
        </div>

        {/* Zoom & Rotation Controls */}
        <div className="flex items-center gap-1.5 bg-stone-800/80 px-2 py-1 rounded-xl border border-stone-700/50">
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
            className="p-1.5 hover:bg-stone-700 rounded-lg text-stone-300 hover:text-white transition-colors"
            title="축소 (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-amber-300 px-2 min-w-[50px] text-center font-bold">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
            className="p-1.5 hover:bg-stone-700 rounded-lg text-stone-300 hover:text-white transition-colors"
            title="확대 (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-stone-700 mx-1" />

          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 hover:bg-stone-700 rounded-lg text-stone-300 hover:text-white transition-colors"
            title="90° 회전"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setRotation(0);
              setPosition({ x: 0, y: 0 });
            }}
            className="p-1.5 hover:bg-stone-700 rounded-lg text-stone-300 hover:text-white transition-colors"
            title="원본 크기로 리셋 (0)"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors border border-stone-700"
            title="이미지 복사"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isCopied ? '복사됨' : '복사'}</span>
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            title="이미지 파일 다운로드"
          >
            <Download className="w-3.5 h-3.5" />
            <span>다운로드</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white rounded-xl transition-colors ml-2"
            title="닫기 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        className="flex-1 w-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing p-4"
        onMouseDown={handleMouseDown}
      >
        <img
          src={imageUrl}
          alt={altText}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            maxHeight: '85vh',
            maxWidth: '90vw',
            objectFit: 'contain',
          }}
          className="rounded-lg shadow-2xl pointer-events-auto border border-stone-700/50"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>

      {/* Bottom Hint */}
      <div className="text-[11px] text-stone-500 pb-2">
        드래그하여 이동 • 마우스 휠 또는 +/-로 확대/축소 • Esc로 닫기
      </div>
    </div>
  );
};
