# CLAUDE.md — Spira App

Guía para agentes que trabajan en este repo. Es complementaria, no un resumen:
el **panorama del proyecto** (qué es, stack, cómo correr, versionado) ya vive en
[`README.md`](README.md) y el de la base en [`supabase/README.md`](supabase/README.md).
Leelos primero. Acá va lo operativo y las reglas que evitan romper cosas.

## Qué es

Spira es una **plataforma modular de investigación clínica** de la **Fundación Scherbovsky**
(Mendoza, AR): un **Core compartido** (identidad, RBAC, auditoría, RLS, realtime — sistema
auditable ANMAT / ICH-GCP) sobre el que se montan módulos independientes.

**No es solo la unificación de dos productos previos.** **Track** (coordinación clínica) y
**Pharma** (farmacia de investigación) son los primeros módulos —nacieron de fusionar dos
MVPs—, pero esa fusión fue el punto de partida, no el objetivo. La apuesta es la **base
modular para todo el flujo del centro**: el roadmap suma **Lab**, **Contable/Gerencia**,
módulo de **médicos** y, más adelante, integraciones como WhatsApp e IA, todo sobre el mismo
Core. Al escribir, pensá en términos de módulos sobre un núcleo común, no de "dos apps juntas".

## Comandos

```bash
npm install
npm run dev         # Vite → http://localhost:5173  (requiere .env, ver abajo)
npm run typecheck   # tsc --noEmit  ← el GATE de verificación
npm run build       # typecheck + build de producción
```

- **No hay suite de tests.** El control de calidad antes de dar algo por hecho es
  `npm run typecheck` (verde) + verificar en el navegador. No afirmes "anda" sin eso.
- `.env` necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (ver `.env.example`).
  El cliente (`src/lib/supabase.ts`) tira error si faltan.

## ⚠️ Reglas duras (romper esto hace daño real)

1. **El demo/prod tiene DATOS REALES.** Si tenés que crear o borrar pacientes/visitas para
   probar, usá **solo registros que vos creaste con prefijo `TEST-*`** y borrá exactamente
   esos. **Nunca** barras "todo lo de tipo X" ni borres en lote por categoría: ya pasó una
   vez que se perdió data real (se recuperó del `audit_log`). Ante la duda, no borres.
2. **No hay acceso SQL directo a producción.** Los cambios de schema se aplican **a mano**
   en el dashboard de Supabase, en orden. No asumas que podés correr SQL contra prod.
3. **Migraciones = inmutables y numeradas.** La fuente de verdad del schema son los archivos
   `supabase/migrations/NNNN_*.sql`, aplicados en orden. **Nunca edites una migración ya
   aplicada ni renumeres**: todo cambio de base es un archivo **nuevo** con el siguiente
   número. La última aplicada va por la `0039` (ver `supabase/README.md`).
4. **El preview es una sesión de navegador aparte de la del usuario.** No podés precargarle
   formularios ni ver su estado; verificá las escrituras recargando tu propia instancia.

## Arquitectura (lo mínimo para no desentonar)

Shell modular: módulos y submódulos en `src/modules/registry.ts`; cada submódulo resuelve a
una vista vía `src/views/registry.tsx` (clave `"<modulo>/<sub>"`; lo no listado cae a
`Placeholder`, así los módulos a futuro —Lab, Contable— no rompen). Sin react-router ni
react-query: la navegación es estado propio del shell.

| Carpeta | Qué |
|---|---|
| `src/shell/` | Top bar, navegación, login (`AppShell.tsx`, `Login.tsx`) |
| `src/views/` | Una vista por submódulo; `views/track/` los componentes del recorrido de visitas |
| `src/data/` | Capa de datos: hooks de lectura + funciones de mutación contra Supabase |
| `src/lib/` | `supabase.ts` (cliente), `auth.tsx`, `useSupabaseQuery.ts`, `theme.ts`, `dates.ts` |
| `src/components/` | UI reusable (Modal, Icon, FormField, …) |
| `supabase/migrations/` | Schema (numeradas, fuente de verdad) |

## Convenciones de código (seguilas al escribir)

- **Capa de datos** (`src/data/*.ts`): las **lecturas** son hooks `useXxx()` que envuelven
  `useSupabaseQuery(queryFn, deps)`; las **mutaciones** son funciones `async` que llaman a
  un **RPC** (`supabase.rpc(...)`, para altas/borrados atómicos con authz server-side) o a un
  `.from(...).update(...)` directo. Mirá `src/data/patients.ts` como patrón de referencia.
- **Tipos a mano**, no generados: se declaran `interface`s por fila/input en cada archivo de
  `data/`, con comentarios que citan la migración que introdujo cada columna.
- **Errores → mensajes serenos en castellano.** Traducí los códigos de Postgres
  (`23505` duplicado, `23502` faltante, `42501` permiso/RLS) a un texto claro y calmo para
  el usuario; ver los helpers `*ErrorMessage` en `data/`.
- **RLS filtra en silencio:** tras un `update`/`delete` directo, **0 filas afectadas = sin
  permiso**, no éxito. Manejalo (ver `updatePatient`).
- **Estilo:** CSS con variables en `src/styles/tokens.css` (sin Tailwind ni CSS-in-JS),
  íconos **Lucide** vía `components/Icon.tsx`, TypeScript **strict**.
- **Idioma:** comentarios, nombres de dominio y copy de UI en **castellano rioplatense**.
  El código existente tiene comentarios densos y explicativos (el porqué, no el qué) —
  igualá esa densidad y tono.
- **Privacidad de paciente** es transversal (`components/PrivacyAvatar.tsx`); respetala en
  vistas nuevas que muestren personas.

## Contexto de diseño

El sistema visual **"Sereno"** (petróleo + papel cálido, calma clínica) está documentado para
que cualquier agente diseñe on-brand. Leelo antes de tocar UI:

- **[`PRODUCT.md`](PRODUCT.md)** — el *qué/quién/por qué*: usuarios, propósito, personalidad de
  marca, anti-referencias, principios y accesibilidad (WCAG 2.1 AA).
- **[`DESIGN.md`](DESIGN.md)** — el *cómo se ve*: tokens, color, tipografía, elevación,
  componentes y "Do's and Don'ts" (formato spec; `.impeccable/design.json` lo extiende).
- Marca de origen y tokens vivos: `docs/identidad-visual/` + `src/styles/tokens.css`.

Generados con la skill **impeccable** (`/impeccable document` regenera `DESIGN.md`;
`/impeccable critique|audit|polish <archivo>` revisan una vista).

## Seguridad

RLS en todas las tablas + `audit_log` transversal (inmutable, recuperable) + operaciones
privilegiadas (alta/borrado de paciente, generación de visitas/stock) vía funciones
`SECURITY DEFINER`. El schema pasó dos rondas de revisión adversarial → ver
`supabase/schema-review.md`. Track se aísla por protocolo; **Pharma es central** (ve todos).

## Para orientarte

- Estado y narrativa por jornada: `docs/bitacora/` (incluye handoffs).
- Roadmap y los 3 pasos del proyecto: `docs/#4- ROADMAP.md`.
- Índice de migraciones y decisiones de diseño de la base: `supabase/README.md`.
