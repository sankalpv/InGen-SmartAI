import { NextResponse } from 'next/server';
import { fetchOutlookCalendar } from '../../../services/outlook-local.js';
import { fetchOutlookEmails } from '../../../services/outlook-local.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const ollamaClient = require('../../../services/ollama-client.js');
const localStore = require('../../../services/local-store.js');
const logger = require('../../../services/logger.js').child('WeekAhead');

const WEEK_AHEAD_CACHE = path.join(process.cwd(), 'data', 'week-ahead-computed.json');
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCachedWeekAhead() {
    try {
        if (fs.existsSync(WEEK_AHEAD_CACHE)) {
            const cached = JSON.parse(fs.readFileSync(WEEK_AHEAD_CACHE, 'utf8'));
            const age = Date.now() - new Date(cached.cachedAt).getTime();
            if (age < CACHE_TTL) {
                return { data: cached.data, ageSeconds: Math.round(age / 1000) };
            }
        }
    } catch (e) { }
    return null;
}

function cacheWeekAhead(data) {
    try {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(WEEK_AHEAD_CACHE, JSON.stringify({ cachedAt: new Date().toISOString(), data }, null, 2));
    } catch (e) { }
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const skipAI = searchParams.get('skipAI') === 'true';
        const aiOnly = searchParams.get('aiOnly') === 'true';

        // Serve from cache if available (instant response)
        if (skipAI) {
            const cached = getCachedWeekAhead();
            if (cached) {
                logger.info(`Serving week-ahead from cache (${cached.ageSeconds}s old)`);
                return NextResponse.json({ ...cached.data, aiAnalysis: null, source: 'cached' });
            }
        }

        // Read from single calendar.json — filter to week ahead (0 back, 8 forward)
        let meetings = [];
        const cached = localStore.getCalendar();
        if (cached.exists && cached.data && cached.data.length > 0) {
            meetings = cached.data;
            logger.info(`Using ${meetings.length} events from local calendar store (${cached.ageMinutes}m old)`);
            
            if (cached.isStale) {
                localStore.fullSync().catch(e => logger.error('Background sync failed:', e.message));
            }
        } else {
            // Fallback: fetch from Outlook directly
            logger.info('No local calendar data, fetching from Outlook...');
            meetings = await fetchOutlookCalendar(null, 0, 8);
            if (meetings && meetings.length > 0) {
                localStore.saveCalendar(meetings);
            }
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Build day-by-day breakdown for next 7 days
        const days = [];
        for (let i = 0; i < 7; i++) {
            const dayStart = new Date(today);
            dayStart.setDate(dayStart.getDate() + i);
            const dayEnd = new Date(dayStart);
            dayEnd.setDate(dayEnd.getDate() + 1);

            const dayMeetings = meetings.filter(m => {
                const mDate = new Date(m.startTime);
                // For today, only show meetings that haven't ended yet
                if (i === 0) {
                    const mEnd = new Date(m.endTime);
                    return mDate >= dayStart && mDate < dayEnd && mEnd > now;
                }
                return mDate >= dayStart && mDate < dayEnd;
            });

            // Smart filtering for relevant meetings only
            const activeMeetings = dayMeetings.filter(m => {
                const status = (m.busyStatus || 'busy').toLowerCase();
                const mtitle = (m.title || '').toLowerCase();
                const attendeeCount = (m.attendees || []).length;
                const duration = Math.round((new Date(m.endTime) - new Date(m.startTime)) / (1000 * 60));
                
                // Always include 1:1s with user
                const is1x1WithUser = mtitle.includes('1:1') || mtitle.includes('1-on-1') || 
                              mtitle.includes('1x1') ||
                              (mtitle.includes('/') && mtitle.includes('sankalp')) ||
                              (mtitle.includes(':') && mtitle.includes('sankalp')) ||
                              (mtitle.match(/\w+\s*-\s*sankalp/i) || mtitle.match(/sankalp\s*-\s*\w+/i));
                
                // Filter out: cancelled, all-day, free status
                const isCancelled = mtitle.includes('canceled:') || mtitle.includes('cancelled:');
                const isAllDay = duration >= 1440; // 24+ hours
                const isOOO = mtitle.includes('ooo') || mtitle.includes('ooto') || mtitle.includes('out of office') || mtitle.includes('pto');
                const isReminder = mtitle.includes('reminder') && duration <= 30;
                
                if (isCancelled || isAllDay || isOOO || isReminder) return false;
                if (status === 'free' && !is1x1WithUser) return false;
                if (status === 'out of office') return false;
                
                // For recurring expansions (R-prefixed IDs), be more selective
                const isRecurringExpansion = (m.id || '').startsWith('R');
                if (isRecurringExpansion) {
                    // Only include if marked busy
                    if (status !== 'busy') return false;
                    // Skip very large meetings (likely org-wide)
                    if (attendeeCount > 50 && !is1x1WithUser) return false;
                    // Skip biweekly/monthly/quarterly meetings - can't verify correct week
                    const isBiweekly = mtitle.includes('bi-weekly') || mtitle.includes('biweekly') || mtitle.includes('bi weekly');
                    const isMonthly = mtitle.includes('monthly') || mtitle.includes('quarterly');
                    if (isBiweekly || isMonthly) return false;
                }
                
                return status === 'busy' || status === 'tentative' || is1x1WithUser;
            });

            // Sort by start time
            activeMeetings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

            // Calculate total meeting minutes
            let totalMeetingMinutes = 0;
            activeMeetings.forEach(m => {
                const start = new Date(m.startTime);
                const end = new Date(m.endTime);
                totalMeetingMinutes += Math.round((end - start) / (1000 * 60));
            });

            // Calculate deep work time (8h workday - meetings)
            const deepWorkMinutes = Math.max(0, 8 * 60 - totalMeetingMinutes);

            // Find 1:1s
            const oneOnOnes = activeMeetings.filter(m => {
                const title = (m.title || '').toLowerCase();
                return title.includes('1:1') || title.includes('1-on-1') || title.includes('one-on-one') ||
                       ((m.attendees || []).length <= 2);
            });

            // Find deep work slots (gaps > 60 min between meetings during work hours)
            const deepWorkSlots = [];
            const workStart = new Date(dayStart); workStart.setHours(9, 0, 0, 0);
            const workEnd = new Date(dayStart); workEnd.setHours(17, 0, 0, 0);
            
            let lastEnd = workStart.getTime();
            activeMeetings.forEach(m => {
                const mStart = new Date(m.startTime).getTime();
                const gap = (mStart - lastEnd) / (1000 * 60);
                if (gap >= 60 && mStart >= workStart.getTime() && mStart <= workEnd.getTime()) {
                    deepWorkSlots.push({
                        start: new Date(lastEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                        end: new Date(mStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                        duration: Math.round(gap)
                    });
                }
                lastEnd = Math.max(lastEnd, new Date(m.endTime).getTime());
            });
            // Check after last meeting
            const finalGap = (workEnd.getTime() - lastEnd) / (1000 * 60);
            if (finalGap >= 60) {
                deepWorkSlots.push({
                    start: new Date(lastEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    end: '5:00 PM',
                    duration: Math.round(finalGap)
                });
            }

            // Load level indicator
            const meetingHours = totalMeetingMinutes / 60;
            let loadLevel = 'light';
            let loadColor = '#22c55e';
            if (meetingHours > 6) { loadLevel = 'heavy'; loadColor = '#ef4444'; }
            else if (meetingHours > 4) { loadLevel = 'moderate'; loadColor = '#eab308'; }
            else if (meetingHours > 2) { loadLevel = 'balanced'; loadColor = '#3b82f6'; }

            const isWeekend = dayStart.getDay() === 0 || dayStart.getDay() === 6;

            days.push({
                date: dayStart.toISOString(),
                dayName: dayStart.toLocaleDateString('en-US', { weekday: 'long' }),
                dayShort: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
                dateFormatted: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                isToday: i === 0,
                isWeekend,
                meetings: activeMeetings.map(m => ({
                    ...m,
                    timeFormatted: new Date(m.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    duration: Math.round((new Date(m.endTime) - new Date(m.startTime)) / (1000 * 60)),
                    attendeeCount: (m.attendees || []).length,
                    is1x1: (m.title || '').toLowerCase().includes('1:1') || (m.attendees || []).length <= 2
                })),
                totalMeetings: activeMeetings.length,
                totalMeetingHours: (totalMeetingMinutes / 60).toFixed(1),
                deepWorkHours: (deepWorkMinutes / 60).toFixed(1),
                oneOnOnes: oneOnOnes.length,
                deepWorkSlots,
                bestDeepWorkSlot: deepWorkSlots.length > 0 ? deepWorkSlots.sort((a, b) => b.duration - a.duration)[0] : null,
                loadLevel,
                loadColor
            });
        }

        // Weekly summary
        const weekDays = days.filter(d => !d.isWeekend);
        const totalMeetings = weekDays.reduce((sum, d) => sum + d.totalMeetings, 0);
        const totalMeetingHours = weekDays.reduce((sum, d) => sum + parseFloat(d.totalMeetingHours), 0);
        const totalDeepWorkHours = weekDays.reduce((sum, d) => sum + parseFloat(d.deepWorkHours), 0);
        const total1x1s = weekDays.reduce((sum, d) => sum + d.oneOnOnes, 0);
        const heaviestDay = weekDays.reduce((max, d) => parseFloat(d.totalMeetingHours) > parseFloat(max.totalMeetingHours) ? d : max, weekDays[0]);
        const lightestDay = weekDays.reduce((min, d) => parseFloat(d.totalMeetingHours) < parseFloat(min.totalMeetingHours) ? d : min, weekDays[0]);

        // AI Analysis - Generate weekly coaching brief (skip if requested for fast load)
        let aiAnalysis = null;
        if (skipAI) {
            const result = {
                success: true,
                days,
                aiAnalysis: null,
                summary: {
                    totalMeetings,
                    totalMeetingHours: totalMeetingHours.toFixed(1),
                    totalDeepWorkHours: totalDeepWorkHours.toFixed(1),
                    total1x1s,
                    heaviestDay: { name: heaviestDay?.dayName, hours: heaviestDay?.totalMeetingHours },
                    lightestDay: { name: lightestDay?.dayName, hours: lightestDay?.totalMeetingHours },
                    avgMeetingsPerDay: (totalMeetings / weekDays.length).toFixed(1),
                    meetingPercentage: ((totalMeetingHours / (weekDays.length * 8)) * 100).toFixed(0)
                },
                dateRange: {
                    start: days[0]?.dateFormatted,
                    end: days[days.length - 1]?.dateFormatted
                }
            };
            // Cache computed week-ahead data for instant future loads (only if we have actual meetings)
            if (totalMeetings > 0) cacheWeekAhead(result);
            return NextResponse.json(result);
        }

        try {
            const weekContext = days.filter(d => !d.isWeekend).map(d => 
                `${d.dayName} (${d.dateFormatted}): ${d.totalMeetings} meetings (${d.totalMeetingHours}h), ${d.deepWorkHours}h deep work, ${d.oneOnOnes} 1:1s. Load: ${d.loadLevel}. Meetings: ${d.meetings.map(m => `${m.timeFormatted} ${m.title} (${m.duration}m, ${m.attendeeCount} people${m.is1x1 ? ', 1:1' : ''})`).join('; ')}`
            ).join('\n');

            const aiPrompt = `You are an executive AI assistant analyzing the upcoming week's calendar for a senior engineering leader.

UPCOMING WEEK:
${weekContext}

WEEKLY STATS:
- Total meetings: ${totalMeetings} (${totalMeetingHours.toFixed(1)}h)
- Deep work available: ${totalDeepWorkHours.toFixed(1)}h
- 1:1s: ${total1x1s}
- Heaviest day: ${heaviestDay?.dayName} (${heaviestDay?.totalMeetingHours}h)
- Lightest day: ${lightestDay?.dayName} (${lightestDay?.totalMeetingHours}h)

Generate a strategic weekly preparation brief. Be specific, actionable, and reference actual meeting names.

Respond in JSON:
{
  "weekSummary": "2-3 sentence executive summary of the week ahead",
  "topPrepItems": ["Most important thing to prepare", "Second most important", "Third"],
  "dailyCoaching": {
    "Monday": "1 sentence coaching tip for this specific day",
    "Tuesday": "...",
    "Wednesday": "...",
    "Thursday": "...",
    "Friday": "..."
  },
  "energyManagement": "Advice on managing energy across heavy/light days",
  "riskAlerts": ["Any scheduling risks or concerns"],
  "strategicOpportunity": "One strategic opportunity the leader should leverage this week"
}`;

            logger.info('Generating AI weekly analysis...');
            const aiResponse = await ollamaClient.generate(aiPrompt, { temperature: 0.3, format: 'json' });
            
            try {
                const parsed = JSON.parse(aiResponse);
                aiAnalysis = Array.isArray(parsed) ? parsed[0] : parsed;
            } catch (parseErr) {
                // Try extracting JSON
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) aiAnalysis = JSON.parse(jsonMatch[0]);
            }
            
            logger.info('AI weekly analysis generated successfully');
        } catch (aiError) {
            logger.error('AI weekly analysis failed:', aiError.message);
        }

        return NextResponse.json({
            success: true,
            days,
            aiAnalysis,
            summary: {
                totalMeetings,
                totalMeetingHours: totalMeetingHours.toFixed(1),
                totalDeepWorkHours: totalDeepWorkHours.toFixed(1),
                total1x1s,
                heaviestDay: { name: heaviestDay?.dayName, hours: heaviestDay?.totalMeetingHours },
                lightestDay: { name: lightestDay?.dayName, hours: lightestDay?.totalMeetingHours },
                avgMeetingsPerDay: (totalMeetings / weekDays.length).toFixed(1),
                meetingPercentage: ((totalMeetingHours / (weekDays.length * 8)) * 100).toFixed(0)
            },
            dateRange: {
                start: days[0]?.dateFormatted,
                end: days[days.length - 1]?.dateFormatted
            }
        });

    } catch (error) {
        console.error('[API/WeekAhead] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}