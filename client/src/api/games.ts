import { http } from './http';
import type { AvailableGame } from './types';

export async function getAvailableGames(): Promise<AvailableGame[]> {
  const { data } = await http.get<AvailableGame[]>('/api/games');
  return Array.isArray(data) ? data : [];
}

export interface CreateGamePayload {
  name: string;
  max_players: number;
  big_blind: number;
  min_stack: number;
  max_stack: number;
  max_turn_time?: number;
}

export interface CreateGameResponse {
  success: boolean;
  game_id: string;
  name?: string;
  max_players?: number;
  big_blind?: number;
  min_stack?: number;
  max_stack?: number;
  created_by?: string | null;
}

export async function createGame(payload: CreateGamePayload): Promise<CreateGameResponse> {
  const { data } = await http.post<CreateGameResponse>('/api/games', payload);
  return data as CreateGameResponse;
}

export interface JoinGamePayload {
  email: string;
  buy_in: number;
}

export async function joinGame(gameId: string, payload: JoinGamePayload): Promise<any> {
  const { data } = await http.post(`/api/games/${gameId}/join`, payload);
  return data;
}

export async function leaveGame(playerId: string): Promise<void> {
  await http.post(`/api/games/players/${playerId}/leave`, {});
}

export async function getGameState(gameId: string): Promise<any> {
  const { data } = await http.get(`/api/games/${gameId}`);
  return data;
}

export async function deleteGame(gameId: string): Promise<void> {
  await http.delete(`/api/games/${gameId}`);
}

export async function leaveGameByEmail(gameId: string, email: string): Promise<void> {
  await http.post(`/api/games/${gameId}/leave`, { email });
}

// Player actions
export async function foldPlayer(playerId: string): Promise<any> {
  const { data } = await http.post(`/api/games/players/${playerId}/actions/fold`, {});
  return data;
}

export async function checkPlayer(playerId: string): Promise<any> {
  const { data } = await http.post(`/api/games/players/${playerId}/actions/check`, {});
  return data;
}

export async function callPlayer(playerId: string): Promise<any> {
  const { data } = await http.post(`/api/games/players/${playerId}/actions/call`, {});
  return data;
}

export async function raisePlayer(playerId: string, raiseAmount: number): Promise<any> {
  const { data } = await http.post(`/api/games/players/${playerId}/actions/raise`, { raise_amount: raiseAmount });
  return data;
}

export async function replaceCards(playerId: string, positions: number[]): Promise<any> {
  const { data } = await http.post(`/api/games/players/${playerId}/replace-cards`, { card_ids_to_discard: positions });
  return data;
}
