<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../supabase'

const selectedRole = ref('Todos')
const absences = ref([])
const loading = ref(false)
const errorMessage = ref('')
const visibleDate = ref(new Date())
const selectedDay = ref(null)

const roleFilters = [
  { label: 'Todos', value: 'Todos' },
  { label: 'Developers', value: 'Developer' },
  { label: 'QA', value: 'QA' },
  { label: 'Business', value: 'Business' },
]

const weekDays = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const currentYear = computed(() => visibleDate.value.getFullYear())
const currentMonth = computed(() => visibleDate.value.getMonth())

const monthStart = computed(() => new Date(currentYear.value, currentMonth.value, 1, 0, 0, 0))
const monthEnd = computed(() => new Date(currentYear.value, currentMonth.value + 1, 0, 23, 59, 59))

const monthLabel = computed(() =>
  new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
  }).format(monthStart.value),
)

const calendarDays = computed(() => {
  const days = []
  const firstWeekday = getMondayBasedWeekday(monthStart.value)
  const totalDays = monthEnd.value.getDate()

  for (let index = 0; index < firstWeekday; index += 1) {
    days.push({ key: `empty-${index}`, empty: true })
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(currentYear.value, currentMonth.value, day, 0, 0, 0)
    const dayStart = new Date(currentYear.value, currentMonth.value, day, 0, 0, 0)
    const dayEnd = new Date(currentYear.value, currentMonth.value, day, 23, 59, 59)

    days.push({
      key: date.toISOString(),
      empty: false,
      date,
      day,
      events: filteredAbsences.value
        .filter((absence) => overlapsDay(absence, dayStart, dayEnd))
        .map((absence) => formatAbsenceForDay(absence, dayStart, dayEnd)),
    })
  }

  return days
})

const filteredAbsences = computed(() => {
  if (selectedRole.value === 'Todos') {
    return absences.value
  }

  return absences.value.filter((absence) => absence.perfil?.rol === selectedRole.value)
})

function getMondayBasedWeekday(date) {
  return (date.getDay() + 6) % 7
}

function overlapsDay(absence, dayStart, dayEnd) {
  const start = new Date(absence.fecha_inicio)
  const end = new Date(absence.fecha_fin)

  return start <= dayEnd && end >= dayStart
}

function formatHour(value) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(value)
    .replace(/\s/g, '')
    .toLowerCase()
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function formatAbsenceForDay(absence, dayStart, dayEnd) {
  const start = new Date(absence.fecha_inicio)
  const end = new Date(absence.fecha_fin)
  const visibleStart = start < dayStart ? dayStart : start
  const visibleEnd = end > dayEnd ? dayEnd : end
  const name = absence.perfil?.nombre || 'Colaborador'
  const role = absence.perfil?.rol || 'Equipo'

  return {
    id: absence.id,
    name,
    role,
    start: formatHour(visibleStart),
    end: formatHour(visibleEnd),
    label: `${name} (${role}): ${formatHour(visibleStart)}-${formatHour(visibleEnd)}`,
  }
}

function openDayDetail(day) {
  if (day.empty) {
    return
  }

  selectedDay.value = day
}

function closeDayDetail() {
  selectedDay.value = null
}

function getMonthRange(date) {
  const year = date.getFullYear()
  const month = date.getMonth()

  return {
    start: new Date(year, month, 1, 0, 0, 0),
    end: new Date(year, month + 1, 0, 23, 59, 59),
  }
}

function goToPreviousMonth() {
  const targetDate = new Date(currentYear.value, currentMonth.value - 1, 1)
  visibleDate.value = targetDate
  loadAbsences(targetDate)
}

function goToNextMonth() {
  const targetDate = new Date(currentYear.value, currentMonth.value + 1, 1)
  visibleDate.value = targetDate
  loadAbsences(targetDate)
}

function goToCurrentMonth() {
  const targetDate = new Date()
  visibleDate.value = targetDate
  loadAbsences(targetDate)
}

async function loadAbsences(targetDate = visibleDate.value) {
  loading.value = true
  errorMessage.value = ''
  const range = getMonthRange(targetDate)

  const { data: joinedAbsences, error: joinError } = await supabase
    .from('solicitudes')
    .select('id, usuario_id, fecha_inicio, fecha_fin, perfiles:perfiles!solicitudes_usuario_id_fkey(nombre, rol)')
    .eq('estado', 'APROBADA')
    .neq('tipo', 'HORAS_EXTRA')
    .lte('fecha_inicio', range.end.toISOString())
    .gte('fecha_fin', range.start.toISOString())
    .order('fecha_inicio', { ascending: true })

  if (!joinError) {
    absences.value = (joinedAbsences || []).map((absence) => ({
      ...absence,
      perfil: absence.perfiles,
    }))
    loading.value = false
    return
  }

  console.warn('Join de calendario no disponible, usando fallback:', joinError)

  const { data: solicitudes, error: solicitudesError } = await supabase
    .from('solicitudes')
    .select('id, usuario_id, fecha_inicio, fecha_fin')
    .eq('estado', 'APROBADA')
    .neq('tipo', 'HORAS_EXTRA')
    .lte('fecha_inicio', range.end.toISOString())
    .gte('fecha_fin', range.start.toISOString())
    .order('fecha_inicio', { ascending: true })

  if (solicitudesError) {
    console.error('Error cargando solicitudes aprobadas:', solicitudesError)
    loading.value = false
    errorMessage.value = 'No se pudo cargar la disponibilidad.'
    return
  }

  const userIds = [...new Set((solicitudes || []).map((solicitud) => solicitud.usuario_id))]

  if (userIds.length === 0) {
    absences.value = []
    loading.value = false
    return
  }

  const { data: perfiles, error: perfilesError } = await supabase
    .from('perfiles')
    .select('id, nombre, rol')
    .in('id', userIds)

  loading.value = false

  if (perfilesError) {
    console.error('Error cargando perfiles para calendario:', perfilesError)
    errorMessage.value = 'No se pudo cargar la disponibilidad.'
    return
  }

  const profilesById = new Map((perfiles || []).map((perfil) => [perfil.id, perfil]))

  absences.value = (solicitudes || []).map((solicitud) => ({
    ...solicitud,
    perfil: profilesById.get(solicitud.usuario_id) || null,
  }))
}

onMounted(loadAbsences)
</script>

<template>
  <section class="mt-7 rounded-lg border border-slate-800 bg-slate-900 p-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold">Disponibilidad</h2>
        <p class="mt-1 text-sm capitalize text-slate-400">{{ monthLabel }}</p>
      </div>
      <div class="flex gap-2">
        <button class="h-9 w-9 rounded-lg border border-slate-700 text-lg font-bold text-slate-300" type="button" @click="goToPreviousMonth">
          &lt;
        </button>
        <button class="h-9 w-9 rounded-lg border border-slate-700 text-lg font-bold text-slate-300" type="button" @click="goToNextMonth">
          &gt;
        </button>
      </div>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <button class="h-10 rounded-lg bg-slate-950 text-sm font-semibold text-slate-300" type="button" @click="goToCurrentMonth">
        Mes actual
      </button>
      <button class="h-10 rounded-lg bg-slate-950 text-sm font-semibold text-slate-300" type="button" @click="loadAbsences">
        Actualizar
      </button>
    </div>

    <div class="mt-4 grid grid-cols-4 gap-2">
      <button
        v-for="filter in roleFilters"
        :key="filter.value"
        class="h-10 rounded-lg text-xs font-bold transition"
        :class="selectedRole === filter.value ? 'bg-emerald-400 text-slate-950' : 'bg-slate-950 text-slate-300'"
        type="button"
        @click="selectedRole = filter.value"
      >
        {{ filter.label }}
      </button>
    </div>

    <p v-if="loading" class="mt-4 rounded-lg bg-slate-950 p-3 text-sm text-slate-400">
      Cargando ausencias aprobadas...
    </p>

    <p v-if="errorMessage" class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
      {{ errorMessage }}
    </p>

    <div class="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500">
      <span v-for="dayName in weekDays" :key="dayName" class="py-1">{{ dayName }}</span>
    </div>

    <div class="mt-1 grid grid-cols-7 gap-1">
      <button
        v-for="day in calendarDays"
        :key="day.key"
        class="min-h-20 rounded-lg border p-1.5 text-left transition active:scale-[0.98]"
        :class="day.empty ? 'border-transparent bg-transparent' : 'border-slate-800 bg-slate-950'"
        type="button"
        :disabled="day.empty"
        @click="openDayDetail(day)"
      >
        <template v-if="!day.empty">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-slate-100">{{ day.day }}</span>
            <span v-if="day.events.length" class="h-2 w-2 rounded-full bg-red-300"></span>
          </div>

          <div class="mt-1 space-y-1">
            <p
              v-for="event in day.events.slice(0, 2)"
              :key="event.id"
              class="truncate rounded bg-red-400/10 px-1.5 py-1 text-[10px] leading-tight text-red-100"
              :title="event.label"
            >
              {{ event.label }}
            </p>
            <p v-if="day.events.length > 2" class="text-[10px] font-medium text-slate-500">
              +{{ day.events.length - 2 }} mas
            </p>
          </div>
        </template>
      </button>
    </div>

    <div v-if="selectedDay" class="fixed inset-0 z-50 bg-slate-950/80 px-4 py-5 backdrop-blur-sm">
      <section class="mx-auto flex min-h-full w-full max-w-md items-end">
        <div class="w-full rounded-t-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-bold">Detalle del dia</h3>
              <p class="mt-1 text-sm capitalize text-slate-400">{{ formatLongDate(selectedDay.date) }}</p>
            </div>
            <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" type="button" @click="closeDayDetail">
              Cerrar
            </button>
          </div>

          <div v-if="selectedDay.events.length === 0" class="mt-5 rounded-lg bg-slate-950 p-4 text-sm text-slate-400">
            No hay ausencias aprobadas para este dia.
          </div>

          <ul v-else class="mt-5 space-y-3">
            <li v-for="event in selectedDay.events" :key="event.id" class="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-bold text-slate-100">{{ event.name }}</p>
                  <p class="mt-1 text-sm text-slate-400">{{ event.role }}</p>
                </div>
                <span class="rounded-full bg-red-400/10 px-3 py-1 text-xs font-bold text-red-100">
                  Ocupado
                </span>
              </div>
              <div class="mt-3 rounded-lg bg-slate-900 px-3 py-2">
                <p class="text-xs text-slate-500">Horario</p>
                <p class="mt-1 text-lg font-black text-red-100">{{ event.start }} - {{ event.end }}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </section>
</template>
