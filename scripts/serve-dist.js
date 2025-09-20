// Minimal static file server for serving the built app from dist/
// Used only for local E2E runs where Vite dev/preview isn't available.

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distDir = path.resolve(__dirname, '..', 'dist')
const port = Number(process.env.PORT || 3000)

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function sendFile(res, filePath, statusCode = 200) {
  const ext = path.extname(filePath)
  const contentType = mimeTypes[ext] || 'application/octet-stream'
  res.writeHead(statusCode, { 'Content-Type': contentType })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURI((req.url || '/').split('?')[0])
    const relPath = urlPath === '/' ? '/index.html' : urlPath
    const target = path.join(distDir, relPath)

    // Prevent path traversal
    if (!target.startsWith(distDir)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      sendFile(res, target)
      return
    }

    // SPA fallback
    const indexPath = path.join(distDir, 'index.html')
    if (fs.existsSync(indexPath)) {
      sendFile(res, indexPath)
      return
    }

    res.writeHead(404)
    res.end('Not Found')
  } catch (err) {
    res.writeHead(500)
    res.end('Internal Server Error')
  }
})

server.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Serving dist on http://localhost:${port}`)
})

