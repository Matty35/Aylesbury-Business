// data.js – loads listings from JSON
let _listingsCache = null;

async function loadListings() {
  if (_listingsCache) return _listingsCache;
  try {
    const res = await fetch('data/listings.json');
    if (!res.ok) throw new Error('Failed to load listings');
    _listingsCache = await res.json();
    return _listingsCache;
  } catch (e) {
    console.error('Error loading listings:', e);
    return [];
  }
}
