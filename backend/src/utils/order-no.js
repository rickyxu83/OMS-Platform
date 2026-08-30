// 单号日期一律按北京时间为准（issue #13）：后端容器时区为 UTC,直接取本地字段会在
// 北京时间 00:00-08:00 生成差一天的日期;统一 +8 偏移后取 UTC 字段即北京时间
function buildOrderNo(sequence, now = new Date()) {
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = shanghai.getUTCFullYear()
  const month = String(shanghai.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shanghai.getUTCDate()).padStart(2, '0')
  return `TS${year}${month}${day}${String(sequence).padStart(4, '0')}`
}

module.exports = {
  buildOrderNo,
}

