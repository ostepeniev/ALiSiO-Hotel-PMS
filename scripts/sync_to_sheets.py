#!/usr/bin/env python3
"""
Sync all reservation_guests from last 10 days to Google Sheets.
Uses the same aiohttp/requests approach as the Telegram bot.
Run: python3 scripts/sync_to_sheets.py
"""
import json
import os
import sys
import time
import sqlite3
import urllib.request
import urllib.error
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'alisio.db')
GOOGLE_URL = os.environ.get('GOOGLE_GUESTS_SCRIPT_URL', '')
DAYS_BACK = int(os.environ.get('DAYS_BACK', '10'))

if not GOOGLE_URL:
    print('ERROR: GOOGLE_GUESTS_SCRIPT_URL not set')
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

since = (datetime.now() - timedelta(days=DAYS_BACK)).strftime('%Y-%m-%d %H:%M:%S')
cur.execute('''
    SELECT rg.id, rg.first_name, rg.last_name, rg.document_number, rg.document_type,
           rg.nationality, rg.date_of_birth, rg.address, rg.created_at,
           r.check_in, r.check_out
    FROM reservation_guests rg
    JOIN reservations r ON rg.reservation_id = r.id
    WHERE rg.created_at >= ?
    ORDER BY rg.created_at ASC
''', (since,))

rows = cur.fetchall()
print(f'[sheets] Found {len(rows)} guests to sync (since {since})')

sent = 0
errors = 0

for row in rows:
    try:
        ci = datetime.strptime(row['check_in'], '%Y-%m-%d') if row['check_in'] else None
        co = datetime.strptime(row['check_out'], '%Y-%m-%d') if row['check_out'] else None
        nights = max(0, (co - ci).days) if ci and co else 0
    except Exception:
        nights = 0

    payload = {
        'action': 'guest',
        'full_name': f"{row['last_name']} {row['first_name']}".strip(),
        'surname': row['last_name'] or '',
        'first_name': row['first_name'] or '',
        'birth_date': row['date_of_birth'] or '',
        'doc_type': row['document_type'] or '',
        'doc_number': row['document_number'] or '',
        'country_code': '',
        'nationality': row['nationality'] or '',
        'address': row['address'] or '',
        'visa_number': '',
        'check_in': row['check_in'] or '',
        'check_out': row['check_out'] or '',
        'nights': nights,
        'is_foreigner': 'Tak',
        'tax_amount': 0,
        'exempt_reason': '',
        'purpose': '',
        'note': '[Migrated from guest portal web registration]',
    }

    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        GOOGLE_URL,
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = resp.read().decode('utf-8', errors='ignore')[:200]
            if resp.status == 200 and 'error' not in resp_body.lower():
                sent += 1
                print(f"[sheets] ✅ {payload['full_name']} | {payload['check_in']} → {payload['check_out']}")
            else:
                errors += 1
                print(f"[sheets] ❌ {payload['full_name']} status={resp.status} body={resp_body[:80]}")
    except urllib.error.HTTPError as e:
        errors += 1
        print(f"[sheets] ❌ HTTP {e.code} for {payload['full_name']}: {e.reason}")
    except Exception as e:
        errors += 1
        print(f"[sheets] ❌ ERROR for {payload['full_name']}: {e}")

    time.sleep(0.7)

print(f'\n[sheets] Done: {sent} sent, {errors} errors')
conn.close()
