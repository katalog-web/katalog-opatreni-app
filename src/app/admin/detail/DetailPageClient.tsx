'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Clock, CheckCircle2, HelpCircle, FileText, ChevronLeft } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Header } from '@/components/Header';
import { SectionEyebrow } from '@/components/SectionEyebrow';
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

  if (isLoading) return <div className="p-24 text-center animate-pulse text-brand-navy/50">Načítám detail...</div>;
  if (!log) return <div className="p-24 text-center text-brand-navy/60">Záznam nenalezen. <Link href="/admin" className="text-brand-green underline">Zpět</Link></div>;

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
    <AuthGate requireAdmin>
      {/* Pevná horní lišta s logem — stejný vzor jako na hlavní stránce katalogu */}
      <Header context="admin" />

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-24">
      <div className="mb-8 print:hidden">
        <Link href="/admin" className="inline-flex items-center gap-2 text-brand-navy/40 hover:text-brand-navy transition-colors mb-6 text-sm font-bold">
          <ChevronLeft className="w-4 h-4" />
          Zpět do přehledu
        </Link>
      </div>

      <div id="print-summary" className="p-8 md:p-12 bg-white border-2 border-brand-surface/30 rounded-[2rem] shadow-xl shadow-brand-navy/5">
        <SectionEyebrow>Archiv</SectionEyebrow>
        <h2 className="text-3xl font-extrabold text-brand-navy mb-8 border-b-2 border-brand-surface/30 pb-6 tracking-tight">
          Souhrn vybraných opatření
        </h2>

        <div className="mb-8 p-6 bg-brand-bg rounded-2xl border border-brand-surface/30 grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8">
          <p className="text-lg text-brand-navy/70 font-medium">
            Vypracoval/a: <span className="text-brand-navy font-bold">{log.email}</span>
          </p>
          <p className="text-sm text-brand-navy/40 flex items-center gap-1.5 md:justify-end">
            <Clock className="w-4 h-4" />
            {new Date(log.timestamp).toLocaleString('cs-CZ')}
          </p>
          {log.role && (
            <p className="text-brand-navy/70">
              Role: <span className="font-bold text-brand-navy">{log.role}</span>
            </p>
          )}
          {log.schoolType && (
            <p className="text-brand-navy/70">
              Škola: <span className="font-bold text-brand-navy">{log.schoolType}</span>
            </p>
          )}
          {log.studentCount && (
            <p className="text-brand-navy/70">
              Počet žáků ve škole: <span className="font-bold text-brand-navy">{log.studentCount}</span>
            </p>
          )}
          {log.purpose && (
            <p className="text-brand-navy/70">
              Účel práce: <span className="font-bold text-brand-navy">{log.purpose}</span>
            </p>
          )}
        </div>

        {/* Grafické znázornění */}
        <div className="mb-14">
          <h3 className="text-xl font-bold text-brand-navy mb-6">Stav hodnocení</h3>
          <div className="flex justify-between text-sm md:text-base font-semibold mb-3">
            <span className="text-brand-green flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-brand-green"></div>
              Použiju v PO1 ({log.pouzijuCount})
            </span>
            <span className="text-brand-orange flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-brand-orange"></div>
              Předat ŠPZ ({log.spzCount})
            </span>
          </div>
          <div className="w-full h-5 rounded-full overflow-hidden flex bg-brand-bg shadow-inner">
            <div className="bg-brand-green transition-all duration-1000 ease-out h-full" style={{ width: `${pouzijuPct}%` }} />
            <div className="bg-brand-orange transition-all duration-1000 ease-out h-full" style={{ width: `${spzPct}%` }} />
          </div>
        </div>

        {/* Výpis opatření POUZIJU */}
        {log.pouzijuCount > 0 && (
          <div className="mb-12">
            <h3 className="text-xl font-bold text-brand-green mb-8 flex items-center gap-3 border-b-2 border-brand-green/20 pb-4">
              <CheckCircle2 className="w-8 h-8 text-brand-green" />
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
                  <div key={sheet} className="bg-brand-green/5 rounded-3xl p-6 border border-brand-green/20">
                    <h4 className="text-lg font-bold text-brand-green uppercase tracking-wider mb-6">
                      List: {sheet}
                    </h4>
                    <div className="space-y-6">
                      {Object.keys(groupedSheets[sheet]).map(oblast => {
                        const oblastHasPouzi = Object.keys(groupedSheets[sheet][oblast]).some(opatreni =>
                          groupedSheets[sheet][oblast][opatreni].some((m: any) => log.choices && log.choices[m.id] === 'POUZIJU')
                        );
                        if (!oblastHasPouzi) return null;

                        return (
                          <div key={oblast} className="pl-2 md:pl-4 border-l-4 border-brand-green/30">
                            <h5 className="font-bold text-brand-navy/80 mb-3 text-lg flex items-center gap-2">
                              Oblast: {oblast}
                            </h5>
                            <ul className="space-y-3">
                              {Object.keys(groupedSheets[sheet][oblast]).map(opatreni => {
                                const steps = groupedSheets[sheet][oblast][opatreni].filter((m: any) => log.choices && log.choices[m.id] === 'POUZIJU');
                                if (steps.length === 0) return null;
                                return steps.map((m: any) => (
                                  <li key={m.id} className="p-4 bg-white rounded-xl shadow-sm border border-brand-surface/30 flex gap-3">
                                    <div className="w-2 h-2 rounded-full bg-brand-green mt-2 flex-shrink-0"></div>
                                    <div>
                                      {opatreni !== '-' && opatreni !== m.krok && (
                                        <div className="text-xs font-bold text-brand-navy/40 mb-1">{opatreni}</div>
                                      )}
                                      <div className="font-medium text-brand-navy leading-snug">{m.krok}</div>
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
          <div className={log.pouzijuCount > 0 ? "mt-12 pt-10 border-t-2 border-brand-surface/20" : ""}>
            <h3 className="text-xl font-bold text-brand-orange mb-8 flex items-center gap-3 border-b-2 border-brand-orange/20 pb-4">
              <HelpCircle className="w-8 h-8 text-brand-orange" />
              Kroky předané ŠPZ
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
                  <div key={sheet} className="bg-brand-orange/5 rounded-3xl p-6 border border-brand-orange/20">
                    <h4 className="text-lg font-bold text-brand-orange uppercase tracking-wider mb-6">
                      List: {sheet}
                    </h4>
                    <div className="space-y-6">
                      {Object.keys(groupedSheets[sheet]).map(oblast => {
                        const oblastHasSpz = Object.keys(groupedSheets[sheet][oblast]).some(opatreni =>
                          groupedSheets[sheet][oblast][opatreni].some((m: any) => log.choices && log.choices[m.id] === 'NECHAM_NA_SPZ')
                        );
                        if (!oblastHasSpz) return null;

                        return (
                          <div key={oblast} className="pl-2 md:pl-4 border-l-4 border-brand-orange/30">
                            <h5 className="font-bold text-brand-navy/80 mb-3 text-lg flex items-center gap-2">
                              Oblast: {oblast}
                            </h5>
                            <ul className="space-y-3">
                              {Object.keys(groupedSheets[sheet][oblast]).map(opatreni => {
                                const steps = groupedSheets[sheet][oblast][opatreni].filter((m: any) => log.choices && log.choices[m.id] === 'NECHAM_NA_SPZ');
                                if (steps.length === 0) return null;
                                return steps.map((m: any) => (
                                  <li key={m.id} className="p-4 bg-white rounded-xl shadow-sm border border-brand-surface/30 flex gap-3">
                                    <div className="w-2 h-2 rounded-full bg-brand-orange mt-2 flex-shrink-0"></div>
                                    <div>
                                      {opatreni !== '-' && opatreni !== m.krok && (
                                        <div className="text-xs font-bold text-brand-navy/40 mb-1">{opatreni}</div>
                                      )}
                                      <div className="font-medium text-brand-navy leading-snug">{m.krok}</div>
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
          <div className="p-12 text-center text-brand-navy/40 border-2 border-dashed border-brand-surface/40 rounded-3xl">
            U tohoto záznamu nejsou k dispozici detailní volby (starší log).
          </div>
        )}
      </div>

      <div className="mt-8 text-center print:hidden">
        <button
          onClick={() => window.print()}
          className="px-8 py-3 bg-brand-navy text-white rounded-xl font-semibold hover:bg-brand-navy/90 transition-all shadow-lg hover:shadow-xl"
        >
          Vytisknout tento archivní souhrn
        </button>
      </div>
    </main>
    </AuthGate>
  );
}
