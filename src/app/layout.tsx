import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
