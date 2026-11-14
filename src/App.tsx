import { useCallback, useEffect, useRef, useState } from 'react';
import type { HighlightRect, ImagePin, PdfDocumentRecord } from './types/pdf';
import { LibraryView, type FolderMode } from './components/LibraryView';
import { LandscapeReader } from './components/LandscapeReader';
import { FOLDER_DATA_FILENAME, serializeFolderMetadata, type FolderMetadataFile } from './utils/folderMetadata';
import {
  clearSavedFolderHandle,
  deleteImageAssetFromFolder,
  deletePdfFromFolder,
  isDirectoryPickerSupported,
  loadSavedFolderHandle,
  pickReadWriteFolder,
  readImageAssetFromFolder,
  scanFallbackDirectoryFiles,
  scanFolderHandle,
  verifyFolderPermission,
  writeFolderMetadata,
  writeImageAssetToFolder,
  writePdfFileToFolder,
  type FileSystemDirectoryHandleWithPerms,
} from './utils/folderStorage';
import { validatePdfHeader } from './utils/pdfLoader';
import { createSamplePdfBytes } from './utils/samplePdf';
import {
  addHighlightToVariant,
  addImagePinToVariant,
  clampHighlightWidth,
  clampOpacity,
  createId,
  createNewVariant,
  deleteVariantAt,
  duplicateVariant,
  isAssetReferencedInDocuments,
  removeHighlightFromVariant,
  removeImagePinFromVariant,
  renameVariantAt,
  undoLastHighlight,
} from './utils/variants';

export default function App() {
  const [folderMode, setFolderMode] = useState<FolderMode>('none');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PdfDocumentRecord[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<Blob | Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dirHandleRef = useRef<FileSystemDirectoryHandleWithPerms | null>(null);
  const fileHandlesRef = useRef<Record<string, FileSystemFileHandle>>({});
  const fallbackFilesRef = useRef<Record<string, File>>({});
  const fallbackAssetsRef = useRef<Map<string, Blob>>(new Map());
  const assetUrlCacheRef = useRef<Map<string, string>>(new Map());
  const metadataRef = useRef<FolderMetadataFile>({
    version: 1,
    updatedAt: Date.now(),
    documents: {},
  });

  useEffect(() => {
    const cache = assetUrlCacheRef.current;
    return () => {
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, []);

  const applyScannedHandle = useCallback(
    async (handle: FileSystemDirectoryHandleWithPerms) => {
      dirHandleRef.current = handle;
      fallbackFilesRef.current = {};
      const scan = await scanFolderHandle(handle);
      fileHandlesRef.current = scan.fileHandlesByName;
      metadataRef.current = scan.metadata;
      setFolderName(scan.folderName);
      setDocuments(scan.documents);
      setFolderMode('readwrite');

      // Ensure .temppdf-data.json is initialized if PDFs exist in folder
      if (scan.documents.length > 0) {
        metadataRef.current = await writeFolderMetadata(
          handle,
          scan.documents,
          scan.metadata
        );
      }
    },
    []
  );

  // On startup, check if user previously linked a folder handle
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedHandle = await loadSavedFolderHandle();
        if (!mounted || !savedHandle) return;

        const hasGrant = await verifyFolderPermission(savedHandle, false);
        if (!mounted) return;

        if (hasGrant) {
          await applyScannedHandle(savedHandle);
        } else {
          dirHandleRef.current = savedHandle;
          setFolderName(savedHandle.name);
          setFolderMode('pending-permission');
        }
      } catch (err) {
        console.error('Failed to restore saved folder:', err);
        await clearSavedFolderHandle();
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [applyScannedHandle]);

  const persistMetadataToFolder = useCallback(
    (nextDocs: PdfDocumentRecord[]) => {
      const handle = dirHandleRef.current;
      if (!handle || folderMode !== 'readwrite') return;
      writeFolderMetadata(handle, nextDocs, metadataRef.current)
        .then((nextMeta) => {
          metadataRef.current = nextMeta;
        })
        .catch((err) => {
          console.error('Failed to write .temppdf-data.json to folder:', err);
          setErrorMessage('Could not write .temppdf-data.json to the folder. Check write permissions.');
        });
    },
    [folderMode]
  );

  const updateActiveDocument = useCallback(
    (updater: (doc: PdfDocumentRecord) => PdfDocumentRecord) => {
      setDocuments((prev) => {
        const nextDocs = prev.map((doc) =>
          doc.id === activeDocId ? updater(doc) : doc
        );
        persistMetadataToFolder(nextDocs);
        return nextDocs;
      });
    },
    [activeDocId, persistMetadataToFolder]
  );

  const handleChooseFolder = async () => {
    setErrorMessage(null);
    if (!isDirectoryPickerSupported()) {
      setErrorMessage(
        'Direct folder read/write requires Chrome or Edge. Use "Browse Folder (Compatibility)" instead.'
      );
      return;
    }

    setIsBusy(true);
    try {
      const handle = await pickReadWriteFolder();
      const granted = await verifyFolderPermission(handle, true);
      if (!granted) {
        setErrorMessage('Read/write folder permission is required to load PDFs and store data.');
        return;
      }
      await applyScannedHandle(handle);
    } catch (err) {
      const errObj = err as { name?: string };
      if (errObj?.name === 'AbortError') {
        return;
      }
      if (errObj?.name === 'SecurityError') {
        setErrorMessage(
          'Folder picker was blocked inside this embedded frame. Open the app in a standalone browser tab or use "Browse Folder (Compatibility)".'
        );
        return;
      }
      console.error('Folder selection failed:', err);
      setErrorMessage('Could not open the selected folder.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReconnectFolder = async () => {
    const handle = dirHandleRef.current;
    if (!handle) {
      await handleChooseFolder();
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const granted = await verifyFolderPermission(handle, true);
      if (!granted) {
        setErrorMessage('Folder permission was not granted.');
        return;
      }
      await applyScannedHandle(handle);
    } catch (err) {
      console.error('Reconnect folder failed:', err);
      setErrorMessage('Could not reconnect to the folder. Try selecting it again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRefreshFolder = async () => {
    const handle = dirHandleRef.current;
    if (!handle) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await applyScannedHandle(handle);
    } catch (err) {
      console.error('Folder refresh failed:', err);
      setErrorMessage('Could not refresh the folder contents.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleFallbackFolderSelected = async (fileList: FileList) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      dirHandleRef.current = null;
      fileHandlesRef.current = {};
      const scan = await scanFallbackDirectoryFiles(fileList);
      fallbackFilesRef.current = scan.filesByName;
      metadataRef.current = scan.metadata;
      setFolderName(scan.folderName);
      setDocuments(scan.documents);
      setFolderMode('readonly-fallback');
    } catch (err) {
      console.error('Fallback folder load failed:', err);
      setErrorMessage('Could not read the selected folder.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportFallbackMetadata = () => {
    const json = serializeFolderMetadata(documents, metadataRef.current);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = FOLDER_DATA_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const openDocumentById = useCallback(
    async (docId: string, requestFs = false) => {
      const targetDoc = documents.find((d) => d.id === docId);
      if (!targetDoc) return;

      if (requestFs && typeof document !== 'undefined') {
        try {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
            const orientation = screen.orientation as ScreenOrientation & {
              lock?: (type: string) => Promise<void>;
            };
            orientation?.lock?.('landscape').catch(() => {});
          }
        } catch {
          // Ignore if fullscreen is blocked
        }
      }

      try {
        let source: Blob | null = null;
        if (folderMode === 'readwrite') {
          const fileHandle = fileHandlesRef.current[targetDoc.name];
          if (fileHandle) {
            source = await fileHandle.getFile();
          }
        } else if (folderMode === 'readonly-fallback') {
          source = fallbackFilesRef.current[targetDoc.name] ?? null;
        }

        if (!source) {
          setErrorMessage(`Could not find "${targetDoc.name}" in the connected folder. Try Refresh.`);
          return;
        }

        setActiveSource(source);
        setActiveDocId(docId);
      } catch (err) {
        console.error('Failed to read PDF from folder:', err);
        setErrorMessage(`Could not read "${targetDoc.name}" from the folder.`);
      }
    },
    [documents, folderMode]
  );

  const handleImportFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const handle = dirHandleRef.current;
    if (folderMode !== 'readwrite' || !handle) {
      setErrorMessage('Connect a writable folder first to add PDFs into it.');
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      let lastAddedName: string | null = null;
      for (const file of files) {
        const isPdfMime = file.type === 'application/pdf';
        const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
        if (!isPdfMime && !isPdfExt) {
          setErrorMessage(`"${file.name}" is not a PDF file.`);
          continue;
        }
        const hasHeader = await validatePdfHeader(file);
        if (!hasHeader) {
          setErrorMessage(`"${file.name}" does not appear to be a valid PDF document.`);
          continue;
        }

        await writePdfFileToFolder(handle, file);
        lastAddedName = file.name;
      }

      const scan = await scanFolderHandle(handle);
      fileHandlesRef.current = scan.fileHandlesByName;
      metadataRef.current = await writeFolderMetadata(handle, scan.documents, scan.metadata);
      setDocuments(scan.documents);

      if (files.length === 1 && lastAddedName) {
        const addedDoc = scan.documents.find((d) => d.name === lastAddedName);
        if (addedDoc) {
          const fileHandle = fileHandlesRef.current[addedDoc.name];
          if (fileHandle) {
            const fileBlob = await fileHandle.getFile();
            setActiveSource(fileBlob);
            setActiveDocId(addedDoc.id);
          }
        }
      }
    } catch (err) {
      console.error('Failed adding PDF to folder:', err);
      setErrorMessage('Could not write the PDF into the folder.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateSampleInFolder = async () => {
    const handle = dirHandleRef.current;
    if (folderMode !== 'readwrite' || !handle) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const sampleBytes = createSamplePdfBytes();
      const sampleFile = new File(
        [sampleBytes.slice().buffer],
        'Active Recall & Visual Focus.pdf',
        { type: 'application/pdf' }
      );
      await writePdfFileToFolder(handle, sampleFile);
      await applyScannedHandle(handle);
    } catch (err) {
      console.error('Failed creating sample PDF in folder:', err);
      setErrorMessage('Could not create sample PDF in folder.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const targetDoc = documents.find((d) => d.id === docId);
    const handle = dirHandleRef.current;
    if (!targetDoc || !handle || folderMode !== 'readwrite') return;

    setIsBusy(true);
    setErrorMessage(null);
    try {
      const candidateAssets = targetDoc.variants.flatMap((v) =>
        (v.imagePins ?? []).map((p) => p.assetFileName)
      );
      const remaining = documents.filter((d) => d.id !== docId);
      metadataRef.current = await deletePdfFromFolder(
        handle,
        targetDoc.name,
        remaining,
        metadataRef.current
      );
      delete fileHandlesRef.current[targetDoc.name];
      setDocuments(remaining);
      cleanupUnreferencedAssets(candidateAssets, remaining);
      if (activeDocId === docId) {
        setActiveDocId(null);
        setActiveSource(null);
      }
    } catch (err) {
      console.error('Failed deleting PDF from folder:', err);
      setErrorMessage(`Could not delete "${targetDoc.name}" from the folder.`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveImageAsset = useCallback(
    async (
      file: File
    ): Promise<{ assetFileName: string; originalName: string; mimeType: string }> => {
      const extFromName = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const extFromMime = file.type.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const ext = extFromName || extFromMime || 'png';
      const assetFileName = `${createId('asset')}.${ext}`;

      if (folderMode === 'readwrite' && dirHandleRef.current) {
        await writeImageAssetToFolder(dirHandleRef.current, assetFileName, file);
      } else {
        fallbackAssetsRef.current.set(assetFileName, file);
      }

      const objectUrl = URL.createObjectURL(file);
      assetUrlCacheRef.current.set(assetFileName, objectUrl);

      return {
        assetFileName,
        originalName: file.name,
        mimeType: file.type || 'image/png',
      };
    },
    [folderMode]
  );

  const handleLoadImageAssetUrl = useCallback(
    async (assetFileName: string): Promise<string | null> => {
      const cached = assetUrlCacheRef.current.get(assetFileName);
      if (cached) return cached;

      let blob: Blob | null = null;
      if (folderMode === 'readwrite' && dirHandleRef.current) {
        blob = await readImageAssetFromFolder(dirHandleRef.current, assetFileName);
      } else {
        blob = fallbackAssetsRef.current.get(assetFileName) ?? null;
      }

      if (!blob) return null;
      const objectUrl = URL.createObjectURL(blob);
      assetUrlCacheRef.current.set(assetFileName, objectUrl);
      return objectUrl;
    },
    [folderMode]
  );

  const cleanupUnreferencedAssets = useCallback(
    (candidateAssetNames: string[], nextDocs: PdfDocumentRecord[]) => {
      const handle = dirHandleRef.current;
      for (const assetName of candidateAssetNames) {
        if (!assetName) continue;
        if (!isAssetReferencedInDocuments(nextDocs, assetName)) {
          const cachedUrl = assetUrlCacheRef.current.get(assetName);
          if (cachedUrl) {
            URL.revokeObjectURL(cachedUrl);
            assetUrlCacheRef.current.delete(assetName);
          }
          fallbackAssetsRef.current.delete(assetName);
          if (handle && folderMode === 'readwrite') {
            deleteImageAssetFromFolder(handle, assetName).catch(() => {});
          }
        }
      }
    },
    [folderMode]
  );

  const activeDoc = documents.find((d) => d.id === activeDocId) ?? null;

  const handleUndoHighlight = (): boolean => {
    if (!activeDoc) return false;
    const safeIdx = Math.min(
      Math.max(0, activeDoc.activeVariantIndex),
      Math.max(0, activeDoc.variants.length - 1)
    );
    const activeVar = activeDoc.variants[safeIdx];
    if (!activeVar || activeVar.isBase || activeVar.highlights.length === 0) {
      return false;
    }

    updateActiveDocument((doc) => {
      const idx = Math.min(
        Math.max(0, doc.activeVariantIndex),
        Math.max(0, doc.variants.length - 1)
      );
      return {
        ...doc,
        variants: doc.variants.map((v, i) =>
          i === idx ? undoLastHighlight(v).variant : v
        ),
      };
    });
    return true;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-medium text-slate-500">Checking linked folder...</p>
      </div>
    );
  }

  if (activeDoc && activeSource) {
    return (
      <LandscapeReader
        documentRecord={activeDoc}
        pdfSource={activeSource}
        onExit={() => {
          setActiveDocId(null);
          setActiveSource(null);
        }}
        onPagesResolved={(numPages) => {
          if (activeDoc.pageCount !== numPages) {
            updateActiveDocument((doc) => ({ ...doc, pageCount: numPages }));
          }
        }}
        onToggleGreyscale={(greyscale) =>
          updateActiveDocument((doc) => ({ ...doc, greyscale }))
        }
        onChangeOpacity={(opacity) =>
          updateActiveDocument((doc) => ({ ...doc, opacity: clampOpacity(opacity) }))
        }
        onChangeHighlightColor={(highlightColor) =>
          updateActiveDocument((doc) => ({ ...doc, highlightColor }))
        }
        onChangeHighlightWidth={(highlightWidth) =>
          updateActiveDocument((doc) => ({
            ...doc,
            highlightWidth: clampHighlightWidth(highlightWidth),
          }))
        }
        onSelectVariant={(index) =>
          updateActiveDocument((doc) => ({
            ...doc,
            activeVariantIndex: Math.min(
              Math.max(0, index),
              Math.max(0, doc.variants.length - 1)
            ),
          }))
        }
        onCreateVariant={() =>
          updateActiveDocument((doc) => {
            const nextVar = createNewVariant(doc.variants);
            const variants = [...doc.variants, nextVar];
            return {
              ...doc,
              variants,
              activeVariantIndex: variants.length - 1,
            };
          })
        }
        onDuplicateVariant={() =>
          updateActiveDocument((doc) => {
            const safeIdx = Math.min(
              Math.max(0, doc.activeVariantIndex),
              doc.variants.length - 1
            );
            const source = doc.variants[safeIdx];
            if (!source) return doc;
            const copy = duplicateVariant(source, doc.variants);
            const variants = [...doc.variants, copy];
            return {
              ...doc,
              variants,
              activeVariantIndex: variants.length - 1,
            };
          })
        }
        onRenameVariant={(index, name) =>
          updateActiveDocument((doc) => ({
            ...doc,
            variants: renameVariantAt(doc.variants, index, name),
          }))
        }
        onDeleteVariant={(index) => {
          const targetVar = activeDoc.variants[index];
          const candidateAssets = (targetVar?.imagePins ?? []).map((p) => p.assetFileName);
          setDocuments((prev) => {
            const nextDocs = prev.map((doc) => {
              if (doc.id !== activeDocId) return doc;
              const { variants, activeVariantIndex } = deleteVariantAt(
                doc.variants,
                index,
                doc.activeVariantIndex
              );
              return { ...doc, variants, activeVariantIndex };
            });
            persistMetadataToFolder(nextDocs);
            cleanupUnreferencedAssets(candidateAssets, nextDocs);
            return nextDocs;
          });
        }}
        onAddHighlight={(hl: HighlightRect) =>
          updateActiveDocument((doc) => {
            const safeIdx = Math.min(
              Math.max(0, doc.activeVariantIndex),
              Math.max(0, doc.variants.length - 1)
            );
            return {
              ...doc,
              variants: doc.variants.map((v, idx) =>
                idx === safeIdx ? addHighlightToVariant(v, hl) : v
              ),
            };
          })
        }
        onRemoveHighlight={(hlId: string) =>
          updateActiveDocument((doc) => {
            const safeIdx = Math.min(
              Math.max(0, doc.activeVariantIndex),
              Math.max(0, doc.variants.length - 1)
            );
            return {
              ...doc,
              variants: doc.variants.map((v, idx) =>
                idx === safeIdx ? removeHighlightFromVariant(v, hlId) : v
              ),
            };
          })
        }
        onUndoHighlight={handleUndoHighlight}
        onSaveImageAsset={handleSaveImageAsset}
        onLoadImageAssetUrl={handleLoadImageAssetUrl}
        onAddImagePin={(pin: ImagePin) =>
          updateActiveDocument((doc) => {
            const safeIdx = Math.min(
              Math.max(0, doc.activeVariantIndex),
              Math.max(0, doc.variants.length - 1)
            );
            return {
              ...doc,
              variants: doc.variants.map((v, idx) =>
                idx === safeIdx ? addImagePinToVariant(v, pin) : v
              ),
            };
          })
        }
        onRemoveImagePin={(pinId: string) => {
          const safeIdx = Math.min(
            Math.max(0, activeDoc.activeVariantIndex),
            Math.max(0, activeDoc.variants.length - 1)
          );
          const removedPin = (activeDoc.variants[safeIdx]?.imagePins ?? []).find(
            (p) => p.id === pinId
          );
          setDocuments((prev) => {
            const nextDocs = prev.map((doc) => {
              if (doc.id !== activeDocId) return doc;
              const idx = Math.min(
                Math.max(0, doc.activeVariantIndex),
                Math.max(0, doc.variants.length - 1)
              );
              return {
                ...doc,
                variants: doc.variants.map((v, i) =>
                  i === idx ? removeImagePinFromVariant(v, pinId) : v
                ),
              };
            });
            persistMetadataToFolder(nextDocs);
            if (removedPin) {
              cleanupUnreferencedAssets([removedPin.assetFileName], nextDocs);
            }
            return nextDocs;
          });
        }}
      />
    );
  }

  return (
    <LibraryView
      folderMode={folderMode}
      folderName={folderName}
      documents={documents}
      isBusy={isBusy}
      errorMessage={errorMessage}
      onChooseFolder={handleChooseFolder}
      onReconnectFolder={handleReconnectFolder}
      onRefreshFolder={handleRefreshFolder}
      onFallbackFolderSelected={handleFallbackFolderSelected}
      onImportFiles={handleImportFiles}
      onCreateSampleInFolder={handleCreateSampleInFolder}
      onExportFallbackMetadata={handleExportFallbackMetadata}
      onOpenDocument={(id) => openDocumentById(id, true)}
      onDeleteDocument={handleDeleteDocument}
      onClearError={() => setErrorMessage(null)}
    />
  );
}
