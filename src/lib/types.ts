export type BingoCard = (number | 'FREE')[][];

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

export interface RoomState {
  id: string;
  hostName: string;
  players: Player[];
  calledNumbers: number[];
  started: boolean;
  winner: string | null;
  autoCall: boolean;
  hostLive?: boolean;
}

export interface LocalPlayer extends Player {
  card: BingoCard;
  marked: string[];
}
