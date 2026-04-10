const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');
const { randomUUID } = require('crypto');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// Serve static files (CSS, images, etc.) and the main HTML
app.use(express.static(__dirname));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'monty-hall.html'));
});

// ── Player store ────────────────────────────────────────────────────────────
// Map<playerId, { id, ws, name, switchWins, switchTotal, stayWins, stayTotal }>
const players = new Map();

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const p of players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

function getPlayerList() {
  return Array.from(players.values())
    .map(p => ({
      id:          p.id,
      name:        p.name,
      switchWins:  p.switchWins,
      switchTotal: p.switchTotal,
      stayWins:    p.stayWins,
      stayTotal:   p.stayTotal,
    }))
    .sort((a, b) =>
      (b.switchTotal + b.stayTotal) - (a.switchTotal + a.stayTotal)
    );
}

// ── WebSocket handler ───────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  const playerId = randomUUID();
  players.set(playerId, {
    id: playerId, ws,
    name: 'Anonymous',
    switchWins: 0, switchTotal: 0,
    stayWins:   0, stayTotal:   0,
  });

  // Greet the new player and send the current leaderboard
  ws.send(JSON.stringify({ type: 'welcome', playerId }));
  ws.send(JSON.stringify({ type: 'player_list', players: getPlayerList() }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const p = players.get(playerId);
    if (!p) return;

    switch (msg.type) {
      case 'join':
        // Player sets their display name
        p.name = String(msg.name || '').trim().slice(0, 24) || 'Anonymous';
        broadcast({ type: 'player_list', players: getPlayerList() });
        break;

      case 'game_result':
        // Single manual game completed
        if (msg.switched) { p.switchTotal++; if (msg.won) p.switchWins++; }
        else              { p.stayTotal++;   if (msg.won) p.stayWins++;   }
        broadcast({ type: 'player_list', players: getPlayerList() });
        break;

      case 'sync':
        // Bulk sync after auto-play — client sends cumulative totals
        p.switchWins  = Math.max(0, parseInt(msg.switchWins)  || 0);
        p.switchTotal = Math.max(0, parseInt(msg.switchTotal) || 0);
        p.stayWins    = Math.max(0, parseInt(msg.stayWins)    || 0);
        p.stayTotal   = Math.max(0, parseInt(msg.stayTotal)   || 0);
        broadcast({ type: 'player_list', players: getPlayerList() });
        break;
    }
  });

  ws.on('close', () => {
    players.delete(playerId);
    broadcast({ type: 'player_list', players: getPlayerList() });
  });
});

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Monty Hall Multiplayer running → http://localhost:${PORT}`);
});
