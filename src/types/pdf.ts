export interface HighlightRect {
  id: string;
  pageIndex: number;
  xStart: number; // Normalized [0..1] left edge
  xEnd: number; // Normalized [0..1] right edge
  yCenter: number; // Normalized [0..1] straight horizontal line center
  heightRatio: number; // Normalized [0..1] line thickness relative to page height
  color: string; // Hex color from the 20-color highlight palette
  stars?: number; // Rating 1..5 stars (default 1)
  createdAt: number;
}

export interface ImagePin {
  id: string;
  pageIndex: number;
  x: number; // Normalized [0..1] horizontal coordinate
  y: number; // Normalized [0..1] vertical coordinate
  assetFileName: string; // Stored in .temppdf-assets/ inside the folder
  originalName: string;
  mimeType: string;
  createdAt: number;
}

export interface PdfVariant {
  id: string;
  name: string;
  isBase: boolean;
  highlights: HighlightRect[];
  imagePins: ImagePin[];
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
  highlightWidth: number; // Normalized highlight band thickness [0.008..0.048]
  activeVariantIndex: number;
  variants: PdfVariant[];
  isSample?: boolean;
}
