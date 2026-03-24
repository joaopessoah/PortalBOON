// Arquivo de entrada para o Hostinger
// Faz o build do frontend e depois inicia o servidor Express

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distIndex = path.join(__dirname, 'dist', 'index.html')

if (!existsSync(distIndex)) {
    console.log('📦 Pasta dist não encontrada. Iniciando build do frontend...')
    execSync('node node_modules/vite/bin/vite.js build', {
        stdio: 'inherit',
        cwd: __dirname
    })
    console.log('✅ Build concluído!')
} else {
    console.log('✅ Build já existe. Iniciando servidor...')
}

// Inicia o servidor Express
import('./server/index.js')
