// pages/list/list.js
// 提醒列表页：按分类筛选 + 搜索

const reminder = require('../../utils/reminder')
const storage = require('../../utils/storage')
const { CATEGORIES } = require('../../utils/constants')

Page({
  data: {
    list: [],
    doneList: [],
    activeCategory: 'all',
    keyword: '',
    showSearch: false,
    categories: []
  },

  onLoad() {
    // 组装分类标签数据（含"全部"）
    const categories = [
      { value: 'all', label: '全部', icon: '📋', color: '#4ECDC4', bg: '#E8F8F7' }
    ]
    Object.keys(CATEGORIES).forEach(key => {
      categories.push({
        value: key,
        label: CATEGORIES[key].name,
        icon: CATEGORIES[key].icon,
        color: CATEGORIES[key].color,
        bg: CATEGORIES[key].bg
      })
    })
    this.setData({ categories })
    this.loadData()
  },

  onShow() {
    // 隐私锁拦截：未解锁则跳回首页（首页有密码弹窗）
    const app = getApp()
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    // 处理跨页传递的分类筛选（来自"我的"页点击分类统计）
    if (app.globalData && app.globalData.pendingCategory) {
      this.setData({ activeCategory: app.globalData.pendingCategory, keyword: '' })
      app.globalData.pendingCategory = ''
    }
    this.loadData()
  },

  onPullDownRefresh() {
    reminder.checkAndUpdateExpired()
    this.loadData()
    wx.stopPullDownRefresh()
  },

  // 加载数据：搜索优先于分类筛选
  loadData() {
    let all
    if (this.data.keyword) {
      all = reminder.search(this.data.keyword)
    } else {
      all = reminder.getByCategory(this.data.activeCategory)
    }
    const list = all.filter(r => !r.done)
    const doneList = all.filter(r => r.done)
    this.setData({ list, doneList })
  },

  // 切换分类
  switchCategory(e) {
    const category = e.currentTarget.dataset.category
    if (category === this.data.activeCategory && !this.data.keyword) return
    this.setData({ activeCategory: category, keyword: '' })
    this.loadData()
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    this.loadData()
  },

  // 搜索确认
  onSearchConfirm() {
    this.loadData()
  },

  // 清空搜索
  onSearchClear() {
    this.setData({ keyword: '' })
    this.loadData()
  },

  // 显示 / 隐藏搜索框
  toggleSearch() {
    const next = !this.data.showSearch
    if (next) {
      this.setData({ showSearch: true })
    } else {
      this.setData({ showSearch: false, keyword: '' })
      this.loadData()
    }
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
    this.loadData()
  },

  // 跳转添加页
  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  // 长按删除（弹窗确认）
  onSwipeDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除提醒',
      content: '确定要删除这条提醒吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (res.confirm) {
          storage.deleteReminder(id)
          this.loadData()
        }
      }
    })
  }
})
