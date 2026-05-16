const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = "Pracovní tabulka PO list I.1.xlsx";
const OUTPUT_FILE = path.join(__dirname, '../src/data/measures.json');

try {
    const workbook = xlsx.readFile(EXCEL_FILE);
    const result = [];
    let globalId = 1;

    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        let currentOblast = "Obecné";
        
        // Skip header (row 0)
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const cleanText = (txt) => {
                if (!txt) return "";
                let cleaned = txt.toString().trim().replace(/^[-•]\s*/, '').trim();
                // Smazat mezeru před tečkou na konci věty
                cleaned = cleaned.replace(/\s+\./g, '.');
                if (cleaned.length === 0) return "";
                return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
            };

            const oblast = row[0];
            const opatreniClean = cleanText(row[1]);
            const krokyRaw = row[2];

            if (oblast && oblast.trim()) {
                currentOblast = oblast.trim();
            }

            if (!opatreniClean || !krokyRaw) continue;

            // Split kroky by newline
            const kroky = krokyRaw.split('\n')
                .map(k => cleanText(k))
                .filter(k => k && k !== '-');

            kroky.forEach(krok => {
                const oblastFormatted = cleanText(currentOblast);
                const oblastSentenceCase = oblastFormatted.charAt(0).toUpperCase() + oblastFormatted.slice(1).toLowerCase();
                
                result.push({
                    id: `imp_${globalId++}`,
                    sheetName: sheetName.trim(),
                    oblast: oblastSentenceCase,
                    opatreni: opatreniClean,
                    krok: krok
                });
            });
        }
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log(`Imported ${result.length} measures from Excel to ${OUTPUT_FILE}`);

} catch (e) {
    console.error("Import failed:", e);
    process.exit(1);
}
