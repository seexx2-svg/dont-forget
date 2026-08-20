// pages/add/add.js - 添加/编辑提醒页
const { CATEGORIES, SUB_TYPES, REPEAT_TYPES, ADVANCE_DAYS_OPTIONS, MONTHLY_DAY_OPTIONS, QUARTERLY_MONTH_OPTIONS, WEEKDAY_OPTIONS, YEARLY_MONTH_OPTIONS, YEARLY_DAY_OPTIONS } = require('../../utils/constants')
const reminder = require('../../utils/reminder')
const storage = require('../../utils/storage')
const subscribe = require('../../utils/subscribe')
const dateUtil = require('../../utils/date')

Page({
  data: {
    isEdit: false,
    editId: null,
    categories: Object.entries(CATEGORIES).map(([key, val]) => ({ key, ...val })),
    subTypes: [],
    advanceOptions: ADVANCE_DAYS_OPTIONS,
    advanceLabels: ADVANCE_DAYS_OPTIONS.map(o => o.label),
    repeatTypes: REPEAT_TYPES,
    repeatLabels: REPEAT_TYPES.map(o => o.label),
    lunarMonthRange: Array.from({ length: 12 }, (_, i) => (i + 1) + '月'),
    lunarDayRange: Array.from({ length: 30 }, (_, i) => (i + 1) + '日'),
    // 模糊日期选项
    monthlyDayLabels: MONTHLY_DAY_OPTIONS.map(o => o.label),
    quarterlyMonthLabels: QUARTERLY_MONTH_OPTIONS.map(o => o.label),
    quarterlyDayLabels: MONTHLY_DAY_OPTIONS.map(o => o.label),
    weekdayLabels: WEEKDAY_OPTIONS.map(o => o.label),
    yearlyMonthLabels: YEARLY_MONTH_OPTIONS.map(o => o.label),
    yearlyDayLabels: YEARLY_DAY_OPTIONS.map(o => o.label),
    monthlyDayIndex: 0,
    quarterlyMonthIndex: 0,
    quarterlyDayIndex: 0,
    weekdayIndex: 0,
    yearlyMonthIndex: 0,
    yearlyDayIndex: 0,
    fuzzyPreview: '',
    // 索引
    advanceIndex: 0,
    repeatIndex: 0,
    lunarMonthIndex: 0,
    lunarDayIndex: 0,
    canLunar: false,
    dateHint: '',
    fuzzyDateDesc: '',  // 模糊日期描述（用于每日/每周/每年）
    // AI 智能识别
    aiInput: '',
    aiParsing: false,
    aiTip: '',
    textInputVisible: false,
    // 录音相关
    isRecording: false,
    voicePanelVisible: false,
    voiceTempText: '',
    form: {
      title: '',
      category: 'bill',
      subType: '',
      remindDate: dateUtil.today(),
      remindTime: '09:00',
      advanceDays: 0,
      repeatType: 'none',
      note: '',
      isLunar: false,
      lunarMonth: 0,
      lunarDay: 0,
      lunarIsLeap: false,
      monthlyDay: 0,
      quarterlyMonth: 0,
      quarterlyDay: 0,
      weekday: 0,
      yearlyMonth: 0,
      yearlyDay: 0
    }
  },

  onLoad(options) {
    // 初始化录音管理器（原生 API，个人小程序可用）
    this.recorderManager = wx.getRecorderManager()
    this.recorderManager.onStop((res) => this.onRecordStop(res))
    this.recorderManager.onError((err) => {
      this.setData({ isRecording: false, voicePanelVisible: false })
      wx.showToast({ title: '录音失败', icon: 'none' })
    })

    if (options.id) {
      this.setData({ isEdit: true, editId: options.id })
      this.loadEditData(options.id)
    } else {
      this.loadSubTypes('bill', true)
      this.refreshCanLunar()
    }
    this.syncDateHint()
    this.refreshFuzzyPreview()
  },

  onUnload() {
    if (this.data.isRecording) {
      this.recorderManager && this.recorderManager.stop()
    }
  },

  // 同步日期友好提示 + 模糊日期描述
  syncDateHint() {
    const { remindDate, isLunar, repeatType } = this.data.form
    // 更新模糊日期描述
    this.refreshFuzzyDateDesc()
    if (repeatType === 'daily' || repeatType === 'weekly' || repeatType === 'yearly') {
      this.setData({ dateHint: '自动计算下次日期' })
      return
    }
    if (isLunar) {
      this.setData({ dateHint: '农历提醒' })
      return
    }
    try {
      this.setData({ dateHint: dateUtil.friendlyDate(remindDate) })
    } catch (e) {
      this.setData({ dateHint: '' })
    }
  },

  // 刷新模糊日期描述（用于 UI 显示）
  refreshFuzzyDateDesc() {
    const { repeatType, remindDate, weekday, yearlyMonth, yearlyDay } = this.data.form
    let desc = ''
    if (repeatType === 'daily') {
      desc = '每天'
    } else if (repeatType === 'weekly') {
      if (weekday) {
        const weekdays = ['一', '二', '三', '四', '五', '六', '日']
        desc = '每周' + weekdays[weekday - 1]
      } else {
        try {
          const weekdays = ['日', '一', '二', '三', '四', '五', '六']
          const d = new Date(remindDate)
          desc = '每周' + weekdays[d.getDay()]
        } catch (e) {
          desc = '每周'
        }
      }
    } else if (repeatType === 'yearly') {
      if (yearlyMonth && yearlyDay) {
        desc = '每年' + yearlyMonth + '月' + yearlyDay + '日'
      } else {
        try {
          const parts = (remindDate || '').split('-')
          if (parts.length >= 3) {
            desc = '每年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日'
          } else {
            desc = '每年'
          }
        } catch (e) {
          desc = '每年'
        }
      }
    }
    this.setData({ fuzzyDateDesc: desc })
  },

  // 刷新模糊日期预览
  refreshFuzzyPreview() {
    const { repeatType, weekday, yearlyMonth, yearlyDay, monthlyDay, quarterlyMonth, quarterlyDay } = this.data.form
    if (repeatType === 'weekly' && weekday) {
      const d = reminder.calcFuzzyRemindDate ? reminder.calcFuzzyRemindDate('weekly', { weekday }) : null
      this.setData({ fuzzyPreview: d || '将自动计算' })
      return
    }
    if (repeatType === 'yearly' && yearlyMonth && yearlyDay) {
      const d = reminder.calcFuzzyRemindDate ? reminder.calcFuzzyRemindDate('yearly', { yearlyMonth, yearlyDay }) : null
      this.setData({ fuzzyPreview: d || '将自动计算' })
      return
    }
    if (repeatType === 'monthlyDay' && monthlyDay) {
      const d = reminder.calcFuzzyRemindDate ? reminder.calcFuzzyRemindDate('monthlyDay', { monthlyDay }) : null
      this.setData({ fuzzyPreview: d || '将自动计算' })
      return
    }
    if (repeatType === 'quarterlyDay' && quarterlyMonth && quarterlyDay) {
      const d = reminder.calcFuzzyRemindDate ? reminder.calcFuzzyRemindDate('quarterlyDay', { quarterlyMonth, quarterlyDay }) : null
      this.setData({ fuzzyPreview: d || '将自动计算' })
      return
    }
    this.setData({ fuzzyPreview: '' })
  },

  // 加载编辑数据
  loadEditData(id) {
    const reminders = storage.getReminders()
    const r = reminders.find(item => item._id === id)
    if (!r) {
      wx.showToast({ title: '提醒不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }
    const subTypes = SUB_TYPES[r.category] || []
    const advanceDays = r.advanceDays !== undefined ? r.advanceDays : 0
    const advanceIndex = Math.max(0, ADVANCE_DAYS_OPTIONS.findIndex(o => o.value === advanceDays))
    // 兼容旧数据：monthly 转为 monthlyDay
    let editRepeatType = r.repeatType || 'none'
    let editMonthlyDay = r.monthlyDay || 0
    if (editRepeatType === 'monthly') {
      editRepeatType = 'monthlyDay'
      if (!editMonthlyDay) {
        editMonthlyDay = parseInt((r.remindDate || '').split('-')[2]) || 1
      }
    }
    const repeatIndex = Math.max(0, REPEAT_TYPES.findIndex(o => o.value === editRepeatType))
    const lunarMonthIndex = r.lunarMonth ? r.lunarMonth - 1 : 0
    const lunarDayIndex = r.lunarDay ? r.lunarDay - 1 : 0
    const monthlyDayIndex = editMonthlyDay ? editMonthlyDay - 1 : 0
    const quarterlyMonthIndex = r.quarterlyMonth ? r.quarterlyMonth - 1 : 0
    const quarterlyDayIndex = r.quarterlyDay ? r.quarterlyDay - 1 : 0
    const weekdayIndex = r.weekday ? r.weekday - 1 : 0
    const yearlyMonthIndex = r.yearlyMonth ? r.yearlyMonth - 1 : 0
    const yearlyDayIndex = r.yearlyDay ? r.yearlyDay - 1 : 0
    wx.setNavigationBarTitle({ title: '编辑提醒' })
    this.setData({
      subTypes,
      advanceIndex,
      repeatIndex,
      lunarMonthIndex,
      lunarDayIndex,
      monthlyDayIndex,
      quarterlyMonthIndex,
      quarterlyDayIndex,
      weekdayIndex,
      yearlyMonthIndex,
      yearlyDayIndex,
      form: {
        title: r.title || '',
        category: r.category || 'bill',
        subType: r.subType || '',
        remindDate: r.remindDate || dateUtil.today(),
        remindTime: r.remindTime || '09:00',
        advanceDays: advanceDays,
        repeatType: editRepeatType,
        note: r.note || '',
        isLunar: !!r.isLunar,
        lunarMonth: r.lunarMonth || 0,
        lunarDay: r.lunarDay || 0,
        lunarIsLeap: !!r.lunarIsLeap,
        monthlyDay: editMonthlyDay,
        quarterlyMonth: r.quarterlyMonth || 0,
        quarterlyDay: r.quarterlyDay || 0,
        weekday: r.weekday || 0,
        yearlyMonth: r.yearlyMonth || 0,
        yearlyDay: r.yearlyDay || 0
      }
    })
    this.refreshCanLunar()
    this.refreshFuzzyPreview()
  },

  loadSubTypes(category, pickFirst) {
    const subTypes = SUB_TYPES[category] || []
    const form = this.data.form
    const exists = subTypes.some(s => s.value === form.subType)
    const patch = { subTypes }
    if (pickFirst || !exists) {
      patch.form = { ...form, subType: subTypes.length ? subTypes[0].value : '' }
    }
    this.setData(patch)
  },

  refreshCanLunar() {
    const { category, repeatType } = this.data.form
    const canLunar = category === 'anniversary' && repeatType === 'yearly'
    const patch = { canLunar }
    if (!canLunar && this.data.form.isLunar) {
      patch.form = { ...this.data.form, isLunar: false }
    }
    this.setData(patch)
  },

  selectCategory(e) {
    const category = e.currentTarget.dataset.key
    this.setData({ form: { ...this.data.form, category } })
    this.loadSubTypes(category, true)
    this.refreshCanLunar()
  },

  selectSubType(e) {
    const subType = e.currentTarget.dataset.value
    this.setData({ form: { ...this.data.form, subType } })
  },

  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.remindDate': e.detail.value })
    this.syncDateHint()
  },
  onTimeChange(e) {
    this.setData({ 'form.remindTime': e.detail.value })
  },

  onAdvanceChange(e) {
    const index = Number(e.detail.value)
    const option = ADVANCE_DAYS_OPTIONS[index]
    this.setData({
      advanceIndex: index,
      'form.advanceDays': option ? option.value : 1
    })
  },

  onRepeatChange(e) {
    const index = Number(e.detail.value)
    const option = REPEAT_TYPES[index]
    const form = { ...this.data.form, repeatType: option ? option.value : 'none' }
    if (form.repeatType === 'monthlyDay' && !form.monthlyDay) form.monthlyDay = 1
    if (form.repeatType === 'quarterlyDay') {
      if (!form.quarterlyMonth) form.quarterlyMonth = 1
      if (!form.quarterlyDay) form.quarterlyDay = 1
    }
    if (form.repeatType === 'weekly' && !form.weekday) form.weekday = 1
    if (form.repeatType === 'yearly') {
      if (!form.yearlyMonth) form.yearlyMonth = (new Date().getMonth() + 1)
      if (!form.yearlyDay) form.yearlyDay = new Date().getDate()
    }
    this.setData({ repeatIndex: index, form })
    this.refreshCanLunar()
    this.syncDateHint()
    this.refreshFuzzyPreview()
  },

  onMonthlyDayChange(e) {
    const index = Number(e.detail.value)
    this.setData({ monthlyDayIndex: index, 'form.monthlyDay': MONTHLY_DAY_OPTIONS[index].value })
    this.refreshFuzzyPreview()
  },

  onWeekdayChange(e) {
    const index = Number(e.detail.value)
    this.setData({ weekdayIndex: index, 'form.weekday': WEEKDAY_OPTIONS[index].value })
    this.refreshFuzzyPreview()
  },

  onYearlyMonthChange(e) {
    const index = Number(e.detail.value)
    this.setData({ yearlyMonthIndex: index, 'form.yearlyMonth': YEARLY_MONTH_OPTIONS[index].value })
    this.refreshFuzzyPreview()
  },

  onYearlyDayChange(e) {
    const index = Number(e.detail.value)
    this.setData({ yearlyDayIndex: index, 'form.yearlyDay': YEARLY_DAY_OPTIONS[index].value })
    this.refreshFuzzyPreview()
  },

  onQuarterlyMonthChange(e) {
    const index = Number(e.detail.value)
    this.setData({ quarterlyMonthIndex: index, 'form.quarterlyMonth': QUARTERLY_MONTH_OPTIONS[index].value })
    this.refreshFuzzyPreview()
  },

  onQuarterlyDayChange(e) {
    const index = Number(e.detail.value)
    this.setData({ quarterlyDayIndex: index, 'form.quarterlyDay': MONTHLY_DAY_OPTIONS[index].value })
    this.refreshFuzzyPreview()
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value })
  },

  toggleLunar(e) {
    if (!this.data.canLunar) return
    const isLunar = e.detail.value
    const form = this.data.form
    const patch = {}
    if (isLunar && !form.lunarMonth) {
      patch.form = { ...form, isLunar: true, lunarMonth: 1, lunarDay: 1 }
      patch.lunarMonthIndex = 0
      patch.lunarDayIndex = 0
    } else {
      patch.form = { ...form, isLunar }
    }
    this.setData(patch)
  },

  toggleLunarLeap(e) {
    this.setData({ 'form.lunarIsLeap': e.detail.value })
  },

  onLunarMonthChange(e) {
    const index = Number(e.detail.value)
    this.setData({ lunarMonthIndex: index, 'form.lunarMonth': index + 1 })
  },

  onLunarDayChange(e) {
    const index = Number(e.detail.value)
    this.setData({ lunarDayIndex: index, 'form.lunarDay': index + 1 })
  },

  validateForm() {
    const { title, isLunar, lunarMonth, lunarDay, repeatType, monthlyDay, quarterlyMonth, quarterlyDay, weekday, yearlyMonth, yearlyDay } = this.data.form
    if (!title || !title.trim()) {
      wx.showToast({ title: '请输入提醒标题', icon: 'none' })
      return false
    }
    if (isLunar && (!lunarMonth || !lunarDay)) {
      wx.showToast({ title: '请选择农历月日', icon: 'none' })
      return false
    }
    if (repeatType === 'monthlyDay' && !monthlyDay) {
      wx.showToast({ title: '请选择每月几号', icon: 'none' })
      return false
    }
    if (repeatType === 'quarterlyDay' && (!quarterlyMonth || !quarterlyDay)) {
      wx.showToast({ title: '请选择季度日期', icon: 'none' })
      return false
    }
    if (repeatType === 'weekly' && !weekday) {
      wx.showToast({ title: '请选择每周几', icon: 'none' })
      return false
    }
    if (repeatType === 'yearly' && (!yearlyMonth || !yearlyDay)) {
      wx.showToast({ title: '请选择每年几月几号', icon: 'none' })
      return false
    }
    return true
  },

  onSave() {
    if (!this.validateForm()) return
    const form = this.data.form
    const data = {
      title: form.title.trim(),
      category: form.category,
      subType: form.subType,
      remindDate: form.remindDate,
      remindTime: form.remindTime,
      advanceDays: form.advanceDays,
      repeatType: form.repeatType,
      note: form.note,
      isLunar: form.isLunar,
      lunarMonth: form.isLunar ? form.lunarMonth : 0,
      lunarDay: form.isLunar ? form.lunarDay : 0,
      lunarIsLeap: form.isLunar ? form.lunarIsLeap : false,
      monthlyDay: form.repeatType === 'monthlyDay' ? form.monthlyDay : 0,
      quarterlyMonth: form.repeatType === 'quarterlyDay' ? form.quarterlyMonth : 0,
      quarterlyDay: form.repeatType === 'quarterlyDay' ? form.quarterlyDay : 0,
      weekday: form.repeatType === 'weekly' ? form.weekday : 0,
      yearlyMonth: form.repeatType === 'yearly' ? form.yearlyMonth : 0,
      yearlyDay: form.repeatType === 'yearly' ? form.yearlyDay : 0
    }

    wx.showLoading({ title: '保存中...', mask: true })
    try {
      if (this.data.isEdit) {
        reminder.updateReminder(this.data.editId, data)
      } else {
        reminder.createReminder(data)
      }

      // ⚠️ autoRenew 必须在 wx.hideLoading() 之前调用
      // 因为 wx.hideLoading() 可能打断用户手势上下文
      // autoRenew：首次弹引导框，之后静默 +1 配额
      subscribe.autoRenew(data.category).finally(() => {
        wx.hideLoading()
        wx.showToast({ title: '保存成功', icon: 'success' })
        // 保存后立即触发云端推送
        setTimeout(() => {
          const app = getApp()
          if (typeof app.triggerCloudPush === 'function') {
            app.triggerCloudPush()
          }
        }, 500)
        setTimeout(() => wx.navigateBack(), 800)
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个提醒吗？',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (res.confirm) {
          storage.deleteReminder(this.data.editId)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        }
      }
    })
  },

  // ===== AI 智能识别 =====
  toggleTextInput() {
    this.setData({ textInputVisible: !this.data.textInputVisible })
  },

  onAIInput(e) {
    this.setData({ aiInput: e.detail.value })
  },

  // 文本识别
  onAIParse() {
    const text = (this.data.aiInput || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入提醒描述', icon: 'none' })
      return
    }
    if (this.data.aiParsing) return

    // 检查云能力是否就绪
    if (!wx.cloud) {
      wx.showToast({ title: '请使用最新版微信', icon: 'none' })
      return
    }

    this.setData({ aiParsing: true, aiTip: 'AI 识别中…' })
    wx.cloud.callFunction({
      name: 'parseReminder',
      data: { text },
      success: (res) => {
        const r = res.result || {}
        if (r.ok) {
          // 检查 AI 是否无法识别
          if (r.data && r.data.title === '无法识别') {
            this.setData({ aiTip: '无法识别该内容，请换一种说法，如"每月5号交电费"' })
            wx.showToast({ title: '内容无法识别', icon: 'none' })
            this.setData({ aiParsing: false })
            return
          }
          this.applyParsedData(r.data)
          this.setData({ aiTip: '已识别：' + (r.text || text), aiParsing: false })
        } else {
          this.setData({ aiTip: '识别失败：' + (r.error || '未知错误'), aiParsing: false })
        }
      },
      fail: (err) => {
        console.error('云函数调用失败', err)
        // 检测具体错误类型
        let msg = '云函数调用失败'
        const errStr = JSON.stringify(err)
        if (errStr.includes('not found') || errStr.includes('-40400')) {
          msg = '云函数未部署，请先在开发者工具中上传 parseReminder'
        } else if (errStr.includes('env') || errStr.includes('环境')) {
          msg = '云环境未就绪，请在开发者工具中关联云环境'
        } else if (errStr.includes('timeout')) {
          msg = '识别超时，请重试'
        }
        this.setData({ aiTip: msg, aiParsing: false })
      },
      complete: () => {
        this.setData({ aiParsing: false })
      }
    })
  },

  // ===== 录音识别 =====
  onRecordStart() {
    if (this.data.aiParsing) return
    if (this.data.isRecording) return

    // 重置内部标志
    this._recordingStarted = false  // 录音是否真正已 start
    this._pendingStop = false       // 权限检查期间用户已松开的标记

    // 立即标记为录音中，UI 即时响应
    this.setData({
      isRecording: true,
      voicePanelVisible: true,
      voiceTempText: '',
      aiTip: '正在聆听…'
    })
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })

    // 异步检查权限，失败则回滚
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record']) {
          this.startRecording()
        } else {
          wx.authorize({
            scope: 'scope.record',
            success: () => this.startRecording(),
            fail: () => {
              this._pendingStop = false
              this.setData({ isRecording: false, voicePanelVisible: false })
              wx.showModal({
                title: '需要录音权限',
                content: '语音输入需要使用麦克风，请前往设置开启',
                confirmText: '去设置',
                success: (m) => { if (m.confirm) wx.openSetting() }
              })
            }
          })
        }
      },
      fail: () => {
        this._pendingStop = false
        this.setData({ isRecording: false, voicePanelVisible: false })
        wx.showToast({ title: '无法获取权限', icon: 'none' })
      }
    })
  },

  startRecording() {
    // 用户在权限检查期间已松开，不录音，直接清理
    if (this._pendingStop) {
      this._pendingStop = false
      this.setData({ isRecording: false, voicePanelVisible: false, aiTip: '' })
      return
    }
    this._recordingStarted = true
    this.recorderManager.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'pcm'
    })
  },

  onRecordEnd() {
    if (!this._recordingStarted) {
      // 录音尚未真正开始（权限检查还在异步中），标记待停止
      // 等权限回调进入 startRecording 时检查此标记并清理
      this._pendingStop = true
      return
    }
    this._recordingStarted = false
    this.recorderManager.stop()
  },

  // 录音结束回调
  onRecordStop(res) {
    this.setData({ isRecording: false })
    const tempPath = res.tempFilePath
    if (!tempPath) {
      this.setData({ voicePanelVisible: false, aiTip: '录音失败，请重试' })
      return
    }

    this.setData({ aiTip: '上传音频中…', voiceTempText: '处理中…' })

    // 1. 上传到云存储
    const cloudPath = 'voice/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.pcm'
    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempPath,
      success: (upRes) => {
        const fileID = upRes.fileID
        this.setData({ voiceTempText: 'AI 识别中…' })
        // 2. 调用云函数 ASR + GLM 解析
        wx.cloud.callFunction({
          name: 'parseReminder',
          data: { audioFileID: fileID },
          success: (cfRes) => {
            const r = cfRes.result || {}
            if (r.ok) {
              // 检查 AI 是否无法识别
              if (r.data && r.data.title === '无法识别') {
                this.setData({ voiceTempText: '' })
                this.setData({ aiTip: '无法识别语音内容，请改用文字输入' })
              } else {
                this.setData({ voiceTempText: r.text || '' })
                this.applyParsedData(r.data)
                this.setData({ aiTip: '语音识别成功：' + (r.text || '') })
              }
            } else {
              const errMsg = r.error || '未知错误'
              // 过滤技术细节，显示友好提示
              let friendlyMsg = '请改用文字输入'
              if (errMsg.includes('音频文件为空') || errMsg.includes('speech length')) {
                friendlyMsg = '录音时间太短，请重试'
              } else if (errMsg.includes('401') || errMsg.includes('invalid')) {
                friendlyMsg = '语音服务未授权，请改用文字输入'
              } else if (errMsg.includes('ASR 返回空')) {
                friendlyMsg = '未识别到语音内容，请重试'
              } else if (errMsg.includes('timeout') || errMsg.includes('超时')) {
                friendlyMsg = '识别超时，请重试或改用文字输入'
              }
              this.setData({ aiTip: '语音识别失败，' + friendlyMsg })
            }
          },
          fail: (err) => {
            console.error('云函数调用失败', err)
            this.setData({ aiTip: '云函数调用失败，请检查云开发环境' })
          },
          complete: () => {
            // 延迟收起面板
            setTimeout(() => this.setData({ voicePanelVisible: false, voiceTempText: '' }), 1500)
            // 删除云存储临时文件（可选，节省空间）
            wx.cloud.deleteFile({ fileList: [fileID] })
          }
        })
      },
      fail: (err) => {
        this.setData({
          voicePanelVisible: false,
          aiTip: '上传失败：' + (err.errMsg || '请检查云开发环境')
        })
      }
    })
  },

  // 将 AI 解析结果应用到表单
  applyParsedData(parsed) {
    if (!parsed) return

    // AI 无法识别的情况
    if (parsed.title === '无法识别') {
      wx.showToast({ title: '无法识别该内容，请换一种说法', icon: 'none', duration: 2000 })
      return
    }

    const form = { ...this.data.form }
    if (parsed.title) form.title = parsed.title
    if (parsed.category && CATEGORIES[parsed.category]) {
      form.category = parsed.category
      this.loadSubTypes(parsed.category, false)
    }
    if (parsed.subType) form.subType = parsed.subType
    if (parsed.repeatType) {
      // 兼容：AI 可能返回 monthly，统一转为 monthlyDay
      let rpt = parsed.repeatType
      if (rpt === 'monthly') {
        rpt = 'monthlyDay'
        if (!parsed.monthlyDay) {
          // 从 remindDate 推断几号
          const day = parseInt((form.remindDate || '').split('-')[2]) || 1
          form.monthlyDay = day
        }
      }
      form.repeatType = rpt
      const repeatIndex = Math.max(0, REPEAT_TYPES.findIndex(o => o.value === rpt))
      this.setData({ repeatIndex })

      // yearly：从 AI 数据或 remindDate 补全年月字段
      if (rpt === 'yearly') {
        if (parsed.yearlyMonth) form.yearlyMonth = parsed.yearlyMonth
        if (parsed.yearlyDay) form.yearlyDay = parsed.yearlyDay
        // 如果 AI 没返回，从 remindDate 推断
        if (!form.yearlyMonth || !form.yearlyDay) {
          const parts = (form.remindDate || '').split('-')
          if (parts.length >= 3) {
            if (!form.yearlyMonth) form.yearlyMonth = parseInt(parts[1])
            if (!form.yearlyDay) form.yearlyDay = parseInt(parts[2])
          }
        }
      }
      // weekly：从 AI 数据或 remindDate 补全星期字段
      if (rpt === 'weekly') {
        if (parsed.weekday) {
          form.weekday = parsed.weekday
        } else if (!form.weekday) {
          // 从 remindDate 推断星期几
          try {
            const d = new Date(form.remindDate)
            const wd = d.getDay() // 0=周日
            form.weekday = wd === 0 ? 7 : wd
          } catch (e) {
            form.weekday = 1
          }
        }
      }
    }
    if (parsed.monthlyDay) form.monthlyDay = parsed.monthlyDay
    if (parsed.quarterlyMonth) form.quarterlyMonth = parsed.quarterlyMonth
    if (parsed.quarterlyDay) form.quarterlyDay = parsed.quarterlyDay
    if (parsed.weekday) form.weekday = parsed.weekday
    if (parsed.yearlyMonth) form.yearlyMonth = parsed.yearlyMonth
    if (parsed.yearlyDay) form.yearlyDay = parsed.yearlyDay
    if (parsed.remindTime) form.remindTime = parsed.remindTime
    if (parsed.advanceDays !== undefined && parsed.advanceDays !== null) {
      form.advanceDays = parsed.advanceDays
      const advanceIndex = Math.max(0, ADVANCE_DAYS_OPTIONS.findIndex(o => o.value === parsed.advanceDays))
      this.setData({ advanceIndex })
    }

    const patch = { form, aiInput: parsed.title || this.data.aiInput }
    if (form.monthlyDay) patch.monthlyDayIndex = form.monthlyDay - 1
    if (form.quarterlyMonth) patch.quarterlyMonthIndex = form.quarterlyMonth - 1
    if (form.quarterlyDay) patch.quarterlyDayIndex = form.quarterlyDay - 1
    if (form.weekday) patch.weekdayIndex = form.weekday - 1
    if (form.yearlyMonth) patch.yearlyMonthIndex = form.yearlyMonth - 1
    if (form.yearlyDay) patch.yearlyDayIndex = form.yearlyDay - 1
    this.setData(patch)

    this.refreshCanLunar()
    this.refreshFuzzyPreview()
    wx.showToast({ title: '已填入表单', icon: 'success' })
  }
})
