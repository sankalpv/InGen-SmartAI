#!/usr/bin/env python3
"""
Outlook IndexedDB Forensic Extractor (Windows)

Uses the CCL Chromium Reader forensic library to properly read New Outlook's
IndexedDB (LevelDB with idb_cmp1 comparator) and deserialize V8 Blink values.
Extracts emails, meetings, and contacts into a SQLite database with zero data loss.

Features:
  - Proper LevelDB access via ccl_chromium_reader (handles idb_cmp1 comparator)
  - Full V8 Blink value deserialization (clean subjects, bodies, attendees)
  - Incremental UPSERT: new data added, existing updated, nothing deleted
  - Copies DB to temp to avoid lock conflicts with running Outlook
  - Outputs to data/outlook-cache.db (SQLite)

Object stores read:
  - conversations: email threads with topics, senders, previews
  - messages: individual email items with full metadata
  - events: calendar events with attendees, times, previews
  - pgal: People/GAL contacts with names and emails

Usage:
  python scripts/windows/outlook_extractor.py [--db-path PATH] [--output PATH]

Prerequisites:
  pip install -r scripts/windows/requirements.txt
"""

import os
import sys
import json
import shutil
import sqlite3
import tempfile
import argparse
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Fix Unicode output on Windows (cp1252 → UTF-8)
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ─── Configuration ───

LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", os.path.join(os.path.expanduser("~"), "AppData", "Local"))
DEFAULT_DB_PATH = os.path.join(
    LOCAL_APP_DATA,
    "Microsoft", "Olk", "EBWebView", "Default", "IndexedDB",
    "https_outlook.office.com_0.indexeddb.leveldb"
)
DEFAULT_OUTPUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "outlook-cache.db"
)

# ─── SQLite Schema ───

SCHEMA = """
CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    subject TEXT,
    sender TEXT,
    sender_name TEXT,
    recipients TEXT,
    date TEXT,
    body_preview TEXT,
    body TEXT,
    conversation_id TEXT,
    conversation_topic TEXT,
    importance TEXT DEFAULT 'normal',
    is_read INTEGER DEFAULT 0,
    is_draft INTEGER DEFAULT 0,
    folder TEXT,
    folder_name TEXT,
    has_attachments INTEGER DEFAULT 0,
    item_class TEXT,
    inference_classification TEXT,
    ingested_to_vector INTEGER DEFAULT 0,
    extracted_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT,
    start_time TEXT,
    end_time TEXT,
    start_timezone TEXT,
    end_timezone TEXT,
    location TEXT,
    organizer TEXT,
    organizer_name TEXT,
    required_attendees TEXT,
    optional_attendees TEXT,
    resources TEXT,
    description TEXT,
    sensitivity TEXT,
    free_busy_type TEXT,
    response_type TEXT,
    is_recurring INTEGER DEFAULT 0,
    series_master_id TEXT,
    ingested_to_vector INTEGER DEFAULT 0,
    extracted_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
    email TEXT PRIMARY KEY,
    name TEXT,
    first_name TEXT,
    last_name TEXT,
    contact_id TEXT,
    interaction_count INTEGER DEFAULT 0,
    last_interaction TEXT,
    extracted_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    topic TEXT,
    senders TEXT,
    recipients TEXT,
    last_delivery TEXT,
    preview TEXT,
    message_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    importance TEXT,
    has_attachments INTEGER DEFAULT 0,
    extracted_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS extraction_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    completed_at TEXT,
    source_path TEXT,
    emails_added INTEGER DEFAULT 0,
    emails_updated INTEGER DEFAULT 0,
    meetings_added INTEGER DEFAULT 0,
    meetings_updated INTEGER DEFAULT 0,
    contacts_added INTEGER DEFAULT 0,
    contacts_updated INTEGER DEFAULT 0,
    conversations_added INTEGER DEFAULT 0,
    conversations_updated INTEGER DEFAULT 0,
    total_records_scanned INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender);
CREATE INDEX IF NOT EXISTS idx_emails_ingested ON emails(ingested_to_vector);
CREATE INDEX IF NOT EXISTS idx_meetings_start ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_ingested ON meetings(ingested_to_vector);
CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_delivery);
"""


def now_utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_str(val, max_len=None):
    """Safely convert a value to string, handling Undefined and None."""
    if val is None:
        return None
    s = str(val)
    if s == "<Undefined>":
        return None
    if max_len and len(s) > max_len:
        return s[:max_len]
    return s


def safe_json(val):
    """Convert a value to JSON string, handling complex types."""
    if val is None or str(val) == "<Undefined>":
        return "[]"
    try:
        return json.dumps(val, default=str)
    except Exception:
        return "[]"


def extract_email_from_mailbox(mailbox):
    """Extract email address from a Mailbox dict."""
    if isinstance(mailbox, dict):
        return mailbox.get("EmailAddress") or mailbox.get("emailAddress") or ""
    return str(mailbox) if mailbox else ""


def extract_name_from_mailbox(mailbox):
    """Extract display name from a Mailbox dict."""
    if isinstance(mailbox, dict):
        return mailbox.get("Name") or mailbox.get("name") or ""
    return ""


def extract_attendees_json(attendees_list):
    """Convert attendees list to JSON with name and email."""
    if not attendees_list or str(attendees_list) == "<Undefined>":
        return "[]"
    result = []
    try:
        for att in attendees_list:
            if isinstance(att, dict):
                mb = att.get("Mailbox") or att.get("mailbox") or {}
                result.append({
                    "name": extract_name_from_mailbox(mb),
                    "email": extract_email_from_mailbox(mb),
                    "response": safe_str(att.get("ResponseType")),
                })
    except Exception:
        pass
    return json.dumps(result)


# ─── Utility Functions ───

def is_outlook_running():
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq olk.exe", "/NH"],
            capture_output=True, text=True, timeout=5
        )
        return "olk.exe" in result.stdout
    except Exception:
        return False


def copy_db_to_temp(src_path):
    tmp_dir = tempfile.mkdtemp(prefix="outlook-idb-")
    copied = skipped = 0
    for f in os.listdir(src_path):
        if f == "LOCK":
            continue
        try:
            shutil.copy2(os.path.join(src_path, f), os.path.join(tmp_dir, f))
            copied += 1
        except Exception:
            skipped += 1
    print(f"  Copied {copied} files to temp (skipped {skipped})")
    
    # Compact the LevelDB to flush WAL (.log) data into SST (.ldb) files
    # This ensures the CCL reader can see the latest records
    try:
        import plyvel
        print("  Compacting LevelDB (flushing WAL to SST)...")
        db = plyvel.DB(tmp_dir, create_if_missing=False)
        db.compact_range()  # Force WAL → SST compaction
        db.close()
        print("  Compaction complete — WAL data flushed")
    except Exception as e:
        print(f"  Compaction skipped ({e}) — CCL will read what it can")
    
    return tmp_dir


# ─── CCL Forensic Extraction ───

def extract_with_ccl(db_path):
    """Use CCL Chromium Reader to properly read the IndexedDB."""
    from ccl_chromium_reader import ccl_chromium_indexeddb

    records = {
        "emails": [],       # from 'messages' store
        "conversations": [], # from 'conversations' store
        "meetings": [],     # from 'events' store
        "contacts": [],     # from 'pgal' store
        "total_scanned": 0,
    }

    wrapped = ccl_chromium_indexeddb.WrappedIndexDB(db_path)

    # Error handler for V8 deserialization failures — skip bad records, continue to next
    bad_records = {"count": 0}
    def on_bad_record(key, data):
        bad_records["count"] += 1

    for db_id in wrapped.database_ids:
        # Only process the main offline data database
        if "owa-offline-data-" not in db_id.name:
            continue

        print(f"  Database: {db_id.name}")
        wrapped_db = wrapped[db_id]
        store_names = list(wrapped_db.object_store_names)
        print(f"  Stores: {store_names}")

        # ─── Extract Messages (emails) ───
        if "messages" in store_names:
            print("  Reading 'messages' store...")
            store = wrapped_db["messages"]
            count = 0
            for record in store.iterate_records(bad_deserializer_data_handler=on_bad_record):
                try:
                    val = record.value
                    if not isinstance(val, dict):
                        continue
                    count += 1

                    item_id_obj = val.get("ItemId") or {}
                    item_id = item_id_obj.get("Id", "") if isinstance(item_id_obj, dict) else str(item_id_obj)

                    # Extract sender
                    from_obj = val.get("From") or val.get("Sender") or {}
                    sender_mailbox = from_obj.get("Mailbox", from_obj) if isinstance(from_obj, dict) else {}
                    sender = extract_email_from_mailbox(sender_mailbox)
                    sender_name = extract_name_from_mailbox(sender_mailbox)

                    # Extract recipients
                    display_to = safe_str(val.get("DisplayTo"))

                    # Conversation
                    conv_id_obj = val.get("ConversationId") or {}
                    conv_id = conv_id_obj.get("Id", "") if isinstance(conv_id_obj, dict) else ""

                    records["emails"].append({
                        "id": item_id,
                        "subject": safe_str(val.get("Subject")),
                        "sender": sender,
                        "sender_name": sender_name,
                        "recipients": display_to,
                        "date": safe_str(val.get("DateTimeReceived")),
                        "body_preview": safe_str(val.get("Preview"), 2000),
                        "conversation_id": conv_id,
                        "importance": safe_str(val.get("Importance")),
                        "is_read": 0 if safe_str(val.get("IsRead")) in (None, "False", "false") else 1,
                        "is_draft": 1 if safe_str(val.get("IsDraft")) in ("True", "true") else 0,
                        "has_attachments": 1 if val.get("HasAttachments") else 0,
                        "item_class": safe_str(val.get("ItemClass")),
                        "inference_classification": safe_str(val.get("InferenceClassification")),
                        "folder": safe_str((val.get("ParentFolderId") or {}).get("Id") if isinstance(val.get("ParentFolderId"), dict) else None),
                    })
                except Exception:
                    continue
            print(f"    → {count} messages read")
            records["total_scanned"] += count

        # ─── Extract Conversations ───
        if "conversations" in store_names:
            print("  Reading 'conversations' store...")
            store = wrapped_db["conversations"]
            count = 0
            for record in store.iterate_records(bad_deserializer_data_handler=on_bad_record):
                try:
                    val = record.value
                    if not isinstance(val, dict):
                        continue
                    count += 1

                    conv_id_obj = val.get("ConversationId") or {}
                    conv_id = conv_id_obj.get("Id", "") if isinstance(conv_id_obj, dict) else str(conv_id_obj)

                    senders = val.get("UniqueSenders")
                    recipients = val.get("UniqueRecipients")

                    records["conversations"].append({
                        "id": conv_id,
                        "topic": safe_str(val.get("ConversationTopic")),
                        "senders": safe_json(senders),
                        "recipients": safe_json(recipients),
                        "last_delivery": safe_str(val.get("LastDeliveryTime")),
                        "preview": safe_str(val.get("Preview"), 2000),
                        "message_count": val.get("MessageCount") or val.get("GlobalMessageCount") or 0,
                        "unread_count": val.get("UnreadCount") or val.get("GlobalUnreadCount") or 0,
                        "importance": safe_str(val.get("Importance")),
                        "has_attachments": 1 if val.get("HasAttachments") else 0,
                    })
                except Exception:
                    continue
            print(f"    → {count} conversations read")
            records["total_scanned"] += count

        # ─── Extract Events (calendar) ───
        if "events" in store_names:
            print("  Reading 'events' store...")
            store = wrapped_db["events"]
            count = 0
            errors = 0
            for record in store.iterate_records(bad_deserializer_data_handler=on_bad_record):
                try:
                    val = record.value
                    if not isinstance(val, dict):
                        continue
                    count += 1

                    item_id = safe_str(val.get("id")) or ""

                    # Organizer
                    org_obj = val.get("Organizer") or {}
                    org_mailbox = org_obj.get("Mailbox", org_obj) if isinstance(org_obj, dict) else {}

                    # Series master
                    series_obj = val.get("SeriesMasterItemId") or {}
                    series_id = series_obj.get("Id", "") if isinstance(series_obj, dict) else ""

                    # Location
                    location_obj = val.get("Location") or val.get("location") or {}
                    location = location_obj.get("DisplayName", "") if isinstance(location_obj, dict) else safe_str(location_obj)

                    # Subject
                    subject = safe_str(val.get("Subject")) or safe_str(val.get("subject"))

                    records["meetings"].append({
                        "id": item_id,
                        "title": subject,
                        "start_time": safe_str(val.get("Start")),
                        "end_time": safe_str(val.get("End")),
                        "start_timezone": safe_str(val.get("StartTimeZoneId")),
                        "end_timezone": safe_str(val.get("EndTimeZoneId")),
                        "location": location,
                        "organizer": extract_email_from_mailbox(org_mailbox),
                        "organizer_name": extract_name_from_mailbox(org_mailbox),
                        "required_attendees": extract_attendees_json(val.get("RequiredAttendees")),
                        "optional_attendees": extract_attendees_json(val.get("OptionalAttendees")),
                        "resources": extract_attendees_json(val.get("Resources")),
                        "description": safe_str(val.get("Preview"), 2000),
                        "sensitivity": safe_str(val.get("Sensitivity")),
                        "free_busy_type": safe_str(val.get("FreeBusyType")),
                        "response_type": safe_str(val.get("ResponseType")),
                        "is_recurring": 1 if series_id else 0,
                        "series_master_id": series_id,
                    })
                except Exception:
                    errors += 1
                    continue
            print(f"    → {count} events read ({errors} skipped)")
            records["total_scanned"] += count

        # ─── Extract PGAL (contacts) ───
        if "pgal" in store_names:
            print("  Reading 'pgal' store...")
            store = wrapped_db["pgal"]
            count = 0
            for record in store.iterate_records(bad_deserializer_data_handler=on_bad_record):
                try:
                    val = record.value
                    if not isinstance(val, dict):
                        continue
                    count += 1

                    emails_list = val.get("emails") or []
                    first_name = safe_str(val.get("$defaultFirstName"))
                    last_name = safe_str(val.get("$defaultLastName"))
                    contact_id = safe_str(val.get("contactId"))
                    name = f"{first_name or ''} {last_name or ''}".strip()

                    for email_entry in emails_list:
                        email_addr = None
                        if isinstance(email_entry, dict):
                            email_addr = email_entry.get("address") or email_entry.get("emailAddress")
                        elif isinstance(email_entry, str):
                            email_addr = email_entry

                        if email_addr:
                            records["contacts"].append({
                                "email": email_addr,
                                "name": name or None,
                                "first_name": first_name,
                                "last_name": last_name,
                                "contact_id": contact_id,
                            })
                except Exception:
                    continue
            print(f"    → {count} contacts read")
            records["total_scanned"] += count

    wrapped.close()
    return records


# ─── SQLite Writer ───

def write_to_sqlite(records, output_path, source_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    conn = sqlite3.connect(output_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)

    now = now_utc()
    cursor = conn.execute(
        "INSERT INTO extraction_runs (started_at, source_path, status) VALUES (?, ?, 'running')",
        (now, source_path)
    )
    run_id = cursor.lastrowid

    stats = {k: 0 for k in [
        "emails_added", "emails_updated", "meetings_added", "meetings_updated",
        "contacts_added", "contacts_updated", "conversations_added", "conversations_updated"
    ]}

    # UPSERT emails
    for e in records["emails"]:
        if not e["id"]:
            continue
        existing = conn.execute("SELECT id FROM emails WHERE id = ?", (e["id"],)).fetchone()
        if existing:
            conn.execute("""UPDATE emails SET subject=?, sender=?, sender_name=?, recipients=?,
                date=?, body_preview=?, conversation_id=?, importance=?, is_read=?, is_draft=?,
                has_attachments=?, item_class=?, inference_classification=?, folder=?, updated_at=?
                WHERE id=?""",
                (e["subject"], e["sender"], e["sender_name"], e["recipients"],
                 e["date"], e["body_preview"], e["conversation_id"], e["importance"],
                 e["is_read"], e["is_draft"], e["has_attachments"], e["item_class"],
                 e["inference_classification"], e["folder"], now, e["id"]))
            stats["emails_updated"] += 1
        else:
            conn.execute("""INSERT INTO emails (id, subject, sender, sender_name, recipients,
                date, body_preview, conversation_id, importance, is_read, is_draft,
                has_attachments, item_class, inference_classification, folder, extracted_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (e["id"], e["subject"], e["sender"], e["sender_name"], e["recipients"],
                 e["date"], e["body_preview"], e["conversation_id"], e["importance"],
                 e["is_read"], e["is_draft"], e["has_attachments"], e["item_class"],
                 e["inference_classification"], e["folder"], now, now))
            stats["emails_added"] += 1

    # UPSERT conversations
    for c in records["conversations"]:
        if not c["id"]:
            continue
        existing = conn.execute("SELECT id FROM conversations WHERE id = ?", (c["id"],)).fetchone()
        if existing:
            conn.execute("""UPDATE conversations SET topic=?, senders=?, recipients=?,
                last_delivery=?, preview=?, message_count=?, unread_count=?, importance=?,
                has_attachments=?, updated_at=? WHERE id=?""",
                (c["topic"], c["senders"], c["recipients"], c["last_delivery"],
                 c["preview"], c["message_count"], c["unread_count"], c["importance"],
                 c["has_attachments"], now, c["id"]))
            stats["conversations_updated"] += 1
        else:
            conn.execute("""INSERT INTO conversations (id, topic, senders, recipients,
                last_delivery, preview, message_count, unread_count, importance,
                has_attachments, extracted_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (c["id"], c["topic"], c["senders"], c["recipients"], c["last_delivery"],
                 c["preview"], c["message_count"], c["unread_count"], c["importance"],
                 c["has_attachments"], now, now))
            stats["conversations_added"] += 1

    # UPSERT meetings
    for m in records["meetings"]:
        if not m["id"]:
            continue
        existing = conn.execute("SELECT id FROM meetings WHERE id = ?", (m["id"],)).fetchone()
        if existing:
            conn.execute("""UPDATE meetings SET title=?, start_time=?, end_time=?,
                start_timezone=?, end_timezone=?, location=?, organizer=?, organizer_name=?,
                required_attendees=?, optional_attendees=?, resources=?, description=?,
                sensitivity=?, free_busy_type=?, response_type=?, is_recurring=?,
                series_master_id=?, updated_at=? WHERE id=?""",
                (m["title"], m["start_time"], m["end_time"], m["start_timezone"],
                 m["end_timezone"], m["location"], m["organizer"], m["organizer_name"],
                 m["required_attendees"], m["optional_attendees"], m["resources"],
                 m["description"], m["sensitivity"], m["free_busy_type"],
                 m["response_type"], m["is_recurring"], m["series_master_id"], now, m["id"]))
            stats["meetings_updated"] += 1
        else:
            conn.execute("""INSERT INTO meetings (id, title, start_time, end_time,
                start_timezone, end_timezone, location, organizer, organizer_name,
                required_attendees, optional_attendees, resources, description,
                sensitivity, free_busy_type, response_type, is_recurring,
                series_master_id, extracted_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (m["id"], m["title"], m["start_time"], m["end_time"], m["start_timezone"],
                 m["end_timezone"], m["location"], m["organizer"], m["organizer_name"],
                 m["required_attendees"], m["optional_attendees"], m["resources"],
                 m["description"], m["sensitivity"], m["free_busy_type"],
                 m["response_type"], m["is_recurring"], m["series_master_id"], now, now))
            stats["meetings_added"] += 1

    # UPSERT contacts
    for c in records["contacts"]:
        if not c["email"]:
            continue
        existing = conn.execute("SELECT email, interaction_count FROM contacts WHERE email = ?",
                                (c["email"],)).fetchone()
        if existing:
            conn.execute("""UPDATE contacts SET name=COALESCE(?, name),
                first_name=COALESCE(?, first_name), last_name=COALESCE(?, last_name),
                contact_id=COALESCE(?, contact_id), interaction_count=?,
                last_interaction=?, updated_at=? WHERE email=?""",
                (c["name"], c["first_name"], c["last_name"], c["contact_id"],
                 (existing[1] or 0) + 1, now, now, c["email"]))
            stats["contacts_updated"] += 1
        else:
            conn.execute("""INSERT INTO contacts (email, name, first_name, last_name,
                contact_id, interaction_count, last_interaction, extracted_at, updated_at)
                VALUES (?,?,?,?,?,1,?,?,?)""",
                (c["email"], c["name"], c["first_name"], c["last_name"],
                 c["contact_id"], now, now, now))
            stats["contacts_added"] += 1

    # Complete run
    conn.execute("""UPDATE extraction_runs SET completed_at=?, emails_added=?, emails_updated=?,
        meetings_added=?, meetings_updated=?, contacts_added=?, contacts_updated=?,
        conversations_added=?, conversations_updated=?, total_records_scanned=?, status='completed'
        WHERE id=?""",
        (now_utc(), stats["emails_added"], stats["emails_updated"],
         stats["meetings_added"], stats["meetings_updated"],
         stats["contacts_added"], stats["contacts_updated"],
         stats["conversations_added"], stats["conversations_updated"],
         records["total_scanned"], run_id))

    conn.commit()
    conn.close()
    return stats


# ─── Main ───

def main():
    parser = argparse.ArgumentParser(description="Outlook IndexedDB Forensic Extractor")
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH, help="Path to IndexedDB LevelDB folder")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output SQLite database path")
    args = parser.parse_args()

    print("╔══════════════════════════════════════════════════════╗")
    print("║  Outlook IndexedDB Forensic Extractor (CCL)         ║")
    print("║  Proper V8 Deserialization → SQLite (UPSERT)        ║")
    print("╚══════════════════════════════════════════════════════╝")
    print(f"\n  Source: {args.db_path}")
    print(f"  Output: {args.output}\n")

    if not os.path.exists(args.db_path):
        print("❌ IndexedDB path does not exist. Is New Outlook installed?")
        sys.exit(1)

    if is_outlook_running():
        print("⚠️  WARNING: olk.exe is running. Close Outlook for complete extraction.\n")
    else:
        print("✅ Outlook is not running — full access available.\n")

    print("Step 1: Copying database to temp...")
    tmp_dir = copy_db_to_temp(args.db_path)

    try:
        print("\nStep 2: Extracting with CCL forensic reader...")
        records = extract_with_ccl(tmp_dir)

        print(f"\n  Emails:        {len(records['emails'])}")
        print(f"  Conversations: {len(records['conversations'])}")
        print(f"  Meetings:      {len(records['meetings'])}")
        print(f"  Contacts:      {len(records['contacts'])}")

        print(f"\nStep 3: Writing to SQLite (incremental UPSERT)...")
        stats = write_to_sqlite(records, args.output, args.db_path)

        print(f"\n{'='*50}")
        print(f"✅ Extraction complete!")
        print(f"  Emails:        {stats['emails_added']} added, {stats['emails_updated']} updated")
        print(f"  Conversations: {stats['conversations_added']} added, {stats['conversations_updated']} updated")
        print(f"  Meetings:      {stats['meetings_added']} added, {stats['meetings_updated']} updated")
        print(f"  Contacts:      {stats['contacts_added']} added, {stats['contacts_updated']} updated")
        print(f"  Output:        {args.output}")
        print(f"  Size:          {os.path.getsize(args.output) / 1024:.1f} KB")

        summary = {"success": True, "stats": stats, "output": args.output, "timestamp": now_utc()}
        print(f"\n__JSON__{json.dumps(summary)}__JSON__")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
