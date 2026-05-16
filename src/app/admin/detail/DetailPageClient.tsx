'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Clock, CheckCircle2, HelpCircle, FileText, ChevronLeft } from 'lucide-react';
import { PasswordGate } from '@/components/PasswordGate';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import measuresData from '@/data/measures.json';

export default function DetailPageClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [log, setLog] = useState<any>(null);
  const [measures, setMeasures] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    
    setIsLoading(true);
    
    const fetchData = async () => {
      try {
        // 1. Načíst konkrétní log z Firebase
        if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
          const docSnap = await getDoc(doc(db, 'pdf_logs', id));
          if (docSnap.exists()) {
            setLog(docSnap.data());
          }
        }
        
        // 2. Použít importovaná data opatření
        setMeasures(measuresData);
      } catch (err) {
        console.error('Chyba při načítání detailu:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (isLoading) return <div className="p-24 text-center animate-pulse">Načítám detail...</div>;
  if (!log) return <div className="p-24 text-center">Záznam nenalezen. <Link href="/admin" className="text-blue-600 underline">Zpět</Link></div>;

  const measureMap = measures.reduce((acc: any, m: any) => {
    acc[m.id] = m;
    return acc;
  }, {});

  const groupedSheets = measures.reduce((acc: any, curr: any) => {
    if (!acc[curr.sheetName]) acc[curr.sheetName] = {};
    if (!acc[curr.sheetName][curr.oblast]) acc[curr.sheetName][curr.oblast] = {};
    if (!acc[curr.sheetName][curr.oblast][curr.opatreni]) acc[curr.sheetName][curr.oblast][curr.opatreni] = [];
    acc[curr.sheetName][curr.oblast][curr.opatreni].push(curr);
    return acc;
  }, {});

  const total = log.pouzijuCount + log.spzCount;
  const pouzijuPct = total > 0 ? (log.pouzijuCount / total) * 100 : 0;
  const spzPct = total > 0 ? (log.spzCount / total) * 100 : 0;

  return (
    <PasswordGate requiredPassword="afresjede123" authKey="admin_auth">
      <main className="max-w-4xl mx-auto px-4 py-12 md:py-24">
      <div className="mb-8 print:hidden">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-6">
          <ChevronLeft className="w-4 h-4" />
          Zpět do přehledu
        </Link>
      </div>

      <div id="print-summary" className="p-8 md:p-12 bg-white border-2 border-slate-100 rounded-[2rem] shadow-xl shadow-slate-200/50">
        <h2 className="text-3xl font-extrabold text-slate-900 mb-8 border-b-2 border-slate-100 pb-6 tracking-tight">
          Souhrn vybraných opatření
        </h2>
        
        <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8">
          <p className="text-lg text-slate-600 font-medium">
            Vypracoval/a: <span className="text-indigo-700 font-bold">{log.email}</span>
          </p>
          <p className="text-sm text-slate-400 flex items-center gap-1.5 md:justify-end">
            <Clock className="w-4 h-4" />
            {new Date(log.timestamp).toLocaleString('cs-CZ')}
          </p>
          {log.role && (
            <p className="text-slate-600">
              Role: <span className="font-bold text-slate-800">{log.role}</span>
            </p>
          )}
          {log.schoolType && (
            <p className="text-slate-600">
              Škola: <span className="font-bold text-slate-800">{log.schoolType}</span>
            </p>
          )}
          {log.studentCount && (
            <p className="text-slate-600">
              Počet žáků ve škole: <span className="font-bold text-slate-800">{log.studentCount}</span>
            </p>
          )}
          {log.purpose && (
            <p className="text-slate-600">
              Účel práce: <span className="font-bold text-slate-800">{log.purpose}</span>
            </p>
          )}
        </div>
        
        {log.feedback && (
          <div className="mb-10 p-6 bg-amber-50/50 rounded-2xl border border-amber-100">
            <h3 className="text-sm font-bold text-amber-800/60 uppercase tracking-wider mb-2">Poznámky / zpětná vazba:</h3>
            <p className="text-slate-700 whitespace-pre-wrap italic">"{log.feedback}"</p>
          </div>
        )}
        
        {/* Grafické znázornění */}
        <div className="mb-14">
          <h3 className="text-xl font-bold text-slate-700 mb-6">Stav hodnocení</h3>
          <div className="flex justify-between text-sm md:text-base font-semibold mb-3">
            <span className="text-emerald-600 flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div> 
              Použiju v PO1 ({log.pouzijuCount})
            </span>
            <span className="text-rose-600 flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500"></div> 
              Nutné doporučení ŠPZ ({log.spzCount})
            </span>
          </div>
          <div className="w-full h-5 rounded-full overflow-hidden flex bg-slate-100 shadow-inner">
            <div className="bg-emerald-500 transition-all duration-1000 ease-out h-full" style={{ width: `${pouzijuPct}%` }} />
            <div className="bg-rose-500 transition-all duration-1000 ease-out h-full" style={{ width: `${spzPct}%` }} />
          </div>
        </div>
        
        {/* Výpis opatření POUZIJU */}
        {log.pouzijuCount > 0 && (
          <div className="mb-12">
            <h3 className="text-xl font-bold text-emerald-800 mb-8 flex items-center gap-3 border-b-2 border-emerald-100 pb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              Opatření a kroky k zavedení (Použiju v PO1)
            </h3>
            <div className="space-y-10">
              {Object.keys(groupedSheets).map(sheet => {
                const sheetHasPouzi = Object.keys(groupedSheets[sheet]).some(oblast => 
                  Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                    groupedSheets[sheet][oblast][opatreni].some((m: any) => log.choices && log.choices[m.id] === 'POUZIJU')
                  )
                );
                if (!sheetHasPouzi) return null;
                
                return (
                  <div key={sheet} className="bg-emerald-50/50 rounded-3xl p-6 border border-emerald-100/80">
                    <h4 className="text-lg font-bold text-emerald-800 uppercase tracking-wider mb-6">
                      List: {sheet}
                    </h4>
                    <div className="space-y-6">
                      {Object.keys(groupedSheets[sheet]).map(oblast => {
                        const oblastHasPouzi = Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                          groupedSheets[sheet][oblast][opatreni].some((m: any) => log.choices && log.choices[m.id] === 'POUZIJU')
                        );
                        if (!oblastHasPouzi) return null;
                        
                        return (
                          <div key={oblast} className="pl-2 md:pl-4 border-l-4 border-emerald-200">
                            <h5 className="font-bold text-slate-800 mb-3 text-lg flex items-center gap-2">
                              Oblast: {oblast}
                            </h5>
                            <ul className="space-y-3">
                              {Object.keys(groupedSheets[sheet][oblast]).map(opatreni => {
                                const steps = groupedSheets[sheet][oblast][opatreni].filter((m: any) => log.choices && log.choices[m.id] === 'POUZIJU');
                                if (steps.length === 0) return null;
                                return steps.map((m: any) => (
                                  <li key={m.id} className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex gap-3">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2 flex-shrink-0"></div>
                                    <div>
                                      {opatreni !== '-' && opatreni !== m.krok && (
                                        <div className="text-xs font-bold text-slate-400 mb-1">{opatreni}</div>
                                      )}
                                      <div className="font-medium text-slate-900 leading-snug">{m.krok}</div>
                                    </div>
                                  </li>
                                ));
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Výpis opatření ŠPZ */}
        {log.spzCount > 0 && (
          <div className={log.pouzijuCount > 0 ? "mt-12 pt-10 border-t-2 border-slate-100/80" : ""}>
            <h3 className="text-xl font-bold text-rose-800 mb-8 flex items-center gap-3 border-b-2 border-rose-100 pb-4">
              <HelpCircle className="w-8 h-8 text-rose-600" />
              Kroky vyžadující nutné doporučení ŠPZ
            </h3>
            <div className="space-y-10">
              {Object.keys(groupedSheets).map(sheet => {
                const sheetHasSpz = Object.keys(groupedSheets[sheet]).some(oblast => 
                  Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                    groupedSheets[sheet][oblast][opatreni].some((m: any) => log.choices && log.choices[m.id] === 'NECHAM_NA_SPZ')
                  )
                );
                if (!sheetHasSpz) return null;
                
                return (
                  <div key={sheet} className="bg-rose-50/50 rounded-3xl p-6 border border-rose-100/80">
                    <h4 className="text-lg font-bold text-rose-800 uppercase tracking-wider mb-6">
                      List: {sheet}
                    </h4>
                    <div className="space-y-6">
                      {Object.keys(groupedSheets[sheet]).map(oblast => {
                        const oblastHasSpz = Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                          groupedSheets[sheet][oblast][opatreni].some((m: any) => log.choices && log.choices[m.id] === 'NECHAM_NA_SPZ')
                        );
                        if (!oblastHasSpz) return null;
                        
                        return (
                          <div key={oblast} className="pl-2 md:pl-4 border-l-4 border-rose-200">
                            <h5 className="font-bold text-slate-800 mb-3 text-lg flex items-center gap-2">
                              Oblast: {oblast}
                            </h5>
                            <ul className="space-y-3">
                              {Object.keys(groupedSheets[sheet][oblast]).map(opatreni => {
                                const steps = groupedSheets[sheet][oblast][opatreni].filter((m: any) => log.choices && log.choices[m.id] === 'NECHAM_NA_SPZ');
                                if (steps.length === 0) return null;
                                return steps.map((m: any) => (
                                  <li key={m.id} className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex gap-3">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 mt-2 flex-shrink-0"></div>
                                    <div>
                                      {opatreni !== '-' && opatreni !== m.krok && (
                                        <div className="text-xs font-bold text-slate-400 mb-1">{opatreni}</div>
                                      )}
                                      <div className="font-medium text-slate-900 leading-snug">{m.krok}</div>
                                    </div>
                                  </li>
                                ));
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!log.choices && (
          <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
            U tohoto záznamu nejsou k dispozici detailní volby (starší log).
          </div>
        )}
      </div>

      <div className="mt-8 text-center print:hidden">
        <button 
          onClick={() => window.print()}
          className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg hover:shadow-xl"
        >
          Vytisknout tento archivní souhrn
        </button>
      </div>
    </main>
    </PasswordGate>
  );
}
