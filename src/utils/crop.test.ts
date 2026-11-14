import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampCropRect,
  computePixelCropRegion,
  MIN_CROP_SIZE,
  updateCropRectByDrag,
} from './crop';

test('clampCropRect keeps crop rectangle within [0..1] and enforces minimum size', () => {
  const tiny = clampCropRect({ x: -0.2, y: 0.95, width: 0.01, height: 0.02 });
  assert.equal(tiny.x, 0);
  assert.equal(tiny.width, MIN_CROP_SIZE);
  assert.equal(tiny.height, MIN_CROP_SIZE);
  assert.ok(Math.abs(tiny.y + tiny.height - 1) < 1e-9);
});

test('updateCropRectByDrag moves box without shrinking and resizes corners safely', () => {
  const start = { x: 0.2, y: 0.2, width: 0.5, height: 0.4 };

  const moved = updateCropRectByDrag(start, 'move', 0.5, 0.8);
  assert.ok(Math.abs(moved.width - 0.5) < 1e-9);
  assert.ok(Math.abs(moved.height - 0.4) < 1e-9);
  assert.ok(Math.abs(moved.x - 0.5) < 1e-9);
  assert.ok(Math.abs(moved.y - 0.6) < 1e-9);

  const shrunkNw = updateCropRectByDrag(start, 'nw', 0.9, 0.9);
  assert.ok(Math.abs(shrunkNw.width - MIN_CROP_SIZE) < 1e-9);
  assert.ok(Math.abs(shrunkNw.height - MIN_CROP_SIZE) < 1e-9);
  assert.ok(Math.abs(shrunkNw.x + shrunkNw.width - 0.7) < 1e-9);
  assert.ok(Math.abs(shrunkNw.y + shrunkNw.height - 0.6) < 1e-9);
});

test('computePixelCropRegion maps normalized crop box to exact bounded pixel coordinates', () => {
  const region = computePixelCropRegion(1920, 1080, {
    x: 0.25,
    y: 0.5,
    width: 0.5,
    height: 0.25,
  });
  assert.deepEqual(region, { sx: 480, sy: 540, sw: 960, sh: 270 });
});
