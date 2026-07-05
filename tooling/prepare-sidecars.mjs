import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Tauri bundles explicit resource files, so Windows builds need a known Node
// binary beside the sidecar scripts instead of assuming Node exists on the
// user's machine.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'runtime', 'sidecars', 'bin', 'node.exe')

if (process.platform !== 'win32') {
  // Non-Windows packaging can use platform-specific handling later; this build
  // is currently Windows-first.
  console.warn('prepare-sidecars: bundled node.exe is only prepared on Windows')
  process.exit(0)
}

mkdirSync(dirname(target), { recursive: true })

const sourceSize = statSync(process.execPath).size
// Reuse an existing copy when it matches the active Node executable size. This
// avoids rewriting an 80MB ignored file on every build.
if (existsSync(target) && statSync(target).size === sourceSize) {
  const sizeMb = sourceSize / (1024 * 1024)
  console.log(`prepare-sidecars: reusing ${target} (${sizeMb.toFixed(1)} MB)`)
  process.exit(0)
}

// Copy the Node runtime that is currently executing npm/just recipes.
copyFileSync(process.execPath, target)

const sizeMb = sourceSize / (1024 * 1024)
console.log(`prepare-sidecars: bundled ${process.execPath} -> ${target} (${sizeMb.toFixed(1)} MB)`)
