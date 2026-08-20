// js/date.js
// 日期工具（含农历转换、传统节日计算），挂载到 window.dateUtil

(function () {
  // ===== 农历数据表（1900-2100年） =====
  const LUNAR_INFO = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x05340, 0x0d93a,
    0x0d250, 0x0d950, 0x1da55, 0x0b540, 0x0d6a0, 0x0b550, 0x056a0, 0x0a6d0, 0x055d4, 0x052d0,
    0x18693, 0x0c950, 0x0d4a0, 0x0d550, 0x0b540, 0x0b6a0, 0x195c6, 0x095b0, 0x049b0, 0x0a974
  ]

  const LUNAR_MONTH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
  const LUNAR_DAY = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']
  const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

  const LUNAR_FESTIVALS = {
    '1-1': '春节', '1-15': '元宵节', '5-5': '端午节', '7-7': '七夕节', '7-15': '中元节',
    '8-15': '中秋节', '9-9': '重阳节', '12-8': '腊八节', '12-23': '小年', '12-30': '除夕'
  }

  const SOLAR_FESTIVALS = {
    '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '3-12': '植树节', '4-1': '愚人节',
    '5-1': '劳动节', '5-4': '青年节', '6-1': '儿童节', '7-1': '建党节', '8-1': '建军节',
    '9-10': '教师节', '10-1': '国庆节', '11-11': '光棍节', '12-25': '圣诞节'
  }

  function lunarYearDays(year) {
    let sum = 348
    for (let i = 0x8000; i > 0x8; i >>= 1) {
      sum += (LUNAR_INFO[year - 1900] & i) ? 1 : 0
    }
    return sum + leapDays(year)
  }

  function leapDays(year) {
    if (leapMonth(year)) {
      return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29
    }
    return 0
  }

  function leapMonth(year) {
    return LUNAR_INFO[year - 1900] & 0xf
  }

  function monthDays(year, month) {
    return (LUNAR_INFO[year - 1900] & (0x10000 >> month)) ? 30 : 29
  }

  function solarToLunar(year, month, day) {
    const baseDate = new Date(1900, 0, 31)
    const objDate = new Date(year, month - 1, day)
    let offset = Math.floor((objDate - baseDate) / 86400000)

    let temp = 0
    let lunarYear, lunarMonth, lunarDay, isLeap = false

    for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
      temp = lunarYearDays(lunarYear)
      offset -= temp
    }
    if (offset < 0) {
      offset += temp
      lunarYear--
    }

    const leap = leapMonth(lunarYear)
    isLeap = false

    for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
      if (leap > 0 && lunarMonth === leap + 1 && !isLeap) {
        --lunarMonth
        isLeap = true
        temp = leapDays(lunarYear)
      } else {
        temp = monthDays(lunarYear, lunarMonth)
      }
      if (isLeap && lunarMonth === leap + 1) isLeap = false
      offset -= temp
    }

    if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
      if (isLeap) {
        isLeap = false
      } else {
        isLeap = true
        --lunarMonth
      }
    }

    if (offset < 0) {
      offset += temp
      --lunarMonth
    }

    lunarDay = offset + 1

    return {
      year: lunarYear,
      month: lunarMonth,
      day: lunarDay,
      isLeap: isLeap,
      monthName: (isLeap ? '闰' : '') + LUNAR_MONTH[lunarMonth - 1] + '月',
      dayName: LUNAR_DAY[lunarDay - 1],
      zodiac: ZODIAC[(lunarYear - 4) % 12],
      ganZhi: GAN[(lunarYear - 4) % 10] + ZHI[(lunarYear - 4) % 12],
      monthKey: lunarMonth + '-' + lunarDay
    }
  }

  function lunarToSolar(lunarYear, lunarMonth, lunarDay, isLeap) {
    const baseDate = new Date(1900, 0, 31)
    let offset = 0

    for (let y = 1900; y < lunarYear; y++) {
      offset += lunarYearDays(y)
    }

    const leap = leapMonth(lunarYear)
    for (let m = 1; m < lunarMonth; m++) {
      if (leap > 0 && m === leap + 1 && !isLeap) {
        // 跳过闰月
      }
      offset += monthDays(lunarYear, m)
      if (leap > 0 && m === leap) {
        offset += leapDays(lunarYear)
      }
    }

    if (isLeap) {
      offset += monthDays(lunarYear, lunarMonth)
    }

    offset += lunarDay - 1

    const result = new Date(baseDate)
    result.setDate(result.getDate() + offset)
    return {
      year: result.getFullYear(),
      month: result.getMonth() + 1,
      day: result.getDate()
    }
  }

  function formatDate(date) {
    if (typeof date === 'string') date = new Date(date)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
  }

  function formatTime(date) {
    if (typeof date === 'string') return date
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return h + ':' + m
  }

  function today() {
    return formatDate(new Date())
  }

  function daysFromToday(dateStr) {
    const target = new Date(dateStr)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)
    return Math.round((target - now) / 86400000)
  }

  function friendlyDate(dateStr) {
    const days = daysFromToday(dateStr)
    if (days === 0) return '今天'
    if (days === 1) return '明天'
    if (days === 2) return '后天'
    if (days === -1) return '昨天'
    if (days > 0 && days <= 7) return days + '天后'
    if (days < 0 && days >= -7) return Math.abs(days) + '天前'

    const date = new Date(dateStr)
    const lunar = solarToLunar(date.getFullYear(), date.getMonth() + 1, date.getDate())
    const monthKey = (date.getMonth() + 1) + '-' + date.getDate()

    let label = (date.getMonth() + 1) + '月' + date.getDate() + '日'
    const festival = SOLAR_FESTIVALS[monthKey] || LUNAR_FESTIVALS[lunar.monthKey]
    if (festival) {
      label += '（' + festival + '）'
    } else if (lunar.day === 1 || lunar.day === 15) {
      label += '（农历' + lunar.monthName + lunar.dayName + '）'
    }

    if (days > 7) return days + '天后 · ' + label
    return Math.abs(days) + '天前 · ' + label
  }

  function getFestivalName(dateStr) {
    const date = new Date(dateStr)
    const monthKey = (date.getMonth() + 1) + '-' + date.getDate()
    const lunar = solarToLunar(date.getFullYear(), date.getMonth() + 1, date.getDate())
    return SOLAR_FESTIVALS[monthKey] || LUNAR_FESTIVALS[lunar.monthKey] || ''
  }

  function getLunarDesc(dateStr) {
    const date = new Date(dateStr)
    const lunar = solarToLunar(date.getFullYear(), date.getMonth() + 1, date.getDate())
    const festival = LUNAR_FESTIVALS[lunar.monthKey]
    if (festival) return festival
    return lunar.monthName + lunar.dayName
  }

  function getThisYearSolarBirthday(lunarMonth, lunarDay, isLeap) {
    const now = new Date()
    const thisYear = now.getFullYear()
    const solar = lunarToSolar(thisYear, lunarMonth, lunarDay, isLeap || false)
    const birthdayStr = formatDate(new Date(solar.year, solar.month - 1, solar.day))

    if (daysFromToday(birthdayStr) < 0) {
      const nextSolar = lunarToSolar(thisYear + 1, lunarMonth, lunarDay, isLeap || false)
      return formatDate(new Date(nextSolar.year, nextSolar.month - 1, nextSolar.day))
    }
    return birthdayStr
  }

  window.dateUtil = {
    solarToLunar: solarToLunar,
    lunarToSolar: lunarToSolar,
    formatDate: formatDate,
    formatTime: formatTime,
    today: today,
    daysFromToday: daysFromToday,
    friendlyDate: friendlyDate,
    getFestivalName: getFestivalName,
    getLunarDesc: getLunarDesc,
    getThisYearSolarBirthday: getThisYearSolarBirthday,
    LUNAR_FESTIVALS: LUNAR_FESTIVALS,
    SOLAR_FESTIVALS: SOLAR_FESTIVALS,
    ZODIAC: ZODIAC
  }
})()
