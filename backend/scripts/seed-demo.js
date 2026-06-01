const bcrypt = require('bcrypt')
const { pool } = require('../src/config/db')

const demoPassword = process.env.SEED_DEMO_PASSWORD

if (!demoPassword) {
  throw new Error('SEED_DEMO_PASSWORD must be set before seeding demo users')
}

const users = [
  ['admin', demoPassword, '系统管理员', 'admin', null],
  ['assistant', demoPassword, '助理小周', 'assistant', '13800001001'],
  ['engineering_supervisor', demoPassword, '工程主管王工', 'engineering_supervisor', '13800001002'],
  ['sales_supervisor', demoPassword, '业务主管李经理', 'sales_supervisor', '13800001007'],
  ['sales_jack', demoPassword, 'Jack', 'sales', '13800001003'],
  ['sales_annie', demoPassword, 'Annie', 'sales', '13800001004'],
  ['engineer', demoPassword, '张工', 'engineer', null],
  ['engineer_zhou', demoPassword, '周工', 'engineer', '13800001005'],
  ['engineer_chen', demoPassword, '陈工', 'engineer', '13800001006'],
]

const customers = [
  ['DEMO-ACME', '演示客户 A', '演示城市演示路 100 号', '演示联系人 A', '10000000001', 'Demo Sales A'],
  ['DEMO-BETA', '演示客户 B', '演示城市演示路 200 号', '演示联系人 B', '10000000002', 'Demo Sales B'],
  ['DEMO-GAMMA', '演示客户 C', '演示城市演示路 300 号', '演示联系人 C', '10000000003', 'Demo Sales C'],
  ['DEMO-DELTA', '演示客户 D', '演示城市演示路 400 号', '演示联系人 D', '10000000004', 'Demo Sales B'],
  ['DEMO-EPSILON', '演示客户 E', '演示城市演示路 500 号', '演示联系人 E', '10000000005', 'Demo Sales A'],
]

const devices = [
  ['DEMO-ACME', '演示虚拟化平台', 'Demo Hypervisor', 'DEMO-ACME-VMW'],
  ['DEMO-ACME', '演示交换机', 'Demo Switch', 'DEMO-ACME-SW'],
  ['DEMO-BETA', '演示存储设备', 'Demo Storage', 'DEMO-BETA-STG'],
  ['DEMO-GAMMA', '演示防火墙 A', 'Demo Firewall A', 'DEMO-GAMMA-FW'],
  ['DEMO-DELTA', '演示防火墙 B', 'Demo Firewall B', 'DEMO-DELTA-FW'],
]

const orders = [
  {
    orderNo: 'DEMO202605001',
    customerCode: 'DEMO-ACME',
    deviceSerial: 'DEMO-ACME-VMW',
    mode: 'onsite',
    type: 'inspect',
    engineer: 'engineer',
    date: '2026-05-06 09:30:00',
    end: '2026-05-06 12:00:00',
    issue: '虚拟化平台例行巡检，检查主机、存储、备份任务状态。',
    work: '完成 ESXi 主机健康检查、数据存储容量检查、HA 状态检查，并整理巡检结果。',
    result: 'resolved',
  },
  {
    orderNo: 'DEMO202605002',
    customerCode: 'DEMO-BETA',
    deviceSerial: 'DEMO-BETA-STG',
    mode: 'onsite',
    type: 'install',
    engineer: 'engineer_zhou',
    date: '2026-05-08 10:00:00',
    end: '2026-05-08 17:30:00',
    issue: 'Dell ME5024 存储上架、初始化和主机连线。',
    work: '完成设备上架、管理地址配置、存储池创建、主机端链路验证和标签整理。',
    result: 'resolved',
  },
  {
    orderNo: 'DEMO202605003',
    customerCode: 'DEMO-GAMMA',
    deviceSerial: 'DEMO-GAMMA-FW',
    mode: 'remote',
    type: 'repair',
    category: 'Remote Support',
    engineer: 'engineer_chen',
    date: '2026-05-09 14:00:00',
    end: '2026-05-09 15:10:00',
    issue: 'SSL VPN 用户无法连接。',
    work: '远程检查 FortiGate SSL VPN 策略、用户组和证书状态，调整认证配置后恢复连接。',
    result: 'resolved',
  },
  {
    orderNo: 'DEMO202605004',
    customerCode: 'DEMO-DELTA',
    deviceSerial: 'DEMO-DELTA-FW',
    mode: 'remote',
    type: 'maintain',
    category: 'Documentation',
    engineer: 'engineer_chen',
    date: '2026-05-12 16:00:00',
    end: '2026-05-12 18:00:00',
    issue: '防火墙变更前资料整理。',
    work: '整理现有策略、对象和 license 到期信息，输出给客户确认。',
    result: 'resolved',
  },
  {
    orderNo: 'DEMO202605005',
    customerCode: 'DEMO-EPSILON',
    deviceSerial: null,
    mode: 'remote',
    type: 'other',
    category: 'Meeting',
    engineer: 'engineer_zhou',
    date: '2026-05-15 13:30:00',
    end: '2026-05-15 15:00:00',
    issue: 'Veeam 备份方案需求讨论。',
    work: '与客户远程会议确认备份范围、保留周期和异地复制需求。',
    result: 'follow_up_required',
    resultDescription: '等待客户提供虚拟机清单。',
  },
  {
    orderNo: 'DEMO202605006',
    customerCode: 'DEMO-ACME',
    deviceSerial: 'DEMO-ACME-SW',
    mode: 'onsite',
    type: 'repair',
    engineer: 'engineer',
    extraEngineer: 'engineer_zhou',
    date: '2026-05-18 09:00:00',
    end: '2026-05-18 13:00:00',
    issue: '产线交换机端口间歇性丢包。',
    work: '现场检查光模块、端口错误包和链路日志，更换跳线并调整端口速率后观察正常。',
    result: 'resolved',
  },
]

async function upsertUser(connection, [username, password, realName, role, phone]) {
  const passwordHash = await bcrypt.hash(password, 10)
  await connection.execute(
    `INSERT INTO users (username, password_hash, real_name, phone, role, status)
     VALUES (:username, :passwordHash, :realName, :phone, :role, 'active')
     ON DUPLICATE KEY UPDATE real_name = VALUES(real_name), phone = VALUES(phone), role = VALUES(role), status = 'active'`,
    { username, passwordHash, realName, phone, role },
  )
}

async function idBy(connection, sql, params) {
  const [rows] = await connection.execute(sql, params)
  return rows[0]?.id
}

async function main() {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    for (const user of users) {
      await upsertUser(connection, user)
    }

    for (const [code, name, address, contactName, contactPhone, salesperson] of customers) {
      await connection.execute(
        `INSERT INTO customers (code, name, address, contact_name, contact_phone, salesperson)
         VALUES (:code, :name, :address, :contactName, :contactPhone, :salesperson)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), address = VALUES(address), contact_name = VALUES(contact_name),
           contact_phone = VALUES(contact_phone), salesperson = VALUES(salesperson)`,
        { code, name, address, contactName, contactPhone, salesperson },
      )
      const customerId = await idBy(connection, 'SELECT id FROM customers WHERE code = :code LIMIT 1', { code })
      await connection.execute(
        `INSERT INTO customer_contacts (customer_id, name, phone, use_count, last_used_at)
         VALUES (:customerId, :contactName, :contactPhone, 3, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE use_count = GREATEST(use_count, 3), last_used_at = CURRENT_TIMESTAMP`,
        { customerId, contactName, contactPhone },
      )
    }

    for (const [customerCode, name, model, serialNo] of devices) {
      const customerId = await idBy(connection, 'SELECT id FROM customers WHERE code = :customerCode LIMIT 1', { customerCode })
      await connection.execute(
        `INSERT INTO devices (customer_id, name, model, serial_no)
         VALUES (:customerId, :name, :model, :serialNo)
         ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id), name = VALUES(name), model = VALUES(model)`,
        { customerId, name, model, serialNo },
      )
    }

    const adminId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: 'admin' })
    for (const order of orders) {
      const customerId = await idBy(connection, 'SELECT id FROM customers WHERE code = :code LIMIT 1', { code: order.customerCode })
      const deviceId = order.deviceSerial
        ? await idBy(connection, 'SELECT id FROM devices WHERE serial_no = :serialNo LIMIT 1', { serialNo: order.deviceSerial })
        : null
      const engineerId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: order.engineer })
      await connection.execute(
        `INSERT INTO service_orders (
           order_no, customer_id, device_id, service_mode, service_type, timesheet_category,
           priority, status, issue_description, assigned_engineer_id, planned_start_at,
           planned_end_at, created_by, submitted_at
         )
         VALUES (
           :orderNo, :customerId, :deviceId, :mode, :type, :category, 'normal', 'submitted',
           :issue, :engineerId, :date, :end, :adminId, :end
         )
         ON DUPLICATE KEY UPDATE
           customer_id = VALUES(customer_id), device_id = VALUES(device_id), service_mode = VALUES(service_mode),
           service_type = VALUES(service_type), timesheet_category = VALUES(timesheet_category),
           issue_description = VALUES(issue_description), assigned_engineer_id = VALUES(assigned_engineer_id),
           planned_start_at = VALUES(planned_start_at), planned_end_at = VALUES(planned_end_at),
           submitted_at = VALUES(submitted_at), status = 'submitted'`,
        {
          orderNo: order.orderNo,
          customerId,
          deviceId,
          mode: order.mode,
          type: order.type,
          category: order.category || null,
          issue: order.issue,
          engineerId,
          date: order.date,
          end: order.end,
          adminId,
        },
      )
      const orderId = await idBy(connection, 'SELECT id FROM service_orders WHERE order_no = :orderNo LIMIT 1', { orderNo: order.orderNo })
      await connection.execute(
        `INSERT INTO service_order_engineers (service_order_id, engineer_id, joined_by)
         VALUES (:orderId, :engineerId, :adminId)
         ON DUPLICATE KEY UPDATE joined_by = VALUES(joined_by)`,
        { orderId, engineerId, adminId },
      )
      if (order.extraEngineer) {
        const extraEngineerId = await idBy(connection, 'SELECT id FROM users WHERE username = :username LIMIT 1', { username: order.extraEngineer })
        await connection.execute(
          `INSERT INTO service_order_engineers (service_order_id, engineer_id, joined_by)
           VALUES (:orderId, :extraEngineerId, :adminId)
           ON DUPLICATE KEY UPDATE joined_by = VALUES(joined_by)`,
          { orderId, extraEngineerId, adminId },
        )
      }
      await connection.execute(
        `INSERT INTO service_reports (
           service_order_id, actual_start_at, actual_end_at, work_hours, fault_summary,
           work_content, result, result_description, customer_name
         )
         VALUES (
           :orderId, :date, :end, TIMESTAMPDIFF(MINUTE, :date, :end) / 60,
           :issue, :work, :result, :resultDescription, '客户确认'
         )
         ON DUPLICATE KEY UPDATE
           actual_start_at = VALUES(actual_start_at), actual_end_at = VALUES(actual_end_at),
           work_hours = VALUES(work_hours), fault_summary = VALUES(fault_summary),
           work_content = VALUES(work_content), result = VALUES(result),
           result_description = VALUES(result_description), customer_name = VALUES(customer_name)`,
        {
          orderId,
          date: order.date,
          end: order.end,
          issue: order.issue,
          work: order.work,
          result: order.result,
          resultDescription: order.resultDescription || null,
        },
      )
    }

    await connection.execute(
      `INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
       VALUES (:adminId, 'demo', 0, 'seed_demo', JSON_OBJECT('users', :userCount, 'customers', :customerCount, 'orders', :orderCount))`,
      { adminId, userCount: users.length, customerCount: customers.length, orderCount: orders.length },
    )

    await connection.commit()
    console.log(`Seeded ${users.length} users, ${customers.length} customers, ${orders.length} service orders.`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
