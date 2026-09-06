import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

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
  // dělalo z textu na celou A4 stránku rozmazaný obrázek. Zkoušeli jsme i vyšší
  // scale (2.2) s PNG, ale u delšího souhrnu to vygenerovalo PDF přes 60 MB —
  // nepoužitelné k odeslání/uložení. 1.8 + kvalitní JPEG je rozumný kompromis:
  // znatelně ostřejší než původní devicePixelRatio přístup, ale v přiměřené velikosti.
  const canvas = await html2canvas(element, {
    scale: 1.8,
    useCORS: true,
    backgroundColor: '#ffffff',
    ignoreElements: (el) => el.classList?.contains('no-print'),
    onclone: (clonedDoc) => {
      clonedDoc.querySelectorAll<HTMLElement>('.overflow-y-auto').forEach((el) => {
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
      });
      // Barevné podbarvení (zelená/oranžová) je hezké na obrazovce, ale v PDF/tisku
      // zbytečně spotřebovává barvu a působí méně formálně — pro export se nahrazuje
      // neutrální bílou/šedou, na živém webu se appka nijak nemění (upravuje se jen klon).
      clonedDoc.querySelectorAll<HTMLElement>('[data-pdf-plain-bg]').forEach((el) => {
        el.style.backgroundColor = '#ffffff';
        el.style.borderColor = '#e2e8f0';
      });
    },
  });

  const pxPerMm = canvas.width / PRINTABLE_WIDTH_MM; // poměr canvas px ↔ mm, stejný pro obě osy
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

    // Pro každou stránku se z celkového snímku vyřízne jen její vlastní kousek do
    // samostatného (menšího) obrázku — žádné "domalovávání bílou přes obrázek" jako
    // dřív. To dřívější řešení umělo za určitých okolností nechat prosvítat/duplikovat
    // kousek obsahu na švu dvou stránek; oříznutí na zdroji tohle riziko úplně odstraní.
    const sliceHeightPx = Math.max(1, Math.round(endPx - cursorPx));
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;
    const sliceCtx = sliceCanvas.getContext('2d')!;
    sliceCtx.fillStyle = '#ffffff';
    sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(canvas, 0, -cursorPx);
    const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.92);

    const sliceHeightMm = sliceHeightPx / pxPerMm;
    doc.addImage(sliceImgData, 'JPEG', PRINT_MARGIN_MM, PRINT_MARGIN_MM, PRINTABLE_WIDTH_MM, sliceHeightMm);

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

// Firestore má tvrdý limit ~1 MiB na jeden dokument. Appka běží jen na bezplatném
// Spark plánu (žádné Firebase Storage), proto se delší PDF ukládá rozdělené na víc
// menších dokumentů (viz users/{uid}/documents/{docId}/pdfChunks v page.tsx) místo
// jednoho velkého pole — appka je pak sama za sebou zase poskládá.
export const PDF_CHUNK_SIZE = 900_000; // znaků na kousek, bezpečně pod 1 MiB limitem

/** Rozdělí base64 řetězec na kousky, které se každý vejdou do jednoho Firestore dokumentu. */
export function splitBase64IntoChunks(base64: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += PDF_CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + PDF_CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [''];
}

/**
 * Načte a poskládá base64 PDF pro uložený dokument dítěte. Novější dokumenty ho
 * mají rozdělené na kousky v podkolekci `pdfChunks` (viz splitBase64IntoChunks
 * výše) — tahle funkce je stáhne a spojí zpátky dohromady. Starší dokumenty, které
 * mají pdfBase64 uložené přímo v hlavním dokumentu, vrátí beze změny (zpětná
 * kompatibilita). Vrátí null, pokud dokument žádné PDF nemá.
 */
export async function loadDocumentPdfBase64(
  ownerUid: string,
  docId: string,
  existing?: { pdfBase64?: string; pdfChunkCount?: number }
): Promise<string | null> {
  if (existing?.pdfBase64) return existing.pdfBase64;
  if (!existing?.pdfChunkCount) return null;

  const chunkSnaps = await Promise.all(
    Array.from({ length: existing.pdfChunkCount }, (_, i) =>
      getDoc(doc(db, 'users', ownerUid, 'documents', docId, 'pdfChunks', String(i)))
    )
  );
  return chunkSnaps.map((snap) => (snap.exists() ? ((snap.data().data as string) ?? '') : '')).join('');
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
