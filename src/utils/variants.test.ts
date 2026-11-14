import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBaseVariant,
  createNewVariant,
  duplicateVariant,
  addHighlightToVariant,
  removeHighlightFromVariant,
  deleteVariantAt,
  clampOpacity,
  undoLastHighlight,
} from './variants';
import { HIGHLIGHT_COLORS, hexToRgba } from './colors';

test('Base variant is immutable to highlight additions and removals', () => {
  const base = createBaseVariant(1000);
  assert.equal(base.isBase, true);
  assert.equal(base.name, 'Base');

  const afterAdd = addHighlightToVariant(base, {
    id: 'h1',
    pageIndex: 0,
    xStart: 0.1,
    xEnd: 0.8,
    yCenter: 0.5,
    heightRatio: 0.03,
    color: '#FDE047',
    createdAt: 1001,
  });
  assert.equal(afterAdd.highlights.length, 0);

  const tamperedBase = { ...base, highlights: [{ id: 'h1', pageIndex: 0, xStart: 0.1, xEnd: 0.5, yCenter: 0.5, heightRatio: 0.03, color: '#FDE047', createdAt: 1 }] };
  const afterRemove = removeHighlightFromVariant(tamperedBase, 'h1');
  assert.equal(afterRemove.highlights.length, 1);
});

test('Creating and duplicating variants produces editable variants with clean non-colliding names', () => {
  const base = createBaseVariant(1000);
  const v1 = createNewVariant([base], 1001);
  assert.equal(v1.isBase, false);
  assert.equal(v1.name, 'Variant 1');

  const v1WithHl = addHighlightToVariant(v1, {
    id: 'h1',
    pageIndex: 0,
    xStart: 0.7,
    xEnd: 0.2, // reversed order should normalize
    yCenter: 0.4,
    heightRatio: 0.03,
    color: '#38BDF8',
    createdAt: 1002,
  });
  assert.equal(v1WithHl.highlights.length, 1);
  assert.equal(v1WithHl.highlights[0].xStart, 0.2);
  assert.equal(v1WithHl.highlights[0].xEnd, 0.7);
  assert.equal(v1WithHl.highlights[0].color, '#38BDF8');

  const v1Copy = duplicateVariant(v1WithHl, [base, v1WithHl], 1003);
  assert.equal(v1Copy.isBase, false);
  assert.equal(v1Copy.name, 'Variant 1 Copy');
  assert.equal(v1Copy.highlights.length, 1);
  assert.notEqual(v1Copy.highlights[0].id, 'h1');

  // Duplicating Base creates an editable Variant
  const baseCopy = duplicateVariant(base, [base, v1WithHl, v1Copy], 1004);
  assert.equal(baseCopy.isBase, false);
  assert.equal(baseCopy.name, 'Variant 2');
});

test('undoLastHighlight removes only the latest highlight on editable variants', () => {
  const base = createBaseVariant();
  assert.equal(undoLastHighlight(base).removed, null);

  let v1 = createNewVariant([base]);
  v1 = addHighlightToVariant(v1, {
    id: 'h1',
    pageIndex: 0,
    xStart: 0.1,
    xEnd: 0.5,
    yCenter: 0.2,
    heightRatio: 0.03,
    color: '#FDE047',
    createdAt: 1,
  });
  v1 = addHighlightToVariant(v1, {
    id: 'h2',
    pageIndex: 0,
    xStart: 0.2,
    xEnd: 0.8,
    yCenter: 0.6,
    heightRatio: 0.03,
    color: '#F472B6',
    createdAt: 2,
  });

  const step1 = undoLastHighlight(v1);
  assert.equal(step1.removed?.id, 'h2');
  assert.equal(step1.variant.highlights.length, 1);
  assert.equal(step1.variant.highlights[0].id, 'h1');
});

test('HIGHLIGHT_COLORS provides 20 distinct colors and hexToRgba parses cleanly', () => {
  assert.equal(HIGHLIGHT_COLORS.length, 20);
  const uniqueHexes = new Set(HIGHLIGHT_COLORS.map((c) => c.hex.toLowerCase()));
  assert.equal(uniqueHexes.size, 20);
  assert.equal(hexToRgba('#38BDF8', 0.5), 'rgba(56, 189, 248, 0.5)');
});

test('deleteVariantAt refuses to delete Base and updates active index safely', () => {
  const base = createBaseVariant();
  const v1 = createNewVariant([base]);
  const v2 = createNewVariant([base, v1]);
  const list = [base, v1, v2];

  const attemptDeleteBase = deleteVariantAt(list, 0, 0);
  assert.equal(attemptDeleteBase.variants.length, 3);

  const deleteV1 = deleteVariantAt(list, 1, 2);
  assert.equal(deleteV1.variants.length, 2);
  assert.equal(deleteV1.variants[1].id, v2.id);
  assert.equal(deleteV1.activeVariantIndex, 1);
});

test('clampOpacity enforces [0.05..1]', () => {
  assert.equal(clampOpacity(0), 0.05);
  assert.equal(clampOpacity(-0.5), 0.05);
  assert.equal(clampOpacity(1.4), 1);
  assert.equal(clampOpacity(0.35), 0.35);
});
