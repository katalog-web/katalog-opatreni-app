'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Mail, Clock, CheckCircle2, HelpCircle, RefreshCw, Trash2, User, School, Users, BarChart3, TrendingUp, Download } from 'lucide-react';
import { PasswordGate } from '@/components/PasswordGate';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, deleteDoc, doc, where, limit } from 'firebase/firestore';
import measuresData from '@/data/measures.json';
import * as XLSX from 'xlsx';

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

export default function AdminPage() {
  const [logs, setLogs] = useState<PdfLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'history'>('users');
  const [exportSuccess, setExportSuccess] = useState(false);

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

  useEffect(() => { fetchLogs(); }, []);

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
    <PasswordGate requiredPassword="afresjede123" authKey="admin_auth">
      <main className="max-w-4xl mx-auto px-4 py-12 md:py-24">
      <div className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            Administrace
          </h1>
          <button
            onClick={() => {
              if (confirm('Opravdu se chcete odhlásit z administrace?')) {
                localStorage.removeItem('admin_auth');
                window.location.reload();
              }
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-bold transition-colors"
          >
            Odhlásit se
          </button>
        </div>
        <p className="text-lg text-slate-600 mb-8 max-w-2xl leading-relaxed">
          Přehled všech uživatelů, kteří si vygenerovali PDF souhrn ze svého hodnocení.
        </p>
      </div>

      {/* Statistiky */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
          <p className="text-4xl font-extrabold text-indigo-600">{logs.length}</p>
          <p className="text-sm font-medium text-slate-500 mt-1">Celkem PDF</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
          <p className="text-4xl font-extrabold text-emerald-600">
            {new Set(logs.map(l => l.email)).size}
          </p>
          <p className="text-sm font-medium text-slate-500 mt-1">Unikátních e-mailů</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
          <p className="text-4xl font-extrabold text-violet-600">{loginLogs.length}</p>
          <p className="text-sm font-medium text-slate-500 mt-1">Přihlášení</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
          <p className="text-4xl font-extrabold text-slate-700">
            {logs.length > 0 ? new Date(logs[0].timestamp).toLocaleDateString('cs-CZ') : '–'}
          </p>
          <p className="text-sm font-medium text-slate-500 mt-1">Poslední aktivita</p>
        </div>
      </div>

      {/* Top Opatření (Statistiky) */}
      {measureStats.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-12">
          <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-indigo-50/50">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Nejčastěji vybíraná opatření
            </h2>
          </div>
          <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto pr-2">
            {measureStats.map((stat: any, idx: number) => (
              <div key={stat.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold flex items-center justify-center flex-shrink-0 mt-1 shadow-inner">
                  {idx + 1}.
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    {stat.sheetName} / {stat.oblast}
                  </div>
                  <div className="font-bold text-slate-800 leading-snug">{stat.krok}</div>
                </div>
                <div className="flex gap-4 flex-shrink-0 text-sm">
                  <div className="flex flex-col items-center bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700 font-black text-lg">{stat.pouziju}</span>
                    <span className="text-emerald-600/80 text-[10px] font-bold uppercase tracking-wider">Použiju</span>
                  </div>
                  <div className="flex flex-col items-center bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">
                    <span className="text-rose-700 font-black text-lg">{stat.spz}</span>
                    <span className="text-rose-600/80 text-[10px] font-bold uppercase tracking-wider">ŠPZ</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabulka logů */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800">Přehled generovaných PDF</h2>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Obnovit
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-500 animate-pulse">Načítám data...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-400 text-lg font-medium">Zatím zde nejsou žádné záznamy.</p>
            <p className="text-slate-400 text-sm mt-2">Jakmile si někdo vygeneruje PDF, zobrazí se zde.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto pr-2">
            {logs.map((log, i) => (
              <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{log.email}</span>
                    </div>
                    {log.role && (
                      <div className="flex items-center gap-1.5 text-slate-500 text-sm bg-slate-100 px-2 py-0.5 rounded-md">
                        <User className="w-3.5 h-3.5" />
                        {log.role}
                      </div>
                    )}
                    {log.schoolType && (
                      <div className="flex items-center gap-1.5 text-slate-500 text-sm bg-slate-100 px-2 py-0.5 rounded-md">
                        <School className="w-3.5 h-3.5" />
                        {log.schoolType}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <div className="flex items-center gap-1.5 ">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(log.timestamp).toLocaleString('cs-CZ')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">{log.pouzijuCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span className="text-rose-700 font-bold">{log.spzCount}</span>
                    </div>
                  </div>
                </div>

                <Link 
                  href={`/admin/detail?id=${log.id}`}
                  className="px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                >
                  Detail →
                </Link>

                <button
                  onClick={() => handleDelete(log.id)}
                  className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  title="Smazat záznam"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-16">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-bold text-slate-800">
              Uživatelé a přístupy
            </h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={uniqueUsers.length === 0}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all border ${
                exportSuccess 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800 shadow-sm'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {exportSuccess ? 'Ukládám...' : 'Exportovat do Excelu'}
            </button>
            <div className="bg-slate-100 p-1 rounded-xl flex gap-1 text-xs font-bold">
              <button
                onClick={() => setActiveAdminTab('users')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeAdminTab === 'users' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Přehled uživatelů ({uniqueUsers.length})
              </button>
              <button
                onClick={() => setActiveAdminTab('history')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeAdminTab === 'history' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Historie přihlášení ({loginLogs.length})
              </button>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {activeAdminTab === 'users' ? (
            uniqueUsers.length === 0 ? (
              <div className="p-8 text-center">
                <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">Žádní uživatelé k zobrazení.</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[450px] relative pr-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <th className="p-4 pl-6 bg-slate-50 sticky top-0 z-10">Uživatel (E-mail)</th>
                      <th className="p-4 bg-slate-50 sticky top-0 z-10">Aktivita</th>
                      <th className="p-4 text-center bg-slate-50 sticky top-0 z-10">Vygeneroval PDF</th>
                      <th className="p-4 bg-slate-50 sticky top-0 z-10">Účel práce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {uniqueUsers.map((u, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 pl-6 font-bold text-slate-800 break-all max-w-[200px]">
                          {u.email}
                        </td>
                        <td className="p-4 text-slate-600">
                          <span className="font-bold text-indigo-600">{u.loginCount}x</span> přihlášen
                          {u.lastLogin && (
                            <span className="block text-xs text-slate-400 mt-0.5">
                              Naposledy: {new Date(u.lastLogin).toLocaleDateString('cs-CZ')}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {u.generatedPdf ? (
                            <div className="flex flex-col items-center gap-1.5 justify-center">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Ano ({u.pdfLogs.length}x)
                              </span>
                              <div className="flex flex-wrap gap-1 justify-center mt-1">
                                {u.pdfLogs.map((pl, plIdx) => (
                                  <Link
                                    key={pl.id}
                                    href={`/admin/detail?id=${pl.id}`}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors"
                                  >
                                    Detail {u.pdfLogs.length > 1 ? `#${u.pdfLogs.length - plIdx}` : ''}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                              Ne
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-slate-600 max-w-[250px]">
                          {u.purposes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.purposes.map((p, pIdx) => (
                                <span key={pIdx} className="inline-block bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-md max-w-full truncate" title={p}>
                                  {p}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">nevyplněno</span>
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
                <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">Žádné záznamy o přihlášení.</p>
                <p className="text-slate-400 text-sm mt-1">Jakmile se někdo přihlásí, zobrazí se zde.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto pr-2">
                {loginLogs.map((ll, idx) => (
                  <div key={idx} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{ll.email}</p>
                        <p className="text-xs text-slate-400 mt-0.5">přihlášení do katalogu</p>
                      </div>
                    </div>
                    <div className="text-sm text-slate-400 text-right flex-shrink-0">
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

      <div className="mt-12">
        <Link href="/" className="text-indigo-600 hover:underline">
          &larr; Zpět na seznam opatření
        </Link>
      </div>
    </main>
    </PasswordGate>
  );
}
