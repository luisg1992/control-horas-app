<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase'
import CalendarioDisponibilidad from '../components/CalendarioDisponibilidad.vue'

const router = useRouter()

const user = ref(null)
const profile = ref(null)
const requests = ref([])
const loading = ref(true)
const saving = ref(false)
const formError = ref('')
const activeModal = ref(null)
const checkingAvailability = ref(false)
const availabilityConflict = ref(false)
const historyPage = ref(1)
const historyPageSize = 5
const passwordForm = ref({
  password: '',
  confirmPassword: '',
})
const passwordMessage = ref('')

const extraForm = ref({
  ticketCode: '',
  ticketDescription: '',
  workDate: '',
  hours: 1,
})

const timeOffForm = ref({
  tipo: 'RECUPERAR_HORAS',
  fechaInicio: '',
  fechaFin: '',
  motivo: '',
})

let availabilityTimer = null

const statusStyles = {
  PENDIENTE: 'bg-amber-400/10 text-amber-200 ring-amber-400/20',
  APROBADA: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/20',
  RECHAZADA: 'bg-red-400/10 text-red-200 ring-red-400/20',
  REPROGRAMADA: 'bg-sky-400/10 text-sky-200 ring-sky-400/20',
}

const timeOffRange = computed(() => {
  if (!timeOffForm.value.fechaInicio || !timeOffForm.value.fechaFin) {
    return null
  }

  if (timeOffForm.value.tipo === 'VACACIONES') {
    const start = dateOnlyToLocalDate(timeOffForm.value.fechaInicio, 0, 0, 0)
    const end = dateOnlyToLocalDate(timeOffForm.value.fechaFin, 23, 59, 59)

    return {
      start,
      end,
      isValid: end > start,
    }
  }

  const start = new Date(timeOffForm.value.fechaInicio)
  const end = new Date(timeOffForm.value.fechaFin)

  return {
    start,
    end,
    isValid: end > start,
  }
})

const timeOffAmount = computed(() => {
  const range = timeOffRange.value

  if (!range?.isValid) {
    return 0
  }

  if (timeOffForm.value.tipo === 'VACACIONES') {
    const start = dateOnlyToLocalDate(timeOffForm.value.fechaInicio, 0, 0, 0)
    const end = dateOnlyToLocalDate(timeOffForm.value.fechaFin, 0, 0, 0)
    const oneDay = 1000 * 60 * 60 * 24

    return Math.floor((end - start) / oneDay) + 1
  }

  const hours = (range.end - range.start) / (1000 * 60 * 60)
  return Number(hours.toFixed(2))
})

const exceedsAvailableHours = computed(() => {
  if (timeOffForm.value.tipo !== 'RECUPERAR_HORAS') {
    return false
  }

  return timeOffAmount.value > Number(profile.value?.saldo_horas || 0)
})

const canSubmitExtra = computed(() => {
  return (
    !saving.value &&
    extraForm.value.ticketCode.trim().length > 0 &&
    extraForm.value.workDate &&
    Number(extraForm.value.hours) > 0
  )
})

const canSubmitTimeOff = computed(() => {
  return (
    !saving.value &&
    !checkingAvailability.value &&
    !availabilityConflict.value &&
    !exceedsAvailableHours.value &&
    timeOffRange.value?.isValid &&
    timeOffForm.value.motivo.trim().length > 0
  )
})

const totalHistoryPages = computed(() => {
  return Math.max(1, Math.ceil(requests.value.length / historyPageSize))
})

const paginatedRequests = computed(() => {
  const start = (historyPage.value - 1) * historyPageSize
  return requests.value.slice(start, start + historyPageSize)
})

function dateOnlyToLocalDate(value, hours, minutes, seconds) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, hours, minutes, seconds)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function openNativePicker(event) {
  event.target.showPicker?.()
}

function requestTitle(request) {
  if (request.tipo === 'HORAS_EXTRA') {
    return 'Horas extra trabajadas'
  }

  return request.tipo === 'VACACIONES' ? 'Tiempo libre: vacaciones' : 'Tiempo libre: horas acumuladas'
}

async function loadDashboard() {
  loading.value = true

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  user.value = currentUser

  if (!currentUser) {
    await router.replace('/login')
    return
  }

  const [{ data: profileData }, { data: requestData, error: requestError }] = await Promise.all([
    supabase
      .from('perfiles')
      .select('id, nombre, email, rol, saldo_horas, dias_vacaciones')
      .eq('id', currentUser.id)
      .single(),
    supabase
      .from('solicitudes')
      .select('id, tipo, fecha_inicio, fecha_fin, cantidad, motivo, descripcion_ticket, estado, creado_en, notas_aprobador')
      .eq('usuario_id', currentUser.id)
      .order('creado_en', { ascending: false }),
  ])

  profile.value = profileData
  requests.value = requestError ? [] : requestData || []
  historyPage.value = 1
  loading.value = false
}

function openExtraModal() {
  formError.value = ''
  availabilityConflict.value = false
  extraForm.value = {
    ticketCode: '',
    ticketDescription: '',
    workDate: '',
    hours: 1,
  }
  activeModal.value = 'extra'
}

function openTimeOffModal() {
  formError.value = ''
  availabilityConflict.value = false
  timeOffForm.value = {
    tipo: 'RECUPERAR_HORAS',
    fechaInicio: '',
    fechaFin: '',
    motivo: '',
  }
  activeModal.value = 'timeOff'
}

function openPasswordModal() {
  formError.value = ''
  passwordMessage.value = ''
  passwordForm.value = {
    password: '',
    confirmPassword: '',
  }
  activeModal.value = 'password'
}

function closeModal() {
  activeModal.value = null
}

async function updatePassword() {
  formError.value = ''
  passwordMessage.value = ''

  if (passwordForm.value.password.length < 8) {
    formError.value = 'La contrasena debe tener al menos 8 caracteres.'
    return
  }

  if (passwordForm.value.password !== passwordForm.value.confirmPassword) {
    formError.value = 'Las contrasenas no coinciden.'
    return
  }

  saving.value = true

  const { error } = await supabase.auth.updateUser({
    password: passwordForm.value.password,
  })

  saving.value = false

  if (error) {
    formError.value = error.message || 'No se pudo actualizar la contrasena.'
    return
  }

  passwordMessage.value = 'Contrasena actualizada correctamente.'
  passwordForm.value = {
    password: '',
    confirmPassword: '',
  }
}

async function checkAvailability() {
  const range = timeOffRange.value

  availabilityConflict.value = false

  if (activeModal.value !== 'timeOff' || !range?.isValid || !profile.value || !user.value) {
    return
  }

  checkingAvailability.value = true

  const { data: ownConflicts, error: ownConflictsError } = await supabase
    .from('solicitudes')
    .select('id')
    .eq('usuario_id', user.value.id)
    .in('estado', ['PENDIENTE', 'APROBADA'])
    .neq('tipo', 'HORAS_EXTRA')
    .lt('fecha_inicio', range.end.toISOString())
    .gt('fecha_fin', range.start.toISOString())
    .limit(1)

  if (ownConflictsError) {
    console.error('Error validando solicitudes propias:', ownConflictsError)
    checkingAvailability.value = false
    formError.value = 'No se pudo validar la disponibilidad. Intenta de nuevo.'
    return
  }

  if ((ownConflicts || []).length > 0) {
    checkingAvailability.value = false
    availabilityConflict.value = true
    formError.value = 'Ya tienes una solicitud pendiente o aprobada en ese mismo horario.'
    return
  }

  const { data: teammates, error: teammatesError } = await supabase
    .from('perfiles')
    .select('id')
    .eq('rol', profile.value.rol)
    .eq('activo', true)
    .neq('id', user.value.id)

  if (teammatesError) {
    console.error('Error consultando compañeros para disponibilidad:', teammatesError)
    checkingAvailability.value = false
    formError.value = 'No se pudo validar la disponibilidad. Intenta de nuevo.'
    return
  }

  const teammateIds = (teammates || []).map((teammate) => teammate.id)

  if (teammateIds.length === 0) {
    checkingAvailability.value = false
    availabilityConflict.value = false
    return
  }

  const { data, error } = await supabase
    .from('solicitudes')
    .select('id, usuario_id, fecha_inicio, fecha_fin')
    .eq('estado', 'APROBADA')
    .in('usuario_id', teammateIds)
    .neq('tipo', 'HORAS_EXTRA')
    .lt('fecha_inicio', range.end.toISOString())
    .gt('fecha_fin', range.start.toISOString())
    .limit(1)

  checkingAvailability.value = false

  if (error) {
    console.error('Error validando disponibilidad:', error)
    formError.value = 'No se pudo validar la disponibilidad. Intenta de nuevo.'
    return
  }

  availabilityConflict.value = (data || []).length > 0
}

async function submitExtraHours() {
  formError.value = ''

  if (!canSubmitExtra.value) {
    formError.value = 'Completa el codigo del ticket, fecha y duracion.'
    return
  }

  const start = dateOnlyToLocalDate(extraForm.value.workDate, 0, 0, 0)
  const end = new Date(start)
  const hours = Number(extraForm.value.hours)
  end.setMinutes(end.getMinutes() + hours * 60)

  saving.value = true

  const { error } = await supabase.rpc('registrar_horas_extra', {
    p_ticket: extraForm.value.ticketCode.trim(),
    p_descripcion: extraForm.value.ticketDescription.trim() || 'Sin descripcion',
    p_fecha_inicio: start.toISOString(),
    p_fecha_fin: end.toISOString(),
    p_cantidad: hours,
  })

  saving.value = false

  if (error) {
    formError.value = error.message || 'No se pudo registrar la carga de horas.'
    return
  }

  closeModal()
  await loadDashboard()
}

async function submitTimeOff() {
  const range = timeOffRange.value

  formError.value = ''

  if (!range?.isValid) {
    formError.value = 'Revisa la fecha y hora de inicio y fin.'
    return
  }

  if (exceedsAvailableHours.value) {
    formError.value = 'No tienes suficientes horas extra acumuladas para esta solicitud.'
    return
  }

  await checkAvailability()

  if (availabilityConflict.value) {
    return
  }

  saving.value = true

  const { error } = await supabase.from('solicitudes').insert({
    usuario_id: user.value.id,
    tipo: timeOffForm.value.tipo,
    fecha_inicio: range.start.toISOString(),
    fecha_fin: range.end.toISOString(),
    cantidad: timeOffAmount.value,
    motivo: timeOffForm.value.motivo.trim(),
    descripcion_ticket: null,
    estado: 'PENDIENTE',
  })

  saving.value = false

  if (error) {
    formError.value = error.message || 'No se pudo enviar la solicitud.'
    return
  }

  closeModal()
  await loadDashboard()
}

async function deletePendingRequest(request) {
  if (request.estado !== 'PENDIENTE') {
    return
  }

  const confirmed = window.confirm('¿Quieres eliminar esta solicitud pendiente?')

  if (!confirmed) {
    return
  }

  const { error } = await supabase
    .from('solicitudes')
    .delete()
    .eq('id', request.id)
    .eq('usuario_id', user.value.id)
    .eq('estado', 'PENDIENTE')

  if (error) {
    formError.value = error.message || 'No se pudo eliminar la solicitud.'
    return
  }

  requests.value = requests.value.filter((item) => item.id !== request.id)
  if (historyPage.value > totalHistoryPages.value) {
    historyPage.value = totalHistoryPages.value
  }
}

function goToPreviousHistoryPage() {
  historyPage.value = Math.max(1, historyPage.value - 1)
}

function goToNextHistoryPage() {
  historyPage.value = Math.min(totalHistoryPages.value, historyPage.value + 1)
}

async function logout() {
  await supabase.auth.signOut()
  await router.replace('/login')
}

watch(
  () => [activeModal.value, timeOffForm.value.tipo, timeOffForm.value.fechaInicio, timeOffForm.value.fechaFin],
  () => {
    window.clearTimeout(availabilityTimer)
    availabilityConflict.value = false
    formError.value = ''

    availabilityTimer = window.setTimeout(() => {
      checkAvailability()
    }, 350)
  },
)

onMounted(loadDashboard)
</script>

<template>
  <main class="min-h-screen bg-slate-950 px-4 pb-8 pt-5 text-white">
    <section class="mx-auto w-full max-w-md">
      <header class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-emerald-300">Control Horas</p>
          <h1 class="mt-1 text-2xl font-bold">Hola, {{ profile?.nombre || 'empleado' }}</h1>
          <p class="mt-1 text-sm text-slate-400">{{ profile?.rol || 'Cargando perfil...' }}</p>
        </div>
        <div class="grid gap-2">
          <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200" type="button" @click="openPasswordModal">
            Clave
          </button>
          <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200" type="button" @click="logout">
            Salir
          </button>
        </div>
      </header>

      <section class="mt-6 grid grid-cols-2 gap-3">
        <article class="rounded-lg bg-emerald-400 p-4 text-slate-950">
          <p class="text-xs font-semibold uppercase">Saldo de Horas Extra</p>
          <p class="mt-3 text-3xl font-black">{{ profile?.saldo_horas ?? '-' }}</p>
          <p class="mt-1 text-xs font-medium">horas disponibles</p>
        </article>

        <article class="rounded-lg bg-sky-300 p-4 text-slate-950">
          <p class="text-xs font-semibold uppercase">Dias de Vacaciones Disponibles</p>
          <p class="mt-3 text-3xl font-black">{{ profile?.dias_vacaciones ?? '-' }}</p>
          <p class="mt-1 text-xs font-medium">dias restantes</p>
        </article>
      </section>

      <nav v-if="profile?.rol === 'Admin' || profile?.rol === 'Business'" class="mt-5 grid gap-3">
        <RouterLink
          v-if="profile?.rol === 'Admin'"
          class="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-4 text-left font-bold text-emerald-100"
          to="/admin"
        >
          Administracion y Reportes
        </RouterLink>

        <RouterLink
          class="rounded-lg border border-sky-300/30 bg-sky-300/10 px-4 py-4 text-left font-bold text-sky-100"
          to="/aprobaciones"
        >
          Panel de Aprobaciones
        </RouterLink>
      </nav>

      <section class="mt-5 grid gap-3">
        <button class="rounded-lg bg-emerald-400 px-4 py-5 text-left text-slate-950 shadow-lg shadow-emerald-950/30" type="button" @click="openExtraModal">
          <span class="block text-lg font-black">Registrar Horas Extra Trabajadas (+)</span>
          <span class="mt-1 block text-sm font-medium">Carga un ticket OCD/MVP para aprobacion.</span>
        </button>

        <button class="rounded-lg bg-slate-100 px-4 py-5 text-left text-slate-950 shadow-lg shadow-black/20" type="button" @click="openTimeOffModal">
          <span class="block text-lg font-black">Solicitar Tiempo Libre / Vacaciones (-)</span>
          <span class="mt-1 block text-sm font-medium">Usa horas acumuladas o dias de vacaciones.</span>
        </button>
      </section>

      <CalendarioDisponibilidad />

      <section class="mt-7">
        <div>
          <h2 class="text-lg font-bold">Historial</h2>
          <p class="text-sm text-slate-400">Solicitudes ordenadas por fecha</p>
        </div>

        <div v-if="loading" class="mt-5 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
          Cargando informacion...
        </div>

        <div v-else-if="requests.length === 0" class="mt-5 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
          Todavia no tienes solicitudes.
        </div>

        <ul v-else class="mt-5 space-y-3">
          <li v-for="request in paginatedRequests" :key="request.id" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold">{{ requestTitle(request) }}</p>
                <p class="mt-1 text-sm text-slate-400">
                  {{ formatDate(request.fecha_inicio) }} - {{ formatDate(request.fecha_fin) }}
                </p>
              </div>
              <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1" :class="statusStyles[request.estado]">
                {{ request.estado }}
              </span>
            </div>

            <div v-if="request.tipo === 'HORAS_EXTRA'" class="mt-3 rounded-lg bg-slate-950 p-3">
              <p class="text-xs text-slate-500">Codigo del ticket</p>
              <p class="font-semibold text-slate-100">{{ request.motivo }}</p>
              <p class="mt-2 text-xs text-slate-500">Descripcion</p>
              <p class="text-sm text-slate-300">{{ request.descripcion_ticket }}</p>
              <p class="mt-2 text-xs text-slate-500">Duracion decimal</p>
              <p class="text-sm font-semibold text-emerald-300">{{ request.cantidad }} horas</p>
            </div>

            <div v-else class="mt-3">
              <p class="text-sm text-slate-300">{{ request.motivo }}</p>
              <p class="mt-2 text-xs text-slate-500">
                Cantidad: {{ request.cantidad }} {{ request.tipo === 'VACACIONES' ? 'dias' : 'horas' }}
              </p>
            </div>

            <button
              v-if="request.estado === 'PENDIENTE'"
              class="mt-4 h-11 w-full rounded-lg bg-red-400 text-sm font-black text-slate-950"
              type="button"
              @click="deletePendingRequest(request)"
            >
              Eliminar Solicitud Pendiente
            </button>
          </li>
        </ul>

        <div v-if="requests.length > historyPageSize" class="mt-4 flex items-center justify-between gap-3">
          <button
            class="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            :disabled="historyPage === 1"
            @click="goToPreviousHistoryPage"
          >
            Anterior
          </button>

          <span class="text-sm text-slate-400">
            {{ historyPage }} / {{ totalHistoryPages }}
          </span>

          <button
            class="h-10 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            :disabled="historyPage === totalHistoryPages"
            @click="goToNextHistoryPage"
          >
            Siguiente
          </button>
        </div>
      </section>
    </section>

    <div v-if="activeModal" class="fixed inset-0 z-50 bg-slate-950/80 px-4 py-5 backdrop-blur-sm">
      <section class="mx-auto flex min-h-full w-full max-w-md items-end">
        <form
          v-if="activeModal === 'extra'"
          class="w-full rounded-t-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
          @submit.prevent="submitExtraHours"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-bold">Registrar Horas Extras</h2>
              <p class="mt-1 text-sm text-slate-400">Carga el ticket trabajado para aprobacion.</p>
            </div>
            <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" type="button" @click="closeModal">
              Cerrar
            </button>
          </div>

          <label class="mt-5 block">
            <span class="text-sm font-medium text-slate-200">Codigo del Ticket OCD/MVP</span>
            <input
              v-model="extraForm.ticketCode"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              placeholder="OCD-1234"
              type="text"
              required
            />
          </label>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Nombre o Descripcion Corta del Ticket</span>
            <input
              v-model="extraForm.ticketDescription"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              placeholder="Migracion de base de datos"
              type="text"
            />
          </label>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Dia trabajado</span>
            <input
              v-model="extraForm.workDate"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              type="date"
              @click="openNativePicker"
              @focus="openNativePicker"
              required
            />
          </label>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Duracion en horas</span>
            <input
              v-model.number="extraForm.hours"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              min="0.5"
              step="0.5"
              type="number"
              required
            />
          </label>

          <p v-if="formError" class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
            {{ formError }}
          </p>

          <button
            class="mt-5 h-12 w-full rounded-lg bg-emerald-400 font-black text-slate-950 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            :disabled="!canSubmitExtra"
          >
            {{ saving ? 'Guardando...' : 'Enviar a Aprobacion' }}
          </button>
        </form>

        <form
          v-else-if="activeModal === 'timeOff'"
          class="w-full rounded-t-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
          @submit.prevent="submitTimeOff"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-bold">Solicitar Tiempo Libre</h2>
              <p class="mt-1 text-sm text-slate-400">Puedes seleccionar fechas pasadas.</p>
            </div>
            <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" type="button" @click="closeModal">
              Cerrar
            </button>
          </div>

          <label class="mt-5 block">
            <span class="text-sm font-medium text-slate-200">Tipo</span>
            <select
              v-model="timeOffForm.tipo"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
            >
              <option value="RECUPERAR_HORAS">Gastar Horas Acumuladas</option>
              <option value="VACACIONES">Tomar Vacaciones</option>
            </select>
          </label>

          <div class="mt-4 grid grid-cols-1 gap-4">
            <label class="block">
              <span class="text-sm font-medium text-slate-200">Inicio</span>
              <input
                v-model="timeOffForm.fechaInicio"
                class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
                :type="timeOffForm.tipo === 'RECUPERAR_HORAS' ? 'datetime-local' : 'date'"
                @click="openNativePicker"
                @focus="openNativePicker"
                required
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium text-slate-200">Fin</span>
              <input
                v-model="timeOffForm.fechaFin"
                class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
                :type="timeOffForm.tipo === 'RECUPERAR_HORAS' ? 'datetime-local' : 'date'"
                @click="openNativePicker"
                @focus="openNativePicker"
                required
              />
            </label>
          </div>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Motivo</span>
            <textarea
              v-model="timeOffForm.motivo"
              class="mt-2 min-h-24 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base outline-none focus:border-emerald-400"
              placeholder="Describe brevemente el motivo"
              required
            />
          </label>

          <p v-if="checkingAvailability" class="mt-4 rounded-lg bg-slate-800 p-3 text-sm text-slate-300">
            Validando disponibilidad...
          </p>

          <p v-if="availabilityConflict && !formError" class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm font-semibold text-red-200">
            Alerta de disponibilidad: un companero de tu equipo ya tiene libre este horario.
          </p>

          <p v-if="exceedsAvailableHours" class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm font-semibold text-red-200">
            No tienes suficientes horas extra acumuladas para esta solicitud.
          </p>

          <p v-if="formError" class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
            {{ formError }}
          </p>

          <div class="mt-4 rounded-lg bg-slate-950 p-3 text-sm text-slate-300">
            Cantidad calculada:
            <span class="font-bold text-white">{{ timeOffAmount }}</span>
            {{ timeOffForm.tipo === 'RECUPERAR_HORAS' ? 'horas' : 'dias' }}
          </div>

          <button
            class="mt-5 h-12 w-full rounded-lg bg-emerald-400 font-black text-slate-950 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            :disabled="!canSubmitTimeOff"
          >
            {{ saving ? 'Enviando...' : 'Enviar Solicitud' }}
          </button>
        </form>

        <form
          v-else
          class="w-full rounded-t-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
          @submit.prevent="updatePassword"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-bold">Cambiar Contrasena</h2>
              <p class="mt-1 text-sm text-slate-400">Actualiza la clave temporal asignada.</p>
            </div>
            <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300" type="button" @click="closeModal">
              Cerrar
            </button>
          </div>

          <label class="mt-5 block">
            <span class="text-sm font-medium text-slate-200">Nueva contrasena</span>
            <input
              v-model="passwordForm.password"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              type="password"
              autocomplete="new-password"
              required
            />
          </label>

          <label class="mt-4 block">
            <span class="text-sm font-medium text-slate-200">Confirmar contrasena</span>
            <input
              v-model="passwordForm.confirmPassword"
              class="mt-2 h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base outline-none focus:border-emerald-400"
              type="password"
              autocomplete="new-password"
              required
            />
          </label>

          <p v-if="formError" class="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
            {{ formError }}
          </p>

          <p v-if="passwordMessage" class="mt-4 rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-200">
            {{ passwordMessage }}
          </p>

          <button
            class="mt-5 h-12 w-full rounded-lg bg-emerald-400 font-black text-slate-950 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            :disabled="saving"
          >
            {{ saving ? 'Actualizando...' : 'Actualizar Contrasena' }}
          </button>
        </form>
      </section>
    </div>
  </main>
</template>
