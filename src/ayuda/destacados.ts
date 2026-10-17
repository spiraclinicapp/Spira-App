import type { Destacado } from './panel'

/* «Lo esencial» del Inicio de la Ayuda: lo que conviene tener a mano, elegido a mano y no medido (no hay conteo de
   consultas; por eso no se llama «Lo más consultado», docs/plan-ayuda-manual.md, A12). Mezcla tutoriales y
   preguntas de todos los módulos; a cada uno le sale sólo lo que puede ver (`destacadosVisibles`). Los ids tienen
   que existir: lo chequea `panel.test.ts`. */
export const DESTACADOS: readonly Destacado[] = [
  { tipo: 'tutorial', id: 'dispensar' },
  { tipo: 'pregunta', id: 'por-que-no-veo' },
  { tipo: 'tutorial', id: 'atender-visita' },
  { tipo: 'pregunta', id: 'escaneo-no-corresponde' },
  { tipo: 'tutorial', id: 'agendar-reprogramar' },
  { tipo: 'pregunta', id: 'dar-feedback' },
]
