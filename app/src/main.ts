import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
// the decorative styles (Theme → Style): the parts once, then each style
import './styles/base.css'
import './styles/illuminated.css'
import './styles/runecarved.css'
import './styles/wax.css'
import './fonts/fonts.css'
import { startTheme } from './theme'
import { startDeviceSync } from './devicesync/devices'
import { vFlash } from './flash'

startTheme()
startDeviceSync()

createApp(App).directive('flash', vFlash).mount('#app')
