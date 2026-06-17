import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

// 本地用户数据存储
function getUsers() {
  try {
    const users = localStorage.getItem('music_player_users')
    return users ? JSON.parse(users) : []
  } catch {
    return []
  }
}

function saveUsers(users) {
  localStorage.setItem('music_player_users', JSON.stringify(users))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 初始化时检查登录状态
  useEffect(() => {
    const savedUser = localStorage.getItem('music_player_current_user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem('music_player_current_user')
      }
    }
    setLoading(false)
  }, [])

  const register = (username, email, password) => {
    return new Promise((resolve, reject) => {
      const users = getUsers()
      if (users.find(u => u.username === username)) {
        reject(new Error('该用户名已被注册'))
        return
      }
      if (users.find(u => u.email === email)) {
        reject(new Error('该邮箱已被注册'))
        return
      }
      const newUser = { id: Date.now().toString(), username, email, password, createdAt: new Date().toISOString() }
      users.push(newUser)
      saveUsers(users)
      resolve({ success: true, message: '注册成功' })
    })
  }

  const login = (username, password) => {
    return new Promise((resolve, reject) => {
      const users = getUsers()
      const found = users.find(u => u.username === username && u.password === password)
      if (!found) { reject(new Error('用户名或密码错误')); return }
      const userData = { id: found.id, username: found.username, email: found.email }
      localStorage.setItem('music_player_current_user', JSON.stringify(userData))
      setUser(userData)
      resolve({ success: true })
    })
  }

  const logout = () => {
    localStorage.removeItem('music_player_current_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用')
  }
  return context
}
