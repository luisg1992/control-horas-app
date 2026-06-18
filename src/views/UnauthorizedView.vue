<template>
  <main class="flex min-h-screen items-center bg-slate-950 px-5 py-6 text-white">
    <section class="mx-auto w-full max-w-sm text-center">
      <p class="text-sm font-medium text-red-300">Acceso restringido</p>
      <h1 class="mt-3 text-2xl font-bold">No tienes permisos</h1>
      <p class="mt-2 text-sm leading-6 text-slate-400">
        Tu rol no tiene acceso a esta pantalla.
      </p>
      <RouterLink class="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-400 px-5 font-semibold text-slate-950" to="/">
        Ir al dashboard
      </RouterLink>
    </section>
  </main>
</template>
