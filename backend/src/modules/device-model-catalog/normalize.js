function normalizeAlias(input) {
  if (!input || typeof input !== 'string') return ''
  return input
    .toLowerCase()
    .trim()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function deduplicateAliases(aliases) {
  if (!Array.isArray(aliases)) return []
  const seen = new Set()
  return aliases.filter((alias) => {
    const normalized = normalizeAlias(alias)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

async function resolveAlias(dbConnection, alias, providerScope = 'approved-v1') {
  const normalized = normalizeAlias(alias)
  if (!normalized) return null

  const [rows] = await dbConnection.query(
    `SELECT c.id AS catalog_id, c.canonical_model, c.brand, c.category
     FROM device_model_aliases a
     JOIN device_model_catalog c ON a.catalog_id = c.id
     WHERE a.normalized_alias = ?
       AND a.provider_scope = ?
       AND c.is_active = 1`,
    [normalized, providerScope],
  )

  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]

  return {
    ambiguous: true,
    candidates: rows.map((row) => ({
      catalog_id: row.catalog_id,
      canonical_model: row.canonical_model,
      brand: row.brand,
      category: row.category,
    })),
  }
}

function isAmbiguous(result) {
  return Boolean(result && result.ambiguous === true)
}

module.exports = {
  normalizeAlias,
  deduplicateAliases,
  resolveAlias,
  isAmbiguous,
}
