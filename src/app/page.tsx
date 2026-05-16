'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { PasswordGate } from '@/components/PasswordGate';
import { MeasureCard, Choice } from '@/components/MeasureCard';
import { ChevronDown, CheckCircle2, HelpCircle, FileDown, Loader2, User, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import measuresData from '@/data/measures.json';

interface Measure {
  id: string;
  sheetName: string;
  oblast: string;
  opatreni: string;
  krok: string;
}

export default function Home() {
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [userChoices, setUserChoices] = useState<Record<string, Choice>>({});
  const [activeTab, setActiveTab] = useState<string>('');
  
  // PDF state
  const summaryRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState('');
  const [role, setRole] = useState('');
  const [schoolType, setSchoolType] = useState('');
  const [studentCount, setStudentCount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleGenerateAndSendPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      // Uložit log do Firebase (přímo z klienta)
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        await addDoc(collection(db, 'pdf_logs'), {
          email: teacherEmail,
          role,
          schoolType,
          studentCount,
          purpose,
          feedback,
          pouzijuCount,
          spzCount,
          choices: userChoices,
          timestamp: new Date().toISOString(),
          firestore_ts: serverTimestamp()
        });
      }
    } catch (err) {
      console.error('Nepodařilo se uložit statistiky:', err);
    } finally {
      setIsGeneratingPdf(false);
      // Scroll to summary before printing
      if (typeof window !== 'undefined') {
        const el = document.getElementById('print-summary');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
      // Otevřít tiskový dialog prohlížeče
      window.print();
    }
  };

  const toggleArea = (areaName: string) => {
    setExpandedAreas(prev => ({
      ...prev,
      [areaName]: !prev[areaName]
    }));
  };

  useEffect(() => {
    // Pro statický export načítáme data přímo z importovaného JSONu
    const filtered = (measuresData as Measure[]).filter(m => {
      // Filtrace: Nechceme Hodnocení
      if (m.sheetName.includes('Hodnocení')) return false;
      
      return true;
    }).map(m => {
      // Přejmenování Metody výuky -> Pomůcky pro sjednocení v UI
      if (m.sheetName.includes('Metody výuky')) return { ...m, sheetName: '2. Pomůcky' };
      return m;
    });

    setMeasures(filtered);
    
    // Načíst e-mail z přihlášení
    const savedEmail = localStorage.getItem('katalog_email');
    if (savedEmail) {
      setTeacherEmail(savedEmail);
    }
    
    // Načíst rozpracovaná data
    try {
      const savedChoices = localStorage.getItem('katalog_user_choices');
      if (savedChoices) setUserChoices(JSON.parse(savedChoices));
      const savedRole = localStorage.getItem('katalog_role');
      if (savedRole) setRole(savedRole);
      const savedSchoolType = localStorage.getItem('katalog_school_type');
      if (savedSchoolType) setSchoolType(savedSchoolType);
      const savedStudentCount = localStorage.getItem('katalog_student_count');
      if (savedStudentCount) setStudentCount(savedStudentCount);
      const savedPurpose = localStorage.getItem('katalog_purpose');
      if (savedPurpose) setPurpose(savedPurpose);
      const savedFeedback = localStorage.getItem('katalog_feedback');
      if (savedFeedback) setFeedback(savedFeedback);
    } catch(e) {
      console.warn('Nepodařilo se obnovit předchozí stav:', e);
    }

    // Nastavit první tab jako aktivní
    const sheetNames = Array.from(new Set(filtered.map(m => m.sheetName)));
    if (sheetNames.length > 0) setActiveTab(sheetNames[0]);
    
    setIsLoading(false);
  }, []);

  const handleChoiceSelect = (id: string, choice: Choice) => {
    setUserChoices(prev => {
      const newChoices = { ...prev };
      if (choice === null) {
        delete newChoices[id];
      } else {
        newChoices[id] = choice;
      }
      return newChoices;
    });
  };

  // Ukládání rozepsaného stavu po každé změně
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('katalog_user_choices', JSON.stringify(userChoices));
      localStorage.setItem('katalog_role', role);
      localStorage.setItem('katalog_school_type', schoolType);
      localStorage.setItem('katalog_student_count', studentCount);
      localStorage.setItem('katalog_purpose', purpose);
      localStorage.setItem('katalog_feedback', feedback);
    }
  }, [userChoices, role, schoolType, studentCount, purpose, feedback, isLoading]);

  const handleReset = () => {
    if (window.confirm('Opravdu chcete zcela vymazat Váš aktuální postup a začít znovu s čistým listem?')) {
      setUserChoices({});
      setRole('');
      setSchoolType('');
      setStudentCount('');
      setPurpose('');
      setFeedback('');
      const sheets = Object.keys(groupedSheets);
      if (sheets.length > 0) setActiveTab(sheets[0]);
    }
  };

  // Výpočty pro souhrn (Memoized)
  const { progress: computedProgress, pouzijuCount, spzCount, missingCount, pouzijuPct, spzPct, isComplete } = useMemo(() => {
    const total = measures.length || 1;
    const pouziju = measures.filter(m => userChoices[m.id] === 'POUZIJU').length;
    const spz = measures.filter(m => userChoices[m.id] === 'NECHAM_NA_SPZ').length;
    const completed = Object.keys(userChoices).length;
    
    return {
      progress: (completed / total) * 100,
      pouzijuCount: pouziju,
      spzCount: spz,
      missingCount: measures.length - completed,
      pouzijuPct: (pouziju / total) * 100,
      spzPct: (spz / total) * 100,
      isComplete: measures.length > 0 && measures.every(m => userChoices[m.id])
    };
  }, [measures, userChoices]);
  
  // Grouping logic (Memoized)
  const groupedSheets = useMemo(() => {
    return measures.reduce((acc, curr) => {
      if (!acc[curr.sheetName]) acc[curr.sheetName] = {};
      if (!acc[curr.sheetName][curr.oblast]) acc[curr.sheetName][curr.oblast] = {};
      if (!acc[curr.sheetName][curr.oblast][curr.opatreni]) acc[curr.sheetName][curr.oblast][curr.opatreni] = [];
      acc[curr.sheetName][curr.oblast][curr.opatreni].push(curr);
      return acc;
    }, {} as any);
  }, [measures]);

  // Nastavení prvního listu jako aktivního
  useEffect(() => {
    const sheets = Object.keys(groupedSheets);
    if (sheets.length > 0 && !activeTab) {
      setActiveTab(sheets[0]);
    }
  }, [groupedSheets, activeTab]);

  return (
    <PasswordGate onSuccess={() => {
      const savedEmail = localStorage.getItem('katalog_email');
      if (savedEmail) setTeacherEmail(savedEmail);
    }}>
      <main className="max-w-4xl mx-auto px-4 py-8 md:py-16">
      
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          #print-summary { 
            margin: 0 !important; 
            padding: 0 !important; 
            border: none !important; 
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* --- BROWSING SECTION (Hidden on print) --- */}
      <div className="no-print">
        {/* Top bar pro odhlášení */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => {
              if (window.confirm('Opravdu se chcete odhlásit?')) {
                localStorage.removeItem('katalog_auth');
                localStorage.removeItem('katalog_email');
                window.location.reload();
              }
            }}
            className="text-brand-navy/40 hover:text-brand-navy transition-colors text-[10px] sm:text-xs uppercase font-bold tracking-wider"
          >
            Odhlásit se
          </button>
        </div>

        <div className="mb-12 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="max-w-4xl w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 mb-8 w-full">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-brand-navy leading-tight">
                Katalog podpůrných opatření
              </h1>
              <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 self-start sm:self-center">
                <img src="/logo.png" alt="AFREŠ logo" className="h-10 sm:h-12 w-auto object-contain" />
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-brand-navy/40 bg-brand-surface/20 w-fit px-3 py-1.5 rounded-2xl mb-6 border border-brand-surface/30">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse"></div>
              Přihlášen: <span className="text-brand-navy/60 break-all">{teacherEmail || 'Uživatel (bez e-mailu)'}</span>
              {Object.keys(userChoices).length > 0 && (
                <button 
                  onClick={handleReset} 
                  className="ml-0 sm:ml-2 pl-0 sm:pl-3 border-l-0 sm:border-l-2 border-brand-navy/10 text-brand-orange hover:text-red-600 transition-colors underline decoration-dotted"
                >
                  Vymazat list
                </button>
              )}
            </div>
            <p className="text-brand-orange/80 text-sm font-medium mb-3">
              Nacházíte se v PILOTNÍ verzi katalogu, která slouží především pro testování.
            </p>
            <p className="text-lg text-brand-navy/80 leading-relaxed mb-0">
              Projděte si všechna podpůrná opatření a rozhodněte se, zda je podle Vás možná 
              implementace v rámci PO1 ve škole (např. v rámci Plánu pedagogické podpory).
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-brand-surface h-3 mb-2 rounded-full overflow-hidden">
          <div 
            className="bg-brand-yellow h-3 rounded-full transition-all duration-700 ease-out" 
            style={{ width: `${computedProgress}%` }}
          />
        </div>
        <p className="text-sm font-bold text-brand-navy/60 text-right">
          Hotovo: {Math.round(computedProgress)}%
        </p>

      {/* -------------------- ZÁLOŽKY (TABS) PRO LISTY -------------------- */}
      {!isLoading && Object.keys(groupedSheets).length > 1 && (
        <div className="flex flex-wrap gap-3 mb-10 border-b-2 border-slate-100 pb-5">
          {Object.keys(groupedSheets).map(sheetName => (
            <button
              key={sheetName}
              onClick={() => setActiveTab(sheetName)}
              className={`px-5 py-3 rounded-xl font-extrabold transition-all ${
                activeTab === sheetName 
                  ? 'bg-brand-navy text-white shadow-md transform -translate-y-[2px]' 
                  : 'bg-white text-brand-navy/60 hover:bg-brand-bg hover:text-brand-navy border-2 border-brand-surface shadow-sm'
              }`}
            >
              {sheetName}
            </button>
          ))}
        </div>
      )}

      {/* Cards List Grouped */}
      <div className="flex flex-col gap-16">
        {isLoading ? (
          <div className="text-center py-12 text-slate-500 animate-pulse">
            Načítám opatření...
          </div>
        ) : (
          activeTab && groupedSheets[activeTab] && (
            <div key={activeTab} className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-3xl font-extrabold text-indigo-900 border-b-2 border-indigo-100 pb-4">
                List: {activeTab}
              </h2>
              
              {Object.keys(groupedSheets[activeTab]).map((oblast, idx) => {
                const colors = [
                  { border: 'border-brand-navy', text: 'text-brand-navy', hoverBg: 'hover:bg-brand-navy/10', ring: 'focus:ring-brand-navy/30' },
                  { border: 'border-brand-yellow', text: 'text-brand-yellow', hoverBg: 'hover:bg-brand-yellow/10', ring: 'focus:ring-brand-yellow/30' },
                  { border: 'border-brand-orange', text: 'text-brand-orange', hoverBg: 'hover:bg-brand-orange/10', ring: 'focus:ring-brand-orange/30' },
                  { border: 'border-brand-green', text: 'text-brand-green', hoverBg: 'hover:bg-brand-green/10', ring: 'focus:ring-brand-green/30' },
                ];
                const theme = colors[idx % colors.length];
                
                return (
                <div key={oblast} className={`pl-0 md:pl-6 border-l-0 md:border-l-4 ${theme.border}`}>
                  <button 
                    onClick={() => toggleArea(oblast)}
                    className={`flex justify-between items-center w-full text-left group mb-4 ${theme.hoverBg} p-3 md:-ml-3 rounded-xl transition-colors focus:outline-none focus:ring-2 ${theme.ring}`}
                  >
                    <h3 className="text-xl sm:text-2xl font-bold text-brand-navy/90 group-hover:text-brand-navy transition-colors pr-2 break-words">
                      {oblast}
                    </h3>
                    <ChevronDown className={`w-6 h-6 flex-shrink-0 ${theme.text} opacity-80 group-hover:opacity-100 transition-all duration-300 ${expandedAreas[oblast] ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {expandedAreas[oblast] && (
                    <div className="pt-4 border-t border-slate-100">
                      {Object.keys(groupedSheets[activeTab][oblast]).map(opatreni => (
                        <div key={opatreni} className="mt-2 mb-10">
                          <div className="bg-slate-50/80 rounded-xl p-4 mb-4 border border-slate-100">
                            <h4 className="text-lg md:text-xl font-bold text-brand-navy/80 leading-snug">
                              {opatreni}
                            </h4>
                          </div>
                          
                          <div className="flex flex-col gap-4 pl-0 md:pl-6">
                            {groupedSheets[activeTab][oblast][opatreni].map((krok: Measure) => (
                                <MeasureCard
                                  key={krok.id}
                                  id={krok.id}
                                  title={krok.krok}
                                  choice={userChoices[krok.id] || null}
                                  onChoiceSelect={handleChoiceSelect}
                                />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )
        )}
      </div>
      
      {/* -------------------- ZÁLOŽKY (TABS) PRO LISTY (DOLE) -------------------- */}
      {!isLoading && Object.keys(groupedSheets).length > 1 && (
        <div className="flex flex-col gap-3 mt-8 mb-4 border-t-2 border-slate-100 pt-8 no-print">
          <span className="text-sm font-bold text-brand-navy/40 uppercase tracking-wider">Přejít na list:</span>
          <div className="flex flex-wrap gap-3">
            {Object.keys(groupedSheets).map(sheetName => (
              <button
                key={sheetName + '-bottom'}
                onClick={() => {
                  setActiveTab(sheetName);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-5 py-3 rounded-xl font-extrabold transition-all ${
                  activeTab === sheetName 
                    ? 'bg-brand-navy text-white shadow-md transform -translate-y-[2px]' 
                    : 'bg-white text-brand-navy/60 hover:bg-brand-bg hover:text-brand-navy border-2 border-brand-surface shadow-sm'
                }`}
              >
                {sheetName}
              </button>
            ))}
          </div>
        </div>
      )}
      </div> {/* End of no-print browsing section */}

      {/* -------------------- FINÁLNÍ SOUHRN -------------------- */}
      {!isLoading && (
        <div id="print-summary" ref={summaryRef} className="mt-24 p-8 md:p-12 bg-white border-4 border-brand-surface/30 rounded-[2.5rem] shadow-2xl shadow-brand-navy/5">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-navy mb-8 border-b-4 border-brand-surface/20 pb-6 tracking-tight">
            Váš souhrn vybraných opatření
          </h2>
          {teacherEmail && (
            <div className="mb-10 p-6 bg-brand-bg/30 rounded-3xl border-2 border-brand-surface/30 grid grid-cols-1 md:grid-cols-2 gap-4">
              <p className="text-base sm:text-lg md:text-xl text-brand-navy/70 font-bold">
                Vypracoval/a: <span className="text-brand-navy border-b-2 border-brand-yellow pb-1 break-all">{teacherEmail}</span>
              </p>
              {role && (
                <p className="text-base sm:text-lg md:text-xl text-brand-navy/70 font-bold">
                  Role: <span className="text-brand-navy">{role}</span>
                </p>
              )}
              {schoolType && (
                <p className="text-base sm:text-lg md:text-xl text-brand-navy/70 font-bold">
                  Škola: <span className="text-brand-navy">{schoolType}</span>
                </p>
              )}
              {studentCount && (
                <p className="text-base sm:text-lg md:text-xl text-brand-navy/70 font-bold">
                  Počet žáků ve škole: <span className="text-brand-navy">{studentCount}</span>
                </p>
              )}
              {purpose && (
                <p className="text-base sm:text-lg md:text-xl text-brand-navy/70 font-bold">
                  Účel práce: <span className="text-brand-navy">{purpose}</span>
                </p>
              )}
            </div>
          )}
          
          {feedback && (
            <div className="mb-10 p-6 bg-brand-yellow/5 rounded-3xl border-2 border-brand-yellow/20">
              <h3 className="text-lg font-bold text-brand-navy mb-2 uppercase tracking-wider opacity-60 flex items-center gap-2">
                Poznámky a náměty:
              </h3>
              <p className="text-brand-navy whitespace-pre-wrap font-medium leading-relaxed italic">
                "{feedback}"
              </p>
            </div>
          )}
          
          {/* Grafické znázornění pomocí Bar chart */}
          <div className="mb-14 bg-brand-bg/50 p-6 rounded-3xl border border-brand-surface/30">
            <h3 className="text-xl font-bold text-brand-navy mb-6">Aktuální stav hodnocení</h3>
            <div className="flex justify-between text-sm md:text-base font-bold mb-3">
              <span className="text-brand-green flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-brand-green"></div> Použiju v PO1 ({pouzijuCount})</span>
              <span className="text-brand-orange flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-brand-orange"></div> Nutné doporučení ŠPZ ({spzCount})</span>
              <span className="text-brand-navy/40 font-bold">Zbývá ({missingCount})</span>
            </div>
            <div className="w-full h-6 rounded-full overflow-hidden flex bg-white shadow-inner border border-brand-surface/20">
              <div className="bg-brand-green transition-all duration-1000 ease-out h-full" style={{ width: `${pouzijuPct}%` }} />
              <div className="bg-brand-orange transition-all duration-1000 ease-out h-full" style={{ width: `${spzPct}%` }} />
            </div>
          </div>
          
          {/* Výpis opatření POUZIJU */}
          {pouzijuCount > 0 ? (
            <div className="mb-12">
              <h3 className="text-xl font-bold text-brand-green mb-8 flex items-center gap-3 border-b-2 border-brand-green/20 pb-4">
                <CheckCircle2 className="w-8 h-8 text-brand-green" />
                Opatření a kroky k zavedení (Použiju v PO1)
              </h3>
              <div className="space-y-10 max-h-[500px] overflow-y-auto pr-2 print:max-h-none print:overflow-visible">
                {Object.keys(groupedSheets).map(sheet => {
                  const sheetHasPouzi = Object.keys(groupedSheets[sheet]).some(oblast => 
                    Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                      groupedSheets[sheet][oblast][opatreni].some((m: Measure) => userChoices[m.id] === 'POUZIJU')
                    )
                  );
                  if (!sheetHasPouzi) return null;
                  
                  return (
                    <div key={sheet} className="bg-brand-green/5 rounded-3xl p-6 border border-brand-green/20">
                      <h4 className="text-lg font-black text-brand-green uppercase tracking-wider mb-6">
                        List: {sheet}
                      </h4>
                      <div className="space-y-6">
                        {Object.keys(groupedSheets[sheet]).map(oblast => {
                          const oblastHasPouzi = Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                            groupedSheets[sheet][oblast][opatreni].some((m: Measure) => userChoices[m.id] === 'POUZIJU')
                          );
                          if (!oblastHasPouzi) return null;
                          
                          return (
                            <div key={oblast} className="pl-2 md:pl-4 border-l-4 border-brand-green/30">
                              <h5 className="font-bold text-brand-navy/80 mb-3 text-lg flex items-center gap-2">
                                Oblast: {oblast}
                              </h5>
                              <ul className="space-y-3">
                                {Object.keys(groupedSheets[sheet][oblast]).map(opatreni => {
                                  const steps = groupedSheets[sheet][oblast][opatreni].filter((m: Measure) => userChoices[m.id] === 'POUZIJU');
                                  if (steps.length === 0) return null;
                                  return steps.map((m: Measure) => (
                                    <li key={m.id} className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex gap-3">
                                      <div className="w-2 h-2 rounded-full bg-brand-green mt-2 flex-shrink-0"></div>
                                      <div>
                                        {opatreni !== '-' && opatreni !== m.krok && (
                                          <div className="text-xs font-bold text-slate-400 mb-1">{opatreni}</div>
                                        )}
                                        <div className="font-bold text-brand-navy leading-snug">{m.krok}</div>
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
          ) : (
            <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl">
              <p className="text-slate-500 font-medium">Zatím jste nevybrali žádná opatření pro zařazení do Plánu pedagogické podpory.</p>
            </div>
          )}

          {/* Výpis opatření ŠPZ */}
          {spzCount > 0 && (
            <div className="mt-12 pt-10 border-t-4 border-brand-surface/10">
              <h3 className="text-xl font-bold text-brand-orange mb-8 flex items-center gap-3 border-b-2 border-brand-orange/20 pb-4">
                <HelpCircle className="w-8 h-8 text-brand-orange" />
                Kroky vyžadující nutné doporučení ŠPZ
              </h3>
              <div className="space-y-10 max-h-[500px] overflow-y-auto pr-2 print:max-h-none print:overflow-visible">
                {Object.keys(groupedSheets).map(sheet => {
                  const sheetHasSpz = Object.keys(groupedSheets[sheet]).some(oblast => 
                    Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                      groupedSheets[sheet][oblast][opatreni].some((m: Measure) => userChoices[m.id] === 'NECHAM_NA_SPZ')
                    )
                  );
                  if (!sheetHasSpz) return null;
                  
                  return (
                    <div key={sheet} className="bg-brand-orange/5 rounded-3xl p-6 border border-brand-orange/20">
                      <h4 className="text-lg font-black text-brand-orange uppercase tracking-wider mb-6">
                        List: {sheet}
                      </h4>
                      <div className="space-y-6">
                        {Object.keys(groupedSheets[sheet]).map(oblast => {
                          const oblastHasSpz = Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                            groupedSheets[sheet][oblast][opatreni].some((m: Measure) => userChoices[m.id] === 'NECHAM_NA_SPZ')
                          );
                          if (!oblastHasSpz) return null;
                          
                          return (
                            <div key={oblast} className="pl-2 md:pl-4 border-l-4 border-brand-orange/30">
                              <h5 className="font-bold text-brand-navy/80 mb-3 text-lg flex items-center gap-2">
                                Oblast: {oblast}
                              </h5>
                              <ul className="space-y-3">
                                {Object.keys(groupedSheets[sheet][oblast]).map(opatreni => {
                                  const steps = groupedSheets[sheet][oblast][opatreni].filter((m: Measure) => userChoices[m.id] === 'NECHAM_NA_SPZ');
                                  if (steps.length === 0) return null;
                                  return steps.map((m: Measure) => (
                                    <li key={m.id} className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex gap-3">
                                      <div className="w-2 h-2 rounded-full bg-brand-orange mt-2 flex-shrink-0"></div>
                                      <div>
                                        {opatreni !== '-' && opatreni !== m.krok && (
                                          <div className="text-xs font-bold text-slate-400 mb-1">{opatreni}</div>
                                        )}
                                        <div className="font-bold text-brand-navy leading-snug">{m.krok}</div>
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

          {/* Odesílací sekce (stahování PDF + Email) - Hidden on print */}
          <div id="pdf-controls" className="mt-14 p-10 bg-brand-surface/10 border-4 border-brand-surface/30 rounded-[2.5rem] shadow-inner no-print">
               <h3 className="text-brand-navy text-2xl font-black mb-4 uppercase tracking-tighter">Máte hotovo? 🎉</h3>
               <p className="text-brand-navy/70 text-lg font-bold mb-6 italic">
                 Opatření nyní můžete vyexportovat jako PDF dokument a rovnou ho zaslat k nahlédnutí.
               </p>
               {!isComplete && (
                 <div className="text-brand-orange font-black mb-8 flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border-2 border-brand-orange shadow-lg animate-bounce">
                   <div className="w-3 h-3 bg-brand-orange rounded-full animate-ping"></div>
                   Zbývá ohodnotit: {missingCount} {missingCount === 1 ? 'položku' : (missingCount > 1 && missingCount < 5) ? 'položky' : 'položek'}
                 </div>
               )}
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <div className="space-y-2">
                   <label className="text-sm font-black text-brand-navy/60 uppercase ml-2">Váš E-mail</label>
                   <input 
                     type="email" 
                     value={teacherEmail}
                     onChange={(e) => setTeacherEmail(e.target.value)}
                     placeholder="Váš e-mail (povinné)"
                     className="w-full px-6 py-4 rounded-2xl border-4 border-brand-surface/50 focus:border-brand-yellow focus:ring-8 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-bold"
                   />
                 </div>
                 
                 <div className="space-y-2">
                   <label className="text-sm font-black text-brand-navy/60 uppercase ml-2">Vaše Role</label>
                   <select 
                     value={role}
                     onChange={(e) => setRole(e.target.value)}
                     className="w-full px-6 py-4 rounded-2xl border-4 border-brand-surface/50 focus:border-brand-yellow focus:ring-8 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-bold appearance-none bg-white"
                   >
                     <option value="">Vyberte roli...</option>
                     <option value="Učitel">Učitel</option>
                     <option value="Poradenský pracovník">Poradenský pracovník (ŠPP)</option>
                     <option value="Koordinátor podpory nadání">Koordinátor podpory nadání</option>
                     <option value="Vedení školy">Vedení školy</option>
                     <option value="Asistent pedagoga">Asistent pedagoga</option>
                     <option value="Jiné">Jiné</option>
                   </select>
                 </div>

                 <div className="space-y-2">
                   <label className="text-sm font-black text-brand-navy/60 uppercase ml-2">Typ školy</label>
                   <select 
                     value={schoolType}
                     onChange={(e) => setSchoolType(e.target.value)}
                     className="w-full px-6 py-4 rounded-2xl border-4 border-brand-surface/50 focus:border-brand-yellow focus:ring-8 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-bold appearance-none bg-white"
                   >
                     <option value="">Vyberte typ školy...</option>
                     <option value="ZŠ">Základní škola (ZŠ)</option>
                     <option value="MŠ">Mateřská škola (MŠ)</option>
                     <option value="ZŠ a MŠ">ZŠ a MŠ (spojená)</option>
                     <option value="Jiné">Jiné</option>
                   </select>
                 </div>

                 <div className="space-y-2">
                   <label className="text-sm font-black text-brand-navy/60 uppercase ml-2">Počet žáků ve škole</label>
                   <input 
                     type="number" 
                     value={studentCount}
                     onChange={(e) => setStudentCount(e.target.value)}
                     placeholder="Např. 25"
                     className="w-full px-6 py-4 rounded-2xl border-4 border-brand-surface/50 focus:border-brand-yellow focus:ring-8 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-bold"
                   />
                 </div>

                 <div className="space-y-2">
                   <label className="text-sm font-black text-brand-navy/60 uppercase ml-2">Účel práce s katalogem</label>
                   <select 
                     value={purpose}
                     onChange={(e) => setPurpose(e.target.value)}
                     className="w-full px-6 py-4 rounded-2xl border-4 border-brand-surface/50 focus:border-brand-yellow focus:ring-8 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-bold appearance-none bg-white"
                   >
                     <option value="">Vyberte účel...</option>
                     <option value="Test pro AFREŠ">Test pro AFREŠ</option>
                     <option value="Pro potřeby školy">Pro potřeby školy</option>
                   </select>
                 </div>
               </div>

               <div className="space-y-2 mb-8">
                 <label className="text-sm font-black text-brand-navy/60 uppercase ml-2">Napište nám své postřehy, připomínky a náměty</label>
                 <p className="text-xs italic text-brand-navy/40 ml-2 -mt-1 mb-2">Vaše zpětná vazba nám pomůže vyladit fungující nástroj podpory nadání</p>
                 <textarea
                   value={feedback}
                   onChange={(e) => setFeedback(e.target.value)}
                   placeholder="Sem pište volně..."
                   rows={4}
                   className="w-full px-6 py-4 rounded-2xl border-4 border-brand-surface/50 focus:border-brand-yellow focus:ring-8 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-bold resize-none"
                 />
               </div>
               
               <div className="flex flex-col md:flex-row gap-6 items-center">
                 <button
                   onClick={handleGenerateAndSendPdf}
                   disabled={isGeneratingPdf || !teacherEmail || !role || !schoolType || !studentCount || !purpose || Object.keys(userChoices).length === 0}
                   className="w-full md:w-auto flex items-center justify-center gap-3 px-10 py-4 bg-brand-navy text-white rounded-2xl font-black text-lg transition-all hover:bg-brand-navy/90 hover:scale-[1.02] active:scale-[0.98] shadow-xl hover:shadow-brand-navy/20 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed uppercase tracking-wider"
                 >
                   {isGeneratingPdf ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileDown className="w-6 h-6" />}
                   {isGeneratingPdf ? 'Generuji...' : 'Uložit'}
                 </button>
               </div>
          </div>
        </div>
      )}
      <footer className="mt-32 pb-12 border-t border-brand-surface/30 pt-12 flex flex-col items-center gap-4 no-print">
        <Link 
          href="/podminky" 
          className="text-sm font-bold text-brand-navy/30 hover:text-brand-navy/60 transition-all flex items-center gap-2 group"
        >
          <ShieldCheck className="w-4 h-4" />
          Ochrana osobních údajů a podmínky použití
        </Link>
        <div className="flex items-center gap-3 opacity-30 grayscale hover:grayscale-0 transition-all group">
          <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer">
            <img src="/logo.png" alt="AFREŠ logo" className="h-5 w-auto object-contain" />
          </a>
          <p className="text-xs font-bold text-brand-navy uppercase tracking-widest">
            © {new Date().getFullYear()} AFREŠ
          </p>
        </div>
      </footer>
    </main>
    </PasswordGate>
  );
}
