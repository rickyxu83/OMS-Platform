const assert = require('assert')
const ExcelJS = require('exceljs')
const XLSX = require('xlsx')
const { analyzeMaintenanceWorkbook, parseDateCell, serialKey } = require('../src/modules/devices/maintenance-import')

async function workbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Vendor Export')
  rows.forEach((values, index) => {
    values.forEach((value, column) => {
      worksheet.getRow(index + 1).getCell(column + 1).value = value
    })
  })
  return workbook.xlsx.writeBuffer()
}

async function run() {
  assert.strictEqual(serialKey('  ab-001\u200b '), 'AB-001')
  assert.strictEqual(parseDateCell({ value: '2025年3月8日' }), '2025-03-08')
  assert.strictEqual(parseDateCell({ value: '2025-03-08 00:00:00' }), '2025-03-08')
  assert.strictEqual(parseDateCell({ value: '03/04/2025' }), null)

  const buffer = await workbookBuffer([
    ['厂商服务数据导出'],
    ['任意名称', '机器标识', '说明', '奇怪的日期甲', '奇怪的日期乙'],
    ['服务器一', ' sn-a001 ', '正常', '2025/01/01', '2027/12/31'],
    ['服务器二', 'SN-A002', '冲突', new Date(2025, 1, 1), new Date(2026, 1, 1)],
    ['服务器三', 'SN-A003', '重复一', '2025.03.01', '2026.02.28'],
    ['服务器三', 'SN-A003', '重复二', '2025.03.01', '2026.02.28'],
    ['未知设备', 'SN-MISSING', '不存在', '2025-04-01', '2026-03-31'],
  ])
  const devices = [
    { id: 1, serialNo: 'SN-A001', customerName: '甲客户', model: 'R750', maintenanceType: 'pending_confirmation', maintenanceStart: null, maintenanceEnd: null },
    { id: 2, serialNo: 'SN-A002', customerName: '乙客户', model: 'R650', maintenanceType: 'our_maintenance', maintenanceStart: '2024-01-01', maintenanceEnd: '2025-01-01' },
    { id: 3, serialNo: 'SN-A003', customerName: '丙客户', model: 'R740', maintenanceType: 'original_manufacturer', maintenanceStart: null, maintenanceEnd: null },
  ]
  const preview = await analyzeMaintenanceWorkbook(buffer, {
    loadDevicesBySerials: async (values) => {
      const keys = new Set(values.map(serialKey))
      return devices.filter((device) => keys.has(serialKey(device.serialNo)))
    },
  })

  assert.strictEqual(preview.sheetName, 'Vendor Export')
  assert.deepStrictEqual(preview.columns, { serialNo: 2, maintenanceStart: 4, maintenanceEnd: 5 })
  assert.strictEqual(preview.summary.updatable, 1)
  assert.strictEqual(preview.summary.conflicts, 1)
  assert.strictEqual(preview.summary.invalid, 2)
  assert.strictEqual(preview.summary.notFound, 1)
  assert.strictEqual(preview.items.find((item) => item.serialNo === 'SN-A001').status, 'updatable')
  assert.strictEqual(preview.items.find((item) => item.serialNo === 'SN-A002').status, 'conflict')
  assert.strictEqual(preview.items.filter((item) => item.serialNo === 'SN-A003' && item.status === 'duplicate').length, 2)

  const manual = await analyzeMaintenanceWorkbook(buffer, {
    columns: { serialNo: 2, maintenanceStart: 4, maintenanceEnd: 5 },
    loadDevicesBySerials: async () => devices,
  })
  assert.strictEqual(manual.requiresColumnConfirmation, false)

  const legacyWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(legacyWorkbook, XLSX.utils.aoa_to_sheet([
    ['旧格式厂商文件'],
    ['资产', '机器编码', '服务起点', '服务终点'],
    ['设备一', 'SN-A001', new Date(2025, 4, 1), new Date(2028, 3, 30)],
  ]), 'Legacy Vendor')
  const legacyBuffer = XLSX.write(legacyWorkbook, { type: 'buffer', bookType: 'biff8', cellDates: true })
  assert.strictEqual(legacyBuffer.subarray(0, 8).toString('hex'), 'd0cf11e0a1b11ae1')
  const legacyPreview = await analyzeMaintenanceWorkbook(legacyBuffer, {
    loadDevicesBySerials: async () => devices,
  })
  assert.strictEqual(legacyPreview.sheetName, 'Legacy Vendor')
  assert.deepStrictEqual(legacyPreview.columns, { serialNo: 2, maintenanceStart: 3, maintenanceEnd: 4 })
  assert.strictEqual(legacyPreview.summary.updatable, 1)
  assert.strictEqual(legacyPreview.items[0].maintenanceStart, '2025-05-01')
  assert.strictEqual(legacyPreview.items[0].maintenanceEnd, '2028-04-30')

  console.log('device maintenance import tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
