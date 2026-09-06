'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/AuthGate';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SectionEyebrow } from '@/components/SectionEyebrow';
import { MeasureCard, Choice } from '@/components/MeasureCard';
import { ChevronDown, CheckCircle2, HelpCircle, FileDown, Loader2, User, Search, X, BookOpen } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { buildSummaryPdfFromElement, base64ByteSize } from '@/lib/generateSummaryPdf';
import { getOblastIcon } from '@/lib/oblastIcons';
import measuresData from '@/data/measures.json';

interface Measure {
  id: string;
  sheetName: string;
  oblast: string;
  opatreni: string;
  krok: string;
}

// Firestore limituje dokument na 1 MB; base64 přidává ~33 % režie navrch.
const MAX_PDF_BASE64_BYTES = 900_000;

// Rozdělí název listu ("I.2 Modifikace metod...") na číslo ("I.2") a popisek,
// ať se v záložkách dají zobrazit na dvou oddělených, zarovnaných řádcích.
function splitSheetLabel(sheetName: string): { num: string; label: string } {
  const match = sheetName.match(/^(I\.\d+)\s*(.*)$/);
  if (!match) return { num: '', label: sheetName };
  return { num: match[1], label: match[2] };
}

// Skloňování počtu let/měsíců v češtině (1 rok/měsíc, 2–4 roky/měsíce, 0 a 5+ let/měsíců).
function pluralCzech(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

// Poskládá věk dítěte z let a měsíců do čitelného tvaru, např. "7 let a 5 měsíců".
function formatChildAge(yearsStr: string, monthsStr: string): string {
  const years = parseInt(yearsStr, 10);
  const months = parseInt(monthsStr, 10);
  const parts: string[] = [];
  if (!isNaN(years) && years > 0) parts.push(`${years} ${pluralCzech(years, 'rok', 'roky', 'let')}`);
  if (!isNaN(months) && months > 0) parts.push(`${months} ${pluralCzech(months, 'měsíc', 'měsíce', 'měsíců')}`);
  return parts.join(' a ');
}

// ---------- Vyhledávání se zjednodušeným "stemmingem" pro češtinu ----------
// Skutečné české skloňování (vč. hláskových změn typu c/č, h/z) by vyžadovalo
// plnohodnotný stemmer/slovník. Tohle je záměrně jednoduchý přístup — ořízne
// koncovku slova o pár znaků a porovná zbylé "kmeny" jako předpony — ale postačí
// na běžné případy jako "relaxace" ↔ "relaxaci" ↔ "relaxační".
function czechStem(word: string): string {
  if (word.length <= 4) return word;
  const trim = Math.min(3, word.length - 4);
  return word.slice(0, word.length - trim);
}

function stemsOverlap(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

// True, pokud KAŽDÉ slovo z hledaného dotazu má shodu (kmenem, nebo přímo jako
// podřetězec) mezi slovy v textu — podporuje víceslovné dotazy i skloněné tvary.
function textMatchesQuery(text: string, queryWords: string[]): boolean {
  if (queryWords.length === 0) return true;
  const lowerText = text.toLowerCase();
  const textWords = lowerText.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const textStems = textWords.map(czechStem);
  return queryWords.every((qw) => {
    if (lowerText.includes(qw)) return true;
    const qStem = czechStem(qw);
    return textStems.some((ts) => stemsOverlap(ts, qStem));
  });
}

export default function Home() {
  const { user } = useAuth();
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const [expandedMeasures, setExpandedMeasures] = useState<Record<string, boolean>>({});
  const [userChoices, setUserChoices] = useState<Record<string, Choice>>({});
  // Volitelná poznámka k jednotlivým vybraným opatřením (odůvodnění, termín, odpovědná osoba) —
  // POUZIJU/NECHAM_NA_SPZ je jinak čistě binární volba bez prostoru na kontext pro ŠPP/ŠPZ.
  const [userNotes, setUserNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>('');
  
  // PDF state
  const summaryRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState('');
  // Katalog úmyslně nepracuje se jmény dětí — jen s číslem, které si uživatel
  // sám přiřadí a musí si pamatovat (viz Ochrana osobních údajů).
  const [childNumber, setChildNumber] = useState('');
  const [childAgeYears, setChildAgeYears] = useState('');
  const [childAgeMonths, setChildAgeMonths] = useState('');
  const [childGender, setChildGender] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [childNeeds, setChildNeeds] = useState('');
  const [role, setRole] = useState('');
  const [schoolType, setSchoolType] = useState('');
  const [studentCount, setStudentCount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isDotaznikMissing, setIsDotaznikMissing] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  // Vyhledávání v aktuálním listu
  const [searchQuery, setSearchQuery] = useState('');

  // Hover menu (rychlý přechod na oblast) pro záložky listů
  const [hoveredSheet, setHoveredSheet] = useState<string | null>(null);
  const [pendingScrollOblast, setPendingScrollOblast] = useState<string | null>(null);

  const handleGenerateAndSendPdf = async () => {
    if (!user || !summaryRef.current) return;

    // Dotazník je povinná součást — bez něj nejde PDF vygenerovat. Místo tichého
    // nereagování tlačítka uživatele odscrollujeme zpět k nevyplněnému dotazníku.
    if (!childNumber || !role || !schoolType || !studentCount || !purpose) {
      setIsDotaznikMissing(true);
      document.getElementById('dotaznik')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setIsDotaznikMissing(false);

    setIsGeneratingPdf(true);
    setSaveError(null);

    // Počty se počítají přímo z dat (ne ze snímku PDF) — jsou potřeba pro Firestore metadata.
    const pouzijuC = measures.filter(m => userChoices[m.id] === 'POUZIJU').length;
    const spzC = measures.filter(m => userChoices[m.id] === 'NECHAM_NA_SPZ').length;

    // 1) Vygenerovat PDF (snímek vykresleného souhrnu) — pokud selže tohle, nemá smysl pokračovat.
    let pdfDoc;
    try {
      pdfDoc = await buildSummaryPdfFromElement(summaryRef.current);
    } catch (err) {
      console.error('Nepodařilo se vygenerovat PDF:', err);
      setSaveError('Nepodařilo se vygenerovat PDF. Zkuste to prosím znovu.');
      setIsGeneratingPdf(false);
      return;
    }

    // 2) Uložit do Firestore pro dashboard — pokud tohle selže, uživatel má i tak dostat PDF ke stažení.
    try {
      const dataUri = pdfDoc.output('datauristring');
      const pdfBase64 = dataUri.split(',').pop() || '';

      if (base64ByteSize(pdfBase64) > MAX_PDF_BASE64_BYTES) {
        setSaveError('Souhrn je bohužel příliš velký na uložení do dashboardu. PDF si prosím stáhněte a uložte ručně.');
      } else {
        const docRef = doc(collection(db, 'users', user.uid, 'documents'));
        const title = childNumber
          ? `Dítě č. ${childNumber} - ${new Date().toLocaleDateString('cs-CZ')}`
          : `Souhrn ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ')}`;
        const childAge = formatChildAge(childAgeYears, childAgeMonths);
        const searchText = [title, childNumber, childAge, childGender, childGrade, childNeeds, teacherEmail, role, schoolType, studentCount, purpose]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        await setDoc(docRef, {
          title,
          createdAt: serverTimestamp(),
          folderId: null,
          pdfBase64,
          childNumber,
          childAge,
          childGender,
          childGrade,
          childNeeds,
          role,
          schoolType,
          studentCount,
          purpose,
          pouzijuCount: pouzijuC,
          spzCount: spzC,
          choices: userChoices,
          notes: userNotes,
          searchText,
        });
      }
    } catch (err) {
      console.error('Nepodařilo se uložit dokument do dashboardu:', err);
      setSaveError('Nepodařilo se uložit dokument do „Moje dokumenty". PDF si ale můžete stáhnout níže.');
    }

    // 3) Stažení proběhne vždy, bez ohledu na výsledek uložení do dashboardu.
    const safeChildNumber = childNumber.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_');
    const filename = safeChildNumber
      ? `dite-c-${safeChildNumber}-${new Date().toISOString().slice(0, 10)}.pdf`
      : `katalog-souhrn-${new Date().toISOString().slice(0, 10)}.pdf`;
    pdfDoc.save(filename);
    setIsGeneratingPdf(false);
  };

  // Oblast je ve výchozím stavu rozbalená (dokud ji uživatel sám nesbalí) — proto
  // "výchozí true, dokud není explicitně false" stejně jako u opatření níže.
  const toggleArea = (areaName: string) => {
    setExpandedAreas(prev => {
      const isCurrentlyExpanded = prev[areaName] !== false;
      return {
        ...prev,
        [areaName]: !isCurrentlyExpanded
      };
    });
  };

  // Podskupina opatření je naopak ve výchozím stavu SBALENÁ (dokud ji uživatel
  // sám nerozbalí) — takže výchozí zobrazení je: oblast rozbalená, ale jednotlivá
  // opatření v ní čekají na rozkliknutí. Proto "výchozí false, dokud není explicitně true".
  const toggleOpatreni = (opatreniKey: string) => {
    setExpandedMeasures(prev => {
      const isCurrentlyExpanded = prev[opatreniKey] === true;
      return {
        ...prev,
        [opatreniKey]: !isCurrentlyExpanded
      };
    });
  };

  useEffect(() => {
    // Pro statický export načítáme data přímo z importovaného JSONu
    const filtered = measuresData as Measure[];

    setMeasures(filtered);

    // Načíst rozpracovaná data
    try {
      const savedChoices = localStorage.getItem('katalog_user_choices');
      if (savedChoices) setUserChoices(JSON.parse(savedChoices));
      const savedNotes = localStorage.getItem('katalog_user_notes');
      if (savedNotes) setUserNotes(JSON.parse(savedNotes));
      const savedChildNumber = localStorage.getItem('katalog_child_number');
      if (savedChildNumber) setChildNumber(savedChildNumber);
      const savedChildAgeYears = localStorage.getItem('katalog_child_age_years');
      if (savedChildAgeYears) setChildAgeYears(savedChildAgeYears);
      const savedChildAgeMonths = localStorage.getItem('katalog_child_age_months');
      if (savedChildAgeMonths) setChildAgeMonths(savedChildAgeMonths);
      const savedChildGender = localStorage.getItem('katalog_child_gender');
      if (savedChildGender) setChildGender(savedChildGender);
      const savedChildGrade = localStorage.getItem('katalog_child_grade');
      if (savedChildGrade) setChildGrade(savedChildGrade);
      const savedChildNeeds = localStorage.getItem('katalog_child_needs');
      if (savedChildNeeds) setChildNeeds(savedChildNeeds);
      const savedRole = localStorage.getItem('katalog_role');
      if (savedRole) setRole(savedRole);
      const savedSchoolType = localStorage.getItem('katalog_school_type');
      if (savedSchoolType) setSchoolType(savedSchoolType);
      const savedStudentCount = localStorage.getItem('katalog_student_count');
      if (savedStudentCount) setStudentCount(savedStudentCount);
      const savedPurpose = localStorage.getItem('katalog_purpose');
      if (savedPurpose) setPurpose(savedPurpose);
      const savedGuideOpen = localStorage.getItem('katalog_guide_open');
      if (savedGuideOpen !== null) setIsGuideOpen(savedGuideOpen === 'true');
    } catch(e) {
      console.warn('Nepodařilo se obnovit předchozí stav:', e);
    }

    // Nastavit první tab jako aktivní
    const sheetNames = Array.from(new Set(filtered.map(m => m.sheetName)));
    if (sheetNames.length > 0) setActiveTab(sheetNames[0]);
    
    setIsLoading(false);
  }, []);

  // Předvyplnit e-mail z přihlášeného účtu
  useEffect(() => {
    if (user?.email) setTeacherEmail(user.email);
  }, [user]);

  // Jakmile uživatel dotazník skutečně doplní, zrušit upozornění na jeho nevyplnění.
  useEffect(() => {
    if (isDotaznikMissing && childNumber && role && schoolType && studentCount && purpose) {
      setIsDotaznikMissing(false);
    }
  }, [isDotaznikMissing, childNumber, role, schoolType, studentCount, purpose]);

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
    // Zrušení volby (toggle na null) smaže i případnou poznámku — jinak by "osiřela"
    // u kroku, který už není vybraný, a nikde by se nezobrazila.
    if (choice === null) {
      setUserNotes(prev => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleNoteChange = (id: string, note: string) => {
    setUserNotes(prev => ({ ...prev, [id]: note }));
  };

  // Ukládání rozepsaného stavu po každé změně
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('katalog_user_choices', JSON.stringify(userChoices));
      localStorage.setItem('katalog_user_notes', JSON.stringify(userNotes));
      localStorage.setItem('katalog_child_number', childNumber);
      localStorage.setItem('katalog_child_age_years', childAgeYears);
      localStorage.setItem('katalog_child_age_months', childAgeMonths);
      localStorage.setItem('katalog_child_gender', childGender);
      localStorage.setItem('katalog_child_grade', childGrade);
      localStorage.setItem('katalog_child_needs', childNeeds);
      localStorage.setItem('katalog_role', role);
      localStorage.setItem('katalog_school_type', schoolType);
      localStorage.setItem('katalog_student_count', studentCount);
      localStorage.setItem('katalog_purpose', purpose);
      localStorage.setItem('katalog_guide_open', String(isGuideOpen));
    }
  }, [userChoices, userNotes, childNumber, childAgeYears, childAgeMonths, childGender, childGrade, childNeeds, role, schoolType, studentCount, purpose, isGuideOpen, isLoading]);

  const handleReset = () => {
    if (window.confirm('Opravdu chcete zcela vymazat Váš aktuální postup a začít znovu s čistým listem?')) {
      setUserChoices({});
      setUserNotes({});
      setChildNumber('');
      setChildAgeYears('');
      setChildAgeMonths('');
      setChildGender('');
      setChildGrade('');
      setChildNeeds('');
      setRole('');
      setSchoolType('');
      setStudentCount('');
      setPurpose('');
      const sheets = Object.keys(groupedSheets);
      if (sheets.length > 0) setActiveTab(sheets[0]);
    }
  };

  // Výpočty pro souhrn (Memoized)
  const { pouzijuCount, spzCount } = useMemo(() => {
    const pouziju = measures.filter(m => userChoices[m.id] === 'POUZIJU').length;
    const spz = measures.filter(m => userChoices[m.id] === 'NECHAM_NA_SPZ').length;

    return {
      pouzijuCount: pouziju,
      spzCount: spz,
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

  // Vyhledávání — filtruje aktuálně zobrazený list podle klíčového slova (hledá
  // v názvu oblasti, opatření i konkrétního kroku), se zjednodušeným stemmingem
  // pro češtinu (viz textMatchesQuery výše), ať "relaxace" najde i "relaxaci"/"relaxační".
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const queryWords = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);

  const measureMatches = (m: Measure) =>
    textMatchesQuery(m.oblast, queryWords) || textMatchesQuery(m.opatreni, queryWords) || textMatchesQuery(m.krok, queryWords);

  const filteredActiveSheet = useMemo(() => {
    const sheetData = groupedSheets[activeTab];
    if (!sheetData) return null;
    if (!normalizedQuery) return sheetData;

    const result: Record<string, Record<string, Measure[]>> = {};
    for (const oblast of Object.keys(sheetData)) {
      const oblastMatches = textMatchesQuery(oblast, queryWords);
      const filteredOpatreni: Record<string, Measure[]> = {};
      for (const opatreni of Object.keys(sheetData[oblast])) {
        const opatreniMatches = oblastMatches || textMatchesQuery(opatreni, queryWords);
        const steps = sheetData[oblast][opatreni].filter(
          (m: Measure) => opatreniMatches || textMatchesQuery(m.krok, queryWords)
        );
        if (steps.length > 0) filteredOpatreni[opatreni] = steps;
      }
      if (Object.keys(filteredOpatreni).length > 0) result[oblast] = filteredOpatreni;
    }
    return result;
  }, [groupedSheets, activeTab, normalizedQuery, queryWords]);

  // Hledání se dřív omezovalo jen na právě otevřený list — pokud stejné slovo
  // existuje i v jiných listech, uživatel se to jinak vůbec nedozvěděl. Spočítat
  // počet shod v KAŽDÉM listu (napříč celým datasetem), ať je vidí a může na ně
  // jedním klikem přeskočit, i když zrovna prochází jiný list.
  const otherSheetMatches = useMemo(() => {
    if (!normalizedQuery) return [];
    const counts: Record<string, number> = {};
    for (const m of measures) {
      if (measureMatches(m)) counts[m.sheetName] = (counts[m.sheetName] || 0) + 1;
    }
    return Object.keys(counts)
      .filter((sheet) => sheet !== activeTab)
      .map((sheet) => ({ sheet, count: counts[sheet] }));
  }, [measures, normalizedQuery, activeTab, queryWords]);

  // Po kliknutí na oblast v hover menu odscrollovat na ni, jakmile se list přepne/vykreslí.
  useEffect(() => {
    if (!pendingScrollOblast) return;
    const el = document.getElementById(`oblast-${pendingScrollOblast.replace(/\s+/g, '-')}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setPendingScrollOblast(null);
  }, [pendingScrollOblast, activeTab, filteredActiveSheet]);

  return (
    <AuthGate>
      {/* Pevná horní lišta s logem — mimo <main>, aby nezasahovala do @media print pravidel níže */}
      <Header context="app" isHome />

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
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-brand-navy leading-tight mb-2">
            Katalog podpůrných opatření
          </h1>
          <p className="text-lg sm:text-xl font-semibold text-brand-navy/50 mb-8">
            Nadaní a mimořádně nadaní žáci
          </p>
          <p className="text-brand-orange/80 text-sm font-medium mb-3">
            Nacházíte se v PILOTNÍ verzi katalogu, která slouží především pro testování.
          </p>
          <p className="font-body text-lg text-brand-navy/80 leading-relaxed mb-6">
            Vyplňte dotazník ke konkrétnímu dítěti a projděte si podpůrná opatření. U každého
            máte možnost se rozhodnout, zda ho zvládne zavést sama škola (Použiju v PO1), nebo
            je potřeba doporučení školského poradenského zařízení (ŠPZ). Výsledný dokument tak
            může sloužit pro potřeby ŠPP při tvorbě PLPP nebo jako podklad pro IVP.
          </p>

          {/* -------------------- NÁVOD, JAK S KATALOGEM PRACOVAT -------------------- */}
          <div className="border border-brand-surface/40 rounded-2xl bg-brand-bg/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsGuideOpen(v => !v)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
              aria-expanded={isGuideOpen}
            >
              <span className="flex items-center gap-2.5 text-sm font-bold text-brand-navy">
                <BookOpen className="w-4 h-4 text-brand-navy/50" />
                Jak s katalogem pracovat?
              </span>
              <ChevronDown className={`w-4 h-4 text-brand-navy/40 transition-transform ${isGuideOpen ? 'rotate-180' : ''}`} />
            </button>
            {isGuideOpen && (
              <ol className="px-5 pb-5 space-y-3 text-sm text-brand-navy/70 font-body leading-relaxed list-decimal list-inside">
                <li>
                  <strong className="text-brand-navy font-semibold">Vyplňte dotazník</strong> níže ke konkrétnímu dítěti — katalog nepracuje se jmény, jen s číslem, které dítěti sami přiřadíte (a musíte si pamatovat, které číslo komu patří), dále věk, pohlaví, ročník, vaše role a typ školy. Dotazník je povinnou součástí — bez jeho vyplnění nejde PDF vygenerovat.
                </li>
                <li>
                  <strong className="text-brand-navy font-semibold">Procházejte oblasti</strong> podpůrných opatření podle listů dole, nebo si oblast najděte rovnou přes vyhledávání. Listy „I.1"–„I.6" odpovídají oblastem podpory podle vyhlášky 27/2016 Sb. — pokud hledáte spíš obecné pedagogické zásady práce s nadaným žákem (ne konkrétní opatření k jednomu dítěti), použijte samostatnou stránku{' '}
                  <Link href="/principy-vyuky" className="text-brand-navy font-semibold underline decoration-dotted hover:text-brand-navy/70">
                    Principy výuky
                  </Link>.
                </li>
                <li>
                  U každého kroku si zvolte vhodná opatření pro dítě — a to ve dvou rovinách: rozhodněte, co <strong className="text-brand-green font-semibold">zvládnete sami ve škole</strong> (Použiju v PO1), a co už je nutné nechat na <strong className="text-brand-orange font-semibold">doporučení ŠPZ</strong>.
                </li>
                <li>
                  Na konci stránky najdete <strong className="text-brand-navy font-semibold">souhrn</strong> — stáhněte a uložte si ho jako PDF mezi své vygenerované dokumenty. Najdete ho pak v sekci{' '}
                  <Link href="/moje-dokumenty" className="text-brand-navy font-semibold underline decoration-dotted hover:text-brand-navy/70">
                    Moje dokumenty
                  </Link>.
                </li>
              </ol>
            )}
          </div>

          {Object.keys(userChoices).length > 0 && (
            <button
              onClick={handleReset}
              className="inline-block text-xs font-bold text-brand-orange hover:text-red-600 transition-colors underline decoration-dotted mt-4"
            >
              Vymazat rozpracovaný list
            </button>
          )}
        </div>

        {/* -------------------- DOTAZNÍK (nahoře, ke konkrétnímu dítěti) -------------------- */}
        <div id="dotaznik" className={`mb-14 p-8 md:p-10 bg-white border rounded-2xl shadow-sm transition-colors ${isDotaznikMissing ? 'border-brand-orange ring-4 ring-brand-orange/10' : 'border-brand-surface/40'}`}>
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="min-w-0">
              <SectionEyebrow>Dotazník</SectionEyebrow>
              <h2 className="text-2xl font-bold text-brand-navy tracking-tight">O koho se jedná?</h2>
            </div>
            <img
              src="/illustrations/skica_obycejna_12_skupina_deti_mysleni.png"
              alt=""
              className="hidden sm:block w-20 md:w-28 flex-shrink-0 select-none pointer-events-none"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Číslo dítěte</label>
              <input
                type="text"
                value={childNumber}
                onChange={(e) => setChildNumber(e.target.value)}
                placeholder="Např. 12 — číslo, které jste dítěti sami přiřadili"
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-medium"
              />
              <p className="text-xs text-brand-navy/40 ml-1">
                Katalog úmyslně nepracuje se jmény dětí. Zadejte jen číslo — musíte si sami
                (mimo appku) pamatovat nebo poznamenat, které číslo patří kterému dítěti.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Věk dítěte</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={0}
                    value={childAgeYears}
                    onChange={(e) => setChildAgeYears(e.target.value)}
                    placeholder="Roky"
                    className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-medium"
                  />
                </div>
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={0}
                    max={11}
                    value={childAgeMonths}
                    onChange={(e) => setChildAgeMonths(e.target.value)}
                    placeholder="Měsíce"
                    className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Pohlaví</label>
              <select
                value={childGender}
                onChange={(e) => setChildGender(e.target.value)}
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium appearance-none bg-white"
              >
                <option value="">Vyberte pohlaví...</option>
                <option value="Chlapec">Chlapec</option>
                <option value="Dívka">Dívka</option>
                <option value="Jiné">Jiné</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Ročník, který dítě navštěvuje</label>
              <input
                type="text"
                value={childGrade}
                onChange={(e) => setChildGrade(e.target.value)}
                placeholder="Např. 3. třída"
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Vaše role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium appearance-none bg-white"
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

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Typ školy</label>
              <select
                value={schoolType}
                onChange={(e) => setSchoolType(e.target.value)}
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium appearance-none bg-white"
              >
                <option value="">Vyberte typ školy...</option>
                <option value="ZŠ">Základní škola (ZŠ)</option>
                <option value="MŠ">Mateřská škola (MŠ)</option>
                <option value="ZŠ a MŠ">ZŠ a MŠ (spojená)</option>
                <option value="Jiné">Jiné</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Počet žáků ve škole</label>
              <input
                type="number"
                value={studentCount}
                onChange={(e) => setStudentCount(e.target.value)}
                placeholder="Např. 25"
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Účel práce s katalogem</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all text-brand-navy font-medium appearance-none bg-white"
              >
                <option value="">Vyberte účel...</option>
                <option value="Nastavuji opatření pro dítě">Nastavuji opatření pro dítě</option>
                <option value="Seznámení s katalogem">Seznámení s katalogem</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-brand-navy/50 uppercase tracking-wide ml-1">Projevy a potřeby dítěte</label>
              <textarea
                value={childNeeds}
                onChange={(e) => setChildNeeds(e.target.value)}
                rows={4}
                placeholder="Zde napište, jak se dítě projevuje a jaké má potřeby."
                className="w-full px-5 py-3.5 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy font-medium resize-y"
              />
            </div>
          </div>
        </div>

      {/* -------------------- ZÁLOŽKY (TABS) PRO LISTY -------------------- */}
      {!isLoading && Object.keys(groupedSheets).length > 1 && (
        <div className="relative mb-6">
          {/* Náznak, že lišta na malé obrazovce jde posunout vodorovně (na sm+ se
              schová, tam se všech 6 listů vejde vedle sebe rovnoměrně). */}
          <div className="sm:hidden absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-brand-bg to-transparent z-10 pointer-events-none" />
          <div className="sm:hidden absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-brand-bg to-transparent z-10 pointer-events-none" />
          <div className="flex gap-1 p-1.5 rounded-2xl bg-brand-navy shadow-lg overflow-x-auto sm:overflow-visible">
            {/* Pozn.: BEZ overflow-hidden na tomto obalu — jinak by ořízl hover menu
                (viz níže), které musí přesahovat pod lištu. Aktivní záložka je vlastní
                zaoblený "chip" uvnitř odsazeného pruhu, ne hranatý blok přes celou buňku.
                Na mobilu (< sm) se lišta místo mačkání všech 6 listů na sebe raději
                posouvá vodorovně (flex-shrink-0 + min-width); od sm výše se rovnoměrně
                roztáhne přes celou šířku (flex-1). */}
            {Object.keys(groupedSheets).map(sheetName => {
              const { num, label } = splitSheetLabel(sheetName);
              return (
              <div
                key={sheetName}
                className="relative flex-shrink-0 min-w-[88px] sm:flex-1 sm:min-w-0"
                onMouseEnter={() => setHoveredSheet(sheetName)}
                onMouseLeave={() => setHoveredSheet(prev => (prev === sheetName ? null : prev))}
              >
                <button
                  onClick={() => setActiveTab(sheetName)}
                  className={`w-full px-3 py-3.5 rounded-xl transition-colors flex flex-col items-center gap-1 ${
                    activeTab === sheetName
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  <span className="text-sm sm:text-base font-bold tracking-tight leading-none">{num}</span>
                  <span className="text-[11px] sm:text-xs font-semibold leading-tight text-center">{label}</span>
                </button>

              {/* Hover menu — rychlý přechod na konkrétní oblast bez nutnosti listovat.
                  Pozn.: obal má "pt-2" (padding, počítá se do jeho vlastní plochy),
                  ne "mt-2" (margin, prázdná mezera MIMO element) — díky tomu je celá
                  cesta od tlačítka k nabídce pořád uvnitř tohoto potomka, takže myš
                  po cestě dolů "nevypadne" na prvek pod ním (např. vyhledávací pole)
                  a nezpůsobí předčasný onMouseLeave dřív, než myš na nabídku doputuje. */}
              {hoveredSheet === sheetName && (
                <div className="absolute left-0 top-full pt-2 z-20 min-w-[280px]">
                  <div className="bg-white rounded-2xl shadow-xl border-2 border-brand-surface/30 py-2 max-h-80 overflow-y-auto">
                    {Object.keys(groupedSheets[sheetName]).map(oblast => {
                      const OblastIcon = getOblastIcon(oblast);
                      return (
                        <button
                          key={oblast}
                          onClick={() => {
                            setActiveTab(sheetName);
                            setExpandedAreas(prev => ({ ...prev, [oblast]: true }));
                            setPendingScrollOblast(oblast);
                            setHoveredSheet(null);
                          }}
                          className="w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm font-bold text-brand-navy/70 hover:bg-brand-bg hover:text-brand-navy transition-colors"
                        >
                          <OblastIcon className="w-4 h-4 flex-shrink-0 opacity-60" />
                          <span>{oblast}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Vyhledávání v aktuálním listu */}
      {!isLoading && activeTab && (
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-navy/30" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Hledat klíčové slovo v listu „${activeTab}“...`}
            className="w-full pl-12 pr-12 py-3 bg-white border border-brand-surface/50 rounded-xl outline-none focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 transition-all text-brand-navy font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-navy/30 hover:text-brand-navy transition-colors"
              title="Vymazat hledání"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* Hledání se dřív omezovalo jen na tento list — teď na shody v ostatních
          listech alespoň upozorní a nabídne rovnou přepnutí. */}
      {!isLoading && normalizedQuery && otherSheetMatches.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2 -mt-4">
          <span className="text-xs font-semibold text-brand-navy/40 uppercase tracking-wide">
            Nalezeno i v dalších listech:
          </span>
          {otherSheetMatches.map(({ sheet, count }) => (
            <button
              key={sheet}
              onClick={() => setActiveTab(sheet)}
              className="text-xs font-bold text-brand-navy bg-brand-yellow/15 hover:bg-brand-yellow/25 px-3 py-1.5 rounded-full transition-colors"
            >
              {sheet} ({count})
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
          activeTab && filteredActiveSheet && (
            <div key={activeTab} className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-bold text-brand-navy border-b border-brand-surface/30 pb-4">
                {activeTab}
              </h2>

              {normalizedQuery && Object.keys(filteredActiveSheet).length === 0 && (
                <div className="text-center p-8 border border-dashed border-brand-surface/50 rounded-xl">
                  <img
                    src="/illustrations/skica_obycejna_08_lupa_identifikace.png"
                    alt=""
                    className="w-32 mx-auto mb-4 select-none pointer-events-none opacity-90"
                  />
                  <p className="text-brand-navy/50 font-medium">Žádné opatření neodpovídá hledanému slovu „{searchQuery}&quot;.</p>
                </div>
              )}

              {Object.keys(filteredActiveSheet).map((oblast, idx) => {
                const colors = [
                  { border: 'border-brand-navy', text: 'text-brand-navy', hoverBg: 'hover:bg-brand-navy/10', ring: 'focus:ring-brand-navy/30' },
                  { border: 'border-brand-yellow', text: 'text-brand-yellow', hoverBg: 'hover:bg-brand-yellow/10', ring: 'focus:ring-brand-yellow/30' },
                  { border: 'border-brand-orange', text: 'text-brand-orange', hoverBg: 'hover:bg-brand-orange/10', ring: 'focus:ring-brand-orange/30' },
                  { border: 'border-brand-green', text: 'text-brand-green', hoverBg: 'hover:bg-brand-green/10', ring: 'focus:ring-brand-green/30' },
                ];
                const theme = colors[idx % colors.length];
                const isAreaExpanded = normalizedQuery ? true : expandedAreas[oblast] !== false;
                const OblastIcon = getOblastIcon(oblast);

                return (
                <div id={`oblast-${oblast.replace(/\s+/g, '-')}`} key={oblast} className={`pl-0 md:pl-6 border-l-0 md:border-l-4 ${theme.border}`}>
                  <button
                    onClick={() => toggleArea(oblast)}
                    className={`flex justify-between items-center w-full text-left group mb-4 ${theme.hoverBg} p-3 md:-ml-3 rounded-xl transition-colors focus:outline-none focus:ring-2 ${theme.ring}`}
                  >
                    <h3 className="flex items-center gap-3 text-xl sm:text-2xl font-bold text-brand-navy/90 group-hover:text-brand-navy transition-colors pr-2 break-words">
                      <OblastIcon className={`w-6 h-6 flex-shrink-0 ${theme.text}`} />
                      {oblast}
                    </h3>
                    <ChevronDown className={`w-6 h-6 flex-shrink-0 ${theme.text} opacity-80 group-hover:opacity-100 transition-all duration-300 ${isAreaExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isAreaExpanded && (
                    <div className="pt-4 border-t border-brand-surface/30">
                      {Object.keys(filteredActiveSheet[oblast]).map(opatreni => {
                        const opatreniKey = `${activeTab}-${oblast}-${opatreni}`;
                        const isOpatreniExpanded = normalizedQuery ? true : expandedMeasures[opatreniKey] === true;

                        return (
                          <div key={opatreni} className="mt-2 mb-10">
                            <button
                              onClick={() => toggleOpatreni(opatreniKey)}
                              className="flex justify-between items-center w-full text-left bg-brand-bg/80 hover:bg-brand-bg rounded-xl p-4 mb-4 border border-brand-surface/30 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/30 print:bg-transparent print:border-none print:p-0 print:mb-2"
                            >
                              <h4 className="text-lg md:text-xl font-bold text-brand-navy/80 leading-snug pr-4">
                                {opatreni}
                              </h4>
                              <ChevronDown
                                className={`w-5 h-5 text-brand-navy/50 transition-transform duration-300 no-print ${
                                  isOpatreniExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </button>

                            <div className={`flex flex-col gap-4 pl-0 md:pl-6 ${isOpatreniExpanded ? 'block' : 'hidden'}`}>
                              {filteredActiveSheet[oblast][opatreni].map((krok: Measure) => (
                                <MeasureCard
                                  key={krok.id}
                                  id={krok.id}
                                  title={krok.krok}
                                  choice={userChoices[krok.id] || null}
                                  note={userNotes[krok.id] || ''}
                                  onChoiceSelect={handleChoiceSelect}
                                  onNoteChange={handleNoteChange}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {/* Tlačítko pro sbalení celé oblasti na konci */}
                      {!normalizedQuery && (
                        <div className="flex justify-center mt-6 pt-4 border-t border-brand-surface/30 no-print">
                          <button
                            onClick={() => {
                              toggleArea(oblast);
                              const el = document.getElementById(`oblast-${oblast.replace(/\s+/g, '-')}`);
                              if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-dashed ${theme.border} ${theme.text} ${theme.hoverBg} transition-all duration-200 text-sm font-bold focus:outline-none focus:ring-2 ${theme.ring}`}
                          >
                            <ChevronDown className="w-4 h-4 rotate-180" />
                            <span>Sbalit celou oblast</span>
                          </button>
                        </div>
                      )}
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
        <div className="flex flex-wrap items-center gap-4 mt-8 mb-4 border-t border-brand-surface/30 pt-6 no-print">
          <span className="text-xs font-semibold text-brand-navy/40 uppercase tracking-wide">Přejít na list:</span>
          {Object.keys(groupedSheets).map(sheetName => (
            <button
              key={sheetName + '-bottom'}
              onClick={() => {
                setActiveTab(sheetName);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`text-sm font-semibold transition-colors ${
                activeTab === sheetName
                  ? 'text-brand-navy underline underline-offset-4'
                  : 'text-brand-navy/40 hover:text-brand-navy'
              }`}
            >
              {sheetName}
            </button>
          ))}
        </div>
      )}
      </div> {/* End of no-print browsing section */}

      {/* -------------------- FINÁLNÍ SOUHRN -------------------- */}
      {!isLoading && (
        <div id="print-summary" ref={summaryRef} className="mt-24 p-8 md:p-12 bg-white border border-brand-surface/30 rounded-2xl shadow-sm">
          <SectionEyebrow>Souhrn</SectionEyebrow>
          <h2 className="text-2xl sm:text-3xl font-bold text-brand-navy mb-8 border-b border-brand-surface/20 pb-6 tracking-tight">
            Váš souhrn vybraných opatření
          </h2>
          {(childNumber || childAgeYears || childGender || childGrade || childNeeds || role || schoolType || studentCount || purpose) && (
            <div className="mb-10 p-6 bg-brand-bg/50 rounded-xl border border-brand-surface/30 grid grid-cols-1 md:grid-cols-2 gap-4">
              {childNumber && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium md:col-span-2">
                  Dítě č.: <span className="text-brand-navy font-bold border-b-2 border-brand-yellow pb-1">{childNumber}</span>
                </p>
              )}
              {formatChildAge(childAgeYears, childAgeMonths) && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium">
                  Věk: <span className="text-brand-navy font-bold">{formatChildAge(childAgeYears, childAgeMonths)}</span>
                </p>
              )}
              {childGender && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium">
                  Pohlaví: <span className="text-brand-navy font-bold">{childGender}</span>
                </p>
              )}
              {childGrade && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium">
                  Ročník: <span className="text-brand-navy font-bold">{childGrade}</span>
                </p>
              )}
              {role && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium">
                  Role: <span className="text-brand-navy font-bold">{role}</span>
                </p>
              )}
              {schoolType && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium">
                  Škola: <span className="text-brand-navy font-bold">{schoolType}</span>
                </p>
              )}
              {studentCount && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium">
                  Počet žáků ve škole: <span className="text-brand-navy font-bold">{studentCount}</span>
                </p>
              )}
              {purpose && (
                <p className="text-base sm:text-lg text-brand-navy/60 font-medium">
                  Účel práce: <span className="text-brand-navy font-bold">{purpose}</span>
                </p>
              )}
              {childNeeds && (
                <div className="text-base sm:text-lg text-brand-navy/60 font-medium md:col-span-2">
                  Projevy a potřeby dítěte:
                  <p className="text-brand-navy font-bold mt-1 whitespace-pre-wrap">{childNeeds}</p>
                </div>
              )}
            </div>
          )}

          {/* Výpis opatření POUZIJU */}
          {pouzijuCount > 0 ? (
            <div className="mb-12">
              <h3 className="text-xl font-bold text-brand-green mb-8 flex items-center gap-3 border-b-2 border-brand-green/20 pb-4">
                <CheckCircle2 className="w-8 h-8 text-brand-green" />
                Opatření a kroky k zavedení (Použiju v PO1)
              </h3>
              <div className="space-y-10">
                {Object.keys(groupedSheets).map(sheet => {
                  const sheetHasPouzi = Object.keys(groupedSheets[sheet]).some(oblast => 
                    Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                      groupedSheets[sheet][oblast][opatreni].some((m: Measure) => userChoices[m.id] === 'POUZIJU')
                    )
                  );
                  if (!sheetHasPouzi) return null;
                  
                  return (
                    <div key={sheet} className="bg-brand-green/5 rounded-xl p-6 border border-brand-green/20">
                      <h4 className="text-xs font-semibold text-brand-green/80 uppercase tracking-wide mb-5">
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
                                        {userNotes[m.id] && (
                                          <div className="text-sm text-brand-navy/60 italic mt-1.5 pt-1.5 border-t border-slate-100">
                                            Poznámka: {userNotes[m.id]}
                                          </div>
                                        )}
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
            <div className="text-center p-8 border border-dashed border-brand-surface/50 rounded-xl">
              <p className="text-brand-navy/50 font-medium">Zatím jste nevybrali žádná opatření pro zařazení do Plánu pedagogické podpory.</p>
            </div>
          )}

          {/* Výpis opatření ŠPZ */}
          {spzCount > 0 && (
            <div className="mt-12 pt-10 border-t-4 border-brand-surface/10">
              <h3 className="text-xl font-bold text-brand-orange mb-8 flex items-center gap-3 border-b-2 border-brand-orange/20 pb-4">
                <HelpCircle className="w-8 h-8 text-brand-orange" />
                Kroky vyžadující nutné doporučení ŠPZ
              </h3>
              <div className="space-y-10">
                {Object.keys(groupedSheets).map(sheet => {
                  const sheetHasSpz = Object.keys(groupedSheets[sheet]).some(oblast => 
                    Object.keys(groupedSheets[sheet][oblast]).some(opatreni => 
                      groupedSheets[sheet][oblast][opatreni].some((m: Measure) => userChoices[m.id] === 'NECHAM_NA_SPZ')
                    )
                  );
                  if (!sheetHasSpz) return null;
                  
                  return (
                    <div key={sheet} className="bg-brand-orange/5 rounded-xl p-6 border border-brand-orange/20">
                      <h4 className="text-xs font-semibold text-brand-orange/80 uppercase tracking-wide mb-5">
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
                                        {userNotes[m.id] && (
                                          <div className="text-sm text-brand-navy/60 italic mt-1.5 pt-1.5 border-t border-slate-100">
                                            Poznámka: {userNotes[m.id]}
                                          </div>
                                        )}
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
          <div id="pdf-controls" className="mt-14 p-8 md:p-10 bg-brand-bg/60 border border-brand-surface/30 rounded-2xl no-print">
               <h3 className="text-brand-navy text-xl font-bold mb-3">Máte hotovo?</h3>
               <p className="text-brand-navy/60 mb-6">
                 Opatření nyní můžete vyexportovat jako PDF dokument a rovnou ho zaslat k nahlédnutí.
               </p>
               {isDotaznikMissing && (
                 <p className="mb-4 text-brand-orange font-semibold text-sm bg-brand-orange/10 px-4 py-2.5 rounded-lg border border-brand-orange/30">
                   Nejdřív prosím vyplňte dotazník nahoře ↑ — bez něj nejde PDF vygenerovat.
                 </p>
               )}
               {!isDotaznikMissing && Object.keys(userChoices).length === 0 && (
                 <p className="mb-4 text-brand-orange font-semibold text-sm bg-brand-orange/10 px-4 py-2.5 rounded-lg border border-brand-orange/30">
                   Zatím jste nevybrali žádné opatření — projděte prosím oblasti výše a u aspoň jednoho kroku zvolte „Použiju v PO1" nebo „Nutné doporučení ŠPZ".
                 </p>
               )}
               <div className="flex flex-col md:flex-row gap-6 items-center mt-2">
                 <button
                   onClick={handleGenerateAndSendPdf}
                   disabled={isGeneratingPdf || !teacherEmail || Object.keys(userChoices).length === 0}
                   className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-3.5 bg-brand-green text-white rounded-xl font-semibold transition-all hover:bg-brand-green/90 shadow-sm hover:shadow-md disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
                 >
                   {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
                   {isGeneratingPdf ? 'Generuji...' : 'Uložit a stáhnout PDF'}
                 </button>
                 {!isGeneratingPdf && !saveError && (
                   <Link href="/moje-dokumenty" className="text-sm font-semibold text-brand-navy/40 hover:text-brand-navy underline decoration-dotted">
                     Zobrazit uložené dokumenty →
                   </Link>
                 )}
               </div>
               {saveError && (
                 <p className="mt-4 text-brand-orange font-semibold text-sm bg-white px-4 py-2.5 rounded-lg border border-brand-orange/30">
                   {saveError}
                 </p>
               )}
          </div>
        </div>
      )}
      <Footer />
    </main>
    </AuthGate>
  );
}
