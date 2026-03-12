#!/usr/bin/env node

import { fetchOutlookCalendar } from '../services/outlook-local.js';

async function verifyTimeAudit() {
    console.log('Fetching calendar data...\n');
    
    try {
        const meetings = await fetchOutlookCalendar();
        
        const now = new Date();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        console.log(`Current Time: ${now.toLocaleString()}`);
        console.log(`7 Days Ago: ${sevenDaysAgo.toLocaleString()}\n`);
        console.log('='.repeat(100));
        
        // Filter to valid meetings (busy/tentative or 1:1 in title)
        const validMeetings = meetings.filter(m => {
            const meetingDate = new Date(m.start?.dateTime || m.startTime || m.date);
            const isInRange = meetingDate >= sevenDaysAgo && meetingDate <= now;
            const status = (m.busyStatus || 'busy').toLowerCase();
            const isValidStatus = status === 'busy' || status === 'tentative';
            
            const title = (m.title || m.subject || '').toLowerCase();
            const is1on1Title = title.includes('1:1') || 
                               title.includes('1-on-1') || 
                               title.includes('one-on-one') ||
                               title.includes('1 on 1');
            
            return isInRange && (isValidStatus || is1on1Title);
        }).sort((a, b) => {
            const dateA = new Date(a.start?.dateTime || a.startTime || a.date);
            const dateB = new Date(b.start?.dateTime || b.startTime || b.date);
            return dateA - dateB;
        });
        
        console.log(`\nFOUND ${validMeetings.length} VALID MEETINGS\n`);
        console.log('='.repeat(100));
        
        let totalMinutes = 0;
        const meetingDetails = [];
        
        validMeetings.forEach((meeting, index) => {
            const start = new Date(meeting.start?.dateTime || meeting.startTime);
            const end = new Date(meeting.end?.dateTime || meeting.endTime);
            const durationMinutes = Math.round((end - start) / (1000 * 60));
            totalMinutes += durationMinutes;
            
            const detail = {
                index: index + 1,
                title: meeting.title || meeting.subject,
                date: start.toLocaleDateString(),
                time: `${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}`,
                duration: `${durationMinutes} min`,
                hours: (durationMinutes / 60).toFixed(2),
                status: meeting.busyStatus
            };
            meetingDetails.push(detail);
            
            console.log(`[${index + 1}] ${detail.title}`);
            console.log(`    Date: ${detail.date}`);
            console.log(`    Time: ${detail.time}`);
            console.log(`    Duration: ${detail.duration} (${detail.hours} hours)`);
            console.log(`    Status: ${detail.status}`);
            console.log('-'.repeat(100));
        });
        
        // Calculate total hours
        const totalHours = (totalMinutes / 60).toFixed(1);
        const avgPerDay = (validMeetings.length / 7).toFixed(1);
        
        console.log('\n' + '='.repeat(100));
        console.log('MEETING HOURS CALCULATION');
        console.log('='.repeat(100));
        console.log(`Total Meetings: ${validMeetings.length}`);
        console.log(`Total Minutes: ${totalMinutes}`);
        console.log(`Total Hours: ${totalHours}`);
        console.log(`Average Per Day: ${avgPerDay} meetings/day`);
        
        // Calculate deep work time (gaps between meetings)
        console.log('\n' + '='.repeat(100));
        console.log('DEEP WORK CALCULATION');
        console.log('='.repeat(100));
        
        let totalGapMinutes = 0;
        const gaps = [];
        
        for (let i = 0; i < validMeetings.length - 1; i++) {
            const currentEnd = new Date(validMeetings[i].end?.dateTime || validMeetings[i].endTime);
            const nextStart = new Date(validMeetings[i + 1].start?.dateTime || validMeetings[i + 1].startTime);
            const gapMinutes = (nextStart - currentEnd) / (1000 * 60);
            
            // Only count gaps less than 8 hours (same day gaps)
            if (gapMinutes > 0 && gapMinutes < 480) {
                totalGapMinutes += gapMinutes;
                gaps.push({
                    from: validMeetings[i].title,
                    to: validMeetings[i + 1].title,
                    minutes: Math.round(gapMinutes),
                    hours: (gapMinutes / 60).toFixed(2)
                });
            }
        }
        
        console.log(`\nGaps between meetings:`);
        gaps.forEach((gap, i) => {
            console.log(`  [${i + 1}] ${gap.minutes} min (${gap.hours}h)`);
            console.log(`      After: "${gap.from}"`);
            console.log(`      Before: "${gap.to}"`);
        });
        
        // Add estimated time before first and after last meeting each day
        const estimatedOtherTime = 7 * 120; // 2 hours per day
        totalGapMinutes += estimatedOtherTime;
        
        const deepWorkHours = (totalGapMinutes / 60).toFixed(1);
        const deepWorkPercentage = ((totalGapMinutes / (7 * 8 * 60)) * 100).toFixed(1);
        const ratio = (totalMinutes / (totalGapMinutes || 1)).toFixed(2);
        
        console.log(`\nTotal Gap Time: ${totalGapMinutes} min (${deepWorkHours}h)`);
        console.log(`Estimated Additional Time (2h/day x 7): ${estimatedOtherTime} min`);
        console.log(`Deep Work Percentage: ${deepWorkPercentage}% of work time`);
        console.log(`Meeting to Deep Work Ratio: ${ratio}:1`);
        
        console.log('\n' + '='.repeat(100));
        console.log('SUMMARY');
        console.log('='.repeat(100));
        console.log(`Meeting Hours: ${totalHours}h`);
        console.log(`Deep Work: ${deepWorkHours}h (${deepWorkPercentage}% of work time)`);
        console.log(`Balance: ${ratio}:1 meeting-to-deep-work ratio`);
        console.log('='.repeat(100));
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

verifyTimeAudit();