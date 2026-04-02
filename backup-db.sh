#!/bin/bash
# ALiSiO PMS — Database Backup Script
# Runs daily via cron to back up the SQLite database
# 
# Setup on server:
#   chmod +x /root/projects/alisio-pms/backup-db.sh
#   crontab -e
#   # Add: 0 3 * * * /root/projects/alisio-pms/backup-db.sh
#   (runs daily at 3:00 AM)

set -e

DB_PATH="/root/projects/alisio-pms/data/alisio.db"
BACKUP_DIR="/root/projects/alisio-pms/backups"
KEEP_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Timestamp for filename
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/alisio_${TIMESTAMP}.db"

# Use SQLite .backup for a safe, consistent copy (even while DB is in use)
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Compress the backup
gzip "$BACKUP_FILE"

echo "✅ Backup created: ${BACKUP_FILE}.gz ($(du -h "${BACKUP_FILE}.gz" | cut -f1))"

# Remove backups older than $KEEP_DAYS days
find "$BACKUP_DIR" -name "alisio_*.db.gz" -mtime +$KEEP_DAYS -delete

echo "🗑️ Old backups (>$KEEP_DAYS days) cleaned up"
