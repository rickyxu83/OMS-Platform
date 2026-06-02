const { query } = require('../../config/db')

async function suggest(req, res) {
  const { q = '' } = req.query
  const raw = String(q).trim()
  if (!raw || raw.length < 2) {
    return res.json({ items: [] })
  }
  // Normalize user shorthand: g9->Gen9, g10->Gen10, v5->V5 etc.
  const normalized = raw.replace(/\bg(\d+)\b/gi, 'Gen$1').replace(/\bv(\d+)\b/gi, 'V$1')
  const terms = normalized.split(/[ ,\-_./]+/).filter(Boolean)
  // Build WHERE conditions with named placeholders (:t0_name, :t0_keywords, :t0_vendor, etc.)
  const conditions = terms.map((_, i) =>
    `(official_name LIKE :t${i}_name OR search_keywords LIKE :t${i}_kw OR vendor LIKE :t${i}_vdr)`
  )
  const exactPrefixConditions = terms.map((_, i) => `official_name LIKE :t${i}_pref`)
  const params = {}
  for (let i = 0; i < terms.length; i++) {
    params[`t${i}_name`] = `%${terms[i]}%`
    params[`t${i}_kw`] = `%${terms[i]}%`
    params[`t${i}_vdr`] = `%${terms[i]}%`
    params[`t${i}_pref`] = `${terms[i]}%`
  }
  const rows = await query(
    `SELECT id, vendor, product_line, official_name, category
     FROM device_models
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE
         WHEN ${exactPrefixConditions.join(' AND ')} THEN 0
         ELSE 1
       END,
       official_name ASC
     LIMIT 15`,
    params,
  )
  res.json({
    items: rows.map(r => ({
      id: r.id, vendor: r.vendor, productLine: r.product_line,
      officialName: r.official_name, category: r.category,
    })),
  })
}

module.exports = { suggest }
