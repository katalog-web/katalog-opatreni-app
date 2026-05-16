const xlsx = require('xlsx');
const fs = require('fs');

const filename = process.argv[2];
try {
    const workbook = xlsx.readFile(filename);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    // Write just the first 5 rows to see headers and some data
    fs.writeFileSync('excel_sample.json', JSON.stringify(data.slice(0, 5), null, 2));
} catch (e) {
    console.error("Error:", e);
}
