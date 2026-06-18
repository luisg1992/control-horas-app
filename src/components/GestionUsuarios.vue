<script setup>
import { computed, onMounted, ref } from 'vue'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../supabase'

const internalDomain = '@tuempresa.internal'
const roles = ['Developer', 'QA', 'Business', 'Admin']

const users = ref([])
const loading = ref(true)
const saving = ref(false)
const processingId = ref('')
const modalOpen = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const form = ref({
  nombre: '',
  username: '',
  rol: 'Developer',
  password: '',
})

const orderedUsers = computed(() => {
  return [...users.value].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1
    return a.nombre.localeCompare(b.nombre)
  })
})

function usernameFromEmail(email) {
  return email?.endsWith(internalDomain) ? email.replace(internalDomain, '') : email
}

function buildInternalEmail(username) {
  return `${username.trim().toLowerCase()}${internalDomain}`
}

function resetForm() {
  form.value = {
    nombre: '',
    username: '',
    rol: 'Developer',
    password: '',
  }
}

function openModal() {
  errorMessage.value = ''
  successMessage.value = ''
  resetForm()
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
}

async function loadUsers() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, email, rol, activo, saldo_horas, dias_vacaciones')
    .order('nombre', { ascending: true })

  loading.value = false

  if (error) {
    console.error('Error cargando usuarios:', error)
    errorMessage.value = 'No se pudieron cargar los colaboradores.'
    return
  }

  users.value = data || []
}

async function deactivateUser(user) {
  processingId.value = user.id
  errorMessage.value = ''
  successMessage.value = ''

  const { error } = await supabase
    .from('perfiles')
    .update({ activo: false })
    .eq('id', user.id)

  processingId.value = ''

  if (error) {
    console.error('Error dando de baja:', error)
    errorMessage.value = 'No se pudo dar de baja al colaborador.'
    return
  }

  successMessage.value = 'Colaborador dado de baja.'
  await loadUsers()
}

async function resetPassword(user) {
  processingId.value = user.id
  errorMessage.value = ''
  successMessage.value = ''

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/login`,
  })

  processingId.value = ''

  if (error) {
    console.error('Error reseteando contrasena:', error)
    errorMessage.value = 'No se pudo enviar el correo de restablecimiento.'
    return
  }

  successMessage.value = `Correo de restablecimiento enviado a ${user.email}.`
}

async function registerUser() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!form.value.nombre.trim() || !form.value.username.trim() || !form.value.password) {
    errorMessage.value = 'Nombre, usuario y contrasena son obligatorios.'
    return
  }

  saving.value = true
  const email = buildInternalEmail(form.value.username)

  const isolatedSupabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  const { data: signUpData, error: signUpError } = await isolatedSupabase.auth.signUp({
    email,
    password: form.value.password,
  })

  if (signUpError) {
    saving.value = false
    console.error('Error creando usuario auth:', signUpError)
    errorMessage.value = signUpError.message || 'No se pudo crear la cuenta de autenticacion.'
    return
  }

  const authUserId = signUpData.user?.id

  if (!authUserId) {
    saving.value = false
    errorMessage.value = 'Supabase no devolvio el ID del usuario creado.'
    return
  }

  const { error: profileError } = await supabase.from('perfiles').insert({
    id: authUserId,
    nombre: form.value.nombre.trim(),
    email,
    rol: form.value.rol,
    saldo_horas: 0,
    dias_vacaciones: 30,
    activo: true,
  })

  saving.value = false

  if (profileError) {
    console.error('Error creando perfil:', profileError)
    errorMessage.value = 'La cuenta Auth se creo, pero fallo el perfil. Revisa la tabla perfiles.'
    return
  }

  successMessage.value = 'Colaborador registrado correctamente.'
  closeModal()
  await loadUsers()
}

onMounted(loadUsers)
</script>

<template>
  <section class="space-y-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold">Gestion de Usuarios</h2>
        <p class="mt-1 text-sm text-slate-400">Altas, bajas y recuperacion de acceso</p>
      </div>
      <button class="h-11 w-11 rounded-lg bg-emerald-400 text-2xl font-black text-slate-950" type="button" @click="openModal">
        +
      </button>
    </div>

    <p v-if="errorMessage" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
      {{ errorMessage }}
    </p>

    <p v-if="successMessage" class="rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-200">
      {{ successMessage }}
    </p>

    <div v-if="loading" class="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
      Cargando colaboradores...
    </div>

    <div v-else-if="users.length === 0" class="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
      No hay colaboradores registrados.
    </div>

    <ul v-else class="space-y-3">
      <li v-for="user in orderedUsers" :key="user.id" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-bold">{{ user.nombre }}</p>
            <p class="mt-1 text-sm text-slate-400">{{ usernameFromEmail(user.email) }}</p>
          </div>
          <span
            class="rounded-full px-2.5 py-1 text-xs font-bold"
            :class="user.activo ? 'bg-emerald-400/10 text-emerald-200' : 'bg-red-400/10 text-red-200'"
          >
            {{ user.activo ? 'Activo' : 'Inactivo' }}
          </span>
        </div>

        <div class="mt-3 flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2">
          <span class="text-sm text-slate-400">Rol</span>
          <span class="text-sm font-bold text-slate-100">{{ user.rol }}</span>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <button
            class="h-11 rounded-lg bg-slate-100 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="processingId === user.id"
            @click="resetPassword(user)"
          >
            Resetear Contraseña
          </button>

          <button
            class="h-11 rounded-lg bg-red-400 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="!user.activo || processingId === user.id"
            @click="deactivateUser(user)"
          >
            Dar de Baja
          </button>
        </div>
      </li>
    </ul>

    <div v-if="modalOpen" class="fixed inset-0 z-50 bg-slate-950/80 px-4 py-5 backdrop-blur-sm">
      <section class="mx-auto flex min-h-full w-full max-w-md items-end">
        <form class="w-full rounded-t-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl" @submit.prevent="registerUser">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-bold">Registrar Colaborador</h3>
              <p class="mt-1 text-sm text-slate-400">El dominio interno se agrega automaticamente.</p>
            </div>
            <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" type="button" @click="closeModal">
              Cerrar
            </button>
          </div>

          <label class="mt-5 block">
            <span class="text-sm font-medium text-slate-200">Nombre</span>
            <input
              v-model="form.nombre"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              placeholder="Carlos Perez"
              type="text"
              required
            />
          </label>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Nombre de Usuario</span>
            <div class="mt-2 flex h-12 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 focus-within:border-emerald-400">
              <input
                v-model="form.username"
                class="min-w-0 flex-1 bg-transparent px-3 text-base outline-none"
                placeholder="carlos.qa"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                required
              />
              <span class="flex shrink-0 items-center border-l border-slate-800 px-2 text-xs text-slate-500">
                {{ internalDomain }}
              </span>
            </div>
          </label>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Rol</span>
            <select
              v-model="form.rol"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              required
            >
              <option v-for="role in roles" :key="role" :value="role">
                {{ role }}
              </option>
            </select>
          </label>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Contraseña Temporal</span>
            <input
              v-model="form.password"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              type="password"
              autocomplete="new-password"
              required
            />
          </label>

          <p class="mt-4 rounded-lg bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            En produccion, crear usuarios Auth desde Admin debe hacerse con una Edge Function y service role.
          </p>

          <button
            class="mt-5 h-12 w-full rounded-lg bg-emerald-400 font-black text-slate-950 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            :disabled="saving"
          >
            {{ saving ? 'Registrando...' : 'Registrar Colaborador' }}
          </button>
        </form>
      </section>
    </div>
  </section>
</template>
