/**
 * api/store.js — Vercel Blob Store Unified CRUD API
 * 
 * Endpoint tunggal untuk semua koleksi data aplikasi ESI Trenggalek.
 * Semua data disimpan sebagai JSON di Vercel Blob (private store).
 * 
 * GET    /api/store?collection=athletes
 * POST   /api/store   { collection, action, payload }
 *   actions: get, create, update, delete, upsert, reset
 * 
 * Koleksi yang didukung:
 *   athletes, events, news, registrations
 */

const { put } = require('@vercel/blob');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "vercel_blob_rw_LPwrIMxJmWXm9ltj_vCdKTxYyVZ7Dv2niukddQ1bF0v4J1s";
const BASE_URL = "https://lpwrimxjmwxm9ltj.private.blob.vercel-storage.com";

const VALID_COLLECTIONS = ['athletes', 'events', 'news', 'registrations'];

// ---- Helpers ----

function blobPath(collection) {
    return `data/${collection}.json`;
}

function blobUrl(collection) {
    return `${BASE_URL}/data/${collection}.json`;
}

async function fetchCollection(collection) {
    try {
        const res = await fetch(blobUrl(collection), {
            headers: { 'Authorization': `Bearer ${TOKEN}` },
            cache: 'no-store'
        });
        if (res.ok) {
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        }
    } catch (_) {}
    return [];
}

async function saveCollection(collection, data) {
    await put(blobPath(collection), JSON.stringify(data, null, 2), {
        token: TOKEN,
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true
    });
}

function parseBody(req) {
    return new Promise((resolve) => {
        if (req.body && typeof req.body === 'object') return resolve(req.body);
        if (typeof req.body === 'string') {
            try { return resolve(JSON.parse(req.body)); } catch (_) { return resolve({}); }
        }
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); }
        });
    });
}

// ---- Main Handler ----

module.exports = async (req, res) => {
    // Polyfill helpers for Node native HTTP
    if (!res.status) res.status = function(c) { this.statusCode = c; return this; };
    if (!res.json) res.json = function(d) { this.setHeader('Content-Type', 'application/json'); this.end(JSON.stringify(d)); };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).json({});

    // Parse URL params
    let collection = null;
    if (req.query && req.query.collection) {
        collection = req.query.collection;
    } else if (req.url) {
        try {
            const parsed = new URL(req.url, 'http://localhost:3000');
            collection = parsed.searchParams.get('collection');
        } catch (_) {}
    }

    // ---- GET: Ambil seluruh koleksi ----
    if (req.method === 'GET') {
        if (!collection || !VALID_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ error: `collection harus salah satu dari: ${VALID_COLLECTIONS.join(', ')}` });
        }
        try {
            const data = await fetchCollection(collection);
            return res.status(200).json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // ---- POST: Semua operasi tulis ----
    if (req.method === 'POST') {
        const body = await parseBody(req);
        const col = body.collection || collection;
        const action = body.action || 'get';
        const payload = body.payload || {};

        if (!col || !VALID_COLLECTIONS.includes(col)) {
            return res.status(400).json({ error: `collection tidak valid: ${col}` });
        }

        try {
            let items = await fetchCollection(col);

            // ---- GET ----
            if (action === 'get') {
                return res.status(200).json(items);
            }

            // ---- CREATE ----
            if (action === 'create') {
                if (!payload || typeof payload !== 'object') {
                    return res.status(400).json({ error: 'payload diperlukan untuk create' });
                }
                // Assign ID jika belum ada
                if (!payload.id) {
                    payload.id = Date.now();
                }
                items.unshift(payload);
                await saveCollection(col, items);
                return res.status(200).json({ success: true, item: payload, items });
            }

            // ---- UPDATE ----
            if (action === 'update') {
                const { id, data: updateData } = payload;
                if (!id || !updateData) {
                    return res.status(400).json({ error: 'payload.id dan payload.data diperlukan untuk update' });
                }
                const idx = items.findIndex(i => String(i.id) === String(id));
                if (idx === -1) return res.status(404).json({ error: `Item ${id} tidak ditemukan di ${col}` });
                items[idx] = { ...items[idx], ...updateData, id: items[idx].id };
                await saveCollection(col, items);
                return res.status(200).json({ success: true, item: items[idx], items });
            }

            // ---- DELETE ----
            if (action === 'delete') {
                const { id } = payload;
                if (!id) return res.status(400).json({ error: 'payload.id diperlukan untuk delete' });
                const before = items.length;
                items = items.filter(i => String(i.id) !== String(id));
                await saveCollection(col, items);
                return res.status(200).json({ success: true, deleted: before - items.length, items });
            }

            // ---- UPSERT (update jika ada, create jika tidak ada) ----
            if (action === 'upsert') {
                if (!payload || !payload.id) {
                    return res.status(400).json({ error: 'payload.id diperlukan untuk upsert' });
                }
                const idx = items.findIndex(i => String(i.id) === String(payload.id));
                if (idx >= 0) {
                    items[idx] = { ...items[idx], ...payload };
                } else {
                    items.unshift(payload);
                }
                await saveCollection(col, items);
                return res.status(200).json({ success: true, item: idx >= 0 ? items[idx] : items[0], items });
            }

            // ---- RESET: Tulis ulang koleksi dengan data baru (bulk seed) ----
            if (action === 'reset') {
                const newData = payload.data;
                if (!Array.isArray(newData)) {
                    return res.status(400).json({ error: 'payload.data harus array untuk reset' });
                }
                await saveCollection(col, newData);
                return res.status(200).json({ success: true, count: newData.length, items: newData });
            }

            return res.status(400).json({ error: `action tidak dikenal: ${action}` });
        } catch (err) {
            console.error(`[store] ${col}/${action} error:`, err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
