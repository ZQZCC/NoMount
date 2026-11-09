#!/system/bin/sh

NOMOUNT_DATA="/data/adb/nomount"
LOG_FILE="$NOMOUNT_DATA/nomount.log"
BOOT_SEMAPHORE="$NOMOUNT_DATA/.booting"

if [ -f "$BOOT_SEMAPHORE" ]; then
    rm -f "$BOOT_SEMAPHORE" \
          "$NOMOUNT_DATA/.boot.lock" \
          "$NOMOUNT_DATA/.lkm.lock" \
          "$NOMOUNT_DATA/.inject.lock"
    echo "[OK] Boot completed safely." >> "$LOG_FILE"
fi

exit 0
