import './globals.css';
import Sidebar from '@/components/Sidebar';
import ThemeProvider from '@/components/ThemeProvider';
import PageTracker from '@/components/PageTracker';
import VoiceAssistant from '@/components/VoiceAssistant';
import OnboardingModal from '@/components/OnboardingModal';
import { SessionProvider } from 'next-auth/react';

export const metadata = {
    title: 'InGen — Intelligent Agent',
    description: 'InGen: Your AI-powered workspace interface. Seamlessly integrates email, calendar, and heavy-duty automation with a liquid-glass aesthetic.',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            (function() {
                                try {
                                    var theme = localStorage.getItem('ingen-theme');
                                    if (theme === 'light') {
                                        document.documentElement.setAttribute('data-theme', 'light');
                                    }
                                } catch(e) {}
                            })();
                        `,
                    }}
                />
            </head>
            <body>
                <SessionProvider>
                    <ThemeProvider>
                        <PageTracker />
                        <div className="app-layout">
                            <Sidebar />
                            <main className="main-content">
                                {children}
                            </main>
                        </div>
                        <VoiceAssistant />
                        <OnboardingModal />
                    </ThemeProvider>
                </SessionProvider>
            </body>
        </html>
    );
}