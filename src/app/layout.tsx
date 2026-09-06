import type { Metadata } from 'next';
import { Inter, Open_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' });
const openSans = Open_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-open-sans' });

export const metadata: Metadata = {
  title: 'Katalog podpůrných opatření',
  description: 'Aplikace pro sběr zpětné vazby k podpůrným pedagogickým a provozním opatřením.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className="scroll-smooth">
      <body className={`${inter.variable} ${openSans.variable} font-sans bg-brand-bg text-brand-navy min-h-screen antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
