/**
 * Bytenode compile script — optional, use `npm run electron:build:secure`
 *
 * Prerequisites: npm install --save-dev bytenode
 *
 * This compiles dist-electron/main.js to V8 bytecode (.jsc),
 * then replaces main.js with a loader that requires the .jsc file.
 * preload.js is kept as-is (Electron requires it as plain JS).
 */
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const DIST = join(import.meta.dirname, '..', 'dist-electron')
const MAIN_JS = join(DIST, 'main.js')
const MAIN_JSC = join(DIST, 'main.jsc')
const LOADER_JS = join(DIST, 'main-loader.js')

if (!existsSync(MAIN_JS)) {
  console.error('[bytenode] dist-electron/main.js not found. Run vite build first.')
  process.exit(1)
}

try {
  execSync('npx bytenode --compile ' + MAIN_JS, { stdio: 'inherit' })
} catch {
  console.error('[bytenode] Compile failed. Is bytenode installed? Run: npm install --save-dev bytenode')
  process.exit(1)
}

// Create loader that requires the .jsc bytecode
const loader = `require('bytenode');require('./main.jsc');`
writeFileSync(LOADER_JS, loader)

// Replace main.js with loader (backup original)
const original = readFileSync(MAIN_JS, 'utf8')
writeFileSync(join(DIST, 'main-original.js'), original)
writeFileSync(MAIN_JS, loader)

console.log('[bytenode] Compiled main.js -> main.jsc')
console.log('[bytenode] Loader written to main.js')
console.log('[bytenode] Original saved as main-original.js')
