'use client';

import Link from 'next/link';
import { BookOpen, FolderOpen, ChevronLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { FeedbackWidget } from '@/components/FeedbackWidget';

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

  const handleSignOut = () => {
    if (window.confirm('Opravdu se chcete odhlásit?')) {
      signOut();
    }
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
