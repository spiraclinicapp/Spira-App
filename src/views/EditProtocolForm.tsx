import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { FormField, fieldInput } from '../components/FormField'
import { btnOutline, btnPrimary } from '../components/buttons'
import { updateProtocol, useProtocols } from '../data/protocols'
import type { ProtocolRow } from '../data/protocols'
import { AutocompleteInput, textSuggestions } from '../components/AutocompleteInput'

/** Traduce el código de error de Postgres a un mensaje sereno en castellano. */
function friendlyError(code?: string): string {
  if (code === '42501') return 'No tenés permiso para editar este protocolo.'
  // 23505: `protocols.code` es unique. Desde que el código se edita (2026-09-20), este choque es
  // alcanzable con sólo escribir el de otro estudio, así que necesita decir QUÉ pasó.
  if (code === '23505') return 'Ya hay otro estudio con ese código. Revisalo antes de guardar.'
  if (code === '23502' || code === '23503') return 'Faltan datos obligatorios. Revisá el formulario.'
  return 'No pudimos guardar los cambios. Probá de nuevo.'
}

interface EditProtocolFormProps {
  protocol: ProtocolRow
  accentSolid: string
  onClose: () => void
  onUpdated: () => void
}

/**
 * Edición de un protocolo (modal ancho, 2 columnas). NO edita la entidad legal.
 *
 * EL VOCABULARIO CAMBIÓ EL 2026-09-20 (decisión del Director): lo que la base llama `name`
 * ("AIRLYMPUS") es el **acrónimo** del estudio, y lo que se muestra como su identificador
 * ("ACT18301") es el **código**. Las columnas no se renombran —`name` y `code` son de la 0002 y las
 * usa media app—: cambia el rótulo, que es lo que lee la gente.
 *
 * Y EL CÓDIGO AHORA SE EDITA. Antes no: el modal lo mostraba en el título y nada más. Trae dos
 * consecuencias que el formulario tiene que hacerse cargo de ellas, no esconderlas:
 *   · es `unique` en la base → un choque vuelve 23505 y se traduce (`friendlyError`);
 *   · es el identificador en la URL → cambiarlo invalida los links guardados de ese estudio, y por
 *     eso el aviso está a la vista ANTES de guardar y no en un mensaje después.
 */
export function EditProtocolForm({ protocol, accentSolid, onClose, onUpdated }: EditProtocolFormProps) {
  const [code, setCode] = useState(protocol.code)
  const [name, setName] = useState(protocol.name)
  const [sponsor, setSponsor] = useState(protocol.sponsor ?? '')
  const [description, setDescription] = useState(protocol.description ?? '')
  const [investigator, setInvestigator] = useState(protocol.principal_investigator ?? '')
  const [specialty, setSpecialty] = useState(protocol.specialty ?? '')
  const [internalCode, setInternalCode] = useState(protocol.internal_code ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const protocols = useProtocols()
  const sponsorSuggestions = textSuggestions((protocols.data ?? []).map((p) => p.sponsor))
  const investigatorSuggestions = textSuggestions((protocols.data ?? []).map((p) => p.principal_investigator))
  const specialtySuggestions = textSuggestions((protocols.data ?? []).map((p) => p.specialty))

  /* Primer "Guardar cambios" → pide confirmación; no guarda todavía. */
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setConfirming(true)
  }

  const doSave = async () => {
    setBusy(true)
    setError(null)
    const res = await updateProtocol(protocol.id, {
      code: code.trim(),
      name: name.trim(),
      sponsor: sponsor.trim() || null,
      description: description.trim() || null,
      principal_investigator: investigator.trim() || null,
      specialty: specialty.trim() || null,
      internal_code: internalCode.trim() || null,
    })
    setBusy(false)
    /* Si Postgres devolvió un código, MANDA la traducción: `updateProtocol` pasa el `error.message`
       crudo —en inglés y nombrando la constraint—, así que el `res.error || …` que había acá dejaba
       a `friendlyError` sin usarse nunca. Se vio al agregar el 23505, que es el caso que esta
       pantalla ahora puede provocar sola. Sin código es el mensaje propio de la capa de datos ("no
       tenés permiso"), que ya viene en castellano. */
    if (res.error) { setError(res.code ? friendlyError(res.code) : res.error); setConfirming(false); return }
    onUpdated()
  }

  return (
    <Modal title={`Editar ${protocol.code}`} onClose={onClose} maxWidth={640}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Acrónimo y código, en ese orden y en el primer renglón: son la identidad del estudio, y
              desde el rediseño de las tarjetas el acrónimo es lo que va arriba. */}
          <FormField label="Acrónimo">
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="ej. AIRLYMPUS" style={fieldInput} />
          </FormField>
          <FormField label="Código">
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="ej. ACT18301" className="spira-mono" style={fieldInput} />
          </FormField>
          <FormField label="Patrocinante">
            <AutocompleteInput value={sponsor} onChange={setSponsor} suggestions={sponsorSuggestions} placeholder="Sponsor" />
          </FormField>
          <FormField label="Investigador principal">
            <AutocompleteInput value={investigator} onChange={setInvestigator} suggestions={investigatorSuggestions} placeholder="ej. Dr. Ricardo Funes" />
          </FormField>
          <FormField label="Especialidad">
            <AutocompleteInput value={specialty} onChange={setSpecialty} suggestions={specialtySuggestions} placeholder="ej. Cardiología" />
          </FormField>
          {/* «Patología» es la columna `description`, con otro rótulo desde el 2026-09-16 (ver
              ProtocolDetailView). Va al lado de Especialidad y no a lo ancho: son el par general →
              particular, y así el formulario cierra en tres renglones parejos. */}
          <FormField label="Patología">
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ej. Asma grave" style={fieldInput} />
          </FormField>
          {/* El código del SPONSOR, que no es el nuestro. Queda al final y con el nombre largo desde
              que el de arriba pasó a llamarse «Código»: dos campos con el mismo rótulo hacen que se
              edite el equivocado. Se queda en el formulario —aunque deje un hueco en la grilla—
              porque sacarlo dejaría sin manera de corregir lo ya cargado. */}
          <FormField label="Código interno del sponsor">
            <input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} placeholder="ej. BO42451" className="spira-mono" style={fieldInput} />
          </FormField>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        {confirming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, padding: '12px 13px', borderRadius: 11, background: accentSolid + '0E', border: `1px solid ${accentSolid}30` }}>
              <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alertCircle" size={18} color={accentSolid} /></span>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                Vas a guardar los cambios en <span className="spira-mono" style={{ fontWeight: 600 }}>{protocol.code}</span>. ¿Confirmás?
                {/* El aviso aparece SÓLO si el código cambió, y acá y no bajo el campo: es la
                    consecuencia que no se deshace sola —los links guardados dejan de encontrar el
                    estudio— y este es el último momento para arrepentirse. Un cartel permanente
                    debajo del input se leería como ruido en las nueve de cada diez ediciones que no
                    lo tocan. */}
                {code.trim() !== protocol.code && (
                  <div style={{ marginTop: 6, color: 'var(--spira-ink-soft)' }}>
                    El código pasa a ser <span className="spira-mono" style={{ fontWeight: 600 }}>{code.trim()}</span>.
                    Los links guardados a este estudio dejan de funcionar.
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirming(false)} style={btnOutline}>Volver</button>
              <button type="button" onClick={() => void doSave()} disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Guardando…' : 'Sí, guardar'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
            <button type="submit" style={btnPrimary(accentSolid)}>Guardar cambios</button>
          </div>
        )}
      </form>
    </Modal>
  )
}
