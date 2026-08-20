// cloudfunctions/parseReminder/index.js
// AI 智能解析提醒需求
// 支持两种输入：
//   1. { text: "自然语言文本" }
//   2. { audioFileID: "云存储 fileID" }  → 先 ASR 转文字，再解析
// 输出：结构化提醒数据 { title, category, subType, repeatType, monthlyDay, ... }
//
// 智谱接口：
//   - GLM-4-Flash 文本解析：https://open.bigmodel.cn/api/paas/v4/chat/completions
// 百度接口：
//   - ASR 语音识别：https://vop.baidu.com/server_api

const cloud = require('wx-server-sdk')
const config = require('./config')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ZHIPU_API_KEY = config.ZHIPU_API_KEY || process.env.ZHIPU_API_KEY || ''
const BAIDU_ASR_API_KEY = config.BAIDU_ASR_API_KEY || ''
const BAIDU_ASR_SECRET_KEY = config.BAIDU_ASR_SECRET_KEY || ''

const GLM_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const BAIDU_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const BAIDU_ASR_URL = 'https://vop.baidu.com/server_api'

// 百度 token 缓存（有效期30天）
let baiduTokenCache = { token: '', expireAt: 0 }

// ===== 主入口 =====
exports.main = async (event) => {
  const { text, audioFileID } = event || {}

  if (!ZHIPU_API_KEY) {
    return { ok: false, error: '云函数未配置 ZHIPU_API_KEY' }
  }

  try {
    let userInput = (text || '').trim()

    // 1. 若传入音频，先 ASR 转文字
    if (!userInput && audioFileID) {
      console.log('[parseReminder] 开始 ASR 转文字', audioFileID)
      const asrResult = await speechToText(audioFileID)
      if (!asrResult.ok) {
        return { ok: false, error: '语音识别失败：' + asrResult.error }
      }
      userInput = asrResult.text
      console.log('[parseReminder] ASR 结果：', userInput)
    }

    if (!userInput) {
      return { ok: false, error: '未识别到有效内容' }
    }

    // 2. GLM-4-Flash 解析为结构化提醒
    console.log('[parseReminder] 开始 GLM 解析：', userInput)
    const parsed = await parseWithGLM(userInput)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error }
    }

    return { ok: true, text: userInput, data: parsed.data }
  } catch (e) {
    console.error('[parseReminder] 异常：', e)
    return { ok: false, error: '服务异常：' + e.message }
  }
}

// ===== HTTP 请求封装 =====
async function httpRequest(urlStr, options) {
  return new Promise((resolve, reject) => {
    const lib = urlStr.startsWith('https') ? require('https') : require('http')
    const u = require('url').parse(urlStr)
    const reqOptions = {
      hostname: u.hostname,
      port: u.port || (urlStr.startsWith('https') ? 443 : 80),
      path: u.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }
    if (options.body) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body)
    }
    console.log('[HTTP]', reqOptions.method, urlStr)
    const req = lib.request(reqOptions, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        console.log('[HTTP] status:', res.statusCode, 'body:', data.slice(0, 300))
        resolve({ statusCode: res.statusCode, data })
      })
    })
    req.on('error', (e) => reject(e))
    req.setTimeout(options.timeout || 30000, () => { req.destroy(); reject(new Error('请求超时')) })
    if (options.body) req.write(options.body)
    req.end()
  })
}

// ===== 百度 ASR：获取 access_token =====
async function getBaiduToken() {
  // 缓存有效
  if (baiduTokenCache.token && Date.now() < baiduTokenCache.expireAt) {
    return baiduTokenCache.token
  }

  const bodyStr = 'grant_type=client_credentials&client_id=' + encodeURIComponent(BAIDU_ASR_API_KEY) + '&client_secret=' + encodeURIComponent(BAIDU_ASR_SECRET_KEY)

  console.log('[Baidu] API Key 长度:', BAIDU_ASR_API_KEY ? BAIDU_ASR_API_KEY.length : 0)
  console.log('[Baidu] Secret Key 长度:', BAIDU_ASR_SECRET_KEY ? BAIDU_ASR_SECRET_KEY.length : 0)

  const { statusCode, data } = await httpRequest(BAIDU_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyStr)
    },
    body: bodyStr,
    timeout: 10000
  })

  if (statusCode >= 200 && statusCode < 300) {
    const obj = JSON.parse(data)
    const token = obj.access_token
    const expiresIn = obj.expires_in || 2592000 // 30天
    baiduTokenCache = {
      token,
      expireAt: Date.now() + (expiresIn - 3600) * 1000 // 提前1小时过期
    }
    return token
  }

  throw new Error('获取百度 token 失败：HTTP ' + statusCode + ' ' + data.slice(0, 200))
}

// ===== 百度 ASR：PCM 转 WAV =====
function pcmToWav(pcmBuffer, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
  const buffer = Buffer.alloc(44 + pcmBuffer.length)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcmBuffer.length, true)
  writeString(view, 8, 'WAVE')

  // fmt sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, channels, true) // channels
  view.setUint32(24, sampleRate, true) // sample rate
  view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true) // byte rate
  view.setUint16(32, channels * bitsPerSample / 8, true) // block align
  view.setUint16(34, bitsPerSample, true) // bits per sample

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, pcmBuffer.length, true)
  pcmBuffer.copy(buffer, 44)

  return buffer
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// ===== 百度 ASR：语音识别 =====
async function speechToText(fileID) {
  try {
    // 检查百度 ASR 配置
    if (!BAIDU_ASR_API_KEY || !BAIDU_ASR_SECRET_KEY) {
      return { ok: false, error: '百度语音识别未配置，请在 config.js 中填写 BAIDU_ASR_API_KEY 和 BAIDU_ASR_SECRET_KEY' }
    }

    // 下载音频文件（PCM 格式，16k 采样率）
    const fileRes = await cloud.downloadFile({ fileID })
    const fileBuffer = fileRes.fileContent
    if (!fileBuffer || fileBuffer.length === 0) {
      return { ok: false, error: '音频文件为空' }
    }
    console.log('[ASR] 音频大小：', fileBuffer.length, '字节')

    // PCM → WAV
    const wavBuffer = pcmToWav(fileBuffer, 16000, 1, 16)
    console.log('[ASR] WAV 大小：', wavBuffer.length, '字节')

    // Base64 编码
    const base64Audio = wavBuffer.toString('base64')

    // 获取 token
    const token = await getBaiduToken()
    console.log('[ASR] 获取 token 成功')

    // 调用百度 ASR
    const bodyObj = {
      format: 'wav',
      rate: 16000,
      channel: 1,
      cuid: 'miniprogram-reminder',
      token,
      speech: base64Audio,
      len: wavBuffer.length
    }
    const body = JSON.stringify(bodyObj)

    const { statusCode, data } = await httpRequest(BAIDU_ASR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body,
      timeout: 30000
    })

    console.log('[ASR] Baidu HTTP status:', statusCode)
    console.log('[ASR] Baidu response:', data.slice(0, 300))

    if (statusCode >= 200 && statusCode < 300) {
      const obj = JSON.parse(data)
      if (obj.err_no === 0 || obj.err_no === undefined) {
        // 百度 ASR result 可能是数组 ["文字"] 或直接字符串
        let text = ''
        if (Array.isArray(obj.result)) {
          text = (obj.result[0] || '').trim()
        } else if (typeof obj.result === 'string') {
          text = obj.result.trim()
        } else if (obj.result && typeof obj.result === 'object') {
          // 新版可能是 {word: "文字"} 结构
          text = (obj.result.word || obj.result.text || '').trim()
        }
        if (!text) return { ok: false, error: 'ASR 返回空文本' }
        return { ok: true, text }
      }
      return { ok: false, error: `ASR 错误：${obj.err_msg || obj.error_msg || '未知错误'}` }
    }
    return { ok: false, error: `ASR HTTP ${statusCode}: ${data.slice(0, 200)}` }
  } catch (e) {
    console.error('[ASR] 异常：', e)
    return { ok: false, error: e.message }
  }
}

// ===== GLM-4-Flash 文本解析 =====
async function parseWithGLM(userInput) {
  const systemPrompt = `你是一个提醒事项解析助手。用户会用自然语言描述一个提醒需求，你需要把它解析成结构化的 JSON 数据。

输出要求：
1. 只输出一个 JSON 对象，不要有任何额外文字、解释或 markdown 代码块标记。
2. JSON 字段如下：
   - title: 提醒标题（字符串，简洁，去掉"提醒我"、"帮我"等冗余词）
   - category: 分类，必须是以下之一：bill(缴费)、health(健康)、idcard(证件车辆)、anniversary(纪念日)、accounting(记账)
   - subType: 子类型（可选，见下方枚举）
   - repeatType: 重复类型，必须是以下之一：none(不重复)、daily(每天)、weekly(每周X，需配合weekday字段)、monthlyDay(每月X号，需配合monthlyDay字段)、quarterlyDay(每季度第X月X号，需配合quarterlyMonth和quarterlyDay字段)、yearly(每年X月X日，需配合yearlyMonth和yearlyDay字段)。注意：不要使用 monthly，每月重复一律用 monthlyDay 并指定 monthlyDay 字段。生日、纪念日等每年重复的事项必须用 yearly。
   - weekday: 数字 1-7（1=周一,2=周二,...,7=周日），仅 repeatType=weekly 时填（必填）
   - monthlyDay: 数字 1-31，仅 repeatType=monthlyDay 时填（必填）
   - quarterlyMonth: 数字 1-3（季度内第几个月），仅 repeatType=quarterlyDay 时填
   - quarterlyDay: 数字 1-31，仅 repeatType=quarterlyDay 时填
   - yearlyMonth: 数字 1-12，仅 repeatType=yearly 时填（必填）
   - yearlyDay: 数字 1-31，仅 repeatType=yearly 时填（必填）
   - remindTime: 提醒时间，格式 "HH:mm"，未提及则填 "09:00"
   - advanceDays: 提前提醒天数，数字，未提及则填 1
   - note: 备注（可选）
3. 如果用户输入的内容无法识别为有效提醒，也必须返回合法 JSON，此时 title 填"无法识别"，其余字段按默认值填写。

分类与子类型枚举：
- bill: electricity(电费)、water(水费)、gas(燃气费)、property(物业费)、social(社保)、creditCard(信用卡还款)、mortgage(房贷)、carLoan(车贷)
- health: water(喝水)、medicine(吃药)、exercise(运动)、checkup(体检)、sleep(睡眠)
- idcard: idCard(身份证)、driverLicense(驾照)、passport(护照)、carInspection(车辆年检)、carInsurance(车险)、carMaintenance(车辆保养)
- anniversary: wedding(结婚纪念日)、love(恋爱纪念日)、birthday(生日)、festival(传统节日)、custom(自定义)

示例：
输入："每月5号下午3点提醒我交电费提前1天"
输出：{"title":"电费","category":"bill","subType":"electricity","repeatType":"monthlyDay","monthlyDay":5,"remindTime":"15:00","advanceDays":1,"note":""}

输入："每季度第2个月15号车险续费"
输出：{"title":"车险续费","category":"idcard","subType":"carInsurance","repeatType":"quarterlyDay","quarterlyMonth":2,"quarterlyDay":15,"remindTime":"09:00","advanceDays":1,"note":""}

输入："明天上午9点开会"
输出：{"title":"开会","category":"anniversary","subType":"custom","repeatType":"none","remindTime":"09:00","advanceDays":0,"note":""}

输入："每年8月15号老婆生日"
输出：{"title":"老婆生日","category":"anniversary","subType":"birthday","repeatType":"yearly","yearlyMonth":8,"yearlyDay":15,"remindTime":"09:00","advanceDays":1,"note":""}

输入："6月20号结婚纪念日每年提醒"
输出：{"title":"结婚纪念日","category":"anniversary","subType":"wedding","repeatType":"yearly","yearlyMonth":6,"yearlyDay":20,"remindTime":"09:00","advanceDays":1,"note":""}

输入："每周三提醒我健身"
输出：{"title":"健身","category":"health","subType":"exercise","repeatType":"weekly","weekday":3,"remindTime":"09:00","advanceDays":0,"note":""}

输入："大是大非sdfsdsfds"
输出：{"title":"无法识别","category":"anniversary","subType":"custom","repeatType":"none","remindTime":"09:00","advanceDays":1,"note":""}`

  // 尝试多个模型，按优先级排序
  const MODELS = ['glm-4-flash', 'GLM-4-Flash', 'glm-4-air', 'GLM-4-Air', 'glm-4', 'GLM-4']

  try {
    let lastError = null
    for (const model of MODELS) {
      const bodyWithModel = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput }
        ],
        temperature: 0.1,
        max_tokens: 512
      })

      console.log('[GLM] 尝试模型:', model)
      const { statusCode, data } = await httpRequest(GLM_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + ZHIPU_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyWithModel)
        },
        body: bodyWithModel,
        timeout: 30000
      })

      console.log('[GLM]', model, 'HTTP status:', statusCode)
      console.log('[GLM] response:', data.slice(0, 300))

      if (statusCode >= 200 && statusCode < 300) {
        const obj = JSON.parse(data)
        const content = (obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content) || ''
        const cleaned = content.replace(/```json|```/g, '').trim()

        // 尝试解析 JSON，如果失败则把 AI 的回复作为错误提示
        try {
          const jsonData = JSON.parse(cleaned)
          return { ok: true, data: jsonData }
        } catch (parseErr) {
          console.log('[GLM] AI 返回非 JSON 内容：', cleaned)
          return { ok: false, error: 'AI 无法识别该内容：' + cleaned.slice(0, 100) }
        }
      }

      lastError = `HTTP ${statusCode}`
      try {
        const errObj = JSON.parse(data)
        lastError += `: ${errObj.error || errObj.message || data.slice(0, 200)}`
      } catch (_) {
        lastError += `: ${data.slice(0, 200)}`
      }

      if (statusCode === 401 || statusCode === 403) {
        break
      }
    }

    return { ok: false, error: '所有模型均不可用：' + lastError }
  } catch (e) {
    console.error('[GLM] 请求异常：', e)
    return { ok: false, error: 'GLM 请求异常：' + e.message }
  }
}
