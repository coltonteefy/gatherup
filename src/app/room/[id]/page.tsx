'use client';

import { useEffect, useState, useRef, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket, disconnectSocket } from '@/lib/socket';
import BingoCard from '@/components/BingoCard';
import CalledNumbers from '@/components/CalledNumbers';
import ChatPanel, { ChatMessage } from '@/components/ChatPanel';
import { RoomState, BingoCard as BingoCardType } from '@/lib/types';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = use(params);
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [card, setCard] = useState<BingoCardType | null>(null);
  const [marked, setMarked] = useState<string[]>([]);
  const [isHost, setIsHostState] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [status, setStatus] = useState<'connecting' | 'playing' | 'won' | 'error' | 'enter-name' | 'game-ended'>('connecting');
  const [nameInput, setNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [autoInterval, setAutoInterval] = useState(3000);
  const [copied, setCopied] = useState(false);
  const [winnerName, setWinnerName] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamError, setStreamError] = useState('');

  // WebRTC – host side
  const [isLive, setIsLive] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // WebRTC – viewer side
  const [hostLive, setHostLive] = useState(false);
  const viewerVideoRef = useRef<HTMLVideoElement>(null);
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);

  const hasJoined = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isHostRef = useRef(false);
  const roomIdRef = useRef(roomId);

  function joinWithName(name: string) {
    localStorage.setItem('bingoPlayerName', name);
    sessionStorage.setItem('playerName', name);
    sessionStorage.setItem('isHost', 'false');
    setPlayerName(name);
    setIsHostState(false);
    isHostRef.current = false;
    setStatus('connecting');
    const socket = getSocket();
    hasJoined.current = true;
    if (socket.connected) {
      socket.emit('join-room', { roomId, playerName: name });
    } else {
      socket.once('connect', () => socket.emit('join-room', { roomId, playerName: name }));
      socket.connect();
    }
  }

  // ── Host WebRTC helpers ───────────────────────────────────────────────────

  async function startStream() {
    setStreamError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setStreamError('Camera/mic not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setIsLive(true);
      getSocket().emit('stream-start', { roomId });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStreamError('Camera/mic permission denied. Allow access in your browser and try again.');
      } else if (name === 'NotFoundError') {
        setStreamError('No camera or microphone found.');
      } else {
        setStreamError('Could not start stream. Check your camera and try again.');
      }
    }
  }

  // Set srcObject once the host video element renders after setIsLive(true)
  useEffect(() => {
    if (isLive && hostVideoRef.current && localStreamRef.current) {
      hostVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isLive]);

  function stopStream() {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    peerConnsRef.current.forEach(pc => pc.close());
    peerConnsRef.current.clear();
    setIsLive(false);
    getSocket().emit('stream-stop', { roomId });
  }

  const createPeerForViewer = useCallback(async (viewerId: string) => {
    const socket = getSocket();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnsRef.current.set(viewerId, pc);

    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { roomId: roomIdRef.current, candidate, targetId: viewerId });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('stream-offer', { viewerId, offer });
  }, []);

  // ── Viewer WebRTC helpers ─────────────────────────────────────────────────

  const requestStream = useCallback(() => {
    const socket = getSocket();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    viewerPcRef.current = pc;

    pc.ontrack = (e) => {
      if (viewerVideoRef.current) viewerVideoRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { roomId: roomIdRef.current, candidate });
    };

    socket.emit('request-stream', { roomId: roomIdRef.current });
  }, []);

  // ── Main socket setup ─────────────────────────────────────────────────────

  useEffect(() => {
    const name = sessionStorage.getItem('playerName');
    const host = sessionStorage.getItem('isHost') === 'true';
    if (!name) {
      const saved = localStorage.getItem('bingoPlayerName');
      if (saved) setNameInput(saved);
      setStatus('enter-name');
      return;
    }
    setPlayerName(name);
    setIsHostState(host);
    isHostRef.current = host;

    const socket = getSocket();

    socket.on('connect', () => {
      if (hasJoined.current) return;
      hasJoined.current = true;
      if (host) {
        socket.emit('create-room', { roomId, hostName: name });
      } else {
        socket.emit('join-room', { roomId, playerName: name });
      }
    });

    socket.on('room-joined', ({ player, room: r, messages: msgs }) => {
      setCard(player.card);
      setMarked(player.marked);
      setRoom(r);
      if (msgs) setMessages(msgs);
      if (r.hostLive) setHostLive(true);
      setStatus('playing');
    });

    socket.on('room-update', (r: RoomState) => {
      setRoom(r);
      setHostLive(!!(r as RoomState & { hostLive?: boolean }).hostLive);
    });

    socket.on('number-called', ({ room: r }) => setRoom(r));
    socket.on('mark-update', ({ marked: m }) => setMarked(m));

    socket.on('bingo', ({ winner, room: r }) => {
      setRoom(r);
      setWinnerName(winner);
      setStatus('won');
    });

    socket.on('game-restart', ({ room: r }) => {
      setRoom(r);
      setStatus('playing');
      setWinnerName('');
    });

    socket.on('new-card', ({ card: c, marked: m }) => {
      setCard(c);
      setMarked(m);
    });

    socket.on('game-ended', () => {
      setStatus('game-ended');
      setCountdown(10);
      let n = 10;
      countdownRef.current = setInterval(() => {
        n -= 1;
        setCountdown(n);
        if (n <= 0) { clearInterval(countdownRef.current!); router.push('/'); }
      }, 1000);
    });

    socket.on('host-left', () => { setErrorMsg('The host left the game.'); setStatus('error'); });
    socket.on('error', (msg: string) => { setErrorMsg(msg); setStatus('error'); });

    // Chat
    socket.on('chat-message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    // ── WebRTC – host events ────────────────────────────────────────────────
    socket.on('viewer-wants-stream', ({ viewerId }: { viewerId: string }) => {
      if (isHostRef.current && localStreamRef.current) {
        createPeerForViewer(viewerId);
      }
    });

    socket.on('stream-answer', ({ viewerId, answer }: { viewerId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnsRef.current.get(viewerId);
      pc?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // ── WebRTC – viewer events ──────────────────────────────────────────────
    socket.on('host-is-live', () => {
      setHostLive(true);
      if (!isHostRef.current) requestStream();
    });

    socket.on('host-stream-ended', () => {
      setHostLive(false);
      viewerPcRef.current?.close();
      viewerPcRef.current = null;
      if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
    });

    socket.on('stream-offer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      const pc = viewerPcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('stream-answer', { roomId, answer });
    });

    socket.on('ice-candidate', async ({ candidate, fromId }: { candidate: RTCIceCandidateInit; fromId: string }) => {
      if (isHostRef.current) {
        const pc = peerConnsRef.current.get(fromId);
        await pc?.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        await viewerPcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    if (!socket.connected) socket.connect();

    return () => {
      ['connect','room-joined','room-update','number-called','mark-update','bingo',
       'game-restart','new-card','game-ended','host-left','error','chat-message',
       'viewer-wants-stream','stream-answer','host-is-live','host-stream-ended',
       'stream-offer','ice-candidate'].forEach(e => socket.off(e));
      disconnectSocket();
      if (countdownRef.current) clearInterval(countdownRef.current);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peerConnsRef.current.forEach(pc => pc.close());
      viewerPcRef.current?.close();
    };
  }, [roomId, router, createPeerForViewer, requestStream]);

  function callNumber() { getSocket().emit('call-number', { roomId }); }
  function toggleAuto(enabled: boolean) { getSocket().emit('toggle-auto', { roomId, enabled, intervalMs: autoInterval }); }
  function markCell(row: number, col: number) { getSocket().emit('mark-cell', { roomId, row, col }); }
  function restart() { getSocket().emit('restart-game', { roomId }); }
  function endGame() { getSocket().emit('end-game', { roomId }); router.push('/'); }
  function copyLink() {
    const url = `${window.location.origin}/?room=${roomId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text: string) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function sendChat(text: string) { getSocket().emit('chat-message', { roomId, text }); }

  // ── Early return screens ──────────────────────────────────────────────────

  const DARK = { bg: '#0d1117', card: '#161b27', cell: '#1e2535', border: '#2a3249' };

  if (status === 'enter-name') {
    return (
      <div style={{ minHeight: '100vh', background: DARK.bg }} className="flex items-center justify-center p-4">
        <div style={{ background: DARK.card, border: `1px solid ${DARK.border}` }} className="rounded-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🎱</div>
            <h1 className="text-2xl font-black text-white">Join Bingo!</h1>
            <p className="text-gray-400 text-sm mt-1">Room <span className="font-black tracking-widest text-pink-400">{roomId}</span></p>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (nameInput.trim()) joinWithName(nameInput.trim()); }} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1.5">Your Name</label>
              <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
                placeholder="Enter your name..." maxLength={20} autoFocus
                style={{ background: DARK.cell, border: `1px solid ${DARK.border}` }}
                className="w-full px-4 py-3 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors" />
            </div>
            <button type="submit" className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-lg hover:opacity-90 transition-all">
              🎮 Join Game
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div style={{ minHeight: '100vh', background: DARK.bg }} className="flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-spin">🎱</div>
          <p className="text-xl font-bold text-white">Connecting to game...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: DARK.bg }} className="flex items-center justify-center">
        <div style={{ background: DARK.card, border: `1px solid ${DARK.border}` }} className="rounded-2xl p-8 text-center max-w-sm">
          <div className="text-5xl mb-4">😢</div>
          <p className="text-xl font-bold text-white mb-4">{errorMsg || 'Something went wrong'}</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700">Back to Home</button>
        </div>
      </div>
    );
  }

  const iWon = status === 'won' && winnerName === playerName;
  const lastCalled = room?.calledNumbers[room.calledNumbers.length - 1];
  const colLetter = (n: number) => n <= 15 ? 'B' : n <= 30 ? 'I' : n <= 45 ? 'N' : n <= 60 ? 'G' : 'O';
  const colColor = (n: number) => n <= 15 ? '#7c3aed' : n <= 30 ? '#2563eb' : n <= 45 ? '#16a34a' : n <= 60 ? '#d97706' : '#db2777';
  const chipColor = colColor;

  return (
    <div style={{ height: '100vh', background: DARK.bg, display: 'flex', overflow: 'hidden' }}>

      {/* Game ended overlay */}
      {status === 'game-ended' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div style={{ background: DARK.card, border: `1px solid ${DARK.border}` }} className="rounded-2xl p-8 text-center max-w-sm w-full">
            <div className="text-7xl mb-4">🛑</div>
            <h2 className="text-2xl font-black text-white mb-2">Game Over</h2>
            <p className="text-gray-400 mb-6">The host ended the game.</p>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
              <span className="text-4xl font-black text-white">{countdown}</span>
            </div>
            <p className="text-gray-500 text-sm">Returning to home screen...</p>
            <button onClick={() => { clearInterval(countdownRef.current!); router.push('/'); }}
              className="mt-4 w-full py-3 text-white font-bold rounded-xl hover:opacity-90 transition-all"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
              Go Now
            </button>
          </div>
        </div>
      )}

      {/* Win overlay */}
      {status === 'won' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div style={{ background: DARK.card, border: `1px solid ${DARK.border}` }} className="rounded-2xl p-8 text-center max-w-sm w-full">
            <div className="text-7xl mb-4">{iWon ? '🎉' : '🥳'}</div>
            <h2 className="text-3xl font-black text-white mb-2">
              {iWon ? 'BINGO! You Won!' : `${winnerName} got BINGO!`}
            </h2>
            {isHost && (
              <button onClick={restart} className="mt-4 w-full py-3 text-white font-bold rounded-xl hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
                Play Again
              </button>
            )}
            {!isHost && <p className="text-gray-400 mt-4">Waiting for host to start a new game...</p>}
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: DARK.card, borderBottom: `1px solid ${DARK.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="text-white font-black text-lg">🎱 BINGO</span>
            <span style={{ width: 1, height: 20, background: DARK.border }} />
            <span className="text-gray-400 text-sm font-medium">Room:</span>
            <span className="font-black text-lg tracking-widest" style={{ color: '#f472b6' }}>{roomId}</span>
            {isHost && <span style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(234,179,8,0.25)' }}>HOST</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={copyLink}
              style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(124,58,237,0.2)', color: copied ? '#4ade80' : '#a78bfa', border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(124,58,237,0.3)'}`, padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}>
              {copied ? '✓ Copied!' : '🔗 Copy Invite Link'}
            </button>
            <button onClick={() => router.push('/')}
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Leave
            </button>
          </div>
        </div>

        {/* Body: card area + right sidebar */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Center: card + controls + chat */}
          <div style={{ flex: 1, padding: '20px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 className="text-white font-black text-lg">{playerName}&apos;s Card</h2>
                <p className="text-gray-500 text-xs mt-0.5">{isHost ? 'You are the host' : 'Mark numbers as they are called'}</p>
              </div>
              {!isHost && hostLive && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1 rounded-full" style={{ background: '#ef4444' }}>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
                </span>
              )}
            </div>

            {/* Bingo Card — grows to fill available space */}
            <div style={{ flex: 1, minHeight: 0, background: DARK.card, borderRadius: 16, padding: 12, border: `1px solid ${DARK.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {card && (
                <BingoCard card={card} marked={marked} calledNumbers={room?.calledNumbers ?? []}
                  onMark={markCell} disabled={status === 'won'} />
              )}
            </div>

            {/* Host controls */}
            {isHost && (
              <div style={{ flexShrink: 0, background: DARK.card, borderRadius: 16, padding: '14px 16px', border: `1px solid ${DARK.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Call Next Number — full width primary */}
                <button onClick={callNumber}
                  disabled={room?.autoCall || status === 'won' || (room?.calledNumbers.length ?? 0) >= 75}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #7c3aed, #db2777)',
                    color: 'white', fontWeight: 800, fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    opacity: (room?.autoCall || status === 'won' || (room?.calledNumbers.length ?? 0) >= 75) ? 0.45 : 1,
                    boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
                    letterSpacing: 0.3,
                  }}>
                  <span style={{ fontSize: 20 }}>🎲</span> Call Next Number
                </button>

                {/* Second row: Auto Call | interval | Go Live | End Game */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Auto Call */}
                  <button onClick={() => toggleAuto(!room?.autoCall)}
                    style={{
                      flex: 1, padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                      background: room?.autoCall ? 'rgba(59,130,246,0.18)' : '#1e2535',
                      color: room?.autoCall ? '#60a5fa' : '#d1d5db',
                      border: `1px solid ${room?.autoCall ? 'rgba(59,130,246,0.35)' : DARK.border}`,
                      fontWeight: 700, fontSize: 14,
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                    <span style={{ fontSize: 11, color: room?.autoCall ? '#60a5fa' : '#d1d5db' }}>▶</span>
                    {room?.autoCall ? 'Stop Auto' : 'Auto Call'}
                  </button>

                  {/* Interval picker */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <select value={autoInterval} onChange={e => setAutoInterval(Number(e.target.value))}
                      style={{
                        appearance: 'none', background: '#1e2535', color: '#d1d5db',
                        border: `1px solid ${DARK.border}`, borderRadius: 10,
                        padding: '11px 28px 11px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      }}>
                      <option value={2000}>2s</option>
                      <option value={3000}>3s</option>
                      <option value={5000}>5s</option>
                      <option value={8000}>8s</option>
                    </select>
                    <span style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: '#6b7280', fontSize: 10 }}>▼</span>
                  </div>

                  {/* Go Live */}
                  <button onClick={isLive ? stopStream : startStream}
                    style={{
                      flex: 1, padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                      background: isLive ? 'rgba(239,68,68,0.15)' : 'transparent',
                      color: '#f87171',
                      border: '1px solid rgba(239,68,68,0.5)',
                      fontWeight: 700, fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}>
                    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M1 7 C1 3.5 4.5 1 9 1" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M17 7 C17 3.5 13.5 1 9 1" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M3.5 10 C3.5 7.5 6 5.5 9 5.5" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M14.5 10 C14.5 7.5 12 5.5 9 5.5" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round"/>
                      <circle cx="9" cy="12" r="1.5" fill="#f87171"/>
                    </svg>
                    {isLive ? 'Stop Live' : 'Go Live'}
                  </button>

                  {/* End Game */}
                  <button onClick={() => { if (confirm('End the game for everyone?')) endGame(); }}
                    style={{
                      flex: 1, padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                      background: 'transparent', color: '#f87171',
                      border: '1px solid rgba(239,68,68,0.35)',
                      fontWeight: 700, fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                    End Game
                  </button>
                </div>

                {streamError && (
                  <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{streamError}</p>
                )}
                {isLive && (
                  <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 6, left: 6, background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4, zIndex: 10 }}>
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
                    </div>
                    <video ref={hostVideoRef} autoPlay muted playsInline style={{ width: '100%', maxHeight: 140, objectFit: 'contain', display: 'block' }} />
                  </div>
                )}
              </div>
            )}

            {/* Viewer stream */}
            {!isHost && hostLive && (
              <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                <video ref={viewerVideoRef} autoPlay playsInline style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block' }} />
              </div>
            )}

            {/* Chat */}
            <div style={{ flexShrink: 0, background: DARK.card, borderRadius: 16, border: `1px solid ${DARK.border}`, padding: 12, height: 180 }}>
              <ChatPanel messages={messages} onSend={sendChat} playerName={playerName} dark />
            </div>
          </div>

          {/* ── Right Sidebar ── */}
          <div style={{ width: 260, minWidth: 260, borderLeft: `1px solid ${DARK.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 20, gap: 20 }}>

            {/* Last Called */}
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Last Called</div>
              {lastCalled ? (
                <div className="flex flex-col items-center gap-2">
                  <div style={{ width: 100, height: 100, borderRadius: '50%', border: `4px solid ${colColor(lastCalled)}`, background: `${colColor(lastCalled)}22`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: colColor(lastCalled), fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>{colLetter(lastCalled)}</span>
                    <span style={{ color: 'white', fontSize: 36, fontWeight: 900, lineHeight: 1 }}>{lastCalled}</span>
                  </div>
                </div>
              ) : (
                <div style={{ width: 100, height: 100, borderRadius: '50%', border: `4px solid ${DARK.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <span className="text-gray-600 text-xs">None yet</span>
                </div>
              )}
            </div>

            {/* Called Numbers */}
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                Called Numbers ({room?.calledNumbers.length ?? 0}/75)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...(room?.calledNumbers ?? [])].reverse().map(n => (
                  <span key={n} style={{ background: `${chipColor(n)}22`, color: chipColor(n), border: `1px solid ${chipColor(n)}55`, borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                    {colLetter(n)}{n}
                  </span>
                ))}
                {(!room?.calledNumbers.length) && (
                  <span className="text-gray-600 text-xs">No numbers called yet</span>
                )}
              </div>
            </div>

            {/* Players */}
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                Players ({room?.players.length ?? 0})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {room?.players.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                    <span style={{ color: p.name === playerName ? '#a78bfa' : '#e5e7eb', fontSize: 13, fontWeight: p.name === playerName ? 700 : 500, flex: 1 }}>{p.name}</span>
                    {p.isHost && <span style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>HOST</span>}
                    {p.name === playerName && !p.isHost && <span style={{ color: '#6b7280', fontSize: 10 }}>you</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
