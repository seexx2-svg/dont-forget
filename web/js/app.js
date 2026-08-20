// js/app.js
// 主逻辑：路由、页面渲染、事件绑定
(function () {
  const { CATEGORIES, SUB_TYPES, REPEAT_TYPES, ADVANCE_DAYS_OPTIONS,
    MONTHLY_DAY_OPTIONS, QUARTERLY_MONTH_OPTIONS } = window.constants
  const dateUtil = window.dateUtil
  const storage = window.storage
  const reminder = window.reminder

  // ===== 工具 =====
  function $(id) { return document.getElementById(id) }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }
  function escapeAttr(s) { return escapeHtml(s) }

  const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const TAB_PAGES = ['home', 'list', 'mine']

  // ===== 全局状态 =====
  const state = {
    home: { activeTab: 'today', stats: {}, todayList: [], upcomingList: [], overdueList: [], showLockModal: false, lockPasswordInput: '' },
    list: { activeCategory: 'all', keyword: '', showSearch: false, list: [], doneList: [] },
    add: {
      isEdit: false, editId: null,
      form: {
        title: '', category: 'bill', subType: '',
        remindDate: dateUtil.today(), remindTime: '09:00',
        advanceDays: 1, repeatType: 'none', note: '',
        isLunar: false, lunarMonth: 0, lunarDay: 0, lunarIsLeap: false,
        monthlyDay: 0, quarterlyMonth: 0, quarterlyDay: 0
      },
      advanceIndex: 1, repeatIndex: 0,
      lunarMonthIndex: 0, lunarDayIndex: 0,
      monthlyDayIndex: 0, quarterlyMonthIndex: 0, quarterlyDayIndex: 0,
      canLunar: false, dateHint: '', fuzzyPreview: '',
      aiInput: '', aiParsing: false, aiTip: '', textInputVisible: false,
      isRecording: false
    },
    mine: {
      stats: null, settings: {}, privacyLockEnabled: false,
      showPasswordModal: false, passwordInput: '', isSettingPassword: false,
      appVersion: '1.0.0'
    },
    detail: { id: null, reminder: null, isLoading: true, needSubscribe: true }
  }

  // ========================================================================
  // 路由
  // ========================================================================
  function parseHash() {
    const raw = location.hash.slice(1) || 'home'
    const parts = raw.split('?')
    const name = parts[0]
    const query = {}
    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        const kv = pair.split('=')
        if (kv[0]) query[kv[0]] = decodeURIComponent(kv[1] || '')
      })
    }
    return { name: name, query: query }
  }

  function route() {
    const { name, query } = parseHash()
    showPage(name)
    updateTabbar(name)
    // tabBar 显示控制：add/detail 隐藏 tabbar
    const tabbar = $('tabbar')
    if (name === 'add' || name === 'detail') {
      tabbar.style.display = 'none'
    } else {
      tabbar.style.display = 'flex'
    }
    // 调用页面 onShow
    if (name === 'home') onHomeShow()
    else if (name === 'list') onListShow()
    else if (name === 'add') onAddShow(query)
    else if (name === 'detail') onDetailShow(query)
    else if (name === 'mine') onMineShow()
    // 滚动到顶部
    window.scrollTo(0, 0)
  }

  function showPage(name) {
    document.querySelectorAll('.page-view').forEach(function (p) { p.classList.remove('active') })
    const page = $('page-' + name)
    if (page) page.classList.add('active')
  }

  function updateTabbar(name) {
    document.querySelectorAll('.tabbar-item').forEach(function (item) {
      if (item.dataset.hash === name) item.classList.add('active')
      else item.classList.remove('active')
    })
  }

  function go(hash) {
    location.hash = '#' + hash
  }

  // ========================================================================
  // 提醒卡片渲染
  // ========================================================================
  function renderReminderCard(r) {
    const cls = ['reminder-card']
    if (r.done) cls.push('is-done')
    if (r.isOverdue) cls.push('is-overdue')

    let bottomHtml = ''
    if (r.isOverdue) {
      bottomHtml += '<div class="overdue-badge">已逾期</div>'
    } else if (r.isToday) {
      bottomHtml += '<div class="today-badge" style="color:' + escapeAttr(r.categoryColor) + '">今天</div>'
    } else if (r.daysLeft > 0) {
      bottomHtml += '<div class="days-left" style="color:' + escapeAttr(r.categoryColor) + '">' +
        '<span class="days-num">' + r.daysLeft + '</span><span class="days-unit">天</span></div>'
    }
    if (r.repeatType && r.repeatType !== 'none') {
      bottomHtml += '<span class="repeat-tag">🔁 ' + escapeHtml(r.repeatLabel) + '</span>'
    }

    return '' +
      '<div class="' + cls.join(' ') + '" data-id="' + escapeAttr(r._id) + '">' +
        (r.isOverdue ? '<div class="overdue-line"></div>' : '') +
        '<div class="card-icon" style="background:' + escapeAttr(r.categoryBg) + '">' +
          '<span class="icon-emoji">' + escapeHtml(r.categoryIcon) + '</span>' +
        '</div>' +
        '<div class="card-content flex-1">' +
          '<span class="card-title ' + (r.done ? 'title-done' : '') + '">' + escapeHtml(r.title) + '</span>' +
          '<div class="card-meta">' +
            '<span class="sub-tag" style="color:' + escapeAttr(r.categoryColor) + ';background:' + escapeAttr(r.categoryBg) + '">' +
              escapeHtml(r.subTypeIcon) + ' ' + escapeHtml(r.subTypeLabel) + '</span>' +
            '<span class="card-date">' + escapeHtml(r.friendlyDate) + '</span>' +
            (r.remindTime ? '<span class="card-time">· ' + escapeHtml(r.remindTime) + '</span>' : '') +
          '</div>' +
          (r.lunarDesc ? '<div class="card-lunar">🗓 ' + escapeHtml(r.lunarDesc) + '</div>' : '') +
          '<div class="card-bottom">' + bottomHtml + '</div>' +
        '</div>' +
        '<div class="done-btn ' + (r.done ? 'done-active' : '') + '" data-done-id="' + escapeAttr(r._id) + '">' +
          '<span class="done-icon">' + (r.done ? '✓' : '○') + '</span>' +
        '</div>' +
      '</div>'
  }

  // 绑定提醒卡片事件（点击跳详情、点击完成按钮、长按删除）
  function bindCardEvents(container, opts) {
    opts = opts || {}
    const cards = container.querySelectorAll('.reminder-card')
    cards.forEach(function (card) {
      // 长按删除
      let longPressTimer = null
      let longPressTriggered = false
      const startLongPress = function (e) {
        if (e.target.closest('.done-btn')) return
        longPressTriggered = false
        longPressTimer = setTimeout(function () {
          if (longPressTimer === null) return
          longPressTimer = null
          longPressTriggered = true
          const id = card.dataset.id
          if (typeof opts.onLongPress === 'function') opts.onLongPress(id)
        }, 600)
      }
      const cancelLongPress = function () { longPressTimer = null }
      card.addEventListener('mousedown', startLongPress)
      card.addEventListener('touchstart', startLongPress)
      card.addEventListener('mouseup', cancelLongPress)
      card.addEventListener('mouseleave', cancelLongPress)
      card.addEventListener('touchend', cancelLongPress)
      card.addEventListener('touchmove', cancelLongPress)

      // 点击卡片 → 详情（长按触发后跳过本次 click）
      card.addEventListener('click', function (e) {
        if (e.target.closest('.done-btn')) return
        if (longPressTriggered) { longPressTriggered = false; return }
        const id = card.dataset.id
        go('detail?id=' + encodeURIComponent(id))
      })

      // 完成按钮
      const doneBtn = card.querySelector('.done-btn')
      if (doneBtn) {
        doneBtn.addEventListener('click', function (e) {
          e.stopPropagation()
          const id = doneBtn.dataset.doneId
          storage.toggleDone(id)
          if (typeof opts.onDone === 'function') opts.onDone()
          else route()
        })
      }
    })
  }

  // ========================================================================
  // 首页
  // ========================================================================
  function onHomeShow() {
    reminder.checkAndUpdateExpired()
    const now = new Date()
    $('home-display-date').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + WEEK_DAYS[now.getDay()]

    // 隐私锁拦截
    const app = getApp()
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      state.home.showLockModal = true
      state.home.lockPasswordInput = ''
      showHomeLockModal()
      return
    }
    state.home.showLockModal = false
    hideHomeLockModal()
    loadHomeData()
  }

  function loadHomeData() {
    state.home.todayList = reminder.getTodayReminders()
    state.home.upcomingList = reminder.getUpcomingReminders(7)
    state.home.overdueList = reminder.getOverdueReminders()
    state.home.stats = reminder.getStats()
    renderHome()
  }

  function renderHome() {
    const s = state.home
    // 统计卡片
    const statsRow = $('home-stats-row')
    statsRow.innerHTML =
      '<div class="stat-card"><span class="stat-num">' + (s.stats.today || 0) + '</span><span class="stat-label">今日</span></div>' +
      '<div class="stat-card"><span class="stat-num">' + (s.stats.upcoming || 0) + '</span><span class="stat-label">即将</span></div>' +
      '<div class="stat-card"><span class="stat-num ' + (s.stats.overdue ? 'num-danger' : '') + '">' + (s.stats.overdue || 0) + '</span><span class="stat-label">逾期</span></div>'

    // Tab 栏
    const tabBar = $('home-tab-bar')
    tabBar.innerHTML =
      '<div class="tab-item ' + (s.activeTab === 'today' ? 'tab-active' : '') + '" data-tab="today">' +
        '<span>今日</span>' + (s.stats.today ? '<span class="tab-badge">' + s.stats.today + '</span>' : '') +
      '</div>' +
      '<div class="tab-item ' + (s.activeTab === 'upcoming' ? 'tab-active' : '') + '" data-tab="upcoming">' +
        '<span>即将到期</span>' + (s.stats.upcoming ? '<span class="tab-badge">' + s.stats.upcoming + '</span>' : '') +
      '</div>' +
      '<div class="tab-item ' + (s.activeTab === 'overdue' ? 'tab-active' : '') + '" data-tab="overdue">' +
        '<span>已逾期</span>' + (s.stats.overdue ? '<span class="tab-badge badge-danger">' + s.stats.overdue + '</span>' : '') +
      '</div>'
    tabBar.querySelectorAll('.tab-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const tab = item.dataset.tab
        if (tab === s.activeTab) return
        s.activeTab = tab
        renderHome()
      })
    })

    // 列表
    const wrap = $('home-list-wrap')
    let list = []
    let emptyIcon = '🎉', emptyText = '今天没有提醒，好好享受这一天～'
    if (s.activeTab === 'today') { list = s.todayList; emptyIcon = '🎉'; emptyText = '今天没有提醒，好好享受这一天～' }
    else if (s.activeTab === 'upcoming') { list = s.upcomingList; emptyIcon = '📅'; emptyText = '未来7天暂无即将到期的提醒' }
    else if (s.activeTab === 'overdue') { list = s.overdueList; emptyIcon = '✅'; emptyText = '没有逾期提醒，保持得很棒！' }

    if (list.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><span class="empty-icon">' + emptyIcon + '</span><span class="empty-text">' + emptyText + '</span></div>'
    } else {
      wrap.innerHTML = list.map(renderReminderCard).join('')
      bindCardEvents(wrap, { onDone: loadHomeData })
    }
  }

  function showHomeLockModal() {
    let modal = document.getElementById('home-lock-modal')
    if (!modal) {
      modal = document.createElement('div')
      modal.id = 'home-lock-modal'
      modal.className = 'lock-mask'
      modal.innerHTML =
        '<div class="lock-card">' +
          '<div class="lock-icon">🔒</div>' +
          '<div class="lock-title">隐私锁已开启</div>' +
          '<div class="lock-desc">请输入4位数字密码以查看提醒内容</div>' +
          '<div class="lock-input-box"><input class="lock-input" id="home-lock-input" type="tel" maxlength="4" placeholder="••••" /></div>' +
          '<div class="lock-btn" id="home-lock-btn">解锁</div>' +
        '</div>'
      document.body.appendChild(modal)
      const input = $('home-lock-input')
      const btn = $('home-lock-btn')
      input.addEventListener('input', function (e) {
        const v = (e.target.value || '').replace(/\D/g, '').slice(0, 4)
        e.target.value = v
        state.home.lockPasswordInput = v
      })
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmHomeLock() })
      btn.addEventListener('click', confirmHomeLock)
    }
    modal.style.display = 'flex'
    setTimeout(function () { const i = $('home-lock-input'); if (i) { i.value = ''; i.focus() } }, 50)
  }

  function hideHomeLockModal() {
    const modal = document.getElementById('home-lock-modal')
    if (modal) modal.style.display = 'none'
  }

  function confirmHomeLock() {
    const input = state.home.lockPasswordInput
    if (!/^\d{4}$/.test(input)) {
      wx.showToast({ title: '请输入4位数字密码', icon: 'none' })
      return
    }
    const saved = storage.getPrivacyPassword()
    if (input === saved) {
      const app = getApp()
      app.globalData.privacyUnlocked = true
      state.home.showLockModal = false
      state.home.lockPasswordInput = ''
      hideHomeLockModal()
      loadHomeData()
      wx.showToast({ title: '已解锁', icon: 'success' })
    } else {
      wx.showToast({ title: '密码错误', icon: 'none' })
      state.home.lockPasswordInput = ''
      const i = $('home-lock-input'); if (i) i.value = ''
    }
  }

  // ========================================================================
  // 列表页
  // ========================================================================
  function onListShow() {
    const app = getApp()
    // 隐私锁
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      go('home')
      return
    }
    // 跨页传递分类
    if (app.globalData && app.globalData.pendingCategory) {
      state.list.activeCategory = app.globalData.pendingCategory
      state.list.keyword = ''
      $('list-search-input').value = ''
      state.list.showSearch = false
      $('list-search-wrap').classList.add('search-hide')
      $('list-search-wrap').classList.remove('search-show')
      $('list-search-toggle').textContent = '搜索'
      app.globalData.pendingCategory = ''
    }
    // 每次进入都重新渲染分类栏，确保高亮正确
    renderListCategories()
    loadListData()
  }

  function renderListCategories() {
    const cats = [{ value: 'all', label: '全部', icon: '📋', color: '#4ECDC4', bg: '#E8F8F7' }]
    Object.keys(CATEGORIES).forEach(function (key) {
      cats.push({
        value: key, label: CATEGORIES[key].name, icon: CATEGORIES[key].icon,
        color: CATEGORIES[key].color, bg: CATEGORIES[key].bg
      })
    })
    const bar = $('list-category-bar')
    bar.innerHTML = '<div class="cat-list">' + cats.map(function (item) {
      const active = state.list.activeCategory === item.value
      const style = active
        ? 'background:' + item.color + ';color:#FFFFFF;'
        : 'color:' + item.color + ';'
      return '<div class="cat-item ' + (active ? 'cat-active' : '') + '" data-cat="' + escapeAttr(item.value) + '" style="' + style + '">' +
        '<span class="cat-icon">' + item.icon + '</span><span class="cat-label">' + escapeHtml(item.label) + '</span></div>'
    }).join('') + '</div>'

    bar.querySelectorAll('.cat-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const cat = item.dataset.cat
        if (cat === state.list.activeCategory && !state.list.keyword) return
        state.list.activeCategory = cat
        state.list.keyword = ''
        $('list-search-input').value = ''
        renderListCategories()
        loadListData()
      })
    })
  }

  function loadListData() {
    let all
    if (state.list.keyword) {
      all = reminder.search(state.list.keyword)
    } else {
      all = reminder.getByCategory(state.list.activeCategory)
    }
    state.list.list = all.filter(function (r) { return !r.done })
    state.list.doneList = all.filter(function (r) { return r.done })
    renderList()
  }

  function renderList() {
    const s = state.list
    const wrap = $('list-content')
    let html = ''
    if (s.list.length) {
      html += s.list.map(renderReminderCard).join('')
    } else {
      html += '<div class="empty-state"><span class="empty-icon">📝</span><span class="empty-text">' +
        (s.keyword ? '没有找到匹配的提醒' : '该分类下还没有提醒') + '</span></div>'
    }
    if (s.doneList.length) {
      html += '<div class="done-section"><div class="done-header"><span class="done-title">已完成 (' + s.doneList.length + ')</span></div>'
      html += s.doneList.map(renderReminderCard).join('')
      html += '</div>'
    }
    wrap.innerHTML = html
    bindCardEvents(wrap, {
      onDone: loadListData,
      onLongPress: function (id) {
        wx.showModal({
          title: '删除提醒',
          content: '确定要删除这条提醒吗？删除后不可恢复。',
          confirmText: '删除',
          confirmColor: '#FF6B6B',
          success: function (res) {
            if (res.confirm) {
              storage.deleteReminder(id)
              loadListData()
            }
          }
        })
      }
    })
  }

  // ========================================================================
  // 添加/编辑页
  // ========================================================================
  function onAddShow(query) {
    // 隐私锁拦截
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      location.hash = '#home'
      return
    }
    if (query.id) {
      state.add.isEdit = true
      state.add.editId = query.id
      loadEditData(query.id)
      // 编辑时确保子类型列表与当前分类匹配
      loadSubTypes(state.add.form.category, false)
    } else {
      state.add.isEdit = false
      state.add.editId = null
      resetAddForm()
      // 新建时初始化 bill 分类的子类型，并选中第一个
      loadSubTypes('bill', true)
      refreshCanLunar()
      refreshFuzzyPreview()
      syncDateHint()
    }
    initAddFormOnce()
    refreshAddView()
  }

  function resetAddForm() {
    state.add.form = {
      title: '', category: 'bill', subType: '',
      remindDate: dateUtil.today(), remindTime: '09:00',
      advanceDays: 1, repeatType: 'none', note: '',
      isLunar: false, lunarMonth: 0, lunarDay: 0, lunarIsLeap: false,
      monthlyDay: 0, quarterlyMonth: 0, quarterlyDay: 0
    }
    state.add.advanceIndex = 1
    state.add.repeatIndex = 0
    state.add.lunarMonthIndex = 0
    state.add.lunarDayIndex = 0
    state.add.monthlyDayIndex = 0
    state.add.quarterlyMonthIndex = 0
    state.add.quarterlyDayIndex = 0
    state.add.canLunar = false
    state.add.aiInput = ''
    state.add.aiTip = ''
    state.add.textInputVisible = false
    $('add-title').value = ''
    $('add-note').value = ''
    $('add-ai-input').value = ''
    $('add-ai-tip-row').style.display = 'none'
    $('add-ai-tip').textContent = ''
    $('add-text-wrap').style.display = 'none'
    $('add-text-toggle').textContent = '改用文字输入 ›'
    $('add-save-btn').textContent = '保存提醒'
    $('add-delete-btn').style.display = 'none'
  }

  function loadEditData(id) {
    const reminders = storage.getReminders()
    const r = reminders.find(function (item) { return item._id === id })
    if (!r) {
      wx.showToast({ title: '提醒不存在', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1000)
      return
    }
    let editRepeatType = r.repeatType || 'none'
    let editMonthlyDay = r.monthlyDay || 0
    if (editRepeatType === 'monthly') {
      editRepeatType = 'monthlyDay'
      if (!editMonthlyDay) editMonthlyDay = parseInt((r.remindDate || '').split('-')[2]) || 1
    }
    const advanceIndex = Math.max(0, ADVANCE_DAYS_OPTIONS.findIndex(function (o) { return o.value === r.advanceDays }))
    const repeatIndex = Math.max(0, REPEAT_TYPES.findIndex(function (o) { return o.value === editRepeatType }))
    state.add.advanceIndex = advanceIndex
    state.add.repeatIndex = repeatIndex
    state.add.lunarMonthIndex = r.lunarMonth ? r.lunarMonth - 1 : 0
    state.add.lunarDayIndex = r.lunarDay ? r.lunarDay - 1 : 0
    state.add.monthlyDayIndex = editMonthlyDay ? editMonthlyDay - 1 : 0
    state.add.quarterlyMonthIndex = r.quarterlyMonth ? r.quarterlyMonth - 1 : 0
    state.add.quarterlyDayIndex = r.quarterlyDay ? r.quarterlyDay - 1 : 0
    state.add.form = {
      title: r.title || '', category: r.category || 'bill', subType: r.subType || '',
      remindDate: r.remindDate || dateUtil.today(), remindTime: r.remindTime || '09:00',
      advanceDays: r.advanceDays !== undefined ? r.advanceDays : 1,
      repeatType: editRepeatType, note: r.note || '',
      isLunar: !!r.isLunar, lunarMonth: r.lunarMonth || 0, lunarDay: r.lunarDay || 0,
      lunarIsLeap: !!r.lunarIsLeap,
      monthlyDay: editMonthlyDay, quarterlyMonth: r.quarterlyMonth || 0, quarterlyDay: r.quarterlyDay || 0
    }
    $('add-title').value = state.add.form.title
    $('add-note').value = state.add.form.note
    $('add-save-btn').textContent = '保存修改'
    $('add-delete-btn').style.display = 'block'
    document.title = '编辑提醒 - 勿忘事项'
  }

  let addFormInitialized = false
  function initAddFormOnce() {
    if (addFormInitialized) return
    addFormInitialized = true

    // 提前提醒选项
    const advanceSel = $('add-advance')
    advanceSel.innerHTML = ADVANCE_DAYS_OPTIONS.map(function (o, i) {
      return '<option value="' + i + '">' + escapeHtml(o.label) + '</option>'
    }).join('')
    advanceSel.addEventListener('change', function (e) {
      const i = Number(e.target.value)
      state.add.advanceIndex = i
      state.add.form.advanceDays = ADVANCE_DAYS_OPTIONS[i] ? ADVANCE_DAYS_OPTIONS[i].value : 1
    })

    // 重复类型
    const repeatSel = $('add-repeat')
    repeatSel.innerHTML = REPEAT_TYPES.map(function (o, i) {
      return '<option value="' + i + '">' + escapeHtml(o.label) + '</option>'
    }).join('')
    repeatSel.addEventListener('change', function (e) {
      const i = Number(e.target.value)
      const opt = REPEAT_TYPES[i]
      const form = state.add.form
      form.repeatType = opt ? opt.value : 'none'
      if (form.repeatType === 'monthlyDay' && !form.monthlyDay) form.monthlyDay = 1
      if (form.repeatType === 'quarterlyDay') {
        if (!form.quarterlyMonth) form.quarterlyMonth = 1
        if (!form.quarterlyDay) form.quarterlyDay = 1
      }
      state.add.repeatIndex = i
      refreshCanLunar()
      refreshFuzzyPreview()
      refreshAddView()
    })

    // 模糊日期：每月几号
    const monthlySel = $('add-monthly-day')
    monthlySel.innerHTML = MONTHLY_DAY_OPTIONS.map(function (o, i) {
      return '<option value="' + i + '">' + escapeHtml(o.label) + '</option>'
    }).join('')
    monthlySel.addEventListener('change', function (e) {
      const i = Number(e.target.value)
      state.add.monthlyDayIndex = i
      state.add.form.monthlyDay = MONTHLY_DAY_OPTIONS[i].value
      refreshFuzzyPreview()
      refreshAddView()
    })

    // 季度内月份
    const qMonthSel = $('add-quarterly-month')
    qMonthSel.innerHTML = QUARTERLY_MONTH_OPTIONS.map(function (o, i) {
      return '<option value="' + i + '">' + escapeHtml(o.label) + '</option>'
    }).join('')
    qMonthSel.addEventListener('change', function (e) {
      const i = Number(e.target.value)
      state.add.quarterlyMonthIndex = i
      state.add.form.quarterlyMonth = QUARTERLY_MONTH_OPTIONS[i].value
      refreshFuzzyPreview()
      refreshAddView()
    })

    // 季度内几号
    const qDaySel = $('add-quarterly-day')
    qDaySel.innerHTML = MONTHLY_DAY_OPTIONS.map(function (o, i) {
      return '<option value="' + i + '">' + escapeHtml(o.label) + '</option>'
    }).join('')
    qDaySel.addEventListener('change', function (e) {
      const i = Number(e.target.value)
      state.add.quarterlyDayIndex = i
      state.add.form.quarterlyDay = MONTHLY_DAY_OPTIONS[i].value
      refreshFuzzyPreview()
      refreshAddView()
    })

    // 农历月份
    const lunarMonthSel = $('add-lunar-month')
    lunarMonthSel.innerHTML = Array.from({ length: 12 }, function (_, i) { return (i + 1) + '月' })
      .map(function (label, i) { return '<option value="' + i + '">' + label + '</option>' }).join('')
    lunarMonthSel.addEventListener('change', function (e) {
      const i = Number(e.target.value)
      state.add.lunarMonthIndex = i
      state.add.form.lunarMonth = i + 1
    })

    // 农历日
    const lunarDaySel = $('add-lunar-day')
    lunarDaySel.innerHTML = Array.from({ length: 30 }, function (_, i) { return (i + 1) + '日' })
      .map(function (label, i) { return '<option value="' + i + '">' + label + '</option>' }).join('')
    lunarDaySel.addEventListener('change', function (e) {
      const i = Number(e.target.value)
      state.add.lunarDayIndex = i
      state.add.form.lunarDay = i + 1
    })

    // 标题
    $('add-title').addEventListener('input', function (e) { state.add.form.title = e.target.value })

    // 日期
    $('add-date').addEventListener('change', function (e) {
      state.add.form.remindDate = e.target.value
      syncDateHint()
      refreshAddView()
    })

    // 时间
    $('add-time').addEventListener('change', function (e) { state.add.form.remindTime = e.target.value })

    // 备注
    $('add-note').addEventListener('input', function (e) { state.add.form.note = e.target.value })

    // 农历开关
    $('add-lunar-switch').addEventListener('click', function () {
      if (!state.add.canLunar) return
      toggleSwitch('add-lunar-switch', function (checked) {
        const form = state.add.form
        if (checked && !form.lunarMonth) {
          form.isLunar = true; form.lunarMonth = 1; form.lunarDay = 1
          state.add.lunarMonthIndex = 0; state.add.lunarDayIndex = 0
        } else {
          form.isLunar = checked
        }
        refreshAddView()
      })
    })

    // 闰月开关
    $('add-lunar-leap').addEventListener('click', function () {
      toggleSwitch('add-lunar-leap', function (checked) {
        state.add.form.lunarIsLeap = checked
      })
    })

    // 分类选择
    renderAddCategories()

    // 文字输入切换
    $('add-text-toggle').addEventListener('click', function () {
      state.add.textInputVisible = !state.add.textInputVisible
      $('add-text-wrap').style.display = state.add.textInputVisible ? 'block' : 'none'
      $('add-text-toggle').textContent = state.add.textInputVisible ? '收起文字输入' : '改用文字输入 ›'
    })

    // AI 输入
    $('add-ai-input').addEventListener('input', function (e) { state.add.aiInput = e.target.value })

    // AI 解析按钮
    $('add-ai-parse-btn').addEventListener('click', onAIParse)

    // 录音按钮：网页版不可用，点击提示
    $('add-voice-btn').addEventListener('click', function () {
      wx.showToast({ title: '网页版不支持录音，请改用文字输入', icon: 'none', duration: 2000 })
    })

    // 保存按钮
    $('add-save-btn').addEventListener('click', onAddSave)

    // 删除按钮
    $('add-delete-btn').addEventListener('click', onAddDelete)
  }

  function toggleSwitch(id, cb) {
    const el = $(id)
    if (el.classList.contains('disabled')) return
    const on = el.classList.toggle('on')
    cb(on)
  }
  function setSwitch(id, on, disabled) {
    const el = $(id)
    if (on) el.classList.add('on'); else el.classList.remove('on')
    if (disabled) el.classList.add('disabled'); else el.classList.remove('disabled')
  }

  function renderAddCategories() {
    const scroll = $('add-category-scroll')
    scroll.innerHTML = '<div class="category-list">' + Object.entries(CATEGORIES).map(function (entry) {
      const key = entry[0], val = entry[1]
      const active = state.add.form.category === key
      const style = 'background:' + (active ? val.bg : '#FFFFFF') + ';border-color:' + (active ? val.color : '#EEEEEE') + ';'
      const nameColor = active ? val.color : '#333333'
      return '<div class="category-card ' + (active ? 'category-active' : '') + '" data-key="' + key + '" style="' + style + '">' +
        '<div class="category-icon" style="background:' + val.bg + ';"><span>' + val.icon + '</span></div>' +
        '<span class="category-name" style="color:' + nameColor + ';">' + escapeHtml(val.name) + '</span></div>'
    }).join('') + '</div>'
    scroll.querySelectorAll('.category-card').forEach(function (card) {
      card.addEventListener('click', function () {
        state.add.form.category = card.dataset.key
        loadSubTypes(card.dataset.key, true)
        refreshCanLunar()
        renderAddCategories()
        renderAddSubTypes()
        refreshAddView()
      })
    })
  }

  function renderAddSubTypes() {
    const cat = state.add.form.category
    const subTypes = SUB_TYPES[cat] || []
    const grid = $('add-subtype-grid')
    grid.innerHTML = subTypes.map(function (item) {
      const active = state.add.form.subType === item.value
      return '<div class="subtype-item ' + (active ? 'subtype-active' : '') + '" data-value="' + escapeAttr(item.value) + '">' +
        '<div class="subtype-icon-wrap"><span class="subtype-icon">' + item.icon + '</span></div>' +
        '<span class="subtype-label">' + escapeHtml(item.label) + '</span></div>'
    }).join('')
    grid.querySelectorAll('.subtype-item').forEach(function (item) {
      item.addEventListener('click', function () {
        state.add.form.subType = item.dataset.value
        renderAddSubTypes()
      })
    })
  }

  function loadSubTypes(category, pickFirst) {
    const subTypes = SUB_TYPES[category] || []
    const form = state.add.form
    const exists = subTypes.some(function (s) { return s.value === form.subType })
    if (pickFirst || !exists) {
      form.subType = subTypes.length ? subTypes[0].value : ''
    }
  }

  function refreshCanLunar() {
    const { category, repeatType } = state.add.form
    const canLunar = category === 'anniversary' && repeatType === 'yearly'
    state.add.canLunar = canLunar
    if (!canLunar && state.add.form.isLunar) state.add.form.isLunar = false
  }

  function refreshFuzzyPreview() {
    const { repeatType, monthlyDay, quarterlyMonth, quarterlyDay } = state.add.form
    if (repeatType === 'monthlyDay' && monthlyDay) {
      const d = reminder.calcFuzzyRemindDate('monthlyDay', monthlyDay)
      state.add.fuzzyPreview = d || '将自动计算'
    } else if (repeatType === 'quarterlyDay' && quarterlyMonth && quarterlyDay) {
      const d = reminder.calcFuzzyRemindDate('quarterlyDay', 0, quarterlyMonth, quarterlyDay)
      state.add.fuzzyPreview = d || '将自动计算'
    } else {
      state.add.fuzzyPreview = ''
    }
  }

  function syncDateHint() {
    const { remindDate, isLunar } = state.add.form
    if (isLunar) { state.add.dateHint = '农历提醒'; return }
    try { state.add.dateHint = dateUtil.friendlyDate(remindDate) }
    catch (e) { state.add.dateHint = '' }
  }

  function refreshAddView() {
    const s = state.add
    // 同步表单控件值
    $('add-advance').value = String(s.advanceIndex)
    $('add-repeat').value = String(s.repeatIndex)
    $('add-monthly-day').value = String(s.monthlyDayIndex)
    $('add-quarterly-month').value = String(s.quarterlyMonthIndex)
    $('add-quarterly-day').value = String(s.quarterlyDayIndex)
    $('add-lunar-month').value = String(s.lunarMonthIndex)
    $('add-lunar-day').value = String(s.lunarDayIndex)
    $('add-date').value = s.form.remindDate
    $('add-time').value = s.form.remindTime

    // 隐藏/显示 日期选择（模糊日期类型时不显示）
    const isFuzzy = s.form.repeatType === 'monthlyDay' || s.form.repeatType === 'quarterlyDay'
    $('add-date-item').style.display = isFuzzy ? 'none' : 'flex'
    $('add-date-divider').style.display = isFuzzy ? 'none' : 'block'

    // 模糊日期卡片
    $('add-monthly-card').style.display = s.form.repeatType === 'monthlyDay' ? 'block' : 'none'
    $('add-quarterly-card').style.display = s.form.repeatType === 'quarterlyDay' ? 'block' : 'none'
    if (s.form.repeatType === 'monthlyDay') {
      $('add-monthly-preview').textContent = '最近提醒日：' + (s.fuzzyPreview || '将自动计算')
    }
    if (s.form.repeatType === 'quarterlyDay') {
      $('add-quarterly-preview').textContent = '最近提醒日：' + (s.fuzzyPreview || '将自动计算')
    }

    // 农历
    setSwitch('add-lunar-switch', s.form.isLunar, !s.canLunar)
    setSwitch('add-lunar-leap', s.form.lunarIsLeap, false)
    $('add-lunar-tip').style.display = s.canLunar ? 'none' : 'inline'
    $('add-lunar-fields').style.display = (s.form.isLunar && s.canLunar) ? 'block' : 'none'

    // 子类型
    renderAddSubTypes()

    // 日期提示
    syncDateHint()
    $('add-date-hint').textContent = s.dateHint
  }

  function onAIParse() {
    const text = (state.add.aiInput || '').trim()
    if (!text) { wx.showToast({ title: '请输入提醒描述', icon: 'none' }); return }
    if (state.add.aiParsing) return
    if (!window.wx.cloud) {
      // 网页版不支持
      state.add.aiTip = '网页版暂不支持云函数调用，请在小程序中使用 AI 识别'
      $('add-ai-tip-row').style.display = 'block'
      $('add-ai-tip').textContent = state.add.aiTip
      wx.showToast({ title: '网页版不支持云函数', icon: 'none', duration: 2000 })
      return
    }
  }

  function validateAddForm() {
    const f = state.add.form
    if (!f.title || !f.title.trim()) { wx.showToast({ title: '请输入提醒标题', icon: 'none' }); return false }
    if (f.isLunar && (!f.lunarMonth || !f.lunarDay)) { wx.showToast({ title: '请选择农历月日', icon: 'none' }); return false }
    if (f.repeatType === 'monthlyDay' && !f.monthlyDay) { wx.showToast({ title: '请选择每月几号', icon: 'none' }); return false }
    if (f.repeatType === 'quarterlyDay' && (!f.quarterlyMonth || !f.quarterlyDay)) { wx.showToast({ title: '请选择季度日期', icon: 'none' }); return false }
    return true
  }

  function onAddSave() {
    if (!validateAddForm()) return
    const f = state.add.form
    const data = {
      title: f.title.trim(),
      category: f.category, subType: f.subType,
      remindDate: f.remindDate, remindTime: f.remindTime,
      advanceDays: f.advanceDays, repeatType: f.repeatType,
      note: f.note, isLunar: f.isLunar,
      lunarMonth: f.isLunar ? f.lunarMonth : 0,
      lunarDay: f.isLunar ? f.lunarDay : 0,
      lunarIsLeap: f.isLunar ? f.lunarIsLeap : false,
      monthlyDay: f.repeatType === 'monthlyDay' ? f.monthlyDay : 0,
      quarterlyMonth: f.repeatType === 'quarterlyDay' ? f.quarterlyMonth : 0,
      quarterlyDay: f.repeatType === 'quarterlyDay' ? f.quarterlyDay : 0
    }
    wx.showLoading({ title: '保存中...', mask: true })
    try {
      if (state.add.isEdit) {
        reminder.updateReminder(state.add.editId, data)
      } else {
        reminder.createReminder(data)
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      // 订阅消息网页版不支持，跳过
      setTimeout(function () { wx.navigateBack() }, 800)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error(e)
    }
  }

  function onAddDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这个提醒吗？',
      confirmColor: '#FF6B6B',
      success: function (res) {
        if (res.confirm) {
          storage.deleteReminder(state.add.editId)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(function () { wx.navigateBack() }, 800)
        }
      }
    })
  }

  // ========================================================================
  // 详情页
  // ========================================================================
  function onDetailShow(query) {
    // 隐私锁拦截
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      location.hash = '#home'
      return
    }
    if (query.id) state.detail.id = query.id
    loadDetail()
  }

  function loadDetail() {
    const reminders = storage.getReminders()
    const raw = reminders.find(function (item) { return item._id === state.detail.id })
    if (!raw) {
      wx.showToast({ title: '提醒不存在', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1000)
      return
    }
    const decorated = reminder.decorateReminder(raw)
    state.detail.reminder = decorated
    state.detail.isLoading = false

    let countdownText = '', countdownSub = ''
    if (decorated.done) {
      countdownText = '已完成'; countdownSub = '点击下方按钮可重新开启'
    } else if (decorated.daysLeft === 0) {
      countdownText = '今天'; countdownSub = '就是今天'
    } else if (decorated.daysLeft > 0) {
      countdownText = '还有' + decorated.daysLeft + '天'; countdownSub = decorated.friendlyDate
    } else {
      countdownText = '已逾期'; countdownSub = '已逾期 ' + Math.abs(decorated.daysLeft) + ' 天'
    }
    const advanceItem = ADVANCE_DAYS_OPTIONS.find(function (o) { return o.value === decorated.advanceDays })
    const advanceLabel = advanceItem ? advanceItem.label : '当天'
    let createdDate = ''
    if (decorated.createdAt) {
      const d = new Date(decorated.createdAt)
      createdDate = dateUtil.formatDate(d) + ' ' + dateUtil.formatTime(d)
    }

    $('detail-loading').style.display = 'none'
    const content = $('detail-content')
    content.style.display = 'block'
    const r = decorated
    let heroTags = '<div class="hero-tag">' + escapeHtml(r.categoryName) + '</div>'
    if (r.subTypeLabel) {
      heroTags += '<div class="hero-tag"><span class="hero-tag-icon">' + escapeHtml(r.subTypeIcon) + '</span>' + escapeHtml(r.subTypeLabel) + '</div>'
    }

    let infoHtml = '' +
      '<div class="info-item"><span class="info-label">提醒日期</span>' +
        '<div class="info-value-wrap"><span class="info-value">' + escapeHtml(r.remindDate) + '</span>' +
        '<span class="info-extra">' + escapeHtml(r.friendlyDate) + '</span></div></div>' +
      '<div class="info-divider"></div>' +
      '<div class="info-item"><span class="info-label">提醒时间</span><span class="info-value">' + escapeHtml(r.remindTime) + '</span></div>' +
      '<div class="info-divider"></div>' +
      '<div class="info-item"><span class="info-label">提前提醒</span><span class="info-value">' + escapeHtml(advanceLabel) + '</span></div>' +
      '<div class="info-divider"></div>' +
      '<div class="info-item"><span class="info-label">重复类型</span><span class="info-value">' + escapeHtml(r.repeatLabel) + '</span></div>'

    if (r.fuzzyDateDesc) {
      infoHtml += '<div class="info-divider"></div><div class="info-item"><span class="info-label">重复规则</span><span class="info-value">' + escapeHtml(r.fuzzyDateDesc) + '</span></div>'
    }
    if (r.isLunar && r.lunarDesc) {
      infoHtml += '<div class="info-divider"></div><div class="info-item"><span class="info-label">农历信息</span><span class="info-value">' + escapeHtml(r.lunarDesc) + '</span></div>'
    }
    infoHtml += '<div class="info-divider"></div><div class="info-item"><span class="info-label">创建时间</span><span class="info-value">' + escapeHtml(createdDate) + '</span></div>'
    if (r.note) {
      infoHtml += '<div class="info-divider"></div><div class="info-item info-item-col"><span class="info-label">备注</span><div class="info-note">' + escapeHtml(r.note) + '</div></div>'
    }

    content.innerHTML =
      '<div class="page">' +
        '<div class="hero" style="background: linear-gradient(135deg, ' + r.categoryColor + ' 0%, ' + r.categoryColor + 'CC 100%);">' +
          '<div class="hero-icon" style="background: rgba(255,255,255,0.25);"><span>' + escapeHtml(r.categoryIcon) + '</span></div>' +
          '<span class="hero-title">' + escapeHtml(r.title) + '</span>' +
          '<div class="hero-tags">' + heroTags + '</div>' +
          '<div class="countdown-block"><span class="countdown-num">' + escapeHtml(countdownText) + '</span><span class="countdown-sub">' + escapeHtml(countdownSub) + '</span></div>' +
          (r.done ? '<div class="hero-done-badge">已完成</div>' : '') +
        '</div>' +
        '<div class="card info-card">' + infoHtml + '</div>' +
        '<div class="bottom-placeholder"></div>' +
        '<div class="action-bar safe-bottom">' +
          (state.detail.needSubscribe ? '<div class="subscribe-row"><div class="subscribe-btn" id="detail-subscribe-btn"><span class="subscribe-icon">🔔</span><span>开启提醒推送</span></div></div>' : '') +
          '<div class="action-row">' +
            '<div class="action-item" id="detail-toggle-done">' +
              '<div class="action-circle ' + (r.done ? 'action-done' : '') + '">' + (r.done ? '<span class="check-icon">✓</span>' : '') + '</div>' +
              '<span class="action-text">' + (r.done ? '已完成' : '完成') + '</span>' +
            '</div>' +
            '<div class="action-item" id="detail-edit">' +
              '<div class="action-circle action-edit"><span class="action-emoji">✎</span></div>' +
              '<span class="action-text">编辑</span>' +
            '</div>' +
            '<div class="action-item" id="detail-delete">' +
              '<div class="action-circle action-delete"><span class="action-emoji">🗑</span></div>' +
              '<span class="action-text text-danger">删除</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    // 绑定事件
    $('detail-toggle-done').addEventListener('click', function () {
      storage.toggleDone(state.detail.id)
      loadDetail()
    })
    $('detail-edit').addEventListener('click', function () {
      go('add?id=' + encodeURIComponent(state.detail.id))
    })
    $('detail-delete').addEventListener('click', function () {
      wx.showModal({
        title: '确认删除', content: '删除后无法恢复，确定要删除这个提醒吗？',
        confirmColor: '#FF6B6B',
        success: function (res) {
          if (res.confirm) {
            storage.deleteReminder(state.detail.id)
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(function () { wx.navigateBack() }, 800)
          }
        }
      })
    })
    if (state.detail.needSubscribe) {
      const sb = $('detail-subscribe-btn')
      if (sb) sb.addEventListener('click', function () {
        wx.showToast({ title: '网页版不支持订阅消息', icon: 'none' })
        state.detail.needSubscribe = false
        loadDetail()
      })
    }
  }

  // ========================================================================
  // 我的页
  // ========================================================================
  function onMineShow() {
    const app = getApp()
    if (storage.getPrivacyLock() && !app.globalData.privacyUnlocked) {
      go('home')
      return
    }
    reminder.checkAndUpdateExpired()
    state.mine.stats = reminder.getStats()
    state.mine.settings = storage.getSettings()
    state.mine.privacyLockEnabled = storage.getPrivacyLock()
    renderMine()
  }

  function renderMine() {
    const s = state.mine
    const stats = s.stats || {}
    const byCat = stats.byCategory || {}

    let catRows = ''
    Object.keys(CATEGORIES).forEach(function (key) {
      const c = CATEGORIES[key]
      const st = byCat[key] || { total: 0, pending: 0 }
      catRows += '<div class="cat-row" data-cat-key="' + key + '">' +
        '<div class="cat-left"><div class="cat-icon" style="background:' + c.bg + ';color:' + c.color + '">' + c.icon + '</div>' +
        '<span class="cat-name">' + escapeHtml(c.name) + '</span></div>' +
        '<div class="cat-right"><span class="cat-total">' + st.total + '条</span>' +
        '<span class="cat-pending">待处理 ' + st.pending + '</span>' +
        '<span class="cat-arrow">›</span></div></div>'
    })

    $('mine-content').innerHTML =
      '<div class="header"><div class="header-inner">' +
        '<div class="avatar"><span class="avatar-icon">👤</span></div>' +
        '<div class="app-name">勿忘事项</div>' +
        '<div class="app-version">v' + s.appVersion + '</div>' +
      '</div></div>' +
      '<div class="card stats-card"><div class="stats-row">' +
        '<div class="stats-item"><div class="stats-num">' + (stats.total || 0) + '</div><div class="stats-label">总提醒</div></div>' +
        '<div class="stats-divider"></div>' +
        '<div class="stats-item"><div class="stats-num text-danger">' + (stats.today || 0) + '</div><div class="stats-label">今日</div></div>' +
        '<div class="stats-divider"></div>' +
        '<div class="stats-item"><div class="stats-num text-primary">' + (stats.upcoming || 0) + '</div><div class="stats-label">即将</div></div>' +
        '<div class="stats-divider"></div>' +
        '<div class="stats-item"><div class="stats-num">' + (stats.done || 0) + '</div><div class="stats-label">已完成</div></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-title">分类统计</div>' + catRows + '</div>' +
      '<div class="card"><div class="card-title">通用设置</div>' +
        '<div class="setting-row"><div class="setting-left"><span class="setting-icon">🔔</span><div class="setting-text"><div class="setting-name">通知提醒</div><div class="setting-desc">开启后接收提醒推送</div></div></div>' +
          '<div class="wx-switch ' + (s.settings.notifyEnabled ? 'on' : '') + '" id="mine-switch-notify"></div></div>' +
        '<div class="divider"></div>' +
        '<div class="setting-row"><div class="setting-left"><span class="setting-icon">⏰</span><div class="setting-text"><div class="setting-name">提前通知</div><div class="setting-desc">提前提醒即将到期的项目</div></div></div>' +
          '<div class="wx-switch ' + (s.settings.advanceNotify ? 'on' : '') + '" id="mine-switch-advance"></div></div>' +
        '<div class="divider"></div>' +
        '<div class="setting-row"><div class="setting-left"><span class="setting-icon">📅</span><div class="setting-text"><div class="setting-name">农历显示</div><div class="setting-desc">纪念日显示农历日期</div></div></div>' +
          '<div class="wx-switch ' + (s.settings.lunarCalendar ? 'on' : '') + '" id="mine-switch-lunar"></div></div>' +
        '<div class="divider"></div>' +
        '<div class="setting-row privacy-row"><div class="setting-left"><span class="setting-icon">🔒</span><div class="setting-text"><div class="setting-name">隐私锁</div><div class="setting-desc">开启后需密码访问</div></div></div>' +
          '<div class="wx-switch ' + (s.privacyLockEnabled ? 'on' : '') + '" id="mine-switch-privacy"></div></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">数据管理</div>' +
        '<div class="action-row" id="mine-export"><div class="action-left"><span class="action-icon">📤</span><span class="action-name">导出数据</span></div><span class="arrow">›</span></div>' +
        '<div class="divider"></div>' +
        '<div class="action-row" id="mine-import"><div class="action-left"><span class="action-icon">📥</span><span class="action-name">导入数据</span></div><span class="arrow">›</span></div>' +
        '<div class="divider"></div>' +
        '<div class="action-row" id="mine-clear"><div class="action-left"><span class="action-icon">🗑️</span><span class="action-name text-danger">清空数据</span></div><span class="arrow">›</span></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">其他</div>' +
        '<div class="action-row" id="mine-about"><div class="action-left"><span class="action-icon">ℹ️</span><span class="action-name">关于</span></div><span class="arrow">›</span></div>' +
        '<div class="divider"></div>' +
        '<div class="action-row" id="mine-share"><div class="action-left"><span class="action-icon">💌</span><span class="action-name">分享给朋友</span></div><span class="arrow">›</span></div>' +
      '</div>' +
      '<div class="footer-tip text-placeholder">勿忘事项 · 让生活更有条理</div>' +
      '<div class="safe-bottom" style="height:60px;"></div>'

    // 分类统计点击
    document.querySelectorAll('[data-cat-key]').forEach(function (row) {
      row.addEventListener('click', function () {
        const key = row.dataset.catKey
        const app = getApp()
        app.globalData.pendingCategory = key
        go('list')
      })
    })

    // 开关
    $('mine-switch-notify').addEventListener('click', function () {
      const on = this.classList.toggle('on')
      state.mine.settings.notifyEnabled = on
      storage.saveSettings({ notifyEnabled: on })
      wx.showToast({ title: on ? '已开启通知' : '已关闭通知', icon: 'none' })
    })
    $('mine-switch-advance').addEventListener('click', function () {
      const on = this.classList.toggle('on')
      state.mine.settings.advanceNotify = on
      storage.saveSettings({ advanceNotify: on })
    })
    $('mine-switch-lunar').addEventListener('click', function () {
      const on = this.classList.toggle('on')
      state.mine.settings.lunarCalendar = on
      storage.saveSettings({ lunarCalendar: on })
    })
    $('mine-switch-privacy').addEventListener('click', function () {
      const enabled = this.classList.toggle('on')
      const app = getApp()
      if (enabled) {
        // 弹出设置密码弹窗
        state.mine.privacyLockEnabled = true
        state.mine.showPasswordModal = true
        state.mine.isSettingPassword = true
        state.mine.passwordInput = ''
        showPasswordModal()
      } else {
        storage.setPrivacyLock(false)
        storage.setPrivacyPassword('')
        app.globalData.privacyUnlocked = true
        state.mine.privacyLockEnabled = false
        wx.showToast({ title: '已关闭隐私锁', icon: 'success' })
      }
    })

    // 数据管理
    $('mine-export').addEventListener('click', function () {
      const jsonStr = storage.exportData()
      wx.setClipboardData({
        data: jsonStr,
        success: function () {
          wx.showToast({ title: '数据已复制到剪贴板', icon: 'success' })
          // 同时在控制台打印方便调试
          console.log('=== 导出数据 ===\n' + jsonStr)
        }
      })
    })
    $('mine-import').addEventListener('click', function () {
      wx.showModal({
        title: '导入数据',
        content: '将从剪贴板导入数据，当前数据将被覆盖，是否继续？',
        confirmColor: '#4ECDC4',
        success: function (res) {
          if (res.confirm) {
            wx.getClipboardData({
              success: function (clipRes) {
                const ok = storage.importData(clipRes.data)
                if (ok) {
                  onMineShow()
                  wx.showToast({ title: '导入成功', icon: 'success' })
                } else {
                  wx.showToast({ title: '导入失败，数据格式错误', icon: 'none' })
                }
              }
            })
          }
        }
      })
    })
    $('mine-clear').addEventListener('click', function () {
      wx.showModal({
        title: '清空数据',
        content: '将清空所有提醒和设置，且无法恢复，是否继续？',
        confirmColor: '#FF6B6B',
        confirmText: '清空',
        success: function (res) {
          if (res.confirm) {
            storage.saveReminders([])
            storage.resetSettings()
            storage.setPrivacyLock(false)
            storage.setPrivacyPassword('')
            onMineShow()
            wx.showToast({ title: '已清空所有数据', icon: 'success' })
          }
        }
      })
    })
    $('mine-about').addEventListener('click', function () {
      wx.showModal({
        title: '关于勿忘事项',
        content: '勿忘事项 v' + s.appVersion + '\n\n一款帮助你管理缴费、健康、证件、纪念日等提醒的小程序，支持分类管理、重复提醒、隐私锁等功能。\n\n【网页调试版】用于在浏览器中调试所有功能，数据存储在 localStorage 中。',
        showCancel: false,
        confirmColor: '#4ECDC4',
        confirmText: '知道了'
      })
    })
    $('mine-share').addEventListener('click', function () {
      wx.showToast({ title: '网页版不支持分享', icon: 'none' })
    })
  }

  // ===== 密码弹窗 =====
  function showPasswordModal() {
    let modal = document.getElementById('mine-password-modal')
    if (!modal) {
      modal = document.createElement('div')
      modal.id = 'mine-password-modal'
      modal.className = 'modal-mask'
      modal.innerHTML =
        '<div class="modal-content">' +
          '<div class="modal-title" id="pwd-title"></div>' +
          '<div class="modal-desc" id="pwd-desc"></div>' +
          '<div class="password-box"><input class="password-input" id="pwd-input" type="tel" maxlength="4" placeholder="••••" /></div>' +
          '<div class="modal-btns">' +
            '<div class="modal-btn modal-btn-cancel" id="pwd-cancel">取消</div>' +
            '<div class="modal-btn modal-btn-confirm" id="pwd-confirm">确定</div>' +
          '</div>' +
        '</div>'
      document.body.appendChild(modal)
      const input = $('pwd-input')
      const cancel = $('pwd-cancel')
      const confirm = $('pwd-confirm')
      input.addEventListener('input', function (e) {
        const v = (e.target.value || '').replace(/\D/g, '').slice(0, 4)
        e.target.value = v
        state.mine.passwordInput = v
      })
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmPassword() })
      cancel.addEventListener('click', cancelPassword)
      confirm.addEventListener('click', confirmPassword)
    }
    const isSetting = state.mine.isSettingPassword
    $('pwd-title').textContent = isSetting ? '设置隐私密码' : '请输入密码'
    $('pwd-desc').textContent = isSetting ? '请输入4位数字作为隐私锁密码' : '请输入隐私锁密码以解锁'
    $('pwd-input').value = ''
    state.mine.passwordInput = ''
    modal.style.display = 'flex'
    setTimeout(function () { const i = $('pwd-input'); if (i) i.focus() }, 50)
  }

  function hidePasswordModal() {
    const modal = document.getElementById('mine-password-modal')
    if (modal) modal.style.display = 'none'
  }

  function confirmPassword() {
    const { passwordInput, isSettingPassword } = state.mine
    if (!/^\d{4}$/.test(passwordInput)) {
      wx.showToast({ title: '请输入4位数字密码', icon: 'none' })
      return
    }
    const app = getApp()
    if (isSettingPassword) {
      storage.setPrivacyPassword(passwordInput)
      storage.setPrivacyLock(true)
      app.globalData.privacyUnlocked = true
      state.mine.showPasswordModal = false
      state.mine.privacyLockEnabled = true
      hidePasswordModal()
      wx.showToast({ title: '隐私锁已开启', icon: 'success' })
    } else {
      const saved = storage.getPrivacyPassword()
      if (passwordInput === saved) {
        storage.setPrivacyLock(true)
        app.globalData.privacyUnlocked = true
        state.mine.showPasswordModal = false
        state.mine.privacyLockEnabled = true
        hidePasswordModal()
        wx.showToast({ title: '解锁成功', icon: 'success' })
      } else {
        wx.showToast({ title: '密码错误', icon: 'none' })
      }
    }
  }

  function cancelPassword() {
    if (state.mine.isSettingPassword) {
      state.mine.showPasswordModal = false
      state.mine.privacyLockEnabled = false
      hidePasswordModal()
      renderMine()
    } else {
      state.mine.showPasswordModal = false
      hidePasswordModal()
    }
  }

  // ========================================================================
  // 全局事件绑定
  // ========================================================================
  function bindGlobalEvents() {
    // tabBar
    document.querySelectorAll('.tabbar-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const hash = item.dataset.hash
        if (hash) go(hash)
      })
    })
    // 首页/列表页 FAB
    $('home-fab').addEventListener('click', function () { go('add') })
    $('list-fab').addEventListener('click', function () { go('add') })

    // 列表页搜索切换
    $('list-search-toggle').addEventListener('click', function () {
      const next = !state.list.showSearch
      if (next) {
        state.list.showSearch = true
        $('list-search-wrap').classList.remove('search-hide')
        $('list-search-wrap').classList.add('search-show')
        $('list-search-toggle').textContent = '取消'
        setTimeout(function () { $('list-search-input').focus() }, 50)
      } else {
        state.list.showSearch = false
        state.list.keyword = ''
        $('list-search-input').value = ''
        $('list-search-wrap').classList.add('search-hide')
        $('list-search-wrap').classList.remove('search-show')
        $('list-search-toggle').textContent = '搜索'
        loadListData()
      }
    })
    $('list-search-input').addEventListener('input', function (e) {
      state.list.keyword = e.target.value
      loadListData()
    })
    $('list-search-clear').addEventListener('click', function () {
      state.list.keyword = ''
      $('list-search-input').value = ''
      loadListData()
    })
  }

  // ========================================================================
  // 启动
  // ========================================================================
  function init() {
    bindGlobalEvents()
    bindGlobalEventsOnceForList()
    route()
    window.addEventListener('hashchange', route)
  }

  function bindGlobalEventsOnceForList() {
    // 占位：列表页的分类在 onListShow 里第一次会渲染
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
