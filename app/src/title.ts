// The browser tab's title follows the open page: "Harrowmere · Eldoria", "✎ Harrowmere · Eldoria", "Spellbook · Eldoria".
import { watchEffect } from 'vue'
import type { Route } from './router'
import { route } from './router'
import { TYPES } from './model/schema'
import { db, get, state } from './store'
import { DASHBOARDS } from './dashboards'

function pageName(r: Route): string {
  switch (r.name) {
    case 'home': return ''
    case 'list': return TYPES[r.type]?.plural ?? r.type
    case 'entry': {
      const e = get(r.id)
      if (!e) return 'Not found'
      return (r.edit && e.type !== 'encounter' ? '✎ ' : '') + e.name
    }
    case 'map': return `Map of ${get(r.id)?.name ?? r.id}`
    case 'timeline': return 'Timeline'
    case 'calendar': return 'Calendar'
    case 'tracker': {
      const t = db().tracker
      const enc = get(t?.encounter)
      return [t?.round ? `Round ${t.round}` : '', enc?.name ?? 'Encounter'].filter(Boolean).join(' · ')
    }
    case 'spellbook': return 'Spellbook'
    case 'crafting': return 'Workbench'
    case 'atlas': return 'Atlas'
    case 'data': return 'Data'
    case 'dashboard': {
      const d = DASHBOARDS.find(x => x.id === r.id)
      if (!d) return 'Dashboard'
      const v = d.views.find(x => x.name === r.view)
      return v && v !== d.views[0] ? `${v.name} · ${d.title}` : d.title
    }
  }
}

/** Keep document.title in step with the route and with names as they change. */
export function syncTitle() {
  watchEffect(() => {
    const app = state.db ? db().meta.title || 'Eldoria' : 'Eldoria'
    const page = state.db ? pageName(route.current) : ''
    document.title = page ? `${page} · ${app}` : app
  })
}
