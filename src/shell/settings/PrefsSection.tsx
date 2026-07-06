import { useState } from 'react'
import type { ThemePref } from '../../lib/theme'
import { StCard, StRow, StSeg, StNote, btnGhostSoon } from './primitives'

/* Preferencias. El ÚNICO control vivo es el Tema (cableado a setPref del shell:
   claro/oscuro/sistema, sincronizado con el botón de la top bar). El resto es
   estado local de demo: togglea visualmente pero todavía no persiste ni cambia
   el comportamiento — la nota al pie lo aclara para no confundir. */

export function PrefsSection({ pref, setPref }: { pref: ThemePref; setPref: (p: ThemePref) => void }) {
  const [dens, setDens] = useState<'comoda' | 'compacta'>('comoda')
  const [lang, setLang] = useState<'es' | 'en'>('es')
  const [datef, setDatef] = useState<'dmy' | 'iso'>('dmy')
  const [home, setHome] = useState<'inicio' | 'ultimo'>('inicio')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <StCard title="Apariencia">
        <StRow label="Tema" sub="Claro, oscuro o según tu sistema">
          <StSeg
            label="Tema"
            value={pref}
            onChange={setPref}
            options={[{ v: 'light', l: 'Claro' }, { v: 'dark', l: 'Oscuro' }, { v: 'system', l: 'Sistema' }]}
          />
        </StRow>
        <StRow label="Densidad" sub="Espaciado de listas y tablas" last>
          <StSeg
            label="Densidad"
            value={dens}
            onChange={setDens}
            options={[{ v: 'comoda', l: 'Cómoda' }, { v: 'compacta', l: 'Compacta' }]}
          />
        </StRow>
      </StCard>

      <StCard title="Regional">
        <StRow label="Idioma">
          <StSeg label="Idioma" value={lang} onChange={setLang} options={[{ v: 'es', l: 'Español' }, { v: 'en', l: 'English' }]} />
        </StRow>
        <StRow label="Formato de fecha">
          <StSeg label="Formato de fecha" value={datef} onChange={setDatef} options={[{ v: 'dmy', l: 'DD/MM/AAAA' }, { v: 'iso', l: 'AAAA-MM-DD' }]} />
        </StRow>
        <StRow label="Zona horaria" sub="Tomada de tu navegador" last>
          <button style={btnGhostSoon} disabled title="Próximamente">Cambiar</button>
        </StRow>
      </StCard>

      <StCard title="Al iniciar sesión">
        <StRow label="Página de inicio" sub="Dónde abre Spira al entrar" last>
          <StSeg label="Página de inicio" value={home} onChange={setHome} options={[{ v: 'inicio', l: 'Inicio' }, { v: 'ultimo', l: 'Último módulo' }]} />
        </StRow>
      </StCard>

      <StNote>Salvo el tema, estas preferencias todavía no se guardan entre sesiones.</StNote>
    </div>
  )
}
