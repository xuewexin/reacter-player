import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const aliApiKey = env.VITE_ALIYUN_API_KEY || ''

  return {
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/music': {
        target: 'https://music.163.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/music/, '/api'),
        headers: { Referer: 'https://music.163.com/' },
      },
      // 旧路径兼容（ArtistPage/HomePage/PlaylistPage 使用）
      '/img-proxy': {
        target: 'https://p1.music.126.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img-proxy/, ''),
        headers: { Referer: 'https://music.163.com/' },
      },
      // 图片代理：覆盖所有网易云CDN子域（Player 使用 p1~p4）
      '/img-p1': {
        target: 'https://p1.music.126.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img-p1/, ''),
        headers: { Referer: 'https://music.163.com/' },
      },
      '/img-p2': {
        target: 'https://p2.music.126.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img-p2/, ''),
        headers: { Referer: 'https://music.163.com/' },
      },
      '/img-p3': {
        target: 'https://p3.music.126.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img-p3/, ''),
        headers: { Referer: 'https://music.163.com/' },
      },
      '/img-p4': {
        target: 'https://p4.music.126.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/img-p4/, ''),
        headers: { Referer: 'https://music.163.com/' },
      },
      // QQ音乐搜索代理
      '/api/qqsearch': {
        target: 'https://c.y.qq.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/qqsearch/, ''),
        headers: { Referer: 'https://y.qq.com/' },
      },
      // LX Music 音源后端代理 — 解析五大平台歌曲直链
      '/api/lxsource': {
        target: 'https://lxmusicapi.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/lxsource/, ''),
        headers: { Referer: 'https://lxmusicapi.onrender.com/' },
      },
      // AI 智能推荐 — 阿里云百炼大模型
      '/api/ai': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, '/compatible-mode/v1/chat/completions'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Authorization', `Bearer ${aliApiKey}`)
          })
        },
      },
    },
  },
  }
})
