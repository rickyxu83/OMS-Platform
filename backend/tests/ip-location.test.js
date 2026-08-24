const assert = require('node:assert/strict')

// 真实离线库集成测试（ip2region 包内置 ipv4.db + ipv6wry.db，无需 mock）
const { resolveIpLocation } = require('../src/utils/ip-location')

// IPv4 已知地址：国内 省/市 运营商
{
  const text = resolveIpLocation('111.13.128.20')
  assert.match(text, /北京|移动/, `unexpected v4 location: ${text}`)
}

// IPv6 国内电信：开放 IPv6 归属地后应解析出省份/运营商（此前一律返回空）
{
  const text = resolveIpLocation('240e:3a6:4a09:d540::1')
  assert.ok(text.length > 0, 'IPv6 should resolve to a location')
  assert.match(text, /江苏|中国电信/)
}

// IPv6 海外/未收录：允许「未知地区」或空串，但绝不抛错
{
  const text = resolveIpLocation('2607:5dc0:0:19::7be4:4f9c')
  assert.ok(typeof text === 'string')
}

// 内网/本机/链路本地统一归为「内网」
{
  assert.equal(resolveIpLocation('192.168.1.1'), '内网')
  assert.equal(resolveIpLocation('::1'), '内网')
  assert.equal(resolveIpLocation('fe80::1'), '内网')
}

// IPv4-mapped IPv6 地址按 v4 解析
{
  const text = resolveIpLocation('::ffff:111.13.128.20')
  assert.match(text, /北京|移动/)
}

// 空值与异常输入静默返回空
{
  assert.equal(resolveIpLocation(''), '')
  assert.equal(resolveIpLocation(null), '')
  assert.equal(resolveIpLocation('not-an-ip'), '')
}

console.log('ip-location tests passed')
