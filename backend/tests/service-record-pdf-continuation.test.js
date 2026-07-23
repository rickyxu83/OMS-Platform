// 工单导出 PDF「工作内容超长自动续页」回归测试（方案 B）
// 取证方式：拦截 pdfkit 的 text()/addPage() 调用，按页记录实际绘制的文本，
// 等价于报告的 pdftotext 取证，但不依赖外部二进制。
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const assert = require('node:assert/strict')
const PDFDocument = require('pdfkit')
const {
  buildServiceRecordPdf,
  buildServiceRecordsPdf,
} = require('../src/modules/service-orders/service-record-pdf')

// 执行 build()，返回按页分组的绘制文本：pages[pageIndex] = [绘制过的字符串...]
function renderWithCapture(build) {
  const pages = []
  let current = []
  const origText = PDFDocument.prototype.text
  const origAddPage = PDFDocument.prototype.addPage
  PDFDocument.prototype.text = function (str, ...args) {
    current.push(String(str))
    return origText.call(this, str, ...args)
  }
  PDFDocument.prototype.addPage = function (...args) {
    // 构造函数 autoFirstPage 会调一次 addPage（此时尚无内容），不计入页分组
    if (current.length || pages.length) {
      pages.push(current)
      current = []
    }
    return origAddPage.apply(this, args)
  }
  try {
    build()
  } finally {
    PDFDocument.prototype.text = origText
    PDFDocument.prototype.addPage = origAddPage
  }
  pages.push(current)
  return pages
}

function workLines(prefix, count) {
  // 每条约 40 个汉字宽度，折行后约占 2 个版面行（上限按 31 字/行核算）
  return Array.from(
    { length: count },
    (_, i) => `${prefix}MARK${i + 1} 工作内容第${i + 1}条：现场排查设备告警，更换故障部件并验证业务恢复情况正常。`,
  )
}

function makeOrder(mode, prefix, contentLines) {
  return {
    id: 1,
    orderNo: `SO-${prefix}-001`,
    serviceMode: mode,
    customerName: '测试客户有限公司',
    contactName: '张三',
    contactPhone: '13800000000',
    customerAddress: '宁波市测试路1号',
    issueDescription: '设备频繁告警',
    engineers: [{ realName: '李工' }],
    report: {
      workContent: contentLines.join('\n'),
      result: 'resolved',
      actualStartAt: '2026-01-01 09:00',
      actualEndAt: '2026-01-01 12:00',
    },
  }
}

function markers(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix}MARK${i + 1}`)
}

function pageText(page) {
  return page.join('\n')
}

function main() {
  const modes = ['onsite', 'remote', 'office']

  // 短内容：三个模板都必须单页且内容完整（首页版式不变）
  for (const mode of modes) {
    const pages = renderWithCapture(() => buildServiceRecordPdf(makeOrder(mode, 'S', workLines('S', 3))))
    assert.equal(pages.length, 1, `${mode} 短内容应只有 1 页`)
    for (const marker of markers('S', 3)) {
      assert.ok(pageText(pages[0]).includes(marker), `${mode} 短内容首页应包含 ${marker}`)
    }
    assert.ok(!pageText(pages[0]).includes('（续）'), `${mode} 短内容不应出现续页标题`)
  }

  // 中度超长（6 条约 12 版面行 > 8/7 上限）：缩小字号后仍应单页装下，不出续页
  for (const mode of modes) {
    const pages = renderWithCapture(() => buildServiceRecordPdf(makeOrder(mode, 'M', workLines('M', 6))))
    assert.equal(pages.length, 1, `${mode} 中度超长应缩小字号放进首页，仍为 1 页`)
    const all = pageText(pages[0])
    assert.ok(!all.includes('（续）'), `${mode} 中度超长不应出现续页标题`)
    for (const marker of markers('M', 6)) {
      assert.ok(all.includes(marker), `${mode} 缩小后的首页应包含 ${marker}`)
    }
  }

  // 长内容：三个模板都必须首页不丢行 + 续页包含剩余全部标记行
  for (const mode of modes) {
    const pages = renderWithCapture(() => buildServiceRecordPdf(makeOrder(mode, 'L', workLines('L', 20))))
    assert.ok(pages.length >= 2, `${mode} 长内容应追加续页`)
    const first = pageText(pages[0])
    const all = pages.map(pageText).join('\n')
    assert.ok(first.includes('LMARK1'), `${mode} 首页应保留起始内容`)
    assert.ok(!first.includes('LMARK20'), `${mode} 首页不应容纳全部内容（超出部分应进续页）`)
    assert.ok(!first.includes('（续）'), `${mode} 首页不应出现续页标题`)
    const continuationText = pages.slice(1).map(pageText).join('\n')
    assert.ok(continuationText.includes('（续）'), `${mode} 续页应有「（续）」标题`)
    assert.ok(!continuationText.includes('客户签署'), `${mode} 续页不应带签名区`)
    for (const marker of markers('L', 20)) {
      assert.ok(all.includes(marker), `${mode} 长内容导出后应包含 ${marker}`)
    }
  }

  // 批量导出：短现场单 + 长内勤单 + 长远程单，页序必须正确
  const batch = [
    makeOrder('onsite', 'A', workLines('A', 3)),
    makeOrder('office', 'B', workLines('B', 20)),
    makeOrder('remote', 'C', workLines('C', 20)),
  ]
  const pages = renderWithCapture(() => buildServiceRecordsPdf(batch))
  const owners = pages.map((page) => {
    const t = pageText(page)
    if (/AMARK\d/.test(t) || t.includes('SO-A-001')) return 'A'
    if (/BMARK\d/.test(t) || t.includes('SO-B-001')) return 'B'
    if (/CMARK\d/.test(t) || t.includes('SO-C-001')) return 'C'
    return '?'
  })
  assert.ok(!owners.includes('?'), `批量导出每页都应能归属某个工单: ${owners}`)
  const seq = owners.join('')
  assert.ok(/^A+B+C+$/.test(seq), `批量导出页序应为 A...B...C...，实际: ${seq}`)
  assert.equal(owners.filter((o) => o === 'A').length, 1, '短现场单应只有 1 页')
  assert.ok(owners.filter((o) => o === 'B').length >= 2, '长内勤单应有续页')
  assert.ok(owners.filter((o) => o === 'C').length >= 2, '长远程单应有续页')
  const batchAll = pages.map(pageText).join('\n')
  for (const prefix of ['A', 'B', 'C']) {
    const count = prefix === 'A' ? 3 : 20
    for (const marker of markers(prefix, count)) {
      assert.ok(batchAll.includes(marker), `批量导出应包含 ${marker}`)
    }
  }

  console.log('service-record-pdf-continuation.test.js: all assertions passed')
}

main()
