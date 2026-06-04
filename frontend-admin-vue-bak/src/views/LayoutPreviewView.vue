<script setup>
import { computed, ref } from 'vue'
import DetailPanel from '../components/admin/DetailPanel.vue'
import FilterBar from '../components/admin/FilterBar.vue'
import KpiCard from '../components/admin/KpiCard.vue'
import PageHeader from '../components/admin/PageHeader.vue'
import StatusBadge from '../components/admin/StatusBadge.vue'

const query = ref('')
const selectedId = ref('so-1001')

const records = [
  {
    id: 'so-1001',
    orderNo: 'SR-20260604-001',
    customerName: '苏州京隆科技',
    serviceType: '现场安装',
    engineerName: '徐坚',
    serviceAt: '2026-06-04 09:30',
    status: '待确认',
    statusTone: 'pending',
    summary: '新装 OceanStor 5310，需补充巡检和资产登记。',
    internalNote: '先由主管确认后派发。',
    deviceName: 'Huawei OceanStor 5310',
    detailTitle: '苏州京隆科技 / OceanStor 5310',
  },
  {
    id: 'so-1002',
    orderNo: 'SR-20260604-002',
    customerName: '上海华测实验室',
    serviceType: '巡检计划',
    engineerName: '陈工',
    serviceAt: '2026-06-06 10:00',
    status: '进行中',
    statusTone: 'processing',
    summary: '巡检计划允许暂不指定设备，只绑定客户与工程师。',
    internalNote: '设备台账补全后再回填。',
    deviceName: '未指定设备',
    detailTitle: '上海华测实验室 / 巡检计划',
  },
  {
    id: 'so-1003',
    orderNo: 'SR-20260604-003',
    customerName: '苏州工业园研发中心',
    serviceType: '设备资产',
    engineerName: '王工',
    serviceAt: '2026-06-07 15:20',
    status: '已提交',
    statusTone: 'success',
    summary: '设备型号与 PN 由台账人工确认后写入型号库。',
    internalNote: '保持台账与标准型号库分层。',
    deviceName: 'H3C S5560-54S',
    detailTitle: '苏州工业园研发中心 / H3C S5560-54S',
  },
]

const filteredRecords = computed(() => {
  const text = query.value.trim().toLowerCase()
  if (!text) return records
  return records.filter((record) =>
    [record.orderNo, record.customerName, record.deviceName, record.summary]
      .some((value) => String(value || '').toLowerCase().includes(text)),
  )
})

const selectedRecord = computed(() => {
  return filteredRecords.value.find((record) => record.id === selectedId.value) || filteredRecords.value[0] || records[0]
})

function selectRecord(id) {
  selectedId.value = id
}
</script>

<template>
  <section class="figma-page layout-lab-page">
    <PageHeader
      kicker="LAYOUT LAB"
      title="详情区改造方案临时预览"
      description="同一份业务数据，分别演示三种替代右侧窄详情栏的方案，方便直接比较可用面积与处理效率。"
    />

    <section class="kpi-grid">
      <KpiCard title="方案 A" value="上下工作区" subtitle="列表在上，详情在下" icon="dashboard" />
      <KpiCard title="方案 B" value="独立详情页" subtitle="列表与详情分开路由" icon="service" />
      <KpiCard title="方案 C" value="大抽屉" subtitle="覆盖层，不压缩主列表" icon="customer" />
    </section>

    <FilterBar v-model:query="query" search-placeholder="搜索示例记录..." />

    <section class="glass-panel option-card sample-selector">
      <div class="sample-selector-head">
        <div>
          <p>示例记录</p>
          <h2>点击切换下面三种方案的展示内容</h2>
        </div>
        <StatusBadge :label="selectedRecord.status" :tone="selectedRecord.statusTone" compact />
      </div>
      <div class="sample-selector-list">
        <button
          v-for="record in filteredRecords"
          :key="record.id"
          type="button"
          class="sample-chip"
          :class="{ active: selectedRecord.id === record.id }"
          @click="selectRecord(record.id)"
        >
          <strong>{{ record.customerName }}</strong>
          <span>{{ record.deviceName }}</span>
        </button>
      </div>
    </section>

    <section class="option-grid">
      <article class="glass-panel option-card">
        <header class="option-head">
          <div>
            <p>方案 A</p>
            <h2>上下结构</h2>
          </div>
          <small>推荐度最高</small>
        </header>
        <div class="mock-table-card">
          <div class="mock-table-head six-cols">
            <span>记录编号</span>
            <span>客户名称</span>
            <span>服务类型</span>
            <span>工程师</span>
            <span>时间</span>
            <span>状态</span>
          </div>
          <button
            v-for="record in filteredRecords"
            :key="`${record.id}-stack`"
            type="button"
            class="mock-table-row six-cols"
            :class="{ active: selectedRecord.id === record.id }"
            @click="selectRecord(record.id)"
          >
            <span class="mono">{{ record.orderNo }}</span>
            <span>{{ record.customerName }}</span>
            <span>{{ record.serviceType }}</span>
            <span>{{ record.engineerName }}</span>
            <span>{{ record.serviceAt }}</span>
            <span>{{ record.status }}</span>
          </button>
        </div>
        <div class="workspace-panel">
          <div class="workspace-head">
            <div>
              <p>详情与处理区</p>
              <h3>{{ selectedRecord.detailTitle }}</h3>
            </div>
            <div class="workspace-actions">
              <button class="ghost-button" type="button">编辑</button>
              <button class="primary" type="button">保存</button>
            </div>
          </div>
          <div class="workspace-grid">
            <section>
              <h4>详细描述</h4>
              <p>{{ selectedRecord.summary }}</p>
            </section>
            <section>
              <h4>内部备注</h4>
              <p>{{ selectedRecord.internalNote }}</p>
            </section>
            <section>
              <h4>绑定对象</h4>
              <p>客户：{{ selectedRecord.customerName }}</p>
              <p>设备：{{ selectedRecord.deviceName }}</p>
            </section>
            <section>
              <h4>时间线</h4>
              <p>{{ selectedRecord.serviceAt }}</p>
              <p>{{ selectedRecord.status }}</p>
            </section>
          </div>
        </div>
      </article>

      <article class="glass-panel option-card">
        <header class="option-head">
          <div>
            <p>方案 B</p>
            <h2>独立详情页</h2>
          </div>
          <small>信息最完整</small>
        </header>
        <div class="route-preview">
          <div class="route-preview-list">
            <div class="route-preview-bar">/service-orders</div>
            <div class="mock-table-card compact">
              <button
                v-for="record in filteredRecords"
                :key="`${record.id}-route`"
                type="button"
                class="mock-table-row route-row"
                :class="{ active: selectedRecord.id === record.id }"
                @click="selectRecord(record.id)"
              >
                <strong>{{ record.orderNo }}</strong>
                <small>{{ record.customerName }}</small>
              </button>
            </div>
          </div>
          <div class="route-preview-detail">
            <div class="route-preview-bar">/service-orders/{{ selectedRecord.id }}</div>
            <div class="detail-page-mock">
              <header>
                <p>独立详情页标题区</p>
                <h3>{{ selectedRecord.detailTitle }}</h3>
              </header>
              <div class="detail-page-grid">
                <section>
                  <h4>概览</h4>
                  <p>{{ selectedRecord.summary }}</p>
                </section>
                <section>
                  <h4>属性</h4>
                  <p>工程师：{{ selectedRecord.engineerName }}</p>
                  <p>服务类型：{{ selectedRecord.serviceType }}</p>
                </section>
                <section>
                  <h4>处理动作</h4>
                  <div class="workspace-actions">
                    <button class="ghost-button" type="button">返回列表</button>
                    <button class="primary" type="button">提交保存</button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="glass-panel option-card option-card-wide">
        <header class="option-head">
          <div>
            <p>方案 C</p>
            <h2>大抽屉 / 覆盖层</h2>
          </div>
          <small>保留列表上下文</small>
        </header>
        <div class="overlay-preview">
          <div class="mock-table-card blur-underlay">
            <div class="mock-table-head six-cols">
              <span>记录编号</span>
              <span>客户名称</span>
              <span>服务类型</span>
              <span>工程师</span>
              <span>时间</span>
              <span>状态</span>
            </div>
            <button
              v-for="record in filteredRecords"
              :key="`${record.id}-overlay`"
              type="button"
              class="mock-table-row six-cols"
              :class="{ active: selectedRecord.id === record.id }"
              @click="selectRecord(record.id)"
            >
              <span class="mono">{{ record.orderNo }}</span>
              <span>{{ record.customerName }}</span>
              <span>{{ record.serviceType }}</span>
              <span>{{ record.engineerName }}</span>
              <span>{{ record.serviceAt }}</span>
              <span>{{ record.status }}</span>
            </button>
          </div>
          <div class="overlay-mask"></div>
          <div class="overlay-drawer">
            <header>
              <div>
                <p>抽屉标题</p>
                <h3>{{ selectedRecord.detailTitle }}</h3>
              </div>
              <button class="ghost-button" type="button">关闭</button>
            </header>
            <section>
              <h4>详情区</h4>
              <p>{{ selectedRecord.summary }}</p>
            </section>
            <section>
              <h4>动作区</h4>
              <div class="workspace-actions">
                <button class="ghost-button" type="button">暂存</button>
                <button class="primary" type="button">保存</button>
              </div>
            </section>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.layout-lab-page {
  gap: 24px;
}

.option-grid {
  display: grid;
  gap: 24px;
}

.option-card {
  display: grid;
  gap: 18px;
  padding: 24px;
}

.option-card-wide {
  overflow: hidden;
}

.option-head,
.sample-selector-head,
.workspace-head,
.overlay-drawer header,
.detail-page-mock header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}

.option-head p,
.sample-selector-head p,
.workspace-head p,
.overlay-drawer p,
.detail-page-mock p {
  color: var(--muted);
  font-size: 12px;
}

.option-head h2,
.sample-selector-head h2,
.workspace-head h3,
.overlay-drawer h3,
.detail-page-mock h3 {
  margin-top: 4px;
  font-size: 24px;
}

.option-head small {
  color: var(--primary-dark);
  font-weight: 700;
}

.sample-selector {
  display: grid;
  gap: 16px;
  padding: 24px;
}

.sample-selector-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.sample-chip {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 14px 16px;
  text-align: left;
  background: white;
}

.sample-chip.active {
  border-color: rgb(107 56 212 / 32%);
  background: rgb(233 221 255 / 26%);
}

.sample-chip strong,
.sample-chip span {
  display: block;
}

.sample-chip span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.mock-table-card {
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid var(--line);
  background: rgb(255 255 255 / 78%);
}

.mock-table-card.compact {
  border-radius: 18px;
}

.mock-table-head,
.mock-table-row {
  display: grid;
  gap: 14px;
  align-items: center;
  padding: 14px 18px;
}

.mock-table-head {
  color: var(--faint);
  font-size: 12px;
  font-weight: 700;
  border-bottom: 1px solid var(--line);
}

.mock-table-row {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  background: transparent;
}

.mock-table-row:last-child {
  border-bottom: 0;
}

.mock-table-row.active {
  background: rgb(233 221 255 / 32%);
}

.six-cols {
  grid-template-columns: 1fr 1.2fr 0.9fr 0.9fr 0.9fr 0.8fr;
}

.workspace-panel,
.detail-page-mock,
.overlay-drawer {
  border-radius: 24px;
  border: 1px solid var(--line);
  background: white;
  padding: 22px;
}

.workspace-grid,
.detail-page-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.workspace-grid section,
.detail-page-grid section,
.overlay-drawer section {
  display: grid;
  gap: 8px;
  border-radius: 18px;
  padding: 16px;
  background: rgb(239 244 255 / 48%);
}

.workspace-grid h4,
.detail-page-grid h4,
.overlay-drawer h4 {
  font-size: 15px;
}

.workspace-grid p,
.detail-page-grid p,
.overlay-drawer p {
  color: var(--muted);
  line-height: 1.6;
}

.workspace-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.route-preview {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 18px;
}

.route-preview-bar {
  margin-bottom: 12px;
  color: var(--primary-dark);
  font-family: var(--mono);
  font-size: 12px;
}

.route-row {
  grid-template-columns: minmax(0, 1fr);
}

.route-row small {
  display: block;
  margin-top: 4px;
  color: var(--muted);
}

.overlay-preview {
  position: relative;
  overflow: hidden;
  min-height: 420px;
  border-radius: 28px;
}

.blur-underlay {
  filter: blur(1.5px);
  opacity: 0.78;
}

.overlay-mask {
  position: absolute;
  inset: 0;
  background: rgb(11 28 48 / 14%);
}

.overlay-drawer {
  position: absolute;
  top: 18px;
  right: 18px;
  bottom: 18px;
  width: min(560px, calc(100% - 36px));
  display: grid;
  align-content: start;
  gap: 16px;
  box-shadow: 0 24px 50px rgb(11 28 48 / 16%);
}

@media (max-width: 1100px) {
  .six-cols {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .route-preview,
  .workspace-grid,
  .detail-page-grid {
    grid-template-columns: 1fr;
  }
}
</style>
