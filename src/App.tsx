import { useCallback, useEffect, useState } from 'react';
import type { HighlightRect, PdfDocumentRecord } from './types/pdf';
import { LibraryView } from './components/LibraryView';
import { LandscapeReader } from './components/LandscapeReader';
import { parsePdfBytes } from './utils/pdfLoader';
import {
  deletePdfRecord,
  ensureSamplePdfSeeded,
  loadPdfBytes,
  restoreSamplePdf,
  saveDocumentRecord,
  savePdfFile,
} from './utils/storage';
import {
  addHighlightToVariant,
  clampOpacity,
  createBaseVariant,
  createId,
  createNewVariant,
  deleteVariantAt,
  duplicateVariant,
  removeHighlightFromVariant,
} from './utils/variants';

export default function App() {
  const [documents, setDocuments] = useState<PdfDocumentRecord[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeBytes, setActiveBytes] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openDocumentById = useCallback(async (docId: string, requestFs = false) => {
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

    const bytes = await loadPdfBytes(docId);
    if (!bytes) {
      setErrorMessage('Could not load the stored PDF data. Try re-importing the file.');
      return;
    }
    setActiveBytes(bytes);
    setActiveDocId(docId);
  }, []);

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
      let lastImportedId: string | null = null;

      for (const file of files) {
        const isPdfMime = file.type === 'application/pdf';
        const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
        if (!isPdfMime && !isPdfExt) {
          setErrorMessage(`"${file.name}" is not a PDF file. Please select a .pdf document.`);
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Validate PDF structure and page count via pdfjs-dist
        const parsed = await parsePdfBytes(bytes);
        const pageCount = parsed.numPages;
        await parsed.cleanup();

        const now = Date.now();
        const record: PdfDocumentRecord = {
          id: createId('pdf'),
          name: file.name,
          fileSize: file.size,
          pageCount,
          addedAt: now,
          greyscale: false,
          opacity: 1,
          activeVariantIndex: 0,
          variants: [createBaseVariant(now)],
        };

        await savePdfFile(record, bytes);
        newlyAdded.push(record);
        lastImportedId = record.id;
      }

      if (newlyAdded.length > 0) {
        setDocuments((prev) => [...newlyAdded.reverse(), ...prev]);
        // Automatically open newly imported PDF in landscape full-screen reader
        if (files.length === 1 && lastImportedId) {
          await openDocumentById(lastImportedId, true);
        }
      }
    } catch (err) {
      console.error('PDF import failed:', err);
      setErrorMessage('Could not parse the selected PDF file. Please verify it is a valid, unencrypted PDF.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    await deletePdfRecord(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    if (activeDocId === docId) {
      setActiveDocId(null);
      setActiveBytes(null);
    }
  };

  const handleRestoreSample = async () => {
    const sample = await restoreSamplePdf();
    setDocuments((prev) => [sample, ...prev]);
  };

  const activeDoc = documents.find((d) => d.id === activeDocId) ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-medium text-slate-500">Loading tempPDF...</p>
      </div>
    );
  }

  if (activeDoc && activeBytes) {
    return (
      <LandscapeReader
        documentRecord={activeDoc}
        pdfBytes={activeBytes}
        onExit={() => {
          setActiveDocId(null);
          setActiveBytes(null);
        }}
        onToggleGreyscale={(greyscale) =>
          updateActiveDocument((doc) => ({ ...doc, greyscale }))
        }
        onChangeOpacity={(opacity) =>
          updateActiveDocument((doc) => ({ ...doc, opacity: clampOpacity(opacity) }))
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
