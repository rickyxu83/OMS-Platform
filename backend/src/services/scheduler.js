const cron = require('node-cron')
const { query } = require('../config/db')
const { getSettings } = require('../modules/settings/store')
const { sendMaintenanceExpiryMail, sendInspectionReminderMail } = require('./mail')

async function notificationSettings() {
  const saved = await getSettings([
    'notification.maintenanceExpiryEnabled',
    'notification.maintenanceExpiryDays',
    'notification.maintenanceExpiryRecipients',
    'notification.inspectionReminderEnabled',
    'notification.inspectionReminderDays',
  ])
  return {
    maintenanceExpiryEnabled: saved['notification.maintenanceExpiryEnabled'] !== 'false',
    maintenanceExpiryDays: Math.max(1, Math.min(365, Number(saved['notification.maintenanceExpiryDays'] || 30))),
    maintenanceExpiryRecipients: String(saved['notification.maintenanceExpiryRecipients'] || '').trim(),
    inspectionReminderEnabled: saved['notification.inspectionReminderEnabled'] !== 'false',
    inspectionReminderDays: Math.max(1, Math.min(365, Number(saved['notification.inspectionReminderDays'] || 3))),
  }
}

function startScheduler() {
  cron.schedule('0 8 * * *', async () => {
    console.log('[scheduler] Running maintenance expiry check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.maintenanceExpiryEnabled) {
        console.log('[scheduler] Maintenance expiry notification is disabled')
        return
      }

      const devices = await query(
        `SELECT d.id, d.name, d.model, d.serial_no, d.maintenance_end, d.maintenance_type,
                c.name AS customer_name, c.salesperson
         FROM devices d
         JOIN customers c ON c.id = d.customer_id
         WHERE d.maintenance_end IS NOT NULL
           AND DATEDIFF(d.maintenance_end, CURDATE()) = :expiryDays
           AND d.maintenance_type != 'none'`,
        { expiryDays: nSettings.maintenanceExpiryDays },
      )
      if (!devices.length) {
        console.log(`[scheduler] No devices expiring in ${nSettings.maintenanceExpiryDays} days`)
        return
      }

      let adminRows
      if (nSettings.maintenanceExpiryRecipients) {
        const emails = nSettings.maintenanceExpiryRecipients.split(/[,;\s]+/).filter(Boolean)
        if (emails.length) {
          const placeholders = emails.map((_, i) => `:email${i}`).join(',')
          const params = {}
          emails.forEach((email, i) => { params[`email${i}`] = email })
          adminRows = await query(
            `SELECT email FROM users WHERE email IN (${placeholders})`,
            params,
          )
          if (adminRows.length < emails.length) {
            const found = new Set(adminRows.map((r) => r.email))
            const missing = emails.filter((e) => !found.has(e))
            if (missing.length) {
              console.warn('[scheduler] Some configured recipients not found in users table:', missing)
            }
          }
        } else {
          adminRows = []
        }
      } else {
        adminRows = await query(
          `SELECT email FROM users WHERE email IS NOT NULL AND email <> '' AND role IN ('admin', 'operations_director')`,
        )
      }

      const salespersonNames = [...new Set(devices.map((d) => (d.salesperson || '').trim()).filter(Boolean))]
      let salespersonRows = []
      if (salespersonNames.length) {
        const placeholders = salespersonNames.map((_, i) => `:sp${i}`).join(',')
        const params = {}
        salespersonNames.forEach((name, i) => { params[`sp${i}`] = name })
        salespersonRows = await query(
          `SELECT email, real_name FROM users
           WHERE (real_name IN (${placeholders}) OR username IN (${placeholders}))
             AND email IS NOT NULL AND email <> ''`,
          params,
        )
        if (salespersonRows.length) {
          console.log(`[scheduler] Found ${salespersonRows.length} salespeople with emails: ${salespersonRows.map((r) => `${r.real_name}<${r.email}>`).join(', ')}`)
        }
      }

      const allRecipients = [...adminRows, ...salespersonRows]
      const seen = new Set()
      const deduped = allRecipients.filter((r) => {
        const key = r.email.toLowerCase().trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })

      if (!deduped.length) {
        console.warn('[scheduler] No recipients for maintenance expiry mail')
        return
      }

      const result = await sendMaintenanceExpiryMail(devices, deduped)
      if (result?.skipped) {
        console.warn('[scheduler] Maintenance expiry mail skipped', {
          reason: result.reason,
          missing: result.missing,
        })
      } else {
        console.log(`[scheduler] Maintenance expiry mail sent: ${result.deviceCount} devices to ${result.to}`)
      }
    } catch (error) {
      console.error('[scheduler] Maintenance expiry check failed', error?.message)
    }
  })

  cron.schedule('0 7 * * *', async () => {
    console.log('[scheduler] Running inspection reminder check...')
    try {
      const nSettings = await notificationSettings()
      if (!nSettings.inspectionReminderEnabled) {
        console.log('[scheduler] Inspection reminder notification is disabled')
        return
      }

      const schedules = await query(
        `SELECT s.id, s.cadence, s.next_run_anchor, s.target_engineer_id,
                c.name AS customer_name,
                u.email AS engineer_email, u.real_name AS engineer_name,
                (SELECT GROUP_CONCAT(d2.name SEPARATOR '、')
                 FROM inspection_schedule_devices sd2
                 LEFT JOIN devices d2 ON d2.id = sd2.device_id
                 WHERE sd2.schedule_id = s.id) AS device_names
         FROM inspection_schedules s
         JOIN customers c ON c.id = s.customer_id
         JOIN users u ON u.id = s.target_engineer_id
         WHERE s.active = 1
           AND DATEDIFF(s.next_run_anchor, CURDATE()) = :reminderDays
           AND u.email IS NOT NULL AND u.email <> ''`,
        { reminderDays: nSettings.inspectionReminderDays },
      )
      if (!schedules.length) {
        console.log(`[scheduler] No inspections due in ${nSettings.inspectionReminderDays} days`)
        return
      }

      const byEngineer = new Map()
      for (const schedule of schedules) {
        const key = schedule.engineer_email.toLowerCase()
        if (!byEngineer.has(key)) {
          byEngineer.set(key, { email: schedule.engineer_email, name: schedule.engineer_name, items: [] })
        }
        byEngineer.get(key).items.push(schedule)
      }

      for (const [, group] of byEngineer) {
        const result = await sendInspectionReminderMail(group.items, [group])
        if (result?.skipped) {
          console.warn('[scheduler] Inspection reminder mail skipped', {
            engineer: group.email,
            reason: result.reason,
          })
        } else {
          console.log(`[scheduler] Inspection reminder sent to ${group.email}: ${result.scheduleCount} schedules`)
        }
      }
    } catch (error) {
      console.error('[scheduler] Inspection reminder check failed', error?.message)
    }
  })

  console.log('[scheduler] Started: maintenance expiry (08:00), inspection reminder (07:00)')
}

module.exports = { startScheduler }
