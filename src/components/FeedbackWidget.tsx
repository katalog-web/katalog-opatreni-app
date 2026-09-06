'use client';

import { useState } from 'react';
import { MessageCircle, X, Send, CheckCircle2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

/**
 * Plovoucí widget vpravo dole — umožňuje uživateli kdykoliv nahlásit problém nebo
 * napsat libovolný komentář k aplikaci. Ukládá se do Firestore (kolekce `feedback`),
 * odkud je vidí administrátoři v sekci "Zpětná vazba od uživatelů" v /admin.
 * Reálné odeslání e-mailu není na free (Spark) plánu bez vlastního backendu možné —
 * proto jen uložení do databáze, ne odeslání zprávy.
 */
export function FeedbackWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      await addDoc(collection(db, 'feedback'), {
        message: message.trim(),
        email: user?.email || null,
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        createdAt: serverTimestamp(),
        resolved: false,
      });
      setIsSent(true);
      setMessage('');
      setTimeout(() => {
        setIsOpen(false);
        setIsSent(false);
      }, 2000);
    } catch (err) {
      console.error('Nepodařilo se odeslat zpětnou vazbu:', err);
      setError('Nepodařilo se odeslat. Zkuste to prosím znovu.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="no-print print:hidden fixed bottom-5 right-5 z-40">
      {isOpen && (
        <div className="mb-3 w-80 max-w-[calc(100vw-2.5rem)] bg-white rounded-2xl shadow-2xl border border-brand-surface/40 p-5">
          {isSent ? (
            <div className="flex flex-col items-center text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-brand-green mb-3" />
              <p className="font-semibold text-brand-navy">Díky za zprávu!</p>
              <p className="text-sm text-brand-navy/50 mt-1">Podíváme se na to co nejdřív.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-brand-navy text-sm">Nahlásit problém / napsat komentář</h3>
                <button onClick={() => setIsOpen(false)} className="text-brand-navy/30 hover:text-brand-navy transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Popište, co se stalo, nebo napište jakýkoliv komentář k aplikaci..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-brand-surface/50 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-brand-navy/30 text-brand-navy text-sm font-medium resize-none mb-3"
              />
              {error && <p className="text-brand-orange text-xs font-semibold mb-3">{error}</p>}
              <button
                onClick={handleSubmit}
                disabled={isSending || !message.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-green text-white rounded-xl font-semibold text-sm transition-all hover:bg-brand-green/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                {isSending ? 'Odesílám...' : 'Odeslat'}
              </button>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setIsOpen((v) => !v)}
        title="Nahlásit problém nebo napsat komentář"
        className="w-14 h-14 rounded-full bg-brand-navy text-white shadow-xl flex items-center justify-center hover:bg-brand-navy/90 hover:scale-105 transition-all"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
}
