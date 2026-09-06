'use client';

import Link from 'next/link';
import { ChevronLeft, Scale } from 'lucide-react';
import { SectionEyebrow } from '@/components/SectionEyebrow';

export default function PodminkyPouzitiPage() {
  return (
    <main className="min-h-screen bg-brand-bg py-12 md:py-24 px-4 font-sans leading-relaxed">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-brand-navy/60 hover:text-brand-navy font-bold transition-all mb-12 group">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Zpět do katalogu
        </Link>

        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-16 border border-brand-surface/30">
          <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="inline-block mb-16">
            <img src="/logo.png" alt="AFREŠ logo" className="h-12 w-auto object-contain" />
          </a>

          <SectionEyebrow>Právní informace</SectionEyebrow>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-brand-navy leading-tight mb-8">
            Podmínky použití
          </h1>

          <div className="font-body prose prose-slate max-w-none text-brand-navy/80 space-y-4 font-medium leading-relaxed">
            <p>
              Katalog podpůrných opatření je autorským dílem AFREŠ (Asociace freelancerů ve školství).
              Při jeho používání vás prosíme o dodržování následujících pravidel:
            </p>

            <div className="bg-brand-surface/20 p-8 rounded-2xl border-l-8 border-brand-yellow my-8 shadow-sm">
               <h3 className="text-xl font-black text-brand-navy mb-3 flex items-center gap-2">
                  <Scale className="w-6 h-6 text-brand-navy/40" />
                  Autorské dílo AFREŠ
               </h3>
               <p className="font-bold text-brand-navy leading-relaxed">
                  Katalog ani žádná jeho část (texty opatření, kroky, principy výuky ani žádné jiné materiály)
                  nesmí být nikde dále šířeny ani kopírovány bez předchozího písemného souhlasu AFREŠ.
               </p>
            </div>

            <p>
              Katalog smíte používat výhradně k práci s podpůrnými opatřeními pro žáky — tedy pro
              vnitřní potřeby své školy či školského zařízení, případně pro vlastní vzdělávání.
              Jakékoliv jiné použití (např. veřejné sdílení, nahrávání na jiné weby, komerční
              distribuce nebo využití mimo rámec školy či školského zařízení) je nutné předem
              dohodnout přímo s AFREŠ — napište nám na{' '}
              <a href="mailto:katalog@afres.cz" className="text-brand-navy font-bold underline decoration-dotted hover:text-brand-navy/70">
                katalog@afres.cz
              </a>
              , další kontakty najdete na{' '}
              <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="text-brand-navy font-bold underline decoration-dotted hover:text-brand-navy/70">
                afres.cz
              </a>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
