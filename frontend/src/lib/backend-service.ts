/**
 * Backend service utility for the simplified frontend
 * Contains essential constants and helpers for API calls
 */

import { config, BACKEND_URL } from './config';

export const AUTH_STORAGE_KEY = 'coinlana_auth';

/**
 * Get auth token from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const auth = JSON.parse(stored);
      return auth.token || null;
    }
  } catch (e) {
    console.error('Error getting auth token:', e);
  }
  
  return null;
}

/**
 * Get current user data from localStorage
 */
export function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const auth = JSON.parse(stored);
      return auth.user || null;
    }
  } catch (e) {
    console.error('Error getting user data:', e);
  }
  
  return null;
}

/**
 * Get payment wallet from localStorage
 */
export function getPaymentWallet(): { address: string; privateKey: string } | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const auth = JSON.parse(stored);
      return auth.paymentWallet || null;
    }
  } catch (e) {
    console.error('Error getting payment wallet:', e);
  }
  
  return null;
}

/**
 * Set auth data to localStorage
 */
export function setAuthData(data: { 
  token: string; 
  user: any; 
  paymentWallet?: { address: string; privateKey: string } | null;
  usdcBalance?: number;
}) {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('localStorageUpdated', { 
      detail: { key: AUTH_STORAGE_KEY } 
    }));
  } catch (e) {
    console.error('Error setting auth data:', e);
  }
}

/**
 * Clear auth data from localStorage
 */
export function clearAuthData() {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('localStorageUpdated', { 
      detail: { key: AUTH_STORAGE_KEY } 
    }));
  } catch (e) {
    console.error('Error clearing auth data:', e);
  }
}

/**
 * Register a new user
 */
export async function registerUser(username: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || 'Registration failed');
  }
  return data;
}

/**
 * Login a user
 */
export async function loginUser(username: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || 'Login failed');
  }
  return data;
}

/**
 * Fetch authenticated user info
 */
export async function fetchAuthenticatedUser() {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to fetch user');
  }
  return data;
}

