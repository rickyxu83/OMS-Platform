/**
 * 存量手写签名批量裁剪：把整张画布白底的签名 PNG 裁到笔迹包围盒（含留白）。
 *
 * 背景：早期签名采集直接导出整张画布（白底、笔迹位置/占比因人而异），
 * 导致电子签核记录里手写签名大大小小。采集端已改为导出前裁剪，本脚本修正存量数据。
 *
 * 用法：
 *   node scripts/crop-signatures.js           # dry-run，只打印统计不写库
 *   node scripts/crop-signatures.js --apply   # 实际 UPDATE
 *
 * 安全：仅处理 data:image/png 签名；解析失败或裁剪后反而更大则跳过保留原值；
 * 每条 UPDATE 只命中 id 单行；建议执行前先备份数据库。
 */
const { PNG } = require('pngjs')
const { pool } = require('../src/config/db')

const APPLY = process.argv.includes('--apply')

/** 与前端 src/lib/signature-crop.ts 同一判定逻辑：左上角为背景基准；背景透明时任何可见像素都算笔迹 */
function cropSignaturePng(buffer) {
  const png = PNG.sync.read(buffer)
  const { width, height, data } = png
  if (!width || !height) return null
  const bgR = data[0]
  const bgG = data[1]
  const bgB = data[2]
  const bgTransparent = data[3] < 24

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      if (data[offset + 3] < 24) continue
      // 透明背景：可见像素即笔迹；不透明背景：与背景色差超过阈值才算笔迹
      if (!bgTransparent) {
        const diff = Math.abs(data[offset] - bgR) + Math.abs(data[offset + 1] - bgG) + Math.abs(data[offset + 2] - bgB)
        if (diff <= 48) continue
      }
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null // 无笔迹

  const pad = Math.max(8, Math.round(Math.max(maxX - minX, maxY - minY) * 0.15))
  const cropX = Math.max(0, minX - pad)
  const cropY = Math.max(0, minY - pad)
  const cropW = Math.min(width, maxX + pad + 1) - cropX
  const cropH = Math.min(height, maxY + pad + 1) - cropY
  // 仅宽度无需收縮且高度也无需收縮时才算已是紧凑图
  if (cropW >= width && cropH >= height) return null

  const out = new PNG({ width: cropW, height: cropH })
  // 预填背景（透明背景填透明），抗锯齿边缘不会透出杂色
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = bgR
    out.data[i + 1] = bgG
    out.data[i + 2] = bgB
    out.data[i + 3] = bgTransparent ? 0 : 255
  }
  PNG.bitblt(png, out, cropX, cropY, cropW, cropH, 0, 0)
  return { buffer: PNG.sync.write(out), width: cropW, height: cropH }
}

const TARGETS = [
  { table: 'users', column: 'engineer_signature', label: '用户手写签名' },
  { table: 'mr_approvals', column: 'approver_signature_snapshot', label: 'MR 签核签名快照' },
]

async function processTarget(target) {
  const [rows] = await pool.execute(
    `SELECT id, \`${target.column}\` AS signature FROM \`${target.table}\` WHERE \`${target.column}\` LIKE 'data:image/png%'`,
  )
  const stats = { total: rows.length, cropped: 0, skipped: 0, failed: 0, savedBytes: 0 }
  const verbose = process.argv.includes('--verbose')
  for (const row of rows) {
    const dataUrl = String(row.signature || '')
    try {
      const buffer = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64')
      const result = cropSignaturePng(buffer)
      if (!result) {
        stats.skipped += 1
        if (verbose) console.log(`  [跳过] ${target.table}#${row.id}：无笔迹或已紧凑`)
        continue
      }
      // 裁剪后体积反而更大（极少见：小图重编码开销）则保留原值
      if (result.buffer.length >= buffer.length) {
        stats.skipped += 1
        if (verbose) console.log(`  [跳过] ${target.table}#${row.id}：裁剪后体积反增`)
        continue
      }
      if (verbose) console.log(`  [裁剪] ${target.table}#${row.id} → ${result.width}x${result.height}`)
      stats.cropped += 1
      stats.savedBytes += buffer.length - result.buffer.length
      if (APPLY) {
        await pool.execute(
          `UPDATE \`${target.table}\` SET \`${target.column}\` = ? WHERE id = ?`,
          [`data:image/png;base64,${result.buffer.toString('base64')}`, row.id],
        )
      }
    } catch (err) {
      stats.failed += 1
      console.error(`  [失败] ${target.table}#${row.id}: ${err.message}`)
    }
  }
  console.log(
    `${target.label}（${target.table}.${target.column}）：共 ${stats.total} 条，可裁剪 ${stats.cropped} 条，` +
    `跳过 ${stats.skipped} 条，失败 ${stats.failed} 条，预计节省 ${(stats.savedBytes / 1024 / 1024).toFixed(2)} MB`,
  )
  return stats
}

async function main() {
  console.log(APPLY ? '模式：实际执行（--apply）' : '模式：dry-run（只统计不写库，加 --apply 执行）')
  for (const target of TARGETS) {
    await processTarget(target)
  }
  if (!APPLY) console.log('确认无误后执行：node scripts/crop-signatures.js --apply')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('执行失败:', err)
    process.exit(1)
  })
