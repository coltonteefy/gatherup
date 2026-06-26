'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

function HomeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('bingoPlayerName');
    if (saved) setName(saved);
    const room = searchParams.get('room');
    if (room) {
      setRoomCode(room.toUpperCase());
      setTab('join');
    }
  }, [searchParams]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Enter your name'); return; }
    localStorage.setItem('bingoPlayerName', name.trim());
    sessionStorage.setItem('playerName', name.trim());
    sessionStorage.setItem('isHost', 'true');
    router.push(`/room/${uuidv4().slice(0, 6).toUpperCase()}`);
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Enter your name'); return; }
    if (!roomCode.trim()) { setError('Enter a room code'); return; }
    localStorage.setItem('bingoPlayerName', name.trim());
    sessionStorage.setItem('playerName', name.trim());
    sessionStorage.setItem('isHost', 'false');
    router.push(`/room/${roomCode.trim().toUpperCase()}`);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-2">🎱</div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
            BINGO!
          </h1>
          <p className="text-gray-500 mt-1">Multiplayer fun across the internet</p>
        </div>

        <div className="flex rounded-2xl bg-gray-100 p-1 mb-6">
          {(['create', 'join'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                tab === t
                  ? 'bg-white shadow text-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'create' ? '✨ Create Room' : '🚪 Join Room'}
            </button>
          ))}
        </div>

        <form onSubmit={tab === 'create' ? handleCreate : handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="Enter your name..."
              maxLength={20}
              autoFocus={tab === 'join'}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-400 focus:outline-none text-gray-800 font-medium transition-colors"
            />
          </div>

          {tab === 'join' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={e => { setRoomCode(e.target.value.toUpperCase()); setError(''); }}
                placeholder="e.g. A3F2B1"
                maxLength={6}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-400 focus:outline-none text-gray-800 font-bold text-center text-xl tracking-widest uppercase transition-colors"
              />
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm font-medium text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-lg shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {tab === 'create' ? '🎉 Create Game' : '🎮 Join Game'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeForm />
    </Suspense>
  );
}
