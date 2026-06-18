<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../supabase'

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function login() {
  loading.value = true
  errorMessage.value = ''
  const internalEmail = `${username.value.trim()}@tuempresa.com``

  const { error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password: password.value,
  })

  loading.value = false

  if (error) {
    errorMessage.value = 'Usuario o contrasena incorrectos.'
    return
  }

  await router.replace(route.query.redirect?.toString() || '/')
}
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-5 py-8 text-white">
    <section class="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-sm flex-col justify-center">
      <p class="text-sm font-medium text-emerald-300">Control Horas</p>
      <h1 class="mt-3 text-3xl font-bold">Ingresa a tu cuenta</h1>
      <p class="mt-2 text-sm leading-6 text-slate-400">
        Usa tu usuario interno y contrasena registrados en Supabase.
      </p>

      <form class="mt-8 space-y-4" @submit.prevent="login">
        <label class="block">
          <span class="text-sm font-medium text-slate-200">Usuario</span>
          <input
            v-model="username"
            class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 text-base text-white outline-none transition focus:border-emerald-400"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            placeholder="jorge.dev"
            required
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium text-slate-200">Contrasena</span>
          <input
            v-model="password"
            class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 text-base text-white outline-none transition focus:border-emerald-400"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <p v-if="route.query.reason === 'inactive'" class="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
          Tu perfil esta inactivo o no existe. Contacta a un administrador.
        </p>

        <p v-if="errorMessage" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
          {{ errorMessage }}
        </p>

        <button
          class="h-12 w-full rounded-lg bg-emerald-400 font-semibold text-slate-950 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          :disabled="loading"
        >
          {{ loading ? 'Ingresando...' : 'Ingresar' }}
        </button>
      </form>
    </section>
  </main>
</template>
