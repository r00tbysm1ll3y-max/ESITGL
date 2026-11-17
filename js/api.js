/**
 * API SERVICE LAYER (Supabase + LocalStorage Fallback)
 * 
 * Modul ini menyediakan fungsi async CRUD terpadu.
 * Jika koneksi Supabase aktif, data akan diambil & disimpan langsung ke database Supabase.
 * Jika belum dikonfigurasi, sistem otomatis menggunakan LocalStorage.
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
        image_url: n.imageUrl || n.image_url || '',
        image_position: n.imagePosition || n.image_position || 'top',
        date: n.date,
        excerpt: n.excerpt,
        content: n.content
    }),
    newsFromDb: (row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        imageUrl: row.image_url || row.imageUrl || '',
        imagePosition: row.image_position || row.imagePosition || 'top',
        date: row.date,
        excerpt: row.excerpt,
        content: row.content
    })
};

const Api = {
    // ==================== 1. ATLET ====================
    async getAthletes() {
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('athletes')
                    .select('*')
                    .order('points', { ascending: false });
                if (error) throw error;
                return (data || []).map(Mapper.athleteFromDb);
            } catch (err) {
                console.error('Supabase getAthletes error:', err);
                return this.getLocalAthletes();
            }
        }
        return this.getLocalAthletes();
    },

    getLocalAthletes() {
        const deletedAthleteIdsKey = 'esi_deleted_athlete_ids';
        let deletedAthleteIds = [];
        try {
            deletedAthleteIds = JSON.parse(localStorage.getItem(deletedAthleteIdsKey) || '[]').map(String);
        } catch (e) {
            deletedAthleteIds = [];
        }

        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.ATHLETES);
        let list = [];
        if (!saved) {
            list = typeof INITIAL_ATHLETES !== 'undefined' 
                ? INITIAL_ATHLETES.filter(a => !deletedAthleteIds.includes(String(a.id)))
                : [];
            localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(list));
            return list;
        }
        try {
            list = JSON.parse(saved);
            if (!Array.isArray(list)) list = [];
            
            // Filter out any previously deleted athletes
            list = list.filter(a => !deletedAthleteIds.includes(String(a.id)));

            if (typeof INITIAL_ATHLETES !== 'undefined') {
                let updated = false;
                INITIAL_ATHLETES.forEach(seed => {
                    // JANGAN masukkan kembali atlet yang sengaja telah dihapus oleh admin
                    if (deletedAthleteIds.includes(String(seed.id))) return;

                    const idx = list.findIndex(a => a.id == seed.id || (a.username && a.username === seed.username));
                    if (idx === -1) {
                        list.push(seed);
                        updated = true;
                    } else if (!list[idx].gameProfiles && seed.gameProfiles) {
                        list[idx].gameProfiles = seed.gameProfiles;
                        updated = true;
                    }
                });
                if (updated) {
                    localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(list));
                }
            }
            return list;
        } catch (e) {
            return typeof INITIAL_ATHLETES !== 'undefined' 
                ? INITIAL_ATHLETES.filter(a => !deletedAthleteIds.includes(String(a.id))) 
                : [];
        }
    },

    async createAthlete(athleteData) {
        if (supabaseClient) {
            try {
                const dbPayload = Mapper.athleteToDb(athleteData);
                const { data, error } = await supabaseClient
                    .from('athletes')
                    .insert([dbPayload])
                    .select()
                    .single();
                if (error) throw error;
                return Mapper.athleteFromDb(data);
            } catch (err) {
                console.error('Supabase createAthlete error:', err);
                // Fallback to local
            }
        }

        const local = this.getLocalAthletes();
        // Nomor urut registrasi otomatis
        const orderNum = local.length + 1;
        const regNo = `ESI-TRG-2026-${String(orderNum).padStart(4, '0')}`;
        const newAthlete = {
            id: Date.now(),
            regNo: regNo,
            ...athleteData,
            password_hash: athleteData.password || athleteData.password_hash || '',
            points: 0,
            status: 'pending'
        };
        local.unshift(newAthlete);
        localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(local));
        return newAthlete;
    },

    async updateAthletePassword(id, newPassword) {
        if (!newPassword) return false;
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('athletes')
                    .update({ password_hash: newPassword })
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase updateAthletePassword error:', err);
            }
        }

        const local = this.getLocalAthletes();
        const item = local.find(a => a.id == id);
        if (item) {
            item.password = newPassword;
            item.password_hash = newPassword;
            localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(local));
        }
        return true;
    },

    async updateAthleteStatus(id, newStatus) {
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('athletes')
                    .update({ status: newStatus })
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase updateAthleteStatus error:', err);
            }
        }

        const local = this.getLocalAthletes();
        const item = local.find(a => a.id == id);
        if (item) {
            item.status = newStatus;
            localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(local));
        }
        return true;
    },

    async updateAthletePoints(id, points) {
        const parsedPoints = parseInt(points, 10) || 0;
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('athletes')
                    .update({ points: parsedPoints })
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase updateAthletePoints error:', err);
            }
        }

        const local = this.getLocalAthletes();
        const item = local.find(a => a.id == id);
        if (item) {
            item.points = parsedPoints;
            localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(local));
        }
        return true;
    },

    async deleteAthlete(id) {
        const idStr = String(id);

        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('athletes')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase deleteAthlete error:', err);
            }
        }

        // Catat ID atlet yang dihapus agar INITIAL_ATHLETES tidak meng-seed ulang atlet ini
        const deletedAthleteIdsKey = 'esi_deleted_athlete_ids';
        let deletedAthleteIds = [];
        try {
            deletedAthleteIds = JSON.parse(localStorage.getItem(deletedAthleteIdsKey) || '[]').map(String);
        } catch (e) {
            deletedAthleteIds = [];
        }
        if (!deletedAthleteIds.includes(idStr)) {
            deletedAthleteIds.push(idStr);
            localStorage.setItem(deletedAthleteIdsKey, JSON.stringify(deletedAthleteIds));
        }

        // Hapus dari localStorage
        let local = this.getLocalAthletes();
        local = local.filter(a => String(a.id) !== idStr);
        localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(local));
        return true;
    },

    // ==================== STORAGE & MEDIA MANAGEMENT ====================
    /**
     * Unggah gambar ke Cloud Storage (Vercel Blob / Supabase Storage)
     * Menerima base64 dataURL, File, atau Blob
     * Mengembalikan URL cloud publik/proxy yang siap ditampilkan di tag <img>
     */
    async uploadStorageImage(fileOrDataUrl, folder = 'general') {
        if (!fileOrDataUrl) return null;

        // 1. Prioritas: Vercel Blob Storage
        if (typeof isVercelBlobConfigured === 'function' && isVercelBlobConfigured()) {
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
                        while (n--) {
                            u8arr[n] = bstr.charCodeAt(n);
                        }
                        body = (typeof Blob !== 'undefined') ? new Blob([u8arr], { type: mimeType }) : u8arr;
                    }
                } else if (fileOrDataUrl instanceof Blob || (typeof File !== 'undefined' && fileOrDataUrl instanceof File)) {
                    body = fileOrDataUrl;
                    if (fileOrDataUrl.type) mimeType = fileOrDataUrl.type;
                }

                if (body) {
                    const ext = mimeType.split('/')[1] || 'webp';
                    const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
                    const filename = `${cleanFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                    const blobAccess = (CONFIG.VERCEL_BLOB && CONFIG.VERCEL_BLOB.ACCESS) || 'private';

                    const res = await fetch(`https://blob.vercel-storage.com/${filename}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${CONFIG.VERCEL_BLOB.TOKEN}`,
                            'x-api-version': '7',
                            'x-vercel-blob-access': blobAccess,
                            'content-type': mimeType
                        },
                        body: body
                    });

                    if (res.ok) {
                        const blobData = await res.json();
                        if (blobData && blobData.url) {
                            // Jika private store di Vercel, arahkan ke proxy /api/blob agar dapat diakses publik
                            if (blobAccess === 'private' && blobData.url.includes('.private.blob.vercel-storage.com')) {
                                return `/api/blob?url=${encodeURIComponent(blobData.url)}`;
                            }
                            return blobData.url;
                        }
                    } else {
                        console.warn('Vercel Blob upload response not ok:', res.status, res.statusText);
                    }
                }
            } catch (err) {
                console.warn('Vercel Blob upload failed, fallback to local/supabase:', err);
            }
        }

        // 2. Fallback: Supabase Storage jika dikonfigurasi
        if (supabaseClient && supabaseClient.storage) {
            try {
                // Implementasi Supabase Storage upload
                const bucket = 'posters';
                const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
                let uploadBody = fileOrDataUrl;
                if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:')) {
                    const matches = fileOrDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (matches) {
                        const bstr = atob(matches[2]);
                        let n = bstr.length;
                        const u8arr = new Uint8Array(n);
                        while (n--) u8arr[n] = bstr.charCodeAt(n);
                        uploadBody = new Blob([u8arr], { type: matches[1] });
                    }
                }
                const { data, error } = await supabaseClient.storage.from(bucket).upload(filename, uploadBody, {
                    contentType: 'image/webp',
                    upsert: true
                });
                if (!error && data) {
                    const { data: pubData } = supabaseClient.storage.from(bucket).getPublicUrl(filename);
                    if (pubData && pubData.publicUrl) return pubData.publicUrl;
                }
            } catch (err) {
                console.warn('Supabase storage upload failed:', err);
            }
        }

        // 3. Fallback: Kembalikan dataUrl asli (mode offline / localStorage)
        return typeof fileOrDataUrl === 'string' ? fileOrDataUrl : null;
    },

    /**
     * Hapus gambar dari Cloud Storage (Vercel Blob / Supabase Storage)
     * Aman dipanggil untuk base64 / data:image / blob: / assets/ lokal (tidak akan error)
     */
    async deleteStorageImage(imageUrl) {
        if (!imageUrl || typeof imageUrl !== 'string') return false;

        // Skip jika base64 inline, blob URL, atau aset lokal portal
        if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:') || imageUrl.startsWith('assets/') || imageUrl.startsWith('./')) {
            return true;
        }

        // 1. Cek & Hapus dari Vercel Blob Storage jika URL adalah Vercel Blob atau proxy /api/blob
        if (imageUrl.includes('blob.vercel-storage.com') || imageUrl.includes('/api/blob')) {
            if (typeof isVercelBlobConfigured === 'function' && isVercelBlobConfigured()) {
                try {
                    let targetUrl = imageUrl;
                    if (imageUrl.includes('/api/blob?url=')) {
                        try {
                            const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost';
                            const parsed = new URL(imageUrl, origin);
                            targetUrl = parsed.searchParams.get('url') || imageUrl;
                        } catch (_) {
                            const match = imageUrl.match(/[?&]url=([^&]+)/);
                            if (match) targetUrl = decodeURIComponent(match[1]);
                        }
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
                    console.warn('Vercel Blob delete error:', err);
                }
            }
            return false;
        }

        // 2. Cek & Hapus dari Supabase Storage jika merupakan URL cloud storage Supabase
        if (supabaseClient && supabaseClient.storage) {
            try {
                // Contoh URL Supabase: https://xxxx.supabase.co/storage/v1/object/public/<bucket>/<path>
                const urlObj = new URL(imageUrl);
                const pathParts = urlObj.pathname.split('/');
                const publicIdx = pathParts.indexOf('public');
                if (publicIdx !== -1 && pathParts.length > publicIdx + 2) {
                    const bucket = pathParts[publicIdx + 1];
                    const filePath = decodeURIComponent(pathParts.slice(publicIdx + 2).join('/'));
                    const { error } = await supabaseClient.storage.from(bucket).remove([filePath]);
                    if (error) {
                        console.warn(`Supabase Storage remove error (${bucket}/${filePath}):`, error);
                        return false;
                    }
                    return true;
                }
            } catch (err) {
                console.warn('Gagal menghapus gambar dari Supabase cloud storage:', err);
            }
        }

        return false;
    },

    // ==================== 2. EVENT ====================
    async getEvents() {
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('events')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return (data || []).map(Mapper.eventFromDb);
            } catch (err) {
                console.error('Supabase getEvents error:', err);
                return this.getLocalEvents();
            }
        }
        return this.getLocalEvents();
    },

    getLocalEvents() {
        const deletedEventIdsKey = 'esi_deleted_event_ids';
        let deletedEventIds = [];
        try {
            deletedEventIds = JSON.parse(localStorage.getItem(deletedEventIdsKey) || '[]').map(String);
        } catch (e) {
            deletedEventIds = [];
        }

        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.EVENTS);
        if (!saved) {
            const initialFiltered = INITIAL_EVENTS.filter(e => !deletedEventIds.includes(String(e.id)));
            localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(initialFiltered));
            return [...initialFiltered];
        }
        try {
            let parsed = JSON.parse(saved);
            const hasLegacyMultiDiv = Array.isArray(parsed) && parsed.some(e => e.division === 'Multi-Divisi' || e.title === 'Piala Pelajar Esports Season 2 Tahun 2026');
            if (!Array.isArray(parsed) || parsed.length === 0 || hasLegacyMultiDiv) {
                const initialFiltered = INITIAL_EVENTS.filter(e => !deletedEventIds.includes(String(e.id)));
                localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(initialFiltered));
                return [...initialFiltered];
            }
            return parsed.filter(e => !deletedEventIds.includes(String(e.id)));
        } catch {
            return INITIAL_EVENTS.filter(e => !deletedEventIds.includes(String(e.id)));
        }
    },

    async createEvent(eventData) {
        // Upload gambar poster ke Cloud Storage (Vercel Blob / Supabase) jika berupa dataURL
        if (eventData.imageUrl && typeof eventData.imageUrl === 'string' && eventData.imageUrl.startsWith('data:')) {
            try {
                const uploadedUrl = await this.uploadStorageImage(eventData.imageUrl, 'events');
                if (uploadedUrl) eventData.imageUrl = uploadedUrl;
            } catch (err) {
                console.warn('Auto upload poster failed:', err);
            }
        }

        if (supabaseClient) {
            try {
                const payload = Mapper.eventToDb(eventData);
                const { data, error } = await supabaseClient
                    .from('events')
                    .insert([payload])
                    .select()
                    .single();
                if (error) throw error;
                return Mapper.eventFromDb(data);
            } catch (err) {
                console.error('Supabase createEvent error:', err);
            }
        }

        const local = this.getLocalEvents();
        const newEv = {
            id: Date.now(),
            ...eventData
        };
        local.unshift(newEv);
        localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(local));
        return newEv;
    },

    async updateEventStatus(id, newStatus) {
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('events')
                    .update({ status: newStatus })
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase updateEventStatus error:', err);
            }
        }

        const local = this.getLocalEvents();
        const item = local.find(e => e.id == id);
        if (item) {
            item.status = newStatus;
            localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(local));
        }
        return true;
    },

    async deleteEvent(id) {
        const idStr = String(id);

        // 1. Dapatkan data event sebelum dihapus untuk menghapus file gambar poster dari storage
        let targetEvent = null;
        try {
            const currentEvents = await this.getEvents();
            targetEvent = currentEvents.find(e => String(e.id) === idStr);
        } catch (_) {}

        if (targetEvent && targetEvent.imageUrl) {
            await this.deleteStorageImage(targetEvent.imageUrl);
        }

        // 2. Hapus dari Supabase DB
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('events')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase deleteEvent error:', err);
            }
        }

        // 3. Catat ID event yang dihapus agar tidak di-seed ulang
        const deletedEventIdsKey = 'esi_deleted_event_ids';
        let deletedEventIds = [];
        try {
            deletedEventIds = JSON.parse(localStorage.getItem(deletedEventIdsKey) || '[]').map(String);
        } catch (e) {
            deletedEventIds = [];
        }
        if (!deletedEventIds.includes(idStr)) {
            deletedEventIds.push(idStr);
            localStorage.setItem(deletedEventIdsKey, JSON.stringify(deletedEventIds));
        }

        // 4. Hapus dari localStorage (membebaskan storage memori gambar secara bersih)
        let local = this.getLocalEvents();
        local = local.filter(e => String(e.id) !== idStr);
        localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(local));

        // 5. Bersihkan data pendaftaran turnamen terkait dari storage
        try {
            const regKey = CONFIG.STORAGE_KEYS.TOURNAMENT_REGISTRATIONS || 'esi_trenggalek_trn_regs_v2';
            const savedRegs = JSON.parse(localStorage.getItem(regKey) || '[]');
            if (Array.isArray(savedRegs)) {
                const filteredRegs = savedRegs.filter(r => String(r.tournamentId) !== idStr);
                localStorage.setItem(regKey, JSON.stringify(filteredRegs));
            }
        } catch (err) {
            console.warn('Notice saat membersihkan pendaftaran turnamen terkait:', err);
        }

        return true;
    },

    // ==================== 3. BERITA ====================
    async getNews() {
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('news')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return (data || []).map(Mapper.newsFromDb);
            } catch (err) {
                console.error('Supabase getNews error:', err);
                return this.getLocalNews();
            }
        }
        return this.getLocalNews();
    },

    getLocalNews() {
        const parseNewsDateHelper = (dateStr, isoStr) => {
            if (isoStr && /^\d{4}-\d{2}-\d{2}/.test(isoStr)) return new Date(isoStr).getTime();
            if (dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(dateStr).getTime();
            if (!dateStr) return 0;
            const months = {
                'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
            };
            const parts = dateStr.toLowerCase().split(/\s+/);
            if (parts.length >= 3) {
                const day = parseInt(parts[0], 10);
                const month = months[parts[1]];
                const year = parseInt(parts[2], 10);
                if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                    return new Date(year, month, day).getTime();
                }
            }
            const t = new Date(dateStr).getTime();
            return isNaN(t) ? 0 : t;
        };

        const deletedIdsKey = 'esi_deleted_news_ids';
        let deletedIds = [];
        try {
            deletedIds = JSON.parse(localStorage.getItem(deletedIdsKey) || '[]').map(String);
        } catch (e) {
            deletedIds = [];
        }

        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.NEWS);
        if (!saved) {
            const sortedInitial = [...INITIAL_NEWS]
                .filter(seed => !deletedIds.includes(String(seed.id)))
                .sort((a, b) => parseNewsDateHelper(b.date, b.isoDate) - parseNewsDateHelper(a.date, a.isoDate));
            localStorage.setItem(CONFIG.STORAGE_KEYS.NEWS, JSON.stringify(sortedInitial));
            return sortedInitial;
        }
        try {
            let parsed = JSON.parse(saved);
            if (!Array.isArray(parsed)) parsed = [];

            // Pastikan item yang sudah pernah dihapus tidak ada di parsed
            parsed = parsed.filter(p => !deletedIds.includes(String(p.id)));

            let updated = false;
            // Sinkronkan berita seed yang BELUM dihapus
            INITIAL_NEWS.forEach(seed => {
                if (deletedIds.includes(String(seed.id))) return; // JANGAN re-seed berita yang sudah dihapus!
                const exists = parsed.some(p => String(p.id) === String(seed.id) || p.title === seed.title);
                if (!exists) {
                    parsed.push(seed);
                    updated = true;
                }
            });

            parsed.forEach(p => {
                const seed = INITIAL_NEWS.find(s => String(s.id) === String(p.id));
                if (seed) {
                    if (seed.isoDate && !p.isoDate) {
                        p.isoDate = seed.isoDate;
                        updated = true;
                    }
                    if (seed.imageUrl && seed.imageUrl !== p.imageUrl && !p.imageUrl.startsWith('data:')) {
                        p.imageUrl = seed.imageUrl;
                        updated = true;
                    }
                    if (seed.author && !p.author) {
                        p.author = seed.author;
                        updated = true;
                    }
                    if (seed.content && seed.content !== p.content) {
                        p.content = seed.content;
                        updated = true;
                    }
                    if (seed.imageCaption && !p.imageCaption) {
                        p.imageCaption = seed.imageCaption;
                        updated = true;
                    }
                }
            });

            if (updated) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.NEWS, JSON.stringify(parsed));
            }
            return parsed.sort((a, b) => parseNewsDateHelper(b.date, b.isoDate) - parseNewsDateHelper(a.date, a.isoDate));
        } catch (e) {
            console.error('Error parsing local news:', e);
            return INITIAL_NEWS.filter(seed => !deletedIds.includes(String(seed.id)));
        }
    },

    async createNews(newsData) {
        // Upload foto sampul ke Cloud Storage (Vercel Blob / Supabase) jika berupa dataURL
        if (newsData.imageUrl && typeof newsData.imageUrl === 'string' && newsData.imageUrl.startsWith('data:')) {
            try {
                const uploadedUrl = await this.uploadStorageImage(newsData.imageUrl, 'news');
                if (uploadedUrl) newsData.imageUrl = uploadedUrl;
            } catch (err) {
                console.warn('Auto upload news banner failed:', err);
            }
        }

        // Upload foto inline di konten jika ada data:image/...
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
            } catch (err) {
                console.warn('Auto upload inline news photos failed:', err);
            }
        }

        if (supabaseClient) {
            try {
                const payload = Mapper.newsToDb(newsData);
                const { data, error } = await supabaseClient
                    .from('news')
                    .insert([payload])
                    .select()
                    .single();
                if (error) throw error;
                return Mapper.newsFromDb(data);
            } catch (err) {
                console.error('Supabase createNews error:', err);
            }
        }

        const local = this.getLocalNews();
        const newArt = {
            id: Date.now(),
            ...newsData
        };
        local.unshift(newArt);
        localStorage.setItem(CONFIG.STORAGE_KEYS.NEWS, JSON.stringify(local));
        return newArt;
    },

    async updateNews(id, newsData) {
        // Upload foto sampul ke Cloud Storage (Vercel Blob / Supabase) jika berupa dataURL
        if (newsData.imageUrl && typeof newsData.imageUrl === 'string' && newsData.imageUrl.startsWith('data:')) {
            try {
                const uploadedUrl = await this.uploadStorageImage(newsData.imageUrl, 'news');
                if (uploadedUrl) newsData.imageUrl = uploadedUrl;
            } catch (err) {
                console.warn('Auto upload updated news banner failed:', err);
            }
        }

        // Upload foto inline di konten jika ada data:image/...
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
            } catch (err) {
                console.warn('Auto upload inline news photos failed:', err);
            }
        }

        if (supabaseClient) {
            try {
                const payload = Mapper.newsToDb(newsData);
                const { data, error } = await supabaseClient
                    .from('news')
                    .update(payload)
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                return Mapper.newsFromDb(data);
            } catch (err) {
                console.error('Supabase updateNews error:', err);
            }
        }

        const local = this.getLocalNews();
        const idx = local.findIndex(n => n.id == id);
        if (idx >= 0) {
            local[idx] = {
                ...local[idx],
                ...newsData,
                id: Number(id)
            };
            localStorage.setItem(CONFIG.STORAGE_KEYS.NEWS, JSON.stringify(local));
            return local[idx];
        }
        return null;
    },

        async deleteNews(id) {
        const idStr = String(id);

        // 1. Dapatkan data artikel sebelum dihapus untuk mendeteksi file gambar sampul & gambar di teks
        let targetNews = null;
        try {
            const currentList = await this.getNews();
            targetNews = currentList.find(n => String(n.id) === idStr);
        } catch (_) {}

        if (targetNews) {
            // Hapus foto sampul dari storage
            if (targetNews.imageUrl) {
                await this.deleteStorageImage(targetNews.imageUrl);
            }
            // Hapus foto-foto inline di dalam konten dari storage jika ada
            if (targetNews.content) {
                const imgRegex = /(?:!\[.*?\]\((https?:\/\/[^\s\)]+)\)|<img[^>]+src=["'](https?:\/\/[^"']+)["'])/g;
                let match;
                while ((match = imgRegex.exec(targetNews.content)) !== null) {
                    const url = match[1] || match[2];
                    if (url) await this.deleteStorageImage(url);
                }
            }
        }

        // 2. Hapus dari Supabase DB
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('news')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase deleteNews error:', err);
            }
        }

        // 3. Catat ID berita yang dihapus agar tidak pernah di-seed ulang
        const deletedIdsKey = 'esi_deleted_news_ids';
        let deletedIds = [];
        try {
            deletedIds = JSON.parse(localStorage.getItem(deletedIdsKey) || '[]').map(String);
        } catch (e) {
            deletedIds = [];
        }
        if (!deletedIds.includes(idStr)) {
            deletedIds.push(idStr);
            localStorage.setItem(deletedIdsKey, JSON.stringify(deletedIds));
        }

        // 4. Hapus dari data tersimpan di localStorage (membebaskan memori storage gambar secara bersih)
        let saved = [];
        try {
            saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.NEWS) || '[]');
        } catch (e) {
            saved = [];
        }
        const filtered = (Array.isArray(saved) ? saved : []).filter(n => String(n.id) !== idStr);
        localStorage.setItem(CONFIG.STORAGE_KEYS.NEWS, JSON.stringify(filtered));
        return true;
    },

    // ==================== 4. AUTENTIKASI ANGGOTA & ATLET ====================
    async loginMember(identifier, password) {
        const idClean = (identifier || '').trim().toLowerCase();
        const pwdClean = (password || '').trim();

        if (!idClean || !pwdClean) {
            return { success: false, message: 'Username / No. WA dan Password wajib diisi.' };
        }

        let allAthletes = [];
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('athletes')
                    .select('*');
                if (!error && data) {
                    allAthletes = data.map(Mapper.athleteFromDb);
                }
            } catch (err) {
                console.warn('Supabase fetch for member login error, fallback to local:', err);
            }
        }
        if (allAthletes.length === 0) {
            allAthletes = this.getLocalAthletes();
        }

        // Cari berdasarkan username, whatsapp (digits clean), atau email
        const matched = allAthletes.find(a => {
            const u = (a.username || '').toLowerCase();
            const e = (a.email || '').toLowerCase();
            const w = (a.whatsapp || '').replace(/\D/g, '');
            const inputDigits = idClean.replace(/\D/g, '');

            const matchId = (u && u === idClean) || 
                            (e && e === idClean) || 
                            (inputDigits.length >= 8 && w && w.includes(inputDigits));

            const matchPass = (a.password_hash === pwdClean || a.password === pwdClean);
            return matchId && matchPass;
        });

        if (matched) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(matched));
            return { success: true, member: matched };
        }

        return { 
            success: false, 
            message: 'Username/No. WhatsApp atau kata sandi tidak cocok. Pastikan akun sudah terdaftar.' 
        };
    },

    logoutMember() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION);
        return true;
    },

    getLoggedMember() {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    },

    isMemberLoggedIn() {
        return !!this.getLoggedMember();
    },

    async updateMemberProfile(id, updatedData) {
        if (supabaseClient) {
            try {
                const dbPayload = {};
                if (updatedData.nickname) dbPayload.nickname = updatedData.nickname;
                if (updatedData.gameId) dbPayload.game_id = updatedData.gameId;
                if (updatedData.teamName !== undefined) dbPayload.team_name = updatedData.teamName;
                if (updatedData.whatsapp) dbPayload.whatsapp = updatedData.whatsapp;
                if (updatedData.email !== undefined) dbPayload.email = updatedData.email;
                if (updatedData.alamat !== undefined) dbPayload.alamat = updatedData.alamat;
                if (updatedData.password) dbPayload.password_hash = updatedData.password;
                if (updatedData.gameProfiles !== undefined) dbPayload.game_profiles = typeof updatedData.gameProfiles === 'string' ? updatedData.gameProfiles : JSON.stringify(updatedData.gameProfiles);

                const { error } = await supabaseClient
                    .from('athletes')
                    .update(dbPayload)
                    .eq('id', id);
                if (error) throw error;
            } catch (err) {
                console.error('Supabase updateMemberProfile error:', err);
            }
        }

        const local = this.getLocalAthletes();
        const item = local.find(a => a.id == id);
        if (item) {
            Object.assign(item, updatedData);
            if (updatedData.password) {
                item.password_hash = updatedData.password;
            }
            localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(local));

            // Perbarui sesi aktif
            const currentSession = this.getLoggedMember();
            if (currentSession && currentSession.id == id) {
                Object.assign(currentSession, updatedData);
                if (updatedData.password) currentSession.password_hash = updatedData.password;
                localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(currentSession));
            }
            return { success: true, member: item };
        }
        return { success: false, message: 'Data anggota tidak ditemukan.' };
    },

    // ==================== 5. AUTENTIKASI ADMIN ====================
    async loginAdmin(email, password) {
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });
                if (!error && data?.session) {
                    localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION, 'true');
                    return { success: true, user: data.user };
                }
            } catch (err) {
                console.warn('Supabase Auth login gagal, mencoba demo auth:', err.message);
            }
        }

        // Demo login fallback
        if (email === CONFIG.DEMO_ADMIN.email && password === CONFIG.DEMO_ADMIN.password) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION, 'true');
            return { success: true, isDemo: true };
        }
        return { success: false, message: 'Email atau kata sandi tidak sesuai.' };
    },

    async logoutAdmin() {
        if (supabaseClient) {
            try {
                await supabaseClient.auth.signOut();
            } catch (e) {
                // ignore
            }
        }
        localStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION);
        return true;
    },

    isAdminLoggedIn() {
        return localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_SESSION) === 'true';
    },

    // ==================== 6. REGISTRASI TURNAMEN ====================
    async getTournamentRegistrations(eventId = null) {
        if (supabaseClient) {
            try {
                let query = supabaseClient
                    .from('tournament_registrations')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (eventId != null) {
                    query = query.eq('event_id', eventId);
                }
                const { data, error } = await query;
                if (!error && data) {
                    return data.map(r => ({
                        id: r.id,
                        eventId: r.event_id,
                        eventTitle: r.event_title,
                        division: r.division,
                        regNumber: r.reg_number,
                        teamName: r.team_name,
                        institution: r.institution,
                        kecamatan: r.kecamatan,
                        leaderName: r.leader_name,
                        leaderWa: r.leader_wa,
                        leaderEmail: r.leader_email,
                        roster: typeof r.roster === 'string' ? JSON.parse(r.roster) : (r.roster || []),
                        notes: r.notes || '',
                        status: r.status || 'pending',
                        createdAt: r.created_at
                    }));
                }
            } catch (err) {
                console.warn('Supabase getTournamentRegistrations error, using localStorage fallback:', err);
            }
        }
        return this.getLocalTournamentRegistrations(eventId);
    },

    getLocalTournamentRegistrations(eventId = null) {
        const key = CONFIG.STORAGE_KEYS.TOURNAMENT_REGISTRATIONS || 'esi_trenggalek_trn_regs_v2';
        const saved = localStorage.getItem(key);
        let list = [];
        if (!saved) {
            list = typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? [...INITIAL_TOURNAMENT_REGISTRATIONS] : [];
            localStorage.setItem(key, JSON.stringify(list));
        } else {
            try {
                list = JSON.parse(saved);
                if (!Array.isArray(list)) list = [];
                if (typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined') {
                    let updated = false;
                    INITIAL_TOURNAMENT_REGISTRATIONS.forEach(seed => {
                        const exists = list.some(r => r.id === seed.id || r.regNumber === seed.regNumber);
                        if (!exists) {
                            list.push(seed);
                            updated = true;
                        }
                    });
                    if (updated) {
                        localStorage.setItem(key, JSON.stringify(list));
                    }
                }
            } catch (e) {
                list = typeof INITIAL_TOURNAMENT_REGISTRATIONS !== 'undefined' ? [...INITIAL_TOURNAMENT_REGISTRATIONS] : [];
            }
        }
        if (eventId != null) {
            return list.filter(r => r.eventId == eventId);
        }
        return list;
    },

    async createTournamentRegistration(data) {
        const key = CONFIG.STORAGE_KEYS.TOURNAMENT_REGISTRATIONS || 'esi_trenggalek_trn_regs_v2';
        const local = this.getLocalTournamentRegistrations();
        
        // Generate nomor registrasi unik
        const count = local.length + 1;
        const regNum = data.regNumber || `REG-TRN-2026-${String(count).padStart(4, '0')}`;
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const newReg = {
            id: 'tr_' + Date.now(),
            eventId: data.eventId,
            eventTitle: data.eventTitle || '',
            division: data.division || '',
            regNumber: regNum,
            teamName: data.teamName,
            institution: data.institution || '',
            kecamatan: data.kecamatan || '',
            leaderName: data.leaderName,
            leaderWa: data.leaderWa,
            leaderEmail: data.leaderEmail || '',
            roster: data.roster || [],
            notes: data.notes || '',
            status: 'pending',
            createdAt: dateStr
        };

        if (supabaseClient) {
            try {
                const dbPayload = {
                    event_id: newReg.eventId,
                    event_title: newReg.eventTitle,
                    division: newReg.division,
                    reg_number: newReg.regNumber,
                    team_name: newReg.teamName,
                    institution: newReg.institution,
                    kecamatan: newReg.kecamatan,
                    leader_name: newReg.leaderName,
                    leader_wa: newReg.leaderWa,
                    leader_email: newReg.leaderEmail,
                    roster: JSON.stringify(newReg.roster),
                    notes: newReg.notes,
                    status: newReg.status
                };
                const { data: dbData, error } = await supabaseClient
                    .from('tournament_registrations')
                    .insert([dbPayload])
                    .select()
                    .single();
                if (!error && dbData) {
                    newReg.id = dbData.id;
                }
            } catch (err) {
                console.warn('Supabase createTournamentRegistration error, saved locally:', err);
            }
        }

        local.unshift(newReg);
        localStorage.setItem(key, JSON.stringify(local));
        return newReg;
    },

    async updateTournamentRegistrationStatus(regId, newStatus) {
        const key = CONFIG.STORAGE_KEYS.TOURNAMENT_REGISTRATIONS || 'esi_trenggalek_trn_regs_v2';
        if (supabaseClient) {
            try {
                await supabaseClient
                    .from('tournament_registrations')
                    .update({ status: newStatus })
                    .eq('id', regId);
            } catch (err) {
                console.warn('Supabase updateTournamentRegistrationStatus error:', err);
            }
        }
        const local = this.getLocalTournamentRegistrations();
        const item = local.find(r => r.id == regId);
        if (item) {
            item.status = newStatus;
            localStorage.setItem(key, JSON.stringify(local));
            return { success: true, item };
        }
        return { success: false };
    },

    async deleteTournamentRegistration(regId) {
        const key = CONFIG.STORAGE_KEYS.TOURNAMENT_REGISTRATIONS || 'esi_trenggalek_trn_regs_v2';
        if (supabaseClient) {
            try {
                await supabaseClient
                    .from('tournament_registrations')
                    .delete()
                    .eq('id', regId);
            } catch (err) {
                console.warn('Supabase deleteTournamentRegistration error:', err);
            }
        }
        let local = this.getLocalTournamentRegistrations();
        local = local.filter(r => r.id != regId);
        localStorage.setItem(key, JSON.stringify(local));
        return true;
    },

    // ==================== 6b. DISKUSI & KOMENTAR BERITA ====================
    /**
     * Ambil daftar komentar artikel secara real-time dari cloud (Vercel / Supabase)
     * Sinkron otomatis antar semua user / perangkat
     */
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
        } catch (err) {
            // Offline fallback
        }
        // Fallback ke localStorage atau INITIAL_ARTICLE_COMMENTS
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try { return JSON.parse(cached); } catch (_) {}
        }
        if (typeof INITIAL_ARTICLE_COMMENTS !== 'undefined' && INITIAL_ARTICLE_COMMENTS[articleId]) {
            return JSON.parse(JSON.stringify(INITIAL_ARTICLE_COMMENTS[articleId]));
        }
        return [];
    },

    /**
     * Kirim komentar baru ke cloud sehingga langsung terlihat oleh user lain
     */
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
            console.warn('Post comment cloud error, saving to local cache:', err);
        }

        // Fallback local
        const cached = await this.getArticleComments(articleId);
        cached.unshift(comment);
        try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch (_) {}
        return cached;
    },

    /**
     * Kirim balasan komentar (reply) ke cloud
     */
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

        // Fallback local
        const cached = await this.getArticleComments(articleId);
        const target = cached.find(c => c.id === commentId);
        if (target) {
            if (!Array.isArray(target.replies)) target.replies = [];
            target.replies.push(reply);
            try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch (_) {}
        }
        return cached;
    },

    /**
     * Hapus komentar (Admin) dari cloud
     */
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

        // Fallback local
        let cached = await this.getArticleComments(articleId);
        cached = cached.filter(c => c.id !== commentId);
        cached.forEach(c => {
            if (Array.isArray(c.replies)) c.replies = c.replies.filter(r => r.id !== commentId);
        });
        try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch (_) {}
        return cached;
    },

    // ==================== 7. RESET DATA ====================
    async resetToSeedData() {
        localStorage.removeItem('esi_deleted_athlete_ids');
        localStorage.removeItem('esi_deleted_event_ids');
        localStorage.removeItem('esi_deleted_news_ids');
        localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(INITIAL_ATHLETES));
        localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(INITIAL_EVENTS));
        localStorage.setItem(CONFIG.STORAGE_KEYS.NEWS, JSON.stringify(INITIAL_NEWS));
        localStorage.setItem(CONFIG.STORAGE_KEYS.TOURNAMENT_REGISTRATIONS, JSON.stringify(INITIAL_TOURNAMENT_REGISTRATIONS));
        return true;
    }
};
