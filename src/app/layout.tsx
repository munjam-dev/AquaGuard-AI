import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/components/provider';
import { ChatWidget } from '@/components/ChatWidget';

export const metadata: Metadata = {
  title: 'AquaGuard AI | Water pipeline monitoring',
  description: 'AI-powered water pipeline quality and infrastructure monitoring with explainable leak, stress and water-quality detection.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('aq-theme')==='dark'?'dark':'light'}catch(e){}" }} />
      </head>
      <body>
        <AppProvider>{children}<ChatWidget /></AppProvider>
      </body>
    </html>
  );
}
