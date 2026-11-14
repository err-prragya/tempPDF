import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  Lock,
} from 'lucide-react';
import type { HighlightRect, PdfDocumentRecord } from '../types/pdf';
import { parsePdfBytes, type LoadedPdfProxy } from '../utils/pdfLoader';
import { PdfPageCanvas } from './PdfPageCanvas';

interface LandscapeReaderProps {
  documentRecord: PdfDocumentRecord;
  pdfBytes: Uint8Array;
  onExit: () => void;
  onToggleGreyscale: (greyscale: boolean) => void;
  onChangeOpacity: (opacity: number) => void;
  onSelectVariant: (index: number) => void;
  onCreateVariant: () => void;
  onDuplicateVariant: () => void;
  onDeleteVariant: (index: number) => void;
  onAddHighlight: (hl: HighlightRect) => void;
  onRemoveHighlight: (hlId: string) => void;
}

export const LandscapeReader: React.FC<LandscapeReaderProps> = ({
  documentRecord,
  pdfBytes,
  onExit,
  onToggleGreyscale,
  onChangeOpacity,
  onSelectVariant,
  onCreateVariant,
  onDuplicateVariant,
  onDeleteVariant,
  onAddHighlight,
  onRemoveHighlight,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pdfProxy, setPdfProxy] = useState<LoadedPdfProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  });
  const [containerWidth, setContainerWidth] = useState<number>(
    typeof window !== 'undefined' ? Math.max(window.innerWidth, window.innerHeight) : 1280
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  const [baseNoticeVisible, setBaseNoticeVisible] = useState(false);

  const isPortraitViewport = viewport.h > viewport.w;
  const landscapeWidth = isPortraitViewport ? viewport.h : viewport.w;
  const landscapeHeight = isPortraitViewport ? viewport.w : viewport.h;

  // Track viewport resize & fullscreen state
  useEffect(() => {
    const handleResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  // Measure exact inner width of scroll container (eliminates 1px overflow from scrollbars)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };
    updateWidth();

    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPortraitViewport, viewport.w, viewport.h]);

  // Parse PDF binary
  useEffect(() => {
    let active = true;
    let loadedDoc: LoadedPdfProxy | null = null;
    setPdfProxy(null);
    setLoadError(null);

    (async () => {
      try {
        const doc = await parsePdfBytes(pdfBytes);
        if (!active) {
          await doc.cleanup();
          return;
        }
        loadedDoc = doc;
        setPdfProxy(doc);
      } catch (err) {
        if (active) {
          console.error('Failed to parse PDF:', err);
          setLoadError('Unable to open this PDF file. It may be encrypted or corrupted.');
        }
      }
    })();

    return () => {
      active = false;
      if (loadedDoc) {
        loadedDoc.cleanup().catch(() => {});
      }
    };
  }, [pdfBytes]);

  // Auto-hide read-only Base notice
  useEffect(() => {
    if (!baseNoticeVisible) return;
    const timer = window.setTimeout(() => setBaseNoticeVisible(false), 3200);
    return () => window.clearTimeout(timer);
  }, [baseNoticeVisible]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (type: string) => Promise<void>;
        };
        if (orientation?.lock) {
          orientation.lock('landscape').catch(() => {});
        }
      }
    } catch {
      // Fullscreen may be restricted in embedded preview iframes; CSS full-screen remains active
    }
  };

  const handleExit = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    onExit();
  };

  const variants = documentRecord.variants;
  const safeIndex = Math.min(
    Math.max(0, documentRecord.activeVariantIndex),
    Math.max(0, variants.length - 1)
  );
  const activeVariant = variants[safeIndex];
  const isBase = activeVariant?.isBase ?? true;

  const pageNumbers = pdfProxy
    ? Array.from({ length: pdfProxy.numPages }, (_, i) => i + 1)
    : [];

  const shellStyle: React.CSSProperties = isPortraitViewport
    ? {
        position: 'fixed',
        top: 0,
        left: `${viewport.w}px`,
        width: `${landscapeWidth}px`,
        height: `${landscapeHeight}px`,
        transform: 'rotate(90deg)',
        transformOrigin: 'top left',
      }
    : {
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
      };

  return (
    <div
      data-testid="landscape-reader"
      data-orientation="landscape"
      data-active-variant={activeVariant?.name ?? 'Base'}
      style={shellStyle}
      className="z-50 bg-neutral-950 text-slate-100 flex flex-col overflow-hidden"
    >
      {/* Top Studio Controls Bar */}
      <header className="h-12 shrink-0 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-4 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleExit}
            aria-label="Back to library"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Library</span>
          </button>
          <h1 className="font-display text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
            {documentRecord.name}
          </h1>
        </div>

        {/* Whole-PDF Greyscale Checkbox + Opacity Controller */}
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer select-none whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={documentRecord.greyscale}
              onChange={(e) => onToggleGreyscale(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-950 cursor-pointer"
            />
            <span>Greyscale</span>
          </label>

          <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0">
            <span>Opacity</span>
            <input
              type="range"
              aria-label="Whole PDF opacity"
              min={0.05}
              max={1}
              step={0.05}
              value={documentRecord.opacity}
              onChange={(e) => onChangeOpacity(Number(e.target.value))}
              className="studio-range w-24 sm:w-32"
            />
            <span className="font-mono-num text-xs text-amber-400 w-9 text-right">
              {Math.round(documentRecord.opacity * 100)}%
            </span>
          </label>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors shrink-0"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Width-Locked Scrollable PDF Viewport (Zero Zoom, Zero Horizontal Scroll) */}
      <div
        ref={scrollContainerRef}
        data-testid="pdf-scroll-container"
        className="flex-1 overflow-y-auto overflow-x-hidden bg-neutral-900 pb-16"
        style={{ touchAction: 'pan-y' }}
      >
        {loadError ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3 bg-slate-900 border border-slate-800 rounded-xl p-6">
              <p className="text-sm font-medium text-red-400">{loadError}</p>
              <button
                type="button"
                onClick={handleExit}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                Return to Library
              </button>
            </div>
          </div>
        ) : !pdfProxy ? (
          <div className="h-full flex items-center justify-center p-8">
            <p className="text-sm text-slate-400">Rendering pages in landscape width...</p>
          </div>
        ) : (
          <div className="flex flex-col items-stretch w-full">
            {pageNumbers.map((pageNum, idx) => (
              <PdfPageCanvas
                key={`${documentRecord.id}-p${pageNum}`}
                pdf={pdfProxy}
                pageNumber={pageNum}
                pageIndex={idx}
                targetWidth={containerWidth}
                opacity={documentRecord.opacity}
                greyscale={documentRecord.greyscale}
                highlights={(activeVariant?.highlights ?? []).filter(
                  (h) => h.pageIndex === idx
                )}
                isBase={isBase}
                isRotatedLandscape={isPortraitViewport}
                scrollContainerRef={scrollContainerRef}
                onAddHighlight={onAddHighlight}
                onRemoveHighlight={onRemoveHighlight}
                onBaseEditAttempt={() => setBaseNoticeVisible(true)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Non-intrusive Base Read-Only Toast */}
      {baseNoticeVisible && isBase && (
        <div
          role="status"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-900/95 border border-slate-700 text-slate-100 text-xs shadow-lg backdrop-blur-md"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span>Base is uneditable. Create or duplicate a variant to highlight.</span>
          <button
            type="button"
            onClick={() => {
              setBaseNoticeVisible(false);
              onCreateVariant();
            }}
            className="px-2.5 py-1 font-medium text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            New Variant
          </button>
        </div>
      )}

      {/* Fixed Position Bottom Variant Slider Bar */}
      <footer
        aria-label="Variant navigation bar"
        className="fixed bottom-0 left-0 right-0 h-14 z-50 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-4"
      >
        {/* Active Variant Identity & Read-Only / Highlight Count */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {isBase && (
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          )}
          <span
            data-testid="active-variant-label"
            className="font-display text-xs sm:text-sm font-semibold text-white truncate max-w-[140px]"
          >
            {activeVariant?.name ?? 'Base'}
          </span>
          <span className="hidden sm:inline text-xs text-slate-400 font-mono-num whitespace-nowrap">
            {isBase
              ? 'Read-only'
              : `${activeVariant.highlights.length} ${
                  activeVariant.highlights.length === 1 ? 'highlight' : 'highlights'
                }`}
          </span>
        </div>

        {/* Fixed Position Slider + Quick Step Ticks */}
        <div className="flex-1 max-w-xl flex items-center gap-3 min-w-0">
          <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
            <input
              type="range"
              aria-label="Navigate PDF variants"
              min={0}
              max={Math.max(0, variants.length - 1)}
              step={1}
              disabled={variants.length <= 1}
              value={safeIndex}
              onChange={(e) => onSelectVariant(Number(e.target.value))}
              className="studio-range w-full disabled:opacity-40"
            />
            {variants.length > 1 && (
              <div className="hidden md:flex items-center justify-between px-2">
                {variants.map((v, idx) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSelectVariant(idx)}
                    aria-label={`Switch to ${v.name}`}
                    className={`text-[10px] font-mono-num transition-colors truncate max-w-[68px] ${
                      idx === safeIndex
                        ? 'text-amber-400 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {v.isBase ? 'Base' : `V${idx}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
            {variants.length > 1 ? `${safeIndex + 1}/${variants.length}` : '1/1'}
          </span>
        </div>

        {/* Variant Actions: New, Duplicate, Delete */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onCreateVariant}
            className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[34px]"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New</span>
          </button>

          <button
            type="button"
            onClick={onDuplicateVariant}
            className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[34px]"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Duplicate</span>
          </button>

          {!isBase && (
            <button
              type="button"
              onClick={() => onDeleteVariant(safeIndex)}
              aria-label={`Delete ${activeVariant.name}`}
              title={`Delete ${activeVariant.name}`}
              className="inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-md transition-colors min-h-[34px] min-w-[34px] shrink-0"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
