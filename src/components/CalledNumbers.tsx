'use client';

const COLUMN_LABEL = (n: number) => {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
};

const COL_COLORS: Record<string, string> = {
  B: 'bg-purple-500',
  I: 'bg-blue-500',
  N: 'bg-green-500',
  G: 'bg-orange-500',
  O: 'bg-pink-500',
};

interface Props {
  calledNumbers: number[];
}

export default function CalledNumbers({ calledNumbers }: Props) {
  const latest = calledNumbers[calledNumbers.length - 1];

  return (
    <div>
      {latest !== undefined && (
        <div className="flex items-center justify-center mb-4">
          <div className="text-center">
            <div className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Last Called</div>
            <div className={`${COL_COLORS[COLUMN_LABEL(latest)]} text-white rounded-2xl px-6 py-3 shadow-lg`}>
              <span className="text-2xl font-black">{COLUMN_LABEL(latest)}</span>
              <span className="text-5xl font-black ml-2">{latest}</span>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 text-center">
        Called Numbers ({calledNumbers.length}/75)
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center max-h-32 overflow-y-auto">
        {[...calledNumbers].reverse().map((n, i) => (
          <span
            key={n}
            className={`${COL_COLORS[COLUMN_LABEL(n)]} text-white text-xs font-bold px-2 py-1 rounded-lg ${i === 0 ? 'ring-2 ring-white ring-offset-1' : 'opacity-80'}`}
          >
            {COLUMN_LABEL(n)}{n}
          </span>
        ))}
      </div>
    </div>
  );
}
