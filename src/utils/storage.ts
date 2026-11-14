import type { PdfDocumentRecord } from '../types/pdf';
import { DEFAULT_HIGHLIGHT_COLOR } from './colors';
import { createSamplePdfBytes } from './samplePdf';
import { createBaseVariant, createId } from './variants';

const DB_NAME = 'tempPDF_db';
const DB_VERSION = 1;
const STORE_DOCS = 'documents';
const STORE_FILES = 'files';
const SEEDED_FLAG = 'temppdf_seeded_v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normalizeRecord(doc: PdfDocumentRecord): PdfDocumentRecord {
  return {
    ...doc,
    highlightColor: doc.highlightColor || DEFAULT_HIGHLIGHT_COLOR,
    variants: doc.variants.map((v) => ({
      ...v,
      highlights: v.highlights.map((h) => ({
        ...h,
        color: h.color || DEFAULT_HIGHLIGHT_COLOR,
      })),
    })),
  };
}

export async function loadAllDocuments(): Promise<PdfDocumentRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readonly');
    const store = tx.objectStore(STORE_DOCS);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = ((req.result as PdfDocumentRecord[]) || []).map(normalizeRecord);
      records.sort((a, b) => b.addedAt - a.addedAt);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveDocumentRecord(doc: PdfDocumentRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    tx.objectStore(STORE_DOCS).put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePdfFile(
  doc: PdfDocumentRecord,
  source: Blob | Uint8Array
): Promise<boolean> {
  try {
    const db = await openDb();
    const storedData =
      source instanceof Blob ? await source.arrayBuffer() : source.slice().buffer;
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction([STORE_DOCS, STORE_FILES], 'readwrite');
      tx.objectStore(STORE_DOCS).put(doc);
      tx.objectStore(STORE_FILES).put({ id: doc.id, data: storedData });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB persistence skipped (file remains active in session):', err);
    return false;
  }
}

export async function loadPdfBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get(id);
    req.onsuccess = () => {
      const result = req.result as { id: string; data: ArrayBuffer | Blob } | undefined;
      if (!result?.data) {
        resolve(null);
        return;
      }
      if (result.data instanceof Blob) {
        resolve(result.data);
        return;
      }
      resolve(new Blob([result.data], { type: 'application/pdf' }));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePdfRecord(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DOCS, STORE_FILES], 'readwrite');
    tx.objectStore(STORE_DOCS).delete(id);
    tx.objectStore(STORE_FILES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function ensureSamplePdfSeeded(): Promise<PdfDocumentRecord[]> {
  const existing = await loadAllDocuments();
  if (existing.length > 0) {
    return existing;
  }
  const alreadySeeded = localStorage.getItem(SEEDED_FLAG) === '1';
  if (alreadySeeded) {
    return existing;
  }

  const sampleBytes = createSamplePdfBytes();
  const now = Date.now();
  const sampleDoc: PdfDocumentRecord = {
    id: createId('pdf'),
    name: 'Active Recall & Visual Focus.pdf',
    fileSize: sampleBytes.byteLength,
    pageCount: 3,
    addedAt: now,
    greyscale: false,
    opacity: 1,
    highlightColor: DEFAULT_HIGHLIGHT_COLOR,
    activeVariantIndex: 0,
    variants: [createBaseVariant(now)],
    isSample: true,
  };

  await savePdfFile(sampleDoc, sampleBytes);
  localStorage.setItem(SEEDED_FLAG, '1');
  return [sampleDoc];
}

export async function restoreSamplePdf(): Promise<PdfDocumentRecord> {
  const sampleBytes = createSamplePdfBytes();
  const now = Date.now();
  const sampleDoc: PdfDocumentRecord = {
    id: createId('pdf'),
    name: 'Active Recall & Visual Focus.pdf',
    fileSize: sampleBytes.byteLength,
    pageCount: 3,
    addedAt: now,
    greyscale: false,
    opacity: 1,
    highlightColor: DEFAULT_HIGHLIGHT_COLOR,
    activeVariantIndex: 0,
    variants: [createBaseVariant(now)],
    isSample: true,
  };
  await savePdfFile(sampleDoc, sampleBytes);
  localStorage.setItem(SEEDED_FLAG, '1');
  return sampleDoc;
}
