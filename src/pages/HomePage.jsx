import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/music';
import { getCachedApiResponse, cacheApiResponse } from '../api/cache';
import { PlayIcon, MusicNoteIcon, TrendingIcon, StarIcon, MusicIcon, TrophyIcon, MoreIcon } from '../components/Icons';
import './HomePage.css';

// ==================== 图片URL处理 ====================

/**
 * 将网易云CDN图片URL转换为本地代理URL，解决防盗链问题
 * 支持 p1/p2/p3/p4.music.126.net 等域名
 */
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

// 缓存已处理的banner图片，避免重复处理
const imageUrlCache = new Map();
function cachedProxyImageUrl(url, params = '') {
  const cacheKey = `${url}__${params}`;
  if (!imageUrlCache.has(cacheKey)) {
    imageUrlCache.set(cacheKey, proxyImageUrl(url, params));
  }
  return imageUrlCache.get(cacheKey);
}

// ==================== 工具函数 ====================

function formatDuration(ms) {
  if (!ms) return '';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
    mvId: raw.mv || 0,
  };
}

function toArtist(raw) {
  return {
    id: raw.id,
    name: raw.name,
    picUrl: raw.picUrl || raw.img1v1Url || raw.cover || '',
    albumSize: raw.albumSize || 0,
    musicSize: raw.musicSize || 0,
  };
}

// ==================== 兜底Banner数据（API失败时使用） ====================

// 兜底Banner — 使用Unsplash高质量音乐主题图片（无防盗链限制）
const FALLBACK_BANNERS = [
  {
    cover: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=800&h=400&fit=crop&q=80',
    title: '华语热门精选',
    subtitle: '最受欢迎的华语歌曲合集',
    tag: '热门推荐',
    targetId: 3778678,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&h=400&fit=crop&q=80',
    title: '新歌速递',
    subtitle: '最新最热的音乐作品',
    tag: '新歌',
    targetId: 3779629,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&h=400&fit=crop&q=80',
    title: '原创力量',
    subtitle: '原创音乐人佳作推荐',
    tag: '原创',
    targetId: 2884035,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=400&fit=crop&q=80',
    title: '飙升榜单',
    subtitle: '热度飙升最快的歌曲',
    tag: '飙升',
    targetId: 19723756,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&h=400&fit=crop&q=80',
    title: '经典回顾',
    subtitle: '那些年我们一起听过的歌',
    tag: '经典',
    targetId: 7457312352,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=400&fit=crop&q=80',
    title: '独立音乐人',
    subtitle: '发现宝藏独立音乐',
    tag: '独立',
    targetId: 7520304659,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&h=400&fit=crop&q=80',
    title: '电子音浪',
    subtitle: '沉浸式电子音乐体验',
    tag: '电子',
    targetId: 29723756,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&h=400&fit=crop&q=80',
    title: '摇滚现场',
    subtitle: '热血沸腾的摇滚精选',
    tag: '摇滚',
    targetId: 2884035,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=800&h=400&fit=crop&q=80',
    title: '民谣故事',
    subtitle: '温暖的吉他与诗',
    tag: '民谣',
    targetId: 3084035,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1462965326201-d02e4f455804?w=800&h=400&fit=crop&q=80',
    title: '爵士时光',
    subtitle: '慵懒午后的爵士旋律',
    tag: '爵士',
    targetId: 31723756,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800&h=400&fit=crop&q=80',
    title: '嘻哈势力',
    subtitle: '节奏与韵脚的碰撞',
    tag: '嘻哈',
    targetId: 32723756,
    targetType: 1000,
  },
  {
    cover: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=800&h=400&fit=crop&q=80',
    title: '古典之韵',
    subtitle: '穿越世纪的经典乐章',
    tag: '古典',
    targetId: 33723756,
    targetType: 1000,
  },
];

// ==================== 组件 ====================

// ==================== Cover Flow 3D 轮播 ====================

const COVERFLOW_INTERVAL = 4000;  // 自动轮播间隔(ms)
const MAX_VISIBLE = 5;            // 中心两侧各显示 N 张

/** 计算单张卡片的 3D 样式参数 — 内景视角（从圆柱体内部看旋转） */
function getCardTransform(offset) {
  const abs = Math.abs(offset);
  const sign = offset > 0 ? 1 : offset < 0 ? -1 : 0;

  // 水平偏移(%) — 卡片间距
  const tx = sign * abs * 50;
  // Z轴深度(px) — 弧面景深
  const tz = -abs * 10;
  // Y轴旋转(deg) — 内景视角
  const ry = -sign * abs * 25;
  // 缩放 — 中间卡片略放大，两侧平稳递减
  const scale = abs === 0 ? 1.08 : 1 - abs * 0.1;
  // 透明度 — 平稳衰减
  const opacity = 1 - abs * 0.15;
  // 模糊 — 仅最外侧轻微模糊
  const blur = abs >= 4 ? `blur(${(abs - 3) * 2}px)` : 'none';
  const brightness = abs >= 4 ? 0.6 : 1;
  // z-index — 中间最高
  const zIndex = 20 - abs;
  // 是否可交互 — 仅中间卡片
  const pointerEvents = abs === 0 ? 'auto' : 'none';

  return {
    transform: `translateX(${tx}%) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
    opacity,
    zIndex,
    filter: blur === 'none'
      ? `brightness(${brightness})`
      : `${blur} brightness(${brightness})`,
    pointerEvents,
  };
}

function CoverFlow({ items, onItemClick }) {
  const [active, setActive] = useState(0);
  const timerRef = useRef(null);
  const total = items.length;

  // ---- 环形偏移计算 ----
  const getOffset = useCallback((i) => {
    let diff = i - active;
    if (total > 2) {
      if (diff > total / 2) diff -= total;
      if (diff < -total / 2) diff += total;
    }
    if (Math.abs(diff) > MAX_VISIBLE) return null;
    return diff;
  }, [active, total]);

  // ---- 导航 ----
  const goTo = useCallback((idx) => {
    setActive((((idx % total) + total) % total));
  }, [total]);

  const next = useCallback(() => goTo(active + 1), [active, goTo]);
  const prev = useCallback(() => goTo(active - 1), [active, goTo]);

  // ---- 自动轮播 ----
  const startTimer = useCallback(() => {
    stopTimer();
    if (total <= 1) return;
    timerRef.current = setInterval(next, COVERFLOW_INTERVAL);
  }, [next, total]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  // ---- 卡片点击 ----
  const handleCardClick = useCallback((e, idx) => {
    if (idx === active) {
      onItemClick?.(items[idx]);
    } else {
      goTo(idx);
    }
  }, [active, items, onItemClick, goTo]);

  // ---- 键盘 ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prev, next]);

  if (!items.length) return null;

  return (
    <div
      className="coverflow"
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
    >
      {/* 3D 舞台 */}
      <div className="coverflow-stage">
        {items.map((item, i) => {
          const offset = getOffset(i);
          if (offset === null) return null;

          const isActive = offset === 0;
          const style = getCardTransform(offset);

          // 图片URL处理（兼容 cover / imageUrl / pic 多种字段名）
          const rawCover = item.cover || item.imageUrl || item.pic || '';
          const isNeteaseCdn = rawCover.includes('music.126.net');
          const imgSrc = isNeteaseCdn
            ? cachedProxyImageUrl(rawCover, '800y450')
            : rawCover;

          return (
            <div
              key={i}
              className={`coverflow-card${isActive ? ' is-active' : ''}`}
              style={style}
              data-index={i}
              onClick={(e) => handleCardClick(e, i)}
            >
              <img
                src={imgSrc || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect fill="%23151515" width="800" height="450"/><text fill="%23555" x="400" y="235" text-anchor="middle" font-size="40">♪</text></svg>'}
                alt=""
                className="coverflow-card-img"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="coverflow-card-title-bar">
                <span className="coverflow-card-subtitle-text">{item.subtitle || item.title || ''}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 边缘渐隐 */}
      <div className="coverflow-edge-left" />
      <div className="coverflow-edge-right" />

      {/* 左右箭头 */}
      <button className="coverflow-arrow coverflow-arrow-left" onClick={prev} aria-label="上一张">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button className="coverflow-arrow coverflow-arrow-right" onClick={next} aria-label="下一张">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* 分页器 */}
      <div className="coverflow-pagination">
        {items.map((_, i) => (
          <button
            key={i}
            className={`coverflow-dot${i === active ? ' is-active' : ''}`}
            onClick={() => goTo(i)}
            aria-label={`第 ${i + 1} 张`}
          />
        ))}
      </div>
    </div>
  );
}

function ArtistSpotlightCard({ artist, onClick, rank }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = cachedProxyImageUrl(artist.picUrl, '200y200');

  return (
    <div className="artist-spotlight-card" onClick={onClick}>
      <div className="spotlight-rank">TOP {rank}</div>
      <div className="spotlight-avatar-wrapper">
        {imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt=""
            className="spotlight-avatar"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="spotlight-avatar-fallback">{artist.name.charAt(0)}</div>
        )}
      </div>
      <h4 className="spotlight-name">{artist.name}</h4>
      <p className="spotlight-meta">
        {artist.musicSize || 0} 首歌曲 · {artist.albumSize || 0} 张专辑
      </p>
    </div>
  );
}

/** 热门歌曲卡片 */
function TrendingCard({ song, rank, onClick }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = cachedProxyImageUrl(song.cover, '200y200');

  return (
    <div className="trending-card" onClick={onClick}>
      <div className="trending-cover-wrapper">
        {imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt=""
            className="trending-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="trending-cover-fallback"><MusicNoteIcon size={40} /></div>
        )}
        <div className="trending-rank-badge">{rank}</div>
        <div className="trending-play-overlay">
          <span className="play-icon"><PlayIcon size={16} color="#fff" /></span>
        </div>
      </div>
      <h4 className="trending-name">{song.title}</h4>
      <p className="trending-artist">{song.artist}</p>
    </div>
  );
}

/** 歌曲行 */
function SongRow({ song, onClick, showCover = true }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = cachedProxyImageUrl(song.cover, '60y60');

  return (
    <div className="song-row" onClick={onClick}>
      {showCover && (
        imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt=""
            className="song-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="song-cover-fallback"><MusicNoteIcon size={20} /></div>
        )
      )}
      <div className="song-info">
        <span className="song-title">{song.title}</span>
        <span className="song-artist">{song.artist}</span>
      </div>
      <span className="song-duration">{formatDuration(song.duration)}</span>
      <button className="song-more-btn" onClick={e => { e.stopPropagation(); }}><MoreIcon size={18} /></button>
    </div>
  );
}

/** 排行歌曲行 */
function RankSongRow({ song, rank, onClick }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = cachedProxyImageUrl(song.cover, '60y60');

  return (
    <div className="rank-song-row" onClick={onClick}>
      <span className={`rank-num ${rank <= 3 ? 'rank-top' : ''}`}>
        {String(rank).padStart(2, '0')}
      </span>
      {imgSrc && !imgError ? (
        <img
          src={imgSrc}
          alt=""
          className="rank-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="rank-cover-fallback"><MusicNoteIcon size={18} /></div>
      )}
      <div className="rank-info">
        <span className="rank-title">{song.title}</span>
        <span className="rank-artist">{song.artist}</span>
      </div>
      <span className="rank-duration">{formatDuration(song.duration)}</span>
    </div>
  );
}

// ==================== 主页主体 ====================

export default function HomePage() {
  const navigate = useNavigate();

  const [banners, setBanners] = useState(FALLBACK_BANNERS); // API无登录态返回空，兜底本地数据
  const [trendingSongs, setTrendingSongs] = useState([]);
  const [topArtists, setTopArtists] = useState([]);
  const [newSongs, setNewSongs] = useState([]);
  const [hotSongs, setHotSongs] = useState([]);
  const [chinaChart, setChinaChart] = useState([]);
  const [cityCharts, setCityCharts] = useState({});
  const [activeCity, setActiveCity] = useState('全国');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // 逐个并行请求，每个完成即更新对应 state
    const fetchSection = async (name, fetcher, setter) => {
      // 先尝试缓存
      const cached = getCachedApiResponse(name);
      if (cached && !cancelled) setter(cached);

      try {
        const data = await fetcher();
        if (cancelled) return;
        if (data !== null && data !== undefined) {
          cacheApiResponse(name, data);
          setter(data);
        }
      } catch { /* 单个接口失败不影响其他 */ }
    };

    // 热门推荐 + 排行榜（同一数据源）
    fetchSection('home_topsongs',
      () => api.getTopSongs(0).then(d => (d.data || [])),
      (data) => {
        if (!Array.isArray(data) || !data.length) return;
        const songs = data.slice(0, 50).map(toSong);
        setTrendingSongs(songs);
        setHotSongs(songs);
        setChinaChart(songs);
      }
    );

    // Banner
    fetchSection('home_banners',
      () => api.getBanner().catch(() => null),
      (data) => {
        if (!data?.banners?.length) return;
        const mapped = data.banners.slice(0, 12).map(b => ({
          cover: b.imageUrl || b.pic || b.cover || '',
          title: b.typeTitle || b.title || '音乐推荐',
          subtitle: b.songName || b.bannerDescription || b.subtitle || '',
          tag: b.tag || '每日推荐',
          targetId: b.targetId || 0,
          targetType: b.targetType || 0,
        }));
        if (mapped.length >= 2) setBanners(mapped);
      }
    );

    // 瞩目之星
    fetchSection('home_topartists',
      () => api.getTopArtists(10, 1).then(d => (d.artists || []).slice(0, 7).map(toArtist)).catch(() => []),
      (data) => { if (Array.isArray(data) && data.length) setTopArtists(data); }
    );

    // 新歌精选
    fetchSection('home_new_songs',
      () => api.getNewSongs(15).then(d => (d.data || []).slice(0, 10).map(toSong)).catch(() => []),
      (data) => { if (Array.isArray(data) && data.length) setNewSongs(data); }
    );

    // 城市排行榜
    fetchSection('home_citycharts',
      () => api.getCityCharts('全国', 10).then(d => ({ ['全国']: (d.tracks || []).map(toSong) })).catch(() => ({})),
      (data) => { if (data && Object.keys(data).length) setCityCharts(data); }
    );

    return () => { cancelled = true; };
  }, []);

  // 城市切换
  const handleCityChange = useCallback(async (city) => {
    setActiveCity(city);
    if (cityCharts[city]) return;
    try {
      const res = await api.getCityCharts(city, 10);
      setCityCharts(prev => ({ ...prev, [city]: (res.tracks || []).map(toSong) }));
    } catch { /* ignore */ }
  }, [cityCharts]);

  // 导航
  const handleSongClick = useCallback((song) => {
    navigate('/player', { state: { song } });
  }, [navigate]);

  const handleViewAll = useCallback((fetchKey) => {
    navigate('/browse', { state: { fetchKey } });
  }, [navigate]);

  const handleBannerClick = useCallback((banner) => {
    // Banner 点击 → 进入歌单详情页
    // 传递 title 和 cover 确保页面内容与封面匹配
    navigate('/playlist', {
      state: {
        playlistId: banner.targetId || 3778678,
        title: banner.title || '热门歌曲',
        cover: banner.cover || '',
      }
    });
  }, [navigate]);

  const handleArtistClick = useCallback((artist) => {
    navigate('/artist', { state: { artist } });
  }, [navigate]);

  // ==================== 渲染 ====================
  const cityTabs = api.getCityNames();
  const currentCitySongs = cityCharts[activeCity] || chinaChart.slice(0, 10);

  return (
    <div className="home-page">

      {/* ========== 1. 发现 — Cover Flow 3D 轮播（立即渲染，不受 loading 影响） ========== */}
      <section className="hero-section">
        <h2 className="section-title">发现</h2>
        <CoverFlow items={banners} onItemClick={handleBannerClick} />
      </section>

      {/* 各区块独立加载，互不阻塞 */}
        <>
          {/* ========== 2. 热门推荐 ========== */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title"><span className="section-icon"><TrendingIcon size={22} /></span> 热门推荐</h2>
              <button className="section-more" onClick={() => handleViewAll('hotsongs')}>查看全部 ›</button>
            </div>
            {trendingSongs.length > 0 ? (
              <div className="trending-grid">
                {trendingSongs.slice(0, 16).map((song, i) => (
                  <TrendingCard key={song.id} song={song} rank={i + 1} onClick={() => handleSongClick(song)} />
                ))}
              </div>
            ) : (
              <div className="section-empty">加载中...</div>
            )}
          </section>

          {/* ========== 3. 瞩目之星 — 5列网格 ========== */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title"><span className="section-icon"><StarIcon size={22} filled /></span> 瞩目之星</h2>
              <button className="section-more" onClick={() => handleViewAll('topartists')}>查看全部 ›</button>
            </div>
            {topArtists.length > 0 ? (
              <div className="spotlight-grid">
                {topArtists.map((artist, i) => (
                  <ArtistSpotlightCard key={artist.id} artist={artist} rank={i + 1} onClick={() => handleArtistClick(artist)} />
                ))}
              </div>
            ) : (
              <div className="section-empty">加载中...</div>
            )}
          </section>

          {/* ========== 4. 新歌精选 ========== */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title"><span className="section-icon"><MusicIcon size={22} /></span> 新歌精选</h2>
              <button className="section-more" onClick={() => handleViewAll('newsongs')}>查看全部 ›</button>
            </div>
            {newSongs.length > 0 ? (
              <div className="song-list">
                {newSongs.slice(0, 10).map((song) => (
                  <SongRow key={song.id} song={song} onClick={() => handleSongClick(song)} />
                ))}
              </div>
            ) : (
              <div className="section-empty">加载中...</div>
            )}
          </section>

          {/* ========== 5. 排行榜 ========== */}
          <section className="section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon"><TrophyIcon size={22} /></span> 排行榜
              </h2>
              <button className="section-more" onClick={() => handleViewAll('charts')}>查看全部 ›</button>
            </div>

            <div className="chart-panel">
              <div className="chart-panel-header">
                <h3 className="chart-panel-title">热歌榜 · 每周热门 100 首</h3>
              </div>
              <div className="chart-list">
                {hotSongs.slice(0, 20).map((song, i) => (
                  <RankSongRow key={song.id} song={song} rank={i + 1} onClick={() => handleSongClick(song)} />
                ))}
              </div>
            </div>

            <div className="chart-panel city-chart">
              <div className="chart-panel-header">
                <h3 className="chart-panel-title">城市排行榜</h3>
                <div className="city-tabs">
                  {cityTabs.map(city => (
                    <button
                      key={city}
                      className={`city-tab ${activeCity === city ? 'active' : ''}`}
                      onClick={() => handleCityChange(city)}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-list">
                {currentCitySongs.map((song, i) => (
                  <RankSongRow key={song.id} song={song} rank={i + 1} onClick={() => handleSongClick(song)} />
                ))}
              </div>
            </div>
          </section>
        </>

      <div className="page-footer-space" />

    </div>
  );
}
