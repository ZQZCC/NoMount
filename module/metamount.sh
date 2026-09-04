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
BASE_DESC="基于 VFS 重定向的元模块"

echo "=== NoMount Injection | Started: $(date) ===" >> "$LOG_FILE"

if ! "$LOADER" version >/dev/null 2>&1; then
    echo "[FATAL] NoMount API not responding; skipping rule injection." >> "$LOG_FILE"
    rm -f "$BOOT_SEMAPHORE"
    exit 1
fi

if [ -f "$NOMOUNT_DATA/disable" ]; then
    echo "[INFO] Safe Mode active. Skipping rule injection." >> "$LOG_FILE"
    rm -f "$BOOT_SEMAPHORE"
    exit 0
fi

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
            find -L "$mod_path/$partition" \( -type d -o -type c -o -name ".replace" \) -exec sh "$MODDIR/rule-paths.sh" path "$mod_path" {} + 2>/dev/null | xargs -0 -r -n 200 "$LOADER" rule add --whiteout >> "$LOG_FILE" 2>&1

            find -L "$mod_path/$partition" \( -type f -o -type l \) ! -name ".replace" -exec sh "$MODDIR/rule-paths.sh" pair "$mod_path" {} + 2>/dev/null | xargs -0 -r -n 200 "$LOADER" rule add >> "$LOG_FILE" 2>&1
        fi
    done
done

echo "=== Injection Complete: $(date) ===" >> "$LOG_FILE"

rm -f "$BOOT_SEMAPHORE"
sed -i "s|^description=.*|description=$BASE_DESC|" "$PROP_FILE"

echo -e "\nCurrent files injected:" >> "$LOG_FILE"
"$LOADER" rule list >> "$LOG_FILE"

exit 0
