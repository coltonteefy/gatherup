const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const rooms = new Map();

function generateCard() {
  const card = [];
  const ranges = [[1,15],[16,30],[31,45],[46,60],[61,75]];
  for (let col = 0; col < 5; col++) {
    const [min, max] = ranges[col];
    const nums = new Set();
    while (nums.size < 5) nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
    card.push([...nums]);
  }
  const grid = [];
  for (let r = 0; r < 5; r++) grid.push(card.map(col => col[r]));
  grid[2][2] = 'FREE';
  return grid;
}

function checkWin(marked, card) {
  const isMarked = (r, c) => card[r][c] === 'FREE' || marked.has(`${r},${c}`);
  for (let r = 0; r < 5; r++) if ([0,1,2,3,4].every(c => isMarked(r, c))) return true;
  for (let c = 0; c < 5; c++) if ([0,1,2,3,4].every(r => isMarked(r, c))) return true;
  if ([0,1,2,3,4].every(i => isMarked(i, i))) return true;
  if ([0,1,2,3,4].every(i => isMarked(i, 4-i))) return true;
  return false;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {

    // ── Room management ──────────────────────────────────────────────────────

    socket.on('create-room', ({ roomId, hostName }) => {
      const room = {
        id: roomId, host: socket.id, hostName,
        players: {}, calledNumbers: [], started: false,
        winner: null, autoCall: false, autoCallInterval: null,
        messages: [], hostLive: false,
      };
      rooms.set(roomId, room);
      socket.join(roomId);
      room.players[socket.id] = { id: socket.id, name: hostName, card: generateCard(), marked: [], isHost: true };
      socket.emit('room-joined', { roomId, player: room.players[socket.id], room: roomSnapshot(room) });
    });

    socket.on('join-room', ({ roomId, playerName }) => {
      const room = rooms.get(roomId);
      if (!room) { socket.emit('error', 'Room not found'); return; }
      if (room.winner) { socket.emit('error', 'Game already ended'); return; }
      socket.join(roomId);
      room.players[socket.id] = { id: socket.id, name: playerName, card: generateCard(), marked: [], isHost: false };
      socket.emit('room-joined', {
        roomId,
        player: room.players[socket.id],
        room: roomSnapshot(room),
        messages: room.messages,
      });
      io.to(roomId).emit('room-update', roomSnapshot(room));
      // If host is live, tell the new player to request a stream
      if (room.hostLive) socket.emit('host-is-live');
    });

    // ── Game logic ───────────────────────────────────────────────────────────

    socket.on('call-number', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id || room.winner) return;
      callNextNumber(room, io);
    });

    socket.on('toggle-auto', ({ roomId, enabled, intervalMs }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;
      clearInterval(room.autoCallInterval);
      room.autoCall = enabled;
      if (enabled) {
        room.autoCallInterval = setInterval(() => {
          if (room.winner || room.calledNumbers.length >= 75) { clearInterval(room.autoCallInterval); return; }
          callNextNumber(room, io);
        }, intervalMs || 3000);
      }
      io.to(roomId).emit('room-update', roomSnapshot(room));
    });

    socket.on('mark-cell', ({ roomId, row, col }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.players[socket.id];
      if (!player) return;
      const num = player.card[row][col];
      if (num === 'FREE' || !room.calledNumbers.includes(num)) return;
      const key = `${row},${col}`;
      if (!player.marked.includes(key)) player.marked.push(key);
      const markedSet = new Set(player.marked);
      if (checkWin(markedSet, player.card) && !room.winner) {
        room.winner = player.name;
        clearInterval(room.autoCallInterval);
        io.to(roomId).emit('bingo', { winner: player.name, room: roomSnapshot(room) });
      } else {
        socket.emit('mark-update', { marked: player.marked });
      }
    });

    socket.on('end-game', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;
      clearInterval(room.autoCallInterval);
      io.to(roomId).emit('game-ended');
      rooms.delete(roomId);
    });

    socket.on('restart-game', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;
      clearInterval(room.autoCallInterval);
      room.calledNumbers = []; room.winner = null; room.autoCall = false;
      Object.values(room.players).forEach(p => { p.card = generateCard(); p.marked = []; });
      io.to(roomId).emit('game-restart', { room: roomSnapshot(room) });
      Object.values(room.players).forEach(p => io.to(p.id).emit('new-card', { card: p.card, marked: [] }));
    });

    // ── Chat ─────────────────────────────────────────────────────────────────

    socket.on('chat-message', ({ roomId, text }) => {
      const room = rooms.get(roomId);
      if (!room || !text?.trim()) return;
      const player = room.players[socket.id];
      if (!player) return;
      const msg = {
        id: Date.now() + Math.random(),
        name: player.name,
        isHost: player.isHost,
        text: text.trim().slice(0, 300),
        ts: Date.now(),
      };
      room.messages.push(msg);
      if (room.messages.length > 200) room.messages.shift();
      io.to(roomId).emit('chat-message', msg);
    });

    // ── WebRTC signaling (host → players) ────────────────────────────────────

    socket.on('stream-start', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;
      room.hostLive = true;
      // Tell all other players to request a stream
      socket.to(roomId).emit('host-is-live');
      io.to(roomId).emit('room-update', roomSnapshot(room));
    });

    socket.on('stream-stop', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room || room.host !== socket.id) return;
      room.hostLive = false;
      io.to(roomId).emit('host-stream-ended');
      io.to(roomId).emit('room-update', roomSnapshot(room));
    });

    // Player requests stream → forward to host
    socket.on('request-stream', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      io.to(room.host).emit('viewer-wants-stream', { viewerId: socket.id });
    });

    // Host sends offer to a specific viewer
    socket.on('stream-offer', ({ viewerId, offer }) => {
      io.to(viewerId).emit('stream-offer', { offer });
    });

    // Viewer sends answer back to host
    socket.on('stream-answer', ({ roomId, answer }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      io.to(room.host).emit('stream-answer', { viewerId: socket.id, answer });
    });

    // ICE candidates relayed both ways
    socket.on('ice-candidate', ({ roomId, candidate, targetId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const target = targetId || room.host;
      io.to(target).emit('ice-candidate', { candidate, fromId: socket.id });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────

    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        const room = rooms.get(roomId);
        if (!room) continue;
        delete room.players[socket.id];
        if (room.host === socket.id) {
          clearInterval(room.autoCallInterval);
          io.to(roomId).emit('host-left');
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('room-update', roomSnapshot(room));
        }
      }
    });
  });

  function callNextNumber(room, io) {
    const called = new Set(room.calledNumbers);
    if (called.size >= 75) return;
    let num;
    do { num = Math.floor(Math.random() * 75) + 1; } while (called.has(num));
    room.calledNumbers.push(num);
    io.to(room.id).emit('number-called', { number: num, room: roomSnapshot(room) });
  }

  function roomSnapshot(room) {
    return {
      id: room.id, hostName: room.hostName,
      players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      calledNumbers: room.calledNumbers,
      started: room.started, winner: room.winner, autoCall: room.autoCall,
      hostLive: room.hostLive,
    };
  }

  httpServer.listen(3000, () => console.log('> Bingo game running on http://localhost:3000'));
});
