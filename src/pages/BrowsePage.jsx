import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as api from '../api/music'
import { PlayIcon, MusicNoteIcon, CloseIcon, StarIcon } from '../components/Icons'
import './BrowsePage.css'

function proxyImageUrl(url, params = '') {
  if (!url) return ''
  const fixed = url.replace(/^http:/, 'https:')
  if (!fixed.startsWith('https://')) return fixed
  const match = fixed.match(/^https:\/\/p(\d+)\.music\.126\.net\/(.+)/)
  if (match) {
    const sub = parseInt(match[1]) <= 4 ? match[1] : '1'
    const [purePath] = match[2].split('?')
    return `/img-p${sub}/${purePath}${params ? '?param=' + params : ''}`
  }
  return fixed
}

function formatDuration(ms) {
  if (!ms) return ''
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatCount(n) {
  if (!n) return ''
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

// ==================== 数据加载 ====================

async function fetchHotSongs() {
  const d = await api.getTopSongs(0)
  return (d.data || []).slice(0, 100).map(raw => ({
    id: raw.id,
    title: raw.name,
    artist: (raw.ar || raw.artists || []).map(a => a.name).join('/'),
    album: (raw.al || raw.album || {}).name || '',
    cover: (raw.al || raw.album || {}).picUrl || '',
    duration: raw.dt || raw.duration || 0,
  }))
}

async function fetchTopArtists() {
  const [male, female, band] = await Promise.allSettled([
    api.getTopArtists(30, 1).catch(() => ({ artists: [] })),
    api.getTopArtists(30, 2).catch(() => ({ artists: [] })),
    api.getTopArtists(20, 3).catch(() => ({ artists: [] })),
  ])
  const all = [
    ...(male.status === 'fulfilled' ? male.value.artists || [] : []),
    ...(female.status === 'fulfilled' ? female.value.artists || [] : []),
    ...(band.status === 'fulfilled' ? band.value.artists || [] : []),
  ]
  return all.map(a => ({
    id: a.id,
    name: a.name,
    picUrl: a.picUrl || a.img1v1Url || a.cover || '',
    albumSize: a.albumSize || 0,
    musicSize: a.musicSize || 0,
  }))
}

async function fetchNewSongs() {
  const d = await api.getNewSongs(60)
  return (d.data || []).map(raw => ({
    id: raw.id,
    title: raw.name,
    artist: (raw.ar || raw.artists || []).map(a => a.name).join('/'),
    album: (raw.al || raw.album || {}).name || '',
    cover: (raw.al || raw.album || {}).picUrl || '',
    duration: raw.dt || raw.duration || 0,
  }))
}

async function fetchChartSongs() {
  const d = await api.getTopSongs(0)
  return (d.data || []).slice(0, 100).map(raw => ({
    id: raw.id,
    title: raw.name,
    artist: (raw.ar || raw.artists || []).map(a => a.name).join('/'),
    album: (raw.al || raw.album || {}).name || '',
    cover: (raw.al || raw.album || {}).picUrl || '',
    duration: raw.dt || raw.duration || 0,
  }))
}

const FETCHERS = {
  hotsongs: { fn: fetchHotSongs, title: '热门推荐', type: 'songs' },
  topartists: { fn: fetchTopArtists, title: '瞩目之星', type: 'artists' },
  newsongs: { fn: fetchNewSongs, title: '新歌精选', type: 'songs' },
  charts: { fn: fetchChartSongs, title: '排行榜', type: 'songs' },
}

// ==================== 组件 ====================

export default function BrowsePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { fetchKey } = location.state || {}

  const config = FETCHERS[fetchKey] || null
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!config) { setLoading(false); return }
    let cancelled = false
    config.fn().then(data => {
      if (!cancelled) { setItems(data); setLoading(false) }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchKey])

  const handleItemClick = (item) => {
    if (config?.type === 'artists') {
      navigate('/artist', { state: { artist: item } })
    } else {
      navigate('/player', { state: { song: item } })
    }
  }

  if (!config) {
    return (
      <div className="browse-page">
        <div className="browse-empty">未知分类</div>
      </div>
    )
  }

  return (
    <div className="browse-page">
      <div className="browse-header">
        <h2 className="browse-title">{config.title}</h2>
        <button className="browse-back" onClick={() => navigate(-1)}>
          <CloseIcon size={20} />
        </button>
      </div>

      {loading ? (
        <div className="browse-loading">
          <div className="loading-spinner" />
          <p>加载中...</p>
        </div>
      ) : config.type === 'artists' ? (
        <div className="browse-artist-grid">
          {items.map((artist, i) => (
            <div key={artist.id || i} className="browse-artist-card" onClick={() => handleItemClick(artist)}>
              <div className="browse-artist-avatar">
                {artist.picUrl ? (
                  <img src={proxyImageUrl(artist.picUrl, '300y300')} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="browse-artist-fallback">{artist.name?.charAt(0) || '?'}</div>
                )}
              </div>
              <div className="browse-artist-rank">
                <StarIcon size={12} filled /> TOP {i + 1}
              </div>
              <h4 className="browse-artist-name">{artist.name}</h4>
              <p className="browse-artist-meta">{artist.musicSize || 0} 首 · {artist.albumSize || 0} 专辑</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="browse-song-list">
          {items.map((song, i) => (
            <div key={song.id || i} className="browse-song-row" onClick={() => handleItemClick(song)}>
              <span className="browse-song-index">{i + 1}</span>
              <div className="browse-song-cover">
                {song.cover ? (
                  <img src={proxyImageUrl(song.cover, '100y100')} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <div className="browse-song-fallback"><MusicNoteIcon size={20} /></div>
                )}
              </div>
              <div className="browse-song-info">
                <span className="browse-song-name">{song.title}</span>
                <span className="browse-song-artist">{song.artist}</span>
              </div>
              <span className="browse-song-duration">{song.duration ? formatDuration(song.duration) : ''}</span>
              <button className="browse-song-play" onClick={e => { e.stopPropagation(); handleItemClick(song) }}>
                <PlayIcon size={16} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}