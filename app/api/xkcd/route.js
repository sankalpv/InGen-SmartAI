import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const num = Math.floor(Math.random() * 2900) + 1;
        const res = await fetch(`https://xkcd.com/${num}/info.0.json`, { 
            next: { revalidate: 0 } // No caching
        });
        
        if (!res.ok) throw new Error('XKCD API failed');
        
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch XKCD' }, { status: 500 });
    }
}