'use client';

import { BingoCard as BingoCardType } from '@/lib/types';

const COLUMNS = ['B', 'I', 'N', 'G', 'O'];
const COL_COLORS = [
  'from-purple-500 to-purple-600',
  'from-blue-500 to-blue-600',
  'from-green-500 to-green-600',
  'from-yellow-500 to-orange-500',
  'from-pink-500 to-red-500',
];

interface Props {
  card: BingoCardType;
  marked: string[];
  calledNumbers: number[];
  onMark?: (row: number, col: number) => void;
  disabled?: boolean;
}

export default function BingoCard({ card, marked, calledNumbers, onMark, disabled }: Props) {
  const markedSet = new Set(marked);
  const calledSet = new Set(calledNumbers);

  return (
    <div className="select-none" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 4 }}>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, flexShrink: 0 }}>
        {COLUMNS.map((col, i) => (
          <div
            key={col}
            className={`bg-gradient-to-b ${COL_COLORS[i]} text-white font-black text-xl text-center rounded-xl shadow-md`}
            style={{ padding: '6px 0' }}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Grid — fills remaining height */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(5, 1fr)', gap: 4, flex: 1, minHeight: 0 }}>
        {card.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            const isFree = cell === 'FREE';
            const isMarked = markedSet.has(key) || isFree;
            const isCalled = isFree || calledSet.has(cell as number);
            const isClickable = !disabled && isCalled && !isMarked && !isFree;

            return (
              <button
                key={key}
                onClick={() => isClickable && onMark?.(r, c)}
                disabled={!isClickable}
                className={`
                  flex items-center justify-center rounded-xl font-bold
                  transition-all duration-200 border-2
                  ${isFree
                    ? 'bg-gradient-to-br from-yellow-400 to-orange-400 border-yellow-300 text-white shadow-lg'
                    : isMarked
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-purple-400 text-white shadow-lg'
                    : isCalled
                    ? 'bg-green-50 border-green-400 text-green-700 hover:bg-green-100 hover:scale-105 cursor-pointer shadow-sm'
                    : 'bg-gray-50 border-gray-200 text-gray-600 cursor-default'
                  }
                `}
                style={{ fontSize: 'clamp(10px, 1.8vh, 18px)' }}
              >
                {isFree ? '⭐' : (
                  <span className="flex flex-col items-center leading-none">
                    {isMarked && <span style={{ fontSize: 'clamp(8px, 1.2vh, 12px)' }} className="mb-0.5">✓</span>}
                    <span>{cell}</span>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
