'use client';

import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react';

export type Choice = 'POUZIJU' | 'NECHAM_NA_SPZ' | null;

interface MeasureCardProps {
  id: string;
  title: string;
  description?: string;
  choice?: Choice;
  note?: string;
  onChoiceSelect: (id: string, choice: Choice) => void;
  onNoteChange?: (id: string, note: string) => void;
}

/** Najde index hledaného řetězce, ale jen mimo (ne uvnitř) závorek — aby se text nerozdělil uprostřed výčtu v závorce. */
function findSplitIndexOutsideParens(text: string, needle: string): number {
  let parenDepth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') parenDepth++;
    else if (text[i] === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (parenDepth === 0 && text.startsWith(needle, i)) return i;
  }
  return -1;
}

/**
 * Zvýrazní úvodní frázi kroku tučně jako mini-nadpis, aby se v dlouhém textu
 * lépe skenovalo, o čem krok je. Preferuje rozdělení na první pomlčce
 * (" - "), jinak na první čárce (jen pokud je úvodní část dost dlouhá na to,
 * aby dávala smysl jako samostatná fráze) — jinak nechá text beze změny.
 * Rozdělení hledá jen mimo závorky, aby neroztrhlo výčet uvnitř (např. "(např. jazyky, matematika)").
 */
function renderHighlightedTitle(title: string) {
  const dashIndex = findSplitIndexOutsideParens(title, ' - ');
  if (dashIndex > 0) {
    return (
      <>
        <span className="font-bold">{title.slice(0, dashIndex)}</span>
        {title.slice(dashIndex)}
      </>
    );
  }

  const commaIndex = findSplitIndexOutsideParens(title, ',');
  if (commaIndex >= 20 && commaIndex <= 70) {
    return (
      <>
        <span className="font-bold">{title.slice(0, commaIndex)}</span>
        {title.slice(commaIndex)}
      </>
    );
  }

  return title;
}

export function MeasureCard({ id, title, description, choice = null, note = '', onChoiceSelect, onNoteChange }: MeasureCardProps) {
  // Zvýraznění celého bloku pokud už je vyhodnoceno
  const isEvaluated = choice !== null;

  const handleSelect = (selectedChoice: Choice) => {
    // Toggle logika: pokud kliknu na to samé, zruším výběr
    const finalChoice = choice === selectedChoice ? null : selectedChoice;
    onChoiceSelect(id, finalChoice);
  };

  return (
    <div 
      className={`relative w-full overflow-hidden transition-all duration-300 rounded-2xl p-6 md:p-8
        ${isEvaluated 
            ? 'bg-white shadow-sm border border-slate-100 opacity-90' 
            : 'glass-card hover:-translate-y-1 hover:shadow-lg'
        }
      `}
    >
      {/* Vizuální indikátor stavu v pozadí */}
      {isEvaluated && (
        <div className="absolute top-0 left-0 w-1.5 h-full rounded-l-2xl transition-all duration-500"
             style={{
               backgroundColor: 
                 choice === 'POUZIJU' ? '#76B72A' : '#EE7618'
             }} 
        />
      )}

      <div className="flex flex-col gap-6">
        <div className="w-full">
          <h3 className="text-sm md:text-base font-semibold text-brand-navy mb-2 leading-snug">
            {renderHighlightedTitle(title)}
          </h3>
          {description && (
            <p className="text-slate-600 leading-relaxed text-sm md:text-base">
              {description}
            </p>
          )}
        </div>

        {/* Tlačítka (Choices) */}
        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <button
            onClick={() => handleSelect('POUZIJU')}
            className={`flex items-center justify-center gap-2 group px-4 py-3 rounded-xl font-bold transition-all duration-200 border-2
              ${choice === 'POUZIJU' 
                ? 'bg-brand-green/10 border-brand-green text-brand-green shadow-sm' 
                : 'bg-white border-transparent text-slate-500 hover:border-brand-green/30 hover:bg-brand-green/5 hover:text-brand-green shadow-sm'
              }`}
          >
            <CheckCircle2 className={`w-5 h-5 ${choice === 'POUZIJU' ? 'text-brand-green' : 'text-slate-400 group-hover:text-brand-green'}`} />
            <span>Použiju v PO1</span>
          </button>

          <button
            onClick={() => handleSelect('NECHAM_NA_SPZ')}
            className={`flex items-center justify-center gap-2 group px-4 py-3 rounded-xl font-bold transition-all duration-200 border-2
              ${choice === 'NECHAM_NA_SPZ' 
                ? 'bg-brand-orange/10 border-brand-orange text-brand-orange shadow-sm' 
                : 'bg-white border-transparent text-slate-500 hover:border-brand-orange/30 hover:bg-brand-orange/5 hover:text-brand-orange shadow-sm'
              }`}
          >
            <HelpCircle className={`w-5 h-5 ${choice === 'NECHAM_NA_SPZ' ? 'text-brand-orange' : 'text-slate-400 group-hover:text-brand-orange'}`} />
            <span>Předat ŠPZ</span>
          </button>
        </div>

        {/* Volitelná poznámka — má smysl až u vyhodnoceného kroku (odůvodnění, termín, odpovědná osoba).
            Promítne se i do souhrnu/PDF (viz sekce Souhrn v page.tsx), tenhle textarea se ale
            zobrazuje jen tady při procházení, ne v samotném finálním souhrnu. */}
        {isEvaluated && onNoteChange && (
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide ml-1">
              Poznámka (nepovinné) — odůvodnění, termín, odpovědná osoba…
            </label>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(id, e.target.value)}
              rows={2}
              placeholder="Např. zavedeno od září, zajišťuje asistentka pedagoga…"
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-yellow focus:ring-4 focus:ring-brand-yellow/10 outline-none transition-all placeholder:text-slate-300 text-sm text-brand-navy font-medium resize-y"
            />
          </div>
        )}
      </div>
    </div>
  );
}
