// js/mock-wx.js
// mock 微信小程序 API（网页版调试用）
(function () {
  const wx = {}

  // ===== 全局状态（模拟 app.globalData） =====
  const globalData = {
    userInfo: null,
    privacyUnlocked: false,
    pendingCategory: ''
  }
  window.getApp = function () { return { globalData } }

  // ===== Toast =====
  let toastTimer = null
  wx.showToast = function (options) {
    options = options || {}
    const title = options.title || ''
    const icon = options.icon || 'none'
    const duration = options.duration || 1500

    let toast = document.getElementById('mock-toast')
    if (!toast) {
      toast = document.createElement('div')
      toast.id = 'mock-toast'
      toast.className = 'mock-toast'
      document.body.appendChild(toast)
    }

    let html = ''
    if (icon === 'success') {
      html += '<div class="mock-toast-icon mock-toast-success">✓</div>'
    } else if (icon === 'error') {
      html += '<div class="mock-toast-icon mock-toast-error">✕</div>'
    } else if (icon === 'loading') {
      html += '<div class="mock-toast-icon mock-toast-loading">⋯</div>'
    }
    if (title) {
      html += '<div class="mock-toast-title">' + escapeHtml(title) + '</div>'
    }
    toast.innerHTML = html
    toast.classList.add('mock-toast-show')

    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.classList.remove('mock-toast-show')
    }, duration)
  }

  // ===== Modal =====
  wx.showModal = function (options) {
    options = options || {}
    const title = options.title || ''
    const content = options.content || ''
    const confirmText = options.confirmText || '确定'
    const cancelText = options.cancelText || '取消'
    const confirmColor = options.confirmColor || '#4ECDC4'
    const showCancel = options.showCancel !== false

    const mask = document.createElement('div')
    mask.className = 'mock-modal-mask'
    mask.innerHTML =
      '<div class="mock-modal">' +
      (title ? '<div class="mock-modal-title">' + escapeHtml(title) + '</div>' : '') +
      (content ? '<div class="mock-modal-content">' + escapeHtml(content).replace(/\n/g, '<br/>') + '</div>' : '') +
      '<div class="mock-modal-btns">' +
      (showCancel ? '<div class="mock-modal-btn mock-modal-btn-cancel" data-action="cancel">' + escapeHtml(cancelText) + '</div>' : '') +
      '<div class="mock-modal-btn mock-modal-btn-confirm" data-action="confirm" style="color:' + confirmColor + '">' + escapeHtml(confirmText) + '</div>' +
      '</div></div>'
    document.body.appendChild(mask)
    requestAnimationFrame(() => mask.classList.add('mock-modal-show'))

    const close = function (res) {
      mask.classList.remove('mock-modal-show')
      setTimeout(() => { if (mask.parentNode) mask.parentNode.removeChild(mask) }, 200)
      if (typeof options.success === 'function') options.success(res)
    }

    mask.addEventListener('click', function (e) {
      const action = e.target.dataset.action
      if (action === 'confirm') close({ confirm: true, cancel: false })
      else if (action === 'cancel' || e.target === mask) close({ confirm: false, cancel: true })
    })
  }

  // ===== Loading =====
  wx.showLoading = function (options) {
    options = options || {}
    let loading = document.getElementById('mock-loading')
    if (!loading) {
      loading = document.createElement('div')
      loading.id = 'mock-loading'
      loading.className = 'mock-loading'
      loading.innerHTML = '<div class="mock-loading-box"><div class="mock-loading-spinner"></div><div class="mock-loading-text"></div></div>'
      document.body.appendChild(loading)
    }
    loading.querySelector('.mock-loading-text').textContent = options.title || '加载中...'
    loading.style.display = 'flex'
  }

  wx.hideLoading = function () {
    const loading = document.getElementById('mock-loading')
    if (loading) loading.style.display = 'none'
  }

  // ===== 导航 =====
  const PAGE_TO_HASH = {
    'pages/index/index': 'home',
    'pages/list/list': 'list',
    'pages/add/add': 'add',
    'pages/detail/detail': 'detail',
    'pages/mine/mine': 'mine'
  }

  function parseUrl(url) {
    const clean = (url || '').replace(/^\//, '')
    const parts = clean.split('?')
    const path = parts[0]
    const query = {}
    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        const kv = pair.split('=')
        if (kv[0]) query[kv[0]] = decodeURIComponent(kv[1] || '')
      })
    }
    return { path: path, query: query }
  }

  const historyStack = []

  wx.navigateTo = function (options) {
    options = options || {}
    const parsed = parseUrl(options.url)
    const hash = PAGE_TO_HASH[parsed.path]
    if (!hash) { console.warn('未知页面:', parsed.path); return }
    historyStack.push(location.hash || '#home')
    const qs = Object.keys(parsed.query).map(function (k) {
      return k + '=' + encodeURIComponent(parsed.query[k])
    }).join('&')
    location.hash = qs ? '#' + hash + '?' + qs : '#' + hash
  }

  wx.navigateBack = function () {
    if (historyStack.length > 0) {
      const prev = historyStack.pop()
      location.hash = prev
    } else {
      location.hash = '#home'
    }
  }

  wx.switchTab = function (options) {
    options = options || {}
    const parsed = parseUrl(options.url)
    const hash = PAGE_TO_HASH[parsed.path]
    if (hash) {
      historyStack.length = 0
      location.hash = '#' + hash
    }
  }

  wx.reLaunch = function (options) {
    options = options || {}
    const parsed = parseUrl(options.url)
    const hash = PAGE_TO_HASH[parsed.path]
    if (hash) {
      historyStack.length = 0
      const qs = Object.keys(parsed.query).map(function (k) {
        return k + '=' + encodeURIComponent(parsed.query[k])
      }).join('&')
      location.hash = qs ? '#' + hash + '?' + qs : '#' + hash
    }
  }

  wx.setNavigationBarTitle = function (options) {
    document.title = (options && options.title) || '勿忘事项'
  }

  wx.setNavigationBarColor = function () {} // 网页版 noop

  // ===== 存储（用 localStorage） =====
  wx.getStorageSync = function (key) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : ''
    } catch (e) {
      return ''
    }
  }

  wx.setStorageSync = function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error('存储失败', e)
    }
  }

  wx.removeStorageSync = function (key) {
    localStorage.removeItem(key)
  }

  // ===== 剪贴板 =====
  wx.setClipboardData = function (options) {
    options = options || {}
    const text = options.data || ''
    function done() {
      if (typeof options.success === 'function') options.success()
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text); done()
      })
    } else {
      fallbackCopy(text); done()
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    document.body.removeChild(ta)
  }

  wx.getClipboardData = function (options) {
    options = options || {}
    // 浏览器无法直接读剪贴板，提示用户粘贴
    const text = prompt('请粘贴要导入的数据（Ctrl+V）：') || ''
    if (typeof options.success === 'function') {
      options.success({ data: text })
    }
  }

  // ===== 震动 =====
  wx.vibrateShort = function () {
    if (navigator.vibrate) navigator.vibrate(20)
  }

  // ===== 录音管理器（网页版不可用） =====
  wx.getRecorderManager = function () {
    return {
      onStart: function () {},
      onStop: function () {},
      onError: function () {},
      start: function () {
        wx.showToast({ title: '网页版不支持录音', icon: 'none' })
      },
      stop: function () {}
    }
  }

  wx.getSetting = function (options) {
    // 模拟无任何权限
    if (options && typeof options.success === 'function') {
      options.success({ authSetting: {} })
    }
  }

  wx.authorize = function (options) {
    // 模拟授权失败
    if (options && typeof options.fail === 'function') {
      options.fail({ errMsg: 'authorize:fail' })
    }
  }

  wx.openSetting = function () {}

  // wx.cloud 显式不可用（用于 AI 识别分支判断）
  // wx.cloud = undefined

  // ===== 工具 =====
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  window.wx = wx
})()
