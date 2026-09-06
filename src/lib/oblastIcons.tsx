import {
  Users,
  User,
  DoorOpen,
  LayoutGrid,
  Rocket,
  CalendarClock,
  Monitor,
  Brain,
  Headphones,
  BookOpen,
  Languages,
  HeartHandshake,
  Network,
  Lightbulb,
  Target,
  Feather,
  Sparkles,
  Wand2,
  Zap,
  Smile,
  MessageCircle,
  Compass,
  Stethoscope,
  ClipboardCheck,
  Home,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

/**
 * Přiřadí oblasti tematickou ikonu podle klíčových slov v jejím názvu — pomáhá
 * rychle vizuálně rozeznat oblasti od sebe (vedle barvy, která se opakuje po 4).
 * Používá klíčová slova (ne přesné shody), takže funguje i pro budoucí drobné
 * úpravy názvů oblastí v datech. `Sparkles` je bezpečný fallback pro cokoliv nezachyceného.
 */
export function getOblastIcon(oblastName: string): LucideIcon {
  const name = oblastName.toLowerCase();

  if (name.includes('relaxac')) return Feather;
  if (name.includes('setkáv')) return Users;
  if (name.includes('individuáln')) return User;
  if (name.includes('odchod') || name.includes('příchod')) return DoorOpen;
  if (name.includes('uspořád') || name.includes('pracovní místo') || name.includes('organizace')) return LayoutGrid;
  if (name.includes('akcelerac')) return Rocket;
  if (name.includes('docház') || name.includes('alternativní')) return CalendarClock;
  if (name.includes('výpočetní') || name.includes('software') || name.includes('technika')) return Monitor;
  if (name.includes('kognitivní') || name.includes('hry')) return Brain;
  if (name.includes('audio')) return Headphones;
  if (name.includes('knih')) return BookOpen;
  if (name.includes('cizojazyč') || name.includes('dvojjazyč')) return Languages;
  if (name.includes('socio') || name.includes('emoč')) return HeartHandshake;
  if (name.includes('schema') || name.includes('mapa') || name.includes('myšlenkov')) return Network;
  if (name.includes('obohacov') || name.includes('znalost') || name.includes('dovednost')) return Lightbulb;
  if (name.includes('soustřed') || name.includes('zaměřen')) return Target;
  if (name.includes('metakognice')) return Compass;
  if (name.includes('modifikace') || name.includes('učebních postupů')) return Wand2;
  if (name.includes('aktivizač')) return Zap;
  if (name.includes('osv')) return Smile;
  if (name.includes('plánování') || name.includes('vizualizace')) return ListChecks;
  if (name.includes('komunikace')) return MessageCircle;
  if (name.includes('intervenc') || name.includes('terapi')) return Stethoscope;
  if (name.includes('hodnocení')) return ClipboardCheck;
  if (name.includes('domácí příprava')) return Home;

  return Sparkles;
}
