// main.js – shared utilities and rendering

const CATEGORY_LABELS = {
  'trades': 'Trades & Home',
  'food-drink': 'Food & Drink',
  'health-beauty': 'Health & Beauty',
  'automotive': 'Automotive',
  'professional-services': 'Professional Services',
  'retail': 'Retail & Shopping',
  'creative-media': 'Creative & Media',
  'sports-leisure': 'Sports & Leisure',
  'family-kids': 'Family & Kids',
};

function _svg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

const CATEGORY_ICONS = {
  'trades': _svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
  'food-drink': _svg('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>'),
  'health-beauty': _svg('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
  'automotive': _svg('<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>'),
  'professional-services': _svg('<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>'),
  'retail': _svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
  'creative-media': _svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'),
  'sports-leisure': _svg('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
  'family-kids': _svg('<path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>'),
};

const DEFAULT_CATEGORY_ICON = _svg('<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>');

function getCategoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat] || DEFAULT_CATEGORY_ICON;
}

// Deterministic gradient class from the business name, so avatars vary
function avatarClass(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return 'av-' + ((h % 6) + 1);
}

// Fill static category icon placeholders (elements with data-icon="<cat>")
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = getCategoryIcon(el.getAttribute('data-icon'));
  });
});

// Render a featured/recent grid card
function renderCard(b) {
  const catLabel = getCategoryLabel(b.category);
  const tierBadge = b.tier === 'featured' ? '<span class="badge badge-featured">★ Featured</span>' : '';
  const initial = b.name.charAt(0).toUpperCase();

  return `
    <a href="business.html?slug=${b.slug}" class="biz-card${b.featured ? ' is-featured' : ''}">
      <div class="biz-card-body">
        <div class="biz-card-header">
          <div class="biz-avatar ${avatarClass(b.name)}">${b.logo ? `<img src="${b.logo}" alt="${b.name}" />` : initial}</div>
          <div class="biz-card-title-row">
            <span class="biz-name">${b.name}</span>
            <div class="biz-meta">
              <span class="cat-badge">${catLabel}</span>
              <span class="subcat-badge">${b.subcategory}</span>
            </div>
          </div>
        </div>
        <p class="biz-desc">${b.shortDescription}</p>
        ${b.tags && b.tags.length ? `<div class="tags-row">${b.tags.slice(0,3).map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
      </div>
      <div class="biz-card-footer">
        ${b.phone ? `<span class="biz-phone">${b.phone}</span>` : ''}
        ${tierBadge}
        <span class="btn btn-primary btn-sm" style="margin-left:auto">View →</span>
      </div>
    </a>
  `;
}

// Render a horizontal listing card (businesses.html)
function renderListingCard(b) {
  const catLabel = getCategoryLabel(b.category);
  const isFeatured = b.tier === 'featured';
  const tierBadge = isFeatured
    ? '<span class="badge badge-featured">★ Featured</span>'
    : b.tier === 'standard' ? '<span class="badge badge-standard">Standard</span>' : '';
  const initial = b.name.charAt(0).toUpperCase();

  const websiteLink = isFeatured && b.website
    ? `<a href="${b.website}" class="listing-website-link" target="_blank" rel="noopener" onclick="event.stopPropagation()">Visit Website ↗</a>`
    : '';

  const cardInner = `
    <div class="listing-avatar ${avatarClass(b.name)}">${b.logo ? `<img src="${b.logo}" alt="${b.name}" />` : initial}</div>
    <div class="listing-content">
      <div class="listing-title-row">
        <span class="listing-name">${b.name}</span>
        <span class="cat-badge">${catLabel}</span>
        ${tierBadge}
      </div>
      <p class="listing-desc">${b.shortDescription}</p>
      <div class="listing-footer">
        ${b.address ? `<span class="listing-address">${b.address.town}, ${b.address.postcode}</span>` : ''}
        ${b.phone ? `<span class="listing-phone">${b.phone}</span>` : ''}
        ${websiteLink}
        <a href="business.html?slug=${b.slug}" class="btn btn-primary btn-sm listing-cta">View Profile →</a>
      </div>
    </div>
  `;

  // Note: the card is a div (not <a>) because it contains real links —
  // nested anchors are invalid HTML and the browser breaks the card apart.
  return `
    <div class="listing-card${isFeatured ? ' is-featured' : ''}" role="link" tabindex="0"
         onclick="window.location.href='business.html?slug=${b.slug}'"
         onkeydown="if(event.key==='Enter')window.location.href='business.html?slug=${b.slug}'">
      ${cardInner}
    </div>
  `;
}

// Render featured businesses into a grid
function renderFeatured(listings, gridId) {
  const featured = listings.filter(b => b.featured);
  const el = document.getElementById(gridId);
  if (!el) return;
  if (featured.length === 0) {
    el.innerHTML = '<p class="no-results">No featured listings yet.</p>';
    return;
  }
  el.innerHTML = featured.map(b => renderCard(b)).join('');
}

// Render recent listings into a grid (skips featured ones — they have their own section)
function renderRecent(listings, gridId, limit = 3) {
  let pool = listings.filter(b => !b.featured);
  if (pool.length < limit) pool = listings;
  const sorted = [...pool]
    .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
    .slice(0, limit);
  const el = document.getElementById(gridId);
  if (!el) return;
  el.innerHTML = sorted.map(b => renderCard(b)).join('');
}

// Update category count badges
function updateCategoryCounts(listings) {
  const counts = {};
  listings.forEach(b => {
    counts[b.category] = (counts[b.category] || 0) + 1;
  });
  document.querySelectorAll('[data-cat]').forEach(el => {
    const cat = el.getAttribute('data-cat');
    el.textContent = counts[cat] ? `${counts[cat]} listed` : '';
  });
}

// Mobile nav toggle
function toggleNav() {
  const nav = document.querySelector('.main-nav');
  if (nav) nav.classList.toggle('open');
}

// Debounce utility
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
