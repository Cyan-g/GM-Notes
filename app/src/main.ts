import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { startTheme } from './theme'

startTheme()

createApp(App).mount('#app')
