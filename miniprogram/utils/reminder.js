// utils/reminder.js
// 提醒业务逻辑：排序、筛选、下一个周期计算、到期检测

const storage = require('./storage')
const dateUtil = require('./date')
const { getCategory, getSubType, getRepeatLabel, getFuzzyDateDesc } = require('./constants')

// ===== 获取所有提醒（带分类信息） =====
function getAllReminders() {
  const reminders = storage.getReminders()
  return reminders.map(r => decorateReminder(r))
}

// ===== 装饰提醒对象（附加分类名、图标等） =====
function decorateReminder(r) {
  const cat = getCategory(r.category)
  const sub = getSubType(r.category, r.subType)
  const days = dateUtil.daysFromToday(r.remindDate)
  return {
    ...r,
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
  }
}

// ===== 获取今日提醒 =====
function getTodayReminders() {
  const reminders = getAllReminders()
  return reminders
    .filter(r => r.daysLeft === 0 && !r.done)
    .sort(sortByTime)
}

// ===== 获取即将到期提醒（7天内） =====
function getUpcomingReminders(days = 7) {
  const reminders = getAllReminders()
  return reminders
    .filter(r => r.daysLeft > 0 && r.daysLeft <= days && !r.done)
    .sort(sortByDays)
}

// ===== 获取逾期提醒 =====
function getOverdueReminders() {
  const reminders = getAllReminders()
  return reminders
    .filter(r => r.daysLeft < 0 && !r.done)
    .sort(sortByDays)
}

// ===== 按分类筛选（accounting 旧数据归入 bill） =====
function getByCategory(category) {
  const reminders = getAllReminders()
  if (category === 'all') return reminders.sort(sortByDays)
  return reminders.filter(r => {
    const cat = r.category === 'accounting' ? 'bill' : (r.category || 'bill')
    return cat === category
  }).sort(sortByDays)
}

// ===== 搜索 =====
function search(keyword) {
  const reminders = getAllReminders()
  const kw = keyword.toLowerCase().trim()
  if (!kw) return reminders
  return reminders.filter(r =>
    r.title.toLowerCase().includes(kw) ||
    r.subTypeLabel.toLowerCase().includes(kw) ||
    (r.note && r.note.toLowerCase().includes(kw))
  )
}

// ===== 按时间排序 =====
function sortByTime(a, b) {
  const timeA = a.remindTime || '00:00'
  const timeB = b.remindTime || '00:00'
  return timeA.localeCompare(timeB)
}

// ===== 按距今天数排序 =====
function sortByDays(a, b) {
  return a.daysLeft - b.daysLeft
}

// ===== 生成下一个周期的提醒日期 =====
// 核心修复：用"今天"做基准，而不是用旧的 remindDate
// 这样当日期已过时，计算出的下一个日期一定在未来
function generateNextOccurrence(reminder) {
  if (!reminder.repeatType || reminder.repeatType === 'none') return null

  // 基准日期：如果旧日期已过，用今天；否则用旧日期
  const oldDate = new Date(reminder.remindDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const baseDate = oldDate < today ? today : oldDate
  let nextDate = new Date(baseDate)

  switch (reminder.repeatType) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1)
      break
    case 'weekly': {
      // 找下一个指定星期几
      // weekday: 1=周一, 2=周二, ..., 7=周日
      const targetWd = (reminder.weekday || 1) === 7 ? 0 : (reminder.weekday || 1)
      const curWd = baseDate.getDay()
      let diff = targetWd - curWd
      if (diff <= 0) diff += 7
      nextDate = new Date(baseDate)
      nextDate.setDate(nextDate.getDate() + diff)
      break
    }
    case 'monthly': {
      // 兼容旧数据：monthly 视为 monthlyDay
      const day = reminder.monthlyDay || baseDate.getDate()
      let year = baseDate.getFullYear()
      let month = baseDate.getMonth()
      // 如果目标日期 <= 今天的同月日期，推到下个月
      const lastDay = new Date(year, month + 1, 0).getDate()
      const target = new Date(year, month, Math.min(day, lastDay))
      if (target <= baseDate) {
        month++
        if (month > 11) { month = 0; year++ }
      }
      const lastDay2 = new Date(year, month + 1, 0).getDate()
      nextDate = new Date(year, month, Math.min(day, lastDay2))
      break
    }
    case 'monthlyDay': {
      // 每月几号：基于 baseDate 计算最近的未来日期
      const day = reminder.monthlyDay || 1
      let year = baseDate.getFullYear()
      let month = baseDate.getMonth()
      const lastDay = new Date(year, month + 1, 0).getDate()
      let candidate = new Date(year, month, Math.min(day, lastDay))
      if (candidate <= baseDate) {
        month++
        if (month > 11) { month = 0; year++ }
        const lastDay2 = new Date(year, month + 1, 0).getDate()
        candidate = new Date(year, month, Math.min(day, lastDay2))
      }
      nextDate = candidate
      break
    }
    case 'quarterlyDay': {
      const qDay = reminder.quarterlyDay || 1
      const qMonthInQuarter = (reminder.quarterlyMonth || 1) - 1
      let q = Math.floor(baseDate.getMonth() / 3)
      let y = baseDate.getFullYear()
      // 先算本季度的目标日期
      let targetMonth = q * 3 + qMonthInQuarter
      let candidate = new Date(y, targetMonth, 1)
      let lastDay = new Date(y, targetMonth + 1, 0).getDate()
      candidate.setDate(Math.min(qDay, lastDay))
      // 如果已过或等于 baseDate，推到下季度
      if (candidate <= baseDate) {
        q = (q + 1) % 4
        if (q === 0) y++
        targetMonth = q * 3 + qMonthInQuarter
        lastDay = new Date(y, targetMonth + 1, 0).getDate()
        candidate = new Date(y, targetMonth, Math.min(qDay, lastDay))
      }
      nextDate = candidate
      break
    }
    case 'yearly': {
      const yMonth = reminder.yearlyMonth || (baseDate.getMonth() + 1)
      const yDay = reminder.yearlyDay || baseDate.getDate()
      const curYear = baseDate.getFullYear()
      // 如果是农历生日，需要特殊处理
      if (reminder.isLunar && reminder.lunarMonth && reminder.lunarDay) {
        // 从今天开始找下一个农历生日
        return {
          ...reminder,
          remindDate: dateUtil.getThisYearSolarBirthday(
            reminder.lunarMonth,
            reminder.lunarDay,
            reminder.lunarIsLeap,
            baseDate
          )
        }
      }
      // 先看今年
      let candidate = new Date(curYear, yMonth - 1, 1)
      const lastDay = new Date(curYear, yMonth, 0).getDate()
      candidate.setDate(Math.min(yDay, lastDay))
      if (candidate > baseDate) {
        nextDate = candidate
      } else {
        // 明年
        const nextYear = curYear + 1
        const nextLastDay = new Date(nextYear, yMonth, 0).getDate()
        nextDate = new Date(nextYear, yMonth - 1, Math.min(yDay, nextLastDay))
      }
      break
    }
  }

  return {
    ...reminder,
    remindDate: dateUtil.formatDate(nextDate)
  }
}

// ===== 检查并更新过期提醒（自动滚动到下一个周期） =====
function checkAndUpdateExpired() {
  const reminders = storage.getReminders()
  let updated = false

  for (let i = 0; i < reminders.length; i++) {
    const r = reminders[i]
    if (r.done) continue

    const days = dateUtil.daysFromToday(r.remindDate)
    // 如果提醒日期已过且有重复规则，自动滚动到下一个未来日期
    if (days < 0 && r.repeatType && r.repeatType !== 'none') {
      let next = generateNextOccurrence(r)
      let safety = 0  // 防御性循环上限（避免极端数据导致死循环）
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

  if (updated) {
    storage.saveReminders(reminders)
  }
  return updated
}

// ===== 统计信息 =====
function getStats() {
  const reminders = getAllReminders()
  const today = reminders.filter(r => r.daysLeft === 0 && !r.done)
  const upcoming = reminders.filter(r => r.daysLeft > 0 && r.daysLeft <= 7 && !r.done)
  const overdue = reminders.filter(r => r.daysLeft < 0 && !r.done)
  const done = reminders.filter(r => r.done)

  // 按分类统计（accounting 旧数据归入 bill）
  const byCategory = {}
  reminders.forEach(r => {
    const cat = r.category === 'accounting' ? 'bill' : (r.category || 'bill')
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, pending: 0 }
    }
    byCategory[cat].total++
    if (!r.done) byCategory[cat].pending++
  })

  return {
    total: reminders.length,
    today: today.length,
    upcoming: upcoming.length,
    overdue: overdue.length,
    done: done.length,
    byCategory
  }
}

// ===== 根据模糊日期规则计算最近的提醒日期 =====
function calcFuzzyRemindDate(repeatType, options) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (repeatType === 'weekly' && options && options.weekday) {
    // 找最近的指定星期几
    const targetWd = options.weekday === 7 ? 0 : options.weekday  // 7=周日→0
    const curWd = now.getDay()
    let diff = targetWd - curWd
    if (diff < 0) diff += 7
    // 如果 diff=0 说明今天就是，检查是否已过（默认算未来）
    if (diff === 0) diff += 7
    const candidate = new Date(now)
    candidate.setDate(candidate.getDate() + diff)
    return dateUtil.formatDate(candidate)
  }

  if (repeatType === 'yearly' && options && options.yearlyMonth && options.yearlyDay) {
    const year = now.getFullYear()
    const month = options.yearlyMonth  // 1-12
    const day = options.yearlyDay  // 1-31
    // 今年
    let lastDay = new Date(year, month, 0).getDate()
    const candidate = new Date(year, month - 1, Math.min(day, lastDay))
    if (candidate >= now) return dateUtil.formatDate(candidate)
    // 明年
    let nextYear = year + 1
    let nextLastDay = new Date(nextYear, month, 0).getDate()
    const nextCandidate = new Date(nextYear, month - 1, Math.min(day, nextLastDay))
    return dateUtil.formatDate(nextCandidate)
  }

  if (repeatType === 'monthlyDay' && options && options.monthlyDay) {
    const monthlyDay = options.monthlyDay
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

  if (repeatType === 'quarterlyDay' && options && options.quarterlyMonth && options.quarterlyDay) {
    const quarterlyMonth = options.quarterlyMonth
    const quarterlyDay = options.quarterlyDay
    const nowQuarter = Math.floor(now.getMonth() / 3)
    const targetMonthInQuarter = quarterlyMonth - 1

    let year = now.getFullYear()
    let month = nowQuarter * 3 + targetMonthInQuarter
    let lastDay = new Date(year, month + 1, 0).getDate()
    let day = Math.min(quarterlyDay, lastDay)
    let candidate = new Date(year, month, day)
    if (candidate >= now) return dateUtil.formatDate(candidate)

    let nextQuarter = (nowQuarter + 1) % 4
    if (nextQuarter === 0) year++
    month = nextQuarter * 3 + targetMonthInQuarter
    lastDay = new Date(year, month + 1, 0).getDate()
    day = Math.min(quarterlyDay, lastDay)
    candidate = new Date(year, month, day)
    return dateUtil.formatDate(candidate)
  }

  return null
}

// ===== 创建提醒 =====
function createReminder(data) {
  // 模糊日期：自动计算最近的提醒日期
  if (data.repeatType === 'weekly' || data.repeatType === 'yearly' || data.repeatType === 'monthlyDay' || data.repeatType === 'quarterlyDay') {
    const options = {
      weekday: data.weekday,
      yearlyMonth: data.yearlyMonth,
      yearlyDay: data.yearlyDay,
      monthlyDay: data.monthlyDay,
      quarterlyMonth: data.quarterlyMonth,
      quarterlyDay: data.quarterlyDay
    }
    const fuzzyDate = calcFuzzyRemindDate(data.repeatType, options)
    if (fuzzyDate) data.remindDate = fuzzyDate
  }
  // 如果是农历生日/纪念日，存储农历信息
  if (data.isLunar && data.lunarMonth && data.lunarDay) {
    data.remindDate = dateUtil.getThisYearSolarBirthday(
      data.lunarMonth,
      data.lunarDay,
      data.lunarIsLeap
    )
  }
  return storage.addReminder(data)
}

// ===== 更新提醒 =====
function updateReminder(id, data) {
  if (data.repeatType === 'weekly' || data.repeatType === 'yearly' || data.repeatType === 'monthlyDay' || data.repeatType === 'quarterlyDay') {
    const options = {
      weekday: data.weekday,
      yearlyMonth: data.yearlyMonth,
      yearlyDay: data.yearlyDay,
      monthlyDay: data.monthlyDay,
      quarterlyMonth: data.quarterlyMonth,
      quarterlyDay: data.quarterlyDay
    }
    const fuzzyDate = calcFuzzyRemindDate(data.repeatType, options)
    if (fuzzyDate) data.remindDate = fuzzyDate
  }
  if (data.isLunar && data.lunarMonth && data.lunarDay) {
    data.remindDate = dateUtil.getThisYearSolarBirthday(
      data.lunarMonth,
      data.lunarDay,
      data.lunarIsLeap
    )
  }
  return storage.updateReminder(id, data)
}

module.exports = {
  getAllReminders,
  decorateReminder,
  getTodayReminders,
  getUpcomingReminders,
  getOverdueReminders,
  getByCategory,
  search,
  generateNextOccurrence,
  checkAndUpdateExpired,
  getStats,
  createReminder,
  updateReminder,
  calcFuzzyRemindDate
}
