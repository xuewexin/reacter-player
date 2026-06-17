import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import * as api from '../api/music';
import { cachedApiFetch } from '../api/cache';

const PlayerContext = createContext(null);

// ==================== 工具函数 ====================

function toSong(raw) {
  // 兼容已转换格式
  if (raw.title !== undefined && raw.name === undefined) {
    return {
      id: raw.id,
      title: raw.title || '',
      artist: raw.artist || '',
      album: raw.album || '',
      cover: raw.cover || '',
      dt: raw.dt || raw.duration || 0,
      src: raw.src || null,
      lyric: raw.lyric || null,
    };
  }
  return {
    id: raw.id,
    title: raw.name,
    artist: (raw.ar || raw.artists || []).map(a => a.name).join('/'),
    album: (raw.al || raw.album || {}).name || '',
    cover: (raw.al || raw.album || {}).picUrl || '',
    dt: raw.dt || raw.duration || 0,
    src: null,
    lyric: null,
  };
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === Infinity) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==================== Provider ====================

export function PlayerProvider({ children }) {
  const audioRef = useRef(new Audio());
  const pendingRef = useRef(null);
  const loadingSongIdRef = useRef(null);
  const songIdRef = useRef(null);
  const seekingRef = useRef(false);

  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState('list');
  // favoriteSongs: { [songId]: songData }
  const [favoriteSongs, setFavoriteSongs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mp_fav_songs') || '{}'); }
    catch { return {}; }
  });
  // 兼容旧数据：迁移 mp_favs (ID数组) → mp_fav_songs (对象)
  const favMigratedRef = useRef(false);
  useEffect(() => {
    if (favMigratedRef.current) return;
    favMigratedRef.current = true;
    const oldFavs = (() => { try { return JSON.parse(localStorage.getItem('mp_favs') || '[]'); } catch { return []; } })();
    if (oldFavs.length > 0 && Object.keys(favoriteSongs).length === 0) {
      setFavoriteSongs(prev => {
        const merged = { ...prev };
        oldFavs.forEach(id => { if (!merged[id]) merged[id] = { id }; });
        localStorage.setItem('mp_fav_songs', JSON.stringify(merged));
        return merged;
      });
      localStorage.removeItem('mp_favs');
    }
  }, [favoriteSongs]);

  const favorites = Object.keys(favoriteSongs);
  const [lyric, setLyric] = useState('');
  const [lyricLoading, setLyricLoading] = useState(false);
  const [playError, setPlayError] = useState(null);
  const [songLoading, setSongLoading] = useState(false);

  // ==================== 听歌历史（最多 50 条，用于 AI 推荐） ====================
  const [playHistory, setPlayHistory] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('mp_play_history') || '[]'); }
    catch { return []; }
  });

  // 持久化播放历史到 sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem('mp_play_history', JSON.stringify(playHistory)); }
    catch { /* 容量满时静默 */ }
  }, [playHistory]);

  const addToHistory = useCallback((song) => {
    if (!song || !song.id) return
    setPlayHistory(prev => {
      // 去重：同一首歌不重复添加
      const filtered = prev.filter(s => String(s.id) !== String(song.id))
      const entry = {
        id: song.id,
        title: song.title || '',
        artist: song.artist || '',
        album: song.album || '',
        cover: song.cover || '',
        playedAt: Date.now(),
      }
      const next = [...filtered, entry]
      // 保留最多 50 条
      if (next.length > 50) next.splice(0, next.length - 50)
      return next
    })
  }, [])

  const clearPlayHistory = useCallback(() => {
    setPlayHistory([])
    try { sessionStorage.removeItem('mp_play_history'); } catch {}
  }, [])

  const currentSong = currentIndex >= 0 ? playlist[currentIndex] : null;

  // ==================== 收藏 ====================
  const toggleFav = useCallback((songId, songData) => {
    setFavoriteSongs(prev => {
      const next = { ...prev };
      if (next[songId]) {
        delete next[songId];
      } else if (songData) {
        // songData 是包含 title/artist/cover/dt 的完整歌曲对象
        const clean = { id: songId, title: songData.title || '', artist: songData.artist || '', album: songData.album || '', cover: songData.cover || '', dt: songData.dt || 0 };
        next[songId] = clean;
      } else {
        // 降级：只存 ID（已有 mp_fav_songs 旧数据会保留）
        next[songId] = { id: songId };
      }
      localStorage.setItem('mp_fav_songs', JSON.stringify(next));
      return next;
    });
  }, []);

  const isFav = useCallback((songId) => songId in favoriteSongs, [favoriteSongs]);

  // ==================== 歌词获取（立即返回缓存，异步更新） ====================
  const fetchLyric = useCallback(async (songId) => {
    const idStr = String(songId);
    songIdRef.current = idStr;
    setLyric('');
    setLyricLoading(true);

    try {
      const d = await api.getLyric(idStr);
      const lrc = d?.lrc?.lyric || '';
      if (songIdRef.current === idStr) {
        setLyric(lrc);
        setLyricLoading(false);
        // 更新 playlist 中的歌词缓存
        setPlaylist(prev => prev.map(s => s.id === songId ? { ...s, lyric: lrc } : s));
      }
    } catch (e) {
      if (songIdRef.current === idStr) {
        // 失败时清空旧歌词，避免显示上一首的歌词
        setLyric('');
        setLyricLoading(false);
        console.warn('[fetchLyric] 获取歌词失败:', e.message || e);
      }
    }
  }, []);

  // ==================== 核心：播放歌曲 ====================
  const playSong = useCallback(async (index, list) => {
    const src = list || playlist;
    const song = src[index];
    if (!song) return;

    const a = audioRef.current;
    if (!a) return;

    const currentId = song.id;

    // 同一首歌：切换暂停/播放
    if (index === currentIndex && playlist === src) {
      if (isPlaying) {
        a.pause();
        setIsPlaying(false);
        return;
      }
      if (a.src && a.readyState >= 2) {
        a.play().then(() => {
          setIsPlaying(true);
          addToHistory(song);
        }).catch(() => {});
        return;
      }
    }

    // 清理
    if (pendingRef.current) {
      try { a.removeEventListener('loadedmetadata', pendingRef.current.loaded); } catch {}
      try { a.removeEventListener('error', pendingRef.current.error); } catch {}
      pendingRef.current = null;
    }

    setPlayError(null);
    setCurrentIndex(index);
    setSongLoading(true);
    loadingSongIdRef.current = currentId;

    // 立即设置163直链（快速启动，不等待API）
    let currentUrl = song.src;
    if (!currentUrl) {
      currentUrl = `https://music.163.com/song/media/outer/url?id=${currentId}.mp3`;
      song.src = currentUrl;
    }
    a.src = currentUrl;
    setCurrentTime(0);

    // 后台获取更优URL（NetEase 源并行）
    const bgBetterUrl = api.getBestSongUrl(currentId, 'standard', { skipCache: false }).then(data => {
      const item = (data || []).find(d => d && d.url);
      if (item?.url && !item.url.includes('music.163.com/song/media/outer')) {
        return item.url;
      }
      return null;
    }).catch(() => null);

    // ★ 后台QQ音乐跨平台搜索（始终并行，播放受限歌曲时自动切换）
    const bgCrossPlatform = api.crossPlatformResolve(song.title, song.artist, 'standard')
      .then(r => r?.url || null)
      .catch(() => null);

    // ---- 歌词：立即从缓存读取，异步更新 ----
    if (song.lyric) {
      setLyric(song.lyric);
      setLyricLoading(false);
    } else {
      fetchLyric(currentId);
    }

    const cleanup = () => {
      if (pendingRef.current) {
        try { a.removeEventListener('loadedmetadata', pendingRef.current.loaded); } catch {}
        try { a.removeEventListener('error', pendingRef.current.error); } catch {}
        pendingRef.current = null;
      }
    };

    const playAudio = () => {
      if (loadingSongIdRef.current !== currentId) return;
      a.play().then(() => {
        if (loadingSongIdRef.current !== currentId) { a.pause(); return; }
        setIsPlaying(true);
        setPlayError(null);
        setSongLoading(false);
        // ★ 记录听歌历史（用局部 song，避免闭包中的 currentSong 是旧值）
        addToHistory(song);
      }).catch(err => {
        if (loadingSongIdRef.current !== currentId) return;
        setIsPlaying(false);
        setSongLoading(false);
        if (err.name === 'NotAllowedError') {
          setPlayError('点击任意位置即可播放');
        }
      });
    };

    const handleLoaded = () => {
      cleanup();
      if (loadingSongIdRef.current !== currentId) return;
      playAudio();

      // ★ 后台尝试获取更优URL（优先 bgBetterUrl，其次 bgCrossPlatform）
      Promise.allSettled([bgBetterUrl, bgCrossPlatform]).then(([betterR, crossR]) => {
        if (loadingSongIdRef.current !== currentId) return;

        const betterUrl = betterR.status === 'fulfilled' ? betterR.value : null;
        const crossUrl = crossR.status === 'fulfilled' ? crossR.value : null;

        // 优先使用 Netease 源 URL
        const finalUrl = betterUrl || crossUrl;
        if (finalUrl && finalUrl !== a.src) {
          song.src = finalUrl;
          const currentSrc = a.src || '';
          // 如果当前播放的是 163 redirect 或 netstart 可能受限，替换为更优URL
          if (currentSrc.includes('music.163.com/song/media/outer') || crossUrl) {
            const currentPos = a.currentTime;
            a.src = finalUrl;
            a.currentTime = currentPos;
            a.play().catch(() => {});
          }
        }
      }).catch(() => {});
    };

    const handleFinalError = () => {
      cleanup();
      if (loadingSongIdRef.current !== currentId) return;
      // 静默跳过，不显示错误信息
      setIsPlaying(false);
      setSongLoading(false);
      setTimeout(() => {
        if (loadingSongIdRef.current === currentId) {
          const nextIdx = (currentIndex + 1) % playlist.length;
          if (nextIdx !== currentIndex) playSong(nextIdx);
        }
      }, 500);
    };

    const handleError = async () => {
      cleanup();
      if (loadingSongIdRef.current !== currentId) { setSongLoading(false); return; }

      // 等待后台URL（优先 Netease 源，其次 QQ 跨平台）
      const [betterR, crossR] = await Promise.allSettled([bgBetterUrl, bgCrossPlatform]);
      let retryUrl = (betterR.status === 'fulfilled' ? betterR.value : null)
                   || (crossR.status === 'fulfilled' ? crossR.value : null);

      // 版权绕过搜索
      if (!retryUrl && loadingSongIdRef.current === currentId) {
        try {
          const playable = await api.getPlayableSongUrl(currentId, song.title, song.artist);
          if (playable?.url && !playable.url.includes('music.163.com/song/media/outer')) {
            retryUrl = playable.url;
            if (playable.altSong) {
              // 只更新歌曲标题，保留原始 song.id 用于歌词（歌词已在 playSong 开始时拉取）
              song.title = playable.altSong.name;
            }
          }
        } catch {}
      }

      if (retryUrl && !retryUrl.includes('music.163.com/song/media/outer') && loadingSongIdRef.current === currentId) {
        song.src = retryUrl;
        currentUrl = retryUrl;
        a.src = retryUrl;
        pendingRef.current = { loaded: handleLoaded, error: handleFinalError };
        a.addEventListener('loadedmetadata', handleLoaded);
        a.addEventListener('error', handleFinalError);
        a.load();
        return;
      }

      // 全部失败，静默跳过（不显示错误）
      if (loadingSongIdRef.current === currentId) {
        setIsPlaying(false);
        setSongLoading(false);
        setTimeout(() => {
          if (loadingSongIdRef.current === currentId) {
            const nextIdx = (currentIndex + 1) % playlist.length;
            if (nextIdx !== currentIndex) playSong(nextIdx);
          }
        }, 500);
      }
    };

    pendingRef.current = { loaded: handleLoaded, error: handleError };
    a.addEventListener('loadedmetadata', handleLoaded);
    a.addEventListener('error', handleError);
    a.load();
  }, [currentIndex, isPlaying, playlist, fetchLyric]);

  // ==================== 播放控制 ====================
  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.src || a.readyState === 0) {
      if (currentIndex >= 0) playSong(currentIndex);
      return;
    }
    if (!a.paused) {
      a.pause();
      setIsPlaying(false);
    } else {
      a.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [currentIndex, playSong]);

  const handleNext = useCallback(() => {
    if (playlist.length === 0) return;
    if (playMode === 'shuffle') playSong(Math.floor(Math.random() * playlist.length));
    else playSong((currentIndex + 1) % playlist.length);
  }, [currentIndex, playlist, playMode, playSong]);

  const handlePrev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) { a.currentTime = 0; setCurrentTime(0); return; }
    playSong(currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1);
  }, [currentIndex, playlist, playSong]);

  const toggleMute = useCallback(() => setIsMuted(p => !p), []);

  const seek = useCallback((time) => {
    if (audioRef.current) {
      seekingRef.current = true;
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      // 延迟清除 seeking 标记，让 timeupdate 事件有机会反映正确位置
      clearTimeout(seekingRef._tid);
      seekingRef._tid = setTimeout(() => { seekingRef.current = false; }, 300);
    }
  }, []);

  const externalLoadRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  // ==================== 初始化：加载热歌榜（带缓存，仅执行一次） ====================
  useEffect(() => {
    const { cached, promise } = cachedApiFetch('player_hotsongs', () =>
      api.getTopSongs(0).then(d => (d.data || []).slice(0, 20).map(toSong))
    );

    if (cached && Array.isArray(cached) && cached.length > 0 && !initialLoadDoneRef.current) {
      setPlaylist(cached);
      // ★ 有缓存就用缓存，不等待 API
      initialLoadDoneRef.current = true;
    }

    promise.then(songs => {
      // ★ 如果缓存已经设置了播放列表，不再用 API 数据覆盖（避免覆盖用户操作）
      if (initialLoadDoneRef.current) return;
      if (songs && songs.length > 0) {
        setPlaylist(songs);
        initialLoadDoneRef.current = true;
      }
    }).catch(() => {
      if (initialLoadDoneRef.current || playlist.length > 0) return;
      setPlaylist([
        { id: 'demo1', title: 'Electronic Vibes', artist: 'Demo', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', cover: '', dt: 0, album: '', lyric: '' },
        { id: 'demo2', title: 'Ambient Dream', artist: 'Demo', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', cover: '', dt: 0, album: '', lyric: '' },
        { id: 'demo3', title: 'Jazz Mood', artist: 'Demo', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', cover: '', dt: 0, album: '', lyric: '' },
      ]);
      initialLoadDoneRef.current = true;
    });
  }, []);

  // ==================== 音频事件 ====================
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const tick = () => {
      if (!seekingRef.current && !isNaN(a.currentTime)) setCurrentTime(a.currentTime);
    };
    const meta = () => {
      if (!isNaN(a.duration)) setDuration(a.duration);
    };
    const end = () => {
      setIsPlaying(false);
      if (playlist.length === 0) return;
      if (playMode === 'repeat') {
        // 单曲循环：直接重播，不经过 playSong（避免同一首歌切换暂停/播放逻辑）
        a.currentTime = 0;
        a.play().then(() => setIsPlaying(true)).catch(() => {});
      } else if (playMode === 'shuffle') {
        playSong(Math.floor(Math.random() * playlist.length));
      } else {
        const nextIdx = (currentIndex + 1) % playlist.length;
        playSong(nextIdx);
      }
    };

    a.addEventListener('timeupdate', tick);
    a.addEventListener('loadedmetadata', meta);
    a.addEventListener('ended', end);
    return () => {
      a.removeEventListener('timeupdate', tick);
      a.removeEventListener('loadedmetadata', meta);
      a.removeEventListener('ended', end);
    };
  }, [currentIndex, playlist, playSong, playMode]);

  // 音量
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // ==================== 从路由加载歌曲/歌单/专辑 ====================
  const loadFromRoute = useCallback((routeState) => {
    if (!routeState) return;
    externalLoadRef.current = true; // 阻止初始热歌榜加载覆盖
    const { song, playlistId, albumId, artistId, songs } = routeState;

    if (songs && Array.isArray(songs) && songs.length > 0) {
      const list = songs.map(toSong);
      setPlaylist(list);
      setTimeout(() => playSong(0, list), 0);
    } else if (song) {
      const newSong = toSong(song);
      setPlaylist([newSong]);
      setTimeout(() => playSong(0, [newSong]), 0);
    } else if (playlistId) {
      api.getPlaylistDetail(playlistId).then(d => {
        const tracks = (d.playlist?.tracks || []).map(toSong);
        if (tracks.length > 0) {
          setPlaylist(tracks);
          setTimeout(() => playSong(0, tracks), 0);
        }
      });
    } else if (albumId) {
      api.getAlbumDetail(albumId).then(d => {
        const tracks = (d.album?.songs || d.songs || []).map(toSong);
        if (tracks.length > 0) {
          setPlaylist(tracks);
          setTimeout(() => playSong(0, tracks), 0);
        }
      });
    } else if (artistId) {
      api.getArtistHotSongs(artistId, 20).then(d => {
        const tracks = (d.songs || []).map(toSong);
        if (tracks.length > 0) {
          setPlaylist(tracks);
          setTimeout(() => playSong(0, tracks), 0);
        }
      });
    }
  }, [playSong]);

  // ==================== 全局搜索（导航栏触发） ====================
  const [navSearchQuery, setNavSearchQuery] = useState('');
  const triggerNavSearch = useCallback((query) => {
    setNavSearchQuery(query);
  }, []);

  const value = {
    // 状态
    playlist, currentIndex, isPlaying, currentTime, duration,
    volume, isMuted, playMode, favorites, favoriteSongs, lyric, lyricLoading,
    playError, songLoading, currentSong,
    playHistory,   // 听歌历史（AI 推荐用）
    navSearchQuery,   // 导航栏搜索关键词
    // 操作
    setPlaylist, setCurrentIndex, setVolume, setIsMuted, setPlayMode,
    togglePlay, handleNext, handlePrev, toggleMute, seek,
    toggleFav, isFav, playSong, fetchLyric, loadFromRoute,
    triggerNavSearch, formatTime,
    clearPlayHistory,  // 清空听歌历史
    // 原始 audio（MiniPlayer 进度条需要）
    audioRef,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer 必须在 PlayerProvider 内部使用');
  return ctx;
}

export default PlayerContext;
