/**
 * household-profile.js — Household Profile Detail View
 *
 * Shows everything about a single household: basic info, GPS,
 * program status badges, member list, and full inspection history
 * rendered as a visual timeline.
 */

import { getHousehold, getInspectionEvents, updateHouseholdField, addInspectionEvent, updateHouseholdMembers } from '../js/db.js';
import { formatDate, timeAgo, escapeHtml, getCurrentUser, showToast } from '../js/utils.js';

/**
 * Renders the full profile page for a given household.
 * @param {HTMLElement} container
 * @param {string}      householdId - e.g. 'TIBUCAG-HH-001'
 */
export async function renderProfilePage(container, householdId) {
  // ── Guard: missing / invalid ID ──────────────────────────
  if (!householdId) {
    container.innerHTML = renderError('No household ID provided.');
    return;
  }

  const household = await getHousehold(householdId);

  if (!household) {
    container.innerHTML = renderError(
      `Household <strong>${escapeHtml(householdId)}</strong> was not found in the local database.`
    );
    return;
  }

  const events = await getInspectionEvents(householdId);
  const allMembers = household.members || [];
  const members = allMembers.filter(m => 
    m.relationship.toLowerCase() !== 'head' && 
    m.member_name.toLowerCase() !== (household.household_head || '').toLowerCase()
  );

  // ── Build markup ─────────────────────────────────────────
  container.innerHTML = `
    <!-- Back Button -->
    <a href="#households" class="back-link">← All Households</a>

    <!-- House Number Header -->
    <section class="profile-header" style="display: flex; align-items: center; justify-content: space-between;">
      <h2 class="profile-house-number" style="margin: 0;">Household ${household.house_number}</h2>
      <div id="edit-header-btn" style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--accent-primary);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        <span style="text-decoration: underline; font-weight: 500; font-size: 14px;">Edit Data</span>
      </div>
    </section>

    <!-- Profile Info Card -->
    <div class="profile-info card">
      <div class="profile-row">
        <span class="profile-label">Household Head:</span>
        <span class="profile-value profile-value--head">${household.household_head ? `<strong>${escapeHtml(household.household_head)}</strong>` : '<em style="color: var(--text-secondary); font-weight: normal;">No input.</em>'}</span>
      </div>
      <div class="profile-row">
        <span class="profile-label">GPS Coordinates:</span>
        <span class="profile-value">
          ${(household.gps_lat && household.gps_lat !== 0) || (household.gps_lng && household.gps_lng !== 0) ? `
          <strong>${household.gps_lat != null ? household.gps_lat.toFixed(5) : '0.00000'}</strong> <em>(latitude)</em>,
          <strong>${household.gps_lng != null ? household.gps_lng.toFixed(5) : '0.00000'}</strong> <em>(longitude)</em>
          ` : '<em style="color: var(--text-secondary); font-weight: normal;">No input.</em>'}
        </span>
      </div>
      <div class="profile-row">
        <span class="profile-label">4Ps:</span>
        <div class="profile-badges">
          ${household.fourps ? '<span class="badge badge-yes" style="padding: 4px 12px; font-weight: 600;">Yes</span>' : '<span class="badge badge-no" style="padding: 4px 12px; font-weight: 600;">No</span>'}
        </div>
      </div>
      <div class="profile-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
        <span class="profile-label">With NORDECO Solar Home Kit:</span>
        <div style="display: flex; gap: 8px;">
          ${household.solar ? '<span class="badge badge-yes" style="padding: 4px 12px; font-weight: 600;">Yes</span>' : '<span class="badge badge-no" style="padding: 4px 12px; font-weight: 600;">No</span>'}
        </div>
      </div>
      ${household.dynamic_dropdowns ? Object.entries(household.dynamic_dropdowns).map(([key, val]) => {
        const isEmpty = !val || String(val).trim() === '';
        let badgeClass = 'badge-neutral';
        let customStyle = 'background-color: #e0e0e0; color: #333;';
        if (val.toLowerCase() === 'yes') { badgeClass = 'badge-yes'; customStyle = ''; }
        if (val.toLowerCase() === 'no') { badgeClass = 'badge-no'; customStyle = ''; }
        return `
        <div class="profile-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
          <span class="profile-label">${escapeHtml(key)}:</span>
          <div style="display: flex; gap: 8px;">
            ${isEmpty ? '<span style="font-style: italic; color: var(--text-secondary);">No selection</span>' : `<span class="badge ${badgeClass}" style="padding: 4px 12px; font-weight: 600; ${customStyle}">${escapeHtml(val)}</span>`}
          </div>
        </div>`;
      }).join('') : ''}
      ${household.dynamic_texts ? Object.entries(household.dynamic_texts).map(([key, val], index, array) => {
        const isEmpty = !val || String(val).trim() === '';
        const isLast = index === array.length - 1;
        return `
        <div class="profile-row" style="flex-direction: column; align-items: flex-start; gap: 4px; ${isLast ? 'border-bottom: none;' : ''}">
          <span class="profile-label">${escapeHtml(key)}:</span>
          <span class="profile-value" style="${isEmpty ? 'font-style: italic; color: var(--text-secondary); font-weight: normal;' : 'font-weight: 500;'}">
            ${isEmpty ? 'No input.' : escapeHtml(val)}
          </span>
        </div>`;
      }).join('') : ''}
    </div>

    <!-- Edit Data Modal (Hidden) -->
    <div class="modal-overlay" id="edit-data-modal" style="display:none;">
      <div class="modal card" style="max-width: 420px; width: 92%; padding: 24px; max-height: 90vh; overflow-y: auto;">
        <h3 style="margin-bottom: 16px;">Edit Household Data</h3>
        <form id="edit-data-form">
          <div class="form-group">
            <label class="form-label" for="edit-hh-head">Household Head</label>
            <input type="text" id="edit-hh-head" class="form-input" value="${escapeHtml(household.household_head)}" required>
          </div>
          <div style="display:flex;gap:12px">
            <div class="form-group" style="flex:1">
              <label class="form-label" for="edit-fourps">4Ps</label>
              <select id="edit-fourps" class="form-select">
                <option value="true" ${household.fourps ? 'selected' : ''}>Yes</option>
                <option value="false" ${!household.fourps ? 'selected' : ''}>No</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" for="edit-solar">Solar</label>
              <select id="edit-solar" class="form-select">
                <option value="true" ${household.solar ? 'selected' : ''}>Yes</option>
                <option value="false" ${!household.solar ? 'selected' : ''}>No</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:12px">
            <div class="form-group" style="flex:1">
              <label class="form-label" for="edit-lat">Latitude</label>
              <input type="number" step="any" id="edit-lat" class="form-input" value="${household.gps_lat || ''}">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" for="edit-lng">Longitude</label>
              <input type="number" step="any" id="edit-lng" class="form-input" value="${household.gps_lng || ''}">
            </div>
          </div>
          ${(function() {
            let dynamicOptions = {};
            try {
              dynamicOptions = JSON.parse(localStorage.getItem('dynamic_options') || '{}');
            } catch(e) {}
            
            let html = '';
            if (household.dynamic_dropdowns) {
              html += Object.entries(household.dynamic_dropdowns).map(([key, val]) => {
                const options = dynamicOptions[key] || ['Yes', 'No'];
                const selectOptions = options.map(opt => `<option value="${escapeHtml(String(opt))}" ${String(opt) == String(val) ? 'selected' : ''}>${escapeHtml(String(opt))}</option>`).join('');
                return `
                  <div class="form-group">
                    <label class="form-label">${escapeHtml(key)}</label>
                    <select class="form-select edit-dynamic-dropdown" data-key="${escapeHtml(key)}">
                      <option value="" ${!val ? 'selected' : ''}>-- Select --</option>
                      ${selectOptions}
                    </select>
                  </div>
                `;
              }).join('');
            }
            if (household.dynamic_texts) {
              html += Object.entries(household.dynamic_texts).map(([key, val]) => {
                return `
                  <div class="form-group">
                    <label class="form-label">${escapeHtml(key)}</label>
                    <input type="text" class="form-input edit-dynamic-text" data-key="${escapeHtml(key)}" value="${escapeHtml(val || '')}">
                  </div>
                `;
              }).join('');
            }
            return html;
          })()}
          <div class="form-group" style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px;">
            <div style="margin-bottom: 8px;">
              <label class="form-label" style="margin: 0; color: var(--text-secondary); text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">Household Members</label>
            </div>
            <div id="edit-members-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
              <!-- Dynamic members populated via JS -->
            </div>
            <button type="button" id="add-member-btn" style="width: 100%; padding: 10px; font-size: 15px; font-weight: 600; color: #34d399; border: 2px dashed #34d399; background: rgba(52, 211, 153, 0.1); border-radius: 8px; cursor: pointer; transition: background 0.2s;">+Add</button>
          </div>
          <div style="display:flex;gap:12px; margin-top: 24px;">
            <button type="button" id="cancel-edit-btn" class="btn btn-ghost" style="flex:1">Cancel</button>
            <button type="submit" class="btn btn-primary" style="flex:1">Save</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Members Section -->
    <section class="profile-section" style="margin-top: 32px;">
      <h3 class="section-title" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        HOUSEHOLD MEMBERS:
        <span class="count-badge">${members.length + 1}</span>
        <span id="headcount-info-icon" title="Headcount includes the Household Head" style="display: inline-flex; cursor: pointer; color: var(--text-secondary);">
          <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </span>
      </h3>
      <div class="members-list">
        ${members.length > 0
          ? members.map(renderMemberItem).join('')
          : '<div class="empty-state" style="padding: 16px 24px;"><h3>Nothing to Show</h3></div>'
        }
      </div>
    </section>

    <!-- Update History -->
    <section class="profile-section" style="margin-top: 32px;">
      <h3 class="section-title">UPDATE HISTORY</h3>
      ${events.filter(e => e.field_changed).length > 0
        ? `<div class="timeline">${events.filter(e => e.field_changed).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(renderTimelineEvent).join('')}</div>`
        : `
          <div class="empty-state">
            <h3>No Updates Yet</h3>
            <p>Use "Edit Data" above to record an update.</p>
          </div>
        `
      }
    </section>
  `;

  // ── Logic: Info Icon ───────────────────────────────────────
  const infoIcon = document.getElementById('headcount-info-icon');
  if (infoIcon) {
    infoIcon.addEventListener('click', () => {
      showToast('Headcount includes the Household Head', 'info');
    });
  }

  // ── Logic: Edit Data ───────────────────────────────────────
  const editHeaderBtn = document.getElementById('edit-header-btn');
  const editModal = document.getElementById('edit-data-modal');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const editForm = document.getElementById('edit-data-form');

  const openEditModal = () => { editModal.style.display = 'flex'; };

  if (editHeaderBtn) {
    editHeaderBtn.addEventListener('click', openEditModal);
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      editModal.style.display = 'none';
    });
  }

  // ── Logic: Dynamic Members List ───────────────────────────────
  const addMemberBtn = document.getElementById('add-member-btn');
  const editMembersList = document.getElementById('edit-members-list');

  const renderEditMemberRow = (member = { member_name: '', relationship: 'Other' }) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.className = 'edit-member-row';
    
    const standardRels = ['Spouse', 'Son', 'Daughter', 'Grandchild', 'Son-in-law', 'Daughter-in-law'];
    const isOther = member.relationship && member.relationship.trim() !== '' && !standardRels.includes(member.relationship) && member.relationship !== 'Other';
    const arrowSvg = "data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239ca3af%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E";
    const selectStyle = `appearance: none; background-image: url('${arrowSvg}'); background-repeat: no-repeat; background-position: right 8px center; background-size: 10px auto; padding-right: 24px;`;

    row.innerHTML = `
      <input type="text" class="form-input edit-member-name" value="${escapeHtml(member.member_name)}" placeholder="Name" style="flex: 2; padding: 6px;" required>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
        <select class="form-select edit-member-rel" style="${selectStyle} padding: 6px;">
          <option value="Spouse" ${member.relationship === 'Spouse' ? 'selected' : ''}>Spouse</option>
          <option value="Son" ${member.relationship === 'Son' ? 'selected' : ''}>Son</option>
          <option value="Daughter" ${member.relationship === 'Daughter' ? 'selected' : ''}>Daughter</option>
          <option value="Grandchild" ${member.relationship === 'Grandchild' ? 'selected' : ''}>Grandchild</option>
          <option value="Son-in-law" ${member.relationship === 'Son-in-law' ? 'selected' : ''}>Son-in-law</option>
          <option value="Daughter-in-law" ${member.relationship === 'Daughter-in-law' ? 'selected' : ''}>Daughter-in-law</option>
          <option value="Others" ${isOther || !member.relationship || member.relationship.trim() === '' || member.relationship === 'Other' || member.relationship === 'Others' ? 'selected' : ''}>Others</option>
        </select>
      </div>
      <button type="button" class="remove-member-btn" style="background: none; border: none; color: #ff5252; font-size: 24px; font-weight: bold; cursor: pointer; padding: 0 4px; display: flex; align-items: center; justify-content: center; line-height: 1;">&times;</button>
    `;
    
    row.querySelector('.remove-member-btn').addEventListener('click', () => {
      row.remove();
    });
    
    return row;
  };

  if (editMembersList) {
    members.forEach(m => {
      editMembersList.appendChild(renderEditMemberRow(m));
    });
  }

  if (addMemberBtn) {
    addMemberBtn.addEventListener('click', () => {
      editMembersList.appendChild(renderEditMemberRow());
    });
  }

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newHead = document.getElementById('edit-hh-head').value.trim();
      const newFourps = document.getElementById('edit-fourps').value === 'true';
      const newSolar = document.getElementById('edit-solar').value === 'true';
      const newLatStr = document.getElementById('edit-lat').value.trim();
      const newLngStr = document.getElementById('edit-lng').value.trim();
      const newLat = newLatStr ? parseFloat(newLatStr) : null;
      const newLng = newLngStr ? parseFloat(newLngStr) : null;

      // Gather members
      const memberRows = document.querySelectorAll('.edit-member-row');
      const updatedMembers = [];
      memberRows.forEach((row, i) => {
        const name = row.querySelector('.edit-member-name').value.trim();
        let rel = row.querySelector('.edit-member-rel').value;
        if (name) {
          updatedMembers.push({
            member_id: householdId + '-M' + String(i + 1).padStart(2, '0'),
            household_id: householdId,
            member_name: name,
            relationship: rel
          });
        }
      });

      try {
        const user = getCurrentUser();

        // Build a summary of changes
        const changes = [];
        if (newHead !== household.household_head) {
          changes.push('Household Head');
          await updateHouseholdField(householdId, 'household_head', newHead);
        }
        if (newFourps !== household.fourps) {
          changes.push('4Ps');
          await updateHouseholdField(householdId, 'fourps', newFourps);
        }
        if (newSolar !== household.solar) {
          changes.push('Solar');
          await updateHouseholdField(householdId, 'solar', newSolar);
        }
        
        const checkLat = (household.gps_lat === 0 || household.gps_lat === '0' || household.gps_lat == null) ? '' : String(household.gps_lat).trim();
        const checkLng = (household.gps_lng === 0 || household.gps_lng === '0' || household.gps_lng == null) ? '' : String(household.gps_lng).trim();
        
        if ((newLatStr || '') !== checkLat) {
          changes.push('Latitude');
          await updateHouseholdField(householdId, 'gps_lat', newLat);
        }
        if ((newLngStr || '') !== checkLng) {
          changes.push('Longitude');
          await updateHouseholdField(householdId, 'gps_lng', newLng);
        }

        const dynamicDropdownEls = document.querySelectorAll('.edit-dynamic-dropdown');
        if (dynamicDropdownEls.length > 0) {
          const newDropdowns = { ...household.dynamic_dropdowns };
          let changed = false;
          dynamicDropdownEls.forEach(el => {
            const key = el.getAttribute('data-key');
            if (newDropdowns[key] !== el.value) {
              newDropdowns[key] = el.value;
              changed = true;
              if (!changes.includes(key)) changes.push(key);
            }
          });
          if (changed) {
            await updateHouseholdField(householdId, 'dynamic_dropdowns', newDropdowns);
          }
        }
        
        const dynamicTextEls = document.querySelectorAll('.edit-dynamic-text');
        if (dynamicTextEls.length > 0) {
          const newTexts = { ...household.dynamic_texts };
          let changed = false;
          dynamicTextEls.forEach(el => {
            const key = el.getAttribute('data-key');
            if (newTexts[key] !== el.value) {
              newTexts[key] = el.value;
              changed = true;
              if (!changes.includes(key)) changes.push(key);
            }
          });
          if (changed) {
            await updateHouseholdField(householdId, 'dynamic_texts', newTexts);
          }
        }


        const oldMembersStr = JSON.stringify(members.map(m => ({name: m.member_name, rel: m.relationship})));
        const newMembersStr = JSON.stringify(updatedMembers.map(m => ({name: m.member_name, rel: m.relationship})));
        if (oldMembersStr !== newMembersStr) {
          if (typeof updateHouseholdMembers === 'function') {
            await updateHouseholdMembers(householdId, updatedMembers);
          }
          changes.push('Members');
          if (updatedMembers.length !== members.length) {
            await updateHouseholdField(householdId, 'member_count', updatedMembers.length + 1);
          }
        }

        if (changes.length > 0) {
          await addInspectionEvent({
            household_id: householdId,
            user_id: user ? user.user_id : 'unknown',
            user_name: user ? user.user_name : 'Unknown',
            event_type: 'Data Update',
            field_changed: changes.join(', '),
            old_value: null,
            new_value: null,
            remarks: '',
            timestamp: new Date().toISOString()
          });
        }

        showToast('Household data updated successfully.', 'success');
        editModal.style.display = 'none';
        
        // Reload profile
        await renderProfilePage(container, householdId);

      } catch (err) {
        console.error(err);
        showToast('Error updating data: ' + err.message, 'error');
      }
    });
  }

// ─── Helpers ────────────────────────────────────────────────

/**
 * Renders a single household member row.
 */
function renderMemberItem(m) {
  return `
    <div class="member-item">
      <span class="member-name"><strong>${m.member_name ? escapeHtml(m.member_name) : '<em style="color:var(--text-secondary); font-weight:normal;">No input.</em>'}</strong></span>
      <span class="badge badge--rel ${getRelationshipClass(m.relationship)}">${m.relationship && m.relationship.trim() !== '' ? escapeHtml(m.relationship) : '<i>Unknown</i>'}</span>
    </div>
  `;
}

/**
 * Maps relationship strings to CSS modifier classes for subtle coloring.
 */
function getRelationshipClass(rel) {
  if (!rel) return '';
  const r = rel.toLowerCase();
  if (r === 'head')                       return 'badge--rel-head';
  if (r === 'spouse')                     return 'badge--rel-spouse';
  if (r === 'son')                        return 'badge--rel-son';
  if (r === 'daughter')                   return 'badge--rel-daughter';
  if (r === 'grandchild')                 return 'badge--rel-grandchild';
  if (r.includes('in-law'))               return 'badge--rel-inlaw';
  return 'badge--rel-other';
}

/**
 * Renders a single timeline event in the update history.
 */
function renderTimelineEvent(evt) {
  if (!evt.field_changed) return '';
  
  let changeText = escapeHtml(evt.field_changed).replace(/;/g, ',');
  if (changeText.includes(':')) {
    changeText = changeText.split(',').map(s => s.split(':')[0].trim()).join(', ');
  }
  
  let changeDetail = `
    <div class="timeline-change" style="margin-top: 4px; font-weight: 500; color: var(--text-primary);">
      ${changeText} updated
    </div>
  `;

  let displayRemarks = evt.remarks && evt.remarks !== 'No remarks provided.' 
    ? `<p class="timeline-remarks" style="margin-top: 6px;">${escapeHtml(evt.remarks)}</p>` 
    : '';

  return `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content card">
        <div class="timeline-header" style="margin-bottom: 2px;">
          <span class="timeline-worker" style="font-weight: 600;">${escapeHtml(evt.user_name)}</span>
        </div>
        <span class="timeline-date">${formatDate(evt.timestamp)} · ${timeAgo(evt.timestamp)}</span>
        ${changeDetail}
        ${displayRemarks}
      </div>
    </div>
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
 * Renders an error state for when a household is not found.
 */
function renderError(message) {
  return `
    <a href="#households" class="back-link">← All Households</a>
    <div class="empty-state">
      <h2>Household Not Found</h2>
      <p>${message}</p>
      <a href="#households" class="btn btn-primary" style="margin-top:1rem">Browse Households</a>
    </div>
  `;
}
