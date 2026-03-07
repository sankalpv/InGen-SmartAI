import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// Generate a deterministic fallback secret for local-only installs
// (InGen doesn't use OAuth — this just silences next-auth's requirement)
const AUTH_SECRET_FALLBACK = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'ingen-local-only-no-oauth-needed';

export const { handlers, signIn, signOut, auth } = NextAuth({
    secret: AUTH_SECRET_FALLBACK,
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            // Initial sign in
            if (account) {
                return {
                    accessToken: account.access_token,
                    expiresAt: Date.now() + account.expires_in * 1000,
                    refreshToken: account.refresh_token,
                    provider: account.provider,
                };
            }

            // Return previous token if the access token has not expired yet
            if (Date.now() < token.expiresAt) {
                return token;
            }

            // Access token has expired, try to update it
            return await refreshAccessToken(token);
        },
        async session({ session, token }) {
            session.accessToken = token.accessToken;
            session.error = token.error;
            session.provider = token.provider;
            return session;
        },
    },
    pages: {
        signIn: '/settings',
    },
});

async function refreshAccessToken(token) {
    try {
        const url = 'https://oauth2.googleapis.com/token';

        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: token.refreshToken,
            }),
        });

        const refreshedTokens = await response.json();

        if (!response.ok) {
            throw refreshedTokens;
        }

        return {
            ...token,
            accessToken: refreshedTokens.access_token,
            expiresAt: Date.now() + refreshedTokens.expires_in * 1000,
            // Fall back to old refresh token if new one is not returned
            refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
        };
    } catch (error) {
        console.error('Error refreshing access token', error);
        return {
            ...token,
            error: 'RefreshAccessTokenError',
        };
    }
}
