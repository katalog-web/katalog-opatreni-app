import { jsPDF } from 'jspdf';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Choice } from '@/components/MeasureCard';

// ---------- Vestavěný font s českou diakritikou ----------
// Výchozí PDF fonty (Helvetica/Times) umí jen WinAnsi znakovou sadu — bez ě š č ř ž
// ý ů ď ť ň. Appka dřív místo textu vkládala do PDF snímek vykresleného HTML (obrázek),
// což diakritiku obešlo, ale výsledek nešlo prohledávat, kopírovat ani zvětšit beze
// ztráty ostrosti. Místo toho appka vkládá skutečný font přímo do PDF (PT Sans, ve
// statické — ne variabilní — podobě, protože jsPDF umí vložit jen běžné statické TTF).
// Fonty appka nemá v repozitáři přímo v kódu, ale jako statické soubory v public/fonts
// (viz PTSans-Regular.ttf/PTSans-Bold.ttf) — appka je stáhne jen při skutečném
// generování PDF, ne při každém načtení stránky.
const FONT_NAME = 'PTSans';
let fontsCache: { regular: string; bold: string } | null = null;
let fontsPromise: Promise<{ regular: string; bold: string }> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // po menších kouscích, ať String.fromCharCode nespadne na velkém poli
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (fontsCache) return fontsCache;
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      fetch('/fonts/PTSans-Regular.ttf').then((r) => r.arrayBuffer()),
      fetch('/fonts/PTSans-Bold.ttf').then((r) => r.arrayBuffer()),
    ]).then(([regularBuf, boldBuf]) => {
      fontsCache = { regular: arrayBufferToBase64(regularBuf), bold: arrayBufferToBase64(boldBuf) };
      return fontsCache;
    });
  }
  return fontsPromise;
}

function registerFonts(pdfDoc: jsPDF, fonts: { regular: string; bold: string }) {
  pdfDoc.addFileToVFS('PTSans-Regular.ttf', fonts.regular);
  pdfDoc.addFont('PTSans-Regular.ttf', FONT_NAME, 'normal');
  pdfDoc.addFileToVFS('PTSans-Bold.ttf', fonts.bold);
  pdfDoc.addFont('PTSans-Bold.ttf', FONT_NAME, 'bold');
  pdfDoc.setFont(FONT_NAME, 'normal');
}

// ---------- Rozměry stránky a barvy (odpovídají brand barvám appky) ----------
const PAGE_W = 210; // A4
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const CONTENT_BOTTOM = PAGE_H - MARGIN;

type RGB = [number, number, number];
const COLOR_NAVY: RGB = [38, 50, 93];
const COLOR_NAVY_80: RGB = [81, 91, 125];
const COLOR_NAVY_60: RGB = [125, 132, 158];
const COLOR_NAVY_40: RGB = [168, 173, 190];
const COLOR_GREEN: RGB = [118, 183, 42];
const COLOR_ORANGE: RGB = [238, 118, 24];
const COLOR_LINE: RGB = [194, 208, 221];

// pt → mm, plus trocha extra řádkování pro čitelnost
function lineHeightMm(fontSizePt: number, leading = 1.4): number {
  return fontSizePt * 0.3528 * leading;
}

export interface SummaryPdfMeasure {
  id: string;
  sheetName: string;
  oblast: string;
  opatreni: string;
  krok: string;
}

export interface SummaryPdfData {
  childNumber: string;
  childAge: string;
  childGender: string;
  childGrade: string;
  childNeeds: string;
  role: string;
  schoolType: string;
  studentCount: string;
  purpose: string;
  measures: SummaryPdfMeasure[];
  choices: Record<string, Choice>;
  notes: Record<string, string>;
}

type MeasureGroups = Record<string, Record<string, Record<string, SummaryPdfMeasure[]>>>;

function groupMeasures(measures: SummaryPdfMeasure[]): MeasureGroups {
  const acc: MeasureGroups = {};
  for (const m of measures) {
    if (!acc[m.sheetName]) acc[m.sheetName] = {};
    if (!acc[m.sheetName][m.oblast]) acc[m.sheetName][m.oblast] = {};
    if (!acc[m.sheetName][m.oblast][m.opatreni]) acc[m.sheetName][m.oblast][m.opatreni] = [];
    acc[m.sheetName][m.oblast][m.opatreni].push(m);
  }
  return acc;
}

/**
 * Sestaví souhrn vybraných opatření jako skutečný textový PDF dokument (ne obrázek) —
 * text jde vybrat, kopírovat i vyhledávat, a při zvětšení zůstává ostrý. Nahrazuje
 * dřívější přístup přes html2canvas (snímek vykresleného HTML appky), který sice
 * věrně kopíroval vzhled appky, ale výsledné PDF bylo jen obrázek.
 */
export async function buildSummaryPdf(data: SummaryPdfData): Promise<jsPDF> {
  const fonts = await loadFonts();
  const pdfDoc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerFonts(pdfDoc, fonts);
  pdfDoc.setProperties({
    title: data.childNumber ? `Souhrn opatření — dítě č. ${data.childNumber}` : 'Souhrn vybraných opatření',
    subject: 'Souhrn vybraných podpůrných opatření',
    author: 'Katalog podpůrných opatření (AFREŠ)',
    creator: 'Katalog podpůrných opatření (AFREŠ)',
  });

  let y = MARGIN;
  // Když se stránka zalomí uprostřed výpisu kroků jedné oblasti, appka na nové
  // stránce zopakuje aspoň nadpis oblasti — ať čtenář nepřijde o kontext, ke které
  // oblasti daný krok patří.
  let continuationContext: { oblast: string; color: RGB } | null = null;

  function newPage(): void {
    pdfDoc.addPage();
    y = MARGIN;
    if (continuationContext) {
      pdfDoc.setFont(FONT_NAME, 'bold');
      pdfDoc.setFontSize(10.5);
      pdfDoc.setTextColor(...continuationContext.color);
      pdfDoc.text(`Oblast: ${continuationContext.oblast} (pokračování)`, MARGIN, y + 3);
      y += 9;
    }
  }

  function ensureSpace(neededHeightMm: number): void {
    if (y + neededHeightMm > CONTENT_BOTTOM) newPage();
  }

  /** Zalomí a vykreslí text po řádcích, se stránkováním po jednotlivých řádcích. */
  function drawWrapped(text: string, x: number, width: number, fontSizePt: number, style: 'normal' | 'bold', color: RGB): void {
    pdfDoc.setFont(FONT_NAME, style);
    pdfDoc.setFontSize(fontSizePt);
    pdfDoc.setTextColor(...color);
    const lh = lineHeightMm(fontSizePt);
    const lines = pdfDoc.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      ensureSpace(lh);
      pdfDoc.text(line, x, y);
      y += lh;
    }
  }

  function drawRule(color: RGB = COLOR_LINE): void {
    pdfDoc.setDrawColor(...color);
    pdfDoc.setLineWidth(0.3);
    pdfDoc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  }

  // ---------- Záhlaví ----------
  pdfDoc.setFont(FONT_NAME, 'bold');
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(...COLOR_ORANGE);
  pdfDoc.text('SOUHRN', MARGIN, y);
  y += 7;

  pdfDoc.setFont(FONT_NAME, 'bold');
  pdfDoc.setFontSize(19);
  pdfDoc.setTextColor(...COLOR_NAVY);
  pdfDoc.text('Souhrn vybraných opatření', MARGIN, y);
  y += 6;

  const now = new Date();
  pdfDoc.setFont(FONT_NAME, 'normal');
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(...COLOR_NAVY_40);
  pdfDoc.text(`Vygenerováno ${now.toLocaleDateString('cs-CZ')} ${now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`, MARGIN, y);
  y += 5;
  drawRule();
  y += 8;

  // ---------- Informace o dítěti a kontextu ----------
  type InfoField = { label: string; value: string; block?: boolean };
  const infoFields: InfoField[] = [];
  if (data.childNumber) infoFields.push({ label: 'Dítě č.', value: data.childNumber });
  if (data.childAge) infoFields.push({ label: 'Věk', value: data.childAge });
  if (data.childGender) infoFields.push({ label: 'Pohlaví', value: data.childGender });
  if (data.childGrade) infoFields.push({ label: 'Ročník', value: data.childGrade });
  if (data.role) infoFields.push({ label: 'Role', value: data.role });
  if (data.schoolType) infoFields.push({ label: 'Škola', value: data.schoolType });
  if (data.studentCount) infoFields.push({ label: 'Počet žáků ve škole', value: data.studentCount });
  if (data.purpose) infoFields.push({ label: 'Účel práce', value: data.purpose });
  if (data.childNeeds) infoFields.push({ label: 'Projevy a potřeby dítěte', value: data.childNeeds, block: true });

  if (infoFields.length > 0) {
    for (const field of infoFields) {
      const labelText = `${field.label}: `;
      if (field.block) {
        ensureSpace(lineHeightMm(10));
        pdfDoc.setFont(FONT_NAME, 'normal');
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(...COLOR_NAVY_60);
        pdfDoc.text(labelText, MARGIN, y);
        y += lineHeightMm(10);
        drawWrapped(field.value, MARGIN, CONTENT_W, 10.5, 'bold', COLOR_NAVY);
        y += 2;
      } else {
        ensureSpace(lineHeightMm(10.5));
        pdfDoc.setFont(FONT_NAME, 'normal');
        pdfDoc.setFontSize(10.5);
        pdfDoc.setTextColor(...COLOR_NAVY_60);
        pdfDoc.text(labelText, MARGIN, y);
        const labelWidth = pdfDoc.getTextWidth(labelText);
        pdfDoc.setFont(FONT_NAME, 'bold');
        pdfDoc.setTextColor(...COLOR_NAVY);
        pdfDoc.text(field.value, MARGIN + labelWidth, y);
        y += lineHeightMm(10.5);
      }
    }
    y += 4;
    drawRule();
    y += 8;
  }

  // ---------- Výpis vybraných opatření ----------
  const groups = groupMeasures(data.measures);
  const sections: { key: Exclude<Choice, null>; heading: string; color: RGB }[] = [
    { key: 'POUZIJU', heading: 'Opatření a kroky k zavedení (Použiju v PO1)', color: COLOR_GREEN },
    { key: 'NECHAM_NA_SPZ', heading: 'Kroky předané ŠPZ', color: COLOR_ORANGE },
  ];

  for (const section of sections) {
    const sheetNames = Object.keys(groups).filter((sheet) =>
      Object.keys(groups[sheet]).some((oblast) =>
        Object.keys(groups[sheet][oblast]).some((op) => groups[sheet][oblast][op].some((m) => data.choices[m.id] === section.key))
      )
    );
    if (sheetNames.length === 0) continue;

    ensureSpace(lineHeightMm(15) + 6);
    pdfDoc.setFont(FONT_NAME, 'bold');
    pdfDoc.setFontSize(14.5);
    pdfDoc.setTextColor(...section.color);
    pdfDoc.text(section.heading, MARGIN, y);
    y += 3;
    y += 2;
    drawRule(section.color);
    y += 8;

    for (const sheet of sheetNames) {
      const oblasts = Object.keys(groups[sheet]).filter((oblast) =>
        Object.keys(groups[sheet][oblast]).some((op) => groups[sheet][oblast][op].some((m) => data.choices[m.id] === section.key))
      );
      if (oblasts.length === 0) continue;

      ensureSpace(lineHeightMm(9) + 4);
      pdfDoc.setFont(FONT_NAME, 'bold');
      pdfDoc.setFontSize(9);
      pdfDoc.setTextColor(...section.color);
      pdfDoc.text(`List: ${sheet}`.toUpperCase(), MARGIN, y);
      y += lineHeightMm(9) + 3;

      for (const oblast of oblasts) {
        const steps = Object.keys(groups[sheet][oblast]).flatMap((op) =>
          groups[sheet][oblast][op].filter((m) => data.choices[m.id] === section.key)
        );
        if (steps.length === 0) continue;

        ensureSpace(lineHeightMm(12) + 10);
        pdfDoc.setFont(FONT_NAME, 'bold');
        pdfDoc.setFontSize(11.5);
        pdfDoc.setTextColor(...COLOR_NAVY_80);
        pdfDoc.text(`Oblast: ${oblast}`, MARGIN, y);
        y += lineHeightMm(11.5) + 3;

        continuationContext = { oblast, color: section.color };
        const bulletX = MARGIN + 2;
        const textX = MARGIN + 6;
        const textW = CONTENT_W - 6;

        for (const step of steps) {
          ensureSpace(lineHeightMm(10.5) + 3);
          // Malý barevný odrážkový bod — vizuální kontinuita s appkou, ale bez
          // podbarvení celé plochy (pro tisk formálnější a úspornější na inkoust).
          pdfDoc.setFillColor(...section.color);
          pdfDoc.circle(bulletX, y - 1.3, 0.9, 'F');

          if (step.opatreni !== '-' && step.opatreni !== step.krok) {
            drawWrapped(step.opatreni, textX, textW, 8.5, 'bold', COLOR_NAVY_40);
            y += 0.5;
          }
          drawWrapped(step.krok, textX, textW, 10.5, 'bold', COLOR_NAVY);
          const note = data.notes[step.id];
          if (note) {
            y += 0.5;
            drawWrapped(`Poznámka: ${note}`, textX, textW, 9, 'normal', COLOR_NAVY_60);
          }
          y += 4;
        }
        continuationContext = null;
        y += 3;
      }
    }
    y += 4;
  }

  // ---------- Patička (číslo stránky) na každé stránce ----------
  const totalPages = pdfDoc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdfDoc.setPage(i);
    pdfDoc.setFont(FONT_NAME, 'normal');
    pdfDoc.setFontSize(8);
    pdfDoc.setTextColor(...COLOR_NAVY_40);
    pdfDoc.text('Katalog podpůrných opatření · afres.cz', MARGIN, PAGE_H - 10);
    pdfDoc.text(`Strana ${i} / ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
  }

  return pdfDoc;
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
