import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureScrollAnchor,
  computePageJumpScrollTop,
  computePageLayouts,
  computeVisiblePageWindow,
  findPageIndexAtOffset,
  restoreScrollTopFromAnchor,
} from './pdfVirtualization.ts';

test('computePageLayouts calculates exact cumulative tops and handles custom page aspect ratios', () => {
  const { layouts, totalHeight } = computePageLayouts(
    4,
    1000,
    { 1: 1.5 },
    0.75
  );
  assert.equal(layouts.length, 4);
  assert.deepEqual(
    layouts.map((l) => [l.top, l.height, l.bottom]),
    [
      [0, 750, 750],
      [750, 1500, 2250],
      [2250, 750, 3000],
      [3000, 750, 3750],
    ]
  );
  assert.equal(totalHeight, 3750);
});

test('findPageIndexAtOffset and computeVisiblePageWindow virtualize 500-page PDFs accurately', () => {
  const { layouts, totalHeight } = computePageLayouts(500, 1000, {}, 0.8);
  assert.equal(totalHeight, 400000);
  assert.equal(findPageIndexAtOffset(layouts, 0), 0);
  assert.equal(findPageIndexAtOffset(layouts, 80000), 100);
  assert.equal(findPageIndexAtOffset(layouts, 399999), 499);

  const win = computeVisiblePageWindow(layouts, 80100, 700, 2);
  assert.equal(win.startIndex, 98);
  assert.equal(win.endIndex, 102);
  assert.equal(win.topSpacerHeight, layouts[98].top);
  assert.equal(win.bottomSpacerHeight, totalHeight - layouts[102].bottom);
});

test('captureScrollAnchor and restoreScrollTopFromAnchor preserve exact reading position across width changes', () => {
  const desktop = computePageLayouts(50, 1200, {}, 0.75); // 900px per page
  // Halfway through page 18 (index 17): top = 17 * 900 = 15300 -> +450 = 15750
  const anchor = captureScrollAnchor(desktop.layouts, 15750);
  assert.equal(anchor.pageIndex, 17);
  assert.ok(Math.abs(anchor.offsetInPageRatio - 0.5) < 0.001);

  // Rotate / resize to narrower 800px width (600px per page)
  const tablet = computePageLayouts(50, 800, {}, 0.75);
  const restored = restoreScrollTopFromAnchor(tablet.layouts, anchor);
  // Expect halfway through page 18 at new width: 17 * 600 + 300 = 10500
  assert.equal(restored, 10500);
});

test('computePageJumpScrollTop clamps out-of-bounds page indices cleanly', () => {
  const { layouts } = computePageLayouts(20, 1000, {}, 0.75);
  assert.equal(computePageJumpScrollTop(layouts, -5), 0);
  assert.equal(computePageJumpScrollTop(layouts, 5), 3750);
  assert.equal(computePageJumpScrollTop(layouts, 999), 19 * 750);
});
