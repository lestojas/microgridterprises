/**
 * inspection-form.js — Inspection Logging Form
 *
 * Lets an authorized user record an inspection for a household:
 *  - View current status of 4P's and Solar Kit (read-only)
 *  - Optionally update either status
 *  - Add required remarks / technology status notes
 *
 * Each status change generates a STATUS_CHANGE event and updates the
 * household record. An INSPECTION event is always created with remarks.
 */

import { getHousehold, addInspectionEvent, updateHouseholdField } from '../js/db.js';
import { getCurrentUser, showToast, escapeHtml } from '../js/utils.js';

/**
 * Renders the inspection form for a given household.
 * @param {HTMLElement} container - #page-content element
 * @param {string}      householdId - e.g. 'TIBUCAG-HH-001'
 */
export async function renderInspectionForm(container, householdId) {
  // ── Guard: missing or invalid household ────────────────────
  if (!householdId) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-state-title">Household Not Found</h2>
        <p class="empty-state-message">No household ID was provided.</p>
        <a href="#home" class="btn btn-primary" style="margin-top:12px">Go Home</a>
      </div>`;
    return;
  }

  const household = await getHousehold(householdId);

  if (!household) {
    container.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-state-title">Household Not Found</h2>
        <p class="empty-state-message">No household with ID <strong>${escapeHtml(householdId)}</strong> exists in the database.</p>
        <a href="#home" class="btn btn-primary" style="margin-top:12px">Go Home</a>
      </div>`;
    return;
  }

  // ── Staff info ────────────────────────────────────────────
  const user = getCurrentUser();
  const userDisplay = user
    ? `${escapeHtml(user.user_name)}`
    : '<span style="color:var(--color-error)">No staff selected</span>';

  // ── Current status labels ──────────────────────────────────
  const fourpsLabel  = household.fourps  ? 'Yes' : 'No';
  const solarLabel   = household.solar   ? 'Yes' : 'No';
  const fourpsBadge  = household.fourps  ? 'badge-yes' : 'badge-no';
  const solarBadge   = household.solar   ? 'badge-yes' : 'badge-no';

  // ── Render ─────────────────────────────────────────────────
  container.innerHTML = `
    <!-- Back button -->
    <a href="#profile/${escapeHtml(householdId)}" class="btn btn-ghost btn-sm mb-md no-print" style="gap:6px">
      <span>←</span> Back to Profile
    </a>

    <!-- Title -->
    <h1 class="page-title" style="margin-bottom:2px">New Inspection</h1>
    <p class="page-subtitle">House No. ${household.house_number} — ${escapeHtml(household.household_head)}</p>

    <!-- Current staff -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="margin-bottom:0">
        <span class="card-title" style="display:flex;align-items:center;gap:8px">
          Microgrid Staff
        </span>
      </div>
      <p style="color:var(--text-secondary);font-size:13px;margin-top:8px">${userDisplay}</p>
    </div>

    <!-- Form card -->
    <form id="inspection-form" class="card" style="margin-bottom:24px" autocomplete="off">

      <!-- Current status summary (read-only) -->
      <div class="section">
        <p class="section-title">Current Status Summary</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:130px;padding:14px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-md)">
            <p style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">4P's Beneficiary</p>
            <span class="badge ${fourpsBadge}">${fourpsLabel}</span>
          </div>
          <div style="flex:1;min-width:130px;padding:14px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-md)">
            <p style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">NORDECO Solar Kit</p>
            <span class="badge ${solarBadge}">${solarLabel}</span>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 4P's status update -->
      <div class="form-group">
        <label class="form-label" for="fourps-update">Update 4P's Status</label>
        <select id="fourps-update" class="form-select">
          <option value="">(No Change)</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>

      <!-- Solar Kit status update -->
      <div class="form-group">
        <label class="form-label" for="solar-update">Update NORDECO Solar Home Kit Status</label>
        <select id="solar-update" class="form-select">
          <option value="">(No Change)</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>

      <div class="divider"></div>

      <!-- Remarks -->
      <div class="form-group">
        <label class="form-label" for="remarks">Remarks / Technology Status Notes <span style="color:var(--color-error)">*</span></label>
        <textarea
          id="remarks"
          class="form-textarea"
          required
          placeholder="Describe the condition of the solar kit, any issues observed, maintenance needed, etc."
          rows="4"
        ></textarea>
        <p class="form-hint">Required — briefly describe what you observed during this visit.</p>
      </div>

      <!-- Submit -->
      <button type="submit" class="btn btn-primary btn-block" id="submit-btn" style="margin-top:8px">
        Submit Inspection
      </button>
    </form>
  `;

  // ── Form submission ────────────────────────────────────────
  const form = document.getElementById('inspection-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const remarks   = document.getElementById('remarks').value.trim();
    const fourpsVal = document.getElementById('fourps-update').value;
    const solarVal  = document.getElementById('solar-update').value;
    const submitBtn = document.getElementById('submit-btn');

    // Validate
    if (!remarks) {
      showToast('Please enter your remarks before submitting.', 'error');
      document.getElementById('remarks').focus();
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
      showToast('No staff is logged in. Please log in first.', 'error');
      return;
    }

    // Disable button to prevent double-submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const baseEvent = {
        household_id: householdId,
        user_id:    currentUser.user_id,
        user_name:  currentUser.user_name,
      };

      // ── STATUS_CHANGE: 4P's ──────────────────────────────
      if (fourpsVal !== '') {
        const newBool = fourpsVal === 'true';
        const oldBool = household.fourps;

        if (newBool !== oldBool) {
          await addInspectionEvent({
            ...baseEvent,
            event_type:    'STATUS_CHANGE',
            field_changed: 'fourps_status',
            old_value:     String(oldBool),
            new_value:     String(newBool),
            remarks:       remarks,
          });
          await updateHouseholdField(householdId, 'fourps', newBool);
        }
      }

      // ── STATUS_CHANGE: Solar Kit ─────────────────────────
      if (solarVal !== '') {
        const newBool = solarVal === 'true';
        const oldBool = household.solar;

        if (newBool !== oldBool) {
          await addInspectionEvent({
            ...baseEvent,
            event_type:    'STATUS_CHANGE',
            field_changed: 'solar_kit_status',
            old_value:     String(oldBool),
            new_value:     String(newBool),
            remarks:       remarks,
          });
          await updateHouseholdField(householdId, 'solar', newBool);
        }
      }

      // ── INSPECTION event (always created) ────────────────
      await addInspectionEvent({
        ...baseEvent,
        event_type:    'INSPECTION',
        field_changed: null,
        old_value:     null,
        new_value:     null,
        remarks:       remarks,
      });

      showToast('Inspection logged successfully!', 'success');
      window.location.hash = `#profile/${householdId}`;
    } catch (err) {
      console.error('Inspection submission error:', err);
      showToast('Failed to save inspection. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Inspection';
    }
  });
}
