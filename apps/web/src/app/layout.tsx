import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth/auth-context';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'CONNECT-HUB — Admin Panel',
  description: 'Institutions, venues, events and tickets management',
};

// aplica el tema guardado antes del primer pintado (evita el destello)
const temaScript = `try{var t=localStorage.getItem('ch_theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}var l=localStorage.getItem('ch_lang');if(l){document.documentElement.lang=l}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <script dangerouslySetInnerHTML={{ __html: temaScript }} />
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>{children}</AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
