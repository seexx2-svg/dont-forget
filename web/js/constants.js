// js/constants.js
// 提醒分类、子类型、重复规则等常量定义（从小程序复用，挂载到 window.constants）

(function () {
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

  // ===== 模糊日期：每月几号 (1-31号) =====
  const MONTHLY_DAY_OPTIONS = Array.from({ length: 31 }, function (_, i) {
    return { value: i + 1, label: (i + 1) + '号' }
  })

  // ===== 模糊日期：季度内第几个月 (1-3月) =====
  const QUARTERLY_MONTH_OPTIONS = [
    { value: 1, label: '第1个月' },
    { value: 2, label: '第2个月' },
    { value: 3, label: '第3个月' }
  ]

  // ===== 提前提醒天数 =====
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

  // ===== 订阅消息模板ID（占位符，网页版不可用） =====
  const SUBSCRIBE_TEMPLATE_IDS = {
    bill: 'template_id_bill',
    health: 'template_id_health',
    idcard: 'template_id_idcard',
    anniversary: 'template_id_anniversary',
    default: 'template_id_default'
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
    if (category === 'accounting') return CATEGORIES.bill
    return CATEGORIES[category] || CATEGORIES.bill
  }

  // ===== 获取子类型信息 =====
  function getSubType(category, subType) {
    const list = SUB_TYPES[category] || []
    const item = list.find(function (s) { return s.value === subType })
    return item || { value: subType, label: subType, icon: '📌' }
  }

  // ===== 获取重复类型标签 =====
  function getRepeatLabel(repeatType) {
    if (repeatType === 'monthly') return '每月'
    const item = REPEAT_TYPES.find(function (r) { return r.value === repeatType })
    return item ? item.label : '不重复'
  }

  // ===== 获取模糊日期描述 =====
  function getFuzzyDateDesc(reminder) {
    if (reminder.repeatType === 'monthlyDay' && reminder.monthlyDay) {
      return '每月' + reminder.monthlyDay + '号'
    }
    if (reminder.repeatType === 'quarterlyDay' && reminder.quarterlyMonth && reminder.quarterlyDay) {
      return '每季度第' + reminder.quarterlyMonth + '月' + reminder.quarterlyDay + '号'
    }
    return ''
  }

  window.constants = {
    CATEGORIES: CATEGORIES,
    SUB_TYPES: SUB_TYPES,
    REPEAT_TYPES: REPEAT_TYPES,
    MONTHLY_DAY_OPTIONS: MONTHLY_DAY_OPTIONS,
    QUARTERLY_MONTH_OPTIONS: QUARTERLY_MONTH_OPTIONS,
    ADVANCE_DAYS_OPTIONS: ADVANCE_DAYS_OPTIONS,
    SUBSCRIBE_TEMPLATE_IDS: SUBSCRIBE_TEMPLATE_IDS,
    STORAGE_KEYS: STORAGE_KEYS,
    getCategory: getCategory,
    getSubType: getSubType,
    getRepeatLabel: getRepeatLabel,
    getFuzzyDateDesc: getFuzzyDateDesc
  }
})()
