import type { RequestStatus } from './dispensationModel'

/**
 * El MODELO del historial unificado de Farmacia: la forma de la fila y las reglas que se derivan
 * de ella.
 *
 * NO IMPORTA SUPABASE, y eso es lo que lo hace testeable: `lib/supabase` toca
 * `window.sessionStorage` al cargarse, así que cualquier módulo que lo alcance —aunque sea por
 * una cadena de tres imports— revienta en vitest con "window is not defined". Mismo corte que
 * `dispensationModel.ts` y `ambulatoriaModel.ts`. El transporte (el hook de lectura) vive en
 * `dispensations.ts`, que re-exporta todo esto.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ POR QUÉ EL HISTORIAL DEJÓ DE SER UNA LISTA DE `DispensationRequestRow`                    │
 * │                                                                                           │
 * │ Hasta la 0116 el historial mostraba UNA fuente: las dispensaciones de protocolo, con su    │
 * │ fila entera (renglones, escaneos, constancias). Ahora muestra DOS —también las salidas     │
 * │ ambulatorias, que no tienen paciente ni protocolo— y esas dos no comparten forma.          │
 * │                                                                                           │
 * │ Mezclarlas en el front no alcanzaba, y no por diseño visual: la lista está PAGINADA del    │
 * │ lado del servidor, así que con dos fuentes paginadas por separado una salida vieja         │
 * │ aparecería recién después de cargar la página 2. Por eso las une la vista `v_pharma_       │
 * │ history` (0117) y por eso lo que llega acá es una fila de PRESENTACIÓN: exactamente lo     │
 * │ que el renglón dibuja, y nada más.                                                         │
 * │                                                                                           │
 * │ El DETALLE lo sigue trayendo el cajón por id, con la consulta que corresponda a cada tipo. │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** De qué fuente salió la fila. Es el discriminante de todo lo que sigue. */
export type HistorialTipo = 'protocolo' | 'ambulatoria'

/** Una fila del historial, ya en forma de presentación (vista `v_pharma_history`, 0117). */
export interface HistorialFilaRow {
  tipo: HistorialTipo
  id: string
  /** `updated_at` de la solicitud · `created_at` de la salida. Es por lo que ordena y agrupa. */
  ordenado_por: string
  /** Código sellado de la dispensación (`D-…`); null si todavía no se selló o si es ambulatoria. */
  codigo: string | null
  /** N° de comprobante. Null en las ambulatorias: no emiten comprobante. */
  correlativo: number | null
  /** A quién fue: el paciente, o quien retiró en el mostrador. */
  destinatario: string
  /** `patients.id`, para abrir la ficha. **Null = no hay ficha que abrir** (ambulatoria). */
  destinatario_id: string | null
  /** IVRS del paciente · documento de quien retiró. Sólo para mostrar (ver `paciente_codigo`). */
  destinatario_ref: string | null
  protocol_code: string | null
  protocol_id: string | null
  /** Nombres ya concatenados por la vista, en orden alfabético. */
  medicamentos: string
  unidades: number
  /** Crudos, sin traducir: el badge se arma en `dispensaciones/estados.ts`, que ya tiene el
   *  vocabulario y la regla que distingue "lista para retirar" de "entregada". */
  estado_solicitud: RequestStatus | null
  estado_dispensacion: string | null
  /** Quién autorizó la entrega ambulatoria. Null en las de protocolo, que no lo tienen. */
  autorizado_por: string | null
}

/**
 * La segunda línea del renglón.
 *
 * Parece cosmética y es justo lo que puede fallar EN SILENCIO: cada parte puede venir vacía —un
 * pedido de IP solo no tiene ningún renglón de medicación, y `medicamentos` llega como cadena
 * vacía— y concatenar a ciegas deja separadores colgando (" · 0 u.") o un "autorizó" sin nombre.
 * Se arma filtrando las partes que existen, igual que el `unir()` del historial del cajón.
 */
export function detalleDeFila(f: HistorialFilaRow): string {
  const partes = [
    f.medicamentos.trim(),
    `${f.unidades} u.`,
    /* Sólo las ambulatorias lo llevan, y la columna es `not null` en la base — pero un nombre en
       blanco produciría "autorizó" a secas, que en una app auditable se lee como un dato que se
       perdió. Si no hay nombre, no se afirma nada. */
    f.autorizado_por?.trim() ? `autorizó ${f.autorizado_por.trim()}` : '',
  ]
  return partes.filter((p) => p !== '').join(' · ')
}

/**
 * Lo que va en la primera posición del renglón, en tipografía de display.
 *
 * En una dispensación de protocolo es el CÓDIGO —lo que se dicta por teléfono y sale impreso—, y
 * "Solicitud" mientras no esté sellado (se sella recién al marcar lista, 0055). En una salida
 * ambulatoria no hay código que sellar, así que la identidad de la fila es la PERSONA que retiró:
 * es el único dato por el que alguien la va a buscar.
 */
export function tituloDeFila(f: HistorialFilaRow): string {
  if (f.tipo === 'ambulatoria') return f.destinatario
  return f.codigo ?? 'Solicitud'
}

/**
 * Agrupa por día calendario, preservando el orden que trajo el servidor (más nuevo primero).
 *
 * Se corta el ISO a diez caracteres en vez de construir un `Date`: `new Date(iso).getDate()` lo
 * resuelve en la zona del navegador y una entrega de las 21:30 de Mendoza cae al día siguiente,
 * que es exactamente el bug que la 0117 evita del lado del servidor con el offset fijo. Acá el
 * texto ya viene con la zona resuelta.
 *
 * Genérica sobre `{ ordenado_por }` para poder testearla sin fabricar una fila entera.
 */
export function agruparPorDia<T extends { ordenado_por: string }>(
  filas: T[],
  etiquetaDe: (iso: string) => string,
): { dia: string; filas: T[] }[] {
  const out: { dia: string; filas: T[] }[] = []
  for (const f of filas) {
    const etiqueta = etiquetaDe(f.ordenado_por.slice(0, 10))
    const ultimo = out[out.length - 1]
    if (ultimo && ultimo.dia === etiqueta) ultimo.filas.push(f)
    else out.push({ dia: etiqueta, filas: [f] })
  }
  return out
}
