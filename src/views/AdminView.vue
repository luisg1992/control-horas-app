<script setup>
import GestionUsuarios from '../components/GestionUsuarios.vue'
import ReportesAdmin from '../components/ReportesAdmin.vue'
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-5 py-6 text-white">
    <section class="mx-auto w-full max-w-md">
      <RouterLink class="text-sm font-medium text-emerald-300" to="/">Volver</RouterLink>
      <div class="mt-5">
        <GestionUsuarios />
      </div>
      <div class="mt-8 border-t border-slate-800 pt-6">
        <ReportesAdmin />
      </div>
    </section>
  </main>
</template>
