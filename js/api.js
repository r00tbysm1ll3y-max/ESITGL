/**
 * API SERVICE LAYER - Vercel Blob Store (Primary)
 *
 * Semua data utama (athletes, events, news, registrations) disimpan di Vercel Blob
 * via endpoint server-side /api/store.
 * localStorage hanya dipakai sebagai cache offline (read-only fallback).
 * Supabase tidak lagi digunakan untuk CRUD data utama.
 */

// Helper Mapping CamelCase <-> snake_case untuk tabel Supabase
const Mapper = {
    athleteToDb: (a) => ({
        id: typeof a.id === 'number' && a.id < 2147483647 ? a.id : undefined,
        username: a.username || '',
        password_hash: a.password || a.password_hash || '',
        full_name: a.fullName,
        status_pekerjaan: a.statusPekerjaan || 'PELAJAR',
        jenjang: a.jenjang || '',
        institution: a.institution,
        agama: a.agama || '',
        tempat_lahir: a.tempatLahir || '',
        tanggal_lahir: a.tanggalLahir || '',
        jenis_kelamin: a.jenisKelamin || 'Laki-laki',
        alamat: a.alamat || '',
        rt: a.rt || '',
        rw: a.rw || '',
        kodepos: a.kodepos || '',
        desa: a.desa || '',
        kecamatan: a.kecamatan || '',
        kabupaten: a.kabupaten || 'Kabupaten Trenggalek',
        provinsi: a.provinsi || 'Jawa Timur',
        whatsapp: a.whatsapp,
        email: a.email || '',
        nickname: a.nickname,
        game_id: a.gameId,
        division: a.division,
        team_name: a.teamName || 'Individu / Non-Tim',
        points: parseInt(a.points, 10) || 0,
        status: a.status || 'pending',
        persetujuan: true,
        avatar_url: a.avatarUrl || a.avatar || a.avatar_url || '',
        game_profiles: a.gameProfiles ? (typeof a.gameProfiles === 'string' ? a.gameProfiles : JSON.stringify(a.gameProfiles)) : undefined
    }),
    athleteFromDb: (row) => ({
        id: row.id,
        username: row.username,
        password_hash: row.password_hash || '',
        fullName: row.full_name,
        statusPekerjaan: row.status_pekerjaan,
        jenjang: row.jenjang,
        institution: row.institution,
        agama: row.agama,
        tempatLahir: row.tempat_lahir,
        tanggalLahir: row.tanggal_lahir,
        jenisKelamin: row.jenis_kelamin,
        alamat: row.alamat,
        rt: row.rt,
        rw: row.rw,
        kodepos: row.kodepos,
        desa: row.desa,
        kecamatan: row.kecamatan,
        kabupaten: row.kabupaten,
        provinsi: row.provinsi,
        whatsapp: row.whatsapp,
        email: row.email,
        nickname: row.nickname,
        gameId: row.game_id,
        division: row.division,
        teamName: row.team_name,
        points: row.points || 0,
        status: row.status || 'pending',
        avatarUrl: row.avatar_url || row.avatarUrl || row.avatar || '',
        gameProfiles: row.game_profiles ? (typeof row.game_profiles === 'string' ? JSON.parse(row.game_profiles) : row.game_profiles) : (row.gameProfiles || {})
    }),
    eventToDb: (e) => ({
        title: e.title,
        division: e.division,
        date: e.date,
        location: e.location,
        status: e.status,
        description: e.description
    }),
    eventFromDb: (row) => ({
        id: row.id,
        title: row.title,
        division: row.division,
        date: row.date,
        location: row.location,
        status: row.status,
        description: row.description
    }),
    newsToDb: (n) => ({
        title: n.title,
        category: n.category,
        author: n.author || 'Humas ESI Trenggalek',
        source: n.source || '',
        image_url: n.imageUrl || n.image_url || '',
        image_position: n.imagePosition || n.image_position || 'top',
        date: n.date,
        excerpt: n.excerpt,
        content: n.content,
        inline_images: n.inlineImages ? (typeof n.inlineImages === 'string' ? n.inlineImages : JSON.stringify(n.inlineImages)) : undefined
    }),
    newsFromDb: (row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        author: row.author || 'Humas ESI Trenggalek',
        source: row.source || '',
        imageUrl: row.image_url || row.imageUrl || '',
        imagePosition: row.image_position || row.imagePosition || 'top',
        date: row.date,
        excerpt: row.excerpt,
        content: row.content,
        inlineImages: row.inline_images ? (typeof row.inline_images === 'string' ? JSON.parse(row.inline_images) : row.inline_images) : (row.inlineImages || {})
    })
};


const Api = {

    // ================================================================
    //  KONFIGURASI CLOUD VERCEL BLOB STORAGE (SOURCE OF TRUTH UTAMA)
    //  Semua penyimpanan data (atlet, event, berita, pendaftar turnamen,
    //  dan akun admin) disimpan terpusat di Cloud Vercel Blob.
    // ================================================================

    _BLOB_TOKEN: "vercel_blob_rw_LPwrIMxJmWXm9ltj_vCdKTxYyVZ7Dv2niukddQ1bF0v4J1s",
    _BLOB_READ_URL: "https://lpwrimxjmwxm9ltj.private.blob.vercel-storage.com",
    _BLOB_WRITE_URL: "https://blob.vercel-storage.com",

    _memoryCache: {},

    async _storeGet(collection, forceNetwork = false) {
        // Jika sudah ada di memori dan tidak dipaksa ambil baru dari network, kembalikan instan (0ms)
        if (!forceNetwork && this._memoryCache[collection] && Array.isArray(this._memoryCache[collection])) {
            return this._memoryCache[collection];
        }

        const bust = `_t=${Date.now()}`;

        // 1. Coba lewat serverless endpoint /api/store jika di Vercel
        try {
            const res = await fetch(`/api/store?collection=${collection}&${bust}`, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    this._memoryCache[collection] = data;
                    return data;
                }
            }
        } catch (_) {}

        // 2. Akses LANGSUNG ke Cloud Vercel Blob (Berfungsi 100% di GitHub Pages & Global)
        try {
            const res = await fetch(`${this._BLOB_READ_URL}/data/${collection}.json?${bust}`, {
                headers: { 'Authorization': `Bearer ${this._BLOB_TOKEN}` },
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    this._memoryCache[collection] = data;
                    return data;
                }
            }
        } catch (err) {
            console.warn(`[Api] Fetch langsung Cloud Blob (${collection}):`, err);
        }

        // 3. Fallback memory cache
        if (this._memoryCache[collection]) return this._memoryCache[collection];
        return null;
    },

    async _storePost(action, collection, payload) {
        // 1. Coba lewat serverless endpoint jika tersedia
        try {
            const res = await fetch('/api/store', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, collection, payload })
            });
            if (res.ok) {
                const result = await res.json();
                if (result.items) this._memoryCache[collection] = result.items;
                return result;
            }
        } catch (_) {}

        // 2. TULIS LANGSUNG ke Cloud Vercel Blob (Bypass Serverless, 100% Cloud Blob)
        try {
            let items = (await this._storeGet(collection)) || [];

            if (action === 'get') {
                return { success: true, items };
            }

            if (action === 'create') {
                if (!payload.id) payload.id = Date.now();
                items.unshift(payload);
            } else if (action === 'update') {
                const { id, data: updateData } = payload;
                const idx = items.findIndex(i => String(i.id) === String(id));
                if (idx >= 0) {
                    items[idx] = { ...items[idx], ...updateData, id: items[idx].id };
                }
            } else if (action === 'delete') {
                const { id } = payload;
                items = items.filter(i => String(i.id) !== String(id));
            } else if (action === 'upsert') {
                const idx = items.findIndex(i => String(i.id) === String(payload.id));
                if (idx >= 0) items[idx] = { ...items[idx], ...payload };
                else items.unshift(payload);
            } else if (action === 'reset') {
                items = Array.isArray(payload.data) ? payload.data : [];
            }

            this._memoryCache[collection] = items;

            // PUT Langsung ke Cloud Vercel Blob REST API
            const putRes = await fetch(`${this._BLOB_WRITE_URL}/data/${collection}.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this._BLOB_TOKEN}`,
                    'x-vercel-blob-access': 'private',
                    'x-allow-overwrite': '1',
                    'x-add-random-suffix': '0',
                    'x-content-type': 'application/json'
                },
                body: JSON.stringify(items, null, 2)
            });

            if (!putRes.ok) {
                const errText = await putRes.text();
                throw new Error(`Cloud Blob write failed: ${putRes.status} ${errText}`);
            }

            return { success: true, items, item: payload };
        } catch (err) {
            console.error(`[Api] Error write Cloud Blob (${collection}/${action}):`, err);
            throw err;
        }
    },

    // ================================================================
    //  1. ATLET (100% Cloud Blob Storage)
    // ================================================================

    async getAthletes() {
        const blobData = await this._storeGet('athletes');
        if (blobData && blobData.length > 0) return blobData;

        // Fallback seed data awal ke Cloud Blob
        const seed = typeof INITIAL_ATHLETES !== 'undefined' ? [...INITIAL_ATHLETES] : [];
        if (seed.length > 0) {
            this._storePost('reset', 'athletes', { data: seed }).catch(() => {});
        }
        return seed;
    },

    async createAthlete(athleteData) {
        // Nomor registrasi otomatis
        const current = await this.getAthletes();
        const orderNum = current.length + 1;
        const regNo = `ESI-TRG-2026-${String(orderNum).padStart(4, '0')}`;
        const newAthlete = {
            id: Date.now(),
            regNo,
            ...athleteData,
            password_hash: athleteData.password || athleteData.password_hash || '',
            points: 0,
            status: 'pending'
        };
        const result = await this._storePost('create', 'athletes', newAthlete);
        return result.item;
    },

    async updateAthletePassword(id, newPassword) {
        if (!newPassword) return false;
        await this._storePost('update', 'athletes', { id, data: { password: newPassword, password_hash: newPassword } });
        // Perbarui sesi member jika sedang login
        try {
            const session = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION) || 'null');
            if (session && String(session.id) === String(id)) {
                session.password = newPassword;
                session.password_hash = newPassword;
                localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(session));
            }
        } catch (_) {}
        return true;
    },

    async updateAthleteStatus(id, newStatus) {
        await this._storePost('update', 'athletes', { id, data: { status: newStatus } });
        return true;
    },

    async updateAthletePoints(id, points) {
        const parsedPoints = parseInt(points, 10) || 0;
        await this._storePost('update', 'athletes', { id, data: { points: parsedPoints } });
        return true;
    },

    async deleteAthlete(id) {
        await this._storePost('delete', 'athletes', { id });
        return true;
    },

    // ================================================================
    //  STORAGE & MEDIA MANAGEMENT (Vercel Blob upload gambar)
    // ================================================================

    async uploadStorageImage(fileOrDataUrl, folder = 'general') {
        if (!fileOrDataUrl) return null;

        try {
            let body = null;
            let mimeType = 'image/webp';

            if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:')) {
                const matches = fileOrDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches) {
                    mimeType = matches[1];
                    const bstr = atob(matches[2]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) u8arr[n] = bstr.charCodeAt(n);
                    body = new Blob([u8arr], { type: mimeType });
                }
            } else if (fileOrDataUrl instanceof Blob || (typeof File !== 'undefined' && fileOrDataUrl instanceof File)) {
                body = fileOrDataUrl;
                if (fileOrDataUrl.type) mimeType = fileOrDataUrl.type;
            }

            if (body) {
                const ext = mimeType.split('/')[1] || 'webp';
                const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
                const filename = `${cleanFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                const token = CONFIG.VERCEL_BLOB.TOKEN;

                const res = await fetch(`https://blob.vercel-storage.com/${filename}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-api-version': '7',
                        'x-vercel-blob-access': 'public',
                        'content-type': mimeType
                    },
                    body
                });

                if (res.ok) {
                    const blobData = await res.json();
                    if (blobData && blobData.url) {
                        return blobData.url;
                    }
                }
            }
        } catch (err) {
            console.warn('Vercel Blob upload failed:', err);
        }

        // Fallback: kembalikan dataUrl asli (offline)
        return typeof fileOrDataUrl === 'string' ? fileOrDataUrl : null;
    },

    async deleteStorageImage(imageUrl) {
        if (!imageUrl || typeof imageUrl !== 'string') return false;
        if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:') ||
            imageUrl.startsWith('assets/') || imageUrl.startsWith('./')) return true;

        try {
            let targetUrl = imageUrl;
            if (imageUrl.includes('/api/blob?url=')) {
                const match = imageUrl.match(/[?&]url=([^&]+)/);
                if (match) targetUrl = decodeURIComponent(match[1]);
            }

            if (targetUrl.includes('blob.vercel-storage.com')) {
                const res = await fetch('https://blob.vercel-storage.com/delete', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${CONFIG.VERCEL_BLOB.TOKEN}`,
                        'x-api-version': '7',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({ urls: [targetUrl] })
                });
                return res.ok;
            }
        } catch (err) {
            console.warn('Blob delete error:', err);
        }
        return false;
    },

    async deleteStorageFile(fileUrl) {
        return this.deleteStorageImage(fileUrl);
    },

    // ================================================================
    //  2. EVENT
    // ================================================================

    async getEvents() {
        const data = await this._storeGet('events');
        if (data) return data;
        return typeof INITIAL_EVENTS !== 'undefined' ? [...INITIAL_EVENTS] : [];
    },

    async createEvent(eventData) {
        if (eventData.imageUrl && typeof eventData.imageUrl === 'string' && eventData.imageUrl.startsWith('data:')) {
            try {
                const uploadedUrl = await this.uploadStorageImage(eventData.imageUrl, 'events');
                if (uploadedUrl) eventData.imageUrl = uploadedUrl;
            } catch (err) { console.warn('Auto upload poster failed:', err); }
        }
        const newEv = { id: Date.now(), ...eventData };
        const result = await this._storePost('create', 'events', newEv);
        return result.item;
    },

    async updateEventStatus(id, newStatus) {
        await this._storePost('update', 'events', { id, data: { status: newStatus } });
        return true;
    },

    async updateEvent(id, eventData) {
        if (eventData.imageUrl && typeof eventData.imageUrl === 'string' && eventData.imageUrl.startsWith('data:')) {
            try {
                const uploadedUrl = await this.uploadStorageImage(eventData.imageUrl, 'events');
                if (uploadedUrl) eventData.imageUrl = uploadedUrl;
            } catch (err) { console.warn('Auto upload poster failed:', err); }
        }
        const result = await this._storePost('update', 'events', { id, data: eventData });
        return result;
    },

    async deleteEvent(id) {
        // Hapus gambar poster jika ada
        try {
            const events = await this.getEvents();
            const ev = events.find(e => String(e.id) === String(id));
            if (ev && ev.imageUrl) await this.deleteStorageImage(ev.imageUrl);
        } catch (_) {}

        await this._storePost('delete', 'events', { id });

        // Hapus pendaftaran turnamen terkait
        try {
            const regs = await this._storeGet('registrations') || [];
            const filtered = regs.filter(r => String(r.eventId || r.tournamentId) !== String(id));
            if (filtered.length !== regs.length) {
                await this._storePost('reset', 'registrations', { data: filtered });
            }
        } catch (_) {}

        return true;
    },

    // ================================================================
    //  3. BERITA
    // ================================================================

    async getNews() {
        const data = await this._storeGet('news');
        if (data) return data;
        return typeof INITIAL_NEWS !== 'undefined' ? [...INITIAL_NEWS] : [];
    },

    async _uploadNewsImages(newsData) {
        // 1. Upload foto sampul jika format base64
        if (newsData.imageUrl && typeof newsData.imageUrl === 'string' && newsData.imageUrl.startsWith('data:')) {
            try {
                const uploadedUrl = await this.uploadStorageImage(newsData.imageUrl, 'news');
                if (uploadedUrl) newsData.imageUrl = uploadedUrl;
            } catch (err) { console.warn('Auto upload news banner failed:', err); }
        }

        // 2. Upload inlineImages dictionary jika ada
        if (newsData.inlineImages && typeof newsData.inlineImages === 'object') {
            for (const [key, val] of Object.entries(newsData.inlineImages)) {
                if (typeof val === 'string' && val.startsWith('data:')) {
                    try {
                        const cloudUrl = await this.uploadStorageImage(val, 'news-inline');
                        if (cloudUrl) {
                            newsData.inlineImages[key] = cloudUrl;
                            if (newsData.content && newsData.content.includes(key)) {
                                newsData.content = newsData.content.split(key).join(cloudUrl);
                            }
                        }
                    } catch (err) {
                        console.warn('Auto upload inline draft image failed:', err);
                    }
                }
            }
        }

        // 3. Upload foto inline langsung di konten (format data:image/)
        if (newsData.content && typeof newsData.content === 'string' && newsData.content.includes('data:image/')) {
            try {
                const imgDataRegex = /(data:image\/[A-Za-z-+]+;base64,[A-Za-z0-9+/=]+)/g;
                const matches = [...new Set(newsData.content.match(imgDataRegex) || [])];
                for (const b64 of matches) {
                    const cloudUrl = await this.uploadStorageImage(b64, 'news-inline');
                    if (cloudUrl && cloudUrl !== b64) {
                        newsData.content = newsData.content.split(b64).join(cloudUrl);
                    }
                }
            } catch (err) { console.warn('Auto upload inline news photos failed:', err); }
        }

        return newsData;
    },

    async createNews(newsData) {
        newsData = await this._uploadNewsImages(newsData);
        const newArt = { id: Date.now(), ...newsData };
        const result = await this._storePost('create', 'news', newArt);
        return result.item;
    },

    async updateNews(id, newsData) {
        newsData = await this._uploadNewsImages(newsData);
        const result = await this._storePost('update', 'news', { id, data: newsData });
        return result.item;
    },

    async deleteNews(id) {
        // Hapus gambar dari blob
        try {
            const newsList = await this.getNews();
            const article = newsList.find(n => String(n.id) === String(id));
            if (article) {
                if (article.imageUrl) await this.deleteStorageImage(article.imageUrl);
                if (article.content) {
                    const imgRegex = /(?:!\[.*?\]\((https?:\/\/[^\s\)]+)\)|<img[^>]+src=["'](https?:\/\/[^"']+)["'])/g;
                    let match;
                    while ((match = imgRegex.exec(article.content)) !== null) {
                        const url = match[1] || match[2];
                        if (url) await this.deleteStorageImage(url);
                    }
                }
            }
        } catch (_) {}

        await this._storePost('delete', 'news', { id });
        return true;
    },

    // ================================================================
    //  4. AUTENTIKASI MEMBER
    // ================================================================

    async loginMember(identifier, password) {
        const idClean = (identifier || '').trim().toLowerCase();
        const pwdClean = (password || '').trim();
        if (!idClean || !pwdClean) {
            return { success: false, message: 'Username / No. WA dan Password wajib diisi.' };
        }

        // Ambil dari Blob (sumber kebenaran), dengan fallback otomatis ke localStorage
        let allAthletes = await this.getAthletes();

        // Fungsi pencarian fleksibel
        const findMatch = (list) => list.find(a => {
            if (!a) return false;
            const u = (a.username || '').trim().toLowerCase();
            const e = (a.email || '').trim().toLowerCase();
            const w = (a.whatsapp || '').replace(/\D/g, '');
            const inputDigits = idClean.replace(/\D/g, '');

            const matchId =
                (u && u === idClean) ||
                (e && e === idClean) ||
                (inputDigits.length >= 8 && w && w.endsWith(inputDigits.slice(-9)));

            // Cek semua field password yang mungkin digunakan
            const storedPwd  = (a.password_hash || a.password || '').trim();
            const matchPass  = storedPwd.length > 0 && storedPwd === pwdClean;

            return matchId && matchPass;
        });

        let matched = findMatch(allAthletes);

        // Jika tidak ketemu di Blob, coba langsung dari localStorage lama (bridge)
        if (!matched) {
            const legacyKeys = [CONFIG.STORAGE_KEYS.ATHLETES, 'esi_trenggalek_athletes_v1'];
            for (const key of legacyKeys) {
                try {
                    const legacy = JSON.parse(localStorage.getItem(key) || 'null');
                    if (Array.isArray(legacy) && legacy.length > 0) {
                        matched = findMatch(legacy);
                        if (matched) {
                            // Data lama ditemukan - push ke Blob di background agar sinkron
                            this.getAthletes().then(() => {}).catch(() => {});
                            break;
                        }
                    }
                } catch (_) {}
            }
        }

        if (matched) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(matched));
            return { success: true, member: matched };
        }
        return {
            success: false,
            message: 'Username/No. WhatsApp atau kata sandi tidak cocok. Pastikan akun sudah terdaftar dan terverifikasi.'
        };
    },

    logoutMember() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION);
        return true;
    },

    getLoggedMember() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    },

    isMemberLoggedIn() {
        return !!this.getLoggedMember();
    },

    async updateMemberProfile(id, updatedData) {
        await this._storePost('update', 'athletes', { id, data: updatedData });

        // Perbarui sesi aktif
        try {
            const session = this.getLoggedMember();
            if (session && String(session.id) === String(id)) {
                Object.assign(session, updatedData);
                if (updatedData.password) session.password_hash = updatedData.password;
                localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(session));
            }
        } catch (_) {}

        return { success: true };
    },

    // ================================================================
    //  5. AUTENTIKASI ADMIN
    // ================================================================

    // ── Multi-Admin Account Management (100% Cloud Blob Storage) ──────────

    /** Baca daftar akun pengurus langsung dari Cloud Vercel Blob */
    async getAdminAccounts() {
        const DEFAULT = [{
            id: 'admin_default',
            email: 'admin@esitrenggalek.id',
            name: 'Pengurus ESI Trenggalek',
            password: 'admin123',
            role: 'pengurus',
            isDefault: true
        }];
        try {
            const blobList = await this._storeGet('admins');
            if (Array.isArray(blobList) && blobList.length > 0) return blobList;
        } catch (_) {}

        // Inisialisasi data default ke Cloud Blob jika masih kosong
        this._storePost('reset', 'admins', { data: DEFAULT }).catch(() => {});
        return DEFAULT;
    },

    getAdminAccountsSync() {
        if (this._memoryCache['admins'] && Array.isArray(this._memoryCache['admins'])) {
            return this._memoryCache['admins'];
        }
        return [{
            id: 'admin_default',
            email: 'admin@esitrenggalek.id',
            name: 'Pengurus ESI Trenggalek',
            password: 'admin123',
            role: 'pengurus',
            isDefault: true
        }];
    },

    /** Tambah akun pengurus baru langsung ke Cloud Vercel Blob */
    async addAdminAccount(email, name, password) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail || !name || !password) throw new Error('Email, nama, dan kata sandi wajib diisi.');
        if (password.length < 5) throw new Error('Kata sandi minimal 5 karakter.');
        if (cleanEmail === 'robby@rawwy.ae') throw new Error('Email tersebut tidak dapat digunakan.');
        const accounts = await this.getAdminAccounts();
        if (accounts.find(a => a.email === cleanEmail)) throw new Error('Email sudah terdaftar sebagai akun admin.');
        const newAcc = { id: 'adm_' + Date.now(), email: cleanEmail, name: name.trim(), password, role: 'pengurus', isDefault: false };
        await this._storePost('create', 'admins', newAcc);
        return newAcc;
    },

    /** Hapus akun pengurus langsung dari Cloud Vercel Blob */
    async deleteAdminAccount(email) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (cleanEmail === 'robby@rawwy.ae') throw new Error('Akun Super Admin tidak dapat dihapus.');
        const accounts = await this.getAdminAccounts();
        const acc = accounts.find(a => a.email === cleanEmail);
        if (!acc) throw new Error('Akun tidak ditemukan.');
        if (acc.isDefault) throw new Error('Akun pengurus utama tidak dapat dihapus, hanya bisa diubah kata sandinya.');
        await this._storePost('delete', 'admins', { id: acc.id || acc.email });
        return true;
    },

    /** Set password akun pengurus tertentu langsung di Cloud Vercel Blob */
    async setAdminAccountPassword(email, newPassword) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!newPassword || newPassword.length < 5) throw new Error('Kata sandi minimal 5 karakter.');
        if (cleanEmail === 'robby@rawwy.ae') throw new Error('Gunakan mekanisme lain untuk mengubah kata sandi Super Admin.');
        const accounts = await this.getAdminAccounts();
        const acc = accounts.find(a => a.email === cleanEmail);
        if (!acc) throw new Error('Akun tidak ditemukan.');
        acc.password = newPassword;
        await this._storePost('update', 'admins', { id: acc.id || acc.email, data: { password: newPassword } });
        return true;
    },

    // Legacy compat wrappers
    async getPengurusPassword() {
        const accounts = await this.getAdminAccounts();
        const acc = accounts.find(a => a.email === 'admin@esitrenggalek.id');
        return acc ? acc.password : 'admin123';
    },
    async updatePengurusPassword(newPassword) { return this.setAdminAccountPassword('admin@esitrenggalek.id', newPassword); },
    async resetPengurusPassword() {
        return this.setAdminAccountPassword('admin@esitrenggalek.id', 'admin123');
    },

    getCurrentAdminUser() {
        try {
            const raw = sessionStorage.getItem('esi_admin_current_user') || localStorage.getItem('esi_admin_current_user');
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return null;
    },

    async loginAdmin(email, password, securityAnswer = '') {
        const cleanEmail = (email || '').trim().toLowerCase();

        // 1. CEK KHUSUS SUPER ADMIN: robby@rawwy.ae
        if (cleanEmail === 'robby@rawwy.ae') {
            const superAcc = (CONFIG.ADMIN_ACCOUNTS || []).find(a => a.email === 'robby@rawwy.ae') || {
                email: 'robby@rawwy.ae',
                password: '!Rr19102213',
                name: 'Robby Ihza Amanata',
                role: 'superadmin'
            };

            if (password !== superAcc.password) {
                return { success: false, message: 'Kata sandi Super Admin tidak sesuai.' };
            }

            // Verifikasi 2FA: Nama belakang anak
            const expectedAnswer = ((CONFIG.SUPER_ADMIN_SECURITY && CONFIG.SUPER_ADMIN_SECURITY.answer) || 'Celeste').trim().toLowerCase();
            const cleanAnswer = (securityAnswer || '').trim().toLowerCase();

            if (!cleanAnswer) {
                return { success: false, requireSecurity: true, message: 'Verifikasi Keamanan: Mohon masukkan nama belakang anak.' };
            }

            if (cleanAnswer !== expectedAnswer) {
                return { success: false, requireSecurity: true, message: 'Jawaban verifikasi keamanan salah. Akses Super Admin ditolak.' };
            }

            const adminUser = {
                email: 'robby@rawwy.ae',
                name: 'Robby Rawwy',
                role: 'superadmin'
            };
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION, 'true');
            sessionStorage.setItem('esi_admin_current_user', JSON.stringify(adminUser));
            localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION, 'true');
            localStorage.setItem('esi_admin_current_user', JSON.stringify(adminUser));
            return { success: true, user: adminUser, role: 'superadmin' };
        }

        // 2. CEK AKUN PENGURUS — cari langsung dari Cloud Blob
        const accounts = await this.getAdminAccounts();
        const matchAcc = accounts.find(a => a.email === cleanEmail);
        if (matchAcc) {
            if (password !== matchAcc.password) {
                return { success: false, message: 'Kata sandi tidak sesuai.' };
            }
            const adminUser = {
                email: matchAcc.email,
                name: matchAcc.name,
                role: matchAcc.role || 'pengurus'
            };
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION, 'true');
            sessionStorage.setItem('esi_admin_current_user', JSON.stringify(adminUser));
            localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION, 'true');
            localStorage.setItem('esi_admin_current_user', JSON.stringify(adminUser));
            return { success: true, user: adminUser, role: adminUser.role };
        }

        return { success: false, message: 'Email atau kata sandi tidak terdaftar.' };
    },

    async logoutAdmin() {
        sessionStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION);
        try {
            sessionStorage.removeItem('esi_admin_current_user');
            localStorage.removeItem('esi_admin_current_user');
        } catch (_) {}
        return true;
    },

    isAdminLoggedIn() {
        return sessionStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION) === 'true' ||
               localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION) === 'true';
    },

    // ================================================================
    //  6. REGISTRASI TURNAMEN (100% Cloud Blob Storage)
    // ================================================================

    getLocalTournamentRegistrations(eventId = null) {
        let list = this._memoryCache['registrations'];
        if (!Array.isArray(list)) {
            list = typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? [...INITIAL_TOURNAMENT_REGISTRATIONS] : [];
        }
        if (eventId) {
            return list.filter(r => String(r.eventId || r.tournamentId) === String(eventId));
        }
        return list;
    },

    async getTournamentRegistrations(eventId = null) {
        let regs = await this._storeGet('registrations');
        if (!Array.isArray(regs) || regs.length === 0) {
            regs = typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? [...INITIAL_TOURNAMENT_REGISTRATIONS] : [];
        }
        if (eventId) return regs.filter(r => String(r.eventId || r.tournamentId) === String(eventId));
        return regs;
    },

    async createTournamentRegistration(regData) {
        const currentList = (await this.getTournamentRegistrations()) || [];
        const orderNum = currentList.length + 1;
        const regNumber = regData.regNumber || `REG-TRN-${new Date().getFullYear()}-${String(orderNum).padStart(4, '0')}`;
        const newReg = {
            id: 'tr_' + Date.now(),
            regNumber,
            status: 'pending',
            registeredAt: new Date().toISOString(),
            ...regData,
            tournamentId: regData.eventId || regData.tournamentId,
            eventId: regData.eventId || regData.tournamentId
        };

        // Simpan langsung ke Cloud Vercel Blob
        const result = await this._storePost('create', 'registrations', newReg);
        return (result && result.item) ? result.item : newReg;
    },

    async updateTournamentRegistrationStatus(id, newStatus) {
        await this._storePost('update', 'registrations', { id, data: { status: newStatus } });
        return { success: true };
    },

    async deleteTournamentRegistration(id) {
        await this._storePost('delete', 'registrations', { id });
        return { success: true };
    },

    // ================================================================
    //  7. PUSAT DOKUMEN & REGULASI RESMI (100% Cloud Blob Storage)
    // ================================================================

    async getDocuments() {
        const data = await this._storeGet('documents');
        if (data && data.length > 0) return data;
        return typeof INITIAL_DOCUMENTS !== 'undefined' ? [...INITIAL_DOCUMENTS] : [];
    },

    async uploadStorageDocument(fileOrBlob, originalFileName = 'dokumen.pdf') {
        if (!fileOrBlob) return null;
        try {
            const cleanName = (originalFileName || 'dokumen.pdf').replace(/[^a-zA-Z0-9_.-]/g, '_');
            const blobPath = `documents/${Date.now()}_${cleanName}`;
            const token = this._BLOB_TOKEN || (CONFIG.VERCEL_BLOB && CONFIG.VERCEL_BLOB.TOKEN);

            const res = await fetch(`https://blob.vercel-storage.com/${blobPath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'x-api-version': '7',
                    'x-vercel-blob-access': 'private',
                    'content-type': 'application/pdf',
                    'x-allow-overwrite': '1',
                    'x-add-random-suffix': '0'
                },
                body: fileOrBlob
            });

            if (res.ok) {
                const blobData = await res.json();
                if (blobData && blobData.url) return blobData.url;
            }
        } catch (err) {
            console.warn('[Api] Upload document to Blob error:', err);
        }
        return null;
    },

    async createDocument(docData) {
        const newDoc = {
            id: 'doc_' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            fileType: 'PDF',
            ...docData
        };
        const result = await this._storePost('create', 'documents', newDoc);
        return (result && result.item) ? result.item : newDoc;
    },

    async deleteDocument(id) {
        // Hapus file fisik dari Cloud Vercel Blob terlebih dahulu
        try {
            const docs = await this.getDocuments();
            const doc = docs.find(d => String(d.id) === String(id));
            if (doc && doc.fileUrl) {
                await this.deleteStorageFile(doc.fileUrl);
            }
        } catch (err) {
            console.warn('[Api] Gagal menghapus file dokumen dari Blob:', err);
        }

        // Hapus metadata dokumen dari koleksi documents
        await this._storePost('delete', 'documents', { id });
        return { success: true };
    },

    // ================================================================
    //  6b. DISKUSI & KOMENTAR BERITA (via /api/comments)
    // ================================================================

    async getArticleComments(articleId) {
        const cacheKey = `esi_comments_v3_${articleId}`;
        try {
            const res = await fetch(`/api/comments?articleId=${articleId}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
                    return data;
                }
            }
        } catch (_) {}
        // offline fallback
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch (_) {}
        if (typeof INITIAL_ARTICLE_COMMENTS !== 'undefined' && INITIAL_ARTICLE_COMMENTS[articleId]) {
            return JSON.parse(JSON.stringify(INITIAL_ARTICLE_COMMENTS[articleId]));
        }
        return [];
    },

    async postArticleComment(articleId, comment) {
        const cacheKey = `esi_comments_v3_${articleId}`;
        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleId, comment })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.comments)) {
                    try { localStorage.setItem(cacheKey, JSON.stringify(data.comments)); } catch (_) {}
                    return data.comments;
                }
            }
        } catch (err) {
            console.warn('Post comment cloud error:', err);
        }
        // fallback local
        const cached = await this.getArticleComments(articleId);
        cached.unshift(comment);
        try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch (_) {}
        return cached;
    },

    async postArticleReply(articleId, commentId, reply) {
        const cacheKey = `esi_comments_v3_${articleId}`;
        try {
            const res = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleId, replyToCommentId: commentId, comment: reply })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.comments)) {
                    try { localStorage.setItem(cacheKey, JSON.stringify(data.comments)); } catch (_) {}
                    return data.comments;
                }
            }
        } catch (err) {
            console.warn('Post reply cloud error:', err);
        }
        const cached = await this.getArticleComments(articleId);
        const target = cached.find(c => c.id === commentId);
        if (target) {
            if (!Array.isArray(target.replies)) target.replies = [];
            target.replies.push(reply);
            try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch (_) {}
        }
        return cached;
    },

    async deleteArticleComment(articleId, commentId) {
        const cacheKey = `esi_comments_v3_${articleId}`;
        try {
            const res = await fetch('/api/comments', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleId, commentId })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.comments)) {
                    try { localStorage.setItem(cacheKey, JSON.stringify(data.comments)); } catch (_) {}
                    return data.comments;
                }
            }
        } catch (err) {
            console.warn('Delete comment cloud error:', err);
        }
        let cached = await this.getArticleComments(articleId);
        cached = cached.filter(c => c.id !== commentId);
        cached.forEach(c => {
            if (Array.isArray(c.replies)) c.replies = c.replies.filter(r => r.id !== commentId);
        });
        try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch (_) {}
        return cached;
    },

    // ================================================================
    //  7. SEED / RESET DATA KE BLOB
    //  Jalankan sekali dari console admin: await Api.seedBlobIfEmpty()
    // ================================================================

    async seedBlobIfEmpty() {
        const results = {};
        const collections = {
            athletes: typeof INITIAL_ATHLETES !== 'undefined' ? INITIAL_ATHLETES : [],
            events: typeof INITIAL_EVENTS !== 'undefined' ? INITIAL_EVENTS : [],
            news: typeof INITIAL_NEWS !== 'undefined' ? INITIAL_NEWS : [],
            registrations: typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? INITIAL_TOURNAMENT_REGISTRATIONS : []
        };
        for (const [col, seedData] of Object.entries(collections)) {
            const existing = await this._storeGet(col);
            if (!existing || existing.length === 0) {
                await this._storePost('reset', col, { data: seedData });
                results[col] = `seeded (${seedData.length} items)`;
            } else {
                results[col] = `skip (${existing.length} items sudah ada)`;
            }
        }
        console.log('seedBlobIfEmpty results:', results);
        return results;
    },

    async resetToSeedData() {
        const collections = {
            athletes: typeof INITIAL_ATHLETES !== 'undefined' ? INITIAL_ATHLETES : [],
            events: typeof INITIAL_EVENTS !== 'undefined' ? INITIAL_EVENTS : [],
            news: typeof INITIAL_NEWS !== 'undefined' ? INITIAL_NEWS : [],
            registrations: typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? INITIAL_TOURNAMENT_REGISTRATIONS : []
        };
        for (const [col, seedData] of Object.entries(collections)) {
            await this._storePost('reset', col, { data: seedData });
        }
        // Bersihkan cache localStorage
        try {
            ['athletes','events','news','registrations'].forEach(c => {
                localStorage.removeItem(`esi_blob_cache_${c}`);
            });
        } catch (_) {}
        return true;
    }
};
