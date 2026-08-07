import { useMemo } from 'react'
import type { IconName } from '../../components/Icon'
import { MODULES } from '../../modules/registry'
import { isViewRegistered } from '../../views/registry'
import { useProtocols } from '../../data/protocols'
import type { ProtocolRow } from '../../data/protocols'
import { usePatients } from '../../data/patients'
import type { PatientRow } from '../../data/patients'
import { useUpcomingVisits } from '../../data/visits'
import type { TrackVisitRow } from '../../data/visits'
import { useMedications } from '../../data/pharma/medications'
import type { MedicationRow } from '../../data/pharma/medications'
import type { NavTarget } from '../../views/types'

/* ============================================================================
   Índice del buscador global (command palette Ctrl/⌘ K).

   Se arma desde los MISMOS hooks con RLS que ya alimentan cada módulo — no hay
   lista aparte que mantener. Forma de la entrada: { type, icon, title, crumb,
   mod, sub }, portada del prototipo pero mapeada a los campos REALES del core.

   INVARIANTE DE ACCESO — una entrada existe solo si el usuario puede:
     (a) LEER su dato  → lo garantiza la RLS (una query sin permiso vuelve vacía), y
     (b) NAVEGAR a su destino → lo gatea isAllowed(mod) acá.
   Las "páginas" salen del array MODULES (cliente, SIN RLS) → filtrarlas por
   isAllowed es obligatorio. Acceso denegado = la entrada no se lista (en silencio).
   ============================================================================ */

export type SearchType = 'protocolo' | 'paciente' | 'visita' | 'medicamento' | 'pagina'

/** Rótulo VIGENTE de un submódulo, leído del registry. Las migas lo derivan en vez de
 *  repetirlo a mano: cuando "Medicamentos" pasó a llamarse "Stock", la miga hardcodeada
 *  quedó apuntando a un submódulo que ya no se llamaba así. */
function subName(modKey: string, subKey: string): string {
  return MODULES.find((m) => m.key === modKey)?.submodules.find((s) => s.key === subKey)?.name ?? subKey
}

export interface SearchItem {
  /** Clave estable para React (no se muestra). */
  id: string
  type: SearchType
  icon: IconName
  /** Texto principal. */
  title: string
  /** Migas de contexto (una línea, presentacional — el scope filtra por `mod`, no por esto). */
  crumb: string
  /** Módulo/submódulo destino de la navegación. */
  mod: string
  sub: string
  /** Entidad concreta a abrir al llegar (ej. la ficha del paciente). Ausente = solo la vista. */
  target?: NavTarget
}

export const TYPE_LABEL: Record<SearchType, string> = {
  protocolo: 'Protocolo',
  paciente: 'Paciente',
  visita: 'Visita',
  medicamento: 'Medicamento',
  pagina: 'Página',
}

/** Fuentes ya resueltas (arrays). Los hooks viven en useSearchIndex; el builder es puro. */
export interface SearchSources {
  protocols: ProtocolRow[]
  patients: PatientRow[]
  visits: TrackVisitRow[]
  medications: MedicationRow[]
}

type Allowed = (moduleKey: string) => boolean

/* TEMPORAL: solo la usaba el índice de visitas (hoy comentado, ver más abajo). Se comenta
   para no romper el gate (noUnusedLocals). Reponer junto con la Agenda.
   ISO 'YYYY-MM-DD' → 'DD/MM' sin pasar por Date (evita corrimientos de zona horaria). */
// function shortDate(iso: string | null): string {
//   if (!iso) return ''
//   const [, m, d] = iso.slice(0, 10).split('-')
//   return d && m ? `${d}/${m}` : ''
// }

/**
 * Destino de protocolos y pacientes: ambos viven en la vista compartida
 * `<mod>/protocolos`. Se elige el primer módulo que el usuario PUEDE abrir
 * (track o pharma). null = no tiene ninguno → esas entradas no se indexan.
 */
function sharedProtocolDest(isAllowed: Allowed): { mod: string; sub: string } | null {
  if (isAllowed('track')) return { mod: 'track', sub: 'protocolos' }
  if (isAllowed('pharma')) return { mod: 'pharma', sub: 'protocolos' }
  return null
}

/** Arma el índice unificado. Puro y testeable (dado `sources` + `isAllowed` → SearchItem[]). */
export function buildSearchIndex(sources: SearchSources, isAllowed: Allowed): SearchItem[] {
  const items: SearchItem[] = []
  const pdest = sharedProtocolDest(isAllowed)

  if (pdest) {
    for (const p of sources.protocols) {
      items.push({
        id: `proto-${p.id}`, type: 'protocolo', icon: 'file',
        title: `${p.code} · ${p.name}`,
        crumb: p.sponsor ? `Protocolos · ${p.sponsor}` : 'Protocolos',
        mod: pdest.mod, sub: pdest.sub,
      })
    }
    for (const pt of sources.patients) {
      const proto = pt.enrollments?.[0]?.protocol?.code ?? null
      items.push({
        id: `pac-${pt.id}`, type: 'paciente', icon: 'users',
        // `code` (Nº de sujeto IVRS) es nullable pre-randomización: sin code, solo el nombre.
        title: pt.code ? `${pt.code} · ${pt.full_name}` : pt.full_name,
        crumb: proto ? `Pacientes · ${proto}` : 'Pacientes',
        // Objetivo: la vista de protocolos abre la ficha directo (deriva el protocolo primario).
        mod: pdest.mod, sub: pdest.sub, target: { patientId: pt.id },
      })
    }
  }

  // TEMPORAL: las visitas se indexaban con destino track/agenda. Con la Agenda fuera del
  // menú, navegar ahí es un no-op → serían resultados muertos. Se dejan de indexar hasta
  // reponer el submódulo (registry.ts). El hook useUpcomingVisits sigue montado (inerte acá).
  // if (isAllowed('track')) {
  //   for (const v of sources.visits) {
  //     const tipo = v.visit_type === 'telefonica' ? 'Telefónica' : 'Presencial'
  //     const fecha = shortDate(v.estimated_date)
  //     items.push({
  //       id: `vis-${v.id}`, type: 'visita', icon: 'clipboardCheck',
  //       title: `${v.patient_name} — ${tipo}`,
  //       crumb: `Agenda · ${v.protocol_code}${fecha ? ` · ${fecha}` : ''}`,
  //       mod: 'track', sub: 'agenda',
  //     })
  //   }
  // }

  if (isAllowed('pharma')) {
    for (const m of sources.medications) {
      // El crumb "lote · protocolo" del prototipo es INCONSTRUIBLE en el core:
      // MedicationRow ya no tiene lote ni protocolo (catálogo global, 0032). Uso clase/droga/dosis.
      const extra = m.clase || m.drug?.name || m.dosis || null
      const donde = subName('pharma', 'medicamentos')
      items.push({
        id: `med-${m.id}`, type: 'medicamento', icon: 'pill',
        title: m.name,
        crumb: extra ? `${donde} · ${extra}` : donde,
        mod: 'pharma', sub: 'medicamentos',
      })
    }
  }

  // Páginas: submódulos con VISTA REAL (registrada) de módulos permitidos y no-próximamente.
  for (const mdl of MODULES) {
    if (mdl.key === 'inicio' || mdl.proximamente || !isAllowed(mdl.key)) continue
    for (const s of mdl.submodules) {
      if (!isViewRegistered(mdl.key, s.key)) continue
      items.push({
        id: `pag-${mdl.key}-${s.key}`, type: 'pagina', icon: s.icon,
        title: s.name, crumb: `${mdl.full} / ${s.name}`,
        mod: mdl.key, sub: s.key,
      })
    }
  }

  return items
}

export interface SearchIndexState {
  index: SearchItem[]
  /** Carga inicial (alguna de las 4 fuentes todavía trae datos). */
  loading: boolean
  /** Alguna fuente falló (red/permiso): el índice puede estar incompleto → hay que avisarlo. */
  partialError: boolean
}

/**
 * Compone los hooks de datos reales y arma el índice memoizado.
 *
 * Se monta SOLO cuando el palette está abierto (lazy) y se desmonta al cerrar:
 * así la PII de paciente entra a memoria únicamente mientras buscás, y cada
 * apertura trae datos frescos (sin cache → sin índice viejo, que en clínica es peor).
 */
export function useSearchIndex(isAllowed: Allowed): SearchIndexState {
  const protocols = useProtocols()
  const patients = usePatients()
  const visits = useUpcomingVisits()
  const medications = useMedications()

  const loading = protocols.loading || patients.loading || visits.loading || medications.loading
  const partialError = Boolean(protocols.error || patients.error || visits.error || medications.error)

  const index = useMemo(
    () =>
      buildSearchIndex(
        {
          protocols: protocols.data ?? [],
          patients: patients.data ?? [],
          visits: visits.data ?? [],
          medications: medications.data ?? [],
        },
        isAllowed,
      ),
    // `isAllowed` cambia de identidad cada render pero los roles no cambian en vivo;
    // el rebuild se dispara al llegar cada fuente. (Índice barato; no vale meterlo en deps.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [protocols.data, patients.data, visits.data, medications.data],
  )

  return { index, loading, partialError }
}
