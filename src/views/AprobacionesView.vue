<script setup>
import PanelAprobaciones from '../components/PanelAprobaciones.vue'
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-5 py-6 text-white">
    <section class="mx-auto w-full max-w-md">
      <RouterLink class="text-sm font-medium text-emerald-300" to="/">Volver</RouterLink>
      <div class="mt-5">
        <PanelAprobaciones />
      </div>
    </section>
  </main>
</template>
