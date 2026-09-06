'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { auth, googleProvider, db } from '@/lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  /** Administrátor appku ručně schválil pro tento e-mail (viz config/approved_users). */
  isApproved: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          // Admin oprávnění: vlastní dokument v config/admins/members/{email} ve
          // Firestore — každý si smí přečíst jen dokument se svým vlastním e-mailem
          // (viz firestore.rules), takže appka pozná "jsem admin?" bez toho, aby
          // běžný uživatel viděl seznam všech administrátorů.
          const myEmail = firebaseUser.email?.toLowerCase();
          if (myEmail) {
            // Souhrnná (anonymní) statistika pro administraci — jen že tenhle UID appku
            // navštívil, žádná osobní/dětská data. Best-effort, přihlášení tím neblokujeme.
            setDoc(
              doc(db, 'config', 'stats'),
              { visitedUserIds: arrayUnion(firebaseUser.uid) },
              { merge: true }
            ).catch((err) => console.error('Nepodařilo se zaevidovat návštěvu do statistik:', err));

            // Historie přihlášení pro administraci (sekce "Uživatelé a přístupy" →
            // "Historie přihlášení") — na výslovnou žádost administrátorky opět
            // živá, jeden záznam na každé přihlášení. Best-effort, nikdy neblokuje.
            addDoc(collection(db, 'login_logs'), {
              email: myEmail,
              timestamp: new Date().toISOString(),
            }).catch((err) => console.error('Nepodařilo se zaevidovat přihlášení do historie:', err));

            const adminSnap = await getDoc(doc(db, 'config', 'admins', 'members', myEmail));
            const admin = adminSnap.exists();
            setIsAdmin(admin);

            // Přístup ke katalogu (datům o dětech) schvaluje ručně administrátor —
            // stejný vzor jako admin oprávnění, jen v jiné kolekci. Administrátoři
            // mají přístup vždy, i bez vlastního schválení.
            const approvedSnap = await getDoc(doc(db, 'config', 'approved_users', 'members', myEmail));
            const approved = approvedSnap.exists();
            setIsApproved(approved);

            if (!admin && !approved) {
              // Zaevidovat/aktualizovat žádost o schválení, ať ji administrátor vidí
              // v seznamu čekajících — best-effort, přihlášení kvůli tomu neblokujeme.
              const pendingDocRef = doc(db, 'config', 'pending_users', 'members', myEmail);
              const pendingSnap = await getDoc(pendingDocRef);
              const uzZadal = pendingSnap.exists();

              setDoc(
                pendingDocRef,
                {
                  name: firebaseUser.displayName || null,
                  email: firebaseUser.email,
                  requestedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch((err) => console.error('Nepodařilo se zaevidovat žádost o schválení:', err));

              // Push upozornění administrátorce přes ntfy.sh — bez účtu/OAuth, jen
              // POST na "kanál" (topic). Posílá se jen při PRVNÍ žádosti daného
              // e-mailu, ne při každém dalším přihlášení, dokud čeká na schválení.
              if (!uzZadal) {
                fetch('https://ntfy.sh/katalog-afres-zadosti-c25fb60ab1', {
                  method: 'POST',
                  body:
                    'Nová žádost o přístup do Katalogu podpůrných opatření: ' +
                    (firebaseUser.displayName || '(bez jména)') +
                    ' <' + firebaseUser.email + '>',
                }).catch((err) => console.error('Nepodařilo se odeslat upozornění:', err));
              }
            }
          } else {
            setIsAdmin(false);
            setIsApproved(false);
          }
        } catch (err) {
          console.error('Nepodařilo se ověřit oprávnění:', err);
          setIsAdmin(false);
          setIsApproved(false);
        }
      } else {
        setIsAdmin(false);
        setIsApproved(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Jméno appka potřebuje hlavně pro to, aby ho administrátor viděl u žádosti
    // o schválení přístupu (u Google účtů se stejné jméno přebírá automaticky).
    if (name.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
  }, []);

  const signInGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isApproved, signInEmail, signUpEmail, signInGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth musí být použito uvnitř AuthProvider');
  return ctx;
}
