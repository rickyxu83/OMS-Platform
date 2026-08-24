const crypto = require('crypto')
const env = require('../../config/env')

const DEVICE_COOKIE_NAME = env.deviceCookieName
const DEVICE_COOKIE_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000

// 与 middleware/auth.js 的 cookieToken 同风格手写解析，不引 cookie-parser
function readCookie(req, name) {
  const header = req.get?.('cookie') || ''
  return header
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1] || ''
}

function readDeviceId(req) {
  return readCookie(req, DEVICE_COOKIE_NAME)
}

// UA 粗粒度解析：只用于邮件里给用户看的设备描述，不做精确指纹
function inferDeviceLabel(userAgent = '') {
  const ua = String(userAgent)
  let os = '未知设备'
  if (/iPhone/i.test(ua)) os = 'iPhone'
  else if (/iPad/i.test(ua)) os = 'iPad'
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Mac'
  else if (/Android/i.test(ua)) os = '安卓设备'
  else if (/Windows/i.test(ua)) os = 'Windows 电脑'

  let browser = ''
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome'
  else if (/Safari/i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  return browser ? `${os} · ${browser}` : os
}

// 陌生设备登录提醒（002-login-security）：全部登录路径共用 issueSession，在这里统一挂钩。
// 设备标记 = 长效 HttpOnly Cookie（两年）；Cookie 缺失即视为陌生设备 → 发提醒邮件（消防式，失败不影响登录）。
// 清 Cookie/换浏览器会误报一封，属可接受的保守策略。
function markDeviceAndAlert(req, res, user, { method, sessionCookieOptions }) {
  if (readDeviceId(req)) return
  const deviceId = crypto.randomUUID()
  res.cookie(DEVICE_COOKIE_NAME, deviceId, { ...sessionCookieOptions, maxAge: DEVICE_COOKIE_MAX_AGE_MS })

  const to = String(user?.email || '').trim()
  if (!to || !to.includes('@')) return

  const { sendNewDeviceLoginMail } = require('../../services/mail')
  const { resolveIpLocation } = require('../../utils/ip-location')
  sendNewDeviceLoginMail({
    to,
    realName: user.real_name || user.username || '',
    methodLabel: method === 'passkey_login' ? '通行密钥（生物识别）' : '账号密码',
    ip: req.ip || '',
    location: resolveIpLocation(req.ip) || '',
    deviceLabel: inferDeviceLabel(req.get?.('user-agent')),
  }).catch((error) => {
    console.error('new device login mail failed', error.message)
  })
}

module.exports = {
  DEVICE_COOKIE_NAME,
  inferDeviceLabel,
  markDeviceAndAlert,
  readDeviceId,
}
