'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Lock, LogIn, UserPlus, ShieldCheck, FileText, Eye, EyeOff, Mail, User as UserIcon, Hourglass } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { FirebaseError } from 'firebase/app';

interface AuthGateProps {
  children: React.ReactNode;
  /** Když true, přístup je navíc podmíněn admin oprávněním (custom claim). */
  requireAdmin?: boolean;
}

function friendlyAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Nesprávný e-mail nebo heslo.';
      case 'auth/email-already-in-use':
        return 'Účet s tímto e-mailem už existuje. Zkuste se přihlásit.';
      case 'auth/weak-password':
        return 'Heslo musí mít alespoň 6 znaků.';
      case 'auth/invalid-email':
        return 'Zadejte platný e-mail.';
      case 'auth/popup-closed-by-user':
        return 'Přihlašovací okno bylo zavřeno.';
      default:
        return 'Něco se nepovedlo. Zkuste to prosím znovu.';
    }
  }
  return 'Něco se nepovedlo. Zkuste to prosím znovu.';
}

export const AuthGate: React.FC<AuthGateProps> = ({ children, requireAdmin = false }) => {
  const { user, loading, isAdmin, isApproved, signInEmail, signUpEmail, signInGoogle, signOut } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInEmail(email.trim(), password);
      } else {
        await signUpEmail(email.trim(), password, name.trim());
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signInGoogle();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  if (user && requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4 font-sans">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 text-center max-w-md">
          <Lock className="w-10 h-10 text-brand-orange mx-auto mb-4" />
          <h1 className="text-xl font-bold text-brand-navy mb-2">Nemáte oprávnění</h1>
          <p className="text-brand-navy/60 font-medium mb-6">
            Tento účet ({user.email}) nemá administrátorský přístup.
          </p>
          <Link href="/" className="text-brand-navy/40 hover:text-brand-navy font-bold text-sm">
            &larr; Zpět na katalog
          </Link>
        </div>
      </div>
    );
  }

  // Přístup ke katalogu (datům o dětech) individuálně posuzuje AFREŠ — nahrazuje
  // dřív zvažovaný sdílený přístupový kód. Dokud schválení nepřijde, appku nevidí
  // (žádost se zaevidovala automaticky při přihlášení, viz auth-context.tsx).
  if (user && !isAdmin && !isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4 font-sans leading-relaxed">
        <div className="relative w-full max-w-md">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-brand-surface/30 text-center">
            <div className="w-20 h-20 rounded-3xl bg-brand-navy/5 flex items-center justify-center mx-auto mb-8">
              <Hourglass className="w-10 h-10 text-brand-navy" />
            </div>
            <h1 className="text-xl font-bold text-brand-navy mb-3">Čekáte na schválení přístupu</h1>
            <p className="text-brand-navy/60 font-medium mb-6">
              Katalog pracuje s citlivými údaji o dětech, a tak přístup ke každému účtu
              individuálně posuzuje AFREŠ — konkrétně na adresu <span className="font-bold text-brand-navy break-all">{user.email}</span>.
              Jakmile Vás schválíme, můžete se do aplikace přihlásit.
            </p>
            <p className="text-brand-navy/50 text-sm mb-8">
              Potřebujete to urychlit, nebo si nejste jistí, jestli žádost dorazila?
              Napište nám na{' '}
              <a href="mailto:katalog@afres.cz" className="font-semibold underline decoration-dotted hover:text-brand-navy">katalog@afres.cz</a>
              {' '}— další kontakty najdete na{' '}
              <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-dotted hover:text-brand-navy">afres.cz</a>.
            </p>
            <button
              onClick={() => { if (window.confirm('Opravdu se chcete odhlásit?')) signOut(); }}
              className="w-full px-6 py-3 text-brand-navy/40 hover:text-brand-navy text-sm font-semibold transition-colors"
            >
              Odhlásit se
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4 font-sans leading-relaxed">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand-surface/30 blur-[120px] opacity-40" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-brand-yellow/20 blur-[120px] opacity-40" />
      </div>

      <div className="relative w-full max-w-md">
        <div className={`bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-brand-surface/30 transition-all duration-500 ${error ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-center text-center">
            <img
              src="/illustrations/skica_obycejna_11_klicek_odemykani_nadani.png"
              alt=""
              className="h-20 md:h-24 w-auto mb-8 select-none"
            />

            <div className="flex flex-col items-center gap-3 mb-6">
              <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src="/logo.png" alt="AFREŠ logo" className="h-8 w-auto object-contain" />
              </a>
              <h1 className="text-2xl font-bold text-brand-navy tracking-tight whitespace-nowrap">
                Vítejte v katalogu
              </h1>
            </div>

            <p className="text-brand-navy/50 text-sm mb-6 -mt-2">
              Přístup ke katalogu individuálně posuzuje AFREŠ — po registraci nebo prvním
              přihlášení chvíli počkejte na schválení.
            </p>

            <div className="flex bg-brand-bg rounded-2xl p-1 mb-8 w-full">
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${mode === 'signin' ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-navy/40'}`}
              >
                Přihlásit se
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${mode === 'signup' ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-navy/40'}`}
              >
                Vytvořit účet
              </button>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-5">
              {mode === 'signup' && (
                <div className="relative group">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jméno a příjmení..."
                    required
                    className="w-full pl-12 pr-6 py-4 bg-brand-bg border border-brand-surface/50 rounded-2xl outline-none focus:border-brand-yellow focus:bg-white focus:ring-4 focus:ring-brand-yellow/10 transition-all text-brand-navy font-medium text-lg"
                  />
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-navy/30 group-focus-within:text-brand-yellow transition-colors" />
                </div>
              )}

              <div className="relative group">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Váš e-mail..."
                  required
                  className="w-full pl-12 pr-6 py-4 bg-brand-bg border border-brand-surface/50 rounded-2xl outline-none focus:border-brand-yellow focus:bg-white focus:ring-4 focus:ring-brand-yellow/10 transition-all text-brand-navy font-medium text-lg"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-navy/30 group-focus-within:text-brand-yellow transition-colors" />
              </div>

              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Heslo..."
                  required
                  // Delší minimum jen při registraci nového účtu — nesmí zablokovat
                  // přihlášení existujícím uživatelům, kteří si dřív nastavili kratší heslo.
                  minLength={mode === 'signup' ? 8 : undefined}
                  className={`w-full pl-6 pr-14 py-4 bg-brand-bg border rounded-2xl outline-none transition-all text-lg font-medium tracking-widest ${
                    error
                      ? 'border-brand-orange bg-brand-orange/5 text-brand-orange placeholder:text-brand-orange/40'
                      : 'border-brand-surface/50 focus:border-brand-yellow focus:bg-white focus:ring-4 focus:ring-brand-yellow/10'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-brand-navy/30 hover:text-brand-yellow transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {error && (
                <p className="text-brand-orange text-sm font-bold animate-in fade-in slide-in-from-top-2 text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-brand-green text-white rounded-xl font-semibold text-lg transition-all hover:bg-brand-green/90 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="animate-spin text-xl">⏳</span>
                ) : mode === 'signin' ? (
                  <LogIn className="w-5 h-5" />
                ) : (
                  <UserPlus className="w-5 h-5" />
                )}
                {isSubmitting ? 'Chvilku...' : mode === 'signin' ? 'Vstoupit do katalogu' : 'Vytvořit účet'}
              </button>
            </form>

            <div className="flex items-center gap-3 w-full my-6">
              <div className="flex-1 h-px bg-brand-surface/40" />
              <span className="text-xs font-bold text-brand-navy/30 uppercase">nebo</span>
              <div className="flex-1 h-px bg-brand-surface/40" />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border border-brand-surface/50 text-brand-navy rounded-2xl font-bold transition-all hover:border-brand-yellow hover:shadow-lg disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Přihlásit přes Google
            </button>

            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                href="/ochrana-osobnich-udaju"
                className="text-xs font-bold text-brand-navy/30 hover:text-brand-yellow transition-all flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Ochrana osobních údajů
              </Link>
              <Link
                href="/podminky-pouziti"
                className="text-xs font-bold text-brand-navy/30 hover:text-brand-yellow transition-all flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Podmínky použití
              </Link>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-50 text-center flex items-center justify-center gap-6 text-slate-400">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4" />
              Zabezpečeno
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
};
