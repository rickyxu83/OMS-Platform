const assert = require('assert')
const { dropRedundantFaultSummaryColumn, dropRedundantWorkHoursColumn } = require('../scripts/ensure-legacy-compat-columns')

function stubConnection({
  columnExists = true,
  workHourRows = 0,
  representedWorkHours = 0,
  faultSummaryRows = 0,
  representedFaultSummaries = 0,
} = {}) {
  const statements = []
  return {
    statements,
    async execute(sql) {
      statements.push(sql)
      if (sql.includes('information_schema.columns')) return [columnExists ? [{ found: 1 }] : []]
      if (sql.includes('COUNT(*) AS workHourRows')) return [[{ workHourRows, representedRows: representedWorkHours }]]
      if (sql.includes('COUNT(*) AS faultSummaryRows')) return [[{ faultSummaryRows, representedRows: representedFaultSummaries }]]
      return [[]]
    },
  }
}

async function main() {
  const absent = stubConnection({ columnExists: false })
  assert.equal(await dropRedundantWorkHoursColumn(absent), false)
  assert(!absent.statements.some((sql) => sql.includes('DROP COLUMN')))

  const redundant = stubConnection({ workHourRows: 4, representedWorkHours: 4 })
  assert.equal(await dropRedundantWorkHoursColumn(redundant), true)
  assert(redundant.statements.includes('ALTER TABLE service_reports DROP COLUMN work_hours'))

  const inconsistent = stubConnection({ workHourRows: 4, representedWorkHours: 3 })
  await assert.rejects(() => dropRedundantWorkHoursColumn(inconsistent), /contains 1 value/)
  assert(!inconsistent.statements.some((sql) => sql.includes('DROP COLUMN')))

  const redundantFaultSummary = stubConnection({ faultSummaryRows: 4, representedFaultSummaries: 4 })
  assert.equal(await dropRedundantFaultSummaryColumn(redundantFaultSummary), true)
  assert(redundantFaultSummary.statements.includes('ALTER TABLE service_reports DROP COLUMN fault_summary'))

  const inconsistentFaultSummary = stubConnection({ faultSummaryRows: 4, representedFaultSummaries: 2 })
  await assert.rejects(() => dropRedundantFaultSummaryColumn(inconsistentFaultSummary), /contains 2 value/)
  assert(!inconsistentFaultSummary.statements.some((sql) => sql.includes('DROP COLUMN')))

  console.log('legacy compatibility column tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
