/**
 * 播放历史页面
 *
 * 展示用户播放过的歌曲列表（最新在前）
 */
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { MoreIcon } from '../components/Icons'
import './HistoryPage.css'

// ==================== 图片处理 ====================

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

// ==================== 时间格式化 ====================

function formatPlayedTime(ts) {
  if (!ts) return ''
  const now = Date.now()
  const diff = now - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ==================== 歌曲行 ====================

function SongRow({ song, onClick }) {
  return (
    <div className="song-row" onClick={onClick}>
      <img src={imgUrl(song.cover, '60y60')} alt="" className="song-cover" {...COVER_IMG_PROPS} />
      <div className="song-info">
        <span className="song-title">{song.title}</span>
        <span className="song-artist">{song.artist}</span>
      </div>
      <span className="song-time">{formatPlayedTime(song.playedAt)}</span>
      <button className="song-more-btn" onClick={e => e.stopPropagation()}>
        <MoreIcon size={18} />
      </button>
    </div>
  )
}

// ==================== 页面 ====================

export default function HistoryPage() {
  const { playHistory, clearPlayHistory } = usePlayer()
  const navigate = useNavigate()

  const handlePlay = (song) => {
    if (!song.id) return
    navigate('/player', {
      state: {
        song: {
          id: song.id,
          title: song.title,
          artist: song.artist,
          album: song.album,
          cover: song.cover,
        }
      }
    })
  }

  // 最新在前
  const songs = [...playHistory].reverse()

  return (
    <div className="history-page">
      <div className="history-header">
        <div className="history-header-left">
          <img src="/history-cover.jpg" alt="" className="history-cover" />
          <div>
            <h1 className="history-title">播放历史</h1>
            <p className="history-subtitle">共 {playHistory.length} 首歌曲</p>
          </div>
        </div>
        {playHistory.length > 0 && (
          <button className="btn-clear" onClick={clearPlayHistory}>
            清空历史
          </button>
        )}
      </div>

      {songs.length === 0 ? (
        <div className="history-empty">
          <p>暂无播放记录</p>
          <p className="empty-hint">播放歌曲后将自动记录在这里</p>
        </div>
      ) : (
        <div className="song-list">
          {songs.map((song, i) => (
            <SongRow
              key={`${song.id}-${song.playedAt}-${i}`}
              song={song}
              onClick={() => handlePlay(song)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
