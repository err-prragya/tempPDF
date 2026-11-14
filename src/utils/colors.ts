export interface HighlightColorOption {
  id: string;
  name: string;
  hex: string;
}

export const DEFAULT_HIGHLIGHT_COLOR = '#FDE047';

export const HIGHLIGHT_COLORS: HighlightColorOption[] = [
  { id: 'yellow', name: 'Sunburst Yellow', hex: '#FDE047' },
  { id: 'amber', name: 'Warm Amber', hex: '#FBBF24' },
  { id: 'tangerine', name: 'Tangerine', hex: '#FB923C' },
  { id: 'coral', name: 'Coral Red', hex: '#F87171' },
  { id: 'rose', name: 'Rose Pink', hex: '#FB7185' },
  { id: 'magenta', name: 'Magenta', hex: '#F472B6' },
  { id: 'orchid', name: 'Orchid', hex: '#E879F9' },
  { id: 'lavender', name: 'Lavender', hex: '#C084FC' },
  { id: 'violet', name: 'Violet', hex: '#A78BFA' },
  { id: 'indigo', name: 'Indigo', hex: '#818CF8' },
  { id: 'cobalt', name: 'Cobalt Blue', hex: '#60A5FA' },
  { id: 'sky', name: 'Sky Cyan', hex: '#38BDF8' },
  { id: 'aqua', name: 'Aqua', hex: '#22D3EE' },
  { id: 'turquoise', name: 'Turquoise', hex: '#2DD4BF' },
  { id: 'emerald', name: 'Emerald', hex: '#34D399' },
  { id: 'mint', name: 'Mint Green', hex: '#4ADE80' },
  { id: 'lime', name: 'Lime', hex: '#A3E635' },
  { id: 'chartreuse', name: 'Chartreuse', hex: '#D9F99D' },
  { id: 'peach', name: 'Peach Sand', hex: '#FDBA74' },
  { id: 'silver', name: 'Cool Silver', hex: '#CBD5E1' },
];

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
