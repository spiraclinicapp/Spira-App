# Handoff · Ajustes → Equipo y accesos

Bundle de diseño del **8 de septiembre de 2026**, copiado al repo el 2026-09-09 antes de
implementar (regla del `CLAUDE.md`: el mock va al repo ANTES, nunca se implementa desde
snippets sueltos).

- `source/Handoff - Equipo y accesos.html` — el handoff, en siete secciones.
- `screenshots/` — las cinco piezas visuales:

| Archivo | Qué muestra |
|---|---|
| `img-lista-escudo.png` | La fila del equipo: prosa con puntos medios + escudito junto al nombre + ojo + «Editar acceso» |
| `img-popup-resumen.png` | El popup de solo lectura que abre el ojo |
| `img-modulos-info.png` | La tarjeta «Módulos» con el ⓘ apoyado a la derecha del selector |
| `img-estudios-card.png` | La tarjeta «Estudios que ve»: botón verde + chips con × |
| `img-menu-anadir.png` | El menú de añadir: sólo lo que falta, cada fila termina en `+` |

## ⚠️ Falta el mock

El handoff cita `Mock de referencia: Ajustes - Variantes.html` y **ese archivo no llegó en el
bundle**. No está en Downloads ni en el repo. Las capturas son, por ahora, la única fuente de
verdad de la geometría; las variantes B (dos columnas) y C (documento) que el §07 descarta no
se pueden consultar. Si el mock aparece, va acá adentro y la geometría se clava contra él.

## Desvíos deliberados

Decididos en la `/plan-eng-review` del 2026-09-09 (ver `docs/plan-ajustes-equipo-reskin.md`):

1. **Los hex del §06 se reemplazan por tokens.** `#B0823F` como color de texto da 3,44:1 sobre
   papel (AA pide 4,5) y `#0F5F57` da 2,14:1 sobre la card del tema oscuro. Se usan
   `--spira-acc-deep-warn` y `--spira-acc-deep-track`, que en tema claro rinden el mismo tono.
2. **La fila conserva el aviso de «Dada de baja».** La captura no lo muestra, y sin él una
   cuenta cerrada se lee igual que una recién creada sin accesos. El email se muda al popup.
