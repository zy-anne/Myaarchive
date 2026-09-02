// ─── Data Layer ──────────────────────────────────────────────────────────
//
// Plain functions, no Electron dependency anywhere in this file. Every
// function takes a libSQL `db` client (see client.js) as its first
// argument. This is what main.js's ipcMain handlers call into, and it's
// the module the future Expo app is meant to import unmodified (minus
// client.js, which is platform-specific).
//
// Tags and statuses are PER-USER (owner_id-scoped) — each account has its
// own tag list and status list, not a shared global one. Genres remain
// shared/global across all accounts.

function parseSeriesRow(row) {
  if (!row) return null;
  const tags = [];
  if (row.tag_data) {
    for (const entry of row.tag_data.split('||')) {
      if (!entry) continue;
      const [id, name, color] = entry.split('::');
      if (id && name) tags.push({ id: parseInt(id), name, color: color || '#4a90e2' });
    }
  }
  const genres = [];
  if (row.genre_data) {
    for (const entry of row.genre_data.split('||')) {
      if (!entry) continue;
      const [id, name, color] = entry.split('::');
      if (id && name) genres.push({ id: parseInt(id), name, color: color || '#b2bec3' });
    }
  }
  const content_warnings = [];
  if (row.warning_data) {
    for (const entry of row.warning_data.split('||')) {
      if (!entry) continue;
      const [id, name] = entry.split('::');
      if (id && name) content_warnings.push({ id: parseInt(id), name });
    }
  }
  const { tag_data, genre_data, warning_data, ...rest } = row;
  // is_nsfw comes back from libSQL as 0/1 (SQLite has no native boolean) —
  // coerce to a real boolean so callers (app.js) can just check truthiness
  // without caring about the underlying storage representation.
  return { ...rest, tags, genres, content_warnings, is_nsfw: !!rest.is_nsfw };
}

const q = (db, sql, args = []) => db.execute({ sql, args }).then(r => r.rows);
const one = async (db, sql, args = []) => (await q(db, sql, args))[0] || null;
const run = (db, sql, args = []) => db.execute({ sql, args });

async function tableExists(db, name) {
  const r = await db.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, args: [name] });
  return r.rows.length > 0;
}
async function columnNames(db, table) {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  return new Set(info.rows.map(r => r.name));
}

// ─── Libraries ──────────────────────────────────────────────────────────

async function librariesGetAll(db, ownerId) {
  return q(db, `
    SELECT l.*, COUNT(s.id) as series_count
    FROM libraries l
    LEFT JOIN series s ON s.library_id = l.id
    WHERE l.owner_id = ?
    GROUP BY l.id
    ORDER BY l.position, l.id
  `, [ownerId]);
}

async function librariesCreate(db, ownerId, d) {
  const maxPos = await one(db, `SELECT MAX(position) as maxPos FROM libraries WHERE owner_id = ?`, [ownerId]);
  const pos = (maxPos?.maxPos ?? -1) + 1;
  const r = await run(db, `
    INSERT INTO libraries (owner_id, name, icon, icon_image, position) VALUES (?, ?, ?, ?, ?)
  `, [ownerId, d.name, d.icon || 'grid', d.icon_image || null, pos]);
  return Number(r.lastInsertRowid);
}

async function librariesUpdate(db, id, d) {
  await run(db, `UPDATE libraries SET name=?, icon=?, icon_image=? WHERE id=?`,
    [d.name, d.icon || 'grid', d.icon_image || null, id]);
  return true;
}

async function librariesDelete(db, id) {
  await run(db, `DELETE FROM libraries WHERE id = ?`, [id]);
  return true;
}

// ─── Tag colors ─────────────────────────────────────────────────────────
// Tags are user-created free text with no color picker in the UI, so each
// tag gets a color assigned automatically the moment it's first created —
// deterministically, from its name, so the same tag name always lands on
// the same color (even across different series or re-creation after a
// delete) rather than being assigned by insertion order.
const TAG_COLOR_PALETTE = [
  '#5DC8CD', // cyan
  '#9B7EDE', // purple
  '#E58FB1', // pink
  '#7FC9A0', // green
  '#B9BEC7', // gray
  '#E8C15C', // gold
  '#6FA8DC', // blue
  '#4FBDB0', // teal
  '#B0A15A', // olive
  '#DD7A6E', // rust
  '#E3A15C', // orange
  '#8D9DE8', // periwinkle
  '#C98BC9', // orchid
  '#7FBF7F', // leaf green
];

function colorForTagName(name) {
  const key = (name || '').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
}

// ─── Tags (per-user) & Genres (shared) ─────────────────────────────────

async function tagsGetAll(db, ownerId) {
  return q(db, `SELECT * FROM tags WHERE owner_id = ? ORDER BY name COLLATE NOCASE`, [ownerId]);
}

async function tagsCreate(db, ownerId, name) {
  const trimmed = name.trim();
  await run(db, `INSERT OR IGNORE INTO tags (owner_id, name, color) VALUES (?, ?, ?)`, [ownerId, trimmed, colorForTagName(trimmed)]);
  return one(db, `SELECT * FROM tags WHERE owner_id = ? AND name = ?`, [ownerId, trimmed]);
}

async function genresGetAll(db) {
  return q(db, `SELECT * FROM genres ORDER BY name COLLATE NOCASE`);
}

// ─── Content Warnings (per-user) ───────────────────────────────────────
// Deliberately simpler than tags: no color picker, no palette assignment.
// Warnings are always rendered with a fixed danger-red pill (see
// .warning-pill / .warning-chip in style.css) so severity reads
// consistently regardless of which warning it is, rather than each one
// getting an arbitrary color the way tags do.

async function contentWarningsGetAll(db, ownerId) {
  return q(db, `SELECT * FROM content_warnings WHERE owner_id = ? ORDER BY name COLLATE NOCASE`, [ownerId]);
}

async function contentWarningsCreate(db, ownerId, name) {
  const trimmed = name.trim();
  await run(db, `INSERT OR IGNORE INTO content_warnings (owner_id, name) VALUES (?, ?)`, [ownerId, trimmed]);
  return one(db, `SELECT * FROM content_warnings WHERE owner_id = ? AND name = ?`, [ownerId, trimmed]);
}

// ─── Settings (per-user) ───────────────────────────────────────────────

async function settingsGetAll(db, ownerId) {
  const rows = await q(db, `SELECT key, value FROM app_settings WHERE owner_id = ?`, [ownerId]);
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function settingsSet(db, ownerId, key, value) {
  await run(db, `
    INSERT INTO app_settings (owner_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(owner_id, key) DO UPDATE SET value = excluded.value
  `, [ownerId, key, value]);
  return true;
}

// ─── Series ─────────────────────────────────────────────────────────────

// Tags are owner-scoped now, so upserting a series's tags needs to know
// which user's tag list to look in / create into.
async function upsertSeriesTags(db, ownerId, seriesId, tags) {
  await run(db, `DELETE FROM series_tags WHERE series_id = ?`, [seriesId]);
  for (const name of tags) {
    const t = name.trim();
    if (!t) continue;
    await run(db, `INSERT OR IGNORE INTO tags (owner_id, name, color) VALUES (?, ?, ?)`, [ownerId, t, colorForTagName(t)]);
    const tag = await one(db, `SELECT id FROM tags WHERE owner_id = ? AND name = ?`, [ownerId, t]);
    if (tag) await run(db, `INSERT OR IGNORE INTO series_tags (series_id, tag_id) VALUES (?, ?)`, [seriesId, tag.id]);
  }
}

async function upsertSeriesGenres(db, seriesId, genreNames) {
  await run(db, `DELETE FROM series_genres WHERE series_id = ?`, [seriesId]);
  for (const name of genreNames) {
    const g = name.trim();
    if (!g) continue;
    const genre = await one(db, `SELECT id FROM genres WHERE name = ?`, [g]);
    if (genre) await run(db, `INSERT OR IGNORE INTO series_genres (series_id, genre_id) VALUES (?, ?)`, [seriesId, genre.id]);
  }
}

// Content warnings are owner-scoped, same as tags — upserting a series's
// warnings needs to know which user's warning vocabulary to look in /
// create into, so one account's "Body Horror" isn't silently reused (or
// collided with) another account's.
async function upsertSeriesContentWarnings(db, ownerId, seriesId, warnings) {
  await run(db, `DELETE FROM series_content_warnings WHERE series_id = ?`, [seriesId]);
  for (const name of warnings) {
    const w = name.trim();
    if (!w) continue;
    await run(db, `INSERT OR IGNORE INTO content_warnings (owner_id, name) VALUES (?, ?)`, [ownerId, w]);
    const warning = await one(db, `SELECT id FROM content_warnings WHERE owner_id = ? AND name = ?`, [ownerId, w]);
    if (warning) await run(db, `INSERT OR IGNORE INTO series_content_warnings (series_id, warning_id) VALUES (?, ?)`, [seriesId, warning.id]);
  }
}

const SERIES_SELECT = `
  SELECT s.*,
    (SELECT GROUP_CONCAT(t.id || '::' || t.name || '::' || t.color, '||')
       FROM series_tags st JOIN tags t ON st.tag_id = t.id
       WHERE st.series_id = s.id) as tag_data,
    (SELECT GROUP_CONCAT(g.id || '::' || g.name || '::' || g.color, '||')
       FROM series_genres sg JOIN genres g ON sg.genre_id = g.id
       WHERE sg.series_id = s.id) as genre_data,
    (SELECT GROUP_CONCAT(cw.id || '::' || cw.name, '||')
       FROM series_content_warnings scw JOIN content_warnings cw ON scw.warning_id = cw.id
       WHERE scw.series_id = s.id) as warning_data,
    (SELECT COUNT(*) FROM volumes v WHERE v.series_id = s.id) as volume_count,
    (SELECT COUNT(*) FROM characters c WHERE c.series_id = s.id) as character_count
  FROM series s
`;

// `ownerId` is required and enforced via a library-ownership join, so a
// caller can never read another user's series by guessing a library_id.
async function seriesGetAll(db, ownerId, filters = {}) {
  let where = 'WHERE s.library_id IN (SELECT id FROM libraries WHERE owner_id = ?)';
  const args = [ownerId];

  if (filters.libraryId) { where += ' AND s.library_id = ?'; args.push(filters.libraryId); }
  if (filters.status && filters.status !== 'All') { where += ' AND s.status = ?'; args.push(filters.status); }
  if (filters.search) {
    where += ' AND (s.title LIKE ? OR s.author LIKE ?)';
    args.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const filterMode = filters.filterMode || 'OR';
  const hasGenreFilter = Array.isArray(filters.genres) && filters.genres.length > 0;
  const hasTagFilter = Array.isArray(filters.tags) && filters.tags.length > 0;

  if (hasGenreFilter || hasTagFilter) {
    if (filterMode === 'AND') {
      if (hasGenreFilter) {
        const ph = filters.genres.map(() => '?').join(',');
        where += ` AND (SELECT COUNT(DISTINCT g2.name) FROM series_genres sg2 JOIN genres g2 ON sg2.genre_id = g2.id WHERE sg2.series_id = s.id AND g2.name IN (${ph})) = ?`;
        args.push(...filters.genres, filters.genres.length);
      }
      if (hasTagFilter) {
        const ph = filters.tags.map(() => '?').join(',');
        where += ` AND (SELECT COUNT(DISTINCT t2.name) FROM series_tags st2 JOIN tags t2 ON st2.tag_id = t2.id WHERE st2.series_id = s.id AND t2.name IN (${ph})) = ?`;
        args.push(...filters.tags, filters.tags.length);
      }
    } else {
      const orClauses = [];
      if (hasGenreFilter) {
        const ph = filters.genres.map(() => '?').join(',');
        orClauses.push(`EXISTS (SELECT 1 FROM series_genres sg2 JOIN genres g2 ON sg2.genre_id = g2.id WHERE sg2.series_id = s.id AND g2.name IN (${ph}))`);
        args.push(...filters.genres);
      }
      if (hasTagFilter) {
        const ph = filters.tags.map(() => '?').join(',');
        orClauses.push(`EXISTS (SELECT 1 FROM series_tags st2 JOIN tags t2 ON st2.tag_id = t2.id WHERE st2.series_id = s.id AND t2.name IN (${ph}))`);
        args.push(...filters.tags);
      }
      where += ` AND (${orClauses.join(' OR ')})`;
    }
  }

  const rows = await q(db, `${SERIES_SELECT} ${where} ORDER BY s.title COLLATE NOCASE`, args);
  return rows.map(parseSeriesRow);
}

// Ownership check for single-record reads: join through libraries.owner_id
// rather than trusting the id alone, so IDs from one account can't be used
// to peek at another account's data.
async function seriesGet(db, ownerId, id) {
  const row = await one(db, `
    ${SERIES_SELECT}
    WHERE s.id = ? AND s.library_id IN (SELECT id FROM libraries WHERE owner_id = ?)
  `, [id, ownerId]);
  return parseSeriesRow(row);
}

// Fields added for the "book detail" expansion (all optional, all nullable).
// Kept as a single ordered array so the INSERT/UPDATE column lists and the
// migration below can't drift out of sync with each other.
const SERIES_EXTRA_FIELDS = [
  ['book_type', 'TEXT'],                    // e.g. Web Novel, Manga, Graphic Novel
  ['rating', 'INTEGER'],                    // 1-5, or NULL if unrated
  ['original_language', 'TEXT'],
  ['country_of_origin', 'TEXT'],
  ['language_read', "TEXT DEFAULT 'English'"],
  ['artist', 'TEXT'],
  ['year_published', 'TEXT'],               // series/standalone-level publication year
  ['date_started', 'TEXT'],                 // reading start date
  ['date_finished', 'TEXT'],                // reading finish date
  ['status_country_of_origin', 'TEXT'],     // e.g. Ongoing / Completed / Hiatus in its home market
  ['licensed_english', 'TEXT'],             // 'Yes' / 'No' / '' (unknown)
  ['completely_translated', 'TEXT'],        // 'Yes' / 'No' / '' (unknown)
  ['original_publisher', 'TEXT'],
  ['english_publisher', 'TEXT'],
  ['is_nsfw', 'INTEGER NOT NULL DEFAULT 0'], // 0/1 — flags a title as NSFW content
];

function seriesExtraArgs(data) {
  return [
    data.book_type || null,
    data.rating || null,
    data.original_language || null,
    data.country_of_origin || null,
    data.language_read || 'English',
    data.artist || null,
    data.year_published || null,
    data.date_started || null,
    data.date_finished || null,
    data.status_country_of_origin || null,
    data.licensed_english || null,
    data.completely_translated || null,
    data.original_publisher || null,
    data.english_publisher || null,
    data.is_nsfw ? 1 : 0,
  ];
}

async function seriesCreate(db, ownerId, data) {
  // Verify the target library belongs to this user before inserting.
  const lib = await one(db, `SELECT id FROM libraries WHERE id = ? AND owner_id = ?`, [data.library_id, ownerId]);
  if (!lib) throw new Error('Library not found for this user');

  const tx = await db.transaction('write');
  try {
    const r = await tx.execute({
      sql: `INSERT INTO series (
                title, author, status, synopsis, library_id, kind, overall_thoughts, chapter_thoughts, cover_image_path,
                book_type, rating, original_language, country_of_origin, language_read, artist, year_published,
                date_started, date_finished, status_country_of_origin, licensed_english, completely_translated,
                original_publisher, english_publisher, is_nsfw
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.title, data.author || null, data.status || 'Planning', data.synopsis || null, data.library_id,
        data.kind || 'series', data.overall_thoughts || null, data.chapter_thoughts || null, data.cover_image_path || null,
        ...seriesExtraArgs(data),
      ],
    });
    const seriesId = Number(r.lastInsertRowid);
    await tx.commit();
    // Tag/genre/warning upserts run outside the transaction (they're
    // idempotent OR IGNORE upserts, and libSQL transactions don't nest).
    await upsertSeriesTags(db, ownerId, seriesId, data.tags || []);
    await upsertSeriesGenres(db, seriesId, data.genres || []);
    await upsertSeriesContentWarnings(db, ownerId, seriesId, data.content_warnings || []);
    return seriesId;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function seriesUpdate(db, ownerId, id, data) {
  const existing = await seriesGet(db, ownerId, id);
  if (!existing) throw new Error('Series not found for this user');

  let targetLibraryId = existing.library_id;
  if (data.library_id && data.library_id !== existing.library_id) {
    const targetLib = await one(db, `SELECT id FROM libraries WHERE id = ? AND owner_id = ?`, [data.library_id, ownerId]);
    if (targetLib) targetLibraryId = data.library_id;
  }

  await run(db, `
    UPDATE series SET title=?, author=?, status=?, synopsis=?, kind=?, overall_thoughts=?, chapter_thoughts=?, cover_image_path=?,
      book_type=?, rating=?, original_language=?, country_of_origin=?, language_read=?, artist=?, year_published=?,
      date_started=?, date_finished=?, status_country_of_origin=?, licensed_english=?, completely_translated=?,
      original_publisher=?, english_publisher=?, is_nsfw=?, library_id=?
    WHERE id=?
  `, [data.title, data.author || null, data.status || 'Planning', data.synopsis || null,
  data.kind || 'series', data.overall_thoughts || null, data.chapter_thoughts || null, data.cover_image_path || null,
  ...seriesExtraArgs(data),
    targetLibraryId,
    id]);
  if (data.tags !== undefined) await upsertSeriesTags(db, ownerId, id, data.tags);
  if (data.genres !== undefined) await upsertSeriesGenres(db, id, data.genres);
  if (data.content_warnings !== undefined) await upsertSeriesContentWarnings(db, ownerId, id, data.content_warnings);
  if (Number(targetLibraryId) !== Number(existing.library_id)) {
    await detachSeriesFromGroups(db, id, targetLibraryId);
  }
  return true;
}

async function seriesTransfer(db, ownerId, id, targetLibraryId) {
  const existing = await seriesGet(db, ownerId, id);
  if (!existing) throw new Error('Series not found for this user');
  const targetLib = await one(db, `SELECT id FROM libraries WHERE id = ? AND owner_id = ?`, [targetLibraryId, ownerId]);
  if (!targetLib) throw new Error('Target category not found for this user');

  await run(db, `UPDATE series SET library_id = ? WHERE id = ?`, [targetLibraryId, id]);
  await detachSeriesFromGroups(db, id, targetLibraryId);
  return true;
}

async function seriesCopy(db, ownerId, id, targetLibraryId, options = {}) {
  const existing = await seriesGet(db, ownerId, id);
  if (!existing) throw new Error('Series not found for this user');
  const targetLib = await one(db, `SELECT id FROM libraries WHERE id = ? AND owner_id = ?`, [targetLibraryId, ownerId]);
  if (!targetLib) throw new Error('Target category not found for this user');

  const copyData = {
    title: existing.title,
    author: existing.author,
    status: existing.status,
    synopsis: existing.synopsis,
    library_id: targetLibraryId,
    kind: existing.kind,
    overall_thoughts: existing.overall_thoughts,
    chapter_thoughts: existing.chapter_thoughts,
    cover_image_path: existing.cover_image_path,
    book_type: existing.book_type,
    rating: existing.rating,
    original_language: existing.original_language,
    country_of_origin: existing.country_of_origin,
    language_read: existing.language_read,
    artist: existing.artist,
    year_published: existing.year_published,
    date_started: existing.date_started,
    date_finished: existing.date_finished,
    status_country_of_origin: existing.status_country_of_origin,
    licensed_english: existing.licensed_english,
    completely_translated: existing.completely_translated,
    original_publisher: existing.original_publisher,
    english_publisher: existing.english_publisher,
    is_nsfw: existing.is_nsfw ? 1 : 0,
    tags: existing.tags.map(t => t.name),
    genres: existing.genres.map(g => g.name),
    content_warnings: existing.content_warnings.map(w => w.name),
  };

  const newSeriesId = await seriesCreate(db, ownerId, copyData);

  const incVolumes = options.includeVolumes !== false;
  const incChars = options.includeCharacters !== false;
  const incGallery = options.includeGallery !== false;
  const incAttachments = options.includeAttachments !== false;

  if (incVolumes) {
    const vols = await volumesGetBySeries(db, id);
    for (const v of vols) {
      await volumesCreate(db, {
        series_id: newSeriesId,
        volume_number: v.volume_number,
        title: v.title,
        chapter_range: v.chapter_range,
        chapter_count: v.chapter_count,
        thoughts: v.thoughts,
        chapter_notes: v.chapter_notes,
        cover_image_path: v.cover_image_path,
        date_read: v.date_read,
        published_date: v.published_date,
      });
    }
  }

  if (incChars) {
    const chars = await charactersGetBySeries(db, id);
    const charIdMap = new Map();
    for (const c of chars) {
      const newCharId = await charactersCreate(db, {
        series_id: newSeriesId,
        name: c.name,
        role: c.role,
        volume_appearances: c.volume_appearances,
        notes: c.notes,
        profile_image_path: c.profile_image_path,
        status_role: c.status_role,
        overall_vibes: c.overall_vibes,
        appears_vs_reality: c.appears_vs_reality,
        personality: c.personality,
      });
      charIdMap.set(c.id, newCharId);
    }

    const rels = await relationshipsGetBySeries(db, id);
    for (const r of rels) {
      const newFrom = charIdMap.get(r.from_character_id);
      const newTo = charIdMap.get(r.to_character_id);
      if (newFrom && newTo) {
        await relationshipsCreate(db, {
          from_character_id: newFrom,
          to_character_id: newTo,
          type: r.type,
          label: r.label,
          is_bidirectional: r.is_bidirectional,
          notes: r.notes,
        });
      }
    }
  }

  if (incGallery) {
    const pics = await galleryGetBySeries(db, id);
    for (const g of pics) {
      await galleryAdd(db, {
        series_id: newSeriesId,
        image_path: g.image_path,
        caption: g.caption,
      });
    }
  }

  if (incAttachments) {
    const files = await attachmentsGetBySeries(db, id);
    for (const f of files) {
      await attachmentsAdd(db, {
        series_id: newSeriesId,
        file_path: f.file_path,
        file_name: f.file_name,
        file_size: f.file_size,
      });
    }
  }

  return newSeriesId;
}

async function seriesDelete(db, ownerId, id) {
  const existing = await seriesGet(db, ownerId, id);
  if (!existing) throw new Error('Series not found for this user');
  await detachSeriesFromGroups(db, id);
  await run(db, `DELETE FROM series WHERE id = ?`, [id]);
  return true;
}

// ─── Volumes ────────────────────────────────────────────────────────────

async function volumesGetBySeries(db, seriesId) {
  return q(db, `SELECT * FROM volumes WHERE series_id = ? ORDER BY volume_number`, [seriesId]);
}
async function volumesGet(db, id) { return one(db, `SELECT * FROM volumes WHERE id = ?`, [id]); }
async function volumesCreate(db, d) {
  const r = await run(db, `
    INSERT INTO volumes (series_id, volume_number, title, chapter_range, chapter_count, thoughts, chapter_notes, cover_image_path, date_read, published_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [d.series_id, d.volume_number, d.title || null, d.chapter_range || null, d.chapter_count || null,
  d.thoughts || null, d.chapter_notes || null, d.cover_image_path || null, d.date_read || null, d.published_date || null]);
  return Number(r.lastInsertRowid);
}
async function volumesUpdate(db, id, d) {
  await run(db, `
    UPDATE volumes SET volume_number=?, title=?, chapter_range=?, chapter_count=?, thoughts=?, chapter_notes=?, cover_image_path=?, date_read=?, published_date=? WHERE id=?
  `, [d.volume_number, d.title || null, d.chapter_range || null, d.chapter_count || null,
  d.thoughts || null, d.chapter_notes || null, d.cover_image_path || null, d.date_read || null, d.published_date || null, id]);
  return true;
}
async function volumesDelete(db, id) { await run(db, `DELETE FROM volumes WHERE id = ?`, [id]); return true; }

// ─── Characters ─────────────────────────────────────────────────────────

async function charactersGetBySeries(db, seriesId) {
  return q(db, `SELECT * FROM characters WHERE series_id = ? ORDER BY name COLLATE NOCASE`, [seriesId]);
}
async function charactersGet(db, id) { return one(db, `SELECT * FROM characters WHERE id = ?`, [id]); }
async function charactersCreate(db, d) {
  const r = await run(db, `
    INSERT INTO characters (series_id, name, role, volume_appearances, notes, profile_image_path,
                            status_role, overall_vibes, appears_vs_reality, personality)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [d.series_id, d.name, d.role || 'Side', d.volume_appearances || null, d.notes || null, d.profile_image_path || null,
  d.status_role || null, d.overall_vibes || null, d.appears_vs_reality || null, d.personality || null]);
  return Number(r.lastInsertRowid);
}
async function charactersUpdate(db, id, d) {
  await run(db, `
    UPDATE characters SET name=?, role=?, volume_appearances=?, notes=?, profile_image_path=?,
      status_role=?, overall_vibes=?, appears_vs_reality=?, personality=?
    WHERE id=?
  `, [d.name, d.role || 'Side', d.volume_appearances || null, d.notes || null, d.profile_image_path || null,
  d.status_role || null, d.overall_vibes || null, d.appears_vs_reality || null, d.personality || null, id]);
  return true;
}
async function charactersDelete(db, id) { await run(db, `DELETE FROM characters WHERE id = ?`, [id]); return true; }

// ─── Relationships ──────────────────────────────────────────────────────

async function relationshipsGetBySeries(db, seriesId) {
  return q(db, `
    SELECT r.*, c1.name as from_name, c1.role as from_role, c2.name as to_name, c2.role as to_role
    FROM relationships r
    JOIN characters c1 ON r.from_character_id = c1.id
    JOIN characters c2 ON r.to_character_id = c2.id
    WHERE c1.series_id = ?
  `, [seriesId]);
}
async function relationshipsGetByCharacter(db, charId) {
  return q(db, `
    SELECT r.*, c1.name as from_name, c1.role as from_role, c2.name as to_name, c2.role as to_role
    FROM relationships r
    JOIN characters c1 ON r.from_character_id = c1.id
    JOIN characters c2 ON r.to_character_id = c2.id
    WHERE r.from_character_id = ? OR (r.is_bidirectional = 1 AND r.to_character_id = ?)
  `, [charId, charId]);
}
async function relationshipsCreate(db, d) {
  const r = await run(db, `
    INSERT INTO relationships (from_character_id, to_character_id, type, label, is_bidirectional, notes) VALUES (?, ?, ?, ?, ?, ?)
  `, [d.from_character_id, d.to_character_id, d.type || 'Friend', d.label || null,
  d.is_bidirectional !== undefined ? d.is_bidirectional : 1, d.notes || null]);
  return Number(r.lastInsertRowid);
}
async function relationshipsUpdate(db, id, d) {
  await run(db, `
    UPDATE relationships SET from_character_id=?, to_character_id=?, type=?, label=?, is_bidirectional=?, notes=? WHERE id=?
  `, [d.from_character_id, d.to_character_id, d.type || 'Friend', d.label || null,
  d.is_bidirectional !== undefined ? d.is_bidirectional : 1, d.notes || null, id]);
  return true;
}
async function relationshipsDelete(db, id) { await run(db, `DELETE FROM relationships WHERE id = ?`, [id]); return true; }

// ─── Gallery ────────────────────────────────────────────────────────────

async function galleryGetBySeries(db, seriesId) {
  return q(db, `SELECT * FROM gallery_images WHERE series_id = ? ORDER BY position, id`, [seriesId]);
}
async function galleryAdd(db, d) {
  const maxPos = await one(db, `SELECT MAX(position) as maxPos FROM gallery_images WHERE series_id = ?`, [d.series_id]);
  const pos = (maxPos?.maxPos ?? -1) + 1;
  const r = await run(db, `
    INSERT INTO gallery_images (series_id, image_path, caption, position) VALUES (?, ?, ?, ?)
  `, [d.series_id, d.image_path, d.caption || null, pos]);
  return Number(r.lastInsertRowid);
}
async function galleryUpdateCaption(db, id, caption) {
  await run(db, `UPDATE gallery_images SET caption=? WHERE id=?`, [caption || null, id]);
  return true;
}
async function galleryDelete(db, id) {
  const row = await one(db, `SELECT image_path FROM gallery_images WHERE id = ?`, [id]);
  await run(db, `DELETE FROM gallery_images WHERE id = ?`, [id]);
  return row;
}
async function galleryReorder(db, orderedIds) {
  const tx = await db.transaction('write');
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.execute({ sql: `UPDATE gallery_images SET position = ? WHERE id = ?`, args: [i, orderedIds[i]] });
    }
    await tx.commit();
    return true;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ─── Attachments ────────────────────────────────────────────────────────

async function attachmentsGetBySeries(db, seriesId) {
  return q(db, `SELECT * FROM attachments WHERE series_id = ? ORDER BY created_at DESC, id DESC`, [seriesId]);
}
async function attachmentsAdd(db, d) {
  const r = await run(db, `
    INSERT INTO attachments (series_id, file_path, file_name, file_size) VALUES (?, ?, ?, ?)
  `, [d.series_id, d.file_path, d.file_name, d.file_size || null]);
  return Number(r.lastInsertRowid);
}
async function attachmentsDelete(db, id) {
  const row = await one(db, `SELECT file_path FROM attachments WHERE id = ?`, [id]);
  await run(db, `DELETE FROM attachments WHERE id = ?`, [id]);
  return row;
}

// ─── Statuses (per-user, customizable reading statuses) ────────────────
// series.status keeps storing the plain name (not a foreign key). Renaming
// a status cascades to that same user's series using the old name.

async function statusesGetAll(db, ownerId) {
  return q(db, `SELECT * FROM statuses WHERE owner_id = ? ORDER BY position, id`, [ownerId]);
}

async function statusesCreate(db, ownerId, d) {
  const name = (d.name || '').trim();
  if (!name) throw new Error('Status name is required');
  const dupe = await one(db, `SELECT id FROM statuses WHERE owner_id = ? AND name = ? COLLATE NOCASE`, [ownerId, name]);
  if (dupe) throw new Error('That status already exists');
  const maxPos = await one(db, `SELECT MAX(position) as maxPos FROM statuses WHERE owner_id = ?`, [ownerId]);
  const pos = (maxPos?.maxPos ?? -1) + 1;
  const r = await run(db, `INSERT INTO statuses (owner_id, name, color, position) VALUES (?, ?, ?, ?)`,
    [ownerId, name, d.color || '#7C93AC', pos]);
  return Number(r.lastInsertRowid);
}

async function statusesUpdate(db, ownerId, id, d) {
  const name = (d.name || '').trim();
  if (!name) throw new Error('Status name is required');
  const dupe = await one(db, `SELECT id FROM statuses WHERE owner_id = ? AND name = ? COLLATE NOCASE AND id != ?`, [ownerId, name, id]);
  if (dupe) throw new Error('That status already exists');
  const existing = await one(db, `SELECT name FROM statuses WHERE id = ? AND owner_id = ?`, [id, ownerId]);
  if (!existing) throw new Error('Status not found for this user');
  await run(db, `UPDATE statuses SET name=?, color=? WHERE id=? AND owner_id=?`, [name, d.color || '#7C93AC', id, ownerId]);
  if (existing.name !== name) {
    // Only this user's series, via library ownership — never touches
    // another account's data even if names collide.
    await run(db, `
      UPDATE series SET status = ?
      WHERE status = ? AND library_id IN (SELECT id FROM libraries WHERE owner_id = ?)
    `, [name, existing.name, ownerId]);
  }
  return true;
}

async function statusesDelete(db, ownerId, id) {
  const total = await one(db, `SELECT COUNT(*) as c FROM statuses WHERE owner_id = ?`, [ownerId]);
  if ((total?.c ?? 0) <= 1) throw new Error('You need at least one status');
  const existing = await one(db, `SELECT name FROM statuses WHERE id = ? AND owner_id = ?`, [id, ownerId]);
  if (!existing) return true;
  const inUse = await one(db, `
    SELECT COUNT(*) as c FROM series
    WHERE status = ? AND library_id IN (SELECT id FROM libraries WHERE owner_id = ?)
  `, [existing.name, ownerId]);
  if ((inUse?.c ?? 0) > 0) {
    throw new Error(`"${existing.name}" is used by ${inUse.c} title${inUse.c === 1 ? '' : 's'} — reassign them first`);
  }
  await run(db, `DELETE FROM statuses WHERE id = ? AND owner_id = ?`, [id, ownerId]);
  return true;
}

// Called on sign-up and sign-in. Seeds the 3 default statuses for a user
// who has none yet, and backfills any status text already sitting on that
// user's own series (e.g. restored from an export, or left over from the
// pre-per-user schema) that isn't one of the defaults, so it keeps a
// usable color instead of falling back to the muted default forever.
async function ensureDefaultStatusesForUser(db, ownerId) {
  const existingCount = await one(db, `SELECT COUNT(*) as c FROM statuses WHERE owner_id = ?`, [ownerId]);
  if ((existingCount?.c ?? 0) > 0) return; // already has statuses — nothing to seed

  const defaults = [
    { name: 'Planning', color: '#45586B' },
    { name: 'Reading', color: '#A6803C' },
    { name: 'Finished', color: '#2E5C3B' },
  ];
  for (let i = 0; i < defaults.length; i++) {
    await run(db, `INSERT INTO statuses (owner_id, name, color, position) VALUES (?, ?, ?, ?)`,
      [ownerId, defaults[i].name, defaults[i].color, i]);
  }

  try {
    const used = await db.execute({
      sql: `
        SELECT DISTINCT status FROM series
        WHERE status IS NOT NULL AND library_id IN (SELECT id FROM libraries WHERE owner_id = ?)
      `,
      args: [ownerId],
    });
    let pos = defaults.length;
    for (const row of used.rows) {
      const name = (row.status || '').trim();
      if (!name || defaults.some(d => d.name.toLowerCase() === name.toLowerCase())) continue;
      await run(db, `INSERT OR IGNORE INTO statuses (owner_id, name, color, position) VALUES (?, ?, ?, ?)`,
        [ownerId, name, '#7C93AC', pos++]);
    }
  } catch { /* series table not ready yet — nothing to backfill */ }
}

// ─── Schema: per-user tags table ──────────────────────────────────────────
// Creates the tags table if missing, or migrates it from the old global
// (no owner_id) shape to the current per-user shape. SQLite can't alter a
// UNIQUE constraint in place, so migrating means rebuilding the table.
//
// Old global tag rows can't be safely auto-assigned to one specific user,
// so they're preserved untouched under `tags_legacy_unmigrated` (nothing
// is deleted) and a fresh empty per-user `tags` table is created. Existing
// series keep their series_tags links pointing at the OLD tag ids, which
// now live in the renamed table — those links become inert (the join in
// SERIES_SELECT won't find matches there anymore) rather than broken;
// re-tagging a series recreates them going forward.
async function ensureTagsTable(db) {
  const exists = await tableExists(db, 'tags');
  if (!exists) {
    await db.execute(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        color TEXT DEFAULT '#4a90e2',
        UNIQUE(owner_id, name)
      )
    `);
    return;
  }

  const cols = await columnNames(db, 'tags');
  if (cols.has('owner_id')) return; // already per-user — nothing to do

  console.warn('[schema-migrate] tags table is in the old global (non-per-user) shape — migrating to per-user…');
  await db.execute(`DROP TABLE IF EXISTS tags_legacy_unmigrated`);
  await db.execute(`ALTER TABLE tags RENAME TO tags_legacy_unmigrated`);
  await db.execute(`
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      color TEXT DEFAULT '#4a90e2',
      UNIQUE(owner_id, name)
    )
  `);
  console.warn('[schema-migrate] Old tags preserved as tags_legacy_unmigrated. Each user starts with an empty tag list.');
}

// ─── Schema: per-user statuses table ──────────────────────────────────────
// Same migration approach as tags — old global statuses are preserved
// under statuses_legacy_unmigrated, and ensureDefaultStatusesForUser()
// seeds fresh per-user defaults on next sign-in/sign-up.
async function ensureStatusesTable(db) {
  const exists = await tableExists(db, 'statuses');
  if (!exists) {
    await db.execute(`
      CREATE TABLE statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        color TEXT NOT NULL DEFAULT '#7C93AC',
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE(owner_id, name)
      )
    `);
    return;
  }

  const cols = await columnNames(db, 'statuses');
  if (cols.has('owner_id')) return; // already per-user — nothing to do

  console.warn('[schema-migrate] statuses table is in the old global (non-per-user) shape — migrating to per-user…');
  await db.execute(`DROP TABLE IF EXISTS statuses_legacy_unmigrated`);
  await db.execute(`ALTER TABLE statuses RENAME TO statuses_legacy_unmigrated`);
  await db.execute(`
    CREATE TABLE statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      color TEXT NOT NULL DEFAULT '#7C93AC',
      position INTEGER NOT NULL DEFAULT 0,
      UNIQUE(owner_id, name)
    )
  `);
  console.warn('[schema-migrate] Old statuses preserved as statuses_legacy_unmigrated. Each user gets fresh defaults on next sign-in.');
}

// ─── Migration: backfill tag colors ────────────────────────────────────
// Tags created before per-tag colors existed (or inserted through a path
// that predates this change) are stuck on the tags table's schema default.
// Anything still sitting on that default gets a deterministic palette
// color instead — safe to run on every launch, since a tag someone
// intentionally left as the default (unlikely, since there's no color
// picker) just gets swept in the same way as an unmigrated one.
async function ensureTagColorsBackfilled(db) {
  try {
    const rows = await q(db, `SELECT id, name FROM tags WHERE color IS NULL OR color = '#4a90e2'`);
    for (const row of rows) {
      await run(db, `UPDATE tags SET color = ? WHERE id = ?`, [colorForTagName(row.name), row.id]);
    }
  } catch { /* tags table not ready yet — nothing to backfill */ }
}

// ─── Schema repair: broken tags view/trigger leftovers ────────────────────
// Real-world failure mode this fixes: an abandoned "rename + compatibility
// view" migration left `tags` as a VIEW (with INSTEAD OF triggers)
// forwarding to a `tags_old` table that no longer exists — so every write
// throws "no such table: main.tags_old". Must run BEFORE ensureTagsTable(),
// since that function's ALTER/PRAGMA calls assume `tags` is a real table.
async function ensureTagsTableIsHealthy(db) {
  try {
    const master = await db.execute(`
      SELECT type, name, sql FROM sqlite_master
      WHERE name = 'tags' OR name = 'tags_old' OR (sql IS NOT NULL AND sql LIKE '%tags_old%')
    `);
    const rows = master.rows;
    const tagsEntry = rows.find(r => r.name === 'tags');
    const isBrokenView = !!tagsEntry && tagsEntry.type === 'view';
    const staleTriggers = rows.filter(r => r.type === 'trigger' && (r.sql || '').includes('tags_old'));

    if (!isBrokenView && staleTriggers.length === 0) return; // healthy — nothing to do

    console.warn('[schema-repair] tags table is a broken view/trigger set referencing tags_old — repairing…');

    let oldRows = [];
    const hasTagsOldTable = rows.some(r => r.name === 'tags_old' && r.type === 'table');
    if (hasTagsOldTable) {
      try { oldRows = (await db.execute(`SELECT * FROM tags_old`)).rows; } catch { /* unreadable — skip */ }
    }

    for (const t of staleTriggers) await db.execute(`DROP TRIGGER IF EXISTS ${t.name}`);
    if (isBrokenView) await db.execute(`DROP VIEW IF EXISTS tags`);
    await db.execute(`DROP TABLE IF EXISTS tags_old`);

    // Recreate as a plain GLOBAL table here — ensureTagsTable() (which
    // runs right after this) is what upgrades it to the per-user shape
    // and preserves this data under tags_legacy_unmigrated if so.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL COLLATE NOCASE,
        color TEXT DEFAULT '#4a90e2'
      )
    `);

    for (const row of oldRows) {
      if (!row.name) continue;
      await db.execute({
        sql: `INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)`,
        args: [row.name, row.color || '#4a90e2'],
      });
    }

    console.warn(`[schema-repair] tags table repaired${oldRows.length ? ` (${oldRows.length} tag(s) recovered from tags_old)` : ''}.`);
  } catch (err) {
    console.error('[schema-repair] Could not inspect/repair tags schema — continuing anyway:', err.message);
  }
}

// ─── Schema: everything else, created if missing ─────────────────────────
// Safe to call on every launch — every statement is IF NOT EXISTS, so this
// is a no-op once the schema exists. This does NOT touch tags/statuses
// (handled above, since those need migration logic, not just creation).
async function ensureCoreSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'grid',
      icon_image TEXT,
      position INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      owner_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      UNIQUE(owner_id, key)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      color TEXT DEFAULT '#b2bec3'
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      status TEXT DEFAULT 'Planning',
      synopsis TEXT,
      library_id INTEGER NOT NULL,
      kind TEXT DEFAULT 'series',
      overall_thoughts TEXT,
      chapter_thoughts TEXT,
      cover_image_path TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      volume_number INTEGER NOT NULL,
      title TEXT,
      chapter_range TEXT,
      chapter_count INTEGER,
      thoughts TEXT,
      chapter_notes TEXT,
      cover_image_path TEXT,
      date_read TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Side',
      volume_appearances TEXT,
      notes TEXT,
      profile_image_path TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_character_id INTEGER NOT NULL,
      to_character_id INTEGER NOT NULL,
      type TEXT DEFAULT 'Friend',
      label TEXT,
      is_bidirectional INTEGER DEFAULT 1,
      notes TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series_tags (
      series_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      UNIQUE(series_id, tag_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series_genres (
      series_id INTEGER NOT NULL,
      genre_id INTEGER NOT NULL,
      UNIQUE(series_id, genre_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS content_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      UNIQUE(owner_id, name)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series_content_warnings (
      series_id INTEGER NOT NULL,
      warning_id INTEGER NOT NULL,
      UNIQUE(series_id, warning_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      caption TEXT,
      position INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      library_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      group_type TEXT DEFAULT 'Series Group',
      description TEXT,
      cover_image_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS series_group_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      series_id INTEGER NOT NULL,
      group_role TEXT DEFAULT 'Main Story',
      position INTEGER NOT NULL DEFAULT 0,
      UNIQUE(group_id, series_id)
    )
  `);
}

// ─── Series Groups (Umbrella Groups / Shared Universes) ───────────────────

async function seriesGroupsGetAll(db, ownerId, libraryId) {
  let where = 'WHERE g.library_id IN (SELECT id FROM libraries WHERE owner_id = ?)';
  const args = [ownerId];
  if (libraryId != null && libraryId !== '') {
    where += ' AND g.library_id = ?';
    args.push(libraryId);
  }

  const groups = await q(db, `
    SELECT g.*, COUNT(gi.id) as item_count
    FROM series_groups g
    LEFT JOIN series_group_items gi ON gi.group_id = g.id
    ${where}
    GROUP BY g.id
    ORDER BY g.name COLLATE NOCASE
  `, args);

  for (const group of groups) {
    const items = await q(db, `
      SELECT gi.id as item_id, gi.group_role, gi.position,
             s.id, s.title, s.author, s.status, s.kind, s.rating, s.book_type,
             s.cover_image_path, s.is_nsfw,
             (SELECT COUNT(*) FROM volumes v WHERE v.series_id = s.id) as volume_count,
             (SELECT COUNT(*) FROM characters c WHERE c.series_id = s.id) as character_count
      FROM series_group_items gi
      JOIN series s ON gi.series_id = s.id
      WHERE gi.group_id = ?
      ORDER BY gi.position, gi.id
    `, [group.id]);
    group.items = items.map(item => ({
      ...item,
      id: Number(item.id),
      is_nsfw: !!item.is_nsfw,
    }));
  }

  return groups;
}

async function seriesGroupsGet(db, ownerId, id) {
  const group = await one(db, `
    SELECT g.*
    FROM series_groups g
    WHERE g.id = ? AND g.library_id IN (SELECT id FROM libraries WHERE owner_id = ?)
  `, [id, ownerId]);
  if (!group) return null;

  const items = await q(db, `
    SELECT gi.id as item_id, gi.group_role, gi.position,
           s.id, s.title, s.author, s.status, s.kind, s.rating, s.book_type,
           s.cover_image_path, s.is_nsfw,
           (SELECT COUNT(*) FROM volumes v WHERE v.series_id = s.id) as volume_count,
           (SELECT COUNT(*) FROM characters c WHERE c.series_id = s.id) as character_count
    FROM series_group_items gi
    JOIN series s ON gi.series_id = s.id
    WHERE gi.group_id = ?
    ORDER BY gi.position, gi.id
  `, [id]);
  group.items = items.map(item => ({
    ...item,
    id: Number(item.id),
    is_nsfw: !!item.is_nsfw,
  }));
  return group;
}

async function seriesGroupsCreate(db, ownerId, d) {
  const lib = await one(db, `SELECT id FROM libraries WHERE id = ? AND owner_id = ?`, [d.library_id, ownerId]);
  if (!lib) throw new Error('Category not found for this user');

  const r = await run(db, `
    INSERT INTO series_groups (library_id, name, group_type, description, cover_image_path)
    VALUES (?, ?, ?, ?, ?)
  `, [d.library_id, d.name, d.group_type || 'Series Group', d.description || null, d.cover_image_path || null]);
  const groupId = Number(r.lastInsertRowid);

  await replaceSeriesGroupItems(db, groupId, d.library_id, d.items);
  return groupId;
}

async function seriesGroupsUpdate(db, ownerId, id, d) {
  const existing = await one(db, `
    SELECT id, library_id FROM series_groups WHERE id = ? AND library_id IN (SELECT id FROM libraries WHERE owner_id = ?)
  `, [id, ownerId]);
  if (!existing) throw new Error('Series group not found for this user');

  await run(db, `
    UPDATE series_groups SET name=?, group_type=?, description=?, cover_image_path=? WHERE id=?
  `, [d.name, d.group_type || 'Series Group', d.description || null, d.cover_image_path || null, id]);

  if (Array.isArray(d.items)) {
    await replaceSeriesGroupItems(db, id, existing.library_id, d.items);
  }
  return true;
}

async function replaceSeriesGroupItems(db, groupId, libraryId, items) {
  await run(db, `DELETE FROM series_group_items WHERE group_id = ?`, [groupId]);
  if (!Array.isArray(items)) return;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const seriesId = Number(item.series_id);
    if (!seriesId) continue;
    const series = await one(db, `SELECT id FROM series WHERE id = ? AND library_id = ?`, [seriesId, libraryId]);
    if (!series) continue;
    await run(db, `
      INSERT OR IGNORE INTO series_group_items (group_id, series_id, group_role, position)
      VALUES (?, ?, ?, ?)
    `, [groupId, seriesId, item.group_role || 'Main Story', item.position !== undefined ? item.position : i]);
  }
}

async function detachSeriesFromGroups(db, seriesId, keepLibraryId = null) {
  if (keepLibraryId != null) {
    await run(db, `
      DELETE FROM series_group_items
      WHERE series_id = ?
        AND group_id IN (SELECT id FROM series_groups WHERE library_id != ?)
    `, [seriesId, keepLibraryId]);
    return;
  }
  await run(db, `DELETE FROM series_group_items WHERE series_id = ?`, [seriesId]);
}

async function seriesGroupsDelete(db, ownerId, id) {
  const existing = await one(db, `
    SELECT id FROM series_groups WHERE id = ? AND library_id IN (SELECT id FROM libraries WHERE owner_id = ?)
  `, [id, ownerId]);
  if (!existing) throw new Error('Series group not found for this user');

  await run(db, `DELETE FROM series_group_items WHERE group_id = ?`, [id]);
  await run(db, `DELETE FROM series_groups WHERE id = ?`, [id]);
  return true;
}

// ─── Migrations: extra book-detail columns ──────────────────────────────
// SQLite/libSQL has no "ADD COLUMN IF NOT EXISTS", so we check PRAGMA
// table_info first and only add what's missing. Safe to call on every
// startup — a no-op once the columns already exist.

async function ensureSeriesExtraColumns(db) {
  try {
    const info = await db.execute(`PRAGMA table_info(series)`);
    const existing = new Set(info.rows.map(r => r.name));
    for (const [name, type] of SERIES_EXTRA_FIELDS) {
      if (!existing.has(name)) {
        await db.execute(`ALTER TABLE series ADD COLUMN ${name} ${type}`);
      }
    }
  } catch { /* no series table yet — nothing to migrate */ }
}

async function ensureVolumesExtraColumns(db) {
  try {
    const info = await db.execute(`PRAGMA table_info(volumes)`);
    const existing = new Set(info.rows.map(r => r.name));
    if (!existing.has('published_date')) {
      await db.execute(`ALTER TABLE volumes ADD COLUMN published_date TEXT`);
    }
  } catch { /* no volumes table yet — nothing to migrate */ }
}

const CHARACTER_EXTRA_FIELDS = [
  ['status_role', 'TEXT'],           // e.g. "Emperor | Newly crowned emperor who…"
  ['overall_vibes', 'TEXT'],         // e.g. "Cold, dangerous, suspicious…"
  ['appears_vs_reality', 'TEXT'],    // e.g. "Appears: … / Reality: …"
  ['personality', 'TEXT'],           // e.g. "⭐ cold-blooded, ruthless…"
];

async function ensureCharacterExtraColumns(db) {
  try {
    const info = await db.execute(`PRAGMA table_info(characters)`);
    const existing = new Set(info.rows.map(r => r.name));
    for (const [name, type] of CHARACTER_EXTRA_FIELDS) {
      if (!existing.has(name)) {
        await db.execute(`ALTER TABLE characters ADD COLUMN ${name} ${type}`);
      }
    }
  } catch { /* no characters table yet — nothing to migrate */ }
}

module.exports = {
  ensureTagsTableIsHealthy,
  ensureTagsTable,
  ensureTagColorsBackfilled,
  ensureStatusesTable,
  ensureDefaultStatusesForUser,
  ensureCoreSchema,
  ensureSeriesExtraColumns,
  ensureVolumesExtraColumns,
  ensureCharacterExtraColumns,
  libraries: { getAll: librariesGetAll, create: librariesCreate, update: librariesUpdate, delete: librariesDelete },
  tags: { getAll: tagsGetAll, create: tagsCreate },
  genres: { getAll: genresGetAll },
  contentWarnings: { getAll: contentWarningsGetAll, create: contentWarningsCreate },
  statuses: { getAll: statusesGetAll, create: statusesCreate, update: statusesUpdate, delete: statusesDelete },
  settings: { getAll: settingsGetAll, set: settingsSet },
  series: {
    getAll: seriesGetAll, get: seriesGet, create: seriesCreate, update: seriesUpdate, delete: seriesDelete,
    transfer: seriesTransfer, copy: seriesCopy,
  },
  seriesGroups: {
    getAll: seriesGroupsGetAll, get: seriesGroupsGet, create: seriesGroupsCreate,
    update: seriesGroupsUpdate, delete: seriesGroupsDelete,
  },
  volumes: { getBySeries: volumesGetBySeries, get: volumesGet, create: volumesCreate, update: volumesUpdate, delete: volumesDelete },
  characters: { getBySeries: charactersGetBySeries, get: charactersGet, create: charactersCreate, update: charactersUpdate, delete: charactersDelete },
  relationships: {
    getBySeries: relationshipsGetBySeries, getByCharacter: relationshipsGetByCharacter,
    create: relationshipsCreate, update: relationshipsUpdate, delete: relationshipsDelete,
  },
  gallery: { getBySeries: galleryGetBySeries, add: galleryAdd, updateCaption: galleryUpdateCaption, delete: galleryDelete, reorder: galleryReorder },
  attachments: { getBySeries: attachmentsGetBySeries, add: attachmentsAdd, delete: attachmentsDelete },
};