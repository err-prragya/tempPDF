export interface NormalizedCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropDragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export const MIN_CROP_SIZE = 0.08;

export function clampCropRect(rect: NormalizedCropRect): NormalizedCropRect {
  const width = Math.min(1, Math.max(MIN_CROP_SIZE, Number.isFinite(rect.width) ? rect.width : 0.8));
  const height = Math.min(
    1,
    Math.max(MIN_CROP_SIZE, Number.isFinite(rect.height) ? rect.height : 0.8)
  );
  const x = Math.min(1 - width, Math.max(0, Number.isFinite(rect.x) ? rect.x : 0));
  const y = Math.min(1 - height, Math.max(0, Number.isFinite(rect.y) ? rect.y : 0));
  return { x, y, width, height };
}

export function updateCropRectByDrag(
  startRect: NormalizedCropRect,
  mode: CropDragMode,
  dxNorm: number,
  dyNorm: number
): NormalizedCropRect {
  const start = clampCropRect(startRect);

  if (mode === 'move') {
    const nextX = Math.min(1 - start.width, Math.max(0, start.x + dxNorm));
    const nextY = Math.min(1 - start.height, Math.max(0, start.y + dyNorm));
    return { ...start, x: nextX, y: nextY };
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (mode === 'nw' || mode === 'sw') {
    left = Math.min(right - MIN_CROP_SIZE, Math.max(0, start.x + dxNorm));
  }
  if (mode === 'ne' || mode === 'se') {
    right = Math.max(left + MIN_CROP_SIZE, Math.min(1, start.x + start.width + dxNorm));
  }
  if (mode === 'nw' || mode === 'ne') {
    top = Math.min(bottom - MIN_CROP_SIZE, Math.max(0, start.y + dyNorm));
  }
  if (mode === 'sw' || mode === 'se') {
    bottom = Math.max(top + MIN_CROP_SIZE, Math.min(1, start.y + start.height + dyNorm));
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function computePixelCropRegion(
  naturalWidth: number,
  naturalHeight: number,
  crop: NormalizedCropRect
): { sx: number; sy: number; sw: number; sh: number } {
  const safeW = Math.max(1, Math.round(naturalWidth));
  const safeH = Math.max(1, Math.round(naturalHeight));
  const clamped = clampCropRect(crop);

  const sx = Math.max(0, Math.min(safeW - 1, Math.round(clamped.x * safeW)));
  const sy = Math.max(0, Math.min(safeH - 1, Math.round(clamped.y * safeH)));
  const sw = Math.max(1, Math.min(safeW - sx, Math.round(clamped.width * safeW)));
  const sh = Math.max(1, Math.min(safeH - sy, Math.round(clamped.height * safeH)));

  return { sx, sy, sw, sh };
}
