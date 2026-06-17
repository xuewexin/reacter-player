import { getEnabledSources, degradeQuality, markSourceStatus, isSourceHealthy, SOURCES, QUALITY_LEVELS } from './sources'
import { cacheSongUrl, getCachedSongUrl, getAnyCachedUrl, cacheLyric, getCachedLyric } from './cache'
import { getLxMusicUrl } from './lxsource'

const API_NETSTART = '/api/music'  // 代理到 music.163.com 官方API
const API_QQSEARCH = '/api/qqsearch'  // 代理到 c.y.qq.com QQ音乐搜索

async function reqNetstart(path, params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  const url = `${API_NETSTART}${path}${qs ? '?' + qs : ''}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`163 error: ${res.status}`)
    return res.json()
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('请求超时')
    throw e
  }
}

// ================================================================
// 单个音源获取 URL — 供 getBestSongUrl 并行调用
// ================================================================
async function tryNetstartUrl(id, level) {
  const useLevel = degradeQuality(SOURCES.netstart, level)
  const br = useLevel === 'lossless' ? 999000 : useLevel === 'exhigh' ? 320000 : useLevel === 'higher' ? 192000 : 128000

  // 主端点：song/enhance/player/url
  try {
    const ids = JSON.stringify([Number(id)])
    const d = await reqNetstart('/song/enhance/player/url', { ids, br })
    if (d.code === 200) {
      const item = (Array.isArray(d.data) ? d.data[0] : d.data)
      if (item?.url) {
        markSourceStatus('netstart', true)
        return { url: item.url, source: 'netstart', level: item.level || useLevel, size: item.size, br: item.br }
      }
    }
  } catch { /* 忽略 */ }

  // 备用端点
  try {
    const d2 = await reqNetstart('/song/url', { id: String(id) })
    if (d2.code === 200) {
      const item2 = (Array.isArray(d2.data) ? d2.data[0] : d2.data)
      if (item2?.url) {
        markSourceStatus('netstart', true)
        return { url: item2.url, source: 'netstart', level: 'standard', size: item2.size, br: item2.br }
      }
    }
  } catch { /* ignore */ }

  // 该歌曲在此源不可用（版权限制），不标记源不健康
  return null
}

function tryRedirect163(id) {
  // 163 redirect 是最后的保底，同步返回
  const url = `https://music.163.com/song/media/outer/url?id=${String(id)}.mp3`
  markSourceStatus('redirect163', true)
  return { url, source: 'redirect163', level: 'standard' }
}

// ================================================================
// LX Music 音源获取 URL — 接入 Huibq 后端解析五大平台直链
// ================================================================
async function tryLxSourceUrl(sourceName, songId, level) {
  const src = SOURCES[sourceName]
  if (!src || !src.platform) return null

  const useLevel = degradeQuality(src, level)
  try {
    const result = await getLxMusicUrl(src.platform, songId, useLevel)
    if (result?.url) {
      markSourceStatus(sourceName, true)
      return { url: result.url, source: sourceName, level: result.level || useLevel }
    }
    return null
  } catch (e) {
    console.warn(`[tryLxSourceUrl] ${sourceName} 异常:`, e.message)
    markSourceStatus(sourceName, false)
    return null
  }
}

// ================================================================
// 多音源并行聚合 — 核心函数
// 从所有启用的音源并行请求，任一成功即返回（按优先级）
// ================================================================

/**
 * 获取最佳播放地址（多音源并行竞争）
 * @param {string|number} id - 歌曲 ID
 * @param {string} level - 期望音质 'standard'|'higher'|'exhigh'|'lossless'
 * @param {Object} opts
 * @param {boolean} opts.skipCache - 跳过缓存
 * @returns {Promise<{url:string, source:string, level:string, size:number, br:number}[]>}
 */
export async function getBestSongUrl(id, level = 'standard', opts = {}) {
  const idStr = String(id)

  // 1. 查缓存（跳过已删除音源的陈旧缓存）
  if (!opts.skipCache) {
    // 先精确匹配质量
    const exact = getCachedSongUrl(idStr, level)
    if (exact?.url && SOURCES[exact.source]) {
      console.log('[getBestSongUrl] 缓存命中:', exact.source, exact.level)
      return [{ url: exact.url, id: idStr, source: exact.source, level: exact.level }]
    }
    if (exact?.url && !SOURCES[exact.source]) {
      console.log('[getBestSongUrl] 跳过已删除音源缓存:', exact.source)
    }
    // 降级匹配任意可用质量
    const any = getAnyCachedUrl(idStr)
    if (any?.url && SOURCES[any.source]) {
      console.log('[getBestSongUrl] 缓存降级命中:', any.source, any.level)
      return [{ url: any.url, id: idStr, source: any.source, level: any.level }]
    }
    if (any?.url && !SOURCES[any.source]) {
      console.log('[getBestSongUrl] 跳过已删除音源降级缓存:', any.source)
    }
  }

  // 2. 过滤出健康的音源（除去最低优先级的 redirect163，它总是最后兜底）
  const sources = getEnabledSources().filter(s => isSourceHealthy(s.name))

  // 3. 并行请求所有音源，收集所有成功结果
  const tasks = []
  for (const src of sources) {
    if (src.name === 'redirect163') continue
    if (src.name === 'netstart') {
      tasks.push(tryNetstartUrl(idStr, level))
    } else if (src.name === 'lxWy') {
      // ★ 仅 lxWy：Netease 歌曲 ID 只能映射到 LX 后端的 wy（网易云）源
      //    tx/kw/kg/mg 需要各自平台的 ID，不在此尝试
      tasks.push(tryLxSourceUrl(src.name, idStr, level))
    }
  }

  // 并行等待所有音源
  const results = await Promise.allSettled(tasks)

  // 找第一个有效的URL（按源优先级：LX > netstart）
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.url) {
      const v = r.value
      cacheSongUrl(idStr, v.level, v.url, v.source)
      console.log('[getBestSongUrl] 成功:', v.source, v.level)
      return [{ url: v.url, id: idStr, source: v.source, level: v.level, size: v.size, br: v.br }]
    }
  }

  // 4. 所有音源都没有该歌曲的URL（版权限制），使用163直链兜底
  console.log('[getBestSongUrl] 所有音源均无此歌曲URL，使用163直链兜底')
  const fallback = tryRedirect163(idStr)
  return [{ url: fallback.url, id: idStr, source: fallback.source, level: fallback.level }]
}

// ===================== 歌曲URL（保留兼容旧调用者） =====================
// 推荐新调用者使用 getBestSongUrl

export async function getSongUrl(id, level = 'standard') {
  return getBestSongUrl(id, level)
}

// ================================================================
// 版权绕过：穷举搜索可播放版本
// 当某歌曲所有音源都返回 null 时，通过搜索同名歌曲找替代版本
// ================================================================

/**
 * ★ 获取可播放的歌曲 URL（增强版权绕过）
 *
 * 策略层级：
 *   1. 直接获取原 ID 的 URL（所有音源并行）
 *   2. 多关键词搜索同名歌曲 + 批量并行尝试所有候选
 *   3. 降低音质重试
 *   4. 最终保底：163 redirect（让浏览器尝试）
 *
 * @returns {{ url: string, id: string, source: string, level: string, altSong?: object }}
 */
export async function getPlayableSongUrl(songId, songName, artistName = '') {
  const idStr = String(songId)

  // ═══ 策略1: 直接获取原ID（强制跳过缓存，拿到新鲜URL） ═══
  console.log('[版权绕过] 策略1: 直接获取原ID', idStr, songName)
  try {
    const direct = await getBestSongUrl(idStr, 'standard', { skipCache: true })
    const directItem = direct[0]
    if (directItem?.url && !directItem.url.includes('music.163.com/song/media/outer/url')) {
      console.log('[版权绕过] 策略1成功:', directItem.source, directItem.level)
      return { ...directItem, id: idStr }
    }
  } catch { /* continue */ }

  // ═══ 策略1b: LX 后端专用重试（用网易云 ID 直接解析） ═══
  console.log('[版权绕过] 策略1b: LX后端专用重试...')
  try {
    const lxResult = await tryLxSourceUrl('lxWy', idStr, 'exhigh')
    if (lxResult?.url && !lxResult.url.includes('music.163.com/song/media/outer')) {
      console.log('[版权绕过] 策略1b成功: LX-网易云', lxResult.level)
      cacheSongUrl(idStr, lxResult.level, lxResult.url, lxResult.source)
      return { url: lxResult.url, id: idStr, source: lxResult.source, level: lxResult.level }
    }
  } catch { /* continue */ }

  // ═══ 策略2: ★ QQ音乐跨平台解析（绕过网易云版权限制） ═══
  console.log('[版权绕过] 策略2: QQ音乐跨平台解析...')
  try {
    const cross = await crossPlatformResolve(songName, artistName, 'standard')
    if (cross?.url && !cross.url.includes('music.163.com/song/media/outer')) {
      console.log('[版权绕过] 策略2成功: QQ音乐跨平台', cross.source, cross.level)
      cacheSongUrl(idStr, cross.level, cross.url, cross.source)
      return { url: cross.url, id: cross.id || idStr, source: cross.source, level: cross.level, altSong: cross.altSong }
    }
  } catch { /* continue */ }

  // ═══ 策略3: 穷举搜索同名歌曲（多关键词 + 更多结果 + 并行尝试） ═══
  if (!songName) {
    // 没有歌名，无能为力，返回163直链兜底
    return { url: `https://music.163.com/song/media/outer/url?id=${idStr}.mp3`, id: idStr, source: 'redirect163', level: 'standard' }
  }

  console.log('[版权绕过] 策略2: 多关键词搜索替代版本...')

  // 构造多个搜索关键词，提升命中率
  const queries = []
  const cleanName = songName.replace(/[\(（].*?[\)）]/g, '').trim() // 去掉括号内容
  const shortArtist = artistName ? artistName.split('/')[0].trim() : ''

  if (artistName) queries.push(`${cleanName} ${artistName}`)
  queries.push(cleanName)
  if (shortArtist && shortArtist !== artistName) queries.push(`${cleanName} ${shortArtist}`)
  // 尝试只搜歌名关键词（去掉feat/合唱等）
  const keywords = cleanName.split(/[\s\/\-]+/).filter(w => w.length >= 2)
  if (keywords.length >= 2) {
    queries.push(keywords.slice(0, 2).join(' '))
  }

  // 去重
  const uniqueQueries = [...new Set(queries)]

  // 并行搜索所有关键词
  const searchResults = await Promise.allSettled(
    uniqueQueries.map(q => search(q, 30).catch(() => ({ result: { songs: [] } })))
  )

  // 收集所有候选歌曲（去重），仅保留名称相似度高的候选
  const candidateMap = new Map()

  // ★ 名称相似度检查：避免播放完全不相关的歌曲
  function nameSimilarity(a, b) {
    const ca = a.replace(/[\(（\[].*?[\)）\]]/g, '').replace(/\s+/g, '').toLowerCase()
    const cb = b.replace(/[\(（\[].*?[\)）\]]/g, '').replace(/\s+/g, '').toLowerCase()
    if (ca === cb) return 1
    if (ca.includes(cb) || cb.includes(ca)) return 0.9
    // 计算共同字符比例
    const setA = new Set(ca.split(''))
    const setB = new Set(cb.split(''))
    let common = 0
    for (const c of setA) { if (setB.has(c)) common++ }
    return common / Math.max(setA.size, setB.size)
  }

  for (const r of searchResults) {
    if (r.status !== 'fulfilled') continue
    const songs = r.value?.result?.songs || []
    for (const s of songs) {
      const sid = String(s.id)
      if (sid === idStr) continue // 跳过原ID
      if (!candidateMap.has(sid)) {
        // ★ 仅保留名称相似度 >= 0.5 的候选，避免播放无关歌曲
        const sim = nameSimilarity(songName, s.name)
        if (sim >= 0.5) {
          candidateMap.set(sid, s)
        }
      }
    }
  }

  const candidates = Array.from(candidateMap.values())
  console.log(`[版权绕过] 策略2: 共找到 ${candidates.length} 个候选替代版本`)

  if (candidates.length > 0) {
    // 并行尝试前20个候选（分两批，避免过多并发）
    const batchSize = 10
    for (let i = 0; i < Math.min(candidates.length, 30); i += batchSize) {
      const batch = candidates.slice(i, i + batchSize)

      const batchResults = await Promise.allSettled(
        batch.map(async (cand) => {
          // 对每个候选，尝试 standard 和 higher 两个音质
          for (const level of ['standard', 'higher']) {
            try {
              const result = await getBestSongUrl(cand.id, level, { skipCache: true })
              const item = result[0]
              if (item?.url && !item.url.includes('music.163.com/song/media/outer/url')) {
                console.log(`[版权绕过] 策略2成功: ${cand.name} (${cand.id}) via ${item.source} ${item.level}`)
                return { url: item.url, id: String(cand.id), source: item.source, level: item.level, altSong: cand }
              }
            } catch { /* next level */ }
          }
          return null
        })
      )

      // 找第一个成功的
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) {
          return r.value
        }
      }
    }
  }

  // ═══ 策略3: 降低音质重试原ID ═══
  console.log('[版权绕过] 策略4: 原ID降级音质重试...')
  for (const level of ['standard', 'higher']) {
    try {
      const result = await getBestSongUrl(idStr, level, { skipCache: true })
      const item = result[0]
      if (item?.url && !item.url.includes('music.163.com/song/media/outer/url')) {
        console.log('[版权绕过] 策略3成功:', item.source, item.level)
        return { ...item, id: idStr }
      }
    } catch { /* next */ }
  }

  // ═══ 策略4: LX 后端 wy 源专用重试（降级音质） ═══
  console.log('[版权绕过] 策略5: LX后端降级重试...')
  for (const quality of ['standard', 'higher']) {
    try {
      const result = await tryLxSourceUrl('lxWy', idStr, quality)
      if (result?.url && !result.url.includes('music.163.com/song/media/outer')) {
        console.log('[版权绕过] 策略4成功: lxWy', result.level)
        cacheSongUrl(idStr, result.level, result.url, result.source)
        return { url: result.url, id: idStr, source: result.source, level: result.level }
      }
    } catch { /* next quality */ }
  }

  // ═══ 策略5: 保底 — 163 redirect（让浏览器最后一搏） ═══
  console.log('[版权绕过] 策略6: 163直链保底')
  return { url: `https://music.163.com/song/media/outer/url?id=${idStr}.mp3`, id: idStr, source: 'redirect163', level: 'standard' }
}

// ===================== 歌词（接入缓存） =====================

export async function getLyric(id) {
  const idStr = String(id)

  // 1. 查缓存
  const cached = getCachedLyric(idStr)
  if (cached !== null) {
    console.log('[getLyric] 缓存命中:', idStr)
    return { lrc: { lyric: cached } }
  }

  // 2. 网易云官方歌词API
  try {
    const d = await reqNetstart('/song/lyric', { id: idStr, lv: 1 })
    if (d.code === 200) {
      const lyric = d.lrc?.lyric || d.tlyric?.lyric || ''
      if (lyric) cacheLyric(idStr, lyric)
      return { lrc: { lyric } }
    }
  } catch (e) {
    console.warn('[getLyric] 163 API失败:', e.message)
  }
  return { lrc: { lyric: '' } }
}

// ===================== 搜索 =====================

export async function search(keywords, limit = 30) {
  const d = await reqNetstart('/search/get', { s: keywords, type: 1, limit })
  if (d.code === 200) {
    return d  // { code: 200, result: { songs: [...], songCount: N } }
  }
  throw new Error('搜索失败')
}

// ===================== QQ音乐搜索（获取 songmid 用于 LX 后端 tx 源解析） =====================

export async function searchQQMusic(keywords, limit = 10) {
  const qs = `w=${encodeURIComponent(keywords)}&format=json&n=${limit}`
  const url = `${API_QQSEARCH}/soso/fcgi-bin/client_search_cp?${qs}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`QQ搜索失败: ${res.status}`)
    const d = await res.json()
    if (d.code === 0 && d.data?.song?.list) {
      return d.data.song.list.map(s => ({
        songmid: s.songmid,
        songname: s.songname,
        singer: (s.singer || []).map(si => si.name).join('/'),
        album: s.albumname || '',
        interval: s.interval || 0,
      }))
    }
    return []
  } catch (e) {
    clearTimeout(timeout)
    console.warn('[searchQQMusic] 失败:', e.message)
    return []
  }
}

/**
 * ★ 跨平台版权绕过：当 Netease 无法播放时，通过 QQ 音乐搜索同名歌曲，
 *    获取 QQ 音乐 songmid，再通过 LX 后端 tx 源解析播放直链
 */
export async function crossPlatformResolve(songName, artistName, quality = 'standard') {
  if (!songName) return null

  const cleanName = songName.replace(/[\(（\[].*?[\)）\]]/g, '').trim()

  // 构造搜索词
  const queries = []
  if (artistName) {
    const shortArtist = artistName.split('/')[0].trim()
    queries.push(`${cleanName} ${shortArtist}`)
  }
  queries.push(cleanName)

  for (const q of queries) {
    const results = await searchQQMusic(q, 5)
    if (!results.length) continue

    // 按名称相似度排序，取最佳匹配
    const scored = results.map(r => {
      const sim = (() => {
        const a = cleanName.replace(/\s+/g, '').toLowerCase()
        const b = r.songname.replace(/\s+/g, '').toLowerCase()
        if (a === b) return 1
        if (a.includes(b) || b.includes(a)) return 0.9
        const setA = new Set(a.split(''))
        const setB = new Set(b.split(''))
        let common = 0
        for (const c of setA) { if (setB.has(c)) common++ }
        return common / Math.max(setA.size, setB.size)
      })()
      return { ...r, sim }
    }).filter(r => r.sim >= 0.5).sort((a, b) => b.sim - a.sim)

    for (const match of scored) {
      // 用 QQ 音乐 songmid 通过 LX 后端 tx 源解析
      const lxResult = await tryLxSourceUrl('lxTx', match.songmid, quality)
      if (lxResult?.url) {
        console.log(`[跨平台] QQ音乐解析成功: ${match.songname} (${match.songmid}) via ${lxResult.source}`)
        return {
          ...lxResult,
          id: match.songmid,
          altSong: { name: match.songname, id: match.songmid, singer: match.singer },
        }
      }
    }
  }

  return null
}

export async function searchSuggest(keywords) {
  return reqNetstart('/search/suggest', { keywords, type: 'mobile' })
}

// ===================== 歌曲详情 =====================

export async function getSongDetail(ids) {
  // 网易云API要求 ids 参数为JSON数组格式: [id1,id2,...]
  const idStr = Array.isArray(ids) ? JSON.stringify(ids) : JSON.stringify([ids])
  const d = await reqNetstart('/song/detail', { ids: idStr })
  // 163API返回 { songs: [...] }，转换为兼容格式
  if (d.code === 200 && d.songs) {
    return { data: d.songs }
  }
  return d
}

// ===================== 歌单 =====================

export async function getPlaylistDetail(id) {
  const d = await reqNetstart('/playlist/detail', { id })
  // 163API用result包装
  if (d.code === 200 && d.result) {
    return { code: 200, playlist: d.result }
  }
  return d
}

export async function getPlaylistTracks(id, limit = 50) {
  return reqNetstart('/playlist/track/all', { id, limit })
}

export async function getTopPlaylist(cat = '华语', limit = 10) {
  return reqNetstart('/top/playlist', { cat, limit })
}

// ===================== 热门/排行 =====================

const TOP_PLAYLIST_IDS = {
  0: '3778678',   // 热歌榜
  1: '3779629',   // 新歌榜
  2: '2884035',   // 原创榜
  3: '19723756',  // 飙升榜
}

export async function getTopSongs(type = 0) {
  const playlistId = TOP_PLAYLIST_IDS[type] || TOP_PLAYLIST_IDS[0]
  const d = await reqNetstart('/playlist/detail', { id: playlistId })
  // 163API: { code: 200, result: { tracks: [...] } }
  if (d.code === 200 && d.result?.tracks) {
    return { data: d.result.tracks }
  }
  throw new Error('获取榜单失败')
}

export async function getNewSongs(limit = 20) {
  const d = await reqNetstart('/playlist/detail', { id: TOP_PLAYLIST_IDS[1] })
  if (d.code === 200 && d.result?.tracks) {
    return { data: d.result.tracks.slice(0, limit) }
  }
  throw new Error('获取新歌失败')
}

export async function getArtistTopSongs(id) {
  const d = await reqNetstart('/artist/top/song', { id })
  if (d.code === 200 && d.songs) {
    return { data: d.songs }
  }
  return d
}

// ===================== 专辑 =====================

export async function getAlbumDetail(id) {
  return reqNetstart('/album', { id })
}

/** 获取最新专辑 */
export async function getNewAlbums(limit = 10) {
  const d = await reqNetstart('/album/newest', { limit })
  if (d.code === 200) {
    return { albums: d.albums || [] }
  }
  // fallback: top/album?type=new
  const d2 = await reqNetstart('/top/album', { type: 'new', limit })
  if (d2.code === 200) {
    return { albums: (d2.monthData || d2.albums || []) }
  }
  throw new Error('获取新专辑失败')
}

/** 获取热门专辑 */
export async function getHotAlbums(limit = 10) {
  const d = await reqNetstart('/top/album', { type: 'hot', limit })
  if (d.code === 200) {
    return { albums: d.monthData || d.albums || [] }
  }
  throw new Error('获取热门专辑失败')
}

// ===================== 艺人 =====================

/** 获取热门艺人 */
export async function getTopArtists(limit = 10, type = 1) {
  // type: 1=男歌手, 2=女歌手, 3=乐队
  const d = await reqNetstart('/top/artists', { limit, offset: 0 })
  if (d.code === 200 && d.artists) {
    return { artists: d.artists }
  }
  // fallback: artist/list
  const d2 = await reqNetstart('/artist/list', { type, area: 96, limit })
  if (d2.code === 200 && d2.artists) {
    return { artists: d2.artists }
  }
  throw new Error('获取热门艺人失败')
}

/** 获取艺人热门歌曲（简化） */
export async function getArtistHotSongs(id, limit = 5) {
  const d = await reqNetstart('/artist/top/song', { id })
  if (d.code === 200 && d.songs) {
    return { songs: d.songs.slice(0, limit) }
  }
  return { songs: [] }
}

// ===================== 个性化推荐 =====================

export async function getPersonalized(limit = 6) {
  const d = await reqNetstart('/personalized', { limit })
  if (d.code === 200 && d.result) {
    return { result: d.result }
  }
  throw new Error('获取推荐失败')
}

// ===================== 城市排行榜 =====================
// 使用不同歌单ID模拟城市/地区排行榜
const CITY_PLAYLISTS = {
  '北京': '2884035',     // 原创榜
  '上海': '19723756',    // 飙升榜
  '广州': '3778678',     // 热歌榜
  '成都': '3779629',     // 新歌榜
  '全国': '3778678',     // 热歌榜
}

export async function getCityCharts(city = '全国', limit = 20) {
  const playlistId = CITY_PLAYLISTS[city] || CITY_PLAYLISTS['全国']
  const d = await reqNetstart('/playlist/detail', { id: playlistId })
  if (d.code === 200 && d.result?.tracks) {
    return { tracks: d.result.tracks.slice(0, limit), city, playlistName: d.result.name }
  }
  throw new Error(`获取${city}排行榜失败`)
}

export function getCityNames() {
  return Object.keys(CITY_PLAYLISTS)
}

// ===================== 搜索增强 =====================

/** 综合搜索：同时搜索歌曲和专辑 */
export async function searchAll(keywords, limit = 20) {
  const [songRes, albumRes] = await Promise.allSettled([
    reqNetstart('/search/get', { s: keywords, type: 1, limit }),
    reqNetstart('/search/get', { s: keywords, type: 10, limit: Math.floor(limit / 2) }),
  ])

  const songs = songRes.status === 'fulfilled' && songRes.value.code === 200
    ? (songRes.value.result?.songs || [])
    : []
  const albums = albumRes.status === 'fulfilled' && albumRes.value.code === 200
    ? (albumRes.value.result?.albums || [])
    : []

  return { songs, albums, keyword: keywords }
}

/** 搜索专辑 */
export async function searchAlbums(keywords, limit = 20) {
  const d = await reqNetstart('/search/get', { s: keywords, type: 10, limit })
  if (d.code === 200) {
    return { albums: d.result?.albums || [] }
  }
  throw new Error('搜索专辑失败')
}

// ===================== 所有歌单（用于发现更多） =====================

export async function getTopPlaylistHighQuality(cat = '全部', limit = 20) {
  return reqNetstart('/top/playlist/highquality', { cat, limit })
}

// ===================== Banner / 热搜 =====================

export async function getBanner() {
  return reqNetstart('/v2/banner/get', { type: 0 })
}

export async function getSearchHot() {
  return reqNetstart('/search/hot')
}

// 163官方 /search/hot/detail 接口不存在(404)
// 使用热搜歌单中的top歌手名作为热门关键词
const FALLBACK_HOT_WORDS = [
  '周杰伦', '林俊杰', '陈奕迅', '邓紫棋',
  '薛之谦', '李荣浩', 'Taylor Swift', '晴天'
]

export async function getSearchHotDetail() {
  try {
    const d = await reqNetstart('/search/hot/detail')
    if (d.code === 200 && d.data) {
      return d
    }
  } catch {
    // 接口不存在，使用备用关键词
  }
  return { data: FALLBACK_HOT_WORDS.map(w => ({ searchWord: w })) }
}
