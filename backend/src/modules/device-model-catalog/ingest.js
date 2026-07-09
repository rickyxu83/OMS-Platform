const { query: defaultQuery } = require('../../config/db')
const { normalizeAlias, deduplicateAliases } = require('./normalize')

function resolveQuery(db) {
  if (typeof db === 'function') return db
  if (db && typeof db.query === 'function') {
    return async (sql, params) => {
      const result = await db.query(sql, params)
      return Array.isArray(result) ? result[0] : result
    }
  }
  if (db && typeof db.execute === 'function') {
    return async (sql, params) => {
      const [result] = await db.execute(sql, params)
      return result
    }
  }
  return defaultQuery
}

function fixtureKey(fixture) {
  return [
    String(fixture?.brand || '').trim().toLowerCase(),
    String(fixture?.category || '').trim().toLowerCase(),
    String(fixture?.canonicalModel || fixture?.canonical_model || '').trim().toLowerCase(),
  ].join('|')
}

async function deactivateMissingFixtureRows(runQuery, fixtures) {
  const activeKeys = new Set(fixtures.map(fixtureKey).filter((key) => key !== '||'))
  const rows = await runQuery(
    `SELECT id, brand, category, canonical_model
     FROM device_model_catalog
     WHERE source_provider = 'fixture'
       AND is_active = 1`,
  )
  const staleRows = Array.isArray(rows)
    ? rows.filter((row) => !activeKeys.has(fixtureKey(row)))
    : []

  for (const row of staleRows) {
    await runQuery(
      `UPDATE device_model_catalog
       SET is_active = 0,
           synced_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [row.id],
    )
  }

  return staleRows.length
}

async function deactivateConflictingNonFixtureRows(runQuery, fixtures) {
  let deactivated = 0
  const seen = new Set()
  for (const fixture of fixtures) {
    const brand = String(fixture?.brand || '').trim()
    const category = String(fixture?.category || '').trim()
    const canonicalModel = String(fixture?.canonicalModel || fixture?.canonical_model || '').trim()
    if (!brand || !category || !canonicalModel) continue
    const key = `${brand.toLowerCase()}|${category.toLowerCase()}|${canonicalModel.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    const result = await runQuery(
      `UPDATE device_model_catalog
       SET is_active = 0,
           synced_at = CURRENT_TIMESTAMP
       WHERE brand = ?
         AND canonical_model = ?
         AND category <> ?
         AND is_active = 1
         AND (source_provider IS NULL OR source_provider <> 'fixture')`,
      [brand, canonicalModel, category],
    )
    deactivated += Number(result?.affectedRows || 0)
  }
  return deactivated
}

async function ingestFixtureData(db, fixtures, providerScope = 'approved-v1', options = {}) {
  const runQuery = resolveQuery(db)
  const summary = { inserted: 0, updated: 0, skipped: 0, deactivated: 0 }

  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return summary
  }

  for (const fixture of fixtures) {
    try {
      const partNumber = String(fixture.partNumber || '').trim() || null
      const catalogInsert = await runQuery(
        `INSERT IGNORE INTO device_model_catalog (
          brand, category, canonical_model, part_number, source_provider, synced_at
        ) VALUES (?, ?, ?, ?, 'fixture', CURRENT_TIMESTAMP)`,
        [fixture.brand, fixture.category, fixture.canonicalModel, partNumber],
      )

      if (catalogInsert.affectedRows > 0) {
        summary.inserted += 1
      } else {
        await runQuery(
          `UPDATE device_model_catalog
           SET source_provider = 'fixture',
               part_number = ?,
               is_active = 1,
               synced_at = CURRENT_TIMESTAMP
           WHERE brand = ? AND category = ? AND canonical_model = ?`,
          [partNumber, fixture.brand, fixture.category, fixture.canonicalModel],
        )
        summary.updated += 1
      }

      const catalogRows = await runQuery(
        `SELECT id FROM device_model_catalog
         WHERE brand = ? AND category = ? AND canonical_model = ?
         LIMIT 1`,
        [fixture.brand, fixture.category, fixture.canonicalModel],
      )

      if (!Array.isArray(catalogRows) || catalogRows.length === 0) {
        summary.skipped += deduplicateAliases(fixture.aliases).length
        continue
      }

      const catalogId = catalogRows[0].id
      const aliases = deduplicateAliases(fixture.aliases)

      for (const alias of aliases) {
        const normalizedAlias = normalizeAlias(alias)
        if (!normalizedAlias) {
          summary.skipped += 1
          continue
        }

        const aliasInsert = await runQuery(
          `INSERT IGNORE INTO device_model_aliases (
            catalog_id, normalized_alias, provider_scope
          ) VALUES (?, ?, ?)`,
          [catalogId, normalizedAlias, providerScope],
        )

        if (aliasInsert.affectedRows > 0) {
          summary.inserted += 1
        } else {
          summary.skipped += 1
        }
      }
    } catch (error) {
      console.error('[device-model-catalog] ingest error:', error.message)
      summary.skipped += 1 + deduplicateAliases(fixture.aliases).length
    }
  }

  if (options.deactivateMissingFixtures) {
    summary.deactivated = await deactivateMissingFixtureRows(runQuery, fixtures)
  }
  summary.deactivated += await deactivateConflictingNonFixtureRows(runQuery, fixtures)

  return summary
}

module.exports = {
  ingestFixtureData,
}
