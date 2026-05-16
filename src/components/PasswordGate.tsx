'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Lock, LogIn, ShieldCheck, Heart, Eye, EyeOff, Mail } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface PasswordGateProps {
  children: React.ReactNode;
  /** Custom password required for this gate. Defaults to the main catalog password. */
  requiredPassword?: string;
  /** Storage key to track authentication state. Defaults to 'katalog_auth'. */
  authKey?: string;
  /** Optional callback fired when authorization succeeds. */
  onSuccess?: () => void;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({
  children, 
  requiredPassword = 'Podporanadaniprospejevsem1',
  authKey = 'katalog_auth',
  onSuccess
}) => {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const CORRECT_PASSWORD = requiredPassword;

  useEffect(() => {
    // Kontrola po načtení, zda již heslo nebylo zadáno
    const saved = localStorage.getItem(authKey);
    const savedEmail = localStorage.getItem('katalog_email') || 'Neznámý (staré přihlášení)';

    if (saved === 'true') {
      setIsAuthorized(true);
      if (onSuccess) onSuccess();
      
      // Tiché zalogování opětovného přístupu (jednou za session)
      const sessionKey = `session_logged_${authKey}`;
      if (!sessionStorage.getItem(sessionKey) && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        addDoc(collection(db, 'login_logs'), {
          email: savedEmail,
          timestamp: new Date().toISOString(),
          firestore_ts: serverTimestamp(),
          userAgent: navigator.userAgent,
          type: 'auto_login'
        }).catch(err => console.error('Silent log failed', err));
        
        sessionStorage.setItem(sessionKey, 'true');
      }
    } else {
      setIsAuthorized(false);
    }
  }, [authKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      alert('Zadejte prosím platný e-mail.');
      return;
    }

    if (password === CORRECT_PASSWORD) {
      setIsSubmitting(true);
      try {
        // Logování přihlášení do Firebase
        if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
          await addDoc(collection(db, 'login_logs'), {
            email: email.trim(),
            timestamp: new Date().toISOString(),
            firestore_ts: serverTimestamp(),
            userAgent: navigator.userAgent,
            type: 'manual_login'
          });
        }
        
        const sessionKey = `session_logged_${authKey}`;
        sessionStorage.setItem(sessionKey, 'true');
        localStorage.setItem(authKey, 'true');
        localStorage.setItem('katalog_email', email.trim());
        setIsAuthorized(true);
        if (onSuccess) onSuccess();
        setError(false);
      } catch (err) {
        console.error('Logout failed:', err);
        // I když selže logování, uživatele pustíme
        const sessionKey = `session_logged_${authKey}`;
        sessionStorage.setItem(sessionKey, 'true');
        localStorage.setItem(authKey, 'true');
        localStorage.setItem('katalog_email', email.trim());
        setIsAuthorized(true);
        if (onSuccess) onSuccess();
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setError(true);
      setPassword('');
      // Reset chyby po chvíli
      setTimeout(() => setError(false), 2000);
    }
  };

  if (isAuthorized === null) return null; // Počkejte na useEffect

  if (isAuthorized) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4 font-sans leading-relaxed">
      {/* Dekorativní pozadí */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand-surface/30 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-brand-yellow/20 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className={`bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-brand-surface/30 transition-all duration-500 ${error ? 'animate-shake' : ''}`}>
          <div className="flex flex-col items-center text-center">
            {/* Ikona */}
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-8 transition-colors duration-300 ${error ? 'bg-brand-orange/10 text-brand-orange' : 'bg-brand-navy/5 text-brand-navy'}`}>
              <Lock className={`w-10 h-10 ${error ? 'animate-bounce' : ''}`} />
            </div>

            {/* Logo AFREŠ & Nadpis */}
            <div className="flex items-center gap-4 mb-10 justify-center">
              <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src="/logo.png" alt="AFREŠ logo" className="h-8 w-auto object-contain" />
              </a>
              <h1 className="text-2xl font-black text-brand-navy tracking-tighter uppercase whitespace-nowrap">
                Vítejte v katalogu
              </h1>
            </div>
            <form onSubmit={handleSubmit} className="w-full space-y-5">
              <div className="relative group">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Váš e-mail..."
                  required
                  className="w-full pl-12 pr-6 py-4 bg-brand-bg border-4 border-brand-surface/50 rounded-2xl outline-none focus:border-brand-yellow focus:bg-white focus:ring-8 focus:ring-brand-yellow/10 transition-all text-brand-navy font-bold text-lg"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-navy/30 group-focus-within:text-brand-yellow transition-colors" />
              </div>

              <div className="relative group">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Heslo projektu..."
                  required
                  className={`w-full pl-6 pr-14 py-4 bg-brand-bg border-4 rounded-2xl outline-none transition-all text-center text-lg font-black tracking-widest ${
                    error 
                      ? 'border-brand-orange bg-brand-orange/5 text-brand-orange placeholder:text-brand-orange/40' 
                      : 'border-brand-surface/50 focus:border-brand-yellow focus:bg-white focus:ring-8 focus:ring-brand-yellow/10'
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
                <p className="text-brand-orange text-sm font-black animate-in fade-in slide-in-from-top-2 uppercase tracking-tighter">
                  Nesprávné heslo. Zkuste to znovu.
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-brand-navy text-white rounded-2xl font-black text-lg transition-all hover:bg-brand-navy/90 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] uppercase tracking-widest disabled:opacity-50"
              >
                {isSubmitting ? <span className="animate-spin text-xl">⏳</span> : <LogIn className="w-5 h-5" />}
                {isSubmitting ? 'Přihlašuji...' : 'Vstoupit do katalogu'}
              </button>
            </form>
            
            <div className="mt-8">
              <Link 
                href="/podminky" 
                className="text-xs font-bold text-brand-navy/30 hover:text-brand-yellow transition-all flex items-center justify-center gap-1.5 group"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Ochrana osobních údajů a podmínky použití
              </Link>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-slate-50 text-center flex items-center justify-center gap-6 text-slate-400">
             <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4" />
                Zabezpečeno
             </div>
             <div className="w-1 h-1 rounded-full bg-slate-200" />
             <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest">
                <Heart className="w-4 h-4 text-pink-400" />
                Pro radost
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
