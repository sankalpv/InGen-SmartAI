#!/usr/bin/env node

import { fetchOutlookCalendar } from '../services/outlook-local.js';

async function showMeetings() {
    console.log('Fetching calendar data from the last 7 days...\n');
    
    try {
        const meetings = await fetchOutlookCalendar();
        
        // Filter to last 7 days
        const now = new Date();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        const recentMeetings = meetings.filter(m => {
            const meetingDate = new Date(m.start?.dateTime || m.startTime || m.date);
            return meetingDate >= sevenDaysAgo && meetingDate <= now;
        });
        
        console.log(`Found ${recentMeetings.length} meetings in the last 7 days\n`);
        console.log('='.repeat(80));
        
        // Sort by date
        recentMeetings.sort((a, b) => {
            const dateA = new Date(a.start?.dateTime || a.startTime || a.date);
            const dateB = new Date(b.start?.dateTime || b.startTime || b.date);
            return dateA - dateB;
        });
        
        // Display each meeting
        recentMeetings.forEach((meeting, index) => {
            const startDate = new Date(meeting.start?.dateTime || meeting.startTime || meeting.date);
            const endDate = new Date(meeting.end?.dateTime || meeting.endTime);
            const attendeeCount = (meeting.attendees || []).length;
            
            console.log(`\n[${index + 1}] ${meeting.title || meeting.subject}`);
            console.log(`    ID: ${meeting.id}`);
            console.log(`    Date: ${startDate.toLocaleString()}`);
            console.log(`    Duration: ${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`);
            console.log(`    Status: ${meeting.busyStatus || 'unknown'}`);
            console.log(`    Attendees: ${attendeeCount} (${attendeeCount + 1} with self)`);
            
            if (meeting.attendees && meeting.attendees.length > 0) {
                console.log(`    Attendee List:`);
                meeting.attendees.forEach(att => {
                    const email = att.emailAddress?.address || att.email || 'unknown';
                    const name = att.emailAddress?.name || att.name || email;
                    console.log(`      - ${name} (${email})`);
                });
            }
            
            if (meeting.location) {
                console.log(`    Location: ${meeting.location}`);
            }
            
            console.log('-'.repeat(80));
        });
        
        // Summary
        console.log(`\n${'='.repeat(80)}`);
        console.log('SUMMARY');
        console.log(`Total meetings: ${recentMeetings.length}`);
        
        const byStatus = {};
        recentMeetings.forEach(m => {
            const status = m.busyStatus || 'unknown';
            byStatus[status] = (byStatus[status] || 0) + 1;
        });
        
        console.log('\nBy Status:');
        Object.entries(byStatus).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
        });
        
        // Count by attendee size
        const bySize = { '1x1 (≤2)': 0, 'Small (3-5)': 0, 'Medium (6-20)': 0, 'Large (>20)': 0 };
        recentMeetings.forEach(m => {
            const count = (m.attendees || []).length + 1;
            if (count <= 2) bySize['1x1 (≤2)']++;
            else if (count <= 5) bySize['Small (3-5)']++;
            else if (count <= 20) bySize['Medium (6-20)']++;
            else bySize['Large (>20)']++;
        });
        
        console.log('\nBy Size:');
        Object.entries(bySize).forEach(([size, count]) => {
            console.log(`  ${size}: ${count}`);
        });
        
        console.log(`\n${'='.repeat(80)}\n`);
        
        // Also output raw JSON to a file
        const fs = await import('fs');
        const outputPath = 'meetings_7days_raw.json';
        fs.writeFileSync(outputPath, JSON.stringify(recentMeetings, null, 2));
        console.log(`Raw JSON data saved to: ${outputPath}`);
        
    } catch (error) {
        console.error('Error fetching meetings:', error);
        process.exit(1);
    }
}

showMeetings();