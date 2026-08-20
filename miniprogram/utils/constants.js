// utils/constants.js
// 提醒分类、子类型、重复规则等常量定义

// ===== 分类定义 =====
const CATEGORIES = {
  bill: { name: '缴费提醒', icon: '💰', color: '#FF6B6B', bg: '#FFF0F0' },
  health: { name: '健康提醒', icon: '💊', color: '#4ECDC4', bg: '#E8F8F7' },
  idcard: { name: '证件车辆', icon: '📋', color: '#45B7D1', bg: '#E8F4FA' },
  anniversary: { name: '纪念日', icon: '🎉', color: '#FF8CC8', bg: '#FFF0F8' }
}

// ===== 子类型定义 =====
const SUB_TYPES = {
  bill: [
    { value: 'electricity', label: '电费', icon: '⚡' },
    { value: 'water', label: '水费', icon: '💧' },
    { value: 'gas', label: '燃气费', icon: '🔥' },
    { value: 'property', label: '物业费', icon: '🏠' },
    { value: 'social', label: '社保', icon: '🛡️' },
    { value: 'creditCard', label: '信用卡还款', icon: '💳' },
    { value: 'mortgage', label: '房贷', icon: '🏦' },
    { value: 'carLoan', label: '车贷', icon: '🚗' }
  ],
  health: [
    { value: 'water', label: '喝水', icon: '💧' },
    { value: 'medicine', label: '吃药', icon: '💊' },
    { value: 'exercise', label: '运动', icon: '🏃' },
    { value: 'checkup', label: '体检', icon: '🩺' },
    { value: 'sleep', label: '睡眠', icon: '😴' }
  ],
  idcard: [
    { value: 'idCard', label: '身份证', icon: '🪪' },
    { value: 'driverLicense', label: '驾照', icon: '🚦' },
    { value: 'passport', label: '护照', icon: '📄' },
    { value: 'carInspection', label: '车辆年检', icon: '🔧' },
    { value: 'carInsurance', label: '车险', icon: '🛡️' },
    { value: 'carMaintenance', label: '车辆保养', icon: '🔩' }
  ],
  anniversary: [
    { value: 'wedding', label: '结婚纪念日', icon: '💍' },
    { value: 'love', label: '恋爱纪念日', icon: '❤️' },
    { value: 'birthday', label: '生日', icon: '🎂' },
    { value: 'festival', label: '传统节日', icon: '🏮' },
    { value: 'custom', label: '自定义', icon: '📌' }
  ]
}

// ===== 重复类型 =====
const REPEAT_TYPES = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthlyDay', label: '每月' },
  { value: 'quarterlyDay', label: '每季度' },
  { value: 'yearly', label: '每年' }
]

// ===== 模糊日期：每月几号选项 (1-31号) =====
const MONTHLY_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: (i + 1) + '号'
}))

// ===== 模糊日期：每周几选项 =====
// value: 1=周一, 2=周二, ..., 7=周日
const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' }
]

// ===== 模糊日期：每年几月选项 =====
const YEARLY_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: (i + 1) + '月'
}))

// ===== 模糊日期：每年几号选项 (1-31号) =====
const YEARLY_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: (i + 1) + '号'
}))

// ===== 模糊日期：季度内第几个月 (1-3月) =====
const QUARTERLY_MONTH_OPTIONS = [
  { value: 1, label: '第1个月' },
  { value: 2, label: '第2个月' },
  { value: 3, label: '第3个月' }
]

// ===== 提前提醒天数选项 =====
const ADVANCE_DAYS_OPTIONS = [
  { value: 0, label: '当天' },
  { value: 1, label: '提前1天' },
  { value: 3, label: '提前3天' },
  { value: 7, label: '提前7天' },
  { value: 15, label: '提前15天' },
  { value: 30, label: '提前30天' },
  { value: 60, label: '提前60天' },
  { value: 90, label: '提前90天' }
]

// ===== 订阅消息模板ID =====
// 从本地 config.js 读取（已被 .gitignore 忽略）
// 模板编号571「日程提醒」类目「备忘录」
// 字段：thing2=提醒内容, thing60=事项名称, date4=日程时间
// 所有分类共用此模板（个人小程序一个模板足够覆盖所有场景）
var appConfig = {}
try { appConfig = require('../config') } catch(e) {}
var TEMPLATE_ID = appConfig.SUBSCRIBE_TEMPLATE_ID || ''

const SUBSCRIBE_TEMPLATE_IDS = {
  bill: TEMPLATE_ID,
  health: TEMPLATE_ID,
  idcard: TEMPLATE_ID,
  anniversary: TEMPLATE_ID,
  default: TEMPLATE_ID
}

// ===== 本地存储键名 =====
const STORAGE_KEYS = {
  REMINDERS: 'reminders_data',
  SETTINGS: 'app_settings',
  PRIVACY_LOCK: 'privacy_lock_enabled',
  PRIVACY_PASSWORD: 'privacy_password',
  LAST_SUBSCRIBE_DATE: 'last_subscribe_date'
}

// ===== 获取分类信息 =====
function getCategory(category) {
  // 兼容旧数据：已移除的 accounting 分类回退为 bill
  if (category === 'accounting') return CATEGORIES.bill
  return CATEGORIES[category] || CATEGORIES.bill
}

// ===== 获取子类型信息 =====
function getSubType(category, subType) {
  const list = SUB_TYPES[category] || []
  return list.find(item => item.value === subType) || { value: subType, label: subType, icon: '📌' }
}

// ===== 获取重复类型标签 =====
function getRepeatLabel(repeatType) {
  // 兼容旧数据：monthly 视为每月
  if (repeatType === 'monthly') return '每月'
  const item = REPEAT_TYPES.find(item => item.value === repeatType)
  return item ? item.label : '不重复'
}

// ===== 获取模糊日期描述 =====
function getFuzzyDateDesc(reminder) {
  if (!reminder.repeatType || reminder.repeatType === 'none') return ''

  // 每月几号
  if (reminder.repeatType === 'monthlyDay' && reminder.monthlyDay) {
    return '每月' + reminder.monthlyDay + '号'
  }
  // 每季度第X月X号
  if (reminder.repeatType === 'quarterlyDay' && reminder.quarterlyMonth && reminder.quarterlyDay) {
    return '每季度第' + reminder.quarterlyMonth + '月' + reminder.quarterlyDay + '号'
  }
  // 每周X：优先用 weekday 字段
  if (reminder.repeatType === 'weekly') {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    let wd = 0
    if (typeof reminder.weekday === 'number' && reminder.weekday >= 1 && reminder.weekday <= 7) {
      // weekday: 1=周一, 2=周二, ..., 7=周日 → 映射到 JS getDay(): 0=日, 1=一, ..., 6=六
      wd = reminder.weekday === 7 ? 0 : reminder.weekday
    } else if (reminder.remindDate) {
      const d = new Date(reminder.remindDate)
      wd = d.getDay()
    }
    return '每周' + weekdays[wd]
  }
  // 每天
  if (reminder.repeatType === 'daily') {
    return '每天'
  }
  // 每年X月X日：优先用 yearlyMonth/yearlyDay 字段
  if (reminder.repeatType === 'yearly') {
    if (reminder.yearlyMonth && reminder.yearlyDay) {
      return '每年' + reminder.yearlyMonth + '月' + reminder.yearlyDay + '日'
    }
    if (reminder.remindDate) {
      const parts = reminder.remindDate.split('-')
      if (parts.length >= 3) {
        return '每年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日'
      }
    }
    // 农历生日/纪念日
    if (reminder.isLunar && reminder.lunarMonth && reminder.lunarDay) {
      return '每年农历' + reminder.lunarMonth + '月' + reminder.lunarDay
    }
    return '每年'
  }
  // 兼容旧数据：monthly
  if (reminder.repeatType === 'monthly') {
    return '每月'
  }
  return ''
}

module.exports = {
  CATEGORIES,
  SUB_TYPES,
  REPEAT_TYPES,
  MONTHLY_DAY_OPTIONS,
  WEEKDAY_OPTIONS,
  YEARLY_MONTH_OPTIONS,
  YEARLY_DAY_OPTIONS,
  QUARTERLY_MONTH_OPTIONS,
  ADVANCE_DAYS_OPTIONS,
  SUBSCRIBE_TEMPLATE_IDS,
  STORAGE_KEYS,
  getCategory,
  getSubType,
  getRepeatLabel,
  getFuzzyDateDesc
}
