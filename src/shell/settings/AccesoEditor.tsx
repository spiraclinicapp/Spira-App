import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import { MODULES } from '../../modules/registry'
import { setModuleAccess } from '../../data/team'
import type { TeamMemberRow } from '../../data/team'
import { useAccessAudit } from '../../data/team'
import { setProtocolAccess, useProtocolAccessAudit } from '../../data/protocolAccess'
import type { AsignacionRow } from '../../data/protocolAccess'
import type { ProtocolRow } from '../../data/protocols'
import { InfoTip } from '../../components/InfoTip'
import {
  canRevokeAdmin, describeAccess, mezclarHistorial, MODULO_ADMIN, ROLE_LABEL, ROLE_RANK,
} from '../../lib/roles'
import type { Accesos, ModuleKey, ModuleRole } from '../../lib/roles'
import { puedeEnModulo, SIN_ACCESO_PUEDE } from '../../lib/permisos'
import { formatDateAR } from '../../lib/dates'
import {
  EstudioChip, StCard, StRow, StPill, StToggle, btnGhost, btnSolid, dialogCard, dialogScrim, dialogTitulo,
} from './primitives'
import { AccionesDeCuenta } from './AccionesDeCuenta'
import { useMarkDirty } from './SettingsModal'

/* ============================================================================
   Editor de acceso de UNA persona.

   Seis bloques y en este orden, que no es casual:
     1. MÓDULOS — un nivel por módulo (sólo los CONSTRUIDOS: ver `MODULOS_ASIGNABLES` más abajo).
        Qué PANTALLAS abre.
     2. ESTUDIOS — sobre qué PACIENTES. La otra mitad del acceso, y va pegada a la primera porque
        una sin la otra no sirve: "Operador en Coordinación" con cero estudios entra al módulo y
        no ve un solo paciente (`is_assigned_coordinator`, 0006). Sólo aparece si el borrador
        tiene Coordinación — Farmacia es central y ve todos los protocolos.
     3. ADMINISTRACIÓN — `gerencia` SOLO, en su propio bloque y con confirmación. No es un módulo:
        no tiene pantallas, es el permiso de tocar los accesos de todo el centro. Listarlo como una
        fila más al lado de Coordinación y Farmacia hacía que se marcara sin entender qué se estaba
        dando (decisión del Director, 2026-08-25).
     4. CON ESTO VE… — la consecuencia, en castellano, ANTES de guardar.
     5. LA CUENTA — contraseña, baja y eliminación. No pasan por el borrador: se aplican al
        confirmarlas, y por eso cada una lleva su propia confirmación.
     6. HISTORIAL — quién le cambió el acceso y cuándo. Lo escriben dos triggers (módulos en la
        0003, estudios en la 0110) y se leen mezclados: para gerencia es una sola pregunta.

   Los cuatro primeros se editan y se guardan con el botón del final; el 5 se aplica en el acto, y
   el 6 es el registro de las dos cosas. (Este comentario decía "tres bloques" desde antes de que
   existieran el 5 y el 6.)

   El bloque 4 es el que evita los dos errores caros de esta pantalla. Marcar "operator en Farmacia"
   no le dice a nadie qué va a encontrar la persona al entrar; sigue siendo el único lugar donde
   aparece un acceso a un módulo que todavía no está construido, si quedó alguno de antes; y es
   donde se avisa que un estudio se queda SIN NINGUNA coordinadora — la única consecuencia de esta
   pantalla que no le pasa a la persona que se está editando, sino a un estudio entero.

   ⚠️ Es una SIMULACIÓN de solo lectura. NO es entrar como esa persona: suplantar a alguien en un
   sistema auditable rompe el rastro, porque las acciones quedarían firmadas por quien no las hizo.

   Guardado con BOTÓN (decisión del Director): los cambios se juntan y se aplican al confirmar. Por
   eso avisa al modal con `useMarkDirty` — si no, cerrar Ajustes con Esc, con la X, con un clic
   afuera o con el atrás del navegador los tiraría sin decir una palabra.
   ============================================================================ */

/** Los módulos asignables, en el orden del registro. `inicio` no se asigna (lo tiene todo el mundo)
    y la administración va aparte, en su propio bloque.

    Los `proximamente` (Lab, Contable) tampoco: darles acceso no le muestra NADA a nadie, así que
    ofrecer el desplegable era ofrecer una decisión que no existe — y el renglón "Todavía no está
    construido" convertía media pantalla en ruido (pedido del Director, 2026-09-07). Con esto,
    desde la UI ya no se puede CREAR un acceso inerte. Los que hayan quedado de antes en la base
    siguen apareciendo abajo, en el bloque "Con esto ve…", que es la otra mitad de la regla
    (ver `describeAccess` en `lib/roles.ts`). */
const MODULOS_ASIGNABLES = MODULES.filter((m) => m.key !== 'inicio' && !m.proximamente)

const NIVELES: ModuleRole[] = (Object.keys(ROLE_RANK) as ModuleRole[]).sort(
  (a, b) => ROLE_RANK[a] - ROLE_RANK[b],
)

/** Nombre visible de un módulo a partir de su key interna (para el historial). */
function nombreModulo(key: string): string {
  return MODULES.find((m) => m.key === key)?.name ?? key
}

/** Cómo se llama el nivel elegido para ese módulo en el borrador. Sin nivel, "Sin acceso" — que es
 *  una respuesta, no un hueco: el ⓘ tiene que poder explicar también el estado de no tener nada. */
function nivelDe(borrador: Accesos, key: string): string {
  const n = borrador[key as ModuleKey]
  return n ? ROLE_LABEL[n] : 'Sin acceso'
}

/** Qué puede hacer con el nivel elegido. Mismo diccionario que las opciones del menú. */
function explicacionDe(borrador: Accesos, key: string): string {
  const n = borrador[key as ModuleKey]
  return n ? puedeEnModulo(key, n) : SIN_ACCESO_PUEDE
}

/** La primera letra en mayúscula. Las frases de `permisos.ts` están escritas para ir DESPUÉS de un
 *  guión ("Coordinación — puede cargar y editar"); en un ⓘ arrancan una oración. */
function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface Props {
  persona: TeamMemberRow
  /** Id del usuario en sesión: hace falta para el guard de "no te saques la administración". */
  actorId: string
  /** Ids de TODOS los que hoy administran accesos (para el guard del último). */
  administradores: string[]
  /** Los protocolos del centro. Vienen por prop desde `EquipoYAccesosSection` y no de un hook
   *  propio: `useSupabaseQuery` no cachea, así que pedirlos acá los volvería a consultar cada vez
   *  que se entra y se sale de una ficha, siendo siempre la misma lista. */
  protocolos: ProtocolRow[]
  protocolosCargando: boolean
  /** TODAS las asignaciones del centro, no sólo las de esta persona: hacen falta enteras para saber
   *  si un estudio se queda sin ninguna coordinadora al guardar. Bajan por prop desde la sección
   *  por el mismo motivo que `protocolos` — `useSupabaseQuery` no cachea, y pedirlas acá las
   *  reconsultaba en cada entrada y salida de una ficha. */
  asignaciones: AsignacionRow[]
  asignacionesCargando: boolean
  /** Para que la sección vuelva a pedir las asignaciones después de guardar. */
  onAsignacionesCambiadas: () => void
  onCerrar: () => void
  /** Se llama tras guardar con éxito, para que la lista se refresque. */
  onGuardado: () => void
}

export function AccesoEditor({
  persona, actorId, administradores, protocolos, protocolosCargando,
  asignaciones, asignacionesCargando, onAsignacionesCambiadas, onCerrar, onGuardado,
}: Props) {
  /* El borrador arranca como una copia del acceso vigente. El vigente (`persona.accesos`) se
     conserva intacto porque es el `expected` que viaja al servidor en cada cambio: es lo que el
     navegador creía cuando el usuario empezó a editar, y compararlo contra la base es lo que
     detecta que otra administradora tocó lo mismo mientras tanto. */
  const [borrador, setBorrador] = useState<Accesos>({ ...persona.accesos })
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [confirmandoAdmin, setConfirmandoAdmin] = useState(false)

  const audit = useAccessAudit(persona.id)
  const auditProtocolos = useProtocolAccessAudit(persona.id)

  /* Lo que la base dice hoy que ve esta persona. */
  const protocolosVigentes = useMemo(
    () => asignaciones.filter((a) => a.user_id === persona.id).map((a) => a.protocol_id),
    [asignaciones, persona.id],
  )

  /* El borrador de protocolos arranca en `null` = "todavía no lo tocaron", y recién ahí se muestra
     lo vigente. Con un `useState(protocolosVigentes)` el estado inicial se congelaría en el array
     VACÍO del primer render —la consulta todavía viaja— y la persona aparecería sin ningún estudio
     hasta que alguien tocara algo. El `??` lo resuelve sin efecto de sincronización. */
  const [borradorProtos, setBorradorProtos] = useState<string[] | null>(null)
  const protosElegidos = borradorProtos ?? protocolosVigentes

  const cambios = useMemo(
    () =>
      MODULES.map((m) => m.key as ModuleKey)
        .concat(MODULO_ADMIN)
        .filter((k, i, arr) => arr.indexOf(k) === i && k !== ('inicio' as ModuleKey))
        .filter((k) => (borrador[k] ?? null) !== (persona.accesos[k] ?? null))
        .map((k) => ({ module: k, role: borrador[k] ?? null, expectedRole: persona.accesos[k] ?? null })),
    [borrador, persona.accesos],
  )

  /* Los cambios de protocolo, uno por estudio que entra o sale. Se manda `expected` con lo que el
     navegador creía: es el compare-and-swap del RPC. */
  const cambiosProtocolos = useMemo(() => {
    const vigentes = new Set(protocolosVigentes)
    const elegidos = new Set(protosElegidos)
    const tocados = [...new Set([...vigentes, ...elegidos])]
    return tocados
      .filter((id) => vigentes.has(id) !== elegidos.has(id))
      .map((id) => ({ protocolId: id, asignado: elegidos.has(id), expected: vigentes.has(id) }))
  }, [protocolosVigentes, protosElegidos])

  const totalCambios = cambios.length + cambiosProtocolos.length
  useMarkDirty(totalCambios > 0)

  const descripcion = useMemo(() => describeAccess(borrador, MODULES), [borrador])
  const revocar = canRevokeAdmin(persona.id, actorId, administradores)
  const esAdminAhora = borrador[MODULO_ADMIN] != null

  /* El bloque de estudios sólo existe si la persona tiene Coordinación EN EL BORRADOR.
     `protocol_coordinators` scopea únicamente a ese módulo: Farmacia es central y ve todos los
     protocolos, así que ofrecerle un selector sería prometer un filtro que la RLS no aplica. Mira
     el borrador y no lo vigente para que el bloque aparezca en el acto al darle el módulo, sin
     obligar a guardar y volver a entrar. */
  const tieneCoordinacion = borrador.track != null

  /* Los estudios que se quedarían SIN NINGUNA coordinadora al guardar. Se calcula sobre las
     asignaciones vigentes de TODO el centro: hace falta saber si queda alguien más, no sólo qué
     tiene esta persona. Sólo los `activo` — un estudio cerrado sin coordinadora es correcto. */
  const huerfanos = useMemo(() => {
    const filas = asignaciones
    return cambiosProtocolos
      .filter((c) => !c.asignado)
      .map((c) => protocolos.find((p) => p.id === c.protocolId))
      .filter((p): p is ProtocolRow => p != null && p.status === 'activo')
      .filter((p) => filas.filter((f) => f.protocol_id === p.id).length <= 1)
  }, [cambiosProtocolos, asignaciones, protocolos])

  /* El historial es UNO SOLO en pantalla aunque sean dos vistas en la base: para gerencia, "qué le
     pasó al acceso de esta persona" es una sola pregunta. El tope se aplica después de mezclar. */
  const historial = useMemo(
    () => mezclarHistorial(audit.data ?? [], auditProtocolos.data ?? [], nombreModulo),
    [audit.data, auditProtocolos.data],
  )

  const setNivel = (module: ModuleKey, role: ModuleRole | null) =>
    setBorrador((b) => {
      const siguiente = { ...b }
      if (role === null) delete siguiente[module]
      else siguiente[module] = role
      return siguiente
    })

  /* El switch de administración: DAR pide confirmación (es el único control de la app que reparte
     poder sobre todo el centro), QUITAR no la pide pero puede estar bloqueado por los guards. */
  const toggleAdmin = () => {
    if (esAdminAhora) {
      if (!revocar.puede) return
      setNivel(MODULO_ADMIN, null)
    } else {
      setConfirmandoAdmin(true)
    }
  }

  const guardar = async () => {
    setGuardando(true)
    setErrores([])
    const fallas: string[] = []
    /* Secuencial y no en paralelo: son escrituras sobre la misma persona y cada una lleva su
       compare-and-swap. En paralelo, dos que tocaran el mismo módulo se pisarían entre ellas —y
       además el orden importa para leer después el historial. */
    for (const c of cambios) {
      const { error } = await setModuleAccess({
        userId: persona.id,
        module: c.module,
        role: c.role,
        expectedRole: c.expectedRole,
      })
      if (error) fallas.push(`${nombreModulo(c.module)}: ${error}`)
    }
    /* Los estudios van DESPUÉS de los módulos, y también secuenciales. El orden importa para leer
       el historial: primero "le dio Coordinación", después "le dio el estudio X" — al revés se lee
       como si le hubieran dado estudios a alguien que todavía no entraba al módulo. */
    for (const c of cambiosProtocolos) {
      const { error } = await setProtocolAccess({
        userId: persona.id,
        protocolId: c.protocolId,
        asignado: c.asignado,
        expected: c.expected,
      })
      if (error) fallas.push(`${protocolos.find((p) => p.id === c.protocolId)?.code ?? 'Estudio'}: ${error}`)
    }
    setGuardando(false)
    onAsignacionesCambiadas()
    if (fallas.length) {
      // Igual que en Mi cuenta: un renglón por lo que falló, y el resto SÍ quedó guardado.
      setErrores(fallas)
      onGuardado() // refresca para que el borrador se reconcilie con lo que de verdad quedó
      return
    }
    onGuardado()
    onCerrar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* identidad */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={onCerrar} style={{ ...btnGhost, padding: '0 11px' }}>
          <Icon name="chevronLeft" size={15} color="var(--spira-muted)" /> Volver
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, color: 'var(--spira-ink)' }}>
            {persona.full_name}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>{persona.email ?? 'Sin correo registrado'}</div>
        </div>
      </div>

      {errores.length > 0 && (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', border: '1px solid rgba(166, 72, 59, 0.20)', borderRadius: 10, padding: '10px 14px' }}>
          {errores.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}

      {/* 1 · módulos */}
      <StCard title="Módulos" desc="Qué ve y con qué nivel">
        {MODULOS_ASIGNABLES.map((m, i) => (
          <StRow
            key={m.key}
            label={m.name}
            last={i === MODULOS_ASIGNABLES.length - 1}
          >
            {/* El ⓘ va PEGADO al selector, a su derecha, y no debajo del rótulo: explica el valor
                elegido, así que tiene que estar donde está el valor (§03 y §06 del handoff). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
              <div style={{ width: 190 }}>
                <SearchableSelect
                  id={`acceso-${m.key}`}
                  value={borrador[m.key as ModuleKey] ?? 'none'}
                  onChange={(v) => setNivel(m.key as ModuleKey, v === 'none' ? null : (v as ModuleRole))}
                  /* Cada variante dice QUÉ da, no sólo cómo se llama: "Líder" no le informa a nadie
                     qué gana la persona, y el nivel se elige una vez y queda. Las frases salen de
                     `lib/permisos.ts`, donde cada una cita la policy que la hace verdad.
                     Van en el ⓘ de cada opción y no impresas debajo: cuatro frases por módulo, en
                     dos módulos, ocupaban media pantalla para explicar tres niveles que nadie mira
                     después de elegir una vez. */
                  options={[
                    { value: 'none', label: 'Sin acceso', info: { titulo: 'Sin acceso', cuerpo: mayuscula(SIN_ACCESO_PUEDE) } },
                    ...NIVELES.map((n) => ({
                      value: n,
                      label: ROLE_LABEL[n],
                      info: { titulo: ROLE_LABEL[n], cuerpo: mayuscula(puedeEnModulo(m.key, n)) },
                    })),
                  ]}
                  placeholder="Sin acceso"
                  searchPlaceholder="Buscar nivel…"
                  entity="nivel"
                  menuWidth="auto"
                />
              </div>
              <InfoTip
                titulo={nivelDe(borrador, m.key)}
                cuerpo={mayuscula(explicacionDe(borrador, m.key))}
                etiqueta={`Qué puede hacer en ${m.name} con el nivel elegido`}
              />
            </div>
          </StRow>
        ))}
      </StCard>

      {/* 2 · estudios — la OTRA mitad del acceso.
             El nivel de módulo dice qué pantallas abre; esto dice sobre qué pacientes. Las dos
             hacen falta: alguien con "Operador en Coordinación" y cero estudios entra al módulo y
             no ve un solo paciente, porque `is_assigned_coordinator` (0006) no lo deja pasar en
             ninguna tabla — y hasta hoy eso se cargaba a mano por SQL. */}
      {tieneCoordinacion && (
        <StCard title="Estudios que ve" desc="Sobre qué pacientes puede trabajar en Coordinación">
          {/* Lo asignado se VE (chips) y lo que falta se SUMA (botón). Antes era un desplegable que
              tildaba y destildaba: el mismo control para dos gestos opuestos, y con lo elegido
              resumido en "3 estudios" adentro del disparador — o sea, para saber cuáles eran había
              que abrir el menú. Ahora se leen sin tocar nada. */}
          <StRow
            label="Estudios asignados"
            sub={
              protosElegidos.length === 0
                ? 'Sin ninguno no va a ver pacientes, aunque tenga el módulo'
                : `Ve los pacientes de ${protosElegidos.length === 1 ? 'este estudio' : `estos ${protosElegidos.length} estudios`}`
            }
          >
            <SearchableSelect
              id="acceso-protocolos"
              multiple
              modo="sumar"
              variant="boton"
              leadingIcon="plus"
              mono
              value={protosElegidos}
              onChange={setBorradorProtos}
              options={protocolos.map((p) => ({
                value: p.id,
                label: p.code,
                // El nombre del estudio como segunda línea: el código solo no alcanza para
                // elegir bien, y el nombre solo es demasiado largo para el disparador.
                desc: p.status === 'activo' ? p.name : `${p.name} · ${p.status}`,
              }))}
              placeholder={protocolosCargando ? 'Cargando estudios…' : 'Añadir estudio'}
              sinRestantes={{ label: 'Todos asignados', mensaje: 'Ya están todos los estudios asignados.' }}
              searchPlaceholder="Buscar estudio…"
              entity="estudio"
              pluralLabel="estudios"
              disabled={protocolosCargando || asignacionesCargando}
              /* Siempre, aunque queden pocos por sumar: si el buscador apareciera y desapareciera
                 según cuántos faltan, se iría a mitad de la tarea llevándose el foco del teclado. */
              searchable="always"
              menuWidth="auto"
            />
          </StRow>

          {/* Los chips, debajo del separador que deja `StRow`. El aire (gap 9, padding 6/18) es el
              del §04 del handoff: sin él, los chips quedan pegados al selector de arriba y al borde
              de la tarjeta, y se leen como parte del control en vez de como su resultado. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, padding: '6px 0 18px' }}>
            {protosElegidos.length === 0 ? (
              /* El ámbar SÓLO si el recorte le aplica, y con `gerencia` NO le aplica: las tres
                 policies de la 0006 que gobiernan Coordinación abren con `has_module('gerencia')
                 or …`. Mira el BORRADOR, así que darle o quitarle la administración cambia el aviso
                 en el acto, sin guardar. */
              esAdminAhora ? (
                <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
                  Ninguno asignado. Como administra los accesos, igual ve a todos los pacientes del centro.
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-acc-deep-warn)' }}>
                  <Icon name="alert" size={15} color="var(--spira-acc-deep-warn)" />
                  Sin ningún estudio asignado entra a Coordinación y no ve un solo paciente.
                </div>
              )
            ) : (
              protocolos
                .filter((p) => protosElegidos.includes(p.id))
                .map((p) => (
                  <EstudioChip
                    key={p.id}
                    codigo={p.code}
                    nombre={p.name}
                    onQuitar={() => setBorradorProtos(protosElegidos.filter((id) => id !== p.id))}
                  />
                ))
            )}
          </div>
        </StCard>
      )}

      {/* 3 · administración — aparte, porque no es un módulo */}
      <StCard title="Administración del centro">
        <StRow
          label="Puede administrar los accesos"
          sub={
            esAdminAhora && !revocar.puede
              ? revocar.motivo ?? undefined
              : 'Ver a todo el equipo y cambiarle el acceso a cualquiera, incluido a vos'
          }
          last
        >
          <StToggle
            on={esAdminAhora}
            onClick={toggleAdmin}
            label="Puede administrar los accesos del centro"
          />
        </StRow>
      </StCard>

      {/* 4 · la consecuencia, antes de guardar */}
      <StCard title="Qué va a ver al entrar" desc="Con el acceso que estás dejándole">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 4px' }}>
          {descripcion.ve.length === 0 && descripcion.inertes.length === 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>
              Sólo el Inicio. No va a poder entrar a ningún módulo.
            </div>
          )}
          {descripcion.ve.map((a) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon name="check" size={14} color="var(--spira-acc-deep-good)" />
              <span style={{ color: 'var(--spira-ink)' }}>
                <strong style={{ fontWeight: 600 }}>{a.nombre}</strong> — {a.puede}
              </span>
            </div>
          ))}
          {/* El caso que nadie ve venir: acceso dado a un módulo que todavía no existe. */}
          {descripcion.inertes.map((a) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon name="clock" size={14} color="var(--spira-acc-deep-warn)" />
              <span style={{ color: 'var(--spira-acc-deep-warn)' }}>
                <strong style={{ fontWeight: 600 }}>{a.nombre}</strong> — le diste acceso, pero el módulo
                todavía no está construido, así que no lo va a ver
              </span>
            </div>
          ))}
          {/* Los estudios, debajo de los módulos: el módulo es la puerta y el estudio es el
              alcance, y leerlos juntos es lo que evita el "le di Coordinación y no ve nada". */}
          {/* El recorte por estudio le aplica sólo a quien NO administra: las tres policies de la
              0006 que gobiernan Coordinación (`patients`, `enrollments`, `patient_visits`) abren
              con `has_module('gerencia') or …`. Con la administración puesta en el borrador, cero
              estudios no es un problema y decirlo en ámbar sería alarmar por nada. */}
          {tieneCoordinacion && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon
                name={protosElegidos.length === 0 && !esAdminAhora ? 'clock' : 'check'}
                size={14}
                color={protosElegidos.length === 0 && !esAdminAhora ? 'var(--spira-acc-deep-warn)' : 'var(--spira-acc-deep-good)'}
              />
              <span style={{ color: protosElegidos.length === 0 && !esAdminAhora ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink)' }}>
                {protosElegidos.length === 0 && esAdminAhora ? (
                  <>Todos los pacientes del centro, <strong style={{ fontWeight: 600 }}>porque administra los accesos</strong> — no por los estudios</>
                ) : protosElegidos.length === 0 ? (
                  <>Sin ningún estudio asignado: entra a Coordinación pero <strong style={{ fontWeight: 600 }}>no ve ningún paciente</strong></>
                ) : (
                  <>
                    Pacientes de{' '}
                    <strong style={{ fontWeight: 600 }}>
                      {protocolos.filter((p) => protosElegidos.includes(p.id)).map((p) => p.code).join(' · ')}
                    </strong>
                  </>
                )}
              </span>
            </div>
          )}

          {/* Estudios asignados SIN Coordinación: inertes, y por lo tanto invisibles en el bloque de
              arriba (que sólo se dibuja con el módulo). Es exactamente el caso de los módulos
              `proximamente` en `describeAccess`: un acceso que existe en la base y no rinde nada se
              MUESTRA, no se esconde — si no, quitarle Coordinación a alguien deja sus estudios
              colgados y nadie puede enterarse ni limpiarlos. */}
          {!tieneCoordinacion && protocolosVigentes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon name="clock" size={14} color="var(--spira-acc-deep-warn)" />
              <span style={{ color: 'var(--spira-acc-deep-warn)' }}>
                Tiene <strong style={{ fontWeight: 600 }}>{protocolosVigentes.length} estudio{protocolosVigentes.length > 1 ? 's' : ''}</strong> asignado{protocolosVigentes.length > 1 ? 's' : ''},
                pero sin acceso a Coordinación no le sirven de nada
              </span>
            </div>
          )}

          {/* El aviso que NO habla de esta persona sino de un estudio entero. No bloquea el guardado
              (decisión del Director, 2026-09-07): si la única coordinadora se va del centro, un
              guard impediría revocarle el acceso hasta conseguirle reemplazo. Avisa y deja decidir. */}
          {huerfanos.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5 }}>
              <Icon name="alert" size={14} color="var(--spira-acc-deep-warn)" />
              <span style={{ color: 'var(--spira-acc-deep-warn)' }}>
                <strong style={{ fontWeight: 600 }}>{p.code}</strong> se queda sin ninguna coordinadora:
                sus pacientes dejan de verse en Coordinación (gerencia y Farmacia los siguen viendo)
              </span>
            </div>
          ))}

          {descripcion.noVe.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>
              No ve: {descripcion.noVe.join(' · ')}
            </div>
          )}
          {descripcion.administra && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13.5, color: 'var(--spira-acc-deep-track)' }}>
              <Icon name="shield" size={14} color="var(--spira-acc-deep-track)" />
              <span>Además, puede cambiarle el acceso a cualquiera del centro.</span>
            </div>
          )}
        </div>
      </StCard>

      {/* 5 · la cuenta en sí: contraseña, baja y eliminación.
             Va DESPUÉS del acceso y ANTES del historial a propósito: primero lo que se edita y se
             guarda con el botón de abajo, después lo que se aplica en el acto, y al final el
             registro de las dos cosas. Estas acciones NO pasan por el borrador — se ejecutan al
             confirmarlas—, y por eso cada una tiene su propia confirmación. */}
      <AccionesDeCuenta
        persona={persona}
        actorId={actorId}
        onCambio={onGuardado}
        onEliminada={() => { onGuardado(); onCerrar() }}
      />

      {/* 6 · el historial: módulos (trigger de la 0003) y estudios (trigger de la 0110), en una
             sola lista. Acá sólo se lee. */}
      <StCard title="Historial de accesos" desc="Quién le cambió el acceso, y cuándo" pad={false}>
        {/* Cargando mientras falte CUALQUIERA de las dos: mostrar media lista y completarla después
            haría aparecer líneas viejas por encima de las nuevas, que se lee como si el historial
            se hubiera reordenado solo. */}
        {(audit.loading || auditProtocolos.loading) && <div style={vacio}>Cargando…</div>}
        {!audit.loading && !auditProtocolos.loading && historial.length === 0 && (
          <div style={vacio}>Sin cambios registrados.</div>
        )}
        {historial.map((l, i) => (
          <div
            key={l.id}
            style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '11px 18px', borderBottom: i < historial.length - 1 ? '1px solid var(--spira-line)' : 'none' }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--spira-ink)' }}>{l.texto}</span>
            <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)', flex: '0 0 auto' }}>
              {formatDateAR(l.occurred_at)}
            </span>
          </div>
        ))}
      </StCard>

      {/* acciones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button style={btnSolid()} onClick={guardar} disabled={guardando || totalCambios === 0}>
          {guardando ? 'Guardando…' : totalCambios ? `Guardar ${totalCambios} cambio${totalCambios > 1 ? 's' : ''}` : 'Sin cambios'}
        </button>
        <button style={btnGhost} onClick={onCerrar} disabled={guardando}>Cancelar</button>
      </div>

      {/* Confirmación de DAR la administración. El único control de la app que reparte poder sobre
          todo el centro merece que se lea qué se está dando antes de marcarlo. */}
      {confirmandoAdmin && (
        <div style={dialogScrim} role="presentation" onMouseDown={() => setConfirmandoAdmin(false)}>
          <div style={dialogCard} role="alertdialog" aria-modal="true" aria-label="Dar la administración de accesos" onMouseDown={(e) => e.stopPropagation()}>
            <div style={dialogTitulo}>
              ¿Darle la administración del centro?
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 8, lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>{persona.full_name}</strong> va a poder ver
              los datos de todo el equipo y cambiarle el acceso a cualquiera — incluida tu propia cuenta.
              Queda registrado quién se lo dio.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => setConfirmandoAdmin(false)}>Cancelar</button>
              <button
                type="button"
                style={btnSolid()}
                onClick={() => { setNivel(MODULO_ADMIN, 'admin'); setConfirmandoAdmin(false) }}
              >
                Sí, darle la administración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const vacio: CSSProperties = { padding: '16px 18px', fontSize: 13, color: 'var(--spira-muted)' }

/** Chip de nivel, reusado por la lista del equipo. */
export function ChipDeAcceso({ nombre, nivel }: { nombre: string; nivel: ModuleRole }) {
  return <StPill tone="neutral">{nombre} · {ROLE_LABEL[nivel]}</StPill>
}
