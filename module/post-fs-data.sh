#!/system/bin/sh

MODDIR=${0%/*}
LOADER="$MODDIR/bin/nm"
NOMOUNT_DATA="/data/adb/nomount"
LOG_FILE="$NOMOUNT_DATA/nomount.log"
BOOT_SEMAPHORE="$NOMOUNT_DATA/.booting"
PROP_FILE="$MODDIR/module.prop"
BASE_DESC="基于 VFS 重定向的元模块"

load_ko() {
    local root_cmd=""
    if command -v ksud >/dev/null 2>&1 && ksud -h 2>&1 | grep -qE '(^|[[:space:]])insmod([[:space:]]|$)'; then root_cmd="ksud"
    elif command -v apd >/dev/null 2>&1 && apd -h 2>&1 | grep -qE '(^|[[:space:]])insmod([[:space:]]|$)'; then root_cmd="apd"; fi

    if [ -n "$root_cmd" ]; then
        if "$root_cmd" insmod "$1" >> "$LOG_FILE" 2>&1 && "$LOADER" version >/dev/null 2>&1; then 
            return 0
        fi
        echo "[WARN] $root_cmd insmod failed; falling back to lkmloader." >> "$LOG_FILE"
        rmmod nomount 2>/dev/null
    fi

    if ! { "$MODDIR/lkm/lkmloader" "$1" >> "$LOG_FILE" 2>&1 && "$LOADER" version >/dev/null 2>&1; }; then
        echo "[FATAL] lkmloader failed; LKM hasn't been loaded." >> "$LOG_FILE"
        return 1
    fi

    return 0
}

[ -d "$NOMOUNT_DATA" ] || mkdir -p "$NOMOUNT_DATA"

echo "=== NoMount Boot Log | Started: $(date) ===" > "$LOG_FILE"
echo "Kernel Version: $(uname -r)" >> "$LOG_FILE"

if [ -f "$NOMOUNT_DATA/disable" ]; then
    echo "[INFO] Safe Mode active. Skipping NoMount initialization." >> "$LOG_FILE"
    sed -i "s|^description=.*|description=[🛡️ SAFE MODE: Injection Disabled] \\\\n$BASE_DESC|" "$PROP_FILE"
    rm -f "$BOOT_SEMAPHORE"
    exit 0
fi

if [ -f "$BOOT_SEMAPHORE" ]; then
    echo "[FATAL] Bootloop detected! NoMount caused a crash on the last boot." >> "$LOG_FILE"
    touch "$NOMOUNT_DATA/disable"
    sed -i "s|^description=.*|description=[🚨 DISABLED: Bootloop Prevented] \\\\n$BASE_DESC|" "$PROP_FILE"
    rm -f "$BOOT_SEMAPHORE"
    exit 1
fi

touch "$BOOT_SEMAPHORE"

echo "[INFO] Checking NoMount kernel support..." >> "$LOG_FILE"
if "$LOADER" version > /dev/null 2>&1; then
    echo "[INFO] Built-in Kernel support detected." >> "$LOG_FILE"
else
    echo "[INFO] Built-in not found. Attempting to load LKM..." >> "$LOG_FILE"
    if [ ! -f "$MODDIR/lkm/nomount.ko" ] || ! load_ko "$MODDIR/lkm/nomount.ko" >> "$LOG_FILE" 2>&1; then
        echo "[FATAL] NoMount Internal API is missing/unresponsive." >> "$LOG_FILE"
        touch "$MODDIR/disable"
        sed -i "s|^description=.*|description=[❌ ERROR: Kernel not patched or module failed to load] \\\\n$BASE_DESC|" "$PROP_FILE"
        rm -f "$BOOT_SEMAPHORE"
        exit 1
    fi
    echo "[INFO] LKM loaded and initialized correctly." >> "$LOG_FILE"
fi

echo "[OK] Kernel API ready." >> "$LOG_FILE"
exit 0
