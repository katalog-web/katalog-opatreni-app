import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

const PDF_PAGE_WIDTH_MM = 210; // A4
const PDF_PAGE_HEIGHT_MM = 297;

/**
 * Zachytí vykreslenou HTML sekci (typicky #print-summary) jako obrázek a poskládá ji
 * do vícestránkového PDF. Používáme snímek skutečného DOM (ne programaticky skládaný text),
 * protože jinak by chyběla diakritika (výchozí PDF fonty ji nepodporují) a grafický styl appky.
 *
 * Prvky s třídou `no-print` se do snímku nezahrnou (stejná konvence jako u tiskové CSS).
 * Vnořené scrollovatelné seznamy (`overflow-y-auto`) se dočasně "rozbalí", aby se do
 * snímku dostal celý obsah, ne jen viditelná část.
 */
export async function buildSummaryPdfFromElement(element: HTMLElement): Promise<jsPDF> {
  const canvas = await html2canvas(element, {
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true,
    backgroundColor: '#ffffff',
    ignoreElements: (el) => el.classList?.contains('no-print'),
    onclone: (clonedDoc) => {
      clonedDoc.querySelectorAll<HTMLElement>('.overflow-y-auto').forEach((el) => {
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
      });
    },
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.85);
  const imgWidthMm = PDF_PAGE_WIDTH_MM;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let heightLeft = imgHeightMm;
  let position = 0;
  doc.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm);
  heightLeft -= PDF_PAGE_HEIGHT_MM;

  while (heightLeft > 0) {
    position = heightLeft - imgHeightMm;
    doc.addPage();
    doc.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm);
    heightLeft -= PDF_PAGE_HEIGHT_MM;
  }

  return doc;
}

/** Vrátí velikost base64 řetězce v bajtech (přibližně, pro kontrolu limitu Firestore 1 MB/dokument). */
export function base64ByteSize(base64: string): number {
  const clean = base64.split(',').pop() ?? base64;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Spustí stažení PDF uloženého jako čistý base64 (bez "data:" prefixu) v prohlížeči. */
export function downloadBase64Pdf(base64: string, filename: string): void {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
