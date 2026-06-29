/**
 * households-panel.js — Households Panel
 *
 * Provides:
 *  1. Search and dropdown to select and view a household profile
 *  2. Hidden form to add a new household (toggled by a button)
 *  3. Clear local data utility
 */

import { db, getAllHouseholds, getUnsyncedEvents, pushSyncData } from '../js/db.js';
import { showToast, escapeHtml, generateHouseholdId, generateUUID, isOnline, formatDate, getCurrentUser, getHouseNumber } from '../js/utils.js';

export async function renderHouseholdsPanel(container) {
  const households = await getAllHouseholds();
  const unsyncedEvts = await getUnsyncedEvents();
  const pendingHH = db.pending_households ? await db.pending_households.where('is_synced').equals(0).toArray() : [];
  
  // Conflicted edits
  const conflictedHH = await db.households.filter(h => h.needs_sync === 1 && h.conflict_data).toArray();
  
  // Helper to fetch household info
  const getHH = (id) => households.find(h => h.household_id === id) || { house_number: id.replace('TIBUCAG-HH-', '').replace(/^0+/, ''), household_head: 'Unknown' };

  const combinedHistory = [
    ...pendingHH.map(h => ({
      household_id: h.household_id,
      house_number: h.house_number,
      household_head: h.household_head,
      event_type: 'New Household',
      timestamp: h.timestamp || new Date().toISOString(),
      user_name: getCurrentUser()?.user_name,
      is_conflict: false
    })),
    ...unsyncedEvts.map(e => {
      const hh = getHH(e.household_id);
      return {
        ...e,
        house_number: hh.house_number,
        household_head: hh.household_head,
        event_type: e.field_changed ? `${e.field_changed} updated` : 'Data Update',
        is_conflict: false
      };
    }),
    ...conflictedHH.map(h => {
      // Find what fields differ between local and server to summarize the update
      const local = h;
      const server = h.conflict_data;
      const changed = [];
      if (local.household_head !== server.household_head) changed.push('Household Head');
      if (local.fourps !== server.fourps) changed.push('4Ps');
      if (local.solar !== server.solar) changed.push('Solar');
      if (local.remarks !== server.remarks) changed.push('Remarks');
      if (local.member_count !== server.member_count) changed.push('Members');
      if (JSON.stringify(local.dynamic_dropdowns || {}) !== JSON.stringify(server.dynamic_dropdowns || {})) changed.push('Dynamic Dropdowns');
      if (JSON.stringify(local.dynamic_texts || {}) !== JSON.stringify(server.dynamic_texts || {})) changed.push('Dynamic Texts');
      
      return {
        household_id: h.household_id,
        house_number: h.house_number,
        household_head: h.household_head,
        event_type: changed.length > 0 ? `${changed.join(', ')} updated` : 'Data Update',
        timestamp: new Date().toISOString(), // Float to top
        is_conflict: true,
        user_name: getCurrentUser()?.user_name,
        local_data: h,
        server_data: h.conflict_data
      };
    })
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const pendingCount = pendingHH.length + unsyncedEvts.length + conflictedHH.length;
  const online = isOnline();

  // Build household list items
  const hhOptions = households
    .map(h => {
      const num = String(getHouseNumber(h)).padStart(3, '0');
      return `
        <div class="hh-list-item" data-id="${escapeHtml(h.household_id)}" data-house="${escapeHtml(num)}" data-head="${escapeHtml(h.household_head)}" style="padding: 12px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 14px; font-weight: 500;">${num} — ${escapeHtml(h.household_head)}</span>
          <span style="color: var(--text-secondary); font-size: 16px;">›</span>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <h1 class="page-title">Households</h1>
    <p class="page-subtitle">Select a household to view its details, or add a new one.</p>

    <!-- ═══════════════════════════════════════════════════════
         1. Search & Select Household
         ═══════════════════════════════════════════════════════ -->
    <div class="card section">
      <div class="form-group" style="margin-bottom: 12px;">
        <label class="form-label" for="hh-search">Search by House Number</label>
        <input type="text" id="hh-search" class="form-input" placeholder="Type a house number to filter...">
      </div>
      <div class="form-group mb-0">
        <label class="form-label">View Household Profile</label>
        <div id="hh-list" style="max-height: 145px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-main);">
          ${hhOptions}
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         2. Add Household Section
         ═══════════════════════════════════════════════════════ -->
    <div style="margin-bottom: 24px;">
      <button id="toggle-add-hh-btn" class="btn btn-secondary btn-block">ADD HOUSEHOLD</button>
    </div>

    <div id="add-household-container" class="card section" style="display: none;">
      <div class="card-header">
        <span class="card-title" style="display:flex;align-items:center;gap:8px">
          Add New Household
        </span>
      </div>

      <form id="add-household-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label" for="hh-number">House Number</label>
          <input id="hh-number" class="form-input" type="text" required placeholder="e.g., 4B">
        </div>

        <div class="form-group">
          <label class="form-label" for="hh-head">Household Head</label>
          <input id="hh-head" class="form-input" type="text" required placeholder="Full name of household head">
        </div>

        <div style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label class="form-label" for="hh-fourps">4Ps Status</label>
            <select id="hh-fourps" class="form-select">
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>

          <div class="form-group" style="flex:1">
            <label class="form-label" for="hh-solar">Solar Status</label>
            <select id="hh-solar" class="form-select">
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:12px">
          <div class="form-group" style="flex:1">
            <label class="form-label" for="hh-gps-lat">GPS Latitude (optional)</label>
            <input id="hh-gps-lat" class="form-input" type="number" step="0.000001" placeholder="e.g., 7.745">
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label" for="hh-gps-lng">GPS Longitude (optional)</label>
            <input id="hh-gps-lng" class="form-input" type="number" step="0.000001" placeholder="e.g., 125.57">
          </div>
        </div>

        ${(function() {
          let dynamicOptions = {};
          try {
            dynamicOptions = JSON.parse(localStorage.getItem('dynamic_options')) || {};
          } catch(e) {}
          let html = '';
          for (const [key, options] of Object.entries(dynamicOptions)) {
            if (options && options.length > 0) {
              html += `<div class="form-group">
                <label class="form-label" for="add-dynamic-${escapeHtml(key)}">${escapeHtml(key)}</label>
                <select id="add-dynamic-${escapeHtml(key)}" class="form-select add-dynamic-dropdown" data-key="${escapeHtml(key)}">
                  <option value="">-- Select --</option>
                  ${options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
                </select>
              </div>`;
            } else {
              html += `<div class="form-group">
                <label class="form-label" for="add-dynamic-${escapeHtml(key)}">${escapeHtml(key)}</label>
                <input id="add-dynamic-${escapeHtml(key)}" class="form-input add-dynamic-text" data-key="${escapeHtml(key)}" type="text" placeholder="Enter ${escapeHtml(key)}">
              </div>`;
            }
          }
          return html;
        })()}

        <button type="submit" class="btn btn-primary btn-block">Save Household</button>
      </form>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         3. History of Events (Pending Sync)
         ═══════════════════════════════════════════════════════ -->
    <div class="card section" style="margin-top: 24px;">
      <div class="card-header">
        <span class="card-title" style="display:flex;align-items:center;gap:8px">
          Update History (Pending Sync)
        </span>
        <span class="badge ${pendingCount > 0 ? 'badge-warning' : 'badge-success'}">
          ${pendingCount}
        </span>
      </div>

      ${pendingCount === 0
        ? `<p class="text-muted text-sm">All updates have been synced to the master sheet.${!online ? ' New updates will automatically sync when connected to the internet.' : ''}</p>`
        : `
          <div style="max-height:260px;overflow-y:auto;margin-bottom:12px" class="no-scrollbar">
            ${combinedHistory.slice(0, 50).map(evt => `
              <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color)">
                <div style="min-width:0;flex:1">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <p style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                      HOUSEHOLD ${escapeHtml(String(getHouseNumber(evt)).padStart(3, '0'))} - ${escapeHtml(evt.household_head)}
                      ${evt.is_conflict ? '<span class="badge badge-error" style="margin-left: 8px;">Conflict</span>' : ''}
                    </p>
                    ${evt.is_conflict ? `<button class="btn btn-sm btn-danger resolve-conflict-btn" data-id="${escapeHtml(evt.household_id)}" style="padding: 4px 10px; font-size: 11px;">Resolve</button>` : ''}
                  </div>
                  <p style="font-size:11px;color:var(--text-secondary)">
                    ${escapeHtml(evt.event_type)} &mdash; ${formatDate(evt.timestamp)} (Local Device)${evt.user_name ? ` &bull; by ${escapeHtml(evt.user_name)}` : ''}
                  </p>
                </div>
              </div>
            `).join('')}
            ${pendingCount > 50 ? `<p class="text-muted text-sm" style="text-align:center;padding-top:8px">…and ${pendingCount - 50} more</p>` : ''}
          </div>
        `
      }

      <button
        id="hh-sync-btn"
        class="btn btn-primary btn-block"
        ${!online || pendingCount === 0 ? 'disabled' : ''}
      >
        Sync Updates Now
      </button>
      ${!online && pendingCount > 0
        ? '<p class="form-hint" style="text-align:center;margin-top:8px">Offline. Updates will automatically sync when connected to the internet.</p>'
        : ''}
    </div>

    </div>
  `;

  // ── Logic: Search Filter ──────────────────────────────────
  const searchInput = document.getElementById('hh-search');
  const hhList = document.getElementById('hh-list');

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const items = hhList.querySelectorAll('.hh-list-item');
    
    items.forEach(item => {
      const houseNum = item.dataset.house.toLowerCase();
      const houseNumRaw = String(parseInt(houseNum, 10)).toLowerCase();
      const head = item.dataset.head.toLowerCase();
      
      const match = !query || houseNum.includes(query) || houseNumRaw.includes(query) || head.includes(query);
      item.style.display = match ? 'flex' : 'none';
    });
  });

  // ── Logic: Select Household ────────────────────────────────
  hhList.addEventListener('click', (e) => {
    const item = e.target.closest('.hh-list-item');
    if (item && item.dataset.id) {
      window.location.hash = `#profile/${item.dataset.id}`;
    }
  });

  // ── Logic: Toggle Add Household Form ───────────────────────
  const toggleBtn = document.getElementById('toggle-add-hh-btn');
  const addContainer = document.getElementById('add-household-container');
  toggleBtn.addEventListener('click', () => {
    if (addContainer.style.display === 'none') {
      addContainer.style.display = 'block';
      toggleBtn.textContent = 'CANCEL';
      toggleBtn.classList.replace('btn-secondary', 'btn-ghost');
    } else {
      addContainer.style.display = 'none';
      toggleBtn.textContent = 'ADD HOUSEHOLD';
      toggleBtn.classList.replace('btn-ghost', 'btn-secondary');
    }
  });

  // ── Logic: Add Household Form Submit ───────────────────────
  const addForm = document.getElementById('add-household-form');
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const houseNumberInput = document.getElementById('hh-number').value.trim();
    const headInput = document.getElementById('hh-head').value.trim();
    const fourpsInput = document.getElementById('hh-fourps').value === 'true';
    const solarInput = document.getElementById('hh-solar').value === 'true';
    const latInput = parseFloat(document.getElementById('hh-gps-lat').value) || 0;
    const lngInput = parseFloat(document.getElementById('hh-gps-lng').value) || 0;

    const newHouseholdId = `TIBUCAG-HH-${new Date().getTime()}`;
    
    const dynamic_dropdowns = {};
    document.querySelectorAll('.add-dynamic-dropdown').forEach(el => {
      if (el.value.trim()) dynamic_dropdowns[el.dataset.key] = el.value.trim();
    });
    const dynamic_texts = {};
    document.querySelectorAll('.add-dynamic-text').forEach(el => {
      if (el.value.trim()) dynamic_texts[el.dataset.key] = el.value.trim();
    });

    const newHH = {
      household_id: newHouseholdId,
      house_number: houseNumberInput,
      household_head: headInput,
      member_count: 1,
      fourps: fourpsInput,
      solar: solarInput,
      gps_lat: latInput,
      gps_lng: lngInput,
      dynamic_dropdowns,
      dynamic_texts,
      is_synced: 0,
      timestamp: new Date().toISOString()
    };

    try {
      if (db.pending_households) {
        await db.pending_households.add(newHH);
      } else {
        showToast('Database schema is outdated. Cannot add a pending household.', 'error');
        return;
      }

      await db.households.add(newHH);

      showToast('Household added successfully! (Pending sync)', 'success');
      
      addForm.reset();
      addContainer.style.display = 'none';
      toggleBtn.textContent = 'ADD HOUSEHOLD';
      toggleBtn.classList.replace('btn-ghost', 'btn-secondary');

      await renderHouseholdsPanel(container);

    } catch (err) {
      showToast('Failed to add household: ' + err.message, 'error');
    }
  });

  // ── Logic: Sync Pending Events inline  // Setup manual sync
  const hhSyncBtn = container.querySelector('#hh-sync-btn');
  if (hhSyncBtn) {
    hhSyncBtn.addEventListener('click', async () => {
      const manualBtn = document.getElementById('manual-sync-btn');
      if (manualBtn) manualBtn.click();
    });
  }

  // Setup Conflict Resolution
  container.querySelectorAll('.resolve-conflict-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const conflictEvt = combinedHistory.find(x => x.household_id === id && x.is_conflict);
      if (conflictEvt) {
        openConflictModal(conflictEvt.local_data, conflictEvt.server_data);
      }
    });
  });

  function openConflictModal(local, server) {
    const existing = document.getElementById('conflict-modal');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="conflict-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div class="card" style="position: relative; width: 90%; max-width: 400px; max-height: 90vh; overflow-y: auto;">
          <button id="close-conflict-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-tertiary); line-height: 1; padding: 0;">&times;</button>
          <div class="card-header" style="border-bottom: 1px solid var(--border-color); margin-bottom: 16px; padding-right: 24px;">
            <h3 style="color: var(--danger-color); margin: 0;">Sync Conflict Detected</h3>
          </div>
          <p class="text-sm text-muted" style="margin-bottom: 16px;">
            <strong>HOUSEHOLD ${local.household_id.replace('TIBUCAG-HH-', '').replace(/^0+/, '')}</strong> was edited by someone else on the server after you last synced. Please review the differences below:
          </p>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px;">
            <div style="background: var(--bg-hover); padding: 12px; border-radius: var(--radius-md);">
              <h4 style="font-size: 12px; margin-top: 0; margin-bottom: 8px; color: var(--text-secondary);">Your Local Edit</h4>
              <ul style="font-size: 13px; padding-left: 16px; margin: 0; color: var(--text-primary);">
                <li>Head: ${escapeHtml(local.household_head)}</li>
                <li>Members: ${local.member_count}</li>
                <li>4Ps: ${local.fourps ? 'Yes' : 'No'}</li>
                <li>Solar: ${local.solar ? 'Yes' : 'No'}</li>
              </ul>
            </div>
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
              <h4 style="font-size: 12px; margin-top: 0; margin-bottom: 8px; color: var(--text-secondary);">Server Version</h4>
              <ul style="font-size: 13px; padding-left: 16px; margin: 0; color: var(--text-primary);">
                <li>Head: ${escapeHtml(server.household_head)}</li>
                <li>Members: ${server.member_count}</li>
                <li>4Ps: ${server.fourps ? 'Yes' : 'No'}</li>
                <li>Solar: ${server.solar ? 'Yes' : 'No'}</li>
              </ul>
            </div>
          </div>
          
          <div style="display: flex; gap: 12px;">
            <button id="conflict-keep-server" class="btn btn-secondary" style="flex: 1;">Keep Server</button>
            <button id="conflict-keep-local" class="btn btn-danger" style="flex: 1;">Keep Local</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('close-conflict-modal').addEventListener('click', () => {
      document.getElementById('conflict-modal').remove();
    });

    document.getElementById('conflict-keep-server').addEventListener('click', async () => {
      // Keep server: discard local edit, clear needs_sync, copy server data to local
      await db.households.update(local.household_id, {
        house_number: server.house_number,
        household_head: server.household_head,
        member_count: server.member_count,
        fourps: server.fourps,
        solar: server.solar,
        gps_lat: server.gps_lat,
        gps_lng: server.gps_lng,
        dynamic_dropdowns: server.dynamic_dropdowns || {},
        dynamic_texts: server.dynamic_texts || {},
        needs_sync: 0,
        conflict_data: null
      });
      document.getElementById('conflict-modal').remove();
      renderHouseholdsPanel(container);
    });

    document.getElementById('conflict-keep-local').addEventListener('click', async () => {
      // Keep local: set force_push so server accepts it, clear conflict
      await db.households.update(local.household_id, {
        force_push: true,
        conflict_data: null
      });
      document.getElementById('conflict-modal').remove();
      const manualBtn = document.getElementById('manual-sync-btn');
      if (manualBtn) manualBtn.click(); // Trigger sync immediately
      else renderHouseholdsPanel(container);
    });
  }


}
