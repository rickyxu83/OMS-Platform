const { query: defaultQuery } = require('../../config/db')
const { normalizeAlias, deduplicateAliases } = require('./normalize')

function firstMatching(values, matcher) {
  for (const value of values) {
    if (!value) continue
    const matched = String(value).match(matcher)
    if (matched?.[1]) return matched[1].trim()
    if (matched?.[0]) return matched[0].trim()
  }
  return ''
}

function derivePartNumber(fixture) {
  const explicit = String(fixture?.partNumber || '').trim()
  if (explicit) return explicit

  const aliases = deduplicateAliases(fixture?.aliases || [])
  const brand = String(fixture?.brand || '').trim()
  const canonicalModel = String(fixture?.canonicalModel || '').trim()

  const compactAlias = aliases.find((alias) => {
    const value = String(alias || '').trim()
    if (!value || value.includes(' ')) return false
    if (!/\d/.test(value)) return false
    return /^[A-Za-z0-9][A-Za-z0-9+._-]*$/.test(value)
  })
  if (compactAlias) return compactAlias

  if (brand === 'HPE') {
    return firstMatching([canonicalModel], /(DL\d+\s+Gen\d+(?:\s+Plus)?|ML\d+\s+Gen\d+|BL\d+\w*\s+Gen\d+|Synergy\s+\d+\s+Gen\d+)/i)
  }
  if (brand === 'Dell') {
    return firstMatching(
      [canonicalModel],
      /(R\d+[a-z]*|T\d+[a-z]*|M\d+[a-z]*|XR\d+|ME\d+|PowerStore\s+[A-Za-z0-9-]+|Unity XT\s+[A-Za-z0-9-]+)/i,
    )
  }
  if (brand === 'Lenovo') {
    return firstMatching([canonicalModel], /(SR\d+|ST\d+\s+V\d+|ST\d+|NE\d+|G\d+|DM\d+\w*|DE\d+\w*)/i)
  }
  if (brand === 'IBM') {
    return firstMatching([canonicalModel], /(S\d{3,})/i)
  }
  if (brand === 'NetApp') {
    return firstMatching([canonicalModel], /(A\d+|FAS\d+|E\d+)/i)
  }
  if (brand === 'Huawei') {
    return firstMatching([canonicalModel], /(OceanStor\s+.+|S\d+[A-Z0-9-]*|FusionServer\s+.+|TaiShan\s+.+)/i)
  }
  if (brand === 'H3C') {
    return firstMatching([canonicalModel], /(S\d+[A-Z0-9-]*)/i)
  }
  if (brand === 'F5') {
    return firstMatching([canonicalModel], /(i\d+)/i)
  }
  if (brand === 'Cisco') {
    return firstMatching(
      aliases,
      /(CBS\d+[A-Z0-9-]*|N9K-[A-Z0-9-]+|DS-C[A-Z0-9-]+|C\d+[A-Z0-9-]*|UCSC-[A-Z0-9-]+|UCSX-[A-Z0-9-]+)/i,
    ) || firstMatching([canonicalModel], /(Catalyst\s+.+|Nexus\s+.+|MDS\s+.+|UCS\s+.+)/i)
  }

  return ''
}

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

async function ingestFixtureData(db, fixtures, providerScope = 'approved-v1') {
  const runQuery = resolveQuery(db)
  const summary = { inserted: 0, updated: 0, skipped: 0 }

  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return summary
  }

  for (const fixture of fixtures) {
    try {
      const partNumber = derivePartNumber(fixture) || null
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
               part_number = COALESCE(?, part_number),
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

  return summary
}

module.exports = {
  ingestFixtureData,
}
