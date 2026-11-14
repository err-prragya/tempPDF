import type { PdfDocumentRecord } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR } from './colors';
import {
  clampHighlightWidth,
  clampOpacity,
  createBaseVariant,
  createId,
  DEFAULT_HIGHLIGHT_WIDTH,
} from './variants';

export const FOLDER_DATA_FILENAME = '.temppdf-data.json';

export interface FolderMetadataFile {
  version: 1;
  updatedAt: number;
  documents: Record<string, PdfDocumentRecord>;
}

export interface FolderPdfEntry {
  name: string;
  fileSize: number;
  lastModified?: number;
}

export function normalizeDocumentRecord(
  doc: Partial<PdfDocumentRecord> & { name: string },
  fallbackFileSize = 0
): PdfDocumentRecord {
  const now = Date.now();
  const rawVariants = Array.isArray(doc.variants) && doc.variants.length > 0
    ? doc.variants
    : [createBaseVariant(now)];

  // Ensure index 0 is Base
  const hasBase = rawVariants[0]?.isBase === true;
  const variants = (hasBase ? rawVariants : [createBaseVariant(now), ...rawVariants]).map(
    (v) => ({
      ...v,
      highlights: Array.isArray(v.highlights)
        ? v.highlights.map((h) => ({
            ...h,
            color: h.color || DEFAULT_HIGHLIGHT_COLOR,
          }))
        : [],
      imagePins: Array.isArray(v.imagePins) ? v.imagePins : [],
    })
  );

  const activeVariantIndex = Math.min(
    Math.max(0, typeof doc.activeVariantIndex === 'number' ? doc.activeVariantIndex : 0),
    variants.length - 1
  );

  return {
    id: doc.id || createId('pdf'),
    name: doc.name,
    fileSize: typeof doc.fileSize === 'number' && doc.fileSize > 0 ? doc.fileSize : fallbackFileSize,
    pageCount: typeof doc.pageCount === 'number' && doc.pageCount > 0 ? doc.pageCount : 1,
    addedAt: typeof doc.addedAt === 'number' ? doc.addedAt : now,
    greyscale: Boolean(doc.greyscale),
    opacity: typeof doc.opacity === 'number' ? clampOpacity(doc.opacity) : 1,
    highlightColor: doc.highlightColor || DEFAULT_HIGHLIGHT_COLOR,
    highlightWidth:
      typeof doc.highlightWidth === 'number'
        ? clampHighlightWidth(doc.highlightWidth)
        : DEFAULT_HIGHLIGHT_WIDTH,
    activeVariantIndex,
    variants,
  };
}

export function parseFolderMetadata(rawJson: string | null | undefined): FolderMetadataFile {
  if (!rawJson || !rawJson.trim()) {
    return { version: 1, updatedAt: Date.now(), documents: {} };
  }
  try {
    const parsed = JSON.parse(rawJson) as Partial<FolderMetadataFile>;
    const rawDocs = parsed && typeof parsed.documents === 'object' && parsed.documents
      ? parsed.documents
      : {};
    const documents: Record<string, PdfDocumentRecord> = {};
    for (const [key, value] of Object.entries(rawDocs)) {
      if (value && typeof value === 'object') {
        const name = typeof value.name === 'string' && value.name ? value.name : key;
        documents[key] = normalizeDocumentRecord({ ...value, name });
      }
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      documents,
    };
  } catch {
    return { version: 1, updatedAt: Date.now(), documents: {} };
  }
}

export function mergeFolderPdfsWithMetadata(
  pdfFiles: FolderPdfEntry[],
  existingMetadata: FolderMetadataFile,
  now = Date.now()
): {
  activeDocuments: PdfDocumentRecord[];
  metadata: FolderMetadataFile;
} {
  const nextDocsMap: Record<string, PdfDocumentRecord> = { ...existingMetadata.documents };
  const activeDocuments: PdfDocumentRecord[] = [];

  for (const file of pdfFiles) {
    const existing = nextDocsMap[file.name];
    const record = existing
      ? normalizeDocumentRecord({ ...existing, name: file.name, fileSize: file.fileSize }, file.fileSize)
      : normalizeDocumentRecord(
          {
            id: createId('pdf'),
            name: file.name,
            fileSize: file.fileSize,
            addedAt: file.lastModified || now,
          },
          file.fileSize
        );
    nextDocsMap[file.name] = record;
    activeDocuments.push(record);
  }

  activeDocuments.sort((a, b) => a.name.localeCompare(b.name));

  return {
    activeDocuments,
    metadata: {
      version: 1,
      updatedAt: now,
      documents: nextDocsMap,
    },
  };
}

export function serializeFolderMetadata(
  documents: PdfDocumentRecord[],
  existingMetadata?: FolderMetadataFile,
  now = Date.now()
): string {
  const mergedDocs: Record<string, PdfDocumentRecord> = {
    ...(existingMetadata?.documents ?? {}),
  };
  for (const doc of documents) {
    mergedDocs[doc.name] = doc;
  }
  const payload: FolderMetadataFile = {
    version: 1,
    updatedAt: now,
    documents: mergedDocs,
  };
  return JSON.stringify(payload, null, 2);
}
