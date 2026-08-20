// js/reminder.js
// 提醒业务逻辑：排序、筛选、下一个周期计算、到期检测
(function () {
  const storage = window.storage
  const dateUtil = window.dateUtil
  const constants = window.constants
  const getCategory = constants.getCategory
  const getSubType = constants.getSubType
  const getRepeatLabel = constants.getRepeatLabel
  const getFuzzyDateDesc = constants.getFuzzyDateDesc

  // ===== 获取所有提醒（带分类信息） =====
  function getAllReminders() {
    const reminders = storage.getReminders()
    return reminders.map(function (r) { return decorateReminder(r) })
  }

  // ===== 装饰提醒对象 =====
  function decorateReminder(r) {
    const cat = getCategory(r.category)
    const sub = getSubType(r.category, r.subType)
    const days = dateUtil.daysFromToday(r.remindDate)
    return Object.assign({}, r, {
      categoryName: cat.name,
      categoryIcon: cat.icon,
      categoryColor: cat.color,
      categoryBg: cat.bg,
      subTypeLabel: sub.label,
      subTypeIcon: sub.icon,
      repeatLabel: getRepeatLabel(r.repeatType),
      fuzzyDateDesc: getFuzzyDateDesc(r),
      daysLeft: days,
      friendlyDate: dateUtil.friendlyDate(r.remindDate),
      lunarDesc: r.isLunar ? dateUtil.getLunarDesc(r.remindDate) : '',
      isOverdue: days < 0 && !r.done,
      isToday: days === 0,
      isUpcoming: days >= 0 && days <= 7
    })
  }

  function getTodayReminders() {
    const reminders = getAllReminders()
    return reminders.filter(function (r) { return r.daysLeft === 0 && !r.done }).sort(sortByTime)
  }

  function getUpcomingReminders(days) {
    days = days || 7
    const reminders = getAllReminders()
    return reminders.filter(function (r) { return r.daysLeft > 0 && r.daysLeft <= days && !r.done }).sort(sortByDays)
  }

  function getOverdueReminders() {
    const reminders = getAllReminders()
    return reminders.filter(function (r) { return r.daysLeft < 0 && !r.done }).sort(sortByDays)
  }

  function getByCategory(category) {
    const reminders = getAllReminders()
    if (category === 'all') return reminders.sort(sortByDays)
    return reminders.filter(function (r) {
      var cat = r.category === 'accounting' ? 'bill' : (r.category || 'bill')
      return cat === category
    }).sort(sortByDays)
  }

  function search(keyword) {
    const reminders = getAllReminders()
    const kw = (keyword || '').toLowerCase().trim()
    if (!kw) return reminders
    return reminders.filter(function (r) {
      return (r.title || '').toLowerCase().includes(kw) ||
        (r.subTypeLabel || '').toLowerCase().includes(kw) ||
        (r.note || '').toLowerCase().includes(kw)
    })
  }

  function sortByTime(a, b) {
    const timeA = a.remindTime || '00:00'
    const timeB = b.remindTime || '00:00'
    return timeA.localeCompare(timeB)
  }

  function sortByDays(a, b) {
    return a.daysLeft - b.daysLeft
  }

  // ===== 生成下一个周期的提醒日期 =====
  function generateNextOccurrence(reminder) {
    if (!reminder.repeatType || reminder.repeatType === 'none') return null

    const currentDate = new Date(reminder.remindDate)
    let nextDate = new Date(currentDate)

    switch (reminder.repeatType) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1)
        break
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7)
        break
      case 'monthly': {
        // 兼容旧数据：monthly 视为 monthlyDay，用安全方式滚动避免月末溢出
        var day = reminder.monthlyDay || currentDate.getDate()
        var targetYear = currentDate.getMonth() === 11 ? currentDate.getFullYear() + 1 : currentDate.getFullYear()
        var targetMonth = (currentDate.getMonth() + 1) % 12
        var lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
        nextDate = new Date(targetYear, targetMonth, Math.min(day, lastDay))
        break
      }
      case 'monthlyDay': {
        const day = reminder.monthlyDay || 1
        const base = new Date(reminder.remindDate)
        const targetYear = base.getMonth() === 11 ? base.getFullYear() + 1 : base.getFullYear()
        const targetMonth = (base.getMonth() + 1) % 12
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
        nextDate = new Date(targetYear, targetMonth, Math.min(day, lastDay))
        break
      }
      case 'quarterlyDay': {
        const qDay = reminder.quarterlyDay || 1
        const qMonthInQuarter = (reminder.quarterlyMonth || 1) - 1
        const baseDate = new Date(reminder.remindDate)
        let q = Math.floor(baseDate.getMonth() / 3)
        let y = baseDate.getFullYear()
        q = (q + 1) % 4
        if (q === 0) y++
        const targetMonth = q * 3 + qMonthInQuarter
        nextDate = new Date(y, targetMonth, 1)
        const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()
        nextDate.setDate(Math.min(qDay, lastDay))
        break
      }
      case 'yearly':
        if (reminder.isLunar && reminder.lunarMonth && reminder.lunarDay) {
          return Object.assign({}, reminder, {
            remindDate: dateUtil.getThisYearSolarBirthday(
              reminder.lunarMonth, reminder.lunarDay, reminder.lunarIsLeap)
          })
        }
        nextDate.setFullYear(nextDate.getFullYear() + 1)
        break
    }

    return Object.assign({}, reminder, { remindDate: dateUtil.formatDate(nextDate) })
  }

  // ===== 检查并更新过期提醒 =====
  function checkAndUpdateExpired() {
    const reminders = storage.getReminders()
    let updated = false

    for (let i = 0; i < reminders.length; i++) {
      const r = reminders[i]
      if (r.done) continue

      const days = dateUtil.daysFromToday(r.remindDate)
      if (days < 0 && r.repeatType && r.repeatType !== 'none') {
        let next = generateNextOccurrence(r)
        let safety = 0
        while (next && dateUtil.daysFromToday(next.remindDate) < 0 && safety < 1000) {
          next = generateNextOccurrence(next)
          safety++
        }
        if (next && safety < 1000) {
          reminders[i].remindDate = next.remindDate
          reminders[i].updatedAt = Date.now()
          updated = true
        }
      }
    }

    if (updated) storage.saveReminders(reminders)
    return updated
  }

  // ===== 统计信息 =====
  function getStats() {
    const reminders = getAllReminders()
    const today = reminders.filter(function (r) { return r.daysLeft === 0 && !r.done })
    const upcoming = reminders.filter(function (r) { return r.daysLeft > 0 && r.daysLeft <= 7 && !r.done })
    const overdue = reminders.filter(function (r) { return r.daysLeft < 0 && !r.done })
    const done = reminders.filter(function (r) { return r.done })

    const byCategory = {}
    reminders.forEach(function (r) {
      const cat = r.category === 'accounting' ? 'bill' : (r.category || 'bill')
      if (!byCategory[cat]) byCategory[cat] = { total: 0, pending: 0 }
      byCategory[cat].total++
      if (!r.done) byCategory[cat].pending++
    })

    return {
      total: reminders.length,
      today: today.length,
      upcoming: upcoming.length,
      overdue: overdue.length,
      done: done.length,
      byCategory: byCategory
    }
  }

  // ===== 根据模糊日期规则计算最近的提醒日期 =====
  function calcFuzzyRemindDate(repeatType, monthlyDay, quarterlyMonth, quarterlyDay) {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    if (repeatType === 'monthlyDay' && monthlyDay) {
      let year = now.getFullYear()
      let month = now.getMonth()
      let lastDay = new Date(year, month + 1, 0).getDate()
      let day = Math.min(monthlyDay, lastDay)
      let candidate = new Date(year, month, day)
      if (candidate >= now) return dateUtil.formatDate(candidate)
      month++
      if (month > 11) { month = 0; year++ }
      lastDay = new Date(year, month + 1, 0).getDate()
      day = Math.min(monthlyDay, lastDay)
      candidate = new Date(year, month, day)
      return dateUtil.formatDate(candidate)
    }

    if (repeatType === 'quarterlyDay' && quarterlyMonth && quarterlyDay) {
      const nowQuarter = Math.floor(now.getMonth() / 3)
      const targetMonthInQuarter = quarterlyMonth - 1

      let year = now.getFullYear()
      let month = nowQuarter * 3 + targetMonthInQuarter
      let lastDay = new Date(year, month + 1, 0).getDate()
      let day = Math.min(quarterlyDay, lastDay)
      let candidate = new Date(year, month, day)
      if (candidate >= now) return dateUtil.formatDate(candidate)

      const nextQuarter = (nowQuarter + 1) % 4
      if (nextQuarter === 0) year++
      month = nextQuarter * 3 + targetMonthInQuarter
      lastDay = new Date(year, month + 1, 0).getDate()
      day = Math.min(quarterlyDay, lastDay)
      candidate = new Date(year, month, day)
      return dateUtil.formatDate(candidate)
    }

    return null
  }

  function createReminder(data) {
    if (data.repeatType === 'monthlyDay' || data.repeatType === 'quarterlyDay') {
      const fuzzyDate = calcFuzzyRemindDate(
        data.repeatType, data.monthlyDay, data.quarterlyMonth, data.quarterlyDay)
      if (fuzzyDate) data.remindDate = fuzzyDate
    }
    if (data.isLunar && data.lunarMonth && data.lunarDay) {
      data.remindDate = dateUtil.getThisYearSolarBirthday(
        data.lunarMonth, data.lunarDay, data.lunarIsLeap)
    }
    return storage.addReminder(data)
  }

  function updateReminder(id, data) {
    if (data.repeatType === 'monthlyDay' || data.repeatType === 'quarterlyDay') {
      const fuzzyDate = calcFuzzyRemindDate(
        data.repeatType, data.monthlyDay, data.quarterlyMonth, data.quarterlyDay)
      if (fuzzyDate) data.remindDate = fuzzyDate
    }
    if (data.isLunar && data.lunarMonth && data.lunarDay) {
      data.remindDate = dateUtil.getThisYearSolarBirthday(
        data.lunarMonth, data.lunarDay, data.lunarIsLeap)
    }
    return storage.updateReminder(id, data)
  }

  window.reminder = {
    getAllReminders: getAllReminders,
    decorateReminder: decorateReminder,
    getTodayReminders: getTodayReminders,
    getUpcomingReminders: getUpcomingReminders,
    getOverdueReminders: getOverdueReminders,
    getByCategory: getByCategory,
    search: search,
    generateNextOccurrence: generateNextOccurrence,
    checkAndUpdateExpired: checkAndUpdateExpired,
    getStats: getStats,
    createReminder: createReminder,
    updateReminder: updateReminder,
    calcFuzzyRemindDate: calcFuzzyRemindDate
  }
})()
