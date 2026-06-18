import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../supabase'
import LoginView from '../views/LoginView.vue'
import DashboardEmpleado from '../views/DashboardEmpleado.vue'
import AdminView from '../views/AdminView.vue'
import AprobacionesView from '../views/AprobacionesView.vue'
import UnauthorizedView from '../views/UnauthorizedView.vue'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true },
  },
  {
    path: '/',
    name: 'dashboard',
    component: DashboardEmpleado,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView,
    meta: { requiresAuth: true, roles: ['Admin'] },
  },
  {
    path: '/aprobaciones',
    name: 'aprobaciones',
    component: AprobacionesView,
    meta: { requiresAuth: true, roles: ['Business', 'Admin'] },
  },
  {
    path: '/sin-permiso',
    name: 'unauthorized',
    component: UnauthorizedView,
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

async function getCurrentProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { user: null, profile: null }
  }

  const { data: profile, error: profileError } = await supabase
    .from('perfiles')
    .select('id, nombre, email, rol, activo')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { user, profile: null }
  }

  return { user, profile }
}

router.beforeEach(async (to) => {
  if (to.meta.public) {
    return true
  }

  const { user, profile } = await getCurrentProfile()

  if (!user) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (!profile || !profile.activo) {
    await supabase.auth.signOut()
    return {
      name: 'login',
      query: { reason: 'inactive' },
    }
  }

  const allowedRoles = to.meta.roles

  if (Array.isArray(allowedRoles) && !allowedRoles.includes(profile.rol)) {
    return { name: 'unauthorized' }
  }

  return true
})

export default router
