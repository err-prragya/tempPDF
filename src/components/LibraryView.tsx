import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FilePlus2,
  FileUp,
  FolderOpen,
  FolderSync,
  Maximize2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { PdfDocumentRecord } from '../types/pdf';

export type FolderMode = 'none' | 'pending-permission' | 'readwrite' | 'readonly-fallback';

interface LibraryViewProps {
  folderMode: FolderMode;
  folderName: string | null;
  documents: PdfDocumentRecord[];
  isBusy: boolean;
  errorMessage: string | null;
  onChooseFolder: () => void;
  onReconnectFolder: () => void;
  onRefreshFolder: () => void;
  onFallbackFolderSelected: (files: FileList) => void;
  onImportFiles: (files: FileList | File[]) => void;
  onCreateSampleInFolder: () => void;
  onExportFallbackMetadata: () => void;
  onOpenDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onClearError: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  folderMode,
  folderName,
  documents,
  isBusy,
  errorMessage,
  onChooseFolder,
  onReconnectFolder,
  onRefreshFolder,
  onFallbackFolderSelected,
  onImportFiles,
  onCreateSampleInFolder,
  onExportFallbackMetadata,
  onOpenDocument,
  onDeleteDocument,
  onClearError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fallbackDirInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isConnected = folderMode === 'readwrite' || folderMode === 'readonly-fallback';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleFallbackDirChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFallbackFolderSelected(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isConnected) return;
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
              Folder Library
            </a>
            <a
              href="#gestures"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Gesture Rules
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            {isConnected ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <FileUp className="w-4 h-4" aria-hidden="true" />
                <span>{isBusy ? 'Working...' : 'Add PDF'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onChooseFolder}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
                <span>{isBusy ? 'Opening...' : 'Choose Folder'}</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
              aria-label="Add PDF file to folder"
            />
            <input
              ref={(el) => {
                fallbackDirInputRef.current = el;
                if (el) {
                  el.setAttribute('webkitdirectory', '');
                  el.setAttribute('directory', '');
                }
              }}
              type="file"
              multiple
              onChange={handleFallbackDirChange}
              className="hidden"
              aria-label="Select folder fallback"
            />
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-10">
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

        {/* Folder Connection / Dropzone Hero */}
        <section aria-labelledby="folder-heading">
          {folderMode === 'pending-permission' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 md:p-10 space-y-5">
              <div className="max-w-2xl space-y-3">
                <h1
                  id="folder-heading"
                  className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance"
                >
                  Reconnect your PDF folder
                </h1>
                <p className="text-base text-slate-600 leading-relaxed">
                  Your browser saved a link to{' '}
                  <span className="font-semibold text-slate-900">{folderName}</span>. Grant
                  read-write permission to load your PDFs and sync edits directly in that folder.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onReconnectFolder}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <FolderSync className="w-4 h-4" aria-hidden="true" />
                  <span>Grant Folder Access</span>
                </button>
                <button
                  type="button"
                  onClick={onChooseFolder}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <FolderOpen className="w-4 h-4" aria-hidden="true" />
                  <span>Choose Different Folder</span>
                </button>
              </div>
            </div>
          ) : !isConnected ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 md:p-10 space-y-5">
              <div className="max-w-2xl space-y-3">
                <h1
                  id="folder-heading"
                  className="font-display text-3xl md:text-4xl font-bold tracking-tight text-slate-900 text-balance"
                >
                  Connect a local folder to load and annotate your PDFs
                </h1>
                <p className="text-base text-slate-600 leading-relaxed">
                  Instead of storing PDFs in browser storage, tempPDF reads all PDFs directly from
                  your chosen folder and saves variants, highlights, and display settings inside{' '}
                  <code className="font-mono-num text-sm bg-slate-100 px-1.5 py-0.5 rounded">
                    .temppdf-data.json
                  </code>{' '}
                  in that same folder.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onChooseFolder}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <FolderOpen className="w-4 h-4" aria-hidden="true" />
                  <span>Select PDF Folder</span>
                </button>
                <button
                  type="button"
                  onClick={() => fallbackDirInputRef.current?.click()}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Browse Folder (Compatibility)</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-2xl border bg-white p-6 md:p-8 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6 ${
                isDragging ? 'border-amber-500 bg-amber-50/40' : 'border-slate-200'
              }`}
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2.5">
                  <FolderOpen className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
                  <h1
                    id="folder-heading"
                    data-testid="connected-folder-name"
                    className="font-display text-2xl font-bold tracking-tight text-slate-900 truncate"
                  >
                    {folderName}
                  </h1>
                </div>
                <p className="text-sm text-slate-600">
                  {folderMode === 'readwrite'
                    ? 'Synced directly to folder · All edits auto-saved to .temppdf-data.json'
                    : 'Compatibility mode · Export .temppdf-data.json to save edits back to your folder'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {folderMode === 'readwrite' && (
                  <>
                    <button
                      type="button"
                      onClick={onRefreshFolder}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Refresh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Add PDF to Folder</span>
                    </button>
                  </>
                )}

                {folderMode === 'readonly-fallback' && (
                  <button
                    type="button"
                    onClick={onExportFallbackMetadata}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save .temppdf-data.json</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onChooseFolder}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Switch Folder</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* PDFs Inside Connected Folder */}
        {isConnected && (
          <section id="library" aria-labelledby="library-heading" className="space-y-4">
            <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3">
              <h2
                id="library-heading"
                className="font-display text-xl font-semibold text-slate-900"
              >
                PDFs in Folder
              </h2>
              <span className="text-sm text-slate-500 font-mono-num">
                {documents.length} {documents.length === 1 ? 'PDF' : 'PDFs'}
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
                <FolderOpen className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-base font-medium text-slate-900">
                    No PDF files found in {folderName}
                  </p>
                  <p className="text-sm text-slate-500">
                    Drop PDFs into this folder on your computer and click Refresh, or add one here.
                  </p>
                </div>
                {folderMode === 'readwrite' && (
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      Add PDF to Folder
                    </button>
                    <button
                      type="button"
                      onClick={onCreateSampleInFolder}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                      <span>Create Sample PDF in Folder</span>
                    </button>
                  </div>
                )}
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
                          <span>
                            {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {doc.variants.length}{' '}
                            {doc.variants.length === 1 ? 'variant' : 'variants'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {totalHighlights}{' '}
                            {totalHighlights === 1 ? 'highlight' : 'highlights'}
                          </span>
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
                        {folderMode === 'readwrite' && (
                          <button
                            type="button"
                            onClick={() => onDeleteDocument(doc.id)}
                            aria-label={`Delete ${doc.name}`}
                            className="inline-flex items-center justify-center p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors min-h-[40px] min-w-[40px]"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

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
              <h3 className="text-sm font-semibold text-slate-900">
                01. Horizontal Swipe & Double-Tap Undo
              </h3>
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
              <h3 className="text-sm font-semibold text-slate-900">03. Folder-Synced Variants</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Switch between Base and custom variants one by one at the bottom. All edits save
                straight to <span className="font-mono-num">.temppdf-data.json</span> in your folder.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
