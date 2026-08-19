import { dayName } from '../../lib/dates'

/**
 * El saludo del día de la banda de Inicio: la frase y, si corresponde, el evento.
 *
 * Es puro sobre una fecha ISO: entra `2026-08-16`, sale qué decir. Así se puede testear la
 * rotación sin esperar a que pase una semana, que es la única forma de verificar que no repite.
 *
 * REGLA DEL HANDOFF: si el día tiene evento, la frase del evento REEMPLAZA a la del día. Y si hay
 * dos eventos el mismo día, gana el personal (cumpleaños o aniversario); el otro pasa a Novedades.
 */

/**
 * Las seis frases base del handoff. `{día}` se interpola con el nombre del día cuando la frase lo
 * pide — por eso son seis y no siete: rotan sobre una semana de siete, así que la misma frase no
 * cae dos lunes seguidos. Eso es exactamente lo que pide el handoff ("variantes para no repetir la
 * misma cada siete días") y sale gratis de que 6 y 7 sean coprimos.
 */
export const FRASES = [
  'Espero que tengas un {día} genial.',
  'Te deseo que hoy sea un día genial.',
  'Que sea un {día} tranquilo.',
  'Gracias por estar de este lado del mostrador.',
  'Un {día} más cerca del fin de semana.',
  'Buen fin de semana, que descanses.',
] as const

/** Eventos de fecha fija del glosario. `md` es `MM-DD`. */
export const EVENTOS_FIJOS: { md: string; frase: string }[] = [
  { md: '04-10', frase: 'Hoy es el Día del Investigador.' },
  { md: '05-25', frase: 'Feliz 25 de Mayo.' },
  { md: '06-20', frase: 'Feliz Día de la Bandera.' },
  { md: '07-09', frase: 'Feliz Día de la Independencia.' },
  { md: '08-10', frase: 'Hoy es el Día del Farmacéutico.' },
  { md: '11-21', frase: 'Hoy es el Día de la Enfermería.' },
  { md: '12-03', frase: 'Hoy es el Día del Médico.' },
  { md: '12-25', frase: 'Feliz Navidad.' },
  { md: '01-01', frase: 'Feliz año nuevo.' },
]

/** Un evento de persona (cumpleaños o aniversario). Hoy NUNCA llega ninguno: el schema no guarda
 *  fecha de nacimiento ni de ingreso del equipo. Queda en la firma para que el día que exista
 *  entre por acá y no haya que rehacer la regla de prioridad. */
export interface EventoPersonal {
  tipo: 'cumpleanos' | 'aniversario'
  nombre: string
  /** `MM-DD` */
  md: string
}

export interface SaludoDelDia {
  /** La línea bajo el nombre. Nunca vacía. */
  frase: string
  /** Texto de la píldora. `null` = no se pinta (no hay evento hoy). */
  evento: string | null
}

/** Día del año 1..366, para rotar. */
function diaDelAnio(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1
}

/**
 * Qué decirle al usuario hoy.
 *
 * La frase rota por día del año, no por día de la semana: con seis frases sobre semanas de siete,
 * el lunes que viene toca otra. Un `frases[díaDeLaSemana]` habría dado la misma frase todos los
 * lunes para siempre, que es justo lo que el handoff pide evitar.
 */
export function saludoDelDia(iso: string, personales: EventoPersonal[] = []): SaludoDelDia {
  const md = iso.slice(5)

  // Prioridad: lo personal primero. Es lo que el handoff decide cuando hay empate.
  const personal = personales.find((p) => p.md === md)
  if (personal) {
    return {
      frase: personal.tipo === 'cumpleanos'
        ? `Hoy cumple años ${personal.nombre}.`
        : `Hoy ${personal.nombre} cumple un año más en Spira.`,
      evento: personal.tipo === 'cumpleanos'
        ? `Hoy cumple años ${personal.nombre}`
        : `Aniversario en Spira de ${personal.nombre}`,
    }
  }

  const fijo = EVENTOS_FIJOS.find((e) => e.md === md)
  if (fijo) return { frase: fijo.frase, evento: fijo.frase.replace(/\.$/, '') }

  const base = FRASES[diaDelAnio(iso) % FRASES.length]
  /* `dayName` viene capitalizado porque se usa como rótulo suelto; en medio de la oración va
     en minúscula ("un domingo genial", no "un Domingo genial"). */
  const dia = dayName(iso).toLocaleLowerCase('es-AR')
  return { frase: base.replace('{día}', dia), evento: null }
}
