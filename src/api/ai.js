/**
 * AI 智能推荐模块
 *
 * 数据流：
 *   PlayerContext.playHistory
 *     → extractFeatures() 提取歌手/风格/歌曲特征
 *     → buildPrompt() 构造结构化提示词
 *     → callAI() 调用阿里云百炼 DashScope API
 *     → parseResponse() 解析 JSON 推荐结果
 *     → RecommendPage 渲染
 */

const AI_PROXY = '/api/ai'

// ==================== 提示词模板 ====================

const SYSTEM_PROMPT = `你是一个专业的音乐推荐引擎。你需要根据用户提供的听歌历史数据，为其生成一份个性化推荐歌单。

请严格按以下 JSON 格式返回（不要包含任何 markdown 标记，只输出纯 JSON）：

{
  "playlistName": "歌单名称，不超过12个字，贴合用户听歌风格，有吸引力",
  "description": "推荐理由，用一句话描述这个歌单的特点，不超过30字",
  "metadata": {
    "genres": ["风格1", "风格2"]
  },
  "songs": [
    {
      "title": "歌曲名（必须是真实存在的知名歌曲）",
      "artist": "歌手名",
      "reason": "推荐原因，简短说明为什么推荐这首歌，不超过15字"
    }
  ]
}

要求：
1. 推荐 8 到 12 首歌曲
2. 歌曲必须是真实存在的、广为人知的歌曲
3. 推荐歌曲应与用户历史记录中体现的音乐偏好高度相关
4. 优先推荐用户喜欢歌手的其他代表作，以及同风格歌手的知名作品
5. 每首歌的推荐原因要具体、个性化，不要泛泛而谈
6. 歌单名称要能概括推荐主题，有创意`

// ==================== 特征提取 ====================

/**
 * 从听歌历史中提取歌手频次排名
 */
function extractArtists(history) {
  const counts = {}
  for (const s of history) {
    if (!s.artist) continue
    const names = s.artist.split('/').map(n => n.trim()).filter(Boolean)
    for (const name of names) {
      counts[name] = (counts[name] || 0) + 1
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name)
}

/**
 * 从听歌历史中推断音乐风格
 */
function extractGenres(history) {
  const keywords = {
    '流行': ['流行', 'Pop', 'pop'],
    '摇滚': ['摇滚', 'Rock', 'rock'],
    '民谣': ['民谣', 'Folk', 'folk'],
    '电子': ['电子', 'Electronic', '电音', 'EDM', 'edm'],
    '嘻哈': ['嘻哈', 'Hip-Hop', 'Rap', 'rap', '说唱'],
    'R&B': ['R&B', 'RnB', '节奏布鲁斯'],
    '古典': ['古典', 'Classical', 'classical', '交响'],
    '爵士': ['Jazz', 'jazz', '爵士'],
    '国风': ['国风', '古风', '中国风'],
    '轻音乐': ['轻音乐', '纯音乐', 'Instrumental'],
    '治愈': ['治愈', '温暖', '安静'],
    '热血': ['热血', '燃', '激昂'],
  }

  const scores = {}
  for (const s of history) {
    const text = `${s.title || ''} ${s.artist || ''}`.toLowerCase()
    for (const [genre, kws] of Object.entries(keywords)) {
      for (const kw of kws) {
        if (text.includes(kw.toLowerCase())) {
          scores[genre] = (scores[genre] || 0) + 1
          break
        }
      }
    }
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre)
}

/**
 * 构造给 AI 的用户消息
 */
function buildUserPrompt(history, artists, genres) {
  const recentSongs = history.slice(-15).map(s => `${s.title} - ${s.artist}`).filter(Boolean)

  let prompt = '以下是我的听歌数据分析：\n\n'

  if (artists.length > 0) {
    prompt += `【常听歌手】${artists.slice(0, 5).join('、')}\n`
  }
  if (genres.length > 0) {
    prompt += `【音乐风格】${genres.join('、')}\n`
  }
  if (recentSongs.length > 0) {
    prompt += `【最近播放】${recentSongs.slice(0, 10).join('、')}\n`
  }

  prompt += '\n请基于以上数据，为我生成一份个性化推荐歌单。'
  return prompt
}

// ==================== JSON 解析 ====================

/**
 * 从 AI 返回的文本中提取 JSON 对象
 */
function extractJSON(text) {
  if (!text) return null

  // 1. 尝试直接解析
  try {
    const obj = JSON.parse(text)
    if (obj.playlistName || obj.songs) return obj
  } catch { /* 继续 */ }

  // 2. 提取 ```json ... ``` 代码块
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence) {
    try { return JSON.parse(fence[1]) } catch { /* 继续 */ }
  }

  // 3. 提取最外层 { ... }
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { /* 继续 */ }
        start = -1
      }
    }
  }

  return null
}

// ==================== API 调用 ====================

/**
 * 调用阿里云百炼大模型生成推荐歌单
 *
 * @param {Array}  history - 听歌历史 [{ title, artist, ... }]
 * @param {Object} options
 * @param {number} options.timeout - 超时 ms，默认 25000
 * @returns {Promise<{ playlistName, description, songs, metadata }>}
 */
export async function generateRecommendations(history, options = {}) {
  const { timeout = 25000 } = options

  if (!history || history.length < 3) {
    throw new Error('听歌历史不足（至少需要 3 首），请先播放一些歌曲')
  }

  // 1. 特征提取
  const artists = extractArtists(history)
  const genres = extractGenres(history)

  // 2. 构造 Prompt
  const userPrompt = buildUserPrompt(history, artists, genres)

  // 3. 调用 API
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  let res
  try {
    res = await fetch(AI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`AI 服务响应异常 (${res.status})，请稍后重试`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('AI 未返回有效内容，请重试')
  }

  // 4. 解析结果
  const result = extractJSON(content)
  if (!result || !result.playlistName || !Array.isArray(result.songs) || result.songs.length === 0) {
    throw new Error('AI 返回格式异常，无法解析推荐结果，请重试')
  }

  // 5. 规范化输出
  return {
    playlistName: result.playlistName.slice(0, 30),
    description: (result.description || '根据你的听歌品味精心推荐').slice(0, 60),
    songs: result.songs.slice(0, 12).map(s => ({
      title: (s.title || '').trim(),
      artist: (s.artist || '').trim(),
      reason: (s.reason || '').trim().slice(0, 30),
    })).filter(s => s.title),
    metadata: {
      artists: artists.slice(0, 5),
      genres: result.metadata?.genres || genres,
      historyCount: history.length,
    },
  }
}

// 缓存逻辑已移至 RecommendPage 组件内部（sessionStorage key: 'ai_recommend_state'）
