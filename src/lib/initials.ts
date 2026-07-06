/** Iniciales para avatares: primera letra del primer y último nombre, ignorando
    títulos/honoríficos (Dr./Dra./Lic./Farm./Enf.). Fuente ÚNICA: la usan el menú
    de usuario (top bar) y el avatar de "Mi cuenta" para que coincidan siempre. */
export function initialsOf(name: string): string {
  const clean = (name ?? '').replace(/^(Dra?\.|Lic\.|Farm\.|Enf\.)\s*/i, '').trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
