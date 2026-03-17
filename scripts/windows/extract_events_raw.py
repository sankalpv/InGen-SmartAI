#!/usr/bin/env python3
"""
Raw Event Extractor — Extracts calendar events from Outlook IndexedDB
by scanning raw LevelDB binary data for event patterns.

This bypasses the CCL V8 deserializer which crashes on some records,
and instead uses pattern matching to find event data directly.

Outputs events to data/outlook-cache.db (same SQLite as the main extractor).
"""
import os, sys, shutil, tempfile, json, re, sqlite3
from datetime import datetime, timezone

LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", "")
DB_PATH = os.path.join(LOCAL_APP_DATA, "Microsoft", "Olk", "EBWebView", "Default", "IndexedDB",
    "https_outlook.office.com_0.indexeddb.leveldb")
OUTPUT_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "outlook-cache.db")

def now_utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def extract_events_from_binary(data, filename):
    """Extract calendar events by scanning binary data for JSON-like event patterns."""
    events = []
    text = data.decode("utf-8", errors="replace")
    
    # Strategy 1: Find "Start" and "End" date pairs with "Subject" nearby
    # New Outlook stores events as serialized objects with these fields
    
    # Look for patterns like: "Start":"2026-03-17T16:30:00.000Z"
    # These appear in the V8-serialized IndexedDB records
    start_pattern = re.compile(r'"?Start"?\s*[":]\s*"?(2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)"?')
    end_pattern = re.compile(r'"?End"?\s*[":]\s*"?(2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)"?')
    subject_pattern = re.compile(r'"?Subject"?\s*[":]\s*"?([^"\\]{3,120})"?')
    location_pattern = re.compile(r'"?DisplayName"?\s*[":]\s*"?([^"\\]{3,200})"?')
    id_pattern = re.compile(r'"?id"?\s*[":]\s*"?(AAk[A-Za-z0-9+/=]{20,80})"?')
    
    # Find all Start dates
    for start_match in start_pattern.finditer(text):
        start_time = start_match.group(1)
        if not start_time.endswith("Z"):
            start_time += "Z"
        
        pos = start_match.start()
        # Search in a window around this Start date for End, Subject, etc.
        window_start = max(0, pos - 2000)
        window_end = min(len(text), pos + 3000)
        window = text[window_start:window_end]
        
        end_match = end_pattern.search(window)
        subject_match = subject_pattern.search(window)
        id_match = id_pattern.search(window)
        
        end_time = end_match.group(1) if end_match else None
        if end_time and not end_time.endswith("Z"):
            end_time += "Z"
        
        subject = subject_match.group(1).strip() if subject_match else None
        event_id = id_match.group(1) if id_match else None
        
        # Filter: must have a subject and the start time should look like a meeting time
        # (not a sync timestamp — those have fractional seconds like .8349664)
        if subject and len(subject) > 3:
            # Skip if this looks like a sync/metadata timestamp (has many decimal places)
            if re.match(r'2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{4,}', start_time):
                continue
            
            events.append({
                "id": event_id or f"raw-{filename}-{pos}",
                "title": subject,
                "start_time": start_time,
                "end_time": end_time or start_time,
                "source_file": filename,
            })
    
    return events

def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Raw Event Extractor (Binary Pattern Matching)      ║")
    print("╚══════════════════════════════════════════════════════╝")
    
    # Copy DB to temp
    tmp_dir = tempfile.mkdtemp(prefix="outlook-raw-")
    for f in os.listdir(DB_PATH):
        if f == "LOCK": continue
        try: shutil.copy2(os.path.join(DB_PATH, f), os.path.join(tmp_dir, f))
        except: pass
    
    # Method 1: CCL reader (get what we can)
    print("\nStep 1: CCL reader (structured events)...")
    ccl_events = []
    try:
        from ccl_chromium_reader import ccl_chromium_indexeddb
        wrapped = ccl_chromium_indexeddb.WrappedIndexDB(tmp_dir)
        for db_id in wrapped.database_ids:
            if "owa-offline-data-" not in db_id.name: continue
            wrapped_db = wrapped[db_id]
            if "events" in list(wrapped_db.object_store_names):
                store = wrapped_db["events"]
                try:
                    for record in store.iterate_records():
                        try:
                            val = record.value
                            if not isinstance(val, dict): continue
                            item_id = str(val.get("id") or "")
                            subject = str(val.get("Subject") or val.get("subject") or "")
                            start = str(val.get("Start") or val.get("start") or "")
                            end = str(val.get("End") or val.get("end") or "")
                            if subject and start:
                                ccl_events.append({
                                    "id": item_id,
                                    "title": subject,
                                    "start_time": start,
                                    "end_time": end or start,
                                    "source": "ccl",
                                })
                        except: pass
                except Exception as e:
                    print(f"  CCL stopped after {len(ccl_events)} records: {e}")
        wrapped.close()
    except Exception as e:
        print(f"  CCL failed: {e}")
    print(f"  CCL extracted: {len(ccl_events)} events")
    
    # Method 2: Raw binary scan
    print("\nStep 2: Raw binary scan (pattern matching)...")
    raw_events = []
    target_files = sorted([f for f in os.listdir(tmp_dir) if f.endswith(('.ldb', '.log', '.sst'))])
    for f in target_files:
        fpath = os.path.join(tmp_dir, f)
        try:
            data = open(fpath, "rb").read()
            found = extract_events_from_binary(data, f)
            raw_events.extend(found)
        except: pass
    print(f"  Raw scan found: {len(raw_events)} event candidates")
    
    # Merge: CCL events take priority (they have full metadata)
    # Raw events fill in what CCL missed
    all_events = {}
    
    # Add CCL events first
    for e in ccl_events:
        key = e["start_time"][:19]  # Dedupe by start time (ignore ms)
        all_events[key] = e
    
    # Add raw events that CCL missed
    raw_added = 0
    for e in raw_events:
        key = e["start_time"][:19]
        if key not in all_events:
            all_events[key] = e
            raw_added += 1
    
    print(f"\n  Merged: {len(all_events)} unique events ({len(ccl_events)} from CCL + {raw_added} from raw scan)")
    
    # Filter to reasonable date range (last 60 days to next 60 days)
    now = datetime.now(timezone.utc)
    filtered = []
    for e in all_events.values():
        try:
            start = e["start_time"].replace("Z", "+00:00") if not e["start_time"].endswith("+00:00") else e["start_time"]
            dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            days_diff = (dt - now).days
            if -60 <= days_diff <= 60:
                filtered.append(e)
        except:
            pass
    
    filtered.sort(key=lambda x: x["start_time"])
    print(f"  After date filter (±60 days): {len(filtered)} events")
    
    # Show what we found
    print(f"\n  Events by date:")
    by_date = {}
    for e in filtered:
        date = e["start_time"][:10]
        by_date.setdefault(date, []).append(e)
    for date in sorted(by_date.keys()):
        events = by_date[date]
        print(f"    {date}: {len(events)} events")
        for e in events[:3]:
            print(f"      {e['start_time'][11:16]} - {e['title'][:50]}")
        if len(events) > 3:
            print(f"      ... and {len(events) - 3} more")
    
    # Write to SQLite
    print(f"\nStep 3: Writing {len(filtered)} events to {OUTPUT_DB}...")
    conn = sqlite3.connect(OUTPUT_DB)
    added = updated = 0
    now_str = now_utc()
    
    for e in filtered:
        eid = e.get("id") or f"raw-{e['start_time']}"
        existing = conn.execute("SELECT id FROM meetings WHERE id = ?", (eid,)).fetchone()
        if existing:
            conn.execute("UPDATE meetings SET title=?, start_time=?, end_time=?, updated_at=? WHERE id=?",
                (e["title"], e["start_time"], e["end_time"], now_str, eid))
            updated += 1
        else:
            conn.execute("""INSERT INTO meetings (id, title, start_time, end_time, extracted_at, updated_at)
                VALUES (?,?,?,?,?,?)""",
                (eid, e["title"], e["start_time"], e["end_time"], now_str, now_str))
            added += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n✅ Done! {added} added, {updated} updated in outlook-cache.db")
    
    shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
