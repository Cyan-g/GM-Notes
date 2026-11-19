import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './fonts/fonts.css'
import { startTheme } from './theme'

startTheme()

createApp(App).mount('#app')
