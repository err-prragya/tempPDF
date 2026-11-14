import type { HighlightRect } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR } from './colors';
import { createId } from './variants';

export type DragGestureMode = 'pending' | 'highlight' | 'scroll';

export interface SimpleRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TapPoint {
  x: number;
  y: number;
  time: number;
}

export function isDoubleTapGesture(
  previousTap: TapPoint | null,
  currentTap: TapPoint,
  maxDelayMs = 340,
  maxDistancePx = 44
): boolean {
  if (!previousTap) return false;
  const dt = currentTap.time - previousTap.time;
  if (dt < 0 || dt > maxDelayMs) return false;
  const dist = Math.hypot(currentTap.x - previousTap.x, currentTap.y - previousTap.y);
  return dist <= maxDistancePx;
}

export function classifyDragGesture(
  dx: number,
  dy: number,
  thresholdPx = 8
): DragGestureMode {
  const distance = Math.hypot(dx, dy);
  if (distance < thresholdPx) {
    return 'pending';
  }
  // Predominantly horizontal movement triggers straight-line highlight;
  // vertical or steeper diagonal movement triggers scroll.
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    return 'highlight';
  }
  return 'scroll';
}

export function mapClientDeltaToLocal(
  dx: number,
  dy: number,
  isRotatedLandscape: boolean
): { localDx: number; localDy: number } {
  if (!isRotatedLandscape) {
    return { localDx: dx, localDy: dy };
  }
  // When container is rotated +90deg clockwise to force landscape in portrait viewport:
  // visual +X runs downward (+clientY), visual +Y runs leftward (-clientX)
  return {
    localDx: dy,
    localDy: dx === 0 ? 0 : -dx,
  };
}

export function mapClientPointToLocal(
  clientX: number,
  clientY: number,
  rect: SimpleRect,
  isRotatedLandscape: boolean
): { x: number; y: number; pageWidth: number; pageHeight: number } {
  if (!isRotatedLandscape) {
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      pageWidth: rect.width,
      pageHeight: rect.height,
    };
  }
  return {
    x: clientY - rect.top,
    y: rect.right - clientX,
    pageWidth: rect.height,
    pageHeight: rect.width,
  };
}

export function computeStraightHighlight(params: {
  pageIndex: number;
  startX: number;
  currentX: number;
  startY: number;
  pageWidth: number;
  pageHeight: number;
  color?: string;
  heightRatio?: number;
  bandHeightPx?: number;
  id?: string;
  createdAt?: number;
}): HighlightRect | null {
  const {
    pageIndex,
    startX,
    currentX,
    startY,
    pageWidth,
    pageHeight,
    color = DEFAULT_HIGHLIGHT_COLOR,
    heightRatio: explicitHeightRatio,
    bandHeightPx,
    id,
    createdAt = Date.now(),
  } = params;

  if (pageWidth <= 0 || pageHeight <= 0) {
    return null;
  }

  const rawStart = Math.min(startX, currentX) / pageWidth;
  const rawEnd = Math.max(startX, currentX) / pageWidth;
  const xStart = Math.max(0, Math.min(1, rawStart));
  const xEnd = Math.max(0, Math.min(1, rawEnd));

  if (xEnd - xStart < 0.015) {
    return null;
  }

  const yCenter = Math.max(0, Math.min(1, startY / pageHeight));
  const rawRatio =
    explicitHeightRatio !== undefined
      ? explicitHeightRatio
      : bandHeightPx !== undefined
        ? bandHeightPx / pageHeight
        : 0.018;
  const heightRatio = Math.max(0.006, Math.min(0.08, rawRatio));

  return {
    id: id ?? createId('hl'),
    pageIndex,
    xStart,
    xEnd,
    yCenter,
    heightRatio,
    color,
    stars: 1,
    createdAt,
  };
}
