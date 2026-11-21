import type { PdfDocumentRecord } from '../types/pdf';
import {
  FOLDER_DATA_FILENAME,
  mergeFolderPdfsWithMetadata,
  parseFolderMetadata,
  serializeFolderMetadata,
  type FolderMetadataFile,
  type FolderPdfEntry,
} from './folderMetadata';
import {
  joinRelativePath,
  normalizeRelativePath,
  splitParentAndBaseName,
} from './folderTree';

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
  dirHandlesByPath: Record<string, FileSystemDirectoryHandleWithPerms>;
  subfolders: string[];
}

export async function scanFolderHandle(
  dirHandle: FileSystemDirectoryHandleWithPerms
): Promise<FolderScanResult> {
  const pdfEntries: FolderPdfEntry[] = [];
  const fileHandlesByName: Record<string, FileSystemFileHandle> = {};
  const dirHandlesByPath: Record<string, FileSystemDirectoryHandleWithPerms> = {
    '': dirHandle,
  };
  const subfoldersSet = new Set<string>();
  let rawMetadataText: string | null = null;

  const walkDirectory = async (
    currentDir: FileSystemDirectoryHandleWithPerms,
    prefixPath: string
  ) => {
    for await (const entry of currentDir.values()) {
      if (
        prefixPath === '' &&
        entry.kind === 'file' &&
        entry.name === FOLDER_DATA_FILENAME
      ) {
        const fileHandle = entry as FileSystemFileHandle;
        try {
          const metaFile = await fileHandle.getFile();
          rawMetadataText = await metaFile.text();
        } catch {
          rawMetadataText = null;
        }
        continue;
      }

      // Skip hidden files/folders such as .temppdf-assets, .git, .DS_Store
      if (entry.name.startsWith('.')) {
        continue;
      }

      if (entry.kind === 'directory') {
        const subPath = joinRelativePath(prefixPath, entry.name);
        const subDirHandle = entry as FileSystemDirectoryHandleWithPerms;
        subfoldersSet.add(subPath);
        dirHandlesByPath[subPath] = subDirHandle;
        await walkDirectory(subDirHandle, subPath);
        continue;
      }

      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const relPath = joinRelativePath(prefixPath, entry.name);
        pdfEntries.push({
          name: relPath,
          fileSize: file.size,
          lastModified: file.lastModified,
        });
        fileHandlesByName[relPath] = fileHandle;
      }
    }
  };

  await walkDirectory(dirHandle, '');

  const parsedMeta = parseFolderMetadata(rawMetadataText);
  const { activeDocuments, metadata } = mergeFolderPdfsWithMetadata(pdfEntries, parsedMeta);
  const subfolders = Array.from(subfoldersSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

  return {
    folderName: dirHandle.name,
    documents: activeDocuments,
    metadata,
    fileHandlesByName,
    dirHandlesByPath,
    subfolders,
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

async function resolveDirectoryHandle(
  rootDirHandle: FileSystemDirectoryHandleWithPerms,
  relativeDirPath: string,
  create: boolean,
  cachedDirHandles?: Record<string, FileSystemDirectoryHandleWithPerms>
): Promise<FileSystemDirectoryHandleWithPerms> {
  const cleanPath = normalizeRelativePath(relativeDirPath);
  if (!cleanPath) return rootDirHandle;

  const cached = cachedDirHandles?.[cleanPath];
  if (cached) return cached;

  const segments = cleanPath.split('/');
  let current: FileSystemDirectoryHandleWithPerms = rootDirHandle;
  for (const segment of segments) {
    current = (await current.getDirectoryHandle(segment, {
      create,
    })) as FileSystemDirectoryHandleWithPerms;
  }
  return current;
}

export async function writePdfFileToFolder(
  rootDirHandle: FileSystemDirectoryHandleWithPerms,
  file: File,
  targetSubfolderPath = '',
  cachedDirHandles?: Record<string, FileSystemDirectoryHandleWithPerms>
): Promise<{ fileHandle: FileSystemFileHandle; relativePath: string }> {
  const cleanSubfolder = normalizeRelativePath(targetSubfolderPath);
  const targetDir = await resolveDirectoryHandle(
    rootDirHandle,
    cleanSubfolder,
    true,
    cachedDirHandles
  );
  const fileHandle = await targetDir.getFileHandle(file.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return {
    fileHandle,
    relativePath: joinRelativePath(cleanSubfolder, file.name),
  };
}

export const FOLDER_ASSETS_DIR = '.temppdf-assets';

export async function writeImageAssetToFolder(
  dirHandle: FileSystemDirectoryHandleWithPerms,
  assetFileName: string,
  file: Blob
): Promise<void> {
  const assetsDir = await dirHandle.getDirectoryHandle(FOLDER_ASSETS_DIR, { create: true });
  const fileHandle = await assetsDir.getFileHandle(assetFileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

export async function readImageAssetFromFolder(
  dirHandle: FileSystemDirectoryHandleWithPerms,
  assetFileName: string
): Promise<File | null> {
  try {
    const assetsDir = await dirHandle.getDirectoryHandle(FOLDER_ASSETS_DIR, { create: false });
    const fileHandle = await assetsDir.getFileHandle(assetFileName, { create: false });
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function deleteImageAssetFromFolder(
  dirHandle: FileSystemDirectoryHandleWithPerms,
  assetFileName: string
): Promise<void> {
  try {
    const assetsDir = await dirHandle.getDirectoryHandle(FOLDER_ASSETS_DIR, { create: false });
    await assetsDir.removeEntry(assetFileName);
  } catch {
    // Ignore if already absent
  }
}

export async function deletePdfFromFolder(
  rootDirHandle: FileSystemDirectoryHandleWithPerms,
  relativeFilePath: string,
  remainingDocuments: PdfDocumentRecord[],
  existingMetadata?: FolderMetadataFile,
  cachedDirHandles?: Record<string, FileSystemDirectoryHandleWithPerms>
): Promise<FolderMetadataFile> {
  const { parentPath, baseName } = splitParentAndBaseName(relativeFilePath);
  const parentDir = await resolveDirectoryHandle(
    rootDirHandle,
    parentPath,
    false,
    cachedDirHandles
  );
  await parentDir.removeEntry(baseName);

  const cleanedDocs = { ...(existingMetadata?.documents ?? {}) };
  delete cleanedDocs[relativeFilePath];
  const baseMeta: FolderMetadataFile = {
    version: 1,
    updatedAt: Date.now(),
    documents: cleanedDocs,
  };
  return writeFolderMetadata(rootDirHandle, remainingDocuments, baseMeta);
}

/**
 * Fallback scanner for browsers / embedded iframes where showDirectoryPicker is restricted.
 * Reads files selected via <input type="file" webkitdirectory /> including nested subfolders.
 */
export async function scanFallbackDirectoryFiles(fileList: FileList): Promise<{
  folderName: string;
  documents: PdfDocumentRecord[];
  metadata: FolderMetadataFile;
  filesByName: Record<string, File>;
  subfolders: string[];
}> {
  const files = Array.from(fileList);
  const pdfEntries: FolderPdfEntry[] = [];
  const filesByName: Record<string, File> = {};
  const subfoldersSet = new Set<string>();
  let rawMetaText: string | null = null;
  let folderName = 'Selected Folder';

  for (const file of files) {
    const rawRel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = normalizeRelativePath(rawRel).split('/').filter(Boolean);
    if (parts.length === 0) continue;

    if (parts.length > 1 && parts[0]) {
      folderName = parts[0];
    }

    const relParts = parts.length > 1 ? parts.slice(1) : parts;
    if (relParts.length === 0) continue;

    if (relParts.length === 1 && relParts[0] === FOLDER_DATA_FILENAME) {
      rawMetaText = await file.text();
      continue;
    }

    // Ignore hidden files/folders such as .temppdf-assets or .DS_Store at any depth
    if (relParts.some((segment) => segment.startsWith('.'))) {
      continue;
    }

    // Record all intermediate subfolder paths
    if (relParts.length > 1) {
      let acc = '';
      for (let i = 0; i < relParts.length - 1; i++) {
        acc = acc ? `${acc}/${relParts[i]}` : relParts[i];
        subfoldersSet.add(acc);
      }
    }

    const leafName = relParts[relParts.length - 1];
    if (leafName.toLowerCase().endsWith('.pdf')) {
      const relPath = relParts.join('/');
      pdfEntries.push({
        name: relPath,
        fileSize: file.size,
        lastModified: file.lastModified,
      });
      filesByName[relPath] = file;
    }
  }

  const parsedMeta = parseFolderMetadata(rawMetaText);
  const { activeDocuments, metadata } = mergeFolderPdfsWithMetadata(pdfEntries, parsedMeta);
  const subfolders = Array.from(subfoldersSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

  return {
    folderName,
    documents: activeDocuments,
    metadata,
    filesByName,
    subfolders,
  };
}
