import type { Choice } from '@/components/MeasureCard';

export interface FolderRecord {
  id: string;
  name: string;
  createdAt: number | null;
}

export interface DocumentRecord {
  id: string;
  title: string;
  createdAt: number | null;
  folderId: string | null;
  // Starší dokumenty mají PDF přímo tady (base64). Novější ho mají rozdělené na
  // kousky v podkolekci pdfChunks (viz pdfChunkCount) — appka je při stažení
  // sama poskládá, viz loadDocumentPdfBase64 v moje-dokumenty/admin stránkách.
  pdfBase64?: string;
  pdfChunkCount?: number;
  ownerEmail?: string;
  ownerUid?: string;
  childNumber?: string;
  childAge?: string;
  childAgeYears?: string;
  childAgeMonths?: string;
  childGender?: string;
  childGrade?: string;
  childNeeds?: string;
  role?: string;
  schoolType?: string;
  studentCount?: string;
  purpose?: string;
  pouzijuCount: number;
  spzCount: number;
  choices?: Record<string, Choice>;
  notes?: Record<string, string>;
  searchText?: string;
}

/** Speciální hodnoty výběru ve složkách vedle skutečných folderId. */
export type FolderSelection = 'all' | 'unfiled' | string;
