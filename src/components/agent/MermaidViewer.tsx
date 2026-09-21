import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Copy, Download, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Sparkles, Check } from 'lucide-react';

interface MermaidViewerProps {
  code: string;
  onInsertToEditor?: (mermaidCode: string) => void;
  editable?: boolean;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({
  code,
  onInsertToEditor,
  editable = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentCode, setCurrentCode] = useState(code);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCurrentCode(code);
  }, [code]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
      fontFamily: 'inherit',
    });

    let isMounted = true;
    const renderDiagram = async () => {
      if (!currentCode.trim()) {
        setSvgContent('');
        setError(null);
        return;
      }

      try {
        const id = `mermaid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const { svg } = await mermaid.render(id, currentCode.trim());
        if (isMounted) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || '다이어그램 문법을 파싱할 수 없습니다.');
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [currentCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagram_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col border border-stone-200 dark:border-[#333] rounded-2xl overflow-hidden bg-white dark:bg-[#1a1a1a]">
      {/* Top action toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 dark:bg-[#222] border-b border-stone-200 dark:border-[#2a2a2a] text-xs">
        <div className="flex items-center gap-2 font-bold text-stone-700 dark:text-stone-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Mermaid.js 다이어그램 뷰어</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Zoom controls */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
            className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-[#333] text-stone-600 dark:text-stone-300"
            title="축소"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-stone-500">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
            className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-[#333] text-stone-600 dark:text-stone-300"
            title="확대"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-[#333] text-stone-600 dark:text-stone-300"
            title="원래 크기"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-stone-300 dark:bg-[#333] mx-1" />

          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-[#3a3a3a] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 font-semibold flex items-center gap-1"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '복사됨' : '코드 복사'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadSvg}
            className="px-2.5 py-1 rounded-lg border border-stone-300 dark:border-[#3a3a3a] hover:bg-stone-200 dark:hover:bg-[#333] text-stone-700 dark:text-stone-300 font-semibold flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>SVG 저장</span>
          </button>

          {onInsertToEditor && (
            <button
              type="button"
              onClick={() => onInsertToEditor(currentCode)}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold flex items-center gap-1 shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>에디터 삽입</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas & Editor Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-[#2a2a2a] min-h-[350px]">
        {/* Render Canvas */}
        <div className="p-6 flex items-center justify-center overflow-auto bg-[#fafafa] dark:bg-[#141414] min-h-[300px]">
          {error ? (
            <div className="flex items-start gap-2 p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-xl text-xs max-w-md">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">다이어그램 렌더링 오류</p>
                <p className="mt-1 font-mono">{error}</p>
              </div>
            </div>
          ) : svgContent ? (
            <div
              ref={containerRef}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
              className="max-w-full"
            />
          ) : (
            <span className="text-xs text-stone-400">다이어그램을 생성 중이거나 코드가 비어 있습니다.</span>
          )}
        </div>

        {/* Code Editor */}
        {editable && (
          <div className="flex flex-col bg-[#1e1e1e] text-stone-200">
            <div className="px-3 py-1.5 bg-[#252525] text-[11px] font-mono text-stone-400 border-b border-[#333]">
              Mermaid Source Code (실시간 수정 가능)
            </div>
            <textarea
              value={currentCode}
              onChange={(e) => setCurrentCode(e.target.value)}
              className="flex-1 p-4 bg-transparent font-mono text-xs text-amber-200 resize-none outline-none leading-relaxed"
              rows={12}
              spellCheck={false}
              placeholder="graph TD&#10;    A --> B"
            />
          </div>
        )}
      </div>
    </div>
  );
};
