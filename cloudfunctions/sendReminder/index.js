// cloudfunctions/sendReminder/index.js
// 提醒订阅消息推送云函数
// 使用 AppSecret 获取 access_token，直接 HTTPS 调用微信 API

const cloud = require('wx-server-sdk')
const https = require('https')

// 从本地 config.json 读取配置（已被 .gitignore 忽略）
var config = {}
try { config = require('./config.json') } catch(e) {}

var APPID = config.APPID || process.env.APPID || ''
var ENV = config.ENV || cloud.DYNAMIC_CURRENT_ENV
var TEMPLATE_ID = config.TEMPLATE_ID || ''
var MINIPROGRAM_STATE = config.MINIPROGRAM_STATE || 'trial'

cloud.init({
  env: ENV,
  throwOnNotFound: false
})

const db = cloud.database()
const _ = db.command

// ===== HTTPS GET =====
function httpsGet(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      var data = ''
      res.on('data', function(chunk) { data += chunk })
      res.on('end', function() {
        try { resolve(JSON.parse(data)) }
        catch (e) { resolve({ raw: data }) }
      })
    }).on('error', reject)
  })
}

// ===== HTTPS POST =====
function httpsPost(url, postData) {
  return new Promise(function(resolve, reject) {
    var postDataStr = JSON.stringify(postData)
    var urlObj = new URL(url)
    var options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postDataStr)
      }
    }
    var req = https.request(options, function(res) {
      var data = ''
      res.on('data', function(chunk) { data += chunk })
      res.on('end', function() {
        try { resolve(JSON.parse(data)) }
        catch (e) { resolve({ raw: data }) }
      })
    })
    req.on('error', reject)
    req.write(postDataStr)
    req.end()
  })
}

// ===== access_token 缓存 =====
var tokenCache = { token: '', expire: 0 }

async function getAccessToken(appSecret) {
  var now = Date.now()
  if (tokenCache.token && now < tokenCache.expire) {
    return tokenCache.token
  }

  var url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + APPID + '&secret=' + appSecret
  console.log('[token] fetching from wechat...')

  try {
    var res = await httpsGet(url)
    if (res.access_token) {
      tokenCache.token = res.access_token
      tokenCache.expire = now + (res.expires_in - 300) * 1000  // 提前5分钟过期
      console.log('[token] OK, expires_in:', res.expires_in)
      return res.access_token
    } else {
      console.error('[token] failed:', JSON.stringify(res))
      throw new Error('Token获取失败: ' + (res.errmsg || JSON.stringify(res)))
    }
  } catch (e) {
    console.error('[token] error:', e.message)
    throw e
  }
}

function truncate(s, n) {
  if (s == null) return ''
  return String(s).slice(0, n)
}

function getBeijingNow() {
  var now = new Date()
  return new Date(now.getTime() + 8 * 3600 * 1000)
}

function formatDate(d) {
  var y = d.getUTCFullYear()
  var m = String(d.getUTCMonth() + 1).padStart(2, '0')
  var day = String(d.getUTCDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function formatHHMM(d) {
  var h = String(d.getUTCHours()).padStart(2, '0')
  var m = String(d.getUTCMinutes()).padStart(2, '0')
  return h + ':' + m
}

function parseTimeToMin(t) {
  if (!t || typeof t !== 'string') return -1
  var parts = t.split(':')
  if (parts.length < 2) return -1
  var h = parseInt(parts[0], 10)
  var m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m)) return -1
  return h * 60 + m
}

function buildPayload(r, targetOpenid) {
  var categoryLabel = r.categoryLabel || r.category || '提醒'
  var subTypeLabel = r.subTypeLabel || ''
  var thing2Value = subTypeLabel ? (categoryLabel + '-' + subTypeLabel) : categoryLabel
  var thing60Value = r.title || '日程提醒'
  var date4Value = r.remindDate + ' ' + (r.remindTime || '09:00') + ':00'

  return {
    touser: targetOpenid,
    page: 'pages/index/index',
    lang: 'zh_CN',
    miniprogramState: MINIPROGRAM_STATE,
    template_id: TEMPLATE_ID,
    data: {
      thing2: { value: truncate(thing2Value, 20) },
      thing60: { value: truncate(thing60Value, 20) },
      date4: { value: date4Value }
    }
  }
}

// ===== 发送订阅消息（直接调微信 API）=====
async function sendSubscribeMessageDirect(token, payload) {
  var url = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + token
  console.log('[send] posting to wechat, touser:', payload.touser)

  try {
    var res = await httpsPost(url, payload)
    console.log('[send] wechat response:', JSON.stringify(res))

    if (res.errcode === 0) {
      return { ok: true, msgid: res.msgid }
    }

    var errMap = {
      43101: '用户未授权或配额已用完',
      40037: '模板ID无效',
      47003: '模板字段不匹配',
      40003: 'OpenID无效',
      41028: 'form_id不正确或已过期',
      45064: '需要POST请求',
      48001: 'API无权限',
      40165: '订阅信息不存在'
    }

    return {
      ok: false,
      errCode: res.errcode,
      errMsg: res.errmsg,
      hint: errMap[res.errcode] || '微信返回错误'
    }
  } catch (e) {
    return { ok: false, errMsg: e.message }
  }
}

exports.main = async (event, context) => {
  var wxContext = cloud.getWXContext()
  var OPENID = wxContext.OPENID || wxContext.openid || ''

  console.log('[sendReminder] ===== start =====')
  console.log('[sendReminder] OPENID:', OPENID || '(empty, timer)')

  var bjNow = getBeijingNow()
  var today = formatDate(bjNow)
  var nowTime = formatHHMM(bjNow)
  var nowMin = parseTimeToMin(nowTime)

  // 判断触发方式：
  // - 定时器触发时 event 可能是 {} 或包含 timer 相关字段
  // - 手动触发时 event 包含 action 或 date 字段
  var isTimerTrigger = false
  var eventKeys = Object.keys(event || {})
  // 如果没有有效参数，或者只有 timer 相关的字段，就是定时器
  if (eventKeys.length === 0 || (!event.action && !event.date && !event.time)) {
    isTimerTrigger = true
  }
  // 额外检查：如果 OPENID 为空，也很可能是定时器
  if (!OPENID && eventKeys.length <= 2) {
    isTimerTrigger = true
  }

  console.log('[sendReminder] time:', today, nowTime, 'trigger:', isTimerTrigger ? 'timer' : 'manual', 'eventKeys:', JSON.stringify(eventKeys))

  // AppSecret：优先从环境变量读取，其次从本地 config.json 读取
  // config.json 已被 .gitignore 忽略，不会上传 GitHub
  var appSecret = process.env.APP_SECRET || config.APP_SECRET || ''

  // ===== heartbeat =====
  try {
    var hbData = {
      trigger: isTimerTrigger ? 'timer' : 'manual',
      date: today,
      time: nowTime,
      ts: Date.now()
    }
    console.log('[heartbeat] saving:', JSON.stringify(hbData))
    await db.collection('reminder_heartbeat').add({ data: hbData })
    console.log('[heartbeat] saved OK')
  } catch (e) {
    console.error('[heartbeat] failed:', e.message)
    // 集合不存在时自动创建（通过直接写入触发创建）
    try {
      // 使用 raw 方式尝试
      await db.collection('reminder_heartbeat').add({
        data: { trigger: 'init', date: today, time: nowTime, ts: Date.now() }
      })
      console.log('[heartbeat] init record saved')
    } catch (e2) {
      console.error('[heartbeat] init also failed:', e2.message)
    }
  }

  try {
    // ===== diagnose =====
    if (event && event.action === 'diagnose') {
      var countResult = await db.collection('reminders')
        .where({ remindDate: today, done: _.neq(true) })
        .count()

      var sampleResult = await db.collection('reminders')
        .where({ remindDate: today, done: _.neq(true) })
        .limit(1)
        .get()

      var heartbeats = []
      try {
        var hbResult = await db.collection('reminder_heartbeat')
          .orderBy('ts', 'desc')
          .limit(5)
          .get()
        heartbeats = hbResult.data || []
      } catch (e) {}

      var sample = sampleResult.data && sampleResult.data[0]
      var hbTip = 'No heartbeat yet'
      if (heartbeats.length > 0) {
        hbTip = 'Last: ' + heartbeats[0].trigger + ' at ' + heartbeats[0].date + ' ' + heartbeats[0].time
      }

      // 测试 token
      var tokenStatus = 'not tested'
      if (appSecret) {
        try {
          var tk = await getAccessToken(appSecret)
          tokenStatus = 'OK, token length=' + tk.length
        } catch (e) {
          tokenStatus = 'FAIL: ' + e.message
        }
      } else {
        tokenStatus = 'No AppSecret configured'
      }

      return {
        ok: true,
        mode: 'diagnose',
        time: today + ' ' + nowTime,
        todayReminders: countResult.total,
        sample: sample ? {
          title: sample.title,
          remindTime: sample.remindTime,
          openid: sample._openid ? 'yes' : 'no'
        } : null,
        heartbeatTip: hbTip,
        appSecretConfigured: !!appSecret,
        tokenStatus: tokenStatus
      }
    }

    // ===== test_push =====
    if (event && event.action === 'test_push') {
      var targetTime = event.time || nowTime
      var records = await db.collection('reminders')
        .where({ remindDate: today, remindTime: targetTime, done: _.neq(true) })
        .get()

      if (!records.data || records.data.length === 0) {
        return { ok: false, message: 'No matching reminder', today: today, targetTime: targetTime }
      }

      var r = records.data[0]
      var targetOpenid = r._openid
      if (!targetOpenid) {
        return { ok: false, message: 'No _openid in record' }
      }

      // 获取 token
      if (!appSecret) {
        return { ok: false, hint: 'AppSecret 未配置，无法获取 access_token' }
      }

      var token = await getAccessToken(appSecret)
      var payload = buildPayload(r, targetOpenid)
      var sendRes = await sendSubscribeMessageDirect(token, payload)

      return sendRes
    }

    // ===== normal flow =====
    var allRecords = []
    var pageNum = 0
    var pageSize = 100

    while (true) {
      var pageResult = await db.collection('reminders')
        .where({ remindDate: today, done: _.neq(true) })
        .skip(pageNum * pageSize)
        .limit(pageSize)
        .get()
      allRecords = allRecords.concat(pageResult.data || [])
      if (!pageResult.data || pageResult.data.length < pageSize) break
      pageNum++
    }

    console.log('[sendReminder] candidates:', allRecords.length)

    var WINDOW_MIN = 5
    var toSend = allRecords.filter(function(r) {
      if (r.lastPushedDate === today) {
        var rtMin = parseTimeToMin(r.remindTime || '09:00')
        if (rtMin >= 0 && rtMin <= nowMin) return false
      }
      var rtMin2 = parseTimeToMin(r.remindTime || '09:00')
      if (rtMin2 < 0) return false
      if (isTimerTrigger) {
        var diff = Math.abs(rtMin2 - nowMin)
        if (diff > WINDOW_MIN) return false
      }
      return true
    })

    console.log('[sendReminder] toSend:', toSend.length)

    // 获取 token（一次获取，复用给多条推送）
    if (!appSecret && toSend.length > 0) {
      return { ok: false, error: 'AppSecret 未配置' }
    }
    var token = ''
    if (toSend.length > 0) {
      token = await getAccessToken(appSecret)
    }

    var success = 0
    var fail = 0
    var details = []

    for (var i = 0; i < toSend.length; i++) {
      var r = toSend[i]
      var recordId = r.localId || r._id || 'unknown'
      var targetOpenid = r._openid

      if (!targetOpenid) {
        details.push({ id: recordId, ok: false, reason: 'NO_OPENID' })
        fail++
        continue
      }

      var payload = buildPayload(r, targetOpenid)
      var sendRes = await sendSubscribeMessageDirect(token, payload)

      if (sendRes.ok) {
        success++
        details.push({ id: recordId, ok: true })
        console.log('[sendReminder] OK:', recordId)

        var rtMin3 = parseTimeToMin(r.remindTime || '09:00')
        if (rtMin3 > 0 && rtMin3 <= nowMin) {
          try {
            await db.collection('reminders').doc(r._id).update({
              data: { lastPushedDate: today }
            })
          } catch (e) {}
        }
      } else {
        fail++
        details.push({ id: recordId, ok: false, errCode: sendRes.errCode, hint: sendRes.hint })
        console.error('[sendReminder] FAIL:', recordId, sendRes.errCode, sendRes.hint)
      }
    }

    return {
      ok: true,
      data: { total: toSend.length, success: success, fail: fail, date: today, time: nowTime, trigger: isTimerTrigger ? 'timer' : 'manual', details: details }
    }
  } catch (err) {
    console.error('[sendReminder] error:', err)
    return { ok: false, error: err.message || String(err) }
  }
}
