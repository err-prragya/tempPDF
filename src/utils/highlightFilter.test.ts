import test from 'node:test';
import assert from 'node:assert/strict';
import type { HighlightRect } from '../types/pdf';
import {
  DEFAULT_HIGHLIGHT_STARS,
  filterAndSortHighlights,
  normalizeHighlightStars,
  stepFilteredNavigationIndex,
  toggleColorFilter,
  toggleStarFilter,
} from './highlightFilter';

function makeHl(
  id: string,
  pageIndex: number,
  yCenter: number,
  color: string,
  stars?: number
): HighlightRect {
  return {
    id,
    pageIndex,
    xStart: 0.1,
    xEnd: 0.6,
    yCenter,
    heightRatio: 0.018,
    color,
    stars,
    createdAt: 1000,
  };
}

test('normalizeHighlightStars defaults to 1 and clamps [1..5]', () => {
  assert.equal(DEFAULT_HIGHLIGHT_STARS, 1);
  assert.equal(normalizeHighlightStars(undefined), 1);
  assert.equal(normalizeHighlightStars(0), 1);
  assert.equal(normalizeHighlightStars(7), 5);
  assert.equal(normalizeHighlightStars(3.6), 4);
});

test('toggleColorFilter and toggleStarFilter support single, multi, and All selection', () => {
  let colors = toggleColorFilter(null, '#FDE047');
  assert.deepEqual(colors, ['#FDE047']);

  colors = toggleColorFilter(colors, '#38BDF8');
  assert.deepEqual(colors, ['#FDE047', '#38BDF8']);

  colors = toggleColorFilter(colors, '#FDE047');
  assert.deepEqual(colors, ['#38BDF8']);

  // Removing last selected color reverts to All (null)
  colors = toggleColorFilter(colors, '#38BDF8');
  assert.equal(colors, null);

  let stars = toggleStarFilter(null, 5);
  assert.deepEqual(stars, [5]);

  stars = toggleStarFilter(stars, 2);
  assert.deepEqual(stars, [2, 5]);

  // Selecting all 5 stars collapses cleanly back to null (All)
  stars = toggleStarFilter(stars, 1);
  stars = toggleStarFilter(stars, 3);
  stars = toggleStarFilter(stars, 4);
  assert.equal(stars, null);
});

test('filterAndSortHighlights filters by color and star combinations and sorts by page & vertical position', () => {
  const list = [
    makeHl('h_p3', 2, 0.2, '#FDE047', 5),
    makeHl('h_p1_low', 0, 0.8, '#38BDF8', 4),
    makeHl('h_p1_high', 0, 0.2, '#FDE047', undefined), // default 1 star
    makeHl('h_p2', 1, 0.5, '#34D399', 5),
  ];

  // All highlights sorted by reading order
  const all = filterAndSortHighlights(list, null, null);
  assert.deepEqual(
    all.map((h) => h.id),
    ['h_p1_high', 'h_p1_low', 'h_p2', 'h_p3']
  );

  // Filter 5-star across all colors
  const fiveStar = filterAndSortHighlights(list, null, [5]);
  assert.deepEqual(
    fiveStar.map((h) => h.id),
    ['h_p2', 'h_p3']
  );

  // Filter specific color + multiple stars
  const yellowHigh = filterAndSortHighlights(list, ['#fde047'], [1, 5]);
  assert.deepEqual(
    yellowHigh.map((h) => h.id),
    ['h_p1_high', 'h_p3']
  );
});

test('stepFilteredNavigationIndex wraps cleanly in both directions', () => {
  assert.equal(stepFilteredNavigationIndex(-1, 0, 'next'), -1);
  assert.equal(stepFilteredNavigationIndex(-1, 3, 'next'), 0);
  assert.equal(stepFilteredNavigationIndex(-1, 3, 'prev'), 2);
  assert.equal(stepFilteredNavigationIndex(2, 3, 'next'), 0);
  assert.equal(stepFilteredNavigationIndex(0, 3, 'prev'), 2);
  assert.equal(stepFilteredNavigationIndex(1, 3, 'next'), 2);
});
