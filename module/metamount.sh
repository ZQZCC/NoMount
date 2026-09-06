#!/system/bin/sh

MODDIR=${0%/*}
LOADER="$MODDIR/bin/nm"
MODULES_DIR="/data/adb/modules"
NOMOUNT_DATA="/data/adb/nomount"
LOG_FILE="$NOMOUNT_DATA/nomount.log"
BOOT_SEMAPHORE="$NOMOUNT_DATA/.booting"
TARGET_PARTITIONS="system system_ext vendor odm product apex oem optics prism
                    mi_ext my_bigball my_carrier my_company my_engineering my_heytap
                    my_manifest my_preload my_product my_region my_reserve my_stock"
PROP_FILE="$MODDIR/module.prop"
BASE_DESC="A metamodule that replaces OverlayFS/MagicMount with VFS path redirection."

load_ko() {
    if command -v ksud >/dev/null 2>&1 && ksud -h 2>&1 | grep -qE '(^|[[:space:]])insmod([[:space:]]|$)'; then
        if ksud insmod "$1" >> "$LOG_FILE" && "$LOADER" version >/dev/null 2>&1; then return 0; fi
        echo "[WARN] ksud insmod failed; falling back to lkmloader." >> "$LOG_FILE"
        rmmod nomount 2>/dev/null
    fi

    if ! { "$MODDIR/lkm/lkmloader" "$1" >> "$LOG_FILE" 2>&1 && "$LOADER" version >/dev/null 2>&1; }; then
        echo "[FATAL] lkmloader failed; LKM hasn't been loaded." >> "$LOG_FILE"
        return 1
    fi

    return 0
}

if [ ! -d "$NOMOUNT_DATA" ]; then
    mkdir -p "$NOMOUNT_DATA"
fi

echo "=== NoMount Boot Log | Started: $(date) ===" > "$LOG_FILE"
echo "Kernel Version: $(uname -r)" >> "$LOG_FILE"

if [ -f "$BOOT_SEMAPHORE" ]; then
    echo "[FATAL] Bootloop detected! NoMount caused a crash on the last boot." >> "$LOG_FILE"
    echo "[INFO] Disabling NoMount for safety..." >> "$LOG_FILE"
    touch "$MODDIR/disable"
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
echo "[OK] Internal API responding properly." >> "$LOG_FILE"

for mod_path in "$MODULES_DIR"/*; do
    [ -d "$mod_path" ] || continue
    mod_name="${mod_path##*/}"
    [ "$mod_name" = "nomount" ] && continue

    if [ -f "$mod_path/disable" ] || [ -f "$mod_path/remove" ] || [ -f "$mod_path/skip_mount" ]; then
        echo "[SKIP] Module $mod_name is disabled/removed/skipped" >> "$LOG_FILE"; continue
    fi

    for partition in $TARGET_PARTITIONS; do
        if [ -d "$mod_path/$partition" ]; then
            [ -d "/$partition" ] || [ -d "/system/$partition" ] || continue
            echo "[INFO] Mounting module: $mod_name (/$partition)" >> "$LOG_FILE"
            find -L "$mod_path/$partition" \( -type d -o -type c -o -name ".replace" \) -exec sh -c '
                for f do
                    v="${f#'"$mod_path"'}"; [ "${v#/system/odm/}" != "$v" ] && v="/odm/${v#/system/odm/}"
                    if [ -d "$f" ]; then case "$(getfattr -n trusted.overlay.opaque "$f" 2>/dev/null)" in *"=\"y\""*) printf "%s\0" "$v";; esac
                    elif [ "${f##*/}" = ".replace" ]; then printf "%s\0" "${v%/.replace}"
                    else printf "%s\0" "$v"; fi
                done
            ' _ {} + 2>/dev/null | xargs -0 -r "$LOADER" rule add --whiteout >> "$LOG_FILE" 2>&1

            find -L "$mod_path/$partition" \( -type f -o -type l \) ! -name ".replace" -exec sh -c '
                for f do
                    v="${f#'"$mod_path"'}"; [ "${v#/system/odm/}" != "$v" ] && v="/odm/${v#/system/odm/}"
                    printf "%s\0%s\0" "$v" "$f"
                done
            ' _ {} + 2>/dev/null | xargs -0 -r "$LOADER" rule add >> "$LOG_FILE" 2>&1
        fi
    done
done

echo "=== Injection Complete: $(date) ===" >> "$LOG_FILE"

# NOTE: moved to boot-completed.sh
# rm -f "$BOOT_SEMAPHORE"
# echo "[OK] Boot phase completed safely." >> "$LOG_FILE"
sed -i "s|^description=.*|description=$BASE_DESC|" "$PROP_FILE"

echo -e "\nCurrent files injected:" >> "$LOG_FILE"
"$LOADER" rule list >> "$LOG_FILE"

exit 0
