import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ticketHealth = require('../../../services/ticket-health');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'dashboard';

        let data;

        switch (view) {
            case 'dashboard': {
                data = await ticketHealth.buildDashboard();
                break;
            }

            case 'group': {
                const name = searchParams.get('name');
                if (!name) {
                    return NextResponse.json({ error: 'name parameter required' }, { status: 400 });
                }
                data = await ticketHealth.getGroupDetail(name);
                break;
            }

            case 'my-tickets': {
                data = await ticketHealth.getMyTickets();
                break;
            }

            case 'refresh': {
                ticketHealth.clearCache();
                data = await ticketHealth.buildDashboard(true);
                break;
            }

            default:
                return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
        }

        return NextResponse.json({ view, data });
    } catch (error) {
        console.error('[API/TicketHealth] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}