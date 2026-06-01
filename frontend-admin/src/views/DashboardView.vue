<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AdminIcon from '../components/AdminIcon.vue'
import { api } from '../services/api'
import { normalizePreviewServiceMode } from '../services/service-mode'

const AMAP_JSAPI_KEY = import.meta.env.VITE_AMAP_JSAPI_KEY?.trim() || import.meta.env.VITE_AMAP_KEY?.trim() || ''
const AMAP_SECURITY_JS_CODE = import.meta.env.VITE_AMAP_SECURITY_JS_CODE?.trim() || ''
const amapConfigured = Boolean(AMAP_JSAPI_KEY && AMAP_SECURITY_JS_CODE)
const SUZHOU_OFFICE_CENTER = {
  name: '苏州工业园区和乔丽晶',
  // Office center: reasonable Suzhou Industrial Park coordinate for 和乔丽晶 when exact geocoding is unavailable.
  lng: 120.71518,
  lat: 31.31962,
}

let amapLoaderPromise = null

const router = useRouter()
const loading = ref(false)
const error = ref('')
const mapLoading = ref(false)
const mapError = ref('')
const mapKeyword = ref('')
const mapMode = ref(amapConfigured ? 'loading' : 'fallback')
const mapFallbackMessage = ref(amapConfigured ? '' : '未配置 AMap JSAPI，已显示以苏州办事处为中心的客户坐标层')
const activeMapPointId = ref(null)
const mapExpanded = ref(false)
const mapContainer = ref(null)
const expandedMapContainer = ref(null)
const mapInstance = ref(null)
const expandedMapInstance = ref(null)
const summary = ref({ todayTotal: 0, monthTotal: 0, monthCustomers: 0, monthEngineerVisits: 0 })
const trend = ref([])
const orders = ref([])
const customers = ref([])
const mapCompanies = ref([])

const statusMap = {
  draft: '待填写',
  in_progress: '处理中',
  submitted: '已结案',
  cancelled: '已作废',
}
const modeMap = {
  onsite: '现场服务',
  remote: '远程服务',
  office: '内勤服务',
}

function normalizeOrder(order) {
  const normalizedMode = normalizePreviewServiceMode(order)
  return {
    ...order,
    displayId: order.orderNo || `TK-${order.id}`,
    displayStatus: statusMap[order.status] || order.status || '待填写',
    displayMode: modeMap[normalizedMode] || '现场服务',
    displayTitle: order.issueDescription || order.report?.resultDescription || order.deviceName || '服务记录已同步',
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [statsData, orderData, customerData] = await Promise.all([
      api.get('/service-orders/stats/overview'),
      api.get('/service-orders?pageSize=20&sortBy=createdAt&sortDir=desc'),
      api.get('/customers?pageSize=8'),
    ])
    summary.value = statsData.summary || summary.value
    trend.value = statsData.trend || []
    orders.value = ((statsData.recent || orderData.items || [])).map(normalizeOrder)
    customers.value = customerData.items || []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadMapCompanies() {
  mapLoading.value = true
  mapError.value = ''
  try {
    const params = new URLSearchParams()
    if (mapKeyword.value.trim()) params.set('keyword', mapKeyword.value.trim())
    const query = params.toString()
    const data = await api.get(`/customers${query ? `?${query}` : ''}`)
    mapCompanies.value = (data.items || [])
      .map((item) => ({
        ...item,
        source: 'customer',
        annualServices: Number(item.serviceOrderCount || item.orderCount || item.useCount || 0),
      }))
      .filter((item) => parseLocation(item).hasCoordinate)
      .sort((left, right) => right.annualServices - left.annualServices)
    await nextTick()
    await ensureMap()
  } catch (err) {
    mapError.value = err.message
  } finally {
    mapLoading.value = false
  }
}

function getCustomerLocation(point) {
  if (point?.source === 'office') {
    return { lng: SUZHOU_OFFICE_CENTER.lng, lat: SUZHOU_OFFICE_CENTER.lat, hasCoordinate: true }
  }
  return parseLocation(point)
}

function loadAMapScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('AMap 仅支持浏览器环境加载'))
  }

  if (window.AMap?.Map) {
    return Promise.resolve(window.AMap)
  }

  if (amapLoaderPromise) {
    return amapLoaderPromise
  }

  if (!AMAP_JSAPI_KEY || !AMAP_SECURITY_JS_CODE) {
    return Promise.reject(new Error('未配置 AMap JSAPI 密钥或安全密钥'))
  }

  window._AMapSecurityConfig = {
    securityJsCode: AMAP_SECURITY_JS_CODE,
  }

  amapLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-amap-jsapi="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.AMap), { once: true })
      existing.addEventListener('error', () => reject(new Error('AMap JSAPI 加载失败')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.async = true
    script.defer = true
    script.dataset.amapJsapi = 'true'
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_JSAPI_KEY)}`
    script.onload = () => resolve(window.AMap)
    script.onerror = () => reject(new Error('AMap JSAPI 加载失败'))
    document.head.appendChild(script)
  }).catch((err) => {
    amapLoaderPromise = null
    throw err
  })

  return amapLoaderPromise
}

function buildMapMarker(point) {
  const location = getCustomerLocation(point)
  if (!location.hasCoordinate || typeof window === 'undefined' || !window.AMap) {
    return null
  }

  const el = document.createElement('button')
  el.type = 'button'
  const markerKind = point.source === 'office' ? 'office' : point.isFocus ? 'focus' : 'customer'
  el.className = `map-marker map-marker-${markerKind} map-marker-tier-${point.serviceTier || getMapServiceTier(point.annualServices)}`
  el.setAttribute(
    'aria-label',
    point.source === 'office'
      ? `${point.name || '苏州办事处'}，中心点 ${SUZHOU_OFFICE_CENTER.name}`
      : `${point.name || '客户'}，本年度服务 ${point.annualServices || 0} 次`,
  )
  el.dataset.serviceCount = String(point.annualServices || 0)

  const dot = document.createElement('span')
  dot.className = point.source === 'office' ? 'map-marker-office-dot' : point.isFocus ? 'map-marker-focus-dot' : 'map-marker-customer-dot'
  dot.setAttribute('aria-hidden', 'true')
  el.appendChild(dot)

  if (point.source === 'office') {
    const label = document.createElement('span')
    label.className = 'map-marker-office-label'
    label.textContent = `${SUZHOU_OFFICE_CENTER.name} · 中心`
    el.appendChild(label)
  } else if (point.isFocus) {
    const label = document.createElement('span')
    label.className = 'map-marker-focus-label'
    label.textContent = `${point.name || '客户'} · ${point.annualServices || 0} 次`
    el.appendChild(label)
  }

  if (point.source !== 'office') {
    el.addEventListener('mouseenter', () => setActiveMapPoint(point))
    el.addEventListener('focus', () => setActiveMapPoint(point))
    el.addEventListener('mouseleave', () => clearActiveMapPoint(point))
    el.addEventListener('blur', () => clearActiveMapPoint(point))
    el.addEventListener('click', () => openCompany(point))
  }

  return new window.AMap.Marker({
    position: [location.lng, location.lat],
    content: el,
    anchor: 'center',
    offset: new window.AMap.Pixel(0, 0),
    zIndex: point.source === 'office' ? 140 : point.isFocus ? 120 : 60,
  })
}

function syncMapMarkers(targetMap = mapInstance.value) {
  const map = targetMap
  if (!map || typeof window === 'undefined' || !window.AMap) {
    return
  }

  const points = mapPoints.value
  const officePoint = {
    id: 'office-center',
    source: 'office',
    name: SUZHOU_OFFICE_CENTER.name,
    annualServices: points.reduce((sum, point) => sum + Number(point.annualServices || 0), 0),
    serviceTier: 'peak',
    location: { ...SUZHOU_OFFICE_CENTER, hasCoordinate: true },
    hasCoordinate: true,
  }

  map.clearMap()

  mapError.value = ''
  map.setZoomAndCenter(10, [SUZHOU_OFFICE_CENTER.lng, SUZHOU_OFFICE_CENTER.lat])

  const markers = [officePoint, ...points]
    .map((point) => buildMapMarker(point))
    .filter(Boolean)

  const coverageLines = points.flatMap((point) => {
    const location = getCustomerLocation(point)
    if (!location.hasCoordinate) {
      return []
    }

    const path = [
      [SUZHOU_OFFICE_CENTER.lng, SUZHOU_OFFICE_CENTER.lat],
      [location.lng, location.lat],
    ]

    return [
      new window.AMap.Polyline({
        path,
        strokeColor: '#8b5cf6',
        strokeOpacity: 0.1,
        strokeWeight: 5.5,
        strokeStyle: 'solid',
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 19,
        isOutline: false,
      }),
      new window.AMap.Polyline({
        path,
        strokeColor: '#7c3aed',
        strokeOpacity: 0.34,
        strokeWeight: 2.2,
        strokeStyle: 'dashed',
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 20,
        isOutline: false,
      }),
    ]
  })

  map.add([...coverageLines, ...markers])
}

async function ensureMap() {
  if (typeof window === 'undefined' || !mapContainer.value) {
    return
  }

  if (!amapConfigured) {
    mapMode.value = 'fallback'
    mapFallbackMessage.value = '未配置 AMap JSAPI，已显示以苏州办事处为中心的客户坐标层'
    mapError.value = ''
    return
  }

  try {
    const AMap = await loadAMapScript()
    if (!mapContainer.value) {
      return
    }

    if (!mapInstance.value) {
      mapInstance.value = new AMap.Map(mapContainer.value, {
        viewMode: '2D',
        resizeEnable: true,
        zoom: 10,
        center: [SUZHOU_OFFICE_CENTER.lng, SUZHOU_OFFICE_CENTER.lat],
      })
    }

    mapMode.value = 'amap'
    mapFallbackMessage.value = ''
    await nextTick()
    syncMapMarkers(mapInstance.value)
  } catch (err) {
    mapMode.value = 'fallback'
    mapFallbackMessage.value = err?.message || 'AMap 初始化失败，已显示以苏州办事处为中心的客户坐标层'
    mapError.value = err?.message || 'AMap 初始化失败'
  }
}

async function ensureExpandedMap() {
  if (typeof window === 'undefined' || !expandedMapContainer.value || !mapExpanded.value) {
    return
  }

  if (!amapConfigured) {
    return
  }

  try {
    const AMap = await loadAMapScript()
    if (!expandedMapContainer.value) {
      return
    }

    if (!expandedMapInstance.value) {
      expandedMapInstance.value = new AMap.Map(expandedMapContainer.value, {
        viewMode: '2D',
        resizeEnable: true,
        zoom: 10,
        center: [SUZHOU_OFFICE_CENTER.lng, SUZHOU_OFFICE_CENTER.lat],
      })
    }

    mapMode.value = 'amap'
    mapFallbackMessage.value = ''
    await nextTick()
    syncMapMarkers(expandedMapInstance.value)
  } catch (err) {
    mapMode.value = 'fallback'
    mapFallbackMessage.value = err?.message || 'AMap 初始化失败，已显示以苏州办事处为中心的客户坐标层'
    mapError.value = err?.message || 'AMap 初始化失败'
  }
}

function openMapOverlay() {
  mapExpanded.value = true
}

function closeMapOverlay() {
  mapExpanded.value = false
}

function handleDashboardKeydown(event) {
  if (event.key === 'Escape' && mapExpanded.value) {
    closeMapOverlay()
  }
}

function setActiveMapPoint(point) {
  if (point) {
    activeMapPointId.value = point.id
  }
}

function clearActiveMapPoint(point) {
  if (point) {
    activeMapPointId.value = null
  }
}

function openCompany(item) {
  if (item?.source === 'office') {
    return
  }
  if (item?.source === 'customer' || item?.customerId || item?.id) {
    router.push({ name: 'customers', query: { customerId: item.customerId || item.id, keyword: item.name || '' } })
    return
  }
  if (item?.location) {
    window.open(`https://uri.amap.com/marker?position=${encodeURIComponent(item.location)}&name=${encodeURIComponent(item.name || '服务区域')}`, '_blank', 'noopener,noreferrer')
  }
}

function openRegionView() {
  router.push({ name: 'customers', query: mapKeyword.value.trim() ? { keyword: mapKeyword.value.trim() } : undefined })
}

function parseLocation(item) {
  const lng = Number(item?.longitude)
  const lat = Number(item?.latitude)
  if (Number.isFinite(lng) && Number.isFinite(lat) && lng !== 0 && lat !== 0) {
    return { lng, lat, hasCoordinate: true }
  }
  return { lng: null, lat: null, hasCoordinate: false }
}

function getAnnualServices(item) {
  return Number(item?.annualServices || item?.serviceOrderCount || item?.orderCount || item?.useCount || 0)
}

function getMapServiceTier(annualServices) {
  const count = Number(annualServices || 0)
  if (count >= 10) return 'peak'
  if (count >= 4) return 'high'
  if (count >= 1) return 'active'
  return 'quiet'
}

const maxTrendTotal = computed(() => Math.max(...trend.value.map((item) => Number(item.total || 0)), 1))
function formatTrendDate(value) {
  const text = String(value || '')
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[2]}-${match[3]}` : text || '-'
}
const chartRows = computed(() => {
  const source = trend.value.length
    ? trend.value.slice(-7).map((item) => ({
        label: formatTrendDate(item.date),
        fullDate: String(item.date || '-').slice(0, 10) || '-',
        value: Number(item.total || 0),
      }))
    : []
  const max = trend.value.length ? maxTrendTotal.value : 1
  return source.map((item) => ({
    ...item,
    height: `${Math.max((item.value / max) * 100, item.value ? 14 : 6)}%`,
    tooltip: `${item.fullDate}：${item.value} 件`,
  }))
})
const activeOrders = computed(() => orders.value.filter((order) => order.displayStatus === '处理中').length)
const totalDistribution = computed(() => orders.value.length)
const modeDistribution = computed(() => {
  const total = Math.max(orders.value.length, 1)
  const count = (mode) => orders.value.filter((order) => order.displayMode === mode).length
  return {
    onsite: Math.round((count('现场服务') / total) * 100),
    remote: Math.round((count('远程服务') / total) * 100),
    office: Math.round((count('内勤服务') / total) * 100),
  }
})
const mapPoints = computed(() => {
  const sorted = [...mapCompanies.value].sort((left, right) => getAnnualServices(right) - getAnnualServices(left))
  return sorted.slice(0, 14).map((item) => {
    const location = parseLocation(item)
    const annualServices = getAnnualServices(item)
    return {
      ...item,
      annualServices,
      serviceTier: getMapServiceTier(annualServices),
      isFocus: false,
      tooltip: `${item.name || '客户'}｜本年度服务 ${annualServices || 0} 次`,
      hasCoordinate: location.hasCoordinate,
      location,
    }
  })
})
const mapFallbackPoints = computed(() => {
  const points = mapPoints.value.filter((point) => point.hasCoordinate)
  let maxLngDelta = 0
  let maxLatDelta = 0

  for (const point of points) {
    maxLngDelta = Math.max(maxLngDelta, Math.abs(point.location.lng - SUZHOU_OFFICE_CENTER.lng))
    maxLatDelta = Math.max(maxLatDelta, Math.abs(point.location.lat - SUZHOU_OFFICE_CENTER.lat))
  }

  const lngScale = maxLngDelta || maxLatDelta || 0.01
  const latScale = maxLatDelta || maxLngDelta || 0.01

  return points.map((point) => {
    const lngOffset = point.location.lng - SUZHOU_OFFICE_CENTER.lng
    const latOffset = point.location.lat - SUZHOU_OFFICE_CENTER.lat
    const left = Math.min(92, Math.max(8, 50 + (lngOffset / lngScale) * 32))
    const top = Math.min(92, Math.max(8, 50 - (latOffset / latScale) * 32))

    return {
      ...point,
      leftValue: left,
      topValue: top,
      left: `${left}%`,
      top: `${top}%`,
    }
  })
})
const activeMapPoint = computed(() => mapPoints.value.find((point) => point.id === activeMapPointId.value) || null)
const mapSummaryText = computed(() => {
  if (activeMapPoint.value) {
    return `${activeMapPoint.value.name || '客户'} · ${activeMapPoint.value.annualServices || 0} 次`
  }

  if (mapMode.value === 'fallback') {
    return mapFallbackMessage.value || 'AMap 不可用，已显示以苏州办事处为中心的客户坐标层'
  }

  if (mapLoading.value && amapConfigured) {
    return '正在尝试加载 AMap JSAPI 并同步客户坐标...'
  }

  return '从苏州办事处向客户点位辐射，悬停或聚焦客户点查看信息'
})
const feedItems = computed(() => [
  {
    className: 'done',
    icon: 'done',
    title: orders.value[0]?.displayStatus === '已结案' ? '工单已结案' : '工单已同步',
    time: orders.value[0]?.serviceAt ? String(orders.value[0].serviceAt).replace('T', ' ').slice(0, 16) : '-',
    desc: orders.value[0] ? `工单 #${orders.value[0].displayId} 已完成状态同步` : '暂无最新工单动态',
  },
  {
    className: 'warn',
    icon: 'warn',
    title: '近期工单状态',
    time: orders.value[1]?.serviceAt ? String(orders.value[1].serviceAt).replace('T', ' ').slice(0, 16) : '-',
    desc: orders.value[1] ? `工单 #${orders.value[1].displayId} 当前状态为${orders.value[1].displayStatus}` : '暂无更多近期工单动态',
  },
  {
    className: 'asset',
    icon: 'asset',
    title: '客户资料更新',
    time: customers.value[0]?.updatedAt ? String(customers.value[0].updatedAt).replace('T', ' ').slice(0, 16) : '-',
    desc: customers.value[0] ? `客户 [${customers.value[0].name}] 资料已同步` : '暂无客户资料动态',
  },
])

onMounted(() => {
  load()
  loadMapCompanies()
  ensureMap()
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleDashboardKeydown)
  }
})

watch(
  () => mapCompanies.value,
  () => {
    ensureMap()
    if (mapExpanded.value) {
      ensureExpandedMap()
    }
  },
  { deep: true, flush: 'post' },
)

watch(
  () => mapExpanded.value,
  (expanded) => {
    if (expanded) {
      nextTick(() => ensureExpandedMap())
    }
  },
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleDashboardKeydown)
  }
  if (mapInstance.value?.destroy) {
    mapInstance.value.destroy()
  }
  if (expandedMapInstance.value?.destroy) {
    expandedMapInstance.value.destroy()
  }
  mapInstance.value = null
  expandedMapInstance.value = null
})
</script>

<template>
  <section class="figma-page">
    <p v-if="error" class="form-error">{{ error }} <button type="button" @click="load">重试</button></p>
    <p v-else-if="loading" class="muted">正在加载管理端数据...</p>

    <section class="kpi-grid">
      <article class="metric-card">
        <div class="metric-top">
          <AdminIcon name="ticket" class="metric-icon" />
          <em class="metric-change">今日</em>
        </div>
        <span>今日新增工单</span>
        <strong>{{ summary.todayTotal }}</strong>
      </article>
      <article class="metric-card">
        <div class="metric-top">
          <AdminIcon name="activity" class="metric-icon" />
        </div>
        <span>处理中工单</span>
        <strong>{{ activeOrders }}</strong>
        <div class="bar-line"><i style="width: 75%"></i></div>
      </article>
      <article class="metric-card">
        <div class="metric-top">
          <AdminIcon name="duration" class="metric-icon" />
        </div>
        <span>本月工程师参与</span>
        <strong>{{ summary.monthEngineerVisits }}<small> 次</small></strong>
        <small>来自月度服务统计</small>
      </article>
    </section>

    <section class="figma-grid">
      <div class="dashboard-left">
        <article class="panel">
          <div class="panel-head">
            <div>
              <h2>工单处理趋势</h2>
              <p>按接口返回日期展示近期工单数量</p>
            </div>
            <span class="chip">最近 7 日趋势</span>
          </div>
          <div class="bar-chart">
            <div class="bar-grid"><span v-for="n in 5" :key="n"></span></div>
            <div class="bars">
              <button
                v-for="item in chartRows"
                :key="item.label"
                class="bar"
                type="button"
                :aria-label="item.tooltip"
                :style="{ height: item.height }"
              >
                <span>{{ item.tooltip }}</span>
              </button>
            </div>
          </div>
          <div class="chart-axis">
            <span v-for="item in chartRows" :key="`${item.label}-axis`">{{ item.label }}</span>
          </div>
        </article>

        <article class="panel">
          <h2>近期工单类型分布</h2>
          <div class="distribution-body">
            <div class="donut">
              <div class="donut-center">
                <strong>{{ totalDistribution }}</strong>
                <span>近期加载</span>
              </div>
            </div>
            <div class="legend-list">
              <div class="legend-row">
                <span class="legend-name"><i class="legend-dot" style="background: #6b38d4"></i>现场服务</span>
                <strong style="color: #6b38d4">{{ modeDistribution.onsite }}%</strong>
              </div>
              <div class="legend-row">
                <span class="legend-name"><i class="legend-dot" style="background: #d0bcff"></i>远程服务</span>
                <strong style="color: #d0bcff">{{ modeDistribution.remote }}%</strong>
              </div>
              <div class="legend-row">
                <span class="legend-name"><i class="legend-dot" style="background: #d3e4fe"></i>内勤服务</span>
                <strong>{{ modeDistribution.office }}%</strong>
              </div>
            </div>
          </div>
        </article>
      </div>

      <aside class="dashboard-right">
        <article class="glass-panel map-card">
          <div class="map-card-content">
            <div class="map-card-head">
              <div>
                <h2>客户点位分布</h2>
                <small>{{ mapSummaryText }}</small>
              </div>
              <AdminIcon name="map-pin" class="map-pin" />
            </div>
            <label class="map-search">
              <input v-model.trim="mapKeyword" placeholder="搜索区域 / 客户" @keyup.enter="loadMapCompanies" />
              <button type="button" @click="loadMapCompanies">搜索</button>
            </label>
            <div class="map-viewport">
              <div ref="mapContainer" class="map-canvas" :class="{ 'is-hidden': mapMode !== 'amap' }" aria-label="客户地图"></div>
              <div v-if="mapMode !== 'amap'" class="map-fallback-layer" aria-label="客户坐标层">
                <svg class="map-fallback-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <line
                    v-for="point in mapFallbackPoints"
                    :key="`${point.id}-line`"
                    x1="50"
                    y1="50"
                    :x2="point.leftValue"
                    :y2="point.topValue"
                  />
                </svg>
                <button
                  class="map-marker map-fallback-marker map-marker-office map-marker-tier-peak"
                  type="button"
                  style="left: 50%; top: 50%; z-index: 140"
                  aria-label="苏州工业园区和乔丽晶，中心点"
                  @click="openMapOverlay"
                >
                  <span class="map-marker-office-dot" aria-hidden="true"></span>
                  <span class="map-marker-office-label">苏州工业园区和乔丽晶 · 中心</span>
                </button>
                <button
                  v-for="point in mapFallbackPoints"
                  :key="point.id"
                  class="map-marker map-fallback-marker"
                  :class="[`map-marker-tier-${point.serviceTier}`, 'map-marker-customer']"
                  type="button"
                  :style="{ left: point.left, top: point.top, zIndex: 60 }"
                  :aria-label="`${point.name || '客户'}，本年度服务 ${point.annualServices || 0} 次`"
                  @mouseenter="setActiveMapPoint(point)"
                  @focus="setActiveMapPoint(point)"
                  @mouseleave="clearActiveMapPoint(point)"
                  @blur="clearActiveMapPoint(point)"
                  @click="openCompany(point)"
                >
                  <span class="map-marker-customer-dot" aria-hidden="true"></span>
                </button>
              </div>
              <button class="map-expand-button" type="button" @click="openMapOverlay">放大地图</button>
            </div>
            <div class="map-point-summary">
              <strong>{{ mapPoints.length }}</strong>
              <span>个客户点位</span>
              <small v-if="mapPoints.length">以苏州办事处为中心辐射，点位大小与光晕反映服务次数层级</small>
              <p v-if="mapMode === 'fallback' && mapFallbackMessage" class="map-note">{{ mapFallbackMessage }}</p>
              <p v-if="mapError" class="map-error">{{ mapError }}</p>
              <p v-else-if="!mapCompanies.length && !mapLoading" class="map-error">暂无客户点位数据</p>
            </div>
            <button class="map-button" type="button" @click="openRegionView"><AdminIcon name="map-action" class="map-action-icon" />进入客户资产视图</button>
          </div>
        </article>

        <article class="glass-panel feed-card">
          <div class="feed-head">
            <h2>近期动态</h2>
            <button class="text-link" type="button" @click="router.push({ name: 'service-orders' })">查看全部</button>
          </div>
          <div class="feed-list">
            <article v-for="item in feedItems" :key="item.title" class="feed-row" :class="item.className">
              <span class="feed-icon"><AdminIcon :name="item.icon" /></span>
              <div>
                <div class="feed-meta">
                  <strong>{{ item.title }}</strong>
                  <time>{{ item.time }}</time>
                </div>
                <p>{{ item.desc }}</p>
              </div>
            </article>
          </div>
        </article>
      </aside>
    </section>

    <teleport to="body">
      <div v-if="mapExpanded" class="map-overlay" role="dialog" aria-modal="true" aria-label="放大地图">
        <button class="map-overlay-backdrop" type="button" aria-label="关闭放大地图" @click="closeMapOverlay"></button>
        <section class="map-overlay-panel">
          <div class="map-overlay-head">
            <div>
              <h2>客户点位分布</h2>
              <p>以苏州办事处为中心辐射，点位大小与光晕反映服务次数层级</p>
            </div>
            <div class="map-overlay-actions">
              <button class="map-button" type="button" @click="closeMapOverlay">关闭</button>
            </div>
          </div>
          <div class="map-viewport map-viewport-large">
            <div ref="expandedMapContainer" class="map-canvas" :class="{ 'is-hidden': mapMode !== 'amap' }" aria-label="放大客户地图"></div>
            <div v-if="mapMode !== 'amap'" class="map-fallback-layer" aria-label="放大客户坐标层">
              <svg class="map-fallback-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line
                  v-for="point in mapFallbackPoints"
                  :key="`overlay-${point.id}-line`"
                  x1="50"
                  y1="50"
                  :x2="point.leftValue"
                  :y2="point.topValue"
                />
              </svg>
              <button
                class="map-marker map-fallback-marker map-marker-office map-marker-tier-peak"
                type="button"
                style="left: 50%; top: 50%; z-index: 140"
                aria-label="苏州工业园区和乔丽晶，中心点"
                @click="closeMapOverlay"
              >
                <span class="map-marker-office-dot" aria-hidden="true"></span>
                <span class="map-marker-office-label">苏州工业园区和乔丽晶 · 中心</span>
              </button>
              <button
                v-for="point in mapFallbackPoints"
                :key="`overlay-${point.id}`"
                class="map-marker map-fallback-marker"
                :class="[`map-marker-tier-${point.serviceTier}`, 'map-marker-customer']"
                type="button"
                :style="{ left: point.left, top: point.top, zIndex: 60 }"
                :aria-label="`${point.name || '客户'}，本年度服务 ${point.annualServices || 0} 次`"
                @mouseenter="setActiveMapPoint(point)"
                @focus="setActiveMapPoint(point)"
                @mouseleave="clearActiveMapPoint(point)"
                @blur="clearActiveMapPoint(point)"
                @click="openCompany(point)"
              >
                <span class="map-marker-customer-dot" aria-hidden="true"></span>
              </button>
            </div>
          </div>
          <div class="map-point-summary map-point-summary-large">
            <strong>{{ mapPoints.length }}</strong>
            <span>个客户点位</span>
            <small>放大视图保留同一中心与同一 fallback 层</small>
          </div>
        </section>
      </div>
    </teleport>
  </section>
</template>
