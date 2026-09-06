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
  pdfBase64: string;
  ownerEmail?: string;
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
