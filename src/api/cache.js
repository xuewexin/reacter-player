// ============================================================
// URL + 歌词缓存 — 借鉴小北云 URL 缓存策略
// sessionStorage 存储，30分钟 TTL，减少重复请求
// ============================================================

const CACHE_PREFIX = 'mp_cache_'
const DEFAULT_TTL = 30 * 60 * 1000 // 30 分钟

// ---- 缓存条目结构 ----
// { data, ts: timestamp, source: 'lxWy'|'lxTx'|'netstart'|'redirect163' }

function now() { return Date.now() }

// ---- 通用写入 ----
function set(key, data, ttl = DEFAULT_TTL) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data,
      ts: now(),
      ttl,
    }))
  } catch {
    // sessionStorage 满了，清理旧条目
    clearExpired()
    try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: now(), ttl })) }
    catch { /* 静默失败 */ }
  }
}

// ---- 通用读取 ----
function get(key) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (now() - entry.ts > entry.ttl) {
      sessionStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

// ---- 清理过期条目 ----
function clearExpired() {
  const nowTs = now()
  const keys = Object.keys(sessionStorage)
  for (const k of keys) {
    if (!k.startsWith(CACHE_PREFIX)) continue
    try {
      const entry = JSON.parse(sessionStorage.getItem(k))
      if (nowTs - entry.ts > entry.ttl) {
        sessionStorage.removeItem(k)
      }
    } catch {
      sessionStorage.removeItem(k)
    }
  }
}

// ---- 歌曲 URL 缓存 ----
// key: url_{songId}_{level}
export function cacheSongUrl(songId, level, url, source) {
  set(`url_${songId}_${level}`, { url, source, level })
}

export function getCachedSongUrl(songId, level) {
  const entry = get(`url_${songId}_${level}`)
  if (entry?.url) {
    return { url: entry.url, source: entry.source, level: entry.level || level }
  }
  return null
}

// 获取任意已知质量的缓存 URL（降级匹配）
export function getAnyCachedUrl(songId) {
  // 从高到低尝试
  for (const level of ['lossless', 'exhigh', 'higher', 'standard']) {
    const entry = get(`url_${songId}_${level}`)
    if (entry?.url) return { url: entry.url, level, source: entry.source }
  }
  return null
}

// ---- 歌词缓存 ----
// key: lrc_{songId}
export function cacheLyric(songId, lrc) {
  set(`lrc_${songId}`, lrc, 60 * 60 * 1000) // 歌词缓存 1 小时
}

export function getCachedLyric(songId) {
  return get(`lrc_${songId}`)
}

// ============================================================
// 通用 API 响应缓存 — 让首页秒开
// ============================================================

const API_CACHE_TTL = 5 * 60 * 1000;

export function cacheApiResponse(name, data) {
  set(`api_${name}`, data, API_CACHE_TTL);
}

export function getCachedApiResponse(name) {
  return get(`api_${name}`);
}

export function cachedApiFetch(name, fetcher) {
  const cached = getCachedApiResponse(name);
  const promise = Promise.resolve(fetcher()).then(data => {
    if (data !== null && data !== undefined) cacheApiResponse(name, data);
    return data;
  });
  return { cached, promise };
}

// ---- 搜索热词缓存（更长的 TTL） ----
export function cacheHotKeywords(words) {
  set('hot_kwds', words, 24 * 60 * 60 * 1000) // 24 小时
}

export function getCachedHotKeywords() {
  return get('hot_kwds')
}

// ---- 初始化：定期清理 ----
if (typeof window !== 'undefined') {
  clearExpired()
  // 每 10 分钟清理一次过期条目
  setInterval(clearExpired, 10 * 60 * 1000)
}
