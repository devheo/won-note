import React, { useEffect, useState } from 'react';
import { Indent, ListOrdered, Outdent, Shapes, Type } from 'lucide-react';

interface ListToolbarControlsProps {
  editor: any;
  onIndent?: () => void;
  onOutdent?: () => void;
}

const listSelectClass = 'h-8 max-w-32 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200';
const toolbarButtonClass = 'inline-flex h-8 items-center gap-1 rounded-lg border border-stone-200 px-2 text-xs text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800';

function clampPixels(value: number, fallback: number, min = 8, max = 1600) {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : fallback)));
}

export function FontSizePixelControl({ editor, onApply }: { editor: any; onApply: (size: string) => void }) {
  const [size, setSize] = useState('16');
  useEffect(() => {
    if (!editor) return;
    const sync = () => setSize(String(parseInt(editor.getAttributes('textStyle').fontSize, 10) || 16));
    sync();
    editor.on('selectionUpdate', sync);
    editor.on('transaction', sync);
    return () => { editor.off('selectionUpdate', sync); editor.off('transaction', sync); };
  }, [editor]);
  return (
    <label className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300" title="글자 크기를 픽셀 단위로 입력">
      글자
      <input type="number" min={8} max={160} step={1} aria-label="글꼴 크기 픽셀" value={size} onMouseDown={event => event.stopPropagation()} onChange={event => setSize(event.target.value)} onBlur={() => onApply(`${clampPixels(Number(size), 16, 8, 160)}px`)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="w-12 bg-transparent text-right text-xs outline-none" />px
    </label>
  );
}

export function ShapeSizeControls({ editor }: { editor: any }) {
  const [size, setSize] = useState({ width: '280', height: '120', fontSize: '16' });
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      if (!editor.isActive('wonbeeShape')) return;
      const attrs = editor.getAttributes('wonbeeShape');
      setSize({ width: String(attrs.width || 280), height: String(attrs.height || 120), fontSize: String(attrs.fontSize || 16) });
    };
    sync();
    editor.on('selectionUpdate', sync);
    editor.on('transaction', sync);
    return () => { editor.off('selectionUpdate', sync); editor.off('transaction', sync); };
  }, [editor]);
  if (!editor?.isActive('wonbeeShape')) return null;
  const apply = (key: 'width' | 'height' | 'fontSize', value: string, fallback: number, max: number) => {
    const pixels = clampPixels(Number(value), fallback, 24, max);
    setSize(current => ({ ...current, [key]: String(pixels) }));
    editor.chain().focus().updateAttributes('wonbeeShape', { [key]: pixels }).run();
  };
  const field = (key: 'width' | 'height' | 'fontSize', label: string, max: number) => (
    <label key={key} className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300" title={`${label}를 픽셀 단위로 입력`}>
      {label}<input type="number" min={24} max={max} step={1} aria-label={`${label} 픽셀`} value={size[key]} onMouseDown={event => event.stopPropagation()} onChange={event => setSize(current => ({ ...current, [key]: event.target.value }))} onBlur={event => apply(key, event.currentTarget.value, key === 'width' ? 280 : key === 'height' ? 120 : 16, max)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="w-14 bg-transparent text-right text-xs outline-none"/>px
    </label>
  );
  return <div className="inline-flex items-center gap-1 border-l border-stone-200 pl-1 dark:border-stone-700">{field('width', '너비', 1600)}{field('height', '높이', 1200)}{field('fontSize', '글자', 160)}</div>;
}

export function ListToolbarControls({ editor, onIndent, onOutdent }: ListToolbarControlsProps) {
  if (!editor) return null;
  const applyBullet = (marker: string) => {
    const chain = editor.chain().focus();
    if (!editor.isActive('bulletList')) chain.toggleBulletList();
    chain.updateAttributes('bulletList', { listMarker: marker || null }).run();
  };
  const applyMultilevel = () => {
    const chain = editor.chain().focus();
    if (!editor.isActive('orderedList')) chain.toggleOrderedList();
    chain.updateAttributes('orderedList', { listMarker: 'outline' }).run();
  };
  return (
    <div className="inline-flex items-center gap-1">
      {onOutdent && <button type="button" className={toolbarButtonClass} title="내어쓰기 / 목록 수준 낮추기" aria-label="내어쓰기" onMouseDown={event => event.preventDefault()} onClick={onOutdent}><Outdent size={15}/></button>}
      {onIndent && <button type="button" className={toolbarButtonClass} title="들여쓰기 / 하위 목록 만들기" aria-label="들여쓰기" onMouseDown={event => event.preventDefault()} onClick={onIndent}><Indent size={15}/></button>}
      <select aria-label="글머리 기호 모양" title="글머리 기호 모양을 선택하고 목록에 적용" className={listSelectClass} value={editor.getAttributes('bulletList').listMarker || 'disc'} onMouseDown={event => event.preventDefault()} onChange={event => applyBullet(event.target.value)}>
        <option value="disc">•  기본 원</option>
        <option value="circle">○  빈 원</option>
        <option value="square">■  사각형</option>
        <option value="check">✓  체크</option>
        <option value="star">★  별</option>
        <option value="dash">–  대시</option>
      </select>
      <button type="button" className={`${toolbarButtonClass} ${editor.isActive('orderedList', { listMarker: 'outline' }) ? 'border-amber-400 bg-amber-100 dark:bg-amber-950' : ''}`} title="다단계 번호 목록 (들여쓰기로 하위 수준 생성)" aria-label="다단계 목록" onMouseDown={event => event.preventDefault()} onClick={applyMultilevel}><ListOrdered size={15}/><span>다단계</span></button>
    </div>
  );
}

export function TableBorderToolbarControl({ editor }: { editor: any }) {
  if (!editor?.isActive('table')) return null;
  return (
    <label className="inline-flex items-center gap-1 text-xs text-stone-500" title="현재 표의 테두리 모양">
      <span>테두리</span>
      <select aria-label="표 테두리" className={listSelectClass} value={editor.getAttributes('table').borderStyle || 'all'} onMouseDown={event => event.preventDefault()} onChange={event => editor.chain().focus().updateAttributes('table', { borderStyle: event.target.value }).run()}>
        <option value="all">모든 테두리</option>
        <option value="outer">바깥 테두리</option>
        <option value="thick">굵은 테두리</option>
        <option value="horizontal">가로 테두리</option>
        <option value="none">테두리 없음</option>
      </select>
    </label>
  );
}

export function InsertShapeControls({ editor }: { editor: any }) {
  if (!editor) return null;
  const insert = (shapeType: string) => {
    const labels: Record<string, string> = {
      rectangle: '도형 텍스트', rounded: '도형 텍스트', ellipse: '도형 텍스트', callout: '도형 텍스트', textbox: '텍스트를 입력하세요',
    };
    const dimensions: Record<string, { width: number; height: number }> = {
      rectangle: { width: 280, height: 120 }, rounded: { width: 280, height: 120 },
      ellipse: { width: 200, height: 150 }, callout: { width: 280, height: 140 },
      textbox: { width: 320, height: 120 },
    };
    editor.chain().focus().insertContent({
      type: 'wonbeeShape',
      attrs: { shapeType, ...(dimensions[shapeType] || dimensions.rectangle), fontSize: 16 },
      content: [{ type: 'text', text: labels[shapeType] || '도형 텍스트' }],
    }).run();
  };
  return (
    <>
      <label className={toolbarButtonClass} title="도형 선택 후 삽입">
        <Shapes size={15}/><span>도형</span>
        <select aria-label="도형 삽입" className="max-w-24 bg-transparent outline-none" defaultValue="" onMouseDown={event => event.stopPropagation()} onChange={event => { if (event.target.value) insert(event.target.value); event.target.value = ''; }}>
          <option value="" disabled>선택</option>
          <option value="rectangle">사각형</option>
          <option value="rounded">둥근 사각형</option>
          <option value="ellipse">타원</option>
          <option value="callout">말풍선</option>
        </select>
      </label>
      <button type="button" className={toolbarButtonClass} title="문서 안에 텍스트 상자 삽입" aria-label="텍스트 상자 삽입" onMouseDown={event => event.preventDefault()} onClick={() => insert('textbox')}><Type size={15}/><span>텍스트 상자</span></button>
    </>
  );
}
