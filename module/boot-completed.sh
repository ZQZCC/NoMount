#!/system/bin/sh
MODDIR=${0%/*}
. "$MODDIR/common.sh"

if [ -f "$BOOT_SEMAPHORE" ]; then
    rm -f "$BOOT_SEMAPHORE"
    klog "boot completed safely."
fi

exit 0
