/**
 * app.js — Main Application Entry Point
 * 
 * This file is the "brain" of the app. It handles:
 * 1. Initializing the database on first load
 * 2. Hash-based routing (switching between pages/screens)
 * 3. Rendering the app shell (header + bottom navigation)
 * 4. Checking if a worker is logged in
 * 
 * CONCEPTUAL NOTE FOR BEGINNERS:
 * A "Single Page App" (SPA) means we have ONE HTML file (index.html).
 * Instead of loading different HTML pages, we swap the content inside
 * <div id="app"> using JavaScript. The URL hash (#home, #scan, #profile)
 * tells us which "page" to show. This is called "client-side routing."
 */

import { db, getStats, pushSyncData, pullMasterData } from './db.js';
import { CONFIG } from './config.js';
import { getCurrentUser, clearCurrentUser, showToast, isOnline, formatDateShort } from './utils.js';
import { renderHomePage } from '../pages/home.js';

import { renderProfilePage } from '../pages/household-profile.js';
import { renderInspectionForm } from '../pages/inspection-form.js';
import { renderHouseholdsPanel } from '../pages/households-panel.js';
import { renderQRGenerator } from '../pages/qr-generator.js';
import { renderSyncPage } from '../pages/sync-status.js';
import { renderUserLogin } from '../pages/user-login.js';

// ─── PWA Service Worker Registration ───────────────────────
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    showToast('App update available! Applying changes...', 'success');
    // Force reload after a brief delay to apply new scripts
    setTimeout(() => {
      updateSW(true);
    }, 1500);
  },
  onOfflineReady() {
    console.log('PWA is ready to work offline');
  },
});

// ─── PWA Install Prompt ────────────────────────────────────────
window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  window.deferredPrompt = e;
  // Dispatch a custom event
  window.dispatchEvent(new CustomEvent('pwa-install-available'));
});

// ─── App Shell ───────────────────────────────────────────────
/**
 * The "app shell" is the persistent UI frame — header at top, 
 * navigation at bottom. The content area in between changes 
 * based on which page/route is active.
 */
function renderAppShell() {
  const app = document.getElementById('app');
  const user = getCurrentUser();
  
  const lastSyncDate = localStorage.getItem('last_sync_time');
  const lastSyncStr = lastSyncDate ? formatDateShort(lastSyncDate) : 'Never';

  const userName = user ? user.user_name : '';

  app.innerHTML = `
    <!-- Top Header Bar -->
    <header class="app-header">
      <div class="header-left" style="cursor: pointer; flex: 1; min-width: 0;" onclick="window.location.hash=''">
        <img src="/mge-logo.png" alt="MGE Logo" class="header-logo" />
        <div style="flex: 1; min-width: 0;">
          <h1 class="header-title truncate">MICROGRIDTERPRISES</h1>
          <span class="header-subtitle truncate">HOUSEHOLD MONITORING TOOL</span>
        </div>
      </div>
      <div class="header-right">
        <div class="header-sync-info">
          <div class="sync-indicator ${isOnline() ? 'online' : 'offline'}" id="sync-dot">
            <span class="sync-dot"></span>
            <span class="sync-label" id="sync-label-text">${isOnline() ? 'Connected to Internet' : 'Not Connected to Internet'}</span>
          </div>
          <div class="last-synced">Last Synced: <span id="last-synced-time">${lastSyncStr}</span></div>
        </div>
        <button id="manual-sync-btn" class="btn-icon" aria-label="Manual Sync" title="Manual Sync">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
    </header>

    <!-- User Info Bar -->
    <div class="user-bar">
      <div class="user-bar-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span class="user-bar-name">${userName}</span>
      </div>
      <button id="sign-out-btn" class="user-bar-signout" title="Sign Out">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        <span>Sign Out</span>
      </button>
    </div>

    <!-- Main Content Area (pages render here) -->
    <main id="page-content" class="page">
      <!-- Dynamic content goes here -->
    </main>

    <!-- Bottom Navigation Bar -->
    <nav class="bottom-nav">
      <a href="#home" class="nav-item" data-page="home">
        <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span class="nav-label">HOME</span>
      </a>
      <a href="#households" class="nav-item" data-page="households">
        <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        <span class="nav-label">HOUSEHOLDS</span>
      </a>
      <a href="#qr-generator" class="nav-item" data-page="qr-generator">
        <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <rect x="7" y="7" width="3" height="3"></rect>
          <rect x="14" y="7" width="3" height="3"></rect>
          <rect x="7" y="14" width="3" height="3"></rect>
          <rect x="14" y="14" width="3" height="3"></rect>
        </svg>
        <span class="nav-label">GENERATE QR</span>
      </a>
      ${user && user.employee_no === 'ADMIN1234' ? `
      <a href="#sync" class="nav-item" data-page="sync">
        <svg class="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span class="nav-label">ADMIN</span>
      </a>
      ` : ''}
    </nav>
  `;

  // Listen for online/offline changes to update the indicator
  window.addEventListener('online', () => {
    updateOnlineStatus();
    runAutoSync(); // Trigger auto-sync immediately when connection is restored
  });
  window.addEventListener('offline', updateOnlineStatus);

  // Start 60-second auto-sync interval
  setInterval(runAutoSync, 60000);

  // Manual sync button listener
  const manualSyncBtn = document.getElementById('manual-sync-btn');
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', handleManualSync);
  }

  // Sign-out button listener
  const signOutBtn = document.getElementById('sign-out-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      clearCurrentUser();
      window.location.hash = '#login';
      window.location.reload();
    });
  }
}

// ─── Auto Sync Logic ─────────────────────────────────────────
let isAutoSyncing = false;

async function runAutoSync() {
  if (!isOnline() || isAutoSyncing) return;
  
  const syncUrl = CONFIG.SYNC_URL;
  if (!syncUrl) return; // Don't auto-sync if not configured

  isAutoSyncing = true;
  try {
    const user = getCurrentUser();
    const btn = document.getElementById('manual-sync-btn');
    if (btn) btn.classList.add('spinning');
    
    const count = await pushSyncData(syncUrl, user);
    
    // Always pull to ensure local data is perfectly up-to-date
    const pullResult = await pullMasterData(syncUrl);

    const now = pullResult.server_timestamp || new Date().toISOString();
    localStorage.setItem('last_sync_time', now);
    
    const timeEl = document.getElementById('last-synced-time');
    if (timeEl) timeEl.textContent = formatDateShort(now);

    // Refresh UI if the user is on a page that displays synced data
    const hash = window.location.hash.slice(1) || 'home';
    const route = hash.split('/')[0];
    if (route === 'home' || route === 'sync' || route === 'households') {
      router();
    } else if (route === 'profile') {
      const modal = document.getElementById('edit-data-modal');
      if (!modal || modal.style.display === 'none') {
        router();
      }
    }
  } catch (err) {
    console.error('Auto sync failed silently:', err);
  } finally {
    isAutoSyncing = false;
    const btn = document.getElementById('manual-sync-btn');
    if (btn) btn.classList.remove('spinning');
  }
}

async function handleManualSync() {
  if (!isOnline()) {
    showToast('Cannot sync while offline', 'error');
    return;
  }
  
  const syncUrl = CONFIG.SYNC_URL;
  if (!syncUrl) {
    showToast('Sync URL not configured.', 'warning');
    return;
  }

  const btn = document.getElementById('manual-sync-btn');
  btn.classList.add('spinning');
  btn.disabled = true;

  try {
    const user = getCurrentUser();
    const count = await pushSyncData(syncUrl, user);
    const pullResult = await pullMasterData(syncUrl);
    
    const now = pullResult.server_timestamp || new Date().toISOString();
    localStorage.setItem('last_sync_time', now);
    
    const timeEl = document.getElementById('last-synced-time');
    if (timeEl) timeEl.textContent = formatDateShort(now);

    showToast(count > 0 ? `Synced ${count} event(s) successfully` : 'Up to date. No new events to sync.', 'success');
    
    const hash = window.location.hash.slice(1) || 'home';
    const route = hash.split('/')[0];
    if (route === 'home' || route === 'sync' || route === 'households' || route === 'profile') {
      router(); 
    }
  } catch (err) {
    console.error('Manual sync failed:', err);
    showToast('Sync failed: ' + err.message, 'error');
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

function updateOnlineStatus() {
  const dot = document.getElementById('sync-dot');
  if (dot) {
    const online = isOnline();
    dot.className = `sync-indicator ${online ? 'online' : 'offline'}`;
    dot.innerHTML = `
      <span class="sync-dot"></span>
      <span class="sync-label" id="sync-label-text">${online ? 'Connected to Internet' : 'Not Connected to Internet'}</span>
    `;
  }
}

// ─── Router ──────────────────────────────────────────────────
/**
 * CONCEPTUAL NOTE:
 * "Routing" decides which page to show based on the URL hash.
 * When the URL is "index.html#scan", the hash is "#scan", 
 * and we show the scanner page. When it's "#home", we show 
 * the dashboard. This all happens without loading a new HTML file.
 */

// Track the currently active page to clean up resources (like camera)
let currentPageCleanup = null;

async function router() {
  // Get the hash from the URL (e.g., "#home" → "home")
  const hash = window.location.hash.slice(1) || 'home';
  
  // Parse the route and any parameters
  // Example: "#profile/TIBUCAG-HH-001" → route="profile", params=["TIBUCAG-HH-001"]
  const parts = hash.split('/');
  const route = parts[0];
  const params = parts.slice(1);

  const userCount = await db.authorized_users.count();

  // Check if user is logged in (except for login and sync pages if no users exist)
  const user = getCurrentUser();
  if (!user && route !== 'login' && !(route === 'sync' && userCount === 0)) {
    window.location.hash = '#login';
    return;
  }

  // Clean up the previous page (e.g., stop camera on scanner page)
  if (currentPageCleanup) {
    currentPageCleanup();
    currentPageCleanup = null;
  }

  // Get the content container
  const content = document.getElementById('page-content');
  if (!content) return;

  // Add fade-in animation
  content.classList.remove('fade-in');
  // Force reflow to restart animation
  void content.offsetWidth;
  content.classList.add('fade-in');

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === route);
  });

  // Route to the correct page
  try {
    switch (route) {
      case 'home':
        currentPageCleanup = await renderHomePage(content);
        break;

      case 'profile':
        await renderProfilePage(content, params[0]); // params[0] = household_id
        break;
      case 'inspect':
        await renderInspectionForm(content, params[0]); // params[0] = household_id
        break;
      case 'households':
        await renderHouseholdsPanel(content);
        break;
      case 'qr-generator':
        await renderQRGenerator(content);
        break;
      case 'sync':
        currentPageCleanup = await renderSyncPage(content);
        break;
      case 'login':
        document.body.innerHTML = '<div id="app"><main id="page-content" class="page"></main></div>';
        await renderUserLogin(document.getElementById('page-content'));
        return;

      default:
        content.innerHTML = `
          <div class="empty-state">
            <h2>Page Not Found</h2>
            <p>The page you're looking for doesn't exist.</p>
            <a href="#home" class="btn btn-primary">Go Home</a>
          </div>
        `;
    }
  } catch (error) {
    console.error('Error rendering page:', error);
    content.innerHTML = `
      <div class="empty-state">
        <h2>Something went wrong</h2>
        <p>${error.message}</p>
        <a href="#home" class="btn btn-primary">Go Home</a>
      </div>
    `;
  }
}

// ─── Initialization ──────────────────────────────────────────
/**
 * This runs once when the app first loads.
 * It sets up the database, renders the shell, and starts routing.
 */
async function init() {
  try {
    // Step 1: Check if database has any households
    const householdCount = await db.households.count();

    if (householdCount === 0) {
      // No households exist! Need to pull data. Go straight to sync page.
      const app = document.getElementById('app');
      const content = document.createElement('div');
      content.id = 'page-content';
      content.className = 'page';
      app.innerHTML = '';
      app.appendChild(content);
      await renderSyncPage(content);
      return;
    }

    // Step 2: Check if a user is logged in
    const user = getCurrentUser();

    if (!user) {
      // No user logged in — show login screen directly
      const app = document.getElementById('app');
      const content = document.createElement('div');
      content.id = 'page-content';
      content.className = 'page';
      app.innerHTML = '';
      app.appendChild(content);
      await renderUserLogin(content);
      
      // After login, the user-login page will set the hash to #home
      // which triggers the full app shell render
      return;
    }

    // Step 3: Render the app shell (header + nav)
    renderAppShell();

    // Step 4: Route to the current page
    await router();
  } catch (error) {
    console.error('Initialization error:', error);
    document.getElementById('app').innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #ff4757;">
        <h2>Failed to initialize app</h2>
        <p>${error.message}</p>
        <button onclick="location.reload()" style="padding: 0.5rem 1rem; margin-top: 1rem;">Reload</button>
      </div>
    `;
  }
}

// Listen for hash changes (user clicks nav links or back button)
window.addEventListener('hashchange', async () => {
  const user = getCurrentUser();
  if (user && !document.querySelector('.app-header')) {
    // User just logged in, render the full shell first
    renderAppShell();
  }
  await router();
});

// Start the app when the DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Register the PWA service worker safely
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('Service worker registered automatically.');
    }).catch(err => {
      console.log('Service worker registration failed:', err);
    });
  });
}
