export interface HighlightColorOption {
  id: string;
  name: string;
  hex: string;
}

export const DEFAULT_HIGHLIGHT_COLOR = '#FDE047';

export const HIGHLIGHT_COLORS: HighlightColorOption[] = [
  { id: 'yellow', name: 'Sunburst Yellow', hex: '#FDE047' },
  { id: 'orange', name: 'Vivid Orange', hex: '#FF7A00' },
  { id: 'crimson', name: 'Crimson Red', hex: '#E11D48' },
  { id: 'ochre', name: 'Warm Bronze', hex: '#B45309' },
  { id: 'apricot', name: 'Soft Apricot', hex: '#FED7AA' },
  { id: 'hotpink', name: 'Hot Pink', hex: '#EC4899' },
  { id: 'plum', name: 'Deep Plum', hex: '#831843' },
  { id: 'lavender', name: 'Soft Lavender', hex: '#E9D5FF' },
  { id: 'purple', name: 'Electric Purple', hex: '#9333EA' },
  { id: 'indigo', name: 'Royal Indigo', hex: '#4338CA' },
  { id: 'navy', name: 'Deep Navy', hex: '#1E3A8A' },
  { id: 'cobalt', name: 'Cobalt Blue', hex: '#2563EB' },
  { id: 'sky', name: 'Sky Cyan', hex: '#38BDF8' },
  { id: 'teal', name: 'Deep Teal', hex: '#0F766E' },
  { id: 'mint', name: 'Pale Mint', hex: '#A7F3D0' },
  { id: 'emerald', name: 'Emerald', hex: '#34D399' },
  { id: 'forest', name: 'Forest Green', hex: '#15803D' },
  { id: 'lime', name: 'Neon Lime', hex: '#A3E635' },
  { id: 'brown', name: 'Espresso Brown', hex: '#78350F' },
  { id: 'slate', name: 'Cool Slate', hex: '#64748B' },
];

export function isLightHex(hex: string): boolean {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return true;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58;
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) {
    return `rgba(253, 224, 71, ${alpha})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(253, 224, 71, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
