import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Lock,
  Maximize2,
  Minimize2,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { HighlightRect, ImagePin, PdfDocumentRecord } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS } from '../utils/colors';
import {
  filterAndSortHighlights,
  normalizeHighlightStars,
  stepFilteredNavigationFromHighlight,
  toggleColorFilter,
  toggleStarFilter,
} from '../utils/highlightFilter';
import { openPdfHandle, type LoadedPdfProxy, type ParsedPdfHandle } from '../utils/pdfLoader';
import {
  captureScrollAnchor,
  computePageJumpScrollTop,
  computePageLayouts,
  computeVisiblePageWindow,
  findPageIndexAtOffset,
  restoreScrollTopFromAnchor,
  type PageLayoutItem,
  type ScrollAnchor,
} from '../utils/pdfVirtualization';
import {
  createId,
  DEFAULT_HIGHLIGHT_WIDTH,
  getDocumentImagePins,
  MAX_HIGHLIGHT_WIDTH,
  MIN_HIGHLIGHT_WIDTH,
} from '../utils/variants';
import { CameraCropModal } from './CameraCropModal';
import { PdfPageCanvas } from './PdfPageCanvas';
import { PWAInstallButton } from './PWAInstallButton';

interface LandscapeReaderProps {
  documentRecord: PdfDocumentRecord;
  pdfSource: Blob | Uint8Array;
  onExit: () => void;
  onPagesResolved?: (numPages: number) => void;
  onToggleGreyscale: (greyscale: boolean) => void;
  onChangeOpacity: (opacity: number) => void;
  onChangeHighlightColor: (colorHex: string) => void;
  onChangeHighlightWidth: (widthRatio: number) => void;
  onSelectVariant: (index: number) => void;
  onCreateVariant: () => void;
  onDuplicateVariant: () => void;
  onRenameVariant: (index: number, name: string) => void;
  onDeleteVariant: (index: number) => void;
  onAddHighlight: (hl: HighlightRect) => void;
  onUpdateHighlightStars: (hlId: string, stars: number) => void;
  onRemoveHighlight: (hlId: string) => void;
  onUndoHighlight: () => boolean;
  onSaveImageAsset: (
    file: File
  ) => Promise<{ assetFileName: string; originalName: string; mimeType: string }>;
  onLoadImageAssetUrl: (assetFileName: string) => Promise<string | null>;
  onAddImagePin: (pin: ImagePin) => void;
  onRemoveImagePin: (pinId: string) => void;
}

const EMPTY_HIGHLIGHTS: HighlightRect[] = [];
const EMPTY_PINS: ImagePin[] = [];

export const LandscapeReader: React.FC<LandscapeReaderProps> = ({
  documentRecord,
  pdfSource,
  onExit,
  onPagesResolved,
  onToggleGreyscale,
  onChangeOpacity,
  onChangeHighlightColor,
  onChangeHighlightWidth,
  onSelectVariant,
  onCreateVariant,
  onDuplicateVariant,
  onRenameVariant,
  onDeleteVariant,
  onAddHighlight,
  onUpdateHighlightStars,
  onRemoveHighlight,
  onUndoHighlight,
  onSaveImageAsset,
  onLoadImageAssetUrl,
  onAddImagePin,
  onRemoveImagePin,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const activeScrollTargetRef = useRef<{ highlight: HighlightRect; expiresAt: number } | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const navMenuRef = useRef<HTMLDivElement>(null);
  const filterGroupRef = useRef<HTMLDivElement>(null);
  const pageNavRef = useRef<HTMLDivElement>(null);
  const onPagesResolvedRef = useRef(onPagesResolved);
  onPagesResolvedRef.current = onPagesResolved;
  const onAddHighlightRef = useRef(onAddHighlight);
  onAddHighlightRef.current = onAddHighlight;
  const onUpdateHighlightStarsRef = useRef(onUpdateHighlightStars);
  onUpdateHighlightStarsRef.current = onUpdateHighlightStars;
  const onRemoveHighlightRef = useRef(onRemoveHighlight);
  onRemoveHighlightRef.current = onRemoveHighlight;

  const handleAddHighlight = useCallback((hl: HighlightRect) => {
    onAddHighlightRef.current(hl);
  }, []);
  const handleUpdateHighlightStars = useCallback((id: string, stars: number) => {
    onUpdateHighlightStarsRef.current(id, stars);
  }, []);
  const handleRemoveHighlight = useCallback((id: string) => {
    onRemoveHighlightRef.current(id);
  }, []);

  const [pdfProxy, setPdfProxy] = useState<LoadedPdfProxy | null>(null);
  const [defaultPageAspectRatio, setDefaultPageAspectRatio] = useState<number>(0.7727);
  const [pageAspectRatios, setPageAspectRatios] = useState<Record<number, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  });
  const [containerWidth, setContainerWidth] = useState<number>(
    typeof window !== 'undefined' ? Math.max(window.innerWidth, window.innerHeight) : 1280
  );
  const [containerHeight, setContainerHeight] = useState<number>(
    typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 720
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  const [baseNoticeVisible, setBaseNoticeVisible] = useState(false);
  const [undoToastMessage, setUndoToastMessage] = useState<string | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [activePin, setActivePin] = useState<ImagePin | null>(null);
  const [activePinUrl, setActivePinUrl] = useState<string | null>(null);
  const [isPinLoading, setIsPinLoading] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterSelectedColors, setFilterSelectedColors] = useState<string[] | null>(null);
  const [filterSelectedStars, setFilterSelectedStars] = useState<number[] | null>(null);
  const [navIndex, setNavIndex] = useState<number>(-1);
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);

  // Page-based navigation & virtualization state
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 3,
  });
  const [isPageNavOpen, setIsPageNavOpen] = useState(false);
  const [pageJumpInput, setPageJumpInput] = useState('');

  const currentPageIndexRef = useRef<number>(0);
  const scrollAnchorRef = useRef<ScrollAnchor>({ pageIndex: 0, offsetInPageRatio: 0 });
  const pendingRestoreAnchorRef = useRef<ScrollAnchor | null>(null);
  const cameraReturnAnchorRef = useRef<ScrollAnchor | null>(null);
  const isCameraOpenRef = useRef<boolean>(false);
  const wasCameraOpenRef = useRef<boolean>(false);
  const layoutsRef = useRef<PageLayoutItem[]>([]);
  const scrollRafRef = useRef<number | null>(null);

  isCameraOpenRef.current = isCameraOpen;

  const isPortraitViewport = viewport.h > viewport.w;
  const landscapeWidth = isPortraitViewport ? viewport.h : viewport.w;
  const landscapeHeight = isPortraitViewport ? viewport.w : viewport.h;
  const activeColor = documentRecord.highlightColor || DEFAULT_HIGHLIGHT_COLOR;
  const activeWidth = documentRecord.highlightWidth ?? DEFAULT_HIGHLIGHT_WIDTH;

  useEffect(() => {
    const handleResize = () => {
      // Avoid layout/orientation churn while portrait CameraCropModal is open
      if (isCameraOpenRef.current) return;
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  // Re-sync viewport once CameraCropModal closes so orientation/size settles cleanly
  useEffect(() => {
    if (isCameraOpen) {
      wasCameraOpenRef.current = true;
      return;
    }
    if (wasCameraOpenRef.current) {
      wasCameraOpenRef.current = false;
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = scrollContainerRef.current;
      if (el && cameraReturnAnchorRef.current) {
        const targetAnchor = cameraReturnAnchorRef.current;
        pendingRestoreAnchorRef.current = targetAnchor;
        const restore = () => {
          if (!scrollContainerRef.current || layoutsRef.current.length === 0) return;
          const nextTop = restoreScrollTopFromAnchor(layoutsRef.current, targetAnchor);
          scrollContainerRef.current.scrollTop = nextTop;
        };
        restore();
        const t = window.setTimeout(restore, 140);
        return () => window.clearTimeout(t);
      }
    }
  }, [isCameraOpen]);

  // Close popovers, cancel image placement, or close lightbox on Escape / outside pointerdown
  useEffect(() => {
    if (
      !isColorPickerOpen &&
      !isMenuOpen &&
      !isFilterOpen &&
      !isPageNavOpen &&
      !pendingImageFile &&
      !activePin
    ) {
      return;
    }
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (isColorPickerOpen && colorPickerRef.current && !colorPickerRef.current.contains(target)) {
        setIsColorPickerOpen(false);
      }
      if (isMenuOpen && navMenuRef.current && !navMenuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
      if (isFilterOpen && filterGroupRef.current && !filterGroupRef.current.contains(target)) {
        setIsFilterOpen(false);
      }
      if (isPageNavOpen && pageNavRef.current && !pageNavRef.current.contains(target)) {
        setIsPageNavOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsColorPickerOpen(false);
        setIsMenuOpen(false);
        setIsFilterOpen(false);
        setIsPageNavOpen(false);
        setPendingImageFile(null);
        setActivePin(null);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isColorPickerOpen, isMenuOpen, isFilterOpen, isPageNavOpen, pendingImageFile, activePin]);

  // Measure scroll container dimensions while preserving exact scroll anchor on resize
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      if (isCameraOpenRef.current) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0) {
        setContainerWidth((prevW) => {
          if (prevW !== w && layoutsRef.current.length > 0) {
            pendingRestoreAnchorRef.current =
              cameraReturnAnchorRef.current ??
              captureScrollAnchor(layoutsRef.current, el.scrollTop);
          }
          return w;
        });
      }
      if (h > 0) {
        setContainerHeight((prevH) => (prevH !== h ? h : prevH));
      }
    };
    updateSize();

    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPortraitViewport, viewport.w, viewport.h]);

  useEffect(() => {
    let active = true;
    let handle: ParsedPdfHandle | null = null;
    setPdfProxy(null);
    setPageAspectRatios({});
    setLoadError(null);
    setCurrentPageIndex(0);
    currentPageIndexRef.current = 0;
    scrollAnchorRef.current = { pageIndex: 0, offsetInPageRatio: 0 };
    cameraReturnAnchorRef.current = null;
    pendingRestoreAnchorRef.current = null;

    (async () => {
      try {
        const opened = await openPdfHandle(pdfSource);
        if (!active) {
          await opened.dispose();
          return;
        }
        handle = opened;
        try {
          const firstPage = await opened.pdf.getPage(1);
          const vp = firstPage.getViewport({ scale: 1 });
          const ratio = vp.height / Math.max(1, vp.width);
          if (active && Number.isFinite(ratio) && ratio > 0.2 && ratio < 5) {
            setDefaultPageAspectRatio(ratio);
          }
        } catch {
          // fall back to default aspect ratio
        }
        if (!active) return;
        setPdfProxy(opened.pdf);
        onPagesResolvedRef.current?.(opened.pdf.numPages);
      } catch (err) {
        if (active) {
          console.error('Failed to parse PDF:', err);
          setLoadError('Unable to open this PDF file. It may be encrypted or corrupted.');
        }
      }
    })();

    return () => {
      active = false;
      if (handle) {
        handle.dispose().catch(() => {});
      }
    };
  }, [pdfSource]);

  const numPages = pdfProxy?.numPages ?? 0;

  const { layouts, totalHeight } = useMemo(
    () =>
      computePageLayouts(
        numPages,
        containerWidth,
        pageAspectRatios,
        defaultPageAspectRatio
      ),
    [numPages, containerWidth, pageAspectRatios, defaultPageAspectRatio]
  );

  layoutsRef.current = layouts;

  // Compute current virtualized window spacer heights
  const visibleWindow = useMemo(() => {
    if (layouts.length === 0) {
      return { startIndex: 0, endIndex: -1, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }
    const safeStart = Math.min(Math.max(0, visibleRange.start), layouts.length - 1);
    const safeEnd = Math.min(Math.max(safeStart, visibleRange.end), layouts.length - 1);
    const topSpacerHeight = layouts[safeStart].top;
    const bottomSpacerHeight = Math.max(0, totalHeight - layouts[safeEnd].bottom);
    return {
      startIndex: safeStart,
      endIndex: safeEnd,
      topSpacerHeight,
      bottomSpacerHeight,
    };
  }, [layouts, totalHeight, visibleRange.start, visibleRange.end]);

  // Synchronize visible window & scroll anchor from actual scrollTop
  const syncWindowFromScroll = useCallback(
    (layoutList: PageLayoutItem[], vpH: number) => {
      const el = scrollContainerRef.current;
      if (!el || layoutList.length === 0) return;

      const st = el.scrollTop;
      const win = computeVisiblePageWindow(layoutList, st, vpH, 2);
      const focusIdx = findPageIndexAtOffset(layoutList, st + vpH * 0.35);

      currentPageIndexRef.current = focusIdx;
      scrollAnchorRef.current = captureScrollAnchor(layoutList, st);

      setCurrentPageIndex((prev) => (prev !== focusIdx ? focusIdx : prev));
      setVisibleRange((prev) =>
        prev.start === win.startIndex && prev.end === win.endIndex
          ? prev
          : { start: win.startIndex, end: win.endIndex }
      );
    },
    []
  );

  // Restore scrollTop synchronously after width/layout changes or camera close
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || layouts.length === 0) return;

    if (pendingRestoreAnchorRef.current) {
      const targetAnchor = pendingRestoreAnchorRef.current;
      pendingRestoreAnchorRef.current = null;
      const targetTop = restoreScrollTopFromAnchor(layouts, targetAnchor);
      if (Math.abs(el.scrollTop - targetTop) > 1) {
        el.scrollTop = targetTop;
      }
    }

    syncWindowFromScroll(layouts, containerHeight);
  }, [layouts, containerHeight, syncWindowFromScroll]);

  // Attach rAF-throttled passive scroll listener for 60fps long-PDF virtualization
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !pdfProxy) return;

    const handleScroll = () => {
      if (isCameraOpenRef.current) return;
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        syncWindowFromScroll(layoutsRef.current, el.clientHeight || containerHeight);
      });
    };

    const clearReturnAnchorOnUserScroll = () => {
      if (!isCameraOpenRef.current) {
        cameraReturnAnchorRef.current = null;
      }
      activeScrollTargetRef.current = null;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', clearReturnAnchorOnUserScroll, { passive: true });
    el.addEventListener('touchstart', clearReturnAnchorOnUserScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', clearReturnAnchorOnUserScroll);
      el.removeEventListener('touchstart', clearReturnAnchorOnUserScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [pdfProxy, containerHeight, syncWindowFromScroll]);

  // Compensate scrollTop cleanly if a newly visited page has a different aspect ratio
  const handlePageAspectRatio = useCallback(
    (pageIdx: number, nextRatio: number) => {
      if (!Number.isFinite(nextRatio) || nextRatio <= 0.1 || nextRatio >= 5) return;
      setPageAspectRatios((prev) => {
        const existing = prev[pageIdx] ?? defaultPageAspectRatio;
        if (Math.abs(existing - nextRatio) <= 0.002) {
          return prev;
        }
        const el = scrollContainerRef.current;
        if (el && pageIdx < currentPageIndexRef.current) {
          const oldH = Math.max(1, Math.round(containerWidth * existing));
          const newH = Math.max(1, Math.round(containerWidth * nextRatio));
          const delta = newH - oldH;
          if (delta !== 0) {
            el.scrollTop = Math.max(0, el.scrollTop + delta);
          }
        }
        return { ...prev, [pageIdx]: nextRatio };
      });
    },
    [containerWidth, defaultPageAspectRatio]
  );

  useEffect(() => {
    if (!baseNoticeVisible) return;
    const timer = window.setTimeout(() => setBaseNoticeVisible(false), 3200);
    return () => window.clearTimeout(timer);
  }, [baseNoticeVisible]);

  useEffect(() => {
    if (!undoToastMessage) return;
    const timer = window.setTimeout(() => setUndoToastMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [undoToastMessage]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (type: string) => Promise<void>;
        };
        if (orientation?.lock) {
          orientation.lock('landscape').catch(() => {});
        }
      }
    } catch {
      // Fullscreen may be restricted in embedded preview iframes
    }
  };

  const handleExit = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    onExit();
  };

  const handleUndoTrigger = useCallback(() => {
    const didUndo = onUndoHighlight();
    if (didUndo) {
      setUndoToastMessage('Undid last highlight');
    }
  }, [onUndoHighlight]);

  const variants = documentRecord.variants;
  const safeIndex = Math.min(
    Math.max(0, documentRecord.activeVariantIndex),
    Math.max(0, variants.length - 1)
  );
  const activeVariant = variants[safeIndex];
  const isBase = activeVariant?.isBase ?? true;
  const universalImagePins = useMemo(
    () => getDocumentImagePins(documentRecord),
    [documentRecord]
  );

  // Pre-group highlights & universal image pins by pageIndex (O(1) lookup per mounted page)
  const highlightsByPage = useMemo(() => {
    const map = new Map<number, HighlightRect[]>();
    for (const hl of activeVariant?.highlights ?? []) {
      const list = map.get(hl.pageIndex);
      if (list) list.push(hl);
      else map.set(hl.pageIndex, [hl]);
    }
    return map;
  }, [activeVariant?.highlights]);

  const pinsByPage = useMemo(() => {
    const map = new Map<number, ImagePin[]>();
    for (const pin of universalImagePins) {
      const list = map.get(pin.pageIndex);
      if (list) list.push(pin);
      else map.set(pin.pageIndex, [pin]);
    }
    return map;
  }, [universalImagePins]);

  useEffect(() => {
    setIsRenaming(false);
    setIsCameraOpen(false);
    setPendingImageFile(null);
    setActivePin(null);
    setIsFilterOpen(false);
    setIsPageNavOpen(false);
    setNavIndex(-1);
    setFocusedHighlightId(null);
    setSelectedHighlightId(null);
  }, [safeIndex]);

  const filteredHighlights = useMemo(
    () =>
      filterAndSortHighlights(
        activeVariant?.highlights ?? [],
        filterSelectedColors,
        filterSelectedStars
      ),
    [activeVariant?.highlights, filterSelectedColors, filterSelectedStars]
  );

  useEffect(() => {
    if (!focusedHighlightId) {
      setNavIndex(-1);
      return;
    }
    const idx = filteredHighlights.findIndex((h) => h.id === focusedHighlightId);
    setNavIndex(idx);
  }, [filteredHighlights, focusedHighlightId]);

  // Keep target highlight centered if newly mounted pages adjust aspect ratios during scroll
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    const pagesEl = pagesContainerRef.current;
    if (!scrollEl || !pagesEl || !pdfProxy) return;

    const ro = new ResizeObserver(() => {
      const target = activeScrollTargetRef.current;
      if (!target) return;
      if (Date.now() > target.expiresAt) {
        activeScrollTargetRef.current = null;
        return;
      }
      const pageLayout = layoutsRef.current[target.highlight.pageIndex];
      if (!pageLayout) return;
      const alignedTop = Math.max(
        0,
        pageLayout.top +
          target.highlight.yCenter * pageLayout.height -
          scrollEl.clientHeight * 0.45
      );
      if (Math.abs(scrollEl.scrollTop - alignedTop) > 4) {
        scrollEl.scrollTo({ top: alignedTop, behavior: 'auto' });
      }
    });

    ro.observe(pagesEl);
    return () => {
      ro.disconnect();
    };
  }, [pdfProxy]);

  const jumpToPage = useCallback((targetPageIdx: number) => {
    const scrollEl = scrollContainerRef.current;
    const layoutList = layoutsRef.current;
    if (!scrollEl || layoutList.length === 0) return;

    const clampedIdx = Math.min(Math.max(0, targetPageIdx), layoutList.length - 1);
    const targetTop = computePageJumpScrollTop(layoutList, clampedIdx);
    activeScrollTargetRef.current = null;
    cameraReturnAnchorRef.current = null;
    scrollEl.scrollTo({ top: targetTop, behavior: 'auto' });
    syncWindowFromScroll(layoutList, scrollEl.clientHeight || containerHeight);
  }, [containerHeight, syncWindowFromScroll]);

  // PageUp / PageDown fast page stepping when not typing in an input
  useEffect(() => {
    if (!pdfProxy || numPages <= 1) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isCameraOpen || activePin) return;
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (e.key === 'PageDown') {
        e.preventDefault();
        jumpToPage(currentPageIndexRef.current + 1);
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        jumpToPage(currentPageIndexRef.current - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pdfProxy, numPages, isCameraOpen, activePin, jumpToPage]);

  const navigateToHighlight = (hl: HighlightRect, matchIdx: number) => {
    const scrollEl = scrollContainerRef.current;
    const pageLayout = layoutsRef.current[hl.pageIndex];
    if (scrollEl && pageLayout) {
      activeScrollTargetRef.current = {
        highlight: hl,
        expiresAt: Date.now() + 950,
      };
      cameraReturnAnchorRef.current = null;
      const targetY = Math.max(
        0,
        pageLayout.top + hl.yCenter * pageLayout.height - scrollEl.clientHeight * 0.45
      );
      const isNearby = Math.abs(targetY - scrollEl.scrollTop) < scrollEl.clientHeight * 2.5;
      scrollEl.scrollTo({
        top: targetY,
        behavior: isNearby ? 'smooth' : 'auto',
      });
      if (!isNearby) {
        syncWindowFromScroll(layoutsRef.current, scrollEl.clientHeight || containerHeight);
      }
    }
    setSelectedHighlightId(null);
    setNavIndex(matchIdx);
    setFocusedHighlightId(hl.id);
  };

  const handleStepFilterNav = (direction: 'prev' | 'next') => {
    if (filteredHighlights.length === 0) return;
    setIsMenuOpen(false);
    setIsColorPickerOpen(false);
    setIsPageNavOpen(false);
    const nextIdx = stepFilteredNavigationFromHighlight(
      filteredHighlights,
      activeVariant?.highlights ?? [],
      focusedHighlightId,
      navIndex,
      direction
    );
    if (nextIdx >= 0 && filteredHighlights[nextIdx]) {
      navigateToHighlight(filteredHighlights[nextIdx], nextIdx);
    }
  };

  const handleSelectHighlightOnPage = useCallback(
    (toolbarId: string | null, tappedId?: string | null) => {
      setSelectedHighlightId(toolbarId);
      if (tappedId) {
        activeScrollTargetRef.current = null;
        setFocusedHighlightId(tappedId);
        const matchIdx = filteredHighlights.findIndex((h) => h.id === tappedId);
        setNavIndex(matchIdx);
      }
    },
    [filteredHighlights]
  );

  useEffect(() => {
    if (!activePin) {
      setActivePinUrl(null);
      setIsPinLoading(false);
      return;
    }
    let cancelled = false;
    setIsPinLoading(true);
    setActivePinUrl(null);
    onLoadImageAssetUrl(activePin.assetFileName)
      .then((url) => {
        if (!cancelled) {
          setActivePinUrl(url);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPinLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activePin, onLoadImageAssetUrl]);

  const handleOpenCameraCapture = () => {
    const el = scrollContainerRef.current;
    if (el && layoutsRef.current.length > 0) {
      const anchor = captureScrollAnchor(layoutsRef.current, el.scrollTop);
      scrollAnchorRef.current = anchor;
      cameraReturnAnchorRef.current = anchor;
    } else {
      cameraReturnAnchorRef.current = scrollAnchorRef.current;
    }
    setIsMenuOpen(false);
    setIsPageNavOpen(false);
    setIsFilterOpen(false);
    setIsColorPickerOpen(false);
    setIsCameraOpen(true);
  };

  const handleCroppedCameraFile = (file: File) => {
    setIsCameraOpen(false);
    setPendingImageFile(file);
  };

  const handlePlaceImageAt = useCallback(
    async (pageIndex: number, nx: number, ny: number) => {
      if (!pendingImageFile || isSavingImage) return;
      const fileToSave = pendingImageFile;
      // Preserve exact scroll anchor during pin state commit
      const el = scrollContainerRef.current;
      if (el && layoutsRef.current.length > 0) {
        pendingRestoreAnchorRef.current = captureScrollAnchor(layoutsRef.current, el.scrollTop);
      }
      setIsSavingImage(true);
      try {
        const saved = await onSaveImageAsset(fileToSave);
        onAddImagePin({
          id: createId('img'),
          pageIndex,
          x: nx,
          y: ny,
          assetFileName: saved.assetFileName,
          originalName: saved.originalName,
          mimeType: saved.mimeType,
          createdAt: Date.now(),
        });
        setPendingImageFile(null);
        cameraReturnAnchorRef.current = null;
      } finally {
        setIsSavingImage(false);
      }
    },
    [pendingImageFile, isSavingImage, onSaveImageAsset, onAddImagePin]
  );

  const handleOpenImagePin = useCallback((pin: ImagePin) => {
    setActivePin(pin);
  }, []);

  const handleBaseEditAttempt = useCallback(() => {
    setBaseNoticeVisible(true);
  }, []);

  const startRename = () => {
    if (isBase || !activeVariant) return;
    setRenameDraft(activeVariant.name);
    setIsRenaming(true);
    setIsMenuOpen(false);
  };

  const commitRename = () => {
    if (!isRenaming) return;
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== activeVariant?.name) {
      onRenameVariant(safeIndex, trimmed);
    }
    setIsRenaming(false);
  };

  const shellStyle: React.CSSProperties = isPortraitViewport
    ? {
        position: 'fixed',
        top: 0,
        left: `${viewport.w}px`,
        width: `${landscapeWidth}px`,
        height: `${landscapeHeight}px`,
        transform: 'rotate(90deg)',
        transformOrigin: 'top left',
      }
    : {
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
      };

  const activeColorMeta =
    HIGHLIGHT_COLORS.find((c) => c.hex.toLowerCase() === activeColor.toLowerCase()) ??
    HIGHLIGHT_COLORS[0];

  const mountedLayouts =
    visibleWindow.endIndex >= visibleWindow.startIndex
      ? layouts.slice(visibleWindow.startIndex, visibleWindow.endIndex + 1)
      : [];

  return (
    <>
    <div
      data-testid="landscape-reader"
      data-orientation="landscape"
      data-active-variant={activeVariant?.name ?? 'Base'}
      style={shellStyle}
      className="z-50 bg-neutral-950 text-slate-100 flex flex-col overflow-hidden"
    >
      {/* Full-Height Width-Locked Virtualized Scrollable PDF Viewport */}
      <div
        ref={scrollContainerRef}
        data-testid="pdf-scroll-container"
        className="relative flex-1 overflow-y-scroll overflow-x-hidden bg-neutral-900 pb-12"
        style={{ touchAction: 'pan-y', overflowAnchor: 'none' }}
      >
        {loadError ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3 bg-slate-900 border border-slate-800 rounded-xl p-6">
              <p className="text-sm font-medium text-red-400">{loadError}</p>
              <button
                type="button"
                onClick={handleExit}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                Return to Library
              </button>
            </div>
          </div>
        ) : !pdfProxy ? (
          <div className="h-full flex items-center justify-center p-8">
            <p className="text-sm text-slate-400">Loading PDF...</p>
          </div>
        ) : (
          <div ref={pagesContainerRef} className="flex flex-col items-stretch w-full">
            {visibleWindow.topSpacerHeight > 0 && (
              <div
                aria-hidden="true"
                style={{ height: `${visibleWindow.topSpacerHeight}px`, flexShrink: 0 }}
              />
            )}
            {mountedLayouts.map((layout) => (
              <PdfPageCanvas
                key={`${documentRecord.id}-p${layout.pageNumber}`}
                pdf={pdfProxy}
                pageNumber={layout.pageNumber}
                pageIndex={layout.pageIndex}
                pageWidth={containerWidth}
                pageHeight={layout.height}
                currentPageIndexRef={currentPageIndexRef}
                opacity={documentRecord.opacity}
                greyscale={documentRecord.greyscale}
                activeHighlightColor={activeColor}
                activeHighlightWidth={activeWidth}
                highlights={highlightsByPage.get(layout.pageIndex) ?? EMPTY_HIGHLIGHTS}
                imagePins={pinsByPage.get(layout.pageIndex) ?? EMPTY_PINS}
                focusedHighlightId={focusedHighlightId}
                selectedHighlightId={selectedHighlightId}
                isPlacingImage={Boolean(pendingImageFile)}
                isBase={isBase}
                isRotatedLandscape={isPortraitViewport}
                scrollContainerRef={scrollContainerRef}
                onPageAspectRatio={handlePageAspectRatio}
                onAddHighlight={handleAddHighlight}
                onSelectHighlightId={handleSelectHighlightOnPage}
                onUpdateHighlightStars={handleUpdateHighlightStars}
                onRemoveHighlight={handleRemoveHighlight}
                onUndoHighlight={handleUndoTrigger}
                onPlaceImageAt={handlePlaceImageAt}
                onOpenImagePin={handleOpenImagePin}
                onBaseEditAttempt={handleBaseEditAttempt}
              />
            ))}
            {visibleWindow.bottomSpacerHeight > 0 && (
              <div
                aria-hidden="true"
                style={{ height: `${visibleWindow.bottomSpacerHeight}px`, flexShrink: 0 }}
              />
            )}
          </div>
        )}
      </div>

      {/* Floating Fast Page-Based Navigation Pill ([ ↑ | 12 / 140 | ↓ ]) */}
      {pdfProxy && numPages > 1 && (
        <div
          ref={pageNavRef}
          className="absolute bottom-14 left-3 sm:left-4 z-30"
        >
          {isPageNavOpen && (
            <div
              role="dialog"
              aria-label="Page scrubber and quick jump"
              className="absolute bottom-11 left-0 w-72 sm:w-80 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-3.5 z-40 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white font-mono-num">
                  Page {currentPageIndex + 1} of {numPages}
                </span>
                <button
                  type="button"
                  onClick={() => setIsPageNavOpen(false)}
                  aria-label="Close page navigation"
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <input
                type="range"
                aria-label="Page scrubber"
                min={1}
                max={numPages}
                step={1}
                value={currentPageIndex + 1}
                onChange={(e) => jumpToPage(Number(e.target.value) - 1)}
                className="studio-range w-full"
              />

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => jumpToPage(0)}
                  disabled={currentPageIndex === 0}
                  className="py-1.5 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40"
                >
                  First
                </button>
                <button
                  type="button"
                  onClick={() => jumpToPage(currentPageIndex - 10)}
                  disabled={currentPageIndex === 0}
                  className="py-1.5 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40 font-mono-num"
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => jumpToPage(currentPageIndex + 10)}
                  disabled={currentPageIndex >= numPages - 1}
                  className="py-1.5 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40 font-mono-num"
                >
                  +10
                </button>
                <button
                  type="button"
                  onClick={() => jumpToPage(numPages - 1)}
                  disabled={currentPageIndex >= numPages - 1}
                  className="py-1.5 text-[11px] font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40"
                >
                  Last
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = Number.parseInt(pageJumpInput, 10);
                  if (Number.isFinite(parsed) && parsed >= 1) {
                    jumpToPage(parsed - 1);
                    setPageJumpInput('');
                    setIsPageNavOpen(false);
                  }
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={pageJumpInput}
                  onChange={(e) => setPageJumpInput(e.target.value)}
                  placeholder={`Go to 1–${numPages}`}
                  aria-label="Go to page number"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs text-white bg-slate-950 border border-slate-700 rounded-lg focus:outline-none focus:border-amber-400 font-mono-num"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  Go
                </button>
              </form>
            </div>
          )}

          <div
            role="group"
            aria-label="Page navigation"
            className="inline-flex items-center rounded-xl bg-slate-950/92 backdrop-blur-md border border-slate-700/90 shadow-xl overflow-hidden"
          >
            <button
              type="button"
              onClick={() => jumpToPage(currentPageIndex - 1)}
              disabled={currentPageIndex <= 0}
              aria-label="Previous page"
              className="p-2 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:pointer-events-none"
            >
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsColorPickerOpen(false);
                setIsFilterOpen(false);
                setPageJumpInput('');
                setIsPageNavOpen((open) => !open);
              }}
              aria-label="Jump to page"
              aria-expanded={isPageNavOpen}
              data-testid="page-indicator"
              className={`px-2.5 py-1.5 text-xs font-mono-num font-medium border-x border-slate-800 transition-colors whitespace-nowrap ${
                isPageNavOpen
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'text-slate-200 hover:text-white hover:bg-slate-800'
              }`}
            >
              {currentPageIndex + 1} / {numPages}
            </button>

            <button
              type="button"
              onClick={() => jumpToPage(currentPageIndex + 1)}
              disabled={currentPageIndex >= numPages - 1}
              aria-label="Next page"
              className="p-2 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:pointer-events-none"
            >
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Highlight Filter & Navigation Group (< | ⋮ | >) */}
      <div
        ref={filterGroupRef}
        className="absolute bottom-14 right-3 sm:right-4 z-30"
      >
        {isFilterOpen && (
          <div
            role="dialog"
            aria-label="Filter and navigate highlights"
            style={{
              maxHeight: `${Math.min(460, Math.max(220, landscapeHeight - 102))}px`,
              maxWidth: `${Math.max(300, landscapeWidth - 24)}px`,
            }}
            className="absolute bottom-11 right-0 w-[540px] sm:w-[600px] bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-40 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-3.5 sm:px-4 py-2 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-white">Filter Highlights</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono-num text-amber-400">
                  {filteredHighlights.length}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(filterSelectedColors !== null || filterSelectedStars !== null) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterSelectedColors(null);
                      setFilterSelectedStars(null);
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  aria-label="Close filter panel"
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Wide 2-Column Body: 4x5 Color Palette + Stars (left) | Highlight List (right) */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* Left Column: 4x5 Colors + Stars */}
              <div className="w-[208px] sm:w-[244px] shrink-0 p-2.5 sm:p-3 border-r border-slate-800 overflow-y-auto space-y-2 sm:space-y-3">
                {/* 4x5 Colors */}
                <div className="space-y-1 sm:space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-400">Colors</span>
                    <button
                      type="button"
                      aria-label="Select all highlight colors"
                      aria-pressed={filterSelectedColors === null}
                      onClick={() => setFilterSelectedColors(null)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                        filterSelectedColors === null
                          ? 'bg-amber-400 text-slate-950 font-semibold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      All
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {HIGHLIGHT_COLORS.map((c) => {
                      const selected =
                        filterSelectedColors !== null &&
                        filterSelectedColors.some(
                          (hex) => hex.toLowerCase() === c.hex.toLowerCase()
                        );
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={`Filter color ${c.name}`}
                          aria-pressed={selected}
                          title={c.name}
                          onClick={() =>
                            setFilterSelectedColors((prev) =>
                              toggleColorFilter(prev, c.hex, HIGHLIGHT_COLORS.length)
                            )
                          }
                          style={{ backgroundColor: c.hex }}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-transform hover:scale-105 ${
                            selected
                              ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-105'
                              : filterSelectedColors === null
                                ? 'opacity-95 ring-1 ring-white/10'
                                : 'opacity-35 ring-1 ring-white/10 hover:opacity-85'
                          }`}
                        >
                          {selected && (
                            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-950 stroke-[2.5]" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stars */}
                <div className="space-y-1 sm:space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-400">Stars</span>
                    <button
                      type="button"
                      aria-label="Select all star ratings"
                      aria-pressed={filterSelectedStars === null}
                      onClick={() => setFilterSelectedStars(null)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                        filterSelectedStars === null
                          ? 'bg-amber-400 text-slate-950 font-semibold'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      All
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((starVal) => {
                      const selected =
                        filterSelectedStars !== null && filterSelectedStars.includes(starVal);
                      return (
                        <button
                          key={starVal}
                          type="button"
                          aria-label={`Filter ${starVal} ${starVal === 1 ? 'star' : 'stars'}`}
                          aria-pressed={selected}
                          onClick={() =>
                            setFilterSelectedStars((prev) => toggleStarFilter(prev, starVal))
                          }
                          className={`inline-flex items-center justify-center gap-0.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                            selected
                              ? 'bg-amber-400 text-slate-950 border-amber-400 font-semibold'
                              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          <span>{starVal}</span>
                          <Star
                            className={`w-2.5 h-2.5 ${
                              selected
                                ? 'fill-slate-950 text-slate-950'
                                : 'fill-amber-400 text-amber-400'
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Scrollable Highlight Results List */}
              <div
                aria-label="Filtered highlights"
                className="flex-1 min-w-0 min-h-0 overflow-y-auto divide-y divide-slate-800/80"
              >
                {filteredHighlights.length === 0 ? (
                  <div className="h-full min-h-[140px] px-4 py-6 flex items-center justify-center text-center text-xs text-slate-400">
                    No highlights match the selected colors and stars.
                  </div>
                ) : (
                  filteredHighlights.map((hl, idx) => {
                    const stars = normalizeHighlightStars(hl.stars);
                    const isCurrent = hl.id === focusedHighlightId;
                    const hlColor = hl.color || DEFAULT_HIGHLIGHT_COLOR;
                    const colorMeta =
                      HIGHLIGHT_COLORS.find(
                        (c) => c.hex.toLowerCase() === hlColor.toLowerCase()
                      ) ?? HIGHLIGHT_COLORS[0];
                    return (
                      <button
                        key={hl.id}
                        type="button"
                        onClick={() => navigateToHighlight(hl, idx)}
                        className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left transition-colors border-l-2 ${
                          isCurrent
                            ? 'bg-slate-800/90 border-l-amber-400'
                            : 'border-l-transparent hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
                            style={{ backgroundColor: hl.color || DEFAULT_HIGHLIGHT_COLOR }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-white">
                                Page {hl.pageIndex + 1}
                              </span>
                              <span className="text-[11px] font-mono-num text-slate-400">
                                #{idx + 1}
                              </span>
                            </div>
                            <span className="block text-[11px] text-slate-400 truncate">
                              {colorMeta.name}
                            </span>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400 shrink-0">
                          {Array.from({ length: stars }, (_, sIdx) => (
                            <Star
                              key={sIdx}
                              className="w-3 h-3 fill-amber-400 text-amber-400"
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <div
          role="group"
          aria-label="Highlight filter navigation"
          className="inline-flex items-center rounded-xl bg-slate-950/92 backdrop-blur-md border border-slate-700/90 shadow-xl overflow-hidden"
        >
          <button
            type="button"
            onClick={() => handleStepFilterNav('prev')}
            disabled={filteredHighlights.length === 0}
            aria-label="Previous highlight"
            className="p-2 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              setIsColorPickerOpen(false);
              setIsPageNavOpen(false);
              setIsFilterOpen((open) => !open);
            }}
            aria-label="Filter highlights"
            aria-expanded={isFilterOpen}
            className={`relative p-2 border-x border-slate-800 transition-colors ${
              isFilterOpen
                ? 'bg-amber-400 text-slate-950'
                : 'text-slate-200 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MoreVertical className="w-4 h-4" aria-hidden="true" />
            {(filterSelectedColors !== null || filterSelectedStars !== null) && !isFilterOpen && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400"
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleStepFilterNav('next')}
            disabled={filteredHighlights.length === 0}
            aria-label="Next highlight"
            className="p-2 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-35 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Tap-to-Place Image Banner */}
      {pendingImageFile && (
        <div
          role="status"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-900/95 border border-amber-400/70 text-slate-100 text-xs shadow-xl backdrop-blur-md max-w-[90%]"
        >
          <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {isSavingImage
              ? 'Placing photo...'
              : 'Tap anywhere on the PDF to place photo'}
          </span>
          <button
            type="button"
            onClick={() => setPendingImageFile(null)}
            disabled={isSavingImage}
            className="px-2.5 py-1 font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Double-Tap Undo Confirmation */}
      {undoToastMessage && (
        <div
          role="status"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/95 border border-slate-700 text-slate-100 text-xs shadow-lg backdrop-blur-md"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span>{undoToastMessage}</span>
        </div>
      )}

      {/* Non-intrusive Base Read-Only Notice */}
      {baseNoticeVisible && isBase && (
        <div
          role="status"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-900/95 border border-slate-700 text-slate-100 text-xs shadow-lg backdrop-blur-md"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span>Base is read-only for highlights. Create a variant to highlight.</span>
          <button
            type="button"
            onClick={() => {
              setBaseNoticeVisible(false);
              onCreateVariant();
            }}
            className="px-2.5 py-1 font-medium text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            New Variant
          </button>
        </div>
      )}

      {/* Single Compact Bottom Bar: Variants + Highlight Color + Controls Menu */}
      <footer
        aria-label="Variant navigation bar"
        className="fixed bottom-0 left-0 right-0 h-12 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 px-2.5 sm:px-4 flex items-center justify-between gap-2.5"
      >
        {/* Always-Visible Variant Names One by One */}
        <nav
          aria-label="Variants"
          className="flex-1 flex items-center gap-1.5 overflow-x-auto min-w-0 py-1"
        >
          {variants.map((v, idx) => {
            const isActive = idx === safeIndex;
            if (isActive && !v.isBase && isRenaming) {
              return (
                <form
                  key={v.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRename();
                  }}
                  className="flex items-center gap-1 shrink-0"
                >
                  <input
                    type="text"
                    aria-label="Variant name"
                    autoFocus
                    maxLength={48}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsRenaming(false);
                      }
                    }}
                    className="w-32 sm:w-40 px-2.5 py-1 text-xs font-medium text-white bg-slate-900 border border-amber-400 rounded-md focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Save variant name"
                    onMouseDown={(e) => e.preventDefault()}
                    className="p-1 text-amber-400 hover:text-amber-300 rounded-md"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </form>
              );
            }

            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelectVariant(idx)}
                onDoubleClick={() => {
                  if (isActive && !v.isBase) startRename();
                }}
                aria-label={`Switch to ${v.name}`}
                aria-pressed={isActive}
                data-testid={isActive ? 'active-variant-label' : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[32px] ${
                  isActive
                    ? 'bg-white text-slate-950 font-semibold shadow-sm'
                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                }`}
              >
                {v.isBase && (
                  <Lock className="w-3 h-3 opacity-70 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate max-w-[140px]">{v.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Always-Visible Highlight Color + Packed Controls Menu */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Highlight Color Picker */}
          <div ref={colorPickerRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsPageNavOpen(false);
                setIsColorPickerOpen((open) => !open);
              }}
              aria-label={`Highlight color: ${activeColorMeta.name}`}
              aria-expanded={isColorPickerOpen}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[32px]"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-white/50 shrink-0"
                style={{ backgroundColor: activeColor }}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Color</span>
            </button>

            {isColorPickerOpen && (
              <div
                role="dialog"
                aria-label="20 highlight colors"
                className="absolute right-0 bottom-12 w-60 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-3 z-50 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-medium">Highlight Color</span>
                  <span className="text-[11px] text-slate-400 truncate max-w-[110px]">
                    {activeColorMeta.name}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {HIGHLIGHT_COLORS.map((color) => {
                    const selected =
                      color.hex.toLowerCase() === activeColor.toLowerCase();
                    return (
                      <button
                        key={color.id}
                        type="button"
                        aria-label={`Select ${color.name} highlight color`}
                        aria-pressed={selected}
                        title={color.name}
                        onClick={() => {
                          onChangeHighlightColor(color.hex);
                          setIsColorPickerOpen(false);
                        }}
                        style={{ backgroundColor: color.hex }}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                          selected
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                            : 'ring-1 ring-black/20'
                        }`}
                      >
                        {selected && (
                          <Check className="w-4 h-4 text-slate-950 stroke-[2.5]" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Packed Nav / Controls Drawer Trigger */}
          <div ref={navMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsColorPickerOpen(false);
                setIsPageNavOpen(false);
                setIsMenuOpen((open) => !open);
              }}
              aria-label="Controls menu"
              aria-expanded={isMenuOpen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 min-h-[32px] ${
                isMenuOpen
                  ? 'bg-amber-400 text-slate-950 border-amber-400'
                  : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Menu</span>
            </button>

            {isMenuOpen && (
              <div
                role="dialog"
                aria-label="Reader controls menu"
                className="absolute right-0 bottom-12 w-72 sm:w-80 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-4 z-50 space-y-4"
              >
                {/* Header Row: Back to Folder + Fullscreen + Close */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <button
                    type="button"
                    onClick={handleExit}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Library</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                      className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Maximize2 className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMenuOpen(false)}
                      aria-label="Close menu"
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Variant Actions & Image Attachment */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium text-slate-200">Variant</span>
                    <span className="font-mono-num">
                      {isBase
                        ? `Base · ${universalImagePins.length} img`
                        : `${activeVariant.highlights.length} hl · ${universalImagePins.length} img`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onCreateVariant();
                        setIsMenuOpen(false);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>New Variant</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onDuplicateVariant();
                        setIsMenuOpen(false);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Duplicate</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenCameraCapture}
                      className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                      <span>Capture Image Pin</span>
                    </button>

                    {!isBase && (
                      <>
                        <button
                          type="button"
                          onClick={startRename}
                          aria-label="Rename variant"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Rename</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onDeleteVariant(safeIndex);
                            setIsMenuOpen(false);
                          }}
                          aria-label={`Delete ${activeVariant.name}`}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-300 bg-red-950/50 hover:bg-red-900/60 border border-red-900/50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Display & Highlight Controllers */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-200">
                    <span className="shrink-0 w-20">Width</span>
                    <input
                      type="range"
                      aria-label="Highlight width"
                      min={MIN_HIGHLIGHT_WIDTH}
                      max={MAX_HIGHLIGHT_WIDTH}
                      step={0.002}
                      value={activeWidth}
                      onChange={(e) => onChangeHighlightWidth(Number(e.target.value))}
                      className="studio-range flex-1"
                    />
                    <span className="font-mono-num text-xs text-slate-300 w-9 text-right">
                      {Math.round(activeWidth * 1000)}
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-200">
                    <span className="shrink-0 w-20">Opacity</span>
                    <input
                      type="range"
                      aria-label="Whole PDF opacity"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={documentRecord.opacity}
                      onChange={(e) => onChangeOpacity(Number(e.target.value))}
                      className="studio-range flex-1"
                    />
                    <span className="font-mono-num text-xs text-amber-400 w-9 text-right">
                      {Math.round(documentRecord.opacity * 100)}%
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-200 cursor-pointer pt-1">
                    <span>Greyscale PDF</span>
                    <input
                      type="checkbox"
                      aria-label="Greyscale"
                      checked={documentRecord.greyscale}
                      onChange={(e) => onToggleGreyscale(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900 cursor-pointer"
                    />
                  </label>

                  <PWAInstallButton className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap" />
                </div>
              </div>
            )}
          </div>
        </div>
      </footer>

      {/* Image Pin Lightbox Modal */}
      {activePin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Image preview: ${activePin.originalName}`}
          onClick={() => setActivePin(null)}
          className="absolute inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8"
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            className="relative max-w-4xl w-full max-h-full bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
              <span className="text-xs font-medium text-slate-200 truncate">
                {activePin.originalName}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const targetId = activePin.id;
                    setActivePin(null);
                    onRemoveImagePin(targetId);
                  }}
                  aria-label="Delete image pin"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-900/60 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePin(null)}
                  aria-label="Close image preview"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4 bg-neutral-950 overflow-hidden">
              {isPinLoading ? (
                <p className="text-xs text-slate-400">Loading image...</p>
              ) : activePinUrl ? (
                <img
                  src={activePinUrl}
                  alt={activePin.originalName}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              ) : (
                <p className="text-xs text-red-300">
                  Image file could not be loaded from folder.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Camera Capture & Crop Screen (always upright in natural portrait/viewport orientation) */}
    <CameraCropModal
      isOpen={isCameraOpen}
      onClose={() => setIsCameraOpen(false)}
      onConfirmCroppedFile={handleCroppedCameraFile}
    />
    </>
  );
};
