// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  series: [],
  currentSeries: null,
  volumes: [],
  characters: [],
  relationships: [],
  galleryImages: [],
  attachments: [],
  linkAttachments: [],
  currentGalleryImage: null,
  allTags: [],
  selectedTags: [],
  allBookTypes: [], // custom book types the signed-in user has used, across all of THEIR OWN categories — never shared across accounts (see loadBookTypes)
  allFandoms: [], // same idea, but for the Fandom field (only relevant when Book Type is "Fanfic")
  selectedFandoms: [], // working chip list while the series form is open — mirrors selectedTags/selectedWarnings
  selectedGenres: [],
  allWarnings: [],
  selectedWarnings: [],
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
  filterFandoms: [],
  filterLanguages: [],
  filterCountries: [],
  filterAuthors: [],
  filterArtists: [],
  filterPublishers: [],
  filterTranslated: [],
  filterNsfw: [],
  allSeriesRaw: [], // unfiltered (library-scoped) series list — source for client-side filtering + facet lists
  searchQuery: '',
  graphNetwork: null,
  seriesGroups: [],  // umbrella groups/shared universes for the current library
  editingGroup: null,
  groupItems: [],    // working item list (series_id/title/group_role) while the group modal is open
  libraries: [],
  currentLibraryId: null,
  editingLibrary: null,
  selectedNavIcon: 'grid',
  selectedNavIconImage: null,
  theme: 'dark',
  autoHideSidebar: false,  // boolean — persisted via settings (autoHideSidebar)
  showNsfwContent: true,   // boolean — persisted via settings (showNsfwContent); default true so nothing hides for existing users until they opt out
  groupsSectionCollapsed: false, // boolean — persisted via settings (groupsSectionCollapsed)
  charDrawerRelsCollapsed: false, // boolean — persisted via settings (charRelsSectionCollapsed)
  currentUser: null,       // current signed in user
  seriesViewMode: 'table', // 'table' | 'card' — persisted via settings
  charViewMode: 'grid',    // 'grid' | 'list' — persisted via settings
  sortField: 'title',      // 'title' | 'author' | 'rating' | 'year_published' | 'date_started' | 'date_finished' — persisted via settings
  sortDir: 'asc',          // 'asc' | 'desc' — persisted via settings
  currentView: 'library',  // 'library' | 'series' | 'stats' — kept in sync by switchView()
  defaultStartView: 'last', // 'last' | 'stats' | 'lib:<id>' — persisted via settings (defaultStartView)
  lastOpenedLibraryId: null, // persisted via settings (lastOpenedLibraryId) — used when defaultStartView === 'last'
  statsAllSeries: [],      // cached from the last loadStats() call, for re-rendering the hero after editing the goal
  statsEvents: [],         // cached per-volume/standalone read events for the current stats session
  statsGoal: null,         // annual reading goal — persisted via settings ('annualReadingGoal'); null = not set yet
  statsSelectedYear: null, // Reading Timeline Distribution controls
  statsSelectedMonth: 'all', // 'all' | 1-12
  volNotesEntries: [],     // working list of Chapter Notes timeline entries while the volume modal is open
  standaloneNotesEntries: [], // working list of Chapter Notes timeline entries while the standalone thoughts modal is open
};

// ─── Elements ─────────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);

const views = {
  library: el('view-library'),
  series: el('view-series'),
  stats: el('view-stats'),
};

const dom = {
  tbody: el('series-tbody'),
  search: el('search-input'),
  seriesCount: el('series-count'),
  emptyState: el('empty-state'),

  heroTop: el('series-hero-top'),
  heroDetails: el('series-hero-details'),
  heroDetailsLeft: el('hero-details-left'),
  heroDetailsRight: el('hero-details-right'),
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

  warningWrap: el('warning-input-wrap'),
  warningInput: el('f-s-warnings'),
  warningDropdown: el('warning-dropdown'),
  warningChips: el('warning-chips'),

  fandomWrap: el('fandom-input-wrap'),
  fandomInput: el('f-s-fandom'),
  fandomDropdown: el('fandom-dropdown'),
  fandomChips: el('fandom-chips'),

  groupsSection: el('series-groups-section'),
  groupsList: el('series-groups-list'),
  groupsCount: el('groups-count'),

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

function parseTimelineEntries(text) {
  return (text || '')
    .split(/\n\s*\n/)
    .map(e => e.trim())
    .filter(Boolean);
}

function parseFandomList(str) {
  return (str || '').split(',').map(f => f.trim()).filter(Boolean);
}

function renderChapterNotesTimeline(text) {
  const entries = parseTimelineEntries(text);
  if (entries.length === 0) return '';

  return `
    <div class="timeline-notes">
      ${entries.map(entry => `
        <div class="timeline-item">
          <div class="timeline-marker">
            <span class="timeline-dot"></span>
            <span class="timeline-line"></span>
          </div>
          <div class="timeline-card">${nl2br(entry)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Chapter Notes Timeline — Input Side (shared: Volumes + Standalone) ──
// Both the volume form's Chapter Notes and the standalone form's Chapter
// Notes build the same way — one note at a time, each becoming its own
// timeline node. `stateKey` points at which working array to use
// (volNotesEntries or standaloneNotesEntries), `listId`/`hiddenId`/
// `counterId` are that form's own element ids.
const MAX_CHAPTER_NOTES_LENGTH = 20000;

function renderTimelineNotesInput(stateKey, listId, hiddenId, counterId) {
  const entries = state[stateKey];
  const list = el(listId);
  if (entries.length === 0) {
    list.innerHTML = `<div class="timeline-input-empty">No notes added yet — write one below and click "+ Add to Timeline".</div>`;
  } else {
    list.innerHTML = entries.map((entry, i) => `
      <div class="timeline-input-item">
        <div class="timeline-marker">
          <span class="timeline-dot"></span>
          <span class="timeline-line"></span>
        </div>
        <div class="timeline-input-card">
          <span>${nl2br(entry)}</span>
          <button type="button" class="timeline-input-remove" data-index="${i}" title="Remove">✕</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.timeline-input-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        state[stateKey].splice(parseInt(btn.dataset.index), 1);
        renderTimelineNotesInput(stateKey, listId, hiddenId, counterId);
      });
    });
  }

  const combined = entries.join('\n\n');
  el(hiddenId).value = combined;
  const counter = el(counterId);
  if (counter) {
    counter.textContent = `${combined.length} / ${MAX_CHAPTER_NOTES_LENGTH}`;
    counter.classList.toggle('char-counter-warn', combined.length >= MAX_CHAPTER_NOTES_LENGTH * 0.9 && combined.length < MAX_CHAPTER_NOTES_LENGTH);
    counter.classList.toggle('char-counter-max', combined.length >= MAX_CHAPTER_NOTES_LENGTH);
  }
}

function addTimelineNoteEntry(stateKey, inputId, listId, hiddenId, counterId) {
  const input = el(inputId);
  const text = input.value.trim();
  if (!text) return;
  state[stateKey].push(text);
  input.value = '';
  renderTimelineNotesInput(stateKey, listId, hiddenId, counterId);
  input.focus();
}

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
  wireCharCounter('f-v-title', 300);
  wireCharCounter('f-v-chapters', 200);
  wireCharCounter('f-v-thoughts', 20000);
  wireCharCounter('f-c-name', 200);
  wireCharCounter('f-c-vols', 300);
  wireCharCounter('f-c-appears', 2000);
  wireCharCounter('f-c-reality', 2000);
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
    // Prefer the category the person was last in (if it still exists)
    // over just always defaulting to the first one in the list — this is
    // what makes "Last Opened Category" mean something across relaunches.
    const preferred = (state.lastOpenedLibraryId && state.libraries.some(l => l.id === state.lastOpenedLibraryId))
      ? state.lastOpenedLibraryId
      : state.libraries[0]?.id ?? null;
    state.currentLibraryId = preferred;
  }
  renderSidebarNav();
  applyCurrentLibraryHeader();
}

function renderSidebarNav() {
  dom.sidebarNavList.innerHTML = state.libraries.map(lib => `
    <div class="nav-item-wrap" draggable="true" data-lib-id="${lib.id}">
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
  dom.sidebarNavList.querySelectorAll('.nav-item-wrap').forEach(setupCategoryReorderDrag);
}

// Internal drag-to-reorder for sidebar categories — same pattern as
// setupGalleryReorderDrag (Gallery tab), scoped to the whole
// .nav-item-wrap row (icon + name button + pencil) so there's a generous
// drag target without needing a dedicated drag-handle icon. The nested
// buttons keep working normally (a plain click never triggers a drag).
function setupCategoryReorderDrag(wrap) {
  wrap.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/library-id', wrap.dataset.libId);
    e.dataTransfer.effectAllowed = 'move';
    wrap.classList.add('dragging');
  });
  wrap.addEventListener('dragend', () => wrap.classList.remove('dragging'));
  wrap.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/library-id')) return;
    e.preventDefault();
    wrap.classList.add('drag-over-target');
  });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('drag-over-target'));
  wrap.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.types.includes('text/library-id')) return;
    e.preventDefault();
    wrap.classList.remove('drag-over-target');
    const draggedId = parseInt(e.dataTransfer.getData('text/library-id'));
    const targetId = parseInt(wrap.dataset.libId);
    if (draggedId === targetId) return;
    await reorderCategories(draggedId, targetId);
  });
}

async function reorderCategories(draggedId, targetId) {
  const ids = state.libraries.map(l => l.id);
  const fromIdx = ids.indexOf(draggedId);
  const toIdx = ids.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);

  // Reorder in-memory first so the sidebar updates instantly, then
  // persist — same "optimistic update, then IPC" pattern as
  // reorderGalleryImages.
  const byId = Object.fromEntries(state.libraries.map(l => [l.id, l]));
  state.libraries = ids.map(id => byId[id]);
  renderSidebarNav();
  await window.api.libraries.reorder(ids);
}

function applyCurrentLibraryHeader() {
  const lib = state.libraries.find(l => l.id === state.currentLibraryId);
  dom.libraryTitle.textContent = lib ? lib.name : 'Library';
}

async function switchLibrary(id) {
  if (id === state.currentLibraryId && state.currentView === 'library') {
    if (state.autoHideSidebar) {
      el('sidebar')?.classList.remove('sidebar-visible');
      el('sidebar-backdrop')?.classList.remove('active');
    }
    return;
  }
  el('btn-nav-stats')?.classList.remove('active');
  state.currentLibraryId = id;
  state.lastOpenedLibraryId = id;
  renderSidebarNav();
  applyCurrentLibraryHeader();
  showLibrary();
  await window.api.settings.set('lastOpenedLibraryId', String(id));
  if (state.autoHideSidebar) {
    el('sidebar')?.classList.remove('sidebar-visible');
    el('sidebar-backdrop')?.classList.remove('active');
  }
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

// Populates the Default Start View dropdown — options are fixed (Last
// Opened Category, Reading Statistics) plus one entry per existing
// category, so "pin to a specific category" always reflects the current
// category list rather than going stale.
function renderDefaultStartViewOptions() {
  const select = el('setting-default-start-view');
  if (!select) return;
  const options = [
    { value: 'last', label: 'Last Opened Category' },
    { value: 'stats', label: 'Reading Statistics' },
    ...state.libraries.map(l => ({ value: `lib:${l.id}`, label: l.name })),
  ];
  select.innerHTML = options.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
  // Falls back to 'last' if the saved value referenced a since-deleted
  // category and isn't among the current options.
  select.value = options.some(o => o.value === state.defaultStartView) ? state.defaultStartView : 'last';
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
  await loadContentWarnings();
  await loadBookTypes();
  await loadStatuses();
  renderStatusFilterButtons();
  updateFilterBadges();
  await applyDefaultStartView();
}

// Routes to whichever start view the person picked in User Settings —
// their last-opened category (default, tracked via lastOpenedLibraryId),
// the Reading Statistics page, or one specific pinned category. Falls
// back to the normal "last opened" behavior if the pinned category was
// since deleted, rather than erroring or showing a blank screen.
async function applyDefaultStartView() {
  if (state.defaultStartView === 'stats') {
    await showStats();
    return;
  }
  if (state.defaultStartView?.startsWith('lib:')) {
    const pinnedId = parseInt(state.defaultStartView.slice(4));
    if (state.libraries.some(l => l.id === pinnedId)) {
      state.currentLibraryId = pinnedId;
      renderSidebarNav();
      applyCurrentLibraryHeader();
    }
  }
  await loadLibrary();
}

// ─── Settings: Theme (Dark Mode) & View Modes ────────────────────────────────

const THEME_ICONS = {
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
};

// Loads theme, sidebar auto-hide preference, view modes, and sort preferences in one round trip.
async function loadSettings() {
  const settings = await window.api.settings.getAll();
  state.theme = settings.theme === 'light' ? 'light' : 'dark';
  state.autoHideSidebar = settings.autoHideSidebar === 'true';
  state.showNsfwContent = settings.showNsfwContent !== 'false'; // opt-out: absent/anything but 'false' = shown
  state.groupsSectionCollapsed = settings.groupsSectionCollapsed === 'true';
  state.charDrawerRelsCollapsed = settings.charRelsSectionCollapsed === 'true';
  state.seriesViewMode = settings.seriesViewMode === 'card' ? 'card' : 'table';
  state.charViewMode = settings.charViewMode === 'list' ? 'list' : 'grid';
  state.sortField = ['title', 'author', 'rating', 'year_published', 'date_started', 'date_finished'].includes(settings.sortField) ? settings.sortField : 'title';
  state.sortDir = settings.sortDir === 'desc' ? 'desc' : 'asc';
  state.defaultStartView = settings.defaultStartView || 'last';
  state.lastOpenedLibraryId = settings.lastOpenedLibraryId ? parseInt(settings.lastOpenedLibraryId) : null;
  applyTheme();
  applySidebarAutoHide();
  applyGroupsCollapsed();
  applyCharDrawerRelsCollapsed();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  el('theme-toggle-icon').innerHTML = THEME_ICONS[state.theme];
  el('theme-toggle-label').textContent = state.theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  document.querySelectorAll('#settings-theme-chips .type-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === state.theme);
  });
}

async function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  await window.api.settings.set('theme', state.theme);
}

function applySidebarAutoHide() {
  const isAutoHide = !!state.autoHideSidebar;
  document.body.classList.toggle('sidebar-autohide', isAutoHide);
  el('sidebar-hover-edge')?.classList.toggle('hidden', !isAutoHide);
  document.querySelectorAll('.btn-sidebar-toggle').forEach(btn => {
    btn.classList.toggle('hidden', !isAutoHide);
  });
  const autohideCheckbox = el('setting-autohide-sidebar');
  if (autohideCheckbox) autohideCheckbox.checked = isAutoHide;

  if (!isAutoHide) {
    el('sidebar')?.classList.remove('sidebar-visible');
    el('sidebar-backdrop')?.classList.remove('active');
  }
}

async function setSidebarAutoHide(enabled) {
  state.autoHideSidebar = !!enabled;
  applySidebarAutoHide();
  await window.api.settings.set('autoHideSidebar', state.autoHideSidebar ? 'true' : 'false');
  toast(state.autoHideSidebar ? 'Auto-hide categories enabled' : 'Auto-hide categories disabled');
}

// Global content preference (distinct from the per-search "NSFW: Yes/No"
// facet in More Filters — that's a one-off query filter; this is a
// persistent baseline that hides NSFW titles from the library entirely
// until turned back on). Applied client-side in applyClientFilters().
async function setShowNsfwContent(enabled) {
  state.showNsfwContent = !!enabled;
  await window.api.settings.set('showNsfwContent', state.showNsfwContent ? 'true' : 'false');
  if (el('view-library').classList.contains('active')) loadLibrary();
  toast(state.showNsfwContent ? 'NSFW content shown' : 'NSFW content hidden');
}

async function openUserSettingsModal() {
  const user = await window.api.auth.currentUser();
  state.currentUser = user;
  const username = user?.username || 'User';
  el('settings-username-display').textContent = username;
  el('settings-username-initial').textContent = username.charAt(0).toUpperCase();

  const autohideCheckbox = el('setting-autohide-sidebar');
  if (autohideCheckbox) autohideCheckbox.checked = !!state.autoHideSidebar;

  const nsfwCheckbox = el('setting-show-nsfw');
  if (nsfwCheckbox) nsfwCheckbox.checked = !!state.showNsfwContent;

  document.querySelectorAll('#settings-theme-chips .type-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === state.theme);
  });

  await refreshSecurityQuestionStatus();

  renderDefaultStartViewOptions();

  const settings = await window.api.settings.getAll();
  state.statsGoal = settings.annualReadingGoal ? parseInt(settings.annualReadingGoal) : null;
  el('setting-annual-goal').value = state.statsGoal || '';

  openModal('overlay-user-settings');
}

async function handleSignOut() {
  await window.api.auth.signOut();
  closeModal('overlay-user-settings');
  el('app').classList.add('hidden');
  el('auth-gate').classList.remove('hidden');
  el('auth-username').value = '';
  el('auth-password').value = '';
  el('auth-gate-status').textContent = 'Signed out successfully.';
  state.currentSeries = null;
  state.series = [];
  state.libraries = [];
}

async function handleSignOut() {
  await window.api.auth.signOut();
  closeModal('overlay-user-settings');
  el('app').classList.add('hidden');
  el('auth-gate').classList.remove('hidden');
  el('auth-username').value = '';
  el('auth-password').value = '';
  el('auth-gate-status').textContent = 'Signed out successfully.';
  state.currentSeries = null;
  state.series = [];
  state.libraries = [];
}

// Triggers the main-process save dialog + full-library JSON export
// (main.js's export:json handler). That handler already returns false on
// cancel and true on success — no error path to handle beyond a generic
// catch, since the actual file-write happens entirely main-process side.
async function handleExportJson() {
  const btn = el('btn-export-json');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    const ok = await window.api.data.exportJson();
    if (ok) toast('Library exported');
    // ok === false just means the save dialog was canceled — not an error.
  } catch (e) {
    toast(e.message || 'Export failed', true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ─── Account: Change Password ───────────────────────────────────────────
// The only supported way to change a password post sign-up — previously
// there was no path short of editing the users table directly. Opens from
// inside User Settings, same stacking pattern as Delete Account below.
// The submit button stays disabled until all three fields are
// individually valid, mirroring updateDeleteAccountButtonState's
// disabled-until-valid approach.

function openChangePasswordModal() {
  el('f-change-password-current').value = '';
  el('f-change-password-new').value = '';
  el('f-change-password-confirm').value = '';
  el('change-password-error').textContent = '';
  el('btn-confirm-change-password').disabled = true;
  openModal('overlay-change-password');
  el('f-change-password-current').focus();
}

function updateChangePasswordButtonState() {
  const current = el('f-change-password-current').value;
  const next = el('f-change-password-new').value;
  const confirm = el('f-change-password-confirm').value;
  const errorEl = el('change-password-error');

  // Live feedback as soon as there's something to compare against — only
  // once the person has started typing into Confirm, so the field doesn't
  // flash an error before they've had a chance to type anything there.
  // The button stays disabled until this resolves, so without this the
  // mismatch message in handleChangePasswordSubmit() below could never
  // actually be seen — Save just silently wouldn't click.
  errorEl.textContent = (confirm.length > 0 && next !== confirm) ? "New passwords don't match" : '';

  const valid = current.length > 0 && next.length >= 4 && next === confirm;
  el('btn-confirm-change-password').disabled = !valid;
}

// ─── Security Question (User Settings + recovery source of truth) ───────

async function refreshSecurityQuestionStatus() {
  const { question } = await window.api.account.getSecurityQuestion();
  const label = el('settings-security-question-status');
  const btn = el('btn-open-security-question');
  if (question) {
    label.textContent = `Set: "${question}"`;
    btn.textContent = 'Update…';
  } else {
    label.textContent = 'Not set up — add one so you can recover your account if you forget your password.';
    btn.textContent = 'Set Up…';
  }
}

function openSecurityQuestionModal() {
  el('f-security-question').value = '';
  el('f-security-answer').value = '';
  el('f-security-current-password').value = '';
  el('security-question-error').textContent = '';
  openModal('overlay-security-question');
  el('f-security-question').focus();
}

async function handleSecurityQuestionSubmit() {
  const question = el('f-security-question').value.trim();
  const answer = el('f-security-answer').value.trim();
  const currentPassword = el('f-security-current-password').value;
  const errorEl = el('security-question-error');
  errorEl.textContent = '';
  if (!question || !answer) { errorEl.textContent = 'Both a question and answer are required'; return; }

  const btn = el('btn-confirm-security-question');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const result = await window.api.account.setSecurityQuestion(currentPassword, question, answer);
    if (!result.ok) { errorEl.textContent = result.error || 'Could not save'; return; }
    toast('Security question saved');
    closeModal('overlay-security-question');
    await refreshSecurityQuestionStatus();
  } catch (e) {
    errorEl.textContent = e.message || 'Could not save';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function handleChangePasswordSubmit() {
  const current = el('f-change-password-current').value;
  const next = el('f-change-password-new').value;
  const confirm = el('f-change-password-confirm').value;
  const btn = el('btn-confirm-change-password');
  const errorEl = el('change-password-error');
  errorEl.textContent = '';

  if (next !== confirm) {
    errorEl.textContent = "New passwords don't match";
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Updating…';
  try {
    const result = await window.api.account.changePassword(current, next);
    if (!result.ok) {
      errorEl.textContent = result.error || 'Could not update password';
      return;
    }
    toast('Password updated');
    closeModal('overlay-change-password');
  } catch (e) {
    errorEl.textContent = e.message || 'Could not update password';
  } finally {
    btn.textContent = 'Update Password';
    updateChangePasswordButtonState();
  }
}

// ─── Danger Zone: Delete Account ───────────────────────────────────────────
// Two-part confirmation before this ever reaches the IPC layer: the person
// must type their own username exactly (a "you meant to click this" guard
// — the Confirm button stays disabled until it matches) and re-enter their
// password (the actual authorization check, re-verified server-side in
// main.js even though they're already signed in). Opens from inside User
// Settings, stacking on top of it the same way "Manage Statuses" stacks on
// top of the Add/Edit Title modal elsewhere in this app.

function openDeleteAccountModal() {
  const username = state.currentUser?.username || '';
  el('delete-account-username').textContent = username || 'your account';
  el('f-delete-account-confirm').value = '';
  el('f-delete-account-password').value = '';
  el('delete-account-error').textContent = '';
  el('btn-confirm-delete-account').disabled = true;
  openModal('overlay-delete-account');
  el('f-delete-account-confirm').focus();
}

function updateDeleteAccountButtonState() {
  const username = state.currentUser?.username || '';
  const typed = el('f-delete-account-confirm').value;
  const password = el('f-delete-account-password').value;
  const matches = username.length > 0 && typed === username;
  el('btn-confirm-delete-account').disabled = !(matches && password.length > 0);
}

async function handleDeleteAccountSubmit() {
  const password = el('f-delete-account-password').value;
  const btn = el('btn-confirm-delete-account');
  const errorEl = el('delete-account-error');
  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const result = await window.api.account.delete(password);
    if (!result.ok) {
      errorEl.textContent = result.error || 'Could not delete account';
      updateDeleteAccountButtonState();
      return;
    }
    // Account and every row it owned are gone server-side — the cleanest
    // way back to a known-good state client-side is the same full reload
    // the regular sign-out path already relies on elsewhere in this app,
    // rather than trying to hand-reset every piece of in-memory state.
    window.location.reload();
  } catch (e) {
    errorEl.textContent = e.message || 'Could not delete account';
    updateDeleteAccountButtonState();
  } finally {
    btn.textContent = 'Permanently Delete Account';
  }
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
  // User Settings & Logout
  el('btn-open-settings')?.addEventListener('click', openUserSettingsModal);
  el('btn-settings-signout')?.addEventListener('click', handleSignOut);
  el('btn-auth-signout')?.addEventListener('click', handleSignOut);
  el('btn-export-json')?.addEventListener('click', handleExportJson);

  // Change Password
  el('btn-open-change-password')?.addEventListener('click', openChangePasswordModal);
  el('f-change-password-current')?.addEventListener('input', updateChangePasswordButtonState);
  el('f-change-password-new')?.addEventListener('input', updateChangePasswordButtonState);
  el('f-change-password-confirm')?.addEventListener('input', updateChangePasswordButtonState);
  el('btn-confirm-change-password')?.addEventListener('click', handleChangePasswordSubmit);

  // Security Question
  el('btn-open-security-question')?.addEventListener('click', openSecurityQuestionModal);
  el('btn-confirm-security-question')?.addEventListener('click', handleSecurityQuestionSubmit);

  // Danger Zone: Delete Account
  el('btn-open-delete-account')?.addEventListener('click', openDeleteAccountModal);
  el('f-delete-account-confirm')?.addEventListener('input', updateDeleteAccountButtonState);
  el('f-delete-account-password')?.addEventListener('input', updateDeleteAccountButtonState);
  el('btn-confirm-delete-account')?.addEventListener('click', handleDeleteAccountSubmit);

  el('setting-show-nsfw')?.addEventListener('change', (e) => {
    setShowNsfwContent(e.target.checked);
  });

  el('setting-autohide-sidebar')?.addEventListener('change', (e) => {
    setSidebarAutoHide(e.target.checked);
  });

  document.querySelectorAll('#settings-theme-chips .type-chip').forEach(chip => {
    chip.addEventListener('click', async (e) => {
      document.querySelectorAll('#settings-theme-chips .type-chip').forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const newTheme = e.currentTarget.dataset.theme;
      if (newTheme !== state.theme) {
        state.theme = newTheme;
        applyTheme();
        await window.api.settings.set('theme', state.theme);
      }
    });
  });

  // Default Start View (User Settings) — auto-saves on change.
  el('setting-default-start-view')?.addEventListener('change', async (e) => {
    state.defaultStartView = e.target.value;
    await window.api.settings.set('defaultStartView', state.defaultStartView);
    toast('Default start view saved');
  });

  // Reading Goals (User Settings) — auto-saves on blur, same pattern as
  // the status name/color rows in Manage Statuses.
  el('setting-annual-goal')?.addEventListener('change', (e) => {
    saveAnnualGoal(parseInt(e.target.value));
  });
  el('setting-annual-goal')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });

  // Sidebar Drawer Toggle & Hover triggers (for auto-hide mode)
  document.querySelectorAll('.btn-sidebar-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sidebar = el('sidebar');
      const isVisible = sidebar.classList.contains('sidebar-visible');
      sidebar.classList.toggle('sidebar-visible', !isVisible);
      el('sidebar-backdrop')?.classList.toggle('active', !isVisible);
    });
  });

  el('sidebar-hover-edge')?.addEventListener('mouseenter', () => {
    if (state.autoHideSidebar) {
      el('sidebar')?.classList.add('sidebar-visible');
      el('sidebar-backdrop')?.classList.add('active');
    }
  });

  let sidebarHoverTimeout = null;
  el('sidebar')?.addEventListener('mouseenter', () => {
    if (sidebarHoverTimeout) clearTimeout(sidebarHoverTimeout);
  });

  el('sidebar')?.addEventListener('mouseleave', () => {
    if (state.autoHideSidebar) {
      sidebarHoverTimeout = setTimeout(() => {
        if (!document.querySelector('.overlay:not(.hidden)')) {
          el('sidebar')?.classList.remove('sidebar-visible');
          el('sidebar-backdrop')?.classList.remove('active');
        }
      }, 350);
    }
  });

  el('sidebar-backdrop')?.addEventListener('click', () => {
    el('sidebar')?.classList.remove('sidebar-visible');
    el('sidebar-backdrop')?.classList.remove('active');
  });

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

  // Reading Statistics (sidebar Insights section)
  el('btn-nav-stats').addEventListener('click', showStats);
  wireStatsGoalEdit();

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

  // Status Management (entry point now lives in User Settings, not the
  // Add/Edit Title form — see index.html's "Reading Statuses" section)
  el('btn-open-manage-statuses')?.addEventListener('click', openManageStatusesModal);
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
    state.filterFandoms = [];
    state.filterLanguages = [];
    state.filterCountries = [];
    state.filterAuthors = [];
    state.filterArtists = [];
    state.filterPublishers = [];
    state.filterTranslated = [];
    state.filterNsfw = [];
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
    state.filterNsfw = [];
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
  el('btn-transfer-series')?.addEventListener('click', () => {
    if (state.currentSeries) openTransferModal(state.currentSeries);
  });
  el('btn-edit-series').addEventListener('click', () => openSeriesModal(state.currentSeries));
  el('btn-delete-series').addEventListener('click', () => {
    confirmDelete(`Delete "${state.currentSeries.title}"? This will delete all volumes and characters.`, async () => {
      await window.api.series.delete(state.currentSeries.id);
      toast('Title deleted');
      showLibrary();
    });
  });

  // Series Groups (umbrella cards + modal)
  el('btn-groups-collapse').addEventListener('click', toggleGroupsCollapsed);
  el('btn-section-add-group').addEventListener('click', () => openGroupModal(null));
  el('btn-save-group').addEventListener('click', saveGroup);
  el('btn-delete-group').addEventListener('click', deleteGroup);
  el('btn-group-add-book').addEventListener('click', addBookToGroup);
  el('btn-save-series').addEventListener('click', saveSeries);

  // Transfer / Copy Modal Actions
  document.querySelectorAll('#transfer-action-chips .type-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('#transfer-action-chips .type-chip').forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      transferMode = e.currentTarget.dataset.action;

      const isCopy = transferMode === 'copy';
      el('transfer-copy-options').classList.toggle('hidden', !isCopy);
      el('transfer-action-hint').textContent = isCopy
        ? 'Creates a new duplicate copy of this book in the destination category.'
        : 'Moves this book and all its volumes, characters, and notes into the new category.';
      el('btn-submit-transfer').textContent = isCopy ? 'Copy Book' : 'Transfer Book';
      el('modal-transfer-title').textContent = isCopy ? 'Copy Book' : 'Transfer Book';

      const currentLibId = transferTargetSeries?.library_id || state.currentLibraryId;
      Array.from(el('f-transfer-target-lib').options).forEach(opt => {
        if (parseInt(opt.value) === currentLibId) {
          opt.disabled = !isCopy;
        }
      });
    });
  });

  el('btn-submit-transfer').addEventListener('click', handleTransferOrCopySubmit);

  // Series Type (Series vs Standalone)
  document.querySelectorAll('#f-s-kind-chips .type-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (chip.classList.contains('disabled')) return;
      document.querySelectorAll('#f-s-kind-chips .type-chip').forEach(c => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      el('f-s-kind').value = e.currentTarget.dataset.kind;
      el('series-cover-group').classList.toggle('hidden', e.currentTarget.dataset.kind !== 'standalone');
      el('standalone-chapter-count-group').classList.toggle('hidden', e.currentTarget.dataset.kind !== 'standalone');
    });
  });
  // Book Type → Fandom field visibility (Fanfic only)
  el('f-s-booktype').addEventListener('input', applyFandomFieldVisibility);

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
  // Focusing an empty tag field should immediately browse existing tags
  // (the "autofill" people expect), not just wait for the first keystroke.
  dom.tagInput.addEventListener('focus', handleTagInput);
  dom.tagInput.addEventListener('keydown', handleTagKeydown);
  document.addEventListener('click', (e) => {
    // tagDropdown is a sibling of tagWrap in the DOM (not nested inside
    // it), so a click landing on a suggestion itself must also be treated
    // as "inside" — otherwise this handler raced the option's own click
    // listener and could interfere with selecting a suggestion.
    if (!dom.tagWrap.contains(e.target) && !dom.tagDropdown.contains(e.target)) {
      dom.tagDropdown.classList.add('hidden');
    }
  });

  // Content Warnings Input (mirrors the Tags input above, but backed by
  // its own per-user vocabulary — see loadContentWarnings/addWarning)
  dom.warningWrap.addEventListener('click', () => dom.warningInput.focus());
  dom.warningInput.addEventListener('input', handleWarningInput);
  dom.warningInput.addEventListener('focus', handleWarningInput);
  dom.warningInput.addEventListener('keydown', handleWarningKeydown);
  document.addEventListener('click', (e) => {
    if (!dom.warningWrap.contains(e.target) && !dom.warningDropdown.contains(e.target)) {
      dom.warningDropdown.classList.add('hidden');
    }
  });
  dom.fandomWrap.addEventListener('click', () => dom.fandomInput.focus());
  dom.fandomInput.addEventListener('input', handleFandomInput);
  dom.fandomInput.addEventListener('focus', handleFandomInput);
  dom.fandomInput.addEventListener('keydown', handleFandomKeydown);
  document.addEventListener('click', (e) => {
    if (!dom.fandomWrap.contains(e.target) && !dom.fandomDropdown.contains(e.target)) {
      dom.fandomDropdown.classList.add('hidden');
    }
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
  el('btn-add-timeline-note').addEventListener('click', () =>
    addTimelineNoteEntry('volNotesEntries', 'f-v-notes-new', 'timeline-notes-list', 'f-v-notes', 'f-v-notes-counter'));
  el('btn-add-standalone-timeline-note').addEventListener('click', () =>
    addTimelineNoteEntry('standaloneNotesEntries', 'f-standalone-chapter-notes-new', 'standalone-timeline-notes-list', 'f-standalone-chapter-notes', 'f-standalone-chapter-notes-counter'));
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
  el('btn-drawer-rels-collapse')?.addEventListener('click', toggleCharDrawerRelsCollapsed);

  // Gallery Actions
  el('btn-add-gallery-image').addEventListener('click', async () => {
    const paths = await window.api.files.openImagesDialog();
    if (paths && paths.length > 0) await addGalleryImages(paths);
  });
  setupMultiDropZone(dom.galleryGrid, addGalleryImages, { fileFilter: isImageFile, maxSizeBytes: MAX_IMAGE_SIZE_BYTES });
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
  setupMultiDropZone(dom.filesList, addAttachmentFiles, { maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES });

  el('btn-add-link').addEventListener('click', () => openLinkModal());
  el('btn-save-link').addEventListener('click', saveLink);

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

  // Modals close — any element with data-close, regardless of its visual
  // style (ghost, primary, the bare ✕ icon button, etc.) should close its
  // modal; styling and "does this button close the modal" are unrelated.
  document.querySelectorAll('[data-close]').forEach(btn => {
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
  const key = viewId.replace('view-', '');
  const target = views[key];
  target.classList.add('active');
  target.classList.remove('hidden');
  state.currentView = key;
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

// Keep in sync with MAX_IMAGE_SIZE_BYTES / MAX_ATTACHMENT_SIZE_BYTES in
// main.js — those are the actual enforced limits (files:saveImage and
// attachments:add reject oversized files regardless of how they got
// picked); these are just same-value client-side shortcuts so a
// drag-and-drop of an oversized file gets an instant toast instead of
// silently reading the whole file before a round trip rejects it.
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;

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
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return toast(`Image is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB) — max ${(MAX_IMAGE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB`, true);
    }
    const path = window.api.files.getPathForFile(file);
    if (path) await onFilePath(path);
  });
}

// Wires a multi-file drop target (gallery grid, files list). onFilePaths
// receives the resolved absolute paths of every file that passes
// fileFilter (if given) and maxSizeBytes (if given) — anything oversized
// is rejected right here with a toast, before ever being read or sent
// over IPC, since a dropped File's .size is free to check client-side.
function setupMultiDropZone(zoneEl, onFilePaths, { fileFilter = null, maxSizeBytes = null } = {}) {
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

    let tooBig = [];
    if (maxSizeBytes) {
      tooBig = files.filter(f => f.size > maxSizeBytes);
      files = files.filter(f => f.size <= maxSizeBytes);
    }
    if (tooBig.length > 0) {
      const maxLabel = `${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB`;
      toast(tooBig.length === 1
        ? `"${tooBig[0].name}" is too large — max ${maxLabel}`
        : `${tooBig.length} files were too large — max ${maxLabel}`, true);
    }
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
    if (!state.showNsfwContent && s.is_nsfw) return false;
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
    if (state.filterFandoms.length) {
      const seriesFandoms = parseFandomList(s.fandom);
      if (!state.filterFandoms.some(f => seriesFandoms.includes(f))) return false;
    }
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

    if (state.filterNsfw.length) {
      const norm = s.is_nsfw ? 'Yes' : 'No';
      if (!state.filterNsfw.includes(norm)) return false;
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

// Fandom is comma-delimited multi-value (see parseFandomList) — unlike
// the other More Filters facets, this needs individual fandom tokens
// across all series, not each series's whole raw fandom string.
function uniqueFandomValues(list) {
  const set = new Set();
  list.forEach(s => parseFandomList(s.fandom).forEach(f => set.add(f)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Renders one More Filters checkbox facet. `allValues` comes from the
// unfiltered library list (so unchecking everything doesn't also empty
// the list of things you could check), `selected` is the current
// state.filter* array for this facet, and `onToggle(value, checked)` updates
// that array, re-filters, and re-renders.
function renderFilterCheckboxList(containerId, allValues, selected, onToggle) {
  const container = el(containerId);
  if (!container) return;
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

  renderFilterCheckboxList('filter-fandom-list', uniqueFandomValues(state.allSeriesRaw), state.filterFandoms, (value, checked) => {
    state.filterFandoms = checked ? [...state.filterFandoms, value] : state.filterFandoms.filter(v => v !== value);
    updateFilterBadges();
    loadLibrary();
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

  renderFilterCheckboxList('filter-nsfw-list', ['Yes', 'No'], state.filterNsfw, (value, checked) => {
    state.filterNsfw = checked ? [...state.filterNsfw, value] : state.filterNsfw.filter(v => v !== value);
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
  await loadSeriesGroups();
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
          ${s.is_nsfw ? `<span class="nsfw-marker" title="NSFW"></span>` : ''}
          <span class="title-text">${escapeHTML(s.title)}</span>
          ${s.kind === 'series' ? `<span class="kind-badge">SERIES</span>` : ''}
          ${s.book_type ? `<span class="book-type-badge">${escapeHTML(s.book_type).toUpperCase()}</span>` : ''}
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
      <td class="col-num">${s.kind === 'standalone' ? (s.standalone_chapter_count || '<span class="empty-dim">—</span>') : (s.volume_count || '<span class="empty-dim">—</span>')}</td>
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
        ${(s.kind === 'series' || s.book_type) ? `
        <div class="series-card-badges-overlay">
          ${s.kind === 'series' ? `<span class="kind-badge kind-badge-overlay">Series</span>` : ''}
          ${s.book_type ? `<span class="book-type-badge book-type-badge-overlay">${escapeHTML(s.book_type)}</span>` : ''}
        </div>` : ''}
        ${s.is_nsfw ? `<span class="series-card-nsfw-badge" title="NSFW">NSFW</span>` : ''}
        ${s.cover_image_path
      ? `<img data-key="${escapeHTML(s.cover_image_path)}" alt="${escapeHTML(s.title)}">`
      : `<span class="series-card-cover-fallback">${escapeHTML((s.title || '?').charAt(0).toUpperCase())}</span>`}
      </div>
      <div class="series-card-body">
        <div class="series-card-title">
          ${escapeHTML(s.title)}
        </div>
        <div class="series-card-author">${escapeHTML(s.author || '')}</div>
        <div class="series-card-footer">
          <span class="status-badge" style="color:${statusColor(s.status)}">${escapeHTML(s.status)}</span>
          <span class="series-card-count">${s.kind === 'standalone'
      ? (s.standalone_chapter_count ? `${s.standalone_chapter_count} ch` : '—')
      : `${s.volume_count} vol`}</span>
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
  el('btn-nav-stats')?.classList.remove('active');
  renderSidebarNav();
  switchView('view-library');
  loadLibrary();
}

// ─── Reading Statistics ─────────────────────────────────────────────────
// A separate top-level area (sidebar "Insights" section, not folded into
// the category list) reporting on the whole account — every title the
// signed-in user owns across every category — not just the currently
// selected one. Pulled with window.api.series.getAll({}) (no libraryId),
// the same "every title I own" call loadBookTypes() already relies on.
// The Reading Timeline section (heatmap/streaks/weekly breakdown/monthly
// insights) additionally pulls every VOLUME's actual date_read +
// chapter_count across every series — real logged completions, not
// anything simulated — via loadReadingEvents() below. Everything here is
// plain divs/SVG sized with CSS or computed coordinates rather than a
// charting library, matching the no-framework, dependency-free approach
// the rest of the app already takes (e.g. the rating stars, the vis.js-free
// parts of the relationship graph styling).

const STATS_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function showStats() {
  el('btn-nav-stats')?.classList.add('active');
  document.querySelectorAll('#sidebar-nav-list .nav-item').forEach(b => b.classList.remove('active'));
  switchView('view-stats');
  if (state.autoHideSidebar) {
    el('sidebar')?.classList.remove('sidebar-visible');
    el('sidebar-backdrop')?.classList.remove('active');
  }
  try {
    await loadStats();
  } catch (err) {
    // The view has already switched above regardless of what happens here,
    // so a failure can no longer strand the person looking at whatever
    // view they were on before with a nav item that (falsely) claims
    // they're on Reading Statistics — it just leaves the page under-filled
    // and tells them something went wrong.
    console.error('[stats] Failed to load reading statistics:', err);
    toast(`Could not load reading statistics: ${err?.message || err}`, true);
  }
}

// Every volume across every series this user owns that has a "Date Read"
// set, plus every standalone title with a "Date Finished" set — each
// event carries the genres/tags of its parent series, which is what
// powers the per-month/per-year genre & tag breakdowns further down this
// file. This is an N+1 fetch (one volumes:getBySeries call per series),
// same pattern export:json already uses — fine for a personal library,
// not meant for thousands of titles. Each series is fetched independently
// so one bad/slow series can't take down the whole stats page.
async function loadReadingEvents(allSeries) {
  const events = [];
  for (const s of allSeries) {
    if (s.kind === 'standalone') {
      if (s.date_finished) {
        events.push({ date: s.date_finished, seriesId: s.id, seriesTitle: s.title, genres: s.genres.map(g => g.name), tags: s.tags.map(t => t.name) });
      }
      continue;
    }
    try {
      const vols = await window.api.volumes.getBySeries(s.id);
      vols.forEach(v => {
        if (v.date_read) {
          events.push({ date: v.date_read, seriesId: s.id, seriesTitle: s.title, genres: s.genres.map(g => g.name), tags: s.tags.map(t => t.name) });
        }
      });
    } catch (err) {
      console.error(`[stats] Failed to load volumes for series ${s.id}:`, err);
    }
  }
  return events;
}

async function loadStats() {
  const allSeries = await window.api.series.getAll({});
  state.statsAllSeries = allSeries;
  const hasData = allSeries.length > 0;

  el('stats-empty-state').classList.toggle('hidden', hasData);
  document.querySelectorAll('#view-stats .stats-hero-grid, #view-stats .stats-section').forEach(s => s.classList.toggle('hidden', !hasData));
  if (!hasData) return;

  const settings = await window.api.settings.getAll();
  state.statsGoal = settings.annualReadingGoal ? parseInt(settings.annualReadingGoal) : null;
  state.statsEvents = await loadReadingEvents(allSeries);

  // Each section renders independently — a bug or bad data in one (say,
  // the radar chart) logs clearly and leaves a gap there, rather than
  // throwing before the sections above/below it ever get a chance to draw.
  const sections = [
    ['year/month controls', () => populateStatsYearMonthControls()],
    ['milestone hero', () => renderStatsHero(allSeries, state.statsEvents)],
    ['reading timeline', () => renderStatsTimeline()],
    ['genre radar', () => renderStatsRadar(allSeries)],
    ['status breakdown', () => renderStatsStatusBreakdown(allSeries)],
    ['genre breakdown', () => renderStatsGenreBreakdown(allSeries)],
    ['tag breakdown', () => renderStatsTagBreakdown(allSeries)],
    ['rating distribution', () => renderStatsRatingDistribution(allSeries)],
    ['year chart', () => renderStatsYearChart(allSeries)],
  ];
  for (const [label, render] of sections) {
    try {
      render();
    } catch (err) {
      console.error(`[stats] Failed to render ${label}:`, err);
    }
  }
}

// ── Annual Milestone hero + quick stat cards ────────────────────────────

// The goal is genuinely user-defined — nothing is silently assumed. Until
// a value is saved to settings ('annualReadingGoal'), state.statsGoal
// stays null and the milestone card shows a "set your goal" prompt
// instead of a progress bar. The goal is set from ONE place — the Reading
// Goals section of User Settings (see openUserSettingsModal /
// bindEvents' 'setting-annual-goal' wiring) — the stats page itself is
// read-only for this and just links out to Settings, so there's a single
// source of truth rather than two editors that can drift out of sync.

function saveAnnualGoal(num) {
  if (!num || num < 1) {
    toast('Enter a valid positive number', true);
    return false;
  }
  state.statsGoal = num;
  window.api.settings.set('annualReadingGoal', String(num));
  // If the stats page happens to already be loaded, refresh it immediately
  // rather than waiting for the next visit to pick up the new goal.
  if (state.statsAllSeries.length) {
    try {
      renderStatsHero(state.statsAllSeries, state.statsEvents);
    } catch (err) {
      console.error('[stats] Failed to refresh milestone hero after saving goal:', err);
    }
  }
  toast('Reading goal saved');
  return true;
}

// Both the pencil on the stats page and the "Open User Settings" button
// shown when no goal is set just take the person to Settings and focus
// the real input there, rather than duplicating an editor on the stats
// page itself.
function wireStatsGoalEdit() {
  const jumpToGoalSetting = async () => {
    await openUserSettingsModal();
    el('setting-annual-goal')?.focus();
  };
  el('btn-edit-goal')?.addEventListener('click', jumpToGoalSetting);
  el('btn-goal-open-settings')?.addEventListener('click', jumpToGoalSetting);
}

function renderVelocitySparkline(counts) {
  const svg = el('stats-velocity-sparkline');
  if (counts.length < 2 || counts.every(c => c === 0)) {
    svg.innerHTML = '';
    return;
  }
  const max = Math.max(...counts, 1);
  const w = 200, h = 40, pad = 4;
  const stepX = (w - pad * 2) / (counts.length - 1);
  const points = counts.map((c, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (c / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lastX, lastY] = points[points.length - 1].split(',');
  svg.innerHTML = `
    <polyline points="${points.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3" fill="var(--accent)"/>
  `;
}

function renderStatsHero(allSeries, events) {
  const now = new Date();
  const year = now.getFullYear();
  el('stats-year-heading').textContent = `${year} Reading Journey`;

  const goal = state.statsGoal;
  const paceBadge = el('stats-pace-badge');
  paceBadge.classList.add('hidden');
  paceBadge.classList.remove('stats-pace-ahead', 'stats-pace-behind');

  if (!goal) {
    el('stats-goal-configured').classList.add('hidden');
    el('stats-goal-unset').classList.remove('hidden');
    el('stats-goal-unset-year').textContent = year;
  } else {
    el('stats-goal-unset').classList.add('hidden');
    el('stats-goal-configured').classList.remove('hidden');

    const finishedThisYear = allSeries.filter(s => s.date_finished && new Date(s.date_finished).getFullYear() === year).length;
    const pct = Math.min(100, Math.round((finishedThisYear / goal) * 100));
    const remaining = Math.max(0, goal - finishedThisYear);

    el('stats-goal-current').textContent = finishedThisYear;
    el('stats-goal-target').textContent = goal;
    el('stats-goal-target-label').textContent = goal;
    el('stats-goal-pct').textContent = `${pct}%`;
    el('stats-goal-progress-fill').style.width = `${pct}%`;
    el('stats-goal-remaining').textContent = `${remaining} Book${remaining === 1 ? '' : 's'} Remaining`;

    // Pace: compare actual progress to where you "should" be given how
    // much of the year has elapsed, against the goal.
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31);
    const dayOfYear = Math.floor((now - startOfYear) / 86400000) + 1;
    const totalDaysInYear = Math.floor((endOfYear - startOfYear) / 86400000) + 1;
    const expected = goal * (dayOfYear / totalDaysInYear);
    const paceDiff = Math.round(finishedThisYear - expected);
    paceBadge.classList.remove('hidden');
    if (paceDiff > 0) {
      paceBadge.textContent = `↗ +${paceDiff} Ahead of Pace`;
      paceBadge.classList.add('stats-pace-ahead');
    } else if (paceDiff < 0) {
      paceBadge.textContent = `↘ ${Math.abs(paceDiff)} Behind Pace`;
      paceBadge.classList.add('stats-pace-behind');
    } else {
      paceBadge.textContent = 'On Pace';
    }
  }

  // Monthly velocity sparkline — Jan through the current month, this year.
  // Independent of whether a goal is set.
  const monthCounts = new Array(now.getMonth() + 1).fill(0);
  events.forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() <= now.getMonth()) monthCounts[d.getMonth()]++;
  });
  renderVelocitySparkline(monthCounts);
  const monthsElapsed = now.getMonth() + 1;
  const totalThisYear = monthCounts.reduce((a, b) => a + b, 0);
  el('stats-velocity-value').textContent = `${monthsElapsed ? (totalThisYear / monthsElapsed).toFixed(1) : '0.0'} books / mo`;

  // Quick stat cards. "Active"/"Queued" are matched against status NAMES
  // heuristically (statuses are per-user and fully custom), since the
  // default seeded statuses are literally "Reading" and "Planning" this
  // works out of the box for most accounts; anything unmatched just shows 0
  // rather than guessing wrong.
  const isReadingName = (name) => /read/i.test(name || '') && !/to.?read|tbr/i.test(name || '');
  const isQueuedName = (name) => /plan|tbr|to.?be.?read|queue/i.test(name || '');
  const isFinishedName = (name) => /finish|complet|done/i.test(name || '');
  const activeCount = allSeries.filter(s => isReadingName(s.status)).length;
  const queuedCount = allSeries.filter(s => isQueuedName(s.status)).length;
  const finishedCount = allSeries.filter(s => isFinishedName(s.status) || s.date_finished).length;
  const rated = allSeries.filter(s => s.rating > 0);
  const avgRating = rated.length ? rated.reduce((sum, s) => sum + s.rating, 0) / rated.length : 0;

  el('stats-quick-active').textContent = activeCount;
  el('stats-quick-queued').textContent = queuedCount;
  el('stats-quick-finished').textContent = finishedCount;
  el('stats-quick-rating').textContent = avgRating ? avgRating.toFixed(1) : '—';
  el('stats-quick-rating-sub').textContent = rated.length ? `Average Rating (${rated.length} rated)` : 'Average Rating';
}

// ── Reading Timeline Distribution (year/month controls) ─────────────────

function populateStatsYearMonthControls() {
  const years = [...new Set(state.statsEvents.map(e => new Date(e.date).getFullYear()).filter(y => !isNaN(y)))].sort((a, b) => b - a);
  const nowYear = new Date().getFullYear();
  if (!years.includes(nowYear)) years.unshift(nowYear);
  if (!state.statsSelectedYear || !years.includes(state.statsSelectedYear)) {
    state.statsSelectedYear = years[0];
  }

  const yearSelect = el('stats-year-select');
  yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === state.statsSelectedYear ? 'selected' : ''}>${y}</option>`).join('');
  yearSelect.onchange = () => { state.statsSelectedYear = parseInt(yearSelect.value); renderStatsTimeline(); };

  const monthSelect = el('stats-month-select');
  monthSelect.innerHTML = `<option value="all">Full Year</option>` +
    STATS_MONTH_NAMES.map((m, i) => `<option value="${i + 1}" ${state.statsSelectedMonth === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
  monthSelect.value = state.statsSelectedMonth;
  monthSelect.onchange = () => {
    state.statsSelectedMonth = monthSelect.value === 'all' ? 'all' : parseInt(monthSelect.value);
    renderStatsTimeline();
  };
}

function renderStatsTimeline() {
  const isFullYear = state.statsSelectedMonth === 'all';
  el('stats-yearly-panel').classList.toggle('hidden', !isFullYear);
  el('stats-month-panel').classList.toggle('hidden', isFullYear);
  if (isFullYear) renderStatsYearlyMonthlyChart(state.statsSelectedYear);
  else renderStatsMonthDetail(state.statsSelectedYear, state.statsSelectedMonth);
}

function renderStatsYearlyMonthlyChart(year) {
  const counts = new Array(12).fill(0);
  state.statsEvents.forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === year) counts[d.getMonth()]++;
  });
  const container = el('stats-yearly-monthly-chart');
  if (counts.every(c => c === 0)) {
    container.innerHTML = `<div class="filter-option-empty">No reading logged for ${year} yet.</div>`;
  } else {
    const max = Math.max(...counts, 1);
    container.innerHTML = STATS_MONTH_NAMES.map((m, i) => `
      <div class="stats-year-col">
        <span class="stats-year-count">${counts[i] || ''}</span>
        <div class="stats-year-bar" style="height:${counts[i] ? Math.max((counts[i] / max) * 100, 6) : 2}%"></div>
        <span class="stats-year-label">${m}</span>
      </div>
    `).join('');
  }
  renderStatsYearGenreTagBreakdown(year);
}

// Genre/tag breakdown scoped to whichever year is selected in the Reading
// Timeline Distribution controls — same bar-list shape as the all-time
// Top Genres/Top Tags cells further down the page, just filtered down to
// events (volume date_read / standalone date_finished) that fall in this
// specific year.
function renderStatsYearGenreTagBreakdown(year) {
  const yearEvents = state.statsEvents.filter(e => new Date(e.date).getFullYear() === year);
  const genreCounts = {};
  const genreColors = {};
  const tagCounts = {};
  const tagColors = {};
  const allSeriesById = new Map(state.statsAllSeries.map(s => [s.id, s]));

  yearEvents.forEach(e => {
    e.genres.forEach(name => { genreCounts[name] = (genreCounts[name] || 0) + 1; });
    e.tags.forEach(name => { tagCounts[name] = (tagCounts[name] || 0) + 1; });
    // Colors aren't carried on the event itself (only names) — look them
    // up from the matching series, same source renderStatsGenreBreakdown
    // pulls from for the all-time version.
    const s = allSeriesById.get(e.seriesId);
    if (!s) return;
    s.genres.forEach(g => { if (genreCounts[g.name]) genreColors[g.name] = g.color; });
    s.tags.forEach(t => { if (tagCounts[t.name]) tagColors[t.name] = t.color; });
  });

  const genreEntries = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tagEntries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  renderStatsBarList('stats-year-genre-bars', genreEntries, {
    emptyMessage: `No genres logged for ${year} yet.`,
    colorFor: (name) => genreColors[name] || 'var(--accent)',
  });
  renderStatsBarList('stats-year-tag-bars', tagEntries, {
    emptyMessage: `No tags logged for ${year} yet.`,
    colorFor: (name) => tagColors[name] || 'var(--primary)',
  });
}

// All-time (not scoped to the selected year/month) — a streak is
// inherently about the continuous span of active reading days, so
// changing the timeline's year/month picker deliberately doesn't reset it.
function computeReadingStreaks(events) {
  const daySet = new Set(events.map(e => (e.date || '').slice(0, 10)).filter(Boolean));
  if (daySet.size === 0) return { current: 0, longest: 0, totalDays: 0, longestBreak: 0, consistency: 0 };

  const days = [...daySet].map(d => new Date(d)).sort((a, b) => a - b);
  let longest = 1, run = 1, longestBreak = 0;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((days[i] - days[i - 1]) / 86400000);
    if (diff === 1) { run++; longest = Math.max(longest, run); }
    else { longestBreak = Math.max(longestBreak, diff - 1); run = 1; }
  }
  let current = 1;
  for (let i = days.length - 1; i > 0; i--) {
    const diff = Math.round((days[i] - days[i - 1]) / 86400000);
    if (diff === 1) current++; else break;
  }
  const totalDays = daySet.size;
  const spanDays = Math.round((days[days.length - 1] - days[0]) / 86400000) + 1;
  const consistency = spanDays > 0 ? Math.round((totalDays / spanDays) * 100) : 100;
  return { current, longest, totalDays, longestBreak, consistency };
}

function computeWeeklyBreakdown(monthEvents, daysInMonth) {
  const weeks = [];
  for (let start = 1; start <= daysInMonth; start += 7) {
    const end = Math.min(start + 6, daysInMonth);
    const dayCount = end - start + 1;
    const count = monthEvents.filter(e => { const d = new Date(e.date).getDate(); return d >= start && d <= end; }).length;
    weeks.push({ dayCount, count });
  }
  return weeks;
}

function renderHeatmapGrid(monthEvents, daysInMonth) {
  const countsByDay = {};
  monthEvents.forEach(e => { const d = new Date(e.date).getDate(); countsByDay[d] = (countsByDay[d] || 0) + 1; });
  const maxCount = Math.max(...Object.values(countsByDay), 1);
  const cells = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const c = countsByDay[d] || 0;
    const level = c > 0 ? Math.min(4, Math.ceil((c / maxCount) * 4)) : 0;
    cells.push(`<div class="heatmap-cell" data-level="${level}" title="${c} completed on day ${d}">${d}</div>`);
  }
  el('stats-heatmap-grid').innerHTML = cells.join('');
}

function renderMonthlyInsights(monthEvents) {
  if (monthEvents.length === 0) {
    el('stats-monthly-insights').innerHTML = `<div class="filter-option-empty">No activity this month</div>`;
    return;
  }
  const byDay = {};
  const bySeries = {};
  const byGenre = {};
  const byTag = {};
  monthEvents.forEach(e => {
    const d = new Date(e.date).getDate();
    byDay[d] = (byDay[d] || 0) + 1;
    bySeries[e.seriesTitle] = (bySeries[e.seriesTitle] || 0) + 1;
    e.genres.forEach(g => { byGenre[g] = (byGenre[g] || 0) + 1; });
    e.tags.forEach(t => { byTag[t] = (byTag[t] || 0) + 1; });
  });
  const topDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  const topSeries = Object.entries(bySeries).sort((a, b) => b[1] - a[1])[0];
  const topGenre = Object.entries(byGenre).sort((a, b) => b[1] - a[1])[0];
  const topTag = Object.entries(byTag).sort((a, b) => b[1] - a[1])[0];

  const cards = [
    { label: 'Most Active Day', value: topDay ? `Day ${topDay[0]} (${topDay[1]} completed)` : '—' },
    { label: 'Most Read Title', value: topSeries ? topSeries[0] : '—' },
    { label: 'Most Read Genre', value: topGenre ? `${topGenre[0]} (${topGenre[1]}x)` : '—' },
    { label: 'Most Read Tag', value: topTag ? `${topTag[0]} (${topTag[1]}x)` : '—' },
  ];
  el('stats-monthly-insights').innerHTML = cards.map(c => `
    <div class="stats-insight-card">
      <div class="stats-insight-label">${escapeHTML(c.label)}</div>
      <div class="stats-insight-value" title="${escapeHTML(c.value)}">${escapeHTML(c.value)}</div>
    </div>
  `).join('');
}

function renderStatsMonthDetail(year, month) {
  const monthEvents = state.statsEvents.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });
  const daysInMonth = new Date(year, month, 0).getDate();
  const completed = monthEvents.length;
  const distinctGenres = new Set(monthEvents.flatMap(e => e.genres)).size;
  const activeDaySet = new Set(monthEvents.map(e => new Date(e.date).getDate()));
  const activeDays = activeDaySet.size;

  el('stats-month-overview').innerHTML = `
    <div class="stats-month-stat-row">
      <div class="stats-month-stat"><span class="stats-mini-num">${completed}</span><span class="stats-mini-label">Completed</span></div>
      <div class="stats-month-stat"><span class="stats-mini-num">${distinctGenres}</span><span class="stats-mini-label">Genres Tagged</span></div>
      <div class="stats-month-stat"><span class="stats-mini-num">${activeDays}</span><span class="stats-mini-label">Active Days</span></div>
    </div>
  `;

  const streaks = computeReadingStreaks(state.statsEvents);
  el('stats-streaks').innerHTML = `
    <div class="stats-streak-title">Reading Consistency <span class="stats-streak-scope">(all-time)</span></div>
    <div class="stats-streak-row">
      <div class="stats-streak-stat"><span class="stats-mini-num stats-streak-accent">${streaks.current}d</span><span class="stats-mini-label">Current Streak</span></div>
      <div class="stats-streak-stat"><span class="stats-mini-num stats-streak-accent">${streaks.longest}d</span><span class="stats-mini-label">Longest Streak</span></div>
      <div class="stats-streak-stat"><span class="stats-mini-num stats-streak-accent">${streaks.totalDays}d</span><span class="stats-mini-label">Total Active Days</span></div>
    </div>
    <div class="stats-streak-row">
      <div class="stats-streak-stat"><span class="stats-mini-num">${streaks.longestBreak}d</span><span class="stats-mini-label">Longest Break</span></div>
      <div class="stats-streak-stat"><span class="stats-mini-num">${streaks.consistency}%</span><span class="stats-mini-label">Consistency</span></div>
    </div>
  `;

  const weeks = computeWeeklyBreakdown(monthEvents, daysInMonth);
  const maxWeekCount = Math.max(...weeks.map(w => w.count), 1);
  el('stats-weekly-breakdown').innerHTML = `
    <div class="stats-streak-title">Weekly Breakdown</div>
    ${weeks.map((w, i) => `
      <div class="stats-week-row">
        <span class="stats-week-label">Week ${i + 1}</span>
        <div class="stats-week-track"><div class="stats-week-fill" style="width:${w.count ? Math.max((w.count / maxWeekCount) * 100, 4) : 0}%"></div></div>
        <span class="stats-week-count">${w.dayCount}d / ${w.count} book${w.count === 1 ? '' : 's'}</span>
      </div>
    `).join('')}
  `;

  renderHeatmapGrid(monthEvents, daysInMonth);
  renderMonthlyInsights(monthEvents);
  renderStatsMonthGenreTagBreakdown(monthEvents, year, month);
}

// Genre/tag breakdown scoped to the selected month — same bar-list shape
// as the yearly and all-time versions, just filtered down to monthEvents
// (already computed by the caller for the overview/streaks/heatmap above,
// so this doesn't re-filter state.statsEvents itself).
function renderStatsMonthGenreTagBreakdown(monthEvents, year, month) {
  const genreCounts = {};
  const genreColors = {};
  const tagCounts = {};
  const tagColors = {};
  const allSeriesById = new Map(state.statsAllSeries.map(s => [s.id, s]));

  monthEvents.forEach(e => {
    e.genres.forEach(name => { genreCounts[name] = (genreCounts[name] || 0) + 1; });
    e.tags.forEach(name => { tagCounts[name] = (tagCounts[name] || 0) + 1; });
    const s = allSeriesById.get(e.seriesId);
    if (!s) return;
    s.genres.forEach(g => { if (genreCounts[g.name]) genreColors[g.name] = g.color; });
    s.tags.forEach(t => { if (tagCounts[t.name]) tagColors[t.name] = t.color; });
  });

  const monthLabel = STATS_MONTH_NAMES[month - 1];
  const genreEntries = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tagEntries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  renderStatsBarList('stats-month-genre-bars', genreEntries, {
    emptyMessage: `No genres logged for ${monthLabel} ${year} yet.`,
    colorFor: (name) => genreColors[name] || 'var(--accent)',
  });
  renderStatsBarList('stats-month-tag-bars', tagEntries, {
    emptyMessage: `No tags logged for ${monthLabel} ${year} yet.`,
    colorFor: (name) => tagColors[name] || 'var(--primary)',
  });
}

// ── Reading Profile Radar (genre "DNA") ──────────────────────────────────

function renderStatsRadar(allSeries) {
  const counts = {};
  allSeries.forEach(s => s.genres.forEach(g => { counts[g.name] = (counts[g.name] || 0) + 1; }));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const svg = el('stats-radar-svg');

  if (entries.length < 3) {
    svg.parentElement.innerHTML = `<div class="filter-option-empty">Tag a few more genres on your titles to see your reading profile.</div>`;
    return;
  }

  const n = entries.length;
  const max = entries[0][1];
  const cx = 180, cy = 160, r = 95;
  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const rings = [0.25, 0.5, 0.75, 1].map(frac => {
    const pts = entries.map((_, i) => {
      const a = angleFor(i);
      return `${(cx + Math.cos(a) * r * frac).toFixed(1)},${(cy + Math.sin(a) * r * frac).toFixed(1)}`;
    });
    return `<polygon points="${pts.join(' ')}" class="stats-radar-ring" />`;
  }).join('');

  const axes = entries.map((_, i) => {
    const a = angleFor(i);
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}" class="stats-radar-axis" />`;
  }).join('');

  const dataPts = entries.map(([, count], i) => {
    const a = angleFor(i);
    const frac = max ? count / max : 0;
    return `${(cx + Math.cos(a) * r * frac).toFixed(1)},${(cy + Math.sin(a) * r * frac).toFixed(1)}`;
  });
  const dataPolygon = `<polygon points="${dataPts.join(' ')}" class="stats-radar-data" />`;
  const dataDots = entries.map(([, count], i) => {
    const a = angleFor(i);
    const frac = max ? count / max : 0;
    return `<circle cx="${(cx + Math.cos(a) * r * frac).toFixed(1)}" cy="${(cy + Math.sin(a) * r * frac).toFixed(1)}" r="3" class="stats-radar-dot" />`;
  }).join('');

  const labels = entries.map(([name], i) => {
    const a = angleFor(i);
    const lx = cx + Math.cos(a) * (r + 32);
    const ly = cy + Math.sin(a) * (r + 32);
    const anchor = Math.cos(a) > 0.3 ? 'start' : (Math.cos(a) < -0.3 ? 'end' : 'middle');
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" class="stats-radar-label">${escapeHTML(name)}</text>`;
  }).join('');

  svg.innerHTML = rings + axes + dataPolygon + dataDots + labels;
}

// ── Status / genre / rating / year breakdowns ────────────────────────────

// Shared by the status/genre bar lists below — renders a labelled,
// color-filled horizontal bar per entry, scaled relative to the largest
// count in the set so the biggest bucket always reads as "full".
function renderStatsBarList(containerId, entries, { emptyMessage, colorFor = () => 'var(--primary)' } = {}) {
  const container = el(containerId);
  if (entries.length === 0) {
    container.innerHTML = `<div class="filter-option-empty">${emptyMessage}</div>`;
    return;
  }
  const max = entries[0][1];
  container.innerHTML = entries.map(([name, count]) => `
    <div class="stats-bar-row">
      <span class="stats-bar-label" title="${escapeHTML(name)}">${escapeHTML(name)}</span>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.max((count / max) * 100, 4)}%; background:${colorFor(name)}"></div></div>
      <span class="stats-bar-count">${count}</span>
    </div>
  `).join('');
}

function renderStatsStatusBreakdown(list) {
  const counts = {};
  list.forEach(s => { const name = s.status || 'Unknown'; counts[name] = (counts[name] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  renderStatsBarList('stats-status-bars', entries, {
    emptyMessage: 'No data yet',
    colorFor: statusColor,
  });
}

function renderStatsGenreBreakdown(list) {
  const counts = {};
  const colors = {};
  list.forEach(s => s.genres.forEach(g => {
    counts[g.name] = (counts[g.name] || 0) + 1;
    colors[g.name] = g.color;
  }));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderStatsBarList('stats-genre-bars', entries, {
    emptyMessage: 'No genres tagged yet',
    colorFor: (name) => colors[name] || 'var(--accent)',
  });
}

// All-time Top Tags — same shape as renderStatsGenreBreakdown, backed by
// each title's per-user tags instead of the shared genres list.
function renderStatsTagBreakdown(list) {
  const counts = {};
  const colors = {};
  list.forEach(s => s.tags.forEach(t => {
    counts[t.name] = (counts[t.name] || 0) + 1;
    colors[t.name] = t.color;
  }));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  renderStatsBarList('stats-tag-bars', entries, {
    emptyMessage: 'No tags added yet',
    colorFor: (name) => colors[name] || 'var(--primary)',
  });
}

function renderStatsRatingDistribution(list) {
  const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star … index 4 = 5 stars
  list.forEach(s => { if (s.rating >= 1 && s.rating <= 5) counts[s.rating - 1]++; });
  const entries = [5, 4, 3, 2, 1].map(n => [`${'★'.repeat(n)}${'☆'.repeat(5 - n)}`, counts[n - 1]]);
  if (entries.every(([, count]) => count === 0)) {
    el('stats-rating-bars').innerHTML = `<div class="filter-option-empty">No titles rated yet</div>`;
    return;
  }
  const max = Math.max(...counts, 1);
  el('stats-rating-bars').innerHTML = entries.map(([label, count]) => `
    <div class="stats-bar-row">
      <span class="stats-bar-label">${label}</span>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${count ? Math.max((count / max) * 100, 4) : 0}%"></div></div>
      <span class="stats-bar-count">${count}</span>
    </div>
  `).join('');
}

function renderStatsYearChart(list) {
  const counts = {};
  list.forEach(s => {
    if (!s.date_finished) return;
    const year = new Date(s.date_finished).getFullYear();
    if (!year || isNaN(year)) return;
    counts[year] = (counts[year] || 0) + 1;
  });
  const years = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const container = el('stats-year-chart');
  if (years.length === 0) {
    container.innerHTML = `<div class="filter-option-empty">No finish dates logged yet — set "Date Finished" on a title to see it here.</div>`;
    return;
  }
  const max = Math.max(...years.map(y => counts[y]));
  container.innerHTML = years.map(y => `
    <div class="stats-year-col">
      <span class="stats-year-count">${counts[y]}</span>
      <div class="stats-year-bar" style="height:${Math.max((counts[y] / max) * 100, 6)}%"></div>
      <span class="stats-year-label">${y}</span>
    </div>
  `).join('');
}


// ─── Series Groups (Umbrella Groups / Shared Universes) ─────────────────────
// The markup and CSS for this (collapsible umbrella cards on the library
// page, plus the group modal) already existed — this is the missing JS
// that actually drives it. Groups are library-scoped, so they're reloaded
// alongside the series list itself in loadLibrary() rather than once at
// startup.

const GROUP_ROLES = ['Main Story', 'Side Story', 'Prequel', 'Sequel', 'Spin-off', 'Companion', 'Short Story', 'Novella'];

// Reflects state.groupsSectionCollapsed onto the section itself and the
// toggle button. Only needs to run once per change (on load, and whenever
// toggled) — re-rendering the group list (renderSeriesGroupsSection) only
// replaces #series-groups-list's innerHTML, not the section's own class
// list, so the collapsed state survives every re-render for free.
function applyGroupsCollapsed() {
  dom.groupsSection.classList.toggle('collapsed', !!state.groupsSectionCollapsed);
  const btn = el('btn-groups-collapse');
  if (btn) btn.setAttribute('aria-expanded', state.groupsSectionCollapsed ? 'false' : 'true');
}

async function toggleGroupsCollapsed() {
  state.groupsSectionCollapsed = !state.groupsSectionCollapsed;
  applyGroupsCollapsed();
  await window.api.settings.set('groupsSectionCollapsed', state.groupsSectionCollapsed ? 'true' : 'false');
}

// Reflects state.charDrawerRelsCollapsed onto the Relationships section
// inside the character drawer. The drawer element itself never gets
// destroyed/rebuilt (only #drawer-body/#drawer-rels' innerHTML changes
// between characters), so this only needs to run once per load/toggle,
// not every time the drawer opens.
function applyCharDrawerRelsCollapsed() {
  const section = el('drawer-rels-section');
  if (!section) return;
  section.classList.toggle('collapsed', !!state.charDrawerRelsCollapsed);
  const btn = el('btn-drawer-rels-collapse');
  if (btn) btn.setAttribute('aria-expanded', state.charDrawerRelsCollapsed ? 'false' : 'true');
}

async function toggleCharDrawerRelsCollapsed() {
  state.charDrawerRelsCollapsed = !state.charDrawerRelsCollapsed;
  applyCharDrawerRelsCollapsed();
  await window.api.settings.set('charRelsSectionCollapsed', state.charDrawerRelsCollapsed ? 'true' : 'false');
}

async function loadSeriesGroups() {
  state.seriesGroups = await window.api.seriesGroups.getAll(state.currentLibraryId);
  renderSeriesGroupsSection();
}

// Renders the collapsible umbrella cards above the library table/grid.
// Hidden entirely when the current library has no groups, so it doesn't
// take up space for the common case of a library that isn't using this
// feature.
function renderSeriesGroupsSection() {
  const hasGroups = state.seriesGroups.length > 0;
  // The section (and its "+ New Group" button — the only entry point for
  // creating one, now that the toolbar duplicate is gone) always shows,
  // even with zero groups; otherwise there'd be no way to create the
  // first one. Only the list content below the header is conditional.
  dom.groupsSection.classList.remove('hidden');
  dom.groupsCount.textContent = `${state.seriesGroups.length} ${state.seriesGroups.length === 1 ? 'group' : 'groups'}`;

  if (!hasGroups) {
    dom.groupsList.innerHTML = `<div class="groups-empty-hint">No series groups yet — use "+ New Group" to link related titles (sequels, spin-offs, shared universes).</div>`;
    return;
  }

  dom.groupsList.innerHTML = state.seriesGroups.map(g => `
    <div class="umbrella-group-card" data-id="${g.id}">
      <div class="umbrella-group-header">
        <div class="umbrella-group-left">
          <span class="umbrella-chevron">▸</span>
          <span class="umbrella-group-title">${escapeHTML(g.name)}</span>
          <span class="umbrella-type-badge">${escapeHTML(g.group_type || 'Series Group')}</span>
        </div>
        <div class="umbrella-group-actions">
          <button type="button" class="btn btn-ghost btn-sm group-edit-btn" data-id="${g.id}">Edit</button>
        </div>
      </div>
      <div class="umbrella-group-body">
        ${g.description ? `<div class="umbrella-group-desc">${escapeHTML(g.description)}</div>` : ''}
        <div class="sub-books-grid">
          ${g.items.map(item => `
            <div class="sub-book-card">
              <div class="sub-book-cover" ${item.cover_image_path ? `data-key="${escapeHTML(item.cover_image_path)}"` : ''}>
                ${item.cover_image_path ? '' : escapeHTML((item.title || '?').charAt(0).toUpperCase())}
              </div>
              <div class="sub-book-info">
                <span class="sub-book-role-badge">${escapeHTML((item.group_role || 'Main Story').toUpperCase())}</span>
                <span class="sub-book-title">${escapeHTML(item.title)}</span>
                <div class="sub-book-meta">
                  <span class="status-badge" style="color:${statusColor(item.status)}">${escapeHTML(item.status)}</span>
                  ${item.kind === 'standalone' ? '' : `<span>${item.volume_count || 0} vol</span>`}
                </div>
                ${item.rating ? `<span class="sub-book-rating">${'★'.repeat(item.rating)}</span>` : ''}
                <button type="button" class="btn-deep-dive" data-id="${item.id}">Deep Dive →</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `).join('');

  // .sub-book-cover is a background-image div, not an <img data-key>, so
  // fillCoverImages() (which only targets img[data-key]) won't reach it —
  // fetch and apply these directly instead.
  dom.groupsList.querySelectorAll('.sub-book-cover[data-key]').forEach(async (cover) => {
    const dataUrl = await window.api.files.getImageData(cover.dataset.key);
    if (dataUrl) {
      cover.style.backgroundImage = `url('${dataUrl}')`;
      cover.textContent = '';
    }
  });

  dom.groupsList.querySelectorAll('.umbrella-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.group-edit-btn')) return;
      header.closest('.umbrella-group-card').classList.toggle('open');
    });
  });
  dom.groupsList.querySelectorAll('.group-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = state.seriesGroups.find(g => g.id === parseInt(btn.dataset.id));
      if (group) openGroupModal(group);
    });
  });
  dom.groupsList.querySelectorAll('.btn-deep-dive').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSeriesDetail(parseInt(btn.dataset.id));
    });
  });
}

function populateGroupAddBookSelect() {
  const select = el('f-g-add-book-select');
  const usedIds = new Set(state.groupItems.map(i => i.series_id));

  const available = state.allSeriesRaw.filter(s => !usedIds.has(s.id) && s.library_id === state.currentLibraryId);
  select.innerHTML = `<option value="">-- Select a title to add --</option>` +
    available.map(s => `<option value="${s.id}">${escapeHTML(s.title)}</option>`).join('');
}

function renderGroupItemsList() {
  const list = el('group-items-list');
  const empty = el('empty-group-items');
  list.querySelectorAll('.group-item-row').forEach(r => r.remove());

  if (state.groupItems.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  state.groupItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'group-item-row';
    row.dataset.seriesId = item.series_id;
    row.innerHTML = `
      <span class="group-item-title">${escapeHTML(item.title)}</span>
      <select class="group-item-role-input">
        ${GROUP_ROLES.map(r => `<option value="${escapeHTML(r)}" ${r === item.group_role ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('')}
      </select>
      <button type="button" class="group-item-remove-btn" title="Remove from group">✕</button>
    `;
    row.querySelector('.group-item-role-input').addEventListener('change', (e) => {
      item.group_role = e.target.value;
    });
    row.querySelector('.group-item-remove-btn').addEventListener('click', () => {
      state.groupItems = state.groupItems.filter(i => i.series_id !== item.series_id);
      renderGroupItemsList();
      populateGroupAddBookSelect();
    });
    list.appendChild(row);
  });
}

function addBookToGroup() {
  const select = el('f-g-add-book-select');
  const seriesId = parseInt(select.value);
  if (!seriesId) return;
  const series = state.allSeriesRaw.find(s => s.id === seriesId);
  if (!series) return;
  state.groupItems.push({ series_id: seriesId, title: series.title, group_role: 'Main Story' });
  renderGroupItemsList();
  populateGroupAddBookSelect();
}

function openGroupModal(group = null) {
  state.editingGroup = group;
  el('modal-group-title').textContent = group ? 'Edit Series Group / Universe' : 'New Series Group / Universe';
  el('f-g-name').value = group?.name || '';
  el('f-g-type').value = group?.group_type || 'Series Group';
  el('f-g-desc').value = group?.description || '';

  state.groupItems = group
    ? group.items.map(i => ({ series_id: i.id, title: i.title, group_role: i.group_role || 'Main Story' }))
    : [];
  renderGroupItemsList();
  populateGroupAddBookSelect();

  el('btn-delete-group').classList.toggle('hidden', !group);
  openModal('overlay-series-group');
  el('f-g-name').focus();
}

async function saveGroup() {
  const name = el('f-g-name').value.trim();
  if (!name) return toast('Group name is required', true);

  const d = {
    library_id: state.currentLibraryId,
    name,
    group_type: el('f-g-type').value,
    description: el('f-g-desc').value.trim(),
    items: state.groupItems.map((item, i) => ({ series_id: item.series_id, group_role: item.group_role, position: i })),
  };

  if (state.editingGroup) {
    await window.api.seriesGroups.update(state.editingGroup.id, d);
    toast('Group updated');
  } else {
    await window.api.seriesGroups.create(d);
    toast('Group added');
  }
  state.editingGroup = null;
  closeModal('overlay-series-group');
  await loadSeriesGroups();
}

function deleteGroup() {
  const group = state.editingGroup;
  if (!group) return;
  confirmDelete(`Delete "${group.name}"? This won't delete the titles in it, just the group.`, async () => {
    await window.api.seriesGroups.delete(group.id);
    toast('Group deleted');
    closeModal('overlay-series-group');
    state.editingGroup = null;
    await loadSeriesGroups();
  });
}

// ─── Series Detail ────────────────────────────────────────────────────────────

async function openSeriesDetail(id) {
  state.currentSeries = await window.api.series.get(id);
  switchView('view-series');
  switchTab('details');
  await loadSeriesData(id);
}

async function loadSeriesData(id) {
  // None of these seven reads depend on each other — fire them together
  // instead of round-tripping one at a time. On a title with a lot of
  // volumes/characters/gallery images, this was a real chunk of the delay
  // between Save and the detail view actually refreshing.
  const [s, volumes, characters, relationships, galleryImages, attachments, linkAttachments] = await Promise.all([
    window.api.series.get(id),
    window.api.volumes.getBySeries(id),
    window.api.characters.getBySeries(id),
    window.api.relationships.getBySeries(id),
    window.api.gallery.getBySeries(id),
    window.api.attachments.getBySeries(id),
    window.api.links.getBySeries(id),
  ]);
  state.currentSeries = s;
  state.volumes = volumes;
  state.characters = characters;
  state.relationships = relationships;
  state.galleryImages = galleryImages;
  state.attachments = attachments;
  state.linkAttachments = linkAttachments;
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
  dom.filesCount.textContent = state.attachments.length + state.linkAttachments.length;
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
          ${s.kind === 'series' ? `<span class="kind-badge">Series</span>` : ''}
          ${!s.date_started ? `<button type="button" class="btn btn-ghost btn-sm hero-quick-date-btn" id="btn-mark-started">+ Mark Started Today</button>` : ''}
          ${!s.date_finished ? `<button type="button" class="btn btn-ghost btn-sm hero-quick-date-btn" id="btn-mark-finished">+ Mark Finished Today</button>` : ''}
        </div>
        <h2 class="hero-title">${escapeHTML(s.title)}</h2>
        <div class="hero-author"><strong>Author:</strong> ${escapeHTML(s.author || '-')}</div>
      </div>
    </div>
  `;

  el('btn-mark-started')?.addEventListener('click', async () => {
    await quickUpdateSeriesFields({ date_started: todayISODate(), status: resolveReadingStatusName() });
    toast('Marked as started today');
  });
  el('btn-mark-finished')?.addEventListener('click', async () => {
    await quickUpdateSeriesFields({ date_finished: todayISODate(), status: resolveFinishedStatusName() });
    toast('Marked as finished today');
  });

  // Fetch and display image if a key is present
  fillCoverImages(dom.heroTop);

  const coverWrap = dom.heroTop.querySelector('.hero-cover-wrap');
  if (coverWrap) {
    coverWrap.addEventListener('click', () => {
      const img = coverWrap.querySelector('.hero-cover-img');
      if (img && img.src) {
        openLightbox(img.src, s.title);
      }
    });
  }

  renderHeroDetailsColumns(s);
}

// Fills the two-column Details tab layout: left column holds the
// descriptive/categorical fields (Tags, Genre, Synopsis, Content
// Warnings, NSFW); right column holds Rating/Status plus every
// publication-metadata field, in the requested order. Each field is only
// rendered if it's actually set, same "nothing shows if nothing's filled
// in" behavior the old single-column layout had.
function renderHeroDetailsColumns(s) {
  const leftParts = [];

  if (s.tags.length) {
    leftParts.push(`
      <div class="hero-field">
        <span class="hero-field-label">Tags</span>
        <div class="tag-list">
          ${s.tags.map(t => `<span class="tag-pill" style="color:${t.color}; border-color:${t.color}">${escapeHTML(t.name)}</span>`).join('')}
        </div>
      </div>
    `);
  }
  if (s.genres.length) {
    leftParts.push(`
      <div class="hero-field">
        <span class="hero-field-label">Genre</span>
        <div class="tag-list">
          ${s.genres.map(g => `<span class="genre-pill" style="background:${g.color}">${escapeHTML(g.name)}</span>`).join('')}
        </div>
      </div>
    `);
  }
  if (s.content_warnings && s.content_warnings.length) {
    leftParts.push(`
      <div class="hero-field">
        <span class="hero-field-label">Content Warnings</span>
        <div class="tag-list">
          ${s.content_warnings.map(w => `<span class="warning-pill">${escapeHTML(w.name)}</span>`).join('')}
        </div>
      </div>
    `);
  }
  if (s.is_nsfw) {
    leftParts.push(`
      <div class="hero-field">
        <span class="hero-field-label">NSFW</span>
        <span class="warning-pill">Yes</span>
      </div>
    `);
  }
  if (s.synopsis) {
    leftParts.push(`
      <div class="hero-field">
        <span class="hero-field-label">Synopsis</span>
        <div class="hero-synopsis">${nl2br(s.synopsis)}</div>
      </div>
    `);
  }


  dom.heroDetailsRight.innerHTML = leftParts.length
    ? leftParts.join('')
    : `<p class="empty-dim">No tags, genres, warnings, or synopsis added yet.</p>`;

  const items = [];
  if (s.rating) items.push({ label: 'Rating', starRating: s.rating });
  if (s.kind === 'standalone' && s.standalone_chapter_count) items.push({ label: 'Chapter Count', value: s.standalone_chapter_count });
  if (s.book_type) items.push({ label: 'Book Type', value: s.book_type });
  if (s.fandom) items.push({ label: 'Fandom(s)', value: s.fandom });
  if (s.date_started) items.push({ label: 'Date Started', value: formatDate(s.date_started), editableDateField: 'date_started', rawDate: s.date_started });
  if (s.date_finished) items.push({ label: 'Date Finished', value: formatDate(s.date_finished), editableDateField: 'date_finished', rawDate: s.date_finished });
  if (s.artist) items.push({ label: 'Artist(s)', value: s.artist });
  if (s.year_published) items.push({ label: 'Year Published', value: s.year_published });
  if (s.original_language) items.push({ label: 'Original Language', value: s.original_language });
  if (s.country_of_origin) items.push({ label: 'Country of Origin', value: s.country_of_origin });
  if (s.language_read && s.language_read !== 'English') items.push({ label: 'Language Read', value: s.language_read });
  if (s.status_country_of_origin) items.push({ label: 'Status in Country of Origin', value: s.status_country_of_origin });
  if (s.licensed_english) items.push({ label: 'Licensed to English?', value: s.licensed_english });
  if (s.completely_translated) items.push({ label: 'Completely Translated?', value: s.completely_translated });
  if (s.original_publisher) items.push({ label: 'Original Publisher', value: s.original_publisher });
  if (s.english_publisher) items.push({ label: 'English Publisher', value: s.english_publisher });

  dom.heroDetailsLeft.innerHTML = items.map(item => `
    <div class="hero-field">
      <span class="hero-field-label">${escapeHTML(item.label)}</span>
      ${item.starRating
      ? `<div class="rating-stars readonly" data-stars="${item.starRating}"></div>`
      : item.statusBadge
        ? `<span class="status-badge" style="color:${statusColor(item.statusBadge)}">${escapeHTML(item.statusBadge)}</span>`
        : item.editableDateField
          ? `<span class="hero-extra-value hero-extra-value-editable" data-date-field="${item.editableDateField}" data-raw-date="${item.rawDate}" title="Click to change">${escapeHTML(item.value)} ✎</span>`
          : `<span class="hero-extra-value">${escapeHTML(item.value)}</span>`}
    </div>
  `).join('');

  dom.heroDetailsLeft.querySelectorAll('.rating-stars[data-stars]').forEach(elm => {
    renderRatingStars(elm, parseInt(elm.dataset.stars), { readonly: true });
  });

  // Click a date value to swap it for a live date picker in place —
  // avoids opening the full Edit modal just to nudge a date by a day.
  dom.heroDetailsLeft.querySelectorAll('.hero-extra-value-editable').forEach(span => {
    span.addEventListener('click', () => {
      const field = span.dataset.dateField;
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'hero-extra-date-input';
      input.value = span.dataset.rawDate || '';
      span.replaceWith(input);
      input.focus();

      const commit = async () => {
        const newValue = input.value || null;
        await quickUpdateSeriesField(field, newValue);
        toast('Date updated');
      };
      input.addEventListener('change', commit);
      input.addEventListener('blur', () => {
        // If nothing changed, just restore the original span rather than
        // re-fetching from the server for a no-op edit.
        if (input.value === (span.dataset.rawDate || '')) input.replaceWith(span);
      });
    });
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
    ${s.chapter_thoughts ? `<div class="vol-detail-section"><h4>Chapter Notes</h4> ${renderChapterNotesTimeline(s.chapter_thoughts)}</div>` : ''}`
  fillCoverImages(view);
}

function openStandaloneThoughtsModal() {
  el('f-standalone-thoughts').value = state.currentSeries.overall_thoughts || '';
  state.standaloneNotesEntries = parseTimelineEntries(state.currentSeries.chapter_thoughts || '');
  el('f-standalone-chapter-notes-new').value = '';
  renderTimelineNotesInput('standaloneNotesEntries', 'standalone-timeline-notes-list', 'f-standalone-chapter-notes', 'f-standalone-chapter-notes-counter');
  openModal('overlay-standalone-thoughts');
  refreshCharCounters('f-standalone-thoughts');
  el('f-standalone-thoughts').focus();
}

// Applies one or more field overrides to the current series without
// needing the full Edit modal. Builds the same complete payload
// seriesUpdate expects from the existing series object, then overrides
// whatever's in `overrides` — lets a single quick action (like "Mark
// Finished Today") update two related fields (date_finished + status) in
// one call instead of two separate round trips.
async function quickUpdateSeriesFields(overrides) {
  const s = state.currentSeries;
  const d = {
    title: s.title,
    author: s.author,
    status: s.status,
    synopsis: s.synopsis,
    tags: s.tags.map(t => t.name),
    genres: s.genres.map(g => g.name),
    content_warnings: s.content_warnings.map(w => w.name),
    library_id: s.library_id,
    kind: s.kind,
    overall_thoughts: s.overall_thoughts,
    chapter_thoughts: s.chapter_thoughts,
    cover_image_path: s.cover_image_path,
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
    is_nsfw: s.is_nsfw,
    standalone_chapter_count: s.standalone_chapter_count,
    fandom: s.fandom,
    ...overrides,
  };
  await window.api.series.update(s.id, d);
  await loadSeriesData(s.id);
}

// Thin single-field wrapper — kept so the inline date-edit handler in
// renderHeroDetailsColumns() doesn't need to change.
async function quickUpdateSeriesField(field, value) {
  return quickUpdateSeriesFields({ [field]: value });
}

// Today's date as YYYY-MM-DD, matching what <input type="date"> stores.

function todayISODate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
    chapter_thoughts: state.standaloneNotesEntries.join('\n\n').trim(),
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
    is_nsfw: s.is_nsfw,
    standalone_chapter_count: s.standalone_chapter_count,
    fandom: s.fandom,
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

async function loadContentWarnings() {
  state.allWarnings = await window.api.contentWarnings.getAll();
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

function resolveFinishedStatusName() {
  const match = state.allStatuses.find(s => /finish|complet|done/i.test(s.name));
  return match ? match.name : 'Finished';
}

function resolveReadingStatusName() {
  const match = state.allStatuses.find(s => /read/i.test(s.name) && !/to.?read|tbr/i.test(s.name));
  return match ? match.name : 'Reading';
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
    const filterAffected = prevStatus && state.filterStatus === prevStatus.name && name !== prevStatus.name;

    await window.api.statuses.update(id, { name, color });
    await loadStatuses();
    renderStatusManageList();
    if (filterAffected) {
      state.filterStatus = 'All';
      updateFilterBadges();
    }
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
      if (state.filterStatus === s.name) {
        state.filterStatus = 'All';
        updateFilterBadges();
      }
      renderStatusFilterButtons();
      toast('Status deleted');
      if (el('view-library').classList.contains('active')) loadLibrary();
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

  const moreCount = state.filterBookTypes.length + state.filterFandoms.length + state.filterLanguages.length + state.filterCountries.length
    + state.filterAuthors.length + state.filterArtists.length + state.filterPublishers.length
    + state.filterTranslated.length + state.filterNsfw.length + (state.filterRating > 0 ? 1 : 0)
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

// Renders the tag suggestion dropdown. Fires on 'input' (typing) AND on
// 'focus' (clicking/tabbing into an empty field) so that focusing the
// field alone is enough to "autofill" — i.e. browse the existing tag
// vocabulary — rather than requiring the person to already know and start
// typing a tag name before anything appears.
function handleTagInput(e) {
  const val = e.target.value.toLowerCase().trim();

  const matches = state.allTags.filter(t =>
    (!val || t.name.toLowerCase().includes(val))
    && !state.selectedTags.some(st => st.name.toLowerCase() === t.name.toLowerCase())
  );

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
  const trimmed = name.slice(0, MAX_TAG_LENGTH).trim();
  if (!trimmed) return;
  // If an existing tag matches case-insensitively (e.g. typing "modern"
  // when "Modern" already exists), snap to that tag's exact stored name
  // and color instead of adding what would otherwise look like a brand
  // new, differently-cased duplicate. The database already dedupes tags
  // case-insensitively on save, but doing it here too means the chip
  // shows the canonical casing immediately, not just after a reload.
  const existing = state.allTags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
  const tagToAdd = existing ? { id: existing.id, name: existing.name, color: existing.color } : { name: trimmed };
  if (!state.selectedTags.some(t => t.name.toLowerCase() === tagToAdd.name.toLowerCase())) {
    state.selectedTags.push(tagToAdd);
  }
  dom.tagInput.value = '';
  dom.tagDropdown.classList.add('hidden');
  renderTagChips();
}

// ─── Content Warnings (series form) ────────────────────────────────────────
// Mirrors the Tags input above exactly (chip list + autocomplete dropdown
// + Enter-to-add), just backed by state.allWarnings/state.selectedWarnings
// and the contentWarnings IPC channel instead of tags. Kept as a separate
// set of functions rather than generalizing the tag helpers, since the two
// already diverge in styling (warnings always render as a fixed danger-red
// pill — see .warning-chip/.warning-pill in style.css — rather than tags'
// per-name palette color).

const MAX_WARNING_LENGTH = 60;

function renderWarningChips() {
  dom.warningChips.innerHTML = state.selectedWarnings.map(w => `
    <div class="tag-chip warning-chip">
      ${escapeHTML(w.name)}
      <span class="tag-chip-remove" data-name="${escapeHTML(w.name)}">✕</span>
    </div>
  `).join('');
  dom.warningChips.querySelectorAll('.tag-chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.dataset.name;
      state.selectedWarnings = state.selectedWarnings.filter(w => w.name !== name);
      renderWarningChips();
    });
  });
}

// Same "focus also shows suggestions" behavior as handleTagInput above —
// see the comment there for why.
function handleWarningInput(e) {
  const val = e.target.value.toLowerCase().trim();

  const matches = state.allWarnings.filter(w =>
    (!val || w.name.toLowerCase().includes(val))
    && !state.selectedWarnings.some(sw => sw.name.toLowerCase() === w.name.toLowerCase())
  );

  if (matches.length > 0) {
    dom.warningDropdown.innerHTML = matches.map(w => `<div class="tag-option">${escapeHTML(w.name)}</div>`).join('');
    dom.warningDropdown.querySelectorAll('.tag-option').forEach(opt => {
      opt.addEventListener('click', () => {
        addWarning(opt.textContent);
      });
    });
    dom.warningDropdown.classList.remove('hidden');
  } else {
    dom.warningDropdown.classList.add('hidden');
  }
}

function handleWarningKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (val) addWarning(val);
  }
}

function addWarning(name) {
  const trimmed = name.slice(0, MAX_WARNING_LENGTH).trim();
  if (!trimmed) return;
  // Same case-insensitive snap-to-existing behavior as addTag() above —
  // see the comment there.
  const existing = state.allWarnings.find(w => w.name.toLowerCase() === trimmed.toLowerCase());
  const warningToAdd = existing ? { id: existing.id, name: existing.name } : { name: trimmed };
  if (!state.selectedWarnings.some(w => w.name.toLowerCase() === warningToAdd.name.toLowerCase())) {
    state.selectedWarnings.push(warningToAdd);
  }
  dom.warningInput.value = '';
  dom.warningDropdown.classList.add('hidden');
  renderWarningChips();
}

const MAX_FANDOM_LENGTH = 200;

function renderFandomChips() {
  dom.fandomChips.innerHTML = state.selectedFandoms.map(f => `
    <div class="tag-chip">
      ${escapeHTML(f)}
      <span class="tag-chip-remove" data-name="${escapeHTML(f)}">✕</span>
    </div>
  `).join('');
  dom.fandomChips.querySelectorAll('.tag-chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.target.dataset.name;
      state.selectedFandoms = state.selectedFandoms.filter(f => f !== name);
      renderFandomChips();
    });
  });
}

function handleFandomInput(e) {
  const val = e.target.value.toLowerCase().trim();
  const matches = state.allFandoms.filter(f =>
    (!val || f.toLowerCase().includes(val))
    && !state.selectedFandoms.some(sf => sf.toLowerCase() === f.toLowerCase())
  );
  if (matches.length > 0) {
    dom.fandomDropdown.innerHTML = matches.map(f => `<div class="tag-option">${escapeHTML(f)}</div>`).join('');
    dom.fandomDropdown.querySelectorAll('.tag-option').forEach(opt => {
      opt.addEventListener('click', () => addFandom(opt.textContent));
    });
    dom.fandomDropdown.classList.remove('hidden');
  } else {
    dom.fandomDropdown.classList.add('hidden');
  }
}

function handleFandomKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (val) addFandom(val);
  }
}

function addFandom(name) {
  const trimmed = name.slice(0, MAX_FANDOM_LENGTH).trim();
  if (!trimmed) return;
  const existing = state.allFandoms.find(f => f.toLowerCase() === trimmed.toLowerCase());
  const fandomToAdd = existing || trimmed;
  if (!state.selectedFandoms.some(f => f.toLowerCase() === fandomToAdd.toLowerCase())) {
    state.selectedFandoms.push(fandomToAdd);
  }
  dom.fandomInput.value = '';
  dom.fandomDropdown.classList.add('hidden');
  renderFandomChips();
}

// ─── Book Type (free-text field with a suggestion list) ────────────────────
// f-s-booktype is a plain <input list="book-type-options">, not a <select>,
// so a custom value has always been fully typeable and savable — but the
// datalist's suggestions were a fixed, hardcoded set. That meant a custom
// type you'd already used (e.g. "Webtoon") was never offered back to you as
// a suggestion, which made custom types feel unsupported even though they
// worked. This keeps the suggestion list current: the starter set, plus
// every distinct book_type this signed-in user has already used.
//
// Deliberately scoped to THIS user only, across all of their own
// categories/libraries — never shared globally the way genres are (see the
// README's note that genres are "the one exception" that's shared/global).
// window.api.series.getAll({ }) with no libraryId returns every series this
// account owns; main.js's requireUser() already enforces that server-side,
// so this can never pick up another account's book types.
const BOOK_TYPE_SEED_OPTIONS = ['Novel', 'Light Novel', 'Web Novel', 'Graphic Novel', 'Manga', 'Manhwa', 'Manhua', 'Comic', 'Fanfic'];

async function loadBookTypes() {
  const allOwnSeries = await window.api.series.getAll({});
  state.allBookTypes = [...new Set(allOwnSeries.map(s => (s.book_type || '').trim()).filter(Boolean))];
  // Fandom is now a multi-value, comma-delimited field (see
  // parseFandomList) — split each series's value into individual tokens
  // before deduping, so autocomplete offers "Harry Potter" and "Naruto"
  // separately rather than the whole combo string as one suggestion.
  const fandomSet = new Set();
  allOwnSeries.forEach(s => parseFandomList(s.fandom).forEach(f => fandomSet.add(f)));
  state.allFandoms = [...fandomSet];
}

function renderBookTypeOptions() {
  const all = [...new Set([...BOOK_TYPE_SEED_OPTIONS, ...state.allBookTypes])]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const datalist = el('book-type-options');
  if (datalist) datalist.innerHTML = all.map(t => `<option value="${escapeHTML(t)}">`).join('');
}



// Fandom only makes sense for Fanfic-type titles — shown/hidden live as
// the Book Type field changes, same idea as the cover/chapter-count
// fields toggling on Series vs Standalone.
function applyFandomFieldVisibility() {
  const isFanfic = el('f-s-booktype').value.trim().toLowerCase() === 'fanfic';
  el('fandom-group').classList.toggle('hidden', !isFanfic);
}

// ─── Character "Appearances" field label/placeholder ───────────────────────
// The same field (f-c-vols → data column `volume_appearances`) is reused
// for both series (which have volumes) and standalone titles (which don't
// — they only have chapters). Rather than adding a second column, this
// keeps the underlying storage/name unchanged and just swaps what the
// field is CALLED depending on state.currentSeries.kind, so a character on
// a standalone book says "Chapter Appearances" (e.g. "Ch. 1, 5, 12")
// instead of the series-oriented "Volume Appearances" (e.g. "Vol. 1, 3, 5").
function applyCharVolsFieldLabel() {
  const isStandalone = state.currentSeries?.kind === 'standalone';
  const label = el('label-f-c-vols');
  const input = el('f-c-vols');
  if (label) label.textContent = isStandalone ? 'Chapter Appearances' : 'Volume Appearances';
  if (input) input.placeholder = isStandalone ? 'e.g. Ch. 1, 5, 12' : 'e.g. Vol. 1, 3, 5';
}

function openSeriesModal(series = null) {
  el('modal-series-title').textContent = series
    ? (series.kind === 'standalone' ? 'Edit Standalone Title' : 'Edit Title')
    : 'Add New Title';
  el('f-s-title').value = series?.title || '';
  el('f-s-author').value = series?.author || '';
  renderStatusSelectOptions(series?.status);
  el('f-s-synopsis').value = series?.synopsis || '';

  const kind = series?.kind || 'standalone';
  el('f-s-kind').value = kind;
  document.querySelectorAll('#f-s-kind-chips .type-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.kind === kind);
    chip.classList.toggle('disabled', !!series);
  });
  el('kind-locked-hint').classList.toggle('hidden', !series);

  el('series-cover-group').classList.toggle('hidden', kind !== 'standalone');
  el('f-s-cover').value = series?.cover_image_path || '';
  el('standalone-chapter-count-group').classList.toggle('hidden', kind !== 'standalone');
  el('f-s-chapter-count').value = series?.standalone_chapter_count || '';

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
  dom.tagDropdown.classList.add('hidden');

  state.selectedGenres = series ? series.genres.map(g => g.name) : [];
  renderGenreSwatches();

  state.selectedWarnings = series ? [...series.content_warnings] : [];
  renderWarningChips();
  dom.warningInput.value = '';
  dom.warningDropdown.classList.add('hidden');

  // Additional details (all optional)
  state.selectedRating = series?.rating || 0;
  renderRatingStars(el('f-s-rating-stars'), state.selectedRating, {
    onChange: (n) => { state.selectedRating = n; el('f-s-rating').value = n; },
  });
  el('f-s-rating').value = state.selectedRating;
  renderBookTypeOptions();
  el('f-s-booktype').value = series?.book_type || '';
  state.selectedFandoms = series ? parseFandomList(series.fandom) : [];
  renderFandomChips();
  dom.fandomInput.value = '';
  dom.fandomDropdown.classList.add('hidden');
  applyFandomFieldVisibility();
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
  el('f-s-nsfw').value = series?.is_nsfw ? '1' : '0';
  // Collapse back to closed each time the modal opens, unless any of these
  // fields are already filled in — then leave it open so edits are visible.
  const hasExtraDetails = state.selectedRating || series?.book_type || series?.date_started || series?.date_finished
    || series?.artist || series?.year_published || series?.original_language || series?.country_of_origin
    || (series?.language_read && series.language_read !== 'English') || series?.status_country_of_origin
    || series?.licensed_english || series?.completely_translated || series?.original_publisher || series?.english_publisher
    || series?.is_nsfw;
  el('series-extra-details') && (el('series-extra-details').open = !!hasExtraDetails);

  // Category selection
  const libSelect = el('f-s-library');
  if (libSelect) {
    libSelect.innerHTML = state.libraries.map(l => `
      <option value="${l.id}" ${(series ? series.library_id === l.id : state.currentLibraryId === l.id) ? 'selected' : ''}>
        ${escapeHTML(l.name)}
      </option>
    `).join('');
  }

  openModal('overlay-series');
  refreshCharCounters('f-s-title', 'f-s-author', 'f-s-synopsis');
  el('f-s-title').focus();
}

async function saveSeries() {
  const selectedLibId = parseInt(el('f-s-library')?.value) || state.currentLibraryId;
  const d = {
    title: el('f-s-title').value.trim(),
    author: el('f-s-author').value.trim(),
    status: el('f-s-status').value,
    synopsis: el('f-s-synopsis').value.trim(),
    tags: state.selectedTags.map(t => t.name),
    genres: state.selectedGenres,
    content_warnings: state.selectedWarnings.map(w => w.name),
    library_id: selectedLibId,
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
    fandom: el('f-s-booktype').value.trim().toLowerCase() === 'fanfic' ? (state.selectedFandoms.join(', ') || null) : null,
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
    is_nsfw: el('f-s-nsfw').value === '1',
    standalone_chapter_count: el('f-s-kind').value === 'standalone'
      ? (parseInt(el('f-s-chapter-count').value) || null)
      : null,
  };
  if (!d.title) return toast('Title is required', true);

  if (state.currentSeries && el('modal-series-title').textContent.includes('Edit')) {
    const oldLibId = state.currentSeries.library_id || state.currentLibraryId;
    await window.api.series.update(state.currentSeries.id, d);
    if (selectedLibId !== oldLibId) {
      const targetLibName = state.libraries.find(l => l.id === selectedLibId)?.name || 'category';
      toast(`Title updated and moved to ${targetLibName}`);
      closeModal('overlay-series');
      await loadLibraries();
      state.currentLibraryId = selectedLibId;
      renderSidebarNav();
      applyCurrentLibraryHeader();
      await openSeriesDetail(state.currentSeries.id);
    } else {
      toast('Title updated');
      closeModal('overlay-series');
      loadSeriesData(state.currentSeries.id);
    }
  } else {
    await window.api.series.create(d);
    toast('Title added');
    closeModal('overlay-series');
    if (selectedLibId !== state.currentLibraryId) {
      await loadLibraries();
      switchLibrary(selectedLibId);
    }
  }
  // Book Type no longer re-fetches this user's entire library (across
  // every category) just to recompute the autocomplete list — we already
  // know the exact value that was just saved, so fold it into the
  // in-memory list directly instead.
  if (d.book_type && !state.allBookTypes.includes(d.book_type)) {
    state.allBookTypes.push(d.book_type);
  }
  if (d.fandom) {
    parseFandomList(d.fandom).forEach(f => {
      if (!state.allFandoms.includes(f)) state.allFandoms.push(f);
    });
  }
  loadTags();
  loadGenres();
  loadContentWarnings();
  if (el('view-library').classList.contains('active')) loadLibrary();
}

// ─── Transfer / Copy Modal ───────────────────────────────────────────────────

let transferTargetSeries = null;
let transferMode = 'transfer'; // 'transfer' | 'copy'

function openTransferModal(series = state.currentSeries) {
  if (!series) return;
  transferTargetSeries = series;
  transferMode = 'transfer';

  el('transfer-book-title').textContent = series.title || 'Untitled';
  const currentLib = state.libraries.find(l => l.id === (series.library_id || state.currentLibraryId));
  el('transfer-current-category').textContent = currentLib ? `(currently in: ${currentLib.name})` : '';

  // Reset action chips
  document.querySelectorAll('#transfer-action-chips .type-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.action === 'transfer');
  });
  el('transfer-action-hint').textContent = 'Moves this book and all its volumes, characters, and notes into the new category.';
  el('transfer-copy-options').classList.add('hidden');
  el('btn-submit-transfer').textContent = 'Transfer Book';
  el('modal-transfer-title').textContent = 'Transfer / Copy Book';

  // Populate target library dropdown
  const targetSelect = el('f-transfer-target-lib');
  const availableLibs = state.libraries;
  targetSelect.innerHTML = availableLibs.map(l => {
    const isCurrent = l.id === (series.library_id || state.currentLibraryId);
    return `<option value="${l.id}" ${isCurrent ? 'disabled' : ''}>${escapeHTML(l.name)} ${isCurrent ? '(Current Category)' : ''}</option>`;
  }).join('');

  // Default selection to first non-current category
  const firstOther = availableLibs.find(l => l.id !== (series.library_id || state.currentLibraryId));
  if (firstOther) {
    targetSelect.value = firstOther.id;
  } else if (availableLibs.length > 0) {
    targetSelect.value = availableLibs[0].id;
  }

  // Reset copy checkboxes
  el('f-copy-opt-volumes').checked = true;
  el('f-copy-opt-characters').checked = true;
  el('f-copy-opt-gallery').checked = true;

  openModal('overlay-transfer-series');
}

async function handleTransferOrCopySubmit() {
  if (!transferTargetSeries) return;
  const targetLibId = parseInt(el('f-transfer-target-lib').value);
  if (!targetLibId) return toast('Please select a destination category', true);

  const targetLib = state.libraries.find(l => l.id === targetLibId);
  const targetLibName = targetLib ? targetLib.name : 'selected category';

  try {
    if (transferMode === 'transfer') {
      if (targetLibId === (transferTargetSeries.library_id || state.currentLibraryId)) {
        return toast('Book is already in that category', true);
      }
      await window.api.series.transfer(transferTargetSeries.id, targetLibId);
      toast(`Transferred "${transferTargetSeries.title}" to ${targetLibName}`);
      closeModal('overlay-transfer-series');

      await loadLibraries();
      if (state.currentSeries && state.currentSeries.id === transferTargetSeries.id) {
        state.currentLibraryId = targetLibId;
        renderSidebarNav();
        applyCurrentLibraryHeader();
        await openSeriesDetail(transferTargetSeries.id);
      } else {
        await loadLibrary();
      }
    } else {
      const opts = {
        includeVolumes: el('f-copy-opt-volumes').checked,
        includeCharacters: el('f-copy-opt-characters').checked,
        includeGallery: el('f-copy-opt-gallery').checked,
        includeAttachments: el('f-copy-opt-gallery').checked,
      };
      await window.api.series.copy(transferTargetSeries.id, targetLibId, opts);
      toast(`Copied "${transferTargetSeries.title}" to ${targetLibName}`);
      closeModal('overlay-transfer-series');

      await loadLibraries();
      if (targetLibId === state.currentLibraryId) {
        await loadLibrary();
      }
    }
  } catch (err) {
    toast(err.message || 'Operation failed', true);
  }
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
  state.volNotesEntries = parseTimelineEntries(vol?.chapter_notes || '');

  el('f-v-notes-new').value = '';
  renderTimelineNotesInput('volNotesEntries', 'timeline-notes-list', 'f-v-notes', 'f-v-notes-counter');
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
  refreshCharCounters('f-v-title', 'f-v-chapters', 'f-v-thoughts');
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
    chapter_notes: state.volNotesEntries.join('\n\n').trim(),
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
    html += `<div class="vol-detail-section"><h4>Chapter Notes</h4>${renderChapterNotesTimeline(v.chapter_notes)}</div>`;
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
              ${c.life_status ? `<div class="char-life-status ${lifeStatusClass(c.life_status)}">${escapeHTML(c.life_status)}</div>` : ''}
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
// tiles, useful for series with a large cast. The volume/chapter
// appearances subtitle mirrors whichever wording the current title uses
// (see applyCharVolsFieldLabel) so a standalone book's characters read
// "No chapter appearances noted" instead of the series-oriented default.
function renderCharactersList() {
  const list = dom.charList;
  if (state.characters.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>No characters yet</h3></div>`;
    return;
  }

  const isStandalone = state.currentSeries?.kind === 'standalone';
  const noAppearancesText = isStandalone ? 'No chapter appearances noted' : 'No volume appearances noted';

  list.innerHTML = state.characters.map(c => `
            <div class="character-list-row" data-id="${c.id}">
              <div class="character-list-avatar">
                ${c.profile_image_path ? `<img data-key="${escapeHTML(c.profile_image_path)}" alt="${escapeHTML(c.name)}">` : `<span class="char-avatar-fallback">${c.name.charAt(0).toUpperCase()}</span>`}
              </div>
              <div class="character-list-info">
                <div class="character-list-name">${escapeHTML(c.name)}</div>
                <div class="character-list-meta">${[c.age ? `Age ${escapeHTML(c.age)}` : '', c.volume_appearances ? escapeHTML(c.volume_appearances) : noAppearancesText].filter(Boolean).join(' · ')}</div>
              </div>
              ${c.life_status ? `<span class="char-life-status ${lifeStatusClass(c.life_status)}">${escapeHTML(c.life_status)}</span>` : ''}
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

// Renders the two separate fields as labeled blocks. Falls back to
// best-effort formatting of legacy combined text (old accounts/characters
// that predate the appears_text/reality_text split) so nothing already
// saved just disappears from the drawer.
function formatAppearsVsReality(c) {
  if (c.appears_text || c.reality_text) {
    const parts = [];
    if (c.appears_text) parts.push(`<p class="lore-contrast-line"><strong>Appears:</strong> ${nl2br(c.appears_text)}</p>`);
    if (c.reality_text) parts.push(`<p class="lore-contrast-line"><strong>Reality:</strong> ${nl2br(c.reality_text)}</p>`);
    return parts.join('');
  }
  if (!c.appears_vs_reality) return '';
  const lines = c.appears_vs_reality.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const match = line.match(/^(Appears|Reality|Facade|Truth|Public|Private|Outer|Inner):\s*(.*)$/i);
    if (match) {
      return `<p class="lore-contrast-line"><strong>${escapeHTML(match[1])}:</strong> ${escapeHTML(match[2])}</p>`;
    }
    return `<p class="lore-contrast-line">${escapeHTML(line)}</p>`;
  }).join('');
}

function formatPersonality(text) {
  if (!text) return '';
  let trimmed = text.trim();
  const hasLeadingEmoji = /^[\p{Emoji}\u2728\u2B50\u2705\u274C\u2600-\u26FF]/u.test(trimmed);
  const prefix = hasLeadingEmoji ? '' : '✨ ';
  return `${prefix}${nl2br(trimmed)}`;
}

function openCharModal(char = null) {
  el('modal-char-title').textContent = char ? 'Edit Character' : 'Add Character';
  el('f-c-name').value = char?.name || '';
  el('f-c-role').value = char?.role || 'Side';
  el('f-c-vols').value = char?.volume_appearances || '';
  applyCharVolsFieldLabel();
  el('f-c-age').value = char?.age || '';
  el('f-c-life-status').value = char?.life_status || '';
  el('f-c-status-role').value = char?.status_role || '';
  el('f-c-overall-vibes').value = char?.overall_vibes || '';
  // If this character only has old-style combined data (no appears_text/
  // reality_text yet, but a legacy appears_vs_reality value exists),
  // best-effort split it on the old "Appears:"/"Reality:" markers so
  // editing doesn't start from a blank slate — otherwise use the new
  // fields directly.
  if (char && !char.appears_text && !char.reality_text && char.appears_vs_reality) {
    const legacy = char.appears_vs_reality;
    const appearsMatch = legacy.match(/Appears:\s*([\s\S]*?)(?:\n\s*\n|Reality:|$)/i);
    const realityMatch = legacy.match(/Reality:\s*([\s\S]*)$/i);
    el('f-c-appears').value = appearsMatch ? appearsMatch[1].trim() : legacy.trim();
    el('f-c-reality').value = realityMatch ? realityMatch[1].trim() : '';
  } else {
    el('f-c-appears').value = char?.appears_text || '';
    el('f-c-reality').value = char?.reality_text || '';
  }
  el('f-c-personality').value = char?.personality || '';
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
  refreshCharCounters(
    'f-c-name', 'f-c-vols', 'f-c-status-role', 'f-c-overall-vibes',
    'f-c-appears', 'f-c-reality', 'f-c-personality', 'f-c-notes'
  );
  el('f-c-name').focus();
}

async function saveCharacter() {
  const d = {
    series_id: state.currentSeries.id,
    name: el('f-c-name').value.trim(),
    role: el('f-c-role').value,
    volume_appearances: el('f-c-vols').value.trim(),
    status_role: el('f-c-status-role').value.trim(),
    overall_vibes: el('f-c-overall-vibes').value.trim(),
    appears_text: el('f-c-appears').value.trim(),
    reality_text: el('f-c-reality').value.trim(),
    personality: el('f-c-personality').value.trim(),
    notes: el('f-c-notes').value.trim(),
    profile_image_path: el('f-c-img').value || null,
    age: el('f-c-age').value.trim(),
    life_status: el('f-c-life-status').value.trim(),
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

// Maps a free-text life status to a fixed color category for its badge —
// same "unknown value still gets a sensible color" approach as
// relCategory() for relationship types above. Anything not recognized
// (including custom values like "Reincarnated" or a blank field) falls
// into 'other' rather than guessing.
function lifeStatusClass(status) {
  const s = (status || '').trim().toLowerCase();
  if (s === 'alive') return 'alive';
  if (s === 'dead' || s === 'deceased') return 'dead';
  if (s === 'unknown') return 'unknown';
  return 'other';
}

async function openCharDrawer(c) {
  state.currentCharacter = c;
  const coverSrc = c.profile_data_url
    || (c.profile_image_path ? await window.api.files.getImageData(c.profile_image_path) : null);

  const statusRoleHtml = c.status_role
    ? nl2br(c.status_role)
    : (c.role ? `<strong>${escapeHTML(c.role)}</strong>` : '');

  const appearancesLabel = state.currentSeries?.kind === 'standalone' ? 'APPEARS IN (CHAPTERS)' : 'APPEARS IN';

  dom.drawerBody.innerHTML = `
            <div class="lore-header">
              <div class="lore-eyebrow">DEEP DIVE</div>
              <h2 class="lore-title">Character Lore</h2>
              <div class="lore-divider"></div>
            </div>

            <div class="lore-hero">
              <div class="lore-portrait-card">
                <div class="lore-portrait-badge">${escapeHTML(c.name)}</div>
                <div class="lore-portrait-img-wrap" style="${coverSrc ? `background-image: url('${coverSrc}')` : ''}">
                  ${!coverSrc ? `<span class="char-avatar-fallback">${c.name.charAt(0).toUpperCase()}</span>` : ''}
                </div>
              </div>

              <div class="lore-hero-meta">
                ${(c.age || c.life_status) ? `
                  <div class="lore-block lore-vitals">
                    ${c.life_status ? `<span class="char-life-status ${lifeStatusClass(c.life_status)}">${escapeHTML(c.life_status)}</span>` : ''}
                    ${c.age ? `<span class="lore-age">Age: ${escapeHTML(c.age)}</span>` : ''}
                  </div>
                ` : ''}
                ${statusRoleHtml ? `
                  <div class="lore-block">
                    <div class="lore-label">STATUS &amp; ROLE</div>
                    <div class="lore-status-text">${statusRoleHtml}</div>
                  </div>
                ` : ''}

                ${c.overall_vibes ? `
                  <div class="lore-sep"></div>
                  <div class="lore-block">
                    <div class="lore-label">OVERALL VIBES</div>
                    <div class="lore-vibes-quote">“${escapeHTML(c.overall_vibes.replace(/^["“”]|["“”]$/g, ''))}”</div>
                  </div>
                ` : ''}
              </div>
            </div>

            ${(c.appears_text || c.reality_text || c.appears_vs_reality) ? `
      <div class="lore-section lore-contrast-section">
        <div class="lore-label">APPEARS VS. REALITY</div>
        <div class="lore-contrast-card">
          <div class="lore-contrast-content">
            ${formatAppearsVsReality(c)}
          </div>
        </div>
      </div>
    ` : ''}

            ${c.personality ? `
      <div class="lore-section">
        <div class="lore-label">PERSONALITY</div>
        <div class="lore-personality-card">
          <div class="lore-personality-text">${formatPersonality(c.personality)}</div>
        </div>
      </div>
    ` : ''}

            ${c.volume_appearances ? `
      <div class="lore-section">
        <div class="lore-label">${escapeHTML(appearancesLabel)}</div>
        <div class="lore-simple-meta">${escapeHTML(c.volume_appearances)}</div>
      </div>
    ` : ''}

            ${c.notes ? `
      <div class="lore-section">
        <div class="lore-label">ADDITIONAL NOTES</div>
        <div class="lore-notes-body">${nl2br(c.notes)}</div>
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
  image: '<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  audio: '<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />',
  video: '<polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />',
  archive: '<path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><line x1="10" y1="12" x2="14" y2="12" />',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" />',
  presentation: '<rect x="2" y="4" width="20" height="13" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />',
  code: '<polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" />',
  generic: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />',
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
  const hasAnything = state.attachments.length > 0 || state.linkAttachments.length > 0;
  if (!hasAnything) {
    dom.filesList.innerHTML = `<div class="empty-state"><h3>No files yet</h3><p>Attach PDFs, notes, links, or other resources related to this title.</p></div>`;
    return;
  }

  const fileRows = state.attachments.map(f => {
    const category = fileCategory(f.file_name);
    const ext = (f.file_name.split('.').pop() || '?').toUpperCase();
    return `
            <div class="file-row" data-id="${f.id}" data-kind="file">
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
  });

  // Links reuse the same .file-row shape for visual consistency, with a
  // distinct link glyph and their own edit/delete actions. displayLabel
  // falls back to a shortened hostname when no label was given, so the
  // row never shows a bare, hard-to-scan raw URL as its title.
  const linkRows = state.linkAttachments.map(l => {
    let displayLabel = l.label;
    if (!displayLabel) {
      try { displayLabel = new URL(l.url).hostname.replace(/^www\./, ''); }
      catch { displayLabel = l.url; }
    }
    return `
            <div class="file-row" data-id="${l.id}" data-kind="link">
              <div class="file-icon file-icon-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <div class="file-info">
                <div class="file-name">${escapeHTML(displayLabel)}</div>
                <div class="file-meta">${escapeHTML(l.url)}</div>
              </div>
              <div class="file-actions">
                <button class="btn btn-ghost btn-sm link-open-btn" data-id="${l.id}">Open</button>
                <button class="btn btn-ghost btn-sm link-edit-btn" data-id="${l.id}">Edit</button>
                <button class="btn btn-danger-ghost btn-sm link-delete-btn" data-id="${l.id}">Delete</button>
              </div>
            </div>
            `;
  });

  dom.filesList.innerHTML = [...linkRows, ...fileRows].join('');

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

  dom.filesList.querySelectorAll('.link-open-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const l = state.linkAttachments.find(x => x.id == btn.dataset.id);
      if (l) window.open(l.url, '_blank', 'noopener,noreferrer');
    });
  });
  dom.filesList.querySelectorAll('.link-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const l = state.linkAttachments.find(x => x.id == btn.dataset.id);
      if (l) openLinkModal(l);
    });
  });
  dom.filesList.querySelectorAll('.link-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const l = state.linkAttachments.find(x => x.id == btn.dataset.id);
      if (!l) return;
      confirmDelete(`Delete this link?`, async () => {
        await window.api.links.delete(l.id);
        toast('Link deleted');
        await loadSeriesData(state.currentSeries.id);
      });
    });
  });
}

let editingLink = null;

function openLinkModal(link = null) {
  editingLink = link;
  el('modal-link-title').textContent = link ? 'Edit Link' : 'Add Link';
  el('f-link-url').value = link?.url || '';
  el('f-link-label').value = link?.label || '';
  openModal('overlay-link');
  el('f-link-url').focus();
}

async function saveLink() {
  let url = el('f-link-url').value.trim();
  if (!url) return toast('URL is required', true);
  // Bare domains/paths (no scheme) are treated as https:// — matches how
  // most people type a link without thinking about the protocol prefix.
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const d = { series_id: state.currentSeries.id, url, label: el('f-link-label').value.trim() };

  if (editingLink) {
    await window.api.links.update(editingLink.id, d);
    toast('Link updated');
  } else {
    await window.api.links.add(d);
    toast('Link added');
  }
  editingLink = null;
  closeModal('overlay-link');
  await loadSeriesData(state.currentSeries.id);
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

// vis-network draws an edge label as a single line unless the string
// itself contains '\n' — it never wraps long text on its own, so a label
// like "Childhood Best Friends Turned Rivals" used to render as one long
// unreadable run of characters sitting on top of the arrow. This breaks a
// label into short lines at word boundaries (falling back to a hard
// character break for a single very long word), caps it at a handful of
// lines, and ellipsizes anything left over — the full, untruncated text is
// still available as the edge's hover tooltip (see the `title` field on
// each edge below), so nothing is ever fully lost, just kept off the graph
// itself past a reasonable size.
function wrapEdgeLabel(text, maxLineLength = 14, maxLines = 3) {
  const raw = (text || '').trim();
  if (!raw) return '';

  const words = raw.split(/\s+/);
  const lines = [];
  let current = '';
  const pushCurrent = () => { if (current) { lines.push(current); current = ''; } };

  for (let word of words) {
    // Hard-break a single word that's longer than a whole line on its own
    // (e.g. a long name with no spaces) rather than let it overflow.
    while (word.length > maxLineLength) {
      pushCurrent();
      lines.push(word.slice(0, maxLineLength));
      word = word.slice(maxLineLength);
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLineLength) {
      pushCurrent();
      current = word;
    } else {
      current = candidate;
    }
  }
  pushCurrent();

  if (lines.length > maxLines) {
    lines.length = maxLines;
    const last = lines[maxLines - 1].replace(/\s+$/, '');
    lines[maxLines - 1] = (last.length >= maxLineLength ? last.slice(0, maxLineLength - 1) : last) + '…';
  }

  return lines.join('\n');
}

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

    const smooth = idx === 0
      ? { type: 'continuous', roundness: 0.15 }
      : { type: idx % 2 === 1 ? 'curvedCW' : 'curvedCCW', roundness: 0.4 + Math.floor((idx - 1) / 2) * 0.4 };

    edges.push({
      id: r.id,
      from: r.from_character_id,
      to: r.to_character_id,
      arrows: r.is_bidirectional ? 'to, from' : 'to',
      label: wrapEdgeLabel(relLabel(r), 10, 3),
      title: relLabel(r), // full, unwrapped text as a hover tooltip — nothing is lost even when the on-graph label above is wrapped or ellipsized
      font: { align: 'middle', size: 11, face: 'IBM Plex Mono', background: cBg, color: cMuted, strokeWidth: 0, multi: false },
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
      // Stronger repulsion + longer springs push nodes further apart at
      // rest, giving converging edges (e.g. everything pointing at Lin
      // Yan) more physical room to fan out instead of bundling together
      // near the node itself, where their curved labels collide.
      forceAtlas2Based: { gravitationalConstant: -120, centralGravity: 0.008, springLength: 260, springConstant: 0.05, avoidOverlap: 1 },
      // Runs physics longer before settling — a graph this dense needs
      // more iterations to fully untangle rather than freezing early in a
      // still-crowded layout.
      stabilization: { iterations: 400 }
    },
    edges: {
      // Slight extra curvature baked in globally (on top of the explicit
      // curvedCW/CCW multi-edge logic below) so even single, one-off
      // edges bow outward a bit rather than cutting a straight line
      // through the middle of unrelated nodes.
      smooth: { type: 'dynamic' }
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

  // ── Zoom-out limit ──────────────────────────────────────────────────
  // vis-network has no built-in min/max zoom option, so this is the usual
  // workaround: figure out the scale that exactly fits the whole graph in
  // view, then clamp any further zoom-out to a fraction of that. The
  // limit is deliberately relative to the fit scale (not a fixed number)
  // so a 3-character graph and a 50-character graph each get a sensible
  // "can't scroll out past roughly double the graph's own footprint"
  // boundary instead of one fixed zoom level that'd feel wrong on either.
  // Computed after physics settles (stabilizationIterationsDone) so it's
  // based on the graph's actual settled layout, not its initial random
  // starting positions.
  let graphMinScale = null;
  const ZOOM_OUT_LIMIT_FACTOR = 0.5; // 0.5x the fit scale ≈ ~4x the fit-view area (area scales with scale²)

  state.graphNetwork.once('stabilizationIterationsDone', () => {
    if (!state.graphNetwork) return; // modal may have closed mid-stabilization
    state.graphNetwork.fit({ animation: false });
    // Back off slightly from the tightest possible fit — a graph this
    // dense reads better with a little breathing room around the edges
    // than filling the modal completely edge-to-edge.
    state.graphNetwork.moveTo({ scale: state.graphNetwork.getScale() * 0.85 });
    graphMinScale = state.graphNetwork.getScale() * ZOOM_OUT_LIMIT_FACTOR;

    // Physics has done its job — it found a readable initial layout. Turn
    // it off entirely from here on so springLength/springConstant/
    // avoidOverlap stop actively pulling nodes back toward "ideal"
    // spacing. With physics off, dragging a node is pure freeform
    // placement: it goes exactly where it's dropped and stays there, with
    // nothing snapping it back or nudging its neighbors — full manual
    // control over layout instead of fighting the solver on every drag.
    state.graphNetwork.setOptions({ physics: { enabled: false } });
  });

  state.graphNetwork.on('zoom', (params) => {
    if (graphMinScale !== null && params.scale < graphMinScale) {
      state.graphNetwork.moveTo({ scale: graphMinScale });
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
  el('signup-security-fields').classList.toggle('hidden', authMode !== 'signup');
  el('auth-gate-status').textContent = '';
});

el('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = el('auth-username').value.trim();
  const password = el('auth-password').value;
  el('auth-gate-status').textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';

  const result = authMode === 'signin'
    ? await window.api.auth.signIn(username, password)
    : await window.api.auth.signUp(
      username, password,
      el('signup-security-question').value.trim(),
      el('signup-security-answer').value.trim()
    );

  if (result.ok) {
    showApp();
    await init();
  } else {
    el('auth-gate-status').textContent = result.error;
  }
});

// ─── Password Recovery (Forgot Password flow) ────────────────────────────

let recoveryUsername = '';

function showRecoveryCard() {
  el('signin-card').classList.add('hidden');
  el('recovery-card').classList.remove('hidden');
  el('recovery-step-username').classList.remove('hidden');
  el('recovery-step-answer').classList.add('hidden');
  el('recovery-username').value = '';
  el('recovery-answer').value = '';
  el('recovery-new-password').value = '';
  el('recovery-confirm-password').value = '';
  el('recovery-status').textContent = '';
}

function showSigninCard() {
  el('recovery-card').classList.add('hidden');
  el('signin-card').classList.remove('hidden');
}

el('btn-forgot-password').addEventListener('click', showRecoveryCard);
el('btn-recovery-cancel-1').addEventListener('click', showSigninCard);
el('btn-recovery-cancel-2').addEventListener('click', () => {
  el('recovery-step-answer').classList.add('hidden');
  el('recovery-step-username').classList.remove('hidden');
  el('recovery-status').textContent = '';
});

el('btn-recovery-lookup').addEventListener('click', async () => {
  const username = el('recovery-username').value.trim();
  if (!username) return;
  el('recovery-status').textContent = 'Checking…';
  const result = await window.api.auth.getSecurityQuestion(username);
  if (!result.ok) {
    el('recovery-status').textContent = result.error;
    return;
  }
  recoveryUsername = username;
  el('recovery-question-display').textContent = result.question;
  el('recovery-step-username').classList.add('hidden');
  el('recovery-step-answer').classList.remove('hidden');
  el('recovery-status').textContent = '';
});

el('btn-recovery-submit').addEventListener('click', async () => {
  const answer = el('recovery-answer').value;
  const newPassword = el('recovery-new-password').value;
  const confirm = el('recovery-confirm-password').value;
  if (newPassword !== confirm) {
    el('recovery-status').textContent = "New passwords don't match";
    return;
  }
  el('recovery-status').textContent = 'Resetting…';
  const result = await window.api.auth.resetPassword(recoveryUsername, answer, newPassword);
  if (!result.ok) {
    el('recovery-status').textContent = result.error;
    return;
  }
  el('recovery-status').textContent = 'Password reset — you can sign in now.';
  setTimeout(() => {
    showSigninCard();
    el('auth-username').value = recoveryUsername;
    el('auth-password').value = '';
    el('auth-gate-status').textContent = 'Password reset successfully. Sign in with your new password.';
  }, 1200);
});

// ─── Run ──────────────────────────────────────────────────────────────────────
boot();