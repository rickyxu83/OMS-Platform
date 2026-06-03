function startDeviceModelCatalogScheduler() {
  const cronExpr = process.env.DEVICE_MODEL_SYNC_CRON
  const providerName = process.env.DEVICE_MODEL_SYNC_PROVIDER || 'fixture'
  if (!cronExpr) { console.log('[device-model-catalog] DEVICE_MODEL_SYNC_CRON not set; scheduler disabled'); return }
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length < 5 || parts.length > 6) {
    console.error('[device-model-catalog] Invalid DEVICE_MODEL_SYNC_CRON "' + cronExpr + '"; scheduler disabled')
    return
  }
  console.log('[device-model-catalog] Scheduler configured: ' + cronExpr + ' provider=' + providerName)
}
module.exports = { startDeviceModelCatalogScheduler }
