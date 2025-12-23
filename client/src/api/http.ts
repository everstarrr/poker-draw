import axios from 'axios';

// Normalize API base env names and provide sensible default
const env = (import.meta as any).env || {};
export const API_BASE_URL = env.VITE_API_BASE_URL || env.VITE_API_URL || 'https://poker.whsrv.ru';

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optional: attach auth email for server-side identification if needed
http.interceptors.request.use((config) => {
  const email = typeof window !== 'undefined' ? localStorage.getItem('email') : null;
  if (email) {
    config.headers = config.headers || {};
    config.headers['X-User-Email'] = email;
  }
  return config;
});
