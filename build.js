const fs = require('fs')
const path = require('path')
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

function obfuscate(code) {
  return JavaScriptObfuscator.obfuscate(code, {
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
  }).getObfuscatedCode()
}

console.log('Copying files to dist...')
if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true })
copyDir('.', 'dist')

console.log('Converting styles.css to styles.js...')
const cssPath = path.join('dist', 'assets', 'styles.css')
const cssCode = fs.readFileSync(cssPath, 'utf-8')
const minifiedCss = new CleanCSS({ level: 2 }).minify(cssCode).styles
const cssAsJs = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(minifiedCss)};document.head.appendChild(s);})();`
fs.writeFileSync(path.join('dist', 'assets', 'styles.js'), obfuscate(cssAsJs))
fs.unlinkSync(cssPath)

console.log('Obfuscating app.js...')
const jsPath = path.join('dist', 'assets', 'app.js')
fs.writeFileSync(jsPath, obfuscate(fs.readFileSync(jsPath, 'utf-8')))

console.log('Updating HTML files...')
const htmlFiles = [
  'dist/index.html',
  'dist/packages/index.html',
  'dist/portal/index.html',
  'dist/buy/index.html',
]
for (const file of htmlFiles) {
  if (!fs.existsSync(file)) continue
  let html = fs.readFileSync(file, 'utf-8')
  html = html.replace(
    /<link[^>]*href="([^"]*?)styles\.css"[^>]*>/g,
    (_, prefix) => `<script src="${prefix}styles.js"></script>`
  )
  fs.writeFileSync(file, html)
}

console.log('Done.')
