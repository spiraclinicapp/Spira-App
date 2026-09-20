# Reposición de corte a corte · Parte 2: pantallas, «Recibir un pedido» y limpieza — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner en uso el submódulo Reposición de Farmacia: la grilla de estudios; el estudio con su libro y su boleta; armar, imprimir y seguir el pedido; y «Recibir un pedido» en Recepción. Además, sacar la card vieja de Estadísticas y borrar de la base lo que ella usaba.

**Architecture:** Dos PRs y una migración de limpieza:

- **PR A** (Tasks 1-7) trae:
  - los ajustes del modelo que pidió la revisión de diseño (RD1-RD18);
  - un modelo nuevo y puro para lo que dicen la grilla y el estudio;
  - la migración aditiva `0133`;
  - la capa de datos.

  No cambia nada visible, igual que la Parte 1. La `0133` se aplica apenas se mergea.
- **PR B** (Tasks 8-13) trae las pantallas copiando el mock, «Recibir un pedido», la salida de la card y el borrado del modelo viejo.
- **`0136`** (Task 14) borra lo de la `0125`, **después** del deploy de la PR B.

**Tech Stack:** TypeScript strict, React 19, Supabase (PostgREST + plpgsql), vitest, PGlite para probar el SQL. Estilos inline con los tokens de `src/styles/tokens.css`, íconos Lucide vía `components/Icon`.

**Referencias:**

- **Spec:** [`docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md`](../specs/2026-09-16-reposicion-submodulo-design.md). Incluye la sección «Revisión de diseño» con RD1-RD18: leela entera antes de empezar.
- **Mock:** [`docs/design_handoff_reposicion_submodulo/`](../../design_handoff_reposicion_submodulo/), 27 artboards. `generar-artboards.mjs` tiene todos los valores literales. Lienzo: https://claude.ai/artifact/Hib7MiMExG8afRSK3GXC47.
- **Parte 1** (en prod: modelo + `0128`): [`docs/superpowers/plans/2026-09-16-reposicion-parte-1-modelo-y-base.md`](2026-09-16-reposicion-parte-1-modelo-y-base.md).

## Decisiones de este plan

Ninguna de estas decisiones está en el spec. Pasaron por la revisión de ingeniería del 2026-09-19, que sumó las suyas: ver «Revisión de ingeniería» al final del plan.

1. **Doble pedido: se resuelve con una marca por intento.** Era una decisión abierta de la revisión de diseño, y la recomendación era resolverla en la Parte 2.
   - «Armar pedido» genera un `uuid` al abrirse.
   - `emitir_pedido_medicacion` lo guarda en `pedidos_medicacion.intento` (único).
   - Un reintento con el mismo intento devuelve el pedido que ya quedó guardado.
   - Por eso el error de RD18 cambia: «No se pudo emitir el pedido. Probá de nuevo desde esta ventana: si ya había quedado hecho, no se repite.» («desde esta ventana» lo sumó la revisión de ingeniería: otra ventana trae otro intento.)
   - Sólo devuelve el guardado si el reintento pide lo mismo. Con otras cantidades, la base lo rechaza (revisión de ingeniería, 1).
   - Si se prefiere no hacerlo, se sacan la sección 1-2 de la `0133` y el `intento` de `ArmarPedido`. No toca nada más.
2. **Código de barras de la hoja: queda en `TODOS.md`** (la otra decisión abierta). Se pide la lista corta por número.
3. **RD6, con falta en el período en curso: tarea.** Si al período en curso le falta medicación (D31), la tarjeta pasa a modo tarea aunque falten más de 7 días para el corte. Si no, el modo tranquilo diría «Cubierto», y sería falso.
4. **RD1, sólo si al período que empezó le falta algo.** Dentro de los 5 días, un estudio sin pedido para ese período pasa a «pedido tarde» **sólo si** la cuenta tarde da algo para comprar. Si no le falta nada, no hay nada tarde que pedir, y la cuenta sigue siendo la del período que viene.
5. **El aviso del pedido tarde va una sola vez**, arriba de la tabla del estudio (el mismo renglón de información que el del período cerrado), y no debajo de cada boleta. El artboard «Boletas» lo muestra dentro de una boleta porque ahí la boleta aparece sola.
6. **La columna del resumen de recepción** dice «Pedido» la primera vez y «Faltaba» cuando el pedido ya tuvo alguna recepción. Muestra lo que faltaba de cada renglón, no lo pedido al principio.
7. **«Recibir un pedido» es de `leader`**, igual que «Nueva recepción»: `create_reception` exige `pharma leader`. Farmacia `operator` arma y emite pedidos pero no recibe.
8. **La grilla es siempre del período en curso.** Los períodos anteriores se miran desde el estudio (`?periodo=AAAA-MM-DD`, cualquier día del período). Volver a la grilla vuelve al período en curso.
9. **«Sin medicación habilitada»** se sigue diciendo, debajo de la tabla del estudio (y en la tarjeta de la grilla: revisión de ingeniería, 13). Es el aviso de la card vieja («N pacientes activos sin medicación habilitada: no están en la cuenta»), que el mock no dibuja pero que sin él deja la cuenta leyéndose completa cuando no lo está.
10. **El stock mínimo de cada medicamento se ve en la tabla del estudio** (pedido del Director, 2026-09-19, durante la revisión de ingeniería).
    - Columna «Mínimo», en el grupo «Para el que viene», antes de «Comprar». No está en el mock.
    - Es la suma de lo que reciben por mes los pacientes que lo tienen asignado (su cantidad propia o la del estudio) y siguen en el período para el que se compra. A demanda, es el «tener siempre».
    - Debajo del número, «12 pacientes» o «a demanda». Sin cargar, «no se compra» o en un período cerrado: «—».
    - Se llama «Mínimo» y no «Hacen falta»: con el pedido tarde, la boleta dice lo que le FALTA al período que empezó y la columna el período entero. Dos números distintos con el mismo nombre confundirían.

## Global Constraints

- **Idioma:** comentarios, nombres de dominio y copy en **castellano rioplatense**, con la densidad de comentarios del código vecino (el porqué, no el qué). En la UI, **Farmacia** (nunca «Pharma»).
- **Copy (RD12):**
  - Números con su nombre: «Pedido Nº 14» y «Recepción Nº 1051». En medio de una frase, «pedido» va en minúscula.
  - Fechas: «29/08 al 28/09», sin flecha.
  - «Alcanza» es de un medicamento, «Cubierto» de un estudio. «En camino» es lo pedido sin recibir.
  - «envases» completo, nunca «env.».
  - Avisos en una frase, sin tecnicismos.
- **Se copia la geometría del mock** (`generar-artboards.mjs`: tamaños, pesos, colores, espacios). Donde el mock y el spec difieran, manda el spec (sección «Revisión de diseño»).
- **Diseño:**
  - El realce es **elevación**, nunca un borde verde: `.spira-card-link` para tarjetas y botones chicos, `.spira-row-link spira-no-press` para filas.
  - Un borde inline que cambia con el estado va en **longhands** (`borderWidth`/`borderStyle`/`borderColor`), nunca mezclado con la abreviada.
  - El color es para significado (warn/good/danger con los tokens `--spira-acc-deep-*`).
- **Modelos puros** (`*Model.ts`): no importan `lib/supabase`.
  - Fechas `YYYY-MM-DD` sin zona. El «hoy» va por parámetro, en hora AR.
  - Tests con fechas fijas: **CI corre en UTC**.
- **Qué se testea** (criterio de `src/views/pharma/dispensaciones/estados.test.ts`): lo que falla **en silencio**. Eso incluye la cuenta, qué estado y qué texto elige cada tarjeta, la franja y el pedido. Lo visible (layout, estilos) se verifica mirando en el preview.
- **Roles:**
  - Ver y reimprimir: `pharma viewer` (o `gerencia` en la lectura del período).
  - Emitir, anular, «No va a llegar», reabrir, día de corte y «Cambiar cómo se repone»: `pharma operator`.
  - «Recibir un pedido»: `pharma leader`.
- **SQL:**
  - Calificar todo.
  - `gen_random_uuid()`, nunca `uuid_generate_v4()`.
  - **Cero pares de signos peso pegados en comentarios**.
  - Cada función nueva con `revoke all … from public` + `grant execute … to authenticated`.
  - Sentencias idempotentes: el editor de Supabase no comparte sesión ni transacción.
  - `create or replace` con **otra firma** deja una sobrecarga viva: primero `drop function` de la vieja.
  - Todo se prueba en **PGlite** antes de pasarlo.
- **Git:**
  - Trabajar en el worktree `C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2`, nunca en `main`.
  - Stagear **por ruta**.
  - Commits que terminan con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
  - PRs por API REST: no hay `gh`.
- **`supabase/README.md` es CRLF:** editarlo con la herramienta Edit, nunca desde Node ni con `sed -i`.
- **Tests puntuales** con `npx vitest run <archivo>`: `npm run test` suma los worktrees de otras sesiones.
- **Prod tiene datos reales:**
  - El QA es **de lectura**.
  - Emitir un pedido, cargar el día de corte o recibir un pedido en prod deja datos permanentes: **se pregunta antes** al Director, y si no, se cubre con tests.
  - Nunca se crean ni borran registros de prueba en lote.

## Mapa de archivos

| Archivo | Qué hace | Task |
|---|---|---|
| `src/data/pharma/periodoDeCorte.ts` | `textoPeriodo` con «al», ventana del pedido tarde (RD1), el período que se mira | 1 |
| `src/data/pharma/pedidosMedicacionModel.ts` | «Cerrado · no llegó», pastilla (RD8, RD17), recepciones de un pedido, textos, pedido de un período, lo que ve el asistente, lista de «Recibir» | 2 |
| `src/data/pharma/reposicionPeriodoModel.ts` | Objetivo por estudio (RD1), boleta tarde, copy RD12-RD13, `enCamino`, `pacientes`, `faltaEstePeriodo`, `minimo`, pedido del objetivo y los que deben | 3 |
| `src/data/pharma/reposicionTarjetaModel.ts` (nuevo) | Qué dicen la tarjeta (RD4-RD6), la franja (RD7), el subtítulo del período, el resumen del estudio y qué pedidos se listan | 4 |
| `src/data/pharma/index.ts` | Exporta el modelo nuevo | 4 |
| `supabase/migrations/0133_reposicion_parte_2.sql` (nuevo) | Intento de pedido (que compara lo que pide), el último pedido que vio la pantalla, la fecha de hoy, `cerrar_faltante_pedido` que no cierra lo que ya llegó, `reabrir_faltante_pedido`, `recepciones` en `reposicion_del_periodo`, `pedidos_por_recibir` | 5 |
| `src/data/pharma/reposicion.ts` | Período en la lectura, intento y último pedido visto, reabrir, `usePedidosPorRecibir`; y en la Task 12, se va lo de la card | 6, 12 |
| `src/modules/registry.ts`, `src/views/registry.tsx`, `src/views/registryKeys.ts`, `src/lib/router.ts`, `src/shell/AppShell.tsx` | El submódulo, su vista, su path y sin botón genérico | 10 |
| `src/views/pharma/reposicion/piezas.tsx` (nuevo) | Botón chico, rótulos de columna, punto de estado, número con unidad, pastilla, aviso, caja de estado, título de sección, `useAngosto` | 8 |
| `src/views/pharma/reposicion/ReposicionView.tsx` (nuevo) | El submódulo: URL, encabezado, estados, grilla o estudio | 10 |
| `src/views/pharma/reposicion/TarjetaDeEstudio.tsx` (nuevo) | La tarjeta de la grilla | 10 |
| `src/views/pharma/reposicion/DiaDeCorte.tsx` (nuevo) | El modal del día de corte (RD15) | 10 |
| `src/views/pharma/reposicion/PantallaEstudio.tsx` (nuevo) | El estudio: encabezado, flechas, resumen, tabla, pedidos | 9 |
| `src/views/pharma/reposicion/FilaMedicamento.tsx` (nuevo) | Renglón del libro con su mínimo y su boleta | 9 |
| `src/views/pharma/reposicion/CargarReposicion.tsx` (nuevo) | «Cargar cómo se repone», mudado de la card | 9 |
| `src/views/pharma/reposicion/ArmarPedido.tsx` (nuevo) | El modal de «Armar pedido» | 8 |
| `src/views/pharma/reposicion/HojaPedido.tsx` (nuevo) | La hoja A4 y el mecanismo de impresión | 8 |
| `src/views/pharma/reportes/impresion.tsx` | Exporta `FilaKv` | 8 |
| `src/views/pharma/reposicion/PedidoDetalle.tsx` (nuevo) | El pedido: renglones, «No va a llegar», «Reabrir», recepciones | 8 |
| `src/views/pharma/reposicion/AnularPedido.tsx` (nuevo) | Anular con motivo | 8 |
| `src/views/pharma/recepcion/RecibirPedido.tsx` (nuevo) | La lista de «Recibir un pedido» | 11 |
| `src/views/pharma/wizard/PedidoEnRecepcion.tsx` (nuevo) | Banner del pedido y comparación del resumen | 11 |
| `src/views/pharma/RecepcionView.tsx`, `ReceptionWizard.tsx`, `wizard/Step1Scan.tsx`, `recepcion/ReceptionCard.tsx`, `src/data/pharma/receptions.ts` | El botón, el asistente con pedido, «Pedido Nº» en la tarjeta | 11 |
| `src/views/pharma/reportes/ReportesView.tsx`, `ComprasDelMes.tsx` (borrar), `VerPedido.tsx` (borrar), `estilos.ts` | Sale la card | 12 |
| `src/data/pharma/reposicionModel.ts` + `.test.ts` | Se van la cuenta del mes y el pedido global; quedan las reglas compartidas | 12 |
| `docs/plan-reposicion-stock-minimo.md`, `TODOS.md` | Nota de reemplazo; el código de barras y el intento de `create_reception`, diferidos | 12 |
| `supabase/migrations/0136_reposicion_limpieza.sql` (nuevo) | Borra lo de la `0125` | 14 |
| `supabase/README.md` | Filas de la `0133` y la `0136` | 5, 14 |
| `CLAUDE.md` | La última migración aplicada pasa a `0133` y después a `0136` | 7, 14 |
| `<scratchpad>/pglite-0133/`, `<scratchpad>/pglite-0136/`, `<scratchpad>/sondas-*.mjs` (fuera del repo) | Bancos de prueba y sondas | 5, 7, 14 |

`<scratchpad>` es la carpeta temporal de la sesión que ejecuta. Los bancos y las sondas no se commitean (precedente: la `0128`).

## ⚠️ Orden de despliegue

1. **PR A** se mergea. **La `0133` es ADITIVA: se aplica apenas se mergea** (el que no anda sin ella es el front de la PR B). Después, sondas sin sesión y marca «Aplicada».
2. **PR B** se mergea **después** de que la `0133` esté aplicada y marcada. Vercel la despliega.
3. **Recién con la PR B en prod** se escribe y se pushea la `0136` (destructiva). **El archivo no se pushea antes**: una migración en el repo se aplica apenas alguien la ve (memoria `gotcha-migracion-front-primero-se-aplica-sola`). Si se aplicara antes del deploy, Estadísticas quedaría en blanco en prod.

**Numeración** (decisión del Director, 2026-09-19).

- El CI exige números contiguos (`scripts/check-migraciones.mjs`).
- La `0132` es la guarda de Recepción (PR #234, aplicada en prod el 2026-09-19). Esta parte usa la `0133` (aditiva, Task 5) y la `0136` (limpieza, Task 14).
- La Task 5 lo verifica antes de crear el archivo.

---

# PR A · modelo, `0133` y datos (sin pantallas)

### Task 1: El período — texto con «al», ventana del pedido tarde y período que se mira

**Files:**
- Modify: `src/data/pharma/periodoDeCorte.ts`
- Test: `src/data/pharma/periodoDeCorte.test.ts`

**Interfaces:**
- Consumes: `periodoDe`, `sumarDias`, `diaMes` (existen).
- Produces:
  - `textoPeriodo(p: Periodo): string` → `'29/08 al 28/09'` (antes `'29/08 → 28/09'`)
  - `const DIAS_PARA_PEDIR_TARDE = 5`
  - `interface VentanaTarde { corte: string; hasta: string; quedan: number }`
  - `ventanaTarde(hoy: string, diaCorte: number): VentanaTarde | null`
  - `periodoAMirar(hoy: string, diaCorte: number, fecha: string): Periodo`

- [ ] **Step 1: Crear el worktree de la PR A**

Con la PR del plan ya mergeada (trae el spec con la revisión y este archivo):

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App"
git fetch origin
git worktree add -b feat/reposicion-parte-2-base ../wt-reposicion-2 origin/main
cd ../wt-reposicion-2
npm ci
git branch --show-current
```

Expected: `feat/reposicion-parte-2-base`, y `npm ci` sin errores.

- [ ] **Step 2: Escribir los tests que fallan**

En `src/data/pharma/periodoDeCorte.test.ts`, sumar `periodoAMirar` y `ventanaTarde` al import de `./periodoDeCorte`:

```ts
import {
  corteDelMes, diasHastaElCorte, enCurso, esDiaDeCorteValido, periodoAMirar, periodoAnterior, periodoDe, periodoSiguiente,
  textoPeriodo, ultimoDiaDelMes, ventanaTarde,
} from './periodoDeCorte'
```

Cambiar la expectativa del texto (RD12: sin flecha, que el lector de pantalla lee en voz alta):

```ts
  it('texto del período', () => {
    expect(textoPeriodo(p)).toBe('29/08 al 28/09')
  })
```

Y agregar al final del archivo:

```ts
describe('ventanaTarde (RD1)', () => {
  it('el día siguiente al corte abre la ventana de 5 días', () => {
    expect(ventanaTarde('2026-09-29', 28)).toEqual({ corte: '2026-09-28', hasta: '2026-10-03', quedan: 5 })
  })
  it('cuenta hacia atrás, y el último día queda 1', () => {
    expect(ventanaTarde('2026-10-01', 28)?.quedan).toBe(3)
    expect(ventanaTarde('2026-10-03', 28)?.quedan).toBe(1)
  })
  it('el sexto día ya no es ventana, y el día del corte tampoco: ese día se pide el que viene', () => {
    expect(ventanaTarde('2026-10-04', 28)).toBeNull()
    expect(ventanaTarde('2026-09-28', 28)).toBeNull()
  })
  it('cruza el mes: con corte 31, el de enero abre la ventana en febrero', () => {
    expect(ventanaTarde('2027-02-01', 31)).toEqual({ corte: '2027-01-31', hasta: '2027-02-05', quedan: 5 })
  })
})

describe('periodoAMirar', () => {
  const EN_CURSO = { desde: '2026-08-29', hasta: '2026-09-28' }
  it('sin fecha, con basura, o con una del período en curso o posterior: el período en curso', () => {
    expect(periodoAMirar('2026-09-16', 28, '')).toEqual(EN_CURSO)
    expect(periodoAMirar('2026-09-16', 28, 'basura')).toEqual(EN_CURSO)
    expect(periodoAMirar('2026-09-16', 28, '2026-09-01')).toEqual(EN_CURSO)
    expect(periodoAMirar('2026-09-16', 28, '2026-12-01')).toEqual(EN_CURSO)
  })
  it('una fecha anterior mira el período que la contiene', () => {
    expect(periodoAMirar('2026-09-16', 28, '2026-08-10')).toEqual({ desde: '2026-07-29', hasta: '2026-08-28' })
  })
})
```

- [ ] **Step 3: Correrlos y ver que fallan**

Run: `npx vitest run src/data/pharma/periodoDeCorte.test.ts`
Expected: FAIL. `ventanaTarde`/`periodoAMirar` no existen, y el texto sigue diciendo `29/08 → 28/09`.

- [ ] **Step 4: Implementar**

En `src/data/pharma/periodoDeCorte.ts`, reemplazar `textoPeriodo`:

```ts
/** `29/08 al 28/09` (RD12: sin flecha, que el lector de pantalla lee en voz alta). */
export function textoPeriodo(p: Periodo): string {
  return `${diaMes(p.desde)} al ${diaMes(p.hasta)}`
}
```

Y agregar al final del archivo:

```ts
/**
 * RD1 · Pedido tarde. Hasta 5 días después del corte, el período que empezó todavía se puede pedir
 * (a sí mismo): la farmacéutica que no llegó a pedir el día del corte no tiene que esperar un mes. El
 * siguiente se pide en el próximo corte. Un pedido por período, siempre con el suyo.
 */
export const DIAS_PARA_PEDIR_TARDE = 5

export interface VentanaTarde {
  /** El día de corte que acaba de pasar. */
  corte: string
  /** Último día para pedir el período que empezó, inclusive. */
  hasta: string
  /** Días que quedan contando hoy: 5 el día siguiente al corte, 1 el último. */
  quedan: number
}

/** `null` fuera de la ventana. El día del corte NO es ventana: ese día se pide el período que viene. */
export function ventanaTarde(hoy: string, diaCorte: number): VentanaTarde | null {
  const p = periodoDe(hoy, diaCorte)
  const hasta = sumarDias(p.desde, DIAS_PARA_PEDIR_TARDE - 1)
  if (hoy > hasta) return null
  return { corte: sumarDias(p.desde, -1), hasta, quedan: Math.round((diaUTC(hasta) - diaUTC(hoy)) / 86_400_000) + 1 }
}

/**
 * El período que muestra el estudio: el que contiene `fecha` (viene de `?periodo=` en la URL) si es
 * ANTERIOR al en curso. Vacía, mal formada o del presente en adelante: el período en curso. La flecha ›
 * no pasa del presente, y una URL editada a mano tampoco.
 */
export function periodoAMirar(hoy: string, diaCorte: number, fecha: string): Periodo {
  const actual = periodoDe(hoy, diaCorte)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha >= actual.desde) return actual
  return periodoDe(fecha, diaCorte)
}
```

`diaUTC` ya existe en el archivo (lo usa `diasHastaElCorte`) y está declarado antes. Si el typecheck
dice que se usa antes de declararse, mové `ventanaTarde` debajo de `diaUTC`.

- [ ] **Step 5: Correrlos y ver que pasan**

Run: `npx vitest run src/data/pharma/periodoDeCorte.test.ts`
Expected: PASS, todos.

- [ ] **Step 6: Commit**

```bash
git add src/data/pharma/periodoDeCorte.ts src/data/pharma/periodoDeCorte.test.ts
git commit -m "feat(reposicion): ventana del pedido tarde y período con «al» (RD1, RD12)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Los pedidos — «Cerrado · no llegó», la pastilla, sus recepciones y lo que ve Recepción

**Files:**
- Modify (reescritura entera): `src/data/pharma/pedidosMedicacionModel.ts`
- Test (reescritura entera): `src/data/pharma/pedidosMedicacionModel.test.ts`

**Interfaces:**
- Consumes: `diaMes`, `envasesTxt` de `./reposicionModel`; `Periodo` de `./periodoDeCorte`.
- Produces (lo que no se nombra acá sigue igual que en la Parte 1):
  - `interface RecepcionDePedidoInsumo { id; pedido_id; folio: number; reception_date: string; status: 'pendiente' | 'verificada'; verified_by_name: string | null; envases: number }`
  - `type EstadoPedido = 'sin_recibir' | 'en_parte' | 'recibido' | 'no_llego' | 'anulado'`
  - `PedidoMedicacion` suma `recepciones: RecepcionDePedidoInsumo[]` (por folio, sin las anuladas)
  - `armarPedidos(pedidos, items, recepciones = [])`
  - `type ClavePastilla = 'sin_recibir' | 'llego' | 'en_parte' | 'recibido' | 'no_llego' | 'anulado'`
  - `interface PastillaPedido { clave: ClavePastilla; texto: string }`
  - `pastillaDePedido(p: PedidoMedicacion): PastillaPedido`
  - `pedidoPara(pedidos: readonly PedidoMedicacion[], periodo: Periodo): PedidoMedicacion | null` → el más nuevo que todavía debe algo; si ninguno debe, el más nuevo
  - `seSuperpone(p: PedidoMedicacionInsumo, periodo: Periodo): boolean`
  - `ultimoPedidoPara(pedidos: readonly PedidoMedicacionInsumo[], periodo: Periodo): number` → el número del último no anulado del período, 0 si ninguno (viaja como `p_ultimo_visto`)
  - `textoDePedidos(pedidos)` → `'pedido Nº 14 del 28/09'` · `'pedidos Nº 13 y Nº 14'` (minúscula)
  - `numerosDePedidos(pedidos: readonly { numero: number }[]): string` → `'Pedido Nº 13'` · `'Pedidos Nº 12 y Nº 13'`
  - `faltaTxt(n: number): string` → `'falta 1 envase'` · `'faltan 13 envases'`
  - `textoDeRecepciones(folios: readonly number[]): string` → `'Recepción Nº 1051'` · `'Recepciones Nº 1051 y Nº 1052'`
  - `sinVerificarDe(pedidos, protocolId, medicationId): number[] | null` → los números de las recepciones sin verificar de lo en camino de ese medicamento (`[]` si la base no los trae; `null` si no hay ninguna)
  - `faltaVerificarTxt(folios: readonly number[]): string` → `'llegó, falta verificar la recepción Nº 1051'` (RD17, para la boleta)
  - `textoParaRecibir(p: PedidoMedicacion): string` → `'Emitido el 28/09 · faltan 13 envases de 2 medicamentos'`
  - `porRecibir(r: RenglonPedido): number` → lo que falta sin lo que ya está en una recepción sin verificar; `porRecibirDe(p: PedidoMedicacion): number` → su suma
  - `notaDeReimpresion(r: RenglonPedido): string | null` → `'recibido 5 · falta 1'` · `'no va a llegar'` · null si no llegó nada
  - `metaDelPedido(p: PedidoMedicacion, medicationId: string, otros: readonly PedidoMedicacion[] = []): { texto: string; aviso: boolean }`
  - `interface FilaComparacion { medicationId; nombre; esperado: number | null; llega: number; nota: string; aviso: boolean }`
  - `comparacionConElPedido(p, llegan: readonly { medicationId: string; name: string; quantity: number }[], otros: readonly PedidoMedicacion[] = []): FilaComparacion[]`
  - `encabezadoDeLoEsperado(p: PedidoMedicacion): 'Pedido' | 'Faltaba'`
  - `interface InsumosPorRecibir { estudios: { id: string; code: string; name: string }[]; pedidos; pedido_items; recepciones }`
  - `interface PedidoPorRecibir { pedido: PedidoMedicacion; estudio: { id: string; code: string; name: string }; otrosDelEstudio: PedidoMedicacion[] }`
  - `armarPorRecibir(i: InsumosPorRecibir): PedidoPorRecibir[]`
  - **Se van** `etiquetaEstado` (la reemplaza `pastillaDePedido`) y `pedidoDestacado` (la reemplazan `pedidoPara` y los pedidos que deben, Task 3). Ninguna pantalla las usa: la Parte 1 no tiene pantallas.

- [ ] **Step 1: Reescribir el test**

`src/data/pharma/pedidosMedicacionModel.test.ts`, entero:

```ts
import { describe, expect, it } from 'vitest'
import {
  armarPedidos, armarPorRecibir, comparacionConElPedido, encabezadoDeLoEsperado, faltaTxt, faltaVerificarTxt, faltanteDe,
  metaDelPedido, notaDeReimpresion, numerosDePedidos, pastillaDePedido, pedidoPara, pedidosParaRecibir, porRecibirDe,
  renglonesParaRecibir, sinVerificarDe, textoDePedidos, textoDeRecepciones, textoParaRecibir, ultimoPedidoPara, yaPedidoDe,
  type PedidoItemInsumo, type PedidoMedicacionInsumo, type RecepcionDePedidoInsumo,
} from './pedidosMedicacionModel'

/**
 * Pedidos de medicación (spec 2026-09-16, R8-R11 y la revisión de diseño RD2-RD4, RD8, RD17, RD18).
 *
 * Se testea porque el estado del pedido se DEDUCE de lo recibido y nadie lo marca a mano: un faltante mal
 * contado deja envases «en camino» para siempre y la compra sale corta, y una pastilla mal elegida dice
 * «Sin recibir» de algo que está en la casa sin verificar. Ninguna de las dos cosas se ve rara en pantalla.
 */

const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-28', emitido_por_nombre: 'Lautaro Molina',
  anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-seretide', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 4, pedido: 6, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const salbutral = (p: Partial<PedidoItemInsumo> = {}) =>
  item({ id: 'it-salbu', medication_id: 'salbu', medication_name: 'Salbutral 100 mcg', calculado: 7, pedido: 7, ...p })
const recepcion = (p: Partial<RecepcionDePedidoInsumo> = {}): RecepcionDePedidoInsumo => ({
  id: 'rec-1051', pedido_id: 'ped-14', folio: 1051, reception_date: '2026-10-02', status: 'verificada',
  verified_by_name: 'Agustín Bazzani', envases: 12, ...p,
})
const CERRADO = { cerrado_at: '2026-10-05T14:00:00+00:00', cerrado_por_nombre: 'Lautaro Molina', cerrado_motivo: 'no_lo_tiene' as const }
const ANULADO = { anulado_at: '2026-09-28T15:00:00+00:00', anulado_por_nombre: 'Lautaro Molina', anulado_motivo: 'por_error' as const }
const PROXIMO = { desde: '2026-09-29', hasta: '2026-10-28' }

describe('faltanteDe', () => {
  it('es lo pedido menos lo recibido', () => {
    expect(faltanteDe(item())).toBe(6)
    expect(faltanteDe(item({ recibido: 4 }))).toBe(2)
  })
  it('recibir de más no da negativo', () => {
    expect(faltanteDe(item({ recibido: 8 }))).toBe(0)
  })
  it('un renglón cerrado con «No va a llegar» no tiene faltante (R11)', () => {
    expect(faltanteDe(item({ recibido: 5, ...CERRADO }))).toBe(0)
  })
})

describe('estado y pastilla del pedido (RD3, RD8, RD17)', () => {
  const uno = (c: Partial<PedidoMedicacionInsumo>, items: PedidoItemInsumo[], recepciones: RecepcionDePedidoInsumo[] = []) =>
    armarPedidos([cab(c)], items, recepciones)[0]

  it('sin nada recibido: sin recibir', () => {
    const p = uno({}, [item(), salbutral()])
    expect(p).toMatchObject({ estado: 'sin_recibir', pedidoTotal: 13, faltanteTotal: 13, recibidoTotal: 0 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'sin_recibir', texto: 'Sin recibir' })
  })
  it('algo recibido y algo faltante: recibido en parte', () => {
    const p = uno({}, [item({ recibido: 6 }), salbutral({ recibido: 2 })])
    expect(p).toMatchObject({ estado: 'en_parte', faltanteTotal: 5, recibidoTotal: 8 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'en_parte', texto: 'Recibido en parte' })
  })
  it('todo recibido: recibido', () => {
    const p = uno({}, [item({ recibido: 6 })])
    expect(p.estado).toBe('recibido')
    expect(pastillaDePedido(p)).toEqual({ clave: 'recibido', texto: 'Recibido' })
  })
  it('lo que no va a llegar cierra el pedido y dice cuánto faltó', () => {
    const p = uno({}, [item({ recibido: 5, ...CERRADO })])
    expect(p).toMatchObject({ estado: 'recibido', faltanteTotal: 0, faltoCerrado: 1 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'recibido', texto: 'Recibido · faltó 1' })
  })
  it('si se cerró todo y no llegó nada: «Cerrado · no llegó», nunca «recibido» (RD3)', () => {
    const p = uno({}, [item({ ...CERRADO }), salbutral({ ...CERRADO })])
    expect(p).toMatchObject({ estado: 'no_llego', faltanteTotal: 0, faltoCerrado: 13 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'no_llego', texto: 'Cerrado · no llegó' })
  })
  it('una recepción sin verificar le gana a «sin recibir» y a «en parte» (RD17)', () => {
    expect(pastillaDePedido(uno({}, [item({ sin_verificar: 6 })]))).toEqual({ clave: 'llego', texto: 'Llegó, falta verificar' })
    expect(pastillaDePedido(uno({}, [item({ recibido: 2, sin_verificar: 4 })])).clave).toBe('llego')
  })
  it('recibido entero no dice «llegó» aunque haya otra recepción pendiente', () => {
    expect(pastillaDePedido(uno({}, [item({ recibido: 6, sin_verificar: 2 })])).clave).toBe('recibido')
  })
  it('un pedido anulado no tiene faltante ni «faltó», aunque tenga un renglón cerrado', () => {
    const p = uno(ANULADO, [item({ recibido: 5, ...CERRADO })])
    expect(p).toMatchObject({ estado: 'anulado', faltanteTotal: 0, faltoCerrado: 0 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'anulado', texto: 'Anulado' })
  })
  it('avisa si tiene una recepción sin verificar', () => {
    expect(uno({}, [item({ sin_verificar: 6 })]).conRecepcionSinVerificar).toBe(true)
    expect(uno({}, [item()]).conRecepcionSinVerificar).toBe(false)
  })
  it('junta sus recepciones por número, y sólo las suyas', () => {
    const p = uno({}, [item()], [recepcion({ id: 'r2', folio: 1060 }), recepcion(), recepcion({ id: 'otra', pedido_id: 'ped-99', folio: 1 })])
    expect(p.recepciones.map((r) => r.folio)).toEqual([1051, 1060])
  })
  it('ordena los pedidos del más nuevo al más viejo y los renglones por nombre', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-13', numero: 13 }), cab()],
      [salbutral(), item(), item({ id: 'it-13', pedido_id: 'ped-13' })],
    )
    expect(ps.map((p) => p.numero)).toEqual([14, 13])
    expect(ps[0].renglones.map((r) => r.medication_name)).toEqual(['Salbutral 100 mcg', 'Seretide 250/50'])
  })
})

describe('el pedido de un período', () => {
  it('el más nuevo que se le superpone, aunque ya esté recibido', () => {
    const ps = armarPedidos([cab({ id: 'ped-13', numero: 13 }), cab()], [item({ id: 'i13', pedido_id: 'ped-13', recibido: 6 }), item({ recibido: 6 })])
    expect(pedidoPara(ps, PROXIMO)?.numero).toBe(14)
  })
  it('por SUPERPOSICIÓN: lo sigue reconociendo si el corte se movió después de emitir (RD15)', () => {
    expect(pedidoPara(armarPedidos([cab({ periodo_desde: '2026-09-27', periodo_hasta: '2026-10-26' })], [item()]), PROXIMO)?.numero).toBe(14)
  })
  it('el del período en curso no es el del que viene', () => {
    expect(pedidoPara(armarPedidos([cab({ periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' })], [item()]), PROXIMO)).toBeNull()
  })
  it('un anulado no cuenta', () => {
    expect(pedidoPara(armarPedidos([cab(ANULADO)], [item()]), PROXIMO)).toBeNull()
  })
  it('con dos del mismo período, primero el que todavía debe: uno chico ya recibido no tapa al grande', () => {
    const ps = armarPedidos([cab(), cab({ id: 'ped-15', numero: 15 })], [item(), item({ id: 'i15', pedido_id: 'ped-15', pedido: 3, recibido: 3 })])
    expect(pedidoPara(ps, PROXIMO)?.numero).toBe(14)
  })
})

describe('el último pedido que vio la pantalla (concurrencia al emitir)', () => {
  it('el número más alto de los no anulados del período; 0 si no hay', () => {
    const cabs = [cab(), cab({ id: 'ped-15', numero: 15 }), cab({ id: 'ped-16', numero: 16, ...ANULADO }), cab({ id: 'ped-9', numero: 9, periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' })]
    expect(ultimoPedidoPara(cabs, PROXIMO)).toBe(15)
    expect(ultimoPedidoPara([], PROXIMO)).toBe(0)
  })
})

describe('lo ya pedido de un medicamento (R9)', () => {
  const pedidos = () => armarPedidos(
    [
      cab({ id: 'ped-13', numero: 13, emitido_el: '2026-08-28' }),
      cab(),
      cab({ id: 'ped-15', numero: 15, ...ANULADO }),
      cab({ id: 'ped-16', numero: 16, protocol_id: 'lts' }),
    ],
    [
      item({ id: 'i13', pedido_id: 'ped-13', pedido: 4, recibido: 3 }),
      item(),
      item({ id: 'i15', pedido_id: 'ped-15' }),
      item({ id: 'i16', pedido_id: 'ped-16' }),
    ],
  )
  it('suma el faltante de los pedidos abiertos del estudio, el más viejo primero', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'seretide')).toEqual({
      envases: 7,
      pedidos: [{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }],
    })
  })
  it('otro medicamento no tiene nada pedido', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'salbu')).toEqual({ envases: 0, pedidos: [] })
  })
})

describe('textos', () => {
  it('lo en camino de la boleta va en minúscula: está en medio de un renglón (RD12)', () => {
    expect(textoDePedidos([{ numero: 14, emitido_el: '2026-09-28' }])).toBe('pedido Nº 14 del 28/09')
    expect(textoDePedidos([{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }])).toBe('pedidos Nº 13 y Nº 14')
    expect(textoDePedidos([
      { numero: 12, emitido_el: '2026-07-28' }, { numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' },
    ])).toBe('pedidos Nº 12, Nº 13 y Nº 14')
  })
  it('el renglón de la tarjeta encabeza, sin fecha (RD4)', () => {
    expect(numerosDePedidos([{ numero: 13 }])).toBe('Pedido Nº 13')
    expect(numerosDePedidos([{ numero: 12 }, { numero: 13 }])).toBe('Pedidos Nº 12 y Nº 13')
  })
  it('lo que falta y las recepciones, en singular y en plural', () => {
    expect(faltaTxt(1)).toBe('falta 1 envase')
    expect(faltaTxt(13)).toBe('faltan 13 envases')
    expect(textoDeRecepciones([1051])).toBe('Recepción Nº 1051')
    expect(textoDeRecepciones([1051, 1052])).toBe('Recepciones Nº 1051 y Nº 1052')
    expect(textoDeRecepciones([])).toBe('Una recepción')
  })
  it('lo en camino que ya llegó y falta verificar (RD17)', () => {
    expect(faltaVerificarTxt([1051])).toBe('llegó, falta verificar la recepción Nº 1051')
    expect(faltaVerificarTxt([1051, 1052])).toBe('llegaron, falta verificar las recepciones Nº 1051 y Nº 1052')
    const ps = armarPedidos([cab()], [item({ sin_verificar: 6 })], [recepcion({ status: 'pendiente', verified_by_name: null })])
    expect(sinVerificarDe(ps, 'endura', 'seretide')).toEqual([1051])
    expect(sinVerificarDe(ps, 'endura', 'salbu')).toBeNull()
    expect(sinVerificarDe(armarPedidos([cab()], [item()]), 'endura', 'seretide')).toBeNull()
  })
})

describe('Recepción: qué se puede recibir (R10)', () => {
  it('sólo los pedidos no anulados con faltante, del más viejo al más nuevo', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-11', numero: 11 }), cab({ id: 'ped-12', numero: 12 }), cab({ id: 'ped-13', numero: 13, ...ANULADO }), cab()],
      [
        item({ id: 'i11', pedido_id: 'ped-11' }),
        item({ id: 'i12', pedido_id: 'ped-12', recibido: 6 }),
        item({ id: 'i13', pedido_id: 'ped-13' }),
        item(),
      ],
    )
    expect(pedidosParaRecibir(ps).map((p) => p.numero)).toEqual([11, 14])
  })
  it('precarga sólo los renglones con faltante, con lo que falta', () => {
    const p = armarPedidos([cab()], [
      item({ recibido: 2 }),
      salbutral({ recibido: 7 }),
      item({ id: 'it-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', pedido: 3, ...CERRADO }),
    ])[0]
    expect(renglonesParaRecibir(p)).toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', cantidad: 4 }])
  })
  it('no vuelve a precargar lo que ya está en una recepción sin verificar (revisión de ingeniería, 8)', () => {
    const p = armarPedidos([cab()], [item({ sin_verificar: 4 }), salbutral({ sin_verificar: 7 })])[0]
    expect(renglonesParaRecibir(p)).toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', cantidad: 2 }])
    expect(porRecibirDe(p)).toBe(2)
    expect(porRecibirDe(armarPedidos([cab()], [item({ sin_verificar: 6 })])[0])).toBe(0)
  })
  it('la lista dice cuándo se emitió y cuánto falta de cuántos medicamentos', () => {
    expect(textoParaRecibir(armarPedidos([cab()], [item(), salbutral()])[0])).toBe('Emitido el 28/09 · faltan 13 envases de 2 medicamentos')
    expect(textoParaRecibir(armarPedidos([cab()], [item({ recibido: 5 }), salbutral({ recibido: 7 })])[0]))
      .toBe('Emitido el 28/09 · falta 1 envase de 1 medicamento')
  })
  it('arma la lista con el estudio de cada pedido y sus recepciones', () => {
    const lista = armarPorRecibir({
      estudios: [{ id: 'endura', code: '222714', name: 'ENDURA' }],
      pedidos: [cab(), cab({ id: 'ped-13', numero: 13 })],
      pedido_items: [item(), item({ id: 'i13', pedido_id: 'ped-13' })],
      recepciones: [recepcion({ status: 'pendiente', verified_by_name: null })],
    })
    expect(lista.map((x) => [x.pedido.numero, x.estudio.code])).toEqual([[13, '222714'], [14, '222714']])
    expect(lista[1].pedido.recepciones.map((r) => r.folio)).toEqual([1051])
    expect(lista[0].otrosDelEstudio.map((o) => o.numero)).toEqual([14])
  })
})

describe('el asistente recibiendo un pedido (R10, RD18)', () => {
  const p = () => armarPedidos([cab()], [item({ recibido: 5 }), salbutral()])[0]
  it('al lado de cada medicamento dice qué se pidió', () => {
    expect(metaDelPedido(p(), 'salbu')).toEqual({ texto: 'se pidieron 7', aviso: false })
    expect(metaDelPedido(p(), 'seretide')).toEqual({ texto: 'falta 1 de 6', aviso: false })
    expect(metaDelPedido(p(), 'budeso')).toEqual({ texto: 'No estaba en el pedido', aviso: true })
  })
  it('lo que ya no faltaba se recibe igual, avisado', () => {
    expect(metaDelPedido(armarPedidos([cab()], [item({ recibido: 6 })])[0], 'seretide')).toEqual({ texto: 'No faltaba', aviso: true })
  })
  it('el resumen compara lo que faltaba con lo que llega', () => {
    expect(comparacionConElPedido(p(), [
      { medicationId: 'salbu', name: 'Salbutral 100 mcg', quantity: 7 },
      { medicationId: 'budeso', name: 'Budesonida 200 mcg', quantity: 2 },
    ])).toEqual([
      { medicationId: 'salbu', nombre: 'Salbutral 100 mcg', esperado: 7, llega: 7, nota: 'Completo', aviso: false },
      { medicationId: 'seretide', nombre: 'Seretide 250/50', esperado: 1, llega: 0, nota: 'Queda 1 en camino', aviso: true },
      { medicationId: 'budeso', nombre: 'Budesonida 200 mcg', esperado: null, llega: 2, nota: 'No estaba en el pedido: se recibe igual', aviso: true },
    ])
  })
  it('de más también se dice, y el plural se respeta', () => {
    const filas = comparacionConElPedido(armarPedidos([cab()], [item(), salbutral()])[0], [
      { medicationId: 'seretide', name: 'Seretide 250/50', quantity: 3 },
      { medicationId: 'salbu', name: 'Salbutral 100 mcg', quantity: 9 },
    ])
    expect(filas.map((f) => f.nota)).toEqual(['Completo, con 2 de más', 'Quedan 3 en camino'])
  })
  it('la columna dice «Pedido» la primera vez y «Faltaba» si ya llegó algo', () => {
    expect(encabezadoDeLoEsperado(armarPedidos([cab()], [item()])[0])).toBe('Pedido')
    expect(encabezadoDeLoEsperado(p())).toBe('Faltaba')
  })
  it('si lo espera otro pedido del estudio, lo nombra (revisión de ingeniería, 9)', () => {
    const trece = armarPedidos([cab({ id: 'ped-13', numero: 13 })], [
      item({ id: 'i13', pedido_id: 'ped-13', medication_id: 'budeso', medication_name: 'Budesonida 200 mcg', pedido: 2 }),
    ])
    expect(metaDelPedido(p(), 'budeso', trece)).toEqual({ texto: 'Se debe en el Pedido Nº 13: recibilo con ese', aviso: true })
    expect(comparacionConElPedido(p(), [{ medicationId: 'budeso', name: 'Budesonida 200 mcg', quantity: 2 }], trece).at(-1)?.nota)
      .toBe('Se debe en el Pedido Nº 13: recibilo con ese')
    const treceSeretide = armarPedidos([cab({ id: 'ped-13', numero: 13 })], [item({ id: 'i13', pedido_id: 'ped-13', pedido: 2 })])
    expect(comparacionConElPedido(p(), [{ medicationId: 'seretide', name: 'Seretide 250/50', quantity: 3 }], treceSeretide)[1])
      .toMatchObject({ nota: 'Completo, con 2 de más: se deben en el Pedido Nº 13', aviso: true })
  })
  it('lo que llega de un renglón que ya no faltaba se dice así, no «de más»', () => {
    const lleno = armarPedidos([cab()], [item({ recibido: 6 })])[0]
    expect(comparacionConElPedido(lleno, [{ medicationId: 'seretide', name: 'Seretide 250/50', quantity: 2 }]))
      .toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', esperado: 0, llega: 2, nota: 'No faltaba: se recibe igual', aviso: true }])
  })
})

describe('la hoja reimpresa (revisión de ingeniería, 10)', () => {
  it('cada renglón dice lo que ya llegó, lo que falta y lo que no va a llegar', () => {
    const p = armarPedidos([cab()], [
      item({ recibido: 5 }),
      salbutral({ recibido: 7 }),
      item({ id: 'it-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', pedido: 3, ...CERRADO }),
    ])[0]
    expect(p.renglones.map((r) => [r.medication_name, notaDeReimpresion(r)])).toEqual([
      ['Montelukast 10 mg', 'no va a llegar'],
      ['Salbutral 100 mcg', 'recibido 7'],
      ['Seretide 250/50', 'recibido 5 · falta 1'],
    ])
  })
  it('sin nada recibido, el renglón queda como en la hoja original', () => {
    expect(notaDeReimpresion(armarPedidos([cab()], [item()])[0].renglones[0])).toBeNull()
  })
})
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run src/data/pharma/pedidosMedicacionModel.test.ts`
Expected: FAIL. Faltan exportaciones (`pastillaDePedido`, `pedidoPara`, …) y `textoDePedidos` sigue en mayúscula.

- [ ] **Step 3: Reescribir el modelo**

`src/data/pharma/pedidosMedicacionModel.ts`, entero:

```ts
import { diaMes, envasesTxt } from './reposicionModel'
import type { Periodo } from './periodoDeCorte'

/**
 * ┌─ Pedidos de medicación (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md, R8-R11) ─┐
 *
 * Farmacia arma un pedido por estudio, lo imprime con número, va a la farmacia y vuelve con la
 * medicación. La Recepción lo recibe, y el estado del pedido SE DEDUCE de lo recibido: nadie marca
 * «llegó» a mano.
 *
 *   por renglón:  recibido = Σ recepciones VERIFICADAS de ese pedido y medicamento   (lo trae la 0128)
 *                 faltante = cerrado («No va a llegar») ? 0 : max(0, pedido − recibido)
 *   por pedido:   anulado → anulado · con faltante → en parte o sin recibir
 *                 sin faltante → recibido, o «no llegó» si se cerró todo sin recibir nada (RD3)
 *
 * La PASTILLA (RD8) es una sola en toda la app, y «Llegó, falta verificar» (RD17) le gana a «Sin
 * recibir» y a «Recibido en parte»: hay medicación en la casa que todavía no entró al stock, y
 * recibirla de nuevo la duplicaría.
 *
 * Una recepción anulada deja de sumar en la base, así que el pedido vuelve a tener faltante solo.
 * Lo ya pedido (faltante abierto) se descuenta de la compra (R9) y se llama «En camino» (RD12).
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type MotivoCierre = 'no_lo_tiene' | 'discontinuado' | 'no_hace_falta'
export type MotivoAnulacion = 'por_error' | 'rehecho'

/** Los mismos valores que el check de `pedido_medicacion_items.cerrado_motivo` (0128). */
export const MOTIVOS_CIERRE: readonly { value: MotivoCierre; label: string }[] = [
  { value: 'no_lo_tiene', label: 'La farmacia no lo tiene' },
  { value: 'discontinuado', label: 'Lo discontinuaron' },
  { value: 'no_hace_falta', label: 'Ya no hace falta' },
]

/** Los mismos valores que el check de `pedidos_medicacion.anulado_motivo` (0128). */
export const MOTIVOS_ANULACION: readonly { value: MotivoAnulacion; label: string }[] = [
  { value: 'por_error', label: 'Se emitió por error' },
  { value: 'rehecho', label: 'Se rehízo con otras cantidades' },
]

/** Una fila de `pedidos_medicacion` (0128). */
export interface PedidoMedicacionInsumo {
  id: string
  /** Correlativo y legible («Nº 14»). */
  numero: number
  protocol_id: string
  /** El período PARA el que se pidió. */
  periodo_desde: string
  periodo_hasta: string
  /** Día de emisión en hora AR. */
  emitido_el: string
  /** Snapshot del nombre: la RLS de `users` sólo expone la fila propia (mismo muro que la 0085). */
  emitido_por_nombre: string | null
  anulado_at: string | null
  anulado_por_nombre: string | null
  anulado_motivo: MotivoAnulacion | null
}

/** Un renglón de `pedido_medicacion_items` (0128), con lo recibido ya sumado por la función. */
export interface PedidoItemInsumo {
  id: string
  pedido_id: string
  medication_id: string
  medication_name: string
  /** `medications.unit`, que en la app es la presentación. */
  presentacion: string | null
  /** Lo que había calculado Spira al emitir; null = estaba sin cargar. */
  calculado: number | null
  pedido: number
  cerrado_at: string | null
  cerrado_por_nombre: string | null
  cerrado_motivo: MotivoCierre | null
  /** Σ de recepciones verificadas con este pedido y medicamento. */
  recibido: number
  /** Σ de recepciones pendientes (sin verificar) con este pedido y medicamento. */
  sin_verificar: number
}

/**
 * Una recepción NO anulada que responde a un pedido (0133). Sirve para nombrar la que está sin verificar
 * (RD17) y para listarlas en el detalle del pedido.
 */
export interface RecepcionDePedidoInsumo {
  id: string
  pedido_id: string
  /** El número de la recepción (0085). */
  folio: number
  reception_date: string
  status: 'pendiente' | 'verificada'
  /** Snapshot de quien verificó (0085); null mientras está pendiente. */
  verified_by_name: string | null
  /** La suma de sus renglones. */
  envases: number
}

/** RD3: `no_llego` = se cerró todo lo que faltaba y no se recibió nada. */
export type EstadoPedido = 'sin_recibir' | 'en_parte' | 'recibido' | 'no_llego' | 'anulado'

export interface RenglonPedido extends PedidoItemInsumo {
  faltante: number
}

export interface PedidoMedicacion extends PedidoMedicacionInsumo {
  renglones: RenglonPedido[]
  /** Por número. Sólo las no anuladas: una anulada no respondió a nada. */
  recepciones: RecepcionDePedidoInsumo[]
  estado: EstadoPedido
  pedidoTotal: number
  recibidoTotal: number
  faltanteTotal: number
  /** Lo que se dio por cerrado sin llegar («Recibido · faltó 1»). */
  faltoCerrado: number
  /** Hay una recepción cargada y sin verificar: la Recepción lo avisa para no recibir dos veces. */
  conRecepcionSinVerificar: boolean
}

export function faltanteDe(item: PedidoItemInsumo): number {
  if (item.cerrado_at) return 0
  return Math.max(0, item.pedido - item.recibido)
}

/**
 * Junta cabeceras, renglones y recepciones y deduce el estado. Del más nuevo al más viejo.
 * `recepciones` es opcional: antes de la 0133 la base no las trae, y sin ellas sólo se pierde el número
 * de la recepción sin verificar (el estado sale de los renglones).
 */
export function armarPedidos(
  pedidos: readonly PedidoMedicacionInsumo[],
  items: readonly PedidoItemInsumo[],
  recepciones: readonly RecepcionDePedidoInsumo[] = [],
): PedidoMedicacion[] {
  const porPedido = new Map<string, PedidoItemInsumo[]>()
  for (const it of items) porPedido.set(it.pedido_id, [...(porPedido.get(it.pedido_id) ?? []), it])
  const recepcionesPorPedido = new Map<string, RecepcionDePedidoInsumo[]>()
  for (const r of recepciones) recepcionesPorPedido.set(r.pedido_id, [...(recepcionesPorPedido.get(r.pedido_id) ?? []), r])

  return pedidos
    .map((p): PedidoMedicacion => {
      const renglones = (porPedido.get(p.id) ?? [])
        .map((it) => ({ ...it, faltante: p.anulado_at ? 0 : faltanteDe(it) }))
        .sort((a, b) => a.medication_name.localeCompare(b.medication_name, 'es'))
      const faltanteTotal = renglones.reduce((s, r) => s + r.faltante, 0)
      const recibidoTotal = renglones.reduce((s, r) => s + r.recibido, 0)
      const hayCerrados = renglones.some((r) => r.cerrado_at)
      const estado: EstadoPedido = p.anulado_at ? 'anulado'
        : faltanteTotal > 0 ? (recibidoTotal > 0 ? 'en_parte' : 'sin_recibir')
          : recibidoTotal === 0 && hayCerrados ? 'no_llego'
            : 'recibido'
      return {
        ...p,
        renglones,
        recepciones: [...(recepcionesPorPedido.get(p.id) ?? [])].sort((a, b) => a.folio - b.folio),
        estado,
        pedidoTotal: renglones.reduce((s, r) => s + r.pedido, 0),
        recibidoTotal,
        faltanteTotal,
        faltoCerrado: p.anulado_at ? 0
          : renglones.filter((r) => r.cerrado_at).reduce((s, r) => s + Math.max(0, r.pedido - r.recibido), 0),
        conRecepcionSinVerificar: renglones.some((r) => r.sin_verificar > 0),
      }
    })
    .sort((a, b) => b.numero - a.numero)
}

export type ClavePastilla = 'sin_recibir' | 'llego' | 'en_parte' | 'recibido' | 'no_llego' | 'anulado'

export interface PastillaPedido {
  clave: ClavePastilla
  texto: string
}

/** RD8: el estado del pedido en UNA pastilla, igual en la tarjeta, el estudio, el detalle y Recepción. */
export function pastillaDePedido(p: PedidoMedicacion): PastillaPedido {
  if (p.estado === 'anulado') return { clave: 'anulado', texto: 'Anulado' }
  if (p.faltanteTotal > 0 && p.conRecepcionSinVerificar) return { clave: 'llego', texto: 'Llegó, falta verificar' }
  if (p.estado === 'en_parte') return { clave: 'en_parte', texto: 'Recibido en parte' }
  if (p.estado === 'sin_recibir') return { clave: 'sin_recibir', texto: 'Sin recibir' }
  if (p.estado === 'no_llego') return { clave: 'no_llego', texto: 'Cerrado · no llegó' }
  return { clave: 'recibido', texto: p.faltoCerrado > 0 ? `Recibido · faltó ${p.faltoCerrado}` : 'Recibido' }
}

/** Un pedido es de un período si sus fechas se tocan (ver `pedidoPara`). */
export const seSuperpone = (p: PedidoMedicacionInsumo, periodo: Periodo) =>
  p.periodo_hasta >= periodo.desde && p.periodo_desde <= periodo.hasta

/**
 * El pedido de un período: entre los no anulados cuyo período se SUPERPONE con `periodo`, el más nuevo que
 * todavía debe algo; si ninguno debe, el más nuevo. Por superposición y no por igualdad: si Farmacia mueve
 * el día de corte después de emitir (RD15), el pedido conserva su período y una comparación exacta dejaría
 * de reconocerlo. Primero el que debe (revisión de ingeniería, 11): con «Armar otro pedido», un Nº 15 chico
 * y ya recibido no puede tapar al Nº 14 grande que todavía no llegó.
 */
export function pedidoPara(pedidos: readonly PedidoMedicacion[], periodo: Periodo): PedidoMedicacion | null {
  return [...pedidos]
    .filter((p) => p.estado !== 'anulado' && seSuperpone(p, periodo))
    .sort((a, b) => Number(b.faltanteTotal > 0) - Number(a.faltanteTotal > 0) || b.numero - a.numero)[0] ?? null
}

/**
 * El número del último pedido no anulado de ese período que vio la pantalla (0 si ninguno). Viaja con
 * «Emitir e imprimir»: si mientras tanto alguien emitió otro, la base lo rechaza en vez de pedir dos
 * veces lo mismo (revisión de ingeniería, 7). «Armar otro pedido» lo manda y por eso sigue andando.
 */
export function ultimoPedidoPara(pedidos: readonly PedidoMedicacionInsumo[], periodo: Periodo): number {
  return pedidos.filter((p) => !p.anulado_at && seSuperpone(p, periodo)).reduce((max, p) => Math.max(max, p.numero), 0)
}

/** Lo pedido y todavía sin recibir de un medicamento en un estudio: se descuenta de la compra (R9). */
export function yaPedidoDe(
  pedidos: readonly PedidoMedicacion[],
  protocolId: string,
  medicationId: string,
): { envases: number; pedidos: { numero: number; emitido_el: string }[] } {
  const abiertos = pedidos
    .filter((p) => p.estado !== 'anulado' && p.protocol_id === protocolId)
    .map((p) => ({
      p,
      faltante: p.renglones.filter((r) => r.medication_id === medicationId).reduce((s, r) => s + r.faltante, 0),
    }))
    .filter((x) => x.faltante > 0)
    .sort((a, b) => a.p.numero - b.p.numero)
  return {
    envases: abiertos.reduce((s, x) => s + x.faltante, 0),
    pedidos: abiertos.map((x) => ({ numero: x.p.numero, emitido_el: x.p.emitido_el })),
  }
}

/** «Nº 13» · «Nº 13 y Nº 14» · «Nº 12, Nº 13 y Nº 14». */
function listaDeNumeros(numeros: readonly number[]): string {
  const n = numeros.map((x) => `Nº ${x}`)
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

/** «pedido Nº 14 del 28/09» · «pedidos Nº 13 y Nº 14». En minúscula: va en medio de la boleta (RD12). */
export function textoDePedidos(pedidos: readonly { numero: number; emitido_el: string }[]): string {
  if (pedidos.length === 0) return ''
  if (pedidos.length === 1) return `pedido Nº ${pedidos[0].numero} del ${diaMes(pedidos[0].emitido_el)}`
  return `pedidos ${listaDeNumeros(pedidos.map((p) => p.numero))}`
}

/** «Pedido Nº 13» · «Pedidos Nº 12 y Nº 13»: encabeza el renglón de la tarjeta (RD4). */
export function numerosDePedidos(pedidos: readonly { numero: number }[]): string {
  return `${pedidos.length === 1 ? 'Pedido' : 'Pedidos'} ${listaDeNumeros(pedidos.map((p) => p.numero))}`
}

/** «falta 1 envase» · «faltan 13 envases». */
export const faltaTxt = (n: number) => `${n === 1 ? 'falta' : 'faltan'} ${envasesTxt(n)}`

/** «Recepción Nº 1051» · «Recepciones Nº 1051 y Nº 1052». Sin números (antes de la 0133): «Una recepción». */
export function textoDeRecepciones(folios: readonly number[]): string {
  if (folios.length === 0) return 'Una recepción'
  return `${folios.length === 1 ? 'Recepción' : 'Recepciones'} ${listaDeNumeros(folios)}`
}

/**
 * RD17: si algo de lo en camino de un medicamento ya llegó y está sin verificar, los números de esas
 * recepciones (vacío si la base no los trae, antes de la 0133). null si no hay nada así. La boleta lo dice
 * para que nadie lo vuelva a pedir ni lo reciba dos veces.
 */
export function sinVerificarDe(pedidos: readonly PedidoMedicacion[], protocolId: string, medicationId: string): number[] | null {
  const conPendiente = pedidos.filter((p) => p.estado !== 'anulado' && p.protocol_id === protocolId
    && p.renglones.some((r) => r.medication_id === medicationId && r.faltante > 0 && r.sin_verificar > 0))
  if (conPendiente.length === 0) return null
  return conPendiente.flatMap((p) => p.recepciones.filter((r) => r.status === 'pendiente').map((r) => r.folio)).sort((a, b) => a - b)
}

/** «llegó, falta verificar la recepción Nº 1051» · «llegaron, falta verificar las recepciones Nº 1051 y Nº 1052». */
export function faltaVerificarTxt(folios: readonly number[]): string {
  if (folios.length === 0) return 'llegó, falta verificar la recepción'
  return folios.length === 1
    ? `llegó, falta verificar la recepción Nº ${folios[0]}`
    : `llegaron, falta verificar las recepciones ${listaDeNumeros(folios)}`
}

/** «Recibir un pedido»: los no anulados con faltante, del más viejo al más nuevo. */
export function pedidosParaRecibir(pedidos: readonly PedidoMedicacion[]): PedidoMedicacion[] {
  return pedidos.filter((p) => p.estado !== 'anulado' && p.faltanteTotal > 0).sort((a, b) => a.numero - b.numero)
}

/** «Emitido el 28/09 · faltan 13 envases de 2 medicamentos»: el renglón de la lista de «Recibir un pedido». */
export function textoParaRecibir(p: PedidoMedicacion): string {
  const meds = p.renglones.filter((r) => r.faltante > 0).length
  return `Emitido el ${diaMes(p.emitido_el)} · ${faltaTxt(p.faltanteTotal)} de ${meds} ${meds === 1 ? 'medicamento' : 'medicamentos'}`
}

/**
 * Lo que falta recibir de un renglón SIN contar lo que ya está en una recepción sin verificar (revisión de
 * ingeniería, 8): eso ya llegó a la casa, y precargarlo otra vez en el asistente es recibirlo dos veces.
 */
export function porRecibir(r: RenglonPedido): number {
  return Math.max(0, r.faltante - r.sin_verificar)
}

/** Σ de `porRecibir`. 0 = lo que falta ya está entero en recepciones sin verificar: no se ofrece «Recibir». */
export function porRecibirDe(p: PedidoMedicacion): number {
  return p.renglones.reduce((s, r) => s + porRecibir(r), 0)
}

/**
 * Lo que dice la hoja REIMPRESA debajo de cada renglón (revisión de ingeniería, 10): sin esto, reimprimir un
 * pedido a medio recibir vuelve a pedir lo que ya llegó. null = no llegó nada todavía, y el renglón queda
 * como en la hoja original.
 */
export function notaDeReimpresion(r: RenglonPedido): string | null {
  if (r.cerrado_at) return r.recibido > 0 ? `recibido ${r.recibido} · el resto no va a llegar` : 'no va a llegar'
  if (r.recibido === 0) return null
  return r.faltante === 0 ? `recibido ${r.recibido}` : `recibido ${r.recibido} · falta ${r.faltante}`
}

/** Lo que trae `pedidos_por_recibir` (0133): sólo los pedidos con algo por recibir, con su estudio. */
export interface InsumosPorRecibir {
  estudios: { id: string; code: string; name: string }[]
  pedidos: PedidoMedicacionInsumo[]
  pedido_items: PedidoItemInsumo[]
  recepciones: RecepcionDePedidoInsumo[]
}

export interface PedidoPorRecibir {
  pedido: PedidoMedicacion
  estudio: { id: string; code: string; name: string }
  /** Los otros pedidos abiertos del mismo estudio: si llega algo que espera uno de ellos, el asistente lo dice. */
  otrosDelEstudio: PedidoMedicacion[]
}

/** La lista de «Recibir un pedido», del más viejo al más nuevo. */
export function armarPorRecibir(i: InsumosPorRecibir): PedidoPorRecibir[] {
  const abiertos = pedidosParaRecibir(armarPedidos(i.pedidos, i.pedido_items, i.recepciones))
  return abiertos.flatMap((pedido) => {
    const estudio = i.estudios.find((e) => e.id === pedido.protocol_id)
    if (!estudio) return []
    return [{ pedido, estudio, otrosDelEstudio: abiertos.filter((o) => o.protocol_id === pedido.protocol_id && o.id !== pedido.id) }]
  })
}

/**
 * Los renglones con los que arranca el asistente de recepción (R10): lo que falta de cada uno y no está ya
 * en una recepción sin verificar.
 */
export function renglonesParaRecibir(p: PedidoMedicacion): { medicationId: string; nombre: string; cantidad: number }[] {
  return p.renglones
    .filter((r) => porRecibir(r) > 0)
    .map((r) => ({ medicationId: r.medication_id, nombre: r.medication_name, cantidad: porRecibir(r) }))
}

/** El pedido más viejo de `otros` que todavía espera ese medicamento (revisión de ingeniería, 9). */
function quienLoEspera(otros: readonly PedidoMedicacion[], medicationId: string): PedidoMedicacion | null {
  return [...otros]
    .filter((o) => o.estado !== 'anulado' && o.renglones.some((r) => r.medication_id === medicationId && porRecibir(r) > 0))
    .sort((a, b) => a.numero - b.numero)[0] ?? null
}

/**
 * Lo que dice el asistente al lado de cada medicamento cuando se recibe un pedido (mock «Asistente»). Si no
 * estaba en ESTE pedido pero lo espera otro del estudio, lo nombra: recibido acá, el otro lo seguiría
 * esperando y la boleta lo restaría como «en camino» aunque ya esté en el estante.
 */
export function metaDelPedido(
  p: PedidoMedicacion,
  medicationId: string,
  otros: readonly PedidoMedicacion[] = [],
): { texto: string; aviso: boolean } {
  const r = p.renglones.find((x) => x.medication_id === medicationId)
  if (!r) {
    const otro = quienLoEspera(otros, medicationId)
    return { texto: otro ? `Se debe en el Pedido Nº ${otro.numero}: recibilo con ese` : 'No estaba en el pedido', aviso: true }
  }
  const falta = porRecibir(r)
  if (falta === 0) return { texto: 'No faltaba', aviso: true }
  if (falta === r.pedido) return { texto: `se pidieron ${r.pedido}`, aviso: false }
  return { texto: `${falta === 1 ? 'falta' : 'faltan'} ${falta} de ${r.pedido}`, aviso: false }
}

export interface FilaComparacion {
  medicationId: string
  nombre: string
  /** Lo que faltaba recibir de ese renglón; null = no estaba en el pedido. */
  esperado: number | null
  llega: number
  nota: string
  aviso: boolean
}

/**
 * El resumen del asistente (RD18): lo que faltaba recibir de cada renglón contra lo que llega. Lo que llega y
 * no estaba en el pedido se recibe igual y no cuenta para ningún renglón (R10). Si lo espera otro pedido del
 * estudio (o sobra y lo espera otro), se nombra ese pedido (revisión de ingeniería, 9).
 */
export function comparacionConElPedido(
  p: PedidoMedicacion,
  llegan: readonly { medicationId: string; name: string; quantity: number }[],
  otros: readonly PedidoMedicacion[] = [],
): FilaComparacion[] {
  const filas: FilaComparacion[] = p.renglones
    .filter((r) => porRecibir(r) > 0 || llegan.some((l) => l.medicationId === r.medication_id))
    .map((r) => {
      const esperado = porRecibir(r)
      const llega = llegan.find((l) => l.medicationId === r.medication_id)?.quantity ?? 0
      const resto = esperado - llega
      const otro = esperado > 0 && resto < 0 ? quienLoEspera(otros, r.medication_id) : null
      const nota = esperado === 0 ? 'No faltaba: se recibe igual'
        : resto > 0 ? `${resto === 1 ? 'Queda' : 'Quedan'} ${resto} en camino`
          : resto < 0 ? (otro ? `Completo, con ${-resto} de más: se deben en el Pedido Nº ${otro.numero}` : `Completo, con ${-resto} de más`)
            : 'Completo'
      return { medicationId: r.medication_id, nombre: r.medication_name, esperado, llega, nota, aviso: esperado === 0 || resto > 0 || otro != null }
    })
  for (const l of llegan) {
    if (p.renglones.some((r) => r.medication_id === l.medicationId)) continue
    const otro = quienLoEspera(otros, l.medicationId)
    filas.push({
      medicationId: l.medicationId, nombre: l.name, esperado: null, llega: l.quantity, aviso: true,
      nota: otro ? `Se debe en el Pedido Nº ${otro.numero}: recibilo con ese` : 'No estaba en el pedido: se recibe igual',
    })
  }
  return filas
}

/** La columna muestra lo que FALTABA recibir: la primera vez coincide con lo pedido; después, no. */
export function encabezadoDeLoEsperado(p: PedidoMedicacion): 'Pedido' | 'Faltaba' {
  return p.renglones.every((r) => porRecibir(r) === r.pedido) ? 'Pedido' : 'Faltaba'
}
```

Ojo con dos expectativas del test:
- «Completo, con 2 de más» tiene `aviso: false`. Recibir de más no deja nada colgado.
- «Quedan 3 en camino» tiene `aviso: true`.

La implementación de arriba ya lo hace (`aviso: resto > 0`).

- [ ] **Step 4: Correrlo y ver que pasa**

Run: `npx vitest run src/data/pharma/pedidosMedicacionModel.test.ts`
Expected: PASS, todos.

Run: `npx tsc --noEmit`
Expected: errores **sólo** en `src/data/pharma/reposicionPeriodoModel.ts` y su test, que todavía usan `pedidoDestacado` y `destacado` (ya no existen). Los arregla la Task 3. Si aparece un error en otro archivo, es un uso que no estaba previsto: resolverlo antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add src/data/pharma/pedidosMedicacionModel.ts src/data/pharma/pedidosMedicacionModel.test.ts
git commit -m "feat(reposicion): pastilla del pedido, «no llegó» y lo que ve Recepción (RD3, RD8, RD17)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: La cuenta del período — pedido tarde, copy de la boleta y el pedido del objetivo

**Files:**
- Modify (reescritura entera): `src/data/pharma/reposicionPeriodoModel.ts`
- Test (reescritura entera): `src/data/pharma/reposicionPeriodoModel.test.ts`

**Interfaces:**
- Consumes:
  - de la Task 1: `ventanaTarde`, `VentanaTarde`;
  - de la Task 2: `armarPedidos(…, recepciones)`, `pedidoPara`, `seSuperpone`, `textoDePedidos` (minúscula), `sinVerificarDe`, `faltaVerificarTxt`, `RecepcionDePedidoInsumo`;
  - de la Parte 1: `diasHastaElCorte`, `enCurso`, `periodoSiguiente`, `estanteAlComienzo`, `presentacionesDuplicadas`, `sigueEnElMes`, `terminoCronograma`.
- Produces (lo que no se nombra sigue igual):
  - `InsumosDelPeriodo` suma `recepciones: RecepcionDePedidoInsumo[]` (0133)
  - `TipoLineaBoleta` suma `'hay_en_el_estante'`
  - `RenglonDelPeriodo` suma:
    - `enCamino: number` (lo que descuenta «En camino»);
    - `faltaEstePeriodo: number` (D31), neto de lo en camino;
    - `pacientes: number` (asignaciones activas sin habilitación de una entrega);
    - `minimo: { envases: number; pacientes: number | null } | null` (el stock mínimo del período, decisión 10).
  - `EstudioReposicion` pierde `destacado` y suma:
    - `objetivo: Periodo | null`;
    - `tarde: VentanaTarde | null`;
    - `pedidoDelObjetivo: PedidoMedicacion | null`;
    - `pedidosQueDeben: PedidoMedicacion[]` (de OTROS períodos);
    - `resumen.faltaEstePeriodo: number`.
  - `ReposicionDelPeriodo` suma `diasAlCorte: number | null` y `ventana: VentanaTarde | null`

- [ ] **Step 1: Reescribir el test**

`src/data/pharma/reposicionPeriodoModel.test.ts`, entero:

```ts
import { describe, expect, it } from 'vitest'
import {
  armarReposicionDelPeriodo, borradorDelPedido, cambiosDelBorrador, libroDe, renglonesAEmitir,
  type InsumosDelPeriodo, type MovimientoInsumo, type PacientePeriodoInsumo, type RenglonPeriodoInsumo,
} from './reposicionPeriodoModel'
import type { EstudioInsumo, LoteInsumo } from './reposicionModel'
import type { PedidoItemInsumo, PedidoMedicacionInsumo } from './pedidosMedicacionModel'
import type { Periodo } from './periodoDeCorte'

/**
 * La reposición de corte a corte (spec 2026-09-16, R3, R6, R7, R8, y RD1, RD12, RD13 de la revisión).
 *
 * Se testea porque un número mal contado se dibuja igual de prolijo: comprar de menos deja pacientes sin
 * medicación y de más se vence en el estante. Los ejemplos son los que vio el Director en los bocetos y
 * en el mock. Fechas fijas: CI corre en UTC.
 */

const HOY = '2026-09-16'
const CORTE = 28
const P0: Periodo = { desde: '2026-08-29', hasta: '2026-09-28' }
/** El 01/10, dentro de los 5 días después del corte del 28/09 (RD1). */
const HOY_TARDE = '2026-10-01'
const P0_TARDE: Periodo = { desde: '2026-09-29', hasta: '2026-10-28' }

const estudio = (p: Partial<EstudioInsumo> = {}): EstudioInsumo => ({ id: 'endura', code: '222714', name: 'ENDURA', status: 'activo', ...p })
const renglon = (p: Partial<RenglonPeriodoInsumo> = {}): RenglonPeriodoInsumo => ({
  protocol_medication_id: 'pm-seretide', protocol_id: 'endura', medication_id: 'seretide', medication_name: 'Seretide 250/50',
  presentacion: 'Aerosol', drug_id: 'fluti', modo: 'mensual', envases_por_mes: 1, stock_fijo: null, ...p,
})
let n = 0
const paciente = (p: Partial<PacientePeriodoInsumo> = {}): PacientePeriodoInsumo => {
  n += 1
  return {
    patient_medication_id: `pmed-${n}`, enrollment_id: `enr-${n}`, protocol_id: 'endura', medication_id: 'seretide', drug_id: 'fluti',
    patient_name: `Paciente ${String(n).padStart(2, '0')}`, enrollment_status: 'activo', envases_por_mes: null, habilitacion_id: null,
    asignado_el: '2026-03-01', tiene_cronograma: false, ultima_programada: null, retirado_periodo: 1, ultimo_retiro: '2026-09-05', ...p,
  }
}
/** `cuantos` pacientes con 1 envase por mes, de los que `retiraron` ya retiraron este período. */
const grupo = (cuantos: number, retiraron: number) =>
  Array.from({ length: cuantos }, (_, i) => paciente({ retirado_periodo: i < retiraron ? 1 : 0 }))
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p,
})
const mov = (p: Partial<MovimientoInsumo> = {}): MovimientoInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', entro: 0, salio: 0, ajustes: 0, desde_inicio: 0, ...p,
})
const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-15', emitido_por_nombre: 'Lautaro Molina', anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-1', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 6, pedido: 6, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const insumos = (p: Partial<InsumosDelPeriodo> = {}): InsumosDelPeriodo => ({
  estudios: [estudio()], renglones: [renglon()], pacientes: [], lotes: [], movimientos: [], pedidos: [], pedido_items: [],
  recepciones: [], sin_medicacion: [], ...p,
})
const armar = (i: InsumosDelPeriodo, periodo: Periodo = P0, hoy = HOY) => armarReposicionDelPeriodo(i, hoy, periodo, CORTE)
const seretide = (i: InsumosDelPeriodo) => armar(i).estudios[0].renglones[0]
const resumenBoleta = (i: InsumosDelPeriodo) =>
  seretide(i).boleta?.lineas.map((l) => [l.tipo, l.signo, l.valor, l.aclaracion])

describe('libroDe', () => {
  it('había + entró − salió + ajustes = hay', () => {
    expect(libroDe(mov({ entro: 15, salio: 12, ajustes: -1, desde_inicio: 2 }), 8))
      .toEqual({ habia: 6, entro: 15, salio: 12, ajustes: -1, hay: 8 })
  })
  it('sin movimientos, lo que había es lo que hay', () => {
    expect(libroDe(undefined, 8)).toEqual({ habia: 8, entro: 0, salio: 0, ajustes: 0, hay: 8 })
  })
})

describe('la cuenta del período (R3, R7)', () => {
  it('el ejemplo del Director: había 5, entraron 15, salieron 12, quedan 8 → comprar 4', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote()], movimientos: [mov({ entro: 15, salio: 12, desde_inicio: 3 })] }))
    expect(r.libro).toEqual({ habia: 5, entro: 15, salio: 12, ajustes: 0, hay: 8 })
    expect(r).toMatchObject({ estado: 'comprar', comprar: 4, enCamino: 0, faltaEstePeriodo: 0, pacientes: 12, minimo: { envases: 12, pacientes: 12 } })
    expect(r.boleta).toEqual({
      aComprar: 4,
      lineas: [
        { tipo: 'hacen_falta', titulo: 'Hacen falta para el período que viene', signo: '', valor: 12, aclaracion: '12 pacientes, 1 envase por mes' },
        { tipo: 'quedan_al_corte', titulo: 'Van a quedar en el estante al corte', signo: '−', valor: 8, aclaracion: 'hay 8 y ya retiraron todos' },
      ],
    })
  })
  it('la boleta A: 8 pacientes, hay 5 y 4 todavía no retiraron → comprar 7', () => {
    const i = insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 5 })] })
    expect(seretide(i).comprar).toBe(7)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 8, '8 pacientes, 1 envase por mes'],
      ['quedan_al_corte', '−', 1, 'hay 5, y 4 pacientes todavía no retiraron'],
    ])
  })
  it('si el estante no alcanza para terminar el período, lo que falta se suma (D31)', () => {
    const i = insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 3 })] })
    expect(seretide(i)).toMatchObject({ comprar: 9, faltaEstePeriodo: 1 })
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 8, '8 pacientes, 1 envase por mes'],
      ['faltan_este_periodo', '+', 1, '4 pacientes todavía no retiraron y en el estante no alcanza'],
    ])
  })
  it('con cantidad propia lo dice, y el singular se respeta', () => {
    const i = insumos({ pacientes: [paciente({ envases_por_mes: 2 }), paciente(), paciente()] })
    expect(seretide(i).comprar).toBe(5)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 4, '3 pacientes (1 con cantidad propia)'],
      ['faltan_este_periodo', '+', 1, '1 paciente todavía no retiró y en el estante no alcanza'],
    ])
  })
})

describe('en camino (R9, R11, RD12)', () => {
  const base = { pacientes: grupo(12, 12), lotes: [lote()] }
  it('se resta, se llama «En camino» y, si cubre todo, el renglón queda en camino', () => {
    const r = seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [item()] }))
    expect(r).toMatchObject({ estado: 'en_camino', comprar: 0, enCamino: 6 })
    expect(r.boleta?.lineas.at(-1)).toEqual({
      tipo: 'ya_pedido', titulo: 'En camino', signo: '−', valor: 6, aclaracion: 'pedido Nº 14 del 15/09',
    })
  })
  it('si ya llegó y falta verificar, la boleta lo dice (RD17)', () => {
    const r = seretide(insumos({
      ...base, pedidos: [cab()], pedido_items: [item({ sin_verificar: 6 })],
      recepciones: [{ id: 'rec-1051', pedido_id: 'ped-14', folio: 1051, reception_date: '2026-09-16', status: 'pendiente', verified_by_name: null, envases: 6 }],
    }))
    expect(r.boleta?.lineas.at(-1)?.aclaracion).toBe('pedido Nº 14 del 15/09 · llegó, falta verificar la recepción Nº 1051')
  })
  it('lo en camino también cubre lo que falta del período en curso (revisión de ingeniería, 5)', () => {
    const r = seretide(insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 3 })], pedidos: [cab()], pedido_items: [item({ pedido: 1, calculado: 1 })] }))
    expect(r).toMatchObject({ faltaEstePeriodo: 0, enCamino: 1, comprar: 8 })
  })
  it('lo recibido de un pedido ya no se resta como en camino', () => {
    expect(seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [item({ recibido: 4 })] })).comprar).toBe(2)
  })
  it('ni un renglón cerrado ni un pedido anulado descuentan', () => {
    const cerrado = item({ cerrado_at: '2026-09-16T12:00:00+00:00', cerrado_motivo: 'no_lo_tiene' })
    expect(seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [cerrado] })).comprar).toBe(4)
    const anulado = cab({ anulado_at: '2026-09-16T12:00:00+00:00', anulado_motivo: 'por_error' })
    expect(seretide(insumos({ ...base, pedidos: [anulado], pedido_items: [item()] })).comprar).toBe(4)
  })
})

describe('a demanda y renglones sin cuenta', () => {
  it('a demanda: tener siempre N menos lo que queda', () => {
    const i = insumos({ renglones: [renglon({ modo: 'a_demanda', envases_por_mes: null, stock_fijo: 5 })], lotes: [lote({ quantity: 2 })] })
    expect(seretide(i).comprar).toBe(3)
    expect(seretide(i).minimo).toEqual({ envases: 5, pacientes: null })
    expect(resumenBoleta(i)).toEqual([['tener_siempre', '', 5, 'a demanda'], ['quedan_al_corte', '−', 2, 'hay 2']])
  })
  it('sin cargar y no se compra no tienen boleta ni número, pero sí cuántos pacientes lo tienen', () => {
    expect(seretide(insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })], pacientes: grupo(3, 0) })))
      .toMatchObject({ estado: 'sin_cargar', comprar: 0, boleta: null, minimo: null, pacientes: 3 })
    expect(seretide(insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] })))
      .toMatchObject({ estado: 'no_se_compra', comprar: 0, boleta: null, minimo: null })
  })
  it('en un período anterior hay libro pero no cuenta (R6)', () => {
    const rep = armar(
      insumos({ pacientes: grupo(12, 0), lotes: [lote()], movimientos: [mov({ entro: 10, salio: 4, ajustes: -1, desde_inicio: 8 })] }),
      { desde: '2026-07-29', hasta: '2026-08-28' },
    )
    expect(rep).toMatchObject({ enCurso: false, diasAlCorte: null, ventana: null })
    expect(rep.estudios[0].renglones[0]).toMatchObject({
      estado: 'sin_cuenta', comprar: 0, boleta: null, minimo: null, libro: { habia: 0, entro: 10, salio: 4, ajustes: -1, hay: 5 },
    })
    expect(rep.estudios[0]).toMatchObject({ estadoTarjeta: 'sin_cuenta', objetivo: null, tarde: null })
  })
})

describe('el stock mínimo (pedido del Director, 2026-09-19)', () => {
  it('suma la cantidad propia de cada paciente o, si no tiene, la del estudio', () => {
    const i = insumos({
      renglones: [renglon({ envases_por_mes: 1 })],
      pacientes: [paciente({ envases_por_mes: 2 }), paciente({ envases_por_mes: 3 }), paciente()],
    })
    expect(seretide(i).minimo).toEqual({ envases: 6, pacientes: 3 })
  })
  it('sin pacientes que lo tengan asignado, el mínimo es cero', () => {
    expect(seretide(insumos({ pacientes: [] })).minimo).toEqual({ envases: 0, pacientes: 0 })
  })
  it('no suma la asignación que es la habilitación de una entrega', () => {
    const i = insumos({ pacientes: [paciente(), paciente({ habilitacion_id: 'hab-1' })] })
    expect(seretide(i).minimo).toEqual({ envases: 1, pacientes: 1 })
  })
})

describe('vencimientos: «hay» es lo físico (RD13)', () => {
  it('lo vencido está en el «hay» y la boleta dice cuántos', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote(), lote({ lot_number: 'L0', expiry_date: '2026-09-01', quantity: 2 })] }))
    expect(r.libro.hay).toBe(10)
    expect(r.comprar).toBe(4)
    expect(r.boleta?.lineas[1].aclaracion).toBe('hay 10, 2 vencidos, y ya retiraron todos')
  })
  it('lo que vence antes del período que viene no queda al corte', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote({ quantity: 5 }), lote({ lot_number: 'L2', expiry_date: '2026-09-25', quantity: 3 })] }))
    expect(r.comprar).toBe(7)
    expect(r.boleta?.lineas[1]).toMatchObject({ valor: 5, aclaracion: 'hay 8 y ya retiraron todos, 3 vencen antes del período que viene' })
  })
  it('un lote que vence durante el período que viene cuenta y avisa', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote({ expiry_date: '2026-10-10' })] }))
    expect(r.comprar).toBe(4)
    expect(r.avisos).toContainEqual({ tipo: 'vence', ambar: true, texto: 'Vence el 10/10: lote L1, 8 envases' })
  })
  it('con todo vencido la boleta no calla: «hay 10, todos vencidos», con valor 0', () => {
    const i = insumos({ pacientes: grupo(12, 12), lotes: [lote({ lot_number: 'L0', expiry_date: '2026-09-01', quantity: 10 })] })
    expect(seretide(i).comprar).toBe(12)
    expect(seretide(i).libro.hay).toBe(10)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 12, '12 pacientes, 1 envase por mes'],
      ['quedan_al_corte', '−', 0, 'hay 10, todos vencidos'],
    ])
  })
})

describe('el pedido tarde (RD1)', () => {
  const tarde = (i: InsumosDelPeriodo, hoy = HOY_TARDE) => armar(i, P0_TARDE, hoy)
  it('el ejemplo del mock: pasó el corte, sin pedido, 12 pacientes sin retirar y hay 5 → comprar 7 para el período que empezó', () => {
    const rep = tarde(insumos({ pacientes: grupo(12, 0), lotes: [lote({ quantity: 5 })] }))
    const e = rep.estudios[0]
    expect(rep.ventana).toEqual({ corte: '2026-09-28', hasta: '2026-10-03', quedan: 3 })
    expect(e).toMatchObject({ tarde: { quedan: 3 }, objetivo: P0_TARDE, pedidoDelObjetivo: null })
    expect(e.renglones[0].comprar).toBe(7)
    expect(e.renglones[0].boleta?.lineas.map((l) => [l.tipo, l.titulo, l.signo, l.valor, l.aclaracion])).toEqual([
      ['hacen_falta', 'Hacen falta para el período que empezó', '', 12, '12 pacientes, 1 envase por mes; retiraron 0'],
      ['hay_en_el_estante', 'Hay en el estante', '−', 5, 'hay 5'],
    ])
  })
  it('lo ya retirado se descuenta de lo que hace falta', () => {
    const r = tarde(insumos({ pacientes: grupo(12, 3), lotes: [lote({ quantity: 5 })] })).estudios[0].renglones[0]
    expect(r.comprar).toBe(4)
    expect(r.boleta?.lineas[0]).toMatchObject({ valor: 9, aclaracion: '12 pacientes, 1 envase por mes; retiraron 3' })
    // El mínimo es el del período entero, no lo que le falta: por eso la columna no se llama como la boleta.
    expect(r.minimo).toEqual({ envases: 12, pacientes: 12 })
  })
  it('a demanda: tener siempre menos lo que hay', () => {
    const r = tarde(insumos({ renglones: [renglon({ modo: 'a_demanda', envases_por_mes: null, stock_fijo: 5 })], lotes: [lote({ quantity: 2 })] })).estudios[0].renglones[0]
    expect(r.comprar).toBe(3)
    expect(r.boleta?.lineas.map((l) => [l.tipo, l.valor, l.aclaracion])).toEqual([['tener_siempre', 5, 'a demanda'], ['hay_en_el_estante', 2, 'hay 2']])
  })
  it('si el período que empezó ya tiene su pedido, la cuenta es la del que viene', () => {
    const e = tarde(insumos({ pacientes: grupo(12, 0), lotes: [lote({ quantity: 5 })], pedidos: [cab()], pedido_items: [item()] })).estudios[0]
    expect(e).toMatchObject({ tarde: null, objetivo: { desde: '2026-10-29', hasta: '2026-11-28' } })
    expect(e.pedidosQueDeben.map((p) => p.numero)).toEqual([14])
  })
  it('si al período que empezó no le falta nada, no hay nada tarde que pedir', () => {
    expect(tarde(insumos({ pacientes: grupo(12, 12), lotes: [lote()] })).estudios[0].tarde).toBeNull()
  })
  it('lo en camino de un pedido de otro período también se descuenta', () => {
    const e = tarde(insumos({
      pacientes: grupo(12, 0), lotes: [lote({ quantity: 5 })],
      pedidos: [cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' })],
      pedido_items: [item({ id: 'i13', pedido_id: 'ped-13', pedido: 4, calculado: 4, recibido: 1 })],
    })).estudios[0]
    expect(e.tarde).not.toBeNull()
    expect(e.renglones[0]).toMatchObject({ comprar: 4, enCamino: 3 })
  })
  it('pasados los 5 días, tampoco', () => {
    const rep = tarde(insumos({ pacientes: grupo(12, 0), lotes: [lote({ quantity: 5 })] }), '2026-10-05')
    expect(rep.ventana).toBeNull()
    expect(rep.estudios[0].tarde).toBeNull()
  })
})

describe('la grilla (R2, RD4)', () => {
  it('ordena por código, saca los cerrados y dice el estado de cada tarjeta', () => {
    const rep = armar(insumos({
      estudios: [
        estudio({ id: 'lts', code: 'LTS17231', name: 'LTS17231' }),
        estudio(),
        estudio({ id: 'vic', code: 'CKJX839D12302', name: 'Victorion' }),
        estudio({ id: 'viejo', code: 'AAA-1', status: 'cerrado' }),
      ],
      renglones: [
        renglon(),
        renglon({ protocol_medication_id: 'pm-lts', protocol_id: 'lts' }),
        renglon({ protocol_medication_id: 'pm-lts-monte', protocol_id: 'lts', medication_id: 'monte', medication_name: 'Montelukast 10 mg', drug_id: 'monte', modo: null, envases_por_mes: null }),
      ],
      pacientes: grupo(12, 12),
      lotes: [lote(), lote({ protocol_id: 'lts', quantity: 20 })],
      sin_medicacion: [{ protocol_id: 'endura', enrolamientos: 3 }],
    }))
    expect(rep).toMatchObject({ enCurso: true, diasAlCorte: 12, ventana: null })
    expect(rep.estudios.map((e) => [e.estudio.code, e.estadoTarjeta])).toEqual([
      ['222714', 'comprar'], ['CKJX839D12302', 'sin_medicacion'], ['LTS17231', 'cubierto'],
    ])
    expect(rep.estudios[0]).toMatchObject({
      resumen: { envases: 4, medicamentos: 1, sinCargar: 0, reponibles: 1, faltaEstePeriodo: 0 },
      sinMedicacionHabilitada: 3,
      objetivo: { desde: '2026-09-29', hasta: '2026-10-28' },
    })
    expect(rep.estudios[2].resumen).toMatchObject({ envases: 0, sinCargar: 1, reponibles: 2 })
  })
  it('todo sin cargar se dice aparte', () => {
    expect(armar(insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })] })).estudios[0].estadoTarjeta).toBe('todo_sin_cargar')
  })
  it('sólo «no se compra» es no tener medicación para reponer', () => {
    expect(armar(insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] })).estudios[0].estadoTarjeta).toBe('sin_medicacion')
  })
  it('separa el pedido del período que viene de los anteriores que todavía deben algo', () => {
    const e = armar(insumos({
      pedidos: [cab(), cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' }), cab({ id: 'ped-12', numero: 12, periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' })],
      pedido_items: [item(), item({ id: 'i13', pedido_id: 'ped-13', recibido: 5 }), item({ id: 'i12', pedido_id: 'ped-12', recibido: 6 })],
    })).estudios[0]
    expect(e.pedidoDelObjetivo?.numero).toBe(14)
    expect(e.pedidosQueDeben.map((p) => p.numero)).toEqual([13])
  })
  it('un segundo pedido del mismo período no va al renglón de los anteriores (revisión de ingeniería, 11)', () => {
    const e = armar(insumos({
      pedidos: [cab(), cab({ id: 'ped-15', numero: 15 })],
      pedido_items: [item({ pedido: 12, calculado: 12 }), item({ id: 'i15', pedido_id: 'ped-15', pedido: 3, calculado: 3, recibido: 1 })],
    })).estudios[0]
    expect(e.pedidoDelObjetivo?.numero).toBe(15)
    expect(e.pedidosQueDeben).toEqual([])
  })
})

describe('armar el pedido (R8)', () => {
  const conTodo = () => armar(insumos({
    renglones: [
      renglon(),
      renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', presentacion: 'Comprimidos', drug_id: 'monte', modo: null, envases_por_mes: null }),
      renglon({ protocol_medication_id: 'pm-tio', medication_id: 'tio', medication_name: 'Tiotropio 18 mcg', presentacion: 'Cápsulas', drug_id: 'tio', modo: 'no_se_compra', envases_por_mes: null }),
    ],
    pacientes: grupo(12, 12),
    lotes: [lote()],
  })).estudios[0]

  it('arranca en lo calculado, lo sin cargar en cero y sin lo que no se compra', () => {
    expect(borradorDelPedido(conTodo())).toEqual([
      { medicationId: 'monte', nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', calculado: null, pedir: 0 },
      { medicationId: 'seretide', nombre: 'Seretide 250/50', presentacion: 'Aerosol', calculado: 4, pedir: 4 },
    ])
  })
  it('emite sólo los renglones con cantidad entera mayor a cero', () => {
    const b = borradorDelPedido(conTodo()).map((r) => (r.medicationId === 'seretide' ? { ...r, pedir: 6 } : { ...r, pedir: 1.5 }))
    expect(renglonesAEmitir(b)).toEqual([{ medication_id: 'seretide', calculado: 4, pedido: 6 }])
  })
  it('dice qué se cambió respecto de lo calculado; lo sin cargar se pide a mano', () => {
    const b = borradorDelPedido(conTodo()).map((r) => (r.medicationId === 'seretide' ? { ...r, pedir: 6 } : { ...r, pedir: 2 }))
    expect(cambiosDelBorrador(b)).toEqual(['Seretide 250/50: pedís 6, Spira calculó 4.'])
    expect(renglonesAEmitir(b)).toEqual([
      { medication_id: 'monte', calculado: null, pedido: 2 },
      { medication_id: 'seretide', calculado: 4, pedido: 6 },
    ])
  })
})
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run src/data/pharma/reposicionPeriodoModel.test.ts`
Expected: FAIL. Dicen otra cosa los títulos («Hacen falta para el próximo período»), «En camino», las aclaraciones de vencidos, y no existen `tarde`, `objetivo`, `enCamino`, etc.

- [ ] **Step 3: Reescribir el modelo**

`src/data/pharma/reposicionPeriodoModel.ts`, entero:

```ts
import {
  diaMes, envasesTxt, estanteAlComienzo, nombresDePacientes, presentacionesDuplicadas, sigueEnElMes, sumarDias, terminoCronograma,
} from './reposicionModel'
import type { Aviso, EstadoRenglon, EstudioInsumo, LoteInsumo, ModoReposicion, PacienteInsumo } from './reposicionModel'
import { diasHastaElCorte, enCurso, periodoSiguiente, ventanaTarde } from './periodoDeCorte'
import type { Periodo, VentanaTarde } from './periodoDeCorte'
import { armarPedidos, faltaVerificarTxt, pedidoPara, seSuperpone, sinVerificarDe, textoDePedidos, yaPedidoDe } from './pedidosMedicacionModel'
import type { PedidoItemInsumo, PedidoMedicacion, PedidoMedicacionInsumo, RecepcionDePedidoInsumo } from './pedidosMedicacionModel'

/**
 * ┌─ Reposición de corte a corte (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md) ─────┐
 *
 * La misma cuenta del 14/09 (reposicionModel.ts, «para todos», D8), medida por PERÍODO en vez de por mes
 * calendario, más el libro de lo que entró y salió y la boleta que la explica.
 *
 *   P0 = el período en curso · P1 = el siguiente (el que se compra)
 *
 *   LIBRO de un período, por medicamento (R3, R6):
 *     había = en el estante hoy − todo lo que se movió desde el inicio del período
 *     hay   = había + entró − salió + ajustes             (período cerrado: lo que quedó al corte)
 *
 *   BOLETA de P0 (R7), cada renglón sólo si aplica:
 *       Hacen falta para el período que viene   Σ mensual de los pacientes que siguen en P1
 *     (o Tener siempre                         stock fijo, a demanda)
 *     + Faltan para terminar este período      lo pendiente de P0 que el estante no cubre     D31
 *     − Van a quedar en el estante al corte    FEFO: lo vigente menos lo pendiente de P0      D15
 *     − En camino                              faltante abierto de los pedidos            R9 RD12
 *     = A comprar                              nunca negativo
 *
 *   PEDIDO TARDE (RD1): hasta 5 días después del corte, si el período que empezó no tiene pedido y le
 *   falta algo, la cuenta es la de ESE período y pide sólo lo que le falta:
 *       Hacen falta para el período que empezó  lo que les falta retirar a sus pacientes
 *     (o Tener siempre)
 *     − Hay en el estante                      lo vigente hoy
 *     − En camino
 *     = A comprar
 *   El siguiente se pide en el próximo corte. Si al período que empezó no le falta nada, la cuenta sigue
 *   siendo la del que viene: no hay nada tarde que pedir.
 *
 * «Hay» es siempre lo FÍSICO, vencidos incluidos (RD13): la boleta dice cuántos lo están.
 * El texto de la boleta sale de ACÁ y no de la vista: el Director rechazó la versión en prosa («Hoy hay 8 y
 * ya retiraron los 12…») por confusa, y la aclaración de cada renglón es parte de lo que se testea.
 * └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════ El JSON de `reposicion_del_periodo` (0128, 0133) ═══════════════════════════

/** Un renglón de `protocol_medications` con lo que se cargó para reponerlo. */
export interface RenglonPeriodoInsumo {
  protocol_medication_id: string
  protocol_id: string
  medication_id: string
  medication_name: string
  /** `medications.unit`, que en la app es la presentación. */
  presentacion: string | null
  drug_id: string | null
  modo: ModoReposicion | null
  envases_por_mes: number | null
  stock_fijo: number | null
}

/** Una asignación activa, igual que en la 0125 salvo lo retirado, que se mide en el período pedido. */
export type PacientePeriodoInsumo = Omit<PacienteInsumo, 'retirado_mes'> & {
  /** Neto retirado entre `p_desde` y `p_hasta` (hora AR), en lista o entregada. */
  retirado_periodo: number
}

/** Lo que se movió en el estante de un medicamento del estudio, con el protocolo por el LOTE. */
export interface MovimientoInsumo {
  protocol_id: string
  medication_id: string
  /** Recepciones menos anulaciones de recepción, dentro del período. */
  entro: number
  /** Dispensaciones menos devoluciones, dentro del período (positivo = salió). */
  salio: number
  /** Ajustes manuales, reasignaciones y bajas por vencimiento, con su signo, dentro del período. */
  ajustes: number
  /** Todo lo movido desde el inicio del período hasta hoy, con su signo. */
  desde_inicio: number
}

export interface InsumosDelPeriodo {
  estudios: EstudioInsumo[]
  renglones: RenglonPeriodoInsumo[]
  pacientes: PacientePeriodoInsumo[]
  /** Todos los lotes de protocolo con stock, VENCIDOS INCLUIDOS (el libro cuenta lo físico). */
  lotes: LoteInsumo[]
  movimientos: MovimientoInsumo[]
  pedidos: PedidoMedicacionInsumo[]
  pedido_items: PedidoItemInsumo[]
  /** Las recepciones no anuladas de esos pedidos (0133). Antes de la 0133 no viene: se lee como vacía. */
  recepciones: RecepcionDePedidoInsumo[]
  /** Enrolamientos en screening/activo sin ninguna medicación habilitada, por estudio. */
  sin_medicacion: { protocol_id: string; enrolamientos: number }[]
}

// ═══════════════════════════ El libro ═══════════════════════════

export interface Libro {
  habia: number
  entro: number
  salio: number
  ajustes: number
  hay: number
}

export function libroDe(mov: MovimientoInsumo | undefined, enEstanteHoy: number): Libro {
  const entro = mov?.entro ?? 0
  const salio = mov?.salio ?? 0
  const ajustes = mov?.ajustes ?? 0
  const habia = enEstanteHoy - (mov?.desde_inicio ?? 0)
  return { habia, entro, salio, ajustes, hay: habia + entro - salio + ajustes }
}

// ═══════════════════════════ La boleta y el armado ═══════════════════════════

export type TipoLineaBoleta =
  | 'hacen_falta' | 'tener_siempre' | 'faltan_este_periodo' | 'quedan_al_corte' | 'hay_en_el_estante' | 'ya_pedido'

export interface LineaBoleta {
  tipo: TipoLineaBoleta
  titulo: string
  /** La explicación chica debajo del renglón. */
  aclaracion: string
  signo: '' | '+' | '−'
  valor: number
}

export interface Boleta {
  lineas: LineaBoleta[]
  aComprar: number
}

/**
 * `EstadoRenglon` (la card vieja, `reposicionModel.ts`) más `'sin_cuenta'`: esta vista corta por
 * `enCurso` (R6) y, en un período que no está en curso, NO calcula la compra — mostrar `'alcanza'`
 * sería un dato inventado presentado como real (regla de honestidad de CLAUDE.md).
 * `'sin_cuenta'` es sólo para `mensual`/`a_demanda`: `sin_cargar` y `no_se_compra` son configuración del
 * medicamento, no una cuenta, y siguen valiendo igual esté o no en curso el período.
 */
export type EstadoRenglonPeriodo = EstadoRenglon | 'sin_cuenta'

export interface RenglonDelPeriodo {
  clave: string
  protocolMedicationId: string
  medicationId: string
  nombre: string
  presentacion: string | null
  modo: ModoReposicion | null
  /** Lo cargado en el estudio, para abrir el formulario con el valor actual. */
  envasesPorMes: number | null
  stockFijo: number | null
  /** Asignaciones activas, sin la habilitación de una entrega: «3 pacientes lo tienen habilitado». */
  pacientes: number
  estado: EstadoRenglonPeriodo
  /** Envases a comprar para el período objetivo (0 si no aplica o si el período no está en curso). */
  comprar: number
  /** Lo que descuenta el renglón «En camino» de la boleta. */
  enCamino: number
  /**
   * Lo que ni el estante ni lo en camino cubren para terminar el período en curso (D31). Neto de lo en
   * camino (revisión de ingeniería, 5): el día después del corte, con el pedido todavía viajando, lo que
   * falta ya está pedido y no es una tarea.
   */
  faltaEstePeriodo: number
  /**
   * El stock mínimo de un período entero (pedido del Director, 2026-09-19): lo que reciben por mes los
   * pacientes que lo tienen asignado y siguen en el período objetivo —con su cantidad propia o, si no
   * tienen, la del estudio—, o el «tener siempre» si es a demanda (`pacientes` null). Tarde, es el período
   * que empezó ENTERO: no lo que le falta, que es lo que dice la boleta. null sin cargar, no se compra, o
   * período que no está en curso.
   */
  minimo: { envases: number; pacientes: number | null } | null
  libro: Libro
  /** null: sin cargar, no se compra, o período que no está en curso. */
  boleta: Boleta | null
  avisos: Aviso[]
}

/** `'sin_cuenta'`: el período no está en curso (R6), no se sabe cubierto de verdad — no confundir con `'cubierto'`. */
export type EstadoTarjeta = 'comprar' | 'cubierto' | 'todo_sin_cargar' | 'sin_medicacion' | 'sin_cuenta'

export interface EstudioReposicion {
  estudio: EstudioInsumo
  /** Por nombre de medicamento. */
  renglones: RenglonDelPeriodo[]
  /** Todos los del estudio, del más nuevo al más viejo. */
  pedidos: PedidoMedicacion[]
  /** El período para el que se arma el pedido: el que viene, o el que empezó si se pide tarde (RD1).
   *  null si el período que se mira no está en curso. */
  objetivo: Periodo | null
  /** RD1: el período empezó hace 5 días o menos, no tiene pedido y le falta algo. La cuenta es la suya. */
  tarde: VentanaTarde | null
  /** El pedido del período objetivo, si ya se emitió (el más nuevo que se le superpone). */
  pedidoDelObjetivo: PedidoMedicacion | null
  /** RD4: los otros pedidos que todavía deben algo, del más viejo al más nuevo. */
  pedidosQueDeben: PedidoMedicacion[]
  resumen: {
    envases: number
    medicamentos: number
    sinCargar: number
    /** Renglones que no son «no se compra». */
    reponibles: number
    /** Σ de lo que ni el estante ni lo en camino cubren para terminar el período en curso (D31). */
    faltaEstePeriodo: number
  }
  estadoTarjeta: EstadoTarjeta
  sinMedicacionHabilitada: number
}

export interface ReposicionDelPeriodo {
  hoy: string
  periodo: Periodo
  /** El período siguiente al pedido: el que se compra cuando `periodo` está en curso. */
  proximo: Periodo
  enCurso: boolean
  /** Días que faltan para el corte; null si el período no está en curso. */
  diasAlCorte: number | null
  /** RD1, para toda Farmacia: hoy cae en los 5 días después de un corte. null si no, o fuera de curso. */
  ventana: VentanaTarde | null
  /** Por código, sin los cerrados. */
  estudios: EstudioReposicion[]
}

const pacientesTxt = (n: number) => `${n} ${n === 1 ? 'paciente' : 'pacientes'}`
const retiraronTxt = (n: number) => (n === 1 ? 'retiró' : 'retiraron')

/** RD13: «hay» es lo físico, vencidos incluidos, y se dice cuántos lo están. */
function textoHay(vigente: number, vencidos: number): string {
  const fisico = vigente + vencidos
  if (vencidos === 0) return `hay ${fisico}`
  if (vigente === 0) return fisico === 1 ? 'hay 1, vencido' : `hay ${fisico}, todos vencidos`
  return `hay ${fisico}, ${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`
}

interface Contexto {
  insumos: InsumosDelPeriodo
  hoy: string
  periodo: Periodo
  proximo: Periodo
  actual: boolean
  pedidos: PedidoMedicacion[]
  duplicados: Set<string>
  noventaDias: string
}

function armarRenglon(r: RenglonPeriodoInsumo, ctx: Contexto, tarde: boolean): RenglonDelPeriodo {
  const lotes = ctx.insumos.lotes.filter((l) => l.protocol_id === r.protocol_id && l.medication_id === r.medication_id)
  const mov = ctx.insumos.movimientos.find((m) => m.protocol_id === r.protocol_id && m.medication_id === r.medication_id)
  const asignaciones = ctx.insumos.pacientes.filter(
    (p) => p.protocol_id === r.protocol_id && p.medication_id === r.medication_id && !p.habilitacion_id,
  )
  const base = {
    clave: r.protocol_medication_id,
    protocolMedicationId: r.protocol_medication_id,
    medicationId: r.medication_id,
    nombre: r.medication_name,
    presentacion: r.presentacion,
    modo: r.modo,
    envasesPorMes: r.envases_por_mes,
    stockFijo: r.stock_fijo,
    pacientes: asignaciones.length,
    libro: libroDe(mov, lotes.reduce((s, l) => s + l.quantity, 0)),
  }
  const sinCuenta: Pick<RenglonDelPeriodo, 'comprar' | 'enCamino' | 'faltaEstePeriodo' | 'minimo' | 'boleta' | 'avisos'> =
    { comprar: 0, enCamino: 0, faltaEstePeriodo: 0, minimo: null, boleta: null, avisos: [] }
  if (r.modo == null) return { ...base, ...sinCuenta, estado: 'sin_cargar' }
  if (r.modo === 'no_se_compra') return { ...base, ...sinCuenta, estado: 'no_se_compra' }
  // Período que no está en curso (R6): sin_cargar/no_se_compra son configuración y ya se resolvieron
  // arriba; para mensual/a_demanda no hay cuenta hecha, así que decirlo es honesto y 'alcanza' no lo era.
  if (!ctx.actual) return { ...base, ...sinCuenta, estado: 'sin_cuenta' }

  // El período para el que se compra: el que viene, o el que empezó si se pide tarde (RD1).
  const objetivo = tarde ? ctx.periodo : ctx.proximo
  const lineas: LineaBoleta[] = []
  const avisos: Aviso[] = []
  let pendiente = 0
  let pendientes = 0
  let pacientesDelPeriodo = 0
  let minimo: RenglonDelPeriodo['minimo'] = { envases: r.stock_fijo ?? 0, pacientes: null }

  if (r.modo === 'mensual') {
    const suman = asignaciones.filter((p) => !ctx.duplicados.has(p.patient_medication_id))
    const mensual = (p: PacientePeriodoInsumo) => p.envases_por_mes ?? r.envases_por_mes ?? 0

    const delPeriodo = suman.filter((p) => sigueEnElMes(p, ctx.periodo.desde))
    pacientesDelPeriodo = delPeriodo.length
    let retiraron = 0
    for (const p of delPeriodo) {
      const falta = Math.max(0, mensual(p) - p.retirado_periodo)
      pendiente += falta
      if (falta > 0) pendientes += 1
      retiraron += Math.min(mensual(p), p.retirado_periodo)
    }

    // Tarde, cuentan los del período que empezó; si no, los que siguen en el que viene.
    const delObjetivo = tarde ? delPeriodo : suman.filter((p) => sigueEnElMes(p, ctx.proximo.desde))
    minimo = { envases: delObjetivo.reduce((s, p) => s + mensual(p), 0), pacientes: delObjetivo.length }
    const propios = delObjetivo.filter((p) => p.envases_por_mes != null).length
    const quienes = delObjetivo.length === 0 ? 'ningún paciente lo recibe'
      : propios > 0 ? `${pacientesTxt(delObjetivo.length)} (${propios} con cantidad propia)`
        : `${pacientesTxt(delObjetivo.length)}, ${envasesTxt(r.envases_por_mes ?? 0)} por mes`
    lineas.push(tarde
      ? {
          tipo: 'hacen_falta', titulo: 'Hacen falta para el período que empezó', signo: '', valor: pendiente,
          aclaracion: delObjetivo.length === 0 ? quienes : `${quienes}; retiraron ${retiraron}`,
        }
      : {
          tipo: 'hacen_falta', titulo: 'Hacen falta para el período que viene', signo: '',
          valor: delObjetivo.reduce((s, p) => s + mensual(p), 0), aclaracion: quienes,
        })

    const terminaron = asignaciones.filter((p) => terminoCronograma(p, objetivo.desde))
    if (terminaron.length) avisos.push({ tipo: 'termino_cronograma', ambar: false, texto: `Terminó su cronograma y no suma: ${nombresDePacientes(terminaron)}` })
    const sinRetiros = delObjetivo.filter((p) => !p.ultimo_retiro || p.ultimo_retiro.slice(0, 10) < ctx.noventaDias)
    if (sinRetiros.length) avisos.push({ tipo: 'sin_retiros', ambar: false, texto: `Sin retiros en 90 días, suma igual: ${nombresDePacientes(sinRetiros)}` })
    const dobles = asignaciones.filter((p) => ctx.duplicados.has(p.patient_medication_id))
    if (dobles.length) avisos.push({ tipo: 'dos_presentaciones', ambar: true, texto: `Tiene otra presentación habilitada, suma una sola: ${nombresDePacientes(dobles)}` })
    const varios = suman.filter((p) => mensual(p) > 0 && p.retirado_periodo > mensual(p))
    if (varios.length) avisos.push({ tipo: 'varios_meses', ambar: false, texto: `Se llevó más de un mes en este período: ${nombresDePacientes(varios)}` })
  } else {
    lineas.push({ tipo: 'tener_siempre', titulo: 'Tener siempre', signo: '', valor: r.stock_fijo ?? 0, aclaracion: 'a demanda' })
  }

  const est = estanteAlComienzo(lotes, pendiente, ctx.hoy, objetivo)
  const vencidos = lotes.filter((l) => l.expiry_date != null && l.expiry_date < ctx.hoy).reduce((s, l) => s + l.quantity, 0)

  if (tarde) {
    // Tarde no hay «al corte»: lo vigente hoy es lo que atiende a los que todavía no retiraron.
    if (est.vigenteHoy + vencidos > 0) {
      lineas.push({ tipo: 'hay_en_el_estante', titulo: 'Hay en el estante', signo: '−', valor: est.vigenteHoy, aclaracion: textoHay(est.vigenteHoy, vencidos) })
    }
  } else {
    // Lo vigente que no se lleva lo pendiente de P0 y tampoco llega vivo al inicio de P1.
    const vencenAntes = est.vigenteHoy - (pendiente - est.faltaEsteMes) - est.alComienzo
    if (est.faltaEsteMes > 0) {
      lineas.push({
        tipo: 'faltan_este_periodo',
        titulo: 'Faltan para terminar este período',
        signo: '+',
        valor: est.faltaEsteMes,
        aclaracion: `${pacientesTxt(pendientes)} todavía no ${retiraronTxt(pendientes)} y en el estante no alcanza`,
      })
    }
    // También cuando no queda nada VIGENTE (alComienzo = 0) pero sí hay vencidos o algo que vence antes del
    // período que viene: si el libro dice «Hay 10» y la boleta pidiera igual sin explicarlo, no cierra a la
    // vista. Se muestra con valor 0 para que la aclaración diga por qué no cuenta.
    if (est.alComienzo > 0 || vencidos > 0 || vencenAntes > 0) {
      let aclaracion = textoHay(est.vigenteHoy, vencidos)
      if (est.vigenteHoy > 0 && pacientesDelPeriodo > 0) {
        aclaracion += pendientes > 0
          ? `, y ${pacientesTxt(pendientes)} todavía no ${retiraronTxt(pendientes)}`
          : `${vencidos > 0 ? ', y' : ' y'} ya retiraron todos`
      }
      if (vencenAntes > 0) aclaracion += `, ${vencenAntes} ${vencenAntes === 1 ? 'vence' : 'vencen'} antes del período que viene`
      lineas.push({ tipo: 'quedan_al_corte', titulo: 'Van a quedar en el estante al corte', signo: '−', valor: est.alComienzo, aclaracion })
    }
  }

  const ya = yaPedidoDe(ctx.pedidos, r.protocol_id, r.medication_id)
  if (ya.envases > 0) {
    // RD17: si ya llegó y falta verificarlo, se dice acá también, para que no se vuelva a pedir.
    const llego = sinVerificarDe(ctx.pedidos, r.protocol_id, r.medication_id)
    lineas.push({
      tipo: 'ya_pedido', titulo: 'En camino', signo: '−', valor: ya.envases,
      aclaracion: llego ? `${textoDePedidos(ya.pedidos)} · ${faltaVerificarTxt(llego)}` : textoDePedidos(ya.pedidos),
    })
  }
  for (const v of est.vencenEnElMes) {
    avisos.push({ tipo: 'vence', ambar: true, texto: `Vence el ${diaMes(v.expiry_date)}: lote ${v.lot_number}, ${envasesTxt(v.quantity)}` })
  }

  const comprar = Math.max(0, lineas.reduce((s, l) => (l.signo === '−' ? s - l.valor : s + l.valor), 0))
  const estado: EstadoRenglon = comprar > 0 ? 'comprar' : ya.envases > 0 ? 'en_camino' : 'alcanza'
  return {
    ...base, estado, comprar, enCamino: ya.envases, faltaEstePeriodo: Math.max(0, est.faltaEsteMes - ya.envases), minimo,
    boleta: { lineas, aComprar: comprar }, avisos,
  }
}

export function armarReposicionDelPeriodo(
  insumos: InsumosDelPeriodo,
  hoy: string,
  periodo: Periodo,
  diaCorte: number,
): ReposicionDelPeriodo {
  const proximo = periodoSiguiente(periodo, diaCorte)
  const actual = enCurso(periodo, hoy)
  const ventana = actual ? ventanaTarde(hoy, diaCorte) : null
  const pedidos = armarPedidos(insumos.pedidos, insumos.pedido_items, insumos.recepciones)
  const ctx: Contexto = {
    insumos, hoy, periodo, proximo, actual, pedidos,
    duplicados: presentacionesDuplicadas(insumos.pacientes),
    noventaDias: sumarDias(hoy, -90),
  }

  const estudios = insumos.estudios
    .filter((e) => e.status !== 'cerrado')
    .sort((a, b) => a.code.localeCompare(b.code, 'es'))
    .map((estudio): EstudioReposicion => {
      const pedidosDelEstudio = pedidos.filter((p) => p.protocol_id === estudio.id)
      const renglonesCon = (tarde: boolean) => insumos.renglones
        .filter((r) => r.protocol_id === estudio.id)
        .map((r) => armarRenglon(r, ctx, tarde))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      // RD1: dentro de la ventana, un período que empezó sin pedido y al que le falta algo se pide a sí
      // mismo. Si no le falta nada, no hay nada tarde que pedir y la cuenta es la del que viene.
      const renglonesTarde = ventana && !pedidoPara(pedidosDelEstudio, periodo) ? renglonesCon(true) : null
      const tarde = renglonesTarde?.some((r) => r.comprar > 0) ? ventana : null
      const renglones = tarde && renglonesTarde ? renglonesTarde : renglonesCon(false)
      const objetivo = !actual ? null : tarde ? periodo : proximo
      const pedidoDelObjetivo = objetivo ? pedidoPara(pedidosDelEstudio, objetivo) : null

      const reponibles = renglones.filter((r) => r.estado !== 'no_se_compra').length
      const sinCargar = renglones.filter((r) => r.estado === 'sin_cargar').length
      const aComprar = renglones.filter((r) => r.comprar > 0)
      const envases = aComprar.reduce((s, r) => s + r.comprar, 0)
      return {
        estudio,
        renglones,
        pedidos: pedidosDelEstudio,
        objetivo,
        tarde,
        pedidoDelObjetivo,
        // RD4: el renglón de «lo anterior» es de OTROS períodos. Un segundo pedido del mismo (con «Armar
        // otro pedido») se ve en la lista del estudio, no ahí (revisión de ingeniería, 11).
        pedidosQueDeben: pedidosDelEstudio
          .filter((p) => p.estado !== 'anulado' && p.faltanteTotal > 0 && p.id !== pedidoDelObjetivo?.id
            && !(objetivo && seSuperpone(p, objetivo)))
          .sort((a, b) => a.numero - b.numero),
        resumen: {
          envases, medicamentos: aComprar.length, sinCargar, reponibles,
          faltaEstePeriodo: renglones.reduce((s, r) => s + r.faltaEstePeriodo, 0),
        },
        // 'sin_medicacion' primero: es cierto pase lo que pase con el período. Después, si el período no
        // está en curso (R6), la tarjeta tampoco inventa 'cubierto': dice 'sin_cuenta'.
        estadoTarjeta: reponibles === 0 ? 'sin_medicacion'
          : !actual ? 'sin_cuenta'
            : sinCargar === reponibles ? 'todo_sin_cargar'
              : envases > 0 ? 'comprar'
                : 'cubierto',
        sinMedicacionHabilitada: insumos.sin_medicacion.find((s) => s.protocol_id === estudio.id)?.enrolamientos ?? 0,
      }
    })

  return {
    hoy, periodo, proximo, enCurso: actual,
    diasAlCorte: actual ? diasHastaElCorte(hoy, periodo) : null,
    ventana,
    estudios,
  }
}

// ═══════════════════════════ «Armar pedido» (R8) ═══════════════════════════

export interface RenglonBorrador {
  medicationId: string
  nombre: string
  presentacion: string | null
  /** Lo que calculó Spira; null = estaba sin cargar. */
  calculado: number | null
  pedir: number
}

/**
 * Arranca en lo calculado; lo sin cargar en cero para pedirlo a mano; «no se compra» no aparece.
 * Sólo tiene sentido con un `EstudioReposicion` del período EN CURSO: fuera de curso todo renglón con
 * cuenta es `'sin_cuenta'` (comprar 0), y armar el pedido desde ahí pediría todo en cero.
 */
export function borradorDelPedido(e: EstudioReposicion): RenglonBorrador[] {
  return e.renglones
    .filter((r) => r.estado !== 'no_se_compra')
    .map((r) => ({
      medicationId: r.medicationId,
      nombre: r.nombre,
      presentacion: r.presentacion,
      calculado: r.modo == null ? null : r.comprar,
      pedir: r.modo == null ? 0 : r.comprar,
    }))
}

/** Lo que viaja a `emitir_pedido_medicacion`: sólo cantidades enteras mayores a cero. */
export function renglonesAEmitir(b: readonly RenglonBorrador[]): { medication_id: string; calculado: number | null; pedido: number }[] {
  return b
    .filter((r) => Number.isInteger(r.pedir) && r.pedir > 0)
    .map((r) => ({ medication_id: r.medicationId, calculado: r.calculado, pedido: r.pedir }))
}

/** «Seretide 250/50: pedís 6, Spira calculó 4.» */
export function cambiosDelBorrador(b: readonly RenglonBorrador[]): string[] {
  return b
    .filter((r) => r.calculado != null && Number.isInteger(r.pedir) && r.pedir !== r.calculado)
    .map((r) => `${r.nombre}: pedís ${r.pedir}, Spira calculó ${r.calculado}.`)
}
```

`estanteAlComienzo` recibe `objetivo` (un `Periodo`) donde su firma pide `Pick<Mes, 'desde' | 'hasta'>`. Es
la misma forma, así que compila sin cambios (la Task 13 cambia ese tipo).

- [ ] **Step 4: Correrlo y ver que pasa**

Run: `npx vitest run src/data/pharma/reposicionPeriodoModel.test.ts src/data/pharma/pedidosMedicacionModel.test.ts src/data/pharma/periodoDeCorte.test.ts`
Expected: PASS, todos.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/data/pharma/reposicionPeriodoModel.ts src/data/pharma/reposicionPeriodoModel.test.ts
git commit -m "feat(reposicion): pedido tarde, «En camino» y «hay» físico en la cuenta (RD1, RD12, RD13)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Lo que dicen la grilla y el estudio

**Files:**
- Create: `src/data/pharma/reposicionTarjetaModel.ts`
- Test: `src/data/pharma/reposicionTarjetaModel.test.ts`
- Modify: `src/data/pharma/index.ts`

**Interfaces:**
- Consumes:
  - de las Tasks 1 a 3: `EstudioReposicion`, `ReposicionDelPeriodo`, `pastillaDePedido`, `PastillaPedido`, `faltaTxt`, `numerosDePedidos`, `textoDeRecepciones`, `textoPeriodo`;
  - `envasesTxt`, `diaMes`.
- Produces:
  - `const DIAS_MODO_TAREA = 7`
  - `type PrincipalTarjeta = { tipo: 'comprar'; envases: number } | { tipo: 'cubierto' } | { tipo: 'falta_cargar' } | { tipo: 'sin_medicacion' } | { tipo: 'sin_cuenta' } | { tipo: 'pedido'; numero: number; pastilla: PastillaPedido }`
  - `interface TextoTarjeta { texto: string; aviso: boolean }`
  - `interface RenglonTarjeta { texto: string; mudo: boolean }`
  - `interface TarjetaEstudio { principal: PrincipalTarjeta; detalle: TextoTarjeta[]; renglones: RenglonTarjeta[]; clicable: boolean }`
  - `tarjetaDe(e: EstudioReposicion, rep: ReposicionDelPeriodo): TarjetaEstudio`
  - `interface FranjaCorte { texto: string; sub: string; aviso: boolean }`
  - `franjaDelCorte(rep: ReposicionDelPeriodo): FranjaCorte | null`
  - `subtituloDelPeriodo(rep: ReposicionDelPeriodo, e: EstudioReposicion | null): TextoTarjeta`
  - `type ResumenEstudio = { tipo: 'compra'; titulo: string; envases: number; sinCargar: number; detalle: string } | { tipo: 'pedido'; titulo: string; pedido: PedidoMedicacion; pastilla: PastillaPedido; detalle: string }`
  - `resumenDelEstudio(e: EstudioReposicion, rep: ReposicionDelPeriodo): ResumenEstudio | null`
  - `pedidosAMostrar(e: EstudioReposicion, rep: ReposicionDelPeriodo): PedidoMedicacion[]`
  - `quedanTxt(n: number): string` → `'queda 1 día'` · `'quedan 3 días'`

- [ ] **Step 1: Escribir el test que falla**

`src/data/pharma/reposicionTarjetaModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { franjaDelCorte, pedidosAMostrar, resumenDelEstudio, subtituloDelPeriodo, tarjetaDe } from './reposicionTarjetaModel'
import { armarReposicionDelPeriodo, type InsumosDelPeriodo, type PacientePeriodoInsumo, type RenglonPeriodoInsumo } from './reposicionPeriodoModel'
import { periodoDe } from './periodoDeCorte'
import type { EstudioInsumo, LoteInsumo } from './reposicionModel'
import type { PedidoItemInsumo, PedidoMedicacionInsumo, RecepcionDePedidoInsumo } from './pedidosMedicacionModel'

/**
 * Lo que dicen la grilla y el estudio (revisión de diseño del 17/09: RD1, RD4-RD7, RD17).
 *
 * Se testea porque elegir mal no se ve: una tarjeta que dice «Cubierto» cuando falta pedir, o una franja
 * que cuenta un estudio que ya tiene su pedido, se dibujan igual de prolijas que las correctas.
 * Fechas fijas (CI corre en UTC). Corte el 28: el período en curso del 16/09 es 29/08 al 28/09.
 */

const CORTE = 28
const estudio = (p: Partial<EstudioInsumo> = {}): EstudioInsumo => ({ id: 'endura', code: '222714', name: 'ENDURA', status: 'activo', ...p })
const renglon = (p: Partial<RenglonPeriodoInsumo> = {}): RenglonPeriodoInsumo => ({
  protocol_medication_id: 'pm-seretide', protocol_id: 'endura', medication_id: 'seretide', medication_name: 'Seretide 250/50',
  presentacion: 'Aerosol', drug_id: 'fluti', modo: 'mensual', envases_por_mes: 1, stock_fijo: null, ...p,
})
let n = 0
const paciente = (p: Partial<PacientePeriodoInsumo> = {}): PacientePeriodoInsumo => {
  n += 1
  return {
    patient_medication_id: `pmed-${n}`, enrollment_id: `enr-${n}`, protocol_id: 'endura', medication_id: 'seretide', drug_id: 'fluti',
    patient_name: `Paciente ${String(n).padStart(2, '0')}`, enrollment_status: 'activo', envases_por_mes: null, habilitacion_id: null,
    asignado_el: '2026-03-01', tiene_cronograma: false, ultima_programada: null, retirado_periodo: 1, ultimo_retiro: '2026-09-05', ...p,
  }
}
const grupo = (cuantos: number, retiraron: number, protocolo = 'endura') =>
  Array.from({ length: cuantos }, (_, i) => paciente({ retirado_periodo: i < retiraron ? 1 : 0, protocol_id: protocolo }))
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p,
})
const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-28', emitido_por_nombre: 'Lautaro Molina', anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-1', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 4, pedido: 4, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const recepcion = (p: Partial<RecepcionDePedidoInsumo> = {}): RecepcionDePedidoInsumo => ({
  id: 'rec-1051', pedido_id: 'ped-14', folio: 1051, reception_date: '2026-10-02', status: 'pendiente', verified_by_name: null, envases: 4, ...p,
})
const insumos = (p: Partial<InsumosDelPeriodo> = {}): InsumosDelPeriodo => ({
  estudios: [estudio()], renglones: [renglon()], pacientes: [], lotes: [], movimientos: [], pedidos: [], pedido_items: [],
  recepciones: [], sin_medicacion: [], ...p,
})
/** La reposición del período en curso a `hoy`. */
const rep = (hoy: string, i: InsumosDelPeriodo) => armarReposicionDelPeriodo(i, hoy, periodoDe(hoy, CORTE), CORTE)
const tarjeta = (hoy: string, i: InsumosDelPeriodo) => { const r = rep(hoy, i); return tarjetaDe(r.estudios[0], r) }
/** 12 pacientes que ya retiraron y 8 en el estante: para el período que viene hay que comprar 4. */
const COMPRA_4 = (p: Partial<InsumosDelPeriodo> = {}) => insumos({ pacientes: grupo(12, 12), lotes: [lote()], ...p })
/** El 01/10: pasó el corte del 28/09, 12 pacientes sin retirar, 5 en el estante → tarde, 7 (RD1). */
const TARDE = () => insumos({ pacientes: grupo(12, 0), lotes: [lote({ quantity: 5 })] })
const CERRADO = { cerrado_at: '2026-10-05T14:00:00+00:00', cerrado_por_nombre: 'Lautaro Molina', cerrado_motivo: 'no_lo_tiene' as const }

describe('la tarjeta sin pedido (RD4, RD6)', () => {
  it('faltando 7 días o menos, lo que hay que comprar es la tarea', () => {
    expect(tarjeta('2026-09-22', COMPRA_4())).toEqual({
      principal: { tipo: 'comprar', envases: 4 },
      detalle: [{ texto: '1 medicamento', aviso: false }],
      renglones: [{ texto: 'Para el período que viene: sin pedido', mudo: true }],
      clicable: true,
    })
  })
  it('a mitad de período lo dice tranquilo, con la fecha del corte', () => {
    expect(tarjeta('2026-09-16', COMPRA_4())).toEqual({
      principal: { tipo: 'cubierto' },
      detalle: [],
      renglones: [{ texto: 'Para el corte del 28/09: 4 envases · todavía sin pedido', mudo: true }],
      clicable: true,
    })
  })
  it('si al período en curso le falta algo, es tarea aunque falte mucho para el corte (decisión 3 del plan)', () => {
    expect(tarjeta('2026-09-16', insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 3 })] })).principal)
      .toEqual({ tipo: 'comprar', envases: 9 })
  })
  it('sin nada para comprar: cubierto y no hace falta pedir', () => {
    expect(tarjeta('2026-09-22', COMPRA_4({ lotes: [lote({ quantity: 20 })] }))).toEqual({
      principal: { tipo: 'cubierto' },
      detalle: [],
      renglones: [{ texto: 'Para el período que viene: no hace falta pedir', mudo: true }],
      clicable: true,
    })
  })
  it('lo sin cargar se dice aparte', () => {
    const t = tarjeta('2026-09-22', COMPRA_4({
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', modo: null, envases_por_mes: null })],
    }))
    expect(t.detalle).toEqual([{ texto: '1 medicamento', aviso: false }, { texto: '1 sin cargar', aviso: true }])
  })
  it('nada cargado: falta cargar cómo se repone', () => {
    expect(tarjeta('2026-09-22', insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })] }))).toEqual({
      principal: { tipo: 'falta_cargar' },
      detalle: [{ texto: '0 de 1 cargados', aviso: false }],
      renglones: [{ texto: 'Para el período que viene: sin pedido', mudo: true }],
      clicable: true,
    })
  })
  it('dice cuántos pacientes quedan afuera de la cuenta (revisión de ingeniería, 13)', () => {
    expect(tarjeta('2026-09-22', COMPRA_4({ sin_medicacion: [{ protocol_id: 'endura', enrolamientos: 2 }] })).detalle).toEqual([
      { texto: '1 medicamento', aviso: false },
      { texto: '2 pacientes sin medicación habilitada', aviso: true },
    ])
  })
  it('en un período cerrado no hay cuenta, y lo dice (rama defensiva)', () => {
    const r = armarReposicionDelPeriodo(COMPRA_4(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE)
    expect(tarjetaDe(r.estudios[0], r)).toEqual({ principal: { tipo: 'sin_cuenta' }, detalle: [], renglones: [], clicable: true })
  })
  it('sin medicación de base no se entra (RD16)', () => {
    expect(tarjeta('2026-09-22', insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] }))).toEqual({
      principal: { tipo: 'sin_medicacion' }, detalle: [], renglones: [], clicable: false,
    })
  })
})

describe('la tarjeta con pedido (RD4, RD5, RD17, RD3)', () => {
  it('con el pedido emitido, el pedido es lo principal', () => {
    expect(tarjeta('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] }))).toEqual({
      principal: { tipo: 'pedido', numero: 14, pastilla: { clave: 'sin_recibir', texto: 'Sin recibir' } },
      detalle: [{ texto: '4 envases para el 29/09 al 28/10', aviso: false }],
      renglones: [],
      clicable: true,
    })
  })
  it('si pidió menos de lo que hacía falta, lo dice', () => {
    expect(tarjeta('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item({ pedido: 3 })] })).detalle).toEqual([
      { texto: '3 envases para el 29/09 al 28/10', aviso: false },
      { texto: 'falta 1 envase más', aviso: true },
    ])
  })
  it('llegó sin verificar: nombra la recepción', () => {
    const t = tarjeta('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item({ sin_verificar: 4 })], recepciones: [recepcion()] }))
    expect(t.principal).toMatchObject({ tipo: 'pedido', pastilla: { clave: 'llego' } })
    expect(t.detalle).toEqual([{ texto: 'Recepción Nº 1051 sin verificar', aviso: false }])
  })
  it('cerrado sin que llegue nada: vuelve a la compra', () => {
    const t = tarjeta('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item({ ...CERRADO })] }))
    expect(t.principal).toMatchObject({ tipo: 'pedido', pastilla: { clave: 'no_llego', texto: 'Cerrado · no llegó' } })
    expect(t.detalle).toEqual([{ texto: '4 envases vuelven a la compra', aviso: false }])
  })
  it('un pedido anterior que debe algo va en su propio renglón', () => {
    const t = tarjeta('2026-09-22', COMPRA_4({
      pedidos: [cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' })],
      pedido_items: [item({ id: 'i13', pedido_id: 'ped-13', pedido: 2, recibido: 1 })],
    }))
    expect(t.principal).toEqual({ tipo: 'comprar', envases: 3 })
    expect(t.renglones).toEqual([
      { texto: 'Para el período que viene: sin pedido', mudo: true },
      { texto: 'Pedido Nº 13 · falta 1 envase', mudo: false },
    ])
  })
})

describe('la tarjeta el día después del corte (revisión de ingeniería, 5)', () => {
  it('con el pedido del período en camino, lo que falta ya está pedido: la tarjeta está tranquila', () => {
    // 29/09: el Nº 14 (para el 29/09 al 28/10) se emitió el 28/09 y todavía no llegó; nadie retiró.
    const t = tarjeta('2026-09-29', insumos({
      pacientes: grupo(12, 0), lotes: [lote({ quantity: 2 })], pedidos: [cab()], pedido_items: [item({ pedido: 10, calculado: 10 })],
    }))
    expect(t.principal).toEqual({ tipo: 'cubierto' })
    expect(t.renglones[0]).toEqual({ texto: 'Para el corte del 28/10: 12 envases · todavía sin pedido', mudo: true })
  })
})

describe('la tarjeta con el pedido tarde (RD1)', () => {
  it('pasó el corte, sin pedido: la tarea es el período que empezó', () => {
    expect(tarjeta('2026-10-01', TARDE())).toEqual({
      principal: { tipo: 'comprar', envases: 7 },
      detalle: [{ texto: 'Para el período que empezó · quedan 3 días', aviso: true }],
      renglones: [{ texto: 'Para el período 29/09 al 28/10: sin pedido', mudo: true }],
      clicable: true,
    })
  })
})

describe('la franja del corte (RD7)', () => {
  it('a mitad de mes cuenta los estudios con compras y sin pedido', () => {
    expect(franjaDelCorte(rep('2026-09-16', COMPRA_4()))).toEqual({
      texto: 'Corte el 28/09 · faltan 12 días',
      sub: 'Período 29/08 al 28/09 · 1 estudio tiene compras y todavía no tiene pedido.',
      aviso: false,
    })
  })
  it('en plural', () => {
    const dos = COMPRA_4({
      estudios: [estudio(), estudio({ id: 'lts', code: 'LTS17231', name: 'LTS' })],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-lts', protocol_id: 'lts' })],
      pacientes: [...grupo(12, 12), ...grupo(12, 12, 'lts')],
      lotes: [lote(), lote({ protocol_id: 'lts' })],
    })
    expect(franjaDelCorte(rep('2026-09-16', dos))?.sub).toBe('Período 29/08 al 28/09 · 2 estudios tienen compras y todavía no tienen pedido.')
  })
  it('un estudio que ya tiene su pedido no cuenta', () => {
    expect(franjaDelCorte(rep('2026-09-16', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] })))?.sub)
      .toBe('Período 29/08 al 28/09 · todos los estudios con compras tienen su pedido.')
  })
  it('con medicamentos sin cargar no dice «no hay nada para pedir» (revisión de ingeniería, 13)', () => {
    const conSinCargar = COMPRA_4({
      lotes: [lote({ quantity: 20 })],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', modo: null, envases_por_mes: null })],
    })
    expect(franjaDelCorte(rep('2026-09-16', conSinCargar))?.sub).toBe('Período 29/08 al 28/09 · falta cargar cómo se repone en 1 estudio.')
  })
  it('sin compras, lo dice', () => {
    expect(franjaDelCorte(rep('2026-09-16', COMPRA_4({ lotes: [lote({ quantity: 20 })] })))?.sub)
      .toBe('Período 29/08 al 28/09 · no hay nada para pedir.')
  })
  it('mañana y hoy', () => {
    expect(franjaDelCorte(rep('2026-09-27', COMPRA_4()))).toEqual({
      texto: 'Corte mañana (28/09)', sub: '1 estudio sin pedido para el período que viene.', aviso: false,
    })
    expect(franjaDelCorte(rep('2026-09-28', COMPRA_4()))).toEqual({
      texto: 'El corte es hoy', sub: '1 estudio sin pedido para el período que viene.', aviso: true,
    })
    expect(franjaDelCorte(rep('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] })))?.sub)
      .toBe('Todos los estudios con compras tienen su pedido.')
  })
  it('dentro de los 5 días, lo que falta pedir del período que empezó (RD1)', () => {
    expect(franjaDelCorte(rep('2026-10-01', TARDE()))).toEqual({
      texto: 'El corte fue el 28/09 · quedan 3 días para pedir el período que empezó',
      sub: '1 estudio sin pedido para el 29/09 al 28/10.',
      aviso: true,
    })
  })
  it('un período cerrado no tiene franja', () => {
    expect(franjaDelCorte(armarReposicionDelPeriodo(COMPRA_4(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE))).toBeNull()
  })
})

describe('el subtítulo del período en el estudio', () => {
  const sub = (hoy: string, i = COMPRA_4()) => { const r = rep(hoy, i); return subtituloDelPeriodo(r, r.estudios[0]) }
  it('en curso, mañana, hoy', () => {
    expect(sub('2026-09-16')).toEqual({ texto: 'Período en curso · el corte es en 12 días', aviso: false })
    expect(sub('2026-09-27')).toEqual({ texto: 'Período en curso · el corte es mañana', aviso: false })
    expect(sub('2026-09-28')).toEqual({ texto: 'El corte es hoy', aviso: true })
  })
  it('tarde y cerrado', () => {
    expect(sub('2026-10-01', TARDE())).toEqual({ texto: 'Período en curso · quedan 3 días para pedirlo', aviso: true })
    const cerrado = armarReposicionDelPeriodo(COMPRA_4(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE)
    expect(subtituloDelPeriodo(cerrado, cerrado.estudios[0])).toEqual({ texto: 'Período cerrado', aviso: false })
  })
})

describe('el resumen del estudio (RD5)', () => {
  const resumen = (hoy: string, i: InsumosDelPeriodo) => { const r = rep(hoy, i); return resumenDelEstudio(r.estudios[0], r) }
  it('sin pedido: cuánto comprar', () => {
    expect(resumen('2026-09-16', COMPRA_4())).toEqual({
      tipo: 'compra', titulo: 'Para el período que viene (29/09 al 28/10)', envases: 4, sinCargar: 0,
      detalle: '1 medicamento para comprar · todavía sin pedido',
    })
  })
  it('con el pedido de hoy: el pedido y si alcanza', () => {
    expect(resumen('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] })))
      .toMatchObject({ tipo: 'pedido', pastilla: { clave: 'sin_recibir' }, detalle: 'Emitido hoy · 4 envases · con esto alcanza' })
  })
  it('tarde: para el período que empezó', () => {
    expect(resumen('2026-10-01', TARDE())?.titulo).toBe('Para el período que empezó (29/09 al 28/10)')
  })
})

describe('qué pedidos lista el estudio', () => {
  const tres = () => COMPRA_4({
    pedidos: [
      cab(),
      cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' }),
      cab({ id: 'ped-12', numero: 12, periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' }),
    ],
    pedido_items: [item(), item({ id: 'i13', pedido_id: 'ped-13', recibido: 4 }), item({ id: 'i12', pedido_id: 'ped-12', recibido: 4 })],
  })
  it('en curso: el del período, el del que viene y los que deben; no los viejos ya recibidos', () => {
    const r = rep('2026-09-16', tres())
    expect(pedidosAMostrar(r.estudios[0], r).map((p) => p.numero)).toEqual([14, 13])
  })
  it('en curso, también uno viejo con una recepción sin verificar', () => {
    const r = rep('2026-09-16', COMPRA_4({
      pedidos: [cab({ id: 'ped-12', numero: 12, periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' })],
      pedido_items: [item({ id: 'i12', pedido_id: 'ped-12', recibido: 4, sin_verificar: 2 })],
    }))
    expect(pedidosAMostrar(r.estudios[0], r).map((p) => p.numero)).toEqual([12])
  })
  it('en un período cerrado: los que eran para él', () => {
    const r = armarReposicionDelPeriodo(tres(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE)
    expect(pedidosAMostrar(r.estudios[0], r).map((p) => p.numero)).toEqual([12])
  })
})
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run src/data/pharma/reposicionTarjetaModel.test.ts`
Expected: FAIL con «Cannot find module './reposicionTarjetaModel'».

- [ ] **Step 3: Escribir el modelo**

`src/data/pharma/reposicionTarjetaModel.ts`:

```ts
import { diaMes, envasesTxt } from './reposicionModel'
import { textoPeriodo } from './periodoDeCorte'
import type { Periodo } from './periodoDeCorte'
import { faltaTxt, numerosDePedidos, pastillaDePedido, textoDeRecepciones } from './pedidosMedicacionModel'
import type { PastillaPedido, PedidoMedicacion } from './pedidosMedicacionModel'
import type { EstudioReposicion, ReposicionDelPeriodo } from './reposicionPeriodoModel'

/**
 * ┌─ Lo que dicen la grilla y el estudio (spec 2026-09-16, revisión de diseño RD1, RD4-RD7, RD17) ─────┐
 *
 * La cuenta vive en reposicionPeriodoModel; acá se decide QUÉ se muestra de ella:
 *
 *   tarjeta   con pedido del período objetivo → el pedido y su pastilla (RD5)
 *             tarde → «N envases para comprar» + «Para el período que empezó · quedan 3 días» (RD1)
 *             ≤ 7 días al corte, o le falta algo al período en curso → «N envases para comprar» (RD6)
 *             el resto del mes → «Cubierto» + «Para el corte del 28/10: N envases · todavía sin pedido»
 *             + un renglón por los pedidos anteriores que todavía deben algo (RD4)
 *   franja    cuenta SÓLO los estudios con compras y sin pedido para su período objetivo (RD7)
 *
 * Se testea porque elegir mal no se ve: «Cubierto» con compras pendientes, o una franja que cuenta un
 * estudio que ya pidió, se dibujan igual de prolijos que lo correcto.
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** RD6: faltando 7 días o menos para el corte, lo que hay que comprar es una tarea. */
export const DIAS_MODO_TAREA = 7

export type PrincipalTarjeta =
  | { tipo: 'comprar'; envases: number }
  | { tipo: 'cubierto' }
  | { tipo: 'falta_cargar' }
  | { tipo: 'sin_medicacion' }
  | { tipo: 'sin_cuenta' }
  | { tipo: 'pedido'; numero: number; pastilla: PastillaPedido }

export interface TextoTarjeta {
  texto: string
  /** Va en ámbar. */
  aviso: boolean
}

export interface RenglonTarjeta {
  texto: string
  /** El renglón fijo sin pedido va apagado; el de un pedido que debe algo, no. */
  mudo: boolean
}

export interface TarjetaEstudio {
  principal: PrincipalTarjeta
  /** Debajo del principal, unidos por « · ». */
  detalle: TextoTarjeta[]
  /** RD4: el renglón fijo del período objetivo y, si hay, el de los pedidos anteriores que deben algo. */
  renglones: RenglonTarjeta[]
  /** Sin medicación de base no se entra (RD16). */
  clicable: boolean
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
export const quedanTxt = (n: number) => (n === 1 ? 'queda 1 día' : `quedan ${n} días`)
const periodoDelPedido = (p: PedidoMedicacion): Periodo => ({ desde: p.periodo_desde, hasta: p.periodo_hasta })

/** RD4: «Pedido Nº 13 · falta 1 envase» — sólo si un pedido que no es el del objetivo todavía debe algo. */
function renglonesQueDeben(e: EstudioReposicion): RenglonTarjeta[] {
  if (e.pedidosQueDeben.length === 0) return []
  const falta = e.pedidosQueDeben.reduce((s, p) => s + p.faltanteTotal, 0)
  return [{ texto: `${numerosDePedidos(e.pedidosQueDeben)} · ${faltaTxt(falta)}`, mudo: false }]
}

export function tarjetaDe(e: EstudioReposicion, rep: ReposicionDelPeriodo): TarjetaEstudio {
  const t = tarjetaSinAvisos(e, rep)
  // Revisión de ingeniería, 13: la grilla no puede dar por cerrada una cuenta que deja pacientes afuera. Es
  // la decisión 9 del plan (el aviso dentro del estudio) llevada a donde se decide si entrar.
  if (e.sinMedicacionHabilitada === 0 || t.principal.tipo === 'sin_medicacion') return t
  const fuera = `${plural(e.sinMedicacionHabilitada, 'paciente', 'pacientes')} sin medicación habilitada`
  return { ...t, detalle: [...t.detalle, { texto: fuera, aviso: true }] }
}

function tarjetaSinAvisos(e: EstudioReposicion, rep: ReposicionDelPeriodo): TarjetaEstudio {
  const deben = renglonesQueDeben(e)
  if (e.estadoTarjeta === 'sin_medicacion') return { principal: { tipo: 'sin_medicacion' }, detalle: [], renglones: [], clicable: false }
  // La grilla siempre es del período en curso; esto es por si alguna vez se arma con uno cerrado.
  if (!rep.enCurso || !e.objetivo) return { principal: { tipo: 'sin_cuenta' }, detalle: [], renglones: deben, clicable: true }

  const p = e.pedidoDelObjetivo
  if (p) {
    const pastilla = pastillaDePedido(p)
    const detalle: TextoTarjeta[] = pastilla.clave === 'llego'
      ? [{ texto: `${textoDeRecepciones(p.recepciones.filter((r) => r.status === 'pendiente').map((r) => r.folio))} sin verificar`, aviso: false }]
      : pastilla.clave === 'no_llego'
        ? [{ texto: `${envasesTxt(p.faltoCerrado)} ${p.faltoCerrado === 1 ? 'vuelve' : 'vuelven'} a la compra`, aviso: false }]
        : [{ texto: `${envasesTxt(p.pedidoTotal)} para el ${textoPeriodo(periodoDelPedido(p))}`, aviso: false }]
    // Pidió menos de lo que hacía falta (o se cerró parte): lo que sigue faltando no puede quedar callado.
    if (pastilla.clave !== 'no_llego' && e.resumen.envases > 0) detalle.push({ texto: `${faltaTxt(e.resumen.envases)} más`, aviso: true })
    return { principal: { tipo: 'pedido', numero: p.numero, pastilla }, detalle, renglones: deben, clicable: true }
  }

  const envases = e.resumen.envases
  const sinCargar: TextoTarjeta[] = e.resumen.sinCargar > 0 ? [{ texto: `${e.resumen.sinCargar} sin cargar`, aviso: true }] : []

  if (e.estadoTarjeta === 'todo_sin_cargar') {
    return {
      principal: { tipo: 'falta_cargar' },
      detalle: [{ texto: `0 de ${e.resumen.reponibles} cargados`, aviso: false }],
      renglones: [{ texto: 'Para el período que viene: sin pedido', mudo: true }, ...deben],
      clicable: true,
    }
  }
  if (e.tarde) {
    return {
      principal: { tipo: 'comprar', envases },
      detalle: [{ texto: `Para el período que empezó · ${quedanTxt(e.tarde.quedan)}`, aviso: true }, ...sinCargar],
      renglones: [{ texto: `Para el período ${textoPeriodo(e.objetivo)}: sin pedido`, mudo: true }, ...deben],
      clicable: true,
    }
  }
  if (envases === 0) {
    return {
      principal: { tipo: 'cubierto' },
      detalle: sinCargar,
      renglones: [{ texto: 'Para el período que viene: no hace falta pedir', mudo: true }, ...deben],
      clicable: true,
    }
  }
  // RD6 + decisión 3 del plan: es tarea cerca del corte, o si al período en curso le falta algo (si no,
  // el modo tranquilo diría «Cubierto» con pacientes que no van a tener su medicación).
  const tarea = (rep.diasAlCorte ?? 0) <= DIAS_MODO_TAREA || e.resumen.faltaEstePeriodo > 0
  if (tarea) {
    return {
      principal: { tipo: 'comprar', envases },
      detalle: [{ texto: plural(e.resumen.medicamentos, 'medicamento', 'medicamentos'), aviso: false }, ...sinCargar],
      renglones: [{ texto: 'Para el período que viene: sin pedido', mudo: true }, ...deben],
      clicable: true,
    }
  }
  return {
    principal: { tipo: 'cubierto' },
    detalle: sinCargar,
    renglones: [{ texto: `Para el corte del ${diaMes(rep.periodo.hasta)}: ${envasesTxt(envases)} · todavía sin pedido`, mudo: true }, ...deben],
    clicable: true,
  }
}

export interface FranjaCorte {
  texto: string
  sub: string
  aviso: boolean
}

/** RD7: la franja arriba de la grilla. null si el período no está en curso. */
export function franjaDelCorte(rep: ReposicionDelPeriodo): FranjaCorte | null {
  if (!rep.enCurso || rep.diasAlCorte == null) return null
  const tardes = rep.estudios.filter((e) => e.tarde).length
  if (rep.ventana && tardes > 0) {
    return {
      texto: `El corte fue el ${diaMes(rep.ventana.corte)} · ${quedanTxt(rep.ventana.quedan)} para pedir el período que empezó`,
      sub: `${plural(tardes, 'estudio', 'estudios')} sin pedido para el ${textoPeriodo(rep.periodo)}.`,
      aviso: true,
    }
  }
  // Sólo los que tienen compras Y todavía no tienen pedido: uno que ya pidió no es una tarea pendiente.
  const sinPedido = rep.estudios.filter((e) => e.resumen.envases > 0 && !e.pedidoDelObjetivo).length
  // «No hay nada para pedir» sólo si la cuenta está completa: con renglones sin cargar no se sabe
  // (revisión de ingeniería, 13).
  const sinCargar = rep.estudios.filter((e) => e.resumen.sinCargar > 0).length
  const nada = rep.estudios.some((e) => e.pedidoDelObjetivo) ? 'todos los estudios con compras tienen su pedido.'
    : sinCargar > 0 ? `falta cargar cómo se repone en ${plural(sinCargar, 'estudio', 'estudios')}.`
      : 'no hay nada para pedir.'
  const corte = diaMes(rep.periodo.hasta)
  const cortoSub = sinPedido > 0 ? `${plural(sinPedido, 'estudio', 'estudios')} sin pedido para el período que viene.` : nada.charAt(0).toUpperCase() + nada.slice(1)
  if (rep.diasAlCorte === 0) return { texto: 'El corte es hoy', sub: cortoSub, aviso: true }
  if (rep.diasAlCorte === 1) return { texto: `Corte mañana (${corte})`, sub: cortoSub, aviso: false }
  return {
    texto: `Corte el ${corte} · faltan ${rep.diasAlCorte} días`,
    sub: `Período ${textoPeriodo(rep.periodo)} · ${sinPedido > 0
      ? `${plural(sinPedido, 'estudio tiene', 'estudios tienen')} compras y todavía no ${sinPedido === 1 ? 'tiene' : 'tienen'} pedido.`
      : nada}`,
    aviso: false,
  }
}

/** Lo que va al lado de las flechas del período en el estudio. */
export function subtituloDelPeriodo(rep: ReposicionDelPeriodo, e: EstudioReposicion | null): TextoTarjeta {
  if (!rep.enCurso || rep.diasAlCorte == null) return { texto: 'Período cerrado', aviso: false }
  if (e?.tarde) return { texto: `Período en curso · ${quedanTxt(e.tarde.quedan)} para pedirlo`, aviso: true }
  if (rep.diasAlCorte === 0) return { texto: 'El corte es hoy', aviso: true }
  if (rep.diasAlCorte === 1) return { texto: 'Período en curso · el corte es mañana', aviso: false }
  return { texto: `Período en curso · el corte es en ${rep.diasAlCorte} días`, aviso: false }
}

export type ResumenEstudio =
  | { tipo: 'compra'; titulo: string; envases: number; sinCargar: number; detalle: string }
  | { tipo: 'pedido'; titulo: string; pedido: PedidoMedicacion; pastilla: PastillaPedido; detalle: string }

/** La franja blanca arriba de la tabla del estudio (mock «Estudio» y «2b»). null fuera de curso. */
export function resumenDelEstudio(e: EstudioReposicion, rep: ReposicionDelPeriodo): ResumenEstudio | null {
  if (!rep.enCurso || !e.objetivo) return null
  const titulo = `${e.tarde ? 'Para el período que empezó' : 'Para el período que viene'} (${textoPeriodo(e.objetivo)})`
  const p = e.pedidoDelObjetivo
  if (p) {
    const emitido = p.emitido_el === rep.hoy ? 'Emitido hoy' : `Emitido el ${diaMes(p.emitido_el)}`
    const cierre = e.resumen.envases === 0 ? 'con esto alcanza' : `${faltaTxt(e.resumen.envases)} más`
    return { tipo: 'pedido', titulo, pedido: p, pastilla: pastillaDePedido(p), detalle: `${emitido} · ${envasesTxt(p.pedidoTotal)} · ${cierre}` }
  }
  return {
    tipo: 'compra', titulo, envases: e.resumen.envases, sinCargar: e.resumen.sinCargar,
    detalle: e.resumen.envases > 0
      ? `${plural(e.resumen.medicamentos, 'medicamento', 'medicamentos')} para comprar · todavía sin pedido`
      : 'No hace falta pedir',
  }
}

/**
 * Los pedidos que lista el estudio, del más nuevo al más viejo. En curso: los del período en curso y del
 * que viene, más cualquiera que todavía deba algo o tenga una recepción sin verificar. En un período
 * cerrado: los que eran para él.
 */
export function pedidosAMostrar(e: EstudioReposicion, rep: ReposicionDelPeriodo): PedidoMedicacion[] {
  const toca = (p: PedidoMedicacion, x: Periodo) => p.periodo_hasta >= x.desde && p.periodo_desde <= x.hasta
  return e.pedidos.filter((p) => (rep.enCurso
    ? toca(p, rep.periodo) || toca(p, rep.proximo) || p.faltanteTotal > 0 || p.conRecepcionSinVerificar
    : toca(p, rep.periodo)))
}
```

En `src/data/pharma/index.ts`, debajo de `export * from './reposicionPeriodoModel'`:

```ts
export * from './reposicionTarjetaModel'
```

- [ ] **Step 4: Correrlo y ver que pasa**

Run: `npx vitest run src/data/pharma/reposicionTarjetaModel.test.ts`
Expected: PASS, todos.

Run: `npx tsc --noEmit`
Expected: sin errores. Si el barrel choca por un nombre repetido, el typecheck lo dice: renombrá del lado nuevo.

- [ ] **Step 5: Commit**

```bash
git add src/data/pharma/reposicionTarjetaModel.ts src/data/pharma/reposicionTarjetaModel.test.ts src/data/pharma/index.ts
git commit -m "feat(reposicion): qué dicen la tarjeta, la franja y el estudio (RD4-RD7)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Migración 0133, probada en PGlite

**Files:**
- Create: `supabase/migrations/0133_reposicion_parte_2.sql`
- Modify: `supabase/README.md` (fila de la 0133)
- Create (fuera del repo): `<scratchpad>/pglite-0133/probar.mjs`

**Interfaces:**
- Consumes: las tablas y funciones de la `0128`. La `0132` (la guarda de Recepción) ya está aplicada; esta no la toca.
- Produces (lo que llama la Task 6):
  - `pedidos_medicacion.intento uuid null`, única;
  - `emitir_pedido_medicacion(p_protocol_id uuid, p_desde date, p_hasta date, p_emitido_el date, p_renglones jsonb, p_intento uuid default null, p_ultimo_visto integer default null) → jsonb {id, numero}`. `p_emitido_el` tiene que ser hoy en AR. Con `p_ultimo_visto`, rechaza si hay un pedido más nuevo del mismo estudio y período;
  - `cerrar_faltante_pedido(p_item_id, p_motivo)`: misma firma; rechaza si lo que falta ya está en una recepción sin verificar;
  - `reabrir_faltante_pedido(p_item_id uuid) → void`;
  - `reposicion_del_periodo(p_desde, p_hasta, p_protocol_id)`: misma firma, suma la clave `recepciones` con la forma de `RecepcionDePedidoInsumo`;
  - `pedidos_por_recibir() → jsonb {estudios, pedidos, pedido_items, recepciones}`, con la forma de `InsumosPorRecibir`.

- [ ] **Step 1: Confirmar el número**

```bash
git fetch origin
git ls-tree --name-only origin/main supabase/migrations/ | tail -3
```

Expected: la última es `supabase/migrations/0132_recepcion_guarda_borrado_y_renglones.sql` (la guarda de Recepción, PR #234).

Si hay otra después, esta migración toma la siguiente libre:
- cambiá el número en el nombre del archivo, en su cabecera, en la fila del README y en el banco del Step 3;
- la limpieza de la Task 14 corre uno más.

- [ ] **Step 2: Escribir la migración**

`supabase/migrations/0133_reposicion_parte_2.sql`:

```sql
-- Spira · Migración 0133 — Reposición, parte 2: pedido sin duplicados, reabrir «No va a llegar», las
-- recepciones de cada pedido y la lista de «Recibir un pedido».
-- Spec: docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md (revisión de diseño: RD2, RD17,
-- RD18 y la decisión abierta del doble pedido). Revisión de ingeniería del plan (2026-09-19): 1A, 7A, 12A
-- y 15A, anotadas en cada sección.
-- Plan: docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md (Task 5).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0132 (la guarda de Recepción).
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ✅ ADITIVA → VA **ANTES** DEL DEPLOY DEL FRONT (el que no anda sin ella es el front nuevo):
--    · pedidos_medicacion.intento es nueva y nullable: ningún front la pide;
--    · emitir_pedido_medicacion suma p_intento y p_ultimo_visto con default null AL FINAL. Se BORRA antes la
--      firma de cinco: create or replace con otra firma deja una sobrecarga viva y PostgREST contestaría
--      PGRST203. Ningún front desplegado la llama todavía (la Parte 1 no tiene pantallas), y aunque la
--      llamara con cinco argumentos por nombre, resolvería a la nueva por los defaults. La fecha de emisión
--      pasa a tener que ser la de hoy: tampoco rompe a nadie, por lo mismo;
--    · cerrar_faltante_pedido conserva la firma y suma un rechazo (lo que falta ya llegó y está sin verificar);
--    · reabrir_faltante_pedido y pedidos_por_recibir son nuevas;
--    · reposicion_del_periodo conserva la firma y SUMA la clave «recepciones» al JSON: nadie la pide todavía.
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
--
-- Registrar en supabase/README.md al confirmarse en prod.
-- ============================================================================


-- 1 · Un pedido por intento (decisión abierta de la revisión de diseño: el doble pedido) ------------
-- «Armar pedido» manda un uuid propio por cada vez que se abre. Si la red se corta DESPUÉS de guardar y
-- la farmacéutica reintenta, la función devuelve el pedido que ya quedó, en vez de emitir otro con otro
-- número y la misma medicación.
alter table public.pedidos_medicacion add column if not exists intento uuid;
create unique index if not exists pedidos_medicacion_intento_uq
  on public.pedidos_medicacion (intento) where intento is not null;


-- 2 · emitir_pedido_medicacion con intento y con lo que vio la pantalla -----------------------------
-- · p_intento: un reintento del mismo «Armar pedido» devuelve el pedido ya guardado. Si llega con OTRAS
--   cantidades (se editó después del corte de red) no se devuelve callado: la farmacéutica se quedaría con
--   una hoja que no es la que se guardó (revisión de ingeniería, 1A).
-- · p_ultimo_visto: el número del último pedido de ese período que mostraba la pantalla (0 si ninguno).
--   Si mientras tanto alguien emitió otro para el mismo estudio y período, se frena y se lo nombra: dos
--   personas con el estudio abierto no emiten dos pedidos por lo mismo (7A). El candado por estudio hace
--   que dos emisiones simultáneas se vean entre sí. null = no se controla (llamadas viejas).
-- · p_emitido_el tiene que ser hoy en Argentina: la hoja lleva esa fecha y una pantalla abierta desde ayer
--   emitiría con la de ayer (15A).
drop function if exists public.emitir_pedido_medicacion(uuid, date, date, date, jsonb);

create or replace function public.emitir_pedido_medicacion(
  p_protocol_id  uuid,
  p_desde        date,
  p_hasta        date,
  p_emitido_el   date,
  p_renglones    jsonb,
  p_intento      uuid default null,
  p_ultimo_visto integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id       uuid;
  v_numero   integer;
  v_protocol uuid;
  v_nombre   text;
  v_r        jsonb;
  v_otro     integer;
  v_hoy      date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para emitir pedidos' using errcode = '42501';
  end if;

  -- Un reintento del mismo «Armar pedido»: devuelve lo que ya quedó guardado, sin volver a validar (un
  -- reintento después de medianoche tiene que encontrar su pedido, no chocar con la fecha). Sólo si pide
  -- lo mismo: medicamento por medicamento, las mismas cantidades.
  if p_intento is not null then
    select pe.id, pe.numero, pe.protocol_id into v_id, v_numero, v_protocol
      from public.pedidos_medicacion pe
     where pe.intento = p_intento;
    if found then
      if v_protocol <> p_protocol_id then
        raise exception 'Ese pedido ya se emitió para otro estudio' using errcode = '22023';
      end if;
      if exists (
        select 1
          from (select it.medication_id, it.pedido
                  from public.pedido_medicacion_items it
                 where it.pedido_id = v_id) guardado
          full join (select (r.value->>'medication_id')::uuid as medication_id, (r.value->>'pedido')::integer as pedido
                       from jsonb_array_elements(case when jsonb_typeof(p_renglones) = 'array' then p_renglones
                                                      else '[]'::jsonb end) r) llega
            on llega.medication_id = guardado.medication_id
         where guardado.medication_id is null
            or llega.medication_id is null
            or llega.pedido is distinct from guardado.pedido
      ) then
        raise exception 'Ese pedido ya quedó emitido con otras cantidades: fijate en la lista del estudio'
          using errcode = '22023';
      end if;
      return jsonb_build_object('id', v_id, 'numero', v_numero);
    end if;
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período del pedido no es válido' using errcode = '22023';
  end if;
  if p_emitido_el is distinct from v_hoy then
    raise exception 'La pantalla quedó abierta desde otro día: recargala para emitir' using errcode = '22023';
  end if;
  if not exists (select 1 from public.protocols pr where pr.id = p_protocol_id and pr.status <> 'cerrado') then
    raise exception 'Ese estudio no existe o está cerrado' using errcode = 'P0002';
  end if;
  if p_renglones is null or jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El pedido está vacío' using errcode = '22023';
  end if;

  -- Un candado por estudio hasta el fin de la transacción: la segunda de dos emisiones simultáneas espera a
  -- la primera y, al seguir, ya ve su pedido.
  perform pg_advisory_xact_lock(hashtextextended('emitir_pedido_medicacion:' || p_protocol_id::text, 0));
  if p_ultimo_visto is not null then
    select max(pe.numero) into v_otro
      from public.pedidos_medicacion pe
     where pe.protocol_id = p_protocol_id
       and pe.anulado_at is null
       and pe.periodo_desde <= p_hasta
       and pe.periodo_hasta >= p_desde
       and pe.numero > p_ultimo_visto;
    if v_otro is not null then
      raise exception 'Ya hay un pedido para este período (Nº %): fijate en la lista del estudio', v_otro
        using errcode = '23514';
    end if;
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();

  begin
    insert into public.pedidos_medicacion (protocol_id, periodo_desde, periodo_hasta, emitido_el, emitido_por, emitido_por_nombre, intento)
    values (p_protocol_id, p_desde, p_hasta, p_emitido_el, auth.uid(), v_nombre, p_intento)
    returning id, numero into v_id, v_numero;
  exception when unique_violation then
    -- Dos llamadas con el mismo intento a la vez: la otra guardó primero. Se devuelve la suya.
    select pe.id, pe.numero into v_id, v_numero
      from public.pedidos_medicacion pe
     where pe.intento = p_intento;
    if v_id is null then raise; end if;
    return jsonb_build_object('id', v_id, 'numero', v_numero);
  end;

  for v_r in select value from jsonb_array_elements(p_renglones) loop
    if not exists (
      select 1 from public.protocol_medications pmx
       where pmx.protocol_id = p_protocol_id
         and pmx.medication_id = (v_r->>'medication_id')::uuid
    ) then
      raise exception 'Un medicamento del pedido no es de este estudio' using errcode = 'P0002';
    end if;
    if coalesce((v_r->>'pedido')::integer, 0) <= 0 then
      raise exception 'Cada renglón del pedido necesita una cantidad' using errcode = '22023';
    end if;
    insert into public.pedido_medicacion_items (pedido_id, medication_id, calculado, pedido)
    values (v_id, (v_r->>'medication_id')::uuid, (v_r->>'calculado')::integer, (v_r->>'pedido')::integer);
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$fn$;
revoke all on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb, uuid, integer) from public;
grant execute on function public.emitir_pedido_medicacion(uuid, date, date, date, jsonb, uuid, integer) to authenticated;


-- 2b · cerrar_faltante_pedido: no se cierra lo que ya llegó (revisión de ingeniería, 12A) ------------
-- Misma firma y mismo cuerpo que la 0128, más un rechazo: si lo que falta del renglón ya está en una
-- recepción sin verificar, «No va a llegar» es falso — la medicación está en la casa y volvería a la
-- compra. La pantalla esconde el botón en ese caso; esto cubre la llamada directa y la pantalla vieja.
create or replace function public.cerrar_faltante_pedido(p_item_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item          public.pedido_medicacion_items%rowtype;
  v_anulado       timestamptz;
  v_recibido      integer;
  v_sin_verificar integer;
  v_nombre        text;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para cerrar lo que falta de un pedido' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('no_lo_tiene', 'discontinuado', 'no_hace_falta') then
    raise exception 'Elegí un motivo' using errcode = '22023';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  -- for share: mismo criterio que el resto de las funciones que leen un pedido antes de decidir (0128,
  -- secciones 5 y 7) — serializa contra anular_pedido_medicacion, que lo toma for update.
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id for share;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is not null then
    raise exception 'Lo que falta de ese renglón ya está cerrado' using errcode = '23514';
  end if;

  select coalesce(sum(ri.quantity) filter (where mr.status = 'verificada'), 0)::integer,
         coalesce(sum(ri.quantity) filter (where mr.status = 'pendiente'), 0)::integer
    into v_recibido, v_sin_verificar
    from public.reception_items ri
    join public.medication_receptions mr on mr.id = ri.reception_id
   where mr.pedido_id = v_item.pedido_id
     and ri.medication_id = v_item.medication_id;
  if v_recibido >= v_item.pedido then
    raise exception 'Ese renglón ya se recibió entero' using errcode = '23514';
  end if;
  if v_recibido + v_sin_verificar >= v_item.pedido then
    raise exception 'Ese renglón tiene una recepción sin verificar: verificala o anulala antes' using errcode = '23514';
  end if;

  select u.full_name into v_nombre from public.users u where u.id = auth.uid();
  update public.pedido_medicacion_items it
     set cerrado_at = now(), cerrado_por_nombre = v_nombre, cerrado_motivo = p_motivo
   where it.id = p_item_id;
end;
$fn$;
revoke all on function public.cerrar_faltante_pedido(uuid, text) from public;
grant execute on function public.cerrar_faltante_pedido(uuid, text) to authenticated;


-- 3 · reabrir_faltante_pedido: deshacer «No va a llegar» (RD2) ---------------------------------------
-- Si al final la farmacia lo manda, lo que faltaba vuelve a estar en camino y se recibe con el pedido.
-- Quién y cuándo lo reabrió queda en audit_log: el trigger de la tabla guarda el antes (con el motivo) y
-- el después, con el actor.
create or replace function public.reabrir_faltante_pedido(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_item    public.pedido_medicacion_items%rowtype;
  v_anulado timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'operator') then
    raise exception 'No tenés permiso para reabrir lo que falta de un pedido' using errcode = '42501';
  end if;

  select * into v_item from public.pedido_medicacion_items it where it.id = p_item_id for update;
  if not found then
    raise exception 'Ese renglón ya no está' using errcode = 'P0002';
  end if;
  -- for share: mismo criterio que cerrar_faltante_pedido (0128) — serializa contra anular_pedido_medicacion.
  select pe.anulado_at into v_anulado from public.pedidos_medicacion pe where pe.id = v_item.pedido_id for share;
  if v_anulado is not null then
    raise exception 'Ese pedido está anulado' using errcode = '23514';
  end if;
  if v_item.cerrado_at is null then
    raise exception 'Ese renglón no estaba cerrado' using errcode = '23514';
  end if;

  update public.pedido_medicacion_items it
     set cerrado_at = null, cerrado_por_nombre = null, cerrado_motivo = null
   where it.id = p_item_id;
end;
$fn$;
revoke all on function public.reabrir_faltante_pedido(uuid) from public;
grant execute on function public.reabrir_faltante_pedido(uuid) to authenticated;


-- 4 · reposicion_del_periodo con las recepciones de cada pedido (RD17) -------------------------------
-- Misma firma y mismo cuerpo que la 0128, más la CTE «recepciones»: las no anuladas de los pedidos que
-- trae, con su número, para decir «Llegó, falta verificar la recepción Nº 1051» y listarlas en el pedido.
create or replace function public.reposicion_del_periodo(
  p_desde       date,
  p_hasta       date,
  p_protocol_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not (public.has_min_role('pharma', 'viewer') or public.has_module('gerencia')) then
    raise exception 'No tenés permiso para ver la reposición' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido' using errcode = '22023';
  end if;

  with
  estudios as (
    select p.id, p.code, p.name, p.status::text as status
      from public.protocols p
     where p.status <> 'cerrado'
       and (p_protocol_id is null or p.id = p_protocol_id)
  ),
  movs as (
    select ml.protocol_id, sm.medication_id, sm.movement_type, sm.quantity_delta, sm.reference_type,
           sm.reference_id,
           (sm.created_at at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.stock_movements sm
      join public.medication_lots ml on ml.id = sm.lot_id
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
  ),
  retiros as (
    select mv.medication_id, dr.enrollment_id, -mv.quantity_delta as neto, mv.dia
      from movs mv
      left join public.dispensations d on d.id = mv.reference_id
      left join public.dispensation_requests dr on dr.id = d.request_id
     where mv.reference_type = 'dispensation'
       and mv.movement_type in ('dispensacion', 'devolucion')
  ),
  renglones as (
    select pmx.id as protocol_medication_id, pmx.protocol_id, pmx.medication_id,
           m.name as medication_name, m.unit as presentacion, m.drug_id,
           pmx.reposicion_modo as modo, pmx.envases_por_mes, pmx.stock_fijo
      from public.protocol_medications pmx
      join estudios es on es.id = pmx.protocol_id
      join public.medications m on m.id = pmx.medication_id
  ),
  cronograma as (
    select pv.enrollment_id, max(pv.estimated_date) as ultima
      from public.patient_visits pv
      join public.visit_definitions vd on vd.id = pv.visit_def_id
      join public.enrollments e on e.id = pv.enrollment_id
      join estudios es on es.id = e.protocol_id
     where pv.kind = 'programada'
       and vd.date_mode = 'automatica'
     group by pv.enrollment_id
  ),
  pacientes as (
    select pm.id as patient_medication_id, pm.enrollment_id, e.protocol_id, pm.medication_id, m.drug_id,
           pa.full_name as patient_name, e.status::text as enrollment_status,
           pm.envases_por_mes, pm.habilitacion_id, pm.created_at as asignado_el,
           (cr.enrollment_id is not null) as tiene_cronograma, cr.ultima as ultima_programada,
           coalesce((select sum(rt.neto) from retiros rt
                      where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
                        and rt.dia between p_desde and p_hasta), 0)::integer as retirado_periodo,
           (select max(rt.dia) from retiros rt
             where rt.enrollment_id = pm.enrollment_id and rt.medication_id = pm.medication_id
               and rt.neto > 0) as ultimo_retiro
      from public.patient_medications pm
      join public.enrollments e on e.id = pm.enrollment_id
      join estudios es on es.id = e.protocol_id
      join public.patients pa on pa.id = e.patient_id
      join public.medications m on m.id = pm.medication_id
      left join cronograma cr on cr.enrollment_id = pm.enrollment_id
     where pm.active
  ),
  lotes as (
    select ml.protocol_id, ml.medication_id, ml.lot_number, ml.expiry_date, ml.quantity_on_hand as quantity
      from public.medication_lots ml
      join estudios es on es.id = ml.protocol_id
     where ml.tipo = 'protocolo'
       and ml.quantity_on_hand > 0
  ),
  movimientos as (
    select mv.protocol_id, mv.medication_id,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('recepcion', 'anulacion_recepcion') and mv.dia <= p_hasta), 0)::integer as entro,
           coalesce(-sum(mv.quantity_delta) filter (
             where mv.movement_type in ('dispensacion', 'devolucion') and mv.dia <= p_hasta), 0)::integer as salio,
           coalesce(sum(mv.quantity_delta) filter (
             where mv.movement_type in ('ajuste_manual', 'reasignacion', 'vencimiento') and mv.dia <= p_hasta), 0)::integer as ajustes,
           coalesce(sum(mv.quantity_delta), 0)::integer as desde_inicio
      from movs mv
     where mv.dia >= p_desde
     group by mv.protocol_id, mv.medication_id
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
      join estudios es on es.id = pe.protocol_id
  ),
  pedido_items as (
    select it.id, it.pedido_id, it.medication_id, m.name as medication_name, m.unit as presentacion,
           it.calculado, it.pedido, it.cerrado_at, it.cerrado_por_nombre, it.cerrado_motivo,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'verificada'
                        and ri.medication_id = it.medication_id), 0)::integer as recibido,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'pendiente'
                        and ri.medication_id = it.medication_id), 0)::integer as sin_verificar
      from public.pedido_medicacion_items it
      join pedidos pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
  ),
  recepciones as (
    select mr.id, mr.pedido_id, mr.folio, mr.reception_date, mr.status::text as status, mr.verified_by_name,
           coalesce((select sum(ri.quantity) from public.reception_items ri where ri.reception_id = mr.id), 0)::integer as envases
      from public.medication_receptions mr
      join pedidos pe on pe.id = mr.pedido_id
     where mr.status in ('pendiente', 'verificada')
  ),
  sin_medicacion as (
    select e.protocol_id, count(*)::integer as enrolamientos
      from public.enrollments e
      join estudios es on es.id = e.protocol_id
     where e.status in ('screening', 'activo')
       and not exists (
         select 1 from public.patient_medications pm
          where pm.enrollment_id = e.id and pm.active and pm.habilitacion_id is null)
     group by e.protocol_id
  )
  select jsonb_build_object(
    'estudios',       coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'renglones',      coalesce((select jsonb_agg(to_jsonb(x)) from renglones x), '[]'::jsonb),
    'pacientes',      coalesce((select jsonb_agg(to_jsonb(x)) from pacientes x), '[]'::jsonb),
    'lotes',          coalesce((select jsonb_agg(to_jsonb(x)) from lotes x), '[]'::jsonb),
    'movimientos',    coalesce((select jsonb_agg(to_jsonb(x)) from movimientos x), '[]'::jsonb),
    'pedidos',        coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items',   coalesce((select jsonb_agg(to_jsonb(x)) from pedido_items x), '[]'::jsonb),
    'recepciones',    coalesce((select jsonb_agg(to_jsonb(x)) from recepciones x), '[]'::jsonb),
    'sin_medicacion', coalesce((select jsonb_agg(to_jsonb(x)) from sin_medicacion x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.reposicion_del_periodo(date, date, uuid) from public;
grant execute on function public.reposicion_del_periodo(date, date, uuid) to authenticated;


-- 5 · pedidos_por_recibir: la lista de «Recibir un pedido» (R10) ------------------------------------
-- Independiente del período (la Recepción no sabe de cortes): los pedidos no anulados con algún renglón
-- abierto que todavía no se recibió entero, con su estudio, sus renglones y sus recepciones no anuladas
-- (para avisar la que está sin verificar y no recibir dos veces).
create or replace function public.pedidos_por_recibir()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if not public.has_min_role('pharma', 'viewer') then
    raise exception 'No tenés permiso para ver los pedidos' using errcode = '42501';
  end if;

  with
  items as (
    select it.id, it.pedido_id, it.medication_id, m.name as medication_name, m.unit as presentacion,
           it.calculado, it.pedido, it.cerrado_at, it.cerrado_por_nombre, it.cerrado_motivo,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'verificada'
                        and ri.medication_id = it.medication_id), 0)::integer as recibido,
           coalesce((select sum(ri.quantity) from public.reception_items ri
                       join public.medication_receptions mr on mr.id = ri.reception_id
                      where mr.pedido_id = it.pedido_id and mr.status = 'pendiente'
                        and ri.medication_id = it.medication_id), 0)::integer as sin_verificar
      from public.pedido_medicacion_items it
      join public.pedidos_medicacion pe on pe.id = it.pedido_id
      join public.medications m on m.id = it.medication_id
     where pe.anulado_at is null
  ),
  pedidos as (
    select pe.id, pe.numero, pe.protocol_id, pe.periodo_desde, pe.periodo_hasta, pe.emitido_el,
           pe.emitido_por_nombre, pe.anulado_at, pe.anulado_por_nombre, pe.anulado_motivo
      from public.pedidos_medicacion pe
     where exists (
       select 1 from items i
        where i.pedido_id = pe.id and i.cerrado_at is null and i.recibido < i.pedido)
  ),
  estudios as (
    select pr.id, pr.code, pr.name
      from public.protocols pr
     where pr.id in (select p.protocol_id from pedidos p)
  ),
  recepciones as (
    select mr.id, mr.pedido_id, mr.folio, mr.reception_date, mr.status::text as status, mr.verified_by_name,
           coalesce((select sum(ri.quantity) from public.reception_items ri where ri.reception_id = mr.id), 0)::integer as envases
      from public.medication_receptions mr
     where mr.pedido_id in (select p.id from pedidos p)
       and mr.status in ('pendiente', 'verificada')
  )
  select jsonb_build_object(
    'estudios',     coalesce((select jsonb_agg(to_jsonb(x)) from estudios x), '[]'::jsonb),
    'pedidos',      coalesce((select jsonb_agg(to_jsonb(x)) from pedidos x), '[]'::jsonb),
    'pedido_items', coalesce((select jsonb_agg(to_jsonb(x)) from items x where x.pedido_id in (select p.id from pedidos p)), '[]'::jsonb),
    'recepciones',  coalesce((select jsonb_agg(to_jsonb(x)) from recepciones x), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
revoke all on function public.pedidos_por_recibir() from public;
grant execute on function public.pedidos_por_recibir() to authenticated;
```

Antes de seguir, contá los marcadores de dollar-quote: `$fn$` aparece dos veces por función, cuatro
funciones, así que son 8. Ningún comentario tiene dos signos peso pegados. El banco lo vuelve a contar.

- [ ] **Step 3: Preparar PGlite y escribir el banco**

```bash
mkdir -p "<scratchpad>/pglite-0133" && cd "<scratchpad>/pglite-0133" && npm init -y && npm i @electric-sql/pglite@^0.5.8
```

`<scratchpad>/pglite-0133/probar.mjs`:

```js
// Corre la 0128 y la 0133 sobre un esquema de juguete y prueba los caminos de la 0133. Fuera del repo:
// es la verificación previa a pasarle el SQL al Director (memoria probar-sql-con-pglite).
//   node probar.mjs "C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2"
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const REPO = process.argv[2] ?? 'C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2'
const m0128 = readFileSync(`${REPO}/supabase/migrations/0128_reposicion_de_corte_a_corte.sql`, 'utf8')
const m0133 = readFileSync(`${REPO}/supabase/migrations/0133_reposicion_parte_2.sql`, 'utf8')

let fallas = 0
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg)
  else { fallas += 1; console.log('  ✗', msg) }
}

const marcadores = m0133.match(/\$[A-Za-z_]*\$/g) ?? []
ok(marcadores.length % 2 === 0, `marcadores de dollar-quote pares (${marcadores.length})`)
ok(!/--[^\n]*\$\$/.test(m0133), 'ningún comentario con dos signos peso pegados')

const db = new PGlite()
const q = (sql, params) => db.query(sql, params)
const uno = async (sql, params) => (await q(sql, params)).rows[0]
async function fallaAl(fn, esperado, msg) {
  try {
    await fn()
    ok(false, `${msg} (no falló)`)
  } catch (e) {
    ok(String(e.message).includes(esperado), `${msg} → ${e.message}`)
  }
}
const falla = (sql, params, esperado, msg) => fallaAl(() => q(sql, params), esperado, msg)
/** Hoy en Argentina: emitir_pedido_medicacion sólo acepta la fecha de hoy (revisión de ingeniería, 15A). */
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
const como = (uid, rol) => q(`select set_config('test.uid', $1, false), set_config('test.rol', $2, false)`, [uid ?? '', rol ?? ''])

const U = '00000000-0000-0000-0000-00000000000a'
const P1 = '00000000-0000-0000-0000-0000000000b1'
const P2 = '00000000-0000-0000-0000-0000000000b2'
const M1 = '00000000-0000-0000-0000-0000000000c1'
const I1 = '00000000-0000-0000-0000-0000000000a1'

await db.exec(`
  create schema auth;
  create role anon;
  create role authenticated;
  create function auth.uid() returns uuid language sql stable as $f$
    select nullif(current_setting('test.uid', true), '')::uuid
  $f$;
  create function public.has_min_role(mod text, min_role text) returns boolean language sql stable as $f$
    select mod = 'pharma' and case current_setting('test.rol', true)
      when 'leader' then min_role in ('viewer', 'operator', 'leader')
      when 'operator' then min_role in ('viewer', 'operator')
      when 'viewer' then min_role = 'viewer'
      else false end
  $f$;
  create function public.has_module(mod text) returns boolean language sql stable as $f$
    select mod = 'gerencia' and current_setting('test.rol', true) = 'gerencia'
  $f$;

  create type protocol_status as enum ('activo', 'pausado', 'cerrado');
  create type enrollment_status as enum ('screening', 'activo', 'completado', 'discontinuado');
  create type public.reception_kind as enum ('protocolo', 'investigacion', 'ambulatoria');
  create type reception_status as enum ('pendiente', 'verificada', 'anulada');
  create type stock_movement_type as enum ('recepcion', 'dispensacion', 'ajuste_manual', 'devolucion', 'vencimiento', 'anulacion_recepcion', 'reasignacion');

  create table public.audit_log (id bigserial primary key, actor_id uuid, action text, entity_type text, entity_id uuid,
    before_data jsonb, after_data jsonb, db_role text, created_at timestamptz default now());
  create function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $f$
  declare v_actor uuid;
  begin
    v_actor := coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
    insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, db_role)
    values (v_actor, tg_op, tg_table_name, (case when tg_op = 'DELETE' then old.id else new.id end),
      case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end, session_user);
    return coalesce(new, old);
  end;
  $f$;

  create table public.users (id uuid primary key, full_name text);
  create table public.protocols (id uuid primary key, code text, name text, status protocol_status not null default 'activo');
  create table public.medications (id uuid primary key, name text, unit text, drug_id uuid);
  create table public.protocol_medications (id uuid primary key default gen_random_uuid(),
    protocol_id uuid not null references public.protocols(id) on delete restrict,
    medication_id uuid not null references public.medications(id) on delete restrict,
    reposicion_modo text, envases_por_mes integer, stock_fijo integer, unique (protocol_id, medication_id));
  create table public.patients (id uuid primary key, full_name text);
  create table public.enrollments (id uuid primary key, patient_id uuid references public.patients(id),
    protocol_id uuid references public.protocols(id), status enrollment_status not null default 'activo');
  create table public.patient_medications (id uuid primary key default gen_random_uuid(),
    enrollment_id uuid references public.enrollments(id), medication_id uuid references public.medications(id),
    active boolean not null default true, envases_por_mes integer, habilitacion_id uuid, created_at timestamptz not null default now());
  create table public.visit_definitions (id uuid primary key, date_mode text);
  create table public.patient_visits (id uuid primary key default gen_random_uuid(), enrollment_id uuid references public.enrollments(id),
    visit_def_id uuid references public.visit_definitions(id), kind text, estimated_date date);
  create table public.medication_lots (id uuid primary key default gen_random_uuid(),
    medication_id uuid not null references public.medications(id), protocol_id uuid references public.protocols(id),
    tipo public.reception_kind not null default 'protocolo', lot_number text not null, expiry_date date,
    quantity_on_hand integer not null default 0);
  create table public.dispensation_requests (id uuid primary key default gen_random_uuid(), enrollment_id uuid references public.enrollments(id));
  create table public.dispensations (id uuid primary key default gen_random_uuid(), request_id uuid references public.dispensation_requests(id));
  create table public.stock_movements (id uuid primary key default gen_random_uuid(), medication_id uuid not null,
    lot_id uuid references public.medication_lots(id), movement_type stock_movement_type not null, quantity_delta integer not null,
    reference_id uuid, reference_type text, created_at timestamptz not null default now());
  -- folio y verified_by_name son de la 0085: la 0133 los lee.
  create table public.medication_receptions (id uuid primary key default gen_random_uuid(), folio serial,
    tipo public.reception_kind not null default 'protocolo', protocol_id uuid references public.protocols(id) on delete restrict,
    received_by uuid references public.users(id), reception_date date not null, status reception_status not null default 'pendiente',
    verified_by_name text, notes text, created_at timestamptz not null default now());
  create table public.reception_items (id uuid primary key default gen_random_uuid(),
    reception_id uuid not null references public.medication_receptions(id) on delete cascade,
    medication_id uuid not null references public.medications(id), lot_number text not null, expiry_date date,
    quantity integer not null check (quantity > 0));
  create table public.farmacia_ajustes (id uuid primary key default gen_random_uuid(), unica boolean not null default true unique check (unica),
    demora_compra_dias integer, updated_at timestamptz not null default now(), updated_by uuid);
  insert into public.farmacia_ajustes (unica) values (true);

  -- La create_reception de la 0040, con su firma: la 0128 la reemplaza.
  create function public.create_reception(p_tipo public.reception_kind, p_protocol_id uuid, p_reception_date date, p_notes text, p_items jsonb)
  returns uuid language plpgsql as $f$ begin return null; end $f$;
`)

await db.exec(`
  insert into public.users values ('${U}', 'Lautaro Molina');
  insert into public.protocols values ('${P1}', '222714', 'ENDURA', 'activo'), ('${P2}', 'LTS17231', 'LTS17231', 'activo');
  insert into public.medications values ('${M1}', 'Seretide 250/50', 'Aerosol', null);
  insert into public.protocol_medications (protocol_id, medication_id, reposicion_modo, envases_por_mes)
    values ('${P1}', '${M1}', 'mensual', 1), ('${P2}', '${M1}', 'mensual', 1);
`)

console.log('Aplicar la 0128 y la 0133 (dos veces)')
await db.exec(m0128)
await db.exec(m0133)
await db.exec(m0133)

const firmas = await uno(`select count(*)::int as n, max(pronargs)::int as args from pg_proc where proname = 'emitir_pedido_medicacion'`)
ok(firmas.n === 1 && firmas.args === 7, `una sola emitir_pedido_medicacion, con siete argumentos (hay ${firmas.n}, ${firmas.args})`)
const cerrar = await uno(`select count(*)::int as n from pg_proc where proname = 'cerrar_faltante_pedido'`)
ok(cerrar.n === 1, 'una sola cerrar_faltante_pedido (misma firma que la 0128)')
ok((await uno(`select count(*)::int as n from pg_proc where proname = 'reposicion_del_periodo'`)).n === 1, 'una sola reposicion_del_periodo')

console.log('emitir_pedido_medicacion con intento')
const R = JSON.stringify([{ medication_id: M1, calculado: 4, pedido: 6 }])
const emitir = async (protocolo, intento, { renglones = R, fecha = HOY, desde = '2026-09-29', hasta = '2026-10-28', ultimo = null } = {}) => (await uno(
  `select public.emitir_pedido_medicacion($1::uuid, $2::date, $3::date, $4::date, $5::jsonb, $6::uuid, $7::integer) as j`,
  [protocolo, desde, hasta, fecha, renglones, intento, ultimo],
)).j
await como(U, 'operator')
const a = await emitir(P1, I1)
const b = await emitir(P1, I1)
ok(a.id === b.id && a.numero === b.numero, `el mismo intento devuelve el mismo pedido (Nº ${a.numero})`)
ok((await uno(`select count(*)::int as n from public.pedidos_medicacion where intento = $1`, [I1])).n === 1, 'y no deja un segundo pedido')
ok((await uno(`select count(*)::int as n from public.pedido_medicacion_items where pedido_id = $1`, [a.id])).n === 1, 'ni renglones repetidos')
await fallaAl(() => emitir(P2, I1), 'otro estudio', 'el mismo intento para otro estudio')
const R5 = JSON.stringify([{ medication_id: M1, calculado: 4, pedido: 5 }])
await fallaAl(() => emitir(P1, I1, { renglones: R5 }), 'otras cantidades', 'el mismo intento con otra cantidad no devuelve el pedido viejo (1A)')
await fallaAl(() => emitir(P1, I1, { renglones: '[]' }), 'otras cantidades', 'ni con un renglón de menos')
ok((await emitir(P1, I1, { fecha: '2020-01-01' })).id === a.id, 'el reintento de otro día encuentra su pedido (no choca con la fecha)')
const c = await emitir(P1, null)
const d = await emitir(P1, null)
ok(c.numero !== d.numero, 'sin intento, dos llamadas son dos pedidos')
const conCinco = await uno(
  `select public.emitir_pedido_medicacion(p_protocol_id => $1::uuid, p_desde => '2026-09-29', p_hasta => '2026-10-28', p_emitido_el => $3::date, p_renglones => $2::jsonb) as j`,
  [P1, R, HOY],
)
ok(typeof conCinco.j.numero === 'number', 'la llamada con cinco argumentos por nombre sigue andando')
await fallaAl(() => emitir(P1, null, { fecha: '2020-01-01' }), 'otro día', 'una pantalla abierta desde otro día no emite (15A)')

console.log('emitir_pedido_medicacion con lo que vio la pantalla (7A)')
await fallaAl(() => emitir(P1, null, { ultimo: 0 }), `Nº ${conCinco.j.numero})`,
  'si la pantalla no vio ningún pedido y ya hay uno, se frena y lo nombra (el último)')
await fallaAl(() => emitir(P1, null, { ultimo: d.numero }), `Nº ${conCinco.j.numero})`, 'también si vio uno más viejo')
const f = await emitir(P1, null, { ultimo: conCinco.j.numero })
ok(typeof f.numero === 'number', 'si vio el último, emite (un segundo pedido a propósito, con lo que faltaba)')
const g = await emitir(P1, null, { ultimo: 0, desde: '2026-10-29', hasta: '2026-11-28' })
ok(typeof g.numero === 'number', 'los pedidos de otro período no cuentan')

console.log('reabrir_faltante_pedido')
const itemDe = async (pedido) => (await uno(`select id from public.pedido_medicacion_items where pedido_id = $1`, [pedido])).id
const itemA = await itemDe(a.id)
await como(U, 'viewer')
await falla(`select public.reabrir_faltante_pedido($1::uuid)`, [itemA], 'No tenés permiso', 'viewer no reabre')
await como(U, 'operator')
await falla(`select public.reabrir_faltante_pedido($1::uuid)`, [itemA], 'no estaba cerrado', 'no se reabre lo que no se cerró')
await q(`select public.cerrar_faltante_pedido($1::uuid, 'no_lo_tiene')`, [itemA])
await q(`select public.reabrir_faltante_pedido($1::uuid)`, [itemA])
const reabierto = await uno(`select cerrado_at, cerrado_motivo, cerrado_por_nombre from public.pedido_medicacion_items where id = $1`, [itemA])
ok(reabierto.cerrado_at === null && reabierto.cerrado_motivo === null && reabierto.cerrado_por_nombre === null, 'reabrir limpia el cierre')
const huella = await uno(
  `select count(*)::int as n from public.audit_log
    where entity_type = 'pedido_medicacion_items' and entity_id = $1 and action = 'UPDATE' and actor_id = $2
      and before_data->>'cerrado_motivo' = 'no_lo_tiene' and after_data->>'cerrado_motivo' is null`,
  [itemA, U],
)
ok(huella.n === 1, 'queda registrado quién lo reabrió y qué motivo tenía (RD2)')
await falla(`select public.reabrir_faltante_pedido($1::uuid)`, ['00000000-0000-0000-0000-000000000000'], 'ya no está', 'renglón inexistente')
const itemC = await itemDe(c.id)
await q(`select public.cerrar_faltante_pedido($1::uuid, 'discontinuado')`, [itemC])
await q(`select public.anular_pedido_medicacion($1::uuid, 'por_error')`, [c.id])
await falla(`select public.reabrir_faltante_pedido($1::uuid)`, [itemC], 'anulado', 'no se reabre en un pedido anulado')
const e = await emitir(P1, null)
await q(`select public.cerrar_faltante_pedido($1::uuid, 'no_hace_falta')`, [await itemDe(e.id)])

console.log('las recepciones de cada pedido')
await como(U, 'leader')
const recibir = async (pedido, lote, cantidad) => (await uno(
  `select public.create_reception(p_tipo => 'protocolo', p_protocol_id => $1::uuid, p_reception_date => '2026-10-02', p_notes => null, p_items => $2::jsonb, p_pedido_id => $3::uuid) as id`,
  [P1, JSON.stringify([{ medication_id: M1, lot_number: lote, expiry_date: '2027-01-01', quantity: cantidad }]), pedido],
)).id
await recibir(a.id, 'LA', 4)
const recD = await recibir(d.id, 'LD', 6)
const itemD = await itemDe(d.id)
await falla(`select public.cerrar_faltante_pedido($1::uuid, 'no_lo_tiene')`, [itemD], 'recepción sin verificar',
  '«No va a llegar» sobre lo que ya llegó y está sin verificar (12A)')
await q(`update public.medication_receptions set status = 'verificada', verified_by_name = 'Agustín Bazzani' where id = $1`, [recD])
await falla(`select public.cerrar_faltante_pedido($1::uuid, 'no_lo_tiene')`, [itemD], 'recibió entero', 'verificada, lo que dice es que se recibió entero')
const h = await emitir(P1, null)
await recibir(h.id, 'LH', 2)
await q(`select public.cerrar_faltante_pedido($1::uuid, 'no_lo_tiene')`, [await itemDe(h.id)])
ok((await uno(`select cerrado_at from public.pedido_medicacion_items where pedido_id = $1`, [h.id])).cerrado_at !== null,
  'si lo sin verificar no cubre lo que falta, el resto sí se puede cerrar')
const recAnulada = await recibir(a.id, 'LX', 1)
await q(`update public.medication_receptions set status = 'anulada' where id = $1`, [recAnulada])
await como(U, 'viewer')
const j = (await uno(`select public.reposicion_del_periodo('2026-08-29', '2026-09-28') as j`)).j
const deA = j.recepciones.filter((r) => r.pedido_id === a.id)
ok(deA.length === 1 && deA[0].status === 'pendiente' && deA[0].envases === 4 && typeof deA[0].folio === 'number',
  'reposicion_del_periodo trae las recepciones del pedido, sin la anulada')
ok(j.recepciones.some((r) => r.pedido_id === d.id && r.verified_by_name === 'Agustín Bazzani' && r.status === 'verificada'), 'con quién verificó')

console.log('pedidos_por_recibir')
await como(null, '')
await falla(`select public.pedidos_por_recibir()`, [], 'No autenticado', 'sin sesión')
await como(U, '')
await falla(`select public.pedidos_por_recibir()`, [], 'No tenés permiso', 'sin módulo')
await como(U, 'viewer')
const pr = (await uno(`select public.pedidos_por_recibir() as j`)).j
const numeros = pr.pedidos.map((p) => p.numero)
ok(numeros.includes(a.numero) && numeros.includes(conCinco.j.numero), 'están los pedidos con faltante')
ok(!numeros.includes(d.numero), 'no está el recibido entero')
ok(!numeros.includes(c.numero), 'no está el anulado')
ok(!numeros.includes(e.numero), 'no está el que se cerró entero')
ok(pr.estudios.length === 1 && pr.estudios[0].code === '222714', 'trae el estudio de cada pedido')
ok(pr.pedido_items.every((it) => pr.pedidos.some((p) => p.id === it.pedido_id)), 'sólo renglones de los pedidos de la lista')
ok(pr.recepciones.some((r) => r.pedido_id === a.id && r.status === 'pendiente'), 'con la recepción sin verificar, para avisar')

console.log('tercera corrida')
await db.exec(m0133)
ok((await uno(`select count(*)::int as n from pg_proc where proname = 'emitir_pedido_medicacion'`)).n === 1, 'sigue habiendo una sola emitir_pedido_medicacion')
ok((await uno(`select count(*)::int as n from public.pedidos_medicacion`)).n === 8, 'los pedidos siguen ahí (a, c, d, el de cinco argumentos, f, g, e y h)')

console.log(fallas === 0 ? '\nTODO VERDE' : `\n${fallas} FALLAS`)
process.exit(fallas === 0 ? 0 : 1)
```

- [ ] **Step 4: Correr el banco y verificar que pasa entero**

Run: `node "<scratchpad>/pglite-0133/probar.mjs" "C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2"`
Expected: todas las líneas con `✓` y `TODO VERDE`. Si algo falla, se corrige la **migración** (no el banco)
y se vuelve a correr entero.

- [ ] **Step 5: Registrar la 0133 en el índice**

En `supabase/README.md`, con la herramienta Edit (el archivo es CRLF), agregar debajo de la fila de la `0132`:

```
| 0133 | `reposicion_parte_2.sql` — **Reposición, parte 2: pedido sin duplicados, reabrir «No va a llegar», las recepciones de cada pedido y «Recibir un pedido»** (`docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md`). ADITIVA: va **antes** del front. `pedidos_medicacion.intento` (uuid único, null): «Armar pedido» manda uno por vez que se abre y `emitir_pedido_medicacion` devuelve el pedido ya guardado si llega el mismo intento — un reintento después de un corte de red no emite un segundo pedido; con otras cantidades, lo rechaza. `emitir_pedido_medicacion` suma `p_intento` y `p_ultimo_visto` con default null al final (se borra antes la firma de cinco para no dejar sobrecarga): con el último pedido que vio la pantalla, rechaza si mientras tanto se emitió otro para el mismo estudio y período (candado por estudio), y la fecha de emisión tiene que ser la de hoy en AR. `cerrar_faltante_pedido` conserva la firma y no cierra lo que ya está en una recepción sin verificar. `reabrir_faltante_pedido(p_item_id)` deshace «No va a llegar» (RD2), sólo en pedidos no anulados y sobre renglones cerrados; el quién y cuándo queda en `audit_log`. `reposicion_del_periodo` conserva la firma y suma la clave `recepciones` (las no anuladas de cada pedido, con folio, estado, quién verificó y envases: RD17). `pedidos_por_recibir()` trae, sin depender de un período, los pedidos no anulados con algo por recibir, con su estudio, renglones y recepciones. Probada con PGlite (tres corridas). |
```

Run: `node scripts/check-migraciones.mjs`
Expected: `✓ 133 migraciones, índice al día.`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0133_reposicion_parte_2.sql supabase/README.md
git commit -m "feat(db): 0133 — intento de pedido, reabrir, recepciones del pedido y «Recibir un pedido»

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Capa de datos

**Files:**
- Modify: `src/data/pharma/reposicion.ts`

**Interfaces:**
- Consumes: las funciones de la `0133` (Task 5); `InsumosPorRecibir` (Task 2).
- Produces:
  - `interface ReposicionLeida { desde: string; hasta: string; insumos: InsumosDelPeriodo }`
  - `useReposicionDelPeriodo(periodo: Periodo | null, protocolId?: string | null): QueryResult<ReposicionLeida | null>`. **Cambia**: antes devolvía `InsumosDelPeriodo`, y no la usa nadie todavía.
  - `emitirPedidoMedicacion({ protocolId, periodo, emitidoEl, renglones, intento: string, ultimoVisto: number })`
  - `reabrirFaltantePedido(itemId: string): Promise<{ error: string | null; code?: string }>`
  - `usePedidosPorRecibir(): QueryResult<InsumosPorRecibir | null>`

- [ ] **Step 1: El período viaja con la lectura**

En `src/data/pharma/reposicion.ts`, reemplazar `useReposicionDelPeriodo` entera por:

```ts
/** Lo leído de un período, CON el período: ver `useReposicionDelPeriodo`. */
export interface ReposicionLeida {
  desde: string
  hasta: string
  insumos: InsumosDelPeriodo
}

/**
 * Los datos crudos de un período (`reposicion_del_periodo`, 0128 + 0133). La cuenta la hace
 * `armarReposicionDelPeriodo` (D11). Sin período todavía (falta el día de corte) no pide nada.
 * `protocolId` null = todos los estudios no cerrados.
 *
 * Devuelve el período junto con los datos porque `useSupabaseQuery` deja visibles los datos viejos
 * mientras llegan los nuevos: al pasar de un período a otro con las flechas, la pantalla tiene que poder
 * saber de qué período es lo que tiene antes de rotularlo, o mostraría el libro de julio con el título
 * de agosto.
 */
export function useReposicionDelPeriodo(periodo: Periodo | null, protocolId: string | null = null) {
  return useSupabaseQuery<ReposicionLeida | null>(
    async (c) => {
      if (!periodo) return { data: null, error: null }
      const { data, error } = await c.rpc('reposicion_del_periodo', {
        p_desde: periodo.desde,
        p_hasta: periodo.hasta,
        p_protocol_id: protocolId,
      })
      if (error) return { data: null, error }
      return { data: { desde: periodo.desde, hasta: periodo.hasta, insumos: data as InsumosDelPeriodo }, error: null }
    },
    // Los bordes y no el objeto: un período recalculado en cada render cambia de identidad.
    [periodo?.desde, periodo?.hasta, protocolId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}
```

- [ ] **Step 2: El intento, reabrir y la lista de Recepción**

En el mismo archivo, reemplazar `emitirPedidoMedicacion` entera por:

```ts
/**
 * «Emitir e imprimir» (R8): cabecera y renglones en una llamada atómica. Devuelve el número para la hoja.
 * `intento` es un uuid por cada vez que se abre «Armar pedido» (0133): si la red se corta después de
 * guardar y se reintenta, la base devuelve el pedido que ya quedó en vez de emitir otro.
 */
export async function emitirPedidoMedicacion(input: {
  protocolId: string
  /** El período PARA el que se pide. */
  periodo: Periodo
  /** Hoy en hora AR. */
  emitidoEl: string
  renglones: { medication_id: string; calculado: number | null; pedido: number }[]
  intento: string
  /** El último pedido de ese período que mostraba la pantalla, 0 si ninguno (0133, revisión de ingeniería, 7). */
  ultimoVisto: number
}): Promise<Resultado & { id?: string; numero?: number }> {
  const { data, error } = await supabase.rpc('emitir_pedido_medicacion', {
    p_protocol_id: input.protocolId,
    p_desde: input.periodo.desde,
    p_hasta: input.periodo.hasta,
    p_emitido_el: input.emitidoEl,
    p_renglones: input.renglones,
    p_intento: input.intento,
    p_ultimo_visto: input.ultimoVisto,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  const r = data as { id: string; numero: number }
  return { error: null, id: r.id, numero: r.numero }
}
```

Y agregar al final del archivo:

```ts
/** «Reabrir» (RD2): lo que se había dado por perdido vuelve a estar en camino. */
export async function reabrirFaltantePedido(itemId: string): Promise<Resultado> {
  const { error } = await supabase.rpc('reabrir_faltante_pedido', { p_item_id: itemId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * La lista de «Recibir un pedido» (`pedidos_por_recibir`, 0133): independiente del período, porque la
 * Recepción no sabe de cortes. La arma `armarPorRecibir`.
 */
export function usePedidosPorRecibir() {
  return useSupabaseQuery<InsumosPorRecibir | null>(
    async (c) => {
      const { data, error } = await c.rpc('pedidos_por_recibir')
      if (error) return { data: null, error }
      return { data: data as InsumosPorRecibir, error: null }
    },
    [],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}
```

Y sumar `InsumosPorRecibir` al import de tipos de `./pedidosMedicacionModel`:

```ts
import type { InsumosPorRecibir, MotivoAnulacion, MotivoCierre } from './pedidosMedicacionModel'
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores (nadie llama todavía a estas funciones).

Run: `npx vitest run src/data/pharma`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/pharma/reposicion.ts
git commit -m "feat(reposicion): período en la lectura, intento, reabrir y la lista de Recepción

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Gate, PR A, aplicación y sondas

**Files:**
- Create (fuera del repo): `<scratchpad>/crear-pr.mjs`, `<scratchpad>/sondas-0133.mjs`
- Modify: `supabase/README.md` (marca «Aplicada en prod», en una rama nueva)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la PR A mergeada y la `0133` aplicada y registrada. Es la condición para mergear la PR B.

- [ ] **Step 1: Gate completo**

Run: `npm run build`
Expected: typecheck sin errores, vitest verde y `vite build` terminado. Si el conteo de tests se dispara, son los worktrees de otras sesiones. Para confirmarlo: `npx vitest run --exclude ".claude/worktrees/**"`.

- [ ] **Step 2: Push**

```bash
git -c credential.interactive=false push -u origin feat/reposicion-parte-2-base
```

Si responde `Cannot prompt` o `could not read Password`, GCM perdió la credencial (memoria `gotcha-git-tres-cuentas-github`). Pedirle al Director que corra ese mismo `git push` en su terminal.

- [ ] **Step 3: Abrir la PR por API**

`<scratchpad>/crear-pr.mjs` (se reusa para las otras PRs de este plan, cambiando los tres argumentos):

```js
// node crear-pr.mjs <rama> "<título>" <archivo-con-el-cuerpo.md>
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [rama, titulo, archivoCuerpo] = process.argv.slice(2)
const salida = execSync('git -c credential.interactive=false credential fill', {
  input: 'protocol=https\nhost=github.com\nusername=spiraclinicapp\n\n',
  cwd: 'C:/Users/Tutuca/Desktop/Spira/Spira App',
}).toString()
const token = salida.match(/^password=(.*)$/m)?.[1]
if (!token) throw new Error('Sin token: pedirle al Director un git push desde su terminal')

const r = await fetch('https://api.github.com/repos/spiraclinicapp/Spira-App/pulls', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'spira-agent' },
  body: JSON.stringify({ title: titulo, head: rama, base: 'main', body: readFileSync(archivoCuerpo, 'utf8') }),
})
const json = await r.json()
console.log(r.status, json.html_url ?? json.message)
```

`<scratchpad>/pr-a.md`:

```markdown
## Qué trae

Primera mitad de la Parte 2 del submódulo **Reposición** ([plan](docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md)). **Sin pantallas todavía**: la card de Estadísticas sigue igual.

- El modelo con lo que pidió la revisión de diseño:
  - el pedido tarde dentro de los 5 días (RD1);
  - «Cerrado · no llegó» (RD3);
  - una sola pastilla de estado (RD8);
  - «En camino» y «hay» físico en la boleta (RD12, RD13);
  - «Llegó, falta verificar» (RD17).
- Un modelo nuevo con lo que dicen la tarjeta, la franja del corte y el estudio (RD4-RD7), con tests.
- La migración **0133**, probada en PGlite con tres corridas:
  - un pedido por intento, así un reintento no emite dos (y con otras cantidades, lo rechaza);
  - el último pedido que vio la pantalla: dos personas con el estudio abierto no emiten dos pedidos por lo mismo;
  - la fecha de emisión es la de hoy;
  - «No va a llegar» no cierra lo que ya llegó y está sin verificar;
  - `reabrir_faltante_pedido`;
  - las recepciones de cada pedido;
  - `pedidos_por_recibir`.
- La capa de datos que van a usar las pantallas.

## ⚠️ Orden de despliegue

La **0133 es ADITIVA: se aplica apenas se mergea esta PR**. Ningún front desplegado usa lo que cambia. La PR de las pantallas va después, con la 0133 ya aplicada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Run: `node "<scratchpad>/crear-pr.mjs" feat/reposicion-parte-2-base "Reposición · parte 2A: modelo, datos y migración 0133" "<scratchpad>/pr-a.md"`
Expected: `201 https://github.com/spiraclinicapp/Spira-App/pull/<N>`

- [ ] **Step 4: Avisarle al Director y esperar**

En el chat, en una frase clara: la PR está abierta y **la 0133 se aplica apenas se mergea**. El archivo queda en `supabase/migrations/0133_reposicion_parte_2.sql` de `main` una vez mergeada. No seguir hasta que confirme «aplicada».

- [ ] **Step 5: Traer `main` al local de la copia compartida**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App"
git status -sb
git fetch origin
git pull --ff-only
ls supabase/migrations/0133_reposicion_parte_2.sql
```

Expected: el working copy está limpio en `main` antes del pull, y después el archivo existe. Si no está en `main` o tiene cambios, **no** hagas pull: avisale al Director.

- [ ] **Step 6: Sondas sin sesión**

`<scratchpad>/sondas-0133.mjs`:

```js
// Sondas SIN SESIÓN después de aplicar la 0133. No escriben nada: prueban que cada objeto existe y que
// emitir_pedido_medicacion no quedó ambigua. 401/42501 o «No autenticado» = existe; 404/PGRST202/
// PGRST205/42703 = falta; PGRST203 = sobrecarga ambigua.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('C:/Users/Tutuca/Desktop/Spira/Spira App/.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const CERO = '00000000-0000-0000-0000-000000000000'

const rpc = async (nombre, body) => {
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: h, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const get = async (ruta) => {
  const r = await fetch(`${url}/rest/v1/${ruta}`, { headers: h })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const FALTA = new Set(['PGRST202', 'PGRST203', 'PGRST205', '42703', '42883'])
const existe = (r) => r.status !== 404 && !FALTA.has(r.body?.code)
// Un embed ambiguo (PGRST201) o sin relación (PGRST200) voltea la consulta ENTERA de la lista de Recepción
// (memoria gotcha-fk-nueva-rompe-embed-postgrest). PostgREST arma el embed antes de mirar permisos: sin
// sesión se ve igual (revisión de ingeniería, 4).
const embedSano = (r) => existe(r) && !['PGRST200', 'PGRST201'].includes(r.body?.code)
const emitir = { p_protocol_id: CERO, p_desde: '2026-09-29', p_hasta: '2026-10-28', p_emitido_el: '2026-09-18', p_renglones: [] }

const casos = [
  ['emitir_pedido_medicacion con intento y lo que vio la pantalla', await rpc('emitir_pedido_medicacion', { ...emitir, p_intento: CERO, p_ultimo_visto: 0 }), existe],
  ['emitir_pedido_medicacion con intento', await rpc('emitir_pedido_medicacion', { ...emitir, p_intento: CERO }), existe],
  ['emitir_pedido_medicacion con cinco argumentos (sin ambigüedad)', await rpc('emitir_pedido_medicacion', emitir), existe],
  ['reabrir_faltante_pedido', await rpc('reabrir_faltante_pedido', { p_item_id: CERO }), existe],
  ['cerrar_faltante_pedido (misma firma)', await rpc('cerrar_faltante_pedido', { p_item_id: CERO, p_motivo: 'no_lo_tiene' }), existe],
  ['pedidos_por_recibir', await rpc('pedidos_por_recibir', {}), existe],
  ['reposicion_del_periodo', await rpc('reposicion_del_periodo', { p_desde: '2026-08-29', p_hasta: '2026-09-28' }), existe],
  ['columna pedidos_medicacion.intento', await get('pedidos_medicacion?select=intento&limit=1'), existe],
  ['el embed de la lista de Recepción (PR B)', await get('medication_receptions?select=id,pedido:pedidos_medicacion(numero)&limit=1'), embedSano],
  ['CONTROL: función inventada tiene que faltar', await rpc('funcion_que_no_existe_0133', {}), (r) => !existe(r)],
  ['CONTROL: columna inventada tiene que faltar', await get('pedidos_medicacion?select=columna_inventada&limit=1'), (r) => !existe(r)],
]

let fallas = 0
for (const [nombre, r, pasa] of casos) {
  const bien = pasa(r)
  if (!bien) fallas += 1
  console.log(bien ? '✓' : '✗', nombre, '→', r.status, r.body?.code ?? '', r.body?.message ?? '')
}
console.log(fallas === 0 ? '\nTODO VERDE' : `\n${fallas} FALLAS`)
process.exit(fallas === 0 ? 0 : 1)
```

Run: `node "<scratchpad>/sondas-0133.mjs"`
Expected: once `✓` (los dos controles incluidos) y `TODO VERDE`.

Si el embed de la lista de Recepción da `PGRST201` (ambiguo) o `PGRST200`, **la PR B no se abre así**: en la Task 11, el select de `receptions.ts` se desambigua por columna (`pedido:pedidos_medicacion!pedido_id(numero)`) y se sondea eso mismo (memoria `gotcha-fk-nueva-rompe-embed-postgrest`).

Si «emitir con cinco argumentos» da `PGRST203`, quedó la sobrecarga. Pasarle al Director, tal cual:

```sql
drop function if exists public.emitir_pedido_medicacion(uuid, date, date, date, jsonb);
```

y volver a correr las sondas. Si alguna da `PGRST202`/`PGRST205` recién aplicada, falta el `notify pgrst, 'reload schema';`: pasárselo y volver a sondear (memoria `gotcha-editor-supabase-aviso-rls-y-reload`).

- [ ] **Step 7: Registrar «Aplicada en prod»**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App"
git switch -c docs/0133-aplicada
```

En `supabase/README.md`, con Edit, reemplazar en la fila de la 0133:

```
Probada con PGlite (tres corridas). |
```

por (con la fecha que confirmó el Director, literal, por ejemplo `2026-09-19`):

```
Probada con PGlite (tres corridas). **Aplicada en prod (AAAA-MM-DD).** |
```

Ojo: el mismo texto `Probada con PGlite (tres corridas). |` puede aparecer en la fila de la 0128. Para que el
Edit sea único, incluí en `old_string` un pedazo de la fila de la 0133 (por ejemplo, `sus renglones y recepciones.`).

En `CLAUDE.md` (§3 de las reglas duras), con Edit, la última aplicada pasa de `0132` a `0133`.

Run: `node scripts/check-migraciones.mjs`
Expected: `✓ 133 migraciones, índice al día.`

```bash
git add supabase/README.md CLAUDE.md
git commit -m "docs(db): 0133 aplicada en prod

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git -c credential.interactive=false push -u origin docs/0133-aplicada
```

Abrir la PR con `crear-pr.mjs` (título «docs(db): 0133 aplicada en prod», cuerpo de una línea con el resultado de las sondas). Después de que el Director la mergee:

```bash
git switch main
git pull --ff-only
git branch -d docs/0133-aplicada
```

---

# PR B · las pantallas, Recepción y la salida de la card

La PR B se trabaja en el mismo worktree (`wt-reposicion-2`), en una rama nueva que sale de `main` **con la PR A mergeada**:

```bash
cd "C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2"
git fetch origin
git switch -c feat/reposicion-parte-2-pantallas origin/main
npm ci
git branch --show-current
```

Expected: `feat/reposicion-parte-2-pantallas`. Si ya existe `.env` en el worktree, no hace falta tocarlo. Si no, copialo de la copia compartida (está en `.gitignore`):

```bash
cp "C:/Users/Tutuca/Desktop/Spira/Spira App/.env" .env
```

Las tareas de la PR B van **de abajo hacia arriba**: primero las piezas y los modales, después el estudio que los usa y recién al final el submódulo, que monta todo. Así cada tarea compila sola. Las vistas no llevan tests (se verifican mirando, Task 10 y Task 13): lo que puede fallar en silencio ya está testeado en el modelo.

### Task 8: Piezas, la hoja y los modales del pedido

**Files:**
- Create: `src/views/pharma/reposicion/piezas.tsx`
- Create: `src/views/pharma/reposicion/HojaPedido.tsx`
- Create: `src/views/pharma/reposicion/ArmarPedido.tsx`
- Create: `src/views/pharma/reposicion/AnularPedido.tsx`
- Create: `src/views/pharma/reposicion/PedidoDetalle.tsx`
- Modify: `src/views/pharma/reportes/impresion.tsx` (exporta `FilaKv`)

**Interfaces:**
- Consumes (PR A):
  - `PastillaPedido`, `ClavePastilla`, `pastillaDePedido`, `PedidoMedicacion`, `RenglonPedido`;
  - `MOTIVOS_CIERRE`, `MOTIVOS_ANULACION`, `faltaTxt`;
  - `cerrarFaltantePedido`, `reabrirFaltantePedido`, `anularPedidoMedicacion`, `emitirPedidoMedicacion`;
  - `borradorDelPedido`, `renglonesAEmitir`, `cambiosDelBorrador`, `EstudioReposicion`, `Periodo`, `textoPeriodo`, `diaMes`;
  - `porRecibir`, `notaDeReimpresion`, `EstudioInsumo` (Task 2);
  - `card` de `../reportes/estilos`; `protocolStatusLabel`, `protocolStatusVar` de `../../protocolStatus`.
- Produces:
  - `piezas.tsx`:
    - `botonChico: CSSProperties`, `botonAccion(primario: boolean, accentSolid: string): CSSProperties`;
    - `errorTexto: CSSProperties`, `plural(n, uno, varios)`, `mayuscula(s)`, `minuscula(s)`;
    - `versalita`, `rotuloColumna` (la tabla del estudio) y `rotuloTabla` (los modales): `CSSProperties`;
    - `PuntoEstado({ status })`: el estado del estudio con su punto de color;
    - `Envases({ n, tamano? })`, `Pastilla({ p })`, `AvisoLinea({ texto, tono? })`;
    - `Informacion({ icono, children })`, `EstadoCaja({ icono, titulo, texto, peligro?, accion? })`, `TituloSeccion({ children })`;
    - `useAngosto(): boolean`.
  - `HojaPedido.tsx`:
    - `interface DatosHoja { numero; estudio: { code; name }; periodo: Periodo; emitidoEl; emitidoPor: string | null; anulado: boolean; reimpresion: string | null; renglones: { nombre; presentacion: string | null; pedido: number; nota: string | null }[] }`;
    - `datosDeHoja(p: PedidoMedicacion, estudio: { code: string; name: string }, hoy: string): DatosHoja`: para REIMPRIMIR (marca «REIMPRESIÓN» y lo que ya llegó);
    - `useImpresion(): { hoja: DatosHoja | null; imprimir: (d: DatosHoja) => void }`;
    - `HojaPedido({ d }: { d: DatosHoja | null })`.
  - `ArmarPedido({ e, objetivo, hoy, ultimoVisto: number, accentSolid, onClose: (refrescar: boolean) => void, onEmitido: (d: DatosHoja) => void })`
  - `AnularPedido({ p, estudio, onClose, onAnulado })`
  - `PedidoDetalle({ p, estudio, puedeEditar, accentSolid, onClose, onCambio, onReimprimir })`

- [ ] **Step 1: Las piezas**

`src/views/pharma/reposicion/piezas.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'
import type { ClavePastilla, EstudioInsumo, PastillaPedido } from '../../../data/pharma'
import { protocolStatusLabel, protocolStatusVar } from '../../protocolStatus'
import { card } from '../reportes/estilos'

/**
 * Piezas chicas del submódulo Reposición, con los valores del mock
 * (docs/design_handoff_reposicion_submodulo/generar-artboards.mjs). Viven juntas porque las usan la
 * grilla, el estudio, los modales y la Recepción: repetirlas era garantizar que se separen.
 */

/**
 * Botón chico con borde: «Ver», «Reimprimir», «No va a llegar», «Reabrir», «Cargar» (RD16). Va con
 * `className="spira-card-link"`, que le pone el borde y el realce: acá NO va `border`, que le ganaría a la
 * clase por especificidad y dejaría el hover sin efecto.
 */
export const botonChico: CSSProperties = {
  height: 32, borderRadius: 10, background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)',
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px', flex: '0 0 auto', whiteSpace: 'nowrap',
}

/**
 * La acción de la fila del estudio: 38 de alto, como las de la cabecera del shell. Sólida o con borde, y el
 * borde SIEMPRE en longhands: el mismo botón pasa de «Armar pedido» (sólido) a «Armar otro pedido» (con
 * borde) sin desmontarse, y mezclar la abreviada con longhands lo dejaría sin borde.
 */
export function botonAccion(primario: boolean, accentSolid: string): CSSProperties {
  return {
    height: 38, padding: '0 15px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid',
    borderColor: primario ? accentSolid : 'var(--spira-line-2)',
    background: primario ? accentSolid : 'var(--spira-white)',
    color: primario ? 'var(--spira-on-accent)' : 'var(--spira-ink)',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', flex: '0 0 auto',
  }
}

export const errorTexto: CSSProperties = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 8, padding: '9px 12px', margin: 0,
}

/** La versalita de los rótulos de columna. Una sola, así las tablas del submódulo no se separan. */
export const versalita: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)',
}
/** Rótulo de columna de la tabla del estudio (el `th` de Estadísticas, sin el borde: lo pone la fila). */
export const rotuloColumna: CSSProperties = { ...versalita, padding: '10px 16px 9px', whiteSpace: 'nowrap' }
/** Rótulo de columna de las tablas de los modales («Armar pedido», el pedido). */
export const rotuloTabla: CSSProperties = { ...versalita, padding: '0 0 8px' }

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
export const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** El estado del estudio con su punto de color, como en Pacientes (la grilla y el estudio). */
export function PuntoEstado({ status }: { status: EstudioInsumo['status'] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: protocolStatusVar(status) }} />
      {protocolStatusLabel(status)}
    </span>
  )
}

/** El número grande con su unidad («7 envases»). */
export function Envases({ n, tamano = 22 }: { n: number; tamano?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: tamano, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--spira-ink)', lineHeight: 1 }}>{n}</span>
      <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)' }}>{n === 1 ? 'envase' : 'envases'}</span>
    </span>
  )
}

const TONO_PASTILLA: Record<ClavePastilla, CSSProperties> = {
  sin_recibir: { color: 'var(--spira-ink-soft)', background: 'var(--spira-surface)', borderColor: 'var(--spira-line-2)' },
  llego: { color: 'var(--spira-acc-deep-warn)', background: 'rgba(176, 130, 63, 0.14)', borderColor: 'transparent' },
  en_parte: { color: 'var(--spira-acc-deep-warn)', background: 'rgba(176, 130, 63, 0.14)', borderColor: 'transparent' },
  recibido: { color: 'var(--spira-acc-deep-good)', background: 'rgba(92, 138, 90, 0.14)', borderColor: 'transparent' },
  no_llego: { color: 'var(--spira-muted)', background: 'var(--spira-surface)', borderColor: 'var(--spira-line-2)' },
  anulado: { color: 'var(--spira-muted)', background: 'var(--spira-surface)', borderColor: 'var(--spira-line-2)' },
}

/** RD8: EL estado de un pedido, igual en toda la app. El texto va siempre; el color acompaña. */
export function Pastilla({ p }: { p: PastillaPedido }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap', borderWidth: 1, borderStyle: 'solid', ...TONO_PASTILLA[p.clave] }}>
      {p.texto}
    </span>
  )
}

/** Un aviso de una línea: ícono + frase (los de la boleta, «Armar pedido», el día de corte). */
export function AvisoLinea({ texto, tono = 'info' }: { texto: ReactNode; tono?: 'info' | 'warn' | 'danger' }) {
  const color = tono === 'warn' ? 'var(--spira-acc-deep-warn)' : tono === 'danger' ? 'var(--spira-acc-deep-danger)' : 'var(--spira-ink-soft)'
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 12.5, lineHeight: 1.45, color: tono === 'info' ? 'var(--spira-ink)' : color }}>
      <span style={{ flex: '0 0 14px', marginTop: 2 }}><Icon name={tono === 'info' ? 'info' : 'alert'} size={14} stroke={1.9} color={color} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>{texto}</span>
    </div>
  )
}

/** Un renglón de información arriba de la tabla del estudio: período cerrado, sólo lectura, pedido tarde. */
export function Informacion({ icono, children }: { icono: IconName; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 14px', fontSize: 13, color: 'var(--spira-ink-soft)', flexWrap: 'wrap' }}>
      <Icon name={icono} size={15} stroke={1.9} color="var(--spira-ink-soft)" />
      {children}
    </div>
  )
}

/** El estado de la pantalla en una caja (mock «Cargando y error», «Sin día de corte»). */
export function EstadoCaja({ icono, titulo, texto, peligro = false, accion }: {
  icono: IconName
  titulo: string
  texto: string
  peligro?: boolean
  accion?: ReactNode
}) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '22px 24px', flexWrap: 'wrap' }}>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: peligro ? 'rgba(166, 72, 59, 0.10)' : 'rgba(15, 95, 87, 0.08)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Icon name={icono} size={22} stroke={1.9} color={peligro ? 'var(--spira-danger)' : 'var(--spira-pharma-solid)'} />
      </span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-ink)' }}>{titulo}</div>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.45 }}>{texto}</div>
      </div>
      {accion}
    </div>
  )
}

/** Título de sección con su regla («Pedidos del estudio»). */
export function TituloSeccion({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0 10px' }}>
      <h2 style={{ fontFamily: 'var(--spira-font-display)', fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: 'var(--spira-ink)' }}>{children}</h2>
      <div style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
    </div>
  )
}

/** Por debajo de 1024 px el libro baja a un segundo renglón y la grilla pasa a dos columnas (RD14). */
export function useAngosto(): boolean {
  const [angosto, setAngosto] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)
  useEffect(() => {
    const alCambiar = () => setAngosto(window.innerWidth < 1024)
    window.addEventListener('resize', alCambiar)
    return () => window.removeEventListener('resize', alCambiar)
  }, [])
  return angosto
}
```

- [ ] **Step 2: La hoja y la impresión**

En `src/views/pharma/reportes/impresion.tsx`, exportar `FilaKv`: cambiar `function FilaKv(` por `export function FilaKv(`.

`src/views/pharma/reposicion/HojaPedido.tsx`:

```tsx
import { Fragment, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { formatAR } from '../../../lib/dates'
import { diaMes, notaDeReimpresion } from '../../../data/pharma'
import type { Periodo, PedidoMedicacion } from '../../../data/pharma'
import { FilaKv, Membrete, PieDePagina, tablaImpresa, tdImpresa, thImpresa } from '../reportes/impresion'

/**
 * La hoja A4 del pedido (mock «La hoja que va a la farmacia»): va a la farmacia y vuelve con la medicación.
 * Las tres últimas columnas —entregado, lote, vence— van VACÍAS para completarlas a mano, con dos renglones
 * por medicamento por si la farmacia entrega dos lotes (RD11). Un pedido anulado se reimprime marcado. Una
 * REIMPRESIÓN lleva la fecha y, debajo de cada renglón, lo que ya llegó y lo que no va a llegar: es la hoja
 * con la que se reclama, y sin eso la farmacia volvería a entregar lo recibido (revisión de ingeniería, 10).
 * Se portalea a <body> con `.spira-print-doc`, el mismo mecanismo que las hojas de Estadísticas.
 */

export interface DatosHoja {
  numero: number
  estudio: { code: string; name: string }
  periodo: Periodo
  /** Día de emisión (hora AR). */
  emitidoEl: string
  emitidoPor: string | null
  anulado: boolean
  /** El día de la reimpresión; null en la primera, que sale al emitir. */
  reimpresion: string | null
  /** `nota`: «recibido 5 · falta 1», «no va a llegar»… null si no llegó nada (o es la primera). */
  renglones: { nombre: string; presentacion: string | null; pedido: number; nota: string | null }[]
}

/** La hoja para REIMPRIMIR un pedido ya emitido. La primera la arma «Armar pedido» con lo que se emitió. */
export function datosDeHoja(p: PedidoMedicacion, estudio: { code: string; name: string }, hoy: string): DatosHoja {
  return {
    numero: p.numero,
    estudio: { code: estudio.code, name: estudio.name },
    periodo: { desde: p.periodo_desde, hasta: p.periodo_hasta },
    emitidoEl: p.emitido_el,
    emitidoPor: p.emitido_por_nombre,
    anulado: p.estado === 'anulado',
    reimpresion: hoy,
    renglones: p.renglones.map((r) => ({ nombre: r.medication_name, presentacion: r.presentacion, pedido: r.pedido, nota: notaDeReimpresion(r) })),
  }
}

/** Mismo mecanismo que Estadísticas: se monta la hoja y recién en el efecto siguiente se imprime. */
export function useImpresion(): { hoja: DatosHoja | null; imprimir: (d: DatosHoja) => void } {
  const [hoja, setHoja] = useState<DatosHoja | null>(null)
  useEffect(() => {
    if (!hoja) return
    const t = window.setTimeout(() => { window.print(); setHoja(null) }, 60)
    return () => window.clearTimeout(t)
  }, [hoja])
  return { hoja, imprimir: setHoja }
}

const celda = (extra: CSSProperties = {}): CSSProperties => ({ ...tdImpresa, padding: '12px 8px 12px 0', ...extra })
const PUNTEADA: CSSProperties = { borderBottom: '1px dotted #bbb' }

export function HojaPedido({ d }: { d: DatosHoja | null }) {
  if (!d) return null
  const total = d.renglones.reduce((s, r) => s + r.pedido, 0)
  return createPortal(
    <div className="spira-print-doc" aria-hidden="true">
      <Membrete />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 10 }}>
        <b style={{ fontSize: 13, letterSpacing: '0.07em' }}>
          PEDIDO DE MEDICACIÓN{d.anulado ? ' · ANULADO' : ''}{d.reimpresion ? ` · REIMPRESIÓN · ${diaMes(d.reimpresion)}` : ''}
        </b>
        <span className="spira-mono" style={{ marginLeft: 'auto', fontFamily: 'var(--spira-font-display)', fontSize: 26, fontWeight: 800 }}>Nº {d.numero}</span>
      </div>
      {d.anulado && (
        <div style={{ margin: '0 0 12px', padding: '8px 12px', border: '2px solid #000', fontSize: 12, fontWeight: 700 }}>
          Este pedido está anulado: no se entrega.
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
        <tbody>
          <FilaKv k="Estudio" v={`${d.estudio.code} · ${d.estudio.name}`} />
          <FilaKv k="Para el período" v={`${formatAR(d.periodo.desde)} al ${formatAR(d.periodo.hasta)}`} />
          <FilaKv k="Emitido" v={`${formatAR(d.emitidoEl)}${d.emitidoPor ? ` · ${d.emitidoPor}` : ''}`} />
        </tbody>
      </table>
      <table style={tablaImpresa}>
        <thead>
          <tr>
            <th style={{ ...thImpresa, width: '32%' }}>Medicamento</th>
            <th style={{ ...thImpresa, width: '14%' }}>Presentación</th>
            <th style={{ ...thImpresa, width: '9%', textAlign: 'right' }}>Pedido</th>
            <th style={{ ...thImpresa, width: '13%', paddingLeft: 18 }}>Entregado</th>
            <th style={{ ...thImpresa, width: '16%', paddingLeft: 12 }}>Lote</th>
            <th style={{ ...thImpresa, width: '16%', paddingLeft: 12 }}>Vence</th>
          </tr>
        </thead>
        <tbody>
          {d.renglones.map((r) => (
            <Fragment key={r.nombre}>
              <tr>
                <td style={celda(PUNTEADA)}>
                  <b>{r.nombre}</b>
                  {r.nota && <div style={{ fontSize: 10.5, marginTop: 3 }}>{r.nota}</div>}
                </td>
                <td style={celda(PUNTEADA)}>{r.presentacion ?? '—'}</td>
                <td style={celda({ ...PUNTEADA, textAlign: 'right' })}><b className="spira-mono">{r.pedido}</b></td>
                <td style={celda({ ...PUNTEADA, paddingLeft: 18 })} />
                <td style={celda({ ...PUNTEADA, paddingLeft: 12 })} />
                <td style={celda({ ...PUNTEADA, paddingLeft: 12 })} />
              </tr>
              <tr>
                <td style={celda()} /><td style={celda()} /><td style={celda()} />
                <td style={celda({ paddingLeft: 18 })} /><td style={celda({ paddingLeft: 12 })} /><td style={celda({ paddingLeft: 12 })} />
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, marginTop: 8 }}>
        Total pedido: <b className="spira-mono">{total} {total === 1 ? 'envase' : 'envases'}</b> de {d.renglones.length} {d.renglones.length === 1 ? 'medicamento' : 'medicamentos'}. Si un medicamento llega en dos lotes, usá el segundo renglón.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 40, marginTop: 64 }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: 5, fontSize: 10 }}>Entregó (farmacia) · firma y aclaración</div>
        <div style={{ borderTop: '1px solid #000', paddingTop: 5, fontSize: 10 }}>Recibió · firma y aclaración</div>
      </div>
      <div style={{ marginTop: 22, padding: '9px 12px', border: '1px solid #000', fontSize: 11, fontWeight: 700 }}>
        Devolver esta hoja junto con la medicación. En Recepción se recibe con el número del pedido.
      </div>
      <PieDePagina emitidoEn={new Date().toISOString()} />
    </div>,
    document.body,
  )
}
```

- [ ] **Step 3: Armar pedido**

`src/views/pharma/reposicion/ArmarPedido.tsx`:

```tsx
import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldInput } from '../../../components/FormField'
import { useAuth } from '../../../lib/auth'
import { borradorDelPedido, cambiosDelBorrador, emitirPedidoMedicacion, renglonesAEmitir, textoPeriodo } from '../../../data/pharma'
import type { EstudioReposicion, Periodo } from '../../../data/pharma'
import type { DatosHoja } from './HojaPedido'
import { AvisoLinea, plural, rotuloTabla } from './piezas'

const COLUMNAS = 'minmax(0, 1fr) 110px 150px'
const lista = (xs: readonly string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/**
 * «Armar pedido» (R8, mock «3 · Armar pedido»): lo calculado al lado de un «Pedir» corregible. Un renglón
 * en 0 no va al pedido y un pedido vacío no se emite. «Emitir e imprimir» lo guarda con número y abre la
 * hoja; el botón se apaga mientras guarda, así un doble click no emite dos.
 */
export function ArmarPedido({ e, objetivo, hoy, ultimoVisto, accentSolid, onClose, onEmitido }: {
  e: EstudioReposicion
  /** El período PARA el que se pide: el que viene, o el que empezó si se pide tarde (RD1). */
  objetivo: Periodo
  hoy: string
  /** El número del último pedido de `objetivo` que muestra la pantalla, 0 si ninguno (`ultimoPedidoPara`). */
  ultimoVisto: number
  accentSolid: string
  /** `refrescar`: hubo un error y la pantalla puede estar vieja (el pedido pudo quedar hecho, u otro lo emitió). */
  onClose: (refrescar: boolean) => void
  onEmitido: (d: DatosHoja) => void
}) {
  const { profile } = useAuth()
  /* El borrador se toma UNA vez, al abrir: si la lista del estudio se refresca por detrás, lo que la
     farmacéutica ya corrigió no se pisa. */
  const [inicial] = useState(() => borradorDelPedido(e))
  const [pedir, setPedir] = useState<Record<string, string>>(
    () => Object.fromEntries(inicial.map((r) => [r.medicationId, String(r.pedir)])),
  )
  /* Un intento por ventana abierta (0133): si la red se corta después de guardar y se reintenta, la base
     devuelve el pedido que ya quedó en vez de emitir otro. */
  const [intento] = useState(() => crypto.randomUUID())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Después de CUALQUIER error, cerrar vuelve a pedir los datos (revisión de ingeniería, 6). Sin código es la
     red: el pedido pudo haber quedado hecho, y si la pantalla sigue diciendo «sin pedido», volver a abrir
     trae otro intento y emite un segundo. Con código, la base dijo que la pantalla quedó vieja (otro pedido,
     otro día). */
  const [fallo, setFallo] = useState(false)
  const cerrar = () => onClose(fallo)

  const borrador = inicial.map((r) => {
    const t = (pedir[r.medicationId] ?? '').trim()
    return { ...r, pedir: t === '' ? 0 : Number(t) }
  })
  const invalido = borrador.some((r) => !Number.isInteger(r.pedir) || r.pedir < 0)
  const renglones = renglonesAEmitir(borrador)
  const cambios = cambiosDelBorrador(borrador)
  const total = renglones.reduce((s, r) => s + r.pedido, 0)
  const noSeCompran = e.renglones.filter((r) => r.estado === 'no_se_compra').map((r) => r.nombre)
  const puede = !enviando && !invalido && renglones.length > 0

  async function emitir() {
    if (!puede) return
    setEnviando(true); setError(null)
    const r = await emitirPedidoMedicacion({ protocolId: e.estudio.id, periodo: objetivo, emitidoEl: hoy, renglones, intento, ultimoVisto })
    setEnviando(false)
    if (r.error || r.numero == null) {
      /* Con código, es la base diciendo por qué no (permiso, estudio cerrado, ya hay otro pedido, otro día):
         va tal cual. Sin código es la red: reintentar es seguro DESDE ESTA VENTANA, porque viaja el mismo
         intento; otra ventana trae otro. */
      setFallo(true)
      setError(r.code ? (r.error ?? 'No se pudo emitir el pedido.') : 'No se pudo emitir el pedido. Probá de nuevo desde esta ventana: si ya había quedado hecho, no se repite.')
      return
    }
    onEmitido({
      numero: r.numero,
      estudio: { code: e.estudio.code, name: e.estudio.name },
      periodo: objetivo,
      emitidoEl: hoy,
      emitidoPor: profile?.fullName ?? null,
      anulado: false,
      reimpresion: null,
      renglones: borrador
        .filter((b) => Number.isInteger(b.pedir) && b.pedir > 0)
        .map((b) => ({ nombre: b.nombre, presentacion: b.presentacion, pedido: b.pedir, nota: null })),
    })
  }

  const sub = `Para el período ${textoPeriodo(objetivo)}.${noSeCompran.length === 0 ? ''
    : noSeCompran.length === 1 ? ` ${noSeCompran[0]} no aparece: no se compra.`
      : ` ${lista(noSeCompran)} no aparecen: no se compran.`}`

  return (
    <Modal title={`Pedido de ${e.estudio.code} · ${e.estudio.name}`} onClose={enviando ? () => {} : cerrar} maxWidth={560}>
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', margin: '-8px 0 14px', lineHeight: 1.45 }}>{sub}</p>

      <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, borderBottom: '1px solid var(--spira-line-2)' }}>
        <div style={rotuloTabla}>Medicamento</div>
        <div style={{ ...rotuloTabla, textAlign: 'right' }}>Calculado</div>
        <div style={{ ...rotuloTabla, textAlign: 'right' }}>Pedir</div>
      </div>
      {borrador.map((r, i) => {
        const cambio = r.calculado != null && r.pedir !== r.calculado
        return (
          <div key={r.medicationId} style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, alignItems: 'center', padding: '11px 0', borderBottom: i === borrador.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{r.nombre}</div>
              <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>
                {[r.presentacion, r.calculado == null ? 'se pide a mano' : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {r.calculado == null
                ? <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>Sin cargar</span>
                : <span className="spira-mono" style={{ fontSize: 14, color: 'var(--spira-ink-soft)' }}>{r.calculado}</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <input
                type="number" inputMode="numeric" min={0} step={1}
                aria-label={`Pedir de ${r.nombre}`}
                value={pedir[r.medicationId] ?? ''}
                onChange={(ev) => setPedir((prev) => ({ ...prev, [r.medicationId]: ev.target.value }))}
                className="spira-mono"
                /* Lo que se corrigió respecto de lo calculado se eleva: realce por elevación, nunca color. */
                style={{ ...fieldInput, width: 84, ...(cambio ? { boxShadow: 'var(--spira-shadow-sm)' } : {}) }}
              />
            </div>
          </div>
        )
      })}

      {cambios.length > 0 && <div style={{ marginTop: 12 }}>{cambios.map((c) => <AvisoLinea key={c} texto={c} />)}</div>}
      {invalido && <div style={{ marginTop: 8 }}><AvisoLinea tono="warn" texto="Las cantidades van en envases enteros, sin negativos." /></div>}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '12px 0 0', marginTop: 8, borderTop: '1px solid var(--spira-line)' }}>
        <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>En el pedido</span>
        <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 18, fontWeight: 800, color: 'var(--spira-ink)' }}>{total}</span>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)' }}>{total === 1 ? 'envase' : 'envases'}</span>
        <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>· {plural(renglones.length, 'medicamento', 'medicamentos')}</span>
      </div>
      {error
        ? <div style={{ marginTop: 10 }}><AvisoLinea tono="danger" texto={error} /></div>
        : <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '6px 0 0', lineHeight: 1.45 }}>Se guarda con número y queda para recibirlo en Recepción. Un renglón en 0 no va al pedido.</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={cerrar} disabled={enviando} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={() => void emitir()} disabled={!puede}
          title={renglones.length === 0 ? 'El pedido está vacío' : undefined}
          style={{ ...btnPrimary(accentSolid), display: 'inline-flex', alignItems: 'center', gap: 8, opacity: puede ? 1 : 0.6 }}
        >
          <Icon name="printer" size={16} />{enviando ? 'Emitiendo…' : 'Emitir e imprimir'}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Anular**

`src/views/pharma/reposicion/AnularPedido.tsx`:

```tsx
import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldLabelStyle } from '../../../components/FormField'
import { MOTIVOS_ANULACION, anularPedidoMedicacion, diaMes } from '../../../data/pharma'
import type { MotivoAnulacion, PedidoMedicacion } from '../../../data/pharma'
import { errorTexto } from './piezas'

/**
 * Anular un pedido (R9, mock «Anular un pedido sin recibir»): sólo sin recepciones. El motivo arranca VACÍO
 * y se elige de la lista (RD10). El pedido queda en la lista como anulado y deja de estar en camino.
 */
export function AnularPedido({ p, estudio, onClose, onAnulado }: {
  p: PedidoMedicacion
  estudio: { code: string; name: string }
  onClose: () => void
  onAnulado: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function anular() {
    if (!motivo || enviando) return
    setEnviando(true); setError(null)
    const r = await anularPedidoMedicacion(p.id, motivo as MotivoAnulacion)
    setEnviando(false)
    if (r.error) { setError(r.error); return }
    onAnulado()
  }

  return (
    <Modal
      title={`Anular el pedido Nº ${p.numero}`} onClose={enviando ? () => {} : onClose} maxWidth={428}
      icon="alertCircle" accent="var(--spira-danger)" accentSoft="rgba(166,72,59,.12)"
    >
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', margin: '-8px 0 12px' }}>{estudio.code} · {estudio.name} · emitido el {diaMes(p.emitido_el)}</p>
      <p style={{ fontSize: 13, color: 'var(--spira-ink)', lineHeight: 1.5, margin: '0 0 14px' }}>
        Todavía no se recibió nada. Queda en la lista como anulado y deja de estar en camino.
      </p>
      <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Motivo</div>
      <SearchableSelect value={motivo} onChange={setMotivo} options={MOTIVOS_ANULACION} placeholder="Elegí un motivo" searchable="never" entity="motivo" />
      {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} disabled={enviando} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => void anular()} disabled={!motivo || enviando}
          style={{ ...btnPrimary('var(--spira-danger)'), opacity: !motivo || enviando ? 0.6 : 1 }}>
          {enviando ? 'Anulando…' : 'Anular pedido'}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 5: El detalle del pedido**

`src/views/pharma/reposicion/PedidoDetalle.tsx`:

```tsx
import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldLabelStyle } from '../../../components/FormField'
import { dateToISO, formatShortAR } from '../../../lib/dates'
import {
  MOTIVOS_ANULACION, MOTIVOS_CIERRE, cerrarFaltantePedido, diaMes, faltaTxt, pastillaDePedido, reabrirFaltantePedido, sePuedeCerrar, textoPeriodo,
} from '../../../data/pharma'
import type { MotivoCierre, PedidoMedicacion, RenglonPedido } from '../../../data/pharma'
import { AnularPedido } from './AnularPedido'
import { Pastilla, botonChico, errorTexto, mayuscula, plural, rotuloTabla } from './piezas'

const COLUMNAS = 'minmax(0, 1fr) 64px 76px 56px 150px'
const fechaDe = (ts: string) => formatShortAR(dateToISO(new Date(ts)))
const motivoDe = (lista: readonly { value: string; label: string }[], v: string | null) => lista.find((m) => m.value === v)?.label ?? ''

/**
 * El pedido (R11, mocks «5 · El pedido», «No va a llegar», «Un renglón cerrado se puede reabrir», «Llegó,
 * falta verificar»). Por renglón: pedido, recibido y lo que falta. «No va a llegar» cierra lo que falta con
 * un motivo elegido de la lista (RD10) y «Reabrir» lo deshace (RD2). Reimprimir es de todos; lo demás, de
 * Farmacia operator.
 */
export function PedidoDetalle({ p, estudio, puedeEditar, accentSolid, onClose, onCambio, onReimprimir }: {
  p: PedidoMedicacion
  estudio: { code: string; name: string }
  puedeEditar: boolean
  accentSolid: string
  onClose: () => void
  /** Algo cambió en la base: la pantalla vuelve a pedir y este modal se redibuja con el pedido nuevo. */
  onCambio: () => void
  onReimprimir: () => void
}) {
  const [cerrando, setCerrando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(false)

  const pastilla = pastillaDePedido(p)
  const vivo = p.estado !== 'anulado'
  const anulable = puedeEditar && vivo && p.recepciones.length === 0
  const hayCerrados = p.renglones.some((r) => r.cerrado_at)
  const sub = `${estudio.code} · ${estudio.name} · para el período ${textoPeriodo({ desde: p.periodo_desde, hasta: p.periodo_hasta })} · emitido el ${diaMes(p.emitido_el)}${p.emitido_por_nombre ? ` por ${p.emitido_por_nombre}` : ''}`
  const estadoTexto = !vivo
    ? `Anulado el ${p.anulado_at ? fechaDe(p.anulado_at) : '—'}${p.anulado_por_nombre ? ` por ${p.anulado_por_nombre}` : ''} · ${motivoDe(MOTIVOS_ANULACION, p.anulado_motivo)}`
    : pastilla.clave === 'llego' ? 'El stock se actualiza cuando se verifica la recepción.'
      : p.faltanteTotal > 0 ? mayuscula(faltaTxt(p.faltanteTotal))
        : ''

  async function cerrar(r: RenglonPedido) {
    if (!motivo || ocupado) return
    setOcupado(r.id); setError(null)
    const res = await cerrarFaltantePedido(r.id, motivo as MotivoCierre)
    setOcupado(null)
    if (res.error) { setError(res.error); return }
    setCerrando(null); setMotivo(''); onCambio()
  }

  async function reabrir(r: RenglonPedido) {
    if (ocupado) return
    setOcupado(r.id); setError(null)
    const res = await reabrirFaltantePedido(r.id)
    setOcupado(null)
    if (res.error) { setError(res.error); return }
    onCambio()
  }

  const notaDe = (r: RenglonPedido) => r.cerrado_at
    ? `No va a llegar · ${motivoDe(MOTIVOS_CIERRE, r.cerrado_motivo)} · ${fechaDe(r.cerrado_at)}${r.cerrado_por_nombre ? `, ${r.cerrado_por_nombre}` : ''}`
    : r.sin_verificar > 0 ? `${r.presentacion ? `${r.presentacion} · ` : ''}${r.sin_verificar} en la recepción sin verificar`
      : r.presentacion ?? ''

  return (
    <>
      <Modal title={`Pedido Nº ${p.numero}`} onClose={onClose} maxWidth={580}>
        <p style={{ fontSize: 13, color: 'var(--spira-muted)', margin: '-8px 0 14px', lineHeight: 1.45 }}>{sub}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <Pastilla p={pastilla} />
          {estadoTexto && <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>{estadoTexto}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, borderBottom: '1px solid var(--spira-line-2)' }}>
          <div style={rotuloTabla}>Medicamento</div>
          <div style={{ ...rotuloTabla, textAlign: 'right' }}>Pedido</div>
          <div style={{ ...rotuloTabla, textAlign: 'right' }}>Recibido</div>
          <div style={{ ...rotuloTabla, textAlign: 'right' }}>Falta</div>
          <div />
        </div>
        {p.renglones.map((r, i) => (
          <div key={r.id} style={{ borderBottom: i === p.renglones.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, alignItems: 'center', padding: '11px 0' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{r.medication_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{notaDe(r)}</div>
              </div>
              <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{r.pedido}</span>
              <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{r.recibido}</span>
              <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: r.faltante === 0 ? 'var(--spira-ink-soft)' : 'var(--spira-acc-deep-warn)' }}>{r.faltante}</span>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {/* Con una recepción sin verificar en el renglón, primero se verifica: cerrar mandaría a la compra
                    lo que ya está en la casa. La regla es la de la base (0133), en `sePuedeCerrar`. */}
                {vivo && puedeEditar && sePuedeCerrar(r) && cerrando !== r.id && (
                  <button type="button" className="spira-card-link" style={botonChico} onClick={() => { setCerrando(r.id); setMotivo('') }}>No va a llegar</button>
                )}
                {vivo && puedeEditar && r.cerrado_at && (
                  <button type="button" className="spira-card-link" style={botonChico} disabled={ocupado === r.id} onClick={() => void reabrir(r)}>
                    <Icon name="rotateCcw" size={13} color={accentSolid} />{ocupado === r.id ? 'Reabriendo…' : 'Reabrir'}
                  </button>
                )}
              </div>
            </div>
            {cerrando === r.id && (
              <div style={{ margin: '0 0 12px', padding: 14, borderRadius: 11, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)' }}>
                <div style={{ fontSize: 13, color: 'var(--spira-ink)', marginBottom: 10, lineHeight: 1.45 }}>
                  {r.faltante === 1
                    ? 'El envase que falta deja de estar en camino y vuelve a la compra.'
                    : `Los ${r.faltante} envases que faltan dejan de estar en camino y vuelven a la compra.`} Se puede reabrir si al final llega.
                </div>
                <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Por qué no va a llegar</div>
                <div style={{ maxWidth: 300 }}>
                  <SearchableSelect value={motivo} onChange={setMotivo} options={MOTIVOS_CIERRE} placeholder="Elegí un motivo" searchable="never" entity="motivo" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button type="button" disabled={!motivo || ocupado === r.id} onClick={() => void cerrar(r)}
                    style={{ ...btnPrimary(accentSolid), height: 38, opacity: !motivo || ocupado === r.id ? 0.6 : 1 }}>
                    {ocupado === r.id ? 'Cerrando…' : 'Cerrar lo que falta'}
                  </button>
                  <button type="button" onClick={() => { setCerrando(null); setMotivo('') }} style={{ ...btnOutline, height: 38 }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {p.recepciones.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)', marginBottom: 6 }}>
              {p.recepciones.length === 1 ? 'Recepción de este pedido' : 'Recepciones de este pedido'}
            </div>
            {p.recepciones.map((rc) => (
              <div key={rc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--spira-ink)', padding: '4px 0', flexWrap: 'wrap' }}>
                <Icon name="clipboardCheck" size={15} color={accentSolid} />
                <span className="spira-mono" style={{ fontWeight: 600 }}>Recepción Nº {rc.folio}</span>
                <span style={{ color: rc.status === 'pendiente' ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)' }}>
                  {diaMes(rc.reception_date)} · {rc.status === 'pendiente' ? 'sin verificar' : `verificada${rc.verified_by_name ? ` por ${rc.verified_by_name}` : ''}`} · {plural(rc.envases, 'envase', 'envases')}
                </span>
              </div>
            ))}
          </div>
        )}

        {vivo && p.recepciones.length > 0 && p.faltanteTotal > 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '14px 0 0', lineHeight: 1.45 }}>
            Ya tiene una recepción, así que no se puede anular. Lo que falta sigue en camino hasta que llegue o se cierre.
          </p>
        )}
        {vivo && hayCerrados && puedeEditar && (
          <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '14px 0 0', lineHeight: 1.45 }}>
            Si al final la farmacia lo manda, «Reabrir» lo vuelve a poner en camino y se recibe con este pedido. Queda registrado quién y cuándo.
          </p>
        )}
        {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={onReimprimir} style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="printer" size={16} />Reimprimir
          </button>
          {anulable && <button type="button" onClick={() => setAnulando(true)} style={btnOutline}>Anular pedido</button>}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
        </div>
      </Modal>
      {/* Hermano y no hijo del modal de arriba: el `Modal` no se portalea, y un fixed adentro de otro queda
          atado a su caja. La pila de Escape de `Modal` cierra primero este, que se abrió último. */}
      {anulando && (
        <AnularPedido p={p} estudio={estudio} onClose={() => setAnulando(false)} onAnulado={() => { setAnulando(false); onCambio() }} />
      )}
    </>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores. Todavía nadie monta estos componentes: se ven en la Task 10.

- [ ] **Step 7: Commit**

```bash
git add src/views/pharma/reposicion/piezas.tsx src/views/pharma/reposicion/HojaPedido.tsx src/views/pharma/reposicion/ArmarPedido.tsx src/views/pharma/reposicion/AnularPedido.tsx src/views/pharma/reposicion/PedidoDetalle.tsx src/views/pharma/reportes/impresion.tsx
git commit -m "feat(reposicion): piezas, la hoja del pedido y sus modales

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: El estudio — libro, boleta y pedidos

**Files:**
- Create: `src/views/pharma/reposicion/CargarReposicion.tsx`
- Create: `src/views/pharma/reposicion/FilaMedicamento.tsx`
- Create: `src/views/pharma/reposicion/PantallaEstudio.tsx`

**Interfaces:**
- Consumes:
  - Task 8: piezas, `ArmarPedido`, `PedidoDetalle`, `HojaPedido`, `datosDeHoja`, `useImpresion`;
  - PR A: `RenglonDelPeriodo`, `Boleta`, `EstudioReposicion`, `ReposicionDelPeriodo`, `subtituloDelPeriodo`, `resumenDelEstudio`, `pedidosAMostrar`, `pastillaDePedido`, `periodoAnterior`, `periodoSiguiente`, `textoPeriodo`, `diaMes`, `configurarReposicion`;
  - `chip`, `chipActivo` de `../reportes/estilos`;
  - `ultimoPedidoPara` (Task 2) y `card` de `../reportes/estilos`.
- Produces:
  - `CargarReposicion({ r, accentSolid, onCancelar, onGuardado })`
  - `FilaMedicamento({ r, enCurso, ultimo, angosto, puedeEditar, accentSolid, abierto, editando, onAlternar, onEditar, onCerrarEdicion, onGuardado })`, `COLUMNAS` (en curso: nombre, había, entró, salió, hay, mínimo, comprar y la flecha), `COLUMNAS_CERRADO`
  - `PantallaEstudio({ rep, e, diaCorte, puedeEditar, angosto, accent, accentSolid, onVolver, onPeriodo, onCambio })`
    - `onPeriodo(fecha: string)`: una fecha dentro del período a mirar, o `''` para el en curso;
    - `onCambio()`: vuelve a pedir los datos.

- [ ] **Step 1: «Cargar cómo se repone», mudado de la card**

`src/views/pharma/reposicion/CargarReposicion.tsx`. Es `FormularioReposicion` de `reportes/ComprasDelMes.tsx` con otro tipo de renglón y el copy del mock («Cargar cómo se repone»):

```tsx
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldInput, fieldLabelStyle } from '../../../components/FormField'
import { configurarReposicion } from '../../../data/pharma'
import type { ModoReposicion, RenglonDelPeriodo } from '../../../data/pharma'
import { chip, chipActivo } from '../reportes/estilos'
import { errorTexto, plural } from './piezas'

const MODOS: { valor: ModoReposicion; label: string }[] = [
  { valor: 'mensual', label: 'Por mes' },
  { valor: 'a_demanda', label: 'A demanda' },
  { valor: 'no_se_compra', label: 'No se compra' },
]

/**
 * Cómo se repone un medicamento del estudio (D2-D4, D25), mudado tal cual de la card de Estadísticas. Por
 * función (`configurar_reposicion`, 0125) porque la tabla exige leader para escribir y esto es de Farmacia
 * operator (D12). Se abre dentro del renglón, en el lugar de la boleta.
 */
export function CargarReposicion({ r, accentSolid, onCancelar, onGuardado }: {
  r: RenglonDelPeriodo
  accentSolid: string
  onCancelar: () => void
  onGuardado: () => void
}) {
  const [modo, setModo] = useState<ModoReposicion>(r.modo ?? 'mensual')
  const [cantidad, setCantidad] = useState(() => {
    if (r.modo === 'mensual') return String(r.envasesPorMes ?? 1)
    if (r.modo === 'a_demanda') return String(r.stockFijo ?? 0)
    return '1'
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Number(cantidad)
  const valida = modo === 'no_se_compra' || (Number.isInteger(n) && (modo === 'mensual' ? n >= 1 : n >= 0))

  async function guardar() {
    if (!valida || guardando) return
    setGuardando(true); setError(null)
    const res = await configurarReposicion({
      protocolMedicationId: r.protocolMedicationId,
      modo,
      envasesPorMes: modo === 'mensual' ? n : null,
      stockFijo: modo === 'a_demanda' ? n : null,
    })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    onGuardado()
  }

  function teclasModo(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = MODOS.findIndex((x) => x.valor === modo)
    const j = (i + (e.key === 'ArrowRight' ? 1 : MODOS.length - 1)) % MODOS.length
    setModo(MODOS[j].valor)
    ;(e.currentTarget.children[j] as HTMLElement | undefined)?.focus()
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void guardar() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancelar() } }}
      style={{ paddingTop: 8 }}
    >
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div id={`modo-${r.clave}`} style={{ ...fieldLabelStyle, marginBottom: 6 }}>Cómo se repone</div>
          <div role="radiogroup" aria-labelledby={`modo-${r.clave}`} onKeyDown={teclasModo} style={{ display: 'inline-flex', gap: 7 }}>
            {MODOS.map((m) => (
              <button
                key={m.valor} type="button" role="radio" aria-checked={modo === m.valor} tabIndex={modo === m.valor ? 0 : -1}
                onClick={() => setModo(m.valor)} style={{ ...chip, ...(modo === m.valor ? chipActivo : null) }}
                autoFocus={m.valor === modo}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {modo !== 'no_se_compra' && (
          <label style={{ display: 'block' }}>
            <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>{modo === 'mensual' ? 'Envases por mes, por paciente' : 'Tener siempre en el estante'}</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" inputMode="numeric" min={modo === 'mensual' ? 1 : 0} step={1}
                value={cantidad} onChange={(e) => setCantidad(e.target.value)}
                style={{ ...fieldInput, width: 96 }} className="spira-mono"
              />
              <span style={{ fontSize: 13, color: 'var(--spira-ink-soft)' }}>{n === 1 ? 'envase' : 'envases'}</span>
            </span>
          </label>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 12, maxWidth: 560, lineHeight: 1.45 }}>
        {modo === 'mensual' && <>{plural(r.pacientes, 'paciente lo tiene', 'pacientes lo tienen')} habilitado. Un paciente con otra cantidad se cambia desde su ficha.</>}
        {modo === 'a_demanda' && <>Para lo que no se usa todos los meses, como el rescate. No mira pacientes.</>}
        {modo === 'no_se_compra' && <>Lo manda el sponsor o no se repone: queda fuera de la cuenta.</>}
      </div>
      {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" disabled={!valida || guardando} style={{ ...btnPrimary(accentSolid), opacity: !valida || guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} style={btnOutline}>Cancelar</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: El renglón del libro con su boleta**

`src/views/pharma/reposicion/FilaMedicamento.tsx`:

```tsx
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { Boleta, RenglonDelPeriodo } from '../../../data/pharma'
import { CargarReposicion } from './CargarReposicion'
import { AvisoLinea, Envases, botonChico, plural } from './piezas'

/**
 * Mock «2 · El estudio»: nombre, había, entró, salió, hay | mínimo, comprar, y la flecha que abre la boleta.
 * «Mínimo» no está en el mock: lo pidió el Director el 2026-09-19 (el stock mínimo de cada medicamento,
 * sacado de la medicación asignada a los pacientes, sin desplegar la cuenta).
 */
export const COLUMNAS = 'minmax(0, 1fr) 84px 84px 84px 96px 96px 190px 44px'
/** Un período cerrado: había, entró, salió y quedó, sin «comprar» (R6). */
export const COLUMNAS_CERRADO = 'minmax(0, 1fr) 96px 96px 96px 96px'
/** Por debajo de 1024 px el libro baja a un segundo renglón (RD14). */
const COLUMNAS_ANGOSTA = 'minmax(0, 1fr) auto 36px'

const numero: CSSProperties = { padding: '13px 16px', textAlign: 'right', fontSize: 14, color: 'var(--spira-ink)' }
const nota: CSSProperties = { fontSize: 13, color: 'var(--spira-ink-soft)', margin: '6px 0' }
const flechaRenglon: CSSProperties = {
  justifySelf: 'center', width: 32, height: 32, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
}

/** «−1 por ajuste» · «+2 por ajustes»: que la fila cierre (había + entró − salió ± ajustes = hay). */
const textoAjuste = (a: number) => (a === 0 ? null : `${a > 0 ? '+' : '−'}${Math.abs(a)} por ${Math.abs(a) === 1 ? 'ajuste' : 'ajustes'}`)

export function FilaMedicamento({ r, enCurso, ultimo, angosto, puedeEditar, accentSolid, abierto, editando, onAlternar, onEditar, onCerrarEdicion, onGuardado }: {
  r: RenglonDelPeriodo
  enCurso: boolean
  ultimo: boolean
  angosto: boolean
  puedeEditar: boolean
  accentSolid: string
  abierto: boolean
  editando: boolean
  onAlternar: () => void
  onEditar: () => void
  onCerrarEdicion: () => void
  onGuardado: () => void
}) {
  const avisos = r.avisos.filter((a) => a.ambar).length
  const ajuste = textoAjuste(r.libro.ajustes)

  const nombre = (
    <div style={{ padding: angosto ? 0 : '13px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--spira-ink)', flexWrap: angosto ? 'wrap' : 'nowrap' }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.nombre}</span>
        {/* RD14: el aviso lleva texto, no sólo el ícono. */}
        {avisos > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
            <Icon name="alert" size={13} stroke={1.9} />{plural(avisos, 'aviso', 'avisos')}
          </span>
        )}
      </div>
      {r.presentacion && <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{r.presentacion}</div>}
      {angosto && (
        <div className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 4 }}>
          había {r.libro.habia} · entró {r.libro.entro} · salió {r.libro.salio} · {enCurso ? 'hay' : 'quedó'} {r.libro.hay}{ajuste ? ` (${ajuste})` : ''}
        </div>
      )}
      {angosto && enCurso && r.minimo && (
        <div style={{ fontSize: 12, color: 'var(--spira-ink-soft)', marginTop: 2 }}>
          Mínimo <span className="spira-mono">{r.minimo.envases}</span> · {textoMinimo(r.minimo)}
        </div>
      )}
    </div>
  )
  const libro = !angosto && (
    <>
      <span className="spira-mono" style={numero}>{r.libro.habia}</span>
      <span className="spira-mono" style={numero}>{r.libro.entro}</span>
      <span className="spira-mono" style={numero}>{r.libro.salio}</span>
      <div style={numero}>
        <span className="spira-mono">{r.libro.hay}</span>
        {ajuste && <div style={{ fontSize: 11, color: 'var(--spira-ink-soft)', marginTop: 2, whiteSpace: 'nowrap' }}>{ajuste}</div>}
      </div>
    </>
  )

  // Un período cerrado es sólo el libro: sin «comprar» ni boleta (R6).
  if (!enCurso) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: angosto ? 'minmax(0, 1fr)' : COLUMNAS_CERRADO, alignItems: 'center', padding: angosto ? '11px 14px' : 0, borderBottom: ultimo ? 'none' : '1px solid var(--spira-line)' }}>
        {nombre}
        {libro}
      </div>
    )
  }

  return (
    <div style={{ borderBottom: ultimo && !abierto ? 'none' : '1px solid var(--spira-line)' }}>
      {/* La fila se RESALTA, no se levanta (tokens.css: una fila que se mueve 1px lee como temblor). */}
      <div
        className="spira-row-link spira-no-press"
        onClick={onAlternar}
        style={{
          display: 'grid', gridTemplateColumns: angosto ? COLUMNAS_ANGOSTA : COLUMNAS, alignItems: 'center', cursor: 'pointer',
          gap: angosto ? 10 : 0, padding: angosto ? '11px 14px' : 0, background: abierto ? 'var(--spira-surface)' : undefined,
        }}
      >
        {nombre}
        {libro}
        {!angosto && <Minimo r={r} />}
        <div style={{ padding: angosto ? 0 : '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, alignSelf: 'stretch' }}>
          <Comprar r={r} puedeEditar={puedeEditar} accentSolid={accentSolid} onCargar={onEditar} />
        </div>
        <button
          type="button" aria-expanded={abierto}
          aria-label={`${abierto ? 'Cerrar' : 'Abrir'} la cuenta de ${r.nombre}`}
          onClick={(ev) => { ev.stopPropagation(); onAlternar() }}
          style={flechaRenglon}
        >
          <Icon name={abierto ? 'chevronUp' : 'chevronDown'} size={16} color="var(--spira-muted)" />
        </button>
      </div>
      {abierto && (
        <div style={{ padding: '6px 16px 18px', background: 'var(--spira-surface)', borderTop: '1px solid var(--spira-line)' }}>
          {editando && puedeEditar
            ? <CargarReposicion r={r} accentSolid={accentSolid} onCancelar={onCerrarEdicion} onGuardado={onGuardado} />
            : <Cuenta r={r} puedeEditar={puedeEditar} accentSolid={accentSolid} onCambiar={onEditar} />}
        </div>
      )}
    </div>
  )
}

const textoMinimo = (m: NonNullable<RenglonDelPeriodo['minimo']>) =>
  m.pacientes == null ? 'a demanda' : plural(m.pacientes, 'paciente', 'pacientes')

/**
 * El stock mínimo del período para el que se compra: la suma de lo que reciben por mes los pacientes que lo
 * tienen asignado, o el «tener siempre» si es a demanda. Abre el grupo «para el que viene»: el borde de la
 * izquierda separa lo que pasó de lo que se compra.
 */
function Minimo({ r }: { r: RenglonDelPeriodo }) {
  return (
    <div style={{ ...numero, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', borderLeft: '1px solid var(--spira-line)' }}>
      {r.minimo
        ? <>
            <span className="spira-mono">{r.minimo.envases}</span>
            <span style={{ fontSize: 11, color: 'var(--spira-ink-soft)', marginTop: 2, whiteSpace: 'nowrap' }}>{textoMinimo(r.minimo)}</span>
          </>
        : <span style={{ color: 'var(--spira-faint)' }}>—</span>}
    </div>
  )
}

/** La celda de la derecha: lo que hay que comprar, o por qué no. */
function Comprar({ r, puedeEditar, accentSolid, onCargar }: { r: RenglonDelPeriodo; puedeEditar: boolean; accentSolid: string; onCargar: () => void }): ReactNode {
  switch (r.estado) {
    case 'comprar':
      return <Envases n={r.comprar} />
    case 'en_camino':
      return <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}><span className="spira-mono">{r.enCamino}</span> en camino</span>
    case 'alcanza':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-good)' }}><Icon name="check" size={14} stroke={2} /> Alcanza</span>
    case 'no_se_compra':
      return <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>No se compra</span>
    case 'sin_cargar':
      return (
        <>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>Sin cargar</span>
          {puedeEditar && (
            <button type="button" className="spira-card-link" style={botonChico} onClick={(ev) => { ev.stopPropagation(); onCargar() }}>
              <Icon name="pencil" size={13} color={accentSolid} /> Cargar
            </button>
          )}
        </>
      )
    case 'sin_cuenta':
      return null
  }
}

/** El renglón abierto: la boleta (R7), los avisos que no mueven el número y «Cambiar cómo se repone». */
function Cuenta({ r, puedeEditar, accentSolid, onCambiar }: { r: RenglonDelPeriodo; puedeEditar: boolean; accentSolid: string; onCambiar: () => void }) {
  return (
    <div style={{ paddingTop: 6 }}>
      {r.estado === 'sin_cargar' && <p style={nota}>Todavía no se cargó cómo se repone: no suma a la compra.</p>}
      {r.estado === 'no_se_compra' && <p style={nota}>Marcado como que no se compra: queda fuera de la cuenta.</p>}
      {r.boleta && <BoletaVista b={r.boleta} />}
      {r.avisos.length > 0 && (
        <div style={{ marginTop: 10, maxWidth: 560 }}>
          {r.avisos.map((a) => <AvisoLinea key={a.tipo + a.texto} tono={a.ambar ? 'warn' : 'info'} texto={`${a.texto}.`} />)}
        </div>
      )}
      {puedeEditar && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="spira-card-link" style={botonChico} onClick={onCambiar}>
            <Icon name="pencil" size={13} color={accentSolid} /> {r.estado === 'sin_cargar' ? 'Cargar cómo se repone' : 'Cambiar cómo se repone'}
          </button>
        </div>
      )}
    </div>
  )
}

/** La boleta (variante A del 16/09): arriba lo que hace falta, cada resta en su renglón, abajo «A comprar». */
function BoletaVista({ b }: { b: Boleta }) {
  const fila: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 20px 44px', alignItems: 'baseline', gap: 6 }
  return (
    <div style={{ maxWidth: 470 }}>
      {b.lineas.map((l) => (
        <div key={l.tipo} style={{ ...fila, padding: '6px 0' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--spira-ink)' }}>{l.titulo}</div>
            <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{l.aclaracion}</div>
          </div>
          <span className="spira-mono" style={{ fontSize: 14, color: 'var(--spira-ink-soft)', textAlign: 'right' }}>{l.signo}</span>
          <span className="spira-mono" style={{ fontSize: 14, color: 'var(--spira-ink)', textAlign: 'right' }}>{l.valor}</span>
        </div>
      ))}
      <div style={{ ...fila, padding: '9px 0 2px', marginTop: 4, borderTop: '1px solid var(--spira-line-2)' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>
          A comprar{b.aComprar === 0 && <span style={{ fontWeight: 400, color: 'var(--spira-acc-deep-good)' }}> · alcanza</span>}
        </span>
        <span className="spira-mono" style={{ fontSize: 15, color: 'var(--spira-ink-soft)', textAlign: 'right' }}>=</span>
        <span className="spira-mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--spira-ink)', textAlign: 'right' }}>{b.aComprar}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: La pantalla del estudio**

`src/views/pharma/reposicion/PantallaEstudio.tsx`:

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import {
  diaMes, pastillaDePedido, pedidosAMostrar, periodoAnterior, periodoSiguiente, resumenDelEstudio, subtituloDelPeriodo, textoPeriodo,
  ultimoPedidoPara,
} from '../../../data/pharma'
import type { EstudioReposicion, PedidoMedicacion, ReposicionDelPeriodo } from '../../../data/pharma'
import { card } from '../reportes/estilos'
import { ArmarPedido } from './ArmarPedido'
import { COLUMNAS, COLUMNAS_CERRADO, FilaMedicamento } from './FilaMedicamento'
import { HojaPedido, datosDeHoja, useImpresion } from './HojaPedido'
import { PedidoDetalle } from './PedidoDetalle'
import { AvisoLinea, Envases, Informacion, Pastilla, PuntoEstado, TituloSeccion, botonAccion, botonChico, plural, rotuloColumna } from './piezas'

const volver: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  display: 'grid', placeItems: 'center', flex: '0 0 auto', cursor: 'pointer', color: 'var(--spira-ink)',
}
const flecha: CSSProperties = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  display: 'grid', placeItems: 'center', color: 'var(--spira-ink)', padding: 0,
}
const grupoEncabezado: CSSProperties = { padding: '10px 16px 7px', fontSize: 11.5, fontWeight: 600, color: 'var(--spira-ink-soft)' }

/**
 * El estudio (mocks «2 · El estudio», «2b», «Un período anterior», «Quien sólo puede mirar», «Ventana
 * angosta»): encabezado con la acción del período, flechas entre períodos (R6), el resumen de lo que va al
 * pedido, el libro con su boleta y los pedidos del estudio. Toda decisión de qué decir está en
 * `reposicionTarjetaModel` (con tests); acá se dibuja.
 */
export function PantallaEstudio({ rep, e, diaCorte, puedeEditar, angosto, accent, accentSolid, onVolver, onPeriodo, onCambio }: {
  rep: ReposicionDelPeriodo
  e: EstudioReposicion
  diaCorte: number
  puedeEditar: boolean
  angosto: boolean
  accent: string
  accentSolid: string
  onVolver: () => void
  /** Mirar otro período: una fecha dentro de él, o '' para el en curso. */
  onPeriodo: (fecha: string) => void
  /** Algo cambió en la base (se emitió, anuló, cerró, reabrió o cargó): volver a pedir. */
  onCambio: () => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [armando, setArmando] = useState(false)
  const [viendo, setViendo] = useState<string | null>(null)
  const { hoja, imprimir } = useImpresion()

  const sub = subtituloDelPeriodo(rep, e)
  const resumen = resumenDelEstudio(e, rep)
  const pedidos = pedidosAMostrar(e, rep)
  const pedidoAbierto = e.pedidos.find((p) => p.id === viendo) ?? null
  const anterior = periodoAnterior(rep.periodo, diaCorte)
  const siguiente = periodoSiguiente(rep.periodo, diaCorte)
  const reimprimir = (p: PedidoMedicacion) => imprimir(datosDeHoja(p, e.estudio, rep.hoy))

  const alternar = (clave: string) => {
    setAbierto((a) => (a === clave ? null : clave))
    if (editando && editando !== clave) setEditando(null)
  }
  const editar = (clave: string) => { setAbierto(clave); setEditando(clave) }

  return (
    <div>
      {/* Encabezado: volver, el estudio y la acción del período (RD5: después de emitir, secundaria). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onVolver} aria-label="Volver a la grilla de estudios" style={volver}>
          <Icon name="arrowLeft" size={18} />
        </button>
        <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: accent }}>{e.estudio.code}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)' }}>{e.estudio.name}</span>
        <PuntoEstado status={e.estudio.status} />
        {rep.enCurso && puedeEditar && e.objetivo && (
          <button type="button" onClick={() => setArmando(true)} style={{ ...botonAccion(!e.pedidoDelObjetivo, accentSolid), marginLeft: 'auto' }}>
            <Icon name="cart" size={16} />{e.pedidoDelObjetivo ? 'Armar otro pedido' : 'Armar pedido'}
          </button>
        )}
      </div>

      {/* Las flechas entre períodos (R6): la › se apaga en el período en curso. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: angosto ? '0 0 14px' : '0 0 14px 50px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onPeriodo(anterior.desde)} aria-label={`Período anterior, del ${textoPeriodo(anterior)}`} style={{ ...flecha, cursor: 'pointer' }}>
          <Icon name="chevronLeft" size={15} />
        </button>
        <span className="spira-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', padding: '0 4px' }}>{textoPeriodo(rep.periodo)}</span>
        <button
          type="button" disabled={rep.enCurso}
          onClick={() => onPeriodo(rep.hoy <= siguiente.hasta ? '' : siguiente.desde)}
          aria-label={rep.enCurso ? 'No hay período siguiente: este es el período en curso' : `Período siguiente, del ${textoPeriodo(siguiente)}`}
          style={{ ...flecha, opacity: rep.enCurso ? 0.45 : 1, cursor: rep.enCurso ? 'default' : 'pointer' }}
        >
          <Icon name="chevronRight" size={15} />
        </button>
        <span style={{ fontSize: 12.5, marginLeft: 6, color: sub.aviso ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)', fontWeight: sub.aviso ? 600 : 400 }}>{sub.texto}</span>
      </div>

      {!rep.enCurso && (
        <Informacion icono="info">
          <span>Un período cerrado muestra lo que entró y salió. La compra se arma en el período en curso.</span>
          <button type="button" className="spira-card-link" style={botonChico} onClick={() => onPeriodo('')}>Ir al período en curso</button>
        </Informacion>
      )}
      {rep.enCurso && !puedeEditar && (
        <Informacion icono="eye">
          <span>Sólo lectura: podés ver la reposición y reimprimir pedidos. Arma los pedidos quien tiene permiso de Farmacia.</span>
        </Informacion>
      )}
      {e.tarde && e.objetivo && (
        <Informacion icono="info">
          <span>
            El corte fue el {diaMes(e.tarde.corte)}. Hasta el {diaMes(e.tarde.hasta)} el pedido es para el {textoPeriodo(e.objetivo)}; el siguiente se pide en el corte del {diaMes(e.objetivo.hasta)}.
          </span>
        </Informacion>
      )}

      {resumen && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: angosto ? 12 : 20, flexWrap: angosto ? 'wrap' : 'nowrap', padding: '16px 20px', margin: '0 0 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>{resumen.titulo}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
              {resumen.tipo === 'compra' ? (
                <>
                  <Envases n={resumen.envases} />
                  {resumen.sinCargar > 0 && (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>
                      + {plural(resumen.sinCargar, 'medicamento sin cargar', 'medicamentos sin cargar')}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="truck" size={18} color={accentSolid} />
                    <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 20, fontWeight: 800, color: 'var(--spira-ink)' }}>Pedido Nº {resumen.pedido.numero}</span>
                  </span>
                  <Pastilla p={resumen.pastilla} />
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', textAlign: angosto ? 'left' : 'right' }}>{resumen.detalle}</div>
          {resumen.tipo === 'pedido' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="spira-card-link" style={botonChico} onClick={() => reimprimir(resumen.pedido)}>
                <Icon name="printer" size={13} color={accentSolid} />Reimprimir
              </button>
              <button type="button" className="spira-card-link" style={botonChico} onClick={() => setViendo(resumen.pedido.id)}>
                <Icon name="eye" size={13} color={accentSolid} />Ver
              </button>
            </div>
          )}
        </div>
      )}

      {/* El libro. RD9: encabezado agrupado, había/entró/salió/hay son de ESTE período; «mínimo» y «comprar»,
          del que viene. */}
      <div style={{ ...card, overflow: 'hidden', ...(rep.enCurso ? {} : { maxWidth: 820 }) }}>
        {angosto ? (
          <div style={{ display: 'flex', padding: '10px 14px 8px', borderBottom: '1px solid var(--spira-line-2)', fontSize: 11.5, fontWeight: 600, color: 'var(--spira-ink-soft)' }}>
            <span style={{ flex: 1 }}>{rep.enCurso ? `Este período · ${textoPeriodo(rep.periodo)}` : `Período ${textoPeriodo(rep.periodo)}`}</span>
            {rep.enCurso && <span>{e.tarde ? 'Para este período' : 'Para el que viene'}</span>}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: rep.enCurso ? COLUMNAS : COLUMNAS_CERRADO, borderBottom: '1px solid var(--spira-line)' }}>
              <div />
              <div style={{ ...grupoEncabezado, gridColumn: 'span 4', textAlign: 'center' }}>
                {rep.enCurso ? `Este período · ${textoPeriodo(rep.periodo)}` : `Período ${textoPeriodo(rep.periodo)}`}
              </div>
              {rep.enCurso && (
                <>
                  <div style={{ ...grupoEncabezado, gridColumn: 'span 2', textAlign: 'center', borderLeft: '1px solid var(--spira-line)' }}>{e.tarde ? 'Para este período' : 'Para el que viene'}</div>
                  <div />
                </>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: rep.enCurso ? COLUMNAS : COLUMNAS_CERRADO, borderBottom: '1px solid var(--spira-line-2)' }}>
              <div style={rotuloColumna}>Medicamento</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>Había</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>Entró</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>Salió</div>
              <div style={{ ...rotuloColumna, textAlign: 'right' }}>{rep.enCurso ? 'Hay' : 'Quedó'}</div>
              {rep.enCurso && (
                <>
                  <div style={{ ...rotuloColumna, textAlign: 'right', borderLeft: '1px solid var(--spira-line)' }}>Mínimo</div>
                  <div style={{ ...rotuloColumna, textAlign: 'right' }}>Comprar</div>
                  <div />
                </>
              )}
            </div>
          </>
        )}
        {e.renglones.map((r, i) => (
          <FilaMedicamento
            key={r.clave} r={r} enCurso={rep.enCurso} ultimo={i === e.renglones.length - 1} angosto={angosto}
            puedeEditar={puedeEditar} accentSolid={accentSolid}
            abierto={abierto === r.clave} editando={editando === r.clave}
            onAlternar={() => alternar(r.clave)} onEditar={() => editar(r.clave)}
            onCerrarEdicion={() => setEditando(null)} onGuardado={() => { setEditando(null); onCambio() }}
          />
        ))}
        {e.renglones.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--spira-ink-soft)' }}>Este estudio no tiene medicación asignada.</div>
        )}
      </div>
      {rep.enCurso && e.sinMedicacionHabilitada > 0 && (
        <div style={{ marginTop: 10 }}>
          <AvisoLinea tono="warn" texto={`${plural(e.sinMedicacionHabilitada, 'paciente activo', 'pacientes activos')} sin medicación habilitada: no ${e.sinMedicacionHabilitada === 1 ? 'está' : 'están'} en la cuenta.`} />
        </div>
      )}

      {pedidos.length > 0 && (
        <div style={rep.enCurso ? undefined : { maxWidth: 820 }}>
          <TituloSeccion>Pedidos del estudio</TituloSeccion>
          <div style={{ ...card, overflow: 'hidden' }}>
            {pedidos.map((p, i) => (
              <FilaPedido key={p.id} p={p} ultimo={i === pedidos.length - 1} angosto={angosto} accentSolid={accentSolid}
                onVer={() => setViendo(p.id)} onReimprimir={() => reimprimir(p)} />
            ))}
          </div>
        </div>
      )}

      {armando && e.objetivo && (
        <ArmarPedido
          e={e} objetivo={e.objetivo} hoy={rep.hoy} ultimoVisto={ultimoPedidoPara(e.pedidos, e.objetivo)} accentSolid={accentSolid}
          onClose={(refrescar) => { setArmando(false); if (refrescar) onCambio() }}
          onEmitido={(d) => { setArmando(false); imprimir(d); onCambio() }}
        />
      )}
      {pedidoAbierto && (
        <PedidoDetalle
          p={pedidoAbierto} estudio={e.estudio} puedeEditar={puedeEditar} accentSolid={accentSolid}
          onClose={() => setViendo(null)} onCambio={onCambio} onReimprimir={() => reimprimir(pedidoAbierto)}
        />
      )}
      <HojaPedido d={hoja} />
    </div>
  )
}

/** Un pedido en la lista del estudio. «Reimprimir» sólo mientras algo sigue en juego; «Ver», siempre. */
function FilaPedido({ p, ultimo, angosto, accentSolid, onVer, onReimprimir }: {
  p: PedidoMedicacion
  ultimo: boolean
  angosto: boolean
  accentSolid: string
  onVer: () => void
  onReimprimir: () => void
}) {
  return (
    <div style={{
      ...(angosto ? { display: 'flex', flexWrap: 'wrap', rowGap: 6 } : { display: 'grid', gridTemplateColumns: '130px 150px minmax(0, 1fr) auto auto' }),
      alignItems: 'center', gap: 14, padding: '11px 16px', borderBottom: ultimo ? 'none' : '1px solid var(--spira-line)',
    }}>
      <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--spira-ink)' }}>Pedido Nº {p.numero}</span>
      <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>Emitido el <span className="spira-mono">{diaMes(p.emitido_el)}</span></span>
      <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
        Para el período <span className="spira-mono">{textoPeriodo({ desde: p.periodo_desde, hasta: p.periodo_hasta })}</span> · {plural(p.pedidoTotal, 'envase', 'envases')}
      </span>
      <Pastilla p={pastillaDePedido(p)} />
      <div style={{ display: 'flex', gap: 6 }}>
        {p.estado !== 'anulado' && p.faltanteTotal > 0 && (
          <button type="button" className="spira-card-link" style={botonChico} onClick={onReimprimir}>
            <Icon name="printer" size={13} color={accentSolid} />Reimprimir
          </button>
        )}
        <button type="button" className="spira-card-link" style={botonChico} onClick={onVer}>
          <Icon name="eye" size={13} color={accentSolid} />Ver
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Si el typecheck no acepta el `status` en `protocolStatusVar` (dentro de `PuntoEstado`, en `piezas.tsx`), es porque `ProtocolStatus` (`data/protocols`) y `EstadoEstudio` (`reposicionModel`) son dos uniones con los mismos tres valores. Si no calzan, castear ahí, en `PuntoEstado`, con `as ProtocolStatus` y un comentario que diga por qué.

- [ ] **Step 5: Commit**

```bash
git add src/views/pharma/reposicion/CargarReposicion.tsx src/views/pharma/reposicion/FilaMedicamento.tsx src/views/pharma/reposicion/PantallaEstudio.tsx
git commit -m "feat(reposicion): el estudio con su libro, la boleta y los pedidos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: El submódulo — grilla, día de corte y navegación

**Files:**
- Create: `src/views/pharma/reposicion/TarjetaDeEstudio.tsx`
- Create: `src/views/pharma/reposicion/DiaDeCorte.tsx`
- Create: `src/views/pharma/reposicion/ReposicionView.tsx`
- Modify: `src/modules/registry.ts`, `src/views/registryKeys.ts`, `src/views/registry.tsx`, `src/lib/router.ts`, `src/shell/AppShell.tsx`
- Test: `src/lib/router.test.ts`

**Interfaces:**
- Consumes:
  - Task 9: `PantallaEstudio`;
  - Task 8: piezas;
  - PR A: `tarjetaDe`, `TarjetaEstudio`, `franjaDelCorte`, `periodoAMirar`, `armarReposicionDelPeriodo`, `useDiaCorte`, `useReposicionDelPeriodo` (devuelve `{ desde, hasta, insumos }`), `guardarDiaCorte`, `esDiaDeCorteValido`, `periodoDe`, `periodoSiguiente`, `diaMes`.
- Produces: la vista `'pharma/reposicion'` y la URL `/farmacia/reposicion[/<código>][?periodo=AAAA-MM-DD]`.

- [ ] **Step 1: El test del router que falla**

En `src/lib/router.test.ts`, dentro del `describe` de `parseUrl` (al lado de los casos de `/farmacia/...`), agregar:

```ts
  it('Reposición lleva el código del estudio en el path (y sin él, la grilla)', () => {
    expect(parseUrl('/farmacia/reposicion', '')).toMatchObject({ moduleKey: 'pharma', subKey: 'reposicion', path: [] })
    expect(parseUrl('/farmacia/reposicion/222714', '?periodo=2026-08-10'))
      .toMatchObject({ moduleKey: 'pharma', subKey: 'reposicion', path: ['222714'], query: { periodo: '2026-08-10' } })
  })
```

Run: `npx vitest run src/lib/router.test.ts`
Expected: FAIL. `parseUrl` devuelve `null`: el submódulo no existe todavía, y un path detrás de él tampoco.

- [ ] **Step 2: Registrar el submódulo**

En `src/modules/registry.ts`, en los `submodules` de `pharma`, entre la línea de `dispensaciones` y el comentario de `reportes`:

```ts
      // R1 del spec de Reposición (2026-09-16): submódulo propio entre Dispensaciones y Estadísticas. Es
      // el paso que sigue en el recorrido de la medicación: lo que entra, lo que hay, lo que sale, lo que
      // hay que pedir. El descriptor tiene que medir ≤ 145px (ver `hint`): se mide en la Task 10.
      { key: 'reposicion', name: 'Reposición', icon: 'cart', hint: 'Pedidos de medicación' },
```

En `src/views/registryKeys.ts`, en `REGISTERED_VIEWS`, después de `'pharma/dispensaciones',`:

```ts
  'pharma/reposicion',
```

En `src/views/registry.tsx`, sumar el import debajo del de `DispensacionesView`:

```ts
import { ReposicionView } from './pharma/reposicion/ReposicionView'
```

y en `VIEW_REGISTRY`, después de `'pharma/dispensaciones': DispensacionesView,`:

```ts
  'pharma/reposicion': ReposicionView,
```

En `src/lib/router.ts`, cambiar `SUB_CON_PATH` y la primera oración de su comentario:

```ts
/* Submódulos que llevan segmentos propios después del submódulo: Pacientes (el protocolo y la ficha),
   Dispensaciones (el código del cajón), Medicamentos/Stock (el apartado: protocolo, ambulatoria,
   catálogo), Recepción (el wizard de recepción nueva) y Reposición (el estudio). Los cinco son LUGARES a los que la app ya
```

```ts
const SUB_CON_PATH = new Set(['protocolos', 'dispensaciones', 'medicamentos', 'recepcion', 'reposicion'])
```

En `src/shell/AppShell.tsx`, sumar `'pharma/reposicion'` al final de `HIDE_ACTION`: la vista trae su propia acción («Día de corte»):

```ts
const HIDE_ACTION = new Set(['inicio/resumen', 'track/resumen', 'track/tareas', 'track/protocolos', 'track/visitas', 'track/para-ver-medico', 'track/agenda', 'track/alertas', 'pharma/protocolos', 'pharma/recepcion', 'pharma/medicamentos', 'pharma/reportes', 'pharma/reposicion'])
```

- [ ] **Step 3: La tarjeta**

`src/views/pharma/reposicion/TarjetaDeEstudio.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { EstudioReposicion, TarjetaEstudio } from '../../../data/pharma'
import { Envases, Pastilla, PuntoEstado } from './piezas'

const caja: CSSProperties = {
  background: 'var(--spira-white)', borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
  display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', font: 'inherit', color: 'inherit',
}

/**
 * La tarjeta de un estudio en la grilla (R2): la de Pacientes (`ProtocolsView`) con la parte de abajo
 * cambiada. QUÉ dice lo decide `tarjetaDe` (con tests); acá se dibuja. Sin medicación de base no se entra
 * (RD16): es un `div`, no un botón, y no lleva la flecha.
 */
export function TarjetaDeEstudio({ e, t, accent, onAbrir }: {
  e: EstudioReposicion
  t: TarjetaEstudio
  accent: string
  onAbrir: () => void
}) {
  const contenido = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '-0.01em', color: accent }}>{e.estudio.code}</span>
        <PuntoEstado status={e.estudio.status} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.estudio.name}</div>
      <div style={{ height: 1, background: 'var(--spira-line)', margin: '5px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 30 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, flexWrap: 'wrap' }}><Principal t={t} accent={accent} /></div>
        {t.clicable && <Icon name="chevronRight" size={18} color="var(--spira-faint)" />}
      </div>
      {t.detalle.length > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: -4 }}>
          {t.detalle.map((d, i) => (
            <span key={d.texto}>
              {i > 0 && ' · '}
              <span style={d.aviso ? { color: 'var(--spira-acc-deep-warn)', fontWeight: 600 } : undefined}>{d.texto}</span>
            </span>
          ))}
        </div>
      )}
      {t.renglones.map((r) => (
        <div key={r.texto} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, color: r.mudo ? 'var(--spira-muted)' : 'var(--spira-ink)' }}>
          <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="truck" size={14} color={r.mudo ? 'var(--spira-faint)' : accent} /></span>
          <span style={{ minWidth: 0 }}>{r.texto}</span>
        </div>
      ))}
    </>
  )
  if (!t.clicable) return <div style={{ ...caja, border: '1px solid var(--spira-line)' }}>{contenido}</div>
  return (
    <button type="button" className="spira-card-link" onClick={onAbrir} style={caja} aria-label={`${e.estudio.code} ${e.estudio.name}: abrir la reposición del estudio`}>
      {contenido}
    </button>
  )
}

function Principal({ t, accent }: { t: TarjetaEstudio; accent: string }) {
  const p = t.principal
  switch (p.tipo) {
    case 'comprar':
      return (
        <>
          <Envases n={p.envases} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>para comprar</span>
        </>
      )
    case 'cubierto':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--spira-acc-deep-good)' }}><Icon name="check" size={16} stroke={2} />Cubierto</span>
    case 'falta_cargar':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}><Icon name="pencil" size={15} stroke={1.9} />Falta cargar cómo se repone</span>
    case 'sin_medicacion':
      return <span style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Sin medicación para reponer</span>
    case 'sin_cuenta':
      return <span style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Sin cuenta para este período</span>
    case 'pedido':
      return (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
            <Icon name="truck" size={16} color={accent} />Pedido Nº {p.numero}
          </span>
          <Pastilla p={p.pastilla} />
        </>
      )
  }
}
```

(El mock dice «11 envases para comprar» con «envases» en tinta. `Envases` pone la unidad en `muted` junto al
número, y «para comprar» sigue en tinta. Se acepta esa diferencia de tono para no duplicar el número grande.)

- [ ] **Step 4: El día de corte**

`src/views/pharma/reposicion/DiaDeCorte.tsx`:

```tsx
import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldLabelStyle } from '../../../components/FormField'
import { diaMes, esDiaDeCorteValido, guardarDiaCorte, periodoDe, periodoSiguiente } from '../../../data/pharma'
import { AvisoLinea, errorTexto } from './piezas'

const DIAS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

/**
 * El día de corte de toda Farmacia (R4, RD15): desplegable del 1 al 31, nunca texto libre. Si se cambia con
 * uno ya cargado, avisa cómo queda el período en curso; los pedidos ya emitidos conservan el suyo.
 */
export function DiaDeCorte({ actual, hoy, accentSolid, onClose, onGuardado }: {
  actual: number | null
  hoy: string
  accentSolid: string
  onClose: () => void
  onGuardado: () => void
}) {
  const [dia, setDia] = useState(actual == null ? '' : String(actual))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(dia)
  const valido = dia !== '' && esDiaDeCorteValido(n)
  const cambia = valido && n !== actual
  const nuevo = valido ? periodoDe(hoy, n) : null
  const cortes = nuevo
    ? [nuevo, periodoSiguiente(nuevo, n), periodoSiguiente(periodoSiguiente(nuevo, n), n)].map((p) => diaMes(p.hasta))
    : []

  async function guardar() {
    if (!cambia || guardando) return
    setGuardando(true); setError(null)
    const r = await guardarDiaCorte(n)
    setGuardando(false)
    if (r.error) { setError(r.error); return }
    onGuardado()
  }

  return (
    <Modal title="Día de corte" onClose={guardando ? () => {} : onClose} maxWidth={428}>
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.45, margin: '-8px 0 14px' }}>
        El día del mes en que cierra cada período. Vale para todos los estudios.
      </p>
      <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Día del mes</div>
      <div style={{ width: 120 }}>
        <SearchableSelect value={dia} onChange={setDia} options={DIAS} placeholder="Elegí" searchable="never" entity="día" />
      </div>
      {cambia && actual != null && nuevo && (
        <div style={{ marginTop: 12 }}>
          <AvisoLinea tono="warn" texto={`Si lo cambiás ahora, el período en curso pasa a ser del ${diaMes(nuevo.desde)} al ${diaMes(nuevo.hasta)}. Los pedidos ya emitidos conservan su período.`} />
        </div>
      )}
      {cortes.length > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '6px 0 0', lineHeight: 1.5 }}>
          Próximos cortes: <span className="spira-mono">{cortes.join(' · ')}</span>. Si un mes no tiene ese día, corta el último.
        </p>
      )}
      {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} disabled={guardando} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => void guardar()} disabled={!cambia || guardando} style={{ ...btnPrimary(accentSolid), opacity: !cambia || guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 5: La vista del submódulo**

`src/views/pharma/reposicion/ReposicionView.tsx`:

```tsx
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
```

- [ ] **Step 6: Tests y typecheck**

Run: `npx vitest run src/lib/router.test.ts src/views/resumen/destinos.test.ts`
Expected: PASS. El test nuevo y el de destinos, que exige vista para cada submódulo registrado.

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Verificar en el preview**

El preview arranca en la copia compartida (memoria `gotcha-preview-arranca-en-la-copia-compartida`). Hay que servir el worktree:

```bash
cd "C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2"
npm run dev -- --port 5251 --strictPort
```

(en background y **sin pipe**). Después `preview_start { url: 'http://localhost:5251' }`.

**El Director se loguea a mano una vez** en ese preview: es otro origen que el del 5250. El agente no ingresa contraseñas.

Con la sesión abierta, verificar **de lectura**:

1. `fetch('/src/views/pharma/reposicion/ReposicionView.tsx')` trae el archivo: el server es el del worktree.
2. En el menú de Farmacia, «Reposición» aparece entre Dispensaciones y Estadísticas. Medir el descriptor con la receta de `modules/registry.ts` (`hint`): **≤ 145px**. Si se pasa, acortarlo («Pedidos de medicación» es la opción del spec) y avisarle al Director.
3. `/farmacia/reposicion`:
   - si falta el día de corte, la caja «Falta el día de corte». **No guardar un día en prod sin preguntarle al Director**: es configuración real;
   - con el día cargado, la franja y una tarjeta por estudio no cerrado, con los textos que corresponden;
   - Victorion sin flecha y sin ser un botón.
4. Entrar a un estudio:
   - la miga con el código;
   - las flechas: ‹ va al período anterior, que muestra «Período cerrado» y la tabla sin «Comprar»; «Ir al período en curso» vuelve;
   - la boleta se abre con la flecha del renglón (`aria-expanded` cambia);
   - «Armar pedido» abre el modal con lo calculado. **Cancelar, no emitir.**
5. Consola sin errores nuevos. El buffer sobrevive a los reloads: interceptá `console.error` si hace falta distinguir.
6. `resize_window` a 900×800: la tabla del estudio pasa a dos renglones y la grilla a dos columnas. Volver con el preset `desktop`.

Evidencia: `read_page` / `get_page_text` de la grilla y del estudio. `preview_screenshot` suele colgarse; no insistir.

- [ ] **Step 8: Commit**

```bash
git add src/views/pharma/reposicion/TarjetaDeEstudio.tsx src/views/pharma/reposicion/DiaDeCorte.tsx src/views/pharma/reposicion/ReposicionView.tsx src/modules/registry.ts src/views/registryKeys.ts src/views/registry.tsx src/lib/router.ts src/lib/router.test.ts src/shell/AppShell.tsx
git commit -m "feat(reposicion): el submódulo Reposición con su grilla y el día de corte (R1, R2, RD7, RD15)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Recepción — «Recibir un pedido»

**Files:**
- Create: `src/views/pharma/recepcion/RecibirPedido.tsx`
- Create: `src/views/pharma/wizard/PedidoEnRecepcion.tsx`
- Modify: `src/views/pharma/RecepcionView.tsx`, `src/views/pharma/ReceptionWizard.tsx`, `src/views/pharma/wizard/Step1Scan.tsx`, `src/views/pharma/recepcion/ReceptionCard.tsx`, `src/data/pharma/receptions.ts`

**Interfaces:**
- Consumes:
  - PR A: `usePedidosPorRecibir`, `armarPorRecibir`, `PedidoPorRecibir`, `pastillaDePedido`, `textoParaRecibir`, `textoDeRecepciones`, `renglonesParaRecibir`, `metaDelPedido`, `comparacionConElPedido`, `encabezadoDeLoEsperado`, `PedidoMedicacion`;
  - Task 8: `Pastilla`, `AvisoLinea`, `errorTexto`, `minuscula`, `versalita`; `card` de `../reportes/estilos`;
  - PR A (revisión de ingeniería, 8 y 9): `porRecibir`, `porRecibirDe`, `PedidoPorRecibir.otrosDelEstudio`;
  - `createReception` con `pedido_id` (Parte 1).
- Produces:
  - `RecibirPedido({ accentSolid, onClose, onRecibir: (x: PedidoPorRecibir) => void })`
  - `BannerPedido({ pedido, paso, accentSolid })`, `ComparacionConPedido({ pedido, otros, meds })`
  - `ReceptionWizard` suma `pedido?: PedidoPorRecibir`
  - `Step1Scan` suma `meta?: (medicationId: string) => { texto: string; aviso: boolean }`
  - `ReceptionRow` suma `pedido?: { numero: number } | null`

- [ ] **Step 1: La recepción sabe su pedido**

En `src/data/pharma/receptions.ts`, en `ReceptionRow`, debajo de `protocol: { code: string } | null`:

```ts
  /** El pedido de medicación que se recibió (0128, R10); null si llegó sin pedido. Opcional porque las
   *  filas armadas a mano en los tests no lo traen. */
  pedido?: { numero: number } | null
```

Y en `RECEPTION_COLS`, reemplazar la línea `'total_kits, storage_location, protocol:protocols(code), ' +` por:

```ts
  'total_kits, storage_location, protocol:protocols(code), ' +
  // El pedido que se recibió (0128): «Pedido Nº 14» en la tarjeta. medication_receptions tiene UNA sola FK
  // a pedidos_medicacion, así que el embed no es ambiguo (gotcha-fk-nueva-rompe-embed-postgrest).
  'pedido:pedidos_medicacion(numero), ' +
```

En `src/views/pharma/recepcion/ReceptionCard.tsx`, debajo del número de la recepción, reemplazar:

```tsx
          <span style={valorFolio} className="spira-mono">Nº {r.folio}</span>
        </div>
```

por:

```tsx
          <span style={valorFolio} className="spira-mono">Nº {r.folio}</span>
          {r.pedido && <span style={pedidoDeLaRecepcion} className="spira-mono">Pedido Nº {r.pedido.numero}</span>}
        </div>
```

y agregar, debajo de `const valorFolio`:

```ts
/* R10: la recepción que respondió a un pedido lo dice debajo de su número, con su nombre (RD12). */
const pedidoDeLaRecepcion: CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--spira-ink-soft)', marginTop: 2,
}
```

- [ ] **Step 2: La lista de «Recibir un pedido»**

`src/views/pharma/recepcion/RecibirPedido.tsx`:

```tsx
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { btnOutline } from '../../../components/buttons'
import { armarPorRecibir, pastillaDePedido, porRecibirDe, textoDeRecepciones, textoParaRecibir, usePedidosPorRecibir } from '../../../data/pharma'
import type { PedidoPorRecibir } from '../../../data/pharma'
import { AvisoLinea, Pastilla, errorTexto, minuscula } from '../reposicion/piezas'

/**
 * «Recibir un pedido» (R10, mocks «6b» y «Recibir sin pedidos»): los pedidos con algo por recibir, del más
 * viejo al más nuevo. Se busca el número que viene en la hoja (el código de barras quedó en TODOS.md). Un
 * pedido con una recepción sin verificar lo avisa, para no recibirlo dos veces (RD17), y si esa recepción
 * ya trae todo lo que faltaba no ofrece «Recibir»: se verifica, no se vuelve a cargar (revisión de
 * ingeniería, 8). «Recibir» va con
 * borde, no sólido (RD16): en esta lista cada renglón es una opción, no la acción principal.
 */
export function RecibirPedido({ accentSolid, onClose, onRecibir }: {
  accentSolid: string
  onClose: () => void
  onRecibir: (x: PedidoPorRecibir) => void
}) {
  const q = usePedidosPorRecibir()
  const lista = q.data ? armarPorRecibir(q.data) : null
  const vacia = lista !== null && lista.length === 0

  return (
    <Modal title="Recibir un pedido" onClose={onClose} maxWidth={vacia ? 520 : 620}>
      {q.error ? (
        <>
          <p role="alert" style={errorTexto}>{q.error}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={q.refetch} style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="rotateCcw" size={15} />Reintentar
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
          </div>
        </>
      ) : !lista ? (
        <p style={{ fontSize: 13.5, color: 'var(--spira-muted)', margin: 0 }}>Buscando los pedidos…</p>
      ) : vacia ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0 4px' }}>
            <span style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(15, 95, 87, 0.08)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              <Icon name="truck" size={22} stroke={1.9} color={accentSolid} />
            </span>
            <div>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-ink)' }}>No hay pedidos por recibir</div>
              <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.45 }}>
                Los pedidos se arman desde Reposición. Si llegó medicación sin pedido, cargala con «Nueva recepción».
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 18 }}>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--spira-muted)', margin: '-8px 0 6px', lineHeight: 1.45 }}>
            Los pedidos con algo por recibir, del más viejo al más nuevo. Buscá el número que figura en la hoja.
          </p>
          {lista.map((x, i) => {
            const folios = x.pedido.recepciones.filter((r) => r.status === 'pendiente').map((r) => r.folio)
            const cuales = folios.length === 0 ? 'una recepción' : `${folios.length === 1 ? 'la' : 'las'} ${minuscula(textoDeRecepciones(folios))}`
            const llegoTodo = porRecibirDe(x.pedido) === 0
            return (
              <div key={x.pedido.id} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) auto', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: i === lista.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
                <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--spira-ink)' }}>Pedido Nº {x.pedido.numero}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="spira-mono" style={{ fontSize: 14, fontWeight: 700, color: accentSolid }}>{x.estudio.code}</span>
                    <span style={{ fontSize: 13.5, color: 'var(--spira-ink)' }}>{x.estudio.name}</span>
                    <Pastilla p={pastillaDePedido(x.pedido)} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 3 }}>{textoParaRecibir(x.pedido)}</div>
                  {x.pedido.conRecepcionSinVerificar && (
                    <div style={{ marginTop: 4 }}>
                      <AvisoLinea tono="warn" texto={llegoTodo
                        ? `Lo que faltaba está en ${cuales} sin verificar: se verifica desde la lista de Recepción.`
                        : `Ya tiene ${cuales} sin verificar: se precarga sólo lo que no está ahí.`} />
                    </div>
                  )}
                </div>
                {llegoTodo ? <span /> : (
                  <button type="button" onClick={() => onRecibir(x)} style={{ ...btnOutline, height: 36, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="truck" size={15} />Recibir
                  </button>
                )}
              </div>
            )
          })}
        </>
      )}
    </Modal>
  )
}
```

- [ ] **Step 3: El banner y la comparación del asistente**

`src/views/pharma/wizard/PedidoEnRecepcion.tsx`:

```tsx
import { Icon } from '../../../components/Icon'
import { comparacionConElPedido, encabezadoDeLoEsperado, porRecibir } from '../../../data/pharma'
import type { PedidoMedicacion, PedidoPorRecibir } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'
import { card } from '../reportes/estilos'
import { versalita } from '../reposicion/piezas'

const COLUMNAS = 'minmax(0, 1fr) 80px 80px minmax(0, 1.1fr)'

/** «Recibiendo el pedido Nº 14 · 222714 ENDURA», arriba del Escaneo y del Resumen (mocks «7» y «7b»). */
export function BannerPedido({ pedido, paso, accentSolid }: { pedido: PedidoPorRecibir; paso: number; accentSolid: string }) {
  const meds = pedido.pedido.renglones.filter((r) => porRecibir(r) > 0).length
  const texto = paso === 1
    ? `Vienen puestos ${meds === 1 ? 'el medicamento' : `los ${meds} medicamentos`} con lo que falta. Si llegó menos, bajá la cantidad: lo que falta queda en el pedido.`
    : 'Lo pedido contra lo que llega. Lo que falta queda en camino en el pedido.'
  return (
    <div style={{ ...card, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(15, 95, 87, 0.08)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Icon name="truck" size={17} color={accentSolid} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
          Recibiendo el pedido Nº {pedido.pedido.numero} · <span className="spira-mono" style={{ color: accentSolid }}>{pedido.estudio.code}</span> {pedido.estudio.name}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{texto}</div>
      </div>
    </div>
  )
}

/**
 * El resumen del asistente contra el pedido (RD18): lo que faltaba de cada renglón, lo que llega y qué queda.
 * Lo que llega y no estaba en el pedido se recibe igual y no cuenta para ningún renglón (R10). Si lo espera
 * otro pedido abierto del estudio, lo nombra (revisión de ingeniería, 9).
 */
export function ComparacionConPedido({ pedido, otros, meds }: {
  pedido: PedidoMedicacion
  /** Los otros pedidos abiertos del estudio (`PedidoPorRecibir.otrosDelEstudio`). */
  otros: readonly PedidoMedicacion[]
  meds: CountedMed[]
}) {
  const filas = comparacionConElPedido(pedido, meds.map((m) => ({ medicationId: m.medicationId, name: m.name, quantity: m.quantity })), otros)
  return (
    <div style={{ ...card, maxWidth: 780, width: '100%', margin: '0 auto', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 10, padding: '10px 18px 8px', borderBottom: '1px solid var(--spira-line-2)' }}>
        <div style={versalita}>Medicamento</div>
        <div style={{ ...versalita, textAlign: 'right' }}>{encabezadoDeLoEsperado(pedido)}</div>
        <div style={{ ...versalita, textAlign: 'right' }}>Llega</div>
        <div />
      </div>
      {filas.map((f, i) => (
        <div key={f.medicationId} style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 10, alignItems: 'center', padding: '11px 18px', borderBottom: i === filas.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
          <span style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{f.nombre}</span>
          <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{f.esperado ?? '—'}</span>
          <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{f.llega}</span>
          <span style={{ fontSize: 12.5, color: f.aviso ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)', fontWeight: f.aviso ? 600 : 400 }}>{f.nota}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: El escaneo dice qué se pidió**

En `src/views/pharma/wizard/Step1Scan.tsx`:

En `interface Props`, debajo de `onCodesChanged: () => void`:

```ts
  /** Recibiendo un pedido (R10): qué se pidió de cada medicamento, o que no estaba en el pedido. */
  meta?: (medicationId: string) => { texto: string; aviso: boolean }
```

En la firma, sumar `meta`:

```ts
export function Step1Scan({ accentSolid, meds, setMeds, codeByMed, onCodesChanged, meta }: Props) {
```

Justo antes de la línea `{/* Stepper −/+ agrupado (handoff 2a); 44px de alto = hit target de la nota del handoff */}`:

```tsx
                {meta && <MetaDelRenglon {...meta(m.medicationId)} />}
```

Y al final del archivo:

```tsx
/** «se pidieron 7» · «No estaba en el pedido» (mock «7 · El asistente arranca con el pedido»). */
function MetaDelRenglon({ texto, aviso }: { texto: string; aviso: boolean }) {
  return (
    <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: aviso ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)', fontWeight: aviso ? 600 : 400 }}>
      {texto}
    </span>
  )
}
```

- [ ] **Step 5: El asistente arranca con el pedido**

En `src/views/pharma/ReceptionWizard.tsx`:

Imports: sumar `metaDelPedido` al import de `../../data/pharma`, el tipo y los dos componentes:

```ts
import { createReception, createIpReception, metaDelPedido, useMedicationCodes } from '../../data/pharma'
import type { PedidoPorRecibir, ReceptionKind, StorageLocation } from '../../data/pharma'
```

```ts
import { BannerPedido, ComparacionConPedido } from './wizard/PedidoEnRecepcion'
```

En `interface Props`, debajo de `initialMeds?: CountedMed[]`:

```ts
  /** «Recibir un pedido» (R10): el pedido que se está recibiendo. Con él, el estudio y el tipo vienen del
   *  pedido, el asistente arranca en el Escaneo con lo que falta y la recepción queda atada al pedido. */
  pedido?: PedidoPorRecibir
```

En la firma, sumar `pedido`:

```ts
export function ReceptionWizard({ accentSolid, initialTipo, initialProtocolId, initialMeds, pedido, onClose, onCreated }: Props) {
```

Reemplazar las dos primeras líneas del cuerpo:

```ts
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
```

por:

```ts
  /* Con un pedido, el estudio y el tipo vienen de él: el asistente arranca en el Escaneo y no deja volver
     al paso «Tipo». Cambiar el estudio rompería el vínculo con el pedido, que el trigger de la 0128
     rechazaría igual al guardar. */
  const primerPaso = pedido ? 1 : 0
  const [step, setStep] = useState(primerPaso)
  const [maxReached, setMaxReached] = useState(primerPaso)
```

En `goto`, como primera línea del cuerpo:

```ts
    if (i < primerPaso) return
```

Reemplazar `back`:

```ts
  const back = () => { if (step === 3) setSubmitError(null); setStep((s) => Math.max(primerPaso, s - 1)) }
```

En `submitReception`, rama base, sumar el pedido a `createReception`:

```ts
    const res = await createReception({
      tipo,
      protocol_id: tipo === 'ambulatoria' ? null : protocolId,
      reception_date: receptionDate,
      notes: notes.trim() || null,
      items,
      pedido_id: pedido?.pedido.id ?? null,
    })
```

Antes de `{/* Renderizado del paso actual */}`:

```tsx
      {pedido && (step === 1 || step === 3) && <BannerPedido pedido={pedido} paso={step} accentSolid={accentSolid} />}
      {pedido && step === 3 && !isIp && <ComparacionConPedido pedido={pedido.pedido} otros={pedido.otrosDelEstudio} meds={meds} />}
```

En el `Step1Scan` de la rama base, sumar `meta`:

```tsx
        : <Step1Scan accentSolid={accentSolid} meds={meds} setMeds={setMeds} codeByMed={codeByMed} onCodesChanged={codes.refetch}
            meta={pedido ? (id) => metaDelPedido(pedido.pedido, id, pedido.otrosDelEstudio) : undefined} />)}
```

Y el botón «Atrás» aparece desde el primer paso **posible**:

```tsx
        {step > primerPaso && (
```

(reemplaza a `{step > 0 && (`).

- [ ] **Step 6: El botón en Recepción**

En `src/views/pharma/RecepcionView.tsx`:

Imports: sumar `renglonesParaRecibir` al import de `../../data/pharma`, y:

```ts
import type { PedidoPorRecibir } from '../../data/pharma'
import { RecibirPedido } from './recepcion/RecibirPedido'
```

En `PlantillaRecepcion`, debajo de `meds: CountedMed[]`:

```ts
  /** «Recibir un pedido»: el pedido que se recibe (R10). Sin él, es «Repetir recepción». */
  pedido?: PedidoPorRecibir
```

Debajo de `const cerrarWizard = …`:

```ts
  /** La lista de «Recibir un pedido». Memoizada: viaja en las deps del efecto del encabezado. */
  const [eligiendoPedido, setEligiendoPedido] = useState(false)
  const abrirRecibir = useCallback(() => setEligiendoPedido(true), [])
```

En el efecto del encabezado, cambiar el `setHeader` de la lista y las deps:

```ts
      setHeader(canManage
        ? {
            actions: [
              { key: 'recibir', label: 'Recibir un pedido', icon: 'truck', onClick: abrirRecibir },
              { key: 'nueva', label: 'Nueva recepción', icon: 'plus', primary: true, onClick: abrirWizard },
            ],
          }
        : null)
```

```ts
  }, [setHeader, creating, canManage, abrirWizard, abrirRecibir])
```

Debajo de `repetirRecepcion`:

```ts
  /**
   * «Recibir un pedido» (R10): abre el asistente con el estudio del pedido y lo que falta de cada renglón.
   * Igual que «Repetir recepción», no escribe nada: la recepción existe recién al confirmar el asistente.
   */
  const recibirPedido = (x: PedidoPorRecibir) => {
    setPlantilla({
      tipo: 'protocolo',
      protocolId: x.pedido.protocol_id,
      meds: renglonesParaRecibir(x.pedido).map((r) => ({ medicationId: r.medicationId, name: r.nombre, quantity: r.cantidad, lots: [] })),
      pedido: x,
    })
    setEligiendoPedido(false)
    abrirWizard()
  }
```

En el `ReceptionWizard`, debajo de `initialMeds={plantilla?.meds}`:

```tsx
        pedido={plantilla?.pedido}
```

Y junto a los otros modales (antes de `{confirmando && (`):

```tsx
      {eligiendoPedido && (
        <RecibirPedido accentSolid={accentSolid} onClose={() => setEligiendoPedido(false)} onRecibir={recibirPedido} />
      )}
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run src/views/pharma src/data/pharma`
Expected: PASS. `ReceptionRow.pedido` es opcional, así que las filas armadas a mano en `recepcion/derivados.test.ts` compilan igual.

En el preview del worktree (ver Task 10, Step 7), como `leader`, **de lectura**:

1. En Recepción se ven «Recibir un pedido» (con borde) y «Nueva recepción» (sólido).
2. «Recibir un pedido» abre la lista, o «No hay pedidos por recibir» si no hay. Cerrar.
3. Si hay un pedido: «Recibir» abre el asistente en el Escaneo, con el banner y lo que falta cargado. **Cancelar y descartar, no crear la recepción.**
4. Las recepciones de siempre se ven igual. Una con pedido, si existe, dice «Pedido Nº N» bajo su número.

- [ ] **Step 8: Commit**

```bash
git add src/views/pharma/recepcion/RecibirPedido.tsx src/views/pharma/wizard/PedidoEnRecepcion.tsx src/views/pharma/RecepcionView.tsx src/views/pharma/ReceptionWizard.tsx src/views/pharma/wizard/Step1Scan.tsx src/views/pharma/recepcion/ReceptionCard.tsx src/data/pharma/receptions.ts
git commit -m "feat(recepcion): «Recibir un pedido» con el asistente precargado (R10, RD17, RD18)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Sale la card de Estadísticas y el modelo viejo

**Files:**
- Modify: `src/views/pharma/reportes/ReportesView.tsx`, `src/views/pharma/reportes/estilos.ts`
- Delete: `src/views/pharma/reportes/ComprasDelMes.tsx`, `src/views/pharma/reportes/VerPedido.tsx`
- Modify (reescritura entera): `src/data/pharma/reposicion.ts`, `src/data/pharma/reposicionModel.ts`, `src/data/pharma/reposicionModel.test.ts`
- Modify: `src/data/pharma/reposicionPeriodoModel.ts` (el tipo de `PacientePeriodoInsumo`)
- Modify: `docs/plan-reposicion-stock-minimo.md`, `TODOS.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - Estadísticas vuelve a ser sólo los números del período (R12).
  - Nada en `src/` nombra `insumos_de_reposicion`, `registrar_pedido_reposicion`, `anular_pedido_reposicion` ni `demora_compra_dias`. Es la condición para la `0136`.
  - `estanteAlComienzo(lotes, pendiente, hoy, periodo: { desde: string; hasta: string })`.

- [ ] **Step 1: Estadísticas sin la card**

En `src/views/pharma/reportes/ReportesView.tsx`:

1. Borrar la línea `import { ComprasDelMes } from './ComprasDelMes'`.
2. Borrar el bloque (comentario y constante):

```tsx
  /* La card de compras va ARRIBA de todo y FUERA de los cortes de abajo (plan de reposición, D28):
     tiene su propia carga y su propio error, no la mueve el período ni el filtro de estudio (D37), y
     sigue visible con la ventana angosta (D48). Por eso se arma una vez y entra en cada retorno. */
  const compras = <ComprasDelMes accentSolid={module.accentSolid} angosto={angosto} />

```

3. Borrar las cuatro líneas `{compras}`: tres con ocho espacios de sangría y una con seis.
4. En el texto del recorte, reemplazar:

```
        El recorte vale para todo el informe de abajo (las compras de arriba no dependen de él): cada reporte que imprimas sale con ese mismo período
```

por:

```
        El recorte vale para todo el informe: cada reporte que imprimas sale con ese mismo período
```

En `src/views/pharma/reportes/estilos.ts`, dos comentarios que nombraban la card:
- en `chip`, reemplazar `Estaban en ReportesView; se movieron acá cuando la card de compras los necesitó (plan de reposición, T9).` por `Estaban en ReportesView; hoy los usa también «Cargar cómo se repone» de Reposición.`;
- en `avisoCaja`, reemplazar `(informe cortado, «ya es tarde»)` por `(informe cortado)`.

Borrar los dos archivos de la card:

```bash
git rm src/views/pharma/reportes/ComprasDelMes.tsx src/views/pharma/reportes/VerPedido.tsx
```

- [ ] **Step 2: La capa de datos sin lo de la card**

`src/data/pharma/reposicion.ts`, entero:

```ts
import { supabase } from '../../lib/supabase'
import { useSupabaseQuery } from '../../lib/useSupabaseQuery'
import type { ModoReposicion } from './reposicionModel'
import type { Periodo } from './periodoDeCorte'
import type { InsumosPorRecibir, MotivoAnulacion, MotivoCierre } from './pedidosMedicacionModel'
import type { InsumosDelPeriodo } from './reposicionPeriodoModel'
import { pharmaErrorMessage } from './errors'

/**
 * Reposición de Farmacia (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md): la lectura del
 * período, el día de corte, los pedidos de medicación y cómo se repone cada medicamento. La cuenta NO vive
 * acá: la hacen los modelos puros (reposicionPeriodoModel, reposicionTarjetaModel) con los datos crudos
 * que traen estas lecturas (D11).
 *
 * La card «Compras para …» de Estadísticas (0125) se fue el 2026-09-18 con su lectura, la demora de compra
 * y «Ya lo pedí». Lo que la base todavía tenga de ella lo borra la 0136, DESPUÉS del deploy de este front.
 */

type Resultado = { error: string | null; code?: string }

// ═══════════════════════════ Cómo se repone (0125) ═══════════════════════════

/**
 * Cómo se repone un medicamento del estudio (D2-D4, D25). Por función porque la tabla exige leader
 * para escribir y esto es de Farmacia operator (D12). `null` en el modo lo vuelve a «sin cargar».
 */
export async function configurarReposicion(input: {
  protocolMedicationId: string
  modo: ModoReposicion | null
  envasesPorMes: number | null
  stockFijo: number | null
}): Promise<Resultado> {
  const { error } = await supabase.rpc('configurar_reposicion', {
    p_protocol_medication_id: input.protocolMedicationId,
    p_modo: input.modo,
    p_envases_por_mes: input.modo === 'mensual' ? input.envasesPorMes : null,
    p_stock_fijo: input.modo === 'a_demanda' ? input.stockFijo : null,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * La excepción del paciente a la cantidad mensual del estudio (D2). Update directo de operator
 * (policy 0050:151). NO se ofrece en asignaciones con `habilitacion_id` (D27): el trigger de la 0124
 * limpiaría la marca de «una entrega».
 */
export async function guardarEnvasesDelPaciente(patientMedicationId: string, envasesPorMes: number | null): Promise<Resultado> {
  const { data, error } = await supabase
    .from('patient_medications')
    .update({ envases_por_mes: envasesPorMes })
    .eq('id', patientMedicationId)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para modificar esta medicación.' }
  return { error: null }
}

/** Cómo se repone cada medicamento del estudio (0125), para la línea de «Editar medicación». */
export interface ReposicionDelEstudioRow {
  medication_id: string
  reposicion_modo: 'mensual' | 'a_demanda' | 'no_se_compra' | null
  envases_por_mes: number | null
}

/** Lo lee Farmacia y gerencia (RLS de protocol_medications, 0032); el modal de edición es de Farmacia. */
export function useReposicionDelEstudio(protocolId: string) {
  return useSupabaseQuery<ReposicionDelEstudioRow[]>(
    (c) =>
      c
        .from('protocol_medications')
        .select('medication_id, reposicion_modo, envases_por_mes')
        .eq('protocol_id', protocolId)
        .returns<ReposicionDelEstudioRow[]>(),
    [protocolId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

// ═══════════════════════════ De corte a corte (0128, 0133) ═══════════════════════════

/**
 * El día de corte de Farmacia (R4). Envuelto en un objeto porque `null` es un valor con significado
 * («sin cargar»: la pantalla lo pide) y no tiene que confundirse con «todavía no llegó».
 */
export function useDiaCorte() {
  return useSupabaseQuery<{ diaCorte: number | null }>(
    async (c) => {
      const { data, error } = await c.from('farmacia_ajustes').select('dia_corte').eq('unica', true).maybeSingle()
      if (error) return { data: null, error }
      return { data: { diaCorte: (data as { dia_corte: number | null } | null)?.dia_corte ?? null }, error: null }
    },
    [],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/** Lo leído de un período, CON el período: ver `useReposicionDelPeriodo`. */
export interface ReposicionLeida {
  desde: string
  hasta: string
  insumos: InsumosDelPeriodo
}

/**
 * Los datos crudos de un período (`reposicion_del_periodo`, 0128 + 0133). La cuenta la hace
 * `armarReposicionDelPeriodo` (D11). Sin período todavía (falta el día de corte) no pide nada.
 * `protocolId` null = todos los estudios no cerrados.
 *
 * Devuelve el período junto con los datos porque `useSupabaseQuery` deja visibles los datos viejos
 * mientras llegan los nuevos: al pasar de un período a otro con las flechas, la pantalla tiene que poder
 * saber de qué período es lo que tiene antes de rotularlo, o mostraría el libro de julio con el título
 * de agosto.
 */
export function useReposicionDelPeriodo(periodo: Periodo | null, protocolId: string | null = null) {
  return useSupabaseQuery<ReposicionLeida | null>(
    async (c) => {
      if (!periodo) return { data: null, error: null }
      const { data, error } = await c.rpc('reposicion_del_periodo', {
        p_desde: periodo.desde,
        p_hasta: periodo.hasta,
        p_protocol_id: protocolId,
      })
      if (error) return { data: null, error }
      return { data: { desde: periodo.desde, hasta: periodo.hasta, insumos: data as InsumosDelPeriodo }, error: null }
    },
    // Los bordes y no el objeto: un período recalculado en cada render cambia de identidad.
    [periodo?.desde, periodo?.hasta, protocolId],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}

/** El día de corte (R4). Update directo: 0 filas = sin permiso (RLS). */
export async function guardarDiaCorte(dia: number): Promise<Resultado> {
  const { data, error } = await supabase
    .from('farmacia_ajustes')
    .update({ dia_corte: dia })
    .eq('unica', true)
    .select('id')
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  if (!data || data.length === 0) return { error: 'No tenés permiso para cambiar el día de corte.' }
  return { error: null }
}

/**
 * «Emitir e imprimir» (R8): cabecera y renglones en una llamada atómica. Devuelve el número para la hoja.
 * `intento` es un uuid por cada vez que se abre «Armar pedido» (0133): si la red se corta después de
 * guardar y se reintenta, la base devuelve el pedido que ya quedó en vez de emitir otro.
 */
export async function emitirPedidoMedicacion(input: {
  protocolId: string
  /** El período PARA el que se pide. */
  periodo: Periodo
  /** Hoy en hora AR. */
  emitidoEl: string
  renglones: { medication_id: string; calculado: number | null; pedido: number }[]
  intento: string
  /** El último pedido de ese período que mostraba la pantalla, 0 si ninguno (0133, revisión de ingeniería, 7). */
  ultimoVisto: number
}): Promise<Resultado & { id?: string; numero?: number }> {
  const { data, error } = await supabase.rpc('emitir_pedido_medicacion', {
    p_protocol_id: input.protocolId,
    p_desde: input.periodo.desde,
    p_hasta: input.periodo.hasta,
    p_emitido_el: input.emitidoEl,
    p_renglones: input.renglones,
    p_intento: input.intento,
    p_ultimo_visto: input.ultimoVisto,
  })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  const r = data as { id: string; numero: number }
  return { error: null, id: r.id, numero: r.numero }
}

/** Anular un pedido emitido (R9). La base lo rechaza si ya tiene recepciones. */
export async function anularPedidoMedicacion(pedidoId: string, motivo: MotivoAnulacion): Promise<Resultado> {
  const { error } = await supabase.rpc('anular_pedido_medicacion', { p_pedido_id: pedidoId, p_motivo: motivo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** «No va a llegar» (R11): cierra lo que falta de un renglón, que vuelve a la compra. */
export async function cerrarFaltantePedido(itemId: string, motivo: MotivoCierre): Promise<Resultado> {
  const { error } = await supabase.rpc('cerrar_faltante_pedido', { p_item_id: itemId, p_motivo: motivo })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/** «Reabrir» (RD2): lo que se había dado por perdido vuelve a estar en camino. */
export async function reabrirFaltantePedido(itemId: string): Promise<Resultado> {
  const { error } = await supabase.rpc('reabrir_faltante_pedido', { p_item_id: itemId })
  if (error) return { error: pharmaErrorMessage(error.code, error.message), code: error.code }
  return { error: null }
}

/**
 * La lista de «Recibir un pedido» (`pedidos_por_recibir`, 0133): independiente del período, porque la
 * Recepción no sabe de cortes. La arma `armarPorRecibir`.
 */
export function usePedidosPorRecibir() {
  return useSupabaseQuery<InsumosPorRecibir | null>(
    async (c) => {
      const { data, error } = await c.rpc('pedidos_por_recibir')
      if (error) return { data: null, error }
      return { data: data as InsumosPorRecibir, error: null }
    },
    [],
    (e) => pharmaErrorMessage(e.code, e.message),
  )
}
```

- [ ] **Step 3: El modelo viejo, sólo con lo que se comparte**

`src/data/pharma/reposicionModel.ts`, entero:

```ts
/**
 * ┌─ Reglas compartidas de la reposición (docs/plan-reposicion-stock-minimo.md, D2-D23) ───────────────┐
 *
 * Lo que queda de la cuenta del 14/09 después de que la card «Compras para …» se fue de Estadísticas
 * (2026-09-18): los tipos que siguen valiendo y las reglas por paciente y por lote que usa la reposición
 * de corte a corte (reposicionPeriodoModel.ts). La cuenta «para todos» (D8) vive ahora allá.
 *
 *   quién suma    screening|activo que NO terminó su cronograma automático antes del período   D16 D23
 *                 (dos presentaciones activas de la misma droga: suma una)                        D21
 *   estante       lo pendiente del período en curso sale primero de los lotes que vencen antes   D15
 *
 * Puro y con tests: un número mal contado se dibuja igual de prolijo. Las fechas van SIEMPRE por
 * parámetro: CI corre en UTC.
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type ModoReposicion = 'mensual' | 'a_demanda' | 'no_se_compra'
export type EstadoEstudio = 'activo' | 'pausado' | 'cerrado'
export type EstadoEnrolamiento = 'screening' | 'activo' | 'completado' | 'discontinuado'

export interface EstudioInsumo {
  id: string
  code: string
  name: string
  status: EstadoEstudio
}

/** Una asignación activa de un paciente (`patient_medications`). */
export interface PacienteInsumo {
  patient_medication_id: string
  enrollment_id: string
  protocol_id: string
  medication_id: string
  drug_id: string | null
  patient_name: string
  enrollment_status: EstadoEnrolamiento
  /** Excepción del paciente (null = la del estudio). */
  envases_por_mes: number | null
  /** La habilitación «para una entrega» (0124): esa asignación no suma. */
  habilitacion_id: string | null
  /** `patient_medications.created_at`, para desempatar presentaciones. */
  asignado_el: string
  /** Tiene visitas programadas de definiciones automáticas (D23). */
  tiene_cronograma: boolean
  /** Máxima `estimated_date` de esas visitas. */
  ultima_programada: string | null
  /** Último movimiento de dispensación de esa asignación. */
  ultimo_retiro: string | null
}

export interface LoteInsumo {
  protocol_id: string
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
}

// ═══════════════════════════ Fechas ═══════════════════════════

const pad = (n: number) => String(n).padStart(2, '0')

/** Suma días a una fecha ISO sin pasar por la zona horaria. */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** `DD/MM`. */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// ═══════════════════════════ Reglas por paciente ═══════════════════════════

/** Lo que miran las reglas de cronograma. */
type ConCronograma = Pick<PacienteInsumo, 'enrollment_status' | 'tiene_cronograma' | 'ultima_programada'>

/** D16 + D23: el paciente cuenta en el período que empieza en `desde`. */
export function sigueEnElMes(p: ConCronograma, desde: string): boolean {
  if (p.enrollment_status !== 'screening' && p.enrollment_status !== 'activo') return false
  if (!p.tiene_cronograma || !p.ultima_programada) return true
  return p.ultima_programada >= desde
}

/** Terminó su cronograma automático antes del período y sigue activo: no suma, pero se lista (D23). */
export function terminoCronograma(p: ConCronograma, desde: string): boolean {
  return (p.enrollment_status === 'screening' || p.enrollment_status === 'activo')
    && p.tiene_cronograma && !!p.ultima_programada && p.ultima_programada < desde
}

/**
 * D21: con dos presentaciones activas de la misma droga en un enrolamiento, suma UNA: la última
 * retirada; si ninguna se retiró, la asignada más nueva. Devuelve los ids que NO suman.
 */
export function presentacionesDuplicadas(
  pacientes: readonly Pick<PacienteInsumo, 'patient_medication_id' | 'enrollment_id' | 'drug_id' | 'habilitacion_id' | 'ultimo_retiro' | 'asignado_el'>[],
): Set<string> {
  const porClave = new Map<string, (typeof pacientes)[number][]>()
  for (const p of pacientes) {
    if (!p.drug_id || p.habilitacion_id) continue
    const k = `${p.enrollment_id}|${p.drug_id}`
    porClave.set(k, [...(porClave.get(k) ?? []), p])
  }
  const fuera = new Set<string>()
  for (const grupo of porClave.values()) {
    if (grupo.length < 2) continue
    const [queda] = [...grupo].sort((a, b) => {
      const ra = a.ultimo_retiro ?? '', rb = b.ultimo_retiro ?? ''
      if (ra !== rb) return ra > rb ? -1 : 1
      return a.asignado_el > b.asignado_el ? -1 : a.asignado_el < b.asignado_el ? 1 : 0
    })
    for (const p of grupo) if (p.patient_medication_id !== queda.patient_medication_id) fuera.add(p.patient_medication_id)
  }
  return fuera
}

// ═══════════════════════════ El estante ═══════════════════════════

export interface Estante {
  /** Lo que queda al comienzo del período que se compra (D15). */
  alComienzo: number
  /** Lo que no alcanza para terminar el período en curso (D31). */
  faltaEsteMes: number
  /** Lotes que siguen al comienzo pero vencen durante el período que se compra. */
  vencenEnElMes: { lot_number: string; expiry_date: string; quantity: number }[]
  /** Lo vigente hoy, sin descontar nada. */
  vigenteHoy: number
}

/** D15: lo pendiente del período en curso sale primero de los lotes que vencen antes. */
export function estanteAlComienzo(
  lotes: readonly LoteInsumo[],
  pendiente: number,
  hoy: string,
  periodo: { desde: string; hasta: string },
): Estante {
  const vigentes = lotes
    .filter((l) => l.quantity > 0 && (l.expiry_date == null || l.expiry_date >= hoy))
    .map((l) => ({ ...l }))
    .sort((a, b) => {
      if (a.expiry_date === b.expiry_date) return 0
      if (a.expiry_date == null) return 1
      if (b.expiry_date == null) return -1
      return a.expiry_date < b.expiry_date ? -1 : 1
    })
  const vigenteHoy = vigentes.reduce((s, l) => s + l.quantity, 0)
  let resto = pendiente
  for (const l of vigentes) {
    if (resto <= 0) break
    const saca = Math.min(l.quantity, resto)
    l.quantity -= saca
    resto -= saca
  }
  const quedan = vigentes.filter((l) => l.quantity > 0 && (l.expiry_date == null || l.expiry_date >= periodo.desde))
  return {
    alComienzo: quedan.reduce((s, l) => s + l.quantity, 0),
    faltaEsteMes: Math.max(0, resto),
    vencenEnElMes: quedan
      .filter((l): l is typeof l & { expiry_date: string } => l.expiry_date != null && l.expiry_date <= periodo.hasta)
      .map((l) => ({ lot_number: l.lot_number, expiry_date: l.expiry_date, quantity: l.quantity })),
    vigenteHoy,
  }
}

// ═══════════════════════════ Lo que comparte la cuenta ═══════════════════════════

export type EstadoRenglon = 'sin_cargar' | 'no_se_compra' | 'comprar' | 'en_camino' | 'alcanza'

export type TipoAviso = 'vence' | 'termino_cronograma' | 'sin_retiros' | 'dos_presentaciones' | 'varios_meses'

export interface Aviso {
  tipo: TipoAviso
  texto: string
  /** Los que no se leen como un número van en ámbar (D45). */
  ambar: boolean
}

export const envasesTxt = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`

export const nombresDePacientes = (ps: readonly { patient_name: string }[]) => {
  const unicos = [...new Set(ps.map((p) => p.patient_name))].sort((a, b) => a.localeCompare(b, 'es'))
  return unicos.length <= 3 ? unicos.join(', ') : `${unicos.slice(0, 3).join(', ')} y ${unicos.length - 3} más`
}
```

En `src/data/pharma/reposicionPeriodoModel.ts`, `PacienteInsumo` ya no trae `retirado_mes`, así que el tipo del período deja de omitirlo:

```ts
/** Una asignación activa, con lo retirado medido en el período pedido. */
export type PacientePeriodoInsumo = PacienteInsumo & {
  /** Neto retirado entre `p_desde` y `p_hasta` (hora AR), en lista o entregada. */
  retirado_periodo: number
}
```

`src/data/pharma/reposicionModel.test.ts`, entero:

```ts
import { describe, expect, it } from 'vitest'
import {
  estanteAlComienzo, presentacionesDuplicadas, sigueEnElMes, sumarDias, terminoCronograma,
  type LoteInsumo, type PacienteInsumo,
} from './reposicionModel'

/**
 * Las reglas compartidas de la reposición (docs/plan-reposicion-stock-minimo.md): quién suma, qué
 * presentación cuenta y qué queda en el estante. La cuenta de corte a corte que las usa se testea en
 * reposicionPeriodoModel.test.ts. Fechas fijas: CI corre en UTC.
 */

const HOY = '2026-09-14'
const OCTUBRE = { desde: '2026-10-01', hasta: '2026-10-31' }

let n = 0
const paciente = (p: Partial<PacienteInsumo> = {}): PacienteInsumo => {
  n += 1
  return {
    patient_medication_id: `pmed-${n}`, enrollment_id: `enr-${n}`, protocol_id: 'asm', medication_id: 'seretide', drug_id: 'fluti',
    patient_name: `Paciente ${String(n).padStart(2, '0')}`, enrollment_status: 'activo', envases_por_mes: null, habilitacion_id: null,
    asignado_el: '2026-03-01', tiene_cronograma: false, ultima_programada: null, ultimo_retiro: '2026-09-01', ...p,
  }
}
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({ protocol_id: 'asm', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p })

describe('sumarDias', () => {
  it('suma y resta días cruzando meses', () => {
    expect(sumarDias('2026-10-01', -20)).toBe('2026-09-11')
    expect(sumarDias('2026-09-14', 20)).toBe('2026-10-04')
  })
})

describe('quién suma (D16, D23)', () => {
  it('screening o activo sin cronograma suma', () => {
    expect(sigueEnElMes(paciente({ enrollment_status: 'screening' }), '2026-10-01')).toBe(true)
  })
  it('completado o discontinuado no suma', () => {
    expect(sigueEnElMes(paciente({ enrollment_status: 'completado' }), '2026-10-01')).toBe(false)
    expect(sigueEnElMes(paciente({ enrollment_status: 'discontinuado' }), '2026-10-01')).toBe(false)
  })
  it('con cronograma terminado antes del período no suma y se marca', () => {
    const p = paciente({ tiene_cronograma: true, ultima_programada: '2026-09-03' })
    expect(sigueEnElMes(p, '2026-10-01')).toBe(false)
    expect(terminoCronograma(p, '2026-10-01')).toBe(true)
  })
  it('con la última visita dentro del período suma', () => {
    const p = paciente({ tiene_cronograma: true, ultima_programada: '2026-10-20' })
    expect(sigueEnElMes(p, '2026-10-01')).toBe(true)
    expect(terminoCronograma(p, '2026-10-01')).toBe(false)
  })
  it('sin cronograma nunca «terminó», aunque venga una fecha', () => {
    expect(terminoCronograma(paciente({ tiene_cronograma: false, ultima_programada: '2026-01-01' }), '2026-10-01')).toBe(false)
  })
})

describe('presentacionesDuplicadas (D21)', () => {
  it('con dos de la misma droga en un enrolamiento, queda la última retirada', () => {
    const vieja = paciente({ enrollment_id: 'e', ultimo_retiro: '2026-07-01' })
    const nueva = paciente({ enrollment_id: 'e', medication_id: 'seretide-125', ultimo_retiro: '2026-09-02' })
    expect([...presentacionesDuplicadas([vieja, nueva])]).toEqual([vieja.patient_medication_id])
  })
  it('si ninguna se retiró, queda la asignada más nueva', () => {
    const a = paciente({ enrollment_id: 'e', ultimo_retiro: null, asignado_el: '2026-01-01' })
    const b = paciente({ enrollment_id: 'e', ultimo_retiro: null, asignado_el: '2026-05-01' })
    expect([...presentacionesDuplicadas([a, b])]).toEqual([a.patient_medication_id])
  })
  it('no junta enrolamientos distintos ni la habilitación de una entrega', () => {
    const a = paciente({ enrollment_id: 'e1' })
    const b = paciente({ enrollment_id: 'e2' })
    const c = paciente({ enrollment_id: 'e1', habilitacion_id: 'hab' })
    expect(presentacionesDuplicadas([a, b, c]).size).toBe(0)
  })
})

describe('estanteAlComienzo (D15)', () => {
  it('lo vencido hoy no cuenta', () => {
    expect(estanteAlComienzo([lote({ expiry_date: '2026-09-13' })], 0, HOY, OCTUBRE)).toMatchObject({ alComienzo: 0, vigenteHoy: 0 })
  })
  it('lo pendiente sale primero del que vence antes', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'B', expiry_date: '2027-01-01', quantity: 3 }), lote({ lot_number: 'A', expiry_date: '2026-09-20', quantity: 5 })], 4, HOY, OCTUBRE)
    // A entrega 4 y le queda 1 que vence antes de octubre: al 1/10 sólo queda B.
    expect(e).toMatchObject({ alComienzo: 3, faltaEsteMes: 0 })
  })
  it('el lote sin vencimiento se usa último', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'S', expiry_date: null, quantity: 5 }), lote({ lot_number: 'V', expiry_date: '2027-01-01', quantity: 2 })], 2, HOY, OCTUBRE)
    expect(e.alComienzo).toBe(5)
  })
  it('lo que vence durante el período cuenta y se avisa', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'L2231', expiry_date: '2026-10-20', quantity: 3 })], 0, HOY, OCTUBRE)
    expect(e.alComienzo).toBe(3)
    expect(e.vencenEnElMes).toEqual([{ lot_number: 'L2231', expiry_date: '2026-10-20', quantity: 3 }])
  })
  it('si lo pendiente supera lo vigente, queda en cero y dice cuánto falta', () => {
    expect(estanteAlComienzo([lote({ quantity: 3 })], 5, HOY, OCTUBRE)).toMatchObject({ alComienzo: 0, faltaEsteMes: 2 })
  })
})
```

- [ ] **Step 4: Documentación**

En `docs/plan-reposicion-stock-minimo.md`, debajo de la primera línea (el título `# Plan · Stock mínimo mensual y faltante a comprar por estudio`), agregar una línea en blanco y:

```markdown
> **⚠️ Reemplazado en parte (2026-09-18).** La card «Compras para …» ya no está en Estadísticas: la reposición vive en el submódulo **Reposición** de Farmacia ([spec](superpowers/specs/2026-09-16-reposicion-submodulo-design.md)). Las decisiones D6, D10, D13, D14, D17, D20, D24, D28, D37 y D44-D48 quedan reemplazadas (ver la tabla «Decisiones del 14/09 que esto reemplaza» del spec). Las demás siguen valiendo.
```

En `TODOS.md`, las dos entradas nuevas van después del primer separador `---` (antes de «## Farmacia · Reposición: sobrante en otro estudio y pacientes por entrar»), agregar:

```markdown
## Farmacia · Reposición: código de barras del pedido en la hoja

- **Qué:** imprimir el número del pedido como código de barras en la hoja, y que «Recibir un pedido» lo acepte escaneado.
- **Por qué:** la hoja vuelve con la medicación y hoy el pedido se elige por número en una lista corta. Escanearlo ahorra el paso y el error de elegir otro.
- **Pros:** más rápido y sin confusión cuando haya muchos pedidos abiertos.
- **Contras:** otra forma de identificar el pedido para mantener. Con pocos pedidos por mes, la lista alcanza.
- **Contexto:** decisión abierta de la revisión de diseño del 2026-09-17 (spec `docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md`, «UNRESOLVED DECISIONS»). Se recomendó dejarlo para más adelante, y el plan de la Parte 2 lo dejó acá.
- **Empezar por:** `src/views/pharma/reposicion/HojaPedido.tsx` y `src/views/pharma/recepcion/RecibirPedido.tsx` (el campo de escaneo de `wizard/ScanField.tsx`).
- **Disparador:** que la lista de «Recibir un pedido» pase de diez renglones, o que alguien reciba el pedido equivocado.
- **Depende de / bloqueado por:** la Parte 2 de Reposición en prod.
- **Prioridad:** P3.

---

## Recepción: que «Crear recepción» no se duplique si se corta la red

- **Qué:** el mismo intento que la `0133` le puso a «Emitir e imprimir», aplicado a `create_reception`: un uuid por asistente abierto, único en `medication_receptions`. Si llega el mismo intento con los mismos renglones, la función devuelve la recepción ya guardada.
- **Por qué:** si la red se corta después de guardar y se reintenta, quedan dos recepciones pendientes iguales. Si alguien verifica las dos, el stock se duplica. No es de Reposición: pasa con cualquier recepción desde que existe el asistente.
- **Pros:** cierra el último camino al doble recibo. «Recibir un pedido» ya no precarga lo que está sin verificar.
- **Contras:** toca `create_reception`, que usa toda Recepción y que la guarda de la `0132` también rodea.
- **Contexto:** segunda opinión de la revisión de ingeniería del plan de la Parte 2 de Reposición (2026-09-19, `docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md`). Empezar por la firma actual de `create_reception` (`supabase/migrations/0128_*.sql`), la guarda (`0132_recepcion_guarda_borrado_y_renglones.sql`) y `src/views/pharma/ReceptionWizard.tsx`.
- **Depende de / bloqueado por:** nada; la guarda (`0132`) ya está en prod.
- **Prioridad:** P2.

---

```

- [ ] **Step 5: Verificar que no queda nada de la card**

Run: `git grep -n "insumos_de_reposicion\|registrar_pedido_reposicion\|anular_pedido_reposicion\|demora_compra_dias\|ComprasDelMes\|VerPedido\|useInsumosDeReposicion\|armarReposicion(" -- src`
Expected: sin resultados. Si aparece algo, es un uso que se escapó: sacarlo.

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run src/data/pharma src/views/pharma src/lib`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/pharma/reportes/ReportesView.tsx src/views/pharma/reportes/estilos.ts src/data/pharma/reposicion.ts src/data/pharma/reposicionModel.ts src/data/pharma/reposicionModel.test.ts src/data/pharma/reposicionPeriodoModel.ts docs/plan-reposicion-stock-minimo.md TODOS.md
git commit -m "feat(reposicion): sale la card de Estadísticas y el modelo del mes calendario (R12)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(`git rm` del Step 1 ya dejó los dos borrados en el índice.)

---

### Task 13: Gate, QA y PR B

**Files:**
- Create (fuera del repo): `<scratchpad>/pr-b.md`

**Interfaces:**
- Consumes: la PR A mergeada y la `0133` aplicada y marcada (Task 7).
- Produces: la PR B mergeada y desplegada. Es la condición para la Task 14.

- [ ] **Step 1: Gate completo**

Run: `npm run build`
Expected: typecheck sin errores, vitest verde y `vite build` terminado.

- [ ] **Step 2: QA de lectura en el preview**

Con el server del worktree en el 5251 y la sesión que abrió el Director (Task 10, Step 7), repasar el recorrido completo contra el mock. Estos artboards se pueden comparar con datos reales:

- «Recorrido»: 1, 2, 2b si ya hay un pedido, 3 sin emitir, 5, 6 y 6b.
- «Casos y estados»: la tarjeta, la franja, un período anterior, quien sólo puede mirar, «Recibir sin pedidos» y la ventana angosta.

Chequear en cada pantalla:

1. **Estadísticas** abre sin la card, directo en los números del período.
2. **Reposición:** tarjetas, franja, estudio, boleta, flechas, «Armar pedido» (cancelar), detalle de un pedido si existe (sin cerrar ni anular nada). La columna «Mínimo» de cada medicamento coincide con «Hacen falta para el período que viene» de su boleta (salvo con el pedido tarde: ver la decisión 10).
3. **Recepción:** «Recibir un pedido» (cerrar sin recibir).
4. **Tema oscuro** (`resize_window` con `colorScheme: 'dark'`): la pastilla, los ámbar y el verde de «Cubierto» se leen. Los tokens `--spira-acc-deep-*` se aclaran solos.
5. **Consola** sin errores nuevos.

**Emitir un pedido real, cargar el día de corte o recibir un pedido deja datos permanentes en prod.** No se hace sin preguntar. Proponerle al Director, en el chat:

- si el día de corte no está cargado, que lo cargue él (o que confirme el número para cargarlo);
- si quiere, emitir el primer pedido real de un estudio para el período que viene, que igual iba a hacer, y verificar juntos la hoja impresa y cómo queda la tarjeta.

Si dice que no, alcanza con lo de lectura: lo que puede fallar en silencio está en los tests.

- [ ] **Step 3: Push y PR**

```bash
git -c credential.interactive=false push -u origin feat/reposicion-parte-2-pantallas
```

`<scratchpad>/pr-b.md`:

```markdown
## Qué trae

Segunda mitad de la Parte 2 de **Reposición** ([plan](docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md)), copiando el mock de la revisión de diseño:

- **Farmacia › Reposición**, entre Dispensaciones y Estadísticas:
  - la grilla de estudios con la franja del corte;
  - el estudio con lo que entró, salió y hay, la boleta de cada medicamento y sus pedidos;
  - los períodos anteriores con flechas;
  - el **mínimo** de cada medicamento, sacado de la medicación asignada a los pacientes (pedido del Director).
- **Armar pedido** corregible, con la hoja A4 para la farmacia. Un reintento después de un corte de red no emite dos.
- **El pedido:** lo recibido y lo que falta, «No va a llegar» con motivo, «Reabrir», anular y reimprimir.
- **Recepción › Recibir un pedido:** el asistente arranca en el Escaneo con lo que falta, y el resumen compara lo pedido con lo que llega.
- **Estadísticas** vuelve a ser sólo los números del período: la card «Compras para …» se fue.

## ⚠️ Orden de despliegue

- **Antes de mergear:** la 0133 tiene que estar aplicada (ya lo está si esta PR se abrió después de su marca).
- **Después del deploy:** la 0136 borra de la base lo que usaba la card vieja. Va en una PR aparte y **recién con esto en prod**.

## QA

De lectura, logueado, en el preview (grilla, estudio, boleta, flechas, modales sin emitir, Recepción). Lo que se hizo o no con datos reales, en el primer comentario.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Run: `node "<scratchpad>/crear-pr.mjs" feat/reposicion-parte-2-pantallas "Reposición · parte 2B: el submódulo, el pedido y «Recibir un pedido»" "<scratchpad>/pr-b.md"`
Expected: `201 https://github.com/spiraclinicapp/Spira-App/pull/<N>`

- [ ] **Step 4: Contar los «Ya lo pedí» de la card vieja, antes de mergear**

La card vieja sigue en prod hasta el deploy de esta PR. Lo que alguien haya marcado con «Ya lo pedí» deja de restarse en Reposición desde el deploy, y se volvería a pedir. El freno de la 0136 lo ve recién después (revisión de ingeniería, 14). Pasarle al Director, para correr tal cual en el editor SQL (sólo lee):

```sql
select count(*) from public.reposicion_pedidos;
```

- Si da **0**, seguir.
- Si da más, **no se mergea todavía**: se decide con él qué hacer con esos pedidos (emitirlos como pedido del estudio, o dejarlos ir sabiendo que se vuelven a pedir) antes del deploy.

- [ ] **Step 5: Esperar el merge y el deploy**

Avisarle al Director que la PR está lista y que **la 0136 va después del deploy**. Cuando la mergee, confirmar el deploy por el check de Vercel del commit de merge en `main`.

`<scratchpad>/estado-pr.mjs`:

```js
// node estado-pr.mjs <número de PR>: si está mergeada y cómo terminaron los checks del commit de merge.
import { execSync } from 'node:child_process'

const salida = execSync('git -c credential.interactive=false credential fill', {
  input: 'protocol=https\nhost=github.com\nusername=spiraclinicapp\n\n',
  cwd: 'C:/Users/Tutuca/Desktop/Spira/Spira App',
}).toString()
const token = salida.match(/^password=(.*)$/m)?.[1]
const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'spira-agent' }
const base = 'https://api.github.com/repos/spiraclinicapp/Spira-App'
const pr = await (await fetch(`${base}/pulls/${process.argv[2]}`, { headers: h })).json()
console.log({ merged: pr.merged, merge_commit_sha: pr.merge_commit_sha, mergeable_state: pr.mergeable_state })
if (pr.merged) {
  const cr = await (await fetch(`${base}/commits/${pr.merge_commit_sha}/check-runs`, { headers: h })).json()
  for (const c of cr.check_runs ?? []) console.log('-', c.name, c.status, c.conclusion)
}
```

Run: `node "<scratchpad>/estado-pr.mjs" <N>`
Expected: `merged: true`, y el check `Vercel` en `success` sobre el `merge_commit_sha`. Además, el Director confirma en el chat que la app en prod ya muestra Reposición. **Sin eso, no seguir a la Task 14.**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App"
git status -sb
git fetch origin
git pull --ff-only
```

(con el working copy limpio en `main`; si no lo está, avisarle al Director y no hacer pull).

---

### Task 14: Migración 0136 — se borra lo de la card vieja

**Files:**
- Create: `supabase/migrations/0136_reposicion_limpieza.sql`
- Modify: `supabase/README.md`, `CLAUDE.md` (la última migración aplicada)
- Create (fuera del repo): `<scratchpad>/pglite-0136/probar.mjs`, `<scratchpad>/sondas-0136.mjs`

**Interfaces:**
- Consumes: la PR B **en prod**. Nada del front llama a lo que se borra (Task 12, Step 5).
- Produces: la base sin `insumos_de_reposicion`, `registrar_pedido_reposicion`, `anular_pedido_reposicion`, `reposicion_pedidos` ni `farmacia_ajustes.demora_compra_dias`.

- [ ] **Step 1: Rama y número**

```bash
cd "C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2"
git fetch origin
git switch -c chore/reposicion-limpieza origin/main
git ls-tree --name-only origin/main supabase/migrations/ | tail -2
```

Expected: la última es la `0133` de la Task 5. Si ya hay otra después, esta toma el siguiente número: cambiarlo en el nombre del archivo, su cabecera, la fila del README y los dos scripts.

- [ ] **Step 2: Escribir la migración**

`supabase/migrations/0136_reposicion_limpieza.sql`:

```sql
-- Spira · Migración 0136 — Reposición: se borra lo de la card vieja de Estadísticas (0125).
-- Plan: docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md (Task 14).
--
-- APLICAR A MANO en el SQL Editor de Supabase (rol postgres), DESPUÉS de la 0133.
-- IDEMPOTENTE: reintentar es volver a correr el archivo entero.
--
-- ⚠️ DESTRUCTIVA → VA **DESPUÉS** DEL DEPLOY DEL FRONT de la Parte 2. La card «Compras para …» llamaba a
--    insumos_de_reposicion, registrar_pedido_reposicion y anular_pedido_reposicion, y leía
--    demora_compra_dias: con esto aplicado antes, Estadísticas quedaría en blanco en prod (ya pasó con la
--    0068 y con la 0092). El front de la Parte 2 ya no nombra ninguno de los cinco.
--
-- Lo que QUEDA de la 0125: protocol_medications.reposicion_modo/envases_por_mes/stock_fijo,
-- patient_medications.envases_por_mes, configurar_reposicion y farmacia_ajustes (con dia_corte, 0128).
--
-- ⚠️ NUNCA dos signos peso pegados dentro de un comentario (ver CLAUDE.md, 0071).
-- ============================================================================


-- 1 · Freno: si «Ya lo pedí» dejó filas, no se borra nada ----------------------------------------------
-- La limpieza del 2026-09-15 dejó reposicion_pedidos vacía. Si alguien la usó después, esas filas son
-- historia que la tabla nueva no tiene: se frena acá, antes de cualquier drop, y se decide a mano.
-- La consulta va por EXECUTE y sólo si la tabla existe: escrita directo, plpgsql resuelve la tabla al
-- preparar el IF entero —aunque to_regclass ya haya dado nulo— y una segunda corrida, con la tabla ya
-- borrada, revienta con 42P01 en vez de seguir de largo (lo encontró la prueba en PGlite del plan).
do $freno$
declare
  v_filas bigint;
begin
  if to_regclass('public.reposicion_pedidos') is not null then
    execute 'select count(*) from public.reposicion_pedidos' into v_filas;
    if v_filas > 0 then
      raise exception 'reposicion_pedidos todavía tiene filas: no se borra nada. Avisale al equipo técnico.';
    end if;
  end if;
end;
$freno$;


-- 2 · Las funciones de la card ------------------------------------------------------------------------
drop function if exists public.insumos_de_reposicion(date);
drop function if exists public.registrar_pedido_reposicion(jsonb, date);
drop function if exists public.anular_pedido_reposicion(uuid);


-- 3 · «Ya lo pedí» (su trigger, policies e índices se van con la tabla) ---------------------------------
drop table if exists public.reposicion_pedidos;


-- 4 · La demora de compra (R5: la fecha que importa es el corte) ----------------------------------------
alter table public.farmacia_ajustes drop column if exists demora_compra_dias;
comment on table public.farmacia_ajustes is
  'Ajustes de Farmacia (una sola fila). dia_corte: el día del mes en que cierra cada período de reposición (0128). 0125, 0136.';
```

- [ ] **Step 3: Probarla en PGlite**

```bash
mkdir -p "<scratchpad>/pglite-0136" && cd "<scratchpad>/pglite-0136" && npm init -y && npm i @electric-sql/pglite@^0.5.8
```

`<scratchpad>/pglite-0136/probar.mjs`:

```js
// Prueba la 0136 sobre un esquema de juguete con lo que borra y lo que tiene que quedar.
//   node probar.mjs "C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2"
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const REPO = process.argv[2] ?? 'C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2'
const m = readFileSync(`${REPO}/supabase/migrations/0136_reposicion_limpieza.sql`, 'utf8')

let fallas = 0
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg)
  else { fallas += 1; console.log('  ✗', msg) }
}
const marcadores = m.match(/\$[A-Za-z_]*\$/g) ?? []
ok(marcadores.length % 2 === 0, `marcadores de dollar-quote pares (${marcadores.length})`)
ok(!/--[^\n]*\$\$/.test(m), 'ningún comentario con dos signos peso pegados')

const db = new PGlite()
const uno = async (sql, params) => (await db.query(sql, params)).rows[0]
const funciones = async () => (await uno(
  `select count(*)::int as n from pg_proc where proname in ('insumos_de_reposicion', 'registrar_pedido_reposicion', 'anular_pedido_reposicion')`,
)).n
const columna = async (nombre) => (await uno(
  `select count(*)::int as n from information_schema.columns where table_name = 'farmacia_ajustes' and column_name = $1`, [nombre],
)).n

await db.exec(`
  create table public.farmacia_ajustes (id uuid primary key default gen_random_uuid(), unica boolean not null default true unique check (unica),
    demora_compra_dias integer check (demora_compra_dias between 0 and 365), dia_corte integer, updated_at timestamptz not null default now());
  insert into public.farmacia_ajustes (unica, demora_compra_dias, dia_corte) values (true, 20, 28);
  create table public.reposicion_pedidos (id uuid primary key default gen_random_uuid(), grupo uuid not null, cantidad integer not null);
  create function public.insumos_de_reposicion(p_hoy date) returns jsonb language sql as $f$ select '{}'::jsonb $f$;
  create function public.registrar_pedido_reposicion(p_renglones jsonb, p_pedido_el date) returns uuid language sql as $f$ select null::uuid $f$;
  create function public.anular_pedido_reposicion(p_grupo uuid) returns void language sql as $f$ select $f$;
  create function public.reposicion_del_periodo(p_desde date, p_hasta date, p_protocol_id uuid default null) returns jsonb language sql as $f$ select '{}'::jsonb $f$;
`)

console.log('con filas en reposicion_pedidos, frena')
await db.exec(`insert into public.reposicion_pedidos (grupo, cantidad) values (gen_random_uuid(), 3)`)
try {
  await db.exec(m)
  ok(false, 'tendría que haber frenado')
} catch (e) {
  ok(String(e.message).includes('todavía tiene filas'), `frena con el mensaje → ${e.message}`)
}
ok((await funciones()) === 3 && (await columna('demora_compra_dias')) === 1, 'y no borró nada')

console.log('vacía, borra (dos corridas)')
await db.exec(`delete from public.reposicion_pedidos`)
await db.exec(m)
await db.exec(m)
ok((await funciones()) === 0, 'las tres funciones de la card ya no están')
ok((await uno(`select to_regclass('public.reposicion_pedidos') as t`)).t === null, 'la tabla reposicion_pedidos ya no está')
ok((await columna('demora_compra_dias')) === 0, 'la columna demora_compra_dias ya no está')
ok((await columna('dia_corte')) === 1 && (await uno(`select dia_corte from public.farmacia_ajustes`)).dia_corte === 28, 'el día de corte sigue, con su valor')
ok((await uno(`select count(*)::int as n from pg_proc where proname = 'reposicion_del_periodo'`)).n === 1, 'lo de la 0128 sigue')

console.log(fallas === 0 ? '\nTODO VERDE' : `\n${fallas} FALLAS`)
process.exit(fallas === 0 ? 0 : 1)
```

Run: `node "<scratchpad>/pglite-0136/probar.mjs" "C:/Users/Tutuca/Desktop/Spira/wt-reposicion-2"`
Expected: `TODO VERDE`.

- [ ] **Step 4: Índice, CLAUDE.md y commit**

En `supabase/README.md`, con Edit, debajo de la fila de la 0133:

```
| 0136 | `reposicion_limpieza.sql` — **Reposición: se borra lo de la card vieja de Estadísticas** (`docs/superpowers/plans/2026-09-18-reposicion-parte-2-pantallas.md`, Task 14). DESTRUCTIVA: va **después** del deploy del front de la Parte 2, que ya no nombra nada de esto (la card vieja sí). `drop` de `insumos_de_reposicion(date)`, `registrar_pedido_reposicion(jsonb, date)`, `anular_pedido_reposicion(uuid)`, la tabla `reposicion_pedidos` (con su trigger, policies e índices) y la columna `farmacia_ajustes.demora_compra_dias` (R5). Se frena sola, antes de borrar nada, si `reposicion_pedidos` tiene filas. Probada con PGlite (freno con filas y dos corridas). |
```

`CLAUDE.md` no va en este commit: la última aplicada pasa de `0133` a `0136` en el Step 6, cuando el Director confirme que la aplicó.

Run: `node scripts/check-migraciones.mjs`
Expected: `✓ 136 migraciones, índice al día.`

```bash
git add supabase/migrations/0136_reposicion_limpieza.sql supabase/README.md
git commit -m "chore(db): 0136 — se borra lo de la card vieja de Reposición

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git -c credential.interactive=false push -u origin chore/reposicion-limpieza
```

Abrir la PR con `crear-pr.mjs`:
- título «Reposición · limpieza: 0136 borra lo de la card vieja»;
- cuerpo: qué borra, que **va después del deploy** (ya pasó) y que se frena sola si `reposicion_pedidos` tiene filas.

- [ ] **Step 5: Aplicación**

En el chat, en una frase: la 0136 es **destructiva**, el front ya no la necesita (deploy confirmado), y **se aplica apenas se mergea**. Si el editor frena con «todavía tiene filas», no se borró nada y hay que decidir qué hacer con esas filas antes de seguir.

- [ ] **Step 6: Sondas y marca**

`<scratchpad>/sondas-0136.mjs` es `sondas-0133.mjs` con estos `casos`:

```js
const casos = [
  ['ya no está insumos_de_reposicion', await rpc('insumos_de_reposicion', { p_hoy: '2026-09-18' }), (r) => !existe(r)],
  ['ya no está registrar_pedido_reposicion', await rpc('registrar_pedido_reposicion', { p_renglones: [], p_pedido_el: '2026-09-18' }), (r) => !existe(r)],
  ['ya no está anular_pedido_reposicion', await rpc('anular_pedido_reposicion', { p_grupo: CERO }), (r) => !existe(r)],
  ['ya no está la tabla reposicion_pedidos', await get('reposicion_pedidos?select=id&limit=1'), (r) => !existe(r)],
  ['ya no está la columna demora_compra_dias', await get('farmacia_ajustes?select=demora_compra_dias&limit=1'), (r) => !existe(r)],
  ['CONTROL: reposicion_del_periodo sigue', await rpc('reposicion_del_periodo', { p_desde: '2026-08-29', p_hasta: '2026-09-28' }), existe],
  ['CONTROL: farmacia_ajustes.dia_corte sigue', await get('farmacia_ajustes?select=dia_corte&limit=1'), existe],
]
```

Run: `node "<scratchpad>/sondas-0136.mjs"`
Expected: siete `✓` y `TODO VERDE`. Si «ya no está» falla recién aplicada, falta el `notify pgrst, 'reload schema';`: pasárselo al Director y volver a sondear.

Después, en una rama nueva `docs/0136-aplicada` desde `main` actualizado:
- en `supabase/README.md`, sumar `**Aplicada en prod (AAAA-MM-DD).**` al final de la fila de la 0136 (con Edit, fecha literal);
- en `CLAUDE.md`, la última aplicada pasa de `0133` a `0136`;
- `node scripts/check-migraciones.mjs`, commit, push, PR con `crear-pr.mjs` (título «docs(db): 0136 aplicada en prod»).

- [ ] **Step 7: Dejar todo en orden**

Cuando el Director mergee la última PR:

```bash
cd "C:/Users/Tutuca/Desktop/Spira/Spira App"
git status -sb
git fetch origin
git pull --ff-only
git worktree remove ../wt-reposicion-2
git branch -D feat/reposicion-parte-2-base feat/reposicion-parte-2-pantallas chore/reposicion-limpieza docs/0133-aplicada docs/0136-aplicada
```

Antes de borrar cada rama local, comparar su contenido con `main` (`git diff origin/main...<rama> --stat` vacío). Un merge por la web cambia los SHA, y `-d` diría que no está mergeada (memoria `gotcha-cherry-pick-cambia-el-sha`).

Actualizar la memoria `plan-reposicion-corte-a-corte`: Parte 2 en prod, con los números de PR y de migración. Si todo quedó en prod, moverla a «Planes cerrados».

---

## Después de este plan

- **Primer corte con el submódulo en uso:** mirar con el Director la franja, la tarjeta y la boleta el día del corte y los 5 días siguientes (RD1). Es la primera vez que se ve la ventana tarde con datos reales.
- **Lo que quedó en `TODOS.md`:**
  - el código de barras de la hoja;
  - el sobrante entre estudios;
  - los restos de lote que el armado no usa;
  - el intento de `create_reception` (P2, de la revisión de ingeniería). El hueco del DELETE de recepciones ya lo cerró la guarda (`0132`).
- **Una tarea de diseño pendiente de la revisión (T4, P2):** QA de teclado completo del estudio y los modales (RD14). Las piezas llevan `aria-expanded`, rótulos y texto en los avisos, pero nadie lo recorrió con teclado.

---

## Desviaciones de la ejecución (PR A, 2026-09-19)

El código de la rama manda sobre los bloques de este plan en estos puntos. Salieron de las revisiones de la
ejecución, y las dos marcadas «Director» las decidió él:

- **Reintento de un pedido anulado:** `emitir_pedido_medicacion` rechaza con 23514 «Ese pedido se anuló:
  cerrá esta ventana y armalo de nuevo» si el pedido de ese intento se anuló (Director).
- **Un pedido «Cerrado · no llegó» no cubre el período** (Director). `pedidoPara` lo ignora, así que la
  cuenta, la franja y el pedido tarde lo tratan como si no hubiera pedido. El renglón fijo de la tarjeta y el
  resumen del estudio dicen «el Pedido Nº 14 no llegó». `ultimoPedidoPara` lo sigue contando, igual que
  `p_ultimo_visto` en la base.
- **«No va a llegar» sólo sin recepción sin verificar en el renglón** (Director). La base lo rechaza, y el
  modelo tiene `sePuedeCerrar(r)`, que usa el botón de la Task 8 (ya corregido arriba).
- **0133:**
  - el candado va antes de buscar el intento;
  - cada recepción trae `medication_ids`, así `sinVerificarDe` nombra sólo las de ese medicamento;
  - el archivo termina con `notify pgrst, 'reload schema';`.
- **Pastilla «Llegó, falta verificar»:** sólo si a un renglón que todavía falta le llegó algo sin verificar.
- **Franja:** junta «todos los estudios con compras tienen su pedido» y «falta cargar…» cuando aplican los dos.

---

## Desviaciones de la ejecución (PR B, 2026-09-20)

El código de la rama manda sobre los bloques de este plan en estos puntos. Salieron de las revisiones de cada
tarea; la revisión final de la PR B pidió anotarlas acá:

- **`AvisoLinea` anuncia los errores** (`piezas.tsx`): con `tono="danger"` lleva `role="alert"`, como los
  `role="alert"` de «Anular» y del detalle del pedido. El error de «Emitir e imprimir» no se anunciaba.
- **Cerrar un renglón cierra su edición** (`PantallaEstudio.tsx`): `alternar` apaga siempre `editando`. Si el
  renglón se cerraba con la flecha en vez de «Cancelar», volvía a abrirse con el formulario.
- **El Stepper sabe desde dónde se puede volver** (`src/components/Stepper.tsx`, que NO estaba en la lista de
  archivos de la Task 11, y `ReceptionWizard.tsx`): prop opcional `desde` (default 0). Recibiendo un pedido, el
  asistente arranca en el Escaneo y el paso «Tipo» se veía hecho y clickeable, pero el click no hacía nada.
- **La limpieza de la Task 14 es la `0136`**: mientras se ejecutaba esta parte, «lleva sangre» (PR #241) se
  llevó la `0134` y el historial con IVRS (PR #246) la `0135`. Los números de este plan ya dicen `0136`.

---

## Revisión de ingeniería (2026-09-19)

`/plan-eng-review` sobre este plan (PR #233), con alcance completo (D1): el plan toca unos 30 archivos, pero cada pieza responde a R1-R13 o RD1-RD18 y ya venía repartido en dos PRs. La segunda opinión la hizo un agente Claude aparte, sin ver el análisis propio: codex no está instalado. Fueron 16 preguntas y el Director eligió la opción recomendada en todas. En medio, sumó un pedido: ver el stock mínimo de cada medicamento (decisión 10).

### Lo que cambió en el plan (tareas de implementación)

Todo quedó escrito dentro de las Tasks: ejecutar el plan lo cumple.

| Nº | Prioridad | Qué | Dónde |
|---|---|---|---|
| 1 | P1 | Un reintento con otras cantidades se rechaza, en vez de devolver el pedido viejo: la hoja ya no puede contradecir a la base | Task 5 (0133 §2 + PGlite) |
| 2 | P2 | Lo repetido pasa a `piezas`: `versalita`, `rotuloColumna`, `rotuloTabla`, `PuntoEstado`, `mayuscula`, `minuscula`; las cajas reusan `card` de `reportes/estilos` | Tasks 8-11 |
| 3 | P2 | Cuatro tests más: tarde con un pedido viejo en camino, `pedidosAMostrar` con recepción sin verificar, el resumen de Recepción con algo que no faltaba, la tarjeta «sin cuenta» | Tasks 2-4 |
| 4 | P2 | Sonda del embed `pedido:pedidos_medicacion(numero)` antes de la PR B | Task 7 |
| 5 | P1 | `faltaEstePeriodo` neto de lo en camino: sin esto, el día después de cada corte la grilla marcaba tareas falsas | Task 3 + test del 29/09 en la Task 4 |
| 6 | P2 | Cerrar «Armar pedido» después de un error vuelve a pedir los datos; el aviso dice «desde esta ventana» | Task 8 |
| 7 | P2 | `p_ultimo_visto` + candado por estudio: dos personas no emiten dos pedidos por lo mismo, y «Armar otro pedido» sigue andando | Tasks 2, 5, 6, 8, 9 |
| 8 | P2 | `porRecibir`: «Recibir un pedido» no precarga lo que ya está en una recepción sin verificar; si ya llegó todo, no ofrece «Recibir» | Tasks 2, 11 |
| 9 | P2 | El asistente nombra el pedido que espera lo que llega («Se debe en el Pedido Nº 13: recibilo con ese») | Tasks 2, 11 |
| 10 | P2 | La hoja reimpresa dice «REIMPRESIÓN · DD/MM» y, por renglón, lo recibido y lo que no va a llegar | Tasks 2, 8 |
| 11 | P3 | El pedido principal es el que todavía debe; el renglón de «lo anterior» sólo muestra otros períodos | Tasks 2, 3 |
| 12 | P3 | «No va a llegar» no se ofrece ni se acepta sobre lo que ya llegó y falta verificar | Tasks 5, 8 |
| 13 | P3 | La tarjeta avisa los pacientes sin medicación habilitada; la franja no dice «nada para pedir» con renglones sin cargar | Task 4 |
| 14 | P3 | Contar `reposicion_pedidos` antes de mergear la PR B | Task 13 |
| 15 | P3 | La fecha de emisión tiene que ser la de hoy en hora AR | Task 5 |
| 16 | P2 (TODO) | Intento en `create_reception`, para que un corte de red no deje dos recepciones iguales | Task 12 (`TODOS.md`) |
| + | Director | Columna «Mínimo» en la tabla del estudio | Tasks 3, 9 (decisión 10) |

**Verificado en seco con todos los cambios (2026-09-19)**, sobre una copia limpia de `main` (con la `0132` de la guarda):
- la PR A sola: typecheck limpio, 1333 tests y build;
- todo junto: typecheck limpio, 1302 tests y build;
- PGlite: la `0133` pasa 43 comprobaciones en tres corridas, y la `0136` sale verde.

Dos de los tests nuevos (el del 29/09 y el del segundo pedido del mismo período) se probaron al revés: fallan si se saca el arreglo.

### Lo que ya existe y se reusa

- El patrón de `data/` (hooks sobre `useSupabaseQuery`, mutaciones por RPC): la capa de datos no inventa nada.
- `card`, `chip` y `chipActivo` de `reportes/estilos`; `FilaKv`, `Membrete`, `PieDePagina` y `.spira-print-doc` de `reportes/impresion`: la hoja A4 imprime con el mismo mecanismo que Estadísticas.
- `FormularioReposicion` de la card se muda como `CargarReposicion`, no se reescribe.
- `create_reception` con `pedido_id` y `validar_pedido_de_recepcion` (0128): «Recibir un pedido» no suma una función de alta propia.
- El asistente de Recepción (`ReceptionWizard`, `Step1Scan`) recibe el pedido: no hay un segundo asistente.
- `protocolStatusLabel` y `protocolStatusVar` de Pacientes, para el estado del estudio.
- La guarda de Recepción (`0132`) ya cubre el borrado de recepciones y la escritura directa de renglones: esta parte no la duplica.

### Fuera de alcance

- **Intento en `create_reception`:** a `TODOS.md` (P2). Toca toda Recepción y no es de Reposición.
- **Código de barras en la hoja:** a `TODOS.md` (P3).
- **Sobrante entre estudios y pacientes por entrar:** ya estaban en `TODOS.md`.
- **QA de teclado completo (RD14):** queda como tarea de diseño (T4).
- **Paginar o cachear `reposicion_del_periodo`:** con 4 estudios y unos 12 pedidos por año, no hace falta.
- **Refrescar la pantalla sola (realtime):** el control de la decisión 7 ya evita el daño (dos pedidos) sin sumar suscripciones.

### Modos de falla

| Camino nuevo | Falla realista | Test | Manejo | ¿Se ve? |
|---|---|---|---|---|
| Emitir con la red cortada después de guardar | un segundo pedido al reintentar | PGlite (intento) | intento + refrescar al cerrar | sí: aviso y lista refrescada |
| Emitir desde dos lugares | dos pedidos por lo mismo | PGlite (último visto) | 23514 que nombra el pedido | sí |
| Pantalla abierta desde ayer | pedido con la fecha de ayer | PGlite | 22023 «recargala» | sí |
| Reintento con otras cantidades | hoja distinta de la base | PGlite | 22023 | sí |
| «No va a llegar» sobre lo que ya llegó | compra de más | PGlite | botón escondido + 23514 | sí |
| Recibir lo que está sin verificar | stock duplicado | vitest (`porRecibir`) | precarga neta, sin «Recibir» si llegó todo | sí: aviso |
| El día después del corte con el pedido viajando | tarea falsa en la grilla | vitest (29/09) | modelo | — |
| Embed nuevo de la lista de Recepción | Recepción en blanco en prod | sonda (Task 7) | desambiguar por columna | se ve antes del deploy |
| «Ya lo pedí» de la card vieja | compra doble el primer mes | conteo (Task 13) | se decide antes del merge | sí |
| El mínimo mal sumado | un número prolijo y falso | vitest (tres casos) | modelo | lo cubre el test |
| Reimprimir un pedido a medio recibir | la farmacia entrega dos veces | vitest (`notaDeReimpresion`) | hoja marcada | sí |

**Huecos críticos: 0.** Todo camino que fallaría en silencio tiene test.

### Paralelización

Secuencial.
- La PR A (Tasks 1-7) es modelo y base, y la PR B necesita esa base aplicada.
- Dentro de la PR B, las Tasks 8-10 comparten `src/views/pharma/reposicion/`, y la 11 usa las piezas de la 8.
- Sólo la Task 12 (sacar la card) podría ir en paralelo con la 11, y ahorra poco.

### Resumen

- **Paso 0, alcance:** completo (D1).
- **Hallazgos por sección:**
  - arquitectura: 1;
  - calidad de código: 1;
  - tests: 2, con el diagrama de cobertura hecho;
  - rendimiento: 0.
- **Segunda opinión:** 11 hallazgos, todos incorporados (agente Claude, porque codex no está instalado).
- **Secciones obligatorias:** «Lo que ya existe» y «Fuera de alcance» están escritas.
- **`TODOS.md`:** se propuso una entrada (`create_reception`) y se aceptó.
- **Modos de falla:** 0 huecos críticos.
- **Paralelización:** secuencial.
- **Opción completa:** se eligió en las 16 recomendaciones.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | codex no está instalado; la segunda opinión la hizo un agente Claude (11 hallazgos, todos incorporados) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 15 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (spec) | RD1-RD18 en el spec (2026-09-17); no figura en el log de gstack de esta máquina |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **VERDICT:** ENG CLEARED — listo para ejecutar (subagent-driven, Task 1 en adelante).

NO UNRESOLVED DECISIONS
