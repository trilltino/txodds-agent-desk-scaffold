import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'sidecars', 'bin', 'node.exe')

if (process.platform !== 'win32') {
  console.warn('prepare-sidecars: bundled node.exe is only prepared on Windows')
  process.exit(0)
}

mkdirSync(dirname(target), { recursive: true })

const sourceSize = statSync(process.execPath).size
if (existsSync(target) && statSync(target).size === sourceSize) {
  const sizeMb = sourceSize / (1024 * 1024)
  console.log(`prepare-sidecars: reusing ${target} (${sizeMb.toFixed(1)} MB)`)
  process.exit(0)
}

copyFileSync(process.execPath, target)

const sizeMb = sourceSize / (1024 * 1024)
console.log(`prepare-sidecars: bundled ${process.execPath} -> ${target} (${sizeMb.toFixed(1)} MB)`)
