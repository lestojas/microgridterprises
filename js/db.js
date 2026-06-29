/**
 * db.js - Core data layer for Sitio Tibucag Monitoring PWA
 * Uses Dexie.js (IndexedDB wrapper) for fully offline storage.
 * All writes are append-only inspection events; household records
 * are updated in-place only for field corrections.
 */

import Dexie from 'dexie';
import { generateUUID, getHouseNumber } from './utils.js';

// ---------------------------------------------------------------------------
// Database instance
// ---------------------------------------------------------------------------
export const db = new Dexie('SitioTibucagDB');

// Schema – only indexed / searchable fields are listed here.
// Dexie stores every other property on the object automatically.
db.version(1).stores({
  households:        'household_id, house_number, household_head',
  household_members: 'member_id, household_id, member_name',
  inspection_events: 'event_id, household_id, user_id, timestamp, event_type, is_synced',
  workers:           'worker_id, worker_name, employee_no', // Keep for legacy upgrade
});

db.version(2).stores({
  pending_households: 'household_id, timestamp, is_synced'
});

db.version(3).stores({
  workers: null, // Delete old table
  authorized_users: 'user_id, user_name, employee_no',
  inspection_events: 'event_id, household_id, user_id, timestamp, event_type, is_synced'
}).upgrade(async tx => {
  await tx.inspection_events.clear();
});

db.version(2).stores({
  pending_households: 'household_id, timestamp, is_synced'
});

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

/**
 * Pulls master data from Google Apps Script and overwrites local database
 * (households, members, and workers). Leaves inspection events intact.
 * @param {string} url - Google Apps Script Web App URL
 */
export async function pullMasterData(url) {
  if (!url || url.includes('/dev')) {
    throw new Error('Invalid URL: You must use the /exec URL from a New Deployment, not the /dev URL.');
  }

  // Prevent cached CORS failures
  const fetchUrl = url.includes('?') 
    ? `${url}&t=${new Date().getTime()}` 
    : `${url}?t=${new Date().getTime()}`;
    
  const response = await fetch(fetchUrl, { method: 'GET', redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  
  const data = await response.json();
  if (data.status !== 'success') throw new Error(data.message || 'Unknown error from server');

  if (data.dynamic_options) {
    localStorage.setItem('dynamic_options', JSON.stringify(data.dynamic_options));
  }

  await db.transaction('rw', db.households, db.household_members, db.authorized_users, db.inspection_events, async () => {
    // Clear existing static data
    // Don't overwrite households that currently have a conflict pending resolution
    const localConflicts = await db.conflict_queue.toArray();
    const conflictedIds = new Set(localConflicts.map(c => c.household_id));

    // We must PRESERVE the local version of conflicted households and members!
    // Since we are clearing the tables, fetch the local versions first.
    const existingLocalHouseholds = await db.households.toArray();
    const localConflictedHouseholds = existingLocalHouseholds.filter(h => conflictedIds.has(h.household_id));
    
    const serverHouseholdsToBulkAdd = data.households.filter(h => !conflictedIds.has(h.household_id));
    const householdsToBulkAdd = [...serverHouseholdsToBulkAdd, ...localConflictedHouseholds];

    await db.households.clear();
    await db.households.bulkAdd(householdsToBulkAdd);
    
    // Also update members, dropdowns, etc., preserving local members for conflicted households
    const existingLocalMembers = await db.household_members.toArray();
    const localConflictedMembers = existingLocalMembers.filter(m => conflictedIds.has(m.household_id));
    
    const serverMembersToBulkAdd = (data.members || []).filter(m => !conflictedIds.has(m.household_id));
    const membersToBulkAdd = [...serverMembersToBulkAdd, ...localConflictedMembers];

    await db.household_members.clear();
    
    // Insert new data
    if (membersToBulkAdd.length > 0) {
      await db.household_members.bulkAdd(membersToBulkAdd);
    }

    await db.authorized_users.clear();

    // Clear locally synced events, preserving offline unsynced ones
    await db.inspection_events.where('is_synced').equals(1).delete();

    // Insert new data
    // (Households are already inserted above)
    if (data.members && data.members.length > 0) {
      await db.household_members.bulkAdd(data.members);
    }
    if (data.authorized_users && data.authorized_users.length > 0) {
      await db.authorized_users.bulkAdd(data.authorized_users);
    }
    if (data.events && data.events.length > 0) {
      const eventsToInsert = data.events.map(e => ({
        ...e,
        is_synced: 1
      }));
      // Avoid inserting duplicates if the sheet accidentally has duplicate Event IDs
      for (const e of eventsToInsert) {
        await db.inspection_events.put(e);
      }
    }
  });

  let totalBeneficiaries = 0;
  if (data.households) {
    totalBeneficiaries = data.households.reduce((sum, hh) => sum + (Number(hh.member_count) || 0), 0);
  }

  // Fallback to members sheet count if totalBeneficiaries is 0
  const membersSheetCount = data.members ? data.members.length : 0;

  return {
    households: data.households ? data.households.length : 0,
    members: Math.max(totalBeneficiaries, membersSheetCount),
    authorized_users: data.authorized_users ? data.authorized_users.length : 0
  };
}

// ---------------------------------------------------------------------------
// Household helpers
// ---------------------------------------------------------------------------

/**
 * Returns a single household with its members and recent inspection events.
 * @param {string} householdId - e.g. 'TIBUCAG-HH-001'
 */
export async function getHousehold(householdId) {
  const household = await db.households.get(householdId);
  if (!household) return null;

  const members = await db.household_members
    .where('household_id')
    .equals(householdId)
    .toArray();

  const events = await db.inspection_events
    .where('household_id')
    .equals(householdId)
    .reverse()
    .sortBy('timestamp');

  return { ...household, members, events };
}

/**
 * Returns every household, sorted by house_number ascending.
 */
export async function getAllHouseholds() {
  const households = await db.households.toArray();
  // Sort numerically based on the parsed house number
  return households.sort((a, b) => {
    const numA = parseInt(getHouseNumber(a), 10);
    const numB = parseInt(getHouseNumber(b), 10);
    return numA - numB;
  });
}

// ---------------------------------------------------------------------------
// Inspection events (append-only log)
// ---------------------------------------------------------------------------

/**
 * Adds a new inspection event. Auto-generates event_id, timestamp, is_synced.
 * @param {Object} event - Must include household_id, user_id, user_name,
 *   event_type. Optional: field_changed, old_value, new_value, remarks.
 */
export async function addInspectionEvent(event) {
  const record = {
    event_id:      generateUUID(),
    timestamp:     new Date().toISOString(),
    is_synced:     0,
    // Caller-supplied fields
    household_id:  event.household_id,
    user_id:       event.user_id,
    user_name:     event.user_name,
    event_type:    event.event_type,
    field_changed: event.field_changed || null,
    old_value:     event.old_value     || null,
    new_value:     event.new_value     || null,
    remarks:       event.remarks       || '',
  };
  await db.inspection_events.add(record);
  return record;
}

/**
 * Returns all events for a household, newest first.
 */
export async function getInspectionEvents(householdId) {
  const events = await db.inspection_events
    .where('household_id')
    .equals(householdId)
    .toArray();

  // Sort descending by timestamp
  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

/** Returns all events that have not yet been synced to the server. */
export async function getUnsyncedEvents() {
  return db.inspection_events
    .where('is_synced')
    .equals(0)
    .toArray();
}

/**
 * Marks the given event IDs as synced (is_synced = 1).
 * @param {string[]} eventIds
 */
export async function markEventsSynced(eventIds) {
  await db.inspection_events
    .where('event_id')
    .anyOf(eventIds)
    .modify({ is_synced: 1 });
}

/**
 * Pushes unsynced events to the cloud.
 */
export async function pushSyncData(syncUrl, user) {
  if (!syncUrl || syncUrl.includes('/dev')) {
    throw new Error('Invalid URL: You must use the /exec URL from a New Deployment, not the /dev URL.');
  }

  const events = await getUnsyncedEvents();
  const pendingHH = db.pending_households ? await db.pending_households.where('is_synced').equals(0).toArray() : [];
  const updatedHH = await db.households.filter(h => h.needs_sync === 1).toArray();

  for (let i = 0; i < updatedHH.length; i++) {
    updatedHH[i].members = await db.household_members.where('household_id').equals(updatedHH[i].household_id).toArray();
  }
  
  if (events.length === 0 && pendingHH.length === 0 && updatedHH.length === 0) return 0; // Nothing to sync

  const lastSyncStr = localStorage.getItem('last_sync_time');
  const base_timestamp = lastSyncStr ? lastSyncStr : new Date('2000-01-01').toISOString();

  const payload = {
    events,
    households: pendingHH,
    updated_households: updatedHH,
    user_id:        user?.user_id   || 'unknown',
    user_name:      user?.user_name || 'Unknown',
    sync_timestamp: new Date().toISOString(),
    base_timestamp: base_timestamp
  };

  const payloadStr = JSON.stringify(payload);
  const blob = new Blob([payloadStr], { type: 'text/plain' });

  const response = await fetch(syncUrl, {
    method:  'POST',
    body:    blob,
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const eventIds = events.map(e => e.event_id);
  await markEventsSynced(eventIds);
  
  if (pendingHH.length > 0) {
    const hhIds = pendingHH.map(h => h.household_id);
    await db.pending_households.where('household_id').anyOf(hhIds).modify({ is_synced: 1 });
  }

    if (updatedHH.length > 0) {
      const result = await response.json();
      if (result.status === 'error') {
        throw new Error("Server Error: " + result.message);
      }
      const conflicts = result.conflicts || [];
      const conflictIds = new Set(conflicts.map(c => c.household_id));
      
      for (const h of updatedHH) {
        if (conflictIds.has(h.household_id)) {
          // Save conflict data for UI resolution
          const serverData = conflicts.find(c => c.household_id === h.household_id);
          await db.households.update(h.household_id, { conflict_data: serverData });
        } else {
          // Successfully pushed, clear flag and conflict data
          await db.households.update(h.household_id, { needs_sync: 0, conflict_data: null });
        }
      }
      
      // Return early if we already parsed JSON
      return events.length + pendingHH.length + updatedHH.length;
    }

  return events.length + pendingHH.length + updatedHH.length;
}

// ---------------------------------------------------------------------------
// Field-level updates
// ---------------------------------------------------------------------------

/**
 * Updates a single field on a household record.
 * @param {string} householdId
 * @param {string} field - Property name to update
 * @param {*}      value - New value
 */
export async function updateHouseholdField(householdId, field, value) {
  await db.households.update(householdId, { 
    [field]: value,
    needs_sync: 1
  });
}

/**
 * Replaces all members for a household.
 * @param {string} householdId 
 * @param {Array} newMembers 
 */
export async function updateHouseholdMembers(householdId, newMembers) {
  await db.transaction('rw', db.household_members, db.households, async () => {
    await db.household_members.where('household_id').equals(householdId).delete();
    if (newMembers.length > 0) {
      await db.household_members.bulkAdd(newMembers);
    }
    await db.households.update(householdId, { needs_sync: 1 });
  });
}

// ---------------------------------------------------------------------------
// Authorized Users
// ---------------------------------------------------------------------------

/** Returns all registered users. */
export async function getAuthorizedUsers() {
  return db.authorized_users.toArray();
}

// ---------------------------------------------------------------------------
// Dashboard statistics
// ---------------------------------------------------------------------------

/**
 * Returns aggregate stats for the dashboard.
 * @returns {{ totalHouseholds, totalMembers, totalInspections, pendingSync }}
 */
export async function getStats() {
  const [totalHouseholds, totalMembers, totalInspections, pendingEvents, pendingHH] =
    await Promise.all([
      db.households.count(),
      db.household_members.count(),
      db.inspection_events.count(),
      db.inspection_events.where('is_synced').equals(0).count(),
      db.pending_households ? db.pending_households.where('is_synced').equals(0).count() : Promise.resolve(0)
    ]);

  const pendingSync = pendingEvents + pendingHH;
  return { totalHouseholds, totalMembers, totalInspections, pendingSync };
}
