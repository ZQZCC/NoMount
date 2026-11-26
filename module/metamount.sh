#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/common.sh"

MODULES_DIR="/data/adb/modules"

[ -d "$NOMOUNT_DATA" ] || mkdir -p "$NOMOUNT_DATA"

if [ -f "$NOMOUNT_DATA/disable" ]; then
    exit 0
fi

if ! bootloop_check; then
    exit 1
fi

if ! ensure_lkm_loaded; then
    disable_module "❌ Kernel not patched or module failed to load"
    exit 1
fi

if ! _lock_acquire "$NOMOUNT_DATA/.inject.flock" 120; then
    klogerr "failed to acquire injection lock"
    exit 1
fi
trap 'exit 1' INT TERM

if [ -f "$NOMOUNT_DATA/.block_isolated_uids" ]; then
    "$LOADER" uid block_isolated on >/dev/null 2>&1 || klogerr "failed to enable isolated UID blocking"
fi
if [ -f "$NOMOUNT_DATA/.exclusion_list.json" ]; then
    uids=$(grep -o '"uid":"[0-9]*"' "$NOMOUNT_DATA/.exclusion_list.json" | cut -d'"' -f4)
    if [ -n "$uids" ]; then
        "$LOADER" uid add $uids >/dev/null 2>&1 || klogerr "failed to apply excluded UIDs"
    fi
fi

klog "Injection started"
status=0

for mod_path in "$MODULES_DIR"/*; do
    [ -d "$mod_path" ] || continue
    mod_name="${mod_path##*/}"
    [ "$mod_name" = "nomount" ] && continue

    if [ -f "$mod_path/disable" ] || [ -f "$mod_path/remove" ] || [ -f "$mod_path/skip_mount" ]; then
        klog "SKIPPED module $mod_name, it is disabled/removed/skipped"
        continue
    fi

    klog "loading module $mod_name"
    "$MODDIR/bin/nm" module load "$mod_path" || status=1
done

if [ "$status" -eq 0 ]; then
    klog "Injection completed"
    sed -i "s|^description=.*|description=$BASE_DESC|" "$PROP_FILE"
else
    klogerr "Injection completed with errors."
fi

exit "$status"
