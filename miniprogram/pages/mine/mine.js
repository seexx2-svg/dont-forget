// pages/mine/mine.js
// 我的页面：统计、设置、隐私锁、数据管理

const storage = require('../../utils/storage')
const reminder = require('../../utils/reminder')
const { CATEGORIES } = require('../../utils/constants')

Page({
  data: {
    stats: null,           // 统计数据
    categories: CATEGORIES, // 分类信息
    settings: {},          // 用户设置
    privacyLockEnabled: false,
    showPasswordModal: false,
    passwordInput: '',
    isSettingPassword: false, // true=正在设置密码, false=正在验证密码
    appVersion: '1.0.0'
  },

  onShow() {
    // 隐私锁拦截：未解锁则跳回首页（首页有密码弹窗）
    // 注意：开启隐私锁时当前会话已标记解锁，不会立即被拦截
    const app = getApp()
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    // 刷新提醒数据（自动滚动过期提醒到下一周期，确保统计准确）
    reminder.checkAndUpdateExpired()
    this.loadStats()
    this.loadSettings()
    this.loadPrivacyLock()
  },

  // ===== 加载统计数据 =====
  loadStats() {
    const stats = reminder.getStats()
    this.setData({ stats })
  },

  // ===== 加载设置 =====
  loadSettings() {
    const settings = storage.getSettings()
    this.setData({ settings })
  },

  // ===== 加载隐私锁状态 =====
  loadPrivacyLock() {
    const privacyLockEnabled = storage.getPrivacyLock()
    this.setData({ privacyLockEnabled })
  },

  // ===== 点击分类统计 → 跳转列表页对应分类 =====
  onCategoryTap(e) {
    const key = e.currentTarget.dataset.key
    const app = getApp()
    app.globalData.pendingCategory = key
    wx.switchTab({ url: '/pages/list/list' })
  },

  // ===== 通知开关 =====
  onNotifyChange(e) {
    const notifyEnabled = e.detail.value
    this.setData({ 'settings.notifyEnabled': notifyEnabled })
    storage.saveSettings({ notifyEnabled })
    wx.showToast({
      title: notifyEnabled ? '已开启通知' : '已关闭通知',
      icon: 'none'
    })
  },

  // ===== 提前通知开关 =====
  onAdvanceNotifyChange(e) {
    const advanceNotify = e.detail.value
    this.setData({ 'settings.advanceNotify': advanceNotify })
    storage.saveSettings({ advanceNotify })
  },

  // ===== 农历显示开关 =====
  onLunarCalendarChange(e) {
    const lunarCalendar = e.detail.value
    this.setData({ 'settings.lunarCalendar': lunarCalendar })
    storage.saveSettings({ lunarCalendar })
  },

  // ===== 隐私锁开关 =====
  onPrivacyLockChange(e) {
    const enabled = e.detail.value
    const app = getApp()
    if (enabled) {
      // 开启时弹出密码设置弹窗
      this.setData({
        privacyLockEnabled: true,
        showPasswordModal: true,
        isSettingPassword: true,
        passwordInput: ''
      })
    } else {
      // 关闭时直接关闭
      storage.setPrivacyLock(false)
      storage.setPrivacyPassword('')
      app.globalData.privacyUnlocked = true  // 已无锁，视为解锁
      this.setData({ privacyLockEnabled: false })
      wx.showToast({ title: '已关闭隐私锁', icon: 'success' })
    }
  },

  // ===== 显示设置密码弹窗 =====
  showSetPassword() {
    this.setData({
      showPasswordModal: true,
      isSettingPassword: true,
      passwordInput: ''
    })
  },

  // ===== 密码输入 =====
  onPasswordInput(e) {
    // 仅保留数字，限制4位
    let value = (e.detail.value || '').replace(/\D/g, '').slice(0, 4)
    this.setData({ passwordInput: value })
  },

  // ===== 确认密码 =====
  confirmPassword() {
    const { passwordInput, isSettingPassword } = this.data
    if (!/^\d{4}$/.test(passwordInput)) {
      wx.showToast({ title: '请输入4位数字密码', icon: 'none' })
      return
    }
    const app = getApp()
    if (isSettingPassword) {
      // 正在设置密码
      storage.setPrivacyPassword(passwordInput)
      storage.setPrivacyLock(true)
      app.globalData.privacyUnlocked = true  // 当前会话已解锁
      this.setData({
        showPasswordModal: false,
        passwordInput: '',
        privacyLockEnabled: true
      })
      wx.showToast({ title: '隐私锁已开启', icon: 'success' })
    } else {
      // 验证密码
      const saved = storage.getPrivacyPassword()
      if (passwordInput === saved) {
        storage.setPrivacyLock(true)
        app.globalData.privacyUnlocked = true
        this.setData({
          showPasswordModal: false,
          privacyLockEnabled: true,
          passwordInput: ''
        })
        wx.showToast({ title: '解锁成功', icon: 'success' })
      } else {
        wx.showToast({ title: '密码错误', icon: 'none' })
      }
    }
  },

  // ===== 取消密码输入 =====
  cancelPassword() {
    if (this.data.isSettingPassword) {
      // 设置密码时取消，回退隐私锁开关
      this.setData({
        showPasswordModal: false,
        passwordInput: '',
        privacyLockEnabled: false
      })
    } else {
      // 验证密码时取消
      this.setData({
        showPasswordModal: false,
        passwordInput: ''
      })
    }
  },

  // ===== 导出数据到剪贴板 =====
  onExportData() {
    const jsonStr = storage.exportData()
    wx.setClipboardData({
      data: jsonStr,
      success() {
        wx.showToast({ title: '数据已复制到剪贴板', icon: 'success' })
      }
    })
  },

  // ===== 从剪贴板导入数据 =====
  onImportData() {
    wx.showModal({
      title: '导入数据',
      content: '将从剪贴板导入数据，当前数据将被覆盖，是否继续？',
      confirmColor: '#4ECDC4',
      success: (res) => {
        if (res.confirm) {
          wx.getClipboardData({
            success: (clipRes) => {
              const ok = storage.importData(clipRes.data)
              if (ok) {
                this.loadStats()
                this.loadSettings()
                wx.showToast({ title: '导入成功', icon: 'success' })
              } else {
                wx.showToast({ title: '导入失败，数据格式错误', icon: 'none' })
              }
            }
          })
        }
      }
    })
  },

  // ===== 清空所有数据 =====
  onClearData() {
    wx.showModal({
      title: '清空数据',
      content: '将清空所有提醒和设置（含云端数据），且无法恢复，是否继续？',
      confirmColor: '#FF6B6B',
      confirmText: '清空',
      success: (res) => {
        if (res.confirm) {
          storage.saveReminders([])
          storage.resetSettings()
          storage.setPrivacyLock(false)
          storage.setPrivacyPassword('')
          // 异步清空云端记录（不阻塞 UI）
          storage.clearCloud()
          this.loadStats()
          this.loadSettings()
          this.loadPrivacyLock()
          wx.showToast({ title: '已清空所有数据', icon: 'success' })
        }
      }
    })
  },

  // ===== 关于 =====
  onAbout() {
    wx.showModal({
      title: '关于勿忘事项',
      content: '勿忘事项 v' + this.data.appVersion + '\n\n一款帮助你管理缴费、健康、证件、纪念日等提醒的小程序，支持分类管理、重复提醒、隐私锁等功能。',
      showCancel: false,
      confirmColor: '#4ECDC4',
      confirmText: '知道了'
    })
  },

  // ===== 分享小程序（由 button open-type="share" 触发） =====
  onShareApp() {
    // 由 button open-type="share" 触发，此处无需处理
  },

  // ===== 分享 =====
  onShareAppMessage() {
    return {
      title: '勿忘事项 - 不再错过每一个重要日子',
      path: '/pages/index/index'
    }
  }
})
