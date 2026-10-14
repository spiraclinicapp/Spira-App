/**
 * ¿Puede esta persona hacer lo que la base reserva a QUIEN COORDINA EL ESTUDIO? Hoy, dos cosas del
 * botón de etapa (0155): deshacer el inicio de atención (`retroceder_etapa_visita`) y adelantar la
 * llegada moviendo la citación a hoy (`registrar_llegada_adelantada`).
 *
 * ESPEJA A LA BASE, que en las dos dice «gerencia, o un operador de Coordinación asignado al estudio»:
 *   · gerencia sí, aunque no coordine nada (Director, 2026-10-14: «que gerencia también pueda»);
 *   · el admin de Coordinación que NO coordina el estudio, no — la base lo rechaza, y ofrecérselo sería
 *     un botón que promete algo que rebota. Por eso no es `canClinical`, que sí lo deja pasar.
 *
 * Vive aparte y puro porque `visitPermissions.ts` importa la sesión (y con ella el cliente de Supabase,
 * que vitest no puede cargar), y porque una regla de permisos al revés no se ve en pantalla: el botón
 * aparece igual de prolijo, apagado o encendido.
 */
export function coordinaElEstudio(
  persona: { esGerencia: boolean; esOperador: boolean; coordinados: ReadonlySet<string> },
  protocolId: string,
): boolean {
  return persona.esGerencia || (persona.esOperador && persona.coordinados.has(protocolId))
}
