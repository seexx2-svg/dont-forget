// utils/subscribe.js
// 订阅消息配额管理
//
// 核心策略：攒配额
// 1. 首次使用：弹自己的引导框 → 用户点"开启" → 调 wx.requestSubscribeMessage → 弹微信授权框
//    用户勾选「总是保持以上选择」后，后续调用不再弹任何框
// 2. 之后每次用户操作（打开首页/保存提醒/标记完成/点🔔）：
//    自动调 wx.requestSubscribeMessage，静默 +1 配额
//    - 已勾「总是保持」：完全无感，静默 +1
//    - 未勾「总是保持」：会弹微信授权框（用户自行选择）
// 3. 定时触发器推送时消耗配额，配额用完 → 43101 错误
//
// 注意：wx.requestSubscribeMessage 必须在用户手势（tap）中调用
//    → 在 onShow 等非手势场景不能直接调，需要延迟到用户首次点击时

const { SUBSCRIBE_TEMPLATE_IDS, STORAGE_KEYS } = require('./constants')
const dateUtil = require('./date')

// ===== 检测模板ID是否为占位符 =====
function isPlaceholderTemplate(id) {
  return !id || id.indexOf('template_id_') === 0
}

// ===== 获取模板ID =====
function getTemplateId(category) {
  const id = SUBSCRIBE_TEMPLATE_IDS[category] || SUBSCRIBE_TEMPLATE_IDS.default
  return id
}

// ===== 记录一次订阅（配额 +1） =====
function recordSubscribe(category) {
  try {
    const key = 'subscribe_count_' + category
    const count = wx.getStorageSync(key) || 0
    wx.setStorageSync(key, count + 1)
    wx.setStorageSync(STORAGE_KEYS.LAST_SUBSCRIBE_DATE, dateUtil.today())
    // 同时记录到全局默认分类
    const defaultKey = 'subscribe_count_default'
    const defaultCount = wx.getStorageSync(defaultKey) || 0
    wx.setStorageSync(defaultKey, defaultCount + 1)
    console.log('[subscribe] 配额+1, 当前:', category, count + 1, 'default:', defaultCount + 1)
  } catch (e) {
    console.warn('[subscribe] 记录失败:', e)
  }
}

// ===== 消费一次订阅额度（推送成功后调用） =====
function consumeSubscribe(category) {
  try {
    const key = 'subscribe_count_' + category
    const count = wx.getStorageSync(key) || 0
    if (count > 0) wx.setStorageSync(key, count - 1)

    const defaultKey = 'subscribe_count_default'
    const defaultCount = wx.getStorageSync(defaultKey) || 0
    if (defaultCount > 0) wx.setStorageSync(defaultKey, defaultCount - 1)
    console.log('[subscribe] 配额-1, 剩余:', category, Math.max(0, count - 1))
  } catch (e) {}
}

// ===== 获取剩余订阅次数 =====
function getSubscribeCount(category) {
  try {
    const key = 'subscribe_count_' + category
    const count = wx.getStorageSync(key) || 0
    const defaultCount = wx.getStorageSync('subscribe_count_default') || 0
    return Math.max(count, defaultCount)
  } catch (e) {
    return 0
  }
}

// ===== 判断是否首次授权（无历史记录） =====
function isFirstTime() {
  try {
    const defaultCount = wx.getStorageSync('subscribe_count_default') || 0
    const lastDate = wx.getStorageSync(STORAGE_KEYS.LAST_SUBSCRIBE_DATE)
    return defaultCount === 0 && !lastDate
  } catch (e) {
    return true
  }
}

// ===== 核心方法：自动攒配额 =====
// 在用户手势（tap）中调用，首次会弹引导框，之后静默 +1
// 参数：
//   category: 分类名
// 返回：Promise<boolean> 是否成功 +1
function autoRenew(category) {
  const templateId = getTemplateId(category)
  if (isPlaceholderTemplate(templateId)) {
    console.warn('[subscribe] 模板ID未配置:', category)
    return Promise.resolve(false)
  }

  // 首次使用：弹引导框 → 用户点"开启" → 调微信授权
  if (isFirstTime()) {
    return guideFirstTime(category)
  }

  // 非首次：直接调微信授权（已勾"总是保持"则不弹框，静默 +1）
  return silentRenew(category)
}

// ===== 首次引导授权 =====
function guideFirstTime(category) {
  const templateId = getTemplateId(category)
  return new Promise((resolve) => {
    wx.showModal({
      title: '开启提醒推送',
      content: '为了在提醒时间到时能收到微信通知，需要您授权一次。\n\n建议勾选「总是保持以上选择」，之后会自动续期，不再弹框。',
      confirmText: '开启',
      cancelText: '以后再说',
      cancelColor: '#999',
      success: (res) => {
        if (!res.confirm) {
          resolve(false)
          return
        }
        // 用户点了"开启"，调微信授权框
        wx.requestSubscribeMessage({
          tmplIds: [templateId],
          success(r) {
            const accepted = r[templateId] === 'accept'
            if (accepted) {
              recordSubscribe(category)
              wx.showToast({ title: '推送已开启', icon: 'success' })
            }
            resolve(accepted)
          },
          fail(err) {
            console.warn('[subscribe] 首次授权失败:', err)
            wx.showToast({ title: '授权未成功', icon: 'none' })
            resolve(false)
          }
        })
      }
    })
  })
}

// ===== 静默续期 =====
// 直接调 wx.requestSubscribeMessage
// 已勾「总是保持以上选择」→ 不弹框，静默 +1
// 未勾 → 会弹微信授权框（用户自行选择）
function silentRenew(category) {
  const templateId = getTemplateId(category)
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success(r) {
        const accepted = r[templateId] === 'accept'
        if (accepted) {
          recordSubscribe(category)
        }
        resolve(accepted)
      },
      fail(err) {
        // 20016: 已订阅过的模板频率过高 / 频率限制
        const msg = err.errMsg || ''
        if (msg.indexOf('20016') >= 0 || msg.indexOf('frequency') >= 0) {
          console.log('[subscribe] 频率限制，稍后重试')
        } else {
          console.warn('[subscribe] 静默续期失败:', err)
        }
        resolve(false)
      }
    })
  })
}

// ===== 兼容旧接口 =====
function guideSubscribe(category) {
  if (isFirstTime()) {
    return guideFirstTime(category)
  }
  return silentRenew(category)
}

module.exports = {
  autoRenew,
  silentRenew,
  guideSubscribe,
  recordSubscribe,
  consumeSubscribe,
  getSubscribeCount,
  isFirstTime
}
