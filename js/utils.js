/**
 * utils.js - Shared utility functions for Sitio Tibucag Monitor PWA
 * Pure vanilla JS, no external dependencies. Works fully offline.
 */

// ---------------------------------------------------------------------------
// UUID
// ---------------------------------------------------------------------------

/**
 * Generates a v4-style UUID.
 * Prefers the native crypto.randomUUID() API; falls back to a Math.random
 * implementation for older browsers / insecure contexts.
 * @returns {string}
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: RFC 4122 v4 pattern with Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string to a readable long format.
 * Example: 'Jun 17, 2026 2:35 PM'
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day:   'numeric',
    year:  'numeric',
    hour:  'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Short date format – omits the year.
 * Example: 'Jun 17, 2:35 PM'
 * @param {string} isoString
 * @returns {string}
 */
export function formatDateShort(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month:  'short',
    day:    'numeric',
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Returns a human-readable relative time string.
 * Examples: 'just now', '2 hours ago', '3 days ago'
 * @param {string} isoString
 * @returns {string}
 */
export function timeAgo(isoString) {
  if (!isoString) return '—';

  const now     = Date.now();
  const then    = new Date(isoString).getTime();
  let seconds = Math.floor((now - then) / 1000);

  // If the date is slightly in the future (due to minor clock sync issues), cap to 0
  if (seconds < 0) seconds = 0;

  if (seconds < 60)    return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24)      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30)       return `${days} day${days !== 1 ? 's' : ''} ago`;

  const months = Math.floor(days / 30);
  if (months < 12)     return `${months} month${months !== 1 ? 's' : ''} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

/**
 * Shows a small toast notification at the bottom of the screen.
 * Automatically removes itself after 3 seconds.
 *
 * @param {string} message - Text to display
 * @param {'success'|'error'|'warning'} type - Visual style
 */
export function showToast(message, type = 'success') {
  // Ensure the container exists
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger enter animation on next frame
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  // Auto-remove after 3 s
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    // Safety net in case transitionend never fires
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ---------------------------------------------------------------------------
// Household ID helpers
// ---------------------------------------------------------------------------

/**
 * Converts a house number to the padded household ID format.
 * Example: 1 → 'TIBUCAG-HH-001'
 * @param {number|string} houseNumber - 1–999
 * @returns {string}
 */
export function generateHouseholdId(houseNumber) {
  const num = parseInt(houseNumber, 10);
  return `TIBUCAG-HH-${String(num).padStart(3, '0')}`;
}

/**
 * Extracts the numeric house number from a household ID string.
 * Example: 'TIBUCAG-HH-003' → 3
 * @param {string} id
 * @returns {number}
 */
export function parseHouseholdId(id) {
  if (!id) return NaN;
  const parts = id.split('-');
  return parseInt(parts[parts.length - 1], 10);
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

/**
 * Escapes HTML special characters to prevent XSS when injecting
 * user-supplied strings into the DOM via innerHTML.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = {
    '&':  '&amp;',
    '<':  '&lt;',
    '>':  '&gt;',
    '"':  '&quot;',
    "'":  '&#039;',
  };
  return str.replace(/[&<>"']/g, (ch) => map[ch]);
}

// ---------------------------------------------------------------------------
// Authorized User session (localStorage)
// ---------------------------------------------------------------------------

const USER_KEY = 'stm_current_user';

/**
 * Retrieves the currently logged-in user from localStorage.
 * @returns {{ user_id: string, user_name: string, employee_no: string } | null}
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persists the current user selection to localStorage.
 * @param {{ user_id: string, user_name: string, employee_no: string }} user
 */
export function setCurrentUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clears the current user from localStorage (sign out).
 */
export function clearCurrentUser() {
  localStorage.removeItem(USER_KEY);
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

/**
 * Simple online check. Note: navigator.onLine can return false positives
 * (reports online when behind a captive portal), but it reliably detects
 * when the device is definitely offline.
 * @returns {boolean}
 */
export function isOnline() {
  return navigator.onLine;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely extracts the House Number from a household object.
 * If the database incorrectly stored a name (no digits) in the house_number field,
 * it extracts the number from the household_id (e.g. TIBUCAG-HH-001 -> 001).
 * @param {Object} hh 
 * @returns {string}
 */
export function getHouseNumber(hh) {
  if (!hh) return '000';
  let numStr = String(hh.house_number || '');
  // If the stored house number contains no digits, fall back to extracting from the ID
  if (!/\d/.test(numStr) && hh.household_id) {
    const parts = hh.household_id.split('-');
    numStr = parts[parts.length - 1]; 
  }
  // Remove leading zeros for clean formatting, then we can pad it later if we want
  const parsed = parseInt(numStr, 10);
  return isNaN(parsed) ? numStr : String(parsed);
}

