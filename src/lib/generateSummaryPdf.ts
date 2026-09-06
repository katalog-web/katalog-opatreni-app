import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

const PDF_PAGE_WIDTH_MM = 210; // A4
const PDF_PAGE_HEIGHT_MM = 297;
// Bezpečný okraj — spousta tiskáren fyzicky nezvládne tisknout až do kraje papíru.
// 10 mm zvládne prakticky každá běžná tiskárna i při ručním vytisknutí PDF doma/ve škole.
const PRINT_MARGIN_MM = 10;
const PRINTABLE_WIDTH_MM = PDF_PAGE_WIDTH_MM - 2 * PRINT_MARGIN_MM;
const PRINTABLE_HEIGHT_MM = PDF_PAGE_HEIGHT_MM - 2 * PRINT_MARGIN_MM;
// Nejvýš tolik prázdného místa jsme ochotni "obětovat", abychom se vyhnuli přeříznutí
// jednoho bloku (kroku/poznámky) mezi dvě stránky — u mimořádně dlouhého bloku je
// menší zlo nechat ho přetéct, než na jeho kvůli němu nechat půl stránky prázdné.
const MAX_PAGE_BREAK_WASTE_MM = 50;

/**
 * Zachytí vykreslenou HTML sekci (typicky #print-summary) jako obrázek a poskládá ji
 * do vícestránkového PDF. Používáme snímek skutečného DOM (ne programaticky skládaný text),
 * protože jinak by chyběla diakritika (výchozí PDF fonty ji nepodporují) a grafický styl appky.
 *
 * Prvky s třídou `no-print` se do snímku nezahrnou (stejná konvence jako u tiskové CSS).
 * Vnořené scrollovatelné seznamy (`overflow-y-auto`) se dočasně "rozbalí", aby se do
 * snímku dostal celý obsah, ne jen viditelná část. Obsah se skládá s bezpečným okrajem
 * (viz PRINT_MARGIN_MM) a řez mezi stránkami se vyhýbá atomickým blokům (viz `data-pdf-block`
 * v page.tsx), ať se text kroku/poznámky nikdy nerozdělí uprostřed věty.
 */
export async function buildSummaryPdfFromElement(element: HTMLElement): Promise<jsPDF> {
  const containerRect = element.getBoundingClientRect();
  const forbiddenRanges = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-block]'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - containerRect.top, bottom: r.bottom - containerRect.top };
    })
    .filter((r) => r.bottom > r.top);

  // Pevné (na obrazovce appky nezávislé) rozlišení snímku — dřív se používalo
  // window.devicePixelRatio, které je na běžných (ne-Retina) monitorech jen 1, což
  // dělalo z textu na celou A4 stránku rozmazaný obrázek. Kvalita tisku/čtení PDF
  // nemá s hustotou pixelů obrazovky nic společného, proto teď appka vždy vykresluje
  // ve vyšším, pevném rozlišení.
  const canvas = await html2canvas(element, {
    scale: 2.2,
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

  // PNG místo JPEG — obsah je téměř výhradně text na plochém pozadí, kde PNG
  // komprimuje dobře a bez ztrátových artefaktů, které by ostrost písma zhoršovaly.
  const imgData = canvas.toDataURL('image/png');
  const pxPerMm = canvas.width / PRINTABLE_WIDTH_MM; // poměr canvas px ↔ mm, stejný pro obě osy
  const imgHeightMm = canvas.height / pxPerMm;
  const pageHeightPx = PRINTABLE_HEIGHT_MM * pxPerMm;
  const totalHeightPx = canvas.height;

  // Zakázané pásy převedené z DOM souřadnic (CSS px) do canvas pixelů. Bloky vyšší
  // než polovina tiskové oblasti stránky se neochraňují — jinak by jediný mimořádně
  // dlouhý blok (např. dlouhá poznámka) mohl kvůli sobě nechat prázdnou skoro celou stránku.
  const domToCanvasScale = canvas.width / element.offsetWidth;
  const forbiddenPx = forbiddenRanges
    .map((r) => ({ top: r.top * domToCanvasScale, bottom: r.bottom * domToCanvasScale }))
    .filter((r) => r.bottom - r.top < pageHeightPx * 0.5);

  /** Pokud by navržený řez stránky padl doprostřed nějakého atomického bloku,
   * posune ho na jeho začátek — celý blok se pak zobrazí až na další stránce.
   * Pokud by to ale znamenalo obětovat víc než MAX_PAGE_BREAK_WASTE_MM prázdného
   * místa, radši necháme původní (naivní) řez, než plýtvat velkou částí stránky. */
  function adjustBreak(candidatePx: number, pageTopPx: number): number {
    for (const r of forbiddenPx) {
      if (candidatePx > r.top && candidatePx < r.bottom) {
        if (r.top <= pageTopPx) return candidatePx;
        const wastedMm = (candidatePx - r.top) / pxPerMm;
        if (wastedMm > MAX_PAGE_BREAK_WASTE_MM) return candidatePx;
        return r.top;
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
    const yOffsetMm = PRINT_MARGIN_MM - cursorPx / pxPerMm;
    doc.addImage(imgData, 'PNG', PRINT_MARGIN_MM, yOffsetMm, PRINTABLE_WIDTH_MM, imgHeightMm);

    // Horní okraj vždy přemalovat bílou — obrázek je jeden nepřerušený pás přes
    // všechny stránky, takže by se sem jinak "prosvítal" už zobrazený spodek
    // předchozí stránky. Stejně tak spodní okraj a případný kousek chráněného
    // bloku, co by jinak vyčníval přes navržený řez.
    const visibleHeightMm = (endPx - cursorPx) / pxPerMm;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PDF_PAGE_WIDTH_MM, PRINT_MARGIN_MM, 'F');
    const blankFromMm = PRINT_MARGIN_MM + visibleHeightMm;
    doc.rect(0, blankFromMm, PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM - blankFromMm, 'F');

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
