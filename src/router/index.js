import { route } from 'quasar/wrappers'
import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from 'vue-router'
import routes from './routes'

export default route(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : (process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory)

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE)
  })

  // Navigation Guard: Lobby nur für eingeloggte Nutzer; Admin-Route
  // zusätzlich nur für den Server-Owner (Admin). Der Server prüft final selbst.
  Router.beforeEach((to) => {
    if (to.meta.requiresAuth) {
      const token = localStorage.getItem('hitster-auth-token')
      if (!token) {
        return { name: 'login' }
      }
    }
    if (to.meta.requiresAdmin) {
      const isAdmin = localStorage.getItem('hitster-auth-is-admin') === '1'
      if (!isAdmin) return { path: '/' }
    }
  })

  return Router
})
