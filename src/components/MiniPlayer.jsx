import { useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { PlayIcon, PauseIcon, PrevIcon, NextIcon, MusicNoteIcon, HeartIcon, ListIcon, RepeatIcon, ShuffleIcon } from './Icons';
import './MiniPlayer.css';

export default function MiniPlayer() {
  const {
    currentSong, isPlaying, currentTime, duration, songLoading,
    togglePlay, handleNext, handlePrev,
    toggleFav, isFav, playMode, setPlayMode,
    formatTime,
  } = usePlayer();
  const navigate = useNavigate();
  const location = useLocation();

  // 在播放器页面不显示迷你播放器
  if (location.pathname === '/player' || !currentSong) return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mini-player" onClick={() => navigate('/player')}>
      {/* 进度条 */}
      <div className="mini-progress-bar">
        <div className="mini-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="mini-player-inner">
        {/* 左：封面 + 歌曲信息 + 喜欢 */}
        <div className="mini-left">
          <div className="mini-cover-wrapper">
            {currentSong.cover ? (
              <img
                src={currentSong.cover + '?param=80y80'}
                alt=""
                className={`mini-cover ${isPlaying ? 'spinning' : ''}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="mini-cover-fallback"><MusicNoteIcon size={20} /></div>
            )}
          </div>
          <div className="mini-info">
            <span className="mini-title">
              {currentSong.title || '未知歌曲'}
              {songLoading && <span className="mini-loading-dot" />}
            </span>
            <span className="mini-artist">{currentSong.artist || '-'}</span>
          </div>
          <button
            className={`mini-fav-btn ${isFav(currentSong.id) ? 'active' : ''}`}
            onClick={e => { e.stopPropagation(); toggleFav(currentSong.id, currentSong); }}
            title={isFav(currentSong.id) ? '取消喜欢' : '加入喜欢'}
          >
            <HeartIcon size={16} filled={isFav(currentSong.id)} color={isFav(currentSong.id) ? '#f43f5e' : undefined} />
          </button>
        </div>

        {/* 中：控制按钮 */}
        <div className="mini-controls" onClick={e => e.stopPropagation()}>
          <button className="mini-btn mini-mode-btn" onClick={() => {
            const m = ['list','repeat','shuffle'];
            setPlayMode(m[(m.indexOf(playMode)+1)%3]);
          }} title={`模式: ${playMode === 'shuffle' ? '随机' : playMode === 'repeat' ? '单曲循环' : '列表'}`}>
            {playMode === 'shuffle' ? <ShuffleIcon size={14} /> : playMode === 'repeat' ? <RepeatIcon size={14} /> : <ListIcon size={14} />}
          </button>
          <button className="mini-btn" onClick={handlePrev} title="上一首">
            {<PrevIcon size={18} />}
          </button>
          <button className="mini-btn mini-play-btn" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <PauseIcon size={16} color="#fff" /> : <PlayIcon size={16} color="#fff" />}
          </button>
          <button className="mini-btn" onClick={handleNext} title="下一首">
            {<NextIcon size={18} />}
          </button>
        </div>

        {/* 右：时间 */}
        <span className="mini-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
