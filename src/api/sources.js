// ============================================================
// 音源配置中心 — 借鉴小北云云控思路
// 多音源聚合：并行请求多个来源，最快响应的优先，失败自动降级
// ============================================================

// ---- 音源类型 ----
// 'standard' → 标准 128kbps
// 'higher'   → 高品质 192kbps
// 'exhigh'   → 极高 320kbps  
// 'lossless' → 无损 FLAC
// 'hires'    → Hi-Res

/*
  质量层级说明：
  - standard / higher / exhigh / lossless / hires
  不同音源能提供的最高质量不同：
    LX 音源:     支持 standard / higher / exhigh (128k-320k)
    163 redirect: 仅 standard（固定 128k）
    netstart:    支持 standard / higher / exhigh / lossless
*/

// ---- 音源定义 ----
// 每个音源包含：名称、URL 获取函数签名（由 music.js 注入）、优先级
// 优先级越小越优先，并行请求，任一成功即返回
const SOURCES = {
  netstart: {
    name: 'netstart',
    label: '网易',
    priority: 2,
    maxQuality: 'lossless',
    baseUrl: 'https://music.163.com/api',
  },
  // ---- LX Music 音源（Huibq 后端）— 绕过版权限制 ----
  lxWy: {
    name: 'lxWy',
    label: 'LX-网易云',
    priority: 0,           // ★ 最高优先级
    maxQuality: 'exhigh',  // 320k
    platform: 'wy',
    baseUrl: 'https://lxmusicapi.onrender.com',
  },
  lxTx: {
    name: 'lxTx',
    label: 'LX-QQ音乐',
    priority: 1,
    maxQuality: 'exhigh',
    platform: 'tx',
    baseUrl: 'https://lxmusicapi.onrender.com',
  },
  lxKw: {
    name: 'lxKw',
    label: 'LX-酷我',
    priority: 2,
    maxQuality: 'exhigh',
    platform: 'kw',
    baseUrl: 'https://lxmusicapi.onrender.com',
  },
  lxKg: {
    name: 'lxKg',
    label: 'LX-酷狗',
    priority: 3,
    maxQuality: 'exhigh',
    platform: 'kg',
    baseUrl: 'https://lxmusicapi.onrender.com',
  },
  lxMg: {
    name: 'lxMg',
    label: 'LX-咪咕',
    priority: 4,
    maxQuality: 'exhigh',
    platform: 'mg',
    baseUrl: 'https://lxmusicapi.onrender.com',
  },
  // ---- 保底音源 ----
  redirect163: {
    name: 'redirect163',
    label: '163直链',
    priority: 99,
    maxQuality: 'standard',
    baseUrl: 'https://music.163.com/song/media/outer/url',
  },
}

// 歌曲 URL 有效层级（从低到高）
const QUALITY_LEVELS = ['standard', 'higher', 'exhigh', 'lossless', 'hires']

// ---- 获取当前启用的音源列表 ----
export function getEnabledSources() {
  return Object.values(SOURCES).sort((a, b) => a.priority - b.priority)
}

// ---- 返回某个音源是否支持指定质量 ----
export function sourceSupportsQuality(source, level) {
  const maxIdx = QUALITY_LEVELS.indexOf(source.maxQuality)
  const wantIdx = QUALITY_LEVELS.indexOf(level)
  return wantIdx <= maxIdx
}

// ---- 降级质量：若当前源不支持请求的质量，返回该源能提供的最高质量 ----
export function degradeQuality(source, level) {
  if (sourceSupportsQuality(source, level)) return level
  // 从请求的质量往下找，直到找到该源支持的最高质量
  const maxIdx = QUALITY_LEVELS.indexOf(source.maxQuality)
  const wantIdx = QUALITY_LEVELS.indexOf(level)
  if (wantIdx > maxIdx) return source.maxQuality
  // 往上找（该源不支持比它更高的）
  for (let i = Math.min(wantIdx, maxIdx); i >= 0; i--) {
    if (i <= maxIdx) return QUALITY_LEVELS[i]
  }
  return QUALITY_LEVELS[0]
}

// ---- 当前音源状态（健康检查） ----
let sourceHealth = {}

export function markSourceStatus(name, ok) {
  sourceHealth[name] = { ok, time: Date.now() }
}

export function isSourceHealthy(name, staleMs = 300_000) {
  const entry = sourceHealth[name]
  if (!entry) return true // 没有记录，假设健康
  if (!entry.ok) return false
  // 超过 staleMs 的记录视为过期，重新标记为未知（健康）
  if (Date.now() - entry.time > staleMs) {
    delete sourceHealth[name]
    return true
  }
  return true
}

// ---- 导出所有导出物 ----
export { SOURCES, QUALITY_LEVELS }