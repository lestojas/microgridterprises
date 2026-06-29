/**
 * user-login.js — Employee ID Authorization Gate
 *
 * Simple login: enter Employee ID → checked against Authorized Users
 * (case-insensitive). No password required.
 */

import { setCurrentUser, isOnline, showToast } from '../js/utils.js';
import { db, pullMasterData } from '../js/db.js';
import { CONFIG } from '../js/config.js';

export async function renderUserLogin(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card card" style="max-width: 400px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 16px;">
          <img src="/mge-logo.png" alt="MGE Logo" style="height: 60px; border-radius: 50%; margin: 0 auto;" />
        </div>
        <h1 class="login-title" style="font-size: 20px; text-align: center;">MICROGRIDTERPRISES</h1>
        <p class="login-subtitle" style="text-align: center;">Household Monitoring Tool</p>

        <div class="login-divider" style="margin: 20px 0; border-bottom: 1px solid var(--border-color);"></div>

        <!-- Login Form -->
        <form id="login-form">
          <p class="login-instructions" style="margin-bottom: 16px; text-align: center;">Enter your Employee ID to continue.</p>
          <div class="form-group">
            <input type="text" id="login-empid" class="form-input" required autocomplete="off" style="text-transform: uppercase;">
          </div>

          <!-- Warning message area (hidden by default) -->
          <div id="login-warning" style="display: none; background: rgba(255, 71, 87, 0.12); border: 1px solid rgba(255, 71, 87, 0.3); border-radius: 8px; padding: 12px 14px; margin-bottom: 16px;">
            <p style="color: #ff4757; font-size: 13px; font-weight: 500; margin: 0; display: flex; align-items: center; gap: 8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4757" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <span id="login-warning-text">Not authorized.</span>
            </p>
          </div>

          <button type="submit" id="login-btn" class="btn btn-primary btn-block">Continue</button>
        </form>

      </div>
      <p class="login-footer" style="text-align:center; margin-top:30px; font-size:12px; color:var(--text-tertiary);">v1.1 &middot; Offline-first PWA</p>
    </div>
  `;

  const loginForm = document.getElementById('login-form');
  const warningBox = document.getElementById('login-warning');
  const warningText = document.getElementById('login-warning-text');

  // Silently trigger a background sync when the login page loads
  if (isOnline()) {
    pullMasterData(CONFIG.SYNC_URL).catch(() => { /* ignore silent failure */ });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = document.getElementById('login-empid').value.trim();

    if (!empId) return;

    warningBox.style.display = 'none';

    const btn = document.getElementById('login-btn');
    btn.textContent = 'Checking...';
    btn.disabled = true;

    try {
      // 1. Check locally synced authorized_users first
      let allUsers = await db.authorized_users.toArray();
      let matched = allUsers.find(u =>
        String(u.employee_no).trim().toLowerCase() === empId.toLowerCase()
      );

      // 2. If not found locally, and we are online, automatically pull the latest master data
      if (!matched && isOnline()) {
        await pullMasterData(CONFIG.SYNC_URL);
        
        // Check local database again after the pull
        allUsers = await db.authorized_users.toArray();
        matched = allUsers.find(u =>
          String(u.employee_no).trim().toLowerCase() === empId.toLowerCase()
        );
      }

      if (matched) {
        // Authorized
        setCurrentUser(matched);
        window.location.hash = '#home';
        window.location.reload();
      } else {
        // Not authorized (even after pull)
        warningText.textContent = `Employee ID "${empId.toUpperCase()}" is not authorized. Please contact your administrator.`;
        warningBox.style.display = 'block';
        btn.textContent = 'Continue';
        btn.disabled = false;
      }
    } catch (err) {
      console.error('Login check error:', err);
      warningText.textContent = 'An error occurred. Please try again.';
      warningBox.style.display = 'block';
      btn.textContent = 'Continue';
      btn.disabled = false;
    }
  });
}
