<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../supabase'

const period = ref('month')
const workers = ref([])
const approvedExtraHours = ref([])
const loading = ref(true)
const errorMessage = ref('')

const periodOptions = [
  { label: 'Esta Semana', value: 'week' },
  { label: 'Este Mes', value: 'month' },
  { label: 'Año Actual', value: 'year' },
]

const periodRange = computed(() => getPeriodRange(period.value))

const totalExtraHours = computed(() => {
  return approvedExtraHours.value.reduce((total, request) => total + Number(request.cantidad || 0), 0)
})

const averageExtraHours = computed(() => {
  if (workers.value.length === 0) {
    return 0
  }

  return Number((totalExtraHours.value / workers.value.length).toFixed(2))
})

const orderedWorkers = computed(() => {
  return [...workers.value].sort((a, b) => Number(b.saldo_horas || 0) - Number(a.saldo_horas || 0))
})

function getPeriodRange(selectedPeriod) {
  const now = new Date()

  if (selectedPeriod === 'week') {
    const day = (now.getDay() + 6) % 7
    const start = new Date(now)
    start.setDate(now.getDate() - day)
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)

    return { start, end }
  }

  if (selectedPeriod === 'year') {
    return {
      start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    }
  }

  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

function formatHours(value) {
  return Number(value || 0).toFixed(2)
}

function balanceClass(worker) {
  const balance = Number(worker.saldo_horas || 0)

  if (balance > 30) {
    return 'bg-red-400 text-slate-950'
  }

  if (balance > 20) {
    return 'bg-amber-300 text-slate-950'
  }

  return 'bg-emerald-400/10 text-emerald-200'
}

async function loadReports() {
  loading.value = true
  errorMessage.value = ''

  const range = periodRange.value

  const [{ data: profiles, error: profilesError }, { data: requests, error: requestsError }] = await Promise.all([
    supabase
      .from('perfiles')
      .select('id, nombre, rol, saldo_horas')
      .order('nombre', { ascending: true }),
    supabase
      .from('solicitudes')
      .select('id, usuario_id, cantidad, creado_en, descripcion_ticket')
      .eq('tipo', 'HORAS_EXTRA')
      .eq('estado', 'APROBADA')
      .gte('creado_en', range.start.toISOString())
      .lte('creado_en', range.end.toISOString()),
  ])

  loading.value = false

  if (profilesError || requestsError) {
    console.error('Error cargando reportes:', profilesError || requestsError)
    errorMessage.value = 'No se pudieron cargar los reportes.'
    return
  }

  workers.value = profiles || []
  approvedExtraHours.value = requests || []
}

onMounted(loadReports)
</script>

<template>
  <section class="space-y-5">
    <div>
      <h2 class="text-xl font-bold">Reportes Admin</h2>
      <p class="mt-1 text-sm text-slate-400">Horas extra y saldos actuales</p>
    </div>

    <label class="block">
      <span class="text-sm font-medium text-slate-200">Periodo</span>
      <select
        v-model="period"
        class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
        @change="loadReports"
      >
        <option v-for="option in periodOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <p v-if="errorMessage" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
      {{ errorMessage }}
    </p>

    <div class="grid grid-cols-2 gap-3">
      <article class="rounded-lg bg-emerald-400 p-4 text-slate-950">
        <p class="text-xs font-bold uppercase">Total equipo</p>
        <p class="mt-2 text-3xl font-black">{{ formatHours(totalExtraHours) }}</p>
        <p class="mt-1 text-xs font-medium">horas extra aprobadas</p>
      </article>

      <article class="rounded-lg bg-sky-300 p-4 text-slate-950">
        <p class="text-xs font-bold uppercase">Promedio</p>
        <p class="mt-2 text-3xl font-black">{{ formatHours(averageExtraHours) }}</p>
        <p class="mt-1 text-xs font-medium">horas por trabajador</p>
      </article>
    </div>

    <section>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-bold">Resumen de Personal</h3>
        <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" type="button" @click="loadReports">
          Actualizar
        </button>
      </div>

      <div v-if="loading" class="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        Cargando reportes...
      </div>

      <div v-else-if="workers.length === 0" class="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        No hay trabajadores registrados.
      </div>

      <ul v-else class="mt-4 space-y-3">
        <li v-for="worker in orderedWorkers" :key="worker.id" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-bold">{{ worker.nombre }}</p>
              <p class="mt-1 text-sm text-slate-400">{{ worker.rol }}</p>
            </div>

            <span class="rounded-full px-3 py-1.5 text-sm font-black" :class="balanceClass(worker)">
              {{ formatHours(worker.saldo_horas) }} h
            </span>
          </div>

          <p v-if="Number(worker.saldo_horas || 0) > 20" class="mt-3 rounded-lg bg-amber-400/10 p-3 text-xs font-medium text-amber-100">
            Este colaborador necesita compensar horas pronto.
          </p>
        </li>
      </ul>
    </section>
  </section>
</template>
