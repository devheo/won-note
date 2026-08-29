import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number; // e.g. 100 = 100%
  onChangeZoom: (newZoom: number) => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({ zoom, onChangeZoom }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleZoomIn = () => {
    onChangeZoom(Math.min(175, Math.round(zoom + 10)));
  };

  const handleZoomOut = () => {
    onChangeZoom(Math.max(60, Math.round(zoom - 10)));
  };

  const handleReset = () => {
    onChangeZoom(100);
  };

  return (
    <div
      id="floating-zoom-fab"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-1.5 p-1.5 bg-stone-900/90 dark:bg-stone-800/95 backdrop-blur-md text-stone-100 rounded-full shadow-2xl border border-stone-700/80 transition-all select-none hover:scale-102"
    >
      {/* Zoom Out Button */}
      <button
        onClick={handleZoomOut}
        disabled={zoom <= 60}
        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-40 transition-colors"
        title="화면 축소 (Zoom Out -10%)"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      {/* Current Zoom Percentage Pill */}
      <button
        onClick={handleReset}
        className="px-2 py-0.5 rounded-full hover:bg-white/10 font-mono text-xs font-bold text-amber-400 min-w-[48px] text-center transition-colors"
        title="100% 기본 배율로 초기화"
      >
        {zoom}%
      </button>

      {/* Zoom In Button */}
      <button
        onClick={handleZoomIn}
        disabled={zoom >= 175}
        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-40 transition-colors"
        title="화면 확대 (Zoom In +10%)"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      {/* Quick Reset Icon */}
      {zoom !== 100 && (
        <button
          onClick={handleReset}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 text-stone-400 hover:text-white transition-colors border-l border-stone-700 pl-1 ml-0.5"
          title="100% 리셋"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
