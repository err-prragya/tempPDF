import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus2,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  FolderSync,
  Maximize2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { PdfDocumentRecord } from '../types/pdf';
import {
  buildFolderTree,
  collectAllSubfolderPaths,
  getPdfDisplayName,
  type FolderTreeNode,
} from '../utils/folderTree';
import { PWAInstallButton } from './PWAInstallButton';

export type FolderMode = 'none' | 'pending-permission' | 'readwrite' | 'readonly-fallback';

interface LibraryViewProps {
  folderMode: FolderMode;
  folderName: string | null;
  documents: PdfDocumentRecord[];
  subfolders: string[];
  isBusy: boolean;
  errorMessage: string | null;
  onChooseFolder: () => void;
  onReconnectFolder: () => void;
  onRefreshFolder: () => void;
  onFallbackFolderSelected: (files: FileList) => void;
  onImportFiles: (files: FileList | File[], targetSubfolderPath?: string) => void;
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
  subfolders,
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
  const uploadTargetPathRef = useRef<string>('');
  const [dragTargetPath, setDragTargetPath] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());

  const isConnected = folderMode === 'readwrite' || folderMode === 'readonly-fallback';

  const folderTree = useMemo(
    () => buildFolderTree(documents, subfolders),
    [documents, subfolders]
  );

  const allSubfolderPaths = useMemo(
    () => collectAllSubfolderPaths(folderTree),
    [folderTree]
  );

  const allCollapsed =
    allSubfolderPaths.length > 0 &&
    allSubfolderPaths.every((p) => collapsedPaths.has(p));

  const toggleFolder = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleToggleAllFolders = () => {
    if (allCollapsed) {
      setCollapsedPaths(new Set());
    } else {
      setCollapsedPaths(new Set(allSubfolderPaths));
    }
  };

  const triggerUploadToFolder = (targetPath: string) => {
    uploadTargetPathRef.current = targetPath;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files, uploadTargetPathRef.current);
      e.target.value = '';
    }
    uploadTargetPathRef.current = '';
  };

  const handleFallbackDirChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFallbackFolderSelected(e.target.files);
      e.target.value = '';
    }
  };

  const handleDropToPath = (
    e: React.DragEvent<HTMLElement>,
    targetPath: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTargetPath(null);
    if (!isConnected) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files, targetPath);
    }
  };

  const renderPdfRow = (doc: PdfDocumentRecord) => {
    const displayName = getPdfDisplayName(doc.name);
    const totalHighlights = doc.variants.reduce(
      (sum, v) => sum + v.highlights.length,
      0
    );

    return (
      <div
        key={doc.id}
        data-testid={`pdf-row-${doc.name}`}
        className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 hover:bg-slate-900/90 transition-colors"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <FileText
            className="w-4 h-4 text-slate-400 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2
              title={doc.name}
              className="font-display text-sm font-semibold text-white truncate"
            >
              {displayName}
            </h2>
            <p className="text-xs text-slate-400 font-mono-num truncate">
              {doc.variants.length}{' '}
              {doc.variants.length === 1 ? 'variant' : 'variants'}
              {totalHighlights > 0 && (
                <span>
                  {' '}
                  · {totalHighlights}{' '}
                  {totalHighlights === 1 ? 'highlight' : 'highlights'}
                </span>
              )}
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
    );
  };

  const renderFolderBranch = (node: FolderTreeNode, depth = 0): React.ReactNode => {
    const isCollapsed = collapsedPaths.has(node.path);
    const isDragTarget = dragTargetPath === node.path;

    return (
      <div
        key={node.path}
        data-testid={`subfolder-node-${node.path}`}
        onDragOver={(e) => {
          if (folderMode !== 'readwrite') return;
          e.preventDefault();
          e.stopPropagation();
          setDragTargetPath(node.path);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          if (dragTargetPath === node.path) {
            setDragTargetPath(null);
          }
        }}
        onDrop={(e) => handleDropToPath(e, node.path)}
        className={
          depth === 0
            ? `rounded-2xl border overflow-hidden transition-colors ${
                isDragTarget
                  ? 'border-amber-400 bg-amber-950/15'
                  : 'border-slate-800 bg-slate-900/50'
              }`
            : `rounded-xl border overflow-hidden transition-colors ${
                isDragTarget
                  ? 'border-amber-400 bg-amber-950/15'
                  : 'border-slate-800/80 bg-slate-950/40'
              }`
        }
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/85 border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            aria-expanded={!isCollapsed}
            aria-label={`Toggle folder ${node.path}`}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left group"
          >
            {isCollapsed ? (
              <ChevronRight
                className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0 transition-colors"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0 transition-colors"
                aria-hidden="true"
              />
            )}
            {isCollapsed ? (
              <Folder
                className="w-4 h-4 text-amber-400 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <FolderOpen
                className="w-4 h-4 text-amber-400 shrink-0"
                aria-hidden="true"
              />
            )}
            <span
              title={node.path}
              className="font-display text-sm font-semibold text-white truncate"
            >
              {node.name}
            </span>
            <span className="text-[11px] font-mono-num text-slate-400 bg-slate-800/90 px-2 py-0.5 rounded-md shrink-0">
              {node.totalPdfCount} {node.totalPdfCount === 1 ? 'PDF' : 'PDFs'}
            </span>
          </button>

          {folderMode === 'readwrite' && (
            <button
              type="button"
              onClick={() => triggerUploadToFolder(node.path)}
              disabled={isBusy}
              aria-label={`Add PDF to ${node.path}`}
              title={`Add PDF to ${node.path}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-slate-950 bg-slate-800/90 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <FileUp className="w-3.5 h-3.5 sm:w-3 sm:h-3" aria-hidden="true" />
              <span className="hidden sm:inline">Add PDF</span>
            </button>
          )}
        </div>

        {!isCollapsed && (
          <div className="pl-2.5 sm:pl-5 border-l-2 border-slate-800/70 ml-2.5 sm:ml-4 my-1.5 mr-1.5 space-y-2">
            {node.documents.length > 0 && (
              <div className="rounded-xl border border-slate-800/70 bg-slate-950/35 divide-y divide-slate-800/70 overflow-hidden">
                {node.documents.map(renderPdfRow)}
              </div>
            )}

            {node.subfolders.map((child) => renderFolderBranch(child, depth + 1))}

            {node.documents.length === 0 && node.subfolders.length === 0 && (
              <div className="px-4 py-3 text-xs text-slate-500">
                No PDFs in this subfolder
              </div>
            )}
          </div>
        )}
      </div>
    );
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
            <PWAInstallButton />
            {isConnected ? (
              <button
                type="button"
                onClick={() => triggerUploadToFolder('')}
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
                Loads every PDF and subfolder from your chosen folder and stores highlights and
                variants right inside it.
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
                setDragTargetPath('');
              }}
              onDragLeave={() => {
                if (dragTargetPath === '') setDragTargetPath(null);
              }}
              onDrop={(e) => handleDropToPath(e, '')}
              className={`rounded-2xl border p-5 md:p-6 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                dragTargetPath === ''
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
                    {allSubfolderPaths.length > 0 && (
                      <span>
                        {' '}
                        · {allSubfolderPaths.length}{' '}
                        {allSubfolderPaths.length === 1 ? 'subfolder' : 'subfolders'}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {allSubfolderPaths.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleAllFolders}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>{allCollapsed ? 'Expand all' : 'Collapse all'}</span>
                  </button>
                )}

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

            {/* PDF & Subfolder Hierarchy */}
            {documents.length === 0 && folderTree.subfolders.length === 0 ? (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center space-y-4">
                <p className="text-sm text-slate-400">No PDFs in {folderName} yet.</p>
                {folderMode === 'readwrite' && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => triggerUploadToFolder('')}
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
              <section aria-label="PDFs in folder" className="space-y-4">
                {folderTree.documents.length > 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 divide-y divide-slate-800/80 overflow-hidden">
                    {folderTree.documents.map(renderPdfRow)}
                  </div>
                )}

                {folderTree.subfolders.map((subfolderNode) =>
                  renderFolderBranch(subfolderNode, 0)
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};
