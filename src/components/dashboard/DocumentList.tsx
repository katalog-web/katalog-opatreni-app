'use client';

import { useState } from 'react';
import { Search, Download, Trash2, FolderInput, CheckCircle2, HelpCircle, FolderOpen, Folder } from 'lucide-react';
import type { DocumentRecord, FolderRecord } from '@/lib/dashboardTypes';

interface DocumentListProps {
  documents: DocumentRecord[];
  folders: FolderRecord[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onDownload: (doc: DocumentRecord) => void;
  onOpenInCatalog: (doc: DocumentRecord) => void;
  onMove: (docId: string, folderId: string | null) => void;
  onDelete: (docId: string) => void;
}

function formatDate(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString('cs-CZ')} ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`;
}

export function DocumentList({ documents, folders, searchQuery, onSearchChange, onDownload, onOpenInCatalog, onMove, onDelete }: DocumentListProps) {
  const [openMoveMenuId, setOpenMoveMenuId] = useState<string | null>(null);

  // Název složky ke každému dokumentu — ať je i v pohledu "Všechny dokumenty" hned
  // vidět, kde už dokument je zařazený, bez nutnosti do složek proklikávat zvlášť.
  const folderNameById: Record<string, string> = {};
  folders.forEach(f => { folderNameById[f.id] = f.name; });

  return (
    <div className="flex-1 min-w-0">
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-navy/30" />
        <input
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Hledat v dokumentech (role, škola, účel, poznámky...)"
          className="w-full pl-12 pr-6 py-3.5 bg-white border border-brand-surface/50 rounded-2xl outline-none focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 transition-all text-brand-navy font-medium"
        />
      </div>

      {documents.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed border-brand-surface/40 rounded-3xl">
          {searchQuery ? (
            <img
              src="/illustrations/skica_obycejna_08_lupa_identifikace.png"
              alt=""
              className="w-28 mx-auto mb-4 select-none pointer-events-none opacity-90"
            />
          ) : (
            <img
              src="/illustrations/skica_obycejna_01_zarovka.png"
              alt=""
              className="w-40 mx-auto mb-4 select-none pointer-events-none opacity-90"
            />
          )}
          <p className="text-brand-navy/50 font-medium">
            {searchQuery ? 'Žádný dokument neodpovídá hledání.' : 'Zatím zde nejsou žádné dokumenty.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {documents.map(docItem => (
            <div
              key={docItem.id}
              className="bg-white rounded-2xl border-2 border-brand-surface/30 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-bold text-brand-navy truncate mb-1">{docItem.title}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/50 font-medium">
                  <span>{formatDate(docItem.createdAt)}</span>
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
                      docItem.folderId
                        ? 'bg-brand-yellow/15 text-brand-navy/70'
                        : 'bg-brand-surface/20 text-brand-navy/40 italic'
                    }`}
                    title={docItem.folderId ? `Ve složce „${folderNameById[docItem.folderId] ?? '…'}"` : 'Není v žádné složce'}
                  >
                    <Folder className="w-3 h-3" />
                    {docItem.folderId ? (folderNameById[docItem.folderId] ?? 'Neznámá složka') : 'Nezařazené'}
                  </span>
                  {docItem.role && <span className="bg-brand-surface/20 px-2 py-0.5 rounded-md">{docItem.role}</span>}
                  {docItem.schoolType && <span className="bg-brand-surface/20 px-2 py-0.5 rounded-md">{docItem.schoolType}</span>}
                  <span className="flex items-center gap-1 text-brand-green font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {docItem.pouzijuCount}
                  </span>
                  <span className="flex items-center gap-1 text-brand-orange font-bold">
                    <HelpCircle className="w-3.5 h-3.5" /> {docItem.spzCount}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 relative">
                <button
                  onClick={() => onOpenInCatalog(docItem)}
                  title="Pokračovat v katalogu (předvyplní dotazník i vybraná opatření)"
                  className="p-2.5 text-brand-navy/50 hover:text-brand-navy hover:bg-brand-bg rounded-xl transition-colors"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>

                <button
                  onClick={() => onDownload(docItem)}
                  title="Stáhnout PDF"
                  className="p-2.5 text-brand-navy/50 hover:text-brand-navy hover:bg-brand-bg rounded-xl transition-colors"
                >
                  <Download className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setOpenMoveMenuId(openMoveMenuId === docItem.id ? null : docItem.id)}
                  title="Přesunout do složky"
                  className="p-2.5 text-brand-navy/50 hover:text-brand-navy hover:bg-brand-bg rounded-xl transition-colors"
                >
                  <FolderInput className="w-5 h-5" />
                </button>

                {openMoveMenuId === docItem.id && (
                  <div className="absolute right-0 top-full mt-2 z-10 bg-white rounded-2xl shadow-xl border-2 border-brand-surface/30 py-2 w-56 max-h-64 overflow-y-auto">
                    <button
                      onClick={() => {
                        onMove(docItem.id, null);
                        setOpenMoveMenuId(null);
                      }}
                      className="w-full text-left px-4 py-2 text-sm font-bold text-brand-navy/70 hover:bg-brand-bg"
                    >
                      Nezařazené
                    </button>
                    {folders.map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          onMove(docItem.id, f.id);
                          setOpenMoveMenuId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm font-bold text-brand-navy/70 hover:bg-brand-bg truncate"
                      >
                        {f.name}
                      </button>
                    ))}
                    {folders.length === 0 && (
                      <p className="px-4 py-2 text-xs text-brand-navy/30 italic">Zatím žádné složky</p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => {
                    if (window.confirm('Opravdu chcete tento dokument trvale smazat?')) onDelete(docItem.id);
                  }}
                  title="Smazat"
                  className="p-2.5 text-brand-navy/30 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
