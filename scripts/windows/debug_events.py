#!/usr/bin/env python3
"""Debug: Inspect ALL events in Outlook's IndexedDB to check date ranges"""
import os, sys, shutil, tempfile
from datetime import datetime

LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", "")
DB_PATH = os.path.join(LOCAL_APP_DATA, "Microsoft", "Olk", "EBWebView", "Default", "IndexedDB",
    "https_outlook.office.com_0.indexeddb.leveldb")

print(f"Source: {DB_PATH}")
print(f"Exists: {os.path.exists(DB_PATH)}")

# Copy to temp
tmp_dir = tempfile.mkdtemp(prefix="outlook-debug-")
copied = 0
for f in os.listdir(DB_PATH):
    if f == "LOCK": continue
    try:
        shutil.copy2(os.path.join(DB_PATH, f), os.path.join(tmp_dir, f))
        copied += 1
    except: pass
print(f"Copied {copied} files to temp\n")

from ccl_chromium_reader import ccl_chromium_indexeddb
wrapped = ccl_chromium_indexeddb.WrappedIndexDB(tmp_dir)

for db_id in wrapped.database_ids:
    print(f"Database: {db_id.name}")
    if "owa-offline-data-" not in db_id.name:
        continue
    
    wrapped_db = wrapped[db_id]
    store_names = list(wrapped_db.object_store_names)
    print(f"Stores: {store_names}\n")
    
    # Check events store
    if "events" in store_names:
        print("=== EVENTS STORE ===")
        store = wrapped_db["events"]
        events = []
        errors = 0
        try:
            for record in store.iterate_records():
                try:
                    val = record.value
                    if not isinstance(val, dict): continue
                    
                    subject = str(val.get("Subject") or val.get("subject") or "?")
                    start = str(val.get("Start") or val.get("start") or "?")
                    end = str(val.get("End") or val.get("end") or "?")
                    item_id = str(val.get("id") or val.get("ItemId", {}).get("Id", "?") if isinstance(val.get("ItemId"), dict) else "?")
                    
                    events.append({"subject": subject[:60], "start": start, "end": end, "id": item_id[:20]})
                except Exception as e:
                    errors += 1
        except Exception as e:
            print(f"  Store iteration error: {e}")
        
        print(f"Total events found: {len(events)} (errors: {errors})")
        
        # Sort by start date
        events.sort(key=lambda x: x["start"])
        
        if events:
            print(f"\nEarliest: {events[0]['start']}")
            print(f"Latest:   {events[-1]['start']}")
            print(f"\nAll events:")
            for e in events:
                print(f"  {e['start']} | {e['subject']}")
    
    # Also check if there are other stores with calendar-like data
    for store_name in store_names:
        if store_name in ("events", "messages", "conversations", "pgal", "messageBodies", "conversationNodes"):
            continue
        store = wrapped_db[store_name]
        count = 0
        try:
            for record in store.iterate_records():
                count += 1
                if count >= 3:
                    # Print first few records to see structure
                    val = record.value
                    if isinstance(val, dict):
                        keys = list(val.keys())[:10]
                        print(f"\n  Store '{store_name}' sample keys: {keys}")
                    break
        except: pass
        if count > 0:
            print(f"  Store '{store_name}': {count}+ records")

wrapped.close()
shutil.rmtree(tmp_dir, ignore_errors=True)
