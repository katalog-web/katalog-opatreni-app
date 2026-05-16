'use client';

import { useState } from 'react';
import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react';

export type Choice = 'POUZIJU' | 'NECHAM_NA_SPZ' | null;

interface MeasureCardProps {
  id: string;
  title: string;
  description?: string;
  choice?: Choice;
  onChoiceSelect: (id: string, choice: Choice) => void;
}

export function MeasureCard({ id, title, description, choice = null, onChoiceSelect }: MeasureCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Zvýraznění celého bloku pokud už je vyhodnoceno
  const isEvaluated = choice !== null;

  const handleSelect = async (selectedChoice: Choice) => {
    setIsSubmitting(true);
    
    // Toggle logika: pokud kliknu na to samé, zruším výběr
    const finalChoice = choice === selectedChoice ? null : selectedChoice;
    
    try {
      await fetch('/api/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          measureId: id,
          title: title,
          choice: finalChoice
        }),
      });
      onChoiceSelect(id, finalChoice);
    } catch (error) {
      console.error('Došlo k chybě:', error);
      // Fallback
      onChoiceSelect(id, finalChoice);
    } finally {
      setIsSubmitting(false);
    }
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
            {title}
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
            disabled={isSubmitting}
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
            disabled={isSubmitting}
            className={`flex items-center justify-center gap-2 group px-4 py-3 rounded-xl font-bold transition-all duration-200 border-2
              ${choice === 'NECHAM_NA_SPZ' 
                ? 'bg-brand-orange/10 border-brand-orange text-brand-orange shadow-sm' 
                : 'bg-white border-transparent text-slate-500 hover:border-brand-orange/30 hover:bg-brand-orange/5 hover:text-brand-orange shadow-sm'
              }`}
          >
            <HelpCircle className={`w-5 h-5 ${choice === 'NECHAM_NA_SPZ' ? 'text-brand-orange' : 'text-slate-400 group-hover:text-brand-orange'}`} />
            <span>Nutné doporučení ŠPZ</span>
          </button>
        </div>
      </div>
    </div>
  );
}
