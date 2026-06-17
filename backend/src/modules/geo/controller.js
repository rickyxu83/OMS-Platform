const env = require('../../config/env')
const { query } = require('../../config/db')
const { badRequest } = require('../../utils/http-error')
const { customerNameKey } = require('../../utils/chinese')
const { effectiveSettings } = require('../settings/controller')

const fallbackPois = [
  {
    id: 'demo-1',
    name: '华东数据中心有限公司',
    address: '上海市浦东新区张江高科技园区祖冲之路 887 号',
    location: '121.601502,31.205822',
    mapProvider: 'amap',
    mapPoiId: 'demo-1',
    mapPoiName: '华东数据中心有限公司',
    mapAddress: '上海市浦东新区张江高科技园区祖冲之路 887 号',
    source: 'map',
  },
  {
    id: 'demo-2',
    name: '上海云网科技股份有限公司',
    address: '上海市浦东新区郭守敬路 498 号',
    location: '121.592388,31.206984',
    mapProvider: 'amap',
    mapPoiId: 'demo-2',
    mapPoiName: '上海云网科技股份有限公司',
    mapAddress: '上海市浦东新区郭守敬路 498 号',
    source: 'map',
  },
  {
    id: 'demo-3',
    name: '联科智能办公园区',
    address: '上海市徐汇区漕河泾开发区田林路 200 号',
    location: '121.409181,31.178463',
    mapProvider: 'amap',
    mapPoiId: 'demo-3',
    mapPoiName: '联科智能办公园区',
    mapAddress: '上海市徐汇区漕河泾开发区田林路 200 号',
    source: 'map',
  },
]

function normalizeSearchText(value) {
  return customerNameKey(value)
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePoi(poi) {
  const addressText = Array.isArray(poi.address) ? poi.address.join('') : poi.address || ''
  const regionParts = [poi.pname, poi.cityname, poi.adname]
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .filter(Boolean)
  const uniqueRegionParts = regionParts.filter((item, index) => regionParts.indexOf(item) === index)
  const fullAddress = `${uniqueRegionParts.join('')}${addressText}` || addressText

  return {
    id: poi.id || poi.name,
    name: poi.name,
    address: fullAddress,
    location: poi.location || '',
    mapProvider: 'amap',
    mapPoiId: poi.id || '',
    mapPoiName: poi.name || '',
    mapAddress: fullAddress,
    source: 'map',
  }
}

function poiSignature(item) {
  return `${item.name || ''}|${item.address || ''}|${item.location || ''}`
}

function distanceScore(item, latitude, longitude) {
  const [lng, lat] = String(item.location || '').split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || latitude === null || longitude === null) return null
  return Math.pow(lat - latitude, 2) + Math.pow(lng - longitude, 2)
}

function keywordScore(item, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword)
  if (!normalizedKeyword) return 0

  const normalizedName = normalizeSearchText(item.name)
  const normalizedAddress = normalizeSearchText(item.address)

  if (normalizedName === normalizedKeyword) return 1000
  if (normalizedName.includes(normalizedKeyword)) return 800
  if (normalizedKeyword.includes(normalizedName)) return 650
  if (normalizedAddress.includes(normalizedKeyword)) return 300

  return 0
}

function rankPoiResults(items, { keyword, latitude, longitude }) {
  const lat = toNumber(latitude)
  const lng = toNumber(longitude)

  return [...items].sort((a, b) => {
    const keywordDelta = keywordScore(b, keyword) - keywordScore(a, keyword)
    if (keywordDelta) return keywordDelta

    const distanceA = distanceScore(a, lat, lng)
    const distanceB = distanceScore(b, lat, lng)
    if (distanceA !== null && distanceB !== null && distanceA !== distanceB) return distanceA - distanceB
    if (distanceA !== null) return -1
    if (distanceB !== null) return 1

    return 0
  })
}

async function fetchAmapPois(params) {
  const response = await fetch(`https://restapi.amap.com/v3/place/text?${params.toString()}`)
  const data = await response.json()
  if (data.status !== '1') return []
  return (data.pois || []).map(normalizePoi)
}

async function fetchAmapGeocode(address) {
  const settings = await effectiveSettings()
  const amapKey = settings.map?.amapRestKey || env.amapKey
  if (!amapKey) {
    const fallback = fallbackPois.find((item) => `${item.name}${item.address}`.includes(address) || address.includes(item.address))
    return fallback || null
  }

  const params = new URLSearchParams({
    key: amapKey,
    address,
  })
  const response = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params.toString()}`)
  const data = await response.json()
  if (data.status !== '1' || !data.geocodes?.length) return null

  const geocode = data.geocodes[0]
  const formattedAddress = geocode.formatted_address || address
  return {
    id: geocode.adcode || formattedAddress,
    name: formattedAddress,
    address: formattedAddress,
    location: geocode.location || '',
    mapProvider: 'amap',
    mapPoiId: geocode.adcode || '',
    mapPoiName: formattedAddress,
    mapAddress: formattedAddress,
    source: 'geocode',
  }
}

function mergePoiResults(...groups) {
  const seen = new Set()
  const items = []
  groups.flat().forEach((item) => {
    const key = poiSignature(item)
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  })
  return items
}

async function searchMapPois({ keyword, latitude, longitude }) {
  const settings = await effectiveSettings()
  const amapKey = settings.map?.amapRestKey || env.amapKey
  if (!amapKey) {
    return fallbackPois.filter((item) => !keyword || `${item.name}${item.address}`.includes(keyword))
  }

  const baseParams = new URLSearchParams({
    key: amapKey,
    keywords: keyword || '公司',
    offset: '10',
    page: '1',
    extensions: 'base',
  })

  if (latitude && longitude) {
    baseParams.set('location', `${longitude},${latitude}`)
    baseParams.set('radius', '30000')
    baseParams.set('sortrule', 'distance')
  }

  const nationwideResults = await fetchAmapPois(baseParams)
  const merged = rankPoiResults(
    mergePoiResults(nationwideResults),
    { keyword, latitude, longitude },
  )

  if (!merged.length) {
    return fallbackPois.filter((item) => !keyword || `${item.name}${item.address}`.includes(keyword))
  }

  return merged
}

async function searchCompanies(req, res) {
  const { keyword = '', latitude = '', longitude = '' } = req.query
  const likeKeyword = `%${keyword}%`
  const likeKeywordKey = `%${customerNameKey(keyword)}%`
  const lat = toNumber(latitude)
  const lng = toNumber(longitude)

  const customers = await query(
    `SELECT id, name, name_key, address, contact_name, contact_phone, salesperson, latitude, longitude,
       map_provider, map_poi_id, map_poi_name, map_address,
       CASE
         WHEN :latitude IS NULL OR :longitude IS NULL OR latitude IS NULL OR longitude IS NULL THEN 999999
         ELSE POW(latitude - :latitude, 2) + POW(longitude - :longitude, 2)
       END AS distance_score
     FROM customers
     WHERE :keyword = ''
       OR name LIKE :likeKeyword
       OR name_key LIKE :likeKeywordKey
       OR address LIKE :likeKeyword
       OR contact_name LIKE :likeKeyword
       OR salesperson LIKE :likeKeyword
       OR remark LIKE :likeKeyword
       OR map_poi_name LIKE :likeKeyword
       OR map_address LIKE :likeKeyword
     ORDER BY distance_score ASC, updated_at DESC
     LIMIT 8`,
    { keyword, likeKeyword, likeKeywordKey, latitude: lat, longitude: lng },
  )

  const contactRows = customers.length
    ? await query(
        `SELECT cc.id, cc.customer_id, cc.name, cc.phone, cc.use_count, cc.last_used_at,
                COALESCE(ccu.use_count, 0) AS engineer_use_count,
                ccu.last_used_at AS engineer_last_used_at
         FROM customer_contacts cc
         LEFT JOIN customer_contact_usage ccu
           ON ccu.customer_contact_id = cc.id AND ccu.engineer_id = :engineerId
         WHERE cc.customer_id IN (${customers.map((_, index) => `:customerId${index}`).join(',')})
         ORDER BY cc.customer_id ASC, engineer_use_count DESC, engineer_last_used_at DESC, cc.use_count DESC, cc.last_used_at DESC, cc.id DESC`,
        customers.reduce((params, customer, index) => {
          params[`customerId${index}`] = customer.id
          params.engineerId = req.user.id
          return params
        }, {}),
      )
    : []
  const contactsByCustomer = contactRows.reduce((groups, contact) => {
    if (!groups.has(contact.customer_id)) groups.set(contact.customer_id, [])
    groups.get(contact.customer_id).push({
      id: contact.id,
      name: contact.name,
      phone: contact.phone || '',
      useCount: contact.use_count,
      lastUsedAt: contact.last_used_at,
    })
    return groups
  }, new Map())

  const customerItems = customers.map((item) => ({
    id: `customer-${item.id}`,
    customerId: item.id,
    name: item.name,
    address: item.address || '',
    contactName: item.contact_name || '',
    contactPhone: item.contact_phone || '',
    salesperson: item.salesperson || '',
    contacts: contactsByCustomer.get(item.id) || [],
    latitude: item.latitude,
    longitude: item.longitude,
    location: item.longitude && item.latitude ? `${item.longitude},${item.latitude}` : '',
    mapProvider: item.map_provider || '',
    mapPoiId: item.map_poi_id || '',
    mapPoiName: item.map_poi_name || '',
    mapAddress: item.map_address || '',
    source: 'customer',
  }))

  const mapItems = await searchMapPois({ keyword, latitude, longitude })
  const knownSignatures = new Set(customerItems.map((item) => `${item.name}|${item.address}`))
  const merged = [...customerItems, ...mapItems.filter((item) => !knownSignatures.has(`${item.name}|${item.address}`))]

  res.json({ items: merged.slice(0, 12) })
}

async function geocodeAddress(req, res) {
  const address = String(req.query.address || '').trim()
  if (!address) throw badRequest('请先填写详细地址')

  const item = await fetchAmapGeocode(address)
  if (!item?.location) {
    res.json({ item: null })
    return
  }

  const [longitude, latitude] = String(item.location).split(',').map(Number)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    res.json({ item: null })
    return
  }

  res.json({
    item: {
      ...item,
      latitude,
      longitude,
    },
  })
}

module.exports = {
  searchCompanies,
  geocodeAddress,
}
