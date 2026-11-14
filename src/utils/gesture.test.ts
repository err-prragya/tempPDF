import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDragGesture,
  computeStraightHighlight,
  isDoubleTapGesture,
  mapClientDeltaToLocal,
  mapClientPointToLocal,
} from './gesture';
import { createSamplePdfBytes } from './samplePdf';

test('isDoubleTapGesture detects two rapid nearby taps and rejects slow or distant taps', () => {
  const first = { x: 200, y: 300, time: 1000 };
  assert.equal(isDoubleTapGesture(null, first), false);
  assert.equal(isDoubleTapGesture(first, { x: 210, y: 310, time: 1220 }), true);
  assert.equal(isDoubleTapGesture(first, { x: 205, y: 305, time: 1500 }), false);
  assert.equal(isDoubleTapGesture(first, { x: 320, y: 300, time: 1150 }), false);
});

test('classifyDragGesture distinguishes horizontal highlight from vertical scroll', () => {
  assert.equal(classifyDragGesture(3, 2), 'pending');
  assert.equal(classifyDragGesture(40, 6), 'highlight');
  assert.equal(classifyDragGesture(-50, 10), 'highlight');
  assert.equal(classifyDragGesture(6, 40), 'scroll');
  assert.equal(classifyDragGesture(18, -22), 'scroll');
});

test('computeStraightHighlight locks yCenter to startY for a straight horizontal line', () => {
  const hl = computeStraightHighlight({
    pageIndex: 1,
    startX: 200,
    currentX: 800,
    startY: 300,
    pageWidth: 1000,
    pageHeight: 600,
    bandHeightPx: 30,
    id: 'test-hl',
    createdAt: 123,
  });
  assert.ok(hl);
  assert.equal(hl.xStart, 0.2);
  assert.equal(hl.xEnd, 0.8);
  assert.equal(hl.yCenter, 0.5);
  assert.equal(hl.heightRatio, 0.05);

  // Default slimmer thickness when heightRatio is omitted
  const defaultSlim = computeStraightHighlight({
    pageIndex: 0,
    startX: 100,
    currentX: 500,
    startY: 200,
    pageWidth: 1000,
    pageHeight: 600,
  });
  assert.ok(defaultSlim);
  assert.equal(defaultSlim.heightRatio, 0.018);

  // Explicit thin highlight width
  const thin = computeStraightHighlight({
    pageIndex: 0,
    startX: 100,
    currentX: 500,
    startY: 200,
    pageWidth: 1000,
    pageHeight: 600,
    heightRatio: 0.008,
  });
  assert.ok(thin);
  assert.equal(thin.heightRatio, 0.008);

  // Tiny jitter (< 1.5% width) should not create stray highlight
  const tiny = computeStraightHighlight({
    pageIndex: 0,
    startX: 100,
    currentX: 105,
    startY: 200,
    pageWidth: 1000,
    pageHeight: 600,
  });
  assert.equal(tiny, null);
});

test('landscape 90deg rotation coordinate mapping maps client gestures accurately', () => {
  const rect = { left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800 };
  // Top-left of rotated page sits at viewport (right=400, top=0)
  const topLeft = mapClientPointToLocal(400, 0, rect, true);
  assert.equal(topLeft.x, 0);
  assert.equal(topLeft.y, 0);
  assert.equal(topLeft.pageWidth, 800);
  assert.equal(topLeft.pageHeight, 400);

  // Swiping visually horizontally (downward in portrait viewport: dy = +120, dx = 0)
  const delta = mapClientDeltaToLocal(0, 120, true);
  assert.equal(delta.localDx, 120);
  assert.equal(delta.localDy, 0);
  assert.equal(classifyDragGesture(delta.localDx, delta.localDy), 'highlight');
});

test('createSamplePdfBytes emits a valid PDF header and EOF marker', () => {
  const bytes = createSamplePdfBytes();
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('/Count 3'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
});
