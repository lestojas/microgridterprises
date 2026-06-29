/**
 * household-list.js — All Households List Page
 *
 * Displays every household in a searchable, filterable list.
 * Each card links to the household's full profile page.
 */

import { getAllHouseholds } from '../js/db.js';
import { escapeHtml } from '../js/utils.js';

/**
 * Renders the household list page into the given container.
 * @param {HTMLElement} container
 */
export async function renderHouseholdList(container) {
  const households = await getAllHouseholds();

  container.innerHTML = `
    <section class="page-header">
      <h2 class="page-title">
        All Households
        <span class="count-badge">${households.length}</span>
      </h2>
    </section>

    <div class="search-bar">
      <input
        type="text"
        id="hh-search"
        class="search-input"
        placeholder="Search by name or house number…"
        autocomplete="off"
      />
    </div>

    <!-- Household Cards List -->
    <div class="household-cards" id="hh-list">
      ${renderCards(households)}
    </div>
  `;

  // ── Client-side search filtering ──────────────────────────
  const searchInput = document.getElementById('hh-search');
  const listContainer = document.getElementById('hh-list');

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
      listContainer.innerHTML = renderCards(households);
      return;
    }

    const filtered = households.filter(hh => {
      const head = (hh.household_head || '').toLowerCase();
      const houseNum = String(hh.house_number);
      return head.includes(query) || houseNum.includes(query);
    });

    listContainer.innerHTML = filtered.length > 0
      ? renderCards(filtered)
      : `
        <div class="empty-state">
          <h3>No Results</h3>
          <p>No households match "${escapeHtml(searchInput.value)}"</p>
        </div>
      `;
  });
}

/**
 * Generates the HTML for a list of household cards.
 * @param {Array} households
 * @returns {string}
 */
function renderCards(households) {
  return households.map(hh => {
    const fourpsClass = hh.fourps ? 'badge--success' : 'badge--muted';
    const solarClass  = hh.solar  ? 'badge--success' : 'badge--muted';

    return `
      <a href="#profile/${hh.household_id}" class="household-card card">
        <div class="hh-card-top">
          <span class="hh-house-number">House #${hh.house_number}</span>
          <span class="badge badge--count">
            Members: ${hh.member_count || 0}
          </span>
        </div>
        <div class="hh-card-head">${escapeHtml(hh.household_head)}</div>
        <div class="hh-card-badges">
          <span class="badge ${fourpsClass}">4P's: ${hh.fourps ? 'Yes' : 'No'}</span>
          <span class="badge ${solarClass}">Solar Kit: ${hh.solar ? 'Yes' : 'No'}</span>
        </div>
      </a>
    `;
  }).join('');
}
