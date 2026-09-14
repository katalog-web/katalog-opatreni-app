const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Zdroj: list "Obecné principy kvalitní výuky" v "Nejnovější Tabulka PO .xlsx".
// Na rozdíl od listů I.1–I.6 (import_excel.js) nejde o opatření k výběru pro
// konkrétní dítě, ale o 7 obecných pedagogických kategorií (každá s "účelem" a
// "zaměřením") — proto samostatný skript a samostatný výstupní soubor.
const EXCEL_FILE = path.join(__dirname, '../Nejnovější Tabulka PO .xlsx');
const OUTPUT_FILE = path.join(__dirname, '../src/data/principles.json');
const SHEET_NAME = 'Obecné principy kvalitní výuky ';

const cleanText = (txt) => {
    if (!txt) return '';
    let cleaned = txt.toString().trim().replace(/^[-•*]\s*/, '').trim();
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\s+([.,])/g, '$1');
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    if (cleaned.length === 0) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

// Buňka s kategorií vypadá takto (jeden řádek na "\n"):
//   "1. Hodnocení, podpora učení "
//   "účel: využití hodnocení pro učení"
//   "zaměření PO: kritéria hodnocení, formativní hodnocení, komunikace hodnocení"
const parseKategorieCell = (raw) => {
    const lines = raw.toString().split('\n').map((l) => l.trim()).filter(Boolean);
    const titleLine = lines[0] || '';
    const match = titleLine.match(/^(\d+)\.\s*(.*)$/);
    if (!match) return null; // Nejde o skutečnou kategorii (viz "Přehozeno z metod - souhlas?" quirk)

    const cisloKategorie = parseInt(match[1], 10);
    const nazev = cleanText(match[2]);
    const ucelLine = lines.find((l) => /^účel\s*:/i.test(l));
    const zamereniLine = lines.find((l) => /^zaměření\s*po\s*:/i.test(l));
    const ucel = ucelLine ? cleanText(ucelLine.replace(/^účel\s*:\s*/i, '')) : '';
    const zamereni = zamereniLine ? cleanText(zamereniLine.replace(/^zaměření\s*po\s*:\s*/i, '')) : '';

    return { cisloKategorie, nazev, ucel, zamereni };
};

try {
    const workbook = xlsx.readFile(EXCEL_FILE);
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) throw new Error(`List "${SHEET_NAME}" nenalezen.`);

    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const result = [];
    let globalId = 1;
    let current = null; // { cisloKategorie, nazev, ucel, zamereni }

    data.forEach((row) => {
        if (!row || row.length === 0) return;

        const col0 = row[0];
        if (col0) {
            const parsed = parseKategorieCell(col0);
            // Pokud col0 neodpovídá vzoru "N. Název" (pracovní komentář typu
            // "Přehozeno z metod - souhlas?"), ignorovat a zůstat u aktuální kategorie.
            if (parsed) current = parsed;
        }
        if (!current) return; // Řádky před první rozpoznanou kategorií přeskočit.

        const opatreniClean = cleanText(row[1]);
        const krokyRaw = row[2];
        if (!opatreniClean || !krokyRaw) return;

        const krokyFixed = krokyRaw.toString().replace(/\.\*(\s)/g, '.\n*$1');
        const kroky = krokyFixed
            .split('\n')
            .filter((k) => {
                const trimmed = k.trim();
                const isBullet = /^[-*•]/.test(trimmed);
                return isBullet || !/:$/.test(trimmed);
            })
            .map((k) => cleanText(k))
            .filter((k) => k && k !== '-');

        kroky.forEach((krok) => {
            result.push({
                id: `princ_${globalId++}`,
                cisloKategorie: current.cisloKategorie,
                kategorie: current.nazev,
                ucel: current.ucel,
                zamereni: current.zamereni,
                opatreni: opatreniClean,
                krok,
            });
        });
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log(`Imported ${result.length} principles from Excel to ${OUTPUT_FILE}`);
} catch (e) {
    console.error('Import failed:', e);
    process.exit(1);
}
