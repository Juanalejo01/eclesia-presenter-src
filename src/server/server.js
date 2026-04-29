const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')
const os = require('os')

const PORT = 3000
let currentSlide = { text: '', reference: '', type: 'blank' }

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === 'IPv4' && !config.internal) return config.address
    }
  }
  return '127.0.0.1'
}

function startServer() {
  const app = express()
  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: '*' } })

  // Overlay para OBS — browser source apunta aquí
  app.get('/overlay', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background: transparent; display:flex; align-items:flex-end; justify-content:center;
         height:100vh; padding:40px; font-family: 'Segoe UI', sans-serif; }
  #slide { text-align:center; color:white; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
  #text { font-size:42px; font-weight:600; line-height:1.4; }
  #reference { font-size:22px; opacity:0.85; margin-top:8px; }
</style>
</head>
<body>
  <div id="slide">
    <div id="text"></div>
    <div id="reference"></div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io()
    socket.on('slide:update', (data) => {
      document.getElementById('text').textContent = data.text || ''
      document.getElementById('reference').textContent = data.reference || ''
    })
  </script>
</body>
</html>`)
  })

  // Remote control para móvil
  app.get('/remote', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EclesiaPresenter — Control</title>
<style>
  body { font-family:'Segoe UI',sans-serif; background:#0f172a; color:#e2e8f0;
         display:flex; flex-direction:column; align-items:center; padding:20px; min-height:100vh; }
  h1 { font-size:18px; margin-bottom:20px; color:#60a5fa; }
  #current { background:#1e293b; border-radius:12px; padding:20px; width:100%; max-width:400px;
             text-align:center; font-size:16px; line-height:1.6; margin-bottom:20px; min-height:80px; }
  .controls { display:flex; gap:12px; width:100%; max-width:400px; }
  button { flex:1; padding:16px; border:none; border-radius:10px; font-size:16px;
           font-weight:600; cursor:pointer; }
  #prev { background:#334155; color:#e2e8f0; }
  #next { background:#3b82f6; color:white; }
  #blank { background:#dc2626; color:white; width:100%; max-width:400px; margin-top:12px;
           padding:14px; border:none; border-radius:10px; font-size:14px; cursor:pointer; }
</style>
</head>
<body>
  <h1>EclesiaPresenter</h1>
  <div id="current">Sin presentación activa</div>
  <div class="controls">
    <button id="prev">◀ Anterior</button>
    <button id="next">Siguiente ▶</button>
  </div>
  <button id="blank">Pantalla en blanco</button>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io()
    socket.on('slide:update', (data) => {
      document.getElementById('current').textContent = data.text || '— en blanco —'
    })
    document.getElementById('prev').onclick = () => socket.emit('remote:prev')
    document.getElementById('next').onclick = () => socket.emit('remote:next')
    document.getElementById('blank').onclick = () => socket.emit('remote:blank')
  </script>
</body>
</html>`)
  })

  io.on('connection', (socket) => {
    // Enviar estado actual al nuevo cliente
    socket.emit('slide:update', currentSlide)

    // La app principal actualiza el slide
    socket.on('slide:update', (data) => {
      currentSlide = data
      io.emit('slide:update', data)
    })

    // Comandos desde el móvil — retransmitir a la app principal
    socket.on('remote:next', () => io.emit('remote:next'))
    socket.on('remote:prev', () => io.emit('remote:prev'))
    socket.on('remote:blank', () => io.emit('remote:blank'))
  })

  httpServer.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP()
    console.log(`EclesiaPresenter servidor activo`)
    console.log(`  OBS overlay:     http://${ip}:${PORT}/overlay`)
    console.log(`  Control móvil:   http://${ip}:${PORT}/remote`)
  })

  return { io, getLocalIP }
}

module.exports = { startServer }
