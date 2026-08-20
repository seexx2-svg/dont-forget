// js/storage.js
// 存储操作（改用 localStorage，wx.* 已由 mock-wx.js 提供）
(function () {
  const { STORAGE_KEYS } = window.constants

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

  // ===== 保存所有提醒 =====
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
    const newReminder = Object.assign({
      _id: 'r_' + now + '_' + Math.random().toString(36).slice(2, 8),
      done: false,
      createdAt: now,
      updatedAt: now
    }, reminder)
    reminders.push(newReminder)
    if (!saveReminders(reminders)) throw new Error('本地存储写入失败')
    return newReminder
  }

  // ===== 更新提醒 =====
  function updateReminder(id, updates) {
    const reminders = getReminders()
    const index = reminders.findIndex(function (item) { return item._id === id })
    if (index === -1) return null
    reminders[index] = Object.assign({}, reminders[index], updates, { updatedAt: Date.now() })
    if (!saveReminders(reminders)) throw new Error('本地存储写入失败')
    return reminders[index]
  }

  // ===== 删除提醒 =====
  function deleteReminder(id) {
    const reminders = getReminders()
    const filtered = reminders.filter(function (item) { return item._id !== id })
    saveReminders(filtered)
    return true
  }

  // ===== 标记完成/未完成 =====
  // 重复提醒：保持 done=true，并滚动到下个周期；UI 显示"已完成"直到下个周期到期
  function toggleDone(id) {
    const reminders = getReminders()
    const index = reminders.findIndex(function (item) { return item._id === id })
    if (index === -1) return null
    var r = reminders[index]
    r.done = !r.done
    r.updatedAt = Date.now()
    // 如果是重复提醒被标记完成，滚动到下个周期（保持 done=true 状态）
    if (r.done && r.repeatType && r.repeatType !== 'none') {
      const next = window.reminder.generateNextOccurrence(r)
      if (next) {
        r.remindDate = next.remindDate
      }
    }
    saveReminders(reminders)
    return reminders[index]
  }

  // ===== 设置 =====
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

  function saveSettings(settings) {
    try {
      const old = getSettings()
      wx.setStorageSync(STORAGE_KEYS.SETTINGS, Object.assign({}, old, settings))
      return true
    } catch (e) {
      return false
    }
  }

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
      reminders: reminders,
      settings: settings
    }, null, 2)
  }

  // ===== 数据导入 =====
  function importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr)
      if (!data || !Array.isArray(data.reminders)) return false
      // 校验每条提醒的最小结构，过滤畸形数据
      const valid = data.reminders.filter(function (r) {
        return r && typeof r === 'object' &&
          typeof r.title === 'string' &&
          typeof r.remindDate === 'string' &&
          typeof r.category === 'string'
      })
      saveReminders(valid)
      if (data.settings && typeof data.settings === 'object') {
        saveSettings(data.settings)
      }
      return true
    } catch (e) {
      console.error('导入数据失败:', e)
      return false
    }
  }

  window.storage = {
    getReminders: getReminders,
    saveReminders: saveReminders,
    addReminder: addReminder,
    updateReminder: updateReminder,
    deleteReminder: deleteReminder,
    toggleDone: toggleDone,
    getSettings: getSettings,
    saveSettings: saveSettings,
    resetSettings: resetSettings,
    getPrivacyLock: getPrivacyLock,
    setPrivacyLock: setPrivacyLock,
    getPrivacyPassword: getPrivacyPassword,
    setPrivacyPassword: setPrivacyPassword,
    exportData: exportData,
    importData: importData
  }
})()
