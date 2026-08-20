// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      const appConfig = require('./config')
      wx.cloud.init({
        env: appConfig.CLOUD_ENV,
        traceUser: true
      })
      // 启动后自动同步云端数据（用户无需手动操作）
      // - 云端有数据 → 拉取覆盖本地缓存（多端同步）
      // - 云端无数据但本地有 → 上传到云端（首次启用）
      // 失败静默处理，不阻塞小程序启动
      const storage = require('./utils/storage')
      storage.syncCheck().then(ok => {
        if (ok) console.log('[app] 云端数据同步完成')
      })
    }
    this.checkUpdate()
  },

  onShow() {
    // 小程序从后台切回前台时，重新锁定隐私锁
    this.globalData.privacyUnlocked = false
    // 1. 本地兜底：检查今日/已逾期提醒并弹框（100%能用）
    setTimeout(() => this.checkTodayReminders(), 1000)
    // 2. 云端推送：以用户上下文调用 sendReminder 云函数
    //    用户上下文 → openapi access_token 有效 → 能推送成功
    //    定时器触发时无用户上下文 → access_token 失效 → 推送失败
    //    所以每次打开小程序/从后台切回都触发一次，保证能收到微信服务通知
    setTimeout(() => this.triggerCloudPush(), 500)
  },

  globalData: {
    userInfo: null,
    privacyUnlocked: false,
    pendingCategory: '',  // 跨页传递的分类筛选（switchTab 不能带参数）
    pendingTab: ''        // 跨页传递的 tab 切换（switchTab 不能带参数）
  },

  // 检查小程序更新
  checkUpdate() {
    const updateManager = wx.getUpdateManager()
    if (updateManager) {
      updateManager.onCheckForUpdate(function (res) {
        if (res.hasUpdate) {
          console.log('有新版本')
        }
      })
      updateManager.onUpdateReady(function () {
        wx.showModal({
          title: '更新提示',
          content: '新版本已就绪，是否重启应用？',
          success: function (res) {
            if (res.confirm) {
              updateManager.applyUpdate()
            }
          }
        })
      })
    }
  },

  // ===== 触发云端推送（用户上下文，token有效）=====
  // 每次打开小程序/从后台切回时调用
  // 隐私锁开启且未解锁时跳过
  // force=true 时显示 toast 反馈（用于用户手动触发）
  triggerCloudPush(force) {
    try {
      const storage = require('./utils/storage')
      if (storage.getPrivacyLock() && !this.globalData.privacyUnlocked) {
        if (force) wx.showToast({ title: '请先解锁隐私设置', icon: 'none' })
        return
      }
      if (!wx.cloud) return
      wx.cloud.callFunction({
        name: 'sendReminder',
        data: { date: new Date().toISOString().slice(0, 10) },
        success(res) {
          const result = res.result || {}
          const d = result.data || {}
          console.log('[triggerCloudPush] 结果:', 'success=' + (d.success || 0), 'fail=' + (d.fail || 0), 'trigger=' + (d.trigger || '?'))

          // 成功推送后消费订阅额度
          if (d.success > 0) {
            const subscribe = require('./utils/subscribe')
            subscribe.consumeSubscribe('default')
          }

          if (force) {
            if (result.ok && d.success > 0) {
              wx.showToast({ title: `已推送 ${d.success} 条提醒`, icon: 'success' })
            } else if (result.ok && d.total === 0) {
              wx.showToast({ title: '暂无到期提醒', icon: 'none' })
            } else if (d.fail > 0) {
              wx.showModal({
                title: '推送部分失败',
                content: `成功 ${d.success} 条，失败 ${d.fail} 条。\n失败可能原因：用户未授权订阅消息。`,
                showCancel: false
              })
            }
          }
        },
        fail(err) {
          console.warn('[triggerCloudPush] 云函数调用失败:', err.errMsg || err)
          if (force) wx.showToast({ title: '推送失败', icon: 'none' })
        }
      })
    } catch (e) {
      console.warn('[triggerCloudPush] 异常:', e)
      if (force) wx.showToast({ title: '推送异常', icon: 'none' })
    }
  },

  // ===== 本地兜底提醒：检查今日/已逾期未完成的提醒并弹框 =====
  // 订阅消息可能因为个人小程序限制/授权/云函数权限等问题失败
  // 此方法在每次打开小程序/从后台切回时触发，保证用户能看到提醒
  checkTodayReminders() {
    try {
      const storage = require('./utils/storage')
      const reminderUtil = require('./utils/reminder')
      const { formatDate } = require('./utils/date')

      if (storage.getPrivacyLock() && !this.globalData.privacyUnlocked) {
        return
      }

      const reminders = storage.getReminders() || []
      const now = new Date()
      const todayStr = formatDate(now)
      const nowMin = now.getHours() * 60 + now.getMinutes()

      // 找出今日到期或已逾期、且未完成的提醒
      const items = []
      reminders.forEach(r => {
        if (r.done) return
        const decorated = reminderUtil.decorateReminder(r)
        if (decorated.daysLeft <= 0) {
          // 计算剩余分钟数
          let minsLeft = null
          if (decorated.daysLeft === 0 && r.remindTime) {
            const parts = r.remindTime.split(':')
            const targetMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
            minsLeft = targetMin - nowMin
          }
          items.push({
            title: r.title || '提醒',
            daysLeft: decorated.daysLeft,
            subTypeLabel: decorated.subTypeLabel || '',
            remindTime: r.remindTime || '',
            minsLeft,
            id: r._id
          })
        }
      })

      if (items.length === 0) return

      // 检查是否有即将到期的（30分钟内），有的话无条件弹
      const urgentItems = items.filter(i => i.minsLeft !== null && i.minsLeft >= 0 && i.minsLeft <= 30)
      const hasUrgent = urgentItems.length > 0

      // 非紧急的同一天只弹一次
      if (!hasUrgent) {
        const key = 'today_reminder_shown_' + todayStr
        try {
          const shown = wx.getStorageSync(key)
          if (shown) return
          wx.setStorageSync(key, true)
        } catch (e) {}
      } else {
        // 紧急的：重置今天的标记，让之后还能弹
        try { wx.removeStorageSync('today_reminder_shown_' + todayStr) } catch (e) {}
      }

      // 生成弹框内容
      const overdue = items.filter(i => i.daysLeft < 0)
      const todayItems = items.filter(i => i.daysLeft === 0)

      let lines = []
      if (overdue.length > 0) {
        lines.push(`【已逾期 ${overdue.length} 条】`)
        overdue.slice(0, 3).forEach(i => {
          lines.push(`• ${i.title}${i.remindTime ? ' (' + i.remindTime + ')' : ''}`)
        })
        if (overdue.length > 3) lines.push(`  等 ${overdue.length} 条`)
      }
      if (todayItems.length > 0) {
        if (lines.length > 0) lines.push('')
        lines.push(`【今日提醒 ${todayItems.length} 条】`)
        todayItems.slice(0, 3).forEach(i => {
          let timeStr = i.remindTime ? ' (' + i.remindTime + ')' : ''
          if (i.minsLeft !== null && i.minsLeft >= 0 && i.minsLeft <= 60) {
            timeStr += ' · ' + (i.minsLeft === 0 ? '即将到期' : i.minsLeft + '分钟后')
          }
          lines.push(`• ${i.title}${timeStr}`)
        })
        if (todayItems.length > 3) lines.push(`  等 ${todayItems.length} 条`)
      }
      if (hasUrgent) {
        lines.unshift('⏰ 有即将到期的提醒！')
      }

      wx.showModal({
        title: hasUrgent ? '⏰ 即将到期' : (items.length > 1 ? `有 ${items.length} 条事项` : '事项提醒'),
        content: lines.join('\n'),
        confirmText: '查看',
        cancelText: '知道了',
        cancelColor: '#999',
        success: (res) => {
          if (res.confirm) {
            if (items.length === 1) {
              // 只有一条，直接跳详情页
              wx.navigateTo({ url: '/pages/detail/detail?id=' + items[0].id })
            } else {
              // 多条，跳首页并切到今日tab
              this.globalData.pendingTab = 'today'
              wx.switchTab({ url: '/pages/index/index' })
            }
          }
        }
      })
    } catch (e) {
      console.warn('[checkTodayReminders] 本地提醒检测失败:', e)
    }
  }
})
