import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export type LoadedPdfProxy = pdfjsLib.PDFDocumentProxy;

export interface ParsedPdfHandle {
  pdf: LoadedPdfProxy;
  dispose: () => Promise<void>;
}

/**
 * Fast header validation (<1ms) reading only the first 1 KB of an uploaded file.
 */
export async function validatePdfHeader(file: File): Promise<boolean> {
  const headBuffer = await file.slice(0, 1024).arrayBuffer();
  const headerText = new TextDecoder('latin1').decode(headBuffer);
  return headerText.includes('%PDF-');
}

/**
 * Loads a PDF from a Blob or Uint8Array via an Object URL so the PDF.js worker
 * fetches byte ranges directly without cloning huge ArrayBuffers across postMessage.
 */
export async function openPdfHandle(source: Blob | Uint8Array): Promise<ParsedPdfHandle> {
  const blob =
    source instanceof Blob
      ? source
      : new Blob([source.slice().buffer], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);

  const loadingTask = pdfjsLib.getDocument({
    url: objectUrl,
    useSystemFonts: true,
  });

  try {
    const pdf = await loadingTask.promise;
    let disposed = false;
    return {
      pdf,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        try {
          await pdf.cleanup();
        } catch {
          // ignore cleanup errors
        }
        try {
          await loadingTask.destroy();
        } catch {
          // ignore destroy errors
        }
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    try {
      await loadingTask.destroy();
    } catch {
      // ignore
    }
    throw err;
  }
}

// Concurrency limiter (max 2 simultaneous page renders) to prevent worker/GPU saturation on large PDFs
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

export async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => {
      renderWaiters.push(resolve);
    });
  }
  activeRenders += 1;
  try {
    return await task();
  } finally {
    activeRenders -= 1;
    const next = renderWaiters.shift();
    if (next) next();
  }
}
