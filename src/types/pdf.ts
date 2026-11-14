export interface HighlightRect {
  id: string;
  pageIndex: number;
  xStart: number; // Normalized [0..1] left edge
  xEnd: number; // Normalized [0..1] right edge
  yCenter: number; // Normalized [0..1] straight horizontal line center
  heightRatio: number; // Normalized [0..1] line thickness relative to page height
  color: string; // Hex color from the 20-color highlight palette
  createdAt: number;
}

export interface PdfVariant {
  id: string;
  name: string;
  isBase: boolean;
  highlights: HighlightRect[];
  createdAt: number;
}

export interface PdfDocumentRecord {
  id: string;
  name: string;
  fileSize: number;
  pageCount: number;
  addedAt: number;
  greyscale: boolean;
  opacity: number; // [0.05..1]
  highlightColor: string; // Active hex color for new highlights
  activeVariantIndex: number;
  variants: PdfVariant[];
  isSample?: boolean;
}
