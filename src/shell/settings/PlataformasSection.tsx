import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { fieldInput, fieldLabelStyle } from '../../components/FormField'
import { useAuth } from '../../lib/auth'
import { usePlatforms } from '../../lib/platforms'
import { meetsMinRole, MODULO_ADMIN } from '../../lib/roles'
import { claveDePlataforma } from '../../views/track/procedimientos/reportes'
import { crearPlataforma, editarPlataforma } from '../../data/platforms'
import type { PlatformRow } from '../../data/platforms'
import { StCard, StPill, StToggle, btnGhost, btnIcono, btnSolid, dialogCard, dialogScrim, dialogTitulo } from './primitives'
import { useMarkDirty } from './SettingsModal'

/* ============================================================================
   Ajustes › Plataformas — los portales donde aparecen los reportes.

   El mecanismo que usa estas URLs existe y está testeado desde la 0089: al elegir la plataforma de
   un reporte, el link se autocompleta; si lo editás a mano, deja de pisarse. Lo único que faltaba
   era el DATO — las direcciones estaban todas en `null` porque varían por estudio y por sponsor, y
   un link inventado en un sistema donde un click manda a la coordinadora a cargar un resultado es
   peor que ninguno. Esta pantalla es donde se cargan, sin depender de un dev.

   DOS CARAS, decididas por la RLS de la 0111 y no por esta pantalla:
     · track-leader o gerencia → editable.
     · el resto → sólo lectura. Y se MUESTRA igual, no se esconde: saber a qué portal ir a buscar
       un reporte le sirve a cualquier coordinadora, aunque no pueda cambiarlo.

   Guardado por FILA y no con un botón global (a diferencia de Equipo y accesos): son cinco cosas
   independientes entre sí, y juntarlas en un solo "Guardar" obligaría a un compare-and-swap que
   acá no compra nada — dos personas cargando la URL de dos portales distintos no se pisan.
   ============================================================================ */

export function PlataformasSection() {
  const { roles } = useAuth()
  const { filas, cargando, error, refrescar } = usePlatforms()

  /* Espejo de la policy "editar plataformas" (0111 §4). Se duplica a propósito, como el resto de
     `lib/roles.ts`: el servidor la hace cumplir, el cliente la explica. Sin la copia, la única
     forma de saber que no se puede sería intentarlo y comerse un error. */
  const puedeEditar = roles[MODULO_ADMIN] != null || meetsMinRole(roles.track, 'leader')

  const [editando, setEditando] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const ordenadas = useMemo(
    () => [...filas].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'es')),
    [filas],
  )

  if (cargando && filas.length === 0) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando las plataformas…</div>
  }

  if (error) {
    return (
      <div role="alert" style={alerta}>
        <Icon name="alert" size={15} color="var(--spira-danger)" />
        {error}
      </div>
    )
  }

  /* `maxWidth: 720`, el mismo tope que Mi cuenta y Preferencias. Sin él la card se estiraba al ancho
     del modal y el botón «Editar» quedaba a medio metro del nombre al que edita.

     «Agregar plataforma» va en la cabecera de la card y no suelto debajo, que es donde lo pone
     «Crear cuenta» en Equipo y accesos. Abajo quedaba después de la lista: con cinco plataformas
     ya caía fuera del alto del modal, y la única forma de dar de alta era scrollear hasta
     encontrarlo. En la cabecera está siempre a la vista y junto a la lista que modifica. */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <StCard
        title="Plataformas de reportes"
        desc={puedeEditar
          ? 'Al elegir una en un reporte, su link se completa solo'
          : 'Dónde se descarga cada reporte. Sólo lectura: te lo puede cambiar Coordinación o gerencia'}
        pad={false}
        action={puedeEditar ? (
          <button type="button" style={btnGhost} onClick={() => setCreando(true)}>
            <Icon name="plus" size={15} color="var(--spira-muted)" /> Agregar plataforma
          </button>
        ) : undefined}
      >
        {ordenadas.map((p, i) => (
          <FilaPlataforma
            key={p.key}
            fila={p}
            last={i === ordenadas.length - 1}
            puedeEditar={puedeEditar}
            onEditar={() => setEditando(p.key)}
          />
        ))}
      </StCard>

      {editando && (
        <EditarDialog
          fila={ordenadas.find((p) => p.key === editando)!}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); void refrescar() }}
        />
      )}
      {creando && (
        <CrearDialog
          clavesUsadas={filas.map((p) => p.key)}
          onCerrar={() => setCreando(false)}
          onGuardado={() => { setCreando(false); void refrescar() }}
        />
      )}
    </div>
  )
}

/* ─── Una fila del catálogo ───
   NO usa `StRow`, y es a propósito. `StRow` está pensada para una card CON padding (`padding: 13px 0`,
   el margen lateral lo pone la card), y ésta es una lista de borde a borde (`pad={false}`) para que
   los separadores crucen la card entera. Juntas, las filas quedaban sin margen: el nombre pegado al
   borde izquierdo y «Editar» tocando el derecho. La fila trae su propio `13px 18px`, que es el de
   `FilaDePersona` en Equipo y accesos — la otra lista de borde a borde de Ajustes. */

function FilaPlataforma({ fila, last, puedeEditar, onEditar }: {
  fila: PlatformRow
  last: boolean
  puedeEditar: boolean
  onEditar: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: last ? 'none' : '1px solid var(--spira-line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* El punto va PEGADO AL NOMBRE y no del lado de las acciones. Es el color con el que la
            plataforma aparece en los reportes —identidad—, pero a la derecha, al lado de «Sin cargar»,
            se leía como un semáforo: Roche en rojo y LabCorp en verde parecían estar mal y bien, cuando
            las dos estaban igual de vacías. Y como el ícono del link aparece sólo en algunas filas, los
            puntos además quedaban desalineados entre sí.
            `height: 23` es el alto de la píldora. Sin fijarlo, el renglón medía 17 sin píldora y 23 con
            ella, y las filas retiradas quedaban 6px más altas que sus vecinas: la lista se veía
            despareja justo donde hay un estado que marcar. Con el alto fijo todas las filas miden lo
            mismo, y el subtítulo pierde su `marginTop` porque el aire ya lo pone el renglón. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, height: 23 }}>
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: fila.color, flex: '0 0 auto' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--spira-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fila.label}
          </span>
          {/* Antes "Retirada" vivía en la segunda línea y SÓLO si no había link: una plataforma
              retirada con su dirección cargada se veía idéntica a una activa. Es un estado, así que
              va como píldora al lado del nombre, se tenga link o no. */}
          {!fila.is_active && <StPill>Retirada</StPill>}
        </div>
        {/* El estado de la URL es LA información de esta pantalla, así que va en la segunda línea y
            no escondido en el diálogo. "Sin cargar" se dice con todas las letras: un renglón vacío se
            leería como un problema de la pantalla y no como una tarea pendiente.
            Una URL real de portal trae un `goto=` de trescientos caracteres: sin recorte partía la
            línea en el `?` y lo que seguía se salía de la card. Va en un renglón con puntos
            suspensivos y la dirección completa en el `title`. La sangría alinea el texto con el
            nombre, no con el punto. */}
        <div
          title={fila.url ?? undefined}
          style={{ fontSize: 12.5, color: 'var(--spira-muted)', paddingLeft: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {fila.url ?? 'Sin cargar: el link no se autocompleta'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        {fila.url && (
          /* Se abre en pestaña nueva: Ajustes es un modal con cambios sin guardar posibles, y
             navegar en la misma pestaña los tiraría. `noopener` porque es un destino externo que
             carga el usuario — sin él, el portal recibe una referencia a esta ventana.
             Cuadrado de 34 con el mismo contorno que «Editar» (`btnIcono`): suelto, el ícono se leía
             como adorno del renglón y no como un segundo botón. */
          <a
            href={fila.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnIcono, textDecoration: 'none' }}
            aria-label={`Abrir ${fila.label} en una pestaña nueva`}
            title="Abrir el portal en una pestaña nueva"
          >
            <Icon name="externalLink" size={15} color="var(--spira-muted)" />
          </a>
        )}
        {puedeEditar && (
          <button type="button" style={btnGhost} onClick={onEditar} aria-label={`Editar ${fila.label}`}>Editar</button>
        )}
      </div>
    </div>
  )
}

/* ─── Editar una plataforma ─── */

function EditarDialog({ fila, onCerrar, onGuardado }: {
  fila: PlatformRow
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [label, setLabel] = useState(fila.label)
  const [url, setUrl] = useState(fila.url ?? '')
  const [activa, setActiva] = useState(fila.is_active)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sucio = label !== fila.label || url !== (fila.url ?? '') || activa !== fila.is_active
  useMarkDirty(sucio)

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    const { error: err } = await editarPlataforma({ key: fila.key, label, url, isActive: activa })
    setGuardando(false)
    if (err) { setError(err); return }
    onGuardado()
  }

  return (
    <div style={dialogScrim} role="presentation" onMouseDown={onCerrar}>
      <div style={dialogCard} role="dialog" aria-modal="true" aria-label={`Editar ${fila.label}`} onMouseDown={(e) => e.stopPropagation()}>
        <div style={dialogTitulo}>{fila.label}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <div>
            <label htmlFor="plat-label" style={lbl}>Nombre</label>
            <input id="plat-label" value={label} onChange={(e) => setLabel(e.target.value)} style={input} />
          </div>
          <div>
            <label htmlFor="plat-url" style={lbl}>Dirección del portal</label>
            <input
              id="plat-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              style={input}
            />
            <div style={nota}>
              Al elegir <strong style={{ fontWeight: 600 }}>{fila.label}</strong> en un reporte, este link se
              completa solo. Si alguien lo editó a mano en un reporte, ahí no se pisa.
            </div>
          </div>
          {/* 'otro' no se retira: es el valor por defecto de la columna en la base y el respaldo al
              que cae cualquier clave desconocida. Sin él, un reporte con plataforma rara quedaría
              sin nombre. */}
          {fila.key !== 'otro' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13.5, color: 'var(--spira-ink)' }}>Se puede elegir</div>
                <div style={nota}>
                  Apagado, deja de ofrecerse en los reportes nuevos. Los que ya la usan la siguen mostrando.
                </div>
              </div>
              <StToggle on={activa} onClick={() => setActiva((v) => !v)} label={`${fila.label} se puede elegir`} />
            </div>
          )}
          {error && <div role="alert" style={errorTexto}>{error}</div>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" style={btnSolid()} onClick={() => void guardar()} disabled={guardando || !sucio}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Agregar una plataforma ─── */

function CrearDialog({ clavesUsadas, onCerrar, onGuardado }: {
  clavesUsadas: string[]
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useMarkDirty(label.trim() !== '' || url.trim() !== '')

  const crear = async () => {
    const nombre = label.trim()
    if (nombre === '') return
    setGuardando(true)
    setError(null)
    // La clave la deriva el sistema: es la PK y queda escrita en cada reporte que la use, así que
    // no es algo que tenga sentido pedirle a nadie.
    const { error: err } = await crearPlataforma(claveDePlataforma(nombre, clavesUsadas), nombre, url)
    setGuardando(false)
    if (err) { setError(err); return }
    onGuardado()
  }

  return (
    <div style={dialogScrim} role="presentation" onMouseDown={onCerrar}>
      <div style={dialogCard} role="dialog" aria-modal="true" aria-label="Agregar plataforma" onMouseDown={(e) => e.stopPropagation()}>
        <div style={dialogTitulo}>Agregar plataforma</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <div>
            <label htmlFor="nueva-label" style={lbl}>Nombre</label>
            <input id="nueva-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Medidata" autoFocus style={input} />
          </div>
          <div>
            <label htmlFor="nueva-url" style={lbl}>Dirección del portal <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}>(podés cargarla después)</span></label>
            <input id="nueva-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" style={input} />
          </div>
          {error && <div role="alert" style={errorTexto}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" style={btnSolid()} onClick={() => void crear()} disabled={guardando || label.trim() === ''}>
            {guardando ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* —— estilos ——
   Los campos son los de la casa (`fieldInput` y `fieldLabelStyle`, los mismos de «Crear una cuenta»
   en Equipo y accesos). Acá había una copia local —alto 40, fondo `surface`, borde `line`, label en
   tinta— que hacía que los dos diálogos de Ajustes con formulario se vieran de dos familias
   distintas. Y llevaba `outline: 'none'` inline, que no hacía nada: el foco de los inputs ya es la
   elevación global de `tokens.css`. */
const lbl: CSSProperties = { ...fieldLabelStyle, display: 'block', marginBottom: 6 }
const input = fieldInput
const nota: CSSProperties = { fontSize: 12, color: 'var(--spira-muted)', marginTop: 6, lineHeight: 1.45 }
const errorTexto: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  border: '1px solid rgba(166, 72, 59, 0.20)', borderRadius: 10, padding: '10px 14px',
}
const alerta: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, maxWidth: 720, fontSize: 13,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  border: '1px solid rgba(166, 72, 59, 0.20)', borderRadius: 10, padding: '11px 14px',
}
