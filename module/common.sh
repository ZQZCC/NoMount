#!/system/bin/sh
# Shared helpers for NoMount scripts

NOMOUNT_DATA="/data/adb/nomount"
LOG_FILE="$NOMOUNT_DATA/nomount.log"
LOADER="$MODDIR/bin/nm"
BOOT_SEMAPHORE="$NOMOUNT_DATA/.booting"
PROP_FILE="$MODDIR/module.prop"
BASE_DESC="基于 VFS 重定向的元模块"

disable_module() {
    touch "$NOMOUNT_DATA/disable"
    sed -i "s|^description=.*|description=[$1] \\\\n$BASE_DESC|" "$PROP_FILE"
    rm -f "$BOOT_SEMAPHORE"
}

find_root_insmod() {
    local cmd
    for cmd in ksud apd; do
        if command -v "$cmd" >/dev/null 2>&1 && "$cmd" -h 2>&1 | grep -qE '(^|[[:space:]])insmod([[:space:]]|$)'; then
            echo "$cmd"
            return
        fi
    done
}

load_ko() {
    local root_cmd
    root_cmd=$(find_root_insmod)

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

_lock_fd() {
    local fd="$1" timeout="$2" n=0
    while ! flock -n "$fd"; do
        n=$((n + 1))
        [ "$n" -ge "$timeout" ] && return 1
        sleep 1
    done
    return 0
}

bootloop_check() {
    exec 8>"$NOMOUNT_DATA/.boot.lock"
    if ! _lock_fd 8 15; then
        echo "[FATAL] boot lock timeout after 15s" >> "$LOG_FILE"
        exec 8>&-
        return 1
    fi

    local current="" prev="MISSING"
    IFS= read -r current 2>/dev/null < /proc/sys/kernel/random/boot_id
    [ -z "$current" ] && current="fallback-$(date +%s)"

    if [ -f "$BOOT_SEMAPHORE" ] && [ -s "$BOOT_SEMAPHORE" ]; then
        IFS= read -r prev 2>/dev/null < "$BOOT_SEMAPHORE"
        if [ "$prev" != "$current" ]; then
            echo "[FATAL] Bootloop detected (prev=$prev current=$current)" >> "$LOG_FILE"
            exec 8>&-
            disable_module "🚨 DISABLED: Bootloop Prevented"
            return 1
        fi
    else
        echo "=== NoMount Boot Log | Started: $(date) ===" > "$LOG_FILE"
        echo "Kernel Version: $(uname -r)" >> "$LOG_FILE"
        echo "$current" > "$BOOT_SEMAPHORE"
    fi

    exec 8>&-
    return 0
}

ensure_lkm_loaded() {
    exec 7>"$NOMOUNT_DATA/.lkm.lock"
    if ! _lock_fd 7 60; then
        echo "[FATAL] LKM lock timeout after 60s" >> "$LOG_FILE"
        exec 7>&-
        return 1
    fi

    if "$LOADER" version >/dev/null 2>&1; then
        exec 7>&-
        return 0
    fi

    echo "[INFO] Loading LKM..." >> "$LOG_FILE"
    if ! load_ko "$MODDIR/lkm/nomount.ko"; then
        echo "[FATAL] LKM load failed" >> "$LOG_FILE"
        exec 7>&-
        return 1
    fi
    echo "[INFO] LKM loaded and initialized correctly." >> "$LOG_FILE"
    exec 7>&-
    return 0
}
