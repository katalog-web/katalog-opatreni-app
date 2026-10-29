'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, FolderOpen, ChevronLeft, ChevronDown, LayoutList, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { FeedbackWidget } from '@/components/FeedbackWidget';
import { CATALOG_SHEETS, splitSheetLabel } from '@/lib/catalogSheets';

interface HeaderProps {
  /**
   * 'app'   – hlavní katalog a jeho podstránky (Principy výuky, Moje dokumenty).
   *           Logo na `/` scrolluje nahoru, jinde odkazuje domů; navigace nabízí
   *           Principy výuky + Moje dokumenty.
   * 'admin' – administrace a její detail. Logo vždy odkazuje domů; navigace
   *           nabízí jen "Zpět na katalog" (bez Principy výuky/Moje dokumenty,
   *           to je obsah pro učitele, ne pro administraci).
   */
  context?: 'app' | 'admin';
  /** Na hlavní stránce katalogu klik na logo jen scrolluje nahoru, jinde vede na "/". */
  isHome?: boolean;
}

const navLinkClass =
  'flex items-center gap-1.5 text-brand-navy/50 hover:text-brand-navy transition-colors text-xs font-semibold uppercase tracking-wide';

export function Header({ context = 'app', isHome = false }: HeaderProps) {
  const { signOut } = useAuth();
  const [isCatalogMenuOpen, setIsCatalogMenuOpen] = useState(false);
  const catalogMenuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = () => {
    if (window.confirm('Opravdu se chcete odhlásit?')) {
      signOut();
    }
  };

  // Zavřít menu "Katalog" kliknutím mimo něj.
  useEffect(() => {
    if (!isCatalogMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (catalogMenuRef.current && !catalogMenuRef.current.contains(e.target as Node)) {
        setIsCatalogMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCatalogMenuOpen]);

  // Přejít na konkrétní list katalogu — funguje odkudkoliv v appce (viz
  // zpracování ?list= na hlavní stránce v src/app/page.tsx). Záměrně tvrdá
  // navigace (ne router.push): na stejné trase ("/" → "/") by Next.js
  // komponentu nepřekreslil od začátku, takže by se efekt čtoucí ?list=
  // vůbec nespustil, kdybyste menu použila, když už jste na hlavní stránce.
  const goToSheet = (sheetName: string) => {
    setIsCatalogMenuOpen(false);
    window.location.href = `/?list=${encodeURIComponent(sheetName)}`;
  };

  return (
    <>
    <header className="no-print print:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-brand-surface/30">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        {isHome ? (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex-shrink-0"
            title="Zpět nahoru"
          >
            <img src="/logo.png" alt="AFREŠ logo" className="h-8 w-auto object-contain" />
          </button>
        ) : (
          <Link href="/" className="flex-shrink-0">
            <img src="/logo.png" alt="AFREŠ logo" className="h-8 w-auto object-contain" />
          </Link>
        )}

        {/* Na malé obrazovce zůstanou jen ikony (s aria-label) — s celým textem se
            hlavička u 3+ odkazů nevejde na 375px šířky a přetéká mimo obrazovku. */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          {context === 'admin' ? (
            <Link href="/" className={navLinkClass} aria-label="Zpět na katalog">
              <ChevronLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">Zpět na katalog</span>
            </Link>
          ) : (
            <>
              <div className="relative" ref={catalogMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsCatalogMenuOpen((prev) => !prev)}
                  className={navLinkClass}
                  aria-label="Katalog"
                  aria-expanded={isCatalogMenuOpen}
                >
                  <LayoutList className="w-4 h-4 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Katalog</span>
                  <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${isCatalogMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isCatalogMenuOpen && (
                  <div className="absolute left-0 top-full mt-2 min-w-[260px] bg-white rounded-2xl shadow-xl border-2 border-brand-surface/30 py-2 z-40">
                    {CATALOG_SHEETS.map((sheetName) => {
                      const { num, label } = splitSheetLabel(sheetName);
                      return (
                        <button
                          key={sheetName}
                          type="button"
                          onClick={() => goToSheet(sheetName)}
                          className="w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm font-bold text-brand-navy/70 hover:bg-brand-bg hover:text-brand-navy transition-colors"
                        >
                          <span className="text-brand-navy/40 flex-shrink-0">{num}</span>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <Link href="/principy-vyuky" className={navLinkClass} aria-label="Principy výuky">
                <BookOpen className="w-4 h-4 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Principy výuky</span>
              </Link>
              <Link href="/moje-dokumenty" className={navLinkClass} aria-label="Moje dokumenty">
                <FolderOpen className="w-4 h-4 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Moje dokumenty</span>
              </Link>
            </>
          )}
          <button onClick={handleSignOut} className={navLinkClass} aria-label="Odhlásit se">
            <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Odhlásit se</span>
          </button>
        </div>
      </div>
    </header>
    <FeedbackWidget />
    </>
  );
}
