import { describe, expect, it } from 'vitest'
import { formatTimeAR } from '../../lib/dates'
import { accionesDeVisita, destinoDeVolver, llegadaFueraDeFecha } from './accionesDeVisita'
import type { AccionDeVisita, PermisosDeVisita, VisitaParaAcciones } from './accionesDeVisita'

/*
 * Las reglas del menú del botón de etapa. Todas fallan en silencio: un «Volver a Concurrió» sobre una
 * visita que nunca registró la llegada, o un «Eliminar» habilitado en una visita del cronograma, se
 * ven perfectos en pantalla. Las horas se comparan contra `formatTimeAR` y no contra un literal: CI
 * corre en UTC y la máquina en Argentina (el mismo timestamp da dos horas distintas).
 */

const HOY = '2026-10-13'
const LLEGADA = '2026-10-13T14:37:00.000Z'
const INICIO = '2026-10-13T14:52:00.000Z'

const todo: PermisosDeVisita = { recepcion: true, clinica: true, coordina: true }
const soloRecepcion: PermisosDeVisita = { recepcion: true, clinica: false, coordina: false }
const nada: PermisosDeVisita = { recepcion: false, clinica: false, coordina: false }

function visita(extra: Partial<VisitaParaAcciones> = {}): VisitaParaAcciones {
  return {
    operational_stage: 'por_llegar',
    arrived_at: null,
    attended_at: null,
    real_date: null,
    estimated_date: '2026-10-28',
    no_show_at: null,
    kind: 'programada',
    patient_code: '032001520003',
    enrollment_status: 'activo',
    wants_doctor: false,
    doctor_seen_at: null,
    window_start: '2026-10-21',
    window_end: '2026-11-04',
    cargada_en_otra_fecha_at: null,
    ...extra,
  }
}

const concurrio = (extra: Partial<VisitaParaAcciones> = {}) =>
  visita({ operational_stage: 'concurrio_al_centro', arrived_at: LLEGADA, estimated_date: HOY, ...extra })
const enAtencion = (extra: Partial<VisitaParaAcciones> = {}) =>
  visita({ operational_stage: 'inicio_atencion', arrived_at: LLEGADA, attended_at: INICIO, real_date: HOY, estimated_date: HOY, ...extra })
const completa = (extra: Partial<VisitaParaAcciones> = {}) =>
  visita({ operational_stage: 'fin_atencion', arrived_at: LLEGADA, attended_at: INICIO, real_date: '2026-09-30', ...extra })

const item = (lista: AccionDeVisita[], clave: AccionDeVisita['clave']) => lista.find((a) => a.clave === clave)

describe('el orden del menú', () => {
  it('Por llegar: volver · reprogramar · vino otro día · no vino · copiar · eliminar', () => {
    expect(accionesDeVisita(visita(), todo, HOY).map((a) => a.clave))
      .toEqual(['volver', 'reprogramar', 'vino-otro-dia', 'no-vino', 'copiar', 'eliminar'])
  })
  it('en el centro desde hoy, sin «vino otro día» ni «no vino»', () => {
    expect(accionesDeVisita(concurrio(), todo, HOY).map((a) => a.clave))
      .toEqual(['volver', 'reprogramar', 'copiar', 'eliminar'])
  })
  it('Completa: el retest ocupa el lugar de «Volver»', () => {
    expect(accionesDeVisita(completa(), todo, HOY).map((a) => a.clave))
      .toEqual(['retest', 'reprogramar', 'copiar', 'eliminar'])
  })
  it('sólo Eliminar va en rojo', () => {
    const rojos = accionesDeVisita(visita({ kind: 'vnp' }), todo, HOY).filter((a) => a.peligro).map((a) => a.clave)
    expect(rojos).toEqual(['eliminar'])
  })
})

describe('Volver a la etapa anterior', () => {
  it('en la primera etapa no hay vuelta, y lo dice', () => {
    const v = item(accionesDeVisita(visita(), todo, HOY), 'volver')!
    expect(v).toMatchObject({ titulo: 'Volver a la etapa anterior', bajada: 'Es la primera etapa', habilitada: false })
  })
  it('desde Concurrió vuelve a Por llegar y nombra la hora de la llegada', () => {
    const v = item(accionesDeVisita(concurrio(), todo, HOY), 'volver')!
    expect(v).toMatchObject({ titulo: 'Volver a Por llegar', bajada: `Borra la llegada de las ${formatTimeAR(LLEGADA)}`, habilitada: true })
  })
  it('desde En atención vuelve a Concurrió y nombra la hora del inicio', () => {
    const v = item(accionesDeVisita(enAtencion(), todo, HOY), 'volver')!
    expect(v).toMatchObject({ titulo: 'Volver a Concurrió', bajada: `Borra el inicio de atención de las ${formatTimeAR(INICIO)}`, habilitada: true })
  })
  it('En atención SIN llegada marcada vuelve a Por llegar (no a un Concurrió que nunca pasó)', () => {
    expect(destinoDeVolver(enAtencion({ arrived_at: null }))).toBe('por_llegar')
    expect(item(accionesDeVisita(enAtencion({ arrived_at: null }), todo, HOY), 'volver')!.titulo).toBe('Volver a Por llegar')
  })
  it('la marca de HOY se deshace directo, sin confirmar', () => {
    expect(item(accionesDeVisita(concurrio(), todo, HOY), 'volver')!.confirmar).toBeUndefined()
    expect(item(accionesDeVisita(enAtencion(), todo, HOY), 'volver')!.confirmar).toBeUndefined()
  })
  /* 0160 (el Director: «que tire aviso y todo pero que te deje»): una marca de OTRO día se deshace también,
     pero confirmando, y la confirmación dice qué se borra y de qué día. Hasta la 0160 estaba apagada. */
  it('una llegada de otro día se deshace confirmando, con el día y no con una hora', () => {
    const v = item(accionesDeVisita(concurrio({ arrived_at: '2026-10-12T14:37:00.000Z' }), todo, HOY), 'volver')!
    expect(v).toMatchObject({
      titulo: 'Volver a Por llegar', habilitada: true, bajada: 'Borra la llegada del 12 oct',
      confirmar: { pregunta: '¿Volver a Por llegar?', detalle: 'No es de hoy: se borra la llegada del 12 oct.' },
    })
  })
  it('un inicio de otro día se deshace confirmando: lo que se borra es la fecha realizada', () => {
    const v = item(accionesDeVisita(enAtencion({ attended_at: '2026-10-12T14:52:00.000Z', real_date: '2026-10-12' }), todo, HOY), 'volver')!
    expect(v).toMatchObject({
      titulo: 'Volver a Concurrió', habilitada: true, bajada: 'Borra el inicio de atención del 12 oct',
      confirmar: { pregunta: '¿Volver a Concurrió?', detalle: 'No es de hoy: se borra la fecha realizada (12 oct).' },
    })
  })
  it('el día es el ARGENTINO: las 23:30 del 12 en AR son el 13 en UTC y no cuentan como hoy', () => {
    expect(item(accionesDeVisita(concurrio({ arrived_at: '2026-10-13T02:30:00.000Z' }), todo, HOY), 'volver'))
      .toMatchObject({ habilitada: true, bajada: 'Borra la llegada del 12 oct', confirmar: expect.anything() })
  })
  it('un inicio sin sello (anterior a la 0102) se deshace confirmando, y no inventa una hora', () => {
    const v = item(accionesDeVisita(enAtencion({ attended_at: null, real_date: '2026-10-08' }), todo, HOY), 'volver')!
    expect(v).toMatchObject({ habilitada: true, bajada: 'Borra el inicio de atención del 08 oct', confirmar: expect.anything() })
  })
  it('de otro día, el permiso y el médico siguen mandando antes que la confirmación', () => {
    const vieja = concurrio({ arrived_at: '2026-10-12T14:37:00.000Z' })
    expect(item(accionesDeVisita(vieja, nada, HOY), 'volver')).toMatchObject({ habilitada: false, bajada: 'Sólo Recepción deshace la llegada' })
    expect(item(accionesDeVisita({ ...vieja, wants_doctor: true }, todo, HOY), 'volver')).toMatchObject({ habilitada: false, bajada: 'Tiene atención médica pedida' })
  })
  it('Completa no tiene vuelta', () => {
    expect(destinoDeVolver(completa())).toBeNull()
  })
  it('la llegada la deshace Recepción; el inicio de atención, el equipo clínico', () => {
    expect(item(accionesDeVisita(concurrio(), soloRecepcion, HOY), 'volver')!.habilitada).toBe(true)
    expect(item(accionesDeVisita(concurrio(), nada, HOY), 'volver')).toMatchObject({ habilitada: false, bajada: 'Sólo Recepción deshace la llegada' })
    expect(item(accionesDeVisita(enAtencion(), soloRecepcion, HOY), 'volver')).toMatchObject({ habilitada: false, bajada: 'Sólo quien coordina el estudio' })
    // Un admin de Coordinación que no coordina el estudio: la base lo rechaza (0155), así que no se ofrece.
    expect(item(accionesDeVisita(enAtencion(), { recepcion: true, clinica: true, coordina: false }, HOY), 'volver')!.habilitada).toBe(false)
  })
  it('no vuelve a Por llegar con el médico de por medio', () => {
    expect(item(accionesDeVisita(concurrio({ wants_doctor: true }), todo, HOY), 'volver')).toMatchObject({ habilitada: false, bajada: 'Tiene atención médica pedida' })
    expect(item(accionesDeVisita(concurrio({ doctor_seen_at: INICIO }), todo, HOY), 'volver')).toMatchObject({ habilitada: false, bajada: 'Ya lo atendió el médico' })
  })
  it('pero sí vuelve a Concurrió con el médico visto: el paciente sigue en el centro', () => {
    expect(item(accionesDeVisita(enAtencion({ doctor_seen_at: INICIO }), todo, HOY), 'volver')!.habilitada).toBe(true)
  })
  /* 0158: una visita cargada en otra fecha no tiene sello de inicio (la hora no se sabe). Su marca es el
     momento de la carga: si fue HOY, se deshace —vuelve a Por llegar, nunca llegó— y la bajada nombra el
     día que dice la visita, no una hora inventada. */
  it('una carga en otra fecha hecha HOY se deshace, nombrando el día de la visita', () => {
    const cargada = enAtencion({ arrived_at: null, attended_at: null, real_date: '2026-10-08', cargada_en_otra_fecha_at: INICIO })
    expect(item(accionesDeVisita(cargada, todo, HOY), 'volver')).toMatchObject({
      titulo: 'Volver a Por llegar', bajada: 'Deshace la carga del 08 oct', habilitada: true,
    })
  })
  it('una carga en otra fecha hecha OTRO día se deshace confirmando (0160)', () => {
    const deAyer = enAtencion({ arrived_at: null, attended_at: null, real_date: '2026-10-08', cargada_en_otra_fecha_at: '2026-10-12T14:52:00.000Z' })
    expect(item(accionesDeVisita(deAyer, todo, HOY), 'volver')).toMatchObject({
      titulo: 'Volver a Por llegar', habilitada: true, bajada: 'Deshace la carga del 08 oct',
      confirmar: { pregunta: '¿Volver a Por llegar?', detalle: 'No es de hoy: se borra la fecha realizada (08 oct).' },
    })
  })
  it('deshacer una carga es de quien coordina el estudio, como el inicio de atención', () => {
    const cargada = enAtencion({ arrived_at: null, attended_at: null, real_date: '2026-10-08', cargada_en_otra_fecha_at: INICIO })
    expect(item(accionesDeVisita(cargada, soloRecepcion, HOY), 'volver')).toMatchObject({ habilitada: false, bajada: 'Sólo quien coordina el estudio' })
  })
})

describe('Vino otro día', () => {
  it('Por llegar, habilitado para quien coordina el estudio; fechada, no aparece', () => {
    expect(item(accionesDeVisita(visita(), todo, HOY), 'vino-otro-dia')).toMatchObject({
      titulo: 'Vino otro día…', bajada: 'Cargarla con la fecha en que vino', habilitada: true,
    })
    expect(item(accionesDeVisita(enAtencion(), todo, HOY), 'vino-otro-dia')).toBeUndefined()
    expect(item(accionesDeVisita(completa(), todo, HOY), 'vino-otro-dia')).toBeUndefined()
  })
  /* 0160: la visita de la captura del Director, que llegó el 10 y quedó en Concurrió. Se carga con el día
     de la llegada; si llegó HOY no aparece: para eso está «Iniciar atención». */
  it('Concurrió: sólo si llegó otro día, y con el día de la llegada', () => {
    expect(item(accionesDeVisita(concurrio(), todo, HOY), 'vino-otro-dia')).toBeUndefined()
    expect(item(accionesDeVisita(concurrio({ arrived_at: '2026-10-10T14:37:00.000Z' }), todo, HOY), 'vino-otro-dia')).toMatchObject({
      titulo: 'Vino otro día…', bajada: 'Llegó el 10 oct: cargarla con esa fecha', habilitada: true,
    })
  })
  it('Concurrió de otro día, en el orden de siempre: después de Reprogramar', () => {
    expect(accionesDeVisita(concurrio({ arrived_at: '2026-10-10T14:37:00.000Z' }), todo, HOY).map((a) => a.clave))
      .toEqual(['volver', 'reprogramar', 'vino-otro-dia', 'copiar', 'eliminar'])
  })
  it('Concurrió de otro día sin coordinar el estudio: apagado con su porqué', () => {
    expect(item(accionesDeVisita(concurrio({ arrived_at: '2026-10-10T14:37:00.000Z' }), soloRecepcion, HOY), 'vino-otro-dia'))
      .toMatchObject({ habilitada: false, bajada: 'Lo carga quien coordina el estudio' })
  })
  it('con «no vino» también: la base lo limpia en el mismo paso (vino)', () => {
    expect(item(accionesDeVisita(visita({ no_show_at: LLEGADA }), todo, HOY), 'vino-otro-dia')!.habilitada).toBe(true)
  })
  it('Recepción sola, o un admin que no coordina el estudio: apagado con su porqué', () => {
    expect(item(accionesDeVisita(visita(), soloRecepcion, HOY), 'vino-otro-dia')).toMatchObject({ habilitada: false, bajada: 'Lo carga quien coordina el estudio' })
    expect(item(accionesDeVisita(visita(), { recepcion: true, clinica: true, coordina: false }, HOY), 'vino-otro-dia')!.habilitada).toBe(false)
  })
})

describe('Reprogramar', () => {
  it('sólo mientras está Por llegar, con la fecha programada en la bajada', () => {
    expect(item(accionesDeVisita(visita(), todo, HOY), 'reprogramar')).toMatchObject({ habilitada: true, bajada: 'Programada para el 28 oct 2026' })
    expect(item(accionesDeVisita(visita({ estimated_date: HOY }), todo, HOY), 'reprogramar')!.bajada).toBe('Programada para hoy')
    expect(item(accionesDeVisita(visita({ estimated_date: null }), todo, HOY), 'reprogramar')!.bajada).toBe('Sin fecha programada')
  })
  it('en el centro y en Completa se apaga con su porqué', () => {
    expect(item(accionesDeVisita(concurrio(), todo, HOY), 'reprogramar')).toMatchObject({ habilitada: false, bajada: 'Ya concurrió al centro' })
    expect(item(accionesDeVisita(enAtencion(), todo, HOY), 'reprogramar')).toMatchObject({ habilitada: false, bajada: 'Ya concurrió al centro' })
    expect(item(accionesDeVisita(completa(), todo, HOY), 'reprogramar')).toMatchObject({ habilitada: false, bajada: 'La visita está completa' })
  })
  it('sin permiso de Recepción, apagado', () => {
    expect(item(accionesDeVisita(visita(), nada, HOY), 'reprogramar')!.habilitada).toBe(false)
  })
})

describe('No vino', () => {
  it('marcar sin falta; deshacer con falta', () => {
    expect(item(accionesDeVisita(visita(), todo, HOY), 'no-vino')!.habilitada).toBe(true)
    const conFalta = accionesDeVisita(visita({ no_show_at: LLEGADA }), todo, HOY)
    expect(item(conFalta, 'no-vino')).toBeUndefined()
    expect(item(conFalta, 'deshacer-no-vino')!.habilitada).toBe(true)
  })
  it('sin permiso de Recepción, apagado', () => {
    expect(item(accionesDeVisita(visita(), nada, HOY), 'no-vino')!.habilitada).toBe(false)
  })
})

describe('Copiar ID', () => {
  it('lleva el Nº de sujeto a la derecha; sin IVRS se apaga', () => {
    expect(item(accionesDeVisita(visita(), nada, HOY), 'copiar')).toMatchObject({ habilitada: true, aparte: '032001520003' })
    expect(item(accionesDeVisita(visita({ patient_code: null }), todo, HOY), 'copiar')!.habilitada).toBe(false)
  })
})

describe('Eliminar', () => {
  it('sólo las sueltas: el cronograma y la randomización no se borran (policy 0022)', () => {
    expect(item(accionesDeVisita(visita({ kind: 'programada' }), todo, HOY), 'eliminar')).toMatchObject({ habilitada: false, bajada: 'Las visitas del cronograma no se borran' })
    expect(item(accionesDeVisita(visita({ kind: 'randomizacion' }), todo, HOY), 'eliminar')!.habilitada).toBe(false)
    expect(item(accionesDeVisita(visita({ kind: 'vnp' }), todo, HOY), 'eliminar')!.habilitada).toBe(true)
    expect(item(accionesDeVisita(completa({ kind: 'retest' }), todo, HOY), 'eliminar')!.habilitada).toBe(true)
  })
  it('sin el equipo clínico del estudio, apagado', () => {
    expect(item(accionesDeVisita(visita({ kind: 'vnp' }), soloRecepcion, HOY), 'eliminar')!.habilitada).toBe(false)
  })
})

describe('Pedir retest', () => {
  it('habilitado en una completa reciente', () => {
    expect(item(accionesDeVisita(completa(), todo, HOY), 'retest')).toMatchObject({ habilitada: true, bajada: 'Repetir procedimientos de esta visita' })
  })
  it('mismo límite que el alta manual: atendida hace más de 60 días, apagado', () => {
    expect(item(accionesDeVisita(completa({ real_date: '2026-08-14' }), todo, HOY), 'retest')!.habilitada).toBe(true) // 60 días justos
    expect(item(accionesDeVisita(completa({ real_date: '2026-08-13' }), todo, HOY), 'retest')).toMatchObject({ habilitada: false, bajada: 'Atendida hace más de 60 días' })
  })
  it('inscripción fuera de curso, sin fecha realizada o sin permiso: apagado', () => {
    expect(item(accionesDeVisita(completa({ enrollment_status: 'inactivo' }), todo, HOY), 'retest')!.habilitada).toBe(false)
    expect(item(accionesDeVisita(completa({ real_date: null }), todo, HOY), 'retest')!.habilitada).toBe(false)
    expect(item(accionesDeVisita(completa(), soloRecepcion, HOY), 'retest')!.habilitada).toBe(false)
  })
})

describe('llegadaFueraDeFecha', () => {
  it('citada hoy: directo, sin confirmación', () => {
    expect(llegadaFueraDeFecha(visita({ estimated_date: HOY }), HOY, true)).toBeNull()
  })
  it('citada MÁS ADELANTE: confirma y mueve la fecha a hoy', () => {
    expect(llegadaFueraDeFecha(visita({ estimated_date: '2026-10-28', window_start: null, window_end: null }), HOY, true)).toEqual({
      antes: 'Esta visita está agendada para el', fecha: '28 oct',
      detalle: 'Se registra la llegada hoy, 13 oct, y la fecha de la visita pasa a ser hoy.', mueveFecha: true,
      vinoEseDia: null,
    })
  })
  it('adelantarla fuera de la ventana lo dice en la misma confirmación', () => {
    expect(llegadaFueraDeFecha(visita(), HOY, true)!.detalle).toBe('Se registra la llegada hoy, 13 oct, y la fecha de la visita pasa a ser hoy. Hoy queda fuera de la ventana del protocolo.')
    expect(llegadaFueraDeFecha(visita({ window_start: '2026-10-10' }), HOY, true)!.detalle).not.toMatch(/ventana/)
  })
  it('sin permiso para mover fechas: confirma la llegada sin mover la fecha', () => {
    expect(llegadaFueraDeFecha(visita(), HOY, false)).toMatchObject({ mueveFecha: false, detalle: 'Se registra la llegada hoy, 13 oct. La fecha la mueve quien coordina el estudio.' })
  })
  it('citada ANTES (llegó tarde): confirma y la fecha queda (#460), aun pudiendo moverla', () => {
    expect(llegadaFueraDeFecha(visita({ estimated_date: '2026-10-08' }), HOY, true)).toEqual({
      antes: 'Esta visita estaba agendada para el', fecha: '08 oct',
      detalle: 'Se registra la llegada hoy, 13 oct. La fecha agendada queda como estaba.', mueveFecha: false,
      vinoEseDia: '08 oct',
    })
  })
  it('citada ANTES: ofrece «¿Vino el 08 oct?» sólo a quien puede fechar la visita (0158)', () => {
    // El caso que originó la 0158: una visita de la semana pasada marcada hoy. La confirmación es el
    // momento exacto para ofrecer cargarla con su fecha.
    expect(llegadaFueraDeFecha(visita({ estimated_date: '2026-10-08' }), HOY, false)!.vinoEseDia).toBeNull()
    expect(llegadaFueraDeFecha(visita(), HOY, true)!.vinoEseDia).toBeNull() // futura: no se ofrece
  })
  it('sin fecha: queda para hoy', () => {
    expect(llegadaFueraDeFecha(visita({ estimated_date: null, window_start: null, window_end: null }), HOY, true)).toMatchObject({
      antes: 'Esta visita no tiene fecha agendada', fecha: null, mueveFecha: true,
      detalle: 'Se registra la llegada hoy, 13 oct, y la visita queda para hoy.',
    })
  })
  it('sólo la llegada: Iniciar y Finalizar no pasan por acá', () => {
    expect(llegadaFueraDeFecha(concurrio({ estimated_date: '2026-10-28' }), HOY, true)).toBeNull()
    expect(llegadaFueraDeFecha(enAtencion({ estimated_date: '2026-10-28' }), HOY, true)).toBeNull()
  })
})
