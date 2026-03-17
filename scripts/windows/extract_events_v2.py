#!/usr/bin/env python3
"""
V2 Raw Event Extractor — Uses V8 Blink string extraction
The data is V8-serialized, so field names and values are stored as length-prefixed strings.
We scan for UTF-16LE encoded strings (V8's internal format) to find Subject and Start/End.
"""
import os, sys, shutil, tempfile, json, re, sqlite3, struct
from datetime import datetime, timezone

LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", "")
DB_PATH = os.path.join(LOCAL_APP_DATA, "Microsoft", "Olk", "EBWebView", "Default", "IndexedDB",
    "https_outlook.office.com_0.indexeddb.leveldb")
OUTPUT_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "outlook-cache.db")

def now_utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def extract_utf16_strings(data):
    """Extract UTF-16LE strings from binary data (V8 Blink format)."""
    strings = []
    i = 0
    while i < len(data) - 4:
        # V8 strings are often preceded by a length byte/varint
        # Look for ASCII-range UTF-16LE sequences (every other byte is 0x00)
        if data[i] >= 0x20 and data[i] < 0x7f and i + 1 < len(data) and data[i+1] == 0x00:
            # Found potential UTF-16LE string start
            chars = []
            j = i
            while j < len(data) - 1 and data[j] >= 0x20 and data[j] < 0x7f and data[j+1] == 0x00:
                chars.append(chr(data[j]))
                j += 2
            if len(chars) >= 3:
                s = "".join(chars)
                strings.append((i, s))
            i = j
        else:
            i += 1
    return strings

def find_events_in_file(data, filename):
    """Find calendar events by extracting V8 strings and correlating dates with subjects."""
    events = []
    
    # Extract all strings from the binary data
    strings = extract_utf16_strings(data)
    
    # Also check for ASCII strings (some fields are stored as ASCII)
    ascii_strings = []
    text = data.decode("ascii", errors="replace")
    for m in re.finditer(r'(2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)', text):
        ascii_strings.append((m.start(), m.group(1)))
    
    # Combine all date strings found
    date_strings = []
    for pos, s in strings:
        if re.match(r'2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', s):
            date_strings.append((pos, s))
    for pos, s in ascii_strings:
        if re.match(r'2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', s):
            date_strings.append((pos, s))
    
    # For each date that looks like a meeting time, find nearby subject strings
    for date_pos, date_str in date_strings:
        # Filter: only keep dates with round minutes (meeting times)
        time_match = re.match(r'2026-\d{2}-\d{2}T(\d{2}):(\d{2}):\d{2}\.000Z', date_str)
        if not time_match:
            continue
        
        minutes = int(time_match.group(2))
        # Meeting times are typically at :00, :05, :15, :30, :45
        if minutes not in (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55):
            continue
        
        # Look for subject strings within 5000 bytes of this date
        nearby_subjects = []
        for str_pos, s in strings:
            distance = abs(str_pos - date_pos)
            if distance < 5000 and len(s) >= 5 and len(s) <= 120:
                # Filter out field names and metadata
                if s in ("Start", "End", "Subject", "Location", "DisplayName", "id", "Organizer",
                         "EmailAddress", "Name", "Mailbox", "RequiredAttendees", "OptionalAttendees",
                         "ResponseType", "FreeBusyType", "Sensitivity", "SeriesMasterItemId",
                         "StartTimeZoneId", "EndTimeZoneId", "CalendarItemType", "Preview",
                         "IsAllDayEvent", "IsCancelled", "IsOrganizer", "HasAttachments",
                         "Pacific Standard Time", "America/Los_Angeles", "UTC",
                         "IPM.Appointment", "Normal", "Busy", "Free", "Tentative",
                         "None", "Organizer", "Accept", "Decline", "TentativelyAccepted",
                         "true", "false", "null", "undefined"):
                    continue
                # Skip if it looks like a date, ID, or technical string
                if re.match(r'2026-|AAk|^[a-f0-9-]{30,}$|^https?://', s):
                    continue
                if re.match(r'^[A-Z][a-z]+[A-Z]', s) and len(s) < 20:  # CamelCase field names
                    continue
                nearby_subjects.append((distance, s))
        
        if nearby_subjects:
            # Pick the closest subject-like string
            nearby_subjects.sort(key=lambda x: x[0])
            subject = nearby_subjects[0][1]
            
            # Find a nearby End date
            end_time = date_str  # Default: same as start
            for dp, ds in date_strings:
                if dp != date_pos and abs(dp - date_pos) < 500:
                    # This could be the End time
                    if ds > date_str:  # End should be after Start
                        end_time = ds
                        break
            
            events.append({
                "id": f"raw-{filename}-{date_pos}",
                "title": subject,
                "start_time": date_str if date_str.endswith("Z") else date_str + "Z",
                "end_time": end_time if end_time.endswith("Z") else end_time + "Z",
            })
    
    return events

def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  V2 Raw Event Extractor (V8 String Extraction)      ║")
    print("╚══════════════════════════════════════════════════════╝")
    
    tmp_dir = tempfile.mkdtemp(prefix="outlook-v2-")
    for f in os.listdir(DB_PATH):
        if f == "LOCK": continue
        try: shutil.copy2(os.path.join(DB_PATH, f), os.path.join(tmp_dir, f))
        except: pass
    
    # Scan all LDB files
    print("\nScanning LevelDB files for V8-encoded events...")
    all_events = []
    for f in sorted(os.listdir(tmp_dir)):
        if not f.endswith(('.ldb', '.log', '.sst')): continue
        fpath = os.path.join(tmp_dir, f)
        try:
            data = open(fpath, "rb").read()
            found = find_events_in_file(data, f)
            if found:
                print(f"  {f}: {len(found)} events")
            all_events.extend(found)
        except Exception as e:
            print(f"  {f}: error - {e}")
    
    print(f"\nTotal raw events found: {len(all_events)}")
    
    # Deduplicate by start_time + title
    unique = {}
    for e in all_events:
        key = f"{e['start_time'][:19]}_{e['title'][:30]}"
        if key not in unique:
            unique[key] = e
    
    # Filter to ±60 days
    now = datetime.now(timezone.utc)
    filtered = []
    for e in unique.values():
        try:
            dt = datetime.fromisoformat(e["start_time"].replace("Z", "+00:00"))
            days_diff = (dt - now).days
            if -60 <= days_diff <= 60:
                filtered.append(e)
        except: pass
    
    filtered.sort(key=lambda x: x["start_time"])
    print(f"After dedup + date filter: {len(filtered)} events")
    
    # Show by date
    print("\nEvents by date:")
    by_date = {}
    for e in filtered:
        date = e["start_time"][:10]
        by_date.setdefault(date, []).append(e)
    for date in sorted(by_date.keys()):
        evts = by_date[date]
        print(f"  {date}: {len(evts)} events")
        for e in evts[:5]:
            print(f"    {e['start_time'][11:16]} - {e['title'][:60]}")
        if len(evts) > 5:
            print(f"    ... and {len(evts) - 5} more")
    
    # Write to SQLite
    print(f"\nWriting {len(filtered)} events to outlook-cache.db...")
    conn = sqlite3.connect(OUTPUT_DB)
    added = updated = 0
    now_str = now_utc()
    for e in filtered:
        existing = conn.execute("SELECT id FROM meetings WHERE id = ?", (e["id"],)).fetchone()
        if existing:
            conn.execute("UPDATE meetings SET title=?, start_time=?, end_time=?, updated_at=? WHERE id=?",
                (e["title"], e["start_time"], e["end_time"], now_str, e["id"]))
            updated += 1
        else:
            conn.execute("INSERT INTO meetings (id, title, start_time, end_time, extracted_at, updated_at) VALUES (?,?,?,?,?,?)",
                (e["id"], e["title"], e["start_time"], e["end_time"], now_str, now_str))
            added += 1
    conn.commit()
    conn.close()
    print(f"✅ Done! {added} added, {updated} updated")
    
    # Also delete stale calendar.json so API re-reads from DB
    cal_json = os.path.join(os.path.dirname(OUTPUT_DB), "calendar.json")
    if os.path.exists(cal_json):
        os.remove(cal_json)
        print(f"Deleted stale calendar.json")
    
    shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
