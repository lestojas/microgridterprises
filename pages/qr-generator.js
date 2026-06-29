import QRCodeStyling from 'qr-code-styling';
import { getAllHouseholds } from '../js/db.js';
import { showToast, escapeHtml, getHouseNumber } from '../js/utils.js';

const FULL_ADDRESS = 'Sitio Tibucag, Brgy. Dagohoy, Talaingod, Davao del Norte';

export async function renderQRGenerator(container) {
  container.innerHTML = `
    <h1 class="page-title">Generate QR</h1>
    <p class="page-subtitle">Select households to generate and download their QR codes.</p>

    <!-- Search -->
    <div class="card section">
      <div class="form-group mb-0">
        <label class="form-label" for="qr-search">Search by House Number</label>
        <input type="text" id="qr-search" class="form-input" placeholder="Type a house number to filter...">
      </div>
    </div>

    <!-- Checklist -->
    <div class="card section">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 style="font-size: 16px; margin: 0;">Select Households</h3>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="select-all-qr" style="width: 18px; height: 18px;">
          <strong>Select All</strong>
        </label>
      </div>
      
      <div id="hh-checklist" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 12px; background: var(--bg-main);">
        <div style="text-align:center; padding: 20px;">Loading households...</div>
      </div>
      
      <div id="download-all-wrap" style="margin-top: 16px; display: none;">
        <button id="download-all-btn" class="btn btn-primary btn-block">Download All Selected</button>
      </div>
    </div>

    <!-- Loading indicator -->
    <div id="qr-loading" class="loading-screen" style="display:none">
      <div class="spinner"></div>
      <p>Generating QR codes...</p>
    </div>
  `;

  const checklistEl = document.getElementById('hh-checklist');
  const selectAllCb = document.getElementById('select-all-qr');
  const downloadAllBtn = document.getElementById('download-all-btn');
  const downloadAllWrap = document.getElementById('download-all-wrap');
  const searchInput = document.getElementById('qr-search');
  const qrLoading = document.getElementById('qr-loading');

  let households = [];

  try {
    households = await getAllHouseholds();
    renderChecklist(households);
  } catch (err) {
    console.error(err);
    checklistEl.innerHTML = '<div style="color:var(--color-error); padding: 20px;">Failed to load households.</div>';
  }

  function renderChecklist(list) {
    if (list.length === 0) {
      checklistEl.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-secondary);">No households found.</div>';
      return;
    }
    checklistEl.innerHTML = list.map(hh => {
      const parsedNum = getHouseNumber(hh);
      const num = String(parsedNum).padStart(3, '0');
      return `
        <div class="qr-checklist-item" data-id="${escapeHtml(hh.household_id)}" data-house="${escapeHtml(num)}" data-head="${escapeHtml(hh.household_head)}" style="display:flex; align-items:center; gap:10px; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
          <input type="checkbox" class="hh-checkbox" value="${escapeHtml(hh.household_id)}" style="width: 18px; height: 18px; flex-shrink:0; cursor:pointer;">
          <span style="flex:1; font-size: 14px;">${num} — ${escapeHtml(hh.household_head)}</span>
          <button class="btn btn-ghost btn-sm dl-single-btn" style="padding: 4px 10px; font-size: 12px; display:none;" title="Download QR for this household">⬇ Download</button>
        </div>
      `;
    }).join('');
    attachCheckboxListeners();
  }

  function attachCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.hh-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const item = cb.closest('.qr-checklist-item');
        const dlBtn = item.querySelector('.dl-single-btn');
        dlBtn.style.display = cb.checked ? 'inline-flex' : 'none';
        updateDownloadAllVisibility();
      });
    });

    // Individual download buttons
    document.querySelectorAll('.dl-single-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.qr-checklist-item');
        const id = item.dataset.id;
        const houseNum = String(item.dataset.house).padStart(3, '0');
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await generateAndDownloadSingleQR(id, houseNum);
        } catch (err) {
          console.error(err);
          showToast('Failed to generate QR: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = '⬇ Download';
        }
      });
    });
  }

  function updateDownloadAllVisibility() {
    const checked = document.querySelectorAll('.hh-checkbox:checked');
    downloadAllWrap.style.display = checked.length > 0 ? 'block' : 'none';
  }

  // Select All
  selectAllCb.addEventListener('change', (e) => {
    const visible = checklistEl.querySelectorAll('.qr-checklist-item:not([style*="display: none"]) .hh-checkbox');
    visible.forEach(cb => {
      cb.checked = e.target.checked;
      const item = cb.closest('.qr-checklist-item');
      const dlBtn = item.querySelector('.dl-single-btn');
      dlBtn.style.display = cb.checked ? 'inline-flex' : 'none';
    });
    updateDownloadAllVisibility();
  });

  // Search filter
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    const items = checklistEl.querySelectorAll('.qr-checklist-item');
    items.forEach(item => {
      const houseNum = item.dataset.house.toLowerCase();
      const houseNumRaw = String(parseInt(houseNum, 10)).toLowerCase(); // Allow searching without leading zeros too
      const head = item.dataset.head.toLowerCase();
      const match = !query || houseNum.includes(query) || houseNumRaw.includes(query) || head.includes(query);
      item.style.display = match ? 'flex' : 'none';
    });
  });

  // Download All Selected
  downloadAllBtn.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.hh-checkbox:checked'));
    if (selected.length === 0) {
      showToast('Please select at least one household.', 'warning');
      return;
    }

    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = 'Generating...';
    qrLoading.style.display = 'flex';

    try {
      for (const cb of selected) {
        const item = cb.closest('.qr-checklist-item');
        const id = item.dataset.id;
        const houseNum = String(item.dataset.house).padStart(3, '0');
        await generateAndDownloadSingleQR(id, houseNum);
        // Small delay between downloads so browser doesn't block them
        await new Promise(r => setTimeout(r, 300));
      }
      showToast(`Successfully generated ${selected.length} QR code(s).`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error generating QR codes: ' + err.message, 'error');
    } finally {
      qrLoading.style.display = 'none';
      downloadAllBtn.disabled = false;
      downloadAllBtn.textContent = 'Download All Selected';
    }
  });
}

async function generateAndDownloadSingleQR(householdId, houseNum) {
  const qrSize = 1400;
  
  // Set equal padding around all elements
  const padding = 120; // Left, Right, Top padding
  
  // Text element heights and spacing
  const houseNumHeight = 90; // Approx height of 90px font
  const addressHeight = 50;  // Approx height of 50px font
  const spacingAfterQR = 100; // Space between QR and House Num
  const spacingAfterHouseNum = 50; // Space between House Num and Address
  const spacingAfterAddress = 120; // Space between Address and bottom border (equal to top/side padding)
  
  // Calculate total canvas dimensions
  const bottomAreaHeight = spacingAfterQR + houseNumHeight + spacingAfterHouseNum + addressHeight + spacingAfterAddress;
  const canvasWidth = qrSize + padding * 2;
  const canvasHeight = qrSize + padding + bottomAreaHeight;

  // Generate QR using qr-code-styling
  const qrCode = new QRCodeStyling({
    width: qrSize,
    height: qrSize,
    data: householdId,
    image: '/mge-logo.png',
    dotsOptions: { color: '#000000', type: 'rounded' },
    backgroundOptions: { color: '#ffffff' },
    cornersSquareOptions: { type: 'extra-rounded' },
    cornersDotOptions: { type: 'dot' },
    imageOptions: { crossOrigin: 'anonymous', margin: 10, imageSize: 0.3 }
  });

  // Get QR as data URL
  const qrBlob = await qrCode.getRawData('png');
  const qrDataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(qrBlob);
  });

  // Draw on canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw thin gray border
  const borderMargin = 20;
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 4;
  ctx.strokeRect(borderMargin, borderMargin, canvasWidth - borderMargin * 2, canvasHeight - borderMargin * 2);

  // Draw QR image
  const qrImg = new Image();
  await new Promise((resolve, reject) => {
    qrImg.onload = resolve;
    qrImg.onerror = reject;
    qrImg.src = qrDataUrl;
  });
  ctx.drawImage(qrImg, padding, padding, qrSize, qrSize);

  // Draw text below QR
  const textY = padding + qrSize + spacingAfterQR + (houseNumHeight * 0.8); // Adjust baseline
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  // Household No.
  ctx.font = 'bold 90px Inter, Arial, sans-serif';
  ctx.fillText(`Household No. ${houseNum}`, canvasWidth / 2, textY);

  // Full address
  const addressY = textY + spacingAfterHouseNum + (addressHeight * 0.8);
  ctx.font = '50px Inter, Arial, sans-serif';
  ctx.fillStyle = '#555555';
  wrapText(ctx, FULL_ADDRESS, canvasWidth / 2, addressY, canvasWidth - padding * 2, 70);

  // Trigger download
  const link = document.createElement('a');
  link.download = `QR_House_${houseNum}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Draws wrapped text on a canvas.
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[i] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, y);
}
