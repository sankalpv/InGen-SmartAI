import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getFileSize(filePath) {
    try {
        if (!fs.existsSync(filePath)) return 0;
        return fs.statSync(filePath).size;
    } catch { return 0; }
}

function getJsonCount(filePath, dataField = 'data') {
    try {
        if (!fs.existsSync(filePath)) return 0;
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const arr = raw[dataField] || raw;
        return Array.isArray(arr) ? arr.length : Object.keys(arr).length;
    } catch { return 0; }
}

function getDirSize(dirPath) {
    let total = 0;
    try {
        if (!fs.existsSync(dirPath)) return 0;
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const fp = path.join(dirPath, file);
            const stat = fs.statSync(fp);
            if (stat.isFile()) total += stat.size;
        }
    } catch { /* ignore */ }
    return total;
}

export async function GET() {
    const dataDir = path.join(process.cwd(), 'data');
    const brainDir = path.join(process.cwd(), 'brain');

    const emailCount = getJsonCount(path.join(dataDir, 'emails.json'));
    const calendarCount = getJsonCount(path.join(dataDir, 'calendar.json'));
    const vectorCount = getJsonCount(path.join(brainDir, 'vector_metadata.json'));

    const dataSizeBytes = getDirSize(dataDir);
    const brainSizeBytes = getDirSize(brainDir);
    const totalSizeMB = ((dataSizeBytes + brainSizeBytes) / (1024 * 1024)).toFixed(1);

    return NextResponse.json({
        emailCount,
        calendarCount,
        vectorCount,
        totalSizeMB,
        dataDirExists: fs.existsSync(dataDir),
        brainDirExists: fs.existsSync(brainDir),
    });
}

export async function DELETE() {
    const dataDir = path.join(process.cwd(), 'data');
    const brainDir = path.join(process.cwd(), 'brain');

    let deleted = [];
    try {
        // Clear data files (but not settings or databases)
        const dataFiles = ['emails.json', 'calendar.json', 'agent-history.json', 'slack-agent-state.json'];
        for (const file of dataFiles) {
            const fp = path.join(dataDir, file);
            if (fs.existsSync(fp)) { fs.unlinkSync(fp); deleted.push(file); }
        }

        // Clear brain files (vector store)
        const brainFiles = ['vector_index.bin', 'vector_metadata.json', 'wbr-cache.json', 'goal-depth3-cache.json'];
        for (const file of brainFiles) {
            const fp = path.join(brainDir, file);
            if (fs.existsSync(fp)) { fs.unlinkSync(fp); deleted.push(`brain/${file}`); }
        }

        return NextResponse.json({ success: true, deleted, message: 'All local cached data cleared. Outlook data is untouched.' });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
