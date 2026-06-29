/**
 * ═══════════════════════════════════════════════════════════════
 * MICROGRIDTERPRISES Household Monitoring Tool — Google Apps Script
 * ═══════════════════════════════════════════════════════════════
 */

// ──────────────────────────────────────────────────────────────
// GET — Pull master data to the app
// ──────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── Households & Members ────────────────────────────────
    const hhSheet = ss.getSheetByName('Sitio Tibucag (Biomass)');
    const households = [];
    const members = [];
    let dynamicOptions = {};
    
    if (hhSheet && hhSheet.getLastRow() > 3) {
      // Get all data from Row 4 downwards (Row 1 is Toggles, Row 2 is Headers, Row 3 is Sub-headers)
      const numCols = Math.max(11, hhSheet.getLastColumn());
      const data = hhSheet.getRange(4, 1, hhSheet.getLastRow() - 3, numCols).getValues();
      const toggleRow  = hhSheet.getRange(1, 1, 1, numCols).getValues()[0];
      const headerRow1 = hhSheet.getRange(2, 1, 1, numCols).getValues()[0];
      const headerRow2 = hhSheet.getRange(3, 1, 1, numCols).getValues()[0];
      
      const getHeaderName = (c) => {
        const h2 = String(headerRow2[c] || '').trim();
        const h1 = String(headerRow1[c] || '').trim();
        if (h1 && h2) return h1 + ' - ' + h2;
        return h2 || h1 || `Column ${c + 1}`;
      };
      
      const isDropdown = {};
      if (numCols > 9 && hhSheet.getLastRow() >= 4) {
        const validations = hhSheet.getRange(4, 10, 1, numCols - 9).getDataValidations()[0];
        for (let i = 0; i < validations.length; i++) {
          const rule = validations[i];
          const c = 9 + i;
          
          const toggle = String(toggleRow[c] || '').trim().toLowerCase();
          if (toggle !== 'shown in app') {
            isDropdown[c] = false;
            continue;
          }
          
          if (rule != null) {
            isDropdown[c] = true;
            const headerName = getHeaderName(c);
            const criteria = rule.getCriteriaType();
            if (criteria == SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
              dynamicOptions[headerName] = rule.getCriteriaValues()[0];
            } else if (criteria == SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
              try {
                const range = rule.getCriteriaValues()[0];
                dynamicOptions[headerName] = range.getValues().flat().filter(String);
              } catch(e) {
                dynamicOptions[headerName] = [];
              }
            } else {
              dynamicOptions[headerName] = [];
            }
          } else {
            isDropdown[c] = false;
          }
        }
      }
      
      let currentHouseholdId = null;
      let memberCounter = 1;

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // A=0: House No, B=1: Head, C=2: Member Name, D=3: Relationship, E=4: No of Members
        // F=5: 4Ps, G=6: Solar, H=7: Lat, I=8: Lng
        const houseNoRaw = String(row[0]).trim();
        const headRaw = String(row[1]).trim();
        
        // If there is a House Number, this marks the start of a new Household
        if (houseNoRaw !== '') {
          currentHouseholdId = 'TIBUCAG-HH-' + houseNoRaw.padStart(3, '0');
          memberCounter = 1;
          
          let dynamic_dropdowns = {};
          let dynamic_texts = {};
          let server_updated_at = '';
          let last_edited_by = 'Another User';
          // Start from index 9 (Column J)
          for (let c = 9; c < numCols; c++) {
            const h = getHeaderName(c);
            const lowerH = h.toLowerCase();
            
            if (lowerH.includes('date & time updated') || lowerH.includes('timestamp')) {
              if (row[c] instanceof Date) {
                server_updated_at = Utilities.formatDate(row[c], Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm:ss");
              } else {
                server_updated_at = String(row[c] || '').trim();
              }
            }
            if (lowerH.includes('last edited by')) {
              last_edited_by = String(row[c] || '').trim() || 'Another User';
            }
            
            const toggle = String(toggleRow[c] || '').trim().toLowerCase();
            if (toggle !== 'shown in app') continue;
            
            if (lowerH.includes('date & time updated') || lowerH.includes('timestamp') || lowerH.includes('last edited by')) continue;
            
            if (h !== '' && !h.startsWith('Column ')) {
              if (isDropdown[c]) {
                dynamic_dropdowns[h] = String(row[c] || '').trim();
              } else {
                dynamic_texts[h] = String(row[c] || '').trim();
              }
            }
          }
          
          households.push({
            household_id:   currentHouseholdId,
            house_number:   houseNoRaw,
            household_head: headRaw,
            member_count:   Number(row[4]) || 0,
            fourps:         parseBool(row[5]),
            solar:          parseBool(row[6]),
            gps_lat:        parseFloat(row[7]) || 0,
            gps_lng:        parseFloat(row[8]) || 0,
            server_updated_at: server_updated_at,
            last_edited_by: last_edited_by,
            dynamic_dropdowns: dynamic_dropdowns,
            dynamic_texts: dynamic_texts
          });
        }
        
        // Check for members in Col C (2) and Col D (3)
        const memberName = String(row[2]).trim();
        const relationship = String(row[3]).trim();
        
        if (currentHouseholdId && memberName) {
          members.push({
            member_id:    currentHouseholdId + '-M' + String(memberCounter).padStart(2, '0'),
            household_id: currentHouseholdId,
            member_name:  memberName,
            relationship: relationship
          });
          memberCounter++;
        }
      }
    }

    // ── Authorized Users ─────────────────────────
    const wkSheet = ss.getSheetByName('Authorized Users');
    const authorized_users = [];
    if (wkSheet && wkSheet.getLastRow() > 1) {
      const wkData = wkSheet.getRange(2, 1, wkSheet.getLastRow() - 1, 3).getValues();
      for (const row of wkData) {
        if (!row[0]) continue;
        authorized_users.push({
          user_id:   String(row[0]).trim(),  // Using Employee No. as User ID internally
          user_name: String(row[1]).trim(),
          employee_no: String(row[0]).trim(),  // Employee No. in Col A
          password:    String(row[2] || '').trim()
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      households: households,
      members: members,
      authorized_users: authorized_users,
      dynamic_options: dynamicOptions,
      server_timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ──────────────────────────────────────────────────────────────
// POST — Receive synced data from the app
// ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    // ── User Registration ──────────────────────────────────
    if (action === 'registerUser') {
      return handleRegisterUser(payload);
    }

    // ── Password Reset ─────────────────────────────────────
    if (action === 'resetPassword') {
      return handleResetPassword(payload);
    }

    // ── Standard Sync: events + new households ─────────────
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const syncTimestamp = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
    let eventsAdded = 0;
    let householdsAdded = 0;

    // Process inspection events
    if (payload.events && payload.events.length > 0) {
      let evtSheet = ss.getSheetByName('Inspection Logs');
      if (!evtSheet) {
        evtSheet = ss.insertSheet('Inspection Logs');
        evtSheet.appendRow([
          'Event ID', 'Household ID', 'User ID', 'User Name',
          'Event Type', 'Field Changed', 'Old Value', 'New Value',
          'Remarks', 'Timestamp', 'Date & Time Updated'
        ]);
      }

      for (const evt of payload.events) {
        evtSheet.appendRow([
          evt.event_id       || '',
          evt.household_id   || '',
          evt.user_id        || '',
          evt.user_name      || '',
          evt.event_type     || '',
          evt.field_changed  || '',
          evt.old_value != null ? String(evt.old_value) : '',
          evt.new_value != null ? String(evt.new_value) : '',
          evt.remarks        || '',
          evt.timestamp      || '',
          syncTimestamp
        ]);
        eventsAdded++;
      }
    }

    // Process new households (added from app)
    if (payload.households && payload.households.length > 0) {
      const hhSheet = ss.getSheetByName('Sitio Tibucag (Biomass)');
      if (hhSheet) {
        const numCols = Math.max(11, hhSheet.getLastColumn());
        const headerRow1 = hhSheet.getRange(2, 1, 1, numCols).getValues()[0];
        const headerRow2 = hhSheet.getRange(3, 1, 1, numCols).getValues()[0];
        let timestampColIdx = 9; // Default to J
        let lastEditedByColIdx = -1;
        for (let c = 9; c < numCols; c++) {
          let h = String(headerRow2[c] || '').trim() || String(headerRow1[c] || '').trim();
          if (h.toLowerCase().includes('date & time updated') || 
              h.toLowerCase().includes('timestamp')) {
            timestampColIdx = c;
          }
          if (h.toLowerCase().includes('last edited by')) {
            lastEditedByColIdx = c;
          }
        }
        
        for (const hh of payload.households) {
          const newRowData = new Array(numCols).fill('');
          newRowData[0] = hh.house_number || '';
          newRowData[1] = hh.household_head || '';
          newRowData[4] = hh.member_count || 1;
          newRowData[5] = hh.fourps ? 'Yes' : 'No';
          newRowData[6] = hh.solar ? 'Yes' : 'No';
          newRowData[7] = hh.gps_lat || '';
          newRowData[8] = hh.gps_lng || '';
          newRowData[timestampColIdx] = syncTimestamp;
          if (lastEditedByColIdx !== -1) {
            newRowData[lastEditedByColIdx] = payload.user_name || 'Online User';
          }
          
          hhSheet.appendRow(newRowData);
          householdsAdded++;
        }
      }
    }

    // Process updated households (edited from app)
    let householdsUpdated = 0;
    const conflicts = [];
    
    if (payload.updated_households && payload.updated_households.length > 0) {
      const hhSheet = ss.getSheetByName('Sitio Tibucag (Biomass)');
      if (hhSheet) {
        const numCols = Math.max(11, hhSheet.getLastColumn());
        const data = hhSheet.getRange(1, 1, hhSheet.getLastRow() || 1, numCols).getValues(); // data[0] is Row 1 (toggles), data[1] is Row 2 (headers), data[2] is Row 3 (sub-headers)
        const baseDate = payload.base_timestamp ? new Date(payload.base_timestamp).getTime() : 0;
        
        let timestampColIdx = 9;
        let lastEditedByColIdx = -1;
        const headerToColIdx = {};
        for (let c = 9; c < numCols; c++) {
          const h2 = String(data[2] && data[2][c] || '').trim();
          const h1 = String(data[1] && data[1][c] || '').trim();
          let headerName = h2 || h1 || `Column ${c + 1}`;
          if (h1 && h2) headerName = h1 + ' - ' + h2;
          
          headerToColIdx[headerName] = c;
          
          if (headerName.toLowerCase().includes('date & time updated') || 
              headerName.toLowerCase().includes('timestamp')) {
            timestampColIdx = c;
          }
          if (headerName.toLowerCase().includes('last edited by')) {
            lastEditedByColIdx = c;
          }
        }
        
        // Map updated households to their row index
        const updates = [];
        for (const hh of payload.updated_households) {
          for (let i = 3; i < data.length; i++) {
            if (String(data[i][0]).trim() === String(hh.house_number).trim() && String(hh.house_number).trim() !== '') {
              updates.push({ hh: hh, rowIndex: i });
              break;
            }
          }
        }

        // Sort descending by rowIndex so insert/delete operations at the bottom don't affect row indices above
        updates.sort((a, b) => b.rowIndex - a.rowIndex);

        for (const update of updates) {
          const { hh, rowIndex } = update;
          const i = rowIndex;
          
          const serverDateVal = data[i][timestampColIdx];
          let serverDateStr = "";
          if (serverDateVal) {
            if (serverDateVal instanceof Date) {
              serverDateStr = Utilities.formatDate(serverDateVal, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm:ss");
            } else {
              serverDateStr = String(serverDateVal).trim();
            }
          }
          
          // Check for conflict: Server timestamp string doesn't match client's base string
          const clientDateStr = String(hh.server_updated_at || '').trim();
          
          if (clientDateStr !== "" && serverDateStr !== "" && clientDateStr !== serverDateStr && !hh.force_push) {
            
            let dynamic_dropdowns = {};
            let dynamic_texts = {};
            if (numCols > 9 && hhSheet.getLastRow() >= 4) {
              const validations = hhSheet.getRange(4, 10, 1, numCols - 9).getDataValidations()[0];
              for (let c = 9; c < numCols; c++) {
                const toggle = String(data[0][c] || '').trim().toLowerCase();
                if (toggle !== 'shown in app') continue;
                
                let h = String(data[2]?.[c] || '').trim() || String(data[1]?.[c] || '').trim() || `Column ${c + 1}`;
                if (String(data[1]?.[c] || '').trim() && String(data[2]?.[c] || '').trim()) {
                  h = String(data[1]?.[c] || '').trim() + ' - ' + String(data[2]?.[c] || '').trim();
                }
                
                if (h.toLowerCase().includes('date & time updated') || h.toLowerCase().includes('timestamp')) continue;
                
                const rule = validations[c - 9];
                if (rule != null) {
                  dynamic_dropdowns[h] = String(data[i][c] || '').trim();
                } else {
                  dynamic_texts[h] = String(data[i][c] || '').trim();
                }
              }
            }

            // Build server members array
            const serverMembers = [];
            let endRow = i + 1;
            while (endRow < data.length && String(data[endRow][0]).trim() === '') {
              endRow++;
            }
            for (let r = i; r < endRow; r++) {
              const memberName = String(data[r][2]).trim();
              if (memberName) {
                serverMembers.push({
                   member_id: hh.household_id + '-M' + String(serverMembers.length + 1).padStart(2, '0'),
                   member_name: memberName,
                   relationship: String(data[r][3]).trim()
                });
              }
            }

            conflicts.push({
              household_id: hh.household_id,
              house_number: data[i][0],
              household_head: data[i][1],
              member_count: data[i][4],
              fourps: String(data[i][5]).trim().toLowerCase() === 'yes',
              solar: String(data[i][6]).trim().toLowerCase() === 'yes',
              gps_lat: data[i][7],
              gps_lng: data[i][8],
              server_updated_at: serverDateStr,
              last_edited_by: lastEditedByColIdx !== -1 ? String(data[i][lastEditedByColIdx] || '').trim() || 'Another User' : 'Another User',
              members: serverMembers,
              dynamic_dropdowns,
              dynamic_texts
            });
            continue;
          }
          
          // Apply basic fields
          hhSheet.getRange(i + 1, 2).setValue(hh.household_head);        // B
          hhSheet.getRange(i + 1, 5).setValue(hh.member_count);          // E
          hhSheet.getRange(i + 1, 6).setValue(hh.fourps ? 'Yes' : 'No'); // F
          hhSheet.getRange(i + 1, 7).setValue(hh.solar ? 'Yes' : 'No');  // G
          hhSheet.getRange(i + 1, 8).setValue(hh.gps_lat || '');         // H
          hhSheet.getRange(i + 1, 9).setValue(hh.gps_lng || '');         // I
          hhSheet.getRange(i + 1, timestampColIdx + 1).setValue(syncTimestamp); // Timestamp col
          if (lastEditedByColIdx !== -1) {
            hhSheet.getRange(i + 1, lastEditedByColIdx + 1).setValue(payload.user_name || 'Online User');
          }
          
          // Apply dynamic fields
          if (hh.dynamic_texts) {
            for (const [key, val] of Object.entries(hh.dynamic_texts)) {
              const c = headerToColIdx[key];
              if (c !== undefined && c !== timestampColIdx) {
                hhSheet.getRange(i + 1, c + 1).setValue(val);
              }
            }
          }
          if (hh.dynamic_dropdowns) {
            for (const [key, val] of Object.entries(hh.dynamic_dropdowns)) {
              const c = headerToColIdx[key];
              if (c !== undefined && c !== timestampColIdx) {
                hhSheet.getRange(i + 1, c + 1).setValue(val);
              }
            }
          }
          
          householdsUpdated++;
          
          // Process members
          if (hh.members && Array.isArray(hh.members)) {
            // Find endRow: the 0-based row index of the NEXT household (or end of data)
            let endRow = i + 1;
            while (endRow < data.length && String(data[endRow][0]).trim() === '') {
              endRow++;
            }
            
            const existingMemberRowsCount = endRow - i; // Number of rows belonging to this household
            const newMemberCount = hh.members.length;
            
            // Handle row inserts or deletes
            if (newMemberCount > existingMemberRowsCount) {
              const rowsToAdd = newMemberCount - existingMemberRowsCount;
              hhSheet.insertRowsAfter(endRow, rowsToAdd);
            } else if (newMemberCount < existingMemberRowsCount && newMemberCount > 0) {
              const rowsToDelete = existingMemberRowsCount - newMemberCount;
              // deleteRows takes (rowPosition, howMany)
              hhSheet.deleteRows(endRow + 1 - rowsToDelete, rowsToDelete);
            } else if (newMemberCount === 0 && existingMemberRowsCount > 1) {
              const rowsToDelete = existingMemberRowsCount - 1;
              hhSheet.deleteRows(endRow + 1 - rowsToDelete, rowsToDelete);
            }
            
            // Clear existing member columns (C and D) for this household
            const rowsToWrite = Math.max(newMemberCount, 1);
            const memberRange = hhSheet.getRange(i + 1, 3, rowsToWrite, 2);
            
            try {
              memberRange.clearDataValidations();
              memberRange.clearContent();
            } catch(e) {
              console.error("Error clearing member range: " + e);
            }
            
            // Write the new members efficiently using setValues
            if (newMemberCount > 0) {
              const valuesToWrite = [];
              for (let mIndex = 0; mIndex < hh.members.length; mIndex++) {
                const member = hh.members[mIndex];
                valuesToWrite.push([
                  String(member.member_name || ''), 
                  String(member.relationship || '')
                ]);
              }
              
              try {
                // To avoid row mismatch, only get the exact range for the members
                const writeRange = hhSheet.getRange(i + 1, 3, newMemberCount, 2);
                writeRange.setValues(valuesToWrite);
              } catch(err) {
                console.error("Error writing members array: ", err);
              }
            }
            
            // Force Google Sheets to flush changes to disk NOW, so any unhandled errors
            // are caught by the global try...catch instead of silently crashing the script
            SpreadsheetApp.flush();
          }
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      eventsAdded: eventsAdded,
      householdsAdded: householdsAdded,
      householdsUpdated: householdsUpdated,
      conflicts: conflicts,
      syncTimestamp: syncTimestamp
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function handleRegisterUser(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let wkSheet = ss.getSheetByName('Authorized Users');
  if (!wkSheet) {
    wkSheet = ss.insertSheet('Authorized Users');
    wkSheet.appendRow(['Employee No.', 'Authorized User', 'Password']);
  }

  wkSheet.appendRow([
    payload.employee_no  || ('EMP-' + new Date().getTime()),
    payload.user_name    || '',
    payload.password     || ''
  ]);

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'User registered successfully.',
    user_id: payload.employee_no
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleResetPassword(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wkSheet = ss.getSheetByName('Authorized Users');

  if (!wkSheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Authorized Users sheet not found.'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const data = wkSheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    // Check Employee No in Col A (0)
    if (String(data[i][0]).trim() === String(payload.employee_no).trim()) {
      wkSheet.getRange(i + 1, 3).setValue(payload.new_password || ''); // Col C
      found = true;
      break;
    }
  }

  if (found) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Password reset successfully.'
    })).setMimeType(ContentService.MimeType.JSON);
  } else {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Employee ID not found.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

// ──────────────────────────────────────────────────────────────
// Trigger — Automatically stamp edits made directly on the Google Sheet
// ──────────────────────────────────────────────────────────────

function onEdit(e) {
  if (!e || !e.range) return;
  
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== 'Sitio Tibucag (Biomass)') return;
  
  const numCols = Math.max(11, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 3, numCols).getValues();
  let timestampColIdx = 10; // 1-based index (J)
  for (let c = 9; c < numCols; c++) {
    const h1 = String(headers[0][c] || '').toLowerCase();
    const h2 = String(headers[1][c] || '').toLowerCase();
    const h3 = String(headers[2][c] || '').toLowerCase();
    if (h1.includes('date & time updated') || h1.includes('timestamp') ||
        h2.includes('date & time updated') || h2.includes('timestamp') ||
        h3.includes('date & time updated') || h3.includes('timestamp')) {
      timestampColIdx = c + 1; // 1-based index for getRange
      break;
    }
  }
  
  const row = e.range.getRow();
  const col = e.range.getColumn();
  
  // Ignore header row (Row 1) and Row 2 subtitle headers
  // Also ignore edits directly to the Date & Time Updated column
  if (row <= 2 || col === timestampColIdx) return;
  
  // Find the parent Household row for this edit (in case they edited a child member row)
  // We need to trace backwards up Column A until we find a number.
  let targetRow = row;
  while (targetRow >= 3) {
    const houseNo = sheet.getRange(targetRow, 1).getValue();
    if (String(houseNo).trim() !== '') {
      break; // Found the parent row
    }
    targetRow--;
  }
  
  // Stamp the current date and time in the dynamic timestamp column for the main household row
  const timestamp = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
  sheet.getRange(targetRow, timestampColIdx).setValue(timestamp);
}
