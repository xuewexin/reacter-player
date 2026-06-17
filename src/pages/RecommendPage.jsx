/**
 * 智能推荐页面
 *
 * 功能流程：
 *   favoriteSongs → AI 分析 → 推荐歌单 + 歌曲列表
 *     → Netease 搜索匹配真实歌曲 → 获取封面 → 渲染展示
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { generateRecommendations } from '../api/ai'
import { search as searchApi, getSongDetail } from '../api/music'
import { MoreIcon } from '../components/Icons'
import './RecommendPage.css'

// ==================== 图片处理（与 Player.jsx 一致） ====================

const DEFAULT_COVER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">' +
  '<rect fill="#1a1a2e" width="300" height="300" rx="8"/>' +
  '<text fill="#555" font-size="80" text-anchor="middle" dominant-baseline="central" x="150" y="155">♪</text>' +
  '</svg>'
)

function imgUrl(url, size) {
  if (!url) return DEFAULT_COVER
  if (url.startsWith('/img-p')) return url + (size ? '?param=' + size : '')
  const fixed = url.replace(/^http:/, 'https:')
  const m = fixed.match(/https?:\/\/p(\d+)\.music\.126\.net\/(.+)/)
  if (m) {
    const sub = m[1]
    const [path] = m[2].split('?')
    const proxy = parseInt(sub) <= 4 ? `/img-p${sub}/` : '/img-p1/'
    return `${proxy}${path}${size ? '?param=' + size : ''}`
  }
  if (fixed.startsWith('https://')) return fixed + (size ? '?param=' + size : '')
  return fixed || DEFAULT_COVER
}

function handleCoverError(e) {
  if (e.target.src !== DEFAULT_COVER) e.target.src = DEFAULT_COVER
}

const COVER_IMG_PROPS = {
  loading: 'lazy',
  referrerPolicy: 'no-referrer',
  crossOrigin: 'anonymous',
  onError: handleCoverError,
}

// ==================== 工具函数 ====================

function formatDuration(ms) {
  if (!ms) return ''
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 基于"我的喜欢"生成指纹（用于缓存校验和变更检测）
function favFingerprint(favSongs) {
  return Object.keys(favSongs).sort().join(',')
}

// ==================== 歌曲行（与 HomePage SongRow 一致） ====================

function SongRow({ song, onClick }) {
  return (
    <div className="song-row" onClick={onClick}>
      <img src={imgUrl(song.cover, '60y60')} alt="" className="song-cover" {...COVER_IMG_PROPS} />
      <div className="song-info">
        <span className="song-title">{song.title}</span>
        <span className="song-artist">{song.artist}</span>
        {song.reason && <span className="song-reason">{song.reason}</span>}
      </div>
      <span className="song-duration">{song.duration ? formatDuration(song.duration) : ''}</span>
      <button className="song-more-btn" onClick={e => e.stopPropagation()}>
        <MoreIcon size={18} />
      </button>
    </div>
  )
}

// ==================== 页面主体 ====================

export default function RecommendPage() {
  const { favoriteSongs } = usePlayer()
  const navigate = useNavigate()

  // ★ 将 favoriteSongs 对象转为数组（只取有完整数据的歌曲）
  const favList = Object.values(favoriteSongs).filter(s => s.title)

  const [phase, setPhase] = useState('idle')       // idle | generating | matching | done | error
  const [recommendation, setRecommendation] = useState(null)
  const [matchedSongs, setMatchedSongs] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  // 防重复生成：记录上一次触发推荐的指纹
  const lastGeneratedFp = useRef('')
  // 标记是否正在生成中（防止并发）
  const generatingRef = useRef(false)

  // ★ 保存状态到 sessionStorage
  const saveState = useCallback((rec, matched, fp) => {
    try {
      sessionStorage.setItem('ai_recommend_state', JSON.stringify({
        recommendation: rec,
        matchedSongs: matched,
        fingerprint: fp || favFingerprint(favoriteSongs),
        timestamp: Date.now(),
      }))
    } catch { /* 静默 */ }
  }, [favoriteSongs])

  // ★ 核心：执行推荐生成 + 歌曲匹配
  const doGenerate = useCallback(async (favArr) => {
    if (generatingRef.current) return
    generatingRef.current = true
    setErrorMsg(null)
    setMatchedSongs(null)
    setPhase('generating')

    try {
      const result = await generateRecommendations(favArr)
      setRecommendation(result)
      const fp = favFingerprint(favoriteSongs)
      lastGeneratedFp.current = fp
      saveState(result, null, fp)

      setPhase('matching')
      const matched = await matchSongs(result.songs)
      setMatchedSongs(matched)
      setPhase('done')
      saveState(result, matched, fp)
    } catch (e) {
      setErrorMsg(e.message || '生成推荐失败')
      setPhase('error')
    } finally {
      generatingRef.current = false
    }
  }, [favoriteSongs, saveState]) // eslint-disable-line react-hooks/exhaustive-deps

  // ★ 挂载时：从缓存恢复 或 自动生成
  useEffect(() => {
    const fp = favFingerprint(favoriteSongs)

    // 1. 先尝试从 sessionStorage 恢复
    try {
      const raw = sessionStorage.getItem('ai_recommend_state')
      if (raw) {
        const saved = JSON.parse(raw)
        if (Date.now() - saved.timestamp < 1800000 && saved.fingerprint === fp) {
          if (saved.recommendation) {
            setRecommendation(saved.recommendation)
            lastGeneratedFp.current = fp
            if (saved.matchedSongs) {
              setMatchedSongs(saved.matchedSongs)
              setPhase('done')
              return
            } else {
              setPhase('matching')
              matchSongs(saved.recommendation.songs).then(matched => {
                setMatchedSongs(matched)
                setPhase('done')
                saveState(saved.recommendation, matched, fp)
              })
              return
            }
          }
        } else {
          sessionStorage.removeItem('ai_recommend_state')
        }
      }
    } catch { sessionStorage.removeItem('ai_recommend_state') }

    // 2. 缓存无效 → 自动生成
    if (favList.length >= 3) {
      lastGeneratedFp.current = fp
      doGenerate(favList)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ★ 动态监听：我的喜欢变化时自动更新推荐
  useEffect(() => {
    const fp = favFingerprint(favoriteSongs)

    // 喜欢的歌曲不足 → 清空推荐
    if (favList.length < 3) {
      if (recommendation) {
        setRecommendation(null)
        setMatchedSongs(null)
        setPhase('idle')
        setErrorMsg(null)
        lastGeneratedFp.current = ''
        try { sessionStorage.removeItem('ai_recommend_state') } catch {}
      }
      return
    }

    // 指纹未变 → 跳过
    if (fp === lastGeneratedFp.current) return

    lastGeneratedFp.current = fp
    doGenerate(favList)
  }, [favoriteSongs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ★ 重置：清空推荐缓存（不删我的喜欢）
  const handleReset = useCallback(() => {
    setRecommendation(null)
    setMatchedSongs(null)
    setPhase('idle')
    setErrorMsg(null)
    lastGeneratedFp.current = ''
    try { sessionStorage.removeItem('ai_recommend_state') } catch {}
    // 立即用当前喜欢重新生成
    if (favList.length >= 3) {
      setTimeout(() => doGenerate(favList), 100)
    }
  }, [favList, doGenerate])

  // ==================== 歌曲匹配（搜索 + 详情 = 封面） ====================

  const matchSongs = useCallback(async (aiSongs) => {
    // 第一步：逐首搜索
    const candidates = []
    for (const song of aiSongs) {
      if (!song.title) continue
      try {
        const query = song.artist ? `${song.title} ${song.artist}` : song.title
        const d = await searchApi(query, 5)
        const matches = d?.result?.songs || []
        const best = matches[0]
        if (best) {
          // ★ 从搜索结果的 ar/artists 提取歌手名；为空则用 AI 提供的歌手名兜底
          const ar = best.ar || best.artists || []
          const matchedArtist = ar.map(a => a.name).join('/')
          candidates.push({
            id: best.id,
            title: song.title,
            artist: matchedArtist || song.artist || '',
            album: (best.al || {}).name || '',
            cover: (best.al || {}).picUrl || '',
            duration: best.dt || 0,
            reason: song.reason || '',
          })
        } else {
          candidates.push({
            id: null,
            title: song.title,
            artist: song.artist || '',
            album: '',
            cover: '',
            duration: 0,
            reason: song.reason || '',
          })
        }
      } catch {
        candidates.push({
          id: null, title: song.title, artist: song.artist || '',
          album: '', cover: '', duration: 0, reason: song.reason || '',
        })
      }
    }

    // 第二步：批量获取歌曲详情（拿高清封面 + 补全歌手/专辑信息）
    const ids = candidates.filter(s => s.id).map(s => s.id)
    if (ids.length > 0) {
      try {
        const detailRes = await getSongDetail(ids)
        const detailMap = new Map()
        for (const ds of (detailRes.data || [])) {
          const al = ds.al || ds.album || {}
          const ar = ds.ar || ds.artists || []
          detailMap.set(ds.id, {
            cover: al.picUrl || al.blurPicUrl || '',
            artist: ar.map(a => a.name).join('/'),
            album: al.name || '',
          })
        }
        for (const item of candidates) {
          if (item.id && detailMap.has(item.id)) {
            const detail = detailMap.get(item.id)
            // 封面：优先用详情接口的高清封面
            if (detail.cover) item.cover = detail.cover
            // 歌手：如果搜索结果没拿到，用详情接口补全
            if (!item.artist && detail.artist) item.artist = detail.artist
            // 专辑：同上
            if (!item.album && detail.album) item.album = detail.album
          }
        }
      } catch (e) {
        console.warn('[智能推荐] 批量获取歌曲详情失败:', e.message)
      }
    }

    return candidates
  }, [])

  // ==================== 播放 ====================

  const handlePlaySong = useCallback((song) => {
    if (!song.id) return
    // ★ 只传 title，不传 name — 让 toSong() 走正确的分支处理字符串字段
    navigate('/player', {
      state: {
        song: {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          cover: song.cover,
          duration: song.duration,
          dt: song.duration,
        }
      }
    })
  }, [navigate])

  // ==================== 渲染辅助 ====================

  // 展示的歌曲：优先匹配结果，否则 AI 原始推荐
  const displaySongs = matchedSongs
    || (recommendation
      ? recommendation.songs.map(s => ({
          id: null, title: s.title, artist: s.artist || '',
          album: '', cover: '', duration: 0, reason: s.reason || '',
        }))
      : [])

  // ==================== 渲染 ====================

  return (
    <div className="recommend-page">

      {/* ===== 头部 ===== */}
      <div className="recommend-header">
        <div className="recommend-header-left">
          <div>
            <h1 className="recommend-title">智能推荐</h1>
            <p className="recommend-subtitle">基于你"我的喜欢"中的歌曲，生成个性化推荐</p>
          </div>
        </div>
        <div className="recommend-actions">
          <button className="btn-reset" onClick={handleReset} title="刷新推荐">
            ↻ 刷新
          </button>
        </div>
      </div>

      {/* ===== 我的喜欢统计 ===== */}
      <div className="history-stats">
        <span className="stat-item">
          我的喜欢：<strong>{favList.length}</strong> 首
        </span>
        {favList.length > 0 && (
          <div className="history-artists">
            喜欢的歌手：
            {(() => {
              const artists = [...new Set(
                favList.map(s => s.artist).filter(Boolean)
              )].slice(0, 5)
              return artists.map((a, i) => <span key={i} className="artist-tag">{a}</span>)
            })()}
          </div>
        )}
      </div>

      {/* ===== 主体 ===== */}
      <div className="recommend-body">

        {/* --- 空状态 --- */}
        {!recommendation && phase === 'idle' && (
          <div className="recommend-empty">
            <p>在"我的喜欢"中收藏歌曲后，这里将自动生成个性化推荐</p>
            {favList.length < 3 && (
              <p className="empty-hint">提示：至少需要收藏 3 首歌曲</p>
            )}
          </div>
        )}

        {/* --- 错误 --- */}
        {phase === 'error' && (
          <div className="recommend-error">
            <p>{errorMsg}</p>
            <button className="btn-retry" onClick={() => doGenerate(favList)}>重试</button>
          </div>
        )}

        {/* --- 自动生成中 --- */}
        {phase === 'generating' && (
          <div className="recommend-loading">
            <div className="loading-spinner" />
            <p>正在分析你的听歌品味...</p>
            <p className="loading-sub">根据你的歌手偏好和音乐风格智能匹配</p>
          </div>
        )}

        {/* --- 结果展示 --- */}
        {recommendation && (
          <div className="recommend-result">

            {/* 歌单卡片 */}
            <div className="playlist-card">
              <div className="playlist-card-cover">
                <img src="/recommend-cover.jpg" alt="" className="playlist-card-cover-img" />
              </div>
              <div className="playlist-card-info">
                <h2>{recommendation.playlistName}</h2>
                <p className="playlist-desc">{recommendation.description}</p>
                <div className="playlist-meta">
                  <span>{recommendation.songs.length} 首歌曲</span>
                  {recommendation.metadata?.genres?.length > 0 && (
                    <span>风格：{recommendation.metadata.genres.join(' / ')}</span>
                  )}
                </div>
              </div>
            </div>

            {/* 歌曲列表 */}
            <div className="recommend-songs">
              <h3 className="songs-section-title">推荐歌曲</h3>
              <div className="song-list">
                {displaySongs.map((song, i) => (
                  <SongRow
                    key={song.id || i}
                    song={song}
                    onClick={() => song.id && handlePlaySong(song)}
                  />
                ))}
              </div>

              {/* 匹配中提示 */}
              {phase === 'matching' && (
                <div className="song-match-loading">
                  <div className="loading-spinner" />
                  <span>正在匹配歌曲信息...</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
