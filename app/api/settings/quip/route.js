import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

// Read current settings
function readSettings() {
    try {
        const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to read settings:', error);
        return null;
    }
}

// Write settings to file
function writeSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to write settings:', error);
        return false;
    }
}

// Validate URL format
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// GET: Retrieve Quip settings
export async function GET() {
    const settings = readSettings();
    
    if (!settings) {
        return NextResponse.json(
            { error: 'Failed to read settings' },
            { status: 500 }
        );
    }
    
    // Return Quip settings with defaults
    const quipSettings = settings.quip || {
        enabled: true,
        baseUrl: 'https://quip-amazon.com',
        maxDocsPerEmail: 5,
        timeoutSeconds: 30
    };
    
    return NextResponse.json({
        quip: quipSettings,
        mcpAvailable: true // Could check if amzn-mcp server is connected
    });
}

// POST: Update Quip settings
export async function POST(request) {
    try {
        const body = await request.json();
        const { enabled, baseUrl, maxDocsPerEmail, timeoutSeconds } = body;
        
        // Validate inputs
        if (typeof enabled !== 'boolean') {
            return NextResponse.json(
                { error: 'enabled must be a boolean' },
                { status: 400 }
            );
        }
        
        if (baseUrl && !isValidUrl(baseUrl)) {
            return NextResponse.json(
                { error: 'Invalid URL format. Must start with http:// or https://' },
                { status: 400 }
            );
        }
        
        if (maxDocsPerEmail && (typeof maxDocsPerEmail !== 'number' || maxDocsPerEmail < 1 || maxDocsPerEmail > 20)) {
            return NextResponse.json(
                { error: 'maxDocsPerEmail must be a number between 1 and 20' },
                { status: 400 }
            );
        }
        
        if (timeoutSeconds && (typeof timeoutSeconds !== 'number' || timeoutSeconds < 5 || timeoutSeconds > 120)) {
            return NextResponse.json(
                { error: 'timeoutSeconds must be a number between 5 and 120' },
                { status: 400 }
            );
        }
        
        // Read current settings
        const settings = readSettings();
        
        if (!settings) {
            return NextResponse.json(
                { error: 'Failed to read current settings' },
                { status: 500 }
            );
        }
        
        // Update Quip settings
        settings.quip = {
            enabled,
            baseUrl: baseUrl || settings.quip?.baseUrl || 'https://quip-amazon.com',
            maxDocsPerEmail: maxDocsPerEmail || settings.quip?.maxDocsPerEmail || 5,
            timeoutSeconds: timeoutSeconds || settings.quip?.timeoutSeconds || 30
        };
        
        // Write back to file
        const success = writeSettings(settings);
        
        if (!success) {
            return NextResponse.json(
                { error: 'Failed to save settings' },
                { status: 500 }
            );
        }
        
        return NextResponse.json({
            message: 'Quip settings updated successfully',
            quip: settings.quip
        });
        
    } catch (error) {
        console.error('Error updating Quip settings:', error);
        return NextResponse.json(
            { error: 'Failed to update settings' },
            { status: 500 }
        );
    }
}