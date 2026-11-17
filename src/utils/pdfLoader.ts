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

// Priority-ordered, cancellation-aware render scheduler (max 2 simultaneous page renders)
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;

interface RenderWaiter {
  getPriority: () => number;
  isCancelled: () => boolean;
  wake: () => void;
}

const renderWaiters: RenderWaiter[] = [];

function pumpRenderQueue() {
  while (activeRenders < MAX_CONCURRENT_RENDERS && renderWaiters.length > 0) {
    // Prune cancelled entries first so scrolled-past pages never block new pages
    for (let i = renderWaiters.length - 1; i >= 0; i--) {
      if (renderWaiters[i].isCancelled()) {
        const [dropped] = renderWaiters.splice(i, 1);
        dropped.wake();
      }
    }
    if (renderWaiters.length === 0) break;

    let bestIdx = 0;
    let bestPriority = renderWaiters[0].getPriority();
    for (let i = 1; i < renderWaiters.length; i++) {
      const p = renderWaiters[i].getPriority();
      if (p < bestPriority) {
        bestPriority = p;
        bestIdx = i;
      }
    }

    const [next] = renderWaiters.splice(bestIdx, 1);
    next.wake();
  }
}

export async function schedulePageRender<T>(
  getPriority: () => number,
  isCancelled: () => boolean,
  task: () => Promise<T>
): Promise<T | undefined> {
  if (isCancelled()) return undefined;

  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => {
      renderWaiters.push({ getPriority, isCancelled, wake: resolve });
    });
    if (isCancelled()) return undefined;
  }

  activeRenders += 1;
  try {
    return await task();
  } finally {
    activeRenders -= 1;
    pumpRenderQueue();
  }
}

export async function withRenderSlot<T>(task: () => Promise<T>): Promise<T | undefined> {
  return schedulePageRender(() => 0, () => false, task);
}
