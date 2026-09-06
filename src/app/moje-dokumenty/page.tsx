'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SectionEyebrow } from '@/components/SectionEyebrow';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { FolderSidebar } from '@/components/dashboard/FolderSidebar';
import { DocumentList } from '@/components/dashboard/DocumentList';
import { downloadBase64Pdf } from '@/lib/generateSummaryPdf';
import type { DocumentRecord, FolderRecord, FolderSelection } from '@/lib/dashboardTypes';

function toMillis(ts: unknown): number | null {
  if (ts instanceof Timestamp) return ts.toMillis();
  return null;
}

function DashboardContent() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selected, setSelected] = useState<FolderSelection>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    const foldersQ = query(collection(db, 'users', user.uid, 'folders'), orderBy('createdAt', 'asc'));
    const unsubFolders = onSnapshot(foldersQ, snap => {
      setFolders(
        snap.docs.map(d => ({
          id: d.id,
          name: (d.data().name as string) ?? 'Bez názvu',
          createdAt: toMillis(d.data().createdAt),
        }))
      );
    });

    const docsQ = query(collection(db, 'users', user.uid, 'documents'), orderBy('createdAt', 'desc'));
    const unsubDocs = onSnapshot(docsQ, snap => {
      setDocuments(
        snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: (data.title as string) ?? 'Bez názvu',
            createdAt: toMillis(data.createdAt),
            folderId: (data.folderId as string | null) ?? null,
            pdfBase64: (data.pdfBase64 as string) ?? '',
            childNumber: data.childNumber,
            childAge: data.childAge,
            childGender: data.childGender,
            childGrade: data.childGrade,
            role: data.role,
            schoolType: data.schoolType,
            studentCount: data.studentCount,
            purpose: data.purpose,
            pouzijuCount: (data.pouzijuCount as number) ?? 0,
            spzCount: (data.spzCount as number) ?? 0,
            choices: data.choices,
            searchText: data.searchText,
          } as DocumentRecord;
        })
      );
    });

    return () => {
      unsubFolders();
      unsubDocs();
    };
  }, [user]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of documents) {
      if (d.folderId) c[d.folderId] = (c[d.folderId] || 0) + 1;
    }
    return c;
  }, [documents]);

  const unfiledCount = useMemo(() => documents.filter(d => !d.folderId).length, [documents]);

  const filteredDocuments = useMemo(() => {
    let list = documents;
    if (selected === 'unfiled') list = list.filter(d => !d.folderId);
    else if (selected !== 'all') list = list.filter(d => d.folderId === selected);

    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter(d => (d.searchText || d.title.toLowerCase()).includes(q));

    return list;
  }, [documents, selected, searchQuery]);

  if (!user) return null;

  const handleCreateFolder = async (name: string) => {
    await addDoc(collection(db, 'users', user.uid, 'folders'), {
      name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await updateDoc(doc(db, 'users', user.uid, 'folders', id), { name, updatedAt: serverTimestamp() });
  };

  const handleDeleteFolder = async (id: string) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', user.uid, 'folders', id));
    // Dokumenty ve smazané složce se přesunou mezi nezařazené, nikdy se nemažou.
    for (const d of documents) {
      if (d.folderId === id) {
        batch.update(doc(db, 'users', user.uid, 'documents', d.id), { folderId: null });
      }
    }
    await batch.commit();
    if (selected === id) setSelected('all');
  };

  const handleMove = async (docId: string, folderId: string | null) => {
    await updateDoc(doc(db, 'users', user.uid, 'documents', docId), { folderId });
  };

  const handleDelete = async (docId: string) => {
    await deleteDoc(doc(db, 'users', user.uid, 'documents', docId));
  };

  const handleDownload = (docItem: DocumentRecord) => {
    if (!docItem.pdfBase64) return;
    const safeName = docItem.title.replace(/[^\p{L}\p{N}._-]+/gu, '_');
    downloadBase64Pdf(docItem.pdfBase64, `${safeName}.pdf`);
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 md:py-16">
      <div className="mb-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-brand-navy/40 hover:text-brand-navy transition-colors text-xs font-bold uppercase tracking-wider mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Zpět do katalogu
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-navy/5 flex items-center justify-center text-brand-navy">
            <FolderOpen className="w-7 h-7" />
          </div>
          <div>
            <SectionEyebrow>Dokumenty</SectionEyebrow>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand-navy">Moje dokumenty</h1>
            <p className="font-body text-brand-navy/50 font-medium mt-1">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <FolderSidebar
          folders={folders}
          selected={selected}
          onSelect={setSelected}
          onCreate={handleCreateFolder}
          onRename={handleRenameFolder}
          onDelete={handleDeleteFolder}
          counts={counts}
          unfiledCount={unfiledCount}
          totalCount={documents.length}
        />
        <DocumentList
          documents={filteredDocuments}
          folders={folders}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onDownload={handleDownload}
          onMove={handleMove}
          onDelete={handleDelete}
        />
      </div>
      <Footer />
    </main>
  );
}

export default function MojeDokumentyPage() {
  return (
    <AuthGate>
      <Header context="app" />
      <DashboardContent />
    </AuthGate>
  );
}
