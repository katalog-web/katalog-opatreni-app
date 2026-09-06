'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Mail, Clock, CheckCircle2, HelpCircle, RefreshCw, Trash2, User, School, Users, BarChart3, TrendingUp, Download, ShieldCheck, UserPlus, X, MessageCircle, Hourglass, Check, Search, FileText } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Header } from '@/components/Header';
import { SectionEyebrow } from '@/components/SectionEyebrow';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDoc, query, orderBy, deleteDoc, doc, setDoc, updateDoc, where, limit } from 'firebase/firestore';
import measuresData from '@/data/measures.json';
import * as XLSX from 'xlsx';
import { downloadBase64Pdf, loadDocumentPdfBase64 } from '@/lib/generateSummaryPdf';
import type { DocumentRecord } from '@/lib/dashboardTypes';

interface PdfLog {
  id: string; // Firestore document ID
  local_id?: string; // Original ID from client
  email: string;
  role?: string;
  schoolType?: string;
  studentCount?: string;
  purpose?: string;
  pouzijuCount: number;
  spzCount: number;
  timestamp: string;
  choices?: Record<string, string>;
}

interface AppStats {
  visitedUserIds: string[];
  generatedUserIds: string[];
  totalDocumentsGenerated: number;
  totalPouzijuChoicesSum: number;
  lastGeneratedAt: string | null; // ISO string
}

interface FeedbackItem {
  id: string;
  message: string;
  email: string | null;
  page: string | null;
  createdAt: string | null; // ISO string, null pokud ještě není zapsáno serverem
  resolved: boolean;
}

interface PendingUser {
  email: string; // Firestore document ID
  name: string | null;
  requestedAt: string | null; // ISO string
}

interface ApprovedUser {
  email: string; // Firestore document ID
  name: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const [logs, setLogs] = useState<PdfLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'history'>('users');
  const [exportSuccess, setExportSuccess] = useState(false);

  // Správa administrátorů — jeden dokument na e-mail v config/admins/members/{email}
  // (ne jedno pole se všemi e-maily), aby běžný uživatel neviděl kompletní seznam.
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [isAdminActionLoading, setIsAdminActionLoading] = useState(false);

  const fetchAdmins = async () => {
    try {
      const snap = await getDocs(collection(db, 'config', 'admins', 'members'));
      setAdminEmails(snap.docs.map(d => d.id));
    } catch (err) {
      console.error('Nepodařilo se načíst seznam administrátorů:', err);
    }
  };

  const handleAddAdmin = async () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    setAdminActionError(null);
    setIsAdminActionLoading(true);
    try {
      await setDoc(doc(db, 'config', 'admins', 'members', email), { addedAt: new Date().toISOString(), addedBy: user?.email || null });
      setNewAdminEmail('');
      await fetchAdmins();
    } catch (err) {
      console.error('Přidání administrátora selhalo:', err);
      setAdminActionError('Nepodařilo se přidat administrátora.');
    } finally {
      setIsAdminActionLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (email === user?.email?.toLowerCase()) {
      if (!confirm('Opravdu si chcete odebrat vlastní administrátorský přístup? Přijdete tak o možnost sem znovu vstoupit (dokud vás nepřidá jiný administrátor).')) return;
    } else if (!confirm(`Opravdu chcete odebrat administrátorský přístup uživateli ${email}?`)) {
      return;
    }
    setAdminActionError(null);
    setIsAdminActionLoading(true);
    try {
      await deleteDoc(doc(db, 'config', 'admins', 'members', email));
      await fetchAdmins();
    } catch (err) {
      console.error('Odebrání administrátora selhalo:', err);
      setAdminActionError('Nepodařilo se odebrat administrátora.');
    } finally {
      setIsAdminActionLoading(false);
    }
  };

  useEffect(() => {
    // Čekat na potvrzené isAdmin, ne jen na přihlášeného uživatele — jinak appka
    // zkouší tato admin-only data načíst i pro běžně přihlášeného (ne-admin) uživatele,
    // ještě než AuthGate stihne ověřit roli, a v konzoli naskočí nezachycená
    // FirebaseError: Missing or insufficient permissions (uživatel sám nic nevidí,
    // AuthGate mu správně ukáže „Nemáte oprávnění", ale chyba v konzoli zbytečně je).
    if (isAdmin) fetchAdmins();
  }, [isAdmin]);

  // Schvalování přístupu — kdo appku (se zdarma poskytnutým přístupem k datům o
  // dětech) smí používat, ručně rozhoduje administrátor. Stejný jeden-dokument-
  // na-e-mail vzor jako u administrátorů výše, jen ve dvou kolekcích (čekající / schválení).
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [isApprovalActionLoading, setIsApprovalActionLoading] = useState(false);
  const [approvalActionError, setApprovalActionError] = useState<string | null>(null);

  const fetchPendingUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'config', 'pending_users', 'members'));
      setPendingUsers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            email: d.id,
            name: data.name ?? null,
            requestedAt: data.requestedAt?.toDate ? data.requestedAt.toDate().toISOString() : null,
          };
        })
      );
    } catch (err) {
      console.error('Nepodařilo se načíst žádosti o schválení:', err);
    }
  };

  const fetchApprovedUsers = async () => {
    try {
      const snap = await getDocs(collection(db, 'config', 'approved_users', 'members'));
      setApprovedUsers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            email: d.id,
            name: data.name ?? null,
            approvedAt: data.approvedAt ?? null,
            approvedBy: data.approvedBy ?? null,
          };
        })
      );
    } catch (err) {
      console.error('Nepodařilo se načíst schválené uživatele:', err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchPendingUsers();
      fetchApprovedUsers();
    }
  }, [isAdmin]);

  const handleApproveUser = async (pending: PendingUser) => {
    setApprovalActionError(null);
    setIsApprovalActionLoading(true);
    try {
      await setDoc(doc(db, 'config', 'approved_users', 'members', pending.email), {
        name: pending.name,
        approvedAt: new Date().toISOString(),
        approvedBy: user?.email || null,
      });
      await deleteDoc(doc(db, 'config', 'pending_users', 'members', pending.email));
      await Promise.all([fetchPendingUsers(), fetchApprovedUsers()]);
    } catch (err) {
      console.error('Schválení přístupu selhalo:', err);
      setApprovalActionError('Nepodařilo se schválit přístup.');
    } finally {
      setIsApprovalActionLoading(false);
    }
  };

  const handleRejectUser = async (email: string) => {
    if (!confirm(`Opravdu chcete zamítnout žádost o přístup pro ${email}?`)) return;
    setApprovalActionError(null);
    setIsApprovalActionLoading(true);
    try {
      await deleteDoc(doc(db, 'config', 'pending_users', 'members', email));
      await fetchPendingUsers();
    } catch (err) {
      console.error('Zamítnutí žádosti selhalo:', err);
      setApprovalActionError('Nepodařilo se zamítnout žádost.');
    } finally {
      setIsApprovalActionLoading(false);
    }
  };

  const handleRevokeAccess = async (email: string) => {
    if (!confirm(`Opravdu chcete odebrat přístup uživateli ${email}?`)) return;
    setApprovalActionError(null);
    setIsApprovalActionLoading(true);
    try {
      await deleteDoc(doc(db, 'config', 'approved_users', 'members', email));
      await fetchApprovedUsers();
    } catch (err) {
      console.error('Odebrání přístupu selhalo:', err);
      setApprovalActionError('Nepodařilo se odebrat přístup.');
    } finally {
      setIsApprovalActionLoading(false);
    }
  };

  // Zpětná vazba od uživatelů (widget vpravo dole)
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(true);

  const fetchFeedback = async () => {
    setIsFeedbackLoading(true);
    try {
      const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setFeedbackItems(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            message: data.message ?? '',
            email: data.email ?? null,
            page: data.page ?? null,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
            resolved: data.resolved === true,
          };
        })
      );
    } catch (err) {
      console.error('Nepodařilo se načíst zpětnou vazbu:', err);
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  const handleToggleResolved = async (id: string, resolved: boolean) => {
    try {
      await updateDoc(doc(db, 'feedback', id), { resolved: !resolved });
      setFeedbackItems((prev) => prev.map((f) => (f.id === id ? { ...f, resolved: !resolved } : f)));
    } catch (err) {
      console.error('Nepodařilo se změnit stav zpětné vazby:', err);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('Opravdu chcete tuto zpětnou vazbu trvale smazat?')) return;
    try {
      await deleteDoc(doc(db, 'feedback', id));
      setFeedbackItems((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      console.error('Nepodařilo se smazat zpětnou vazbu:', err);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchFeedback();
  }, [isAdmin]);

  // Consolidated unique users list
  const uniqueUsers = useMemo(() => {
    const usersMap: Record<string, {
      email: string;
      loginCount: number;
      lastLogin: string | null;
      generatedPdf: boolean;
      purposes: string[];
      pdfLogs: PdfLog[];
    }> = {};

    // Process logins
    loginLogs.forEach(ll => {
      const email = ll.email?.trim().toLowerCase();
      if (!email) return;
      if (!usersMap[email]) {
        usersMap[email] = {
          email: ll.email, // Keep original casing
          loginCount: 0,
          lastLogin: null,
          generatedPdf: false,
          purposes: [],
          pdfLogs: []
        };
      }
      usersMap[email].loginCount++;
      if (!usersMap[email].lastLogin || new Date(ll.timestamp) > new Date(usersMap[email].lastLogin!)) {
        usersMap[email].lastLogin = ll.timestamp;
      }
    });

    // Process PDF logs
    logs.forEach(log => {
      const email = log.email?.trim().toLowerCase();
      if (!email) return;
      if (!usersMap[email]) {
        usersMap[email] = {
          email: log.email,
          loginCount: 0,
          lastLogin: null,
          generatedPdf: false,
          purposes: [],
          pdfLogs: []
        };
      }
      usersMap[email].generatedPdf = true;
      usersMap[email].pdfLogs.push(log);
      if (log.purpose && !usersMap[email].purposes.includes(log.purpose)) {
        usersMap[email].purposes.push(log.purpose);
      }
    });

    return Object.values(usersMap).sort((a, b) => {
      const aTime = Math.max(
        a.lastLogin ? new Date(a.lastLogin).getTime() : 0,
        a.pdfLogs.length > 0 ? new Date(a.pdfLogs[0].timestamp).getTime() : 0
      );
      const bTime = Math.max(
        b.lastLogin ? new Date(b.lastLogin).getTime() : 0,
        b.pdfLogs.length > 0 ? new Date(b.pdfLogs[0].timestamp).getTime() : 0
      );
      return bTime - aTime;
    });
  }, [logs, loginLogs]);

  const handleExportExcel = () => {
    setExportSuccess(true);
    try {
      // Create worksheet data
      const data = uniqueUsers.map(u => ({
        'Uživatel (E-mail)': u.email,
        'Počet přihlášení': u.loginCount,
        'Poslední přihlášení': u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('cs-CZ') + ' ' + new Date(u.lastLogin).toLocaleTimeString('cs-CZ') : '',
        'Vygeneroval PDF': u.generatedPdf ? 'Ano' : 'Ne',
        'Počet vygenerovaných PDF': u.pdfLogs.length,
        'Účely práce': u.purposes.join(', ')
      }));
      
      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // Adjust column widths automatically
      const wscols = [
        { wch: 30 }, // email
        { wch: 15 }, // logins
        { wch: 22 }, // last login
        { wch: 15 }, // generated
        { wch: 25 }, // pdf count
        { wch: 40 }  // purposes
      ];
      worksheet['!cols'] = wscols;

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Uživatelé a přístupy');
      
      // Save to file
      XLSX.writeFile(workbook, 'katalog_uzivatele_pristupy.xlsx');
    } catch (err) {
      console.error('Export to excel failed:', err);
    } finally {
      setTimeout(() => setExportSuccess(false), 1500);
    }
  };

  // Výpočet agregovaných statistik logů
  const measureStats = useMemo(() => {
    const stats: Record<string, { pouziju: number, spz: number }> = {};
    
    // Initialize stats
    measuresData.forEach((m: any) => {
      stats[m.id] = { pouziju: 0, spz: 0 };
    });

    logs.forEach(log => {
      if (log.choices) {
        Object.entries(log.choices).forEach(([id, choice]) => {
          if (stats[id]) {
            if (choice === 'POUZIJU') stats[id].pouziju++;
            if (choice === 'NECHAM_NA_SPZ') stats[id].spz++;
          }
        });
      }
    });

    return measuresData.map((m: any) => ({
      ...m,
      pouziju: stats[m.id]?.pouziju || 0,
      spz: stats[m.id]?.spz || 0,
      total: (stats[m.id]?.pouziju || 0) + (stats[m.id]?.spz || 0)
    })).filter((m: any) => m.total > 0).sort((a: any, b: any) => b.pouziju - a.pouziju);
  }, [logs]);

  const fetchPdfLogs = async () => {
    try {
      if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        setLogs([]);
        return;
      }

      const q = query(collection(db, 'pdf_logs'), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedLogs: PdfLog[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedLogs.push({
          id: doc.id,
          ...data
        } as PdfLog);
      });
      setLogs(fetchedLogs);
    } catch (err) {
      console.error('Fetch pdf logs failed:', err);
    }
  };

  const fetchLoginLogs = async () => {
    try {
      if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return;
      
      const q = query(collection(db, 'login_logs'), orderBy('timestamp', 'desc'), limit(500));
      const querySnapshot = await getDocs(q);
      const fetched: any[] = [];
      querySnapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() });
      });
      setLoginLogs(fetched);
    } catch (err) {
      console.error('Fetch login logs failed:', err);
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchPdfLogs(),
      fetchLoginLogs()
    ]);
    setIsLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchLogs(); }, [isAdmin]);

  // Souhrnné (anonymní) statistiky používání appky (config/stats) — doplňují
  // podrobnější, ale méně anonymní přehled z pdf_logs/login_logs níž.
  const [appStats, setAppStats] = useState<AppStats | null>(null);

  const fetchAppStats = async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'stats'));
      if (!snap.exists()) {
        setAppStats({ visitedUserIds: [], generatedUserIds: [], totalDocumentsGenerated: 0, totalPouzijuChoicesSum: 0, lastGeneratedAt: null });
        return;
      }
      const data = snap.data();
      setAppStats({
        visitedUserIds: (data.visitedUserIds as string[]) ?? [],
        generatedUserIds: (data.generatedUserIds as string[]) ?? [],
        totalDocumentsGenerated: (data.totalDocumentsGenerated as number) ?? 0,
        totalPouzijuChoicesSum: (data.totalPouzijuChoicesSum as number) ?? 0,
        lastGeneratedAt: data.lastGeneratedAt?.toDate ? data.lastGeneratedAt.toDate().toISOString() : null,
      });
    } catch (err) {
      console.error('Nepodařilo se načíst statistiky:', err);
    }
  };

  useEffect(() => { if (isAdmin) fetchAppStats(); }, [isAdmin]);

  // Uložené dokumenty (PDF) všech uživatelů — na výslovnou žádost administrátorky,
  // aby mohla dohledat a stáhnout stejná PDF, která si uživatelé uložili ve
  // vlastních účtech. Firestore pravidla to adminovi povolují (firestore.rules,
  // users/{uid}/documents). Nečteme přes collectionGroup napříč všemi uživateli —
  // Firestore takový plošný dotaz adminovi odmítl (Missing or insufficient
  // permissions), i když by podle pravidel měl projít — místo toho appka projde
  // jednotlivě uid uživatelů, které už eviduje v config/stats (visitedUserIds ∪
  // generatedUserIds), a pro každé udělá běžný (ne collection-group) dotaz na
  // konkrétní, známou cestu users/{uid}/documents, což appka pravidlo umožňuje bez potíží.
  const [allDocuments, setAllDocuments] = useState<DocumentRecord[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [docsSearchQuery, setDocsSearchQuery] = useState('');

  const fetchAllDocuments = async () => {
    setIsDocsLoading(true);
    try {
      const statsSnap = await getDoc(doc(db, 'config', 'stats'));
      const statsData = statsSnap.exists() ? statsSnap.data() : {};
      const userIds = Array.from(
        new Set([
          ...((statsData.visitedUserIds as string[]) ?? []),
          ...((statsData.generatedUserIds as string[]) ?? []),
        ])
      );

      const docs: DocumentRecord[] = [];
      for (const uid of userIds) {
        const snap = await getDocs(collection(db, 'users', uid, 'documents'));
        snap.docs.forEach((d) => {
          const data = d.data();
          docs.push({
            id: d.id,
            title: (data.title as string) ?? 'Bez názvu',
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : null,
            folderId: null,
            pdfBase64: data.pdfBase64,
            pdfChunkCount: data.pdfChunkCount,
            ownerEmail: data.ownerEmail,
            ownerUid: uid,
            childNumber: data.childNumber,
            childAge: data.childAge,
            childAgeYears: data.childAgeYears,
            childAgeMonths: data.childAgeMonths,
            childGender: data.childGender,
            childGrade: data.childGrade,
            childNeeds: data.childNeeds,
            role: data.role,
            schoolType: data.schoolType,
            studentCount: data.studentCount,
            purpose: data.purpose,
            pouzijuCount: (data.pouzijuCount as number) ?? 0,
            spzCount: (data.spzCount as number) ?? 0,
            choices: data.choices,
            notes: data.notes,
            searchText: data.searchText,
          } as DocumentRecord);
        });
      }
      docs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setAllDocuments(docs);
    } catch (err) {
      console.error('Nepodařilo se načíst uložené dokumenty:', err);
    } finally {
      setIsDocsLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchAllDocuments(); }, [isAdmin]);

  const filteredAllDocuments = useMemo(() => {
    const q = docsSearchQuery.trim().toLowerCase();
    if (!q) return allDocuments;
    return allDocuments.filter(
      (d) =>
        (d.searchText || '').toLowerCase().includes(q) ||
        (d.ownerEmail || '').toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q)
    );
  }, [allDocuments, docsSearchQuery]);

  const handleDownloadDocument = async (docItem: DocumentRecord) => {
    if (!docItem.ownerUid) return;
    const base64 = await loadDocumentPdfBase64(docItem.ownerUid, docItem.id, docItem);
    if (!base64) return;
    const safeName = docItem.title.replace(/[^\p{L}\p{N}._-]+/gu, '_');
    downloadBase64Pdf(base64, `${safeName}.pdf`);
  };

  // Export všech uložených dokumentů (dotazník + zvolená opatření) do jednoho
  // Excelu se dvěma přehlednými listy: souhrn po dokumentech a detailní rozpad
  // po jednotlivých vybraných opatřeních.
  const [exportDocsSuccess, setExportDocsSuccess] = useState(false);

  const handleExportDocumentsExcel = () => {
    setExportDocsSuccess(true);
    try {
      const measureMap: Record<string, any> = {};
      (measuresData as any[]).forEach((m) => { measureMap[m.id] = m; });

      const overviewRows = allDocuments.map((d) => ({
        'Dokument': d.title,
        'Vlastník (e-mail)': d.ownerEmail || '',
        'Vytvořeno': d.createdAt ? new Date(d.createdAt).toLocaleString('cs-CZ') : '',
        'Číslo dítěte': d.childNumber || '',
        'Věk dítěte': d.childAge || '',
        'Pohlaví': d.childGender || '',
        'Ročník': d.childGrade || '',
        'Projevy a potřeby dítěte': d.childNeeds || '',
        'Role': d.role || '',
        'Typ školy': d.schoolType || '',
        'Počet žáků ve škole': d.studentCount || '',
        'Účel práce': d.purpose || '',
        'Použiju v PO1 (počet)': d.pouzijuCount,
        'Předat ŠPZ (počet)': d.spzCount,
      }));

      const detailRows: any[] = [];
      allDocuments.forEach((d) => {
        if (!d.choices) return;
        Object.entries(d.choices).forEach(([measureId, choice]) => {
          const m = measureMap[measureId];
          if (!m) return;
          detailRows.push({
            'Dokument': d.title,
            'Vlastník (e-mail)': d.ownerEmail || '',
            'List': m.sheetName,
            'Oblast': m.oblast,
            'Krok': m.krok,
            'Volba': choice === 'POUZIJU' ? 'Použiju v PO1' : 'Předat ŠPZ',
            'Poznámka': (d.notes && (d.notes as Record<string, string>)[measureId]) || '',
          });
        });
      });

      const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
      overviewSheet['!cols'] = [
        { wch: 28 }, { wch: 26 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 24 },
        { wch: 12 }, { wch: 12 },
      ];

      const detailSheet = XLSX.utils.json_to_sheet(detailRows);
      detailSheet['!cols'] = [{ wch: 28 }, { wch: 26 }, { wch: 16 }, { wch: 22 }, { wch: 60 }, { wch: 16 }, { wch: 30 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Dokumenty');
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Opatření');
      XLSX.writeFile(workbook, 'katalog_ulozene_dokumenty.xlsx');
    } catch (err) {
      console.error('Export uložených dokumentů do Excelu selhal:', err);
    } finally {
      setTimeout(() => setExportDocsSuccess(false), 1500);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Opravdu chcete tento záznam smazat?')) return;

    try {
      await deleteDoc(doc(db, 'pdf_logs', docId));
      setLogs(prev => prev.filter(log => log.id !== docId));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Chyba při mazání záznamu z databáze.');
    }
  };

  return (
    <AuthGate requireAdmin>
      {/* Pevná horní lišta s logem — stejný vzor jako na hlavní stránce katalogu */}
      <Header context="admin" />

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-24">
      <div className="mb-12">
        <SectionEyebrow>Admin</SectionEyebrow>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-brand-navy mb-4">
          Administrace
        </h1>
        <p className="font-body text-lg text-brand-navy/70 max-w-2xl leading-relaxed">
          Přehled všech uživatelů, kteří si vygenerovali PDF souhrn ze svého hodnocení.
        </p>
      </div>

      {/* Rychlá navigace mezi sekcemi — ať se po stránce nemusí jezdit celá,
          drží se při scrollování pod pevnou horní lištou. */}
      <nav className="sticky top-16 z-20 -mx-4 px-4 py-3 mb-10 bg-brand-bg/90 backdrop-blur border-b border-brand-surface/30">
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <a href="#sekce-dokumenty" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Uložené dokumenty</a>
          <a href="#sekce-zpetna-vazba" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Zpětná vazba</a>
          <a href="#sekce-zadosti" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Žádosti o schválení</a>
          <a href="#sekce-administratori" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Administrátoři</a>
          <a href="#sekce-top-opatreni" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Top opatření</a>
          <a href="#sekce-uzivatele-pristupy" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Uživatelé a přístupy</a>
          <a href="#sekce-prehled-pdf" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Přehled generovaných PDF</a>
        </div>
      </nav>

      {/* Statistiky — postavené na config/stats (souhrnná, anonymní čísla).
          Podrobnější (ale méně anonymní) přehled je v sekcích níž. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <div className="bg-brand-navy/5 p-6 rounded-3xl border border-brand-surface/30 text-center">
          <p className="text-4xl font-extrabold text-brand-navy">
            {appStats ? appStats.visitedUserIds.length : '–'}
          </p>
          <p className="text-sm font-medium text-brand-navy/50 mt-1">Unikátních uživatelů</p>
        </div>
        <div className="bg-brand-green/5 p-6 rounded-3xl border border-brand-surface/30 text-center">
          <p className="text-4xl font-extrabold text-brand-green">
            {appStats ? appStats.generatedUserIds.length : '–'}
          </p>
          <p className="text-sm font-medium text-brand-navy/50 mt-1">Vygenerovalo PDF</p>
        </div>
        <div className="bg-brand-orange/5 p-6 rounded-3xl border border-brand-surface/30 text-center">
          <p className="text-4xl font-extrabold text-brand-orange">
            {appStats && appStats.totalDocumentsGenerated > 0
              ? (appStats.totalPouzijuChoicesSum / appStats.totalDocumentsGenerated).toFixed(1)
              : '–'}
          </p>
          <p className="text-sm font-medium text-brand-navy/50 mt-1">Průměr opatření do PO1 / dítě</p>
        </div>
        <div className="bg-brand-navy/5 p-6 rounded-3xl border border-brand-surface/30 text-center">
          <p className="text-2xl font-extrabold text-brand-navy">
            {appStats?.lastGeneratedAt
              ? `${new Date(appStats.lastGeneratedAt).toLocaleDateString('cs-CZ')} ${new Date(appStats.lastGeneratedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`
              : '–'}
          </p>
          <p className="text-sm font-medium text-brand-navy/50 mt-1">Naposledy vygenerováno</p>
        </div>
      </div>

      {/* Uložené dokumenty (PDF) všech uživatelů — administrátorka je smí dohledat
          a stáhnout stejně, jako je vidí uživatel ve vlastním účtě. */}
      <div id="sekce-dokumenty" className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden mb-12 scroll-mt-20">
        <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
          <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
            <FileText className="w-5 h-5 text-brand-navy" />
            Uložené dokumenty
            <span className="bg-brand-bg text-brand-navy/60 text-xs font-bold px-2 py-0.5 rounded-full">{allDocuments.length}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportDocumentsExcel}
              disabled={allDocuments.length === 0}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all border disabled:opacity-40 ${
                exportDocsSuccess
                  ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                  : 'bg-white hover:bg-brand-bg border-brand-surface/40 text-brand-navy/60 hover:text-brand-navy shadow-sm'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {exportDocsSuccess ? 'Ukládám...' : 'Exportovat do Excelu'}
            </button>
            <button
              onClick={fetchAllDocuments}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Obnovit
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-brand-surface/20">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/30" />
            <input
              value={docsSearchQuery}
              onChange={(e) => setDocsSearchQuery(e.target.value)}
              placeholder="Hledat podle e-mailu, role, školy, účelu…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium text-sm"
            />
          </div>
        </div>

        {isDocsLoading ? (
          <div className="p-12 text-center text-brand-navy/50 animate-pulse">Načítám data...</div>
        ) : filteredAllDocuments.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-brand-navy/40 font-medium">
              {docsSearchQuery ? 'Žádný dokument neodpovídá hledání.' : 'Zatím zde nejsou žádné uložené dokumenty.'}
            </p>
          </div>
        ) : (
          <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[500px] overflow-y-auto pr-2">
            {filteredAllDocuments.map((docItem) => (
              <div key={docItem.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 hover:bg-brand-bg/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1">
                    <span className="font-bold text-brand-navy truncate">{docItem.title}</span>
                    {docItem.ownerEmail && (
                      <span className="flex items-center gap-1.5 text-brand-navy/60 text-sm bg-brand-surface/20 px-2 py-0.5 rounded-md">
                        <Mail className="w-3.5 h-3.5" />
                        {docItem.ownerEmail}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-navy/40">
                    {docItem.createdAt && <span>{new Date(docItem.createdAt).toLocaleString('cs-CZ')}</span>}
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/detail?id=${docItem.id}&uid=${docItem.ownerUid ?? ''}`}
                    className="px-4 py-2 text-sm font-bold text-brand-green hover:bg-brand-green/10 rounded-lg border border-transparent hover:border-brand-green/20 transition-all whitespace-nowrap"
                  >
                    Detail →
                  </Link>
                  <button
                    onClick={() => handleDownloadDocument(docItem)}
                    disabled={!docItem.pdfBase64 && !docItem.pdfChunkCount}
                    title="Stáhnout PDF"
                    className="p-2.5 text-brand-navy/50 hover:text-brand-navy hover:bg-brand-bg rounded-xl transition-colors disabled:opacity-30"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {allDocuments.some((d) => !d.ownerEmail) && (
          <p className="text-xs text-brand-navy/40 px-6 py-4 border-t border-brand-surface/20">
            U dokumentů uložených před zavedením téhle funkce appka e-mail vlastníka nezná — u nich se zobrazí jen ostatní údaje.
          </p>
        )}
      </div>

      {/* Zpětná vazba od uživatelů aplikace (widget vpravo dole) */}
      <div id="sekce-zpetna-vazba" className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden mb-12 scroll-mt-20">
        <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
          <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-brand-navy" />
            Zpětná vazba od uživatelů
            {feedbackItems.filter((f) => !f.resolved).length > 0 && (
              <span className="text-xs font-bold text-white bg-brand-orange px-2 py-0.5 rounded-full">
                {feedbackItems.filter((f) => !f.resolved).length} nevyřešeno
              </span>
            )}
          </h2>
          <button
            onClick={fetchFeedback}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Obnovit
          </button>
        </div>

        {isFeedbackLoading ? (
          <div className="p-12 text-center text-brand-navy/50 animate-pulse">Načítám data...</div>
        ) : feedbackItems.length === 0 ? (
          <div className="p-12 text-center">
            <MessageCircle className="w-10 h-10 text-brand-surface mx-auto mb-3" />
            <p className="text-brand-navy/40 font-medium">Zatím žádná zpětná vazba.</p>
          </div>
        ) : (
          <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[500px] overflow-y-auto pr-2">
            {feedbackItems.map((item) => (
              <div key={item.id} className={`p-5 flex flex-col sm:flex-row sm:items-start gap-4 transition-colors ${item.resolved ? 'opacity-50' : 'hover:bg-brand-bg/60'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-brand-navy font-medium leading-relaxed whitespace-pre-wrap mb-2">{item.message}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-navy/40">
                    {item.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        {item.email}
                      </span>
                    )}
                    {item.page && (
                      <span className="bg-brand-surface/20 px-2 py-0.5 rounded-md">{item.page}</span>
                    )}
                    {item.createdAt && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(item.createdAt).toLocaleString('cs-CZ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggleResolved(item.id, item.resolved)}
                    className={`px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                      item.resolved
                        ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                        : 'bg-white border-brand-surface/40 text-brand-navy/50 hover:text-brand-navy'
                    }`}
                  >
                    {item.resolved ? 'Vyřešeno' : 'Označit jako vyřešené'}
                  </button>
                  <button
                    onClick={() => handleDeleteFeedback(item.id)}
                    className="p-2 text-brand-navy/20 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                    title="Smazat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Žádosti o schválení přístupu — appka pracuje s daty o dětech, takže nový
          uživatel appku neuvidí, dokud ho ručně neschválíte (nahrazuje dřív
          zvažovaný sdílený přístupový kód). */}
      <div id="sekce-zadosti" className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden mb-12 scroll-mt-20">
        <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
          <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
            <Hourglass className="w-5 h-5 text-brand-navy" />
            Žádosti o schválení přístupu
            {pendingUsers.length > 0 && (
              <span className="bg-brand-orange text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingUsers.length}</span>
            )}
          </h2>
        </div>
        {pendingUsers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-brand-navy/40 font-medium">Žádné čekající žádosti.</p>
          </div>
        ) : (
          <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[420px] overflow-y-auto pr-2">
            {pendingUsers.map((pu) => (
              <div key={pu.email} className="p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy truncate">{pu.name || '(bez jména)'}</p>
                  <p className="text-sm text-brand-navy/50 truncate">{pu.email}</p>
                  {pu.requestedAt && (
                    <p className="text-xs text-brand-navy/30 mt-0.5">
                      Požádal/a {new Date(pu.requestedAt).toLocaleString('cs-CZ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApproveUser(pu)}
                    disabled={isApprovalActionLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-xl font-semibold text-sm transition-all hover:bg-brand-green/90 disabled:opacity-40"
                  >
                    <Check className="w-4 h-4" />
                    Schválit
                  </button>
                  <button
                    onClick={() => handleRejectUser(pu.email)}
                    disabled={isApprovalActionLoading}
                    className="px-4 py-2 text-brand-navy/40 hover:text-rose-500 font-semibold text-sm transition-colors disabled:opacity-40"
                  >
                    Zamítnout
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {approvedUsers.length > 0 && (
          <div className="p-6 border-t border-brand-surface/30">
            <h3 className="text-xs font-bold text-brand-navy/40 uppercase tracking-wide mb-3">
              Schválení uživatelé ({approvedUsers.length})
            </h3>
            <div className="custom-scrollbar flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2">
              {approvedUsers.map((au) => (
                <span
                  key={au.email}
                  className="inline-flex items-center gap-2 bg-brand-bg text-brand-navy text-sm font-semibold px-3 py-1.5 rounded-lg border border-brand-surface/30"
                  title={au.name || au.email}
                >
                  {au.name || au.email}
                  <button
                    onClick={() => handleRevokeAccess(au.email)}
                    disabled={isApprovalActionLoading}
                    title="Odebrat přístup"
                    className="text-brand-navy/30 hover:text-rose-500 transition-colors disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        {approvalActionError && (
          <p className="text-brand-orange font-semibold text-sm px-6 pb-4">{approvalActionError}</p>
        )}
      </div>

      {/* Správa administrátorů */}
      <div id="sekce-administratori" className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden mb-12 scroll-mt-20">
        <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
          <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-navy" />
            Administrátoři
          </h2>
        </div>
        <div className="p-6">
          <div className="custom-scrollbar flex flex-wrap gap-2 mb-5 max-h-40 overflow-y-auto pr-2">
            {adminEmails.length === 0 ? (
              <p className="text-brand-navy/40 text-sm italic">Načítám...</p>
            ) : (
              adminEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-2 bg-brand-bg text-brand-navy text-sm font-semibold px-3 py-1.5 rounded-lg border border-brand-surface/30"
                >
                  {email}
                  <button
                    onClick={() => handleRemoveAdmin(email)}
                    disabled={isAdminActionLoading}
                    title="Odebrat administrátorský přístup"
                    className="text-brand-navy/30 hover:text-rose-500 transition-colors disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAdmin(); }}
              placeholder="e-mail nového administrátora"
              className="flex-1 px-4 py-2.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium text-sm"
            />
            <button
              onClick={handleAddAdmin}
              disabled={isAdminActionLoading || !newAdminEmail.trim()}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-green text-white rounded-xl font-semibold text-sm transition-all hover:bg-brand-green/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" />
              Přidat
            </button>
          </div>
          {adminActionError && (
            <p className="text-brand-orange font-semibold text-sm mt-3">{adminActionError}</p>
          )}
          <p className="text-xs text-brand-navy/40 mt-4">
            Nově přidaný administrátor musí mít v katalogu založený účet a po přidání se odhlásit a znovu přihlásit.
          </p>
        </div>
      </div>

      {/* Top Opatření (Statistiky) */}
      {measureStats.length > 0 && (
        <div id="sekce-top-opatreni" className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden mb-12 scroll-mt-20">
          <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
            <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-brand-navy" />
              Nejčastěji vybíraná opatření
            </h2>
          </div>
          <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[400px] overflow-y-auto pr-2">
            {measureStats.map((stat: any, idx: number) => (
              <div key={stat.id} className="p-4 hover:bg-brand-bg/60 transition-colors flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-brand-bg text-brand-navy/60 font-bold flex items-center justify-center flex-shrink-0 mt-1 shadow-inner">
                  {idx + 1}.
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-brand-navy/40 uppercase tracking-widest mb-1">
                    {stat.sheetName} / {stat.oblast}
                  </div>
                  <div className="font-bold text-brand-navy leading-snug">{stat.krok}</div>
                </div>
                <div className="flex gap-4 flex-shrink-0 text-sm">
                  <div className="flex flex-col items-center bg-brand-green/10 px-3 py-1.5 rounded-lg border border-brand-green/20">
                    <span className="text-brand-green font-black text-lg">{stat.pouziju}</span>
                    <span className="text-brand-green/80 text-[10px] font-bold uppercase tracking-wider">Použiju</span>
                  </div>
                  <div className="flex flex-col items-center bg-brand-orange/10 px-3 py-1.5 rounded-lg border border-brand-orange/20">
                    <span className="text-brand-orange font-black text-lg">{stat.spz}</span>
                    <span className="text-brand-orange/80 text-[10px] font-bold uppercase tracking-wider">ŠPZ</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uživatelé a přístupy — přesunuto nahoru, appka to používá jako hlavní přehled */}
      <div id="sekce-uzivatele-pristupy" className="mt-16 scroll-mt-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-brand-navy" />
            <h2 className="text-2xl font-bold text-brand-navy">
              Uživatelé a přístupy
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={uniqueUsers.length === 0}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all border ${
                exportSuccess
                  ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                  : 'bg-white hover:bg-brand-bg border-brand-surface/40 text-brand-navy/60 hover:text-brand-navy shadow-sm'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {exportSuccess ? 'Ukládám...' : 'Exportovat do Excelu'}
            </button>
            <div className="bg-brand-bg p-1 rounded-2xl flex gap-1 text-xs font-bold">
              <button
                onClick={() => setActiveAdminTab('users')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  activeAdminTab === 'users'
                    ? 'bg-white text-brand-navy shadow-sm'
                    : 'text-brand-navy/40 hover:text-brand-navy'
                }`}
              >
                Přehled uživatelů ({uniqueUsers.length})
              </button>
              <button
                onClick={() => setActiveAdminTab('history')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  activeAdminTab === 'history'
                    ? 'bg-white text-brand-navy shadow-sm'
                    : 'text-brand-navy/40 hover:text-brand-navy'
                }`}
              >
                Historie přihlášení ({loginLogs.length})
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden">
          {activeAdminTab === 'users' ? (
            uniqueUsers.length === 0 ? (
              <div className="p-8 text-center">
                <User className="w-10 h-10 text-brand-surface mx-auto mb-3" />
                <p className="text-brand-navy/40 font-medium">Žádní uživatelé k zobrazení.</p>
              </div>
            ) : (
              <div className="custom-scrollbar overflow-auto max-h-[450px] relative pr-2">
                <p className="sm:hidden text-xs font-semibold text-brand-navy/40 px-4 pt-3 pb-1">
                  ← Tabulka se na malé obrazovce posouvá vodorovně →
                </p>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-brand-surface/30 text-xs font-bold text-brand-navy/40 uppercase tracking-wider">
                      <th className="p-4 pl-6 bg-brand-bg sticky top-0 z-10">Uživatel (E-mail)</th>
                      <th className="p-4 bg-brand-bg sticky top-0 z-10">Aktivita</th>
                      <th className="p-4 text-center bg-brand-bg sticky top-0 z-10">Vygeneroval PDF</th>
                      <th className="p-4 bg-brand-bg sticky top-0 z-10">Účel práce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-surface/20 text-sm">
                    {uniqueUsers.map((u, idx) => (
                      <tr key={idx} className="hover:bg-brand-bg/60 transition-colors">
                        <td className="p-4 pl-6 font-bold text-brand-navy break-all max-w-[200px]">
                          {u.email}
                        </td>
                        <td className="p-4 text-brand-navy/70">
                          <span className="font-bold text-brand-navy">{u.loginCount}x</span> přihlášen
                          {u.lastLogin && (
                            <span className="block text-xs text-brand-navy/40 mt-0.5">
                              Naposledy: {new Date(u.lastLogin).toLocaleDateString('cs-CZ')}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {u.generatedPdf ? (
                            <div className="flex flex-col items-center gap-1.5 justify-center">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full border border-brand-green/20">
                                <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
                                Ano ({u.pdfLogs.length}x)
                              </span>
                              <div className="flex flex-wrap gap-1 justify-center mt-1">
                                {u.pdfLogs.map((pl, plIdx) => (
                                  <Link
                                    key={pl.id}
                                    href={`/admin/detail?id=${pl.id}`}
                                    className="text-[10px] font-bold text-brand-green hover:text-brand-green/70 bg-brand-green/10 hover:bg-brand-green/20 px-1.5 py-0.5 rounded transition-colors"
                                  >
                                    Detail {u.pdfLogs.length > 1 ? `#${u.pdfLogs.length - plIdx}` : ''}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-navy/40 bg-brand-bg px-2 py-0.5 rounded-full">
                              <HelpCircle className="w-3.5 h-3.5 text-brand-navy/40" />
                              Ne
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-brand-navy/70 max-w-[250px]">
                          {u.purposes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.purposes.map((p, pIdx) => (
                                <span key={pIdx} className="inline-block bg-brand-surface/20 text-brand-navy text-xs px-2 py-0.5 rounded-md max-w-full truncate" title={p}>
                                  {p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-brand-navy/40 text-xs italic">nevyplněno</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            loginLogs.length === 0 ? (
              <div className="p-8 text-center">
                <User className="w-10 h-10 text-brand-surface mx-auto mb-3" />
                <p className="text-brand-navy/40 font-medium">Žádné záznamy o přihlášení.</p>
                <p className="text-brand-navy/40 text-sm mt-1">Jakmile se někdo přihlásí, zobrazí se zde.</p>
              </div>
            ) : (
              <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[400px] overflow-y-auto pr-2">
                {loginLogs.map((ll, idx) => (
                  <div key={idx} className="px-5 py-4 flex items-center justify-between hover:bg-brand-bg/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-navy/5 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-brand-navy/40" />
                      </div>
                      <div>
                        <p className="font-bold text-brand-navy">{ll.email}</p>
                        <p className="text-xs text-brand-navy/40 mt-0.5">přihlášení do katalogu</p>
                      </div>
                    </div>
                    <div className="text-sm text-brand-navy/40 text-right flex-shrink-0">
                      <p className="font-medium">{new Date(ll.timestamp).toLocaleDateString('cs-CZ')}</p>
                      <p className="text-xs">{new Date(ll.timestamp).toLocaleTimeString('cs-CZ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Tabulka logů — starší přehled jednotlivých generování PDF (nahrazen výše
          sekcí Uložené dokumenty a Uživatelé a přístupy), proto níž a méně nápadně. */}
      <div id="sekce-prehled-pdf" className="mt-16 bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden scroll-mt-20">
        <div className="flex items-center justify-between p-6 border-b border-brand-surface/30">
          <h2 className="text-xl font-bold text-brand-navy">Přehled generovaných PDF</h2>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Obnovit
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-brand-navy/50 animate-pulse">Načítám data...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-brand-navy/40 text-lg font-medium">Zatím zde nejsou žádné záznamy.</p>
            <p className="text-brand-navy/40 text-sm mt-2">Jakmile si někdo vygeneruje PDF, zobrazí se zde.</p>
          </div>
        ) : (
          <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[400px] overflow-y-auto pr-2">
            {logs.map((log, i) => (
              <div key={i} className="p-5 hover:bg-brand-bg/60 transition-colors flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                    <div className="flex items-center gap-2 text-brand-navy font-bold">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{log.email}</span>
                    </div>
                    {log.role && (
                      <div className="flex items-center gap-1.5 text-brand-navy/60 text-sm bg-brand-surface/20 px-2 py-0.5 rounded-md">
                        <User className="w-3.5 h-3.5" />
                        {log.role}
                      </div>
                    )}
                    {log.schoolType && (
                      <div className="flex items-center gap-1.5 text-brand-navy/60 text-sm bg-brand-surface/20 px-2 py-0.5 rounded-md">
                        <School className="w-3.5 h-3.5" />
                        {log.schoolType}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-brand-navy/40">
                    <div className="flex items-center gap-1.5 ">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(log.timestamp).toLocaleString('cs-CZ')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
                      <span className="text-brand-green font-bold">{log.pouzijuCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-brand-orange" />
                      <span className="text-brand-orange font-bold">{log.spzCount}</span>
                    </div>
                  </div>
                </div>

                <Link
                  href={`/admin/detail?id=${log.id}`}
                  className="px-4 py-2 text-sm font-bold text-brand-green hover:bg-brand-green/10 rounded-lg border border-transparent hover:border-brand-green/20 transition-all"
                >
                  Detail →
                </Link>

                <button
                  onClick={() => handleDelete(log.id)}
                  className="p-3 text-brand-navy/20 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  title="Smazat záznam"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </main>
    </AuthGate>
  );
}
