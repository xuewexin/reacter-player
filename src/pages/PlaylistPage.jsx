import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as api from '../api/music';
import './PlaylistPage.css';

function formatDuration(ms) {
  if (!ms) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatCount(n) {
  if (!n) return '';
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

function proxyImageUrl(url, params = '') {
  if (!url) return '';
  const fixed = url.replace(/^http:/, 'https:');
  if (!fixed.startsWith('https://')) return fixed;
  const match = fixed.match(/^https:\/\/p(\d+)\.music\.126\.net\/(.+)/);
  if (match) {
    const sub = parseInt(match[1]) <= 4 ? match[1] : '1';
    const [purePath] = match[2].split('?');
    return `/img-p${sub}/${purePath}${params ? '?param=' + params : ''}`;
  }
  return fixed;
}

function toSong(raw) {
  return {
    id: raw.id,
    title: raw.name,
    artist: (raw.ar || raw.artists || []).map(a => a.name).join(' / '),
    album: (raw.al || raw.album || {}).name || '',
    cover: (raw.al || raw.album || {}).picUrl || '',
    duration: raw.dt || raw.duration || 0,
  };
}

export default function PlaylistPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const playlistId = location.state?.playlistId;
  const bannerTitle = location.state?.title || '';
  const bannerCover = location.state?.cover || '';

  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [pageTitle, setPageTitle] = useState(bannerTitle || '歌单');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    if (!playlistId) {
      navigate('/', { replace: true });
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        // 先尝试获取歌单详情
        const d = await api.getPlaylistDetail(playlistId).catch(() => null);
        if (cancelled) return;

        const pl = d?.playlist || d?.result;

        if (pl && pl.tracks && pl.tracks.length > 0) {
          // 歌单有内容，直接使用
          setPlaylist(pl);
          setTracks(pl.tracks.map(toSong));
          setPageTitle(bannerTitle || pl.name || '歌单');
          setIsFallback(false);
        } else {
          // 歌单无内容 → 搜索相关歌曲
          console.log('[PlaylistPage] 歌单无内容，搜索:', bannerTitle || pl?.name || playlistId);
          setIsFallback(true);
          const searchTitle = bannerTitle || pl?.name || '热门歌曲';
          setPageTitle(searchTitle);

          try {
            const searchRes = await api.search(searchTitle, 30);
            if (cancelled) return;
            const songs = (searchRes.result?.songs || []).map(toSong);
            setTracks(songs);
            setPlaylist({
              name: searchTitle,
              coverImgUrl: songs[0]?.cover || '',
              trackCount: songs.length,
              playCount: 0,
            });
          } catch {
            if (!cancelled) {
              setTracks([]);
              setPlaylist({ name: searchTitle });
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [playlistId, bannerTitle, navigate]);

  const handleSongClick = useCallback((song) => {
    navigate('/player', { state: { song } });
  }, [navigate]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) {
      navigate('/player', { state: { song: tracks[0] } });
    }
  }, [tracks, navigate]);

  if (!playlistId) return null;

  // 优先使用 Banner 封面，其次歌单封面，都走代理
  const coverSrc = bannerCover
    ? (bannerCover.includes('music.126.net') ? proxyImageUrl(bannerCover, '300y300') : bannerCover)
    : proxyImageUrl(playlist?.coverImgUrl || '', '300y300');

  return (
    <div className="playlist-page">
      <button className="pl-back-btn" onClick={() => navigate(-1)}>← 返回</button>

      {loading ? (
        <div className="pl-loading">
          <div className="loading-spinner" />
          <p>加载歌单中...</p>
        </div>
      ) : error ? (
        <div className="pl-error">
          <p>加载失败: {error}</p>
          <button className="pl-retry-btn" onClick={() => window.location.reload()}>重试</button>
        </div>
      ) : (
        <>
          {/* 歌单头部 */}
          <div className="pl-header">
            <div className="pl-cover-wrapper">
              {coverSrc ? (
                <img src={coverSrc} alt="" className="pl-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="pl-cover-fallback">♪</div>
              )}
            </div>
            <div className="pl-header-info">
              <span className="pl-type-tag">{isFallback ? '搜索' : '歌单'}</span>
              <h1 className="pl-name">{pageTitle}</h1>
              {playlist?.creator && (
                <p className="pl-creator">
                  <img
                    src={proxyImageUrl(playlist.creator.avatarUrl || '', '40y40')}
                    alt=""
                    className="pl-creator-avatar"
                    referrerPolicy="no-referrer"
                  />
                  {playlist.creator.nickname}
                </p>
              )}
              <p className="pl-meta">
                {playlist?.trackCount && <span>{playlist.trackCount} 首歌曲</span>}
                {playlist?.playCount > 0 && <span> · 播放 {formatCount(playlist.playCount)} 次</span>}
              </p>
              <div className="pl-actions">
                <button className="pl-play-all-btn" onClick={handlePlayAll}>
                  ▶ 播放全部
                </button>
              </div>
            </div>
          </div>

          {/* 歌曲列表 */}
          <div className="pl-song-list">
            <div className="pl-song-header">
              <span className="pl-song-header-title">歌曲列表 ({tracks.length})</span>
            </div>
            {tracks.length === 0 ? (
              <div className="pl-empty">暂无歌曲</div>
            ) : (
              tracks.map((song, i) => (
                <div
                  key={song.id}
                  className="pl-song-row"
                  onClick={() => handleSongClick(song)}
                >
                  <span className="pl-song-num">{i + 1}</span>
                  <img
                    src={song.cover ? proxyImageUrl(song.cover, '60y60') : ''}
                    alt=""
                    className="pl-song-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  <div className="pl-song-info">
                    <span className="pl-song-name">{song.title}</span>
                    <span className="pl-song-artist">{song.artist}</span>
                  </div>
                  <span className="pl-song-dur">{formatDuration(song.duration)}</span>
                  <button className="pl-song-play-btn" onClick={(e) => { e.stopPropagation(); handleSongClick(song); }}>
                    ▶
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
