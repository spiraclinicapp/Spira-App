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

let branch = ''
try {
  branch = execSync('git branch --show-current', {
    cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  process.exit(0) // sin git a mano → permitir
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
