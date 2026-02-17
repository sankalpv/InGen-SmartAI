// Microsoft Graph API Service (Outlook Mail + Calendar)
// Requires AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID in .env.local

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export async function fetchOutlookEmails(accessToken) {
    if (!accessToken) return [];

    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const response = await fetch(
            `${GRAPH_BASE}/me/messages?$top=20&$filter=receivedDateTime ge ${yesterday}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,isRead,importance`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

        const data = await response.json();
        return (data.value || []).map(parseOutlookMessage);
    } catch (error) {
        console.error('Outlook fetch error:', error);
        return [];
    }
}

export async function fetchOutlookCalendarEvents(accessToken) {
    if (!accessToken) return [];

    try {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

        const response = await fetch(
            `${GRAPH_BASE}/me/calendarView?startDateTime=${startOfDay}&endDateTime=${endOfDay}&$select=id,subject,start,end,location,organizer,attendees,bodyPreview&$orderby=start/dateTime`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Prefer: 'outlook.timezone="America/Los_Angeles"',
                },
            }
        );

        if (!response.ok) throw new Error(`Outlook Calendar API error: ${response.status}`);

        const data = await response.json();
        return (data.value || []).map(parseOutlookCalendarEvent);
    } catch (error) {
        console.error('Outlook Calendar fetch error:', error);
        return [];
    }
}

function parseOutlookMessage(msg) {
    return {
        id: msg.id,
        source: 'outlook',
        from: {
            name: msg.from?.emailAddress?.name || '',
            email: msg.from?.emailAddress?.address || '',
        },
        to: (msg.toRecipients || []).map(r => ({
            name: r.emailAddress?.name || '',
            email: r.emailAddress?.address || '',
        })),
        subject: msg.subject || '',
        body: (msg.body?.content || msg.bodyPreview || '').substring(0, 2000),
        date: msg.receivedDateTime,
        read: msg.isRead || false,
        labels: msg.importance === 'high' ? ['important'] : [],
        threadLength: 1,
    };
}

function parseOutlookCalendarEvent(event) {
    return {
        id: event.id,
        title: event.subject || 'Untitled',
        startTime: event.start?.dateTime,
        endTime: event.end?.dateTime,
        location: event.location?.displayName || 'No location',
        organizer: {
            name: event.organizer?.emailAddress?.name || '',
            email: event.organizer?.emailAddress?.address || '',
        },
        attendees: (event.attendees || []).map(a => ({
            name: a.emailAddress?.name || a.emailAddress?.address,
            email: a.emailAddress?.address,
        })),
        description: event.bodyPreview || '',
        source: 'outlook',
    };
}
