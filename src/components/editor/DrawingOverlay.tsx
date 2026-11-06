import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import { dispatchDrawingChange, DrawingPoint, DrawingStroke } from './DrawingExtension';

type Tool = 'select' | 'pen' | 'highlighter' | 'eraser';
const legacyDrawingReferenceHeight = () => typeof window === 'undefined' ? 800 : Math.max(400, window.innerHeight - 220);
type Gesture =
  | { kind: 'draw'; stroke: DrawingStroke; preview: SVGPathElement; position: number; coordinateHeight: number }
  | { kind: 'move'; strokeIndex: number; stroke: DrawingStroke; position: number; start: DrawingPoint; bounds: DOMRect; coordinateHeight: number }
  | { kind: 'erase'; points: DrawingPoint[]; position: number; strokes: DrawingStroke[]; bounds: DOMRect; coordinateHeight: number; scaleY: number };

const TOOL_CURSORS: Record<Exclude<Tool, 'select'>, string> = {
  pen: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M4 23l3-7L19 4l5 5L12 21z" fill="#f8fafc" stroke="#1e293b" stroke-width="1.8"/><path d="M4 23l3-7 5 5z" fill="#334155"/><path d="M7 16l5 5" stroke="#1e293b" stroke-width="1.4"/></svg>')}") 3 23, crosshair`,
  highlighter: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><path d="M6 20L19 5l6 5-13 15H6z" fill="#fde047" stroke="#713f12" stroke-width="1.8"/><path d="M6 20h6l-1 5H6z" fill="#f59e0b" stroke="#713f12" stroke-width="1.4"/><path d="M18 6l6 5" stroke="#fff7ae" stroke-width="2"/></svg>')}") 4 24, crosshair`,
  eraser: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M4 17L15 5a2 2 0 013 0l6 6a2 2 0 010 3l-8 9H9z" fill="#f9a8d4" stroke="#831843" stroke-width="1.8"/><path d="M10 23l7-8" stroke="#831843" stroke-width="1.6"/><path d="M5 17l7 6" stroke="#fff" stroke-width="1.5"/></svg>')}") 4 22, cell`,
};

function drawingLayer(editor: Editor) {
  let result: { position: number; node: any } | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'drawingLayer') { result = { position, node }; return false; }
    return true;
  });
  return result;
}

function distanceToSegment(point: DrawingPoint, start: DrawingPoint, end: DrawingPoint, bounds: DOMRect, coordinateHeight: number, scaleY: number) {
  const px = point.x * bounds.width; const py = point.y * coordinateHeight * scaleY;
  const ax = start.x * bounds.width; const ay = start.y * coordinateHeight * scaleY;
  const bx = end.x * bounds.width; const by = end.y * coordinateHeight * scaleY;
  const dx = bx - ax; const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(px - ax, py - ay);
  const ratio = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy));
}

function distanceToPath(point: DrawingPoint, path: DrawingPoint[], bounds: DOMRect, coordinateHeight: number, scaleY: number) {
  if (!path.length) return Infinity;
  if (path.length === 1) return distanceToSegment(point, path[0], path[0], bounds, coordinateHeight, scaleY);
  let min = Infinity;
  for (let index = 1; index < path.length; index++) min = Math.min(min, distanceToSegment(point, path[index - 1], path[index], bounds, coordinateHeight, scaleY));
  return min;
}

/** Split only the portions reached by the eraser, leaving the rest of each stroke intact. */
function eraseStroke(stroke: DrawingStroke, eraserPath: DrawingPoint[], bounds: DOMRect, coordinateHeight: number, scaleY: number): DrawingStroke[] {
  const radius = 11 + stroke.width / 2;
  const isErased = (point: DrawingPoint) => distanceToPath(point, eraserPath, bounds, coordinateHeight, scaleY) <= radius;
  if (stroke.points.length === 1) return isErased(stroke.points[0]) ? [] : [stroke];

  const samples: Array<{ point: DrawingPoint; erased: boolean }> = [];
  for (let segment = 1; segment < stroke.points.length; segment++) {
    const start = stroke.points[segment - 1]; const end = stroke.points[segment];
    const segmentLength = Math.hypot((end.x - start.x) * bounds.width, (end.y - start.y) * coordinateHeight * scaleY);
    const count = Math.max(1, Math.ceil(segmentLength / 4));
    for (let step = segment === 1 ? 0 : 1; step <= count; step++) {
      const ratio = step / count;
      const point = { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
      samples.push({ point, erased: isErased(point) });
    }
  }
  if (!samples.some(sample => sample.erased)) return [stroke];

  const fragments: DrawingStroke[] = [];
  let current: DrawingPoint[] = [];
  const finishFragment = () => {
    if (current.length >= 2) fragments.push({ ...stroke, points: current });
    current = [];
  };
  for (const sample of samples) {
    if (sample.erased) finishFragment();
    else {
      const previous = current[current.length - 1];
      if (!previous || Math.hypot((previous.x - sample.point.x) * bounds.width, (previous.y - sample.point.y) * coordinateHeight * scaleY) > 0.5) current.push(sample.point);
    }
  }
  finishFragment();
  return fragments;
}

function eraseFromDrawing(strokes: DrawingStroke[], eraserPath: DrawingPoint[], bounds: DOMRect, coordinateHeight: number, scaleY: number) {
  let changed = false;
  const next = strokes.flatMap(stroke => {
    const fragments = eraseStroke(stroke, eraserPath, bounds, coordinateHeight, scaleY);
    if (fragments.length !== 1 || fragments[0] !== stroke) changed = true;
    return fragments;
  });
  return changed ? next : null;
}

export const DrawingOverlay: React.FC<{
  editor: Editor;
  tool: Tool;
  color: string;
  width: number;
  onFinish: () => void;
}> = ({ editor, tool, color, width, onFinish }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [selectedStrokeIndex, setSelectedStrokeIndex] = useState<number | null>(null);
  const selectedStrokeIndexRef = useRef<number | null>(null);
  const [eraserPointer, setEraserPointer] = useState<DrawingPoint | null>(null);
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });
  const [overlayHeight, setOverlayHeight] = useState(1);
  const [, refresh] = useReducer(value => value + 1, 0);
  const layer = drawingLayer(editor);
  const strokes = (layer?.node.attrs.strokes || []) as DrawingStroke[];
  const getCoordinateHeight = (currentHeight: number) => Number(layer?.node.attrs.coordinateHeight)
    || (strokes.length ? legacyDrawingReferenceHeight() : currentHeight)
    || 1;

  const selectStroke = (index: number | null) => {
    selectedStrokeIndexRef.current = index;
    setSelectedStrokeIndex(index);
  };

  useEffect(() => {
    const update = () => refresh();
    editor.on('transaction', update);
    return () => { editor.off('transaction', update); };
  }, [editor]);

  useEffect(() => {
    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!svg || !container || typeof ResizeObserver === 'undefined') return;
    const updateHeight = () => {
      const height = container.clientHeight || svg.clientHeight;
      if (height > 0) setOverlayHeight(previous => Math.abs(previous - height) > 0.5 ? height : previous);
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);
    updateHeight();
    return () => observer.disconnect();
  }, [editor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const selectedIndex = selectedStrokeIndexRef.current;
      if (selectedIndex === null) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [role="textbox"], [contenteditable="true"]')
        && !target.closest('.ProseMirror')) return;
      // The selected stroke is the active object, so consume deletion before
      // ProseMirror can delete the text selection that preceded the click.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const currentLayer = drawingLayer(editor);
      if (!currentLayer) { selectStroke(null); return; }
      const currentStrokes = (currentLayer.node.attrs.strokes || []) as DrawingStroke[];
      if (selectedIndex < 0 || selectedIndex >= currentStrokes.length) { selectStroke(null); return; }
      dispatchDrawingChange(editor, currentLayer.position, { strokes: currentStrokes.filter((_, index) => index !== selectedIndex) });
      selectStroke(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [editor]);

  useEffect(() => {
    if (selectedStrokeIndex !== null && selectedStrokeIndex >= strokes.length) selectStroke(null);
  }, [selectedStrokeIndex, strokes.length]);

  const readPoint = (event: React.PointerEvent<SVGSVGElement>): { point: DrawingPoint; bounds: DOMRect; coordinateHeight: number; scaleY: number } => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const logicalHeight = event.currentTarget.clientHeight || overlayHeight || 1;
    const scaleY = bounds.height / logicalHeight || 1;
    const coordinateHeight = getCoordinateHeight(logicalHeight);
    const logicalY = (event.clientY - bounds.top) / scaleY;
    return { point: { x: (event.clientX - bounds.left) / bounds.width, y: logicalY / coordinateHeight }, bounds, coordinateHeight, scaleY };
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const { point, bounds, coordinateHeight, scaleY } = readPoint(event);
    const hitStrokeIndex = (event.target as SVGElement).closest<SVGElement>('[data-stroke-index]')?.dataset.strokeIndex;

    if (tool === 'select') {
      if (hitStrokeIndex !== undefined && layer) {
        event.preventDefault();
        svg.setPointerCapture(event.pointerId);
        selectStroke(Number(hitStrokeIndex));
        gestureRef.current = { kind: 'move', strokeIndex: Number(hitStrokeIndex), stroke: strokes[Number(hitStrokeIndex)], position: layer.position, start: point, bounds, coordinateHeight };
      } else selectStroke(null);
      return;
    }

    event.preventDefault();
    selectStroke(null);
    if (!layer) return;
    if (tool === 'eraser') {
      svg.setPointerCapture(event.pointerId);
      setEraserPointer(point);
      gestureRef.current = { kind: 'erase', points: [point], position: layer.position, strokes: strokes.slice(), bounds, coordinateHeight, scaleY };
      return;
    }

    svg.setPointerCapture(event.pointerId);
    const stroke: DrawingStroke = {
      points: [point],
      color,
      width: tool === 'highlighter' ? Math.max(4, width * 3) : width,
      tool,
    };
    const preview = window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
    preview.setAttribute('fill', 'none');
    preview.setAttribute('stroke', stroke.color);
    preview.setAttribute('stroke-width', String(stroke.width));
    preview.setAttribute('stroke-linecap', 'round');
    preview.setAttribute('stroke-linejoin', 'round');
    preview.setAttribute('vector-effect', 'non-scaling-stroke');
    if (tool === 'highlighter') preview.setAttribute('opacity', '0.3');
    preview.setAttribute('d', `M ${point.x * 1000} ${point.y * coordinateHeight}`);
    svg.appendChild(preview);
    gestureRef.current = { kind: 'draw', stroke, preview, position: layer.position, coordinateHeight };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const { point } = readPoint(event);
    if (gesture.kind === 'draw') {
      gesture.stroke.points.push(point);
      gesture.preview.setAttribute('d', gesture.stroke.points.map((p, index) => `${index ? 'L' : 'M'} ${p.x * 1000} ${p.y * gesture.coordinateHeight}`).join(' '));
    } else if (gesture.kind === 'move') {
      const dx = (point.x - gesture.start.x) * gesture.bounds.width;
      const dy = (point.y - gesture.start.y) * gesture.coordinateHeight;
      setMoveOffset({ x: dx, y: dy });
    } else { gesture.points.push(point); setEraserPointer(point); }
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    if (gesture.kind === 'draw') {
      const currentLayer = drawingLayer(editor);
      if (currentLayer) dispatchDrawingChange(editor, currentLayer.position, {
        strokes: [...(currentLayer.node.attrs.strokes || []), gesture.stroke],
        coordinateHeight: Number(currentLayer.node.attrs.coordinateHeight) || gesture.coordinateHeight,
      });
    } else if (gesture.kind === 'move') {
      const dx = moveOffset.x / gesture.bounds.width;
      const dy = moveOffset.y / gesture.coordinateHeight;
      const movedStroke = { ...gesture.stroke, points: gesture.stroke.points.map(point => ({ x: point.x + dx, y: point.y + dy })) };
      const current = drawingLayer(editor);
      const moved = (current?.node.attrs.strokes || []) as DrawingStroke[];
      if (moved[gesture.strokeIndex]) {
        const next = moved.slice(); next[gesture.strokeIndex] = movedStroke;
        dispatchDrawingChange(editor, gesture.position, { strokes: next });
      }
      setMoveOffset({ x: 0, y: 0 });
    } else {
      const updated = eraseFromDrawing(gesture.strokes, gesture.points, gesture.bounds, gesture.coordinateHeight, gesture.scaleY);
      if (updated) dispatchDrawingChange(editor, gesture.position, { strokes: updated });
      setEraserPointer(null);
    }
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  };

  const onContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'select') return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    onFinish();
  };

  const cursor = tool === 'select'
    ? (gestureRef.current?.kind === 'move' ? 'grabbing' : selectedStrokeIndex !== null ? 'grab' : 'default')
    : TOOL_CURSORS[tool];

  return <svg ref={svgRef} viewBox={`0 0 1000 ${Math.max(1, overlayHeight)}`} preserveAspectRatio="none" className="absolute inset-0 z-20 h-full w-full overflow-visible" style={{ pointerEvents: tool === 'select' ? 'none' : 'auto', touchAction: 'none', cursor }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onContextMenu={onContextMenu}>
    {strokes.map((stroke, index) => {
      const isSelected = selectedStrokeIndex === index;
      const isMoving = gestureRef.current?.kind === 'move' && gestureRef.current.strokeIndex === index;
      const coordinateHeight = getCoordinateHeight(overlayHeight);
      const moveBoundsWidth = gestureRef.current?.kind === 'move' ? gestureRef.current.bounds.width : svgRef.current?.getBoundingClientRect().width || 1;
      const transform = isMoving ? `translate(${moveOffset.x * 1000 / moveBoundsWidth} ${moveOffset.y})` : undefined;
      const path = stroke.points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x * 1000} ${point.y * coordinateHeight}`).join(' ');
      return <g key={index} transform={transform}>
        {isSelected && <path d={path} fill="none" stroke="#6366f1" strokeWidth={stroke.width + 6} strokeLinecap="round" strokeLinejoin="round" opacity="0.35" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
        <path data-stroke-index={index} d={path} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.tool === 'highlighter' ? 0.3 : 1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: tool === 'select' ? 'stroke' : 'none', cursor: isSelected ? 'grab' : 'pointer' }} />
      </g>;
    })}
    {tool === 'eraser' && eraserPointer && <ellipse cx={eraserPointer.x * 1000} cy={eraserPointer.y * getCoordinateHeight(overlayHeight)} rx={11 * 1000 / (svgRef.current?.getBoundingClientRect().width || 1)} ry={11 / ((svgRef.current?.getBoundingClientRect().height || overlayHeight) / (svgRef.current?.clientHeight || overlayHeight || 1))} fill="rgba(236,72,153,0.12)" stroke="#db2777" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
    {tool !== 'select' && <rect width="1000" height="1000" fill="transparent" pointerEvents="all" />}
  </svg>;
};
