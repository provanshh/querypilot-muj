import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://querypilot.dev'),
  title: "QueryPilot — Don't Just Ask Your Database. Send a Crew.",
  description:
    'Gamified Multi-Agent AI Data Analyst Platform. Turn your database into an interactive 3D isometric city and dispatch autonomous AI agent crews to investigate schema anomalies, query patterns, and KPI metrics.',
  applicationName: 'QueryPilot',
  keywords: [
    'QueryPilot',
    'AI Data Analyst',
    'Database Visualization',
    'Isometric City',
    'Multi-Agent System',
    'SQL Copilot',
    'Database Schema Map',
  ],
  authors: [{ name: 'QueryPilot Team' }],
  icons: {
    icon: '/favicon.ico',
    apple: '/assets/buildings/residential.png',
  },
  openGraph: {
    title: "QueryPilot — Don't Just Ask Your Database. Send a Crew.",
    description:
      'Gamified Multi-Agent AI Data Analyst Platform. Interactive 3D isometric database schema visualization and autonomous investigation crews.',
    type: 'website',
    siteName: 'QueryPilot',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QueryPilot',
    description: "Don't Just Ask Your Database. Send a Crew.",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#090d16',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link
          rel="preload"
          href="/assets/sprites_red_water_new.webp"
          as="image"
          type="image/webp"
        />
        <link
          rel="preload"
          href="/assets/water.webp"
          as="image"
          type="image/webp"
        />
      </head>
      <body className="bg-[#090d16] text-[#e2e8f0] antialiased font-sans overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
