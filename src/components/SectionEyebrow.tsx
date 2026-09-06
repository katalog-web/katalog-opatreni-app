import React from 'react';

/**
 * Malý popisek velkými písmeny nad hlavním nadpisem sekce — vzor převzatý z afres.cz
 * (oranžový "eyebrow" label nad tmavě modrým nadpisem).
 */
export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs md:text-sm font-black uppercase tracking-widest text-brand-orange mb-2">
      {children}
    </p>
  );
}
