import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { HeartIcon } from '../components/Icons';
import './FavoritesPage.css';

// 默认封面
const DEFAULT_COVER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect fill="#333" width="300" height="300" rx="8"/><text fill="#888" font-size="80" text-anchor="middle" dominant-baseline="central" x="150" y="155">♪</text></svg>');

function imgUrl(url, size) {
  if (!url) return DEFAULT_COVER;
  if (url.startsWith('/img-p')) return url + (size ? '?param=' + size : '');
  const fixed = url.replace(/^http:/, 'https:');
  const m = fixed.match(/https?:\/\/p(\d+)\.music\.126\.net\/(.+)/);
  if (m) {
    const sub = m[1];
    const path = m[2].split('?')[0];
    const proxy = parseInt(sub) <= 4 ? `/img-p${sub}/` : '/img-p1/';
    return `${proxy}${path}${size ? '?param=' + size : ''}`;
  }
  if (fixed.startsWith('https://')) return fixed + (size ? '?param=' + size : '');
  return fixed || DEFAULT_COVER;
}

function handleCoverError(e) {
  if (e.target.src !== DEFAULT_COVER) e.target.src = DEFAULT_COVER;
}

function formatTime(ms) {
  if (!ms) return '';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function FavoritesPage() {
  const { favoriteSongs, toggleFav, playlist, playSong, setPlaylist, currentSong, isPlaying } = usePlayer();
  const navigate = useNavigate();
  const [imgErrors, setImgErrors] = useState({});

  const favList = Object.values(favoriteSongs).filter(s => s.title);

  const handlePlay = useCallback((song) => {
    const exist = playlist.find(p => p.id === song.id);
    if (exist) {
      playSong(playlist.indexOf(exist));
    } else {
      const nl = [...playlist, song];
      setPlaylist(nl);
      setTimeout(() => playSong(nl.length - 1, nl), 0);
    }
    navigate('/player');
  }, [playlist, playSong, setPlaylist, navigate]);

  const handleRemove = useCallback((e, songId) => {
    e.stopPropagation();
    toggleFav(songId);
  }, [toggleFav]);

  return (
    <div className="favorites-page">
      <div className="favorites-header">
        <div className="favorites-header-icon">
          <HeartIcon size={32} filled color="#f43f5e" />
        </div>
        <div className="favorites-header-info">
          <h1 className="favorites-title">我的喜欢</h1>
          <p className="favorites-subtitle">
            共 {favList.length} 首{currentSong && favList.some(s => s.id === currentSong.id) ? ' · 正在播放' : ''}
          </p>
        </div>
      </div>

      {favList.length === 0 ? (
        <div className="favorites-empty">
          <div className="favorites-empty-icon">
            <HeartIcon size={64} color="#333" />
          </div>
          <h3>还没有喜欢的歌曲</h3>
          <p>在播放器中点击 ♥ 即可将歌曲添加到此处</p>
          <button className="favorites-empty-btn" onClick={() => navigate('/player')}>
            去听听歌
          </button>
        </div>
      ) : (
        <div className="favorites-list">
          {favList.map((song, index) => {
            const active = song.id === currentSong?.id;
            const imgErr = imgErrors[song.id];
            const coverSrc = !imgErr ? imgUrl(song.cover, '60y60') : DEFAULT_COVER;

            return (
              <div
                key={song.id}
                className={`favorites-item ${active ? 'active' : ''}`}
                onClick={() => handlePlay(song)}
              >
                <span className="favorites-item-index">{index + 1}</span>
                <img
                  src={coverSrc}
                  alt=""
                  className="favorites-item-cover"
                  onError={() => setImgErrors(p => ({ ...p, [song.id]: true }))}
                />
                <div className="favorites-item-info">
                  <span className="favorites-item-title">
                    {song.title}
                    {active && isPlaying && <span className="favorites-playing-dot" />}
                  </span>
                  <span className="favorites-item-artist">{song.artist || '未知'}</span>
                </div>
                <span className="favorites-item-duration">{formatTime(song.dt)}</span>
                <button
                  className="favorites-item-remove"
                  onClick={(e) => handleRemove(e, song.id)}
                  title="取消喜欢"
                >
                  <HeartIcon size={16} filled color="#f43f5e" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
