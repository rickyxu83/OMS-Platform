const assert = require('node:assert/strict')
const { displaySerialNo, normalizeSerialNo } = require('../src/modules/devices/controller')

// 2026-09-11 回归：新增设备存展示形态（保留多值分隔符 ;），归一化仅用于去重比对
// 此前 create 误存 normalizeSerialNo 结果："SN1;SN2" 入库变 "SN1SN2"，编辑重存才恢复

// 多值分隔符保留
assert.equal(displaySerialNo('SN1;SN2'), 'SN1;SN2')
assert.equal(displaySerialNo('SN1; SN2 ; SN3'), 'SN1; SN2 ; SN3')
// 全角分号/字符转半角（NFKC），首尾空白去除
assert.equal(displaySerialNo('  SN1；SN2  '), 'SN1;SN2')
assert.equal(displaySerialNo('ＦＡＳ２７５０'), 'FAS2750')
// 原始大小写保留（展示形态不做大写归一）
assert.equal(displaySerialNo('sn1;Sn2'), 'sn1;Sn2')
// 空值
assert.equal(displaySerialNo(''), null)
assert.equal(displaySerialNo('   '), null)
assert.equal(displaySerialNo(null), null)

// 去重比对口径不变：归一化仍剥掉分隔符、转大写
assert.equal(normalizeSerialNo('SN1;SN2'), 'SN1SN2')
assert.equal(normalizeSerialNo('sn1；sn2'), 'SN1SN2')
assert.equal(normalizeSerialNo(''), null)

console.log('device serial-no display tests passed')
