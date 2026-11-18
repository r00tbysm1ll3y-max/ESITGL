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
    //  HELPER INTERNAL - Panggil /api/store (Vercel Blob via server)
    // ================================================================

    async _storeGet(collection) {
        try {
            const res = await fetch(`/api/store?collection=${collection}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    // simpan ke localStorage sebagai cache offline
                    try { localStorage.setItem(`esi_blob_cache_${collection}`, JSON.stringify(data)); } catch (_) {}
                    return data;
                }
                // Blob mengembalikan [] (kosong/belum di-seed) â†’ kembalikan null
                // agar caller bisa fallback ke cache / seed data
                return null;
            }
        } catch (_) {}
        // offline fallback dari cache
        try {
            const cached = localStorage.getItem(`esi_blob_cache_${collection}`);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (_) {}
        return null;
    },

    async _storePost(action, collection, payload) {
        const res = await fetch('/api/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, collection, payload })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        // Perbarui cache
        if (data.items) {
            try { localStorage.setItem(`esi_blob_cache_${collection}`, JSON.stringify(data.items)); } catch (_) {}
        }
        return data;
    },

    // ================================================================
    //  1. ATLET
    // ================================================================

    async getAthletes() {
        const blobData = await this._storeGet('athletes');
        if (blobData && blobData.length > 0) return blobData;

        // Blob kosong/belum di-seed - cek data lama di localStorage (migrasi otomatis)
        const legacyKeys = [
            CONFIG.STORAGE_KEYS.ATHLETES,  // 'esi_trenggalek_athletes_v2'
            'esi_trenggalek_athletes_v1'
        ];
        for (const key of legacyKeys) {
            try {
                const legacy = JSON.parse(localStorage.getItem(key) || 'null');
                if (Array.isArray(legacy) && legacy.length > 0) {
                    // Auto-migrate: seed data lama ke Blob di background
                    console.log(`[Api] Auto-migrating ${legacy.length} athletes from localStorage to Blob...`);
                    this._storePost('reset', 'athletes', { data: legacy }).catch(() => {});
                    return legacy;
                }
            } catch (_) {}
        }

        // Ultimate fallback ke seed data awal
        return typeof INITIAL_ATHLETES !== 'undefined' ? [...INITIAL_ATHLETES] : [];
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
            const filtered = regs.filter(r => String(r.tournamentId) !== String(id));
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

    async loginAdmin(email, password) {
        // Hanya demo admin (tidak ada Supabase auth)
        if (email === CONFIG.DEMO_ADMIN.email && password === CONFIG.DEMO_ADMIN.password) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION, 'true');
            return { success: true, isDemo: true };
        }
        return { success: false, message: 'Email atau kata sandi tidak sesuai.' };
    },

    async logoutAdmin() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION);
        return true;
    },

    isAdminLoggedIn() {
        return localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION) === 'true';
    },

    // ================================================================
    //  6. REGISTRASI TURNAMEN
    // ================================================================

    getLocalTournamentRegistrations(eventId = null) {
        try {
            const cached = localStorage.getItem('esi_blob_cache_registrations');
            let list = null;
            if (cached) {
                try { list = JSON.parse(cached); } catch (_) {}
            }
            if (!Array.isArray(list)) {
                list = typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? [...INITIAL_TOURNAMENT_REGISTRATIONS] : [];
            }
            if (eventId) {
                return list.filter(r => String(r.tournamentId) === String(eventId));
            }
            return list;
        } catch (_) {
            return [];
        }
    },

    async getTournamentRegistrations(eventId = null) {
        let regs = await this._storeGet('registrations');
        if (!regs) regs = typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? [...INITIAL_TOURNAMENT_REGISTRATIONS] : [];
        if (eventId) return regs.filter(r => String(r.tournamentId) === String(eventId));
        return regs;
    },

    async createTournamentRegistration(regData) {
        const newReg = { id: Date.now(), ...regData };
        const result = await this._storePost('create', 'registrations', newReg);
        try {
            const list = this.getLocalTournamentRegistrations();
            list.push(result.item || newReg);
            localStorage.setItem('esi_blob_cache_registrations', JSON.stringify(list));
        } catch (_) {}
        return result.item;
    },

    async updateTournamentRegistrationStatus(id, newStatus) {
        await this._storePost('update', 'registrations', { id, data: { status: newStatus } });
        try {
            const list = this.getLocalTournamentRegistrations();
            const item = list.find(r => String(r.id) === String(id));
            if (item) item.status = newStatus;
            localStorage.setItem('esi_blob_cache_registrations', JSON.stringify(list));
        } catch (_) {}
        return true;
    },

    async deleteTournamentRegistration(id) {
        await this._storePost('delete', 'registrations', { id });
        try {
            const list = this.getLocalTournamentRegistrations().filter(r => String(r.id) !== String(id));
            localStorage.setItem('esi_blob_cache_registrations', JSON.stringify(list));
        } catch (_) {}
        return true;
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
