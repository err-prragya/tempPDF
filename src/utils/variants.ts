import type { HighlightRect, PdfVariant } from '../types/pdf';

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.05, Math.round(value * 100) / 100));
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
      id: createId('hl'),
      createdAt: now,
    })),
    createdAt: now,
  };
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
    heightRatio: Math.max(0.01, Math.min(0.15, highlight.heightRatio)),
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
