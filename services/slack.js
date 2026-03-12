// Slack Web API Service
// Requires SLACK_BOT_TOKEN in .env.local

const SLACK_BASE = 'https://slack.com/api';

export async function fetchSlackMessages(botToken) {
    if (!botToken) return [];

    try {
        const messages = [];

        // Fetch DMs (conversations.list + conversations.history)
        const dmsResponse = await fetch(
            `${SLACK_BASE}/conversations.list?types=im&limit=10`,
            {
                headers: { Authorization: `Bearer ${botToken}` },
            }
        );

        if (dmsResponse.ok) {
            const dmsData = await dmsResponse.json();
            if (dmsData.ok && dmsData.channels) {
                for (const dm of dmsData.channels.slice(0, 5)) {
                    const historyResponse = await fetch(
                        `${SLACK_BASE}/conversations.history?channel=${dm.id}&limit=5`,
                        {
                            headers: { Authorization: `Bearer ${botToken}` },
                        }
                    );

                    if (historyResponse.ok) {
                        const historyData = await historyResponse.json();
                        if (historyData.ok && historyData.messages) {
                            for (const msg of historyData.messages) {
                                // Get user info
                                const userInfo = await getUserInfo(botToken, msg.user);
                                messages.push({
                                    id: msg.ts,
                                    channel: 'DM',
                                    from: {
                                        name: userInfo?.real_name || userInfo?.name || 'Unknown',
                                        avatar: '💬',
                                    },
                                    message: msg.text || '',
                                    timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
                                    isDirectMessage: true,
                                    needsResponse: true,
                                });
                            }
                        }
                    }
                }
            }
        }

        // Fetch mentions
        const searchResponse = await fetch(
            `${SLACK_BASE}/search.messages?query=<@me>&sort=timestamp&count=10`,
            {
                headers: { Authorization: `Bearer ${botToken}` },
            }
        );

        if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.ok && searchData.messages?.matches) {
                for (const match of searchData.messages.matches) {
                    messages.push({
                        id: match.ts,
                        channel: `#${match.channel?.name || 'unknown'}`,
                        from: {
                            name: match.username || 'Unknown',
                            avatar: '📢',
                        },
                        message: match.text || '',
                        timestamp: new Date(parseFloat(match.ts) * 1000).toISOString(),
                        isDirectMessage: false,
                        needsResponse: true,
                    });
                }
            }
        }

        return messages;
    } catch (error) {
        console.error('Slack fetch error:', error);
        return [];
    }
}

async function getUserInfo(botToken, userId) {
    if (!userId) return null;
    try {
        const response = await fetch(
            `${SLACK_BASE}/users.info?user=${userId}`,
            {
                headers: { Authorization: `Bearer ${botToken}` },
            }
        );
        if (response.ok) {
            const data = await response.json();
            return data.ok ? data.user : null;
        }
        return null;
    } catch {
        return null;
    }
}
