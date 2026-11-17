export interface PageLayoutItem {
  pageIndex: number;
  pageNumber: number;
  top: number;
  height: number;
  bottom: number;
}

export interface PageLayoutResult {
  layouts: PageLayoutItem[];
  totalHeight: number;
}

export interface VisiblePageWindow {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
}

export interface ScrollAnchor {
  pageIndex: number;
  offsetInPageRatio: number;
}

export function computePageLayouts(
  pageCount: number,
  targetWidth: number,
  aspectRatiosByPage: Record<number, number>,
  defaultAspectRatio: number
): PageLayoutResult {
  const safeCount = Math.max(0, Math.floor(pageCount));
  const safeWidth = Math.max(1, Math.round(targetWidth));
  const safeDefaultRatio =
    Number.isFinite(defaultAspectRatio) && defaultAspectRatio > 0.1
      ? defaultAspectRatio
      : 0.7727;

  const layouts: PageLayoutItem[] = new Array(safeCount);
  let cursorTop = 0;

  for (let i = 0; i < safeCount; i++) {
    const customRatio = aspectRatiosByPage[i];
    const ratio =
      typeof customRatio === 'number' && Number.isFinite(customRatio) && customRatio > 0.1
        ? customRatio
        : safeDefaultRatio;
    const height = Math.max(1, Math.round(safeWidth * ratio));
    const bottom = cursorTop + height;
    layouts[i] = {
      pageIndex: i,
      pageNumber: i + 1,
      top: cursorTop,
      height,
      bottom,
    };
    cursorTop = bottom;
  }

  return { layouts, totalHeight: cursorTop };
}

/**
 * Binary search O(log N) for the page containing offsetY.
 */
export function findPageIndexAtOffset(
  layouts: PageLayoutItem[],
  offsetY: number
): number {
  if (layouts.length === 0) return 0;
  if (offsetY <= 0) return 0;
  const lastIdx = layouts.length - 1;
  if (offsetY >= layouts[lastIdx].bottom) return lastIdx;

  let lo = 0;
  let hi = lastIdx;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const item = layouts[mid];
    if (offsetY < item.top) {
      hi = mid - 1;
    } else if (offsetY >= item.bottom) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return Math.min(lastIdx, Math.max(0, lo));
}

export function computeVisiblePageWindow(
  layouts: PageLayoutItem[],
  scrollTop: number,
  viewportHeight: number,
  overscanPages = 2
): VisiblePageWindow {
  if (layouts.length === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const safeViewportH = Math.max(1, viewportHeight);
  const firstVisible = findPageIndexAtOffset(layouts, safeScrollTop);
  const lastVisible = findPageIndexAtOffset(
    layouts,
    safeScrollTop + safeViewportH - 1
  );

  const startIndex = Math.max(0, firstVisible - overscanPages);
  const endIndex = Math.min(layouts.length - 1, lastVisible + overscanPages);
  const totalHeight = layouts[layouts.length - 1].bottom;

  const topSpacerHeight = layouts[startIndex].top;
  const bottomSpacerHeight = Math.max(0, totalHeight - layouts[endIndex].bottom);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  };
}

export function captureScrollAnchor(
  layouts: PageLayoutItem[],
  scrollTop: number
): ScrollAnchor {
  if (layouts.length === 0 || scrollTop <= 0) {
    return { pageIndex: 0, offsetInPageRatio: 0 };
  }
  const pageIndex = findPageIndexAtOffset(layouts, scrollTop);
  const page = layouts[pageIndex];
  const ratio = (scrollTop - page.top) / Math.max(1, page.height);
  return {
    pageIndex,
    offsetInPageRatio: Math.min(1, Math.max(0, ratio)),
  };
}

export function restoreScrollTopFromAnchor(
  layouts: PageLayoutItem[],
  anchor: ScrollAnchor | null
): number {
  if (!anchor || layouts.length === 0) return 0;
  const safeIdx = Math.min(Math.max(0, anchor.pageIndex), layouts.length - 1);
  const page = layouts[safeIdx];
  const clampedRatio = Math.min(1, Math.max(0, anchor.offsetInPageRatio));
  return Math.max(0, Math.round(page.top + clampedRatio * page.height));
}

export function computePageJumpScrollTop(
  layouts: PageLayoutItem[],
  targetPageIndex: number
): number {
  if (layouts.length === 0) return 0;
  const safeIdx = Math.min(Math.max(0, targetPageIndex), layouts.length - 1);
  return Math.max(0, layouts[safeIdx].top);
}
