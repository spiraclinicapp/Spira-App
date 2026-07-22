// mapeo.mjs — mapeo declarativo Excel -> visit_definitions, por protocolo.
//
// offsetDays = días de la visita respecto de la visita ANCLA (ancla = offset 0).
// El trigger generate_patient_visits calcula estimated_date = randomization_date + offset_days,
// con randomization_date = fecha de la visita ancla. Así que estos offsets son la estimada.
//
// Los offsets POST-ancla se DERIVARON del propio Excel (mediana de estimada−ancla entre
// pacientes, spread≈0 → el sitio los usó de forma consistente); reproducen la estimada por
// construcción. Los de SCREENING (pre-ancla) son la mediana de real−ancla (la estimada de
// screening viene en blanco en el Excel): son nominales, lo que importa es la real que se
// backfillea. Anclas confirmadas con el Director (2026-07-21).
//
// Ventana ±3 d (VENTANA); la visita ancla/basal solo +3 / −0 (no puede adelantarse).

export const VENTANA = { minus: 3, plus: 3 }
const basal = { winMinus: 0, winPlus: 3 }
const w = { winMinus: 3, winPlus: 3 }

// Cadencia lineal: genera V{n0..} con offset off0 + i*step.
function cadencia(n0, count, off0, step, role = 'comun') {
  return Array.from({ length: count }, (_, i) => ({ code: `V${n0 + i}`, role, offsetDays: off0 + i * step, ...w }))
}

export const PROTOCOLOS = {
  // CEREN-2 (itepekimab). Ancla V2 (RANDOMIZACIÓN). V1=Selección. V3..V27 cada 14 d desde 15;
  // V28 (EOT) +14; V29 (Seguimiento/EOS) salto a 505.
  'CEREN-2': {
    anchorLabelRegex: /randomiz/i,
    visitas: [
      { code: 'V1', role: 'screening', offsetDays: -33, ...w },
      { code: 'V2', role: 'randomizacion', offsetDays: 0, ...basal },
      ...cadencia(3, 25, 15, 14),        // V3=15, V4=29, … V27=351
      { code: 'V28', role: 'comun', offsetDays: 365, ...w },
      { code: 'V29', role: 'comun', offsetDays: 505, ...w },
    ],
  },
  // ACT18301 (lunsekimig). Ancla V3 (INICIO). V1=Selección, V2=Preinclusión (screening).
  // V4=15, V5=29, luego +28 mensual. V17=EOT, V18=EOS.
  'ACT18301': {
    anchorLabelRegex: /inicio/i,
    visitas: [
      { code: 'V1', role: 'screening', offsetDays: -55, ...w },
      { code: 'V2', role: 'screening', offsetDays: -27, ...w },
      { code: 'V3', role: 'randomizacion', offsetDays: 0, ...basal },
      { code: 'V4', role: 'comun', offsetDays: 15, ...w },
      { code: 'V5', role: 'comun', offsetDays: 29, ...w },
      ...cadencia(6, 13, 57, 28),        // V6=57, V7=85, … V18=393
    ],
  },
  // THESEUS (lunsekimig). Ancla V3 (INICIO). V1=Selección, V2=Preinclusión (screening).
  // V4=14, V5=43, luego +28. V15=EOI, V16=EOS. (offsets con leve variación entre pacientes,
  // spread≈7 d → se toma la mediana, que es la que usó el sitio).
  'THESEUS': {
    anchorLabelRegex: /inicio/i,
    visitas: [
      { code: 'V1', role: 'screening', offsetDays: -33, ...w },
      { code: 'V2', role: 'screening', offsetDays: -14, ...w },
      { code: 'V3', role: 'randomizacion', offsetDays: 0, ...basal },
      { code: 'V4', role: 'comun', offsetDays: 14, ...w },
      { code: 'V5', role: 'comun', offsetDays: 43, ...w },
      ...cadencia(6, 10, 71, 28),        // V6=71, V7=99, … V15=323 (+28)
      { code: 'V16', role: 'comun', offsetDays: 379, ...w }, // EOS: salto final +56
    ],
  },
  // LTS 17231. Rollover de ACT18301: ancla V1 (Sem 0), sin screening. 26 visitas cada 4 sem
  // (offset = (n-1)*28). V25 (Sem 96)=EOT, V26 (Sem 100)=EOS. Cronograma provisto por el Director.
  'LTS 17231': {
    anchorLabelRegex: /^V1$/i,
    anchorByCode: 'V1',
    visitas: [
      { code: 'V1', role: 'randomizacion', offsetDays: 0, ...basal },
      ...cadencia(2, 25, 28, 28),        // V2=28, V3=56, … V26=700
    ],
  },
}

// Mapea una fila del Excel a su visit_definition. El "Visita" del Excel (V1..Vn secuencial del
// sitio) coincide con el code de la def. La ancla se detecta por code (LTS) o por etiqueta de rol.
export function clasificarVisitaExcel(protoCode, etiquetaReal, etiquetaEst, visitaCol) {
  const proto = PROTOCOLOS[protoCode]
  if (!proto) return null
  const code = String(visitaCol).trim().toUpperCase()          // "V1".. "V29"
  const def = proto.visitas.find((v) => v.code === code)
  if (!def) return null
  const esAncla = def.offsetDays === 0
  return { defCode: def.code, role: def.role, esAncla, offsetDays: def.offsetDays }
}
