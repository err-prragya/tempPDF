import type { PdfDocumentRecord } from '../types/pdf';
import {
  FOLDER_DATA_FILENAME,
  mergeFolderPdfsWithMetadata,
  parseFolderMetadata,
  serializeFolderMetadata,
  type FolderMetadataFile,
  type FolderPdfEntry,
} from './folderMetadata';

export interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

export interface FileSystemDirectoryHandleWithPerms extends FileSystemDirectoryHandle {
  queryPermission?: (desc?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (desc?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
    }) => Promise<FileSystemDirectoryHandleWithPerms>;
  }
}

const HANDLE_DB_NAME = 'tempPDF_folder_handle_db';
const HANDLE_STORE = 'handles';
const ACTIVE_HANDLE_KEY = 'active_folder';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFolderHandle(
  handle: FileSystemDirectoryHandleWithPerms
): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, ACTIVE_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore if handle persistence is unavailable
  }
}

export async function loadSavedFolderHandle(): Promise<FileSystemDirectoryHandleWithPerms | null> {
  try {
    const db = await openHandleDb();
    return await new Promise<FileSystemDirectoryHandleWithPerms | null>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(ACTIVE_HANDLE_KEY);
      req.onsuccess = () =>
        resolve((req.result as FileSystemDirectoryHandleWithPerms) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearSavedFolderHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(ACTIVE_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickReadWriteFolder(): Promise<FileSystemDirectoryHandleWithPerms> {
  if (!window.showDirectoryPicker) {
    throw new Error('FOLDER_PICKER_UNSUPPORTED');
  }
  const handle = await window.showDirectoryPicker({
    id: 'temppdf-library',
    mode: 'readwrite',
  });
  await saveFolderHandle(handle);
  return handle;
}

export async function verifyFolderPermission(
  handle: FileSystemDirectoryHandleWithPerms,
  requestIfPrompt = false
): Promise<boolean> {
  const desc: FileSystemPermissionDescriptor = { mode: 'readwrite' };
  if (handle.queryPermission) {
    const status = await handle.queryPermission(desc);
    if (status === 'granted') return true;
  }
  if (requestIfPrompt && handle.requestPermission) {
    const reqStatus = await handle.requestPermission(desc);
    return reqStatus === 'granted';
  }
  return false;
}

export interface FolderScanResult {
  folderName: string;
  documents: PdfDocumentRecord[];
  metadata: FolderMetadataFile;
  fileHandlesByName: Record<string, FileSystemFileHandle>;
}

export async function scanFolderHandle(
  dirHandle: FileSystemDirectoryHandleWithPerms
): Promise<FolderScanResult> {
  const pdfEntries: FolderPdfEntry[] = [];
  const fileHandlesByName: Record<string, FileSystemFileHandle> = {};
  let rawMetadataText: string | null = null;

  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    const fileHandle = entry as FileSystemFileHandle;

    if (entry.name === FOLDER_DATA_FILENAME) {
      try {
        const metaFile = await fileHandle.getFile();
        rawMetadataText = await metaFile.text();
      } catch {
        rawMetadataText = null;
      }
      continue;
    }

    if (entry.name.toLowerCase().endsWith('.pdf')) {
      const file = await fileHandle.getFile();
      pdfEntries.push({
        name: entry.name,
        fileSize: file.size,
        lastModified: file.lastModified,
      });
      fileHandlesByName[entry.name] = fileHandle;
    }
  }

  const parsedMeta = parseFolderMetadata(rawMetadataText);
  const { activeDocuments, metadata } = mergeFolderPdfsWithMetadata(pdfEntries, parsedMeta);

  return {
    folderName: dirHandle.name,
    documents: activeDocuments,
    metadata,
    fileHandlesByName,
  };
}

// Serialized write queue so rapid edits (opacity slider / consecutive highlights) never collide
let writeQueue: Promise<void> = Promise.resolve();

export function writeFolderMetadata(
  dirHandle: FileSystemDirectoryHandleWithPerms,
  documents: PdfDocumentRecord[],
  existingMetadata?: FolderMetadataFile
): Promise<FolderMetadataFile> {
  const jsonText = serializeFolderMetadata(documents, existingMetadata);
  const nextMetadata = parseFolderMetadata(jsonText);

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const fileHandle = await dirHandle.getFileHandle(FOLDER_DATA_FILENAME, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonText);
      await writable.close();
    });

  return writeQueue.then(() => nextMetadata);
}

export async function writePdfFileToFolder(
  dirHandle: FileSystemDirectoryHandleWithPerms,
  file: File
): Promise<FileSystemFileHandle> {
  const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return fileHandle;
}

export async function deletePdfFromFolder(
  dirHandle: FileSystemDirectoryHandleWithPerms,
  fileName: string,
  remainingDocuments: PdfDocumentRecord[],
  existingMetadata?: FolderMetadataFile
): Promise<FolderMetadataFile> {
  await dirHandle.removeEntry(fileName);
  const cleanedDocs = { ...(existingMetadata?.documents ?? {}) };
  delete cleanedDocs[fileName];
  const baseMeta: FolderMetadataFile = {
    version: 1,
    updatedAt: Date.now(),
    documents: cleanedDocs,
  };
  return writeFolderMetadata(dirHandle, remainingDocuments, baseMeta);
}

/**
 * Fallback scanner for browsers / embedded iframes where showDirectoryPicker is restricted.
 * Reads files selected via <input type="file" webkitdirectory />.
 */
export async function scanFallbackDirectoryFiles(fileList: FileList): Promise<{
  folderName: string;
  documents: PdfDocumentRecord[];
  metadata: FolderMetadataFile;
  filesByName: Record<string, File>;
}> {
  const files = Array.from(fileList);
  const pdfEntries: FolderPdfEntry[] = [];
  const filesByName: Record<string, File> = {};
  let rawMetaText: string | null = null;
  let folderName = 'Selected Folder';

  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = rel.split('/');
    if (parts.length > 1 && parts[0]) {
      folderName = parts[0];
    }
    // Only inspect direct children of the selected folder (depth <= 2)
    if (parts.length > 2) continue;

    if (file.name === FOLDER_DATA_FILENAME) {
      rawMetaText = await file.text();
      continue;
    }

    if (file.name.toLowerCase().endsWith('.pdf')) {
      pdfEntries.push({
        name: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
      });
      filesByName[file.name] = file;
    }
  }

  const parsedMeta = parseFolderMetadata(rawMetaText);
  const { activeDocuments, metadata } = mergeFolderPdfsWithMetadata(pdfEntries, parsedMeta);

  return {
    folderName,
    documents: activeDocuments,
    metadata,
    filesByName,
  };
}
