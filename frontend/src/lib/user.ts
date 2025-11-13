/**
 * Simple user management with localStorage
 * No auth, just userId
 */

const USER_ID_KEY = 'lana_user_id';

/**
 * Get or create userId
 * Auto-generates UUID on first visit
 */
export function getUserId(): string {
  if (typeof window === 'undefined') return 'temp-user';
  
  // Check if userId already exists
  let userId = localStorage.getItem(USER_ID_KEY);
  
  if (!userId) {
    // Generate new UUID
    userId = generateUUID();
    localStorage.setItem(USER_ID_KEY, userId);
    console.log('Generated new userId:', userId);
  }
  
  return userId;
}

/**
 * Clear userId (reset user)
 */
export function clearUserId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_ID_KEY);
}

/**
 * Generate a simple UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

