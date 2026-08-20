const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/Index.vue') },
      { path: 'game', name: 'game', component: () => import('pages/Game.vue') },
      { path: 'login', name: 'login', component: () => import('pages/Login.vue') },
      { path: 'register', name: 'register', component: () => import('pages/Register.vue') },
      { path: 'forgot', name: 'forgot', component: () => import('pages/ForgotPassword.vue') },
      { path: 'profile', name: 'profile', component: () => import('pages/Profile.vue'), meta: { requiresAuth: true } },
      { path: 'leaderboard', name: 'leaderboard', component: () => import('pages/Leaderboard.vue'), meta: { requiresAuth: true } },
      { path: 'stats/:username', name: 'user-stats', component: () => import('pages/ProfileStats.vue'), meta: { requiresAuth: true } },
      { path: 'lobby', name: 'lobby', component: () => import('pages/Lobby.vue'), meta: { requiresAuth: true } },
      { path: 'admin', name: 'admin', component: () => import('pages/Admin.vue'), meta: { requiresAuth: true, requiresAdmin: true } }
    ]
  },

  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/Error404.vue')
  }
]

export default routes
