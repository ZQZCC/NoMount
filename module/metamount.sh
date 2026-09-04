#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/common.sh"

MODULES_DIR="/data/adb/modules"
TARGET_PARTITIONS="system system_ext vendor odm product apex oem optics prism
                    mi_ext my_bigball my_carrier my_company my_engineering my_heytap
                    my_manifest my_preload my_product my_region my_reserve my_stock"

[ -d "$NOMOUNT_DATA" ] || mkdir -p "$NOMOUNT_DATA"

if [ -f "$NOMOUNT_DATA/disable" ]; then
    exit 0
fi

if ! bootloop_check; then
    exit 1
fi

if ! ensure_lkm_loaded; then
    disable_module "❌ ERROR: Kernel not patched or module failed to load"
    exit 1
fi

exec 6>"$NOMOUNT_DATA/.inject.lock"
if ! _lock_fd 6 120; then
    echo "[FATAL] inject lock timeout after 120s" >> "$LOG_FILE"
    exec 6>&-
    exit 1
fi

echo "=== NoMount Injection | Started: $(date) ===" >> "$LOG_FILE"

for mod_path in "$MODULES_DIR"/*; do
    [ -d "$mod_path" ] || continue
    mod_name="${mod_path##*/}"
    [ "$mod_name" = "nomount" ] && continue

    if [ -f "$mod_path/disable" ] || [ -f "$mod_path/remove" ] || [ -f "$mod_path/skip_mount" ]; then
        echo "[SKIP] Module $mod_name is disabled/removed/skipped" >> "$LOG_FILE"
        continue
    fi

    for partition in $TARGET_PARTITIONS; do
        if [ -d "$mod_path/$partition" ]; then
            [ -d "/$partition" ] || [ -d "/system/$partition" ] || continue
            echo "[INFO] Mounting module: $mod_name (/$partition)" >> "$LOG_FILE"
            find -L "$mod_path/$partition" \( -type d -o -type c -o -name ".replace" -o -name ".remove" \) \
                -exec sh "$MODDIR/rule-paths.sh" path "$mod_path" {} + 2>/dev/null \
                | xargs -0 -r -n 200 "$LOADER" rule add --whiteout >> "$LOG_FILE" 2>&1

            find -L "$mod_path/$partition" \( -type d -o -name ".replace" \) \
                -exec sh "$MODDIR/rule-paths.sh" opaque "$mod_path" {} + 2>/dev/null \
                | xargs -0 -r -n 200 "$LOADER" rule add --opaque >> "$LOG_FILE" 2>&1

            find -L "$mod_path/$partition" \( -type f -o -type l \) ! -name ".replace" ! -name ".remove" \
                -exec sh "$MODDIR/rule-paths.sh" pair "$mod_path" {} + 2>/dev/null \
                | xargs -0 -r -n 200 "$LOADER" rule add >> "$LOG_FILE" 2>&1
        fi
    done
done

echo "=== Injection Complete: $(date) ===" >> "$LOG_FILE"
sed -i "s|^description=.*|description=$BASE_DESC|" "$PROP_FILE"

printf '\nCurrent files injected:\n' >> "$LOG_FILE"
"$LOADER" rule list >> "$LOG_FILE"

exec 6>&-
exit 0
