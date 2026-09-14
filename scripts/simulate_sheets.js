const fs = require('fs');
const path = require('path');

const measuresFile = path.join(__dirname, '../src/data/measures.json');

try {
    const data = JSON.parse(fs.readFileSync(measuresFile, 'utf8'));
    
    // Názvy fiktivních listů
    const sheets = [
        "1. Organizace výuky",
        "2. Metody výuky",
        "3. Hodnocení žáka"
    ];

    let newMeasures = [];
    let counter = 1;

    // Pro každý list vytvoříme kopii aktuálních dat
    for (const sheetName of sheets) {
        for (const item of data) {
            newMeasures.push({
                ...item,
                id: `po_sim_${counter++}`,
                sheetName: sheetName
            });
        }
    }

    fs.writeFileSync(measuresFile, JSON.stringify(newMeasures, null, 2));
    console.log(`✅ Úspěšně nasimulována data pro 3 listy. Celkem ${newMeasures.length} kroků k hodnocení.`);

} catch (e) {
    console.error("❌ Došlo k chybě.", e);
}
