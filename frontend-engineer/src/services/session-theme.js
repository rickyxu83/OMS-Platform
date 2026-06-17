import { safeStorageGet, safeStorageRemove, safeStorageSet } from './safe-storage'

const TOKEN_KEY = 'oms-platform-token'
const THEME_KEY = 'oms-platform-engineer:session-theme'

const palettes = [
  ['47 35 111', '37 99 235', '249 115 22', '244 63 94'],
  ['124 58 237', '14 165 233', '16 185 129', '245 158 11'],
  ['37 99 235', '6 182 212', '234 88 12', '236 72 153'],
  ['91 33 182', '59 130 246', '34 197 94', '251 146 60'],
  ['99 102 241', '20 184 166', '245 158 11', '244 63 94'],
]

function tokenHash(token) {
  let hash = 0
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0
  }
  return String(hash)
}

function pickTheme(token) {
  const palette = palettes[Math.floor(Math.random() * palettes.length)]
  const offset = Math.floor(Math.random() * palette.length)
  const colors = palette.map((_, index) => palette[(index + offset) % palette.length])
  return {
    tokenHash: tokenHash(token),
    colors,
  }
}

function readTheme() {
  const raw = safeStorageGet(localStorage, THEME_KEY, '')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    safeStorageRemove(localStorage, THEME_KEY)
    return null
  }
}

export function applySessionTheme(theme = readTheme()) {
  if (!theme?.colors?.length) return
  const [a, b, c, d] = theme.colors
  const style = document.documentElement.style
  style.setProperty('--engineer-session-collision-a', `rgb(${a} / 18%)`)
  style.setProperty('--engineer-session-collision-b', `rgb(${b} / 16%)`)
  style.setProperty('--engineer-session-collision-c', `rgb(${c} / 14%)`)
  style.setProperty('--engineer-session-collision-d', `rgb(${d || a} / 12%)`)
  style.setProperty('--engineer-session-orb-a', `rgb(${a} / 24%)`)
  style.setProperty('--engineer-session-orb-b', `rgb(${b} / 22%)`)
  style.setProperty('--engineer-session-orb-c', `rgb(${c} / 18%)`)
}

export function ensureSessionTheme({ force = false } = {}) {
  const token = safeStorageGet(localStorage, TOKEN_KEY, '')
  if (!token) return
  const currentHash = tokenHash(token)
  const existing = readTheme()
  const theme = !force && existing?.tokenHash === currentHash ? existing : pickTheme(token)
  safeStorageSet(localStorage, THEME_KEY, JSON.stringify(theme))
  applySessionTheme(theme)
}

export function resetSessionTheme() {
  safeStorageRemove(localStorage, THEME_KEY)
  const style = document.documentElement.style
  ;[
    '--engineer-session-collision-a',
    '--engineer-session-collision-b',
    '--engineer-session-collision-c',
    '--engineer-session-collision-d',
    '--engineer-session-orb-a',
    '--engineer-session-orb-b',
    '--engineer-session-orb-c',
  ].forEach((property) => style.removeProperty(property))
}
