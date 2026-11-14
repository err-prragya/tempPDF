import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FilePlus2,
  FileText,
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
    <div className="min-h-screen bg-neutral-950 text-slate-100 flex flex-col">
      {/* Minimal Top Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            tempPDF
          </span>

          <div className="flex items-center gap-2 shrink-0">
            {isConnected ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isBusy ? 'Working...' : 'Add PDF'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onChooseFolder}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isBusy ? 'Opening...' : 'Select Folder'}</span>
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

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 space-y-8">
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-red-900/60 bg-red-950/60 text-red-200 text-sm"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={onClearError}
              className="px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-900/60 rounded transition-colors whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Folder Connection State */}
        {folderMode === 'pending-permission' ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 md:p-10 space-y-6">
            <div className="max-w-xl space-y-2">
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white">
                Reconnect {folderName}
              </h1>
              <p className="text-sm text-slate-400">
                Grant folder permission to load your PDFs and save highlights.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onReconnectFolder}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
              >
                <FolderSync className="w-4 h-4" aria-hidden="true" />
                <span>Grant Folder Access</span>
              </button>
              <button
                type="button"
                onClick={onChooseFolder}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
                <span>Switch Folder</span>
              </button>
            </div>
          </section>
        ) : !isConnected ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 md:p-12 space-y-6">
            <div className="max-w-xl space-y-3">
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white text-balance">
                Open a PDF folder
              </h1>
              <p className="text-base text-slate-400 leading-relaxed">
                Loads every PDF from your chosen folder and stores highlights and variants right
                inside it.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onChooseFolder}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
              >
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
                <span>Select PDF Folder</span>
              </button>
              <button
                type="button"
                onClick={() => fallbackDirInputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/80 rounded-lg hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                <span>Browse Folder</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Connected Folder Header */}
            <section
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-2xl border p-5 md:p-6 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isDragging
                  ? 'border-amber-400 bg-amber-950/20'
                  : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                  <FolderOpen className="w-5 h-5 text-amber-400" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h1
                    data-testid="connected-folder-name"
                    className="font-display text-lg font-bold text-white truncate"
                  >
                    {folderName}
                  </h1>
                  <p className="text-xs text-slate-400 font-mono-num">
                    {documents.length} {documents.length === 1 ? 'PDF' : 'PDFs'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {folderMode === 'readwrite' && (
                  <button
                    type="button"
                    onClick={onRefreshFolder}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Refresh</span>
                  </button>
                )}

                {folderMode === 'readonly-fallback' && (
                  <button
                    type="button"
                    onClick={onExportFallbackMetadata}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save Data File</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onChooseFolder}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 border border-slate-700 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Switch Folder</span>
                </button>
              </div>
            </section>

            {/* PDF List */}
            {documents.length === 0 ? (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center space-y-4">
                <p className="text-sm text-slate-400">No PDFs in {folderName} yet.</p>
                {folderMode === 'readwrite' && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
                    >
                      Add PDF
                    </button>
                    <button
                      type="button"
                      onClick={onCreateSampleInFolder}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Create Sample PDF</span>
                    </button>
                  </div>
                )}
              </section>
            ) : (
              <section
                aria-label="PDFs in folder"
                className="rounded-2xl border border-slate-800 bg-slate-900/50 divide-y divide-slate-800/80 overflow-hidden"
              >
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-900 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <FileText
                        className="w-4 h-4 text-slate-400 shrink-0"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <h2 className="font-display text-sm font-semibold text-white truncate">
                          {doc.name}
                        </h2>
                        <p className="text-xs text-slate-400 font-mono-num">
                          {doc.variants.length}{' '}
                          {doc.variants.length === 1 ? 'variant' : 'variants'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-white hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
                      >
                        <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Open</span>
                      </button>
                      {folderMode === 'readwrite' && (
                        <button
                          type="button"
                          onClick={() => onDeleteDocument(doc.id)}
                          aria-label={`Delete ${doc.name}`}
                          className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors min-h-[36px] min-w-[36px]"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};
