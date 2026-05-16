'use client';

import Link from 'next/link';
import { ChevronLeft, ShieldCheck, UserCheck, Scale, Clock } from 'lucide-react';

export default function PodminkyPage() {
  return (
    <main className="min-h-screen bg-brand-bg py-12 md:py-24 px-4 font-sans leading-relaxed">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-brand-navy/60 hover:text-brand-navy font-bold transition-all mb-12 group">
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Zpět do katalogu
        </Link>

        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-16 border border-brand-surface/30">
          <div className="flex flex-col md:flex-row md:items-center gap-8 mb-12">
            <a href="https://afres.cz/" target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
              <img src="/logo.png" alt="AFREŠ logo" className="h-12 w-auto object-contain" />
            </a>
            <h1 className="text-3xl md:text-3xl font-extrabold tracking-tight text-brand-navy leading-tight">
              Ochrana osobních údajů <br className="hidden md:block" /> a podmínky použití
            </h1>
          </div>

          <div className="space-y-12">
            {/* 1. Osobní údaje */}
            <section>
              <h2 className="text-2xl font-black text-brand-navy mb-6 flex items-center gap-3">
                <div className="w-1.5 h-6 bg-brand-yellow rounded-full"></div>
                Informace o zpracování osobních údajů
              </h2>
              <div className="prose prose-slate max-w-none text-brand-navy/80 space-y-4 font-medium leading-relaxed">
                <p>
                  Vážíme si vaší důvěry a k ochraně vašich údajů přistupujeme zodpovědně. Níže naleznete informace o tom, jak nakládáme s vaším e-mailem a jaká pravidla platí pro používání našeho Katalogu.
                </p>
                
                <h3 className="text-xl font-bold text-brand-navy mt-10 mb-4 flex items-center gap-2">
                   <UserCheck className="w-6 h-6 text-brand-yellow" />
                   1. Proč sbíráme váš e-mail?
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
                   2. Právní základ a doba uložení
                </h3>
                <p>
                  E-mail zpracováváme na základě vašeho souhlasu (přihlášením do katalogu). Údaje budeme uchovávat po dobu nezbytnou k dokončení a distribuci všech navazujících částí Katalogu, nejdéle však do odvolání vašeho souhlasu.
                </p>
              </div>
            </section>

            {/* 2. Podmínky použití */}
            <section>
              <h2 className="text-2xl font-black text-brand-navy mb-6 flex items-center gap-3">
                <div className="w-1.5 h-6 bg-brand-yellow rounded-full"></div>
                Podmínky použití a autorská práva
              </h2>
              <div className="prose prose-slate max-w-none text-brand-navy/80 space-y-4 font-medium leading-relaxed">
                <p>
                  Při používání našich materiálů vás prosíme o dodržování následujících pravidel:
                </p>
                
                <div className="bg-brand-surface/20 p-8 rounded-2xl border-l-8 border-brand-yellow my-8 shadow-sm">
                   <h3 className="text-xl font-black text-brand-navy mb-3 flex items-center gap-2">
                      <Scale className="w-6 h-6 text-brand-navy/40" />
                      Výhradně vnitřní použití
                   </h3>
                   <p className="font-bold text-brand-navy leading-relaxed">
                      Katalog je určen výhradně pro vnitřní použití v rámci školy přihlášeného uživatele a nesmí být dále nijak šířen bez předchozího písemného souhlasu AFREŠ.
                   </p>
                </div>

                <p>
                  To znamená, že jej můžete volně využívat pro potřeby své školy a svých kolegů, ale jeho veřejné sdílení, nahrávání na jiné weby nebo komerční distribuce je bez našeho výslovného svolení zakázána.
                </p>
              </div>
            </section>

            {/* 3. Vaše práva */}
            <section className="bg-brand-navy/5 p-8 rounded-3xl border border-brand-navy/10">
              <h2 className="text-xl font-black text-brand-navy mb-4 uppercase tracking-widest text-sm opacity-50">
                Vaše práva
              </h2>
              <p className="text-brand-navy/80 font-bold italic leading-relaxed">
                Kdykoliv máte právo požádat o smazání svého e-mailu z naší databáze, opravu údajů nebo o informaci, jaké údaje o vás vedeme. V takovém případě nás stačí kontaktovat.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
