'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Mail, Clock, CheckCircle2, HelpCircle, RefreshCw, Trash2, User, School, Users, BarChart3, TrendingUp } from 'lucide-react';
import { PasswordGate } from '@/components/PasswordGate';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, deleteDoc, doc, where, limit } from 'firebase/firestore';
import measuresData from '@/data/measures.json';

interface PdfLog {
  id: string; // Firestore document ID
  local_id?: string; // Original ID from client
  email: string;
  role?: string;
  schoolType?: string;
  studentCount?: string;
  pouzijuCount: number;
  spzCount: number;
  timestamp: string;
  choices?: Record<string, string>;
}

export default function AdminPage() {
  const [logs, setLogs] = useState<PdfLog[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <Clock className="w-6 h-6 text-indigo-600" />
            Přístupy do katalogu
          </h2>
          {loginLogs.length > 0 && (
            <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full">
              {loginLogs.length} záznamů
            </span>
          )}
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {loginLogs.length === 0 ? (
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
