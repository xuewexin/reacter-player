import React, { useState, useCallback, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { usePlayer } from '../context/PlayerContext'
import { SearchIcon, CloseIcon, MenuIcon, SunIcon, MoonIcon, MusicNoteIcon, LogoutIcon, UserIcon } from './Icons'
import './Navbar.css'

export default function Navbar({ showBack = false }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { triggerNavSearch } = usePlayer()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleBack = () => {
    navigate(-1)
  }

  const handleSearch = useCallback((e) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    // 通过 PlayerContext 直接设置搜索（不依赖 router state）
    triggerNavSearch(q)
    setSearchQuery('')
    if (searchInputRef.current) searchInputRef.current.blur()
    navigate('/player')
  }, [searchQuery, navigate, triggerNavSearch])

  const isHomePage = location.pathname === '/'
  const isPlayerPage = location.pathname === '/player'
  const isFavPage = location.pathname === '/favorites'
  const isHistoryPage = location.pathname === '/history'
  const isRecommendPage = location.pathname === '/recommend'

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {showBack && (
          <button className="back-btn" onClick={handleBack} aria-label="返回">
            ←
          </button>
        )}

        <Link to="/" className="navbar-brand">
          <span className="brand-icon"><MusicNoteIcon size={28} /></span>
          <span className="brand-text">Music Player</span>
        </Link>

        {/* 搜索栏 */}
        {user && (
          <form className="navbar-search" onSubmit={handleSearch}>
            <span className="search-icon"><SearchIcon size={16} /></span>
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="搜索歌曲、专辑、歌手..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="search-clear" onClick={() => setSearchQuery('')}>
                {<CloseIcon size={14} />}
              </button>
            )}
          </form>
        )}

        {user && !showBack && (
          <div className="nav-tabs">
            <Link
              to="/"
              className={`tab-link ${isHomePage ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              首页
            </Link>
            <Link
              to="/player"
              className={`tab-link ${isPlayerPage ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              播放器
            </Link>
            <Link
              to="/favorites"
              className={`tab-link fav-tab ${isFavPage ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              我的喜欢
            </Link>
            <Link
              to="/history"
              className={`tab-link ${isHistoryPage ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              播放历史
            </Link>
            <Link
              to="/recommend"
              className={`tab-link recommend-tab ${isRecommendPage ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              智能推荐
            </Link>
          </div>
        )}

        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="菜单"
        >
          <MenuIcon size={22} />
        </button>

        <button className="theme-toggle" onClick={toggleTheme} aria-label="切换主题" title={theme === 'dark' ? '亮色' : '暗色'}>
          {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>

        <div className={`navbar-menu ${menuOpen ? 'open' : ''}`}>
          {user ? (
            <>
              <div className="nav-user">
                <span className="user-avatar">
                  {<UserIcon size={16} />}
                </span>
                <span className="user-name">{user.username}</span>
              </div>

              <button className="btn-logout" onClick={handleLogout}>
                {<LogoutIcon size={16} />} 退出登录
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link" onClick={() => setMenuOpen(false)}>
                登录
              </Link>
              <Link
                to="/register"
                className="nav-link nav-register"
                onClick={() => setMenuOpen(false)}
              >
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
