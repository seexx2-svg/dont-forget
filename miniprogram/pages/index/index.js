// pages/index/index.js
// 首页：今日 / 即将到期 / 已逾期 提醒概览

const reminder = require('../../utils/reminder')
const storage = require('../../utils/storage')
const dateUtil = require('../../utils/date')

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

Page({
  data: {
    todayList: [],
    upcomingList: [],
    overdueList: [],
    stats: {},
    activeTab: 'today',
    displayDate: '',
    showLockModal: false,     // 隐私锁拦截弹窗
    lockPasswordInput: '',
    // 日历
    calendarMarkedDays: [],   // 当月有提醒的日期
    calendarSelectedDate: ''  // 选中日期 YYYY-MM-DD
  },

  onLoad() {
    reminder.checkAndUpdateExpired()
    const now = new Date()
    this.setData({
      displayDate: `${now.getMonth() + 1}月${now.getDate()}日 ${WEEK_DAYS[now.getDay()]}`
    })
  },

  onShow() {
    // 隐私锁拦截：开启且未解锁时弹出密码窗，不加载敏感数据
    const app = getApp()
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      this.setData({ showLockModal: true, lockPasswordInput: '' })
      return
    }
    this.setData({ showLockModal: false })
    // 处理跨页传递的 tab 切换
    if (app.globalData.pendingTab) {
      this.setData({ activeTab: app.globalData.pendingTab })
      app.globalData.pendingTab = ''
    }
    this.loadData()
    // 首页加载完毕后再次触发今日提醒（与 app.onShow 形成双重保险）
    // 用 setTimeout 避免与全局的弹框冲突
    setTimeout(() => {
      if (typeof app.checkTodayReminders === 'function') {
        app.checkTodayReminders()
      }
    }, 1500)
  },

  // ===== 隐私锁密码输入 =====
  onLockInput(e) {
    const value = (e.detail.value || '').replace(/\D/g, '').slice(0, 4)
    this.setData({ lockPasswordInput: value })
  },

  onLockConfirm() {
    const input = this.data.lockPasswordInput
    if (!/^\d{4}$/.test(input)) {
      wx.showToast({ title: '请输入4位数字密码', icon: 'none' })
      return
    }
    const saved = storage.getPrivacyPassword()
    if (input === saved) {
      const app = getApp()
      app.globalData.privacyUnlocked = true
      this.setData({ showLockModal: false, lockPasswordInput: '' })
      this.loadData()
      wx.showToast({ title: '已解锁', icon: 'success' })
    } else {
      wx.showToast({ title: '密码错误', icon: 'none' })
      this.setData({ lockPasswordInput: '' })
    }
  },

  onPullDownRefresh() {
    reminder.checkAndUpdateExpired()
    this.loadData()
    wx.stopPullDownRefresh()
  },

  // 加载今日 / 即将 / 逾期 + 统计 + 日历数据
  loadData() {
    const todayList = reminder.getTodayReminders()
    const upcomingList = reminder.getUpcomingReminders(7)
    const overdueList = reminder.getOverdueReminders()
    const stats = reminder.getStats()

    // 计算日历标记：当月有提醒的日期
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const todayStr = dateUtil.formatDate(now)
    const markedDays = []
    const allReminders = reminder.getAllReminders()
    allReminders.forEach(r => {
      if (r.remindDate && !r.done) {
        const parts = r.remindDate.split('-')
        if (parts.length === 3) {
          const rYear = parseInt(parts[0])
          const rMonth = parseInt(parts[1]) - 1
          const rDay = parseInt(parts[2])
          if (rYear === year && rMonth === month) {
            if (markedDays.indexOf(rDay) < 0) markedDays.push(rDay)
          }
        }
      }
    })

    this.setData({
      todayList,
      upcomingList,
      overdueList,
      stats,
      calendarMarkedDays: markedDays,
      calendarSelectedDate: todayStr
    })
  },

  // 切换 Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
  },

  // 日历：选中日期
  onCalendarSelect(e) {
    const date = e.detail.date
    this.setData({ calendarSelectedDate: date })
    // 如果选中的日期有提醒，切换到对应列表
    const allReminders = reminder.getAllReminders()
    const dayReminders = allReminders.filter(r => r.remindDate === date && !r.done)
    if (dayReminders.length > 0) {
      // 如果是今天，切到today；未来切到upcoming
      const todayStr = dateUtil.formatDate(new Date())
      if (date === todayStr) {
        this.setData({ activeTab: 'today' })
      } else {
        this.setData({ activeTab: 'upcoming' })
      }
    }
  },

  // 日历：切换月份时重新计算标记
  onCalendarMonthChange(e) {
    const { year, month } = e.detail
    const markedDays = []
    const allReminders = reminder.getAllReminders()
    allReminders.forEach(r => {
      if (r.remindDate && !r.done) {
        const parts = r.remindDate.split('-')
        if (parts.length === 3) {
          const rYear = parseInt(parts[0])
          const rMonth = parseInt(parts[1]) - 1
          const rDay = parseInt(parts[2])
          if (rYear === year && rMonth === month) {
            if (markedDays.indexOf(rDay) < 0) markedDays.push(rDay)
          }
        }
      }
    })
    this.setData({ calendarMarkedDays: markedDays })
  },

  // 点击提醒卡片 → 跳转详情
  onReminderTap(e) {
    const id = e.detail.id
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  // 切换完成状态
  onReminderDone(e) {
    const id = e.detail.id
    storage.toggleDone(id)

    // 用户手势 → 自动攒配额（已勾"总是保持"则无感）
    const subscribe = require('../../utils/subscribe')
    const reminders = storage.getReminders() || []
    const category = (reminders[0] && reminders[0].category) || 'default'
    subscribe.autoRenew(category)

    // 标记完成后触发云端推送
    setTimeout(() => {
      const app = getApp()
      if (typeof app.triggerCloudPush === 'function') {
        app.triggerCloudPush()
      }
    }, 300)
    this.loadData()
  },

  // ===== 点击 🔔 按钮：攒配额 + 立即触发推送 =====
  onToggleNotify() {
    const subscribe = require('../../utils/subscribe')
    const reminders = storage.getReminders() || []
    const category = (reminders[0] && reminders[0].category) || 'default'

    // autoRenew：首次弹引导框，之后静默 +1
    subscribe.autoRenew(category).then((accepted) => {
      const app = getApp()
      if (typeof app.triggerCloudPush === 'function') {
        app.triggerCloudPush(true)
      }
      if (accepted && !subscribe.isFirstTime()) {
        wx.showToast({ title: '已+1配额', icon: 'none' })
      }
    })
  },

  // 跳转添加页（add 非 tab 页，用 navigateTo）
  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  // 阻止隐私锁弹窗触摸穿透
  noop() {}
})
