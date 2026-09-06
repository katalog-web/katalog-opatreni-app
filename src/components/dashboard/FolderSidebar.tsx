'use client';

import { useState } from 'react';
import { Folder, FolderPlus, Inbox, Layers, Pencil, Trash2, Check, X } from 'lucide-react';
import type { FolderRecord, FolderSelection } from '@/lib/dashboardTypes';

interface FolderSidebarProps {
  folders: FolderRecord[];
  selected: FolderSelection;
  onSelect: (selection: FolderSelection) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  counts: Record<string, number>;
  unfiledCount: number;
  totalCount: number;
}

export function FolderSidebar({
  folders,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  counts,
  unfiledCount,
  totalCount,
}: FolderSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await onCreate(name);
    setNewName('');
    setIsCreating(false);
  };

  const startRename = (folder: FolderRecord) => {
    setEditingId(folder.id);
    setEditingName(folder.name);
  };

  const commitRename = async () => {
    const name = editingName.trim();
    if (editingId && name) await onRename(editingId, name);
    setEditingId(null);
  };

  const itemClass = (active: boolean) =>
    `w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-colors ${
      active ? 'bg-brand-navy text-white shadow-sm' : 'text-brand-navy/70 hover:bg-brand-bg'
    }`;

  return (
    <div className="w-full md:w-64 flex-shrink-0 space-y-1">
      <button className={itemClass(selected === 'all')} onClick={() => onSelect('all')}>
        <span className="flex items-center gap-2">
          <Layers className="w-4 h-4" /> Všechny dokumenty
        </span>
        <span className="text-xs opacity-70">{totalCount}</span>
      </button>

      <button className={itemClass(selected === 'unfiled')} onClick={() => onSelect('unfiled')}>
        <span className="flex items-center gap-2">
          <Inbox className="w-4 h-4" /> Nezařazené
        </span>
        <span className="text-xs opacity-70">{unfiledCount}</span>
      </button>

      <div className="pt-3 pb-1 px-4 text-xs font-black text-brand-navy/30 uppercase tracking-wider">Složky</div>

      {folders.map(folder => (
        <div key={folder.id} className="group">
          {editingId === folder.id ? (
            <div className="flex items-center gap-1 px-2">
              <input
                autoFocus
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="flex-1 px-3 py-2 rounded-xl border-2 border-brand-yellow outline-none text-sm font-bold text-brand-navy"
              />
              <button onClick={commitRename} className="p-1.5 text-brand-green hover:bg-brand-green/10 rounded-lg">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingId(null)} className="p-1.5 text-brand-navy/40 hover:bg-brand-bg rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button className={itemClass(selected === folder.id) + ' relative'} onClick={() => onSelect(folder.id)}>
              <span className="flex items-center gap-2 min-w-0">
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{folder.name}</span>
              </span>
              <span className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs opacity-70">{counts[folder.id] || 0}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation();
                    startRename(folder);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded-md transition-opacity"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => {
                    e.stopPropagation();
                    if (window.confirm(`Smazat složku "${folder.name}"? Dokumenty v ní zůstanou zachovány jako nezařazené.`)) {
                      onDelete(folder.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded-md transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </span>
              </span>
            </button>
          )}
        </div>
      ))}

      {isCreating ? (
        <div className="flex items-center gap-1 px-2 pt-1">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setIsCreating(false);
            }}
            placeholder="Název složky..."
            className="flex-1 px-3 py-2 rounded-xl border-2 border-brand-yellow outline-none text-sm font-bold text-brand-navy"
          />
          <button onClick={handleCreate} className="p-1.5 text-brand-green hover:bg-brand-green/10 rounded-lg">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => setIsCreating(false)} className="p-1.5 text-brand-navy/40 hover:bg-brand-bg rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-brand-navy/40 hover:text-brand-navy hover:bg-brand-bg transition-colors"
        >
          <FolderPlus className="w-4 h-4" /> Nová složka
        </button>
      )}
    </div>
  );
}
