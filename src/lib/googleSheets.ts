/**
 * Jednoduchý CSV parser, který zvládá uvozovky a čárky uvnitř buněk.
 */
function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentCell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (currentCell || currentLine.length > 0) {
        currentLine.push(currentCell.trim());
        lines.push(currentLine);
      }
      currentLine = [];
      currentCell = '';
      if (char === '\r' && nextChar === '\n') i++;
    } else {
      currentCell += char;
    }
  }
  
  if (currentCell || currentLine.length > 0) {
    currentLine.push(currentCell.trim());
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Načte data z veřejně publikované Google Tabulky (ve formátu CSV).
 */
export async function fetchMeasuresFromGoogleSheets(sheetUrl: string) {
  try {
    const response = await fetch(sheetUrl, { next: { revalidate: 60 } }); // Cache 60 sekund
    if (!response.ok) throw new Error('Nepodařilo se stáhnout data z Google Tabulky.');
    
    const csvText = await response.text();
    const rows = parseCSV(csvText.trim());
    
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim().toLowerCase());
    
    // Mapování sloupců na indexy (flexibilní pořadí)
    const findIndex = (search: string) => headers.findIndex(h => h.includes(search));

    const colIdx = {
      id: findIndex('id'),
      sheetName: findIndex('sheetname') !== -1 ? findIndex('sheetname') : findIndex('list'),
      oblast: findIndex('oblast'),
      opatreni: findIndex('opatreni'),
      krok: findIndex('krok')
    };

    // Pokud chybí klíčová pole, vrátíme chybu
    if (colIdx.krok === -1) {
      console.error('Tabulka nemá sloupec "krok". Dostupné hlavičky:', headers);
      return [];
    }

    return rows.slice(1).map((row, index) => ({
      id: colIdx.id !== -1 ? row[colIdx.id] : `row_${index + 1}`,
      sheetName: colIdx.sheetName !== -1 ? row[colIdx.sheetName] : 'Ostatní',
      oblast: colIdx.oblast !== -1 ? row[colIdx.oblast] : 'Nezařazeno',
      opatreni: colIdx.opatreni !== -1 ? row[colIdx.opatreni] : '',
      krok: row[colIdx.krok] || ''
    })).filter(m => m.krok); // Filtrovat prázdné řádky

  } catch (error) {
    console.error('Chyba při načítání tabulky:', error);
    return null; // Signalizace chyby pro fallback
  }
}
