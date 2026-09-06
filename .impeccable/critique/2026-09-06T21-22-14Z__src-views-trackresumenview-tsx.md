---
target: "Coordinación: Resumen + Pacientes (tarjetas)"
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-06T21-22-14Z
slug: src-views-trackresumenview-tsx
---
Method: dual-agent (A: revision de diseno sobre codigo · B: detector + medicion en navegador). Discrepancia entre A y B sobre el desborde de la linea de tiempo, resuelta con medicion propia a 1366 y 1536.

## Design Health Score

| # | Heuristica | Puntaje | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3/4 | Estados por bloque, `—` al cargar. Los KPIs no dicen que estan filtrados por ambito |
| 2 | Correspondencia mundo real | 2/4 | "Pendiente" significa 3 cosas distintas a <400px de distancia |
| 3 | Control y libertad | 3/4 | Ambito y visita en la URL; atras cierra el modal |
| 4 | Consistencia y estandares | 1/4 | 5 recetas de tarjeta, 3 tratamientos del codigo de protocolo, 2 sombras de hover |
| 5 | Prevencion de errores | 3/4 | Nada destructivo. Resta: `[V21] V21` hace dudar del dato |
| 6 | Reconocer antes que recordar | 2/4 | Destino oculto hasta el hover; las 4 KPI no dan cursor |
| 7 | Flexibilidad y eficiencia | 3/4 | URL dictable, ambito persistido, expandir in situ |
| 8 | Estetica y minimalismo | 2/4 | ~43 blancos pulsables; Proximas visitas con 4 pesos y 3 cajas por fila |
| 9 | Recuperacion de errores | 4/4 | El error nombra QUE no cargo y ofrece Reintentar ahi mismo |
| 10 | Ayuda y documentacion | 1/4 | Cero. Ni un title sobre IVRS, VNP, ventana, adherencia, W12 |
| **Total** | | **24/40** | Manejo de errores de primer nivel, consistencia de ultimo |

## Veredicto de especificidad

Autorado para Spira, sin dudas. No hay AI slop ni gradientes ni tarjetas-metrica gigantes.
El problema es que hay CINCO DIALECTOS del mismo idioma en una pantalla.

Detector: `[]` (0 hallazgos, exit 0) sobre 13 archivos. NO es aprobado: canario de 10
anti-patrones plantados detecto 1/10. Sobre .tsx cae en regex; el modo real necesita
puppeteer, no instalado. Overlays no inyectados. La evidencia buena es la medicion en vivo.

## Lo que funciona

1. Estados por bloque, no por pantalla. Cinco consultas que fallan y cargan solas.
2. La banda de severidad CALCULADA, no fija (resistio un mock que pedia rojo permanente).
3. El pie que promete a donde va, leyendo el rotulo del registry en tiempo de render.

Shell de tarjeta uniforme y ya logrado: las 5 miden 585.5 x padding 18px 20px x radius 16
x borde 1px line; los 5 titulos identicos (Schibsted 16px/700).

## Problemas prioritarios

### [P0] El codigo de visita se imprime dos veces por fila en Proximas visitas
Verificado en 3 de 3 filas: `Osvaldo… | EFC18419 | 032000320004 | V21 | V21 | Pendiente`.
Causa: VisitSummaryRow.tsx:69 usa visitCode() + visit.visit_name crudo, salteando
visitTitle(), que ya tiene la regla de colapso ("pasa seguido con datos reales").
Fix: usar visitTitle(visit).

### [P0] Las 4 tarjetas de KPI del Resumen no muestran cursor pointer
Medido: <div role="button" class="spira-card-link spira-dest-group"> con cursor: auto,
286x123, navegan. En la misma pantalla las 8 filas (.spira-row-link) SI dan pointer.
Causa: tokens.css:647 `.spira-card-link` declara solo `border`. Unica de las 7 instancias
a la que le falta. Fix una linea: agregar `cursor: pointer;` a la regla.

### [P1] "Proximas visitas" habla otro idioma que sus cuatro hermanas
Medido, fila contra fila:
- Familia del nombre: Schibsted 15px/700 vs Inter 13.5px/600 en las otras cuatro
- Pesos distintos en la fila: 4 (400/600/700/800) vs 1-2
- Tamanos distintos: 5 (11.5/12/12.5/13/15) vs 2
- Cajas con fondo tenido: 3 vs 0
- Alto: 68.8px vs 55-58px · Ancho: 543.5 (no sangra) vs 584 (sangra a borde)
Razon de fondo: la pastilla en tinta plena viene de Visitas del dia, donde el comentario
la justifica ("es el dato que se busca al escanear"). En el Resumen se escanea por NOMBRE.
Y el handoff design_handoff_resumen_tareas_enfoque ya habia DESCARTADO el pill solido con
fondo de color, eligiendo el estado integrado en la oracion con " · ". Las otras cuatro
siguen ese canon; esta quedo con el patron viejo, usado tres veces por fila.

### [P1] La linea de tiempo se sale de la tarjeta (y nunca esta alineada)
A 1536 NO desborda (ultimo circulo 1441, margen 1463). A 1366 SI:
  borde de tarjeta 1310 · margen de contenido 1293 · ultimo circulo 1311
  → 18px fuera del margen, 1px fuera del BORDE. flow scrollWidth 607 vs clientWidth 567
  (40px de desborde) con overflowX: visible → se sale en vez de scrollear.
Segundo problema, visible SIEMPRE: padding '6px 16px 16px 70px' (PdPatientRow.tsx:145).
Medido a 1536: nombre en x=672, primera pastilla en x=726 → 54px de sangria extra.
PdVisitFlow.tsx:74 tiene 7 columnas de width 72 flex 0 0 auto (no se achican).
Minimo de contenido 628px; disponible 737 a 1536 y 567 a 1366.

### [P2] Dos sombras de hover distintas para el mismo gesto
Pacientes/Protocolos usan --spira-shadow-md (0 12px 32px = la del MODAL); el Resumen usa
--spira-shadow-hover (0 4px 14px). Escritas con onMouseEnter + useState, contra la regla
de CLAUDE.md de que el realce va en CSS. Fix: className="spira-card-link".

## Propuesta

1. Canon de fila en piezas.tsx (FilaDeResumen): linea 1 sujeto Inter 600/13.5 ink;
   linea 2 contexto · estado Inter 400/12.5 muted (solo la palabra de estado en 700 con su
   color); flecha siempre visible; fila a borde (calc(100% + 40px), margin 0 -20px,
   padding 11px 20px); alto ~56px; CERO cajas tenidas.
2. Proximas visitas adopta el canon → de 4 pesos a 2, de 3 cajas a 0, de 2 familias a 1,
   de 68.8px a ~56, sin perder un dato. VisitSummaryRow tiene UN solo consumidor.
3. Pelotitas: padding a 16 uniforme; overflow-x auto; columnas minWidth 56 / flex 0 1 72px;
   pastillas +N pasan a <button>. (Alternativa: reemplazar por el cronograma vertical
   acotado a ±3 visitas.)
4. KPIs de la ficha: "Ventanas por vencer" navega a Pendientes con ?protocolo= (la maquina
   existe); los otros tres bajan de 21 a 17px para que "numero grande = pulsable" sea regla.

## Banderas rojas por persona

Coordinadora bajo presion (8am): no hay donde apoyar el ojo primero (5 titulos de identico
peso); "Pendientes 44" muestra el 6,8%; los 4 numeros mas grandes no dan la mano; [V21] V21
se lee como error de carga.

Coordinadora nueva: ni una palabra explicada (VNP, IVRS, V21, ventana, adherencia, W12);
"Pendiente" significa 3 cosas en la misma pantalla; el mismo protocolo se ve de 3 maneras
y NO significa nada distinto; los KPIs le ensenan una regla falsa.

## Observaciones menores

- cardTitle 16px vs DESIGN.md 17px (.spira-h3 existe sin usarse)
- padding de card 18x20 vs DESIGN.md 22x24 (divergencia de toda la app)
- pastillaVisita es VisitCodeTag reescrito con otro padding (2/8 vs 2/9)
- Icono de Dispensaciones en azul acero = acento del modulo CONTABLE, que no existe todavia;
  el de Tareas en el token de ADVERTENCIA sobre una tarjeta que no advierte nada
- Dos barras de progreso casi identicas en dos verdes distintos
- 3 de 5 tarjetas tienen icono: la peor de las tres opciones
- Comentario stale en VisitSummaryRow:11 dice que la comparte "Tu dia"; tiene un consumidor

## Preguntas

1. Un resumen que muestra el 6,8% de sus pendientes, es un resumen o un adelanto?
2. Cinco tarjetas es el numero correcto, o el que quedo?
3. Cuanto de la variedad del mosaico es diseno y cuanto es arqueologia?
