import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as api from '../api/music';
import './ArtistPage.css';

// ==================== 工具函数 ====================

function formatDuration(ms) {
  if (!ms) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function proxyImageUrl(url, params = '') {
  if (!url) return '';
  const fixed = url.replace(/^http:/, 'https:');
  if (!fixed.startsWith('https://')) return fixed;
  const match = fixed.match(/^https:\/\/p(\d+)\.music\.126\.net\/(.+)/);
  if (match) {
    const sub = parseInt(match[1]) <= 4 ? match[1] : '1';
    const [purePath] = match[2].split('?');
    const qs = params ? `?param=${params}` : '';
    return `/img-p${sub}/${purePath}${qs}`;
  }
  return fixed;
}

function toSong(raw) {
  return {
    id: raw.id,
    title: raw.name,
    artist: (raw.ar || raw.artists || []).map(a => a.name).join(' / '),
    album: (raw.al || raw.album || {}).name || '',
    albumId: (raw.al || raw.album || {}).id || 0,
    cover: (raw.al || raw.album || {}).picUrl || '',
    duration: raw.dt || raw.duration || 0,
  };
}

// ==================== 艺人页面 ====================

export default function ArtistPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const artist = location.state?.artist;

  const [allSongs, setAllSongs] = useState([]);
  const [filteredSongs, setFilteredSongs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 返回首页
  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // 跳转播放器播放歌曲
  const handleSongClick = useCallback((song) => {
    navigate('/player', { state: { song } });
  }, [navigate]);

  // 如果没有 artist 数据，返回首页
  useEffect(() => {
    if (!artist?.id) {
      navigate('/', { replace: true });
      return;
    }
  }, [artist, navigate]);

  // 加载艺人歌曲
  useEffect(() => {
    if (!artist?.id) return;

    let cancelled = false;

    const fetchSongs = async () => {
      setLoading(true);
      setError(null);

      try {
        // 并行获取：热门歌曲 + 搜索艺人名获取更多歌曲
        const [hotRes, searchRes] = await Promise.all([
          api.getArtistHotSongs(artist.id, 50).catch(() => ({ songs: [] })),
          api.search(artist.name, 30).catch(() => ({ result: { songs: [] } })),
        ]);

        if (cancelled) return;

        // 合并去重
        const songMap = new Map();
        const addSongs = (list) => {
          for (const raw of list) {
            if (!songMap.has(raw.id)) {
              songMap.set(raw.id, toSong(raw));
            }
          }
        };

        addSongs(hotRes.songs || []);
        addSongs((searchRes.result?.songs || []).filter(
          s => (s.ar || s.artists || []).some(a => a.id === artist.id || a.name === artist.name)
        ));

        const songs = Array.from(songMap.values());
        setAllSongs(songs);
        setFilteredSongs(songs);
      } catch (err) {
        console.error('ArtistPage fetch error:', err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSongs();
    return () => { cancelled = true; };
  }, [artist]);

  // 搜索过滤
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSongs(allSongs);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    setFilteredSongs(
      allSongs.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q)
      )
    );
  }, [searchQuery, allSongs]);

  if (!artist) {
    return null;
  }

  const avatarSrc = proxyImageUrl(artist.picUrl, '200y200');

  return (
    <div className="artist-page">
      {/* 顶部返回 */}
      <button className="artist-back-btn" onClick={handleBack}>← 返回</button>

      {/* 艺人信息头部 */}
      <div className="artist-header">
        <div className="artist-header-avatar">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="artist-avatar-img"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="artist-avatar-fallback">
              {artist.name.charAt(0)}
            </div>
          )}
        </div>
        <div className="artist-header-info">
          <span className="artist-type">歌手</span>
          <h1 className="artist-name">{artist.name}</h1>
          <p className="artist-stats">
            {artist.musicSize > 0 && <span>{artist.musicSize} 首歌曲</span>}
            {artist.albumSize > 0 && <span> · {artist.albumSize} 张专辑</span>}
            <span> · 共找到 {allSongs.length} 首可播放</span>
          </p>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="artist-search-bar">
        <span className="artist-search-icon">🔍</span>
        <input
          type="text"
          className="artist-search-input"
          placeholder={`在 ${artist.name} 的歌曲中搜索...`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoFocus
        />
        {searchQuery && (
          <button
            className="artist-search-clear"
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
      </div>

      {/* 歌曲列表 */}
      <div className="artist-song-section">
        <div className="artist-song-header">
          <h2 className="artist-song-title">
            {searchQuery ? `搜索结果 (${filteredSongs.length})` : `全部歌曲 (${allSongs.length})`}
          </h2>
        </div>

        {loading ? (
          <div className="artist-loading">
            <div className="loading-spinner" />
            <p>正在加载 {artist.name} 的歌曲...</p>
          </div>
        ) : error && allSongs.length === 0 ? (
          <div className="artist-error">
            <p>加载失败：{error}</p>
            <button className="artist-retry-btn" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>
        ) : filteredSongs.length === 0 ? (
          <div className="artist-empty">
            <span className="artist-empty-icon">🎵</span>
            <p>未找到匹配 "{searchQuery}" 的歌曲</p>
            <button className="artist-clear-btn" onClick={() => setSearchQuery('')}>
              清除搜索
            </button>
          </div>
        ) : (
          <div className="artist-song-list">
            {filteredSongs.map((song, i) => (
              <div
                key={song.id}
                className="artist-song-row"
                onClick={() => handleSongClick(song)}
              >
                <span className="artist-song-num">{i + 1}</span>
                <img
                  src={song.cover ? proxyImageUrl(song.cover, '60y60') : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect fill="%23222" width="60" height="60"/><text fill="%23555" x="30" y="38" text-anchor="middle" font-size="20">♪</text></svg>'}
                  alt=""
                  className="artist-song-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
                <div className="artist-song-info">
                  <span className="artist-song-name">{song.title}</span>
                  <span className="artist-song-meta">
                    {song.artist} {song.album ? `· ${song.album}` : ''}
                  </span>
                </div>
                <span className="artist-song-duration">{formatDuration(song.duration)}</span>
                <button
                  className="artist-song-play-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSongClick(song);
                  }}
                >
                  ▶
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
