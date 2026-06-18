<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../supabase'

const loading = ref(true)
const processingId = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const currentApprover = ref(null)
const pendingRequests = ref([])
const approvedRequests = ref([])
const rejectRequestId = ref('')
const rejectNote = ref('')
const reprogramRequestId = ref('')
const reprogramNote = ref('')

const statusStyles = {
  PENDIENTE: 'bg-amber-400/10 text-amber-200 ring-amber-400/20',
  APROBADA: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/20',
  RECHAZADA: 'bg-red-400/10 text-red-200 ring-red-400/20',
  REPROGRAMADA: 'bg-sky-400/10 text-sky-200 ring-sky-400/20',
}

const selectedReprogramRequest = computed(() => {
  return approvedRequests.value.find((request) => request.id === reprogramRequestId.value) || null
})

function isExtraHours(request) {
  return request.tipo === 'HORAS_EXTRA'
}

function requestKindLabel(request) {
  if (isExtraHours(request)) {
    return 'Horas extra trabajadas'
  }

  return request.tipo === 'VACACIONES' ? 'Vacaciones' : 'Gastar horas acumuladas'
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

function formatAmount(request) {
  return `${request.cantidad} ${request.tipo === 'VACACIONES' ? 'dias' : 'horas'}`
}

function balanceDeltaForApproval(request) {
  if (isExtraHours(request)) {
    return { saldo_horas: Number(request.cantidad), dias_vacaciones: 0 }
  }

  if (request.tipo === 'VACACIONES') {
    return { saldo_horas: 0, dias_vacaciones: -Number(request.cantidad) }
  }

  return { saldo_horas: -Number(request.cantidad), dias_vacaciones: 0 }
}

function invertDelta(delta) {
  return {
    saldo_horas: -delta.saldo_horas,
    dias_vacaciones: -delta.dias_vacaciones,
  }
}

async function loadApprover() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    currentApprover.value = null
    return
  }

  const { data } = await supabase
    .from('perfiles')
    .select('id, nombre, rol')
    .eq('id', user.id)
    .single()

  currentApprover.value = data
}

async function loadRequests() {
  loading.value = true
  errorMessage.value = ''

  await loadApprover()

  const { data: solicitudes, error: solicitudesError } = await supabase
    .from('solicitudes')
    .select(
      'id, usuario_id, tipo, fecha_inicio, fecha_fin, cantidad, motivo, descripcion_ticket, estado, notas_aprobador, creado_en',
    )
    .in('estado', ['PENDIENTE', 'APROBADA'])
    .in('tipo', ['RECUPERAR_HORAS', 'VACACIONES'])
    .order('creado_en', { ascending: false })

  if (solicitudesError) {
    console.error('Error cargando solicitudes:', solicitudesError)
    errorMessage.value = 'No se pudieron cargar las solicitudes.'
    loading.value = false
    return
  }

  const userIds = [...new Set((solicitudes || []).map((request) => request.usuario_id))]

  let profilesById = new Map()

  if (userIds.length > 0) {
    const { data: perfiles, error: perfilesError } = await supabase
      .from('perfiles')
      .select('id, nombre, email, rol, saldo_horas, dias_vacaciones')
      .in('id', userIds)

    if (perfilesError) {
      console.error('Error cargando perfiles:', perfilesError)
      errorMessage.value = 'No se pudieron cargar los empleados de las solicitudes.'
      loading.value = false
      return
    }

    profilesById = new Map((perfiles || []).map((profile) => [profile.id, profile]))
  }

  const hydratedRequests = (solicitudes || []).map((request) => ({
    ...request,
    empleado: profilesById.get(request.usuario_id) || null,
  }))

  pendingRequests.value = hydratedRequests.filter((request) => request.estado === 'PENDIENTE')
  approvedRequests.value = hydratedRequests.filter((request) => request.estado === 'APROBADA')
  loading.value = false
}

async function applyProfileDelta(request, delta) {
  const profile = request.empleado

  if (!profile) {
    throw new Error('No se encontro el perfil del empleado.')
  }

  const nextSaldoHoras = Number(profile.saldo_horas || 0) + delta.saldo_horas
  const nextDiasVacaciones = Number(profile.dias_vacaciones || 0) + delta.dias_vacaciones

  const { error } = await supabase
    .from('perfiles')
    .update({
      saldo_horas: nextSaldoHoras,
      dias_vacaciones: Math.trunc(nextDiasVacaciones),
    })
    .eq('id', request.usuario_id)

  if (error) {
    throw error
  }
}

async function approveRequest(request) {
  if (!currentApprover.value) {
    errorMessage.value = 'No se pudo identificar el aprobador.'
    return
  }

  processingId.value = request.id
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await applyProfileDelta(request, balanceDeltaForApproval(request))

    const { error } = await supabase
      .from('solicitudes')
      .update({
        estado: 'APROBADA',
        aprobado_por: currentApprover.value.id,
        notas_aprobador: null,
      })
      .eq('id', request.id)
      .eq('estado', 'PENDIENTE')

    if (error) {
      throw error
    }

    successMessage.value = 'Solicitud aprobada y saldo actualizado.'
    await loadRequests()
  } catch (error) {
    console.error('Error aprobando solicitud:', error)
    errorMessage.value = error.message || 'No se pudo aprobar la solicitud.'
  } finally {
    processingId.value = ''
  }
}

function openReject(request) {
  rejectRequestId.value = request.id
  rejectNote.value = ''
  errorMessage.value = ''
}

async function rejectRequest(request) {
  if (!rejectNote.value.trim()) {
    errorMessage.value = 'La nota del rechazo es obligatoria.'
    return
  }

  processingId.value = request.id
  errorMessage.value = ''
  successMessage.value = ''

  const { error } = await supabase
    .from('solicitudes')
    .update({
      estado: 'RECHAZADA',
      aprobado_por: currentApprover.value?.id || null,
      notas_aprobador: rejectNote.value.trim(),
    })
    .eq('id', request.id)
    .eq('estado', 'PENDIENTE')

  processingId.value = ''

  if (error) {
    console.error('Error rechazando solicitud:', error)
    errorMessage.value = error.message || 'No se pudo rechazar la solicitud.'
    return
  }

  rejectRequestId.value = ''
  rejectNote.value = ''
  successMessage.value = 'Solicitud rechazada.'
  await loadRequests()
}

function openReprogram(request) {
  reprogramRequestId.value = request.id
  reprogramNote.value = ''
  errorMessage.value = ''
}

async function reprogramApprovedRequest() {
  const request = selectedReprogramRequest.value

  if (!request) {
    errorMessage.value = 'Selecciona una solicitud aprobada.'
    return
  }

  if (!reprogramNote.value.trim()) {
    errorMessage.value = 'La nota de urgencia es obligatoria.'
    return
  }

  processingId.value = request.id
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await applyProfileDelta(request, invertDelta(balanceDeltaForApproval(request)))

    const { error } = await supabase
      .from('solicitudes')
      .update({
        estado: 'REPROGRAMADA',
        notas_aprobador: reprogramNote.value.trim(),
        aprobado_por: currentApprover.value?.id || null,
      })
      .eq('id', request.id)
      .eq('estado', 'APROBADA')

    if (error) {
      throw error
    }

    reprogramRequestId.value = ''
    reprogramNote.value = ''
    successMessage.value = 'Solicitud reprogramada y saldo restaurado.'
    await loadRequests()
  } catch (error) {
    console.error('Error reprogramando solicitud:', error)
    errorMessage.value = error.message || 'No se pudo reprogramar la solicitud.'
  } finally {
    processingId.value = ''
  }
}

onMounted(loadRequests)
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold">Panel de Aprobaciones</h2>
        <p class="mt-1 text-sm text-slate-400">Solicitudes de horas y vacaciones</p>
      </div>
      <button class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200" type="button" @click="loadRequests">
        Actualizar
      </button>
    </div>

    <p v-if="errorMessage" class="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
      {{ errorMessage }}
    </p>

    <p v-if="successMessage" class="rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-200">
      {{ successMessage }}
    </p>

    <section>
      <h3 class="text-lg font-bold">Solicitudes Pendientes</h3>

      <div v-if="loading" class="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        Cargando solicitudes...
      </div>

      <div v-else-if="pendingRequests.length === 0" class="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        No hay solicitudes pendientes.
      </div>

      <ul v-else class="mt-4 space-y-4">
        <li v-for="request in pendingRequests" :key="request.id" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-bold">{{ request.empleado?.nombre || 'Empleado sin perfil' }}</p>
              <p class="mt-1 text-sm text-slate-400">{{ request.empleado?.rol || 'Sin rol' }}</p>
            </div>
            <span class="rounded-full px-2.5 py-1 text-xs font-bold ring-1" :class="statusStyles[request.estado]">
              {{ request.estado }}
            </span>
          </div>

          <div class="mt-4 rounded-lg bg-slate-950 p-3">
            <p class="text-xs text-slate-500">Tipo</p>
            <p class="font-semibold">{{ requestKindLabel(request) }}</p>
            <p class="mt-2 text-xs text-slate-500">Rango exacto</p>
            <p class="text-sm text-slate-300">{{ formatDate(request.fecha_inicio) }} - {{ formatDate(request.fecha_fin) }}</p>
            <p class="mt-2 text-xs text-slate-500">Cantidad</p>
            <p class="text-sm font-semibold text-emerald-300">{{ formatAmount(request) }}</p>
          </div>

          <div v-if="isExtraHours(request)" class="mt-3 rounded-lg bg-slate-950 p-3">
            <p class="text-xs text-slate-500">Codigo del Ticket</p>
            <p class="font-semibold text-white">{{ request.motivo }}</p>
            <p class="mt-2 text-xs text-slate-500">Nombre o Descripcion del Ticket</p>
            <p class="text-sm text-slate-300">{{ request.descripcion_ticket || 'Sin descripcion' }}</p>
          </div>

          <div v-else class="mt-3 rounded-lg bg-slate-950 p-3">
            <p class="text-xs text-slate-500">Motivo</p>
            <p class="text-sm text-slate-300">{{ request.motivo }}</p>
          </div>

          <div v-if="rejectRequestId === request.id" class="mt-3">
            <label class="block">
              <span class="text-sm font-medium text-slate-200">Notas del rechazo</span>
              <textarea
                v-model="rejectNote"
                class="mt-2 min-h-24 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base outline-none focus:border-red-300"
                placeholder="Explica el motivo del rechazo"
                required
              />
            </label>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3">
            <button
              class="h-12 rounded-lg bg-emerald-400 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              :disabled="processingId === request.id"
              @click="approveRequest(request)"
            >
              Aprobar
            </button>
            <button
              v-if="rejectRequestId !== request.id"
              class="h-12 rounded-lg bg-red-400 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              :disabled="processingId === request.id"
              @click="openReject(request)"
            >
              Rechazar
            </button>
            <button
              v-else
              class="h-12 rounded-lg bg-red-400 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              :disabled="processingId === request.id || !rejectNote.trim()"
              @click="rejectRequest(request)"
            >
              Confirmar
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section>
      <h3 class="text-lg font-bold">Solicitudes ya Aprobadas</h3>

      <div v-if="approvedRequests.length === 0" class="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        No hay solicitudes aprobadas.
      </div>

      <ul v-else class="mt-4 space-y-3">
        <li v-for="request in approvedRequests" :key="request.id" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <button class="w-full text-left" type="button" @click="openReprogram(request)">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-bold">{{ request.empleado?.nombre || 'Empleado sin perfil' }}</p>
                <p class="mt-1 text-sm text-slate-400">{{ requestKindLabel(request) }} · {{ formatAmount(request) }}</p>
              </div>
              <span class="rounded-full px-2.5 py-1 text-xs font-bold ring-1" :class="statusStyles[request.estado]">
                {{ request.estado }}
              </span>
            </div>
            <p class="mt-3 text-sm text-slate-400">{{ formatDate(request.fecha_inicio) }} - {{ formatDate(request.fecha_fin) }}</p>
          </button>
        </li>
      </ul>

      <div v-if="selectedReprogramRequest" class="mt-4 rounded-lg border border-sky-400/30 bg-sky-400/10 p-4">
        <p class="text-sm font-bold text-sky-100">
          Reprogramar: {{ selectedReprogramRequest.empleado?.nombre }} · {{ requestKindLabel(selectedReprogramRequest) }}
        </p>
        <label class="mt-3 block">
          <span class="text-sm font-medium text-slate-200">Nota de urgencia del negocio</span>
          <textarea
            v-model="reprogramNote"
            class="mt-2 min-h-24 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-base outline-none focus:border-sky-300"
            placeholder="Explica por que se debe reprogramar"
            required
          />
        </label>
        <button
          class="mt-3 h-12 w-full rounded-lg bg-sky-300 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="processingId === selectedReprogramRequest.id || !reprogramNote.trim()"
          @click="reprogramApprovedRequest"
        >
          Reprogramar por Urgencia
        </button>
      </div>
    </section>
  </section>
</template>
