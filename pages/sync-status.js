/**
 * sync-status.js — Sync Status & Cloud Upload
 *
 * Shows connection state, pending event count, and provides a manual
 * sync button that POSTs inspection events to a Google Apps Script
 * web app. Uses Content-Type text/plain to avoid CORS preflight.
 *
 * The Apps Script deployment URL is stored in localStorage under
 * the key 'sync_url'. If missing the user is prompted to configure it.
 */

import { getUnsyncedEvents, markEventsSynced, db, pullMasterData, pushSyncData } from '../js/db.js';
import { isOnline, showToast, formatDate, getCurrentUser } from '../js/utils.js';
import { CONFIG } from '../js/config.js';

const LS_LAST_SYNC = 'last_sync_time';

/**
 * Renders the sync status page.
 * @param {HTMLElement} container - #page-content element
 */
export async function renderSyncPage(container) {
  const user = getCurrentUser();

  if (!user || user.employee_no !== 'ADMIN1234') {
    container.innerHTML = `
      <div class="card section" style="text-align: center; margin-top: 40px;">
        <h2 style="color: var(--color-error); margin-bottom: 8px;">Access Denied</h2>
        <p class="text-muted">You do not have permission to view the Admin panel.</p>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.location.hash='#home'">Go Home</button>
      </div>
    `;
    return;
  }

  const online        = isOnline();
  const unsyncedEvts  = await getUnsyncedEvents();
  const pendingCount  = unsyncedEvts.length;
  const lastSync      = localStorage.getItem(LS_LAST_SYNC);
  const householdCount = await db.households.count();

  // ── Render ─────────────────────────────────────────────────
  container.innerHTML = `
    <h1 class="page-title">Admin Panel</h1>
    <p class="page-subtitle">Manage system settings and cloud synchronization</p>

    <!-- ═══════════════════════════════════════════════════════
         1. Connection Status & Sync
         ═══════════════════════════════════════════════════════ -->
    <div class="card section" style="text-align:center">
      <h3 id="conn-label" style="margin-bottom:4px">${online ? 'Connected to Internet' : 'No Internet Connection'}</h3>
      <p class="text-muted text-sm" style="margin-bottom:16px">
        Last synced: <strong id="last-sync-label">${lastSync ? formatDate(lastSync) : 'Never synced'}</strong>
      </p>
      <button
        id="sync-btn"
        class="btn btn-primary btn-block"
        ${!online ? 'disabled' : ''}
      >
        Sync Now
      </button>
      ${!online
        ? '<p class="form-hint" style="text-align:center;margin-top:8px">Connect to the internet to sync.</p>'
        : ''}
    </div>

    <!-- ═══════════════════════════════════════════════════════
         2. Read-Only Settings
         ═══════════════════════════════════════════════════════ -->
    <div class="card section">
      <div class="card-header">
        <span class="card-title">Configuration Details</span>
      </div>
      <div class="form-group">
        <label class="form-label">Google Apps Script URL</label>
        <div style="background: var(--bg-body); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); word-break: break-all; font-family: monospace; font-size: 13px; color: var(--text-secondary);">
          ${CONFIG.SYNC_URL}
        </div>
        <p class="form-hint" style="margin-top: 8px;">To change this URL, update the <strong>config.js</strong> file on the server.</p>
      </div>
    </div>
  `;

  // ── Live connectivity listener ─────────────────────────────
  function onConnChange() {
    const nowOnline = isOnline();
    const label = document.getElementById('conn-label');
    const btn   = document.getElementById('sync-btn');
    const pullBtn = document.getElementById('pull-btn');

    if (label) label.textContent = nowOnline ? 'Connected to Internet' : 'No Internet Connection';
    if (btn && pendingCount > 0) btn.disabled = !nowOnline;
    if (pullBtn) pullBtn.disabled = !nowOnline;
  }
  window.addEventListener('online',  onConnChange);
  window.addEventListener('offline', onConnChange);

  // ── Sync button ────────────────────────────────────────────
  document.getElementById('sync-btn').addEventListener('click', async () => {
    const syncUrl = CONFIG.SYNC_URL;

    if (!syncUrl) {
      showToast('Sync URL is not configured in code.', 'error');
      return;
    }

    const btn = document.getElementById('sync-btn');
    btn.disabled    = true;
    btn.textContent = 'Syncing...';

    // Show fetching popup
    document.querySelectorAll('#sync-fetching-modal, #sync-success-modal').forEach(el => el.remove());
    const fetchingHtml = `
      <div id="sync-fetching-modal" style="position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 9999; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-radius: var(--radius-lg); padding: 24px; text-align: center; width: 90%; max-width: 340px;">
        <div style="margin-bottom: 16px;"><span class="spinner" style="display:inline-block; width:32px; height:32px; border:3px solid var(--border-color); border-top-color:var(--accent-primary); border-radius:50%; animation: spin 1s linear infinite;"></span></div>
        <h3 style="margin-bottom: 8px;">Syncing Data...</h3>
        <p class="text-sm text-muted">Please wait while we connect to the server.</p>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', fetchingHtml);

    try {
      const syncUser  = getCurrentUser();
      const syncedCount = await pushSyncData(syncUrl, syncUser);

      btn.textContent = 'Pulling Data...';
      const pullResult = await pullMasterData(syncUrl);

      // Save last sync time
      const now = new Date().toISOString();
      localStorage.setItem(LS_LAST_SYNC, now);

      // Update header time
      const timeEl = document.getElementById('last-synced-time');
      if (timeEl) timeEl.textContent = formatDate(now);

      // Re-render the page first to update counts
      await renderSyncPage(container);

      // Remove fetching popup
      const fetchingModal = document.getElementById('sync-fetching-modal');
      if (fetchingModal) fetchingModal.remove();

      // Show Custom Success Modal
      const modalHtml = `
        <div id="sync-success-modal" style="position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 9999; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-radius: var(--radius-lg); padding: 24px; text-align: center; width: 90%; max-width: 340px; animation: slideUp 0.3s ease-out;">
          <div style="margin-bottom: 16px;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto; display: block;">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h3 style="margin-bottom: 8px; color: var(--color-success)">Sync Successful!</h3>
          <p style="font-size: 14px; margin-bottom: 8px; color: var(--text-primary)">Downloading and fetching of data is successful.</p>
          <p style="font-weight: bold; font-size: 14px; margin-bottom: 16px;">Fetched ${pullResult.households} Households.</p>
          <button class="btn btn-primary btn-block btn-sm" onclick="document.getElementById('sync-success-modal').remove()">OK</button>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (err) {
      console.error('Sync error:', err);
      const fetchingModal = document.getElementById('sync-fetching-modal');
      if (fetchingModal) fetchingModal.remove();
      
      let errMsg = err.message;
      if (errMsg.includes('Failed to fetch')) {
        errMsg += ' — Ensure your Google Apps Script is deployed with "Who has access: Anyone"';
      }
      showToast(`Sync failed: ${errMsg}`, 'error');
      
      btn.disabled    = false;
      btn.textContent = 'Sync Now';
    }
  });


  return () => {
    sessionStorage.removeItem('admin_authenticated');
    window.removeEventListener('online',  onConnChange);
    window.removeEventListener('offline', onConnChange);
  };
}

// ── Helpers ────────────────────────────────────────────────────

// Removed eventIcon function since emojis are removed

/**
 * Minimal HTML escaper (avoids importing escapeHtml from utils
 * for the inline template literals).
 */
function escapeHtmlSafe(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
