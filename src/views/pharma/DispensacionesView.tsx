import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { MultiFilterMenu } from '../../components/MultiFilterMenu'
import type { MultiFilterOption } from '../../components/MultiFilterMenu'
import { DateNavButton } from '../../components/DateNavButton'
import { Icon } from '../../components/Icon'
import { Toast } from '../../components/Toast'
import {
  useDispensationBoard,
  useDispensationHistory,
  useDispensationRequest,
  useSalidaAmbulatoria,
  columnOf,
  startDispensationPreparation,
  markDispensationReady,
  deliverDispensation,
  activeDispensation,
} from '../../data/pharma'
import type { BoardColumn, DispensationRequestRow, HistorialFilaRow, HistorialTipo } from '../../data/pharma'
import { readyBlockedReason } from './dispensaciones/estados'
import { KanbanBoard } from './dispensaciones/KanbanBoard'
import { DispensacionDrawer } from './dispensaciones/DispensacionDrawer'
import { SalidaAmbulatoriaDrawer } from './dispensaciones/SalidaAmbulatoriaDrawer'
import { NuevaDispensacionDrawer } from './dispensaciones/NuevaDispensacionDrawer'
import { HistorialPorDias } from './dispensaciones/HistorialPorDias'
import { btnOutline } from '../../components/buttons'
import { useAuth } from '../../lib/auth'
import { todayISO } from '../../lib/dates'
import { codecs, oneOf, resolveCode, resolveShortId, shortId } from '../../lib/router'
import { useUrlLocation, useUrlPath, useUrlState } from '../../lib/useUrlState'
import { useAbrirFicha } from '../useAbrirFicha'
import type { ViewProps } from '../types'


/**
 * Tablero de dispensación de Pharma. Cuatro columnas por estado y un cajón lateral que resuelve
 * cada solicitud sin sacar a la farmacéutica del contexto — pensado para alto volumen diario.
 *
 * El filtro de fecha NO se aplica parejo (ver useDispensationBoard): las columnas activas muestran
 * todo lo pendiente sin importar el día, porque una solicitud de ayer sin atender tiene que seguir
 * a la vista. Solo Listas y Entregadas se acotan al día elegido.
 */
export function DispensacionesView({ module, submodule, setHeader, onNavigate }: ViewProps) {
  const { hasMinRole } = useAuth()
  const canOperate = hasMinRole('pharma', 'operator')

  /* `module.key` y no `'track'` fijo: acá puede valer `pharma`, y `pharma/protocolos` comparte la
     misma `ProtocolsView` — así una farmacéutica sin el módulo Coordinación llega igual a la ficha
     (ver el comentario de cabecera de `useAbrirFicha`). */
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver a Dispensaciones', hint: 'Volver al tablero de dispensaciones' }),
  })

  /* Cae a `undefined` cuando el embed vino en null (RLS o dato incompleto): con eso el `PatientLink`
     degrada solo a texto pelado, sin que cada pantalla tenga que chequearlo. */
  const abrirPacienteDe = (r: DispensationRequestRow) => {
    const pid = r.enrollment?.patient?.id
    return abrirFicha && pid ? () => abrirFicha(pid, r.protocol?.id) : undefined
  }

  /* Lo mismo para una fila del historial, que desde la 0117 ya no es un `DispensationRequestRow`.
     `destinatario_id` viene en null en las salidas ambulatorias —no hay ficha que abrir— así que
     la misma condición que cubre "el embed no cargó" cubre "esta persona no es paciente". */
  const abrirPacienteDeFila = (f: HistorialFilaRow) => {
    const pid = f.destinatario_id
    return abrirFicha && pid ? () => abrirFicha(pid, f.protocol_id ?? undefined) : undefined
  }

  const [day, setDay] = useUrlState('dia', todayISO())
  /* Protocolos elegidos por CÓDIGO; vacío = todos. Multi como en Stock y Visitas. `protoKey` es la
     versión estable para las deps: un array cambia de identidad en cada render y haría refetchear
     la consulta del historial (y reiniciar la paginación) sin que nadie toque el filtro. */
  const [protoSel, setProtoSel] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const protoKey = protoSel.join(',')
  const [query, setQuery] = useUrlState('buscar', '')
  const [vista, setVista] = useUrlState<'tablero' | 'historial'>('vista', 'tablero', {
    codec: oneOf(['tablero', 'historial'] as const),
  })
  const [pagina, setPagina] = useState(0)
  const [acumuladas, setAcumuladas] = useState<HistorialFilaRow[]>([])
  /** Última página ya volcada en `acumuladas`, para no aplicarla dos veces. */
  const aplicadaRef = useRef(-1)
  const [creando, setCreando] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const q = useDispensationBoard(day)
  const all = useMemo(() => q.data ?? [], [q.data])

  /* El cajón va en el PATH y no en el query porque la dispensación tiene código legible propio:
     /farmacia/dispensaciones/D-0417. Push, como toda entidad abierta: el atrás lo cierra.
     El código NO vive en la fila de la solicitud: es de la dispensación EJECUTADA, embebida en
     `dispensations[]` (0 o 1 por pedido) — se llega con `activeDispensation`, igual que en el resto
     de este archivo (ver la búsqueda y el toast de `advance`).
     Pero ese código se SELLA recién al marcar la dispensación lista (migración 0055:
     `D-{n}-{ddmmyy}-{iniciales}`, `NULL` hasta entonces) — una que quedó rechazada, cancelada o
     todavía en preparación nunca lo tiene, y tiene que poder enlazarse igual. Mismo criterio que el
     paciente sin IVRS (`protocolsNav.ts`, IVRS que también se asigna tarde, en randomización): sin
     código legible, el segmento es `shortId(id)` — acá SIN prefijo, a diferencia del `p-` de
     Pacientes, porque no hace falta desambiguar: el código real siempre arranca con `D-` y un hex
     corto de 8 nunca se confunde con eso. */
  const codigoDe = (r: DispensationRequestRow) => activeDispensation(r)?.dispensation_code ?? null
  const urlLocation = useUrlLocation()
  const codigoAbierto = urlLocation?.path[0] ?? null

  /* Prefijo de las salidas ambulatorias en la URL, igual que el `p-` de Pacientes. Hace falta
     porque una ambulatoria NUNCA tiene código legible (no emite comprobante), así que su segmento
     es siempre un identificador corto — y sin marca no habría cómo saber, mirando la URL, en cuál
     de las dos fuentes buscarlo. Las de protocolo siguen sin prefijo: su código real arranca con
     `D-` y un hex corto de 8 nunca se confunde con eso. */
  const AMBU_PREFIX = 'a-'
  const esSegmentoAmbulatorio = codigoAbierto?.toLowerCase().startsWith(AMBU_PREFIX) ?? false
  /* Dentro de la rama de protocolo se prueba primero `resolveCode` (el código legible, sin
     distinguir mayúsculas — decisión del Director, 2026-08-24, porque estas direcciones se dictan
     por teléfono) y recién si no hay match se cae a `resolveShortId` contra el `id`. Mismo orden
     que `protocolsNav.ts`, y por la misma razón: sostiene una URL vieja con el identificador corto
     cuando la dispensación se SELLA DESPUÉS de haberla compartido — el `id` no cambia, así que
     `shortId(id)` la sigue encontrando aunque ya tenga código. */
  /**
   * Qué señala la URL: el TIPO de fila y su id. El tipo importa porque de él depende con qué
   * consulta se trae el detalle — una salida ambulatoria no vive en `dispensation_requests`.
   *
   * Sale de las filas ya cargadas y no de una consulta propia, igual que antes: si el segmento no
   * matchea nada de lo cargado, `codigoNoResuelto` lo dice con serenidad en vez de afirmar que no
   * existe (el tablero se acota al día y el historial pagina, así que legítimamente no están todas).
   */
  const seleccion: { tipo: HistorialTipo; id: string } | null = (() => {
    if (!codigoAbierto) return null
    if (esSegmentoAmbulatorio) {
      const token = codigoAbierto.slice(AMBU_PREFIX.length)
      const f = resolveShortId(acumuladas.filter((r) => r.tipo === 'ambulatoria'), token)
      return f ? { tipo: 'ambulatoria', id: f.id } : null
    }
    /* Se prueba primero el código legible y recién después el identificador corto, en las dos
       fuentes cada vez: el historial pagina hacia atrás y muestra días anteriores al `day`
       elegido, que no están en `all`. */
    const protocolo = acumuladas.filter((r) => r.tipo === 'protocolo')
    const hit =
      resolveCode(all, codigoAbierto, codigoDe)?.id ??
      resolveCode(protocolo, codigoAbierto, (f) => f.codigo)?.id ??
      resolveShortId(all, codigoAbierto)?.id ??
      resolveShortId(protocolo, codigoAbierto)?.id ??
      null
    return hit ? { tipo: 'protocolo', id: hit } : null
  })()

  const [, setPath] = useUrlPath()
  /**
   * Escribe el segmento que corresponde a la fila que se abre.
   *
   * Sin código sellado (rechazada, cancelada o todavía en preparación) va el identificador corto —
   * ver el comentario de `codigoDe` más arriba. Las ambulatorias van SIEMPRE por el corto, con su
   * prefijo: no tienen código que sellar.
   *
   * Hay un caso más: abrir por id SIN fila en mano. Es el del alta, que abre el cajón de
   * preparación apenas se crea la solicitud — pero el `refetch` que la trae es asíncrono, así que
   * en ese momento la fila todavía no está en ninguna de las dos listas. Se escribe igual el corto:
   * una dispensación recién creada NUNCA tiene código sellado (se sella al marcar lista), así que
   * el corto es SIEMPRE el segmento correcto para ese caso, no una aproximación. Cuando llegue el
   * refetch, `resolveShortId` la encuentra contra ese mismo corto y el cajón abre solo.
   */
  const abrir = (tipo: HistorialTipo, id: string, codigo: string | null) => {
    const segmento = tipo === 'ambulatoria' ? `${AMBU_PREFIX}${shortId(id)}` : (codigo ?? shortId(id))
    /* Se conservan los cuatro filtros del tablero: abrir un cajón no puede resetearte el tablero que
       tenías detrás, ni dejarte ahí al cerrarlo.
       Y abrir apila (el atrás cierra el cajón) pero **cerrar reemplaza**: si cerrar también apilara,
       el atrás REABRIRÍA el cajón que acabás de cerrar, y en esta pantalla abrir y cerrar cajones es
       el trabajo. Es la misma lección que costó el review de la Fase D con el stepper de Visitas. */
    setPath([segmento], { conservar: ['dia', 'vista', 'protocolo', 'buscar'], mode: 'push' })
  }
  const cerrar = () => setPath([], { conservar: ['dia', 'vista', 'protocolo', 'buscar'], mode: 'replace' })
  /** Abrir una dispensación de protocolo cuya fila del tablero ya tenemos a mano. */
  const abrirPedido = (r: DispensationRequestRow) => abrir('protocolo', r.id, codigoDe(r))

  // El historial no FILTRA por fecha (sigue mostrando todos los días, como pide el handoff): la
  // fecha mueve el punto de partida de la lista, que arranca ahí y avanza hacia atrás.
  const h = useDispensationHistory({
    page: pagina,
    protocolCodes: protoSel,
    patientCode: query,
    enabled: vista === 'historial',
    fromDay: day,
  })

  // Las páginas se acumulan; cambiar de filtro reinicia la pila (si no, "Cargar más" mezclaría
  // resultados de dos búsquedas distintas).
  // `day` entra acá porque en el historial mueve el punto de partida: sin reiniciar, "Cargar más"
  // seguiría paginando desde la fecha anterior.
  useEffect(() => {
    setPagina(0)
    setAcumuladas([])
    aplicadaRef.current = -1
  }, [protoKey, query, vista, day])

  /**
   * Vuelve a traer el historial desde la primera página, para mostrar algo que acaba de pasar.
   *
   * Los tres pasos son necesarios y ninguno alcanza solo: `setPagina(0)` no dispara nada si ya
   * estaba en 0 (las deps no cambian), `aplicadaRef` tiene que soltar la página 0 o el efecto de
   * acumulación la descarta por ya aplicada, y el `refetch` es el que efectivamente vuelve a
   * consultar cuando la página no se movió.
   */
  const recargarHistorial = () => {
    setPagina(0)
    setAcumuladas([])
    aplicadaRef.current = -1
    h.refetch()
  }

  /**
   * Acumulación de páginas, con dos guardas que no son paranoia:
   *
   * 1 · `d.page !== pagina` — al apretar "Cargar más", `pagina` sube antes de que llegue la
   *     respuesta, así que el efecto corre una vez con los datos de la página ANTERIOR todavía en
   *     mano. Sin esta guarda se concatenaban de nuevo y 4 registros se veían como 6.
   * 2 · `aplicadaRef` — evita re-aplicar la misma página si el efecto vuelve a correr por otra
   *     razón (un refetch, por ejemplo).
   */
  useEffect(() => {
    const d = h.data
    if (!d || d.page !== pagina || aplicadaRef.current === d.page) return
    aplicadaRef.current = d.page
    setAcumuladas((prev) => (d.page === 0 ? d.rows : [...prev, ...d.rows]))
  }, [h.data, pagina])

  /**
   * Protocolos presentes hoy. Sale de los datos, no de una lista fija: si no hay nada de un
   * protocolo, no tiene sentido ofrecerlo como filtro.
   *
   * Sin contadores: el número contaba SOLICITUDES, pero al lado del rótulo se leía como cantidad
   * de protocolos. Un dato que hay que interpretar dos veces no ayuda, y el tablero ya lleva el
   * contador real en la cabecera de cada columna.
   *
   * Ya no lleva la opción "Todos los protocolos": en un multi-select, ninguno elegido ES todos, y
   * la cantidad elegida la canta el badge del disparador.
   */
  const protoOptions: MultiFilterOption[] = useMemo(() => {
    const codes = new Set<string>()
    for (const r of all) {
      const code = r.protocol?.code
      if (code) codes.add(code)
    }
    return [...codes].sort((a, b) => a.localeCompare(b)).map((code) => ({ value: code, label: code }))
  }, [all])

  // Búsqueda + protocolo, agrupado por columna.
  const byColumn = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const map = new Map<BoardColumn, DispensationRequestRow[]>()
    for (const r of all) {
      const col = columnOf(r)
      if (!col) continue
      if (protoSel.length > 0 && !protoSel.includes(r.protocol?.code ?? '')) continue
      if (needle) {
        const hay = [
          activeDispensation(r)?.dispensation_code ?? '',
          r.enrollment?.patient?.code ?? '',
          r.protocol?.code ?? '',
          ...r.items.map((i) => i.medication?.name ?? ''),
        ].join(' ').toLowerCase()
        if (!hay.includes(needle)) continue
      }
      const list = map.get(col)
      if (list) list.push(r)
      else map.set(col, [r])
    }
    return map
  }, [all, protoSel, query])

  const visibles = useMemo(() => [...byColumn.values()].reduce((n, l) => n + l.length, 0), [byColumn])

  /**
   * El DETALLE de lo que la URL señala, que desde la 0117 ya no siempre está en mano.
   *
   * Antes el cajón se alimentaba de la fila del historial, que traía el pedido entero. Ahora el
   * historial devuelve filas de PRESENTACIÓN —lo justo para dibujar el renglón— así que el detalle
   * se trae por id, con la consulta que corresponda a cada tipo.
   *
   * Se pregunta primero por el TABLERO: si la fila ya está cargada ahí (el caso normal, que es
   * trabajar sobre lo del día), no se gasta una consulta. Recién si no está —una rechazada, una
   * cancelada, o cualquier cosa de un día anterior que sólo vive en el historial— se pide por id.
   *
   * Los dos hooks se llaman SIEMPRE, con null cuando no aplican: un hook condicional es justo lo
   * que React no permite, y el `null` ya está contemplado en los dos (devuelven data null sin
   * consultar).
   */
  const delTablero = seleccion?.tipo === 'protocolo'
    ? all.find((r) => r.id === seleccion.id) ?? null
    : null
  const pedido = useDispensationRequest(
    seleccion?.tipo === 'protocolo' && !delTablero ? seleccion.id : null,
  )
  const salida = useSalidaAmbulatoria(seleccion?.tipo === 'ambulatoria' ? seleccion.id : null)
  const open = delTablero ?? pedido.data ?? null

  /**
   * Aviso sereno cuando la URL trae un código que no matchea ninguna fila cargada. NO es "no existe":
   * el tablero legítimamente no contiene TODAS las dispensaciones (las columnas activas se acotan al
   * día y el historial pagina), así que afirmar eso sería mentir. Se avisa lo que sabemos —no está
   * entre lo cargado— y se sugiere dónde mirar.
   *
   * No es un caso de laboratorio: un link a una dispensación entregada, compartido hoy y abierto
   * mañana —con `dia` en su default, que por eso no viaja en la URL—, cae justo acá: el tablero de
   * mañana no la trae (acotado al día) y el historial ni siquiera se consultó (arranca en `tablero`).
   *
   * Tres condiciones, ni una menos ni una más: hay segmento en la URL, las DOS consultas (tablero e
   * historial) ya terminaron de cargar, y el segmento no resolvió contra ninguna fila.
   *
   * Se mira `seleccion` y NO el detalle: si el segmento resolvió, el cajón ya está abierto y es él
   * quien cuenta si su consulta todavía viaja o vino vacía. Mirar el detalle acá haría parpadear
   * este aviso durante cada carga, diciendo "no la encontramos" sobre algo que sí se encontró.
   */
  const codigoNoResuelto = codigoAbierto !== null && !q.loading && !h.loading && !seleccion

  /**
   * La acción primaria va en la fila del título (donde el shell la alinea con el H1); los tres
   * controles de la vista viven juntos en la toolbar de abajo. Antes el toggle colgaba en una
   * columna pegada al botón: quedaba fuera de la línea de los filtros y con otra altura.
   */
  useEffect(() => {
    // Un viewer no debería ver un botón que no puede usar.
    setHeader?.(
      canOperate
        ? { actions: [{ key: 'nueva', label: 'Nueva dispensación', icon: 'plus', onClick: () => setCreando(true), primary: true }] }
        : null,
    )
    return () => setHeader?.(null)
  }, [setHeader, canOperate])

  /** Avance de estado desde el CTA de la card, sin abrir el cajón. */
  const advance = async (r: DispensationRequestRow, column: BoardColumn) => {
    setBusyId(r.id)
    setErr(null)
    if (column === 'solicitada') {
      const res = await startDispensationPreparation(r.id)
      setBusyId(null)
      if (res.error) { setErr(res.error); return }
      q.refetch()
      abrirPedido(r)            // preparar = abrir el cajón y ponerse a escanear
      return
    }
    if (column === 'preparando') {
      // Si falta algo, el CTA dice "Continuar": abre el cajón en vez de intentar avanzar.
      //
      // Pregunta `readyBlockedReason` y NO cuenta escaneos pendientes a mano, que era lo que hacía
      // antes: desde que existe el IP, lo que falta puede ser la CONSTANCIA y no un escaneo, y un
      // pedido de IP solo no tiene ningún renglón — con la cuenta a mano daba cero pendientes, el
      // tablero intentaba marcarlo lista y el servidor lo rechazaba con un error crudo, salteando
      // el bloqueo que el cajón sí aplica. Una sola regla, en `estados.ts`, para las dos pantallas.
      if (readyBlockedReason(r)) { setBusyId(null); abrirPedido(r); return }
      const res = await markDispensationReady(r.id)
      setBusyId(null)
      if (res.error) { setErr(res.error); return }
      q.refetch()
      setToast(`${res.dispensationCode ?? 'Dispensación'} lista · comprobante N° ${res.correlative} generado`)
      return
    }
    if (column === 'lista') {
      const disp = activeDispensation(r)
      if (!disp) { setBusyId(null); return }
      // Con IP la entrega NO se resuelve de un clic desde el tablero: hay que declarar cuántos kits
      // salieron, y ese número descuenta stock y no se corrige nunca más. Entregar desde acá salteaba
      // el campo y el pop-up enteros —los dos viven en el cajón— y mandaba la entrega sin kits. Se
      // abre el cajón, que es donde se declara.
      if (r.includes_ip) { setBusyId(null); abrirPedido(r); return }
      const res = await deliverDispensation(disp.id)
      setBusyId(null)
      if (res.error) { setErr(res.error); return }
      q.refetch()
      setToast(`${disp.dispensation_code ?? 'Dispensación'} entregada`)
    }
  }

  return (
    // El shell da `padding: 16px 26px 0` al contenido, o sea aire a los lados pero nada abajo: el
    // tablero llegaba pegado al borde inferior. Los mismos 26px abajo cierran la caja y dejan
    // respirar el papel, igual que a los costados.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14, paddingBottom: 26, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
        <div style={searchWrap}>
          <Icon name="search" size={17} color="var(--spira-faint)" />
          <input
            className="spira-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            /* El alcance de la búsqueda cambia con la vista y el placeholder lo dice: en el tablero
               son pocas filas ya cargadas y se puede filtrar por todo; en el historial la consulta
               va a Postgres por código de paciente, y prometer más sería mentir sobre por qué algo
               "no aparece". */
            placeholder={vista === 'historial' ? 'Buscar por código de paciente…' : 'Buscar dispensación…'}
            aria-label={
              vista === 'historial'
                ? 'Buscar en el historial por código de paciente'
                : 'Buscar por código, paciente, protocolo o medicamento'
            }
            style={searchInput}
          />
        </div>

        <MultiFilterMenu
          accent={module.accentSolid}
          label="Protocolo"
          icon="file"
          options={protoOptions}
          selected={protoSel}
          onChange={setProtoSel}
          searchPlaceholder="Buscar protocolo…"
        />
        {/* La fecha vive en las DOS vistas. En el tablero elige el día que se muestra; en el
            historial mueve el punto de partida de la lista (ver useDispensationHistory). */}
        <DateNavButton accent={module.accentSolid} date={day} onChange={setDay} />
        <button
          type="button"
          onClick={() => setVista((v) => (v === 'tablero' ? 'historial' : 'tablero'))}
          style={{
            ...btnOutline,
            // 38 y no los 40 de btnOutline: FilterDropdown y DateNavButton miden 38, y dos píxeles
            // de diferencia bastan para que la fila se vea desalineada. Mismo padding y radio que
            // ellos, por lo mismo.
            height: 38,
            padding: '0 13px',
            display: 'flex', alignItems: 'center', gap: 8,
            ...(vista === 'historial'
              ? { background: 'var(--spira-ink)', color: 'var(--spira-paper)', borderColor: 'var(--spira-ink)' }
              : null),
          }}
        >
          <Icon name={vista === 'historial' ? 'dashboard' : 'list'} size={16} color="currentColor" />
          {vista === 'historial' ? 'Ver tablero' : 'Historial'}
        </button>
      </div>

      {err && (
        <div style={errBox} role="alert">
          <Icon name="alertCircle" size={15} />
          <span>{err}</span>
        </div>
      )}

      {codigoNoResuelto && (
        <div style={avisoBox} role="status">
          <Icon name="info" size={15} />
          <span>No encontramos esa dispensación entre las de esta fecha. Probá el historial, o movete al día en que se entregó.</span>
        </div>
      )}

      {vista === 'historial' ? (
        h.loading && acumuladas.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '10px 2px' }}>Cargando historial…</div>
        ) : h.error ? (
          <div style={errBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>{h.error}</span>
          </div>
        ) : acumuladas.length === 0 ? (
          <EmptyState
            accent={module.accent}
            icon="list"
            title={query.trim() || protoSel.length > 0 ? 'Sin resultados' : 'Sin dispensaciones hasta esa fecha'}
            description={
              query.trim() || protoSel.length > 0
                ? 'Probá con otro código de paciente, quitá el filtro de protocolo o movete a una fecha más reciente.'
                : 'El historial arranca en la fecha elegida y va hacia atrás. Movete a una fecha más reciente para ver actividad.'
            }
          />
        ) : (
          <HistorialPorDias
            rows={acumuladas}
            hasMore={h.data?.hasMore ?? false}
            loading={h.loading}
            onOpen={(f) => abrir(f.tipo, f.id, f.codigo)}
            onOpenPatient={abrirPacienteDeFila}
            onMore={() => setPagina((p) => p + 1)}
          />
        )
      ) : q.loading && all.length === 0 ? (
        /* Carga inicial (solo cuando NO hay filas: useSupabaseQuery mantiene las viejas en un
           refetch). Antes acá iba un esqueleto de cards vacías, y en una app clínica leía como
           "el tablero se rompió" en vez de "esperá": tarjetas sin texto, sin movimiento, en el
           mismo lugar donde después hay dispensaciones reales. Se dice con palabras, igual que
           el resto de la app (DESIGN.md: EmptyState cubre vacío / cargando / sin acceso). */
        <EmptyState
          accent={module.accent}
          icon="box"
          title="Cargando el tablero…"
          description="Un momento."
        />
      ) : q.error ? (
        <div style={errBox} role="alert">
          <Icon name="alertCircle" size={15} />
          <span>No pudimos cargar el tablero de dispensación.</span>
        </div>
      ) : visibles === 0 ? (
        <EmptyState
          accent={module.accent}
          icon="box"
          title={query.trim() || protoSel.length > 0 ? 'Sin resultados' : 'Sin dispensaciones'}
          description={
            query.trim() || protoSel.length > 0
              ? 'Probá con otro término o quitá el filtro de protocolo.'
              : 'Cuando Coordinación solicite una dispensación desde una visita, aparece acá.'
          }
        />
      ) : (
        <KanbanBoard
          rows={byColumn}
          busyId={busyId}
          canOperate={canOperate}
          onOpen={abrirPedido}
          onOpenPatient={abrirPacienteDe}
          onAdvance={advance}
        />
      )}

      {open && (
        <DispensacionDrawer
          r={open}
          onClose={cerrar}
          onChanged={() => { q.refetch(); pedido.refetch() }}
          onToast={setToast}
          onOpenPatient={abrirPacienteDe(open)}
        />
      )}

      {/* El cajón de una salida ambulatoria: sólo lectura, porque la tabla es inmutable (0116).
          Se monta con la SELECCIÓN y no con el dato, para poder contar la carga y el error de su
          propia consulta — si esperara a tener la fila, un link a una salida vieja no mostraría
          nada mientras viaja y se leería como un clic que no hizo nada. */}
      {seleccion?.tipo === 'ambulatoria' && (
        <SalidaAmbulatoriaDrawer
          salida={salida.data ?? null}
          cargando={salida.loading}
          error={salida.error}
          onClose={cerrar}
        />
      )}

      {creando && (
        <NuevaDispensacionDrawer
          onClose={() => setCreando(false)}
          onCreated={(id) => {
            // Nace y se toma en el mismo gesto: se cierra el alta y se abre su cajón de
            // preparación, que es donde la farmacéutica ya está por ponerse a escanear.
            setCreando(false)
            q.refetch()
            void startDispensationPreparation(id).then(() => { q.refetch(); abrir('protocolo', id, null) })
            setToast('Dispensación creada · escaneá para prepararla')
          }}
          onEntregado={(mensaje) => {
            /* La ambulatoria NO abre ningún cajón después: nace y termina entregada, así que no
               hay nada que preparar ni que escanear. Lo que sí hace falta es que se VEA — si no,
               el registro parece no haber pasado, y un registro que no se puede mirar es el que
               se deja de cargar. Como no entra en el tablero (no tiene estado), se recarga el
               historial, que es donde va a aparecer. */
            setCreando(false)
            recargarHistorial()
            setToast(mensaje)
          }}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/* El `marginRight: auto` empuja los filtros al margen derecho, como en el mock. Reemplaza a un
   `<div style={{ flex: 1 }} />` que hacía lo mismo siendo un ítem más de la fila: con `gap: 12`,
   ese separador vacío se cobraba 24px de ancho que esta fila —que NO tiene `flex-wrap`, o sea que
   desborda en vez de partirse— no puede regalar. Es además el mismo mecanismo que usan Recepción y
   Stock, así que las tres toolbars de Farmacia dicen lo mismo de la misma forma: el buscador a la
   izquierda, los filtros a la derecha, y el hueco del medio separando los dos oficios. */
const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: 300, height: 42, marginRight: 'auto',
  padding: '0 15px', borderRadius: 999, background: 'var(--spira-white)',
  border: '1px solid var(--spira-line-2)',
}

const searchInput: CSSProperties = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent',
  fontFamily: 'var(--spira-font-text)', fontSize: 13.5, color: 'var(--spira-ink)', minWidth: 0,
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', fontSize: 13,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 10, padding: '10px 13px',
}

// Misma forma que errBox (icono + texto en una caja con borde), pero en el tono calmo de aviso —
// no de error — que ya usa el resto de la app para "esto no es lo que esperabas, pero no rompió nada".
const avisoBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', fontSize: 13,
  color: 'var(--spira-acc-deep-warn)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line-2)', borderRadius: 10, padding: '10px 13px',
}
