// ============================================================
// LX Music 音源模块 — 接入 Huibq 洛雪音乐后端
// 通过 lxmusicapi.onrender.com 解析五大平台歌曲直链
// 绕过各平台官方 API 的版权/付费限制
// ============================================================

const LX_API = '/api/lxsource'   // 走 Vite 代理 → lxmusicapi.onrender.com
const LX_API_KEY = 'share-v3'
const LX_TIMEOUT = 12000

// ---- 支持的平台 ----
const LX_SOURCES = {
  wy: { label: '网易云', host: 'music.163.com' },
  tx: { label: 'QQ音乐', host: 'y.qq.com' },
  kw: { label: '酷我',   host: 'kuwo.cn' },
  kg: { label: '酷狗',   host: 'kugou.com' },
  mg: { label: '咪咕',   host: 'migu.cn' },
}

// ---- 支持的音质（按 LX 后端格式） ----
const LX_QUALITIES = ['128k', '320k']

// ---- 音质映射：内部质量等级 → LX 后端格式 ----
function toLxQuality(level) {
  switch (level) {
    case 'lossless':
    case 'exhigh':   return '320k'
    case 'higher':   return '320k'
    case 'standard':
    default:         return '128k'
  }
}

/**
 * 调用 LX Music 后端解析歌曲播放 URL
 * @param {string} source - 平台代码: 'wy'|'tx'|'kw'|'kg'|'mg'
 * @param {string|number} songId - 歌曲在该平台的 ID
 * @param {string} quality - 内部质量等级: 'standard'|'higher'|'exhigh'|'lossless'
 * @returns {Promise<{url:string, source:string, level:string, extra:object}|null>}
 */
export async function getLxMusicUrl(source, songId, quality = 'standard') {
  const lxQuality = toLxQuality(quality)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LX_TIMEOUT)

  try {
    const url = `${LX_API}/url/${source}/${String(songId)}/${lxQuality}`
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Key': LX_API_KEY,
        'User-Agent': 'lx-music-request/1.0',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.warn(`[LX源] HTTP ${res.status}: ${source}/${songId}`)
      return null
    }

    const body = await res.json()

    // code=0 成功；code=2 无法获取播放链接也是正常（该平台无此歌曲）
    if (body.code !== 0) {
      if (body.code === 1) {
        console.warn('[LX源] IP被限制 (code=1)')
      } else if (body.code === 5) {
        console.warn('[LX源] 请求过于频繁 (code=5)')
      } else if (body.code !== 2) {
        // code=2 是"该平台无此歌曲"，很常见，不报警
        console.warn(`[LX源] 错误 code=${body.code}: ${body.msg || 'unknown'}`)
      }
      return null
    }

    // 检查返回的 URL 是否有效
    if (!body.url || typeof body.url !== 'string') {
      return null
    }

    // ★ 按照 LX Music 原始逻辑：code=0 即信任 URL
    //    但过滤已知的无效兜底域名（panspace.kuwo.cn 是 LX 后端所有失败请求的统一兜底）
    if (body.msg !== 'success') {
      // 检查是否是指向错误 CDN 的兜底链接
      const urlHost = (() => { try { return new URL(body.url).hostname } catch { return '' } })()
      // panspace.kuwo.cn 是 LX 后端所有平台解析失败时的统一兜底 CDN，
      // 仅对 kw（酷我）平台合法，其他平台收到此域名说明后端实际解析失败
      if (urlHost === 'panspace.kuwo.cn' && source !== 'kw') {
        console.log(`[LX源] ${source}/${songId}: 拒绝跨平台兜底链接 (${urlHost})`)
        return null
      }
      console.log(`[LX源] ${source}/${songId}: ${body.msg} (URL: ${body.url.substring(0, 60)}...)`)
    }

    // ★ 将 HTTP URL 转为 HTTPS（避免浏览器 Mixed Content 拦截）
    //    但仅在页面是 HTTPS 时才转换（本地开发 HTTP 页面不需要）
    let finalUrl = body.url
    const isSecurePage = typeof window !== 'undefined' && window.location.protocol === 'https:'
    if (isSecurePage && finalUrl.startsWith('http://')) {
      finalUrl = finalUrl.replace('http://', 'https://')
    }

    const resultLevel = body.extra?.quality?.result || lxQuality
    const internalLevel = resultLevel === '320k' ? 'exhigh' : 'standard'

    return {
      url: finalUrl,
      source,
      level: internalLevel,
      extra: body.extra || null,
    }
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') {
      console.warn(`[LX源] 请求超时: ${source}/${songId}`)
    } else {
      console.warn(`[LX源] 网络异常: ${source}/${songId}`, e.message)
    }
    return null
  }
}

/**
 * 便捷函数：用网易云歌曲 ID 解析播放 URL
 * 这是最常用的路径，因为搜索返回的是网易云 ID
 * @param {string|number} songId - 网易云歌曲 ID
 * @param {string} quality - 内部质量等级
 */
export async function tryLxWyUrl(songId, quality = 'standard') {
  return getLxMusicUrl('wy', songId, quality)
}

/**
 * 批量尝试多个平台解析同一首歌
 * 适用于已知歌名但不确定在哪个平台的情况
 * @param {string} neteaseId - 网易云歌曲 ID（优先用这个）
 * @param {string} quality
 * @returns {Promise<{url:string, source:string, level:string}|null>}
 */
export async function tryLxMultiPlatform(neteaseId, quality = 'standard') {
  // 优先尝试网易云（ID 已确知），然后尝试其他平台
  const sources = ['wy', 'tx', 'kw', 'kg', 'mg']

  for (const src of sources) {
    try {
      const result = await getLxMusicUrl(src, neteaseId, quality)
      if (result?.url) {
        return result
      }
    } catch {
      // 继续下一个平台
    }
  }

  return null
}

export { LX_SOURCES, LX_QUALITIES, toLxQuality }
