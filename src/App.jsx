import React, { useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { usePlayer } from './context/PlayerContext'
import Navbar from './components/Navbar'
import MiniPlayer from './components/MiniPlayer'
import Login from './pages/Login'
import Register from './pages/Register'
import HomePage from './pages/HomePage'
import PlayerPage from './pages/PlayerPage'
import ArtistPage from './pages/ArtistPage'
import PlaylistPage from './pages/PlaylistPage'
import BrowsePage from './pages/BrowsePage'
import FavoritesPage from './pages/FavoritesPage'
import HistoryPage from './pages/HistoryPage'
import RecommendPage from './pages/RecommendPage'

function PublicRoute({ children }) {
  const { user } = useAuth()
  if (user) {
    return <Navigate to="/" replace />
  }
  return children
}

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

/** 只在导航到 /player 时加载歌曲，其他页面不触发自动播放 */
function RouteStateHandler() {
  const location = useLocation()
  const { loadFromRoute } = usePlayer()
  const lastKeyRef = useRef(null)

  useEffect(() => {
    // ★ 只有 /player 路由才触发自动播放
    if (location.pathname !== '/player') return
    const state = location.state
    if (!state) return
    if (state.searchQuery) return
    const key = state.song?.id || state.playlistId || state.albumId || state.artistId || (state.songs ? state.viewTitle : '') || ''
    const keyStr = `${key}_${location.pathname}`
    if (keyStr === lastKeyRef.current) return
    lastKeyRef.current = keyStr
    loadFromRoute(state)
  }, [location, loadFromRoute])

  return null
}

export default function App() {
  const { loading } = useAuth()
  const { currentSong } = usePlayer()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    )
  }

  const showMiniPlayer = currentSong !== null

  return (
    <div className="app">
      <Navbar />
      <main className="main-content" style={{ paddingBottom: showMiniPlayer ? '140px' : '64px' }}>
        <RouteStateHandler />
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/player"
            element={
              <ProtectedRoute>
                <PlayerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/artist"
            element={
              <ProtectedRoute>
                <ArtistPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/playlist"
            element={
              <ProtectedRoute>
                <PlaylistPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/browse"
            element={
              <ProtectedRoute>
                <BrowsePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/favorites"
            element={
              <ProtectedRoute>
                <FavoritesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recommend"
            element={
              <ProtectedRoute>
                <RecommendPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <MiniPlayer />
    </div>
  )
}
