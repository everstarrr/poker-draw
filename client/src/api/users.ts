import { http } from './http';

// Server may return either a flat user object or nested under `user`
export interface RawUserInfoResponse {
  success?: boolean;
  email?: string;
  username?: string;
  balance?: number;
  user?: {
    email?: string;
    username?: string;
    balance?: number;
  };
}

export interface UserInfoResponse {
  success: boolean;
  email: string;
  username: string;
  balance: number;
}

export async function getUserInfo(email: string): Promise<UserInfoResponse> {
  const { data } = await http.get<RawUserInfoResponse>(`/api/users/${encodeURIComponent(email)}`);
  const user = data.user ?? data;
  return {
    success: data.success ?? true,
    email: String(user.email || email),
    username: String(user.username || ''),
    balance: Number(user.balance ?? 0),
  };
}
