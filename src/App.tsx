import { useCallback, useEffect, useState } from 'react';
import type { HighlightRect, PdfDocumentRecord } from './types/pdf';
import { LibraryView } from './components/LibraryView';
import { LandscapeReader } from './components/LandscapeReader';
import { DEFAULT_HIGHLIGHT_COLOR } from './utils/colors';
import { validatePdfHeader } from './utils/pdfLoader';
import {
  deletePdfRecord,
  ensureSamplePdfSeeded,
  loadPdfBlob,
  restoreSamplePdf,
  saveDocumentRecord,
  savePdfFile,
} from './utils/storage';
import {
  addHighlightToVariant,
  clampHighlightWidth,
  clampOpacity,
  createBaseVariant,
  createId,
  createNewVariant,
  DEFAULT_HIGHLIGHT_WIDTH,
  deleteVariantAt,
  duplicateVariant,
  removeHighlightFromVariant,
  renameVariantAt,
  undoLastHighlight,
} from './utils/variants';

export default function App() {
  const [documents, setDocuments] = useState<PdfDocumentRecord[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<Blob | Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openDocumentById = useCallback(
    async (docId: string, requestFs = false, preloadedSource?: Blob | Uint8Array) => {
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
          // Ignore if fullscreen is blocked outside user gesture or in iframe
        }
      }

      const source = preloadedSource ?? (await loadPdfBlob(docId));
      if (!source) {
        setErrorMessage('Could not load the stored PDF data. Try re-importing the file.');
        return;
      }
      setActiveSource(source);
      setActiveDocId(docId);
    },
    []
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const seeded = await ensureSamplePdfSeeded();
        if (!mounted) return;
        setDocuments(seeded);

        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === '1' && seeded.length > 0) {
          await openDocumentById(seeded[0].id, false);
        }
      } catch (err) {
        console.error('Failed to initialize library:', err);
        if (mounted) {
          setErrorMessage('Failed to access browser storage.');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [openDocumentById]);

  const updateActiveDocument = useCallback(
    (updater: (doc: PdfDocumentRecord) => PdfDocumentRecord) => {
      setDocuments((prev) =>
        prev.map((doc) => {
          if (doc.id !== activeDocId) return doc;
          const updated = updater(doc);
          saveDocumentRecord(updated).catch((err) =>
            console.error('Failed to persist document update:', err)
          );
          return updated;
        })
      );
    },
    [activeDocId]
  );

  const handleImportFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const newlyAdded: PdfDocumentRecord[] = [];
      let lastImported: { record: PdfDocumentRecord; file: File } | null = null;

      for (const file of files) {
        const isPdfMime = file.type === 'application/pdf';
        const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
        if (!isPdfMime && !isPdfExt) {
          setErrorMessage(`"${file.name}" is not a PDF file. Please select a .pdf document.`);
          continue;
        }

        const hasHeader = await validatePdfHeader(file);
        if (!hasHeader) {
          setErrorMessage(`"${file.name}" does not appear to be a valid PDF document.`);
          continue;
        }

        const now = Date.now();
        const record: PdfDocumentRecord = {
          id: createId('pdf'),
          name: file.name,
          fileSize: file.size,
          pageCount: 1, // Updated automatically once LandscapeReader resolves pdf.numPages
          addedAt: now,
          greyscale: false,
          opacity: 1,
          highlightColor: DEFAULT_HIGHLIGHT_COLOR,
          highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
          activeVariantIndex: 0,
          variants: [createBaseVariant(now)],
        };

        // Persist Blob without duplicate full-file parsing or extra memory copies
        await savePdfFile(record, file);
        newlyAdded.push(record);
        lastImported = { record, file };
      }

      if (newlyAdded.length > 0) {
        setDocuments((prev) => [...newlyAdded.reverse(), ...prev]);
        if (files.length === 1 && lastImported) {
          await openDocumentById(lastImported.record.id, true, lastImported.file);
        }
      }
    } catch (err) {
      console.error('PDF import failed:', err);
      setErrorMessage('Could not import the selected PDF file. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    await deletePdfRecord(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    if (activeDocId === docId) {
      setActiveDocId(null);
      setActiveSource(null);
    }
  };

  const handleRestoreSample = async () => {
    const sample = await restoreSamplePdf();
    setDocuments((prev) => [sample, ...prev]);
  };

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
        <p className="text-sm font-medium text-slate-500">Loading tempPDF...</p>
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
        onDeleteVariant={(index) =>
          updateActiveDocument((doc) => {
            const { variants, activeVariantIndex } = deleteVariantAt(
              doc.variants,
              index,
              doc.activeVariantIndex
            );
            return {
              ...doc,
              variants,
              activeVariantIndex,
            };
          })
        }
        onAddHighlight={(hl: HighlightRect) =>
          updateActiveDocument((doc) => {
            const safeIdx = Math.min(
              Math.max(0, doc.activeVariantIndex),
              doc.variants.length - 1
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
              doc.variants.length - 1
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
      />
    );
  }

  return (
    <LibraryView
      documents={documents}
      isImporting={isImporting}
      errorMessage={errorMessage}
      onImportFiles={handleImportFiles}
      onOpenDocument={(id) => openDocumentById(id, true)}
      onDeleteDocument={handleDeleteDocument}
      onRestoreSample={handleRestoreSample}
      onClearError={() => setErrorMessage(null)}
    />
  );
}
