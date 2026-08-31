// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  series: [],
  currentSeries: null,
  volumes: [],
  characters: [],
  relationships: [],
  galleryImages: [],
  attachments: [],
  currentGalleryImage: null,
  allTags: [],
  selectedTags: [],
  allGenres: [],
  selectedGenres: [],
  selectedRating: 0,
  allStatuses: [],
  filterStatus: 'All',
  filterTags: [],
  filterGenres: [],
  filterMode: 'OR',
  filterRating: 0,
  filterYearMin: '',
  filterYearMax: '',
  filterBookTypes: [],
  filterLanguages: [],
  filterCountries: [],
  filterAuthors: [],
  filterArtists: [],
  filterPublishers: [],
  filterTranslated: [],
  allSeriesRaw: [], // unfiltered (library-scoped) series list — source for client-side filtering + facet lists
  searchQuery: '',
  graphNetwork: null,
  libraries: [],
  currentLibraryId: null,
  editingLibrary: null,
  selectedNavIcon: 'grid',
  selectedNavIconImage: null,
  theme: 'dark',
  seriesViewMode: 'table', // 'table' | 'card' — persisted via settings
  charViewMode: 'grid',    // 'grid' | 'list' — persisted via settings
  sortField: 'title',      // 'title' | 'author' | 'rating' | 'year_published' | 'date_started' | 'date_finished' — persisted via settings
  sortDir: 'asc',          // 'asc' | 'desc' — persisted via settings
};

// ─── Elements ─────────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);

const views = {
  library: el('view-library'),
  series: el('view-series'),
};

const dom = {
  tbody: el('series-tbody'),
  search: el('search-input'),
  seriesCount: el('series-count'),
  emptyState: el('empty-state'),

  heroTop: el('series-hero-top'),
  heroDetails: el('series-hero-details'),
  tabDetails: el('tab-details'),
  tabVols: el('tab-volumes'),
  tabChars: el('tab-characters'),
  tabGallery: el('tab-gallery'),
  tabFiles: el('tab-files'),
  volCount: el('vol-tab-count'),
  charCount: el('char-tab-count'),
  galleryCount: el('gallery-tab-count'),
  filesCount: el('files-tab-count'),
  paneDetails: el('pane-details'),
  paneVols: el('pane-volumes'),
  paneChars: el('pane-characters'),
  paneGallery: el('pane-gallery'),
  paneFiles: el('pane-files'),
  volList: el('volumes-list'),
  charGrid: el('characters-grid'),
  charList: el('characters-list'),
  galleryGrid: el('gallery-grid'),
  filesList: el('files-list'),

  charDrawer: el('drawer-overlay'),
  drawerBody: el('drawer-body'),
  drawerRels: el('drawer-rels'),

  graphContainer: el('graph-container'),

  tagWrap: el('tag-input-wrap'),
  tagInput: el('f-s-tags'),
  tagDropdown: el('tag-dropdown'),
  tagChips: el('tag-chips'),

  sidebarNavList: el('sidebar-nav-list'),
  libraryTitle: el('library-title'),
};

// ─── Relationship Categories & Labels ──────────────────────────────────────────
// A relationship's *color* always comes from one of these fixed categories.
// The *text* shown can be a custom label (e.g. "Crush" for a Romance-colored
// line, "Sibling" for a Family-colored line) that overrides the category name
// without changing its color.
const REL_CATEGORIES = ['Friend', 'Rival', 'Family', 'Enemy', 'Romance', 'Mentor', 'Other'];

// Relationships saved before custom labels existed may have arbitrary text
// in `type`; treat anything outside the fixed list as the "Other" category
// so it still gets a color.
const relCategory = (r) => REL_CATEGORIES.includes(r.type) ? r.type : 'Other';

// The text actually displayed: a custom label if set, otherwise the
// category name (or, for that same legacy data, the old free-text type).
const relLabel = (r) => r.label || r.type || 'Other';


const escapeHTML = (str) => String(str || '').replace(/[&<>'"]/g,
  tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));

const nl2br = (str) => escapeHTML(str).replace(/\n/g, '<br>');

// Images are stored as R2 object keys now, not local paths, so an <img> can't
// point straight at the stored value the way it used to. Render markup with
// data-key="<the key>" and no src, then call this right after — it fetches
// each one as a data URL and fills it in. `container` defaults to the whole
// document so callers can pass a specific pane when they already have one.
function fillCoverImages(container = document) {
  container.querySelectorAll('img[data-key]').forEach(async (img) => {
    const key = img.dataset.key;
    if (!key) return;
    const dataUrl = await window.api.files.getImageData(key);
    if (dataUrl) img.src = dataUrl;
  });
}

const formatDate = (ds) => {
  if (!ds) return '';
  const d = new Date(ds);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// ─── Character Counters ─────────────────────────────────────────────────────
// Wires an `input`-event listener between a text field and a small counter
// element sitting next to it (id = `${inputId}-counter`), mirroring the
// field's `maxlength`. Values set programmatically (e.g. populating a form
// when a modal opens) don't fire native 'input' events, so callers must
// call refreshCharCounters(...) after setting .value in code — see
// openSeriesModal / openVolumeModal / openCharModal / etc. below.
const charCounters = {};

function wireCharCounter(inputId, max) {
  const input = el(inputId);
  const counter = el(`${inputId}-counter`);
  if (!input || !counter) return; // no counter markup for this field — skip silently
  const update = () => {
    const len = input.value.length;
    counter.textContent = `${len} / ${max}`;
    counter.classList.toggle('char-counter-warn', len >= max * 0.9 && len < max);
    counter.classList.toggle('char-counter-max', len >= max);
  };
  input.addEventListener('input', update);
  charCounters[inputId] = update;
  update();
}

function refreshCharCounters(...ids) {
  ids.forEach(id => charCounters[id] && charCounters[id]());
}

function initCharCounters() {
  wireCharCounter('f-s-title', 300);
  wireCharCounter('f-s-author', 200);
  wireCharCounter('f-s-synopsis', 5000);
  wireCharCounter('f-standalone-thoughts', 20000);
  wireCharCounter('f-standalone-chapter-notes', 20000);
  wireCharCounter('f-v-title', 300);
  wireCharCounter('f-v-chapters', 200);
  wireCharCounter('f-v-thoughts', 20000);
  wireCharCounter('f-v-notes', 20000);
  wireCharCounter('f-c-name', 200);
  wireCharCounter('f-c-vols', 300);
  wireCharCounter('f-c-notes', 10000);
  wireCharCounter('f-r-label', 100);
  wireCharCounter('f-r-notes', 2000);
  wireCharCounter('f-gallery-caption', 300);
}

// ─── Rating (1-5 stars) ─────────────────────────────────────────────────────
// Renders into `container`. In interactive mode, clicking a star sets
// state.selectedRating and calls onChange; clicking the currently-selected
// star clears the rating back to 0 (so "3 stars" is easy to undo without a
// separate clear button). Pass readonly:true for display-only contexts.
function renderRatingStars(container, rating = 0, { readonly = false, onChange = null } = {}) {
  container.classList.toggle('readonly', readonly);
  container.innerHTML = [1, 2, 3, 4, 5].map(n => `
    <${readonly ? 'span' : 'button type="button"'} class="star-btn ${n <= rating ? 'filled' : ''}" data-star="${n}" ${readonly ? '' : 'title="' + n + ' star' + (n > 1 ? 's' : '') + '"'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${n <= rating ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5">
        <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/>
      </svg>
    </${readonly ? 'span' : 'button'}>
  `).join('');

  if (readonly) return;

  container.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.star);
      const next = n === rating ? 0 : n; // clicking the current rating clears it
      rating = next;
      renderRatingStars(container, next, { readonly, onChange });
      if (onChange) onChange(next);
    });
  });
}

// ─── Library Branding (icon + name) ────────────────────────────────────────────

const NAV_ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  star: '<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
};

function navIconSvg(key, size = 16) {
  const paths = NAV_ICONS[key] || NAV_ICONS.grid;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${paths}</svg>`;
}

async function loadLibraries() {
  state.libraries = await window.api.libraries.getAll();
  if (!state.currentLibraryId || !state.libraries.some(l => l.id === state.currentLibraryId)) {
    state.currentLibraryId = state.libraries[0]?.id ?? null;
  }
  renderSidebarNav();
  applyCurrentLibraryHeader();
}

function renderSidebarNav() {
  dom.sidebarNavList.innerHTML = state.libraries.map(lib => `
    <div class="nav-item-wrap">
      <button class="nav-item ${lib.id === state.currentLibraryId ? 'active' : ''}" data-lib-id="${lib.id}">
        <span class="nav-item-icon">${lib.icon === 'custom' && lib.icon_image
      ? `<img class="nav-icon-img" data-key="${escapeHTML(lib.icon_image)}" alt="">`
      : navIconSvg(lib.icon || 'grid')}</span>
        <span>${escapeHTML(lib.name)}</span>
      </button>
      <button class="nav-customize-btn" data-lib-id="${lib.id}" title="Customize category">✎</button>
    </div>
  `).join('');

  fillCoverImages(dom.sidebarNavList);

  dom.sidebarNavList.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchLibrary(parseInt(btn.dataset.libId)));
  });
  dom.sidebarNavList.querySelectorAll('.nav-customize-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lib = state.libraries.find(l => l.id === parseInt(btn.dataset.libId));
      if (lib) openCustomizeModal(lib);
    });
  });
}

function applyCurrentLibraryHeader() {
  const lib = state.libraries.find(l => l.id === state.currentLibraryId);
  dom.libraryTitle.textContent = lib ? lib.name : 'Library';
}

function switchLibrary(id) {
  if (id === state.currentLibraryId) return;
  state.currentLibraryId = id;
  renderSidebarNav();
  applyCurrentLibraryHeader();
  showLibrary();
}

function renderIconSwatches() {
  const grid = el('icon-swatch-grid');
  grid.innerHTML = Object.keys(NAV_ICONS).map(key => `
    <button type="button" class="icon-swatch ${state.selectedNavIcon === key ? 'active' : ''}" data-icon="${key}" title="${key}">
      ${navIconSvg(key, 18)}
    </button>
  `).join('');
  grid.querySelectorAll('.icon-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedNavIcon = btn.dataset.icon;
      state.selectedNavIconImage = null;
      el('f-lib-icon-image').value = '';
      renderIconSwatches();
      renderNavIconUploadPreview();
    });
  });
}

function renderNavIconUploadPreview() {
  const preview = el('nav-icon-upload-preview');
  const picker = el('nav-icon-picker');
  if (state.selectedNavIcon === 'custom' && state.selectedNavIconImage) {
    preview.innerHTML = '';
    preview.style.backgroundImage = `url('${state.selectedNavIconImage}')`;
    picker.classList.add('active');
  } else {
    preview.innerHTML = '<span>Upload custom icon</span>';
    preview.style.backgroundImage = 'none';
    picker.classList.remove('active');
  }
}

async function applyNavIconFile(sourcePath) {
  try {
    const dest = await window.api.files.saveImage(sourcePath, 'navicon');
    if (!dest) return;
    state.selectedNavIcon = 'custom';
    el('f-lib-icon-image').value = dest; // R2 key — this is what actually gets saved
    const dataUrl = await window.api.files.getImageData(dest);
    state.selectedNavIconImage = dataUrl; // data URL — preview only
    const preview = el('nav-icon-upload-preview');
    preview.innerHTML = '';
    preview.style.backgroundImage = `url('${dataUrl}')`;
    el('nav-icon-picker').classList.add('active');
    renderIconSwatches();
  } catch (e) {
    toast(e.message || "Couldn't upload icon", true);
  }
}

function openCustomizeModal(lib = null) {
  state.editingLibrary = lib;
  el('modal-customize-title').textContent = lib ? 'Customize Category' : 'Add Category';
  el('f-lib-title').value = lib ? lib.name : '';
  state.selectedNavIcon = lib ? (lib.icon || 'grid') : 'grid';
  // The DB value (R2 key) still goes in the hidden input for saving —
  // state.selectedNavIconImage is only ever used for the preview background,
  // so it holds a data URL, fetched below, not the raw key.
  state.selectedNavIconImage = null;
  el('f-lib-icon-image').value = (lib && lib.icon_image) || '';
  renderIconSwatches();
  renderNavIconUploadPreview();
  if (lib && lib.icon === 'custom' && lib.icon_image) {
    window.api.files.getImageData(lib.icon_image).then(dataUrl => {
      if (dataUrl && state.editingLibrary === lib) { // still the same modal open
        state.selectedNavIconImage = dataUrl;
        renderNavIconUploadPreview();
      }
    });
  }
  el('btn-delete-library').classList.toggle('hidden', !lib || state.libraries.length <= 1);
  openModal('overlay-customize');
  el('f-lib-title').focus();
}

async function saveCategory() {
  const name = el('f-lib-title').value.trim();
  if (!name) return toast('Category name is required', true);
  const icon = state.selectedNavIcon || 'grid';
  const iconImageRaw = el('f-lib-icon-image').value || '';
  const iconImage = icon === 'custom' ? iconImageRaw : '';

  if (state.editingLibrary) {
    await window.api.libraries.update(state.editingLibrary.id, { name, icon, icon_image: iconImage });
    toast('Category updated');
  } else {
    const newId = await window.api.libraries.create({ name, icon, icon_image: iconImage });
    state.currentLibraryId = newId;
    toast('Category added');
  }
  state.editingLibrary = null;
  closeModal('overlay-customize');
  await loadLibraries();
  showLibrary();
}

async function deleteCategory() {
  const lib = state.editingLibrary;
  if (!lib) return;
  if (state.libraries.length <= 1) return toast('You need at least one category', true);
  confirmDelete(`Delete "${lib.name}"? This will delete all titles, volumes, and characters in it.`, async () => {
    await window.api.libraries.delete(lib.id);
    toast('Category deleted');
    closeModal('overlay-customize');
    state.editingLibrary = null;
    if (state.currentLibraryId === lib.id) state.currentLibraryId = null;
    await loadLibraries();
    showLibrary();
  });
}

// ─── Initialization ───────────────────────────────────────────────────────────
async function init() {
  bindEvents();
  initCharCounters();
  await loadSettings();
  await loadLibraries();
  await loadTags();
  await loadGenres();
  await loadStatuses();
  renderStatusFilterButtons();
  await loadLibrary();
  updateFilterBadges();
}

// ─── Settings: Theme (Dark Mode) & View Modes ────────────────────────────────

const THEME_ICONS = {
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
};

// Loads theme AND the series/character view-mode + sort preferences in one
// round trip, since they all live in the same generic per-user settings
// table.
async function loadSettings() {
  const settings = await window.api.settings.getAll();
  state.theme = settings.theme === 'light' ? 'light' : 'dark';
  state.seriesViewMode = settings.seriesViewMode === 'card' ? 'card' : 'table';
  state.charViewMode = settings.charViewMode === 'list' ? 'list' : 'grid';
  state.sortField = ['title', 'author', 'rating', 'year_published', 'date_started', 'date_finished'].includes(settings.sortField) ? settings.sortField : 'title';
  state.sortDir = settings.sortDir === 'desc' ? 'desc' : 'asc';
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  el('theme-toggle-icon').innerHTML = THEME_ICONS[state.theme];
  el('theme-toggle-label').textContent = state.theme === 'dark' ? 'Dark Mode' : 'Light Mode';
}

async function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  await window.api.settings.set('theme', state.theme);
}

// ─── Contextual "Add New" Shortcut (Ctrl/Cmd+N) ────────────────────────────

function handleAddNewShortcut() {
  // Don't hijack the shortcut while a modal/drawer is already open, or the
  // user is mid-typing in a field — let native behavior / the field win.
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
  if (document.querySelectorAll('.overlay:not(.hidden)').length > 0) return;
  if (!el('drawer-overlay').classList.contains('hidden')) return;

  if (views.series.classList.contains('active')) {
    const activeTabBtn = document.querySelector('.tab.active');
    const tab = activeTabBtn?.dataset.tab;
    if (tab === 'volumes') {
      if (state.currentSeries?.kind === 'standalone') openStandaloneThoughtsModal();
      else openVolumeModal();
    } else if (tab === 'characters') {
      openCharModal();
    } else if (tab === 'gallery') {
      el('btn-add-gallery-image').click();
    } else if (tab === 'files') {
      el('btn-add-file').click();
    }
    // 'details' tab has no "add new" action — nothing to do there.
  } else {
    openSeriesModal();
  }
}

function bindEvents() {
  // Theme
  el('btn-theme-toggle').addEventListener('click', toggleTheme);

  // Contextual "Add New" shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      handleAddNewShortcut();
    }
  });

  // Window Controls
  el('win-btn-minimize')?.addEventListener('click', () => window.api.windowControls.minimize());
  el('win-btn-maximize')?.addEventListener('click', () => window.api.windowControls.maximize());
  el('win-btn-close')?.addEventListener('click', () => window.api.windowControls.close());

  // Navigation
  el('btn-back').addEventListener('click', showLibrary);

  // Library Categories (icon + name, add/edit/delete)
  el('btn-add-library').addEventListener('click', () => openCustomizeModal(null));
  el('btn-customize-title').addEventListener('click', () => {
    const lib = state.libraries.find(l => l.id === state.currentLibraryId);
    openCustomizeModal(lib || null);
  });
  el('btn-save-customize').addEventListener('click', saveCategory);
  el('btn-delete-library').addEventListener('click', deleteCategory);
  el('nav-icon-picker').addEventListener('click', async () => {
    const path = await window.api.files.openImageDialog();
    if (path) await applyNavIconFile(path);
  });
  setupImageDropZone(el('nav-icon-picker'), applyNavIconFile);

  // Library Search & Filters
  dom.search.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    updateFilterBadges();
    loadLibrary();
  });
  // Status filter buttons are rendered dynamically by renderStatusFilterButtons()
  // (called from init() after statuses load), which wires its own click
  // listeners — nothing static to bind here.

  // Series View Toggle (table vs gallery cards)
  el('btn-view-table').addEventListener('click', () => setSeriesViewMode('table'));
  el('btn-view-card').addEventListener('click', () => setSeriesViewMode('card'));

  // Library Table Sorting (Title / Author / Rating / Year column headers) —
  // click a header to sort by it; click the active header again to flip
  // direction.
  document.querySelectorAll('#series-table th.sortable').forEach(th => {
    th.addEventListener('click', () => setSortField(th.dataset.sort));
  });

  // Sort control (dropdown + direction toggle) — lives in the view header
  // so it's visible in both table and gallery/card view. The table's
  // sortable column headers only exist in table view, so this is the only
  // way to change sort order while browsing the gallery; it stays in sync
  // with the table headers either way (see updateSortControlUI).
  el('sort-field-select').addEventListener('change', (e) => selectSortField(e.target.value));
  el('btn-sort-dir').addEventListener('click', toggleSortDirection);

  // Characters View Toggle (grid vs list)
  el('btn-view-char-grid').addEventListener('click', () => setCharViewMode('grid'));
  el('btn-view-char-list').addEventListener('click', () => setCharViewMode('list'));

  // Status Management
  el('btn-manage-statuses').addEventListener('click', openManageStatusesModal);
  el('btn-add-status').addEventListener('click', addStatus);
  el('new-status-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addStatus(); }
  });

  // Genre / Tag filter dropdowns
  el('btn-genre-filter').addEventListener('click', (e) => {
    e.stopPropagation();
    closeFilterPanel('tag-filter-panel');
    renderGenreFilterPanel();
    el('genre-filter-panel').classList.toggle('hidden');
  });
  el('btn-tag-filter').addEventListener('click', (e) => {
    e.stopPropagation();
    closeFilterPanel('genre-filter-panel');
    renderTagFilterPanel();
    el('tag-filter-panel').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!el('genre-filter-wrap').contains(e.target)) closeFilterPanel('genre-filter-panel');
    if (!el('tag-filter-wrap').contains(e.target)) closeFilterPanel('tag-filter-panel');
  });

  // More Filters — a modal (like Add Title) rather than a dropdown panel,
  // since it holds a lot more controls than the Genre/Tag panels.
  el('btn-more-filter').addEventListener('click', () => {
    renderMoreFilterPanel();
    openModal('overlay-more-filters');
  });
  el('btn-more-filter-done').addEventListener('click', () => closeModal('overlay-more-filters'));
  // Rating is wired inside renderMoreFilterPanel() (it re-renders the stars
  // each time), everything else here is static markup that only needs
  // binding once.
  el('filter-year-min').addEventListener('input', (e) => {
    state.filterYearMin = e.target.value;
    updateFilterBadges();
    loadLibrary();
  });
  el('filter-year-max').addEventListener('input', (e) => {
    state.filterYearMax = e.target.value;
    updateFilterBadges();
    loadLibrary();
  });
  el('btn-more-filter-clear').addEventListener('click', () => {
    state.filterRating = 0;
    state.filterYearMin = '';
    state.filterYearMax = '';
    state.filterBookTypes = [];
    state.filterLanguages = [];
    state.filterCountries = [];
    state.filterAuthors = [];
    state.filterArtists = [];
    state.filterPublishers = [];
    state.filterTranslated = [];
    el('filter-year-min').value = '';
    el('filter-year-max').value = '';
    renderMoreFilterPanel();
    updateFilterBadges();
    loadLibrary();
  });

  el('btn-clear-filters').addEventListener('click', () => {
    state.filterStatus = 'All';
    state.filterTags = [];
    state.filterGenres = [];
    state.filterMode = 'OR';
    state.searchQuery = '';
    state.filterRating = 0;
    state.filterYearMin = '';
    state.filterYearMax = '';
    state.filterBookTypes = [];
    state.filterLanguages = [];
    state.filterCountries = [];
    state.filterAuthors = [];
    state.filterArtists = [];
    state.filterPublishers = [];
    state.filterTranslated = [];
    dom.search.value = '';
    el('filter-year-min').value = '';
    el('filter-year-max').value = '';
    document.querySelectorAll('.filter-btn[data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === 'All'));
    document.querySelectorAll('.filter-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'OR'));
    if (!el('overlay-more-filters').classList.contains('hidden')) renderMoreFilterPanel();
    updateFilterBadges();
    loadLibrary();
  });

  // Genre/Tag match mode (Any = OR, All = AND)
  document.querySelectorAll('.filter-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filterMode = btn.dataset.mode;
      document.querySelectorAll('.filter-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
      loadLibrary();
    });
  });

  // Series Actions
  el('btn-add-series').addEventListener('click', () => openSeriesModal());
  el('btn-empty-add').addEventListener('click', () => openSeriesModal());
  el('btn-edit-series').addEventListener('click', () => openSeriesModal(state.currentSeries));
  el('btn-delete-series').addEventListener('click', () => {
    confirmDelete(`Delete "${state.currentSeries.title}"? This will delete all volumes and characters.`, async () => {
      await window.api.series.delete(state.currentSeries.id);
      toast('Title deleted');
      showLibrary();
    });
  });
  el('btn-save-series').addEventListener('click', saveSeries);

  // Series Type (Series vs Standalone)
  document.querySelectorAll('#f-s-kind-chips .type-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (chip.classList.contains('disabled')) return;
      document.querySelectorAll('#f-s-kind-chips .type-chip').forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      el('f-s-kind').value = e.currentTarget.dataset.kind;
      el('series-cover-group').classList.toggle('hidden', e.currentTarget.dataset.kind !== 'standalone');
    });
  });

  // Series Cover (standalone titles only)
  el('series-cover-picker').addEventListener('click', async () => {
    const path = await window.api.files.openImageDialog();
    if (path) await applySeriesCoverFile(path);
  });
  setupImageDropZone(el('series-cover-picker'), applySeriesCoverFile);

  // Standalone Thoughts
  el('btn-edit-standalone-thoughts').addEventListener('click', openStandaloneThoughtsModal);
  el('btn-save-standalone-thoughts').addEventListener('click', saveStandaloneThoughts);

  // Tags Input
  dom.tagWrap.addEventListener('click', () => dom.tagInput.focus());
  dom.tagInput.addEventListener('input', handleTagInput);
  dom.tagInput.addEventListener('keydown', handleTagKeydown);
  document.addEventListener('click', (e) => {
    if (!dom.tagWrap.contains(e.target)) dom.tagDropdown.classList.add('hidden');
  });

  // Tabs
  dom.tabDetails.addEventListener('click', () => switchTab('details'));
  dom.tabVols.addEventListener('click', () => switchTab('volumes'));
  dom.tabChars.addEventListener('click', () => switchTab('characters'));
  dom.tabGallery.addEventListener('click', () => switchTab('gallery'));
  dom.tabFiles.addEventListener('click', () => switchTab('files'));

  // Volume Actions
  el('btn-add-volume').addEventListener('click', () => openVolumeModal());
  el('btn-save-volume').addEventListener('click', saveVolume);
  el('btn-edit-vol').addEventListener('click', () => {
    closeModal('overlay-vol-detail');
    openVolumeModal(state.currentVolume);
  });
  el('btn-delete-vol').addEventListener('click', () => {
    confirmDelete(`Delete Volume ${state.currentVolume.volume_number}?`, async () => {
      await window.api.volumes.delete(state.currentVolume.id);
      toast('Volume deleted');
      closeModal('overlay-vol-detail');
      await loadSeriesData(state.currentSeries.id);
    });
  });
  el('vol-cover-picker').addEventListener('click', async () => {
    const path = await window.api.files.openImageDialog();
    if (path) await applyVolCoverFile(path);
  });
  setupImageDropZone(el('vol-cover-picker'), applyVolCoverFile);

  // Character Actions
  el('btn-add-character').addEventListener('click', () => openCharModal());
  el('btn-save-character').addEventListener('click', saveCharacter);
  el('btn-edit-char').addEventListener('click', () => {
    el('drawer-overlay').classList.add('hidden');
    openCharModal(state.currentCharacter);
  });
  el('btn-delete-char').addEventListener('click', () => {
    confirmDelete(`Delete ${state.currentCharacter.name}?`, async () => {
      await window.api.characters.delete(state.currentCharacter.id);
      toast('Character deleted');
      el('drawer-overlay').classList.add('hidden');
      await loadSeriesData(state.currentSeries.id);
    });
  });
  el('char-img-picker').addEventListener('click', async () => {
    const path = await window.api.files.openImageDialog();
    if (path) await applyCharImgFile(path);
  });
  setupImageDropZone(el('char-img-picker'), applyCharImgFile);
  el('btn-close-drawer').addEventListener('click', () => el('drawer-overlay').classList.add('hidden'));

  // Gallery Actions
  el('btn-add-gallery-image').addEventListener('click', async () => {
    const paths = await window.api.files.openImagesDialog();
    if (paths && paths.length > 0) await addGalleryImages(paths);
  });
  setupMultiDropZone(dom.galleryGrid, addGalleryImages, isImageFile);
  el('btn-save-gallery-caption').addEventListener('click', async () => {
    const caption = el('f-gallery-caption').value.trim();
    await window.api.gallery.updateCaption(state.currentGalleryImage.id, caption);
    toast('Caption saved');
    closeModal('overlay-gallery-detail');
    await loadSeriesData(state.currentSeries.id);
  });
  el('btn-delete-gallery-image').addEventListener('click', () => {
    confirmDelete('Delete this picture?', async () => {
      await window.api.gallery.delete(state.currentGalleryImage.id);
      toast('Picture deleted');
      closeModal('overlay-gallery-detail');
      await loadSeriesData(state.currentSeries.id);
    });
  });

  // Files Actions
  el('btn-add-file').addEventListener('click', async () => {
    const paths = await window.api.attachments.openDialog();
    if (paths && paths.length > 0) await addAttachmentFiles(paths);
  });
  setupMultiDropZone(dom.filesList, addAttachmentFiles);

  // Relationship Actions
  el('btn-add-rel-drawer').addEventListener('click', () => openRelModal());
  el('btn-add-rel-graph').addEventListener('click', () => openRelModal());
  el('btn-save-relationship').addEventListener('click', saveRelationship);

  // Relationship type chips (color category only)
  document.querySelectorAll('#f-r-type .type-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('#f-r-type .type-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      el('f-r-type-val').value = chip.dataset.type;
    });
  });

  el('btn-view-graph').addEventListener('click', showGraph);

  el('btn-auth-signout').addEventListener('click', async () => {
    await window.api.auth.signOut();
    window.location.reload(); // simplest way back to a clean auth-gate state
  });

  // Modals close
  document.querySelectorAll('.close-btn[data-close], .btn-ghost[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => closeModal(e.currentTarget.dataset.close));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlays = document.querySelectorAll('.overlay:not(.hidden)');
      if (overlays.length > 0) closeModal(overlays[overlays.length - 1].id);
      else el('drawer-overlay').classList.add('hidden');
    }
  });
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function switchView(viewId) {
  Object.values(views).forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const target = views[viewId.replace('view-', '')];
  target.classList.add('active');
  target.classList.remove('hidden');
}

const TAB_PANES = {
  details: { tab: 'tabDetails', pane: 'paneDetails' },
  volumes: { tab: 'tabVols', pane: 'paneVols' },
  characters: { tab: 'tabChars', pane: 'paneChars' },
  gallery: { tab: 'tabGallery', pane: 'paneGallery' },
  files: { tab: 'tabFiles', pane: 'paneFiles' },
};

function switchTab(tab) {
  Object.entries(TAB_PANES).forEach(([key, { tab: tabKey, pane: paneKey }]) => {
    const active = key === tab;
    dom[tabKey].classList.toggle('active', active);
    dom[paneKey].classList.toggle('active', active);
    dom[paneKey].classList.toggle('hidden', !active);
  });
}

function openModal(id) { el(id).classList.remove('hidden'); }
function closeModal(id) {
  el(id).classList.add('hidden');
  // The relationship graph runs a continuous physics simulation; hiding it
  // via CSS alone leaves that running in the background indefinitely.
  if (id === 'overlay-graph' && state.graphNetwork) {
    state.graphNetwork.destroy();
    state.graphNetwork = null;
  }
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const isImageFile = (file) => IMAGE_EXTS.includes((file.name.split('.').pop() || '').toLowerCase());

// Wires a single-image drop target (a cover/portrait/icon picker). onFilePath
// receives the resolved absolute path of the first valid dropped image.
function setupImageDropZone(zoneEl, onFilePath) {
  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    zoneEl.classList.add('drag-over');
  });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag-over'));
  zoneEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    zoneEl.classList.remove('drag-over');
    const file = Array.from(e.dataTransfer.files).find(isImageFile);
    if (!file) return toast('Drop an image file (jpg, png, gif, webp)', true);
    const path = window.api.files.getPathForFile(file);
    if (path) await onFilePath(path);
  });
}

// Wires a multi-file drop target (gallery grid, files list). onFilePaths
// receives all resolved absolute paths, pre-filtered if a filter is given.
function setupMultiDropZone(zoneEl, onFilePaths, fileFilter = null) {
  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    zoneEl.classList.add('drag-over');
  });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag-over'));
  zoneEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    zoneEl.classList.remove('drag-over');
    let files = Array.from(e.dataTransfer.files);
    if (fileFilter) files = files.filter(fileFilter);
    if (files.length === 0) return;
    const paths = files.map(f => window.api.files.getPathForFile(f)).filter(Boolean);
    if (paths.length > 0) await onFilePaths(paths);
  });
}

function toast(msg, isError = false) {
  const t = el('toast');
  t.textContent = msg;
  t.className = `toast show ${isError ? 'error' : ''}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function confirmDelete(msg, onConfirm) {
  el('confirm-msg').textContent = msg;
  openModal('overlay-confirm');
  const yes = el('btn-confirm-yes');
  const no = el('btn-confirm-no');
  const cleanup = () => { yes.removeEventListener('click', y); no.removeEventListener('click', n); };
  const y = () => { cleanup(); closeModal('overlay-confirm'); onConfirm(); };
  const n = () => { cleanup(); closeModal('overlay-confirm'); };
  yes.addEventListener('click', y);
  no.addEventListener('click', n);
}

// ─── Library ──────────────────────────────────────────────────────────────────

// Applies every active filter (the always-visible status/search/genre/tag
// controls, plus everything in the More Filters popout) to a list of series
// and returns the subset that should be visible. Sorting is handled
// separately by sortSeriesList() (see below), so the order of what comes
// back here doesn't matter — it gets sorted right after.
function applyClientFilters(list) {
  const q = state.searchQuery.trim().toLowerCase();

  return list.filter(s => {
    if (state.filterStatus !== 'All' && s.status !== state.filterStatus) return false;
    if (q && !(s.title || '').toLowerCase().includes(q) && !(s.author || '').toLowerCase().includes(q)) return false;

    const genreNames = s.genres.map(g => g.name);
    const tagNames = s.tags.map(t => t.name);
    const hasGenreFilter = state.filterGenres.length > 0;
    const hasTagFilter = state.filterTags.length > 0;
    if (hasGenreFilter || hasTagFilter) {
      if (state.filterMode === 'AND') {
        if (hasGenreFilter && !state.filterGenres.every(g => genreNames.includes(g))) return false;
        if (hasTagFilter && !state.filterTags.every(t => tagNames.includes(t))) return false;
      } else {
        const genreMatch = hasGenreFilter && state.filterGenres.some(g => genreNames.includes(g));
        const tagMatch = hasTagFilter && state.filterTags.some(t => tagNames.includes(t));
        if (!(genreMatch || tagMatch)) return false;
      }
    }

    if (state.filterRating > 0 && (s.rating || 0) < state.filterRating) return false;

    if (state.filterYearMin) {
      const y = parseInt(s.year_published);
      if (!y || y < parseInt(state.filterYearMin)) return false;
    }
    if (state.filterYearMax) {
      const y = parseInt(s.year_published);
      if (!y || y > parseInt(state.filterYearMax)) return false;
    }

    if (state.filterBookTypes.length && !state.filterBookTypes.includes((s.book_type || '').trim())) return false;
    if (state.filterLanguages.length && !state.filterLanguages.includes((s.original_language || '').trim())) return false;
    if (state.filterCountries.length && !state.filterCountries.includes((s.country_of_origin || '').trim())) return false;
    if (state.filterAuthors.length && !state.filterAuthors.includes((s.author || '').trim())) return false;
    if (state.filterArtists.length && !state.filterArtists.includes((s.artist || '').trim())) return false;

    if (state.filterPublishers.length) {
      const op = (s.original_publisher || '').trim();
      const ep = (s.english_publisher || '').trim();
      if (!state.filterPublishers.includes(op) && !state.filterPublishers.includes(ep)) return false;
    }

    if (state.filterTranslated.length) {
      const norm = s.completely_translated === 'Yes' || s.completely_translated === 'No' ? s.completely_translated : 'Unknown';
      if (!state.filterTranslated.includes(norm)) return false;
    }

    return true;
  });
}

// ─── Sorting (Library Table) ────────────────────────────────────────────────
// Sorting is deliberately kept separate from applyClientFilters() so that
// clicking a column header can just re-sort the already-filtered
// state.series in place (see applySort()) without re-running every filter
// predicate or re-fetching from the IPC layer.
const SORTABLE_FIELDS = ['title', 'author', 'rating', 'year_published', 'date_started', 'date_finished'];

// Fields that default to descending (newest/highest first) the first time
// they're selected, rather than ascending (A→Z / oldest first).
const DESCENDING_BY_DEFAULT = ['rating', 'year_published', 'date_started', 'date_finished'];

function sortSeriesList(list) {
  const field = SORTABLE_FIELDS.includes(state.sortField) ? state.sortField : 'title';
  const dir = state.sortDir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    if (field === 'rating') {
      const diff = (a.rating || 0) - (b.rating || 0);
      if (diff !== 0) return diff * dir;
      // Stable, direction-independent tie-break so same-rating titles
      // don't jump around unpredictably as the sort direction flips.
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    }
    if (field === 'year_published') {
      // year_published is stored as free text (see SERIES_EXTRA_FIELDS in
      // data-layer/index.js), so coerce it to a number for sorting; blank
      // or non-numeric values sort as 0 (oldest/lowest), same as rating's
      // "unset" handling above.
      const ay = parseInt(a.year_published) || 0;
      const by = parseInt(b.year_published) || 0;
      const diff = ay - by;
      if (diff !== 0) return diff * dir;
      // Same stable, direction-independent tie-break as rating.
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    }
    if (field === 'date_started' || field === 'date_finished') {
      // Stored as ISO date strings (YYYY-MM-DD) from <input type="date">.
      // Coerce to a timestamp for sorting; titles with no date set sort as
      // 0 (oldest/lowest), same "unset" handling as rating/year above.
      const at = a[field] ? new Date(a[field]).getTime() : 0;
      const bt = b[field] ? new Date(b[field]).getTime() : 0;
      const diff = (at || 0) - (bt || 0);
      if (diff !== 0) return diff * dir;
      // Same stable, direction-independent tie-break as rating/year.
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    }
    const av = (a[field] || '').toString();
    const bv = (b[field] || '').toString();
    return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * dir;
  });
}

// Re-sorts the already-filtered in-memory list and re-renders both the
// table and card views — used whenever the sort field/direction changes,
// so there's no need to re-fetch or re-filter from state.allSeriesRaw.
function applySort() {
  state.series = sortSeriesList(state.series);
  renderSeriesTable();
  renderSeriesCards();
  updateSortHeaderUI();
  updateSortControlUI();
}

// Reflects state.sortField/state.sortDir onto the clickable table headers:
// highlights the active column and shows a ▲/▼ arrow for its direction.
// Only relevant in table view, but harmless to call in card view too.
function updateSortHeaderUI() {
  document.querySelectorAll('#series-table th.sortable').forEach(th => {
    const isActive = th.dataset.sort === state.sortField;
    th.classList.toggle('sort-active', isActive);
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = isActive ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
  });
}

// Reflects state.sortField/state.sortDir onto the standalone sort control
// (dropdown + direction button) that sits in the view header. This is the
// only way to change sort order while in gallery/card view, since the
// clickable table column headers are hidden there — so this control has
// to work (and stay in sync) regardless of which view is active.
function updateSortControlUI() {
  const select = el('sort-field-select');
  const dirBtn = el('btn-sort-dir');
  if (!select || !dirBtn) return;
  select.value = state.sortField;
  dirBtn.textContent = state.sortDir === 'asc' ? '▲' : '▼';
  dirBtn.title = state.sortDir === 'asc' ? 'Sorted ascending — click for descending' : 'Sorted descending — click for ascending';
}

// Persists the current sort field/direction — shared by every entry point
// that can change them (table header click, sort dropdown, direction
// toggle button), so they don't each duplicate the same two IPC calls.
async function persistSort() {
  await window.api.settings.set('sortField', state.sortField);
  await window.api.settings.set('sortDir', state.sortDir);
}

// Clicking a table header: same field toggles direction; a different field
// switches to it (ratings, publication years, and start/finish dates
// default to highest/newest first, since that's usually what you want to
// see when you first sort by them).
async function setSortField(field) {
  if (!SORTABLE_FIELDS.includes(field)) return;
  if (state.sortField === field) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortField = field;
    state.sortDir = DESCENDING_BY_DEFAULT.includes(field) ? 'desc' : 'asc';
  }
  applySort();
  await persistSort();
}

// Dropdown version of the same thing — always jumps straight to the
// chosen field's default direction rather than toggling. (Re-picking the
// already-selected option from a <select> doesn't fire a 'change' event
// in the first place, so there's no "toggle on same field" case here.)
async function selectSortField(field) {
  if (!SORTABLE_FIELDS.includes(field) || field === state.sortField) return;
  state.sortField = field;
  state.sortDir = DESCENDING_BY_DEFAULT.includes(field) ? 'desc' : 'asc';
  applySort();
  await persistSort();
}

// The standalone direction-toggle button — flips asc/desc for whatever
// field is currently active, without changing the field itself.
async function toggleSortDirection() {
  state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  applySort();
  await persistSort();
}

// Distinct, non-empty values for a single field across the unfiltered
// library list — the source for a More Filters checkbox facet.
function uniqueValues(list, field) {
  return [...new Set(list.map(s => (s[field] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Publisher is one facet covering two columns (original + English
// publisher), since a title usually only has one of the two filled in.
function uniquePublishers(list) {
  const set = new Set();
  list.forEach(s => {
    if (s.original_publisher && s.original_publisher.trim()) set.add(s.original_publisher.trim());
    if (s.english_publisher && s.english_publisher.trim()) set.add(s.english_publisher.trim());
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Renders one More Filters checkbox facet. `allValues` comes from the
// unfiltered library list (so unchecking everything doesn't also empty
// the list of things you could check), `selected` is the current
// state.filter* array for this facet, and `onToggle(value, checked)` updates
// that array, re-filters, and re-renders.
function renderFilterCheckboxList(containerId, allValues, selected, onToggle) {
  const container = el(containerId);
  if (allValues.length === 0) {
    container.innerHTML = `<div class="filter-option-empty">None yet</div>`;
    return;
  }
  container.innerHTML = allValues.map(v => `
    <label class="filter-option">
      <input type="checkbox" data-value="${escapeHTML(v)}" ${selected.includes(v) ? 'checked' : ''}>
      ${escapeHTML(v)}
    </label>
  `).join('');
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => onToggle(cb.dataset.value, cb.checked));
  });
}

// Populates every section of the More Filters popout from
// state.allSeriesRaw (so facets reflect the current library regardless of
// what's already filtered) and wires each control back into state.
function renderMoreFilterPanel() {
  renderRatingStars(el('filter-rating-stars'), state.filterRating, {
    onChange: (n) => {
      state.filterRating = n;
      updateFilterBadges();
      loadLibrary();
    },
  });
  el('filter-year-min').value = state.filterYearMin;
  el('filter-year-max').value = state.filterYearMax;

  const facets = [
    ['filter-booktype-list', 'book_type', 'filterBookTypes'],
    ['filter-language-list', 'original_language', 'filterLanguages'],
    ['filter-country-list', 'country_of_origin', 'filterCountries'],
    ['filter-author-list', 'author', 'filterAuthors'],
    ['filter-artist-list', 'artist', 'filterArtists'],
  ];
  facets.forEach(([containerId, field, stateKey]) => {
    renderFilterCheckboxList(containerId, uniqueValues(state.allSeriesRaw, field), state[stateKey], (value, checked) => {
      state[stateKey] = checked ? [...state[stateKey], value] : state[stateKey].filter(v => v !== value);
      updateFilterBadges();
      loadLibrary();
    });
  });

  renderFilterCheckboxList('filter-publisher-list', uniquePublishers(state.allSeriesRaw), state.filterPublishers, (value, checked) => {
    state.filterPublishers = checked ? [...state.filterPublishers, value] : state.filterPublishers.filter(v => v !== value);
    updateFilterBadges();
    loadLibrary();
  });

  renderFilterCheckboxList('filter-translated-list', ['Yes', 'No', 'Unknown'], state.filterTranslated, (value, checked) => {
    state.filterTranslated = checked ? [...state.filterTranslated, value] : state.filterTranslated.filter(v => v !== value);
    updateFilterBadges();
    loadLibrary();
  });
}

// Fetches every title in the current library (no status/search/tag/genre
// filtering — those are applied client-side below), then narrows it down
// to what should actually be shown and sorts it per the active sort
// column. Keeping the raw list in state.allSeriesRaw is also what lets the
// More Filters popout build its facet checklists (distinct book types,
// languages, publishers, etc.) without a separate round trip.
async function loadLibrary() {
  state.allSeriesRaw = await window.api.series.getAll({ libraryId: state.currentLibraryId });
  state.series = sortSeriesList(applyClientFilters(state.allSeriesRaw));

  dom.seriesCount.textContent = `${state.series.length} ${state.series.length === 1 ? 'title' : 'titles'}`;

  if (state.series.length === 0) {
    dom.emptyState.classList.remove('hidden');
    dom.tbody.innerHTML = '';
    el('series-cards').innerHTML = '';
  } else {
    dom.emptyState.classList.add('hidden');
    renderSeriesTable();
    renderSeriesCards();
  }

  updateSortHeaderUI();
  updateSortControlUI();
  applySeriesViewMode();
}

function renderSeriesTable() {
  dom.tbody.innerHTML = '';
  state.series.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'table-row';

    const formatCell = (val) => val ? escapeHTML(val) : '<span class="empty-dim">—</span>';

    // Rating star helper preventing multiline breaks
    const renderRating = (r) => {
      if (!r) return '<span class="empty-dim">—</span>';
      return `<span class="rating-stars" title="${r}/5">${'★'.repeat(r)}</span>`;
    };

    tr.innerHTML = `
      <td class="col-title">
        <div class="series-title-cell">
          <span class="title-text">${escapeHTML(s.title)}</span>
          ${s.kind === 'standalone' ? `<span class="kind-badge">STANDALONE</span>` : ''}
        </div>
      </td>
      <td class="col-author">${formatCell(s.author)}</td>
      <td class="col-genres">
        <div class="tag-list">
          ${s.genres.length
        ? s.genres.map(g => `<span class="genre-pill" style="background:${g.color}">${escapeHTML(g.name).toUpperCase()}</span>`).join('')
        : '<span class="empty-dim">—</span>'}
        </div>
      </td>
      <td class="col-tags">
        <div class="tag-list">
          ${s.tags.length
        ? s.tags.map(t => `<span class="tag-pill" style="color:${t.color}">${escapeHTML(t.name).toUpperCase()}</span>`).join('')
        : '<span class="empty-dim">—</span>'}
        </div>
      </td>
      <td class="col-status">
        <span class="status-badge" style="color:${statusColor(s.status)}">
          ${escapeHTML(s.status).toUpperCase()}
        </span>
      </td>
      <td class="col-num">${s.kind === 'standalone' ? '<span class="empty-dim">—</span>' : (s.volume_count || 0)}</td>
      <td class="col-num">${formatCell(s.year_published)}</td>
      <td class="col-rating">${renderRating(s.rating)}</td>
      <td class="col-actions">
        <svg class="row-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </td>
    `;

    tr.addEventListener('click', () => openSeriesDetail(s.id));
    dom.tbody.appendChild(tr);
  });
}

// Card/gallery view of the same `state.series` data — a cover-forward grid
// instead of the dense table. Uses cover_image_path if the title has one
// (set via the standalone cover picker, or carried over from older data),
// otherwise falls back to a plain initial-letter tile.
function renderSeriesCards() {
  const grid = el('series-cards');
  grid.innerHTML = state.series.map(s => `
    <div class="series-card" data-id="${s.id}">
      <div class="series-card-cover">
        ${s.cover_image_path
      ? `<img data-key="${escapeHTML(s.cover_image_path)}" alt="${escapeHTML(s.title)}">`
      : `<span class="series-card-cover-fallback">${escapeHTML((s.title || '?').charAt(0).toUpperCase())}</span>`}
      </div>
      <div class="series-card-body">
        <div class="series-card-title">
          ${escapeHTML(s.title)}
          ${s.kind === 'standalone' ? `<span class="kind-badge">Standalone</span>` : ''}
        </div>
        <div class="series-card-author">${escapeHTML(s.author || '')}</div>
        <div class="series-card-footer">
          <span class="status-badge" style="color:${statusColor(s.status)}">${escapeHTML(s.status)}</span>
          <span class="series-card-count">${s.kind === 'standalone' ? '—' : `${s.volume_count} vol`}</span>
        </div>
      </div>
    </div>
  `).join('');

  fillCoverImages(grid);

  grid.querySelectorAll('.series-card').forEach(card => {
    card.addEventListener('click', () => openSeriesDetail(parseInt(card.dataset.id)));
  });
}

// Shows whichever of the table/cards matches state.seriesViewMode (and
// keeps the toggle buttons' active state in sync). Both stay hidden when
// the library is empty — the shared #empty-state message covers that case.
function applySeriesViewMode() {
  const isCard = state.seriesViewMode === 'card';
  const hasData = state.series.length > 0;
  el('series-table').classList.toggle('hidden', !hasData || isCard);
  el('series-cards').classList.toggle('hidden', !hasData || !isCard);
  el('btn-view-table').classList.toggle('active', !isCard);
  el('btn-view-card').classList.toggle('active', isCard);
}

async function setSeriesViewMode(mode) {
  if (mode === state.seriesViewMode) return;
  state.seriesViewMode = mode;
  applySeriesViewMode();
  await window.api.settings.set('seriesViewMode', mode);
}

function showLibrary() {
  switchView('view-library');
  loadLibrary();
}

// ─── Series Detail ────────────────────────────────────────────────────────────

async function openSeriesDetail(id) {
  state.currentSeries = await window.api.series.get(id);
  switchView('view-series');
  switchTab('details');
  await loadSeriesData(id);
}

async function loadSeriesData(id) {
  const s = await window.api.series.get(id);
  state.currentSeries = s;
  state.volumes = await window.api.volumes.getBySeries(id);
  state.characters = await window.api.characters.getBySeries(id);
  state.relationships = await window.api.relationships.getBySeries(id);
  state.galleryImages = await window.api.gallery.getBySeries(id);
  state.attachments = await window.api.attachments.getBySeries(id);

  renderSeriesHero(s);
  renderCharacters();
  renderCharactersList();
  applyCharViewMode();
  renderGallery();
  renderFiles();

  const isStandalone = s.kind === 'standalone';
  el('tab-volumes-label').textContent = isStandalone ? 'Thoughts' : 'Volumes';
  el('vol-tab-count').classList.toggle('hidden', isStandalone);
  el('btn-add-volume').classList.toggle('hidden', isStandalone);
  el('btn-edit-standalone-thoughts').classList.toggle('hidden', !isStandalone);
  dom.volList.classList.toggle('hidden', isStandalone);
  el('standalone-thoughts-view').classList.toggle('hidden', !isStandalone);

  if (isStandalone) {
    renderStandaloneThoughtsView(s);
  } else {
    renderVolumes();
  }

  dom.volCount.textContent = state.volumes.length;
  dom.charCount.textContent = state.characters.length;
  dom.galleryCount.textContent = state.galleryImages.length;
  dom.filesCount.textContent = state.attachments.length;
}

function renderSeriesHero(s) {
  // Render cover image on the left, with top details (status, title, author) on the right
  dom.heroTop.innerHTML = `
    <div class="hero-header-row">
      ${s.cover_image_path ? `
        <div class="hero-cover-wrap">
          <img data-key="${escapeHTML(s.cover_image_path)}" class="hero-cover-img" alt="${escapeHTML(s.title)} Cover">
        </div>
      ` : ''}
      <div class="hero-header-details">
        <div class="hero-status-row">
          <span class="status-badge" style="color:${statusColor(s.status)}">${escapeHTML(s.status)}</span>
          ${s.kind === 'standalone' ? `<span class="kind-badge">Standalone</span>` : ''}
        </div>
        <h2 class="hero-title">${escapeHTML(s.title)}</h2>
        <div class="hero-author"><strong>Author:</strong> ${escapeHTML(s.author || '-')}</div>
      </div>
    </div>
  `;

  // Fetch and display image if a key is present
  fillCoverImages(dom.heroTop);

  dom.heroDetails.innerHTML = `
    ${s.genres.length ? `
      <div class="hero-field">
        <span class="hero-field-label">Genre</span>
        <div class="tag-list">
          ${s.genres.map(g => `<span class="genre-pill" style="background:${g.color}">${escapeHTML(g.name)}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    ${s.tags.length ? `
      <div class="hero-field">
        <span class="hero-field-label">Tags</span>
        <div class="tag-list">
          ${s.tags.map(t => `<span class="tag-pill" style="color:${t.color}; border-color:${t.color}">${escapeHTML(t.name)}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    ${s.synopsis ? `<div class="hero-synopsis">${nl2br(s.synopsis)}</div>` : ''}
  `;
  const coverWrap = dom.heroTop.querySelector('.hero-cover-wrap');
  if (coverWrap) {
    coverWrap.addEventListener('click', () => {
      const img = coverWrap.querySelector('.hero-cover-img');
      if (img && img.src) {
        openLightbox(img.src, s.title);
      }
    });
  }
  renderHeroExtraDetails(s);
}

// Renders whichever of the optional "additional details" fields are
// actually filled in, as a compact label/value grid. Nothing shows at all
// if none of them were set.
function renderHeroExtraDetails(s) {
  let grid = document.getElementById('hero-extra-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.id = 'hero-extra-grid';
    grid.className = 'hero-extra-grid';
    dom.heroDetails.appendChild(grid);
  }

  const items = [];
  if (s.rating) items.push({ label: 'Rating', starRating: s.rating });
  if (s.book_type) items.push({ label: 'Book Type', value: s.book_type });
  if (s.date_started) items.push({ label: 'Date Started', value: formatDate(s.date_started) });
  if (s.date_finished) items.push({ label: 'Date Finished', value: formatDate(s.date_finished) });
  if (s.artist) items.push({ label: 'Artist(s)', value: s.artist });
  if (s.year_published) items.push({ label: 'Year Published', value: s.year_published });
  if (s.original_language) items.push({ label: 'Original Language', value: s.original_language });
  if (s.country_of_origin) items.push({ label: 'Country of Origin', value: s.country_of_origin });
  if (s.language_read && s.language_read !== 'English') items.push({ label: 'Language Read', value: s.language_read });
  if (s.status_country_of_origin) items.push({ label: 'Status in Origin', value: s.status_country_of_origin });
  if (s.licensed_english) items.push({ label: 'Licensed (English)', value: s.licensed_english });
  if (s.completely_translated) items.push({ label: 'Fully Translated', value: s.completely_translated });
  if (s.original_publisher) items.push({ label: 'Original Publisher', value: s.original_publisher });
  if (s.english_publisher) items.push({ label: 'English Publisher', value: s.english_publisher });

  if (items.length === 0) { grid.innerHTML = ''; grid.classList.add('hidden'); return; }
  grid.classList.remove('hidden');

  grid.innerHTML = items.map(item => `
    <div class="hero-extra-item">
      <span class="hero-field-label">${escapeHTML(item.label)}</span>
      ${item.starRating
      ? `<div class="hero-extra-value rating-stars readonly" data-stars="${item.starRating}"></div>`
      : `<span class="hero-extra-value">${escapeHTML(item.value)}</span>`}
    </div>
  `).join('');

  grid.querySelectorAll('.rating-stars[data-stars]').forEach(elm => {
    renderRatingStars(elm, parseInt(elm.dataset.stars), { readonly: true });
  });
}

// ─── Standalone Thoughts ────────────────────────────────────────────────────

function renderStandaloneThoughtsView(s) {
  const hasThoughts = s.overall_thoughts || s.chapter_thoughts;
  const view = el('standalone-thoughts-view');
  if (!hasThoughts) {
    view.innerHTML = `<div class="empty-state"><h3>No thoughts yet</h3><p>Add your overall thoughts and chapter notes for this book.</p><button class="btn btn-primary" id="btn-empty-add-thoughts">+ Add Thoughts</button></div>`;
    el('btn-empty-add-thoughts').addEventListener('click', openStandaloneThoughtsModal);
    fillCoverImages(view);
    return;
  }
  view.innerHTML = `
    ${s.overall_thoughts ? `<div class="vol-detail-section"><h4>Overall Thoughts</h4><div class="vol-detail-text">${nl2br(s.overall_thoughts)}</div></div>` : ''}
    ${s.chapter_thoughts ? `<div class="vol-detail-section"><h4>Chapter Notes</h4><div class="vol-detail-text">${nl2br(s.chapter_thoughts)}</div></div>` : ''}
  `;
  fillCoverImages(view);
}

function openStandaloneThoughtsModal() {
  el('f-standalone-thoughts').value = state.currentSeries.overall_thoughts || '';
  el('f-standalone-chapter-notes').value = state.currentSeries.chapter_thoughts || '';
  openModal('overlay-standalone-thoughts');
  refreshCharCounters('f-standalone-thoughts', 'f-standalone-chapter-notes');
  el('f-standalone-thoughts').focus();
}

async function saveStandaloneThoughts() {
  const s = state.currentSeries;
  const d = {
    title: s.title,
    author: s.author,
    status: s.status,
    synopsis: s.synopsis,
    tags: s.tags.map(t => t.name),
    kind: s.kind,
    overall_thoughts: el('f-standalone-thoughts').value.trim(),
    chapter_thoughts: el('f-standalone-chapter-notes').value.trim(),
    cover_image_path: s.cover_image_path,
    // Carry the additional-details fields through unchanged — this form
    // doesn't edit them, but seriesUpdate rebuilds every column, so leaving
    // them out here would silently wipe them to null.
    rating: s.rating || 0,
    book_type: s.book_type,
    date_started: s.date_started,
    date_finished: s.date_finished,
    artist: s.artist,
    year_published: s.year_published,
    original_language: s.original_language,
    country_of_origin: s.country_of_origin,
    language_read: s.language_read,
    status_country_of_origin: s.status_country_of_origin,
    licensed_english: s.licensed_english,
    completely_translated: s.completely_translated,
    original_publisher: s.original_publisher,
    english_publisher: s.english_publisher,
  };
  await window.api.series.update(s.id, d);
  toast('Thoughts saved');
  closeModal('overlay-standalone-thoughts');
  await loadSeriesData(s.id);
}

// ─── Series Form & Tags ───────────────────────────────────────────────────────

async function loadTags() {
  state.allTags = await window.api.tags.getAll();
}

async function loadGenres() {
  state.allGenres = await window.api.genres.getAll();
}

// ─── Statuses (customizable) ────────────────────────────────────────────

async function loadStatuses() {
  state.allStatuses = await window.api.statuses.getAll();
}

// Looks up the stored color for a status name; falls back to the muted
// text color for anything not (or no longer) in the statuses table, e.g.
// a status that was deleted after some titles were already set to it.
function statusColor(name) {
  const s = state.allStatuses.find(st => st.name.toLowerCase() === (name || '').toLowerCase());
  return s ? s.color : 'var(--text-muted)';
}

function renderStatusFilterButtons() {
  const container = el('status-filter-buttons');
  const entries = [{ name: 'All' }, ...state.allStatuses];
  container.innerHTML = entries.map(s => `
    <button class="filter-btn ${state.filterStatus === s.name ? 'active' : ''}" data-status="${escapeHTML(s.name)}">${escapeHTML(s.name)}</button>
  `).join('');
  container.querySelectorAll('.filter-btn[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filterStatus = btn.dataset.status;
      updateFilterBadges();
      loadLibrary();
    });
  });
}

// Populates the series-form status <select> from the current statuses
// table. If editing a title whose saved status was since deleted/renamed
// out from under it, that legacy value is kept as an extra option so the
// form doesn't silently blank out or reassign it on save.
function renderStatusSelectOptions(selected) {
  const sel = el('f-s-status');
  let names = state.allStatuses.map(s => s.name);
  if (selected && !names.some(n => n.toLowerCase() === selected.toLowerCase())) {
    names = [selected, ...names];
  }
  sel.innerHTML = names.map(n => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
  sel.value = selected || names[0] || '';
}

// Keeps the series-form status <select> in sync with the statuses table
// whenever that form happens to be open — e.g. the user opens "Manage
// Statuses" from inside the Add/Edit Title modal (it renders on top,
// nested), adds/renames a status there, and expects the dropdown behind it
// to already reflect the change once they're back. Called after any
// add/edit of a status. `selectName`, if given, becomes the new selection
// (e.g. the status the user just added); otherwise the current selection
// is preserved.
function refreshSeriesStatusSelectIfOpen(selectName) {
  if (el('overlay-series').classList.contains('hidden')) return;
  const current = selectName || el('f-s-status').value;
  renderStatusSelectOptions(current);
}

function openManageStatusesModal() {
  renderStatusManageList();
  openModal('overlay-manage-statuses');
}

function renderStatusManageList() {
  const container = el('status-manage-list');
  if (state.allStatuses.length === 0) {
    container.innerHTML = `<div class="filter-option-empty">No statuses yet — add one below.</div>`;
    return;
  }
  container.innerHTML = state.allStatuses.map(s => `
    <div class="status-manage-row" data-id="${s.id}">
      <input type="color" class="status-color-input" value="${s.color}" data-id="${s.id}" title="Color">
      <input type="text" class="status-name-input" value="${escapeHTML(s.name)}" data-id="${s.id}" maxlength="50" autocomplete="off">
      <button type="button" class="btn btn-danger-ghost btn-sm status-delete-btn" data-id="${s.id}" title="Delete status">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.status-color-input').forEach(input => {
    input.addEventListener('change', () => saveStatusEdit(parseInt(input.dataset.id)));
  });
  container.querySelectorAll('.status-name-input').forEach(input => {
    input.addEventListener('blur', () => saveStatusEdit(parseInt(input.dataset.id)));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });
  container.querySelectorAll('.status-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteStatus(parseInt(btn.dataset.id)));
  });
}

// Auto-saves on blur/change rather than needing an explicit save button —
// mirrors how gallery captions and other lightweight edits work elsewhere.
async function saveStatusEdit(id) {
  const row = document.querySelector(`.status-manage-row[data-id="${id}"]`);
  if (!row) return;
  const name = row.querySelector('.status-name-input').value.trim();
  const color = row.querySelector('.status-color-input').value;
  if (!name) return toast('Status name is required', true);

  // If this status is the one currently selected in the Add/Edit Title
  // form's dropdown, follow the rename through so the selection doesn't
  // silently fall back to a stale/legacy option after refreshing.
  const prevStatus = state.allStatuses.find(s => s.id === id);
  const wasSelectedInForm = !el('overlay-series').classList.contains('hidden')
    && prevStatus && el('f-s-status').value === prevStatus.name;

  try {
    await window.api.statuses.update(id, { name, color });
    await loadStatuses();
    renderStatusManageList();
    renderStatusFilterButtons();
    refreshSeriesStatusSelectIfOpen(wasSelectedInForm ? name : undefined);
    toast('Status updated');
    if (el('view-library').classList.contains('active')) loadLibrary();
    if (state.currentSeries) loadSeriesData(state.currentSeries.id).catch(() => { });
  } catch (e) {
    toast(e.message || 'Could not update status', true);
    renderStatusManageList(); // revert the row to last-known-good values
  }
}

async function deleteStatus(id) {
  const s = state.allStatuses.find(st => st.id === id);
  if (!s) return;
  confirmDelete(`Delete status "${s.name}"?`, async () => {
    try {
      await window.api.statuses.delete(id);
      await loadStatuses();
      renderStatusManageList();
      renderStatusFilterButtons();
      toast('Status deleted');
    } catch (e) {
      toast(e.message || 'Could not delete status', true);
    }
  });
}

async function addStatus() {
  const name = el('new-status-name').value.trim();
  const color = el('new-status-color').value;
  if (!name) return toast('Status name is required', true);
  try {
    await window.api.statuses.create({ name, color });
    el('new-status-name').value = '';
    await loadStatuses();
    renderStatusManageList();
    renderStatusFilterButtons();
    // If the Add/Edit Title form is open behind this modal, show the
    // newly added status in its dropdown immediately (and select it,
    // since the user just added it presumably to use it).
    refreshSeriesStatusSelectIfOpen(name);
    toast('Status added');
  } catch (e) {
    toast(e.message || 'Could not add status', true);
  }
}

// ─── Library Filter Dropdowns (Genres / Tags) ──────────────────────────────

function closeFilterPanel(id) {
  el(id).classList.add('hidden');
}

function renderGenreFilterPanel() {
  const panel = el('genre-filter-panel');
  if (state.allGenres.length === 0) {
    panel.innerHTML = `<div class="filter-option-empty">No genres yet</div>`;
    return;
  }
  panel.innerHTML = state.allGenres.map(g => `
    <label class="filter-option">
      <input type="checkbox" data-name="${escapeHTML(g.name)}" ${state.filterGenres.includes(g.name) ? 'checked' : ''}>
      <span class="filter-option-swatch" style="background:${g.color}"></span>
      ${escapeHTML(g.name)}
    </label>
  `).join('');
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.dataset.name;
      state.filterGenres = cb.checked
        ? [...state.filterGenres, name]
        : state.filterGenres.filter(n => n !== name);
      updateFilterBadges();
      loadLibrary();
    });
  });
}

function renderTagFilterPanel() {
  const panel = el('tag-filter-panel');
  if (state.allTags.length === 0) {
    panel.innerHTML = `<div class="filter-option-empty">No tags yet</div>`;
    return;
  }
  panel.innerHTML = state.allTags.map(t => `
    <label class="filter-option">
      <input type="checkbox" data-name="${escapeHTML(t.name)}" ${state.filterTags.includes(t.name) ? 'checked' : ''}>
      <span class="filter-option-swatch" style="background:${t.color || '#4a90e2'}"></span>
      ${escapeHTML(t.name)}
    </label>
  `).join('');
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.dataset.name;
      state.filterTags = cb.checked
        ? [...state.filterTags, name]
        : state.filterTags.filter(n => n !== name);
      updateFilterBadges();
      loadLibrary();
    });
  });
}

function updateFilterBadges() {
  const gCount = el('genre-filter-count');
  gCount.textContent = state.filterGenres.length;
  gCount.classList.toggle('hidden', state.filterGenres.length === 0);
  el('btn-genre-filter').classList.toggle('active', state.filterGenres.length > 0);

  const tCount = el('tag-filter-count');
  tCount.textContent = state.filterTags.length;
  tCount.classList.toggle('hidden', state.filterTags.length === 0);
  el('btn-tag-filter').classList.toggle('active', state.filterTags.length > 0);

  const moreCount = state.filterBookTypes.length + state.filterLanguages.length + state.filterCountries.length
    + state.filterAuthors.length + state.filterArtists.length + state.filterPublishers.length
    + state.filterTranslated.length + (state.filterRating > 0 ? 1 : 0)
    + (state.filterYearMin ? 1 : 0) + (state.filterYearMax ? 1 : 0);
  const mCount = el('more-filter-count');
  mCount.textContent = moreCount;
  mCount.classList.toggle('hidden', moreCount === 0);
  el('btn-more-filter').classList.toggle('active', moreCount > 0);

  const anyActive = state.filterStatus !== 'All'
    || state.filterTags.length > 0
    || state.filterGenres.length > 0
    || state.searchQuery.trim() !== ''
    || moreCount > 0;
  el('btn-clear-filters').classList.toggle('hidden', !anyActive);

  // Any/All only matters once there are 2+ genre/tag selections combined —
  // with 0 or 1 selected, both modes return identical results.
  const selectionCount = state.filterGenres.length + state.filterTags.length;
  el('filter-mode-wrap').classList.toggle('hidden', selectionCount < 2);
}

function renderGenreSwatches() {
  const grid = el('genre-swatch-grid');
  grid.innerHTML = state.allGenres.map(g => {
    const active = state.selectedGenres.includes(g.name);
    return `
      <button type="button" class="genre-swatch ${active ? 'active' : ''}" data-name="${escapeHTML(g.name)}"
        style="${active ? `background:${g.color}; border-color:${g.color};` : ''}">
        <span class="genre-swatch-dot" style="background:${g.color}"></span>
        ${escapeHTML(g.name)}
      </button>
    `;
  }).join('');
  grid.querySelectorAll('.genre-swatch').forEach(btn => {
    btn.addEventListener('click', () => toggleGenre(btn.dataset.name));
  });
}

function toggleGenre(name) {
  if (state.selectedGenres.includes(name)) {
    state.selectedGenres = state.selectedGenres.filter(n => n !== name);
  } else {
    state.selectedGenres.push(name);
  }
  renderGenreSwatches();
}

function renderTagChips() {
  dom.tagChips.innerHTML = state.selectedTags.map(t => `
    <div class="tag-chip">
      ${escapeHTML(t.name)}
      <span class="tag-chip-remove" data-name="${escapeHTML(t.name)}">✕</span>
    </div>
  `).join('');
  dom.tagChips.querySelectorAll('.tag-chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.dataset.name;
      state.selectedTags = state.selectedTags.filter(t => t.name !== name);
      renderTagChips();
    });
  });
}

// Tags are capped at 50 characters — long enough for any real tag, short
// enough to keep the chip UI from breaking.
const MAX_TAG_LENGTH = 50;

function handleTagInput(e) {
  const val = e.target.value.toLowerCase().trim();
  if (!val) { dom.tagDropdown.classList.add('hidden'); return; }

  const matches = state.allTags.filter(t => t.name.toLowerCase().includes(val)
    && !state.selectedTags.some(st => st.name === t.name));

  if (matches.length > 0) {
    dom.tagDropdown.innerHTML = matches.map(t => `<div class="tag-option">${escapeHTML(t.name)}</div>`).join('');
    dom.tagDropdown.querySelectorAll('.tag-option').forEach(opt => {
      opt.addEventListener('click', () => {
        addTag(opt.textContent);
      });
    });
    dom.tagDropdown.classList.remove('hidden');
  } else {
    dom.tagDropdown.classList.add('hidden');
  }
}

function handleTagKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (val) addTag(val);
  }
}

function addTag(name) {
  const trimmed = name.slice(0, MAX_TAG_LENGTH);
  if (!state.selectedTags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
    state.selectedTags.push({ name: trimmed });
  }
  dom.tagInput.value = '';
  dom.tagDropdown.classList.add('hidden');
  renderTagChips();
}

function openSeriesModal(series = null) {
  el('modal-series-title').textContent = series
    ? (series.kind === 'standalone' ? 'Edit Standalone Title' : 'Edit Title')
    : 'Add New Title';
  el('f-s-title').value = series?.title || '';
  el('f-s-author').value = series?.author || '';
  renderStatusSelectOptions(series?.status);
  el('f-s-synopsis').value = series?.synopsis || '';

  const kind = series?.kind || 'series';
  el('f-s-kind').value = kind;
  document.querySelectorAll('#f-s-kind-chips .type-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.kind === kind);
    chip.classList.toggle('disabled', !!series);
  });
  el('kind-locked-hint').classList.toggle('hidden', !series);

  el('series-cover-group').classList.toggle('hidden', kind !== 'standalone');
  el('f-s-cover').value = series?.cover_image_path || '';
  if (series?.cover_image_path) {
    el('series-cover-preview').innerHTML = '';
    el('series-cover-preview').style.backgroundImage = 'none';
    window.api.files.getImageData(series.cover_image_path).then(dataUrl => {
      if (dataUrl) el('series-cover-preview').style.backgroundImage = `url('${dataUrl}')`;
    });
  } else {
    el('series-cover-preview').innerHTML = '<span>Click to add cover</span>';
    el('series-cover-preview').style.backgroundImage = 'none';
  }

  state.selectedTags = series ? [...series.tags] : [];
  renderTagChips();
  dom.tagInput.value = '';

  state.selectedGenres = series ? series.genres.map(g => g.name) : [];
  renderGenreSwatches();

  // Additional details (all optional)
  state.selectedRating = series?.rating || 0;
  renderRatingStars(el('f-s-rating-stars'), state.selectedRating, {
    onChange: (n) => { state.selectedRating = n; el('f-s-rating').value = n; },
  });
  el('f-s-rating').value = state.selectedRating;
  el('f-s-booktype').value = series?.book_type || '';
  el('f-s-date-started').value = series?.date_started || '';
  el('f-s-date-finished').value = series?.date_finished || '';
  el('f-s-artist').value = series?.artist || '';
  el('f-s-year-pub').value = series?.year_published || '';
  el('f-s-orig-lang').value = series?.original_language || '';
  el('f-s-origin-country').value = series?.country_of_origin || '';
  el('f-s-lang-read').value = series?.language_read || 'English';
  el('f-s-status-origin').value = series?.status_country_of_origin || '';
  el('f-s-licensed').value = series?.licensed_english || '';
  el('f-s-translated').value = series?.completely_translated || '';
  el('f-s-orig-publisher').value = series?.original_publisher || '';
  el('f-s-eng-publisher').value = series?.english_publisher || '';
  // Collapse back to closed each time the modal opens, unless any of these
  // fields are already filled in — then leave it open so edits are visible.
  const hasExtraDetails = state.selectedRating || series?.book_type || series?.date_started || series?.date_finished
    || series?.artist || series?.year_published || series?.original_language || series?.country_of_origin
    || (series?.language_read && series.language_read !== 'English') || series?.status_country_of_origin
    || series?.licensed_english || series?.completely_translated || series?.original_publisher || series?.english_publisher;
  el('series-extra-details') && (el('series-extra-details').open = !!hasExtraDetails);

  openModal('overlay-series');
  refreshCharCounters('f-s-title', 'f-s-author', 'f-s-synopsis');
  el('f-s-title').focus();
}

async function saveSeries() {
  const d = {
    title: el('f-s-title').value.trim(),
    author: el('f-s-author').value.trim(),
    status: el('f-s-status').value,
    synopsis: el('f-s-synopsis').value.trim(),
    tags: state.selectedTags.map(t => t.name),
    genres: state.selectedGenres,
    library_id: state.currentLibraryId,
    kind: state.currentSeries && el('modal-series-title').textContent.includes('Edit')
      ? state.currentSeries.kind
      : el('f-s-kind').value,
    overall_thoughts: state.currentSeries && el('modal-series-title').textContent.includes('Edit')
      ? state.currentSeries.overall_thoughts
      : null,
    chapter_thoughts: state.currentSeries && el('modal-series-title').textContent.includes('Edit')
      ? state.currentSeries.chapter_thoughts
      : null,
    cover_image_path: el('f-s-kind').value === 'standalone' ? (el('f-s-cover').value || null) : null,
    // Additional details (all optional)
    rating: parseInt(el('f-s-rating').value) || 0,
    book_type: el('f-s-booktype').value.trim(),
    date_started: el('f-s-date-started').value || null,
    date_finished: el('f-s-date-finished').value || null,
    artist: el('f-s-artist').value.trim(),
    year_published: el('f-s-year-pub').value.trim(),
    original_language: el('f-s-orig-lang').value.trim(),
    country_of_origin: el('f-s-origin-country').value.trim(),
    language_read: el('f-s-lang-read').value.trim() || 'English',
    status_country_of_origin: el('f-s-status-origin').value.trim(),
    licensed_english: el('f-s-licensed').value,
    completely_translated: el('f-s-translated').value,
    original_publisher: el('f-s-orig-publisher').value.trim(),
    english_publisher: el('f-s-eng-publisher').value.trim(),
  };
  if (!d.title) return toast('Title is required', true);

  if (state.currentSeries && el('modal-series-title').textContent.includes('Edit')) {
    await window.api.series.update(state.currentSeries.id, d);
    toast('Title updated');
    loadSeriesData(state.currentSeries.id);
  } else {
    await window.api.series.create(d);
    toast('Title added');
  }
  closeModal('overlay-series');
  loadTags();
  loadGenres();
  if (el('view-library').classList.contains('active')) loadLibrary();
}

// ─── Volumes ──────────────────────────────────────────────────────────────────

const NOTE_COLORS = ['#CBEA9B', '#F6C878', '#A9D9F4', '#D3D7D9', '#F6EB78', '#F3A79C'];

function renderVolumes() {
  if (state.volumes.length === 0) {
    dom.volList.innerHTML = `<div class="empty-state"><h3>No volumes yet</h3><p>Add a volume to start tracking your reading.</p></div>`;
    return;
  }

  dom.volList.innerHTML = state.volumes.map((v, i) => {
    const color = NOTE_COLORS[i % NOTE_COLORS.length];
    const bodyText = v.title
      ? escapeHTML(v.title)
      : (v.thoughts ? escapeHTML(v.thoughts.slice(0, 140)) : 'No notes yet');
    const metaBits = [];
    if (v.chapter_range) metaBits.push(escapeHTML(v.chapter_range));
    if (v.chapter_count) metaBits.push(`${v.chapter_count} chs`);

    return `
      <div class="volume-card" data-id="${v.id}" style="background:${color}">
        <div class="vol-note-label">Vol. ${v.volume_number}${v.date_read ? ` · ${formatDate(v.date_read)}` : ''}</div>
        ${v.cover_image_path ? `<div class="vol-note-cover"><img data-key="${escapeHTML(v.cover_image_path)}" alt="Cover"></div>` : ''}
        <div class="vol-note-body">${bodyText}</div>
        ${metaBits.length ? `<div class="vol-note-meta">${metaBits.join(' · ')}</div>` : ''}
      </div>
    `;
  }).join('');

  fillCoverImages(dom.volList);

  dom.volList.querySelectorAll('.volume-card').forEach(card => {
    card.addEventListener('click', async () => {
      const v = state.volumes.find(vol => vol.id == card.dataset.id);
      if (v.cover_image_path) {
        v.cover_data_url = await window.api.files.getImageData(v.cover_image_path);
      }
      openVolDetail(v);
    });
  });
}

async function applyVolCoverFile(sourcePath) {
  try {
    const dest = await window.api.files.saveImage(sourcePath, 'vol');
    if (!dest) return;
    el('f-v-cover').value = dest;
    const dataUrl = await window.api.files.getImageData(dest);
    el('vol-cover-preview').innerHTML = '';
    el('vol-cover-preview').style.backgroundImage = `url('${dataUrl}')`;
  } catch (e) {
    toast(e.message || "Couldn't upload cover image", true);
  }
}

async function applySeriesCoverFile(sourcePath) {
  try {
    const dest = await window.api.files.saveImage(sourcePath, 'series');
    if (!dest) return;
    el('f-s-cover').value = dest;
    const dataUrl = await window.api.files.getImageData(dest);
    el('series-cover-preview').innerHTML = '';
    el('series-cover-preview').style.backgroundImage = `url('${dataUrl}')`;
  } catch (e) {
    toast(e.message || "Couldn't upload cover image", true);
  }
}

// ── Lightbox Modal Controller ────────────────────────────────────────────
// The lightbox markup (#image-lightbox) already exists in index.html, so
// there's no need to build it dynamically — this just wires the static
// element up once. Wiring the click listener here (rather than inside
// openLightbox, and rather than only inside a "create it if missing"
// branch) is what makes the backdrop and ✕ button actually close it,
// since the element is never "missing" in the first place.

function openLightbox(src, alt = '') {
  const lightbox = el('image-lightbox');
  const img = el('lightbox-img');
  img.src = src;
  img.alt = alt;
  lightbox.classList.add('open');
}

function closeLightbox() {
  const lightbox = el('image-lightbox');
  if (lightbox) {
    lightbox.classList.remove('open');
  }
}

// Clicking the dark backdrop or the ✕ button closes the lightbox.
el('image-lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'image-lightbox' || e.target.closest('#lightbox-close-btn')) {
    closeLightbox();
  }
});

// Global Keydown Listener for Escape Key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLightbox();
  }
});

function openVolumeModal(vol = null) {
  el('modal-volume-title').textContent = vol ? `Edit Volume ${vol.volume_number}` : 'Add Volume';
  el('f-v-number').value = vol?.volume_number || (state.volumes.length > 0 ? Math.max(...state.volumes.map(v => v.volume_number)) + 1 : 1);
  el('f-v-title').value = vol?.title || '';
  el('f-v-chapters').value = vol?.chapter_range || '';
  el('f-v-count').value = vol?.chapter_count || '';
  el('f-v-date').value = vol?.date_read || '';
  el('f-v-published').value = vol?.published_date || '';
  el('f-v-thoughts').value = vol?.thoughts || '';
  el('f-v-notes').value = vol?.chapter_notes || '';
  el('f-v-cover').value = vol?.cover_image_path || '';

  if (vol?.cover_data_url) {
    el('vol-cover-preview').innerHTML = '';
    el('vol-cover-preview').style.backgroundImage = `url('${vol.cover_data_url}')`;
  } else if (vol?.cover_image_path) {
    el('vol-cover-preview').innerHTML = '';
    el('vol-cover-preview').style.backgroundImage = 'none';
    window.api.files.getImageData(vol.cover_image_path).then(dataUrl => {
      if (dataUrl) el('vol-cover-preview').style.backgroundImage = `url('${dataUrl}')`;
    });
  } else {
    el('vol-cover-preview').innerHTML = '<span>Click to add cover</span>';
    el('vol-cover-preview').style.backgroundImage = 'none';
  }

  openModal('overlay-volume');
  refreshCharCounters('f-v-title', 'f-v-chapters', 'f-v-thoughts', 'f-v-notes');
  el('f-v-number').focus();
}

async function saveVolume() {
  const d = {
    series_id: state.currentSeries.id,
    volume_number: parseInt(el('f-v-number').value),
    title: el('f-v-title').value.trim(),
    chapter_range: el('f-v-chapters').value.trim(),
    chapter_count: parseInt(el('f-v-count').value) || null,
    date_read: el('f-v-date').value || null,
    published_date: el('f-v-published').value || null,
    thoughts: el('f-v-thoughts').value.trim(),
    chapter_notes: el('f-v-notes').value.trim(),
    cover_image_path: el('f-v-cover').value || null,
  };

  if (!d.volume_number) return toast('Volume number is required', true);

  if (el('modal-volume-title').textContent.includes('Edit')) {
    await window.api.volumes.update(state.currentVolume.id, d);
    toast('Volume updated');
  } else {
    await window.api.volumes.create(d);
    toast('Volume added');
  }
  closeModal('overlay-volume');
  closeModal('overlay-vol-detail');
  loadSeriesData(state.currentSeries.id);
}

function openVolDetail(v) {
  state.currentVolume = v;
  el('vol-detail-heading').textContent = `Volume ${v.volume_number}${v.title ? `: ${v.title}` : ''}`;

  const coverSrc = v.cover_data_url || null;

  let html = `<div class="vol-detail-content">`;
  if (coverSrc) {
    html += `<div class="vol-detail-left"><img src="${coverSrc}" class="vol-detail-cover"></div>`;
  } else if (v.cover_image_path) {
    html += `<div class="vol-detail-left"><img data-key="${escapeHTML(v.cover_image_path)}" class="vol-detail-cover"></div>`;
  }

  html += `<div class="vol-detail-right">
    <div class="vol-detail-meta">
      ${v.chapter_range ? `<span>🔖 ${escapeHTML(v.chapter_range)}</span>` : ''}
      ${v.chapter_count ? `<span>📑 ${v.chapter_count} Chapters</span>` : ''}
      ${v.date_read ? `<span>📅 Read: ${formatDate(v.date_read)}</span>` : ''}
      ${v.published_date ? `<span>🗓️ Published: ${formatDate(v.published_date)}</span>` : ''}
    </div>
  `;

  if (v.thoughts) {
    html += `<div class="vol-detail-section"><h4>Thoughts</h4><div class="vol-detail-text">${nl2br(v.thoughts)}</div></div>`;
  }
  if (v.chapter_notes) {
    html += `<div class="vol-detail-section"><h4>Chapter Notes</h4><div class="vol-detail-text">${nl2br(v.chapter_notes)}</div></div>`;
  }

  html += `</div></div>`;

  el('vol-detail-body').innerHTML = html;
  fillCoverImages(el('vol-detail-body'));
  openModal('overlay-vol-detail');
}

// ─── Characters ───────────────────────────────────────────────────────────────

function renderCharacters() {
  if (state.characters.length === 0) {
    dom.charGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><h3>No characters yet</h3></div>`;
    return;
  }

  dom.charGrid.innerHTML = state.characters.map(c => `
    <div class="character-card" data-id="${c.id}">
      <div class="char-avatar">
        ${c.profile_image_path ? `<img data-key="${escapeHTML(c.profile_image_path)}" alt="${escapeHTML(c.name)}">` : `<span class="char-avatar-fallback">${c.name.charAt(0).toUpperCase()}</span>`}
      </div>
      <div class="char-name">${escapeHTML(c.name)}</div>
      <div class="char-role ${c.role.toLowerCase()}">${escapeHTML(c.role)}</div>
    </div>
  `).join('');

  fillCoverImages(dom.charGrid);

  dom.charGrid.querySelectorAll('.character-card').forEach(card => {
    card.addEventListener('click', async () => {
      const c = state.characters.find(char => char.id == card.dataset.id);
      if (c.profile_image_path) {
        c.profile_data_url = await window.api.files.getImageData(c.profile_image_path);
      }
      openCharDrawer(c);
    });
  });
}

// List view of the same character data — compact rows instead of avatar
// tiles, useful for series with a large cast.
function renderCharactersList() {
  const list = dom.charList;
  if (state.characters.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>No characters yet</h3></div>`;
    return;
  }

  list.innerHTML = state.characters.map(c => `
    <div class="character-list-row" data-id="${c.id}">
      <div class="character-list-avatar">
        ${c.profile_image_path ? `<img data-key="${escapeHTML(c.profile_image_path)}" alt="${escapeHTML(c.name)}">` : `<span class="char-avatar-fallback">${c.name.charAt(0).toUpperCase()}</span>`}
      </div>
      <div class="character-list-info">
        <div class="character-list-name">${escapeHTML(c.name)}</div>
        <div class="character-list-meta">${c.volume_appearances ? escapeHTML(c.volume_appearances) : 'No volume appearances noted'}</div>
      </div>
      <span class="char-role ${c.role.toLowerCase()}">${escapeHTML(c.role)}</span>
    </div>
  `).join('');

  fillCoverImages(list);

  list.querySelectorAll('.character-list-row').forEach(row => {
    row.addEventListener('click', async () => {
      const c = state.characters.find(char => char.id == row.dataset.id);
      if (c.profile_image_path) {
        c.profile_data_url = await window.api.files.getImageData(c.profile_image_path);
      }
      openCharDrawer(c);
    });
  });
}

// Shows whichever of the grid/list matches state.charViewMode (and keeps
// the toggle buttons' active state in sync). Safe to call any time the
// characters pane's content changes, regardless of which tab is active.
function applyCharViewMode() {
  const isList = state.charViewMode === 'list';
  dom.charGrid.classList.toggle('hidden', isList);
  dom.charList.classList.toggle('hidden', !isList);
  el('btn-view-char-grid').classList.toggle('active', !isList);
  el('btn-view-char-list').classList.toggle('active', isList);
}

async function setCharViewMode(mode) {
  if (mode === state.charViewMode) return;
  state.charViewMode = mode;
  applyCharViewMode();
  await window.api.settings.set('charViewMode', mode);
}

async function applyCharImgFile(sourcePath) {
  try {
    const dest = await window.api.files.saveImage(sourcePath, 'char');
    if (!dest) return;
    el('f-c-img').value = dest;
    const dataUrl = await window.api.files.getImageData(dest);
    el('char-img-preview').innerHTML = '';
    el('char-img-preview').style.backgroundImage = `url('${dataUrl}')`;
  } catch (e) {
    toast(e.message || "Couldn't upload photo", true);
  }
}

function openCharModal(char = null) {
  el('modal-char-title').textContent = char ? 'Edit Character' : 'Add Character';
  el('f-c-name').value = char?.name || '';
  el('f-c-role').value = char?.role || 'Side';
  el('f-c-vols').value = char?.volume_appearances || '';
  el('f-c-notes').value = char?.notes || '';
  el('f-c-img').value = char?.profile_image_path || '';

  if (char?.profile_data_url) {
    el('char-img-preview').innerHTML = '';
    el('char-img-preview').style.backgroundImage = `url('${char.profile_data_url}')`;
  } else if (char?.profile_image_path) {
    el('char-img-preview').innerHTML = '';
    el('char-img-preview').style.backgroundImage = 'none';
    window.api.files.getImageData(char.profile_image_path).then(dataUrl => {
      if (dataUrl) el('char-img-preview').style.backgroundImage = `url('${dataUrl}')`;
    });
  } else {
    el('char-img-preview').innerHTML = '<span>Photo</span>';
    el('char-img-preview').style.backgroundImage = 'none';
  }

  openModal('overlay-character');
  refreshCharCounters('f-c-name', 'f-c-vols', 'f-c-notes');
  el('f-c-name').focus();
}

async function saveCharacter() {
  const d = {
    series_id: state.currentSeries.id,
    name: el('f-c-name').value.trim(),
    role: el('f-c-role').value,
    volume_appearances: el('f-c-vols').value.trim(),
    notes: el('f-c-notes').value.trim(),
    profile_image_path: el('f-c-img').value || null,
  };

  if (!d.name) return toast('Name is required', true);

  if (el('modal-char-title').textContent.includes('Edit')) {
    await window.api.characters.update(state.currentCharacter.id, d);
    toast('Character updated');
  } else {
    await window.api.characters.create(d);
    toast('Character added');
  }
  closeModal('overlay-character');
  loadSeriesData(state.currentSeries.id);
}

async function openCharDrawer(c) {
  state.currentCharacter = c;
  const coverSrc = c.profile_data_url
    || (c.profile_image_path ? await window.api.files.getImageData(c.profile_image_path) : null);

  dom.drawerBody.innerHTML = `
    <div class="drawer-profile-header">
      <div class="drawer-avatar" style="${coverSrc ? `background-image: url('${coverSrc}')` : ''}">
        ${!coverSrc ? `<span class="char-avatar-fallback" style="font-size:48px; line-height:120px">${c.name.charAt(0).toUpperCase()}</span>` : ''}
      </div>
      <div class="drawer-name">${escapeHTML(c.name)}</div>
      <div class="char-role ${c.role.toLowerCase()}">${escapeHTML(c.role)}</div>
    </div>
    
    ${c.volume_appearances ? `
      <div class="drawer-meta-block">
        <div class="drawer-meta-label">Appears In</div>
        <div class="drawer-meta-value">${escapeHTML(c.volume_appearances)}</div>
      </div>
    ` : ''}
    
    ${c.notes ? `
      <div class="drawer-meta-block">
        <div class="drawer-meta-label">Notes</div>
        <div class="drawer-meta-value">${nl2br(c.notes)}</div>
      </div>
    ` : ''}
  `;

  renderDrawerRels();
  el('drawer-overlay').classList.remove('hidden');
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

function renderGallery() {
  if (state.galleryImages.length === 0) {
    dom.galleryGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1"><h3>No pictures yet</h3><p>Add photos, fan art, or other images related to this title.</p></div>`;
    return;
  }

  dom.galleryGrid.innerHTML = state.galleryImages.map(g => `
    <div class="gallery-card" data-id="${g.id}" draggable="true">
      <img class="gallery-card-img" data-key="${escapeHTML(g.image_path)}" alt="${escapeHTML(g.caption || '')}">
      ${g.caption ? `<div class="gallery-card-caption">${escapeHTML(g.caption)}</div>` : ''}
    </div>
  `).join('');
  fillCoverImages(dom.galleryGrid);

  dom.galleryGrid.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('click', () => {
      const g = state.galleryImages.find(img => img.id == card.dataset.id);
      if (g) openGalleryDetail(g);
    });
    setupGalleryReorderDrag(card);
  });
}

// Internal drag-to-reorder for gallery cards. Kept separate from
// setupMultiDropZone (which handles OS files dropped in from outside) by
// stopping propagation on card-level drop/dragover so the two don't fight
// over the same 'drop' event — one moves an existing card, the other adds
// new files.
function setupGalleryReorderDrag(card) {
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/gallery-id', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/gallery-id')) return; // let file drops fall through to the grid
    e.preventDefault();
    e.stopPropagation();
    card.classList.add('drag-over-target');
  });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over-target'));
  card.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.types.includes('text/gallery-id')) return;
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('drag-over-target');
    const draggedId = parseInt(e.dataTransfer.getData('text/gallery-id'));
    const targetId = parseInt(card.dataset.id);
    if (draggedId === targetId) return;
    await reorderGalleryImages(draggedId, targetId);
  });
}

async function reorderGalleryImages(draggedId, targetId) {
  const ids = state.galleryImages.map(g => g.id);
  const fromIdx = ids.indexOf(draggedId);
  const toIdx = ids.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);

  // Reorder in-memory first so the UI updates instantly, then persist.
  const byId = Object.fromEntries(state.galleryImages.map(g => [g.id, g]));
  state.galleryImages = ids.map(id => byId[id]);
  renderGallery();
  await window.api.gallery.reorder(ids);
}

async function addGalleryImages(paths) {
  let added = 0;
  const failures = [];
  for (const p of paths) {
    try {
      const dest = await window.api.files.saveImage(p, 'gallery');
      if (dest) {
        await window.api.gallery.add({ series_id: state.currentSeries.id, image_path: dest, caption: '' });
        added++;
      }
    } catch (e) {
      failures.push(e.message || 'Upload failed');
    }
  }
  if (added > 0) toast(added > 1 ? `${added} pictures added` : 'Picture added');
  if (failures.length > 0) toast(failures[0], true);
  await loadSeriesData(state.currentSeries.id);
}

async function openGalleryDetail(g) {
  state.currentGalleryImage = g;
  const imgEl = el('gallery-detail-img');
  imgEl.src = ''; // clear previous image while the new one loads
  openModal('overlay-gallery-detail');
  el('f-gallery-caption').value = g.caption || '';
  refreshCharCounters('f-gallery-caption');
  const dataUrl = await window.api.files.getImageData(g.image_path);
  if (dataUrl) imgEl.src = dataUrl;
}

// ─── Files ────────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Extension → category, and category → icon glyph. Anything not listed
// falls back to the generic document icon with its extension as a small
// badge, rather than every file type showing raw extension text.
const FILE_EXT_CATEGORY = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', heic: 'image',
  mp3: 'audio', wav: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', numbers: 'sheet',
  ppt: 'presentation', pptx: 'presentation', key: 'presentation',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code', json: 'code', html: 'code', css: 'code', sh: 'code', java: 'code', c: 'code', cpp: 'code', go: 'code', rs: 'code',
  pdf: 'pdf', doc: 'doc', docx: 'doc', rtf: 'doc', txt: 'doc', md: 'doc',
};

const FILE_ICON_PATHS = {
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  archive: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
  presentation: '<rect x="2" y="4" width="20" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  generic: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
};

function fileCategory(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  return FILE_EXT_CATEGORY[ext] || 'generic';
}

function fileIconSvg(category, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FILE_ICON_PATHS[category] || FILE_ICON_PATHS.generic}</svg>`;
}

async function addAttachmentFiles(paths) {
  let added = 0;
  const failures = [];
  for (const p of paths) {
    try {
      await window.api.attachments.add(state.currentSeries.id, p);
      added++;
    } catch (e) {
      failures.push(e.message || 'Upload failed');
    }
  }
  if (added > 0) toast(added > 1 ? `${added} files added` : 'File added');
  if (failures.length > 0) toast(failures[0], true);
  await loadSeriesData(state.currentSeries.id);
}

function renderFiles() {
  if (state.attachments.length === 0) {
    dom.filesList.innerHTML = `<div class="empty-state"><h3>No files yet</h3><p>Attach PDFs, notes, or other files related to this title.</p></div>`;
    return;
  }

  dom.filesList.innerHTML = state.attachments.map(f => {
    const category = fileCategory(f.file_name);
    const ext = (f.file_name.split('.').pop() || '?').toUpperCase();
    return `
      <div class="file-row" data-id="${f.id}">
        <div class="file-icon file-icon-${category}" data-category="${category}" data-path="${escapeHTML(f.file_path)}">
          ${category === 'generic'
        ? `${fileIconSvg('generic')}<span class="file-icon-ext">${escapeHTML(ext.slice(0, 4))}</span>`
        : fileIconSvg(category)}
        </div>
        <div class="file-info">
          <div class="file-name">${escapeHTML(f.file_name)}</div>
          <div class="file-meta">${formatFileSize(f.file_size)} · Added ${formatDate(f.created_at)}</div>
        </div>
        <div class="file-actions">
          <button class="btn btn-ghost btn-sm file-open-btn" data-id="${f.id}">Open</button>
          <button class="btn btn-danger-ghost btn-sm file-delete-btn" data-id="${f.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Image attachments get a real thumbnail instead of the generic image
  // glyph, loaded async since reading the file is an IPC round-trip.
  dom.filesList.querySelectorAll('.file-icon[data-category="image"]').forEach(async (iconEl) => {
    const dataUrl = await window.api.files.getImageData(iconEl.dataset.path);
    if (dataUrl) {
      iconEl.innerHTML = '';
      iconEl.style.backgroundImage = `url('${dataUrl}')`;
      iconEl.classList.add('file-icon-thumb');
    }
  });

  dom.filesList.querySelectorAll('.file-open-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const f = state.attachments.find(x => x.id == btn.dataset.id);
      if (f) {
        const opened = await window.api.attachments.open(f.file_path);
        if (!opened) toast("Couldn't open file", true);
      }
    });
  });
  dom.filesList.querySelectorAll('.file-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = state.attachments.find(x => x.id == btn.dataset.id);
      if (!f) return;
      confirmDelete(`Delete "${f.file_name}"?`, async () => {
        await window.api.attachments.delete(f.id);
        toast('File deleted');
        await loadSeriesData(state.currentSeries.id);
      });
    });
  });
}

// ─── Relationships ────────────────────────────────────────────────────────────

function renderDrawerRels() {
  const cId = state.currentCharacter.id;
  const rels = state.relationships.filter(r =>
    r.from_character_id === cId || (r.is_bidirectional && r.to_character_id === cId)
  );

  if (rels.length === 0) {
    dom.drawerRels.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0;">No relationships yet.</div>';
    return;
  }

  dom.drawerRels.innerHTML = rels.map(r => {
    const isFromMe = r.from_character_id === cId;
    const targetName = isFromMe ? r.to_name : r.from_name;
    const arrow = r.is_bidirectional ? '↔' : (isFromMe ? '→' : '←');

    return `
      <div class="rel-list-item" data-id="${r.id}">
        <div class="rel-list-header">
          <span><span style="color:var(--text-muted)">${arrow}</span> <span class="rel-target">${escapeHTML(targetName)}</span></span>
          <span class="rel-list-actions">
            <span class="rel-type ${relCategory(r).toLowerCase()}">${escapeHTML(relLabel(r))}</span>
            <button class="rel-edit-btn" data-id="${r.id}" title="Edit relationship">✎</button>
            <button class="rel-delete-btn" data-id="${r.id}" title="Delete relationship">✕</button>
          </span>
        </div>
        ${r.notes ? `<div class="rel-notes">${escapeHTML(r.notes)}</div>` : ''}
      </div>
    `;
  }).join('');

  dom.drawerRels.querySelectorAll('.rel-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rel = state.relationships.find(r => r.id == btn.dataset.id);
      if (rel) openRelModal(rel);
    });
  });
  dom.drawerRels.querySelectorAll('.rel-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rel = state.relationships.find(r => r.id == btn.dataset.id);
      if (!rel) return;
      confirmDelete('Delete this relationship?', async () => {
        await window.api.relationships.delete(rel.id);
        toast('Relationship deleted');
        await loadSeriesData(state.currentSeries.id);
        if (!el('overlay-graph').classList.contains('hidden')) showGraph();
        if (state.currentCharacter) openCharDrawer(state.currentCharacter);
      });
    });
  });
}

function openRelModal(rel = null) {
  if (state.characters.length < 2) return toast('Need at least 2 characters to create a relationship', true);

  state.currentRelationship = rel;
  el('modal-rel-title').textContent = rel ? 'Edit Relationship' : 'Add Relationship';

  const fromPicker = el('f-r-from');
  const toPicker = el('f-r-to');

  const renderPicker = (container, selectedId, hiddenInputId) => {
    container.innerHTML = state.characters.map(c =>
      `<div class="char-picker-item ${c.id === selectedId ? 'active' : ''}" data-id="${c.id}">${escapeHTML(c.name)}</div>`
    ).join('');

    container.querySelectorAll('.char-picker-item').forEach(item => {
      item.addEventListener('click', (e) => {
        container.querySelectorAll('.char-picker-item').forEach(i => i.classList.remove('active'));
        e.target.classList.add('active');
        el(hiddenInputId).value = e.target.dataset.id;
      });
    });
    el(hiddenInputId).value = selectedId;
  };

  let initialFrom = rel ? rel.from_character_id
    : (state.currentCharacter ? state.currentCharacter.id : state.characters[0].id);
  let initialTo = rel ? rel.to_character_id
    : (state.characters.find(c => c.id !== initialFrom)?.id || state.characters[1].id);

  renderPicker(fromPicker, initialFrom, 'f-r-from-val');
  renderPicker(toPicker, initialTo, 'f-r-to-val');

  const category = rel ? relCategory(rel) : 'Friend';

  document.querySelectorAll('#f-r-type .type-chip').forEach(c => c.classList.remove('active'));
  const activeChip = document.querySelector(`#f-r-type .type-chip[data-type="${category}"]`) || document.querySelector('#f-r-type .type-chip[data-type="Friend"]');
  activeChip.classList.add('active');
  el('f-r-type-val').value = category;

  // Custom label: a saved label wins; otherwise, if this relationship
  // predates custom labels and its type wasn't a fixed category, carry
  // that old free-text value over as the label so it isn't lost.
  el('f-r-label').value = rel ? (rel.label || (REL_CATEGORIES.includes(rel.type) ? '' : rel.type)) : '';

  el('f-r-bidir').checked = rel ? !!rel.is_bidirectional : true;
  el('f-r-notes').value = rel?.notes || '';

  openModal('overlay-relationship');
  refreshCharCounters('f-r-label', 'f-r-notes');
}

async function saveRelationship() {
  const d = {
    from_character_id: parseInt(el('f-r-from-val').value),
    to_character_id: parseInt(el('f-r-to-val').value),
    type: el('f-r-type-val').value,
    label: el('f-r-label').value.trim() || null,
    is_bidirectional: el('f-r-bidir').checked ? 1 : 0,
    notes: el('f-r-notes').value.trim()
  };

  if (d.from_character_id === d.to_character_id) return toast('Characters must be different', true);

  if (state.currentRelationship) {
    await window.api.relationships.update(state.currentRelationship.id, d);
    toast('Relationship updated');
  } else {
    await window.api.relationships.create(d);
    toast('Relationship added');
  }
  state.currentRelationship = null;
  closeModal('overlay-relationship');
  await loadSeriesData(state.currentSeries.id);
  if (!el('overlay-graph').classList.contains('hidden')) showGraph();
  if (!el('drawer-overlay').classList.contains('hidden') && state.currentCharacter) openCharDrawer(state.currentCharacter);
}

// ─── Graph (vis.js) ───────────────────────────────────────────────────────────

const typeColors = {
  Friend: { border: '#00b894', background: '#00b894' },
  Rival: { border: '#ff9f43', background: '#ff9f43' },
  Family: { border: '#0984e3', background: '#0984e3' },
  Enemy: { border: '#d63031', background: '#d63031' },
  Romance: { border: '#fd79a8', background: '#fd79a8' },
  Mentor: { border: '#6c5ce7', background: '#6c5ce7' },
  Other: { border: '#b2bec3', background: '#b2bec3' }
};

async function showGraph() {
  openModal('overlay-graph');

  // Pull current theme colors so the graph matches light/dark mode instead
  // of being hardcoded to the light palette.
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const cText = cssVar('--text-main') || '#232B24';
  const cSurface = cssVar('--surface') || '#FAF9F5';
  const cSurfaceHover = cssVar('--surface-hover') || '#EBE7DA';
  const cMuted = cssVar('--text-muted') || '#5E6660';
  const cBg = cssVar('--bg-color') || '#F2EFE6';
  const cProtagonist = cssVar('--role-protagonist') || '#328dc6ff';
  const cAntagonist = cssVar('--role-antagonist') || '#e05c5cff';

  // Legend
  el('graph-legend').innerHTML = Object.entries(typeColors).map(([k, v]) => `
    <div class="legend-item"><div class="legend-color" style="background:${v.background}"></div>${k}</div>
  `).join('');

  // Data — characters with a saved photo render as a circular portrait;
  // everyone else falls back to the plain colored dot.
  const nodes = await Promise.all(state.characters.map(async c => {
    const roleColor = c.role === 'Protagonist' ? cProtagonist : (c.role === 'Antagonist' ? cAntagonist : cMuted);
    const imageUrl = c.profile_image_path ? await window.api.files.getImageData(c.profile_image_path) : null;

    if (imageUrl) {
      return {
        id: c.id,
        label: c.name,
        shape: 'circularImage',
        image: imageUrl,
        brokenImage: undefined,
        size: c.role === 'Protagonist' ? 26 : (c.role === 'Antagonist' ? 22 : 18),
        borderWidth: 3,
        borderWidthSelected: 4,
        color: {
          border: roleColor,
          highlight: { border: '#DA9DF5', background: cSurfaceHover }
        },
        font: { color: cText, face: 'Fraunces', size: 14 }
      };
    }

    return {
      id: c.id,
      label: c.name,
      shape: 'dot',
      size: c.role === 'Protagonist' ? 24 : (c.role === 'Antagonist' ? 20 : 16),
      color: {
        background: cSurface,
        border: roleColor,
        highlight: { border: '#DA9DF5', background: cSurfaceHover }
      },
      font: { color: cText, face: 'Fraunces', size: 14 }
    };
  }));

  const edges = [];
  const pairSeen = {};
  state.relationships.forEach(r => {
    const category = relCategory(r);
    const c = typeColors[category];
    const key = [r.from_character_id, r.to_character_id].sort((a, b) => a - b).join('-');
    const idx = pairSeen[key] || 0;
    pairSeen[key] = idx + 1;

    // First edge between a pair is straight; any additional ones between
    // the same two characters are curved (alternating sides) so they
    // don't render on top of each other and disappear from view.
    const smooth = idx === 0
      ? false
      : { type: idx % 2 === 1 ? 'curvedCW' : 'curvedCCW', roundness: 0.2 + Math.floor((idx - 1) / 2) * 0.2 };

    edges.push({
      id: r.id,
      from: r.from_character_id,
      to: r.to_character_id,
      arrows: r.is_bidirectional ? 'to, from' : 'to',
      label: relLabel(r),
      font: { align: 'middle', size: 10, face: 'IBM Plex Mono', background: cBg, color: cMuted, strokeWidth: 0 },
      color: { color: c.border, highlight: '#A6803C', opacity: 0.8 },
      width: 2,
      smooth
    });
  });

  const data = { nodes, edges };
  const options = {
    interaction: { hover: true, tooltipDelay: 200 },
    physics: {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springLength: 100, springConstant: 0.08 }
    }
  };

  if (state.graphNetwork) state.graphNetwork.destroy();
  state.graphNetwork = new vis.Network(dom.graphContainer, data, options);

  state.graphNetwork.on('click', (params) => {
    if (params.nodes.length > 0) {
      const c = state.characters.find(char => char.id == params.nodes[0]);
      if (c) openCharDrawer(c);
    } else if (params.edges.length > 0) {
      const rel = state.relationships.find(r => r.id === params.edges[0]);
      if (rel) openRelModal(rel);
    }
  });
}

// ─── Auth Gate ────────────────────────────────────────────────────────────

function showApp() {
  el('auth-gate').classList.add('hidden');
  el('app').classList.remove('hidden');
}

async function boot() {
  const user = await window.api.auth.currentUser();
  if (user) {
    showApp();
    await init();
  }
  // else: leave the auth-gate visible, its form is wired below.
}

let authMode = 'signin'; // or 'signup'

el('btn-auth-toggle').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  el('btn-auth-submit').textContent = authMode === 'signin' ? 'Sign In' : 'Sign Up';
  el('btn-auth-toggle').textContent = authMode === 'signin' ? 'Need an account? Sign Up' : 'Have an account? Sign In';
  el('auth-gate-status').textContent = '';
});

el('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = el('auth-username').value.trim();
  const password = el('auth-password').value;
  el('auth-gate-status').textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';

  const result = authMode === 'signin'
    ? await window.api.auth.signIn(username, password)
    : await window.api.auth.signUp(username, password);

  if (result.ok) {
    showApp();
    await init();
  } else {
    el('auth-gate-status').textContent = result.error;
  }
});

// ─── Run ──────────────────────────────────────────────────────────────────────
boot();