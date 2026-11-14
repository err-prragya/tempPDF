import type { HighlightRect } from '../types/pdf';

export const MIN_HIGHLIGHT_STARS = 1;
export const MAX_HIGHLIGHT_STARS = 5;
export const DEFAULT_HIGHLIGHT_STARS = 1;

export function normalizeHighlightStars(stars: unknown): number {
  if (typeof stars !== 'number' || !Number.isFinite(stars)) {
    return DEFAULT_HIGHLIGHT_STARS;
  }
  const rounded = Math.round(stars);
  return Math.min(MAX_HIGHLIGHT_STARS, Math.max(MIN_HIGHLIGHT_STARS, rounded));
}

export function toggleColorFilter(
  current: string[] | null,
  hex: string,
  totalPaletteCount = 20
): string[] | null {
  const target = hex.toLowerCase();
  if (current === null) {
    return [hex];
  }
  const exists = current.some((c) => c.toLowerCase() === target);
  const next = exists
    ? current.filter((c) => c.toLowerCase() !== target)
    : [...current, hex];

  if (next.length === 0 || next.length >= totalPaletteCount) {
    return null;
  }
  return next;
}

export function toggleStarFilter(current: number[] | null, star: number): number[] | null {
  const normalized = normalizeHighlightStars(star);
  if (current === null) {
    return [normalized];
  }
  const exists = current.includes(normalized);
  const next = exists
    ? current.filter((s) => s !== normalized)
    : [...current, normalized].sort((a, b) => a - b);

  if (next.length === 0 || next.length >= MAX_HIGHLIGHT_STARS) {
    return null;
  }
  return next;
}

export function compareHighlightsReadingOrder(a: HighlightRect, b: HighlightRect): number {
  if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
  if (a.yCenter !== b.yCenter) return a.yCenter - b.yCenter;
  return a.xStart - b.xStart;
}

export function filterAndSortHighlights(
  highlights: HighlightRect[],
  selectedColors: string[] | null,
  selectedStars: number[] | null
): HighlightRect[] {
  const colorSet = selectedColors
    ? new Set(selectedColors.map((c) => c.toLowerCase()))
    : null;
  const starSet = selectedStars ? new Set(selectedStars) : null;

  return highlights
    .filter((hl) => {
      const colorOk = !colorSet || colorSet.has((hl.color || '').toLowerCase());
      const stars = normalizeHighlightStars(hl.stars);
      const starOk = !starSet || starSet.has(stars);
      return colorOk && starOk;
    })
    .sort(compareHighlightsReadingOrder);
}

export function stepFilteredNavigationIndex(
  currentIndex: number,
  totalMatches: number,
  direction: 'prev' | 'next'
): number {
  if (totalMatches <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= totalMatches) {
    return direction === 'next' ? 0 : totalMatches - 1;
  }
  if (direction === 'next') {
    return (currentIndex + 1) % totalMatches;
  }
  return (currentIndex - 1 + totalMatches) % totalMatches;
}

export function stepFilteredNavigationFromHighlight(
  filteredHighlights: HighlightRect[],
  allHighlights: HighlightRect[],
  focusedHighlightId: string | null,
  currentNavIndex: number,
  direction: 'prev' | 'next'
): number {
  const total = filteredHighlights.length;
  if (total <= 0) return -1;

  if (focusedHighlightId) {
    const directIdx = filteredHighlights.findIndex((h) => h.id === focusedHighlightId);
    if (directIdx >= 0) {
      return stepFilteredNavigationIndex(directIdx, total, direction);
    }

    const anchor = allHighlights.find((h) => h.id === focusedHighlightId);
    if (anchor) {
      if (direction === 'next') {
        const afterIdx = filteredHighlights.findIndex(
          (h) => compareHighlightsReadingOrder(h, anchor) > 0
        );
        return afterIdx >= 0 ? afterIdx : 0;
      }
      for (let i = filteredHighlights.length - 1; i >= 0; i -= 1) {
        if (compareHighlightsReadingOrder(filteredHighlights[i], anchor) < 0) {
          return i;
        }
      }
      return total - 1;
    }
  }

  return stepFilteredNavigationIndex(currentNavIndex, total, direction);
}
