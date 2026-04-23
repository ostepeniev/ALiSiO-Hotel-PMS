"""
One-time migration script — run on the VPS via SSH.
Copies all existing reservation_guests → guest_registrations (for PMS dashboard visibility)
and sends them to Google Sheets via the same endpoint the bot uses.

Usage on VPS:
  cd /home/deploy/alisio-bot && python3 migrate_guest_registrations.py

OR directly via node on the PMS server:
  node scripts/migrate_registrations.js
"""
