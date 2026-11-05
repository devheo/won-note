import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WonNoteDocument } from '../types';
import { currentNoteContent, replaceNoteContent } from '../services/noteEditorBridge';
import { fetchBridge } from '../services/httpBridge';
import type { PdfImportMode, PdfImportProgress, openPdfImport } from '../utils/pdfConversion';
import { discardNoteImages } from '../utils/noteImageAssets';

type PdfSession = Awaited<ReturnType<typeof openPdfImport>>;

export type NoteImportFormat = 'ppt' | 'pptx' | 'pdf';
export type NoteExportFormat = 'pptx' | 'pdf';
export function useNoteTransfer(documents: Record<string, WonNoteDocument>, onUpdate?: (doc: WonNoteDocument) => void) {
  const latest = useRef({ documents, onUpdate });
  latest.current = { documents, onUpdate };
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<{ id: string; format: NoteImportFormat } | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [pdfPending, setPdfPending] = useState<{ session: PdfSession; id: string; name: string } | null>(null);
  const sessionRef = useRef<PdfSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [pageRange, setPageRange] = useState('');
  const [pdfMode, setPdfMode] = useState<PdfImportMode>('text-images');
  const [pdfRunning, setPdfRunning] = useState(false);
  const pdfRunningRef = useRef(false);
  const [pdfError, setPdfError] = useState('');
  const [progress, setProgress] = useState<PdfImportProgress | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      void sessionRef.current?.close();
    },
    [],
  );
  const start = () => {
    busyRef.current = true;
    setBusy(true);
  };
  const finish = () => {
    busyRef.current = false;
    setBusy(false);
  };
  const getNote = (id: string) => {
    const note = latest.current.documents[id];
    if (!note) throw new Error('대상 노트가 삭제되었거나 존재하지 않습니다.');
    return { ...note, content: currentNoteContent(id, note.content) };
  };
  const chooseImport = (id: string, format: NoteImportFormat) => {
    if (busyRef.current || !input.current) return;
    target.current = { id, format };
    input.current.accept = `.${format}`;
    input.current.value = '';
    input.current.click();
  };
  const commitImport = (
    id: string,
    result: { html: string; pageCount?: number; slideCount?: number; warnings: string[] },
  ) => {
    const note = getNote(id);
    const content = (note.content || '') + (note.content && note.content !== '<p></p>' ? '<hr>' : '') + result.html;
    if (!latest.current.onUpdate) throw new Error('노트 저장 기능을 사용할 수 없습니다.');
    replaceNoteContent(note.id, content);
    latest.current.onUpdate({ ...note, content, updatedAt: Date.now() });
    const count = result.pageCount !== undefined ? `${result.pageCount}페이지` : `${result.slideCount}개 슬라이드`;
    setNotice({ text: `“${note.title}” 끝에 ${count}를 추가했습니다. ${result.warnings.join(' ')}` });
  };
  const load = async (file?: File) => {
    const selected = target.current;
    target.current = null;
    if (!file || !selected || busyRef.current) return;
    start();
    setNotice({ text: `${file.name} 가져오는 중…` });
    let waitingForPdf = false;
    try {
      if (!file.name.toLowerCase().endsWith(`.${selected.format}`))
        throw new Error(`.${selected.format} 파일을 선택해주세요.`);
      const limit = selected.format === 'pdf' ? 250 : 50;
      if (file.size > limit * 1024 * 1024) throw new Error(`${limit}MB 이하의 파일을 선택해주세요.`);
      getNote(selected.id);
      abortRef.current = new AbortController();
      let data = await file.arrayBuffer();
      if (selected.format === 'pdf') {
        const { openPdfImport } = await import('../utils/pdfConversion');
        const session = await openPdfImport(data, abortRef.current.signal);
        sessionRef.current = session;
        setPageRange('');
        setPdfMode('text-images');
        setPdfError('');
        setProgress(null);
        setPdfPending({ session, id: selected.id, name: file.name });
        waitingForPdf = true;
        setNotice(null);
        return;
      }
      if (selected.format === 'ppt') {
        const response = await fetchBridge('/api/convert/ppt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: data,
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'PPT 변환 서버에 연결할 수 없습니다.');
        }
        data = await response.arrayBuffer();
      }
      const result = await (await import('../utils/pptxConversion')).importPptx(data);
      commitImport(selected.id, result);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : '가져오기에 실패했습니다.', error: true });
    } finally {
      if (!waitingForPdf) finish();
    }
  };
  const cancelPdf = async () => {
    abortRef.current?.abort();
    if (pdfRunningRef.current) return;
    await sessionRef.current?.close();
    sessionRef.current = null;
    setPdfPending(null);
    finish();
    setNotice({ text: 'PDF 가져오기를 취소했습니다. 기존 노트는 유지했습니다.' });
  };
  const runPdf = async () => {
    if (!pdfPending || pdfRunningRef.current) return;
    pdfRunningRef.current = true;
    const { parsePdfPages } = await import('../utils/pdfConversion');
    try {
      parsePdfPages(pageRange, pdfPending.session.pageCount);
    } catch (error) {
      setPdfError((error as Error).message);
      pdfRunningRef.current = false;
      return;
    }
    setPdfRunning(true);
    setPdfError('');
    abortRef.current = new AbortController();
    let assets: string[] = [],
      committed = false;
    try {
      const result = await pdfPending.session.importPages({
        pages: pageRange,
        mode: pdfMode,
        signal: abortRef.current.signal,
        onProgress: setProgress,
      });
      assets = result.assetIds;
      commitImport(pdfPending.id, result);
      committed = true;
    } catch (error) {
      if (!committed && assets.length) await discardNoteImages(assets);
      setNotice({
        text:
          error instanceof Error && error.name === 'AbortError'
            ? 'PDF 가져오기를 취소했습니다. 기존 노트는 유지했습니다.'
            : error instanceof Error
              ? error.message
              : 'PDF 가져오기에 실패했습니다.',
        error: !(error instanceof Error && error.name === 'AbortError'),
      });
    } finally {
      await pdfPending.session.close();
      sessionRef.current = null;
      setPdfPending(null);
      pdfRunningRef.current = false;
      setPdfRunning(false);
      setProgress(null);
      finish();
    }
  };
  const exportNote = async (id: string, format: NoteExportFormat) => {
    if (busyRef.current) return;
    start();
    setNotice({ text: `${format.toUpperCase()} 내보내는 중…` });
    try {
      const note = getNote(id);
      const filename = (note.title || 'WON 노트').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
      let warnings: string[] = [];
      if (format === 'pptx') {
        const result = await (await import('../utils/pptxConversion')).createPptx(note.content, note.title);
        warnings = result.warnings;
        await result.pptx.writeFile({ fileName: `${filename}.pptx`, compression: true });
      } else {
        const pdf = await (await import('../utils/pdfConversion')).createPdf(note.content, note.title);
        pdf.save(`${filename}.pdf`);
      }
      setNotice({ text: `“${note.title}” ${format.toUpperCase()} 내보내기를 완료했습니다. ${warnings.join(' ')}` });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : '내보내기에 실패했습니다.', error: true });
    } finally {
      finish();
    }
  };
  const transferUi = (
    <>
      <input
        ref={input}
        type="file"
        aria-label="노트 가져오기 파일 선택"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          void load(file);
        }}
      />
      {pdfPending && createPortal(
        <div className="fixed inset-0 z-[11001] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-import-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl text-sm text-stone-900 dark:bg-stone-900 dark:text-stone-100"
          >
            <h2 id="pdf-import-title" className="text-lg font-bold">
              PDF 가져오기
            </h2>
            <p className="mt-2 break-all">
              {pdfPending.name} · 전체 {pdfPending.session.pageCount}페이지
            </p>
            <label className="mt-4 block">
              가져올 페이지
              <input
                autoFocus
                value={pageRange}
                disabled={pdfRunning}
                onChange={(event) => setPageRange(event.target.value)}
                placeholder="전체 페이지 (예: 1-10, 15, 30-60)"
                className="mt-1 w-full rounded border border-stone-300 bg-transparent p-2"
              />
            </label>
            <p className="mt-1 text-xs text-stone-500">비워두면 전체 페이지를 가져옵니다. 페이지 수 제한은 없습니다.</p>
            <label className="mt-4 block">
              가져올 내용
              <select
                value={pdfMode}
                disabled={pdfRunning}
                onChange={(event) => setPdfMode(event.target.value as PdfImportMode)}
                className="mt-1 w-full rounded border border-stone-300 bg-white p-2 text-stone-900"
              >
                <option value="text-images">텍스트 + 원본 이미지</option>
                <option value="text">텍스트만 (대용량 문서에 권장)</option>
                <option value="images">원본 이미지만</option>
              </select>
            </label>
            <p className="mt-2 text-xs text-stone-500">
              한 페이지씩 처리합니다. 이미지는 본문과 분리해 저장하며 화면에 가까워지면 불러옵니다. 스캔 문서는 OCR 없이
              이미지만 가져올 수 있습니다.
            </p>
            {pdfError && (
              <p role="alert" className="mt-2 text-red-600">
                {pdfError}
              </p>
            )}
            {pdfRunning && (
              <div className="mt-4" role="status">
                <p>
                  {progress
                    ? `${progress.completed} / ${progress.total}페이지 처리 완료 · 원본 ${progress.page}페이지`
                    : '페이지 처리 준비 중…'}
                </p>
                <progress
                  aria-label="PDF 가져오기 진행률"
                  className="mt-2 w-full"
                  value={progress?.completed || 0}
                  max={progress?.total || 1}
                />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => void cancelPdf()} className="rounded border px-4 py-2">
                {pdfRunning ? '가져오기 취소' : '취소'}
              </button>
              <button
                type="button"
                disabled={pdfRunning}
                onClick={() => void runPdf()}
                className="rounded bg-amber-500 px-4 py-2 font-bold text-stone-950 disabled:opacity-50"
              >
                가져오기 시작
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {notice && (
        <div
          role={notice.error ? 'alert' : 'status'}
          className={`fixed bottom-10 right-4 z-[11000] max-w-md rounded-xl border bg-white p-4 text-xs shadow-xl dark:bg-stone-900 ${notice.error ? 'border-red-400 text-red-700' : 'border-amber-300 text-stone-800 dark:text-stone-100'}`}
        >
          {notice.text}
          {!busy && (
            <button type="button" aria-label="알림 닫기" className="ml-3 underline" onClick={() => setNotice(null)}>
              닫기
            </button>
          )}
        </div>
      )}
    </>
  );
  return { chooseImport, exportNote, busy, transferUi };
}
