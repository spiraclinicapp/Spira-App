import { describe, expect, it } from 'vitest'
import {
  agruparPorCategoria,
  claveDePlataforma,
  ETA_PRESETS,
  etaLabel,
  horasDesde,
  etaValida,
  isDefaultLink,
  isPlatform,
  knownReports,
  linkOnPlatformChange,
  platformList,
  platformMeta,
  PLATFORMS_SEED,
  setPlatformCatalog,
  PLAZO_MAX,
  plazoLibreInicial,
  resumenDeReportes,
} from './reportes'

/**
 * Reglas del circuito de reportes de un procedimiento (0089).
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que fallan EN SILENCIO. Un link que se pisa solo
 * después de que la coordinadora lo editó a mano se ve idéntico a uno correcto — hasta que alguien
 * hace click y aterriza en el portal equivocado. Un `knownReports` que deduplica de más borra
 * opciones del combobox sin dejar rastro. En cambio los chips, los colores y el agrupado fallan de
 * manera visible y se verifican mirando.
 *
 * Sin base y sin navegador: son funciones puras.
 */

/** Definición mínima para los tests de combobox. */
function def(over: Partial<{ id: string; name: string; platform: string; eta_hours: number | null }> = {}) {
  return {
    id: over.id ?? 'd1',
    name: over.name ?? 'Hematología completa',
    platform: over.platform ?? 'labcorp',
    eta_hours: over.eta_hours === undefined ? 48 : over.eta_hours,
  }
}

const OTRO_SEED = PLATFORMS_SEED[PLATFORMS_SEED.length - 1]

describe('plataformas', () => {
  it('el respaldo reconoce las cinco que siembra la 0111', () => {
    // Sin catálogo de la base todavía, `reportes.ts` responde con PLATFORMS_SEED: es lo que se ve
    // mientras la consulta viaja, y lo que queda si falla.
    for (const p of ['iqvia', 'labcorp', 'clario', 'roche4g', 'otro']) {
      expect(isPlatform(p)).toBe(true)
    }
  })

  it('un valor desconocido cae a "otro" en vez de romper', () => {
    // El front puede leer datos de un schema más nuevo que él: nunca asumir que el valor es válido.
    expect(isPlatform('medidata')).toBe(false)
    expect(platformMeta('medidata')).toBe(OTRO_SEED)
    expect(platformMeta(null)).toBe(OTRO_SEED)
    expect(platformMeta(undefined)).toBe(OTRO_SEED)
  })
})

/* El catálogo vivo (0111).
 *
 * Este bloque MUTA una variable de módulo, así que cada caso repone el respaldo al terminar. No es
 * higiene de más: si dejara el catálogo pisado, los tests de link de más abajo estarían mirando
 * plataformas que no son las que ellos suponen, y fallarían por un motivo que no tiene nada que ver
 * con lo que prueban. El último caso verifica justamente que quedó repuesto. */
describe('catálogo desde la base', () => {
  const DE_LA_BASE = [
    { key: 'clario', label: 'Clario', color: '#B0823F', url: 'https://portal.clario.test', activa: true },
    { key: 'medidata', label: 'Medidata', color: '#123456', url: null, activa: true },
    { key: 'vieja', label: 'CRO retirada', color: '#999999', url: null, activa: false },
    { key: 'otro', label: 'Otra plataforma', color: '#7C8C87', url: null, activa: true },
  ]

  it('una plataforma que la base agregó pasa a existir', () => {
    // El motivo entero de la tabla: sumar una CRO deja de ser una migración más una línea de código.
    expect(isPlatform('medidata')).toBe(false)
    setPlatformCatalog(DE_LA_BASE)
    expect(isPlatform('medidata')).toBe(true)
    expect(platformMeta('medidata').label).toBe('Medidata')
    setPlatformCatalog(PLATFORMS_SEED)
  })

  it('una plataforma RETIRADA no se ofrece, pero sigue resolviendo los reportes que la usan', () => {
    // El punto fino de `is_active`, y una falla silenciosa de manual: si una retirada cayera a
    // "Otra plataforma", un reporte histórico perdería el nombre de su portal sin que nadie lo note.
    setPlatformCatalog(DE_LA_BASE)
    expect(platformList().map((p) => p.key)).not.toContain('vieja')
    expect(platformMeta('vieja').label).toBe('CRO retirada')
    setPlatformCatalog(PLATFORMS_SEED)
  })

  it('la URL de la base alimenta el autocompletado del link', () => {
    // La cadena completa que se pidió: cargar la URL en Ajustes y que al elegir Clario el link
    // aparezca solo. El mecanismo ya existía desde la 0089; lo que faltaba era el dato.
    setPlatformCatalog(DE_LA_BASE)
    expect(linkOnPlatformChange('otro', 'clario', '')).toBe('https://portal.clario.test')
    setPlatformCatalog(PLATFORMS_SEED)
  })

  it('un catálogo VACÍO se ignora en vez de dejar la app sin plataformas', () => {
    // Cero filas puede ser la RLS filtrando en silencio, o la 0111 sin aplicar. Quedarse sin
    // catálogo dejaría los chips en gris y el desplegable sin opciones: se ve como una app rota.
    setPlatformCatalog(DE_LA_BASE)
    setPlatformCatalog([])
    expect(platformMeta('medidata').label).toBe('Medidata')
    setPlatformCatalog(PLATFORMS_SEED)
  })

  it('el respaldo quedó repuesto para los tests que siguen', () => {
    expect(isPlatform('medidata')).toBe(false)
    expect(platformList().map((p) => p.key)).toEqual(['iqvia', 'labcorp', 'clario', 'roche4g', 'otro'])
  })
})

describe('link pegajoso', () => {
  it('un campo vacío cuenta como "sin tocar"', () => {
    // Todavía no hay nada que respetar: al elegir plataforma tiene que autocompletarse.
    expect(isDefaultLink('iqvia', '')).toBe(true)
    expect(isDefaultLink('iqvia', null)).toBe(true)
    expect(isDefaultLink('iqvia', '   ')).toBe(true)
  })

  it('un link escrito a mano NO es el default', () => {
    expect(isDefaultLink('iqvia', 'https://portal-del-estudio.example/act18301')).toBe(false)
  })

  it('al cambiar de plataforma, un link editado a mano se respeta', () => {
    // EL caso que importa: la coordinadora pegó la URL puntual del estudio y después corrigió la
    // plataforma. Pisarle el link ahí la manda a un portal que no es el suyo.
    const propio = 'https://portal-del-estudio.example/act18301'
    expect(linkOnPlatformChange('iqvia', 'labcorp', propio)).toBe(propio)
  })

  it('al cambiar de plataforma, un link vacío toma el default de la nueva', () => {
    // El respaldo no trae URLs (las carga el Director desde Ajustes), así que acá el default es ''.
    // El test fija el COMPORTAMIENTO, no el dato: el caso con URL cargada está más arriba, en
    // "la URL de la base alimenta el autocompletado del link".
    expect(linkOnPlatformChange('iqvia', 'labcorp', '')).toBe(platformMeta('labcorp').url ?? '')
  })

  it('recorta los espacios del link que conserva', () => {
    expect(linkOnPlatformChange('iqvia', 'labcorp', '  https://x.example  ')).toBe('https://x.example')
  })
})

describe('plazo', () => {
  it('acepta el rango de la base y rechaza lo que el check bloquearía', () => {
    // report_definitions_eta_chk: eta_hours is null or (> 0 and <= 8760).
    expect(etaValida(null)).toBe(true)
    expect(etaValida(1)).toBe(true)
    expect(etaValida(8760)).toBe(true)
    expect(etaValida(0)).toBe(false)
    expect(etaValida(-1)).toBe(false)
    expect(etaValida(8761)).toBe(false)
    expect(etaValida(1.5)).toBe(false)
  })

  it('etiqueta en días cuando el plazo es múltiplo de 24, y en horas si no', () => {
    expect(etaLabel(1)).toBe('~1 h')
    expect(etaLabel(5)).toBe('~5 h')
    expect(etaLabel(24)).toBe('~1 día')
    expect(etaLabel(48)).toBe('~2 días')
    expect(etaLabel(72)).toBe('~3 días')
  })

  it('sin plazo lo DICE, no queda mudo', () => {
    // Un reporte sin plazo no vence nunca; la tarjeta tiene que decirlo en vez de mostrar un hueco.
    expect(etaLabel(null)).toBe('Sin plazo')
  })

  it('los chips ofrecen 1 hora, 24, 48, 72 y 7 días', () => {
    expect(ETA_PRESETS.map((p) => p.value)).toEqual([1, 24, 48, 72, 168])
  })

  it('el campo libre arranca VACÍO cuando el plazo ya es un chip', () => {
    // Si no, el número aparecería dos veces: encendido en el chip y escrito en el campo.
    for (const p of ETA_PRESETS) expect(plazoLibreInicial(p.value).texto).toBe('')
    expect(plazoLibreInicial(null).texto).toBe('')
  })

  it('el campo libre arranca CON el número cuando el plazo no es un chip', () => {
    // Regresión: el campo tomaba su texto de una expresión que lo vaciaba apenas el número
    // coincidía con un preset, así que tipear "12" era imposible — al entrar el "1" se limpiaba
    // solo. El texto del input ahora es estado propio; esta función solo decide el arranque.
    expect(plazoLibreInicial(100)).toEqual({ texto: '100', unidad: 'h' })
    expect(plazoLibreInicial(8759)).toEqual({ texto: '8759', unidad: 'h' })
  })

  it('un plazo de días enteros se relee EN DÍAS, no en horas', () => {
    // Quien cargó "6 días" quiere volver a abrir el reporte y leer 6, no 144.
    expect(plazoLibreInicial(144)).toEqual({ texto: '6', unidad: 'd' })
    expect(plazoLibreInicial(288)).toEqual({ texto: '12', unidad: 'd' })
    expect(plazoLibreInicial(8760)).toEqual({ texto: '365', unidad: 'd' })
  })
})

describe('interruptor horas / días', () => {
  it('el MISMO número significa distinto según la unidad', () => {
    // El pedido, textual: "que el mismo numero pueda ser para dias o [horas]". Cambiar de unidad
    // no convierte el número, cambia lo que quiere decir.
    expect(horasDesde('12', 'h')).toBe(12)
    expect(horasDesde('12', 'd')).toBe(288)
    expect(horasDesde('1', 'd')).toBe(24)
  })

  it('sin nada escrito no hay plazo', () => {
    expect(horasDesde('', 'h')).toBeNull()
    expect(horasDesde('   ', 'd')).toBeNull()
  })

  it('un valor fuera de rango vuelve como número para que la validación lo rechace', () => {
    // Devolver null lo haría desaparecer en silencio y el usuario guardaría "sin plazo" sin
    // enterarse. Vuelve el número y `etaValida` se encarga de decirlo.
    expect(horasDesde('400', 'd')).toBe(9600)
    expect(etaValida(horasDesde('400', 'd'))).toBe(false)
    expect(etaValida(horasDesde('365', 'd'))).toBe(true)
  })

  it('el tope en días es exactamente el tope en horas de la base', () => {
    expect(PLAZO_MAX.d * 24).toBe(PLAZO_MAX.h)
    expect(etaValida(PLAZO_MAX.h)).toBe(true)
    expect(etaValida(PLAZO_MAX.h + 1)).toBe(false)
  })

  it('el ida y vuelta cierra: lo que se guarda en días se relee en días', () => {
    for (const n of [6, 12, 30, 90, 365]) {
      const horas = horasDesde(String(n), 'd') as number
      expect(plazoLibreInicial(horas)).toEqual({ texto: String(n), unidad: 'd' })
    }
  })

  it('un plazo en días que cae justo en un chip se relee como ese chip', () => {
    // 2 días son 48 horas, y 48 horas ES uno de los chips. Al reabrir el reporte se enciende el
    // chip en vez de escribir "2" en el campo libre. NO se pierde nada —el plazo es el mismo— y
    // el chip es la forma canónica de decirlo; queda escrito acá para que nadie lo lea como bug.
    expect(horasDesde('2', 'd')).toBe(48)
    expect(plazoLibreInicial(48)).toEqual({ texto: '', unidad: 'h' })
    // Los cinco choques posibles, uno por chip: 1 h, y 1, 2, 3 y 7 días.
    for (const p of ETA_PRESETS) expect(plazoLibreInicial(p.value).texto).toBe('')
  })
})

describe('resumen de reportes de un procedimiento', () => {
  const r = (platform: string, eta_hours: number | null) => ({ platform, eta_hours })

  it('sin reportes no dice nada, para que el que llama ponga otra cosa', () => {
    expect(resumenDeReportes([])).toBeNull()
  })

  it('uno solo: cuántos, dónde y en cuánto', () => {
    expect(resumenDeReportes([r('labcorp', 48)])).toBe('1 reporte · LabCorp · ~2 días')
  })

  it('dos plataformas se nombran las dos', () => {
    expect(resumenDeReportes([r('labcorp', 48), r('iqvia', 48)]))
      .toBe('2 reportes · LabCorp y IQVIA · ~2 días')
  })

  it('tres o más plataformas se cuentan, no se enumeran', () => {
    // Enumerar cuatro portales no entra en la línea y no se lee; el número sí.
    expect(resumenDeReportes([r('labcorp', 24), r('iqvia', 24), r('clario', 24), r('roche4g', 24)]))
      .toBe('4 reportes · 4 plataformas · ~1 día')
  })

  it('la misma plataforma dos veces cuenta como una sola', () => {
    expect(resumenDeReportes([r('labcorp', 24), r('labcorp', 24)]))
      .toBe('2 reportes · LabCorp · ~1 día')
  })

  it('con plazos distintos manda el MÁS LARGO, porque es el que cierra la visita', () => {
    expect(resumenDeReportes([r('labcorp', 24), r('iqvia', 168)]))
      .toBe('2 reportes · LabCorp y IQVIA · hasta ~7 días')
  })

  it('si alguno no tiene plazo, el número exacto sería media verdad', () => {
    expect(resumenDeReportes([r('labcorp', 48), r('iqvia', null)]))
      .toBe('2 reportes · LabCorp y IQVIA · hasta ~2 días')
  })

  it('sin ningún plazo lo dice, no inventa un número', () => {
    expect(resumenDeReportes([r('labcorp', null)])).toBe('1 reporte · LabCorp · sin plazo')
  })

  it('una plataforma desconocida no rompe la línea', () => {
    expect(resumenDeReportes([r('medidata', 24)])).toBe('1 reporte · Otra plataforma · ~1 día')
  })

  it('no dice "ETA" en ningún caso', () => {
    // El Director lo pidió por su nombre: "ETA" es jerga y el número solo no dice de qué.
    const casos = [
      resumenDeReportes([r('labcorp', 48)]),
      resumenDeReportes([r('labcorp', 24), r('iqvia', 168)]),
      resumenDeReportes([r('labcorp', null)]),
    ]
    for (const c of casos) expect(c).not.toMatch(/ETA/i)
  })
})

describe('knownReports', () => {
  it('deduplica el mismo nombre en la misma plataforma', () => {
    const r = knownReports([
      def({ id: 'a', name: 'Hematología completa', platform: 'labcorp' }),
      def({ id: 'b', name: 'hematología completa', platform: 'labcorp' }),
    ])
    expect(r).toHaveLength(1)
  })

  it('NO deduplica el mismo nombre en plataformas distintas', () => {
    // Mismo rótulo, otro portal y otro plazo: son dos opciones distintas del combobox.
    const r = knownReports([
      def({ id: 'a', name: 'Hematología completa', platform: 'labcorp', eta_hours: 48 }),
      def({ id: 'b', name: 'Hematología completa', platform: 'iqvia', eta_hours: 24 }),
    ])
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.platform).sort()).toEqual(['iqvia', 'labcorp'])
  })

  it('excluye la definición que se está editando', () => {
    const r = knownReports([def({ id: 'a' }), def({ id: 'b', name: 'Curva flujo-volumen' })], 'a')
    expect(r.map((x) => x.name)).toEqual(['Curva flujo-volumen'])
  })

  it('descarta nombres vacíos y normaliza una plataforma desconocida', () => {
    const r = knownReports([
      def({ id: 'a', name: '   ' }),
      def({ id: 'b', name: 'Química', platform: 'medidata' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].platform).toBe('otro')
  })

  it('ordena por nombre en castellano', () => {
    const r = knownReports([
      def({ id: 'a', name: 'Ácido úrico' }),
      def({ id: 'b', name: 'Bilirrubina' }),
      def({ id: 'c', name: 'Amilasa' }),
    ])
    expect(r.map((x) => x.name)).toEqual(['Ácido úrico', 'Amilasa', 'Bilirrubina'])
  })
})

describe('agruparPorCategoria', () => {
  it('respeta el orden de aparición de las categorías', () => {
    const g = agruparPorCategoria([
      { category: 'Laboratorio' },
      { category: 'Elegibilidad' },
      { category: 'Laboratorio' },
    ])
    expect(g.map((x) => x.categoria)).toEqual(['Laboratorio', 'Elegibilidad'])
    expect(g[0].items).toHaveLength(2)
  })

  it('manda los sin categoría al final, aunque aparezcan primero', () => {
    const g = agruparPorCategoria([{ category: null }, { category: 'Laboratorio' }])
    expect(g.map((x) => x.categoria)).toEqual(['Laboratorio', 'Sin categoría'])
  })

  it('trata la categoría vacía como "sin categoría"', () => {
    const g = agruparPorCategoria([{ category: '   ' }, { category: 'Laboratorio' }])
    expect(g.map((x) => x.categoria)).toEqual(['Laboratorio', 'Sin categoría'])
  })
})

describe('claveDePlataforma', () => {
  it('deriva una clave válida para el check de la base', () => {
    // El check es `^[a-z0-9_]+$`. Una clave inválida rebota con un error de Postgres que no
    // explica nada, y la clave se elige UNA vez: queda escrita en todos los reportes que la usen.
    for (const nombre of ['Clario', 'Roche 4G', 'Medidata Rave', 'IQVIA']) {
      expect(claveDePlataforma(nombre)).toMatch(/^[a-z0-9_]+$/)
    }
  })

  it('saca los acentos en vez de convertirlos en guiones', () => {
    // "Análisis Clínicos" con acentos daría `an_lisis_cl_nicos`: una clave que se lee como si
    // faltaran letras. La normalización NFD las conserva.
    expect(claveDePlataforma('Análisis Clínicos')).toBe('analisis_clinicos')
    expect(claveDePlataforma('Ñandú')).toBe('nandu')
  })

  it('no deja guiones bajos colgando en las puntas', () => {
    expect(claveDePlataforma('  Clario!  ')).toBe('clario')
    expect(claveDePlataforma('¡Roche 4G!')).toBe('roche_4g')
  })

  it('un nombre sin una sola letra ni número igual da una clave usable', () => {
    // Sin el respaldo, la clave saldría vacía y el insert rebotaría con el check.
    expect(claveDePlataforma('!!!')).toBe('plataforma')
  })

  it('desempata contra las claves que ya existen', () => {
    // El caso real: cargar "Clario" cuando ya está "clario". Sin desempate, el insert tira un
    // 23505 sobre la PK — un error de clave duplicada para dos nombres que se ven distintos.
    expect(claveDePlataforma('Clario', ['clario'])).toBe('clario_2')
    expect(claveDePlataforma('Clario', ['clario', 'clario_2'])).toBe('clario_3')
  })

  it('sin colisión no agrega sufijo', () => {
    expect(claveDePlataforma('Clario', ['iqvia', 'otro'])).toBe('clario')
  })
})
