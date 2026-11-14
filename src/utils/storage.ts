import type { PdfDocumentRecord } from '../types/pdf';
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

export async function loadAllDocuments(): Promise<PdfDocumentRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCS, 'readonly');
    const store = tx.objectStore(STORE_DOCS);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as PdfDocumentRecord[]) || [];
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
  bytes: Uint8Array
): Promise<void> {
  const db = await openDb();
  // Store a clean ArrayBuffer copy
  const bufferCopy = bytes.slice().buffer;
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DOCS, STORE_FILES], 'readwrite');
    tx.objectStore(STORE_DOCS).put(doc);
    tx.objectStore(STORE_FILES).put({ id: doc.id, data: bufferCopy });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPdfBytes(id: string): Promise<Uint8Array | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get(id);
    req.onsuccess = () => {
      const result = req.result as { id: string; data: ArrayBuffer } | undefined;
      if (!result?.data) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(result.data));
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
    opacity: 0.35,
    activeVariantIndex: 0,
    variants: [createBaseVariant(now)],
    isSample: true,
  };
  await savePdfFile(sampleDoc, sampleBytes);
  localStorage.setItem(SEEDED_FLAG, '1');
  return sampleDoc;
}
