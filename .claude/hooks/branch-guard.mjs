#!/usr/bin/env node
// Hook PreToolUse (Bash|PowerShell): bloquea `git commit` cuando la rama activa es main.
// Motivo: el working copy es compartido (el Director commitea/mergea en paralelo) y ya
// pasó que un commit de sesión cayera en main por un cambio de rama no detectado — desde
// entonces cada sesión repetía una guardia manual antes de cada commit; esto la reemplaza.
// Escape autorizado: si el comando contiene SPIRA_ALLOW_MAIN (release/bitácora en main
// pedidos por el Director), pasa. Fail-open: ante cualquier error del hook, permitir —
// un hook roto no puede dejar el repo incommiteable.
import { execSync } from 'node:child_process'

const raw = await new Promise((resolve) => {
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (d) => { buf += d })
  process.stdin.on('end', () => resolve(buf))
  process.stdin.on('error', () => resolve(buf))
})

let command = ''
try {
  command = String(JSON.parse(raw)?.tool_input?.command ?? '')
} catch {
  process.exit(0) // stdin ilegible → permitir
}

// Solo un `git commit` real nos interesa. El [^\n|&;]* evita cruzar al siguiente comando
// de una cadena (`git add x && npm run build`), pero sí agarra `git -C dir commit`.
if (!/\bgit\b[^\n|&;]*\bcommit\b/.test(command)) process.exit(0)
if (command.includes('SPIRA_ALLOW_MAIN')) process.exit(0)

/**
 * DÓNDE preguntar la rama. Por defecto, la carpeta del proyecto — pero un `cd <ruta> && git commit`
 * commitea en ESA carpeta, que puede ser un worktree parado en otra rama.
 *
 * Sin esto el hook se equivocaba en las dos direcciones (2026-09-15):
 *   · falso POSITIVO — con la principal en main y el worktree en una rama, frenaba un commit que
 *     iba justo a donde el hook quiere que vaya;
 *   · falso NEGATIVO, que es el peor — con la principal en una rama y el worktree parado en main,
 *     el commit a main pasaba sin que el hook llegara a verlo.
 *
 * Se lee el ÚLTIMO `cd` del comando: en `cd a && cd b && git commit` manda el b.
 */
function dondeMirar(cmd) {
  const cds = [...cmd.matchAll(/(?:^|[\n|&;]\s*)cd\s+(?:"([^"]+)"|'([^']+)'|([^\s&|;]+))/g)]
  const ultimo = cds.at(-1)
  return ultimo ? (ultimo[1] ?? ultimo[2] ?? ultimo[3]) : (process.env.CLAUDE_PROJECT_DIR || process.cwd())
}

let branch = ''
try {
  branch = execSync('git branch --show-current', {
    cwd: dondeMirar(command),
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  process.exit(0) // sin git a mano (o el cd apunta a una carpeta que no existe) → permitir
}

if (branch !== 'main') process.exit(0)

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason:
      'Estás parado en MAIN: el working copy es compartido y los commits de sesión van en rama. ' +
      'Creá (o volvé a) tu rama de trabajo antes de commitear. Si el Director autorizó ' +
      'explícitamente commitear en main (release, bitácora), reintentá anteponiendo ' +
      'SPIRA_ALLOW_MAIN=1 al comando.',
  },
}))
