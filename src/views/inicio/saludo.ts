import type { IconName } from '../../components/Icon'
import { addDaysISO, dayName, dayOfWeekISO, formatDayLong } from '../../lib/dates'
import { FERIADOS } from './feriados'
import type { Feriado } from './feriados'

/**
 * El saludo del día de la banda de Inicio: la frase y, si corresponde, el evento.
 *
 * Es puro sobre una fecha ISO: entra `2026-08-16`, sale qué decir. Así se puede testear la
 * rotación sin esperar a que pase una semana, que es la única forma de verificar que no repite.
 *
 * REGLA DEL HANDOFF: si el día tiene evento, la frase del evento REEMPLAZA a la del día. Y si hay
 * dos eventos el mismo día, gana el personal (cumpleaños o aniversario); el otro pasa a Novedades.
 * Los feriados entran por debajo de los eventos del handoff: el orden completo está en
 * `saludoDelDia`.
 */

/**
 * Las frases de cada día de la semana, indexadas como `getDay()` (0 = domingo).
 *
 * POR QUÉ UNA LISTA POR DÍA. Antes eran seis frases sueltas que rotaban por día del año, y como
 * ninguna sabía en qué día caía, alguna vez tocaba "Buen fin de semana, que descanses." un martes o
 * "Un sábado más cerca del fin de semana." Con una lista por día, cada frase puede hablar de SU día
 * sin interpolar nada.
 *
 * Tono (del handoff): cercano, breve, una sola oración, sin emoji. Sábado y domingo existen porque
 * la app también se abre esos días — el ejemplo del propio handoff es un domingo.
 */
export const FRASES_POR_DIA: readonly (readonly string[])[] = [
  /* domingo */ [
    'Gracias por darte una vuelta en domingo.',
    'Que el domingo sea tranquilo.',
  ],
  /* lunes */ [
    'Arrancamos la semana: que sea un buen lunes.',
    'Semana nueva, que venga tranquila.',
    'Buen comienzo de semana.',
    'Otra semana por delante, y que salga todo bien.',
  ],
  /* martes */ [
    'La semana ya tomó ritmo.',
    'Que tengas un buen martes.',
    'Gracias por estar de este lado del mostrador.',
  ],
  /* miércoles */ [
    'Ya estamos en el codito de la semana.',
    'Mitad de semana, y vamos bien.',
    'Que el miércoles venga liviano.',
  ],
  /* jueves */ [
    'Jueves: el viernes ya está a la vuelta de la esquina.',
    'Cuando querés acordar, mañana es viernes.',
    'Un empujón más y llega el fin de semana.',
  ],
  /* viernes */ [
    'Viernes: hoy cerramos la semana.',
    'Último esfuerzo de la semana y a descansar.',
    'Que cierres bien la semana.',
    'Buen viernes, y buen fin de semana.',
  ],
  /* sábado */ [
    'Gracias por estar también el sábado.',
    'Que el sábado sea corto y tranquilo.',
  ],
]

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

/**
 * Con cuántos días de anticipación se avisa un feriado. Cinco alcanza para que el lunes feriado se
 * anuncie desde el miércoles anterior, y es corto para que "el lunes" nunca sea ambiguo: dentro de
 * seis días cada nombre de día aparece una sola vez.
 */
const DIAS_DE_AVISO = 5

const EN_LETRAS: Record<number, string> = { 4: 'cuatro', 5: 'cinco', 6: 'seis' }

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
  /** La píldora. `null` = no se pinta (no hay evento hoy). El ícono distingue una celebración
   *  (regalo) de un aviso de calendario (feriado). */
  evento: { texto: string; icono: IconName } | null
}

/**
 * "Buen día" / "Buenas tardes" / "Buenas noches" según la hora local (0-23).
 *
 * El corte de la tarde va a las 13 y no a las 12 porque así se usa acá: "buen día" se dice hasta
 * que se almuerza. De madrugada es "buenas noches", no "buen día".
 */
export function saludoPorHora(hora: number): string {
  if (hora >= 5 && hora < 13) return 'Buen día'
  if (hora >= 13 && hora < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Número de semana corrido desde una fecha fija. Sólo importa que suba de a uno cada siete días. */
function semanaCorrida(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / (7 * 86400000))
}

function esFinDeSemana(iso: string): boolean {
  const dow = dayOfWeekISO(iso)
  return dow === 0 || dow === 6
}

function feriadoDe(iso: string, feriados: Feriado[]): Feriado | undefined {
  return feriados.find((f) => f.fecha === iso)
}

function noSeTrabaja(iso: string, feriados: Feriado[]): boolean {
  return esFinDeSemana(iso) || feriadoDe(iso, feriados) !== undefined
}

/** "a", "a y b", "a, b y c" — sin repetidos (Carnaval son dos días con el mismo motivo). */
function enumerar(partes: string[]): string {
  const unicas = [...new Set(partes)]
  return unicas.length <= 1 ? (unicas[0] ?? '') : `${unicas.slice(0, -1).join(', ')} y ${unicas[unicas.length - 1]}`
}

/**
 * El aviso de un feriado que se viene, o `null` si no hay ninguno en los próximos días.
 *
 * Sólo se avisa en días hábiles y sólo de feriados que caen en día hábil: un feriado en sábado (el
 * 20 de junio de 2026) no le da a nadie un día libre, así que anunciarlo sería una promesa vacía.
 *
 * "Finde largo" se dice SÓLO si el feriado arma, pegado al fin de semana, tres días o más sin
 * trabajo. Un feriado un miércoles es feriado, no finde largo.
 */
function avisoDeFeriado(hoy: string, feriados: Feriado[]): SaludoDelDia | null {
  if (noSeTrabaja(hoy, feriados)) return null

  for (let i = 1; i <= DIAS_DE_AVISO; i++) {
    const fecha = addDaysISO(hoy, i)
    if (esFinDeSemana(fecha) || !feriadoDe(fecha, feriados)) continue

    /* El bloque de días sin trabajo que contiene a este feriado: se estira hacia atrás y hacia
       adelante por feriados y fines de semana. No se come a `hoy` porque hoy es hábil (ver arriba).
       Los días hábiles del bloque son los que se nombran. */
    let desde = fecha
    while (noSeTrabaja(addDaysISO(desde, -1), feriados)) desde = addDaysISO(desde, -1)
    let hasta = fecha
    while (noSeTrabaja(addDaysISO(hasta, 1), feriados)) hasta = addDaysISO(hasta, 1)

    const dias: string[] = []
    for (let d = desde; d <= hasta; d = addDaysISO(d, 1)) dias.push(d)
    const habiles = dias.filter((d) => !esFinDeSemana(d))
    const motivos = enumerar(habiles.map((d) => feriadoDe(d, feriados)!.motivo))

    const nombreDia = (d: string) => (d === addDaysISO(hoy, 1) ? 'mañana' : `el ${dayName(d).toLocaleLowerCase('es-AR')}`)
    const cuando = enumerar(habiles.map(nombreDia))
    const verbo = habiles.length > 1 ? 'son feriados' : 'es feriado'

    /* Tres días es "finde largo" a secas; con más, se dice cuántos, que es la noticia. */
    const largo = dias.length >= 3 && dias.some(esFinDeSemana)
    const cuantos = dias.length >= 4 ? ` de ${EN_LETRAS[dias.length] ?? dias.length} días` : ''
    const frase = largo
      ? `Se viene finde largo${cuantos}: ${cuando} ${verbo} por ${motivos}.`
      : `${cuando.charAt(0).toLocaleUpperCase('es-AR')}${cuando.slice(1)} ${verbo} por ${motivos}.`

    return { frase, evento: { texto: textoDeLaPildora(habiles), icono: 'calendar' } }
  }
  return null
}

/** "Feriado: lunes 12 de octubre" / "Feriados: lunes 16 y martes 17 de febrero". */
function textoDeLaPildora(habiles: string[]): string {
  const largos = habiles.map((d) => formatDayLong(d).toLocaleLowerCase('es-AR'))
  const mismoMes = habiles.every((d) => d.slice(0, 7) === habiles[0].slice(0, 7))
  /* Con varios días del mismo mes, el mes va una sola vez, al final. */
  const partes = mismoMes ? largos.map((l, i) => (i < largos.length - 1 ? l.replace(/ de \S+$/, '') : l)) : largos
  return `${habiles.length > 1 ? 'Feriados' : 'Feriado'}: ${enumerar(partes)}`
}

/**
 * Qué decirle al usuario hoy. En orden de prioridad:
 *
 *  1. un evento personal (cumpleaños, aniversario) — el handoff lo pone primero;
 *  2. un evento fijo del glosario (Día del Médico, 25 de Mayo…);
 *  3. hoy es feriado;
 *  4. se viene un feriado en los próximos días;
 *  5. la frase del día de la semana.
 *
 * La frase del día rota por SEMANA dentro de la lista de su día: el lunes que viene toca la
 * siguiente del lunes. Un azar (`Math.random`) cambiaría la frase con cada recarga de la página, y
 * un `lista[0]` fijo diría lo mismo todos los lunes para siempre.
 *
 * `feriados` es parámetro sólo para los tests; la app usa la lista cargada.
 */
export function saludoDelDia(
  iso: string,
  personales: EventoPersonal[] = [],
  feriados: Feriado[] = FERIADOS,
): SaludoDelDia {
  const md = iso.slice(5)

  // Prioridad: lo personal primero. Es lo que el handoff decide cuando hay empate.
  const personal = personales.find((p) => p.md === md)
  if (personal) {
    return {
      frase: personal.tipo === 'cumpleanos'
        ? `Hoy cumple años ${personal.nombre}.`
        : `Hoy ${personal.nombre} cumple un año más en Spira.`,
      evento: {
        texto: personal.tipo === 'cumpleanos'
          ? `Hoy cumple años ${personal.nombre}`
          : `Aniversario en Spira de ${personal.nombre}`,
        icono: 'gift',
      },
    }
  }

  const fijo = EVENTOS_FIJOS.find((e) => e.md === md)
  if (fijo) return { frase: fijo.frase, evento: { texto: fijo.frase.replace(/\.$/, ''), icono: 'gift' } }

  const feriadoHoy = feriadoDe(iso, feriados)
  if (feriadoHoy) {
    return { frase: `Hoy es feriado por ${feriadoHoy.motivo}.`, evento: { texto: 'Feriado', icono: 'calendar' } }
  }

  const aviso = avisoDeFeriado(iso, feriados)
  if (aviso) return aviso

  const lista = FRASES_POR_DIA[dayOfWeekISO(iso)]
  return { frase: lista[semanaCorrida(iso) % lista.length], evento: null }
}
