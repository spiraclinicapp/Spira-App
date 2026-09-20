import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { ProcedimientosTip } from './ProcedimientosTip'
import type { ResumenVisita } from './track/resumenVisita'

/**
 * Vocabulario visual de una visita: la etiqueta del protocolo, los puntos de procedimiento y el
 * responsable. Lo comparten Visitas del día y los dos resúmenes, por eso vive en `views/` y no
 * en `views/track/` — mismo criterio que `visitStates.tsx`.
 *
 * Portado del prototipo `visitas-v2` del handoff, pero con tokens de Spira: NO usa la paleta
 * LIGHT/DARK del prototipo. Los tonos de protocolo son constantes en ambos temas (igual criterio
 * que OPERATIONAL_STAGES y los acentos de módulo) y todo lo demás sale de tokens.css.
 */

/* Tonos estables para la etiqueta de protocolo. Constantes en los dos temas: se usan como
   `tono + alpha` (fondo tenue) sobre white/surface, igual que los chips de estado. */
export const PROTO_TONES = ['#3A6B8C', '#2E7D74', '#6B5CA5', '#A8842F', '#5C8A5A'] as const

/** Tono estable de un protocolo (hash del id → paleta): el color no cambia entre sesiones. */
export function protoTone(protocolId: string): string {
  let h = 0
  for (let i = 0; i < protocolId.length; i++) h = (h * 31 + protocolId.charCodeAt(i)) >>> 0
  return PROTO_TONES[h % PROTO_TONES.length]
}

/**
 * Etiqueta de protocolo: el código del estudio sobre su tono.
 *
 * El TEXTO va en tinta, no en el tono. Escribir el tono sobre el tono al 9 % daba entre 3.2:1 y
 * 5.1:1 en claro y entre 2.6:1 y 4.1:1 en oscuro — por debajo del 4.5:1 que pide WCAG AA para
 * texto normal (13 px bold lo es; "grande" arranca en 18.66 px). El color no se pierde: se queda
 * en el fondo, que es donde significa "este protocolo", y el fondo sube a 14 % para que se lea.
 */
export function ProtoTag({ code, protocolId, compacto = false }: {
  code: string
  protocolId: string
  /**
   * Versión chica, para columnas angostas: la usa el desplegable de la campana, cuya caja le da al
   * chip una columna FIJA de 76 px. Sólo cambia la escala —tono, contraste y significado son los
   * mismos—, así que el mismo protocolo se reconoce por su color en las dos pantallas.
   */
  compacto?: boolean
}) {
  const tone = protoTone(protocolId)
  return (
    <span
      title={code}
      style={{
        /* `inline-block` en compacto y no `inline-flex`: **`text-overflow` no aplica sobre un
           contenedor flex**, así que con `inline-flex` el código largo se cortaba EN SECO, sin los
           puntos suspensivos —medido en el banco de pruebas, 2026-09-06—. El centrado vertical no
           se pierde: en la columna de datos lo da el flex del padre. La variante grande se queda
           como estaba, que es donde el chip convive con otros átomos en una fila. */
        display: compacto ? 'inline-block' : 'inline-flex', alignItems: 'center',
        lineHeight: compacto ? 1.45 : undefined,
        padding: compacto ? '2px 7px' : '3px 10px', borderRadius: compacto ? 99 : 7,
        background: tone + '24', color: 'var(--spira-ink)',
        fontFamily: compacto ? 'var(--spira-font-text)' : 'var(--spira-font-display)',
        fontSize: compacto ? 11 : 13, fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap',
        /* `protocol_code` es TEXTO LIBRE en la base y estos chips viven en columnas de ancho fijo:
           sin el recorte, un código largo se sale de su celda y pisa lo que tiene al lado. Los
           códigos reales son de 8 caracteres, así que casi nunca se ve — y por eso conviene que
           esté puesto antes de que aparezca el que no lo es. El `title` deja el código completo a
           mano cuando la elipsis se lo come. */
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {code}
    </span>
  )
}

/**
 * Etiqueta del código de visita ("V20", "Scr"): tinta plena, el contraste más alto de la fila.
 *
 * Va en negativo y no teñida como el protocolo, porque dice otra cosa: el protocolo identifica un
 * estudio —y por eso su color varía y significa—, mientras que el código de visita ubica a esta
 * visita en SU cronograma. Es el dato que se busca al escanear la lista, así que se lleva el peso.
 *
 * Vive acá, junto a `ProtoTag`, desde que la cola del médico adoptó el mismo par (pedido del
 * Director, 2026-08-25): los dos chips tienen que verse igual en las dos pantallas, y tenerlos
 * inline en cada vista es justo cómo se habían separado.
 */
export function VisitCodeTag({ code }: { code: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 6,
        background: 'var(--spira-ink)', color: 'var(--spira-paper)',
        fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
      }}
    >
      {code}
    </span>
  )
}

/**
 * ┌─ La tira de indicadores: qué LLEVA la visita ──────────────────────────────────────────────┐
 *
 * Cuatro señales en una línea —procedimientos, sangre, kit IP, reportes por cargar—, las mismas en
 * la fila de «Visitas del día» (compacta) y en el panel «Resumen de la visita» del modal (rótulos
 * largos). Reemplaza a `ProcDots`, que listaba los nombres de los procedimientos: la lista completa
 * pasó al listado que se abre al apuntar el conteo, y la fila se quedó con lo que sirve para
 * programar el día sin abrir cada visita.
 *
 * FORMATO LÍNEA, no cápsula: ícono + texto, sin recuadro. La atenuación la carga SÓLO el ícono; el
 * texto se queda en tinta legible (un secundario a 12,5px teñido no llega a 4,5:1).
 *
 * LO QUE NO SE SABE NO SE DIBUJA. Sin sangre definida, no hay gota — ni encendida ni apagada: en una
 * agenda clínica «Sin sangre» se lee como un hecho (ayuno, tubos, courier). Y si la visita no lleva
 * nada, el resumen es `null` y acá no se dibuja ni una tira vacía ni un texto de reemplazo.
 *
 * La separación va por `gap` y sin divisores: un divisor es un ítem más del flex y, al envolver,
 * queda colgando al final de la línea.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function IndicadoresVisita({ resumen, variante, porCargar }: {
  resumen: ResumenVisita
  variante: 'fila' | 'modal'
  /** Cuántos reportes quedan por cargar. `null` = la visita no define ninguno (no se dibuja).
   *  Sólo en el modal: en la fila, los reportes no entran (handoff §4). */
  porCargar?: number | null
}) {
  const enFila = variante === 'fila'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: enFila ? '8px 18px' : '10px 20px' }}>
      <ProcedimientosTip items={resumen.items} variante={variante} />

      {resumen.sangre !== null && (
        <Indicador
          encendido={resumen.sangre === 'si'}
          icono="droplet"
          relleno
          color="var(--spira-danger)"
          texto={
            resumen.sangre === 'si'
              ? (enFila ? 'Sangre' : 'Lleva sangre')
              : (enFila ? 'Sin sangre' : 'No lleva sangre')
          }
        />
      )}

      {/* El kit IP no tiene apagado: o la visita lo lleva, o no se nombra. Decir «Sin kit» en cada
          visita que no entrega sería ruido en toda la agenda. */}
      {resumen.kitIp && (
        <Indicador encendido icono="pill" color="var(--spira-warn)" texto={enFila ? 'Kit IP' : 'Lleva kit IP'} />
      )}

      {!enFila && porCargar != null && (
        <Indicador
          encendido={porCargar > 0}
          icono="fileText"
          color="var(--spira-warn)"
          texto={porCargar > 0 ? `${porCargar} ${porCargar === 1 ? 'reporte' : 'reportes'} por cargar` : 'Reportes al día'}
        />
      )}
    </div>
  )
}

/** Un indicador de la tira: ícono + texto. Apagado = el ícono en `faint` y el texto atenuado. */
function Indicador({ encendido, icono, color, texto, relleno = false }: {
  encendido: boolean
  icono: IconName
  color: string
  texto: string
  relleno?: boolean
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: encendido ? 'var(--spira-ink)' : 'var(--spira-ink-soft)' }}>
      <Icon
        name={icono}
        size={14}
        color={encendido ? color : 'var(--spira-faint)'}
        fill={relleno ? (encendido ? color : 'var(--spira-faint)') : undefined}
      />
      {texto}
    </span>
  )
}

/** Responsable de la visita (Coord. / Médico): ícono + rol + nombre. `null` cae a "Sin asignar". */
export function Persona({ role, name, icon }: { role: string; name: string | null; icon: IconName }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        color: 'var(--spira-muted)', whiteSpace: 'nowrap', minWidth: 0,
      }}
    >
      <Icon name={icon} size={13} color="var(--spira-faint)" />
      <span style={{ color: 'var(--spira-muted)', flex: '0 0 auto' }}>{role}</span>
      <span
        style={{
          color: name ? 'var(--spira-ink)' : 'var(--spira-muted)', fontWeight: name ? 600 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {name ?? 'Sin asignar'}
      </span>
    </span>
  )
}
