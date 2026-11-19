import React, { useEffect, useState } from 'react';
import { Indent, ListOrdered, Outdent, Shapes, Type, Grid3X3, ChevronDown, ChevronRight } from 'lucide-react';
import { CellSelection } from '@tiptap/pm/tables';
import { createPortal } from 'react-dom';

interface ListToolbarControlsProps {
  editor: any;
  onIndent?: () => void;
  onOutdent?: () => void;
}

const listSelectClass = 'h-7 max-w-28 rounded-lg border border-stone-200 bg-white px-1.5 text-[11px] text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200';
const toolbarButtonClass = 'inline-flex h-7 items-center gap-1 rounded-lg border border-stone-200 px-1.5 text-[11px] text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800';

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
    <label className="inline-flex h-7 items-center gap-0.5 rounded-lg border border-stone-200 bg-white px-1.5 text-[10px] text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300" title="글자 크기 (픽셀)">
      <input
        type="number"
        min={8}
        max={160}
        step={1}
        aria-label="글꼴 크기 픽셀"
        value={size}
        onMouseDown={event => event.stopPropagation()}
        onChange={event => {
          const val = event.target.value;
          setSize(val);
          const num = Number(val);
          if (Number.isFinite(num) && num >= 8 && num <= 160) {
            onApply(`${num}px`);
          }
        }}
        onBlur={() => onApply(`${clampPixels(Number(size), 16, 8, 160)}px`)}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="w-8 bg-transparent text-right text-[11px] outline-none"
      />px
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
      <select aria-label="글머리 기호 모양" title="글머리 기호 모양을 선택하고 목록에 적용" className={listSelectClass} value={editor.getAttributes('bulletList').listMarker || 'disc'} onMouseDown={event => event.stopPropagation()} onChange={event => applyBullet(event.target.value)}>
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

export function getActiveTableBorderStyle(editor: any): string {
  if (!editor || !editor.isActive('table')) return 'all';
  const { state } = editor;
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'table') {
      return node.attrs?.borderStyle || 'all';
    }
  }
  let found = 'all';
  state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'table' && pos <= $from.pos && pos + node.nodeSize >= $from.pos) {
      found = node.attrs?.borderStyle || 'all';
    }
  });
  return found;
}

export function setTableBorder(editor: any, style: string) {
  if (!editor || !editor.isActive('table')) return;
  const { state, view } = editor;
  const { $from } = state.selection;
  let tablePos = -1;
  let tableNode = null;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'table') {
      tablePos = $from.before(d);
      tableNode = node;
      break;
    }
  }
  if (tablePos === -1 || !tableNode) {
    state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'table' && tablePos === -1) {
        if (pos <= $from.pos && pos + node.nodeSize >= $from.pos) {
          tablePos = pos;
          tableNode = node;
        }
      }
    });
  }

  if (tablePos !== -1 && tableNode) {
    const currentAttrs = tableNode.attrs || {};
    const newAttrs = {
      ...currentAttrs,
      borderStyle: style,
    };
    const tr = state.tr.setNodeMarkup(tablePos, undefined, newAttrs);
    view.dispatch(tr);
  }
}

export function TableBorderToolbarControl({ editor }: { editor: any }) {
  if (!editor?.isActive('table')) return null;
  return <ExcelTableBorderControl editor={editor} />;
}

function ExcelTableBorderControl({ editor }: { editor: any }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [color, setColor] = useState('#475569');
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!buttonRef.current?.contains(event.target as Node) && !(event.target as HTMLElement).closest('[data-table-border-menu]')) setOpen(false);
    };
    const reposition = () => setAnchor(buttonRef.current?.getBoundingClientRect() || null);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    reposition();
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open]);

  const apply = (kind: string) => {
    const { state, view } = editor;
    const selection = state.selection;
    const cells: Array<{ pos: number; node: any; row: number; col: number }> = [];
    if (selection instanceof CellSelection) {
      selection.forEachCell((node: any, pos: number) => cells.push({ pos, node, row: 0, col: 0 }));
      const rows = new Map<number, number>();
      for (const cell of cells) {
        const $cell = state.doc.resolve(cell.pos);
        const rowPos = $cell.before($cell.depth - 1);
        if (!rows.has(rowPos)) rows.set(rowPos, rows.size);
        cell.row = rows.get(rowPos)!;
        const rowNode = $cell.node($cell.depth - 1);
        let col = 0;
        for (let i = 0; i < rowNode.childCount; i++) {
          const childPos = rowPos + 1 + rowNode.offsetAt(i);
          if (childPos === cell.pos) { col = i; break; }
        }
        cell.col = col;
      }
    } else {
      const { $from } = selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          cells.push({ pos: $from.before(depth), node, row: 0, col: 0 });
          break;
        }
      }
    }
    if (!cells.length) return;
    const maxRow = Math.max(...cells.map(cell => cell.row));
    const maxCol = Math.max(...cells.map(cell => cell.col));
    const tr = state.tr;
    for (const cell of cells) {
      const borders: Record<string, boolean> = kind === 'outer'
        ? { top: cell.row === 0, right: cell.col === maxCol, bottom: cell.row === maxRow, left: cell.col === 0 }
        : kind === 'inside'
          ? { top: cell.row > 0, right: cell.col < maxCol, bottom: cell.row < maxRow, left: cell.col > 0 }
          : { top: kind === 'all' || kind === 'thick' || kind === 'top', right: kind === 'all' || kind === 'thick' || kind === 'right', bottom: kind === 'all' || kind === 'thick' || kind === 'bottom', left: kind === 'all' || kind === 'thick' || kind === 'left' };
      if (kind === 'none') Object.keys(borders).forEach(side => borders[side] = false);
      tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, cellBorder: kind === 'none' ? 'none' : kind, cellBorderColor: color, cellBorders: borders });
    }
        view.dispatch(tr);
    view.focus();
    setOpen(false);
  };
  const options = [
    ['all', '모든 테두리', '▦'], ['outer', '바깥쪽 테두리', '▣'], ['inside', '안쪽 테두리', '▤'],
    ['bottom', '아래쪽 테두리', '▁'], ['top', '위쪽 테두리', '▔'], ['left', '왼쪽 테두리', '▏'], ['right', '오른쪽 테두리', '▕'],
    ['thick', '굵은 바깥쪽 테두리', '▣'], ['none', '테두리 없음', '□'],
  ];
  return (
    <>
      <button ref={buttonRef} type="button" onMouseDown={event => event.preventDefault()} onClick={() => setOpen(value => !value)} className={`${toolbarButtonClass} bg-white dark:bg-stone-800`} aria-label="셀 테두리" title="선택한 셀의 테두리"><Grid3X3 size={14}/><span>테두리</span><ChevronDown size={12}/></button>
      {open && anchor && createPortal(<div data-table-border-menu className="fixed z-[10000] w-52 rounded-xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-700 dark:bg-stone-900" style={{ left: Math.min(anchor.left, window.innerWidth - 220), top: anchor.bottom + 5 }}>
        <div className="grid grid-cols-1 gap-0.5">{options.map(([kind, label, icon]) => <button key={kind} type="button" onMouseDown={event => event.preventDefault()} onClick={() => apply(kind)} className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-xs text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"><span className="w-5 text-center text-base">{icon}</span>{label}</button>)}</div>
        <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2 text-xs text-stone-600 dark:border-stone-700 dark:text-stone-300"><label htmlFor="table-border-color">선 색</label><input id="table-border-color" aria-label="테두리 색" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent"/></div>
      </div>, document.body)}
    </>
  );
}

export function CodeHighlightInserter({ editor }: { editor: any }) {
  if (!editor) return null;
  return (
    <select
      aria-label="코드 하이라이트 언어 삽입"
      title="선택한 언어로 하이라이트된 코드 블록 삽입"
      defaultValue=""
      onMouseDown={event => event.stopPropagation()}
      onChange={event => {
        if (event.target.value) {
          editor.chain().focus().toggleCodeBlock({ language: event.target.value }).run();
          event.target.value = '';
        }
      }}
      className="h-7 max-w-36 rounded-lg border border-stone-200 bg-white px-2 text-[11px] font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 cursor-pointer hover:border-amber-400"
    >
      <option value="" disabled>💻 코드 하이라이트 삽입</option>
      <option value="auto">⚡ 자동 감지</option>
      <option value="java">☕ Java / Spring</option>
      <option value="sql">🗄️ SQL / Pro*C</option>
      <option value="javascript">⚡ JavaScript</option>
      <option value="typescript">🟦 TypeScript</option>
      <option value="python">🐍 Python</option>
      <option value="c">⚙️ C / C++</option>
      <option value="bash">🐧 Bash / Shell</option>
      <option value="json">📄 JSON / YAML</option>
      <option value="html">🌐 HTML / XML</option>
      <option value="css">🎨 CSS</option>
    </select>
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
