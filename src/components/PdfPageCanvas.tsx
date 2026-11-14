import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { HighlightRect } from '../types/pdf';
import type { LoadedPdfProxy } from '../utils/pdfLoader';
import {
  classifyDragGesture,
  computeStraightHighlight,
  mapClientDeltaToLocal,
  mapClientPointToLocal,
  type DragGestureMode,
} from '../utils/gesture';

interface PdfPageCanvasProps {
  pdf: LoadedPdfProxy;
  pageNumber: number; // 1-indexed
  pageIndex: number; // 0-indexed
  targetWidth: number;
  opacity: number;
  greyscale: boolean;
  highlights: HighlightRect[];
  isBase: boolean;
  isRotatedLandscape: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onAddHighlight: (hl: HighlightRect) => void;
  onRemoveHighlight: (id: string) => void;
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

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdf,
  pageNumber,
  pageIndex,
  targetWidth,
  opacity,
  greyscale,
  highlights,
  isBase,
  isRotatedLandscape,
  scrollContainerRef,
  onAddHighlight,
  onRemoveHighlight,
  onBaseEditAttempt,
}) => {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: targetWidth,
    height: Math.round(targetWidth * 0.77),
  });
  const [renderTick, setRenderTick] = useState(0);
  const [draftHighlight, setDraftHighlight] = useState<HighlightRect | null>(null);
  const draftHighlightRef = useRef<HighlightRect | null>(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);

  // Render the PDF page width-locked to targetWidth
  useEffect(() => {
    if (targetWidth <= 0) return;
    let cancelled = false;
    let activeRenderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = targetWidth / baseViewport.width;
        const cssWidth = Math.round(targetWidth);
        const cssHeight = Math.round(baseViewport.height * cssScale);

        setPageSize({ width: cssWidth, height: cssHeight });

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const renderViewport = page.getViewport({ scale: cssScale * dpr });

        const baseCanvas = baseCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        if (!baseCanvas || !overlayCanvas) return;

        const pixelWidth = Math.round(renderViewport.width);
        const pixelHeight = Math.round(renderViewport.height);

        baseCanvas.width = pixelWidth;
        baseCanvas.height = pixelHeight;
        overlayCanvas.width = pixelWidth;
        overlayCanvas.height = pixelHeight;

        const ctx = baseCanvas.getContext('2d');
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
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          console.error('PDF page render error:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeRenderTask) {
        try {
          activeRenderTask.cancel();
        } catch {
          // ignore cancel errors
        }
      }
    };
  }, [pdf, pageNumber, targetWidth]);

  // Draw full-opacity (opacity: 1) straight-line highlight strips onto the overlay canvas
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

      // 1. Paint solid white paper behind the highlighted strip so surrounding low-opacity dimming does not dilute it
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sx, sy, sw, bandH);

      // 2. Copy crisp full-opacity (1.0) PDF pixels from the rendered base page
      ctx.drawImage(baseCanvas, sx, sy, sw, bandH, sx, sy, sw, bandH);

      // 3. Apply subtle straight-line highlight marker tint + crisp top/bottom edges
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(253, 224, 71, 0.36)';
      ctx.fillRect(sx, sy, sw, bandH);

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(217, 119, 6, 0.55)';
      ctx.fillRect(sx, sy + bandH - Math.max(2, Math.round(bandH * 0.08)), sw, Math.max(2, Math.round(bandH * 0.08)));
      ctx.restore();
    }
  }, [highlights, draftHighlight, renderTick]);

  // Clear highlight selection when switching to Base or when highlights change
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
          // ignore if capture unsupported
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

      // Strictly straight horizontal line locked at state.startLocalY (no curve!)
      const preview = computeStraightHighlight({
        pageIndex,
        startX: state.startLocalX,
        currentX: local.x,
        startY: state.startLocalY,
        pageWidth: state.pageWidth,
        pageHeight: state.pageHeight,
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
          id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
      }
      draftHighlightRef.current = null;
      setDraftHighlight(null);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    } else if (state.mode === 'pending') {
      // Tap without drag: toggle selection if tapping on an existing highlight
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

    dragRef.current = null;
  };

  const filterCss = greyscale ? 'grayscale(100%)' : 'none';

  return (
    <div
      ref={pageContainerRef}
      data-testid={`pdf-page-${pageNumber}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        width: `${pageSize.width}px`,
        height: `${pageSize.height}px`,
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
          filter: filterCss,
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
          filter: filterCss,
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
