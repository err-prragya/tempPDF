import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Star, X } from 'lucide-react';
import type { HighlightRect, ImagePin } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR, hexToRgba } from '../utils/colors';
import { normalizeHighlightStars } from '../utils/highlightFilter';
import { withRenderSlot, type LoadedPdfProxy } from '../utils/pdfLoader';
import {
  classifyDragGesture,
  computeStraightHighlight,
  isDoubleTapGesture,
  mapClientDeltaToLocal,
  mapClientPointToLocal,
  type DragGestureMode,
  type TapPoint,
} from '../utils/gesture';

interface PdfPageCanvasProps {
  pdf: LoadedPdfProxy;
  pageNumber: number; // 1-indexed
  pageIndex: number; // 0-indexed
  targetWidth: number;
  defaultAspectRatio?: number;
  opacity: number;
  greyscale: boolean;
  activeHighlightColor: string;
  activeHighlightWidth: number;
  highlights: HighlightRect[];
  imagePins: ImagePin[];
  focusedHighlightId?: string | null;
  selectedHighlightId?: string | null;
  isPlacingImage: boolean;
  isBase: boolean;
  isRotatedLandscape: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onAddHighlight: (hl: HighlightRect) => void;
  onSelectHighlightId: (id: string | null, tappedHighlightId?: string | null) => void;
  onUpdateHighlightStars: (id: string, stars: number) => void;
  onRemoveHighlight: (id: string) => void;
  onUndoHighlight: () => void;
  onPlaceImageAt: (pageIndex: number, nx: number, ny: number) => void;
  onOpenImagePin: (pin: ImagePin) => void;
  onBaseEditAttempt: () => void;
}

interface DragState {
  pointerId: number;
  pointerType: string;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  startLocalX: number;
  startLocalY: number;
  pageWidth: number;
  pageHeight: number;
  mode: DragGestureMode | 'blocked';
}

const MAX_CANVAS_PIXEL_WIDTH = 2200;

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdf,
  pageNumber,
  pageIndex,
  targetWidth,
  defaultAspectRatio = 0.7727,
  opacity,
  greyscale,
  activeHighlightColor,
  activeHighlightWidth,
  highlights,
  imagePins,
  focusedHighlightId = null,
  selectedHighlightId = null,
  isPlacingImage,
  isBase,
  isRotatedLandscape,
  scrollContainerRef,
  onAddHighlight,
  onSelectHighlightId,
  onUpdateHighlightStars,
  onRemoveHighlight,
  onUndoHighlight,
  onPlaceImageAt,
  onOpenImagePin,
  onBaseEditAttempt,
}) => {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftHighlightRef = useRef<HighlightRect | null>(null);
  const lastTapRef = useRef<TapPoint | null>(null);

  const [isNearViewport, setIsNearViewport] = useState<boolean>(pageNumber <= 3);
  const [aspectRatio, setAspectRatio] = useState<number>(defaultAspectRatio);
  const [renderTick, setRenderTick] = useState(0);
  const [draftHighlight, setDraftHighlight] = useState<HighlightRect | null>(null);

  const cssWidth = Math.max(1, Math.round(targetWidth));
  const cssHeight = Math.max(1, Math.round(cssWidth * aspectRatio));

  // Lazy-render only pages near the scroll viewport to prevent memory crashes on large PDFs
  useEffect(() => {
    const el = pageContainerRef.current;
    const rootEl = scrollContainerRef.current;
    if (!el || !rootEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsNearViewport(entry.isIntersecting);
        }
      },
      {
        root: rootEl,
        rootMargin: '1200px 0px',
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  // Render PDF page when near viewport; release canvas memory when scrolled far away
  useEffect(() => {
    const baseCanvas = baseCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;

    if (!isNearViewport || targetWidth <= 0) {
      if (baseCanvas && overlayCanvas) {
        baseCanvas.width = 0;
        baseCanvas.height = 0;
        overlayCanvas.width = 0;
        overlayCanvas.height = 0;
      }
      return;
    }

    let cancelled = false;
    let activeRenderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    (async () => {
      try {
        await withRenderSlot(async () => {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const nextRatio = baseViewport.height / Math.max(1, baseViewport.width);
          setAspectRatio((prev) => (Math.abs(prev - nextRatio) > 0.002 ? nextRatio : prev));

          const rawScale = targetWidth / Math.max(1, baseViewport.width);
          const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
          const maxScale = MAX_CANVAS_PIXEL_WIDTH / Math.max(1, baseViewport.width);
          const renderScale = Math.min(rawScale * dpr, maxScale);
          const renderViewport = page.getViewport({ scale: renderScale });

          if (!baseCanvas || !overlayCanvas || cancelled) return;

          const pixelWidth = Math.max(1, Math.round(renderViewport.width));
          const pixelHeight = Math.max(1, Math.round(renderViewport.height));

          baseCanvas.width = pixelWidth;
          baseCanvas.height = pixelHeight;
          overlayCanvas.width = pixelWidth;
          overlayCanvas.height = pixelHeight;

          const ctx = baseCanvas.getContext('2d', { alpha: false });
          if (!ctx) return;

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, pixelWidth, pixelHeight);

          const task = page.render({
            canvasContext: ctx,
            viewport: renderViewport,
            canvas: baseCanvas,
          });
          activeRenderTask = task;
          await task.promise;
          if (!cancelled) {
            setRenderTick((t) => t + 1);
          }
        });
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error(`PDF page ${pageNumber} render error:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeRenderTask) {
        try {
          activeRenderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdf, pageNumber, targetWidth, isNearViewport]);

  // Draw full-opacity (1.0) straight-line highlight strips onto overlay canvas
  useEffect(() => {
    const baseCanvas = baseCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!baseCanvas || !overlayCanvas) return;
    if (baseCanvas.width === 0 || baseCanvas.height === 0) return;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const allHighlights = draftHighlight ? [...highlights, draftHighlight] : highlights;
    if (allHighlights.length === 0) return;

    for (const hl of allHighlights) {
      const sx = Math.floor(hl.xStart * w);
      const sw = Math.max(2, Math.ceil((hl.xEnd - hl.xStart) * w));
      const bandH = Math.max(6, Math.round(hl.heightRatio * h));
      const sy = Math.max(0, Math.min(h - bandH, Math.round(hl.yCenter * h - bandH / 2)));
      const hlHex = hl.color || DEFAULT_HIGHLIGHT_COLOR;

      ctx.save();
      // 1. Paint solid white paper so dimmed PDF underneath does not dilute the highlight
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx, sy, sw, bandH);

      // 2. Copy crisp full-opacity (1.0) PDF pixels (respecting Greyscale checkbox on PDF ink)
      ctx.filter = greyscale ? 'grayscale(100%)' : 'none';
      ctx.drawImage(baseCanvas, sx, sy, sw, bandH, sx, sy, sw, bandH);

      // 3. Apply chosen highlight color tint + bottom accent rule (kept colorful even when PDF is greyscale)
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = hexToRgba(hlHex, 0.36);
      ctx.fillRect(sx, sy, sw, bandH);

      ctx.globalCompositeOperation = 'source-over';
      const edgeH = Math.max(2, Math.round(bandH * 0.09));
      ctx.fillStyle = hexToRgba(hlHex, 0.88);
      ctx.fillRect(sx, sy + bandH - edgeH, sw, edgeH);
      ctx.restore();
    }
  }, [highlights, draftHighlight, greyscale, renderTick]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = pageContainerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const local = mapClientPointToLocal(e.clientX, e.clientY, rect, isRotatedLandscape);

    dragRef.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startClientX: e.clientX,
      startClientY: e.clientY,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      startLocalX: local.x,
      startLocalY: local.y,
      pageWidth: local.pageWidth,
      pageHeight: local.pageHeight,
      mode: 'pending',
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    const rawTotalDx = e.clientX - state.startClientX;
    const rawTotalDy = e.clientY - state.startClientY;
    const { localDx, localDy } = mapClientDeltaToLocal(
      rawTotalDx,
      rawTotalDy,
      isRotatedLandscape
    );

    if (state.mode === 'pending') {
      const classified = classifyDragGesture(localDx, localDy, 8);
      if (classified === 'pending') {
        return;
      }
      if (classified === 'highlight') {
        if (isBase) {
          state.mode = 'blocked';
          onBaseEditAttempt();
          return;
        }
        state.mode = 'highlight';
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      } else {
        state.mode = 'scroll';
      }
    }

    if (state.mode === 'highlight') {
      const el = pageContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const local = mapClientPointToLocal(e.clientX, e.clientY, rect, isRotatedLandscape);

      // Strictly straight horizontal line locked at state.startLocalY
      const preview = computeStraightHighlight({
        pageIndex,
        startX: state.startLocalX,
        currentX: local.x,
        startY: state.startLocalY,
        pageWidth: state.pageWidth,
        pageHeight: state.pageHeight,
        color: activeHighlightColor,
        heightRatio: activeHighlightWidth,
        id: 'draft',
      });
      draftHighlightRef.current = preview;
      setDraftHighlight(preview);
    } else if (
      state.mode === 'scroll' &&
      (state.pointerType !== 'touch' || isRotatedLandscape)
    ) {
      const stepClientDx = e.clientX - state.lastClientX;
      const stepClientDy = e.clientY - state.lastClientY;
      const { localDy: stepLocalDy } = mapClientDeltaToLocal(
        stepClientDx,
        stepClientDy,
        isRotatedLandscape
      );
      if (scrollContainerRef.current && stepLocalDy !== 0) {
        scrollContainerRef.current.scrollBy(0, -stepLocalDy);
      }
    }

    state.lastClientX = e.clientX;
    state.lastClientY = e.clientY;
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    if (state.mode === 'highlight') {
      const committed = draftHighlightRef.current;
      if (committed) {
        onAddHighlight({
          ...committed,
          color: activeHighlightColor,
          stars: 1,
          id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
      }
      draftHighlightRef.current = null;
      setDraftHighlight(null);
      lastTapRef.current = null;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    } else if (state.mode === 'pending' && e.type === 'pointerup') {
      if (isPlacingImage) {
        lastTapRef.current = null;
        const nx = state.startLocalX / Math.max(1, state.pageWidth);
        const ny = state.startLocalY / Math.max(1, state.pageHeight);
        onPlaceImageAt(pageIndex, nx, ny);
        dragRef.current = null;
        return;
      }

      const now = Date.now();
      const currentTap: TapPoint = {
        x: e.clientX,
        y: e.clientY,
        time: now,
      };

      if (isDoubleTapGesture(lastTapRef.current, currentTap)) {
        lastTapRef.current = null;
        onSelectHighlightId(null);
        if (isBase) {
          onBaseEditAttempt();
        } else {
          onUndoHighlight();
        }
      } else {
        lastTapRef.current = currentTap;
        if (!isBase) {
          const nx = state.startLocalX / Math.max(1, state.pageWidth);
          const ny = state.startLocalY / Math.max(1, state.pageHeight);
          const hit = [...highlights].reverse().find(
            (hl) =>
              nx >= hl.xStart &&
              nx <= hl.xEnd &&
              Math.abs(ny - hl.yCenter) <= Math.max(hl.heightRatio * 0.85, 0.015)
          );
          onSelectHighlightId(
            hit ? (selectedHighlightId === hit.id ? null : hit.id) : null,
            hit ? hit.id : null
          );
        }
      }
    }

    dragRef.current = null;
  };

  const baseFilterCss = greyscale ? 'grayscale(100%)' : 'none';

  return (
    <div
      ref={pageContainerRef}
      data-testid={`pdf-page-${pageNumber}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        width: `${cssWidth}px`,
        height: `${cssHeight}px`,
        touchAction: isRotatedLandscape ? 'none' : 'pan-y',
      }}
      className={`relative bg-white select-none overflow-hidden shadow-sm border-b border-neutral-800/30 ${
        isPlacingImage ? 'cursor-copy' : isBase ? 'cursor-default' : 'cursor-crosshair'
      }`}
    >
      {/* Dimmed Whole-PDF Layer controlled by Opacity + Greyscale */}
      <canvas
        ref={baseCanvasRef}
        style={{
          width: '100%',
          height: '100%',
          opacity,
          filter: baseFilterCss,
        }}
        className="block pointer-events-none"
      />

      {/* Full-Opacity (1.0) Straight-Line Highlight Layer */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          width: '100%',
          height: '100%',
          opacity: 1,
        }}
        className="absolute inset-0 block pointer-events-none"
      />

      {/* Interactive star rating + remove controls and focus indicator on highlights */}
      {highlights.map((hl) => {
        const isSelected = !isBase && selectedHighlightId === hl.id;
        const isFocused = focusedHighlightId === hl.id;
        const currentStars = normalizeHighlightStars(hl.stars);
        const placeBelow = hl.yCenter < 0.14;
        const xCenter = (hl.xStart + hl.xEnd) / 2;
        const horizontalAlignClass =
          xCenter < 0.18
            ? 'left-0'
            : xCenter > 0.82
              ? 'right-0'
              : 'left-1/2 -translate-x-1/2';

        return (
          <div
            key={hl.id}
            data-testid="highlight-overlay-item"
            data-highlight-id={hl.id}
            data-stars={currentStars}
            style={{
              left: `${hl.xStart * 100}%`,
              width: `${(hl.xEnd - hl.xStart) * 100}%`,
              top: `${(hl.yCenter - hl.heightRatio / 2) * 100}%`,
              height: `${hl.heightRatio * 100}%`,
            }}
            className={`group absolute pointer-events-none rounded-sm transition-shadow ${
              isFocused
                ? 'ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.28)] z-20'
                : ''
            }`}
          >
            {/* Interactive 1..5 Star Selector + Remove on clicked highlight */}
            {isSelected && (
              <div
                role="toolbar"
                aria-label="Highlight rating and actions"
                onPointerDown={(ev) => ev.stopPropagation()}
                onPointerUp={(ev) => ev.stopPropagation()}
                onClick={(ev) => ev.stopPropagation()}
                className={`pointer-events-auto absolute z-30 flex items-center gap-0.5 px-2 py-1 rounded-xl bg-slate-950/95 border border-slate-700/90 shadow-2xl backdrop-blur-md whitespace-nowrap ${horizontalAlignClass} ${
                  placeBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
                }`}
              >
                {[1, 2, 3, 4, 5].map((starValue) => {
                  const active = starValue <= currentStars;
                  return (
                    <button
                      key={starValue}
                      type="button"
                      aria-label={`Set ${starValue} ${starValue === 1 ? 'star' : 'stars'}`}
                      aria-pressed={currentStars === starValue}
                      onClick={() => {
                        onUpdateHighlightStars(hl.id, starValue);
                      }}
                      className="p-1 rounded hover:bg-slate-800 transition-colors"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          active
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
                <div className="w-px h-4 bg-slate-700 mx-0.5" aria-hidden="true" />
                <button
                  type="button"
                  aria-label="Remove highlight"
                  onClick={() => {
                    onRemoveHighlight(hl.id);
                    onSelectHighlightId(null);
                  }}
                  className="p-1 rounded text-red-300 hover:text-red-200 hover:bg-red-950/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Full-opacity (1.0) clickable Image Pin Icons */}
      {imagePins.map((pin) => (
        <button
          key={pin.id}
          type="button"
          data-testid="pdf-image-pin"
          aria-label={`Open image: ${pin.originalName}`}
          title={pin.originalName}
          onPointerDown={(ev) => ev.stopPropagation()}
          onPointerUp={(ev) => ev.stopPropagation()}
          onClick={(ev) => {
            ev.stopPropagation();
            onOpenImagePin(pin);
          }}
          style={{
            left: `${pin.x * 100}%`,
            top: `${pin.y * 100}%`,
            opacity: 1,
          }}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-900/95 text-amber-400 border border-amber-400/80 shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
        >
          <ImageIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
};
