# Pharma — Wizard de recepción (pantalla propia, 4 pasos) · Diseño

> Rediseño de la recepción de medicación: deja de ser un popup (`NewReceptionModal`) y pasa a una
> **pantalla propia de 4 pasos** dentro del submódulo Recepción. Diseñado el 2026-06-28 con mockups
> y aprobado; **implementación en pausa** (se cerró primero la base). Este doc captura las
> decisiones para retomarlo sin re-derivarlas.

**Fecha:** 2026-06-28 · **Rama:** `feat/pharma-1a` · **Estado:** diseñado, sin implementar.

## Por qué

La recepción real es **masiva** (se reciben ~30 medicamentos de una). Un popup queda chico para eso.
Se piensa como un wizard de **pantalla propia** dentro del submódulo Recepción que ya existe
(la cola muestra "Nueva recepción" → el wizard ocupa la pantalla; al crear/cancelar, vuelve a la
cola). No es submódulo nuevo ni popup. Reemplaza `NewReceptionModal`.

## Los 4 pasos

- **Paso 0 · Setup.** Elegir **protocolo** + **tipo** (producto de investigación / medicación de
  base). El tipo **bifurca** el resto del flujo (ver [[modelo IP vs base]]). Hoy el tipo vive en
  `protocol_medications.kind` (pendiente de la migración del IP); hasta entonces, el Paso 0 puede
  arrancar solo con el protocolo (rama base).
- **Paso 1 · Escaneo (contar).** Pistola de código de barra; la lista se arma en vivo abajo.
  - **Base / IP repetido:** cada beep **suma 1** a la cantidad del medicamento; cantidad editable
    con `−/+` (caja grande sin escanear N veces). Código desconocido → panel ámbar de asociación
    (el `linkCode` ya implementado), que asigna **con el tipo del Paso 0**.
  - **IP único:** cada beep agrega **una unidad rastreable** (un renglón por código), sin "×N".
- **Paso 2 · Lotes y vencimientos.** Un lote por medicamento, con acción **"dividir en varios
  lotes"** (multi-lote, para trazabilidad ANMAT). Para IP, además, el apartado de **droga/nombre**
  (opcional, si se conoce — puede estar cegado).
- **Paso 3 · Resumen + confirmar.** Fecha de recepción + notas, repaso de todo lo que ingresa, y
  recién ahí **"Crear recepción"**.

## Decisiones tomadas

- **Conteo:** cada beep suma 1, editable con `−/+`; la cantidad se fija en el Paso 1.
- **Multi-lote:** sí, default un lote por medicamento + "dividir en varios lotes".
- **Fecha + notas:** en el Paso 3 (parte de confirmar), no al inicio.
- **El `linkCode`** (panel ámbar) es un interruptor *dentro* del Paso 1, no una pantalla.

## Dependencias y alcance

- El **Paso 0 (bifurcación por tipo)** depende del **modelo IP** (`protocol_medications.kind` +
  el paradigma de unidad rastreable). Se puede implementar el wizard **para base primero** (Paso 0
  solo protocolo; conteo por suma; sin rama IP) y sumar la rama IP cuando el modelo exista.
- Reemplaza `src/views/pharma/NewReceptionModal.tsx` por una vista de pasos; reusa la capa de datos
  de recepción (`receptions.ts`) y `linkCode`.

## Referencias

- Modelo IP: [`2026-06-28-pharma-modelo-ip-vs-base-design.md`](2026-06-28-pharma-modelo-ip-vs-base-design.md).
- Vista actual a reemplazar: [`NewReceptionModal.tsx`](../../../src/views/pharma/NewReceptionModal.tsx).
- Memorias: `pharma-ip-vs-base-modelo`.
