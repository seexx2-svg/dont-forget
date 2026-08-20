// components/reminder-card/reminder-card.js
// 提醒卡片组件：展示单条提醒的概要信息

Component({
  properties: {
    reminder: {
      type: Object,
      value: {}
    }
  },

  methods: {
    // 卡片整体点击 → 触发 tap 自定义事件，传递 _id
    onTap() {
      this.triggerEvent('tap', { id: this.data.reminder._id })
    },
    // 完成按钮点击 → 触发 done 自定义事件（WXML 中用 catchtap 阻止冒泡，避免触发卡片 onTap）
    onDoneTap() {
      this.triggerEvent('done', { id: this.data.reminder._id })
    }
  }
})
