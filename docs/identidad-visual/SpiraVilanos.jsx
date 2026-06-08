/* SpiraVilanos.jsx — four distinct interpretations of the dandelion-seed (vilano) mark.
   Each is procedurally constructed so the geometry is honest, not eyeballed.
   Exports to window: Vilano1 (Sereno), Vilano2 (Precisión), Vilano3 (Raíz), Vilano4 (Vuelo). */

const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;

/* ----------------------------------------------------------------------------
   1 · SERENO — single pappus / parachute. Delicate monoline, airy fan,
   feathery tips. Everything thin and calm.
---------------------------------------------------------------------------- */
function Vilano1({ size = 120, color = "#0F5F57", stroke = 1.4 }) {
  const cx = 100, cy = 118, R = 86;        // convergence point + canopy radius
  const N = 19;
  const spread = 150;                       // total fan angle (deg)
  const filaments = [];
  for (let i = 0; i < N; i++) {
    const a = rad(-90 - spread / 2 + (spread * i) / (N - 1)); // around straight-up
    const ex = cx + R * Math.cos(a);
    const ey = cy + R * Math.sin(a);
    filaments.push({ ex, ey, a });
  }
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 200 240" fill="none"
         stroke={color} strokeWidth={stroke} strokeLinecap="round">
      {/* feathery filaments */}
      {filaments.map((f, i) => {
        // tiny terminal hairs for the down-feather look
        const tufts = [-16, 0, 16].map((d) => {
          const ta = f.a + rad(d);
          return `M ${f.ex} ${f.ey} L ${f.ex + 9 * Math.cos(ta)} ${f.ey + 9 * Math.sin(ta)}`;
        });
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={f.ex} y2={f.ey} opacity="0.85" />
            <path d={tufts.join(" ")} strokeWidth={stroke * 0.7} opacity="0.6" />
            <circle cx={f.ex} cy={f.ey} r="1.1" fill={color} stroke="none" opacity="0.5" />
          </g>
        );
      })}
      {/* slender beak */}
      <line x1={cx} y1={cy} x2={cx} y2={196} opacity="0.9" />
      {/* seed (achene) */}
      <path d="M 100 196 C 96 206 96 216 100 224 C 104 216 104 206 100 196 Z"
            fill={color} stroke="none" opacity="0.92" />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   2 · PRECISIÓN — full radial seed-head as a measurement diagram.
   Even spokes, dots on a true circle, guide ring, center node. Clinical.
---------------------------------------------------------------------------- */
function Vilano2({ size = 120, color = "#101314", accent = "#2347E8", stroke = 1.3 }) {
  const cx = 100, cy = 100, R = 80, N = 30;
  const spokes = [];
  for (let i = 0; i < N; i++) {
    const a = (TAU * i) / N;
    spokes.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none"
         stroke={color} strokeWidth={stroke} strokeLinecap="round">
      <circle cx={cx} cy={cy} r={R} stroke={color} strokeWidth={stroke * 0.6}
              opacity="0.22" />
      <circle cx={cx} cy={cy} r={R * 0.62} stroke={color} strokeWidth={stroke * 0.6}
              strokeDasharray="2 5" opacity="0.3" />
      {spokes.map((s, i) => (
        <g key={i}>
          <line x1={cx} y1={cy} x2={s.x} y2={s.y} opacity="0.78" />
          <circle cx={s.x} cy={s.y} r="2.1" fill={i % 5 === 0 ? accent : color}
                  stroke="none" />
        </g>
      ))}
      <circle cx={cx} cy={cy} r="5" fill={accent} stroke="none" />
      <circle cx={cx} cy={cy} r="9.5" stroke={accent} strokeWidth={stroke} />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   3 · RAÍZ — organic single pappus. Heavier filled seed, curved beak,
   irregular hand-felt filaments of varying length. Botanical, warm.
---------------------------------------------------------------------------- */
function Vilano3({ size = 120, color = "#2A2118", seedColor }) {
  const sc = seedColor || color;
  const cx = 108, cy = 104, base = 78;
  const N = 15, spread = 158;
  // deterministic "jitter" so it feels drawn, not generated
  const jit = (i) => Math.sin(i * 12.9898) * 0.5; // -0.5..0.5-ish
  const fil = [];
  for (let i = 0; i < N; i++) {
    const a = rad(-90 - spread / 2 + (spread * i) / (N - 1) + jit(i) * 7);
    const len = base * (0.82 + 0.18 * Math.abs(Math.cos(i)));
    const ex = cx + len * Math.cos(a);
    const ey = cy + len * Math.sin(a);
    // gentle curve control point
    const mx = cx + (len * 0.5) * Math.cos(a) + jit(i + 3) * 10;
    const my = cy + (len * 0.5) * Math.sin(a) + jit(i + 7) * 10;
    fil.push({ ex, ey, mx, my, a });
  }
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 200 236" fill="none"
         stroke={color} strokeWidth={2} strokeLinecap="round">
      {fil.map((f, i) => {
        const t1a = f.a - rad(20), t2a = f.a + rad(20);
        return (
          <g key={i}>
            <path d={`M ${cx} ${cy} Q ${f.mx} ${f.my} ${f.ex} ${f.ey}`} opacity="0.9" />
            <path d={`M ${f.ex} ${f.ey} l ${8 * Math.cos(t1a)} ${8 * Math.sin(t1a)}
                      M ${f.ex} ${f.ey} l ${8 * Math.cos(t2a)} ${8 * Math.sin(t2a)}`}
                  strokeWidth="1.4" opacity="0.7" />
          </g>
        );
      })}
      {/* curved beak */}
      <path d={`M ${cx} ${cy} C 104 140 92 168 96 196`} strokeWidth="2.4" />
      {/* plump achene seed */}
      <path d="M 96 196 C 86 200 84 214 92 226 C 96 230 104 230 108 224
               C 114 214 110 200 100 196 Z"
            fill={sc} stroke="none" />
      <path d="M 99 200 l -3 22 M 103 200 l 1 20" stroke="#fff" strokeWidth="0.9"
            opacity="0.35" />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
   4 · VUELO — dispersion. One pappus releasing; several plumelets break off
   and drift across the frame with motion. Asymmetric, dynamic, luminous.
---------------------------------------------------------------------------- */
function Vilano4({ size = 120, color = "#5BE0C6", stroke = 1.4 }) {
  // anchored pappus, lower-left
  const cx = 64, cy = 150, R = 60, N = 13, spread = 150;
  const anchored = [];
  for (let i = 0; i < N; i++) {
    const a = rad(-70 - spread / 2 + (spread * i) / (N - 1));
    anchored.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  // little flying plumelets (mini bursts) drifting up-right
  const plumes = [
    { x: 118, y: 96, r: 16, n: 8 },
    { x: 150, y: 60, r: 12, n: 7 },
    { x: 168, y: 110, r: 9, n: 6 },
    { x: 134, y: 134, r: 7, n: 6 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none"
         stroke={color} strokeWidth={stroke} strokeLinecap="round">
      {/* anchored canopy */}
      {anchored.map((s, i) => (
        <line key={i} x1={cx} y1={cy} x2={s.x} y2={s.y} opacity="0.85" />
      ))}
      <line x1={cx} y1={cy} x2={cx + 6} y2={188} opacity="0.9" />
      <path d="M 66 188 c -3 6 -3 12 0 18 c 3 -6 3 -12 0 -18 Z" fill={color} stroke="none" />
      {/* motion streaks */}
      {[[92, 132, 112, 110], [104, 150, 128, 136], [120, 110, 144, 86]].map((m, i) => (
        <path key={"m" + i} d={`M ${m[0]} ${m[1]} L ${m[2]} ${m[3]}`}
              strokeWidth={stroke * 0.6} strokeDasharray="1 6" opacity="0.45" />
      ))}
      {/* flying plumelets */}
      {plumes.map((p, pi) => (
        <g key={"p" + pi} opacity={0.95 - pi * 0.12}>
          {Array.from({ length: p.n }).map((_, j) => {
            const a = (TAU * j) / p.n + pi;
            return (
              <line key={j} x1={p.x} y1={p.y}
                    x2={p.x + p.r * Math.cos(a)} y2={p.y + p.r * Math.sin(a)}
                    strokeWidth={stroke * 0.85} />
            );
          })}
          <circle cx={p.x} cy={p.y} r="1.6" fill={color} stroke="none" />
        </g>
      ))}
    </svg>
  );
}

Object.assign(window, { Vilano1, Vilano2, Vilano3, Vilano4 });
