import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './fonts/fonts.css'
import { startTheme } from './theme'
import { startDeviceSync } from './devicesync/devices'
import { vFlash } from './flash'

startTheme()
startDeviceSync()

createApp(App).directive('flash', vFlash).mount('#app')
