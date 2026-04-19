import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const JavaScriptObfuscator = require('javascript-obfuscator')
const CleanCSS = require('clean-css')

const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build.js', 'package.json',
  'package-lock.json', '.github', 'backend.js',
])

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    if (SKIP.has(entry)) continue
    const s = path.join(src, entry)
    const d = path.join(dest, entry)
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d)
  }
}

console.log('Copying files to dist...')
if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true })
copyDir('.', 'dist')

console.log('Obfuscating assets/app.js...')
const jsPath = path.join('dist', 'assets', 'app.js')
const jsCode = fs.readFileSync(jsPath, 'utf-8')
const obfuscated = JavaScriptObfuscator.obfuscate(jsCode, {
  compact: true,
  selfDefending: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  stringEncoding: true,
  stringEncodingThreshold: 0.5,
  splitStrings: true,
  splitStringsChunkLength: 5,
  identifierNamesGenerator: 'hexadecimal',
  identifierNamesPrefix: '_0x',
  renameGlobals: false,
})
fs.writeFileSync(jsPath, obfuscated.getObfuscatedCode())

console.log('Minifying assets/styles.css...')
const cssPath = path.join('dist', 'assets', 'styles.css')
const cssCode = fs.readFileSync(cssPath, 'utf-8')
const minified = new CleanCSS({ level: 2 }).minify(cssCode)
if (minified.errors.length) {
  console.error('CSS errors:', minified.errors)
  process.exit(1)
}
fs.writeFileSync(cssPath, minified.styles)

console.log(`Done. JS: ${(jsCode.length / 1024).toFixed(1)}kb → ${(obfuscated.getObfuscatedCode().length / 1024).toFixed(1)}kb | CSS: ${(cssCode.length / 1024).toFixed(1)}kb → ${(minified.styles.length / 1024).toFixed(1)}kb`)
