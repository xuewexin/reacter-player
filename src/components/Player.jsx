import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import Lyrics from './Lyrics'
import * as api from '../api/music'
import { PlayIcon, PauseIcon, PrevIcon, NextIcon, VolumeHighIcon, VolumeLowIcon, VolumeMuteIcon, ListIcon, RepeatIcon, ShuffleIcon, HeartIcon, MusicNoteIcon, SearchIcon } from './Icons'
import './Player.css'

const DEFAULT_COVER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect fill="#1a1a2e" width="300" height="300" rx="8"/><text fill="#555" font-size="80" text-anchor="middle" dominant-baseline="central" x="150" y="155">♪</text></svg>');

function imgUrl(url, size) {
  if (!url) return DEFAULT_COVER;
  if (url.startsWith('/img-p')) return url + (size ? '?param=' + size : '');
  const fixed = url.replace(/^http:/, 'https:');
  const m = fixed.match(/https?:\/\/p(\d+)\.music\.126\.net\/(.+)/);
  if (m) {
    const sub = m[1];
    const [path] = m[2].split('?');
    const proxy = parseInt(sub) <= 4 ? `/img-p${sub}/` : '/img-p1/';
    return `${proxy}${path}${size ? '?param=' + size : ''}`;
  }
  if (fixed.startsWith('https://')) return fixed + (size ? '?param=' + size : '');
  return fixed || DEFAULT_COVER;
}

function handleCoverError(e) {
  if (e.target.src !== DEFAULT_COVER) e.target.src = DEFAULT_COVER;
}

const COVER_IMG_PROPS = { loading: 'lazy', referrerPolicy: 'no-referrer', crossOrigin: 'anonymous', onError: handleCoverError };

function toSong(raw) {
  if (raw.title !== undefined && raw.name === undefined) {
    return { id: raw.id, title: raw.title, artist: raw.artist, album: raw.album, cover: raw.cover || '', dt: raw.dt || raw.duration, src: null, lyric: null }
  }
  return { id: raw.id, title: raw.name, artist: (raw.ar || raw.artists || []).map(a => a.name).join('/'), album: (raw.al || raw.album || {}).name || '', cover: (raw.al || raw.album || {}).picUrl || '', dt: raw.dt || raw.duration || 0, src: null, lyric: null }
}

export default function Player() {
  const {
    playlist, currentIndex, isPlaying, currentTime, duration,
    volume, isMuted, playMode, favoriteSongs, lyric, lyricLoading,
    playError, songLoading, currentSong, formatTime,
    setVolume, setIsMuted, setPlayMode,
    togglePlay, handleNext, handlePrev, toggleMute, seek,
    toggleFav, isFav, playSong, setPlaylist,
    navSearchQuery,
  } = usePlayer();

  const navigate = useNavigate();
  const progressRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [searchKw, setSearchKw] = useState(navSearchQuery || '');
  const [searchList, setSearchList] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hotKwds, setHotKwds] = useState([]);

  // 热搜词
  useEffect(() => {
    api.getSearchHotDetail().then(d => {
      setHotKwds((d.data || []).slice(0, 8).map(h => h.searchWord))
    }).catch(() => {})
  }, []);

  const searchWithCovers = useCallback(async (query) => {
    setSearchLoading(true);
    try {
      const searchRes = await api.search(query, 20);
      const rawSongs = searchRes.result?.songs || [];
      if (rawSongs.length > 0) {
        const songIds = rawSongs.map(s => s.id);
        try {
          const detailRes = await api.getSongDetail(songIds);
          const coverMap = new Map();
          for (const ds of (detailRes.data || [])) {
            const album = ds.al || ds.album || {};
            if (album.picUrl) coverMap.set(ds.id, album.picUrl);
            else if (album.blurPicUrl) coverMap.set(ds.id, album.blurPicUrl);
          }
          for (const raw of rawSongs) {
            if (coverMap.has(raw.id)) {
              if (raw.al) raw.al.picUrl = coverMap.get(raw.id);
              else if (raw.album) raw.album.picUrl = coverMap.get(raw.id);
            }
          }
        } catch (e) { console.warn('[搜索] 获取封面失败:', e.message); }
      }
      setSearchList(rawSongs.map(toSong));
    } catch { setSearchList([]); }
    finally { setSearchLoading(false); }
  }, []);

  const prevNavQueryRef = useRef('');
  useEffect(() => {
    const q = navSearchQuery?.trim()
    if (!q || q === prevNavQueryRef.current) return
    prevNavQueryRef.current = q
    setSearchKw(q)
    searchWithCovers(q)
  }, [navSearchQuery, searchWithCovers])

  const debounceRef = useRef(null);
  useEffect(() => {
    if (!searchKw.trim()) { setSearchList([]); return }
    if (searchKw === navSearchQuery) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchWithCovers(searchKw.trim()), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchKw, navSearchQuery, searchWithCovers])

  const playFromSearch = useCallback((song) => {
    const exist = playlist.find(s => s.id === song.id)
    if (exist) { playSong(playlist.indexOf(exist)) }
    else {
      const newList = [...playlist, song]
      setPlaylist(newList)
      setTimeout(() => playSong(newList.length - 1, newList), 0)
    }
  }, [playlist, playSong, setPlaylist])

  // ==================== 进度条 ====================
  const seekBar = (e) => {
    if (!progressRef.current) return
    const r = progressRef.current.getBoundingClientRect()
    seek(Math.max(0, ((e.clientX - r.left) / r.width) * duration))
  }

  const drag = useCallback((e) => {
    if (!isDragging || !progressRef.current) return
    const r = progressRef.current.getBoundingClientRect()
    seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration)
  }, [isDragging, duration, seek])

  useEffect(() => {
    if (!isDragging) return
    window.addEventListener('mousemove', drag)
    const up = () => setIsDragging(false)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', drag); window.removeEventListener('mouseup', up) }
  }, [isDragging, drag])

  const pct = duration ? (currentTime / duration) * 100 : 0

  const onLyricClick = (time) => { seek(time) }

  // ==================== 渲染 ====================
  const coverSrc = imgUrl(currentSong?.cover, '400y400')

  return (
    <div className="player-new">
      {/* ===== 左：封面 + 唱片 + 信息 + 控件 ===== */}
      <div className="player-left">
        {/* 唱片 + 封面 */}
        <div className="vinyl-wrapper">
          {/* 黑胶碟片（封面后方露出右半部分） */}
          <div className={`vinyl-disc ${isPlaying ? 'spinning' : ''}`}>
            <div className="vinyl-surface" style={{ backgroundImage: `url(${coverSrc})` }}>
              {/* 唱片纹路叠加 */}
              <div className="vinyl-grooves" />
            </div>
            {/* 中心轴心 */}
            <div className="vinyl-center">
              <div className="vinyl-hole" />
            </div>
          </div>
          {/* 专辑封面（圆角方形，覆盖在唱片左上方） */}
          <div className="cover-card">
            <img src={coverSrc} alt="" className="cover-card-img" {...COVER_IMG_PROPS} />
          </div>
        </div>

        {/* 歌曲信息 */}
        <div className="song-meta">
          <h2 className="song-meta-title">
            {currentSong?.title || '未选择歌曲'}
            {songLoading && <span className="song-loading-dot" />}
            {currentSong && (
              <button className="fav-btn-inline" onClick={() => toggleFav(currentSong.id, currentSong)}>
                <HeartIcon size={18} filled={isFav(currentSong.id)} color={isFav(currentSong.id) ? '#f43f5e' : undefined} />
              </button>
            )}
          </h2>
          <p className="song-meta-artist">{currentSong?.artist || '-'}</p>
        </div>

        {playError && (
          <div className="player-error">
            <span className="error-icon">!</span>
            <span className="error-message">{playError}</span>
          </div>
        )}

        {/* 进度条 */}
        <div className="progress-row">
          <span className="time-label">{formatTime(currentTime)}</span>
          <div className="progress-bar" ref={progressRef} onClick={seekBar} onMouseDown={() => setIsDragging(true)}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
              <div className="progress-thumb" style={{ left: `${pct}%` }} />
            </div>
          </div>
          <span className="time-label">{formatTime(duration)}</span>
        </div>

        {/* 播放控件 */}
        <div className="controls-row">
          <button className={`ctrl-btn-text ${playMode !== 'list' ? 'active' : ''}`}
            onClick={() => { const m = ['list','repeat','shuffle']; setPlayMode(m[(m.indexOf(playMode)+1)%3]) }}
            title="播放模式"
          >{playMode === 'shuffle' ? <ShuffleIcon size={15} /> : playMode === 'repeat' ? <RepeatIcon size={15} /> : <ListIcon size={15} />}</button>
          <button className="ctrl-btn-round" onClick={handlePrev} title="上一首"><PrevIcon size={20} /></button>
          <button className="ctrl-btn-play" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <PauseIcon size={24} color="#fff" /> : <PlayIcon size={24} color="#fff" />}
          </button>
          <button className="ctrl-btn-round" onClick={handleNext} title="下一首"><NextIcon size={20} /></button>
        </div>

        {/* 音量（独立一行） */}
        <div className="volume-row">
          <button className="ctrl-btn-text" onClick={toggleMute} title={isMuted ? '取消静音' : '静音'}>
            {isMuted || volume === 0 ? <VolumeMuteIcon size={15} /> : volume < 0.5 ? <VolumeLowIcon size={15} /> : <VolumeHighIcon size={15} />}
          </button>
          <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume}
            onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (v > 0 && isMuted) setIsMuted(false) }}
            className="volume-slider"
          />
        </div>
      </div>

      {/* ===== 右：歌词 ===== */}
      <div className="player-right">
        {currentSong ? (
          <Lyrics
            lrc={lyric}
            currentTime={currentTime}
            onLineClick={onLyricClick}
            loading={lyricLoading}
          />
        ) : (
          <div className="lyrics-empty-state">
            <div className="empty-state-icon"><MusicNoteIcon size={48} /></div>
            <p className="empty-state-text">搜索歌曲开始播放</p>
          </div>
        )}
      </div>

      {/* ===== 右：播放列表（默认展示） ===== */}
      <div className={`playlist-panel-v2 ${showPlaylist ? 'open' : 'collapsed'}`}>
        {/* 折叠状态：紧凑头部，点击展开 */}
        {!showPlaylist && (
          <div className="playlist-collapsed-bar" onClick={() => setShowPlaylist(true)}>
            <span className="playlist-collapsed-label">播放列表</span>
            <ListIcon size={18} />
          </div>
        )}

        {/* 展开状态：完整头部 */}
        {showPlaylist && (
          <div className="playlist-panel-header">
            <h4>{searchKw ? '搜索结果' : '播放列表'}</h4>
            <button className="panel-toggle-btn" onClick={() => setShowPlaylist(false)} title="收起列表">
              <ListIcon size={16} />
            </button>
          </div>
        )}

        {showPlaylist && (
          <>
            <div className="search-box-inline">
              <input type="text" value={searchKw} onChange={e => setSearchKw(e.target.value)}
                placeholder={hotKwds.length ? hotKwds.join(' / ') : '搜索歌曲...'}
              />
              {searchLoading && <span className="search-loading" />}
            </div>

            <div className="playlist-panel-songs">
              {(searchKw ? searchList : playlist).map((song, i) => {
                const idx = playlist.findIndex(s => s.id === song.id)
                const active = song.id === currentSong?.id
                return (
                  <div key={song.id + '-' + i} className={`playlist-item ${active ? 'active' : ''}`}
                    onClick={() => { searchKw ? playFromSearch(song) : playSong(idx); }}
                  >
                    <img src={imgUrl(song.cover, '60y60')} alt="" className="playlist-item-cover" {...COVER_IMG_PROPS} />
                    <div className="playlist-item-info">
                      <span className="playlist-item-title">{song.title}</span>
                      <span className="playlist-item-artist">{song.artist}</span>
                    </div>
                    <span className="playlist-item-duration">{song.dt ? formatTime(song.dt / 1000) : ''}</span>
                    <button className={`playlist-fav-btn ${isFav(song.id) ? 'active' : ''}`}
                      onClick={e => { e.stopPropagation(); toggleFav(song.id, song) }}
                    ><HeartIcon size={14} filled={isFav(song.id)} color={isFav(song.id) ? '#f43f5e' : undefined} /></button>
                    {active && isPlaying && <span className="playing-indicator" />}
                  </div>
                )
              })}

              {/* 收藏分区 */}
              {(() => {
                const favList = Object.values(favoriteSongs).filter(s => s.title);
                if (!favList.length) return null;
                return (
                  <React.Fragment key="favs">
                    <div className="playlist-divider" />
                    <div className="playlist-section-label">我的喜欢</div>
                    {favList.map(s => {
                      const active = s.id === currentSong?.id;
                      return (
                        <div key={'fav-' + s.id} className={`playlist-item ${active ? 'active' : ''}`}
                          onClick={() => {
                            const exist = playlist.find(p => p.id === s.id);
                            if (exist) playSong(playlist.indexOf(exist));
                            else { const nl = [...playlist, s]; setPlaylist(nl); setTimeout(() => playSong(nl.length - 1, nl), 0); }
                          }}
                        >
                          <img src={imgUrl(s.cover, '60y60')} alt="" className="playlist-item-cover" {...COVER_IMG_PROPS} />
                          <div className="playlist-item-info">
                            <span className="playlist-item-title"><HeartIcon size={12} filled color="#f43f5e" /> {s.title}</span>
                            <span className="playlist-item-artist">{s.artist}</span>
                          </div>
                          <span className="playlist-item-duration">{s.dt ? formatTime(s.dt / 1000) : ''}</span>
                          {active && isPlaying && <span className="playing-indicator" />}
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}