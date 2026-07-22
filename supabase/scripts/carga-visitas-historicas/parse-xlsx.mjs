// parse-xlsx.mjs — lector mínimo de .xlsx en Node puro (ZIP + XML). Sin dependencias.
// No embebe datos: solo lógica de lectura. Uso: readSheets(rutaXlsx) -> { hoja: { rows } }.
import fs from 'node:fs'
import zlib from 'node:zlib'

function entriesOf(buf) {
  const findEOCD = (b) => { for (let i = b.length - 22; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) return i; throw new Error('EOCD no encontrado') }
  const eocd = findEOCD(buf), cdCount = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16)
  const e = {}; let p = cdOff
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    e[name] = { method, compSize, localOff }; p += 46 + nameLen + extraLen + commentLen
  }
  return e
}
function read(buf, entries, name) {
  const e = entries[name]; if (!e) return null
  const lh = e.localOff, lN = buf.readUInt16LE(lh + 26), lE = buf.readUInt16LE(lh + 28)
  const ds = lh + 30 + lN + lE, data = buf.slice(ds, ds + e.compSize)
  return e.method === 0 ? data : zlib.inflateRawSync(data)
}
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&')
const colNum = (c) => { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n }

export function readSheets(path) {
  const buf = fs.readFileSync(path), entries = entriesOf(buf)
  const shared = []
  const ssBuf = read(buf, entries, 'xl/sharedStrings.xml')
  if (ssBuf) {
    const ss = ssBuf.toString('utf8'); const re = /<si>([\s\S]*?)<\/si>/g; let m
    while ((m = re.exec(ss))) { const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t, parts = []; while ((t = tRe.exec(m[1]))) parts.push(dec(t[1])); shared.push(parts.join('')) }
  }
  // relaciones: r:id -> archivo de hoja
  const rels = {}; const relBuf = read(buf, entries, 'xl/_rels/workbook.xml.rels')
  if (relBuf) { const re = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g; let m; while ((m = re.exec(relBuf.toString('utf8')))) { let t = m[2]; if (!t.startsWith('xl/')) t = 'xl/' + t.replace(/^\/?/, ''); rels[m[1]] = t } }
  const sheets = {}; const wbBuf = read(buf, entries, 'xl/workbook.xml')
  const re = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g; let m
  while ((m = re.exec(wbBuf.toString('utf8')))) {
    const name = dec(m[1]), target = rels[m[2]]
    const xml = read(buf, entries, target).toString('utf8')
    sheets[name] = { rows: parseRows(xml, shared) }
  }
  return sheets
}

function parseRows(xml, shared) {
  const rowsMap = {}; let maxRow = 0, maxCol = 0
  // [^>]*? NO-greedy: clave para no tragar celdas auto-cerradas <c .../> y correr las columnas.
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let m
  while ((m = cellRe.exec(xml))) {
    const attrs = m[1], body = m[2]; const rM = attrs.match(/r="([A-Z]+)(\d+)"/); if (!rM) continue
    const col = colNum(rM[1]), row = +rM[2]; const tM = attrs.match(/t="([^"]+)"/); const type = tM ? tM[1] : 'n'
    let value = ''
    if (body !== undefined) {
      if (type === 'inlineStr') { const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t, parts = []; while ((t = tRe.exec(body))) parts.push(dec(t[1])); value = parts.join('') }
      else { const vM = body.match(/<v[^>]*>([\s\S]*?)<\/v>/); const raw = vM ? vM[1] : ''; value = type === 's' ? (shared[+raw] ?? '') : dec(raw) }
    }
    ;(rowsMap[row] ||= {})[col] = value; if (row > maxRow) maxRow = row; if (col > maxCol) maxCol = col
  }
  const rows = []
  for (let r = 1; r <= maxRow; r++) { const out = []; for (let c = 1; c <= maxCol; c++) out.push(rowsMap[r]?.[c] ?? ''); rows.push(out) }
  return rows
}
