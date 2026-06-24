#!/usr/bin/env bash
set -euo pipefail

# ====================================================================
#  OMS Platform - Backup Script (runs on QNAP)
#  Pulls full project data from Tencent Cloud server to local QNAP NAS
#
#  Usage:
#    1. Place this script on QNAP, e.g. /share/MD0_DATA/backup/scripts/
#    2. Add a scheduled task in QNAP Control Panel
#    3. Edit the CONFIG section below to match your paths
#
#  Prerequisite: SSH key-based auth from QNAP to server (see setup guide)
# ====================================================================

# -- CONFIG ----------------------------------------------------------
SSH_HOST="lighthouse@110.40.170.193"              # SSH target (user@ip or ~/.ssh/config alias)
REMOTE_ROOT="/opt/oms"                           # Project root on server
DB_CONTAINER="oms-mysql"                         # Database container name
DB_NAME="oms_platform"                            # Database name

BACKUP_ROOT="/share/Public/OMS_BAK"               # QNAP backup root
MIRROR_DIR="$BACKUP_ROOT/latest"                 # rsync mirror dir (incremental)
ARCHIVE_DIR="$BACKUP_ROOT/archives"              # Archive dir (compressed snapshots)
LOG_FILE="$BACKUP_ROOT/backup.log"               # Log file

RETENTION_DAYS=30                                # Archive retention in days
# --------------------------------------------------------------------

# -- Logging ---------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"; }
ok()   { echo -e "${GREEN}  [OK] $*${NC}" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}  [!]  $*${NC}" | tee -a "$LOG_FILE" >&2; }
fail() { echo -e "${RED}  [X]  $*${NC}" | tee -a "$LOG_FILE" >&2; }

# -- Init ------------------------------------------------------------
mkdir -p "$MIRROR_DIR" "$ARCHIVE_DIR"
touch "$LOG_FILE"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
ARCHIVE_NAME="oms-backup-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="$ARCHIVE_DIR/$ARCHIVE_NAME"

ERRORS=0

log "=================================================="
log "OMS Platform backup started - $TIMESTAMP"
log "=================================================="

# -- Step 1: Pre-flight checks ---------------------------------------
log "[1/5] Pre-flight checks"

if ! ssh -o ConnectTimeout=10 "$SSH_HOST" "true" 2>/dev/null; then
  fail "SSH connection to $SSH_HOST failed, check key config"
  fail "Backup aborted"
  exit 1
fi
ok "SSH connection OK"

CONTAINER_STATUS=$(ssh "$SSH_HOST" "docker inspect --format '{{.State.Status}}' $DB_CONTAINER 2>/dev/null || echo 'missing'")
if [ "$CONTAINER_STATUS" != "running" ]; then
  fail "DB container $DB_CONTAINER status: $CONTAINER_STATUS"
  fail "Backup aborted"
  exit 1
fi
ok "DB container running"

# -- Step 2: Database dump ------------------------------------------
log "[2/5] Database export (mariadb-dump)"

DB_DUMP="$MIRROR_DIR/db-${TIMESTAMP}.sql.gz"

# mariadb-dump runs inside the container; password stays in container env,
# piped through SSH to local gzip
if ssh "$SSH_HOST" \
  "docker exec $DB_CONTAINER sh -c 'mariadb-dump --single-transaction --routines --triggers --hex-blob -uroot -p\"\$MARIADB_ROOT_PASSWORD\" $DB_NAME'" \
  2>/dev/null | gzip > "$DB_DUMP"; then

  DUMP_SIZE=$(stat -c%s "$DB_DUMP" 2>/dev/null || stat -f%z "$DB_DUMP" 2>/dev/null || echo 0)
  if [ "$DUMP_SIZE" -lt 100 ]; then
    fail "DB dump too small (${DUMP_SIZE} bytes), likely failed"
    rm -f "$DB_DUMP"
    ERRORS=$((ERRORS + 1))
  else
    ok "DB export done - $(du -h "$DB_DUMP" | cut -f1)"
    # Keep only the latest dump
    find "$MIRROR_DIR" -name "db-*.sql.gz" ! -name "$(basename "$DB_DUMP")" -delete 2>/dev/null || true
  fi
else
  fail "DB export failed"
  rm -f "$DB_DUMP"
  ERRORS=$((ERRORS + 1))
fi

# -- Step 3: File sync (rsync) ---------------------------------------
log "[3/5] File sync (rsync)"

# Sync user uploads
if rsync -az --delete \
  --timeout=300 \
  "$SSH_HOST:$REMOTE_ROOT/data/uploads/" \
  "$MIRROR_DIR/uploads/" 2>>"$LOG_FILE"; then
  ok "Uploads synced - $(du -sh "$MIRROR_DIR/uploads/" 2>/dev/null | cut -f1)"
else
  warn "Uploads sync had warnings/errors"
  ERRORS=$((ERRORS + 1))
fi

# Sync app code (frontend static + backend source)
if rsync -az --delete \
  --timeout=300 \
  --exclude='node_modules' \
  --exclude='.git' \
  "$SSH_HOST:$REMOTE_ROOT/app/" \
  "$MIRROR_DIR/app/" 2>>"$LOG_FILE"; then
  ok "App code synced - $(du -sh "$MIRROR_DIR/app/" 2>/dev/null | cut -f1)"
else
  warn "App code sync had warnings/errors"
  ERRORS=$((ERRORS + 1))
fi

# Sync config files
mkdir -p "$MIRROR_DIR/config"
for f in Caddyfile docker-compose.yml; do
  if rsync -az \
    "$SSH_HOST:$REMOTE_ROOT/$f" \
    "$MIRROR_DIR/config/$f" 2>>"$LOG_FILE"; then
    ok "Config synced: $f"
  else
    warn "Config sync failed: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

# -- Step 4: Create archive snapshot ---------------------------------
log "[4/5] Create archive snapshot"

if tar czf "$ARCHIVE_PATH" \
  -C "$BACKUP_ROOT" \
  latest/ 2>>"$LOG_FILE"; then
  ok "Archive created - $(du -h "$ARCHIVE_PATH" | cut -f1) -> $ARCHIVE_NAME"
else
  fail "Archive creation failed"
  rm -f "$ARCHIVE_PATH"
  ERRORS=$((ERRORS + 1))
fi

# -- Step 5: Clean old archives --------------------------------------
log "[5/5] Clean old archives (keep ${RETENTION_DAYS} days)"

DELETED_COUNT=$(find "$ARCHIVE_DIR" -name "oms-backup-*.tar.gz" -mtime +"$RETENTION_DAYS" -delete -print 2>/dev/null | wc -l)
REMAINING=$(find "$ARCHIVE_DIR" -name "oms-backup-*.tar.gz" 2>/dev/null | wc -l)
ok "Deleted ${DELETED_COUNT} old archives, ${REMAINING} remaining"

# -- Summary ---------------------------------------------------------
log "=================================================="
MIRROR_SIZE=$(du -sh "$MIRROR_DIR" 2>/dev/null | cut -f1)
ARCHIVE_SIZE=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1)
TOTAL_SIZE=$(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)

log "Backup finished"
log "  Mirror:   $MIRROR_DIR ($MIRROR_SIZE)"
log "  Archive:  $ARCHIVE_DIR ($ARCHIVE_SIZE)"
log "  Total:    $BACKUP_ROOT ($TOTAL_SIZE)"
log "  Errors:   $ERRORS"

if [ "$ERRORS" -gt 0 ]; then
  warn "Backup completed with $ERRORS error(s), check log: $LOG_FILE"
  exit 1
else
  ok "All steps completed successfully"
fi
log "=================================================="
log ""
