import './globals.css';
import Sidebar from '@/components/Sidebar';
import { SessionProvider } from 'next-auth/react';

export const metadata = {
    title: 'InGen — Intelligent Agent',
    description: 'InGen: Your AI-powered workspace interface. Seamlessly integrates email, calendar, and heavy-duty automation with a liquid-glass aesthetic.',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                <SessionProvider>
                    <div className="app-layout">
                        <Sidebar />
                        <main className="main-content">
                            {children}
                        </main>
                    </div>
                </SessionProvider>
            </body>
        </html>
    );
}
