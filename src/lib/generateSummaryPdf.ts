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
  // Atomické bloky (jednotlivý krok opatření, hlavička dotazníku) — řez stránky PDF
  // do nich nikdy nesmí padnout doprostřed, jinak se text věty přeřízne napůl mezi
  // dvě stránky. Měříme na živém DOM (ne na klonu), protože rozvržení #print-summary
  // žádné vlastní scrollovací kontejnery nemá, takže odpovídá tomu, co zachytí html2canvas.
  const containerRect = element.getBoundingClientRect();
  const forbiddenRanges = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-block]'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - containerRect.top, bottom: r.bottom - containerRect.top };
    })
    .filter((r) => r.bottom > r.top);

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
  const pxPerMm = canvas.width / imgWidthMm; // poměr canvas px ↔ mm, stejný pro obě osy
  const imgHeightMm = canvas.height / pxPerMm;
  const pageHeightPx = PDF_PAGE_HEIGHT_MM * pxPerMm;
  const totalHeightPx = canvas.height;

  // Zakázané pásy převedené z DOM souřadnic (CSS px) do canvas pixelů. Bloky vyšší
  // než jedna celá stránka nejde rozumně ochránit (např. mimořádně dlouhá poznámka)
  // — u těch necháváme původní chování, ať appka nikdy nezacyklí.
  const domToCanvasScale = canvas.width / element.offsetWidth;
  const forbiddenPx = forbiddenRanges
    .map((r) => ({ top: r.top * domToCanvasScale, bottom: r.bottom * domToCanvasScale }))
    .filter((r) => r.bottom - r.top < pageHeightPx);

  /** Pokud by navržený řez stránky padl doprostřed nějakého atomického bloku,
   * posune ho na jeho začátek — celý blok se pak zobrazí až na další stránce. */
  function adjustBreak(candidatePx: number, pageTopPx: number): number {
    for (const r of forbiddenPx) {
      if (candidatePx > r.top && candidatePx < r.bottom) {
        return r.top > pageTopPx ? r.top : candidatePx;
      }
    }
    return candidatePx;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let cursorPx = 0;
  let pageIndex = 0;
  while (cursorPx < totalHeightPx) {
    const naiveEndPx = Math.min(cursorPx + pageHeightPx, totalHeightPx);
    let endPx = naiveEndPx >= totalHeightPx ? naiveEndPx : adjustBreak(naiveEndPx, cursorPx);
    if (endPx <= cursorPx) endPx = naiveEndPx; // pojistka proti nekonečné smyčce

    if (pageIndex > 0) doc.addPage();
    const yOffsetMm = -cursorPx / pxPerMm;
    doc.addImage(imgData, 'JPEG', 0, yOffsetMm, imgWidthMm, imgHeightMm);

    // Když jsme řez posunuli výš kvůli ochraně bloku, zbytek téhle stránky (kde by
    // se jinak zobrazil jen kousek toho bloku) přemalujeme bílou, ať zůstane prázdný.
    const visibleHeightMm = (endPx - cursorPx) / pxPerMm;
    if (visibleHeightMm < PDF_PAGE_HEIGHT_MM) {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, visibleHeightMm, PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM - visibleHeightMm, 'F');
    }

    cursorPx = endPx;
    pageIndex += 1;
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
