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
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.ATHLETES);
        let list = [];
        if (!saved) {
            list = typeof INITIAL_ATHLETES !== 'undefined' ? [...INITIAL_ATHLETES] : [];
            localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(list));
            return list;
        }
        try {
            list = JSON.parse(saved);
            if (!Array.isArray(list)) list = [];
            if (list.length === 0 && typeof INITIAL_ATHLETES !== 'undefined' && INITIAL_ATHLETES.length > 0) {
                list = [...INITIAL_ATHLETES];
                localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(list));
            } else if (typeof INITIAL_ATHLETES !== 'undefined') {
                let updated = false;
                INITIAL_ATHLETES.forEach(seed => {
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
            return typeof INITIAL_ATHLETES !== 'undefined' ? [...INITIAL_ATHLETES] : [];
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

        let local = this.getLocalAthletes();
        local = local.filter(a => a.id != id);
        localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(local));
        return true;
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
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.EVENTS);
        if (!saved) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(INITIAL_EVENTS));
            return [...INITIAL_EVENTS];
        }
        try {
            let parsed = JSON.parse(saved);
            const hasLegacyMultiDiv = Array.isArray(parsed) && parsed.some(e => e.division === 'Multi-Divisi' || e.title === 'Piala Pelajar Esports Season 2 Tahun 2026');
            if (!Array.isArray(parsed) || parsed.length === 0 || hasLegacyMultiDiv) {
                localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(INITIAL_EVENTS));
                return [...INITIAL_EVENTS];
            }
            return parsed;
        } catch {
            return [...INITIAL_EVENTS];
        }
    },

    async createEvent(eventData) {
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

        let local = this.getLocalEvents();
        local = local.filter(e => e.id != id);
        localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(local));
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

        // Catat ID berita yang dihapus agar tidak pernah di-seed ulang
        const deletedIdsKey = 'esi_deleted_news_ids';
        let deletedIds = [];
        try {
            deletedIds = JSON.parse(localStorage.getItem(deletedIdsKey) || '[]').map(String);
        } catch (e) {
            deletedIds = [];
        }
        const idStr = String(id);
        if (!deletedIds.includes(idStr)) {
            deletedIds.push(idStr);
            localStorage.setItem(deletedIdsKey, JSON.stringify(deletedIds));
        }

        // Hapus dari data tersimpan di localStorage
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

    // ==================== 7. RESET DATA ====================
    async resetToSeedData() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.ATHLETES, JSON.stringify(INITIAL_ATHLETES));
        localStorage.setItem(CONFIG.STORAGE_KEYS.EVENTS, JSON.stringify(INITIAL_EVENTS));
        localStorage.setItem(CONFIG.STORAGE_KEYS.NEWS, JSON.stringify(INITIAL_NEWS));
        localStorage.setItem(CONFIG.STORAGE_KEYS.TOURNAMENT_REGISTRATIONS, JSON.stringify(INITIAL_TOURNAMENT_REGISTRATIONS));
        return true;
    }
};
