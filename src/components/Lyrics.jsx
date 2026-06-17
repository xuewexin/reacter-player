import { useMemo, useRef, useEffect, useCallback } from 'react'
import './Lyrics.css'

function parseLRC(text) {
  if (!text) return []
  const lines = text.split('\n')
  const result = []
  for (const line of lines) {
    const m = line.match(/\[(\d{2,}):(\d{2}(?:\.\d+)?)\](.*)/)
    if (!m) continue
    const minutes = parseInt(m[1], 10)
    const secs = parseFloat(m[2])
    const time = minutes > 59 ? (minutes * 60 + secs) : (minutes * 60 + secs)
    result.push({ time, text: m[3].trim() || '···' })
  }
  return result
}

export default function Lyrics({ lrc, currentTime, onLineClick, loading }) {
  const prevIndexRef = useRef(-1)
  const containerRef = useRef(null)
  const userScrolledRef = useRef(false)
  const scrollTimerRef = useRef(null)

  const lines = useMemo(() => parseLRC(lrc), [lrc])

  const activeIndex = useMemo(() => {
    let idx = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].time) { idx = i; break }
    }
    return idx
  }, [lines, currentTime])

  // ★ 用户手动滚动时暂停自动跟随，3 秒后恢复
  const handleUserScroll = useCallback(() => {
    userScrolledRef.current = true
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false
    }, 3000)
  }, [])

  // ★ 歌词行点击 → 恢复自动跟随
  const handleLineClick = useCallback((time) => {
    userScrolledRef.current = false
    onLineClick && onLineClick(time)
  }, [onLineClick])

  // 歌曲切换时重置
  useEffect(() => {
    userScrolledRef.current = false
    prevIndexRef.current = -1
  }, [lrc])

  // 自动滚动
  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return
    if (activeIndex === prevIndexRef.current) return
    prevIndexRef.current = activeIndex

    if (userScrolledRef.current) return  // 用户正在手动浏览，不自动跟随

    const el = containerRef.current.querySelector('.lrc-line-v2.active')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex])

  if (loading) {
    return (
      <div className="lyrics-panel-v2">
        <p className="lrc-empty-v2">歌词加载中...</p>
      </div>
    )
  }

  if (!lines.length) {
    return (
      <div className="lyrics-panel-v2">
        <p className="lrc-empty-v2">{lrc === '' ? '暂无歌词' : '歌词解析中...'}</p>
      </div>
    )
  }

  return (
    <div className="lyrics-panel-v2" ref={containerRef} onWheel={handleUserScroll} onTouchMove={handleUserScroll}>
      <div className="lrc-list">
        {lines.map((line, i) => {
          let cls = 'lrc-line-v2'
          if (i < activeIndex) cls += ' played'
          else if (i === activeIndex) cls += ' active'

          return (
            <p
              key={i}
              className={cls}
              onClick={() => handleLineClick(line.time)}
            >{line.text}</p>
          )
        })}
        <div className="lrc-spacer" />
      </div>
    </div>
  )
}