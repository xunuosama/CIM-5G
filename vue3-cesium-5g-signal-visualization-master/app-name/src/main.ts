import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'

const app = createApp(App) // 创建 app 实例
const pinia = createPinia()

app.use(pinia) // 使用 pinia
app.mount('#app') // 挂载到 DOM


