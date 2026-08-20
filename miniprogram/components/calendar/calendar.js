// components/calendar/calendar.js
// 月历组件：显示当月日历，标记有提醒的日期，显示农历和节假日
const dateUtil = require('../../utils/date')

Component({
  properties: {
    markedDays: {
      type: Array,
      value: []
    },
    selectedDate: {
      type: String,
      value: ''
    }
  },

  data: {
    year: 0,
    month: 0,
    monthName: '',
    weeks: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    todayStr: ''
  },

  lifetimes: {
    attached() {
      const now = new Date()
      const todayStr = dateUtil.formatDate(now)
      this.setData({
        year: now.getFullYear(),
        month: now.getMonth(),
        todayStr
      })
      this.buildCalendar()
    }
  },

  observers: {
    'markedDays, selectedDate'() {
      this.buildCalendar()
    }
  },

  methods: {
    // 构建日历数据（含农历、节日、提醒标记）
    buildCalendar() {
      const { year, month, todayStr, markedDays, selectedDate } = this.data
      if (!year) return

      const firstDay = new Date(year, month, 1).getDay()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const prevMonthDays = new Date(year, month, 0).getDate()

      const weeks = []
      let day = 1
      let nextMonthDay = 1

      for (let w = 0; w < 6; w++) {
        const week = []
        let isWeekEmpty = true

        for (let d = 0; d < 7; d++) {
          let cellDay, cellMonth, cellYear, isCurrentMonth, dateStr

          if (w === 0 && d < firstDay) {
            cellDay = prevMonthDays - firstDay + d + 1
            cellMonth = month === 0 ? 11 : month - 1
            cellYear = month === 0 ? year - 1 : year
            isCurrentMonth = false
          } else if (day > daysInMonth) {
            cellDay = nextMonthDay++
            cellMonth = month === 11 ? 0 : month + 1
            cellYear = month === 11 ? year + 1 : year
            isCurrentMonth = false
          } else {
            cellDay = day++
            cellMonth = month
            cellYear = year
            isCurrentMonth = true
          }

          dateStr = dateUtil.formatDate(new Date(cellYear, cellMonth, cellDay))

          // 计算农历和节日
          let lunarText = ''
          let festival = ''
          let isHoliday = false
          if (isCurrentMonth) {
            try {
              const lunar = dateUtil.solarToLunar(cellYear, cellMonth + 1, cellDay)
              festival = dateUtil.getFestivalName(dateStr) || ''
              if (festival) {
                lunarText = festival
                isHoliday = true
              } else if (lunar.day === 1) {
                // 初一显示月份
                lunarText = lunar.monthName
              } else {
                // 其它显示日期（如"十五"）
                lunarText = lunar.dayName
              }
            } catch (e) {
              lunarText = ''
            }
          }

          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const isMarked = isCurrentMonth && markedDays.indexOf(cellDay) >= 0

          if (isCurrentMonth) isWeekEmpty = false

          week.push({
            day: cellDay,
            dateStr,
            isCurrentMonth,
            isToday,
            isSelected,
            isMarked,
            isHoliday,
            lunarText,
            isWeekend: d === 0 || d === 6
          })
        }

        if (isWeekEmpty && day > daysInMonth) break
        weeks.push(week)
      }

      const monthName = (month + 1) + '月'
      this.setData({ weeks, monthName })
    },

    onDayTap(e) {
      const dateStr = e.currentTarget.dataset.date
      const isCurrentMonth = e.currentTarget.dataset.current === 'true' || e.currentTarget.dataset.current === true
      if (!isCurrentMonth) return
      this.triggerEvent('select', { date: dateStr })
    },

    onPrevMonth() {
      let { year, month } = this.data
      month--
      if (month < 0) { month = 11; year-- }
      this.setData({ year, month })
      this.buildCalendar()
      this.triggerEvent('monthchange', { year, month })
    },

    onNextMonth() {
      let { year, month } = this.data
      month++
      if (month > 11) { month = 0; year++ }
      this.setData({ year, month })
      this.buildCalendar()
      this.triggerEvent('monthchange', { year, month })
    },

    onToday() {
      const now = new Date()
      this.setData({
        year: now.getFullYear(),
        month: now.getMonth()
      })
      this.buildCalendar()
      this.triggerEvent('select', { date: dateUtil.formatDate(now) })
    }
  }
})
