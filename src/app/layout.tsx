import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Chess Studio — Analytics & Analysis Board',
  description:
    'A Stockfish-powered chess analysis board with move classification, a massive opening explorer, Lichess/Chess.com game import and a full study studio.',
  applicationName: 'Chess Studio',
  keywords: ['chess', 'stockfish', 'analysis', 'opening explorer', 'lichess', 'chess.com', 'pgn'],
};

export const viewport: Viewport = {
  themeColor: '#07090f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
