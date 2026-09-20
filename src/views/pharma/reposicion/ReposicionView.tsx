import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { useAuth } from '../../../lib/auth'
import { todayISO } from '../../../lib/dates'
import { useUrlPath, useUrlState } from '../../../lib/useUrlState'
import {
  armarReposicionDelPeriodo, franjaDelCorte, periodoAMirar, tarjetaDe, useDiaCorte, useReposicionDelPeriodo,
} from '../../../data/pharma'
import { NotFoundView } from '../../../shell/NotFoundView'
import type { ViewProps } from '../../types'
import { DiaDeCorte } from './DiaDeCorte'
import { PantallaEstudio } from './PantallaEstudio'
import { TarjetaDeEstudio } from './TarjetaDeEstudio'
import { EstadoCaja, useAngosto } from './piezas'

/**
 * ┌─ Farmacia › Reposición (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md) ────────┐
 *
 *   /farmacia/reposicion                            la grilla, siempre del período en curso (R2)
 *   /farmacia/reposicion/222714                     el estudio, en el período en curso
 *   /farmacia/reposicion/222714?periodo=2026-08-10  el estudio en el período que contiene esa fecha (R6)
 *
 * Una sola lectura alimenta la grilla y el estudio: entrar a un estudio del período en curso no vuelve a
 * pedir nada. La cuenta la hace el modelo (con tests); acá se elige qué mostrar según la URL.
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function ReposicionView({ module, setHeader }: ViewProps) {
  const { hasMinRole } = useAuth()
  const puedeEditar = hasMinRole('pharma', 'operator')
  const angosto = useAngosto()
  const hoy = todayISO()
  const corte = useDiaCorte()
  const diaCorte = corte.data?.diaCorte ?? null

  const [path, setPath] = useUrlPath()
  const codigo = path.length === 1 ? path[0] : null
  /* Las flechas son navegación: con `push`, el atrás del navegador vuelve al período anterior. */
  const [fecha, setFecha] = useUrlState('periodo', '', { mode: 'push' })
  const periodo = useMemo(
    () => (diaCorte == null ? null : periodoAMirar(hoy, diaCorte, codigo ? fecha : '')),
    [hoy, diaCorte, codigo, fecha],
  )
  const q = useReposicionDelPeriodo(periodo)
  /* Sólo los datos DEL período que se mira. Mientras llega uno nuevo, el hook deja visibles los del
     anterior, y rotularlos con el período nuevo sería mostrar un libro que no es. */
  const insumos = q.data && periodo && q.data.desde === periodo.desde && q.data.hasta === periodo.hasta ? q.data.insumos : null
  const rep = useMemo(
    () => (insumos && periodo && diaCorte != null ? armarReposicionDelPeriodo(insumos, hoy, periodo, diaCorte) : null),
    [insumos, hoy, periodo, diaCorte],
  )
  const [editarCorte, setEditarCorte] = useState(false)

  // Memoizadas: viajan en las deps del efecto del encabezado.
  const irAGrilla = useCallback(() => setPath([], { mode: 'push' }), [setPath])
  const abrirCorte = useCallback(() => setEditarCorte(true), [])

  useEffect(() => {
    if (!setHeader) return
    if (codigo) setHeader({ rootOnClick: irAGrilla, crumbs: [{ label: codigo, mono: true }] })
    else if (puedeEditar && corte.data) {
      setHeader({ actions: [{ key: 'corte', label: diaCorte == null ? 'Cargar el día de corte' : `Día de corte: ${diaCorte}`, icon: 'calendar', onClick: abrirCorte }] })
    } else setHeader(null)
    return () => setHeader(null)
  }, [setHeader, codigo, puedeEditar, corte.data, diaCorte, irAGrilla, abrirCorte])

  const modalCorte = editarCorte && (
    <DiaDeCorte
      actual={diaCorte} hoy={hoy} accentSolid={module.accentSolid}
      onClose={() => setEditarCorte(false)}
      onGuardado={() => { setEditarCorte(false); corte.refetch() }}
    />
  )
  const reintentar = (fn: () => void) => (
    <button type="button" style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={fn}>
      <Icon name="rotateCcw" size={15} /> Reintentar
    </button>
  )
  const calculando = <EstadoCaja icono="cart" titulo="Calculando la reposición…" texto="Un momento." />

  if (path.length > 1) return <NotFoundView motivo="ruta" />
  if (corte.error) return <EstadoCaja icono="alert" peligro titulo="No se pudo calcular la reposición" texto={corte.error} accion={reintentar(corte.refetch)} />
  if (!corte.data) return calculando
  if (diaCorte == null) {
    return (
      <div style={{ maxWidth: 760 }}>
        <EstadoCaja
          icono="calendar" titulo="Falta el día de corte"
          texto={puedeEditar
            ? 'Es el día del mes en que cierra cada período y se arma el pedido. Se carga una vez para toda Farmacia.'
            : 'Farmacia todavía no lo cargó. Hasta entonces no se puede calcular la reposición.'}
          accion={puedeEditar ? <button type="button" style={btnPrimary(module.accentSolid)} onClick={abrirCorte}>Cargar el día de corte</button> : undefined}
        />
        {modalCorte}
      </div>
    )
  }
  if (q.error) return <EstadoCaja icono="alert" peligro titulo="No se pudo calcular la reposición" texto={q.error} accion={reintentar(q.refetch)} />
  if (!rep) return calculando

  if (codigo) {
    const e = rep.estudios.find((x) => x.estudio.code === codigo)
    // Un código que no está (cerrado, mal escrito): pantalla serena dentro del marco, no la grilla muda.
    if (!e) return <NotFoundView motivo="ruta" />
    return (
      <PantallaEstudio
        rep={rep} e={e} diaCorte={diaCorte} puedeEditar={puedeEditar} angosto={angosto}
        accent={module.accent} accentSolid={module.accentSolid}
        onVolver={irAGrilla} onPeriodo={setFecha} onCambio={q.refetch}
      />
    )
  }

  const franja = franjaDelCorte(rep)
  return (
    <div>
      {franja && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <Icon name="calendar" size={16} color={franja.aviso ? 'var(--spira-acc-deep-warn)' : module.accentSolid} />
          <span style={{ fontSize: 14, fontWeight: 600, color: franja.aviso ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink)' }}>{franja.texto}</span>
          <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>{franja.sub}</span>
        </div>
      )}
      {rep.estudios.length === 0 ? (
        <EstadoCaja icono="cart" titulo="No hay estudios abiertos" texto="Cuando un estudio tenga medicación asignada, aparece acá." />
      ) : (
        /* Misma grilla que Pacientes: 4 columnas en la notebook de referencia, 2 en una ventana angosta (RD14). */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {rep.estudios.map((e) => (
            <TarjetaDeEstudio key={e.estudio.id} e={e} t={tarjetaDe(e, rep)} accent={module.accent} onAbrir={() => setPath([e.estudio.code], { mode: 'push' })} />
          ))}
        </div>
      )}
      {modalCorte}
    </div>
  )
}
