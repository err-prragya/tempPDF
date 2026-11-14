import type { HighlightRect, ImagePin, PdfDocumentRecord, PdfVariant } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR } from './colors';

export const DEFAULT_HIGHLIGHT_WIDTH = 0.018;
export const MIN_HIGHLIGHT_WIDTH = 0.008;
export const MAX_HIGHLIGHT_WIDTH = 0.048;

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.05, Math.round(value * 100) / 100));
}

export function clampHighlightWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HIGHLIGHT_WIDTH;
  const clamped = Math.min(MAX_HIGHLIGHT_WIDTH, Math.max(MIN_HIGHLIGHT_WIDTH, value));
  return Math.round(clamped * 1000) / 1000;
}

export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createBaseVariant(now = Date.now()): PdfVariant {
  return {
    id: 'base',
    name: 'Base',
    isBase: true,
    highlights: [],
    imagePins: [],
    createdAt: now,
  };
}

function nextVariantName(existingVariants: PdfVariant[], basePrefix = 'Variant'): string {
  const existingNames = new Set(existingVariants.map((v) => v.name.toLowerCase()));
  let counter = 1;
  while (existingNames.has(`${basePrefix.toLowerCase()} ${counter}`)) {
    counter += 1;
  }
  return `${basePrefix} ${counter}`;
}

export function createNewVariant(existingVariants: PdfVariant[], now = Date.now()): PdfVariant {
  return {
    id: createId('var'),
    name: nextVariantName(existingVariants, 'Variant'),
    isBase: false,
    highlights: [],
    imagePins: [],
    createdAt: now,
  };
}

export function duplicateVariant(
  source: PdfVariant,
  existingVariants: PdfVariant[],
  now = Date.now()
): PdfVariant {
  const existingNames = new Set(existingVariants.map((v) => v.name.toLowerCase()));
  let candidate = source.isBase ? nextVariantName(existingVariants, 'Variant') : `${source.name} Copy`;
  if (existingNames.has(candidate.toLowerCase())) {
    let suffix = 2;
    while (existingNames.has(`${candidate} ${suffix}`.toLowerCase())) {
      suffix += 1;
    }
    candidate = `${candidate} ${suffix}`;
  }

  return {
    id: createId('var'),
    name: candidate,
    isBase: false,
    highlights: source.highlights.map((h) => ({
      ...h,
      color: h.color || DEFAULT_HIGHLIGHT_COLOR,
      id: createId('hl'),
      createdAt: now,
    })),
    imagePins: (source.imagePins ?? []).map((pin) => ({
      ...pin,
      id: createId('img'),
      createdAt: now,
    })),
    createdAt: now,
  };
}

export function renameVariantAt(
  variants: PdfVariant[],
  index: number,
  rawName: string
): PdfVariant[] {
  if (index <= 0 || index >= variants.length || variants[index]?.isBase) {
    return variants;
  }
  const trimmed = rawName.trim().slice(0, 48);
  if (!trimmed) {
    return variants;
  }
  return variants.map((v, idx) => (idx === index ? { ...v, name: trimmed } : v));
}

export function addHighlightToVariant(
  variant: PdfVariant,
  highlight: HighlightRect
): PdfVariant {
  if (variant.isBase) {
    return variant;
  }
  const xStart = Math.max(0, Math.min(1, Math.min(highlight.xStart, highlight.xEnd)));
  const xEnd = Math.max(0, Math.min(1, Math.max(highlight.xStart, highlight.xEnd)));
  if (xEnd - xStart < 0.015) {
    return variant;
  }

  const normalized: HighlightRect = {
    ...highlight,
    xStart,
    xEnd,
    yCenter: Math.max(0, Math.min(1, highlight.yCenter)),
    heightRatio: Math.max(0.006, Math.min(0.15, highlight.heightRatio)),
    color: highlight.color || DEFAULT_HIGHLIGHT_COLOR,
  };

  return {
    ...variant,
    highlights: [...variant.highlights, normalized],
  };
}

export function removeHighlightFromVariant(
  variant: PdfVariant,
  highlightId: string
): PdfVariant {
  if (variant.isBase) {
    return variant;
  }
  return {
    ...variant,
    highlights: variant.highlights.filter((h) => h.id !== highlightId),
  };
}

export function undoLastHighlight(variant: PdfVariant): {
  variant: PdfVariant;
  removed: HighlightRect | null;
} {
  if (variant.isBase || variant.highlights.length === 0) {
    return { variant, removed: null };
  }
  const removed = variant.highlights[variant.highlights.length - 1];
  return {
    variant: {
      ...variant,
      highlights: variant.highlights.slice(0, -1),
    },
    removed,
  };
}

export function deleteVariantAt(
  variants: PdfVariant[],
  index: number,
  currentActiveIndex: number
): { variants: PdfVariant[]; activeVariantIndex: number } {
  if (index <= 0 || index >= variants.length || variants[index]?.isBase) {
    return { variants, activeVariantIndex: currentActiveIndex };
  }
  const nextVariants = variants.filter((_, idx) => idx !== index);
  let nextActive = currentActiveIndex;
  if (currentActiveIndex === index) {
    nextActive = Math.max(0, index - 1);
  } else if (currentActiveIndex > index) {
    nextActive = currentActiveIndex - 1;
  }
  nextActive = Math.min(nextVariants.length - 1, Math.max(0, nextActive));
  return {
    variants: nextVariants,
    activeVariantIndex: nextActive,
  };
}

export function addImagePinToVariant(variant: PdfVariant, pin: ImagePin): PdfVariant {
  if (variant.isBase) {
    return variant;
  }
  const normalizedPin: ImagePin = {
    ...pin,
    x: Math.max(0.02, Math.min(0.98, pin.x)),
    y: Math.max(0.02, Math.min(0.98, pin.y)),
  };
  return {
    ...variant,
    imagePins: [...(variant.imagePins ?? []), normalizedPin],
  };
}

export function removeImagePinFromVariant(variant: PdfVariant, pinId: string): PdfVariant {
  if (variant.isBase) {
    return variant;
  }
  return {
    ...variant,
    imagePins: (variant.imagePins ?? []).filter((p) => p.id !== pinId),
  };
}

export function isAssetReferencedInDocuments(
  documents: PdfDocumentRecord[],
  assetFileName: string
): boolean {
  for (const doc of documents) {
    for (const variant of doc.variants) {
      if ((variant.imagePins ?? []).some((pin) => pin.assetFileName === assetFileName)) {
        return true;
      }
    }
  }
  return false;
}
