'use client';

import Link from 'next/link';
import { ChevronLeft, ShieldAlert, UserCheck, Clock, ClipboardList } from 'lucide-react';
import { SectionEyebrow } from '@/components/SectionEyebrow';

export default function OchranaOsobnichUdajuPage() {
  return (
    <main className="min-h-screen bg-brand-bg py-12 md:py-24 px-4 font-sans leading-relaxed">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-brand-navy/60 hover:text-brand-navy font-bold transition-all mb-12 group">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Zpět do katalogu
        </Link>

        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-16 border border-brand-surface/30">
          <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="inline-block mb-16">
            <img src="/logo.png" alt="AFREŠ logo" className="h-12 w-auto object-contain" />
          </a>

          <SectionEyebrow>Právní informace</SectionEyebrow>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-brand-navy leading-tight mb-8">
            Ochrana osobních údajů
          </h1>

          <div className="font-body prose prose-slate max-w-none text-brand-navy/80 space-y-4 font-medium leading-relaxed">
            <div className="bg-brand-orange/10 p-8 rounded-2xl border-l-8 border-brand-orange my-2 mb-8 shadow-sm">
              <h3 className="text-xl font-black text-brand-navy mb-3 flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-brand-orange" />
                Pracujete s citlivými údaji
              </h3>
              <p className="font-bold text-brand-navy leading-relaxed">
                Do katalogu zadáváte údaje o konkrétním dítěti (věk, pohlaví, ročník) v souvislosti
                s podpůrnými opatřeními — jde o citlivé osobní údaje nezletilého. Katalog proto
                úmyslně nepracuje se jmény dětí vůbec — místo jména zadáváte jen číslo, které si
                dítěti sami přiřadíte. Které číslo patří kterému dítěti, si musíte pamatovat nebo
                evidovat mimo tuto aplikaci (např. v jinak chráněném dokumentu ve škole). Vygenerovaný
                dokument (PDF) tak může sloužit jako příloha k takovému chráněnému dokumentu, aniž by
                sám o sobě obsahoval jméno dítěte. Se zadanými údaji přesto zacházejte obezřetně a
                stažené dokumenty ukládejte a sdílejte jen v rámci nezbytného okruhu osob ve své
                škole či školském zařízení.
              </p>
            </div>

            <p>
              Vážíme si vaší důvěry a k ochraně vašich údajů přistupujeme zodpovědně. Níže naleznete informace o tom, jak nakládáme s vaším e-mailem a jaká pravidla platí pro používání našeho Katalogu.
            </p>

            <h3 className="text-xl font-bold text-brand-navy mt-10 mb-4 flex items-center gap-2">
               <ClipboardList className="w-6 h-6 text-brand-yellow" />
               1. Jaké údaje o dítěti a škole zpracováváme
            </h3>
            <p>
              V dotazníku ke konkrétnímu dítěti zadáváte: číslo dítěte (viz upozornění výše —
              nikdy jméno), věk, pohlaví, ročník, vaši roli, typ a velikost školy a účel práce
              s katalogem. U jednotlivých vybraných opatření navíc můžete (nepovinně) připsat
              vlastní poznámku — tam prosím sami nedávejte jméno dítěte ani jiné údaje, podle
              kterých by šlo dítě přímo identifikovat.
            </p>
            <p>
              Tyto údaje spolu s vygenerovaným PDF ukládáme do vašeho osobního účtu (sekce{' '}
              <span className="font-bold text-brand-navy">Moje dokumenty</span>) — vidíte a
              spravujete je jen vy, nikdo jiný (kromě administrátorů AFREŠ, kteří appku
              provozují). Uchováváme je tam, dokud je sami nesmažete — v Moje dokumenty má
              každý dokument vlastní tlačítko na trvalé smazání.
            </p>

            <h3 className="text-xl font-bold text-brand-navy mt-10 mb-4 flex items-center gap-2">
               <UserCheck className="w-6 h-6 text-brand-yellow" />
               2. Proč sbíráme váš e-mail?
            </h3>
            <p>
              Vaši e-mailovou adresu uchováváme výhradně pro účely následné komunikace týkající se vývoje Katalogu podpůrných opatření. Konkrétně ji využíváme k tomu, abychom:
            </p>
            <ul className="list-disc pl-6 space-y-2 marker:text-brand-yellow font-bold italic text-brand-navy">
              <li>Vás mohli informovat a znovu vám zaslat aktualizovaný odkaz, jakmile budeme mít hotovou další část katalogu nebo jeho rozšíření.</li>
            </ul>
            <p>
              Vaše data nepředáváme žádným třetím stranám a nebudeme vás obtěžovat nevyžádanými obchodními sděleními.
            </p>

            <h3 className="text-xl font-bold text-brand-navy mt-10 mb-4 flex items-center gap-2">
               <Clock className="w-6 h-6 text-brand-yellow" />
               3. Právní základ a doba uložení
            </h3>
            <p>
              E-mail zpracováváme na základě vašeho souhlasu (přihlášením do katalogu). Údaje budeme uchovávat po dobu nezbytnou k dokončení a distribuci všech navazujících částí Katalogu, nejdéle však do odvolání vašeho souhlasu.
            </p>
          </div>

          <section className="mt-10 bg-brand-navy/5 p-8 rounded-3xl border border-brand-navy/10">
            <h2 className="text-xl font-black text-brand-navy mb-4 uppercase tracking-widest text-sm opacity-50">
              Vaše práva
            </h2>
            <p className="text-brand-navy/80 font-bold italic leading-relaxed">
              Kdykoliv máte právo požádat o smazání svého e-mailu z naší databáze, opravu údajů nebo o informaci, jaké údaje o vás vedeme. V takovém případě nás stačí kontaktovat na{' '}
              <a href="mailto:katalog@afres.cz" className="not-italic underline decoration-dotted hover:text-brand-navy">katalog@afres.cz</a>, další kontakty najdete na{' '}
              <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="not-italic underline decoration-dotted hover:text-brand-navy">afres.cz</a>. Nebo nám dejte vědět rovnou přes tlačítko zpětné vazby, které najdete na každé stránce katalogu.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
