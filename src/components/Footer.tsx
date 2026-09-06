'use client';

import Link from 'next/link';
import { ShieldCheck, FileText } from 'lucide-react';

/** Sdílená patička s odkazy na právní stránky a autorským označením — na hlavním
 * katalogu a jeho podstránkách (dashboard, principy výuky). */
export function Footer() {
  return (
    <footer className="no-print print:hidden mt-32 pb-12 border-t border-brand-surface/30 pt-12 flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Link
          href="/ochrana-osobnich-udaju"
          className="text-sm font-bold text-brand-navy/30 hover:text-brand-navy/60 transition-all flex items-center gap-2"
        >
          <ShieldCheck className="w-4 h-4" />
          Ochrana osobních údajů
        </Link>
        <Link
          href="/podminky-pouziti"
          className="text-sm font-bold text-brand-navy/30 hover:text-brand-navy/60 transition-all flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Podmínky použití
        </Link>
      </div>
      <div className="flex items-center gap-3 opacity-30 grayscale hover:grayscale-0 transition-all group">
        <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer">
          <img src="/logo.png" alt="AFREŠ logo" className="h-5 w-auto object-contain" />
        </a>
        <p className="text-xs font-bold text-brand-navy uppercase tracking-widest">
          Vytvořeno AFREŠ © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
