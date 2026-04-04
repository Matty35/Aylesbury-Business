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

const CATEGORY_ICONS = {
  'trades': '🔧',
  'food-drink': '🍽️',
  'health-beauty': '💆',
  'automotive': '🚗',
  'professional-services': '💼',
  'retail': '🛍️',
  'creative-media': '📸',
  'sports-leisure': '⚽',
  'family-kids': '👶',
};

function getCategoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat] || '🏢';
}

// Render a featured/recent grid card
function renderCard(b) {
  const catLabel = getCategoryLabel(b.category);
  const tierBadge = b.tier === 'featured' ? '<span class="badge badge-featured">⭐ Featured</span>' : '';
  const initial = b.name.charAt(0).toUpperCase();
  const avatar = b.logo
    ? `<img src="${b.logo}" alt="${b.name}" />`
    : initial;

  return `
    <a href="business.html?slug=${b.slug}" class="biz-card${b.featured ? ' is-featured' : ''}">
      <div class="biz-card-body">
        <div class="biz-card-header">
          <div class="biz-avatar">${b.logo ? `<img src="${b.logo}" alt="${b.name}" />` : initial}</div>
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
        ${b.phone ? `<span class="biz-phone">📞 ${b.phone}</span>` : ''}
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
    ? '<span class="badge badge-featured">⭐ Featured</span>'
    : b.tier === 'standard' ? '<span class="badge badge-standard">Standard</span>' : '';
  const initial = b.name.charAt(0).toUpperCase();

  const websiteLink = isFeatured && b.website
    ? `<a href="${b.website}" class="listing-website-link" target="_blank" rel="noopener" onclick="event.stopPropagation()">🌐 Visit Website</a>`
    : '';

  const cardInner = `
    <div class="listing-avatar">${b.logo ? `<img src="${b.logo}" alt="${b.name}" />` : initial}</div>
    <div class="listing-content">
      <div class="listing-title-row">
        <span class="listing-name">${b.name}</span>
        <span class="cat-badge">${catLabel}</span>
        ${tierBadge}
      </div>
      <p class="listing-desc">${b.shortDescription}</p>
      <div class="listing-footer">
        ${b.address ? `<span class="listing-address">📍 ${b.address.town}, ${b.address.postcode}</span>` : ''}
        ${b.phone ? `<span class="listing-phone">📞 ${b.phone}</span>` : ''}
        ${websiteLink}
        <span class="btn btn-primary btn-sm listing-cta">View Profile →</span>
      </div>
    </div>
  `;

  if (isFeatured) {
    return `
      <a href="business.html?slug=${b.slug}" class="listing-card is-featured">
        <div class="featured-banner">⭐ Featured Listing</div>
        <div class="listing-card-body">${cardInner}</div>
      </a>
    `;
  }

  return `
    <a href="business.html?slug=${b.slug}" class="listing-card">
      ${cardInner}
    </a>
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

// Render recent listings into a grid
function renderRecent(listings, gridId, limit = 3) {
  const sorted = [...listings]
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
