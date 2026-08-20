// pages/detail/detail.js - 提醒详情页
const reminder = require('../../utils/reminder')
const storage = require('../../utils/storage')
const subscribe = require('../../utils/subscribe')
const dateUtil = require('../../utils/date')
const { ADVANCE_DAYS_OPTIONS } = require('../../utils/constants')

Page({
  data: {
    id: null,
    reminder: null,
    isLoading: true,
    countdownText: '',
    countdownSub: '',
    advanceLabel: '',
    createdDate: '',
    needSubscribe: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id })
    }
  },

  onShow() {
    if (this.data.id) {
      this.loadData()
    }
  },

  onUnload() {
    // 恢复默认导航栏颜色（避免污染其他页面）
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#FFFFFF'
    })
  },

  // 加载提醒详情数据
  loadData() {
    const reminders = storage.getReminders()
    const raw = reminders.find(item => item._id === this.data.id)
    if (!raw) {
      wx.showToast({ title: '提醒不存在', icon: 'none' })
      this.setData({ isLoading: false })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }

    // 用 decorateReminder 装饰
    const decorated = reminder.decorateReminder(raw)

    // 倒计时文案
    let countdownText = ''
    let countdownSub = ''
    if (decorated.done) {
      countdownText = '已完成'
      countdownSub = '点击下方按钮可重新开启'
    } else if (decorated.daysLeft === 0) {
      countdownText = '今天'
      countdownSub = '就是今天'
    } else if (decorated.daysLeft > 0) {
      countdownText = '还有' + decorated.daysLeft + '天'
      // 重复提醒显示模糊规则，非重复显示友好日期
      countdownSub = decorated.fuzzyDateDesc || decorated.friendlyDate
    } else {
      countdownText = '已逾期'
      countdownSub = '已逾期 ' + Math.abs(decorated.daysLeft) + ' 天'
    }

    // 提前提醒标签
    const advanceItem = ADVANCE_DAYS_OPTIONS.find(o => o.value === decorated.advanceDays)
    const advanceLabel = advanceItem ? advanceItem.label : '当天'

    // 创建时间
    let createdDate = ''
    if (decorated.createdAt) {
      const d = new Date(decorated.createdAt)
      createdDate = dateUtil.formatDate(d) + ' ' + dateUtil.formatTime(d)
    }

    // 是否需要订阅推送：始终显示按钮（方便用户随时续期/重试）
    const needSubscribe = true

    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: decorated.categoryColor || '#4ECDC4'
    })

    this.setData({
      reminder: decorated,
      isLoading: false,
      countdownText,
      countdownSub,
      advanceLabel,
      createdDate,
      needSubscribe
    })

    // ===== 自动攒配额（用户查看详情 = 用户手势） =====
    // 首次弹引导框，之后静默 +1（已勾"总是保持"则无感）
    if (!decorated.done) {
      subscribe.autoRenew(decorated.category).then((accepted) => {
        if (accepted) {
          this.setData({ needSubscribe: false })
        }
      })
    }
  },

  onEdit() {
    wx.navigateTo({ url: '/pages/add/add?id=' + this.data.id })
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个提醒吗？',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (res.confirm) {
          storage.deleteReminder(this.data.id)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        }
      }
    })
  },

  onToggleDone() {
    storage.toggleDone(this.data.id)
    // 标记完成后自动攒配额
    if (this.data.reminder && !this.data.reminder.done) {
      subscribe.autoRenew(this.data.reminder.category)
      // 立即触发云端推送
      setTimeout(() => {
        const app = getApp()
        if (typeof app.triggerCloudPush === 'function') {
          app.triggerCloudPush()
        }
      }, 300)
    }
    this.loadData()
  },

  onSubscribe() {
    if (!this.data.reminder) {
      console.warn('[onSubscribe] reminder 为空')
      return
    }
    const category = this.data.reminder.category

    // autoRenew：首次弹引导框，之后静默 +1
    subscribe.autoRenew(category).then((ok) => {
      if (ok) {
        this.setData({ needSubscribe: false })
      } else {
        // 授权失败也显示按钮，方便重试
        wx.showToast({ title: '授权未成功，可重试', icon: 'none' })
      }
    }).catch((err) => {
      wx.hideLoading()
      console.error('[onSubscribe] 异常:', err)
      wx.showToast({ title: '授权异常: ' + (err.errMsg || err.message || ''), icon: 'none', duration: 3000 })
    })
  }
})
