import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './fonts/fonts.css'
import { startTheme } from './theme'
import { vFlash } from './flash'

startTheme()

createApp(App).directive('flash', vFlash).mount('#app')
