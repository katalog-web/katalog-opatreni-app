// Pevný seznam listů katalogu a pomocná funkce na rozdělení jejich názvu na
// číslo ("I.1") a popisek ("Organizace výuky") — sdílené mezi Header (menu
// "Katalog") a hlavní stránkou (záložky listů), ať se nerozjedou při úpravě
// jen na jednom místě. Řád i přesné názvy musí odpovídat sheetName v
// src/data/measures.json.
export const CATALOG_SHEETS = [
  'I.1 Organizace výuky',
  'I.2 Modifikace metod a učebních forem',
  'I.3 Intervence',
  'I.4 Pomůcky',
  'I.5 Hodnocení',
  'I.6 Domácí příprava',
] as const;

export function splitSheetLabel(sheetName: string): { num: string; label: string } {
  const match = sheetName.match(/^(I\.\d+)\s*(.*)$/);
  if (!match) return { num: '', label: sheetName };
  return { num: match[1], label: match[2] };
}
