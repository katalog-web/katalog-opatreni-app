'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Mail, Clock, CheckCircle2, HelpCircle, RefreshCw, Trash2, User, School, Users, BarChart3, TrendingUp, Download, ShieldCheck, UserPlus, X, MessageCircle, Hourglass, Check, Search, FileText, Lock, ChevronRight } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Header } from '@/components/Header';
import { SectionEyebrow } from '@/components/SectionEyebrow';
import { useAuth } from '@/lib/auth-context';
import { db, auth, googleProvider } from '@/lib/firebase';
import { collection, getDocs, getDoc, query, orderBy, deleteDoc, doc, setDoc, updateDoc, where, limit } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth';
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
  firstLoginAt: string | null;
  lastLoginAt: string | null;
}

interface AdminMember {
  email: string; // Firestore document ID
  name: string | null;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  addedAt: string | null;
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  // "Aktuální" = vše živé, se čím se dnes pracuje. "Archiv" = starší data
  // (login_logs/pdf_logs), nic se nemaže, jen to nepřekáží nahoře.
  const [dashboardView, setDashboardView] = useState<'aktualni' | 'archiv'>('aktualni');
  const [logs, setLogs] = useState<PdfLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'history'>('users');
  const [exportSuccess, setExportSuccess] = useState(false);

  // Správa administrátorů — jeden dokument na e-mail v config/admins/members/{email}
  // (ne jedno pole se všemi e-maily), aby běžný uživatel neviděl kompletní seznam.
  const [adminMembers, setAdminMembers] = useState<AdminMember[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [isAdminActionLoading, setIsAdminActionLoading] = useState(false);

  const fetchAdmins = async () => {
    try {
      const snap = await getDocs(collection(db, 'config', 'admins', 'members'));
      setAdminMembers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            email: d.id,
            name: data.name ?? null,
            firstLoginAt: data.firstLoginAt ?? null,
            lastLoginAt: data.lastLoginAt ?? null,
            addedAt: data.addedAt ?? null,
          };
        })
      );
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

  // Skutečné odebrání administrátora (po potvrzení v reautentizační modálce níž).
  const handleRemoveAdmin = async (email: string) => {
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

  // Kliknutí na "Odebrat" u administrátora — u odebrání sebe sama ještě zvlášť
  // upozorní (přijde tak o možnost sem znovu vstoupit), pak vždy pokračuje přes
  // stejnou reautentizační modálku jako odebrání přístupu schválenému uživateli.
  const requestRemoveAdmin = (admin: AdminMember) => {
    if (admin.email === user?.email?.toLowerCase()) {
      if (!confirm('Opravdu si chcete odebrat vlastní administrátorský přístup? Přijdete tak o možnost sem znovu vstoupit (dokud vás nepřidá jiný administrátor).')) return;
    }
    setConfirmTarget({ kind: 'admin', email: admin.email, displayName: admin.name || admin.email });
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
  // Rozbalení jednotlivých uživatelů v sekci "Uživatelé aplikace" — ať se jejich
  // uložené dokumenty zobrazí vnořené (a ne jako samostatná sekce), ale jen na vyžádání.
  const [expandedUserEmails, setExpandedUserEmails] = useState<Set<string>>(new Set());
  const toggleUserExpanded = (email: string) => {
    setExpandedUserEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };
  const [usersSearchQuery, setUsersSearchQuery] = useState('');

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
            firstLoginAt: data.firstLoginAt ?? null,
            lastLoginAt: data.lastLoginAt ?? null,
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

  // Předem schválit e-maily (např. účastníky připravované akce), ať appku po
  // registraci nemusí čekat na ruční schválení — funguje, protože appka pozná
  // "je schválený?" jen podle toho, že existuje dokument v approved_users s jejich
  // e-mailem, což jde založit i dřív, než se dotyčný poprvé přihlásí.
  const [preApproveEmails, setPreApproveEmails] = useState('');
  const [isPreApproving, setIsPreApproving] = useState(false);
  const [preApproveResult, setPreApproveResult] = useState<string | null>(null);

  const handlePreApprove = async () => {
    const emails = Array.from(
      new Set(
        preApproveEmails
          .split(/[\n,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (emails.length === 0) return;
    setIsPreApproving(true);
    setPreApproveResult(null);
    try {
      await Promise.all(
        emails.map((email) =>
          setDoc(
            doc(db, 'config', 'approved_users', 'members', email),
            {
              name: null,
              approvedAt: new Date().toISOString(),
              approvedBy: user?.email || null,
              firstLoginAt: null,
            },
            { merge: true }
          )
        )
      );
      setPreApproveEmails('');
      setPreApproveResult(`Předschváleno: ${emails.length}.`);
      await fetchApprovedUsers();
    } catch (err) {
      console.error('Předschválení selhalo:', err);
      setPreApproveResult('Nepodařilo se předschválit.');
    } finally {
      setIsPreApproving(false);
    }
  };

  const handleRevokeAccess = async (email: string) => {
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

  // Odebrání přístupu (uživateli i administrátorovi) je nevratná akce, proto ji
  // navíc chráníme opětovným ověřením vlastní administrátorky (heslem, nebo přes
  // Google, podle toho, jak se sama přihlašuje) — stejný princip jako "potvrďte
  // heslo" u citlivých akcí ve velkých appkách. Jedna modálka pro oba případy.
  interface ConfirmTarget {
    kind: 'user' | 'admin';
    email: string;
    displayName: string;
  }
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [revokePassword, setRevokePassword] = useState('');
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [isReauthLoading, setIsReauthLoading] = useState(false);

  const usesPasswordAuth = user?.providerData?.some((p) => p.providerId === 'password') ?? false;

  const closeRevokeModal = () => {
    setConfirmTarget(null);
    setRevokePassword('');
    setRevokeError(null);
  };

  const handleConfirmRevoke = async () => {
    if (!confirmTarget || !auth.currentUser) return;
    setRevokeError(null);
    setIsReauthLoading(true);
    try {
      if (usesPasswordAuth) {
        if (!revokePassword) {
          setRevokeError('Zadejte prosím své heslo.');
          setIsReauthLoading(false);
          return;
        }
        const credential = EmailAuthProvider.credential(auth.currentUser.email || '', revokePassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      } else {
        await reauthenticateWithPopup(auth.currentUser, googleProvider);
      }
      if (confirmTarget.kind === 'user') {
        await handleRevokeAccess(confirmTarget.email);
      } else {
        await handleRemoveAdmin(confirmTarget.email);
      }
      closeRevokeModal();
    } catch (err: any) {
      console.error('Ověření administrátorky selhalo:', err);
      setRevokeError(
        err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
          ? 'Nesprávné heslo.'
          : 'Ověření se nezdařilo. Zkuste to prosím znovu.'
      );
    } finally {
      setIsReauthLoading(false);
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

  // Nový přehled Top opatření — dva žebříčky vedle sebe (Použiju v PO1 / Předat
  // ŠPZ), každý seřazený podle vlastního počtu, s vodorovným pruhem podle podílu
  // na nejvyšší hodnotě v žebříčku. Starý souhrnný seznam (řazený jen podle
  // "Použiju") zůstává beze změny v Archivu.
  const TOP_MEASURES_LIMIT = 8;
  const topByPouziju = useMemo(
    () => [...measureStats].filter((m) => m.pouziju > 0).sort((a, b) => b.pouziju - a.pouziju).slice(0, TOP_MEASURES_LIMIT),
    [measureStats]
  );
  const topBySpz = useMemo(
    () => [...measureStats].filter((m) => m.spz > 0).sort((a, b) => b.spz - a.spz).slice(0, TOP_MEASURES_LIMIT),
    [measureStats]
  );
  const maxPouziju = topByPouziju[0]?.pouziju || 1;
  const maxSpz = topBySpz[0]?.spz || 1;

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
          if (data.hiddenFromAdmin) return; // skryté administrátorkou (testovací pokus)
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

  // "Smazání" v administraci dokument jen schová z tohohle přehledu (hiddenFromAdmin)
  // — nikdy nemaže skutečný dokument uživatele, ten mu v Moje dokumenty zůstává beze
  // změny. Bezpečné i pro čištění vlastních testovacích pokusů bez rizika, že se
  // omylem smaže něčí reálný uložený dokument.
  const handleHideDocumentInAdmin = async (docItem: DocumentRecord) => {
    if (!docItem.ownerUid) return;
    if (!confirm(`Schovat dokument „${docItem.title}" z tohoto přehledu?\n\nVlastníkovi zůstane beze změny v jeho Moje dokumenty — jen se přestane zobrazovat tady v administraci.`)) return;
    try {
      await updateDoc(doc(db, 'users', docItem.ownerUid, 'documents', docItem.id), { hiddenFromAdmin: true });
      setAllDocuments((prev) => prev.filter((d) => d.id !== docItem.id));
    } catch (err) {
      console.error('Schování dokumentu selhalo:', err);
      alert('Nepodařilo se dokument schovat z přehledu.');
    }
  };

  // Uložené dokumenty seskupené podle vlastníka (e-mailu) — na výslovnou žádost
  // administrátorky se dokumenty v dashboardu nezobrazují jako samostatná sekce,
  // ale vnořené pod každým uživatelem v sekci "Uživatelé aplikace" níž.
  const documentsByEmail = useMemo(() => {
    const map: Record<string, DocumentRecord[]> = {};
    allDocuments.forEach((d) => {
      const email = (d.ownerEmail || '').toLowerCase();
      if (!email) return;
      if (!map[email]) map[email] = [];
      map[email].push(d);
    });
    return map;
  }, [allDocuments]);

  // Sekce "Uživatelé aplikace" sjednocuje schválené uživatele i administrátory —
  // administrátor appku taky používá a generuje si PDF, takže by jinak jeho vlastní
  // dokumenty skončily nenajitelné v "Ostatní dokumenty" jen proto, že je vedený
  // v jiné kolekci (config/admins misto config/approved_users). Kdo je v obou
  // kolekcích zároveň (výjimečné, ale možné), se sloučí do jednoho řádku.
  interface CombinedUser {
    email: string;
    name: string | null;
    firstLoginAt: string | null;
    lastLoginAt: string | null;
    isAdmin: boolean;
    isApprovedUser: boolean; // má vlastní dokument v config/approved_users (tj. dá se mu tady odebrat přístup)
  }
  const combinedUsers = useMemo(() => {
    const map: Record<string, CombinedUser> = {};
    approvedUsers.forEach((au) => {
      map[au.email.toLowerCase()] = {
        email: au.email,
        name: au.name,
        firstLoginAt: au.firstLoginAt,
        lastLoginAt: au.lastLoginAt,
        isAdmin: false,
        isApprovedUser: true,
      };
    });
    adminMembers.forEach((am) => {
      const key = am.email.toLowerCase();
      const existing = map[key];
      if (existing) {
        existing.isAdmin = true;
        if (!existing.name && am.name) existing.name = am.name;
        if (!existing.firstLoginAt && am.firstLoginAt) existing.firstLoginAt = am.firstLoginAt;
        if (!existing.lastLoginAt && am.lastLoginAt) existing.lastLoginAt = am.lastLoginAt;
      } else {
        map[key] = {
          email: am.email,
          name: am.name,
          firstLoginAt: am.firstLoginAt,
          lastLoginAt: am.lastLoginAt,
          isAdmin: true,
          isApprovedUser: false,
        };
      }
    });
    return Object.values(map).sort((a, b) => {
      const aTime = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
      const bTime = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [approvedUsers, adminMembers]);

  // Dokumenty, které se nepodařilo přiřadit k žádnému uživateli ani administrátorovi
  // (starší záznamy bez e-mailu vlastníka) — ať se neztratí, zobrazí se v samostatném
  // "Ostatní dokumenty" řádku na konci seznamu.
  const unassignedDocuments = useMemo(() => {
    const knownEmails = new Set(combinedUsers.map((u) => u.email.toLowerCase()));
    return allDocuments.filter((d) => {
      const email = (d.ownerEmail || '').toLowerCase();
      return !email || !knownEmails.has(email);
    });
  }, [allDocuments, combinedUsers]);

  const filteredApprovedUsers = useMemo(() => {
    const q = usersSearchQuery.trim().toLowerCase();
    if (!q) return combinedUsers;
    return combinedUsers.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)
    );
  }, [combinedUsers, usersSearchQuery]);

  const handleDownloadDocument = async (docItem: DocumentRecord) => {
    if (!docItem.ownerUid) return;
    const base64 = await loadDocumentPdfBase64(docItem.ownerUid, docItem.id, docItem);
    if (!base64) return;
    const safeName = docItem.title.replace(/[^\p{L}\p{N}._-]+/gu, '_');
    downloadBase64Pdf(base64, `${safeName}.pdf`);
  };

  // Jeden řádek dokumentu — použitý vnořený pod uživatelem v sekci "Uživatelé
  // aplikace" i v řádku "Ostatní dokumenty" (dřív samostatná sekce "Uložené dokumenty").
  const renderDocumentRow = (docItem: DocumentRecord) => (
    <div key={docItem.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 hover:bg-brand-bg/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1">
          <span className="font-bold text-brand-navy truncate">{docItem.title}</span>
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
        <button
          onClick={() => handleHideDocumentInAdmin(docItem)}
          title="Schovat z přehledu (nemaže uživateli jeho dokument)"
          className="p-2.5 text-brand-navy/30 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

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

      {/* Přepínač Aktuální/Archiv — ať nová (živá) data nezapadnou mezi starší
          kolekce (login_logs/pdf_logs), které appka jen kvůli kontinuitě nemaže. */}
      <div className="flex mb-8">
        <div className="inline-flex bg-brand-bg p-1 rounded-2xl gap-1 text-sm font-bold">
          <button
            onClick={() => setDashboardView('aktualni')}
            className={`px-4 py-2 rounded-xl transition-all ${
              dashboardView === 'aktualni' ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-navy/40 hover:text-brand-navy'
            }`}
          >
            Aktuální
          </button>
          <button
            onClick={() => setDashboardView('archiv')}
            className={`px-4 py-2 rounded-xl transition-all ${
              dashboardView === 'archiv' ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-navy/40 hover:text-brand-navy'
            }`}
          >
            Archiv / starší data
          </button>
        </div>
      </div>

      {dashboardView === 'aktualni' ? (
      <>
      {/* Rychlá navigace mezi sekcemi — ať se po stránce nemusí jezdit celá,
          drží se při scrollování pod pevnou horní lištou. */}
      <nav className="sticky top-16 z-20 -mx-4 px-4 py-3 mb-10 bg-brand-bg/90 backdrop-blur border-b border-brand-surface/30">
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <a href="#sekce-uzivatele" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Uživatelé aplikace</a>
          <a href="#sekce-zpetna-vazba" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Zpětná vazba</a>
          <a href="#sekce-zadosti" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Žádosti o schválení</a>
          <a href="#sekce-administratori" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Administrátoři</a>
          <a href="#sekce-top-opatreni" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Top opatření</a>
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
          <p className="text-sm font-medium text-brand-navy/50 mt-1">Uživatelů vygenerovalo PDF</p>
          {appStats && appStats.totalDocumentsGenerated > 0 && (
            <p className="text-xs font-medium text-brand-navy/30 mt-0.5">
              (celkem {appStats.totalDocumentsGenerated}× vygenerováno)
            </p>
          )}
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

      {/* Uživatelé aplikace — schválení uživatelé se základními statistikami
          (první/poslední vstup, počet vygenerovaných PDF) a jejich uložené
          dokumenty vnořené pod každým řádkem (na výslovnou žádost administrátorky
          nejsou "Uložené dokumenty" samostatná sekce). */}
      <div id="sekce-uzivatele" className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden mb-12 scroll-mt-20">
        <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
          <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
            <Users className="w-5 h-5 text-brand-navy" />
            Uživatelé aplikace
            <span className="bg-brand-bg text-brand-navy/60 text-xs font-bold px-2 py-0.5 rounded-full">{combinedUsers.length}</span>
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
              title="Exportovat všechny uložené dokumenty do Excelu"
            >
              <Download className="w-3.5 h-3.5" />
              {exportDocsSuccess ? 'Ukládám...' : 'Exportovat dokumenty'}
            </button>
            <button
              onClick={() => { fetchApprovedUsers(); fetchAllDocuments(); }}
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
              value={usersSearchQuery}
              onChange={(e) => setUsersSearchQuery(e.target.value)}
              placeholder="Hledat podle jména nebo e-mailu…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium text-sm"
            />
          </div>
        </div>

        {filteredApprovedUsers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-brand-navy/40 font-medium">
              {usersSearchQuery ? 'Žádný uživatel neodpovídá hledání.' : 'Zatím zde nejsou žádní schválení uživatelé.'}
            </p>
          </div>
        ) : (
          <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[600px] overflow-y-auto pr-2">
            {filteredApprovedUsers.map((au) => {
              const emailKey = au.email.toLowerCase();
              const userDocs = documentsByEmail[emailKey] || [];
              const isExpanded = expandedUserEmails.has(emailKey);
              return (
                <div key={au.email}>
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 hover:bg-brand-bg/60 transition-colors">
                    <button
                      onClick={() => userDocs.length > 0 && toggleUserExpanded(emailKey)}
                      disabled={userDocs.length === 0}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left disabled:cursor-default"
                    >
                      <ChevronRight className={`w-4 h-4 text-brand-navy/30 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''} ${userDocs.length === 0 ? 'opacity-0' : ''}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-brand-navy truncate">{au.name || '(bez jména)'}</p>
                          <span
                            className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                              au.isAdmin ? 'bg-brand-orange/10 text-brand-orange' : 'bg-brand-green/10 text-brand-green'
                            }`}
                          >
                            {au.isAdmin ? 'Admin' : 'Uživatel'}
                          </span>
                        </div>
                        <p className="text-sm text-brand-navy/50 truncate">{au.email}</p>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/40 flex-shrink-0">
                      <span className="bg-brand-surface/20 px-2 py-1 rounded-md">
                        První vstup: {au.firstLoginAt ? new Date(au.firstLoginAt).toLocaleDateString('cs-CZ') : '—'}
                      </span>
                      <span className="bg-brand-surface/20 px-2 py-1 rounded-md">
                        Poslední vstup: {au.lastLoginAt ? new Date(au.lastLoginAt).toLocaleDateString('cs-CZ') : '—'}
                      </span>
                      <span className="flex items-center gap-1 bg-brand-green/10 text-brand-green px-2 py-1 rounded-md font-bold">
                        <FileText className="w-3.5 h-3.5" /> {userDocs.length}× PDF
                      </span>
                    </div>
                    {au.isApprovedUser ? (
                      <button
                        onClick={() => setConfirmTarget({ kind: 'user', email: au.email, displayName: au.name || au.email })}
                        disabled={isApprovalActionLoading}
                        title="Odebrat přístup"
                        className="flex-shrink-0 p-2 text-brand-navy/30 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="flex-shrink-0 text-[11px] text-brand-navy/30 italic px-2" title="Odebrání administrátorského přístupu se řeší v sekci Administrátoři níže">
                        spravováno v „Administrátoři"
                      </span>
                    )}
                  </div>
                  {isExpanded && userDocs.length > 0 && (
                    <div className="bg-brand-bg/30 divide-y divide-brand-surface/20 pl-8 border-t border-brand-surface/20">
                      {userDocs.map((docItem) => renderDocumentRow(docItem))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unassignedDocuments.length > 0 && (
          <div className="border-t border-brand-surface/30">
            <button
              onClick={() => toggleUserExpanded('__unassigned__')}
              className="w-full p-5 flex items-center gap-3 text-left hover:bg-brand-bg/60 transition-colors"
            >
              <ChevronRight className={`w-4 h-4 text-brand-navy/30 flex-shrink-0 transition-transform ${expandedUserEmails.has('__unassigned__') ? 'rotate-90' : ''}`} />
              <span className="font-bold text-brand-navy/60">Ostatní dokumenty</span>
              <span className="bg-brand-surface/20 text-brand-navy/50 text-xs font-bold px-2 py-0.5 rounded-full">{unassignedDocuments.length}</span>
              <span className="text-xs text-brand-navy/30 ml-auto">bez přiřazení ke schválenému uživateli</span>
            </button>
            {expandedUserEmails.has('__unassigned__') && (
              <div className="bg-brand-bg/30 divide-y divide-brand-surface/20 pl-8 border-t border-brand-surface/20">
                {unassignedDocuments.map((docItem) => renderDocumentRow(docItem))}
              </div>
            )}
          </div>
        )}
        {approvalActionError && (
          <p className="text-brand-orange font-semibold text-sm px-6 py-4 border-t border-brand-surface/20">{approvalActionError}</p>
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

        {/* Předem schválit e-maily (např. účastníci připravované akce/školení) —
            appka pozná "je schválený?" jen podle toho, jestli existuje dokument
            s daným e-mailem v config/approved_users/members, takže ho jde založit
            i dřív, než se dotyčný poprvé přihlásí — přeskočí tak frontu žádostí. */}
        <div className="p-6 border-t border-brand-surface/30 bg-brand-bg/30">
          <h3 className="text-xs font-bold text-brand-navy/40 uppercase tracking-wide mb-1">
            Předem schválit e-maily
          </h3>
          <p className="text-xs text-brand-navy/40 mb-3">
            Hodí se, když víte předem o akci/školení — účastníci pak po registraci nečekají na schválení.
          </p>
          <textarea
            value={preApproveEmails}
            onChange={(e) => setPreApproveEmails(e.target.value)}
            placeholder={'jeden e-mail na řádek (nebo oddělené čárkou)\nnapr.novak@skola.cz\njana.svobodova@skola.cz'}
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium text-sm mb-3"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handlePreApprove}
              disabled={isPreApproving || !preApproveEmails.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-green text-white rounded-xl font-semibold text-sm transition-all hover:bg-brand-green/90 disabled:opacity-40"
            >
              <UserPlus className="w-4 h-4" />
              {isPreApproving ? 'Ukládám...' : 'Předschválit'}
            </button>
            {preApproveResult && <p className="text-sm font-semibold text-brand-navy/50">{preApproveResult}</p>}
          </div>
        </div>
        {approvalActionError && (
          <p className="text-brand-orange font-semibold text-sm px-6 py-4 border-t border-brand-surface/20">{approvalActionError}</p>
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
          <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-80 overflow-y-auto pr-2 mb-5">
            {adminMembers.length === 0 ? (
              <p className="text-brand-navy/40 text-sm italic">Načítám...</p>
            ) : (
              adminMembers.map((admin) => (
                <div key={admin.email} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-navy truncate">{admin.name || '(bez jména)'}</p>
                    <p className="text-sm text-brand-navy/50 truncate">{admin.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-brand-navy/40 flex-shrink-0">
                    <span className="bg-brand-surface/20 px-2 py-1 rounded-md">
                      První vstup: {admin.firstLoginAt ? new Date(admin.firstLoginAt).toLocaleDateString('cs-CZ') : '—'}
                    </span>
                    <span className="bg-brand-surface/20 px-2 py-1 rounded-md">
                      Poslední vstup: {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString('cs-CZ') : '—'}
                    </span>
                  </div>
                  <button
                    onClick={() => requestRemoveAdmin(admin)}
                    disabled={isAdminActionLoading}
                    title="Odebrat administrátorský přístup"
                    className="flex-shrink-0 p-2 text-brand-navy/30 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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

      {/* Top opatření — nový přehled: dva žebříčky vedle sebe (Použiju v PO1 /
          Předat ŠPZ), každý řazený podle vlastního počtu, s vodorovným pruhem podle
          podílu na nejvyšší hodnotě. Starý souhrnný seznam (řazený jen podle
          "Použiju") zůstává beze změny v Archivu, ať se nic neztratí. */}
      {measureStats.length > 0 && (
        <div id="sekce-top-opatreni" className="bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden mb-12 scroll-mt-20">
          <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
            <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-brand-navy" />
              Top opatření
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-brand-surface/20">
            <div>
              <h3 className="px-6 pt-5 pb-3 text-xs font-bold text-brand-green uppercase tracking-widest">
                Nejčastěji „Použiju v PO1"
              </h3>
              <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[420px] overflow-y-auto pr-1 pb-2">
                {topByPouziju.map((stat: any, idx: number) => (
                  <div key={stat.id} className="px-6 py-3 hover:bg-brand-bg/60 transition-colors">
                    <div className="flex items-start gap-3 mb-1.5">
                      <span className="text-xs font-bold text-brand-navy/30 mt-0.5 flex-shrink-0">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest mb-0.5">
                          {stat.sheetName} / {stat.oblast}
                        </div>
                        <div className="text-sm font-bold text-brand-navy leading-snug">{stat.krok}</div>
                      </div>
                      <span className="text-brand-green font-black text-sm flex-shrink-0">{stat.pouziju}</span>
                    </div>
                    <div className="h-1.5 bg-brand-bg rounded-full overflow-hidden ml-6">
                      <div className="h-full bg-brand-green rounded-full" style={{ width: `${(stat.pouziju / maxPouziju) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="px-6 pt-5 pb-3 text-xs font-bold text-brand-orange uppercase tracking-widest">
                Nejčastěji „Předat ŠPZ"
              </h3>
              <div className="custom-scrollbar divide-y divide-brand-surface/20 max-h-[420px] overflow-y-auto pr-1 pb-2">
                {topBySpz.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-brand-navy/40 italic">Zatím žádná data.</p>
                ) : (
                  topBySpz.map((stat: any, idx: number) => (
                    <div key={stat.id} className="px-6 py-3 hover:bg-brand-bg/60 transition-colors">
                      <div className="flex items-start gap-3 mb-1.5">
                        <span className="text-xs font-bold text-brand-navy/30 mt-0.5 flex-shrink-0">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest mb-0.5">
                            {stat.sheetName} / {stat.oblast}
                          </div>
                          <div className="text-sm font-bold text-brand-navy leading-snug">{stat.krok}</div>
                        </div>
                        <span className="text-brand-orange font-black text-sm flex-shrink-0">{stat.spz}</span>
                      </div>
                      <div className="h-1.5 bg-brand-bg rounded-full overflow-hidden ml-6">
                        <div className="h-full bg-brand-orange rounded-full" style={{ width: `${(stat.spz / maxSpz) * 100}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      ) : (
      <>
      {/* Archivní navigace — jen starší sekce, netřeba sticky lišta jako u aktuálních. */}
      <div className="flex flex-wrap gap-2 text-xs font-bold mb-10">
        <a href="#sekce-uzivatele-pristupy" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Uživatelé a přístupy</a>
        <a href="#sekce-prehled-pdf" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Přehled generovaných PDF</a>
        <a href="#sekce-top-opatreni-archiv" className="px-3 py-1.5 rounded-full bg-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg border border-brand-surface/40 transition-colors">Top opatření (původní)</a>
      </div>

      {/* Uživatelé a přístupy — starší přehled z login_logs/pdf_logs */}
      <div id="sekce-uzivatele-pristupy" className="scroll-mt-20">
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

      {/* Top Opatření (původní, souhrnný seznam řazený jen podle "Použiju") —
          přesně zkopírováno ze starého dashboardu, ať se žádná historická data
          neztratí; nový přehled (dva žebříčky) je teď v záložce Aktuální. */}
      {measureStats.length > 0 && (
        <div id="sekce-top-opatreni-archiv" className="mt-16 bg-white rounded-3xl shadow-sm border border-brand-surface/30 overflow-hidden scroll-mt-20">
          <div className="flex items-center justify-between p-6 border-b border-brand-surface/30 bg-brand-navy/5">
            <h2 className="text-xl font-bold text-brand-navy flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-brand-navy" />
              Nejčastěji vybíraná opatření (původní přehled)
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
      </>
      )}

      {/* Potvrzení odebrání přístupu vlastním heslem/Google účtem administrátorky —
          chrání proti omylem odebranému přístupu (nevratné, uživatel se musí znovu
          nechat schválit). */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-brand-navy/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-brand-surface/30 p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-brand-navy">
                {confirmTarget.kind === 'user' ? 'Potvrďte odebrání přístupu' : 'Potvrďte odebrání administrátora'}
              </h3>
            </div>
            <p className="text-sm text-brand-navy/60 mb-5">
              Chystáte se {confirmTarget.kind === 'user' ? 'odebrat přístup uživateli' : 'odebrat administrátorský přístup uživateli'} <strong className="text-brand-navy">{confirmTarget.displayName}</strong>. Pro potvrzení {usesPasswordAuth ? 'zadejte znovu své heslo' : 'se znovu ověřte přes Google'}.
            </p>
            {usesPasswordAuth && (
              <input
                type="password"
                value={revokePassword}
                onChange={(e) => setRevokePassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRevoke(); }}
                placeholder="Vaše heslo"
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium text-sm mb-3"
              />
            )}
            {revokeError && <p className="text-rose-500 font-semibold text-sm mb-3">{revokeError}</p>}
            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={closeRevokeModal}
                disabled={isReauthLoading}
                className="px-4 py-2.5 text-brand-navy/50 hover:text-brand-navy font-semibold text-sm transition-colors disabled:opacity-40"
              >
                Zrušit
              </button>
              <button
                onClick={handleConfirmRevoke}
                disabled={isReauthLoading}
                className="px-5 py-2.5 bg-rose-500 text-white rounded-xl font-semibold text-sm transition-all hover:bg-rose-600 disabled:opacity-40"
              >
                {isReauthLoading ? 'Ověřuji...' : usesPasswordAuth ? 'Potvrdit heslem' : 'Potvrdit přes Google'}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
    </AuthGate>
  );
}
