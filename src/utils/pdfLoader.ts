import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export type LoadedPdfProxy = pdfjsLib.PDFDocumentProxy;

export async function parsePdfBytes(bytes: Uint8Array): Promise<LoadedPdfProxy> {
  // Always pass a detached-safe copy so cached buffers remain reusable
  const copy = bytes.slice();
  const loadingTask = pdfjsLib.getDocument({
    data: copy,
    useSystemFonts: true,
  });
  return loadingTask.promise;
}
