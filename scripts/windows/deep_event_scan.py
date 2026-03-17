#!/usr/bin/env python3
"""Deep scan: Find ALL events in IndexedDB, including ones CCL can't deserialize.
Scan raw LevelDB keys for event-related patterns."""
import os, shutil, tempfile, json, re, struct

LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", "")
DB_PATH = os.path.join(LOCAL_APP_DATA, "Microsoft", "Olk", "EBWebView", "Default", "IndexedDB",
    "https_outlook.office.com_0.indexeddb.leveldb")

tmp_dir = tempfile.mkdtemp(prefix="outlook-deep-")
for f in os.listdir(DB_PATH):
    if f == "LOCK": continue
    try: shutil.copy2(os.path.join(DB_PATH, f), os.path.join(tmp_dir, f))
    except: pass

print("=== Deep Event Scan ===\n")

# Method 1: CCL reader - collect what we can
from ccl_chromium_reader import ccl_chromium_indexeddb
wrapped = ccl_chromium_indexeddb.WrappedIndexDB(tmp_dir)

ccl_events = []
for db_id in wrapped.database_ids:
    if "owa-offline-data-" not in db_id.name:
        continue
    wrapped_db = wrapped[db_id]
    
    if "events" in list(wrapped_db.object_store_names):
        store = wrapped_db["events"]
        try:
            for record in store.iterate_records():
                try:
                    val = record.value
                    if isinstance(val, dict):
                        subject = str(val.get("Subject") or val.get("subject") or "?")
                        start = str(val.get("Start") or val.get("start") or "?")
                        ccl_events.append({"subject": subject[:60], "start": start})
                except:
                    pass
        except Exception as e:
            print(f"CCL stopped after {len(ccl_events)} records: {e}")

wrapped.close()

print(f"CCL found {len(ccl_events)} events:")
for e in sorted(ccl_events, key=lambda x: x["start"]):
    print(f"  {e['start']} | {e['subject']}")

# Method 2: Raw scan of LevelDB files for date patterns (2026-03)
print(f"\n=== Raw Binary Scan for March 2026 dates ===")
march_hits = []
for f in sorted(os.listdir(tmp_dir)):
    fpath = os.path.join(tmp_dir, f)
    if not os.path.isfile(fpath): continue
    try:
        data = open(fpath, "rb").read()
        # Search for ISO date strings like "2026-03-1" in the binary data
        for month in ["2026-03-1", "2026-03-2", "2026-03-3"]:
            idx = 0
            while True:
                idx = data.find(month.encode(), idx)
                if idx == -1: break
                # Extract surrounding context (100 bytes before and after)
                start = max(0, idx - 100)
                end = min(len(data), idx + 200)
                context = data[start:end]
                # Try to find a subject near this date
                try:
                    text = context.decode("utf-8", errors="replace")
                    # Look for Subject field nearby
                    date_match = re.search(r'(2026-03-\d{2}T[\d:\.]+Z?)', text)
                    subj_match = re.search(r'(?:Subject|subject)["\s:]+([^"]{5,80})', text)
                    if date_match:
                        hit = {"file": f, "date": date_match.group(1), "subject": subj_match.group(1) if subj_match else "?", "offset": idx}
                        march_hits.append(hit)
                except:
                    pass
                idx += 1
    except:
        pass

# Deduplicate by date
seen = set()
unique_hits = []
for h in march_hits:
    key = h["date"][:16]  # Dedupe by date+hour
    if key not in seen:
        seen.add(key)
        unique_hits.append(h)

print(f"Found {len(unique_hits)} unique March 2026 date references in raw LevelDB:")
for h in sorted(unique_hits, key=lambda x: x["date"]):
    print(f"  {h['date']} | file={h['file']} | subject={h['subject']}")

shutil.rmtree(tmp_dir, ignore_errors=True)
