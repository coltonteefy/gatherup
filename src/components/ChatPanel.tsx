'use client';

import { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: number;
  name: string;
  isHost: boolean;
  text: string;
  ts: number;
}

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  playerName: string;
  dark?: boolean;
}

export default function ChatPanel({ messages, onSend, playerName, dark }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  }

  const borderColor = dark ? '#2a3249' : '#f3f4f6';
  const inputBg = dark ? '#1e2535' : 'white';
  const inputBorder = dark ? '#2a3249' : '#e5e7eb';
  const inputColor = dark ? 'white' : '#1f2937';
  const placeholderColor = dark ? '#6b7280' : '#9ca3af';

  return (
    <div className="flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Messages with top fade */}
      <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {/* Fade mask at the top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 60, zIndex: 2, pointerEvents: 'none',
          background: dark
            ? 'linear-gradient(to bottom, #161b27 0%, transparent 100%)'
            : 'linear-gradient(to bottom, white 0%, transparent 100%)',
        }} />
        <div className="overflow-y-auto" style={{ height: '100%', paddingBottom: 4 }}>
          {messages.length === 0 && (
            <p className="text-xs text-center mt-8" style={{ color: placeholderColor }}>No messages yet. Say hi! 👋</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: '100%', gap: 6, padding: '8px 4px 0' }}>
            {messages.map(msg => {
              const isMe = msg.name === playerName;
              return (
                <div key={msg.id} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                  <div style={{
                    maxWidth: '80%', padding: '6px 11px', borderRadius: 16, fontSize: 13, fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word',
                    background: isMe ? 'linear-gradient(135deg,#7c3aed,#db2777)' : dark ? '#1e2535' : '#f3f4f6',
                    color: isMe ? 'white' : dark ? '#e5e7eb' : '#1f2937',
                    border: !isMe && dark ? '1px solid #2a3249' : 'none',
                  }}>
                    {!isMe && (
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, marginBottom: 2, color: msg.isHost ? '#fbbf24' : '#a78bfa' }}>
                        {msg.isHost ? '👑 ' : ''}{msg.name}
                      </span>
                    )}
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={300}
          style={{ flex: 1, background: inputBg, border: `1px solid ${inputBorder}`, color: inputColor, borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none' }}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#7c3aed,#db2777)', color: 'white', borderRadius: 10, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', opacity: input.trim() ? 1 : 0.4 }}
        >
          ↑
        </button>
      </form>
    </div>
  );
}
