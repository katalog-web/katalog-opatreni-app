'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronDown,
  ClipboardCheck,
  LayoutGrid,
  HeartHandshake,
  MessageCircle,
  Users,
  LineChart,
  HandHelping,
  type LucideIcon,
} from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SectionEyebrow } from '@/components/SectionEyebrow';
import principlesData from '@/data/principles.json';

interface Principle {
  id: string;
  cisloKategorie: number;
  kategorie: string;
  ucel: string;
  zamereni: string;
  opatreni: string;
  krok: string;
}

// Pevná sada ikon pro 7 kategorií listu "Obecné principy kvalitní výuky" — na rozdíl
// od oblastí v hlavním katalogu je kategorií vždy přesně 7 a jejich pořadí je dané.
const CATEGORY_ICONS: Record<number, LucideIcon> = {
  1: ClipboardCheck,
  2: LayoutGrid,
  3: HeartHandshake,
  4: MessageCircle,
  5: Users,
  6: LineChart,
  7: HandHelping,
};

export default function PrincipyVyukyPage() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const categories = useMemo(() => {
    const byCategory = new Map<number, { nazev: string; ucel: string; zamereni: string; opatreni: Map<string, string[]> }>();

    (principlesData as Principle[]).forEach((p) => {
      if (!byCategory.has(p.cisloKategorie)) {
        byCategory.set(p.cisloKategorie, { nazev: p.kategorie, ucel: p.ucel, zamereni: p.zamereni, opatreni: new Map() });
      }
      const cat = byCategory.get(p.cisloKategorie)!;
      if (!cat.opatreni.has(p.opatreni)) cat.opatreni.set(p.opatreni, []);
      cat.opatreni.get(p.opatreni)!.push(p.krok);
    });

    return Array.from(byCategory.entries())
      .sort(([a], [b]) => a - b)
      .map(([cislo, data]) => ({ cislo, ...data }));
  }, []);

  const toggle = (cislo: number) => {
    setExpanded((prev) => ({ ...prev, [cislo]: !prev[cislo] }));
  };

  return (
    <AuthGate>
      <Header context="app" />
      <main className="max-w-4xl mx-auto px-4 py-8 md:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-brand-navy/50 hover:text-brand-navy font-semibold text-sm transition-all mb-10 group">
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Zpět do katalogu
        </Link>

        <div className="mb-12">
          <SectionEyebrow>AFREŠ</SectionEyebrow>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-brand-navy leading-tight mb-4">
            Principy výuky
          </h1>
          <p className="font-body text-lg text-brand-navy/80 leading-relaxed">
            Obecné pedagogické principy kvalitní výuky nadaných a mimořádně nadaných žáků —
            napříč sedmi oblastmi, nezávisle na konkrétním podpůrném opatření. Slouží jako
            referenční přehled, ne k vyplňování k jednotlivému dítěti.
          </p>
        </div>

        <div className="space-y-5">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.cislo] ?? ClipboardCheck;
            const isOpen = !!expanded[cat.cislo];
            return (
              <div key={cat.cislo} className="border border-brand-surface/40 rounded-2xl bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(cat.cislo)}
                  className="w-full flex items-start gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-5 h-5 text-brand-navy/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg md:text-xl font-bold text-brand-navy tracking-tight mb-2">
                      {cat.nazev}
                    </h2>
                    {(cat.ucel || cat.zamereni) && (
                      <div className="text-xs text-brand-navy/50 space-y-0.5 font-body">
                        {cat.ucel && <p><span className="font-semibold text-brand-navy/70">Účel:</span> {cat.ucel}</p>}
                        {cat.zamereni && <p><span className="font-semibold text-brand-navy/70">Zaměření:</span> {cat.zamereni}</p>}
                      </div>
                    )}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-brand-navy/40 flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pl-[4.5rem] space-y-6">
                    {Array.from(cat.opatreni.entries()).map(([opatreni, kroky]) => (
                      <div key={opatreni}>
                        <h3 className="font-semibold text-brand-navy text-sm mb-2 leading-snug">{opatreni}</h3>
                        <ul className="list-disc pl-5 space-y-1.5 text-brand-navy/70 text-sm font-body leading-relaxed marker:text-brand-surface">
                          {kroky.map((krok, i) => (
                            <li key={i}>{krok}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Footer />
      </main>
    </AuthGate>
  );
}
