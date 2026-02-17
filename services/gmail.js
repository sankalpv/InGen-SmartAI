// Gmail API Service
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local

export async function fetchGmailEmails(accessToken, query = 'is:inbox newer_than:30d', maxResults = 10) {
    if (!accessToken) throw new Error('No access token provided');

    // Remove try/catch to let errors propagate to the route handler
    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );

    if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);

    const data = await response.json();
    if (!data.messages) return [];

    const emails = await Promise.all(
        data.messages.map(async (msg) => {
            const detail = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const msgData = await detail.json();
            return parseGmailMessage(msgData);
        })
    );

    return emails.filter(Boolean);
}

export async function fetchGoogleCalendarEvents(accessToken, timeMin, timeMax) {
    if (!accessToken) throw new Error('No access token provided');

    const today = new Date();
    const startOfDay = timeMin || new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = timeMax || new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);

    const data = await response.json();
    return (data.items || []).map(parseGoogleCalendarEvent);
}

function parseGmailMessage(msg) {
    try {
        const headers = msg.payload?.headers || [];
        const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('From');
        const fromMatch = from.match(/^(.*?)\s*<(.+)>$/) || [null, from, from];

        let body = '';
        if (msg.payload?.body?.data) {
            body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
        } else if (msg.payload?.parts) {
            const textPart = msg.payload.parts.find(p => p.mimeType === 'text/plain');
            if (textPart?.body?.data) {
                body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
        }

        return {
            id: msg.id,
            source: 'gmail',
            from: { name: fromMatch[1]?.trim() || '', email: fromMatch[2]?.trim() || '' },
            to: [{ name: 'You', email: getHeader('To') }],
            subject: getHeader('Subject'),
            body: body.substring(0, 2000),
            date: msg.internalDate
                ? new Date(parseInt(msg.internalDate)).toISOString()
                : (getHeader('Date') ? new Date(getHeader('Date')).toISOString() : new Date().toISOString()),
            read: !msg.labelIds?.includes('UNREAD'),
            labels: msg.labelIds || [],
            threadLength: 1,
        };
    } catch (error) {
        console.error('Error parsing Gmail message:', error);
        return null;
    }
}

function parseGoogleCalendarEvent(event) {
    return {
        id: event.id,
        title: event.summary || 'Untitled',
        startTime: event.start?.dateTime || event.start?.date,
        endTime: event.end?.dateTime || event.end?.date,
        location: event.location || 'No location',
        organizer: {
            name: event.organizer?.displayName || event.organizer?.email || '',
            email: event.organizer?.email || '',
        },
        attendees: (event.attendees || []).map(a => ({
            name: a.displayName || a.email,
            email: a.email,
        })),
        description: event.description || '',
        source: 'gmail',
    };
}
