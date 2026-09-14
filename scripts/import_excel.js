const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Zdroj: "Nejnovější Tabulka PO .xlsx" v kořeni repa — aktuální pracovní tabulka PO,
// nahrazuje starší "Pracovní tabulka PO list I.1.xlsx" (obsahovala jen listy I.1 a I.4).
const EXCEL_FILE = path.join(__dirname, '../Nejnovější Tabulka PO .xlsx');
const OUTPUT_FILE = path.join(__dirname, '../src/data/measures.json');

// Import jen listů I.1–I.6 (list "Obecné principy kvalitní výuky" má odlišnou
// strukturu — kategorie napříč celým listem, ne PO — a zatím se do katalogu nepromítá).
const SHEETS_TO_IMPORT = [
    ' I.1 Organizace výuky',
    'I.2 Modifikace metod a vyučovac',
    'I.3 Intervence',
    'I.4 Pomůcky',
    'I.5 Hodnocení',
    'I.6 Domácí příprava',
];

// Ojedinělé pozůstatky nedokončených editorských poznámek přímo v textu zdrojové
// tabulky (potvrzeno cíleným průchodem všech 6 listů — jde o izolované případy, ne
// systémový vzor). Klíč je přesný text PO úpravě cleanText (odrážka/mezery/velké
// písmeno na začátku), hodnota je opravený text bez poznámky.
const KROK_FIXES = {
    'Zajistit, aby úložné místo bylo v klidnější části třídy nebo šatny doplnit důvod':
        'Zajistit, aby úložné místo bylo v klidnější části třídy nebo šatny',
};

const cleanText = (txt) => {
    if (!txt) return '';
    // Odstranit odrážku na začátku ("-", "•" i "*" — tabulka je nekonzistentně používá všechny tři)
    let cleaned = txt.toString().trim().replace(/^[-•*]\s*/, '').trim();
    // Sjednotit vícenásobné mezery (časté u ručně psaného textu v tabulce)
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    // Smazat mezeru před tečkou/čárkou na konci věty či uvnitř výčtu
    cleaned = cleaned.replace(/\s+([.,])/g, '$1');
    // Zrušit markdown tučné zvýraznění (**text**) — v katalogu se nezobrazuje, jen matoucí hvězdičky
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    if (cleaned.length === 0) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

// Stejné jako cleanText, ale navíc jen pro konkrétní kroky (ne pro oblast/opatření —
// to jsou nadpisy/kategorie, ne věty, tečka na konci by tam vypadala rušivě):
// doplní ojedinělé ruční opravy a sjednotí koncovou interpunkci.
const cleanKrok = (txt) => {
    let cleaned = cleanText(txt);
    if (!cleaned) return cleaned;
    if (KROK_FIXES[cleaned]) cleaned = KROK_FIXES[cleaned];
    // Ojedinělá zdvojená tečka na konci (přímo v tabulce, např. "apod..") — sjednotit na jednu.
    cleaned = cleaned.replace(/\.\.+$/, '.');
    // Krok, který nekončí žádnou koncovou interpunkcí, dostane tečku (v exportovaném
    // PDF jinak působí neučesaně — cca třetina kroků ve zdrojové tabulce ji chybí).
    if (!/[.!?:;)"']$/.test(cleaned)) cleaned += '.';
    return cleaned;
};

// Název oblasti (pod-kategorie) v tabulce je většinou celý VELKÝMI PÍSMENY — převést
// na běžný "sentence case" (první písmeno velké, zbytek malý), stejně jako u starého importu.
const cleanOblastLabel = (txt) => {
    const cleaned = cleanText(txt);
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
};

// Excel omezuje název listu (tabu) na 31 znaků, takže u delších názvů (např. I.2) je
// tab v sešitu oříznutý ("...vyučovac"). Skutečný, neoříznutý název listu je v buňce A1
// (řádek 0) tabulky, jen celý velkými písmeny — zformátovat ho na čitelný název pro UI.
const formatSheetTitle = (raw, fallback) => {
    if (!raw) return fallback.trim();
    const m = raw.toString().match(/^I\.\s*(\d+)\s*(.*)$/i);
    if (!m) return raw.toString().trim();
    const num = m[1];
    const rest = m[2].trim().toLowerCase();
    if (!rest) return `I.${num}`;
    return `I.${num} ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
};

try {
    const workbook = xlsx.readFile(EXCEL_FILE);
    const result = [];
    let globalId = 1;

    SHEETS_TO_IMPORT.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            console.warn(`List "${sheetName}" v sešitu nenalezen, přeskočeno.`);
            return;
        }

        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        const displaySheetName = formatSheetTitle(data[0] && data[0][0], sheetName);

        // Fallback oblast pro listy bez pod-oblastí (I.5, I.6) = název listu bez "I.X" prefixu.
        let currentOblast = displaySheetName.replace(/^I\.\d+\s*/, '').trim() || displaySheetName;

        // Řádek 0 = titulek listu, řádek 1 = hlavičky sloupců -> oba přeskočit.
        for (let i = 2; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const col0 = row[0];
            const col1 = row[1];
            const col1Empty = col1 === undefined || col1 === null || (typeof col1 === 'string' && col1.trim() === '');

            // Řádek jen s prvním sloupcem = nadpis nové pod-oblasti (kategorie v rámci listu).
            if (col0 && col1Empty) {
                currentOblast = cleanOblastLabel(col0);
                continue;
            }

            const opatreniClean = cleanText(col0);
            const krokyRaw = col1;
            if (!opatreniClean || !krokyRaw) continue;

            // Ojediněle v tabulce chybí odřádkování mezi dvěma odrážkami (".*" beze
            // zalomení místo ".\n*") — takové místo doplnit, ať se krok nespojí s dalším.
            const krokyFixed = krokyRaw.toString().replace(/\.\*(\s)/g, '.\n*$1');

            // Konkrétní kroky jsou v buňce odřádkované, jeden krok na řádek. Ojediněle je
            // seznam kroků rozdělený do fází nadpisem bez odrážky, končícím dvojtečkou
            // (např. "Přípravná fáze:") — to není konkrétní krok, ale jen nadpis, vynechat.
            const kroky = krokyFixed
                .split('\n')
                .filter((k) => {
                    const trimmed = k.trim();
                    const isBullet = /^[-*•]/.test(trimmed);
                    return isBullet || !/:$/.test(trimmed);
                })
                .map((k) => cleanKrok(k))
                .filter((k) => k && k !== '-' && k !== '.');

            kroky.forEach((krok) => {
                result.push({
                    id: `imp_${globalId++}`,
                    sheetName: displaySheetName,
                    oblast: currentOblast,
                    opatreni: opatreniClean,
                    krok,
                });
            });
        }
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log(`Imported ${result.length} measures from Excel to ${OUTPUT_FILE}`);
} catch (e) {
    console.error('Import failed:', e);
    process.exit(1);
}
