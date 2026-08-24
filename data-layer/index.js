// ─── Data Layer ──────────────────────────────────────────────────────────
//
// Plain functions, no Electron dependency anywhere in this file. Every
// function takes a libSQL `db` client (see client.js) as its first
// argument. This is what main.js's ipcMain handlers call into, and it's
// the module the future Expo app is meant to import unmodified (minus
// client.js, which is platform-specific).
//
// Query shape mirrors the original inline-SQL version closely on purpose —
// that mapping is what made Turso the low-risk choice over a Postgres
// rewrite.

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
    const { tag_data, genre_data, ...rest } = row;
    return { ...rest, tags, genres };
}

const q = (db, sql, args = []) => db.execute({ sql, args }).then(r => r.rows);
const one = async (db, sql, args = []) => (await q(db, sql, args))[0] || null;
const run = (db, sql, args = []) => db.execute({ sql, args });

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

// ─── Tags & Genres ──────────────────────────────────────────────────────

async function tagsGetAll(db) {
    return q(db, `SELECT * FROM tags ORDER BY name COLLATE NOCASE`);
}

async function tagsCreate(db, name) {
    const trimmed = name.trim();
    await run(db, `INSERT OR IGNORE INTO tags (name) VALUES (?)`, [trimmed]);
    return one(db, `SELECT * FROM tags WHERE name = ?`, [trimmed]);
}

async function genresGetAll(db) {
    return q(db, `SELECT * FROM genres ORDER BY name COLLATE NOCASE`);
}

// ─── Settings (per-user now, not global) ───────────────────────────────

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

async function upsertSeriesTags(db, seriesId, tags) {
    await run(db, `DELETE FROM series_tags WHERE series_id = ?`, [seriesId]);
    for (const name of tags) {
        const t = name.trim();
        if (!t) continue;
        await run(db, `INSERT OR IGNORE INTO tags (name) VALUES (?)`, [t]);
        const tag = await one(db, `SELECT id FROM tags WHERE name = ?`, [t]);
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

const SERIES_SELECT = `
  SELECT s.*,
    (SELECT GROUP_CONCAT(t.id || '::' || t.name || '::' || t.color, '||')
       FROM series_tags st JOIN tags t ON st.tag_id = t.id
       WHERE st.series_id = s.id) as tag_data,
    (SELECT GROUP_CONCAT(g.id || '::' || g.name || '::' || g.color, '||')
       FROM series_genres sg JOIN genres g ON sg.genre_id = g.id
       WHERE sg.series_id = s.id) as genre_data,
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

async function seriesCreate(db, ownerId, data) {
    // Verify the target library belongs to this user before inserting.
    const lib = await one(db, `SELECT id FROM libraries WHERE id = ? AND owner_id = ?`, [data.library_id, ownerId]);
    if (!lib) throw new Error('Library not found for this user');

    const tx = await db.transaction('write');
    try {
        const r = await tx.execute({
            sql: `INSERT INTO series (title, author, status, synopsis, library_id, kind, overall_thoughts, chapter_thoughts, cover_image_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [data.title, data.author || null, data.status || 'Planning', data.synopsis || null, data.library_id,
            data.kind || 'series', data.overall_thoughts || null, data.chapter_thoughts || null, data.cover_image_path || null],
        });
        const seriesId = Number(r.lastInsertRowid);
        await tx.commit();
        // Tag/genre upserts run outside the transaction (they're idempotent
        // OR IGNORE upserts, and libSQL transactions don't nest).
        await upsertSeriesTags(db, seriesId, data.tags || []);
        await upsertSeriesGenres(db, seriesId, data.genres || []);
        return seriesId;
    } catch (err) {
        await tx.rollback();
        throw err;
    }
}

async function seriesUpdate(db, ownerId, id, data) {
    const existing = await seriesGet(db, ownerId, id);
    if (!existing) throw new Error('Series not found for this user');

    await run(db, `
    UPDATE series SET title=?, author=?, status=?, synopsis=?, kind=?, overall_thoughts=?, chapter_thoughts=?, cover_image_path=? WHERE id=?
  `, [data.title, data.author || null, data.status || 'Planning', data.synopsis || null,
    data.kind || 'series', data.overall_thoughts || null, data.chapter_thoughts || null, data.cover_image_path || null, id]);
    if (data.tags !== undefined) await upsertSeriesTags(db, id, data.tags);
    if (data.genres !== undefined) await upsertSeriesGenres(db, id, data.genres);
    return true;
}

async function seriesDelete(db, ownerId, id) {
    const existing = await seriesGet(db, ownerId, id);
    if (!existing) throw new Error('Series not found for this user');
    await run(db, `DELETE FROM series WHERE id = ?`, [id]);
    return true;
}

// ─── Volumes ────────────────────────────────────────────────────────────
// Note: volumes/characters/relationships/gallery/attachments trust that the
// caller (main.js) already resolved series_id through seriesGet(ownerId, ...)
// for the enclosing series, so ownership doesn't need re-checking on every
// child row — see main.js for where that check happens once per request.

async function volumesGetBySeries(db, seriesId) {
    return q(db, `SELECT * FROM volumes WHERE series_id = ? ORDER BY volume_number`, [seriesId]);
}
async function volumesGet(db, id) { return one(db, `SELECT * FROM volumes WHERE id = ?`, [id]); }
async function volumesCreate(db, d) {
    const r = await run(db, `
    INSERT INTO volumes (series_id, volume_number, title, chapter_range, chapter_count, thoughts, chapter_notes, cover_image_path, date_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [d.series_id, d.volume_number, d.title || null, d.chapter_range || null, d.chapter_count || null,
    d.thoughts || null, d.chapter_notes || null, d.cover_image_path || null, d.date_read || null]);
    return Number(r.lastInsertRowid);
}
async function volumesUpdate(db, id, d) {
    await run(db, `
    UPDATE volumes SET volume_number=?, title=?, chapter_range=?, chapter_count=?, thoughts=?, chapter_notes=?, cover_image_path=?, date_read=? WHERE id=?
  `, [d.volume_number, d.title || null, d.chapter_range || null, d.chapter_count || null,
    d.thoughts || null, d.chapter_notes || null, d.cover_image_path || null, d.date_read || null, id]);
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
    INSERT INTO characters (series_id, name, role, volume_appearances, notes, profile_image_path) VALUES (?, ?, ?, ?, ?, ?)
  `, [d.series_id, d.name, d.role || 'Side', d.volume_appearances || null, d.notes || null, d.profile_image_path || null]);
    return Number(r.lastInsertRowid);
}
async function charactersUpdate(db, id, d) {
    await run(db, `
    UPDATE characters SET name=?, role=?, volume_appearances=?, notes=?, profile_image_path=? WHERE id=?
  `, [d.name, d.role || 'Side', d.volume_appearances || null, d.notes || null, d.profile_image_path || null, id]);
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
// Returns the deleted row's image_path so the caller (main.js) can also
// delete the R2 object — data-layer never touches storage directly.
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

module.exports = {
    libraries: { getAll: librariesGetAll, create: librariesCreate, update: librariesUpdate, delete: librariesDelete },
    tags: { getAll: tagsGetAll, create: tagsCreate },
    genres: { getAll: genresGetAll },
    settings: { getAll: settingsGetAll, set: settingsSet },
    series: { getAll: seriesGetAll, get: seriesGet, create: seriesCreate, update: seriesUpdate, delete: seriesDelete },
    volumes: { getBySeries: volumesGetBySeries, get: volumesGet, create: volumesCreate, update: volumesUpdate, delete: volumesDelete },
    characters: { getBySeries: charactersGetBySeries, get: charactersGet, create: charactersCreate, update: charactersUpdate, delete: charactersDelete },
    relationships: {
        getBySeries: relationshipsGetBySeries, getByCharacter: relationshipsGetByCharacter,
        create: relationshipsCreate, update: relationshipsUpdate, delete: relationshipsDelete,
    },
    gallery: { getBySeries: galleryGetBySeries, add: galleryAdd, updateCaption: galleryUpdateCaption, delete: galleryDelete, reorder: galleryReorder },
    attachments: { getBySeries: attachmentsGetBySeries, add: attachmentsAdd, delete: attachmentsDelete },
};