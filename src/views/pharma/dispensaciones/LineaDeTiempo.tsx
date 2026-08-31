import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { formatDateAR, formatTimeAR } from '../../../lib/dates'
import type { EventoHistorial, TonoEvento } from './historial'

/**
 * La crónica del pedido: una línea de tiempo de hechos, agrupada por día.
 *
 * SEPARADA DEL MODAL a propósito. Acá no se consulta nada: entra una lista de eventos ya traducidos
 * y sale la pintura. El modal se queda con los datos y el chrome. La separación no es ceremonia —
 * es lo que permite mirar esta pantalla sin una sesión abierta contra la base, que es justo lo que
 * hacía falta para verificarla (el preview corre en un navegador distinto al del usuario).
 *
 *   12:14  ◉  Empezó la preparación                        Ana Farmacéutica
 *          │
 *   12:16  ◉  Se escaneó 1 unidad                          Ana Farmacéutica
 *          │  Alvetide 92/22 mcg · 1 de 2
 *
 * Agrupa POR DÍA y deja la hora al costado: casi todo un pedido ocurre en el mismo turno, y repetir
 * "15/08/2026" en cada línea gastaba el ancho que necesita la frase.
 */
export function LineaDeTiempo({ eventos }: { eventos: EventoHistorial[] }) {
  const dias = agruparPorDia(eventos)

  return (
    <div style={scroll}>
      {dias.map((dia) => (
        <section key={dia.fecha}>
          <h3 style={diaTitulo}>{dia.fecha}</h3>
          <ol style={lista}>
            {dia.eventos.map((e, i) => (
              <Fila
                key={`${e.cuando}-${i}`}
                e={e}
                // El hilo se corta en el último de cada día: colgando del final quedaría un rabito
                // apuntando al encabezado del día siguiente, que no es su continuación.
                conHilo={i < dia.eventos.length - 1}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function Fila({ e, conHilo }: { e: EventoHistorial; conHilo: boolean }) {
  const t = TONOS[e.tono]
  return (
    <li style={fila}>
      <time style={hora} dateTime={e.cuando}>{formatTimeAR(e.cuando)}</time>

      <div style={carril}>
        {/* El hilo va DETRÁS del punto (z-index) y arranca de su borde: dibujado por delante le
            partía el tinte al medio. */}
        {conHilo && <span aria-hidden style={hilo} />}
        <span style={{ ...punto, background: t.tint, color: t.color }}>
          <Icon name={e.icono} size={12} stroke={2.2} />
        </span>
      </div>

      <div style={{ minWidth: 0, paddingBottom: 14 }}>
        <div style={cabeza}>
          <span style={titulo}>{e.titulo}</span>
          <span style={quien}>{e.quien}</span>
        </div>
        {e.detalle && <div style={detalle}>{e.detalle}</div>}
      </div>
    </li>
  )
}

/**
 * Los eventos, partidos por día calendario. Conserva el orden de entrada (la RPC devuelve del más
 * reciente al más viejo), así que el día de arriba es el último trabajado.
 */
function agruparPorDia(eventos: EventoHistorial[]): { fecha: string; eventos: EventoHistorial[] }[] {
  const dias: { fecha: string; eventos: EventoHistorial[] }[] = []
  for (const e of eventos) {
    const fecha = formatDateAR(e.cuando)
    const ultimo = dias[dias.length - 1]
    if (ultimo && ultimo.fecha === fecha) ultimo.eventos.push(e)
    else dias.push({ fecha, eventos: [e] })
  }
  return dias
}

/**
 * Color por tono. El punto es un tinte suave con el ícono en el color pleno: un círculo saturado a
 * 22px al lado de cada línea convertía la lista en una guirnalda y le robaba el foco al texto, que
 * es lo que en realidad se viene a leer. Cada tono lleva además un ícono de forma propia, así que
 * el color nunca es la única señal (WCAG 2.1 AA).
 */
const TONOS: Record<TonoEvento, { color: string; tint: string }> = {
  neutro: { color: 'var(--spira-muted)', tint: 'var(--spira-surface)' },
  // `acc-deep-track` y NO `primary-deep`: el segundo está documentado como FIJO en los dos temas
  // (es el fondo del cover de auth), así que en oscuro quedaba petróleo sobre petróleo — medido,
  // 1,49:1, o sea invisible. Es literalmente la trampa que advierte el comentario del token
  // (tokens.css §"Acento PROFUNDO"): todo color que se oscurece para leerse sobre tinte claro
  // necesita su versión CLARA para oscuro. `acc-deep-track` la tiene (menta #9DE6D6).
  avance: { color: 'var(--spira-acc-deep-track)', tint: 'var(--spira-tint-track)' },
  listo: { color: 'var(--spira-good)', tint: 'rgba(92, 138, 90, 0.15)' },
  alerta: { color: 'var(--spira-acc-deep-warn)', tint: 'rgba(176, 130, 63, 0.17)' },
  // Mismo motivo que `avance`: `--spira-danger` tampoco tiene versión clara y en oscuro daba
  // 2,55:1. `--spira-acc-deep-danger` se agregó a los tokens para esto (vale igual en claro).
  corte: { color: 'var(--spira-acc-deep-danger)', tint: 'rgba(166, 72, 59, 0.11)' },
}

/** El scroll es de la LISTA y no del modal entero: el botón Cerrar queda siempre a la vista. */
const scroll: CSSProperties = {
  maxHeight: '56vh', overflowY: 'auto', marginTop: 4, paddingRight: 4,
}

/**
 * Encabezado de día. Pegajoso: con veinte movimientos el día se pierde al scrollear.
 *
 * `ink-soft` y no `muted`, aunque desde la recalibración de la rampa (2026-08-31) los dos pasen
 * AA: la razón sigue siendo la jerarquía. Ver el bloque de contrastes al pie del archivo.
 */
const diaTitulo: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1, margin: 0, padding: '6px 0 8px',
  background: 'var(--spira-white)',
  fontFamily: 'var(--spira-font-text)', fontSize: 11.5, fontWeight: 700,
  letterSpacing: '0.02em', color: 'var(--spira-ink-soft)',
}

const lista: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

/** Tres columnas: hora fija, carril del hilo, y la frase — que se queda con todo lo que sobra. */
const fila: CSSProperties = {
  display: 'grid', gridTemplateColumns: '42px 26px 1fr', alignItems: 'start',
}

/** La hora es DATO, no adorno: se lee para reconstruir un turno. Nunca en `faint` (2,23:1). */
const hora: CSSProperties = {
  fontSize: 11.5, color: 'var(--spira-ink-soft)', fontVariantNumeric: 'tabular-nums',
  paddingTop: 4, textAlign: 'right',
}

const carril: CSSProperties = {
  position: 'relative', display: 'flex', justifyContent: 'center', alignSelf: 'stretch',
}

const hilo: CSSProperties = {
  position: 'absolute', top: 22, bottom: -2, width: 1.5, left: '50%', marginLeft: -0.75,
  background: 'var(--spira-line)',
}

const punto: CSSProperties = {
  position: 'relative', zIndex: 1, width: 22, height: 22, flex: '0 0 auto',
  borderRadius: '50%', display: 'grid', placeItems: 'center',
}

/** El nombre se va a la derecha y la frase se queda con el ancho: quién lo hizo importa segundo. */
const cabeza: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
}

const titulo: CSSProperties = {
  flex: '1 1 auto', minWidth: 0, fontSize: 13.5, fontWeight: 600,
  color: 'var(--spira-ink)', lineHeight: 1.35,
}

const quien: CSSProperties = {
  flex: '0 0 auto', fontSize: 11.5, color: 'var(--spira-ink-soft)',
}

const detalle: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-ink-soft)', lineHeight: 1.4, marginTop: 2,
}

/*
 * ┌─ CONTRASTE, MEDIDO EN EL NAVEGADOR (no estimado) ────────────────────────────────────────────┐
 * │                                                                                              │
 * │ Sobre el papel del modal (#FFFFFF), tras recalibrar la rampa el 2026-08-31:                  │
 * │     --spira-ink        14,08:1   título del evento                                           │
 * │     --spira-ink-soft    7,08:1   día, hora, quién, detalle   ← AA (4,5) con margen           │
 * │     --spira-muted       5,19:1   ahora SÍ llega (antes 3,52)                                 │
 * │     --spira-faint       3,46:1   sigue sin llegar, y ya no se usa para texto en ningún lado   │
 * │                                                                                              │
 * │ La primera versión de esta pantalla usaba `muted` para el detalle y `faint` para la hora y el │
 * │ nombre, que es lo que venía haciendo el historial viejo. Ninguno de los dos pasa: la jerarquía│
 * │ acá la dan el TAMAÑO, el PESO y la POSICIÓN (título 13,5/600 a la izquierda; metadatos 11,5   │
 * │ a la derecha), no un gris más claro. Aclarar el texto para que "se vea secundario" es         │
 * │ exactamente el motivo por el que una pantalla termina siendo difícil de leer.                 │
 * │                                                                                              │
 * │ ⚠️ `--spira-faint` NO llega a AA con NINGÚN texto sobre papel. Donde aparezca sosteniendo una │
 * │ palabra que alguien tenga que leer, es un bug — no una decisión de estilo.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
