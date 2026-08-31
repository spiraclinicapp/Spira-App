import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState } from '../../../components/EmptyState'
import { MultiFilterMenu } from '../../../components/MultiFilterMenu'
import type { MultiFilterOption } from '../../../components/MultiFilterMenu'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { DateRangeField } from '../../../components/DateRangeField'
import { useAuth } from '../../../lib/auth'
import { formatAR } from '../../../lib/dates'
import { toCsv, downloadCsv } from '../../../lib/csv'
import { formatNumberAR, formatPctAR } from '../../../lib/numbers'
import { codecs, oneOf } from '../../../lib/router'
import { useUrlState } from '../../../lib/useUrlState'
import {
  useReportExpired, useReportItems, useReportReceptions, useReportRejected,
} from '../../../data/pharma'
import { useProtocols } from '../../../data/protocols'
import { useAbrirFicha } from '../../useAbrirFicha'
import type { ViewProps } from '../../types'
import {
  detalle as armarDetalle, invariantes, porDispensacion, porMedicamento, porProtocolo,
  totales as calcularTotales, totalesIngresos,
} from './agregados'
import { diasDelRango, extremos, rangoDePreset, serieDiaria } from './serie'
import type { Preset } from './serie'
import { Composicion } from './Composicion'
import { GraficoDiario } from './GraficoDiario'
import { BotonImprimir, Resumen } from './Resumen'
import type { IndicadorTira } from './Resumen'
import { TablaDetalle, TablaMedicamentos, TablaProtocolos } from './Tablas'
import { HojaImpresa } from './impresion'
import type { ContextoReporte } from './impresion'
import { sectionHead, sectionHint, sectionRule, sectionTitle } from './estilos'

/**
 * Farmacia › Estadísticas (el submódulo se llamaba "Reportes" hasta el 2026-08-20; la carpeta, el
 * componente y la `key` siguen con el nombre viejo porque la clave la usan el registry, el buscador
 * y las rutas guardadas). La vista de cierre de período: los números arriba, y desde cada bloque se
 * imprime SU reporte — de ahí que "reporte" siga nombrando lo que sale por la impresora.
 *
 * UN SOLO SNAPSHOT alimenta la pantalla y las hojas impresas. Los agregados se derivan en
 * TypeScript de las filas que trae `useReportItems`, y no en SQL, por dos motivos: los tests
 * prueban el código que realmente corre, y ningún bloque puede quedar hablando de un instante
 * distinto que otro. Si cada tarjeta consultara por su cuenta, una entrega en el medio dejaría el
 * KPI y la tabla contradiciéndose en la misma hoja firmada.
 *
 * PISO DE 1024px. Por debajo la pantalla no adivina un diseño que nunca se dibujó: avisa y ofrece
 * la descarga, que es la salida útil en un teléfono.
 */
export function ReportesView({ module, submodule, onNavigate }: ViewProps) {
  const { profile } = useAuth()

  /* `module.key` y no `'track'` fijo: acá puede valer `pharma` (ver el comentario de cabecera de
     `useAbrirFicha`). */
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver a Estadísticas' }),
  })

  /* El rango NO se guarda aparte: se deriva del preset, y solo cuando el preset es 'custom' viajan
     desde/hasta. Guardar los dos sería poder contradecirse — una URL que dice periodo=anio con un
     rango de tres días. */
  const [preset, setPreset] = useUrlState<Preset>('periodo', '30dias', {
    codec: oneOf(['30dias', 'mesEnCurso', 'anio', 'custom'] as const),
  })
  const [desde, setDesde] = useUrlState('desde', '')
  const [hasta, setHasta] = useUrlState('hasta', '')
  /* Memoizado: antes era `useState` (identidad estable); al derivarlo en cada render, un objeto
     NUEVO en cada pasada arrastraba al `useMemo` de `d` más abajo —la pasada única sobre hasta 5.000
     filas que arma serie, agregados e invariantes— que lo tiene en sus deps. No hay bucle (las
     consultas dependen de los strings `desde`/`hasta`, no de `rango`), así que era costo y no
     corrección, pero deshacía en silencio la decisión de diseño de ese comentario. */
  const rango = useMemo(
    () => (preset === 'custom' && desde && hasta ? { desde, hasta } : rangoDePreset(preset === 'custom' ? '30dias' : preset)),
    [preset, desde, hasta],
  )
  const setRango = (r: { desde: string; hasta: string }) => { setDesde(r.desde); setHasta(r.hasta) }
  /** Protocolos del recorte, por CÓDIGO (así los filtran las vistas 0083). Vacío = todos. */
  const [protoSel, setProtoSel] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [reporteEnCurso, setReporteEnCurso] = useState<string | null>(null)
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)

  useEffect(() => {
    const onResize = () => setAngosto(window.innerWidth < 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const items = useReportItems(rango, protoSel)
  const recepciones = useReportReceptions(rango, protoSel)
  const rechazados = useReportRejected(rango, protoSel)
  const vencidos = useReportExpired(protoSel)

  /* Las opciones del menú salen del catálogo de protocolos, NO de los datos del período. Derivarlas
     de lo que se muestra parece más prolijo, pero con multi-selección es una trampa: al elegir el
     primero, el período filtrado ya solo contiene ese protocolo y el menú se quedaría con una sola
     opción — nunca podrías sumar un segundo. Un protocolo sin movimientos cae en el estado vacío,
     que ya lo explica. */
  const protocols = useProtocols()
  const protoOptions: MultiFilterOption[] = (protocols.data ?? [])
    .map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))

  const cargando = items.loading || recepciones.loading || rechazados.loading || vencidos.loading
  const error = items.error ?? recepciones.error ?? rechazados.error ?? vencidos.error
  const truncado = items.truncado || recepciones.truncado

  /* Todo lo que se muestra sale de acá. Una sola dependencia (`items.data`) y una sola pasada:
     si esto se partiera en varios useMemo con deps distintas, los bloques podrían quedar
     desfasados entre renders. */
  const d = useMemo(() => {
    const filas = items.data ?? []
    const recs = recepciones.data ?? []
    const serie = serieDiaria(filas, rango)
    const protocolos = porProtocolo(filas)
    const medicamentos = porMedicamento(filas)
    const totales = calcularTotales(filas)
    const ingresos = totalesIngresos(recs)
    const porDisp = porDispensacion(filas)
    const ext = extremos(serie)
    return {
      serie, protocolos, medicamentos, totales, ingresos, porDisp,
      detalle: armarDetalle(filas),
      consistencia: invariantes(filas, serie, protocolos, medicamentos),
      diaMax: ext.max, diaMin: ext.min,
      vencidos: {
        unidades: (vencidos.data ?? []).reduce((a, l) => a + l.unidades, 0),
        lotes: (vencidos.data ?? []).length,
      },
    }
  }, [items.data, recepciones.data, vencidos.data, rango])

  /* Va impreso en el encabezado de cada hoja: tiene que declarar el recorte COMPLETO. Con varios
     protocolos se listan todos —nombrar solo uno, o decir "3 protocolos", dejaría una hoja firmada
     sin decir cuáles. */
  const filtrosTexto = protoSel.length === 0
    ? 'Sin filtros: todo el período'
    : protoSel.length === 1
      ? `Protocolo: ${protoSel[0]}`
      : `Protocolos: ${protoSel.join(', ')}`
  const emitidoEn = new Date().toISOString()

  const ctx: ContextoReporte = {
    rango,
    filtros: filtrosTexto,
    generadoPor: profile?.fullName ?? 'Spira',
    emitidoEn,
    totales: d.totales,
    ingresos: d.ingresos,
    minutosPromedio: d.porDisp.minutosPromedio,
    cumplimientoPct: d.porDisp.cumplimientoPct,
    rechazados: (rechazados.data ?? []).length,
    vencidos: d.vencidos,
    protocolos: d.protocolos,
    medicamentos: d.medicamentos,
    detalle: d.detalle,
    diaMax: d.diaMax, diaMin: d.diaMin,
    dias: diasDelRango(rango),
  }

  /* La impresión monta la hoja y recién en el efecto siguiente llama a print(): React ya volcó el
     DOM cuando el efecto corre, así que la hoja existe. Al volver, se desmonta. */
  useEffect(() => {
    if (!reporteEnCurso) return
    const t = window.setTimeout(() => {
      window.print()
      setReporteEnCurso(null)
    }, 60)
    return () => window.clearTimeout(t)
  }, [reporteEnCurso])

  /** Los números no cierran: no se imprime. Una hoja firmada con datos inconsistentes es peor. */
  const puedeImprimir = d.consistencia.ok && !truncado && !cargando && !error

  function imprimir(clave: string) {
    if (!puedeImprimir) return
    setReporteEnCurso(clave)
  }

  function descargar() {
    const filas = d.detalle.map((f) => [
      f.numero, formatAR(f.fecha), f.deliveredAt.slice(11, 16),
      f.pacienteNombre ?? '', f.pacienteCodigo ?? '', f.protocolCode ?? '', f.visitaCodigo ?? '',
      f.medicamentos, f.unidades, f.kits,
    ])
    const csv = toCsv(
      ['N°', 'Fecha', 'Hora', 'Paciente', 'Código', 'Protocolo', 'Visita', 'Medicamentos', 'Unidades', 'Kits'],
      [
        ['Reporte de dispensaciones — Spira · Fundación Scherbovsky'],
        [`Período: ${formatAR(rango.desde)} a ${formatAR(rango.hasta)}`],
        [`Filtros: ${filtrosTexto}`],
        [`Generado por: ${ctx.generadoPor}`],
        [],
        ...filas,
      ],
    )
    downloadCsv(`dispensaciones_${rango.desde}_${rango.hasta}.csv`, csv)
  }

  /* Elegir un preset SUELTA cualquier rango cargado a mano: si `desde`/`hasta` quedaran con las
     fechas del `custom` anterior, el cálculo de arriba las ignora (ya no es `custom`) pero seguirían
     viajando en la URL sin usarse — la misma clase de auto-contradicción que el diseño evita.
     Se limpian ANTES de cambiar el preset, mismo orden que `elegirRango`: la escritura de
     desde/hasta va primero. */
  function elegirPreset(p: Exclude<Preset, 'custom'>) {
    setRango({ desde: '', hasta: '' })
    setPreset(p)
  }

  /** Un rango elegido a mano deja de coincidir con cualquier preset: se apagan los tres chips.
      El ORDEN importa: primero desde/hasta, recién después preset='custom' — si se invirtiera, el
      render que cae entre las dos escrituras vería preset='custom' con desde/hasta todavía vacíos
      (o con los del rango anterior) y derivaría el rango del preset viejo en vez del elegido. */
  function elegirRango(desde: string, hasta: string) {
    setRango({ desde, hasta })
    setPreset('custom')
  }

  /* ── Estados ─────────────────────────────────────────────────────────────── */

  if (angosto) {
    return (
      <div>
        <EmptyState
          icon="barChart"
          accent={module.accent}
          title="El informe necesita más ancho"
          description="Esta pantalla se diseñó para monitores de 1024px o más. Podés descargar el detalle del período y abrirlo desde acá."
        />
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 14 }}>
          <button type="button" style={btnOutline} onClick={descargar}>Descargar el detalle</button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon="alert"
        accent="#A6483B"
        title="No se pudo armar el informe"
        description={error}
      />
    )
  }

  /* Mismo criterio que el tablero de Dispensaciones: se avisa con palabras, no con bloques grises
     donde después van los números. El esqueleto que había acá dibujaba tres cards con barras
     inmóviles (la clase `spira-skeleton` que las iba a hacer latir nunca existió en el CSS), y un
     informe a medio dibujar es justo lo que no se quiere ver en una app auditable. */
  if (cargando) {
    return (
      <EmptyState
        icon="barChart"
        accent={module.accent}
        title="Armando el informe del período…"
        description="Un momento."
      />
    )
  }

  const sinMovimientos = d.totales.dispensaciones === 0 && d.ingresos.recepciones === 0

  return (
    <div>
      <Filtros
        rango={rango}
        preset={preset}
        onPreset={elegirPreset}
        onRango={elegirRango}
        protoOptions={protoOptions}
        protoSel={protoSel}
        onProtocolos={setProtoSel}
        accentSolid={module.accentSolid}
        onImprimirTodo={() => imprimir('todo')}
        puedeImprimir={puedeImprimir}
      />

      {truncado && (
        <Aviso>
          El período trae más registros de los que la pantalla puede leer de una
          ({formatNumberAR(items.total ?? 0)}). Acotá el rango o filtrá por protocolo: con el
          informe cortado los totales saldrían mal y no se pueden imprimir.
        </Aviso>
      )}

      {sinMovimientos ? (
        <EmptyState
          icon="barChart"
          accent={module.accent}
          title="No hubo movimientos"
          description={
            protoSel.length > 0
              ? `Entre el ${formatAR(rango.desde)} y el ${formatAR(rango.hasta)} no hubo movimientos de ${protoSel.length === 1 ? `el protocolo ${protoSel[0]}` : `los protocolos ${protoSel.join(', ')}`}. Probá sacando el filtro.`
              : `Entre el ${formatAR(rango.desde)} y el ${formatAR(rango.hasta)} no se dispensó ni ingresó medicación. Probá con un período más amplio.`
          }
        />
      ) : (
        <>
          <Seccion titulo="Resumen del período" hint="Cada indicador se imprime solo desde su ícono"
            reporte="resumen" que="el resumen del período" onImprimir={imprimir} />

          <Resumen
            totales={d.totales}
            ingresos={d.ingresos}
            indicadores={armarIndicadores(d, ctx)}
            consistencia={d.consistencia}
            emitidoEn={emitidoEn}
            sparkline={d.serie.map((p) => p.unidades)}
            onImprimir={imprimir}
          />

          <Seccion titulo="Evolución y composición" reporte="evolucion" que="la evolución diaria" onImprimir={imprimir} />
          <div style={chartRow}>
            <GraficoDiario serie={d.serie} />
            <Composicion protocolos={d.protocolos} kits={d.totales.kits} unidades={d.totales.unidades} />
          </div>

          <Seccion titulo="Dispensaciones por protocolo" reporte="protocolos" que="las dispensaciones por protocolo" onImprimir={imprimir} />
          <TablaProtocolos filas={d.protocolos} total={d.totales} />

          <Seccion titulo="Medicamentos más dispensados" reporte="medicamentos" que="los medicamentos más dispensados" onImprimir={imprimir} />
          <TablaMedicamentos filas={d.medicamentos} totalUnidades={d.totales.unidades} />

          <div style={sectionHead}>
            <h2 style={sectionTitle}>Detalle de dispensaciones</h2>
            <div style={sectionRule} />
            <div style={sectionHint}>
              {formatNumberAR(d.detalle.length)} {d.detalle.length === 1 ? 'registro' : 'registros'} en el período
            </div>
            <button type="button" style={{ ...btnOutline, height: 34, fontSize: 13 }} onClick={descargar}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="download" size={15} stroke={1.8} />
                Descargar
              </span>
            </button>
            <BotonImprimir clave="detalle" que="el reporte de dispensaciones" onImprimir={imprimir} />
          </div>
          <TablaDetalle
            filas={d.detalle}
            onOpenPaciente={(f) => (abrirFicha && f.pacienteId ? () => abrirFicha(f.pacienteId!, f.protocolId ?? undefined) : undefined)}
          />
        </>
      )}

      <HojaImpresa clave={reporteEnCurso} ctx={ctx} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PIEZAS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Los seis indicadores de la tira, ORDENADOS POR SEMÁNTICA: primero los cuatro neutros, después
 * los dos que piden acción. Ver el comentario de `Resumen.tsx`.
 */
function armarIndicadores(
  d: { totales: { pacientes: number }; porDisp: { minutosPromedio: number | null; cumplimientoPct: number | null }; medicamentos: { medicationName: string; unidades: number; pct: number }[]; vencidos: { unidades: number; lotes: number } },
  ctx: ContextoReporte,
): IndicadorTira[] {
  const top = d.medicamentos[0]
  return [
    { label: 'Pacientes distintos atendidos', valor: formatNumberAR(d.totales.pacientes), reporte: 'pacientes' },
    {
      label: 'Tiempo promedio hasta la entrega',
      valor: d.porDisp.minutosPromedio == null ? '—' : formatNumberAR(d.porDisp.minutosPromedio),
      sufijo: d.porDisp.minutosPromedio == null ? undefined : 'min',
      reporte: 'tiempos',
    },
    {
      label: 'Cumplimiento del pedido',
      valor: d.porDisp.cumplimientoPct == null ? '—' : formatPctAR(d.porDisp.cumplimientoPct, { entero: true }),
      reporte: 'cumplimiento',
    },
    {
      label: 'Droga más dispensada',
      valor: top ? top.medicationName : '—',
      detalle: top ? `${formatNumberAR(top.unidades)} u. · ${formatPctAR(top.pct)}` : undefined,
      reporte: 'medicamentos',
    },
    { label: 'Pedidos rechazados o cancelados', valor: formatNumberAR(ctx.rechazados), tono: 'warn', reporte: 'rechazadas' },
    {
      label: 'Stock vencido sin usar, al día de hoy',
      valor: formatNumberAR(d.vencidos.unidades), sufijo: 'u.', tono: 'danger', reporte: 'vencidos',
    },
  ]
}

function Filtros({
  rango, preset, onPreset, onRango, protoOptions, protoSel, onProtocolos, accentSolid,
  onImprimirTodo, puedeImprimir,
}: {
  rango: { desde: string; hasta: string }
  preset: Preset
  onPreset: (p: Exclude<Preset, 'custom'>) => void
  onRango: (desde: string, hasta: string) => void
  protoOptions: MultiFilterOption[]
  protoSel: string[]
  onProtocolos: (next: string[]) => void
  accentSolid: string
  onImprimirTodo: () => void
  puedeImprimir: boolean
}) {
  return (
    <>
      <div style={filtrosFila}>
        <DateRangeField
          accent={accentSolid}
          desde={rango.desde}
          hasta={rango.hasta}
          onChange={onRango}
        />

        <div style={{ display: 'inline-flex', gap: 7 }}>
          {([['30dias', '30 días'], ['mesEnCurso', 'Mes en curso'], ['anio', 'Año']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={preset === k}
              onClick={() => onPreset(k)}
              style={{ ...chip, ...(preset === k ? chipActivo : null) }}
            >
              {label}
            </button>
          ))}
        </div>

        <span style={{ width: 1, height: 24, background: 'var(--spira-line)' }} />

        <MultiFilterMenu
          accent={accentSolid}
          label="Protocolo"
          icon="file"
          options={protoOptions}
          selected={protoSel}
          onChange={onProtocolos}
          searchPlaceholder="Buscar protocolo…"
        />

        <button
          type="button"
          onClick={onImprimirTodo}
          disabled={!puedeImprimir}
          style={{ ...btnPrimary(accentSolid), marginLeft: 'auto', opacity: puedeImprimir ? 1 : 0.5 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="printer" size={16} stroke={1.8} />
            Imprimir informe completo
          </span>
        </button>
      </div>

      <p style={aplicada}>
        El recorte vale para todo el apartado: cada reporte que imprimas sale con ese mismo período
        y ese mismo filtro declarados en el encabezado de la hoja. El reporte de dispensaciones
        declara sólo el período, como el formato acordado con la Fundación.
      </p>
    </>
  )
}

function Seccion({ titulo, hint, reporte, que, onImprimir }: {
  titulo: string
  hint?: string
  reporte: string
  que: string
  onImprimir: (clave: string) => void
}) {
  return (
    <div style={sectionHead}>
      <h2 style={sectionTitle}>{titulo}</h2>
      <div style={sectionRule} />
      {hint && <div style={sectionHint}>{hint}</div>}
      <BotonImprimir clave={reporte} que={que} onImprimir={onImprimir} />
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      display: 'flex', gap: 9, alignItems: 'flex-start', margin: '0 0 16px', padding: '11px 14px',
      background: 'var(--spira-surface)', border: '1px solid var(--spira-line-2)', borderRadius: 10,
      fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-acc-deep-warn)',
    }}>
      <span style={{ flex: '0 0 15px', marginTop: 1 }}><Icon name="alert" size={15} stroke={1.9} /></span>
      <span>{children}</span>
    </p>
  )
}

/* ── Estilos locales ─────────────────────────────────────────────────────────── */

const filtrosFila: CSSProperties = {
  display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
  padding: '2px 0 15px', borderBottom: '1px solid var(--spira-line)', marginBottom: 10,
}

const chip: CSSProperties = {
  height: 34, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid',
  borderColor: 'var(--spira-line-2)', color: 'var(--spira-muted)',
  fontFamily: 'var(--spira-font-text)',
}

const chipActivo: CSSProperties = {
  background: 'rgba(15, 95, 87, 0.10)', borderColor: 'rgba(15, 95, 87, 0.35)', color: 'var(--spira-acc-deep-track)',
}


/**
 * La nota del recorte, a lo ANCHO. Tenía un tope de 92ch —696px medidos— que la partía en TRES
 * renglones cuando debajo tenía 1185px libres: un bloque de texto donde iba un pie de barra. Sin
 * tope entra en DOS (el texto mide 1425px de corrido), y ahí se queda de 800px para arriba.
 *
 * Sí, son renglones más largos que los 65-75ch que se le piden a la prosa. Ese tope cuida la vuelta
 * al margen en un texto de muchas líneas; esto son dos renglones de 12px que se leen una vez, y el
 * alto que ganan vale más que el ancho que gastan. Para bajarlo a UN renglón habría que recortar el
 * texto a ~205 caracteres y el copy se deja como está (decisión del Director, 2026-08-31).
 */
const aplicada: CSSProperties = {
  fontSize: 12, color: 'var(--spira-ink-soft)', margin: '0 0 16px', lineHeight: 1.55,
}

const chartRow: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1.62fr) minmax(0, 1fr)', gap: 12, alignItems: 'stretch',
}
