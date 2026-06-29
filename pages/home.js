/**
 * home.js — Dashboard Home Page
 *
 * The first screen users see after login. Provides a quick overview:
 * greeting, key statistics, and the latest activity feed.
 */

import { getStats, getAllHouseholds, db } from '../js/db.js';
import { formatDate, getCurrentUser, timeAgo, showToast, escapeHtml } from '../js/utils.js';
import { Html5Qrcode } from 'html5-qrcode';

export async function renderHomePage(container) {
  // Fetch data in parallel
  const [stats, households] = await Promise.all([
    getStats(),
    getAllHouseholds(),
  ]);

  // Clean up lingering mockup data (from initial seeded DB)
  const mockups = await db.inspection_events.filter(e => ['Carlo Mendoza', 'Maria Santos', 'Juan dela Cruz'].includes(e.user_name)).toArray();
  if (mockups.length > 0) {
    const keys = mockups.map(m => m.event_id);
    await db.inspection_events.bulkDelete(keys);
  }

  // Grab the 5 most recent inspection events across ALL households (not just today)
  const rawRecentEvents = await db.inspection_events
    .orderBy('timestamp')
    .reverse()
    .limit(5)
    .toArray();

  const formattedEvents = rawRecentEvents.map(evt => {
    const hh = households.find(h => h.household_id === evt.household_id) || { house_number: evt.household_id.replace('TIBUCAG-HH-', '').replace(/^0+/, ''), household_head: 'Unknown' };
    let eventTypeStr = evt.event_type || "";
    if (evt.event_type === "registration") {
      eventTypeStr = "New household added";
    } else if (evt.field_changed) {
      eventTypeStr = `${evt.field_changed} updated`;
    } else if (evt.event_type === "inspection" || evt.event_type === "Household Scan") {
      eventTypeStr = `Household ${String(hh.house_number).replace(/^0+/, '')} scanned`;
    }
    return {
      ...evt,
      house_number: hh.house_number,
      household_head: hh.household_head,
      display_event_type: eventTypeStr
    };
  });

  // ── Build markup ────────────────────────────────────────────
  const pendingSyncClass = stats.pendingSync > 0 ? 'stat-card--warning' : '';

  container.innerHTML = `
    <!-- Location Header & Hero Action Section -->
    <section class="section hero-action-section" style="margin-top: 8px;">
      <div style="background: var(--bg-card-hover); padding: 16px; border-radius: var(--radius-md); margin-bottom: 24px; border: 1px solid var(--border-color); text-align: center;">
        <p style="font-size: 13px; font-weight: 500; color: var(--text-primary); line-height: 1.6;">Sitio Tibucag, Barangay Dagohoy, Municipality of Talaingod, Davao del Norte</p>
      </div>

      <p class="greeting-sub" style="margin-bottom: 16px; font-weight: 500; color: var(--text-secondary);">Tap below to scan a household QR code.</p>
      <button id="home-scan-btn" class="btn btn-primary" style="width: 100%; justify-content: center; padding: 16px; font-size: 16px; letter-spacing: 0.5px; box-shadow: var(--shadow-md);">SCAN QR CODE</button>
      
      <div style="text-align: center; margin-top: 16px;">
        <span id="upload-qr-link" style="text-decoration: underline; color: var(--text-secondary); cursor: pointer; font-size: 14px;">Upload QR Image instead</span>
        <input type="file" id="qr-upload-file" accept="image/*" style="display: none;">
      </div>
      
      <div id="scanner-container" style="display: none; margin-top: 16px;">
        <div class="scanner-wrapper card">
          <div id="qr-reader" style="width: 100%;"></div>
        </div>
        <div id="scan-result" class="scan-result"></div>
        <button id="cancel-scan-btn" class="btn btn-outline" style="width: 100%; margin-top: 12px; justify-content: center; font-size: 14px;">Close Scanner</button>
      </div>
    </section>

    <!-- Metric Dashboard Section -->
    <section class="section metric-dashboard" style="margin-top: 24px; margin-bottom: 24px;">
      <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
        <div class="stat-card card" style="background: var(--bg-card-hover);">
          <span class="stat-value" style="font-size: 20px;">${stats.totalHouseholds}</span>
          <span class="stat-label">Monitored Households</span>
        </div>
        <div class="stat-card card ${pendingSyncClass}">
          <span class="stat-value ${stats.pendingSync > 0 ? 'pending-value' : ''}">${stats.pendingSync}</span>
          <span class="stat-label">Pending Sync</span>
        </div>
      </div>
    </section>

    <!-- Recent Activity Feed -->
    <section class="section recent-inspections">
      <h3 class="section-title">Recent Activity Log</h3>
      ${formattedEvents.length === 0 ? renderEmptyState() : `
        <ul class="list-group" style="padding: 0; margin: 0; list-style: none;">
          ${formattedEvents.map(renderEventCard).join('')}
        </ul>
      `}
    </section>
  `;

  // ── Scanner Logic ───────────────────────────────────────────
  const scanBtn = document.getElementById('home-scan-btn');
  const cancelBtn = document.getElementById('cancel-scan-btn');
  const scannerContainer = document.getElementById('scanner-container');
  let html5QrCode = null;
  let isNavigating = false;

  const handleDecodedText = async (decodedText) => {
    if (isNavigating) return;
    isNavigating = true;

    const resultDiv = document.getElementById('scan-result');
    const household = await db.households.get(decodedText);

    if (household) {
      if (resultDiv) {
        resultDiv.innerHTML = `<div class="scan-match card"><p><strong>${escapeHtml(household.household_head)}</strong></p><p class="text-muted">${escapeHtml(decodedText)}</p></div>`;
      }
      try { await html5QrCode.stop(); } catch(e) {}
      setTimeout(() => {
        window.location.hash = `#profile/${decodedText}`;
      }, 600);
    } else {
      showToast('Household not found in local database.', 'error');
      if (resultDiv) {
        resultDiv.innerHTML = `<div class="scan-no-match card"><p>Scanned: <code>${escapeHtml(decodedText)}</code></p><p class="text-error">ID not recognized.</p></div>`;
      }
      setTimeout(() => { isNavigating = false; }, 2000);
    }
  };

  scanBtn.addEventListener('click', async () => {
    scanBtn.style.display = 'none';
    scannerContainer.style.display = 'block';

    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('qr-reader');
      }
      
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        showToast('No camera found on this device. You can upload an image instead.', 'error');
        return;
      }

      // Prefer back camera
      let cameraId = cameras[0].id;
      const backCam = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear') || c.label.toLowerCase().includes('environment'));
      if (backCam) cameraId = backCam.id;

      await html5QrCode.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleDecodedText,
        (error) => {
          // Ignore background scan errors
        }
      );
    } catch (err) {
      console.error('Scanner init error:', err);
      showToast('Camera unavailable. Please allow camera access, or upload an image instead.', 'error');
    }
  });

  const uploadBtn = document.getElementById('upload-qr-link');
  const uploadFileInput = document.getElementById('qr-upload-file');

  uploadBtn.addEventListener('click', () => {
    uploadFileInput.click();
  });

  uploadFileInput.addEventListener('change', async (e) => {
    if (e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    try {
      // If the camera is currently running, stop it first to prevent conflicts
      if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
        scannerContainer.style.display = 'none';
        scanBtn.style.display = 'flex';
      }
    } catch(err) {
      console.warn('Could not stop active scanner', err);
    }

    // Always create a fresh instance for file scanning to avoid state issues
    const fileScanner = new Html5Qrcode('qr-reader');
    
    try {
      uploadBtn.style.pointerEvents = 'none';
      uploadBtn.textContent = 'Scanning...';
      
      const decodedText = await fileScanner.scanFile(file, false);
      
      // Update our global reference so router cleanup can still clear it if needed
      html5QrCode = fileScanner; 
      
      await handleDecodedText(decodedText);
    } catch (err) {
      console.error('File scan error:', err);
      showToast('Could not find a valid QR code in the image.', 'error');
    } finally {
      uploadBtn.style.pointerEvents = 'auto';
      uploadBtn.textContent = 'Upload QR Image instead';
      uploadFileInput.value = ''; // Reset input
    }
  });

  cancelBtn.addEventListener('click', async () => {
    if (html5QrCode) {
      try { await html5QrCode.stop(); } catch(e) {}
      // html5QrCode = null; // Do not nullify, can be reused
    }
    scannerContainer.style.display = 'none';
    scanBtn.style.display = 'flex';
  });

  return () => {
    if (html5QrCode) {
      try { html5QrCode.stop(); } catch(e) {}
    }
  };
}

/**
 * Renders a single inspection event card for the recent activity feed.
 */
function renderEventCard(evt) {
  return `
    <li class="list-item" style="display:flex; justify-content:space-between; align-items:center;">
      <a href="#profile/${evt.household_id}" style="text-decoration: none; color: inherit; display: block; flex: 1;">
        <div style="font-weight: 500; font-size: 14px;">HOUSEHOLD ${String(evt.house_number).replace(/^0+/, '')} &mdash; ${escapeHtml(evt.household_head)}</div>
        <div class="text-sm" style="color: var(--text-secondary); margin-top: 4px;">
          ${escapeHtml(evt.display_event_type)}${evt.user_name ? ' by ' + escapeHtml(evt.user_name) : ''} <span style="opacity:0.6; margin:0 4px;">&bull;</span> ${timeAgo(evt.timestamp)}
        </div>
      </a>
    </li>
  `;
}

/**
 * Converts an event_type slug into a human-readable label.
 */
function formatEventType(type) {
  const map = {
    routine_inspection: 'Routine Inspection',
    field_update:       'Field Update',
    follow_up:          'Follow-up',
    verification:       'Verification',
  };
  return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Returns markup for the empty-state placeholder.
 */
function renderEmptyState() {
  return `
    <div class="empty-state" style="padding: 24px 16px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
      <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">No activity recorded yet. Start by scanning a household QR code or editing household data.</p>
    </div>
  `;
}
