import React, { useRef, useState } from 'react';
import { FileUp, Maximize2, Trash2, BookOpen, RotateCcw, AlertCircle } from 'lucide-react';
import type { PdfDocumentRecord } from '../types/pdf';

interface LibraryViewProps {
  documents: PdfDocumentRecord[];
  isImporting: boolean;
  errorMessage: string | null;
  onImportFiles: (files: FileList | File[]) => void;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onRestoreSample: () => void;
  onClearError: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  documents,
  isImporting,
  errorMessage,
  onImportFiles,
  onOpenDocument,
  onDeleteDocument,
  onRestoreSample,
  onClearError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            tempPDF
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#library"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Documents
            </a>
            <a
              href="#gestures"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Gesture Rules
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>{isImporting ? 'Importing...' : 'Import PDF'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
              aria-label="Import PDF file"
            />
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-12">
        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-900 text-sm"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={onClearError}
              className="px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 rounded transition-colors whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Primary Focal Anchor: Import Dropzone */}
        <section aria-labelledby="import-heading">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed transition-colors p-8 md:p-10 bg-white ${
              isDragging
                ? 'border-amber-500 bg-amber-50/40'
                : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            <div className="max-w-2xl space-y-4">
              <h1
                id="import-heading"
                className="font-display text-3xl md:text-4xl font-bold tracking-tight text-slate-900 text-balance"
              >
                Landscape focus reading with straight-line highlights
              </h1>
              <p className="text-base text-slate-600 leading-relaxed">
                Drop any PDF here or pick a file to view it locked to full landscape screen width.
                Swipe horizontally across a line to lock a 100% opacity highlight strip while the rest
                of the document dims to your chosen opacity.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <FileUp className="w-4 h-4" aria-hidden="true" />
                  <span>Choose PDF File</span>
                </button>
                <span className="text-sm text-slate-500">
                  Stored locally in your browser · Base variant remains read-only
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Saved PDFs List */}
        <section id="library" aria-labelledby="library-heading" className="space-y-4">
          <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3">
            <h2
              id="library-heading"
              className="font-display text-xl font-semibold text-slate-900"
            >
              Your PDFs
            </h2>
            <span className="text-sm text-slate-500 font-mono-num">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'}
            </span>
          </div>

          {documents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
              <BookOpen className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-base font-medium text-slate-900">No PDFs in your library</p>
                <p className="text-sm text-slate-500">
                  Import a PDF document from your device or restore the built-in sample guide.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Import PDF
                </button>
                <button
                  type="button"
                  onClick={onRestoreSample}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>Restore Sample PDF</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
              {documents.map((doc) => {
                const totalHighlights = doc.variants.reduce(
                  (sum, v) => sum + v.highlights.length,
                  0
                );
                return (
                  <div
                    key={doc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                        {doc.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-mono-num">
                        <span>{doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.variants.length} {doc.variants.length === 1 ? 'variant' : 'variants'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{totalHighlights} {totalHighlights === 1 ? 'highlight' : 'highlights'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatFileSize(doc.fileSize)}</span>
                        {doc.greyscale && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Greyscale</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
                      >
                        <Maximize2 className="w-4 h-4" aria-hidden="true" />
                        <span>Open Landscape</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDocument(doc.id)}
                        aria-label={`Delete ${doc.name}`}
                        className="inline-flex items-center justify-center p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors min-h-[40px] min-w-[40px]"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Concise Gesture Reference */}
        <section id="gestures" aria-labelledby="gestures-heading" className="pt-2">
          <h2
            id="gestures-heading"
            className="font-display text-base font-semibold text-slate-900 mb-4"
          >
            How the Landscape Reader Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-200 pt-6">
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-900">01. Horizontal Swipe & Double-Tap Undo</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Drag horizontally across any line to draw a straight-line highlight in any of 20
                colors at 100% opacity. Double-tap anywhere to undo your last highlight.
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-900">02. Vertical Swipe to Scroll</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Swipe or scroll vertically to move smoothly through width-locked pages with zero
                accidental zooming.
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-900">03. Bottom Variant Slider</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Keep Base untouched and slide between your custom variants at the bottom. Create new
                variants or duplicate existing ones anytime.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
