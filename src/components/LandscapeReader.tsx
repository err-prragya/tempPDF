import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Lock,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { HighlightRect, PdfDocumentRecord } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS } from '../utils/colors';
import { openPdfHandle, type LoadedPdfProxy, type ParsedPdfHandle } from '../utils/pdfLoader';
import {
  DEFAULT_HIGHLIGHT_WIDTH,
  MAX_HIGHLIGHT_WIDTH,
  MIN_HIGHLIGHT_WIDTH,
} from '../utils/variants';
import { PdfPageCanvas } from './PdfPageCanvas';

interface LandscapeReaderProps {
  documentRecord: PdfDocumentRecord;
  pdfSource: Blob | Uint8Array;
  onExit: () => void;
  onPagesResolved?: (numPages: number) => void;
  onToggleGreyscale: (greyscale: boolean) => void;
  onChangeOpacity: (opacity: number) => void;
  onChangeHighlightColor: (colorHex: string) => void;
  onChangeHighlightWidth: (widthRatio: number) => void;
  onSelectVariant: (index: number) => void;
  onCreateVariant: () => void;
  onDuplicateVariant: () => void;
  onRenameVariant: (index: number, name: string) => void;
  onDeleteVariant: (index: number) => void;
  onAddHighlight: (hl: HighlightRect) => void;
  onRemoveHighlight: (hlId: string) => void;
  onUndoHighlight: () => boolean;
}

export const LandscapeReader: React.FC<LandscapeReaderProps> = ({
  documentRecord,
  pdfSource,
  onExit,
  onPagesResolved,
  onToggleGreyscale,
  onChangeOpacity,
  onChangeHighlightColor,
  onChangeHighlightWidth,
  onSelectVariant,
  onCreateVariant,
  onDuplicateVariant,
  onRenameVariant,
  onDeleteVariant,
  onAddHighlight,
  onRemoveHighlight,
  onUndoHighlight,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const onPagesResolvedRef = useRef(onPagesResolved);
  onPagesResolvedRef.current = onPagesResolved;

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
  const [undoToastMessage, setUndoToastMessage] = useState<string | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const isPortraitViewport = viewport.h > viewport.w;
  const landscapeWidth = isPortraitViewport ? viewport.h : viewport.w;
  const landscapeHeight = isPortraitViewport ? viewport.w : viewport.h;
  const activeColor = documentRecord.highlightColor || DEFAULT_HIGHLIGHT_COLOR;
  const activeWidth = documentRecord.highlightWidth ?? DEFAULT_HIGHLIGHT_WIDTH;

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

  // Close color palette popover on outside click
  useEffect(() => {
    if (!isColorPickerOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setIsColorPickerOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [isColorPickerOpen]);

  // Measure exact inner width of scroll container
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

  // Parse PDF cleanly using Blob Object URL (single-pass, zero main-thread copy storms)
  useEffect(() => {
    let active = true;
    let handle: ParsedPdfHandle | null = null;
    setPdfProxy(null);
    setLoadError(null);

    (async () => {
      try {
        const opened = await openPdfHandle(pdfSource);
        if (!active) {
          await opened.dispose();
          return;
        }
        handle = opened;
        setPdfProxy(opened.pdf);
        onPagesResolvedRef.current?.(opened.pdf.numPages);
      } catch (err) {
        if (active) {
          console.error('Failed to parse PDF:', err);
          setLoadError('Unable to open this PDF file. It may be encrypted or corrupted.');
        }
      }
    })();

    return () => {
      active = false;
      if (handle) {
        handle.dispose().catch(() => {});
      }
    };
  }, [pdfSource]);

  useEffect(() => {
    if (!baseNoticeVisible) return;
    const timer = window.setTimeout(() => setBaseNoticeVisible(false), 3200);
    return () => window.clearTimeout(timer);
  }, [baseNoticeVisible]);

  useEffect(() => {
    if (!undoToastMessage) return;
    const timer = window.setTimeout(() => setUndoToastMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [undoToastMessage]);

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
      // Fullscreen may be restricted in embedded preview iframes
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

  const handleUndoTrigger = () => {
    const didUndo = onUndoHighlight();
    if (didUndo) {
      setUndoToastMessage('Undid last highlight');
    }
  };

  const variants = documentRecord.variants;
  const safeIndex = Math.min(
    Math.max(0, documentRecord.activeVariantIndex),
    Math.max(0, variants.length - 1)
  );
  const activeVariant = variants[safeIndex];
  const isBase = activeVariant?.isBase ?? true;

  useEffect(() => {
    setIsRenaming(false);
  }, [safeIndex]);

  const startRename = () => {
    if (isBase || !activeVariant) return;
    setRenameDraft(activeVariant.name);
    setIsRenaming(true);
  };

  const commitRename = () => {
    if (!isRenaming) return;
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== activeVariant?.name) {
      onRenameVariant(safeIndex, trimmed);
    }
    setIsRenaming(false);
  };

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

  const activeColorMeta =
    HIGHLIGHT_COLORS.find((c) => c.hex.toLowerCase() === activeColor.toLowerCase()) ??
    HIGHLIGHT_COLORS[0];

  return (
    <div
      data-testid="landscape-reader"
      data-orientation="landscape"
      data-active-variant={activeVariant?.name ?? 'Base'}
      style={shellStyle}
      className="z-50 bg-neutral-950 text-slate-100 flex flex-col overflow-hidden"
    >
      {/* Top Studio Controls Bar */}
      <header className="relative h-12 shrink-0 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-3 z-50">
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
          <h1 className="font-display text-sm font-semibold text-white truncate max-w-[160px] sm:max-w-xs">
            {documentRecord.name}
          </h1>
        </div>

        {/* Whole-PDF Greyscale + Opacity + 20-Color Highlight Palette */}
        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          <div ref={colorPickerRef} className="relative">
            <button
              type="button"
              onClick={() => setIsColorPickerOpen((open) => !open)}
              aria-label={`Highlight color: ${activeColorMeta.name}`}
              aria-expanded={isColorPickerOpen}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0"
                style={{ backgroundColor: activeColor }}
                aria-hidden="true"
              />
              <span className="hidden md:inline">Color</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </button>

            {isColorPickerOpen && (
              <div
                role="dialog"
                aria-label="20 highlight colors"
                className="absolute right-0 top-11 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-medium">Highlight Color</span>
                  <span className="text-[11px] text-slate-400 truncate max-w-[110px]">
                    {activeColorMeta.name}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {HIGHLIGHT_COLORS.map((color) => {
                    const selected =
                      color.hex.toLowerCase() === activeColor.toLowerCase();
                    return (
                      <button
                        key={color.id}
                        type="button"
                        aria-label={`Select ${color.name} highlight color`}
                        aria-pressed={selected}
                        title={color.name}
                        onClick={() => {
                          onChangeHighlightColor(color.hex);
                          setIsColorPickerOpen(false);
                        }}
                        style={{ backgroundColor: color.hex }}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                          selected
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                            : 'ring-1 ring-black/20'
                        }`}
                      >
                        {selected && (
                          <Check className="w-4 h-4 text-slate-950 stroke-[2.5]" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0">
            <span>Width</span>
            <input
              type="range"
              aria-label="Highlight width"
              min={MIN_HIGHLIGHT_WIDTH}
              max={MAX_HIGHLIGHT_WIDTH}
              step={0.002}
              value={activeWidth}
              onChange={(e) => onChangeHighlightWidth(Number(e.target.value))}
              className="studio-range w-16 sm:w-20"
            />
            <span className="font-mono-num text-xs text-slate-300 w-6 text-right">
              {Math.round(activeWidth * 1000)}
            </span>
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer select-none whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={documentRecord.greyscale}
              onChange={(e) => onToggleGreyscale(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-950 cursor-pointer"
            />
            <span>Greyscale</span>
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0">
            <span>Opacity</span>
            <input
              type="range"
              aria-label="Whole PDF opacity"
              min={0.05}
              max={1}
              step={0.05}
              value={documentRecord.opacity}
              onChange={(e) => onChangeOpacity(Number(e.target.value))}
              className="studio-range w-20 sm:w-28"
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

      {/* Width-Locked Scrollable PDF Viewport */}
      <div
        ref={scrollContainerRef}
        data-testid="pdf-scroll-container"
        className="flex-1 overflow-y-scroll overflow-x-hidden bg-neutral-900 pb-16"
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
            <p className="text-sm text-slate-400">Loading PDF in landscape width...</p>
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
                activeHighlightColor={activeColor}
                activeHighlightWidth={activeWidth}
                highlights={(activeVariant?.highlights ?? []).filter(
                  (h) => h.pageIndex === idx
                )}
                isBase={isBase}
                isRotatedLandscape={isPortraitViewport}
                scrollContainerRef={scrollContainerRef}
                onAddHighlight={onAddHighlight}
                onRemoveHighlight={onRemoveHighlight}
                onUndoHighlight={handleUndoTrigger}
                onBaseEditAttempt={() => setBaseNoticeVisible(true)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Double-Tap Undo Confirmation Toast */}
      {undoToastMessage && (
        <div
          role="status"
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/95 border border-slate-700 text-slate-100 text-xs shadow-lg backdrop-blur-md"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span>{undoToastMessage}</span>
        </div>
      )}

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

      {/* Fixed Position Bottom Variant Selector Bar */}
      <footer
        aria-label="Variant navigation bar"
        className="fixed bottom-0 left-0 right-0 h-14 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-3"
      >
        {/* Left: Variant Names Listed One by One */}
        <nav
          aria-label="Variants"
          className="flex-1 flex items-center gap-1.5 overflow-x-auto min-w-0 py-1"
        >
          {variants.map((v, idx) => {
            const isActive = idx === safeIndex;
            if (isActive && !v.isBase && isRenaming) {
              return (
                <form
                  key={v.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRename();
                  }}
                  className="flex items-center gap-1 shrink-0"
                >
                  <input
                    type="text"
                    aria-label="Variant name"
                    autoFocus
                    maxLength={48}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsRenaming(false);
                      }
                    }}
                    className="w-32 sm:w-40 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 border border-amber-400 rounded-md focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Save variant name"
                    onMouseDown={(e) => e.preventDefault()}
                    className="p-1.5 text-amber-400 hover:text-amber-300 rounded-md"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </form>
              );
            }

            return (
              <div key={v.id} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectVariant(idx)}
                  aria-label={`Switch to ${v.name}`}
                  aria-pressed={isActive}
                  data-testid={isActive ? 'active-variant-label' : undefined}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                    isActive
                      ? 'bg-white text-slate-950 font-semibold shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  {v.isBase && (
                    <Lock className="w-3 h-3 opacity-70 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate max-w-[140px]">{v.name}</span>
                </button>
              </div>
            );
          })}
        </nav>

        {/* Right: Active Variant Status, Rename, New, Duplicate, Delete */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="hidden lg:inline text-xs text-slate-400 font-mono-num whitespace-nowrap pr-1">
            {isBase
              ? 'Read-only'
              : `${activeVariant.highlights.length} ${
                  activeVariant.highlights.length === 1 ? 'highlight' : 'highlights'
                }`}
          </span>

          {!isBase && !isRenaming && (
            <button
              type="button"
              onClick={startRename}
              aria-label="Rename variant"
              title="Rename variant"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[34px]"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Rename</span>
            </button>
          )}

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
