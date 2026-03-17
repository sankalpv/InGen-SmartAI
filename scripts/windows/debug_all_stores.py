#!/usr/bin/env python3
"""Debug: Check ALL stores in the IndexedDB, especially calendars and calendarGroups"""
import os, shutil, tempfile, json

LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", "")
DB_PATH = os.path.join(LOCAL_APP_DATA, "Microsoft", "Olk", "EBWebView", "Default", "IndexedDB",
    "https_outlook.office.com_0.indexeddb.leveldb")

tmp_dir = tempfile.mkdtemp(prefix="outlook-debug2-")
for f in os.listdir(DB_PATH):
    if f == "LOCK": continue
    try: shutil.copy2(os.path.join(DB_PATH, f), os.path.join(tmp_dir, f))
    except: pass

from ccl_chromium_reader import ccl_chromium_indexeddb
wrapped = ccl_chromium_indexeddb.WrappedIndexDB(tmp_dir)

for db_id in wrapped.database_ids:
    if "owa-offline-data-" not in db_id.name:
        continue
    
    wrapped_db = wrapped[db_id]
    store_names = list(wrapped_db.object_store_names)
    
    # Check EVERY store
    for store_name in store_names:
        store = wrapped_db[store_name]
        count = 0
        samples = []
        try:
            for record in store.iterate_records():
                count += 1
                val = record.value
                if isinstance(val, dict) and count <= 3:
                    # For events, show dates
                    if store_name == "events":
                        samples.append(f"  Subject={val.get('Subject')}, Start={val.get('Start')}, id={str(val.get('id',''))[:30]}")
                    elif store_name in ("calendars", "calendarGroups"):
                        samples.append(f"  Keys: {list(val.keys())[:15]}")
                        samples.append(f"  Sample: {json.dumps({k: str(v)[:80] for k,v in list(val.items())[:8]}, default=str)}")
                    elif store_name == "syncState":
                        samples.append(f"  Keys: {list(val.keys())[:15]}")
                    else:
                        pass  # Skip other stores
        except Exception as e:
            samples.append(f"  ERROR: {e}")
        
        marker = " <<<" if store_name in ("events", "calendars", "calendarGroups", "syncState") else ""
        print(f"Store '{store_name}': {count} records{marker}")
        for s in samples:
            print(s)

wrapped.close()
shutil.rmtree(tmp_dir, ignore_errors=True)
