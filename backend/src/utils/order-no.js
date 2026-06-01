function buildOrderNo(sequence, now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `TS${year}${month}${day}${String(sequence).padStart(4, '0')}`
}

module.exports = {
  buildOrderNo,
}

