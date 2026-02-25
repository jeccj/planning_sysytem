import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'
import { installElement } from './plugins/element'

const app = createApp(App)

app.use(createPinia())
app.use(router)
installElement(app)

app.mount('#app')
