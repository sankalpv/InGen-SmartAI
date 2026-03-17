import os
src = os.path.join(os.environ["LOCALAPPDATA"], "Microsoft", "Olk", "EBWebView", "Default", "IndexedDB", "https_outlook.office.com_0.indexeddb.leveldb")
files = sorted(os.listdir(src))
log_files = [f for f in files if f.endswith(".log")]
ldb_files = [f for f in files if f.endswith(".ldb")]
print(f"Total files: {len(files)}")
print(f"LDB files: {len(ldb_files)}")
print(f"LOG files: {len(log_files)}")
for f in log_files:
    size = os.path.getsize(os.path.join(src, f))
    print(f"  {f}: {size:,} bytes")
print(f"LOCK exists: {'LOCK' in files}")

# Check the DATA_FILE_PATTERN from CCL
import re
pattern = r"\d{6}\.(ldb|log|sst)"
matching = [f for f in files if re.match(pattern, f)]
non_matching = [f for f in files if not re.match(pattern, f) and f not in ("LOCK", "LOG", "CURRENT") and not f.startswith("MANIFEST")]
print(f"\nFiles matching CCL pattern: {len(matching)}")
print(f"Non-matching files: {non_matching}")
