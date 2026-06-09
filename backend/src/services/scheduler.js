const cron = require('node-cron')
const { query } = require('../config/db')
const { sendMaintenanceExpiryMail, sendInspectionReminderMail } = require('./mail')

function startScheduler() {
  // ── Maintenance expiry check: daily at 08:00 ──
  cron.schedule('0 8 * * *', async () => {
    console.log('[scheduler] Running maintenance expiry check...')
    try {
      const devices = await query(
        `SELECT d.id, d.name, d.model, d.serial_no, d.maintenance_end, d.maintenance_type,
                c.name AS customer_name, c.salesperson
         FROM devices d
         JOIN customers c ON c.id = d.customer_id
         WHERE d.maintenance_end IS NOT NULL
           AND DATEDIFF(d.maintenance_end, CURDATE()) = 30
           AND d.maintenance_type != 'none'`,
      )
      if (!devices.length) {
        console.log('[scheduler] No devices expiring in 30 days')
        return
      }

      const adminRows = await query(
        `SELECT email FROM users WHERE email IS NOT NULL AND email <> '' AND role IN ('admin', 'supervisor')`,
      )

      const result = await sendMaintenanceExpiryMail(devices, adminRows)
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

  // ── Inspection reminder: daily at 07:00 ──
  cron.schedule('0 7 * * *', async () => {
    console.log('[scheduler] Running inspection reminder check...')
    try {
      const schedules = await query(
        `SELECT s.id, s.cadence, s.next_run_anchor, s.target_engineer_id,
                d.name AS device_name,
                c.name AS customer_name,
                u.email AS engineer_email, u.real_name AS engineer_name
         FROM inspection_schedules s
         JOIN customers c ON c.id = s.customer_id
         JOIN devices d ON d.id = s.device_id
         JOIN users u ON u.id = s.target_engineer_id
         WHERE s.active = 1
           AND DATEDIFF(s.next_run_anchor, CURDATE()) = 3
           AND u.email IS NOT NULL AND u.email <> ''`,
      )
      if (!schedules.length) {
        console.log('[scheduler] No inspections due in 3 days')
        return
      }

      // Send one email per engineer with all their upcoming inspections
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
