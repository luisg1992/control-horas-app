<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase'

const router = useRouter()
const profile = ref(null)

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data } = await supabase
    .from('perfiles')
    .select('nombre, email, rol, saldo_horas, dias_vacaciones')
    .eq('id', user.id)
    .single()

  profile.value = data
})

async function logout() {
  await supabase.auth.signOut()
  await router.replace('/login')
}
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-5 py-6 text-white">
    <section class="mx-auto w-full max-w-md">
      <header class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-emerald-300">Dashboard</p>
          <h1 class="mt-1 text-2xl font-bold">Control Horas</h1>
        </div>
        <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200" type="button" @click="logout">
          Salir
        </button>
      </header>

      <section class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p class="text-sm text-slate-400">Usuario</p>
        <h2 class="mt-1 text-xl font-semibold">{{ profile?.nombre || 'Cargando...' }}</h2>
        <p class="mt-1 text-sm text-slate-400">{{ profile?.email }}</p>
        <span class="mt-4 inline-flex rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-300">
          {{ profile?.rol }}
        </span>
      </section>

      <section class="mt-4 grid grid-cols-2 gap-3">
        <article class="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p class="text-sm text-slate-400">Saldo horas</p>
          <p class="mt-2 text-2xl font-bold">{{ profile?.saldo_horas ?? '-' }}</p>
        </article>
        <article class="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p class="text-sm text-slate-400">Vacaciones</p>
          <p class="mt-2 text-2xl font-bold">{{ profile?.dias_vacaciones ?? '-' }}</p>
        </article>
      </section>

      <nav class="mt-6 grid gap-3">
        <RouterLink class="rounded-lg bg-slate-900 px-4 py-4 font-medium text-slate-100" to="/aprobaciones">
          Aprobaciones
        </RouterLink>
        <RouterLink class="rounded-lg bg-slate-900 px-4 py-4 font-medium text-slate-100" to="/admin">
          Administracion
        </RouterLink>
      </nav>
    </section>
  </main>
</template>
