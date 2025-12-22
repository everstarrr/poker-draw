export interface AvailableGame {
  game_id: string;
  name: string;
  created_at: string; // ISO timestamp
  max_players: number;
  current_players: number;
  big_blind: number;
  min_stack: number;
  max_stack: number;
  pot: number;
  is_full: boolean;
  // Optional creator metadata (if backend provides)
  created_by?: string;
  creator_email?: string;
  owner_email?: string;
}

export interface AuthResponse {
  email: string;
  username: string;
  balance: number | string;
  error?: string;
}
