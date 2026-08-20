// utils/storage.js
// 本地存储优先 + 云数据库同步
// 设计原则：本地写入成功后异步同步到云端，云端失败不阻塞本地操作

const { STORAGE_KEYS } = require('./constants')

// ===== 云数据库集合名 =====
const CLOUD_COLLECTION = 'reminders'

// ===== 云数据库实例缓存 =====
let _db = null
function getCloudDb() {
  if (!wx.cloud) return null
  if (!_db) {
    try {
      _db = wx.cloud.database()
    } catch (e) {
      console.error('云数据库初始化失败:', e)
      return null
    }
  }
  return _db
}

// ===== 读取所有提醒 =====
function getReminders() {
  try {
    const data = wx.getStorageSync(STORAGE_KEYS.REMINDERS)
    return data || []
  } catch (e) {
    console.error('读取提醒失败:', e)
    return []
  }
}

// ===== 保存所有提醒（仅本地） =====
function saveReminders(reminders) {
  try {
    wx.setStorageSync(STORAGE_KEYS.REMINDERS, reminders)
    return true
  } catch (e) {
    console.error('保存提醒失败:', e)
    return false
  }
}

// ===== 添加单条提醒 =====
function addReminder(reminder) {
  const reminders = getReminders()
  const now = Date.now()
  const newReminder = {
    _id: 'r_' + now + '_' + Math.random().toString(36).slice(2, 8),
    ...reminder,
    done: false,
    createdAt: now,
    updatedAt: now
  }
  reminders.push(newReminder)
  if (!saveReminders(reminders)) throw new Error('本地存储写入失败')
  // 异步同步到云端（不阻塞本地操作）
  addReminderToCloud(newReminder)
  return newReminder
}

// ===== 更新提醒 =====
function updateReminder(id, updates) {
  const reminders = getReminders()
  const index = reminders.findIndex(item => item._id === id)
  if (index === -1) return null
  reminders[index] = {
    ...reminders[index],
    ...updates,
    updatedAt: Date.now()
  }
  if (!saveReminders(reminders)) throw new Error('本地存储写入失败')
  // 异步同步到云端
  updateReminderInCloud(id, reminders[index])
  return reminders[index]
}

// ===== 删除提醒 =====
function deleteReminder(id) {
  const reminders = getReminders()
  const filtered = reminders.filter(item => item._id !== id)
  saveReminders(filtered)
  // 异步同步到云端
  deleteReminderFromCloud(id)
  return true
}

// ===== 标记完成/未完成 =====
// 重复提醒：保持 done=true，并滚动到下个周期；UI 显示"已完成"直到下个周期到期
// 非重复提醒：单纯切换 done 状态
function toggleDone(id) {
  const reminders = getReminders()
  const index = reminders.findIndex(item => item._id === id)
  if (index === -1) return null
  const r = reminders[index]
  r.done = !r.done
  r.updatedAt = Date.now()
  // 如果是重复提醒被标记完成，滚动到下个周期（保持 done=true 状态）
  if (r.done && r.repeatType && r.repeatType !== 'none') {
    const { generateNextOccurrence } = require('./reminder')
    const next = generateNextOccurrence(r)
    if (next) {
      r.remindDate = next.remindDate
    }
  }
  saveReminders(reminders)
  // 异步同步到云端
  updateReminderInCloud(id, reminders[index])
  return reminders[index]
}

// ===== 读取设置 =====
function getSettings() {
  try {
    const data = wx.getStorageSync(STORAGE_KEYS.SETTINGS)
    return data || {
      notifyEnabled: true,
      advanceNotify: true,
      lunarCalendar: true
    }
  } catch (e) {
    return {}
  }
}

// ===== 保存设置（增量合并） =====
function saveSettings(settings) {
  try {
    const old = getSettings()
    wx.setStorageSync(STORAGE_KEYS.SETTINGS, { ...old, ...settings })
    return true
  } catch (e) {
    return false
  }
}

// ===== 重置设置回默认 =====
function resetSettings() {
  try {
    wx.setStorageSync(STORAGE_KEYS.SETTINGS, {
      notifyEnabled: true,
      advanceNotify: true,
      lunarCalendar: true
    })
  } catch (e) {
    console.error('重置设置失败:', e)
  }
}

// ===== 隐私锁 =====
function getPrivacyLock() {
  try {
    return wx.getStorageSync(STORAGE_KEYS.PRIVACY_LOCK) || false
  } catch (e) {
    return false
  }
}

function setPrivacyLock(enabled) {
  wx.setStorageSync(STORAGE_KEYS.PRIVACY_LOCK, enabled)
}

function getPrivacyPassword() {
  try {
    return wx.getStorageSync(STORAGE_KEYS.PRIVACY_PASSWORD) || ''
  } catch (e) {
    return ''
  }
}

function setPrivacyPassword(password) {
  wx.setStorageSync(STORAGE_KEYS.PRIVACY_PASSWORD, password)
}

// ===== 数据导出 =====
function exportData() {
  const reminders = getReminders()
  const settings = getSettings()
  return JSON.stringify({
    version: '1.0',
    exportDate: new Date().toISOString(),
    reminders,
    settings
  }, null, 2)
}

// ===== 数据导入 =====
function importData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    if (!data || !Array.isArray(data.reminders)) return false
    // 校验每条提醒的最小结构，过滤畸形数据
    const valid = data.reminders.filter(r => {
      return r && typeof r === 'object' &&
        typeof r.title === 'string' &&
        typeof r.remindDate === 'string' &&
        typeof r.category === 'string'
    })
    saveReminders(valid)
    // 导入后全量同步到云端（覆盖云端旧数据）
    syncAllToCloud()
    return true
  } catch (e) {
    console.error('导入数据失败:', e)
    return false
  }
}

// ============================================================
// ===== 云数据库同步函数（不阻塞本地操作） =====
// ============================================================

// ===== 单条插入云端 =====
// 云端记录会自动注入 _openid（仅创建者可读写），用于云函数 sendReminder 推送
// 用 localId 字段保存本地 _id，便于更新/删除时定位
function addReminderToCloud(reminder) {
  const db = getCloudDb()
  if (!db) return Promise.resolve(false)
  // 剥离本地 _id（云数据库会自动生成新的 _id）
  const { _id, ...rest } = reminder
  const doc = { ...rest, localId: _id }
  return db.collection(CLOUD_COLLECTION).add({ data: doc })
    .then(() => true)
    .catch(err => {
      console.warn('云端插入失败:', err)
      return false
    })
}

// ===== 单条更新云端 =====
function updateReminderInCloud(localId, updates) {
  const db = getCloudDb()
  if (!db) return Promise.resolve(false)
  // 剥离 _id 和 localId（这两个字段在云端不可变）
  const safeUpdates = { ...updates }
  delete safeUpdates._id
  delete safeUpdates.localId
  return db.collection(CLOUD_COLLECTION)
    .where({ localId })
    .update({ data: { ...safeUpdates, updatedAt: Date.now() } })
    .then(() => true)
    .catch(err => {
      console.warn('云端更新失败:', err)
      return false
    })
}

// ===== 单条删除云端 =====
function deleteReminderFromCloud(localId) {
  const db = getCloudDb()
  if (!db) return Promise.resolve(false)
  return db.collection(CLOUD_COLLECTION)
    .where({ localId })
    .remove()
    .then(() => true)
    .catch(err => {
      console.warn('云端删除失败:', err)
      return false
    })
}

// ===== 全量同步到云端（手动触发 / 导入后触发） =====
// 策略：先清空云端当前用户所有记录，再批量插入本地数据
// 注意：where({}).remove() 在「仅创建者可读写」权限下只删当前用户的记录
function syncAllToCloud() {
  const db = getCloudDb()
  if (!db) return Promise.resolve({ ok: false, error: '云能力不可用' })
  const reminders = getReminders()

  // 先清空云端当前用户的所有记录
  // where({}) 在小程序端会受权限过滤，只匹配当前用户
  return db.collection(CLOUD_COLLECTION).where({ localId: db.command.neq(null) }).remove()
    .then(() => {
      if (reminders.length === 0) return { ok: true, synced: 0 }
      // 批量插入（云数据库并发限制，20条以内并发安全）
      const tasks = reminders.map(r => {
        const { _id, ...rest } = r
        return db.collection(CLOUD_COLLECTION).add({ data: { ...rest, localId: _id } })
      })
      return Promise.all(tasks).then(() => ({ ok: true, synced: reminders.length }))
    })
    .catch(err => {
      console.error('全量同步失败:', err)
      return { ok: false, error: err.errMsg || err.message || '同步失败' }
    })
}

// ===== 从云端拉取（用于换设备/多端同步） =====
// 注意：会覆盖本地数据，调用前应提示用户
function pullFromCloud() {
  const db = getCloudDb()
  if (!db) return Promise.resolve(null)
  return db.collection(CLOUD_COLLECTION).get()
    .then(res => {
      const data = res.data || []
      // 恢复本地 _id（优先用 localId，没有则用云端 _id）
      const local = data.map(d => {
        const { _id, _openid, localId, ...rest } = d
        return { ...rest, _id: localId || _id }
      })
      saveReminders(local)
      return local
    })
    .catch(err => {
      console.error('云端拉取失败:', err)
      return null
    })
}

// ===== 清空云端当前用户所有记录 =====
function clearCloud() {
  const db = getCloudDb()
  if (!db) return Promise.resolve(false)
  return db.collection(CLOUD_COLLECTION).where({ localId: db.command.neq(null) }).remove()
    .then(() => true)
    .catch(err => {
      console.warn('云端清空失败:', err)
      return false
    })
}

// ===== 启动时自动对账本地与云端（app.js onLaunch 调用） =====
// 设计原则：用户无需关心本地/云端，全部自动处理
// - 云端有数据 → 拉取覆盖本地缓存（多端同步，例如换设备/重装）
// - 云端无数据但本地有 → 上传到云端（首次启用通知推送）
// - 两边都空 → 无操作
// 失败静默处理，不阻塞小程序启动
function syncCheck() {
  const db = getCloudDb()
  if (!db) return Promise.resolve(false)

  return db.collection(CLOUD_COLLECTION).count()
    .then(res => {
      const cloudTotal = (res && res.total) || 0
      const localTotal = getReminders().length

      if (cloudTotal > 0) {
        // 云端有数据 → 拉取覆盖本地缓存
        return pullFromCloud().then(data => {
          console.log('[syncCheck] 从云端同步', (data || []).length, '条提醒到本地缓存')
          return true
        })
      } else if (localTotal > 0) {
        // 云端为空但本地有数据 → 上传到云端
        return syncAllToCloud().then(result => {
          console.log('[syncCheck] 本地', result.synced || 0, '条提醒已上传到云端')
          return true
        })
      }
      // 两边都空
      return true
    })
    .catch(err => {
      console.warn('[syncCheck] 同步对账失败（不影响使用）:', err)
      return false
    })
}

module.exports = {
  getReminders,
  saveReminders,
  addReminder,
  updateReminder,
  deleteReminder,
  toggleDone,
  getSettings,
  saveSettings,
  resetSettings,
  getPrivacyLock,
  setPrivacyLock,
  getPrivacyPassword,
  setPrivacyPassword,
  exportData,
  importData,
  // 云端同步相关
  syncAllToCloud,
  pullFromCloud,
  clearCloud,
  syncCheck
}
