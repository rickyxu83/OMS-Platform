function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

function fillBlank(patch, existing, existingField, incomingValue) {
  if (isBlank(existing[existingField]) && !isBlank(incomingValue)) {
    patch[existingField] = incomingValue
  }
}

function buildExistingDeviceImportPatch(existing, row) {
  const patch = {}
  fillBlank(patch, existing, 'name', row.name)
  fillBlank(patch, existing, 'pn', row.pn)
  fillBlank(patch, existing, 'mr_no', row.mrNo)
  fillBlank(patch, existing, 'remark', row.remark)
  fillBlank(patch, existing, 'location', row.location)
  fillBlank(patch, existing, 'warranty_until', row.warrantyUntil)

  const existingMaintenanceType = String(existing.maintenance_type || 'pending_confirmation')
  if (
    existingMaintenanceType === 'pending_confirmation'
    && row.maintenanceTypeProvided
    && row.maintenanceType
    && row.maintenanceType !== 'pending_confirmation'
  ) {
    patch.maintenance_type = row.maintenanceType
  }
  const effectiveMaintenanceType = patch.maintenance_type || existingMaintenanceType
  if (effectiveMaintenanceType !== 'none') {
    fillBlank(patch, existing, 'maintenance_start', row.maintenanceStart)
    fillBlank(patch, existing, 'maintenance_end', row.maintenanceEnd)
  }

  const rowMaintenanceTypeCompatible = !row.maintenanceTypeProvided || row.maintenanceType === effectiveMaintenanceType
  const shouldResolveMaintenanceParty = (
    ['original_manufacturer', 'our_maintenance'].includes(effectiveMaintenanceType)
    && isBlank(existing.maintenance_party_id)
    && Boolean(row.maintenancePartyId || row.maintenancePartyName)
    && rowMaintenanceTypeCompatible
  )

  return {
    patch,
    effectiveMaintenanceType,
    shouldResolveMaintenanceParty,
  }
}

module.exports = {
  buildExistingDeviceImportPatch,
}
