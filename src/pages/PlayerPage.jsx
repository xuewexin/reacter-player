import { useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import Player from '../components/Player';
import './PlayerPage.css';

function imgUrl(url) {
  if (!url) return '';
  const fixed = String(url).replace(/^http:/, 'https:');
  if (fixed.startsWith('https://')) return fixed;
  return '';
}

export default function PlayerPage() {
  const { currentSong } = usePlayer();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const coverUrl = imgUrl(currentSong?.cover);

  return (
    <div className="player-page">
      {/* 模糊封面背景 */}
      <div className="player-bg">
        {coverUrl ? (
          <img
            className="player-bg-img"
            src={coverUrl}
            alt=""
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="player-bg-fallback" />
        )}
        <div className="player-bg-overlay" />
      </div>

      {/* 主内容 */}
      <Player />
    </div>
  );
}