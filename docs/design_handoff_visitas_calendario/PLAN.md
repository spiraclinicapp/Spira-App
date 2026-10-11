# PLAN — Visitas · vistas Mes / Semana / Día

Plan de implementación del handoff de esta carpeta (`README.md` + `prototipo/` + `screenshots/`),
salido de un `/plan-eng-review` del 2026-10-11. El Director pidió **aplicar siempre la opción
recomendada**: cada decisión de abajo es la recomendada, con su porqué, para poder revisarla después.

> **El handoff está dibujado sobre datos de juguete y una pantalla nueva; la de verdad existe.**
> `DayVisitsView` (Visitas del día v2) ya tiene filtros multi, «Ordenar por», buscador, el modal de la
> visita, el cierre clínico, «No vino», la cola del médico y la URL como estado. Este plan es el
> handoff **reconciliado** con eso: lo que el prototipo simplifica no se pierde.

---

## 1 · Arquitectura

```
DayVisitsView  (submódulo Coordinación › Visitas, clave track/visitas)
│  estado en la URL: vista · dia · buscar · estado · protocolo · medico · coordinadora · agrupar · visita
│
├─ encabezado del shell ............ «Agregar visita» (el h1 lo sigue dibujando el shell)
├─ BarraPeriodo .................... ‹ Hoy ›  ·  período + contadores (abre el calendario)  ·  Mes|Semana|Día
├─ fila de filtros ................. [Filtros ▾] → PanelFiltros (dos columnas)  ·  (Día) Ordenar por  ·  buscador
├─ FichasFiltros ................... una ficha por valor + «Limpiar todo»
└─ cuerpo
   ├─ Día ...... lista agrupada (En el centro · Por llegar · Finalizadas) — DayVisitRowItem rediseñada
   ├─ Semana ... VistaSemana (L–V; sáb/dom aparecen solos si hay visitas) — clic → Día de esa fecha
   └─ Mes ...... VistaMes (celda «Lista»)                                  — clic → Día de esa fecha

datos
   Día            → useVisitsForDay(dia)               sin cambios (lo usa también la cola del médico)
   Semana / Mes   → useVisitsForRange(desde, hasta)    NUEVO · motivosDelRango · paginado
   calendario     → useDiasConVisitas(mes)             NUEVO · sólo columnas de fecha

lógica pura (con test, corre dentro de `npm run build`)
   track/visitas/calendario.ts      período, paso, rótulo, grilla del mes, días de una visita, grupo
   track/visitas/filtrosVisitas.ts  filtros AND/OR, conteo facetado, búsqueda, atajos de teclado
```

Sin migración: todo lo que se dibuja ya sale de `v_track_visits`. **Front-only.**

---

## 2 · Decisiones (todas la opción recomendada)

| # | Tema | Decisión | Por qué |
|---|---|---|---|
| 1 | Título 28/800 del mock | Se queda el `h1` del shell (24/700) | Es EL `h1` de toda la app; uno distinto en una sola pantalla es la inconsistencia que el handoff mismo dice no tocar («Shell existente … No cambia»). |
| 2 | Paleta de estados del mock (`inicio` verde, `fin` #5C8A5A, `no_vino` #A6483B) | Se usan los chips y colores de la app (`OPERATIONAL_STAGES` / `VISIT_STATES`) | El mismo estado tiene que tener el mismo color en la fila, el modal, el cronograma y la cola. Los del mock salen de `data.js` del prototipo. |
| 3 | «No vino» | Es `computed_status = 'por_reprogramar'` (el mismo predicado que ya usa el chip). Va al grupo **Finalizadas**, tiene opción propia en el filtro Estado y su acción es «Reprogramar» | Chip, grupo, contador y filtro tienen que decir lo mismo de la misma fila. |
| 4 | «Atención médica» | Siempre presente, ancho fijo. Estados: habilitado (en el centro + permiso clínico) · **En cola** (ya derivado) · **Visto por médico** · deshabilitado con el porqué en el `title` | El mock sólo dibuja el botón vacío; la app ya sabe si el paciente está en cola o lo vio el médico, y eso no se pierde. |
| 5 | Acción principal | Slot de 160 px. Por llegar → «Marcar llegada», Concurrió → «Iniciar atención», En atención → «Fin de atención», No vino → «Reprogramar» (con el guard de siempre), Realizada → hueco | Copy y forma del mock; los permisos y el cierre clínico, los de siempre. |
| 6 | Mini-calendario | `CalendarioPopover` (el de toda la app) + puntito en los días con visitas | Dos calendarios distintos para elegir una fecha divergen (lo dice el propio componente). El del mock no tiene desplegable de año. |
| 7 | Fin de semana | L–V por defecto; sáb/dom aparecen solos si el período tiene visitas esos días | Nunca esconder una visita (honestidad de datos). Sin control nuevo hasta que la Fundación defina qué días trabaja. |
| 8 | Persistencia de vista/fecha | URL: `?vista=semana&dia=2026-10-08`. Se conserva `dia` (no `fecha`) | Los links ya compartidos usan `dia`. |
| 9 | Panel de filtros | Dos columnas, aplica en vivo, conteo facetado; Estado conserva «Espera al médico» | Configuración elegida por el handoff; la opción de la cola existe en prod. |
| 10 | Filas en Día | Proto con `ProtoTag` (tono por protocolo), indicadores con `IndicadoresVisita` (no dibuja lo que no se sabe), nombre de la visita en el `title` del código | Átomos compartidos con la cola del médico y el modal; «lo que no se sabe no se dibuja». |
| 11 | Atajos ← → T/H D S M | Ignorados con foco en campo editable, con modificadores, con un modal (`aria-modal`) o popover abierto | El modal de la visita ya usa ↑↓/j-k; Ctrl K es del shell. |
| 12 | Carga | La barra queda siempre; «Cargando…» sólo en el cuerpo | Cambiar de día no hace parpadear toda la pantalla. |
| 13 | Rango Semana/Mes | `todasLasPaginas` con orden total por `id` | PostgREST corta en 1.000 con 200 OK; un mes ocupado no puede perder visitas en silencio. |
| 14 | Tokens nuevos | `--spira-med-line`, `--spira-med-line-hover`, `--spira-med-bg-hover` (+ oscuro) | Lo sugiere el handoff; nada de hex sueltos en el componente. |

**Complejidad:** toca >8 archivos y suma componentes (barra, panel, dos vistas). Es el tamaño del
handoff, no sobre-ingeniería: se reusan calendario, chips, átomos, buscador, menú ⋯ y la capa de datos;
no hay migración ni servicio nuevo. Se siguió como está.

---

## 3 · Casos borde cubiertos

- Visita marcada a las 23:30 AR (02:30 UTC del día siguiente): cae en SU día (offset fijo −03:00, el
  mismo de `motivosDelDia`).
- Visita citada para el 17 y atendida el 15: en el mes aparece sólo el 15 (la citación deja de mandar).
- 31 de enero + 1 mes = 28/29 de febrero, no 3 de marzo.
- Semana que cruza mes («29 sep – 3 oct») y año («29 dic – 2 ene» → año del final).
- Mes que arranca en domingo: 6 filas; febrero de 4 semanas exactas: 4.
- Filtro elegido que en el período nuevo no tiene visitas: la opción sigue en el panel (marcada, con 0)
  y su ficha sigue a la vista para poder sacarla.
- Contadores en 0 se ocultan, salvo el total.

## 4 · Tests (lo que falla en silencio)

`calendario.test.ts` y `filtrosVisitas.test.ts`: período/paso/rótulo, grilla del mes, días de una
visita (TZ, precedencia de `real_date`, recorte al rango), grupo (No vino → Finalizadas), fin de semana
automático, nombre corto, filtros AND/OR con «Espera al médico», conteo facetado y atajos. Lo visible
(alturas, colores, responsive) se verifica en el navegador.

## 5 · Fuera de alcance

- Barra flotante de exploración, encabezados B/C, `FilterChipsPanel`, `FilterMenuPanel`, `TweaksPanel`
  (descartados por el handoff).
- Celda del mes estilo «Resumen» (opcional en el handoff; no hay control para elegirla).
- Abrir el modal de una visita directo desde Semana/Mes (el handoff manda a Día).

---

## 6 · Verificación

- `npm run build` verde: 105 archivos de test, 1.897 tests (41 nuevos en `track/visitas/`, 4 en
  `dayVisitsFilter.test.ts`). Los de fecha corren igual con `TZ=UTC` y `TZ=Pacific/Kiritimati`.
- Banco de pruebas temporal (borrado antes del commit) con filas fabricadas para cada estado: Día a ancho
  completo, ≈760 px y ≈540 px (las acciones caen en la misma x en todas las filas, sin desbordes),
  Semana, Mes, fin de semana automático, panel de filtros (en vivo, facetado, Esc, foco), fichas,
  calendario desplegable (elegir un día no cambia la vista) y tema oscuro.
- **Pendiente:** QA con sesión contra datos reales (el preview arranca en el login y el agente no
  ingresa contraseñas).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng Review | `/plan-eng-review` | Handoff grande sobre una vista existente | 1 | CLEAR | 14 decisiones (§2), todas con la opción recomendada por pedido del Director |
| Outside voice | subagente adversarial sobre el diff | Segunda opinión antes de subir | 1 | CLEAR (tras corregir) | 7 hallazgos, los 7 corregidos |

Hallazgos de la segunda opinión, todos corregidos en esta misma rama:

1. **[P2]** Semana/Mes mostraban por un instante el período anterior recortado («0 visitas») al
   moverse: los datos del rango ahora vienen etiquetados (`claveRango`) y una etiqueta vieja es «cargando».
2. **[P2]** «Agregar visita» en Semana/Mes agendaba en una fecha no visible: el botón va sólo en el Día.
3. **[P3]** Resolver / recitar / reprogramar no refrescaban la grilla: `refrescar()` refresca la vista.
4. **[P3]** Las consultas del día corrían en Semana/Mes: `useVisitsForDay(null)` no consulta.
5. **[P3]** Los atajos les ganaban las flechas al `tablist` y a los menús: ahora se respetan.
6. **[P3]** «Espera al médico» contaba a los ya vistos (`mark_doctor_seen` no apaga `wants_doctor`).
7. **[P3]** Una falta con la ventana vencida dejaba de leerse «No vino» (`ventana_vencida` le gana a
   `por_reprogramar`): `esNoVino` mira también `no_show_at` con la etapa en «por llegar».

Más limpieza de la misma revisión: `diasEntre` sin uso afuera, `FechasDeVisita` deriva de `FechasVisita`,
una sola consulta de rango (`pedirRango`), `puedeReprogramar` compartido, `contarVisitas` retirado.

**VERDICT:** ENG CLEARED — implementado, verificado y listo para PR.

NO UNRESOLVED DECISIONS
