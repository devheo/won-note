import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Heart, HelpCircle, X } from 'lucide-react';

interface WonBeeMascotProps {
  onAddQuickTable?: () => void;
  onOpenTips?: () => void;
}

const BEE_TIPS = [
  '🐝 셀을 더블 클릭하면 즉시 타이핑하여 인라인 수정할 수 있어요!',
  '🍯 긴 텍스트 셀에 마우스를 올리면 내용이 잘리지 않고 팝업으로 전체 표시돼요!',
  '📌 TipTap 에디터에서 원노트 스티커를 색상별로 원하는 위치에 붙여보세요!',
  '⚡ 모든 수정사항은 디바운스 처리되어 백그라운드에서 실시간 자동 저장됩니다!',
  '📁 좌측 사이드바에서 폴더와 테이블을 드래그하여 무한대 깊이로 정리해보세요!',
  '🔄 상단 데이터 병합(JSON) 메뉴로 동료의 테이블을 내 워크스페이스에 쏙 합칠 수 있어요!',
];

export const WonBeeMascot: React.FC<WonBeeMascotProps> = () => {
  const [tipIndex, setTipIndex] = useState(0);
  const [showSpeech, setShowSpeech] = useState(false);
  const [beeMood, setBeeMood] = useState<'happy' | 'flying' | 'love'>('happy');

  const handleClickBee = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBeeMood('love');

    // Confetti celebration
    confetti({
      particleCount: 30,
      spread: 60,
      origin: {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      },
      colors: ['#F59E0B', '#FBBF24', '#FCD34D', '#10B981'],
    });

    setTipIndex((prev) => (prev + 1) % BEE_TIPS.length);
    setShowSpeech(true);

    setTimeout(() => {
      setBeeMood('happy');
    }, 1500);
  };

  return (
    <div className="relative inline-flex items-center select-none">
      {/* Interactive Mascot Bee SVG */}
      <div
        onClick={handleClickBee}
        className="w-8 h-8 rounded-full bg-amber-400 hover:bg-amber-300 shadow-sm flex items-center justify-center cursor-pointer transform hover:scale-115 active:scale-95 transition-all duration-200"
        title="원비 마스코트 클릭! (꿀팁 &amp; 축하)"
      >
        <span className="text-base" role="img" aria-label="bee">
          {beeMood === 'love' ? '🐝💛' : '🐝'}
        </span>
      </div>

      {/* Floating Mascot Speech Bubble */}
      {showSpeech && (
        <div className="absolute left-10 bottom-0 z-50 w-64 p-3 bg-stone-900/95 text-stone-100 rounded-2xl shadow-2xl border border-amber-500/40 text-xs animate-in fade-in slide-in-from-left-2 duration-150">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-stone-800 text-[11px] text-amber-400 font-bold">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              원비의 생산성 꿀팁
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeech(false);
              }}
              className="text-stone-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="leading-relaxed text-stone-200 text-[11px]">
            {BEE_TIPS[tipIndex]}
          </p>
          <div className="mt-2 text-right">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setTipIndex((prev) => (prev + 1) % BEE_TIPS.length);
              }}
              className="text-[10px] text-amber-400 hover:underline font-semibold"
            >
              다음 꿀팁 보기 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
