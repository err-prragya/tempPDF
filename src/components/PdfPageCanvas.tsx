import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { HighlightRect } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR, hexToRgba } from '../utils/colors';
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
  opacity: number;
  greyscale: boolean;
  activeHighlightColor: string;
  highlights: HighlightRect[];
  isBase: boolean;
  isRotatedLandscape: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onAddHighlight: (hl: HighlightRect) => void;
  onRemoveHighlight: (id: string) => void;
  onUndoHighlight: () => void;
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
  opacity,
  greyscale,
  activeHighlightColor,
  highlights,
  isBase,
  isRotatedLandscape,
  scrollContainerRef,
  onAddHighlight,
  onRemoveHighlight,
  onUndoHighlight,
  onBaseEditAttempt,
}) => {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftHighlightRef = useRef<HighlightRect | null>(null);
  const lastTapRef = useRef<TapPoint | null>(null);

  const [isNearViewport, setIsNearViewport] = useState<boolean>(pageNumber <= 3);
  const [aspectRatio, setAspectRatio] = useState<number>(0.7727);
  const [renderTick, setRenderTick] = useState(0);
  const [draftHighlight, setDraftHighlight] = useState<HighlightRect | null>(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);

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
      const bandH = Math.max(12, Math.round(hl.heightRatio * h));
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

  useEffect(() => {
    if (isBase) {
      setSelectedHighlightId(null);
    }
  }, [isBase]);

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
        bandHeightPx: Math.max(20, Math.round(state.pageHeight * 0.032)),
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
      const now = Date.now();
      const currentTap: TapPoint = {
        x: e.clientX,
        y: e.clientY,
        time: now,
      };

      if (isDoubleTapGesture(lastTapRef.current, currentTap)) {
        lastTapRef.current = null;
        setSelectedHighlightId(null);
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
              Math.abs(ny - hl.yCenter) <= hl.heightRatio * 0.75
          );
          setSelectedHighlightId((prev) => (hit ? (prev === hit.id ? null : hit.id) : null));
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
        isBase ? 'cursor-default' : 'cursor-crosshair'
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

      {/* Interactive remove button for tapped/hovered highlight on editable variants */}
      {!isBase &&
        highlights.map((hl) => {
          const isSelected = selectedHighlightId === hl.id;
          return (
            <div
              key={hl.id}
              style={{
                left: `${hl.xStart * 100}%`,
                width: `${(hl.xEnd - hl.xStart) * 100}%`,
                top: `${(hl.yCenter - hl.heightRatio / 2) * 100}%`,
                height: `${hl.heightRatio * 100}%`,
              }}
              className="group absolute pointer-events-none"
            >
              <button
                type="button"
                aria-label="Remove highlight"
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onRemoveHighlight(hl.id);
                  setSelectedHighlightId(null);
                }}
                className={`pointer-events-auto absolute -right-2 -top-2 w-6 h-6 rounded-full bg-slate-900 text-white shadow flex items-center justify-center transition-opacity ${
                  isSelected
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                }`}
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
    </div>
  );
};
