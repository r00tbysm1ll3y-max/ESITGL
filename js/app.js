/**
 * APPLICATION CONTROLLER & UI LOGIC
 * ESI Kabupaten Trenggalek
 */

// Global Application State
let athletes = [];
let events = [];
let news = [];
let isAdminLoggedIn = false;
let loggedMember = null;

let activeView = 'beranda';
let homeSelectedDiv = 'MLBB';
let publicDivFilter = 'Semua';
let eventStatusFilter = 'Semua';
let klasemenSelectedDiv = 'all';
let klasemenSearchQuery = '';
let newsCatFilter = 'Semua';
let adminActiveTab = 'atlet';
let memberActiveTab = 'kta';
let activeArticleId = 2;

const VALID_VIEWS = ['beranda', 'daftar', 'cek-data', 'event', 'event-detail', 'daftar-event', 'klasemen', 'berita', 'baca-berita', 'profil', 'admin', 'member'];

let activeRegisterEventId = 1;
let adminSelectedTournamentId = null;
let currentAdminTeamFilter = 'all';

// ==================== DEEP-LINK ROUTER ====================
// Mendukung format hash:
//   #berita        → halaman daftar berita
//   #berita/5      → langsung buka artikel ID 5
//   #event         → halaman jadwal event
//   #event/3       → langsung buka detail event ID 3

function parseHash(hash) {
    const clean = (hash || '').replace('#', '').trim();
    const parts = clean.split('/');
    return { view: parts[0] || 'beranda', id: parts[1] || null };
}

function buildHash(view, id) {
    return id != null ? `${view}/${id}` : view;
}

function getInitialView() {
    const { view, id } = parseHash(window.location.hash);
    if (view === 'berita' && id) { return { view: 'baca-berita', id }; }
    if (view === 'event' && id)  { return { view: 'event-detail', id }; }
    if (view === 'event-detail') { return { view: 'event-detail', id: id || activeEventId }; }
    if (view === 'daftar-event') {
        if (id) activeRegisterEventId = id;
        return { view: 'daftar-event', id: activeRegisterEventId };
    }
    if (VALID_VIEWS.includes(view)) return { view, id: null };
    const saved = sessionStorage.getItem('esi_active_view');
    if (VALID_VIEWS.includes(saved)) return { view: saved, id: null };
    return { view: 'beranda', id: null };
}

// ==================== INITIALIZATION ====================
async function initApp() {
    initSupabase();
    isAdminLoggedIn = Api.isAdminLoggedIn();
    loggedMember = Api.getLoggedMember();
    updateHeaderAdminBadge();
    updateHeaderMemberBadge();

    // Load initial data dari backend/localStorage
    await refreshAllData();

    // Pastikan data member tersinkronisasi jika poin/status diupdate oleh admin
    if (loggedMember) {
        const found = athletes.find(a => a.id == loggedMember.id);
        if (found) {
            loggedMember = found;
            localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(found));
        }
    }

    // Inisialisasi rekomendasi sekolah awal (SMA)
    if (typeof handleJenjangChange === 'function') {
        handleJenjangChange('SMA');
    }

    // Inisialisasi rekomendasi kelurahan / desa awal (Trenggalek Kota)
    if (typeof updateDesaRecommendations === 'function') {
        updateDesaRecommendations('Trenggalek', false);
    }

    // Pulihkan tampilan terakhir sebelum refresh (dari URL hash atau session)
    const startRoute = getInitialView();
    if (startRoute.view === 'baca-berita' && startRoute.id) {
        activeArticleId = startRoute.id;
    }
    if (startRoute.view === 'event-detail' && startRoute.id) {
        activeEventId = startRoute.id;
    }
    navigateTo(startRoute.view, false);

    // Listener tombol Back/Forward browser — mendukung deep-link
    window.addEventListener('hashchange', () => {
        const { view, id } = parseHash(window.location.hash);
        if (view === 'berita' && id) {
            // Deep-link ke artikel: #berita/5
            openNewsArticle(id, false);
            return;
        }
        if (view === 'event' && id) {
            // Deep-link ke detail event: #event/3
            openEventDetail(id, false);
            return;
        }
        if (view === 'event-detail') {
            openEventDetail(id || activeEventId, false);
            return;
        }
        if (view === 'daftar-event') {
            if (id) activeRegisterEventId = id;
            navigateTo('daftar-event', false);
            renderEventRegistrationPage(activeRegisterEventId);
            return;
        }
        if (VALID_VIEWS.includes(view) && view !== activeView) {
            navigateTo(view, false);
        }
    });
}

async function refreshAllData() {
    try {
        const [a, e, n] = await Promise.all([
            Api.getAthletes(),
            Api.getEvents(),
            Api.getNews(),
            Api.getTournamentRegistrations().catch(() => [])
        ]);
        athletes = a || [];
        events = e || [];
        news = n || [];
    } catch (err) {
        console.error('Error saat refresh data:', err);
    }
}

/**
 * GENERATOR NOMOR REGISTRASI URUT RESMI (ESI-TRG-2026-XXXX)
 * Menghasilkan nomor urut registrasi anggota secara berurutan (0001, 0002, dst.)
 */
function getAthleteRegNo(athlete) {
    if (!athlete) return 'ESI-TRG-2026-0001';

    // 1. Jika atlet sudah memiliki regNo berformat resmi
    if (athlete.regNo && typeof athlete.regNo === 'string' && athlete.regNo.startsWith('ESI-TRG-2026-')) {
        return athlete.regNo;
    }

    // 2. Jika id adalah integer kecil (dari Supabase sequence / auto-increment)
    if (typeof athlete.id === 'number' && athlete.id > 0 && athlete.id < 100000) {
        return `ESI-TRG-2026-${String(athlete.id).padStart(4, '0')}`;
    }

    // 3. Urutkan seluruh atlet secara kronologis pendaftaran (id tertua = urutan 1)
    const list = Array.isArray(athletes) && athletes.length > 0 ? athletes : [];
    const sorted = [...list].sort((a, b) => {
        const timeA = typeof a.id === 'number' ? a.id : new Date(a.createdAt || 0).getTime();
        const timeB = typeof b.id === 'number' ? b.id : new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
    });

    const idx = sorted.findIndex(a => a.id == athlete.id);
    const orderNum = idx >= 0 ? idx + 1 : 1;
    return `ESI-TRG-2026-${String(orderNum).padStart(4, '0')}`;
}

// ==================== SPA NAVIGATION CONTROLLER ====================
function navigateTo(viewName, updateHash = true) {
    if (!VALID_VIEWS.includes(viewName)) {
        viewName = 'beranda';
    }

    // Jika member sudah login dan mencoba membuka formulir pendaftaran atlet,
    // langsung arahkan ke halaman profil & KTA resmi mereka
    if (viewName === 'daftar' && loggedMember) {
        viewName = 'member';
    }

    activeView = viewName;
    sessionStorage.setItem('esi_active_view', viewName);

    if (updateHash) {
        // Gunakan hash bersih (tanpa ID) saat navigasi view biasa
        const newHash = `#${viewName}`;
        if (window.location.hash !== newHash) {
            window.location.hash = viewName;
        }
    }

    // Hide all views
    document.querySelectorAll('.spa-view').forEach(el => el.classList.add('hidden'));

    // Show target view
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    // Update Desktop Nav Active State
    document.querySelectorAll('.nav-link').forEach(btn => {
        const isHidden = btn.dataset.nav === 'daftar' && Boolean(loggedMember);
        const hideClass = isHidden ? ' hidden' : '';
        const isNavActive = (btn.dataset.nav === viewName) ||
                            (viewName === 'baca-berita' && btn.dataset.nav === 'berita') ||
                            (viewName === 'event-detail' && btn.dataset.nav === 'event') ||
                            (viewName === 'daftar-event' && btn.dataset.nav === 'event');
        if (isNavActive) {
            btn.className = `nav-link px-3 py-2 rounded-lg text-sm font-bold bg-[#DC2626] text-white transition${hideClass}`;
        } else {
            btn.className = `nav-link px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-[#1E293B] transition${hideClass}`;
        }
    });

    // Update Mobile Bottom Nav Active State
    document.querySelectorAll('.bnav-btn').forEach(btn => {
        const isBNavActive = (btn.dataset.bnav === viewName) ||
                             (viewName === 'baca-berita' && btn.dataset.bnav === 'berita') ||
                             (viewName === 'event-detail' && btn.dataset.bnav === 'event') ||
                             (viewName === 'daftar-event' && btn.dataset.bnav === 'event');
        if (isBNavActive) {
            btn.className = "bnav-btn flex flex-col items-center justify-center gap-1 text-[#DC2626] font-bold";
        } else {
            btn.className = "bnav-btn flex flex-col items-center justify-center gap-1 text-slate-500 font-semibold";
        }
    });

    // Refresh view-specific renders
    if (viewName === 'beranda') renderHomeView();
    if (viewName === 'cek-data') renderPublicAthletes();
    if (viewName === 'event') renderEventsView();
    if (viewName === 'event-detail') renderEventDetailPage(activeEventId);
    if (viewName === 'daftar-event') renderEventRegistrationPage(activeRegisterEventId);
    if (viewName === 'klasemen') renderKlasemenView();
    if (viewName === 'berita') renderNewsView();
    if (viewName === 'baca-berita') renderArticleDetailPage(activeArticleId);
    if (viewName === 'admin') renderAdminView();
    if (viewName === 'member') renderMemberView();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper: dapatkan URL shareable untuk artikel atau event
function getArticleUrl(articleId) {
    return `${window.location.origin}${window.location.pathname}#berita/${articleId}`;
}
function getEventUrl(eventId) {
    return `${window.location.origin}${window.location.pathname}#event/${eventId}`;
}

function toggleMobileDrawer() {
    const drawer = document.getElementById('mobileDrawer');
    if (drawer) drawer.classList.toggle('hidden');
}

// Toast Helper
function showToast(title, desc) {
    const toast = document.getElementById('toastNotification');
    const tTitle = document.getElementById('toastTitle');
    const tDesc = document.getElementById('toastDesc');
    if (toast && tTitle && tDesc) {
        tTitle.textContent = title;
        tDesc.textContent = desc;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3500);
    }
}

// Helper parsing tanggal berita untuk pengurutan kronologis (Paling Baru ke Paling Lama)
function getNewsTimestamp(item) {
    if (!item) return 0;
    if (item.isoDate && /^\d{4}-\d{2}-\d{2}/.test(item.isoDate)) return new Date(item.isoDate).getTime();
    if (item.date && /^\d{4}-\d{2}-\d{2}/.test(item.date)) return new Date(item.date).getTime();
    const months = {
        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
    };
    const parts = (item.date || '').toLowerCase().split(/\s+/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const month = months[parts[1]];
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && month !== undefined && !isNaN(year)) {
            return new Date(year, month, day).getTime();
        }
    }
    const t = new Date(item.date).getTime();
    return isNaN(t) ? 0 : t;
}

// ==================== 1. BERANDA VIEW LOGIC ====================
function renderHomeView() {
    const verifiedAthletes = athletes.filter(a => a.status === 'verified');
    const uniqueTeams = new Set(
        verifiedAthletes
            .map(a => (a.teamName || '').trim())
            .filter(t => t && t.toLowerCase() !== 'individu / non-tim')
    );
    const activeEventsCount = events.filter(e => e.status === 'Upcoming' || e.status === 'Ongoing').length;

    const elStatAthletes = document.getElementById('statTotalAthletes');
    const elStatTeams = document.getElementById('statTotalTeams');
    const elStatEvents = document.getElementById('statActiveEvents');

    if (elStatAthletes) elStatAthletes.textContent = verifiedAthletes.length;
    if (elStatTeams) elStatTeams.textContent = uniqueTeams.size;
    if (elStatEvents) elStatEvents.textContent = activeEventsCount;

    renderHomeTop3();

    const sortedNews = [...(Array.isArray(news) ? news : [])].sort((a, b) => getNewsTimestamp(b) - getNewsTimestamp(a));
    const latestNews = sortedNews.slice(0, 3);
    const newsContainer = document.getElementById('homeNewsContainer');
    if (newsContainer) {
        if (latestNews.length === 0) {
            newsContainer.innerHTML = `<div class="col-span-3 bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-slate-500">Belum ada berita yang dipublikasikan.</div>`;
        } else {
            newsContainer.innerHTML = latestNews.map(item => {
                const imgThumb = item.imageUrl
                    ? `<div class="h-44 -mx-5 -mt-5 mb-4 overflow-hidden rounded-t-xl bg-slate-100 border-b border-slate-100 cursor-pointer" onclick="openNewsArticle(${item.id})">
                        <img src="${item.imageUrl}" alt="${item.title}" loading="lazy" decoding="async" class="w-full h-full object-cover hover:scale-105 transition duration-300">
                    </div>`
                    : '';

                return `
                <article class="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition">
                    <div>
                        ${imgThumb}
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <span class="px-2.5 py-0.5 rounded bg-red-50 text-[#DC2626] text-[11px] font-bold uppercase tracking-wider">${item.category}</span>
                            <span class="text-xs text-slate-400">${item.date}</span>
                        </div>
                        <div class="text-[11px] text-slate-500 font-medium mb-3 flex items-center gap-1.5 truncate">
                            <i class="fa-solid fa-user-pen text-[#DC2626] text-[10px]"></i>
                            <span>Oleh: <strong class="text-slate-700">${item.author || 'Humas ESI Trenggalek'}</strong></span>
                        </div>
                        <h3 class="font-bold text-base md:text-lg text-[#0F172A] leading-snug mb-2 cursor-pointer hover:text-[#DC2626] transition" onclick="openNewsArticle(${item.id})">${item.title}</h3>
                        <p class="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">${item.excerpt}</p>
                    </div>
                    <button onclick="openNewsArticle(${item.id})" class="self-start text-xs font-bold uppercase tracking-wider text-[#DC2626] hover:text-[#B91C1C] flex items-center gap-1.5 transition">
                        <span>Baca Artikel Lengkap</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </article>
            `;
            }).join('');
        }
    }
}

// Konfigurasi Tema & Ikon Divisi untuk Card Showcase Beranda (Model PBESI)
const HOME_SHOWCASE_CONFIG = {
    'MLBB': { name: 'Divisi MLBB', icon: 'fa-solid fa-gamepad', headerBg: 'bg-[#DC2626]', pillBg: 'bg-[#DC2626]' },
    'Free Fire': { name: 'Divisi Free Fire', icon: 'fa-solid fa-fire', headerBg: 'bg-[#F59E0B]', pillBg: 'bg-[#F59E0B]' },
    'PUBG Mobile': { name: 'Divisi PUBG Mobile', icon: 'fa-solid fa-crosshairs', headerBg: 'bg-[#10B981]', pillBg: 'bg-[#10B981]' },
    'eFootball': { name: 'Divisi eFootball', icon: 'fa-solid fa-futbol', headerBg: 'bg-[#2563EB]', pillBg: 'bg-[#2563EB]' },
    'Honor of Kings': { name: 'Divisi HOK', icon: 'fa-solid fa-crown', headerBg: 'bg-[#D97706]', pillBg: 'bg-[#D97706]' },
    'Arena of Valor': { name: 'Divisi AOV', icon: 'fa-solid fa-shield-halved', headerBg: 'bg-[#0284C7]', pillBg: 'bg-[#0284C7]' },
    'MCGG': { name: 'Divisi MCGG', icon: 'fa-solid fa-chess-knight', headerBg: 'bg-[#7C3AED]', pillBg: 'bg-[#7C3AED]' },
    'Valorant': { name: 'Divisi Valorant', icon: 'fa-solid fa-desktop', headerBg: 'bg-[#E11D48]', pillBg: 'bg-[#E11D48]' },
    'EA FC Mobile': { name: 'Divisi EA FC', icon: 'fa-solid fa-futbol', headerBg: 'bg-[#059669]', pillBg: 'bg-[#059669]' },
    'Clash Royale': { name: 'Divisi Clash Royale', icon: 'fa-solid fa-tower-broadcast', headerBg: 'bg-[#4F46E5]', pillBg: 'bg-[#4F46E5]' },
    'Clash of Clans': { name: 'Divisi CoC', icon: 'fa-solid fa-shield', headerBg: 'bg-[#CA8A04]', pillBg: 'bg-[#CA8A04]' },
    'Street Fighter 6': { name: 'Divisi SF6', icon: 'fa-solid fa-hand-fist', headerBg: 'bg-[#DC2626]', pillBg: 'bg-[#DC2626]' },
    'Call of Duty Mobile': { name: 'Divisi CODM', icon: 'fa-solid fa-bullseye', headerBg: 'bg-[#475569]', pillBg: 'bg-[#475569]' },
    'Dota 2': { name: 'Divisi Dota 2', icon: 'fa-solid fa-dragon', headerBg: 'bg-[#B91C1C]', pillBg: 'bg-[#B91C1C]' },
    'Chess': { name: 'Divisi Chess', icon: 'fa-solid fa-chess', headerBg: 'bg-[#334155]', pillBg: 'bg-[#334155]' }
};

function renderHomeTop3() {
    const container = document.getElementById('homeTop3Container');
    if (!container) return;

    // 4 Divisi Inti yang selalu tampil berdampingan (seperti referensi ESI Bondowoso)
    const baseKeys = ['MLBB', 'Free Fire', 'PUBG Mobile', 'eFootball'];

    // Tambahkan divisi lain jika memiliki atlet terverifikasi (misal HOK, Valorant, dll)
    const verifiedDivs = [...new Set(
        athletes
            .filter(a => a.status === 'verified' && !baseKeys.includes(a.division))
            .map(a => a.division)
    )];

    const allDisplayKeys = [...baseKeys, ...verifiedDivs];

    container.innerHTML = allDisplayKeys.map(divKey => {
        const conf = HOME_SHOWCASE_CONFIG[divKey] || {
            name: `Divisi ${divKey}`,
            icon: 'fa-solid fa-trophy',
            headerBg: 'bg-[#0F172A]',
            pillBg: 'bg-[#0F172A]'
        };

        const top3 = athletes
            .filter(a => a.status === 'verified' && a.division === divKey)
            .sort((a, b) => b.points - a.points)
            .slice(0, 3);

        let rows = '';
        for (let i = 0; i < 3; i++) {
            const player = top3[i];
            const rank = i + 1;

            if (player) {
                const name = player.nickname || player.fullName || '-';
                const team = player.teamName || 'Individu / Non-Tim';
                const pts = Number(player.points || 0).toLocaleString('id-ID');

                rows += `
                    <div class="py-3 flex items-center justify-between gap-2.5 min-h-[58px]">
                        <div class="min-w-0 flex-1">
                            <div class="text-xs sm:text-sm font-extrabold text-[#0F172A] truncate">
                                <span class="text-slate-400 font-bold mr-1">${rank}.</span>${name}
                            </div>
                            <div class="text-[11px] text-slate-500 font-medium truncate pl-3.5">
                                ${team}
                            </div>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold text-white shrink-0 shadow-sm ${conf.pillBg}">
                            ${pts} Poin
                        </span>
                    </div>
                `;
            } else {
                rows += `
                    <div class="py-3 flex items-center justify-between gap-2.5 min-h-[58px] opacity-40">
                        <div class="min-w-0 flex-1">
                            <div class="text-xs font-semibold text-slate-400 truncate">
                                <span class="mr-1">${rank}.</span>Slot Terbuka
                            </div>
                            <div class="text-[10px] text-slate-400 pl-3.5 font-normal">
                                Belum Terisi
                            </div>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-400 bg-slate-100 shrink-0">
                            - Poin
                        </span>
                    </div>
                `;
            }
        }

        return `
            <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between">
                <div class="${conf.headerBg} text-white py-2.5 px-4 text-center font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 tracking-wide shadow-sm">
                    <i class="${conf.icon}"></i>
                    <span>${conf.name}</span>
                </div>
                <div class="p-3.5 sm:p-4 divide-y divide-slate-100 flex-1 flex flex-col justify-between">
                    ${rows}
                </div>
            </div>
        `;
    }).join('');
}

// ==================== 2. PENDAFTARAN ATLET ====================
function handlePekerjaanChange(type) {
    const panelPelajar = document.getElementById('panelPelajar');
    const panelUmum = document.getElementById('panelUmum');
    const inputInst = document.getElementById('regInstitution');
    const inputKerja = document.getElementById('regTempatKerja');

    if (type === 'PELAJAR') {
        if (panelPelajar) panelPelajar.classList.remove('hidden');
        if (panelUmum) panelUmum.classList.add('hidden');
        if (inputInst) inputInst.required = true;
        if (inputKerja) inputKerja.required = false;
        
        // Inisialisasi rekomendasi sekolah sesuai jenjang aktif
        const jenjang = document.getElementById('regJenjang')?.value || 'SMA';
        handleJenjangChange(jenjang);
    } else {
        if (panelPelajar) panelPelajar.classList.add('hidden');
        if (panelUmum) panelUmum.classList.remove('hidden');
        if (inputInst) inputInst.required = false;
        if (inputKerja) inputKerja.required = true;
        closeSchoolSuggestions();
    }
}

// Logika Rekomendasi Sekolah Dinamis Berdasarkan Jenjang (SMP vs SMA dsb.)
function handleJenjangChange(level) {
    const input = document.getElementById('regInstitution');
    const datalist = document.getElementById('trenggalekSchools');
    const helper = document.getElementById('schoolHelperText');

    const schools = (typeof TRENGGALEK_SCHOOLS_BY_LEVEL !== 'undefined' && TRENGGALEK_SCHOOLS_BY_LEVEL[level])
        ? TRENGGALEK_SCHOOLS_BY_LEVEL[level]
        : (typeof TRENGGALEK_SCHOOLS !== 'undefined' ? TRENGGALEK_SCHOOLS : []);

    // 1. Perbarui opsi di native HTML5 datalist
    if (datalist) {
        datalist.innerHTML = schools.map(sch => `<option value="${sch}">`).join('');
    }

    // 2. Sesuaikan Placeholder & Helper Text
    if (input) {
        if (level === 'SMA') {
            input.placeholder = "Ketik SMA/SMK/MA (contoh: SMAN 1 TUGU, SMAN 1 Trenggalek)...";
            if (helper) helper.textContent = "Menampilkan rekomendasi SMA, SMK, dan MA se-Kabupaten Trenggalek.";
        } else if (level === 'SMP') {
            input.placeholder = "Ketik SMP/MTs (contoh: SMPN 1 Tugu, SMPN 1 Trenggalek)...";
            if (helper) helper.textContent = "Menampilkan rekomendasi SMP dan MTs se-Kabupaten Trenggalek.";
        } else if (level === 'MAHASISWA') {
            input.placeholder = "Ketik nama kampus (contoh: STKIP PGRI Trenggalek, PSDKU Polinema)...";
            if (helper) helper.textContent = "Menampilkan rekomendasi perguruan tinggi / kampus Trenggalek.";
        } else {
            input.placeholder = "Ketik nama sekolah dasar / madrasah...";
            if (helper) helper.textContent = "Menampilkan rekomendasi sekolah dasar di Kabupaten Trenggalek.";
        }
    }

    // Refresh custom dropdown jika input sedang aktif
    if (input && document.activeElement === input) {
        handleSchoolInput(input.value);
    }
}

function handleSchoolInput(query) {
    const box = document.getElementById('schoolSuggestionBox');
    const jenjang = document.getElementById('regJenjang')?.value || 'SMA';
    if (!box) return;

    const schools = (typeof TRENGGALEK_SCHOOLS_BY_LEVEL !== 'undefined' && TRENGGALEK_SCHOOLS_BY_LEVEL[jenjang])
        ? TRENGGALEK_SCHOOLS_BY_LEVEL[jenjang]
        : (typeof TRENGGALEK_SCHOOLS !== 'undefined' ? TRENGGALEK_SCHOOLS : []);

    const q = (query || '').toLowerCase().trim();
    const filtered = q === '' 
        ? schools.slice(0, 10) 
        : schools.filter(s => s.toLowerCase().includes(q));

    if (filtered.length === 0) {
        box.innerHTML = `
            <div class="p-3.5 text-xs text-slate-500 text-center">
                <i class="fa-solid fa-circle-question text-slate-400 mr-1"></i> Tidak ditemukan sekolah "${query}". Anda tetap bisa mengetik nama sekolah manual.
            </div>
        `;
        box.classList.remove('hidden');
        return;
    }

    box.innerHTML = filtered.slice(0, 15).map(sch => {
        let badgeColor = "bg-red-50 text-[#DC2626]";
        if (sch.startsWith("SMKN")) badgeColor = "bg-blue-50 text-blue-600";
        else if (sch.startsWith("SMPN")) badgeColor = "bg-emerald-50 text-emerald-700";
        else if (sch.startsWith("MAN") || sch.startsWith("MAS") || sch.startsWith("MTs")) badgeColor = "bg-emerald-50 text-emerald-700";

        // Highlight matching text
        const safeQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const highlighted = q ? sch.replace(new RegExp(`(${safeQuery})`, 'gi'), '<span class="bg-amber-200 text-slate-900 font-extrabold px-0.5 rounded">$1</span>') : sch;

        return `
            <div onclick="selectSchool('${sch.replace(/'/g, "\\'")}')" class="px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-2 transition group">
                <div class="flex items-center gap-2.5 min-w-0">
                    <i class="fa-solid fa-school text-slate-400 group-hover:text-[#DC2626] text-xs transition"></i>
                    <span class="text-xs font-bold text-[#0F172A] truncate">${highlighted}</span>
                </div>
                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${badgeColor}">Trenggalek</span>
            </div>
        `;
    }).join('');

    box.classList.remove('hidden');
}

function selectSchool(name) {
    const input = document.getElementById('regInstitution');
    if (input) {
        input.value = name;
    }
    closeSchoolSuggestions();
}

function closeSchoolSuggestions() {
    const box = document.getElementById('schoolSuggestionBox');
    if (box) box.classList.add('hidden');
}

// Tutup dropdown rekomendasi saat klik di luar area
document.addEventListener('click', (e) => {
    const input = document.getElementById('regInstitution');
    const box = document.getElementById('schoolSuggestionBox');
    if (box && input && !box.contains(e.target) && e.target !== input) {
        closeSchoolSuggestions();
    }
});

// ==================== CUSTOM MOBILE-FRIENDLY SELECT COMPONENT ====================
function setSelectPekerjaan(type) {
    const input = document.getElementById('regStatusPekerjaan');
    if (input) input.value = type;

    const btnPelajar = document.getElementById('btnPekerjaanPelajar');
    const btnUmum = document.getElementById('btnPekerjaanUmum');

    if (type === 'PELAJAR') {
        if (btnPelajar) btnPelajar.className = "py-2.5 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#DC2626] border border-slate-200/80";
        if (btnUmum) btnUmum.className = "py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition text-slate-600 hover:text-[#0F172A]";
    } else {
        if (btnUmum) btnUmum.className = "py-2.5 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-sm bg-white text-[#DC2626] border border-slate-200/80";
        if (btnPelajar) btnPelajar.className = "py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition text-slate-600 hover:text-[#0F172A]";
    }

    handlePekerjaanChange(type);
}

const CUSTOM_SELECTS = {
    jenjang: {
        inputId: 'regJenjang',
        labelId: 'labelJenjang',
        panelId: 'panelJenjang',
        chevronId: 'chevronJenjang',
        options: [
            { value: 'SMA', label: 'SMA / SMK / MA', icon: 'fa-graduation-cap' },
            { value: 'SMP', label: 'SMP / MTs', icon: 'fa-school' },
            { value: 'MAHASISWA', label: 'Perguruan Tinggi / Mahasiswa', icon: 'fa-building-columns' },
            { value: 'SD', label: 'SD / Sederajat', icon: 'fa-book-open' }
        ],
        onSelect: (val) => {
            handleJenjangChange(val);
        }
    },
    profesi: {
        inputId: 'regProfesi',
        labelId: 'labelProfesi',
        panelId: 'panelProfesi',
        chevronId: 'chevronProfesi',
        options: [
            { value: 'Pegawai Swasta', label: 'Pegawai Swasta', icon: 'fa-building' },
            { value: 'Wiraswasta', label: 'Wiraswasta / Usaha', icon: 'fa-shop' },
            { value: 'PNS / ASN / TNI / POLRI', label: 'PNS / ASN / TNI / POLRI', icon: 'fa-id-badge' },
            { value: 'Freelance / Kreatif', label: 'Freelance / Kreatif', icon: 'fa-laptop-code' },
            { value: 'Lainnya', label: 'Lainnya', icon: 'fa-user' }
        ]
    },
    kecamatan: {
        inputId: 'regKecamatan',
        labelId: 'labelKecamatan',
        panelId: 'panelKecamatan',
        chevronId: 'chevronKecamatan',
        searchId: 'searchKecamatan',
        options: [
            { value: 'Trenggalek', label: 'Trenggalek (Kota)', desc: 'Pusat Kota' },
            { value: 'Pogalan', label: 'Pogalan', desc: 'Trenggalek' },
            { value: 'Durenan', label: 'Durenan', desc: 'Trenggalek' },
            { value: 'Gandusari', label: 'Gandusari', desc: 'Trenggalek' },
            { value: 'Karangan', label: 'Karangan', desc: 'Trenggalek' },
            { value: 'Kampak', label: 'Kampak', desc: 'Trenggalek' },
            { value: 'Tugu', label: 'Tugu', desc: 'Trenggalek' },
            { value: 'Bendungan', label: 'Bendungan', desc: 'Trenggalek' },
            { value: 'Suruh', label: 'Suruh', desc: 'Trenggalek' },
            { value: 'Pule', label: 'Pule', desc: 'Trenggalek' },
            { value: 'Dongko', label: 'Dongko', desc: 'Trenggalek' },
            { value: 'Panggul', label: 'Panggul', desc: 'Trenggalek' },
            { value: 'Munjungan', label: 'Munjungan', desc: 'Trenggalek' },
            { value: 'Watulimo', label: 'Watulimo', desc: 'Trenggalek' }
        ],
        onSelect: (val) => {
            updateDesaRecommendations(val, true);
        }
    },
    division: {
        inputId: 'regDivision',
        labelId: 'labelDivision',
        panelId: 'panelDivision',
        chevronId: 'chevronDivision',
        options: [
            { value: 'MLBB', label: 'Mobile Legends: Bang Bang (MLBB)', icon: 'fa-gamepad' },
            { value: 'Free Fire', label: 'Free Fire (FF)', icon: 'fa-fire' },
            { value: 'PUBG Mobile', label: 'PUBG Mobile (PUBGM)', icon: 'fa-crosshairs' },
            { value: 'Honor of Kings', label: 'Honor of Kings (HOK)', icon: 'fa-crown' },
            { value: 'Arena of Valor', label: 'Arena of Valor (AOV)', icon: 'fa-shield-halved' },
            { value: 'MCGG', label: 'Magic Chess: Go Go (MCGG)', icon: 'fa-chess-knight' },
            { value: 'eFootball', label: 'eFootball (PES)', icon: 'fa-futbol' },
            { value: 'EA FC Mobile', label: 'EA FC Mobile', icon: 'fa-futbol' },
            { value: 'Clash Royale', label: 'Clash Royale', icon: 'fa-tower-broadcast' },
            { value: 'Clash of Clans', label: 'Clash of Clans (CoC)', icon: 'fa-shield' },
            { value: 'Street Fighter 6', label: 'Street Fighter 6 (SF6)', icon: 'fa-hand-fist' },
            { value: 'Valorant', label: 'Valorant (PC)', icon: 'fa-desktop' },
            { value: 'Call of Duty Mobile', label: 'Call of Duty Mobile (CODM)', icon: 'fa-bullseye' },
            { value: 'Dota 2', label: 'Dota 2 (PC)', icon: 'fa-dragon' },
            { value: 'Chess', label: 'Catur Online (Chess.com)', icon: 'fa-chess' }
        ]
    },
    agama: {
        inputId: 'regAgama',
        labelId: 'labelAgama',
        panelId: 'panelAgama',
        chevronId: 'chevronAgama',
        options: [
            { value: 'Islam', label: 'Islam' },
            { value: 'Kristen', label: 'Kristen' },
            { value: 'Katolik', label: 'Katolik' },
            { value: 'Hindu', label: 'Hindu' },
            { value: 'Budha', label: 'Budha' },
            { value: 'Konghucu', label: 'Konghucu' },
            { value: 'Lainnya', label: 'Lainnya' }
        ]
    }
};

/**
 * MASTER DATA RESMI KELURAHAN / DESA KABUPATEN TRENGGALEK (14 KECAMATAN - 157 WILAYAH)
 * Sumber: Data Resmi Kemendagri & BPS Kabupaten Trenggalek (152 Desa & 5 Kelurahan)
 */
const TRENGGALEK_DESA = {
    // 35.03.11 - Kecamatan Trenggalek (5 Kelurahan + 8 Desa = 13)
    'Trenggalek': [
        'Kelutan', 'Ngantru', 'Sumbergedong', 'Surodakan', 'Tamanan', 
        'Dawuhan', 'Karangsoko', 'Ngares', 'Parakan', 'Rejowinangun', 'Sambirejo', 'Sukosari', 'Sumberdadi'
    ],
    // 35.03.12 - Kecamatan Pogalan (10 Desa)
    'Pogalan': [
        'Bendorejo', 'Gembleb', 'Kedunglurah', 'Ngadirejo', 'Ngadirenggo', 
        'Ngetal', 'Ngulankulon', 'Ngulanwetan', 'Pogalan', 'Wonocoyo'
    ],
    // 35.03.13 - Kecamatan Durenan (14 Desa)
    'Durenan': [
        'Baruharjo', 'Durenan', 'Gador', 'Kamulan', 'Karanganom', 
        'Kendalrejo', 'Malasan', 'Ngadisuko', 'Pakis', 'Pandean', 
        'Panggungsari', 'Semarum', 'Sumberejo', 'Sumbergayam'
    ],
    // 35.03.10 - Kecamatan Gandusari (11 Desa)
    'Gandusari': [
        'Gandusari', 'Jajar', 'Karanganyar', 'Krandegan', 'Melis', 
        'Ngrayung', 'Sukorame', 'Sukorejo', 'Widoro', 'Wonoanti', 'Wonorejo'
    ],
    // 35.03.06 - Kecamatan Karangan (12 Desa)
    'Karangan': [
        'Buluagung', 'Jati', 'Jatiprahu', 'Karangan', 'Kayen', 
        'Kedungsigit', 'Kerjo', 'Ngentrong', 'Salamrejo', 'Suko Wetan', 'Sumber', 'Sumberingin'
    ],
    // 35.03.07 - Kecamatan Kampak (7 Desa)
    'Kampak': [
        'Bendoagung', 'Bogoran', 'Karangrejo', 'Ngadimulyo', 'Senden', 'Sugihan', 'Timahan'
    ],
    // 35.03.05 - Kecamatan Tugu (15 Desa)
    'Tugu': [
        'Banaran', 'Dermosari', 'Duren', 'Gading', 'Gondang', 
        'Jambu', 'Ngepeh', 'Nglinggis', 'Nglongsor', 'Prambon', 
        'Pucanganak', 'Sukorejo', 'Tegaren', 'Tumpuk', 'Winong'
    ],
    // 35.03.09 - Kecamatan Bendungan (8 Desa)
    'Bendungan': [
        'Botoputih', 'Depok', 'Dompyong', 'Masaran', 'Sengon', 'Srabah', 'Sumurup', 'Suren Lor'
    ],
    // 35.03.14 - Kecamatan Suruh (7 Desa)
    'Suruh': [
        'Gamping', 'Mlinjon', 'Nglebo', 'Ngrandu', 'Puru', 'Suruh', 'Wonokerto'
    ],
    // 35.03.03 - Kecamatan Pule (10 Desa)
    'Pule': [
        'Joho', 'Jombok', 'Karanganyar', 'Kembangan', 'Pakel', 
        'Pule', 'Puyung', 'Sidomulyo', 'Sukokidul', 'Tanggaran'
    ],
    // 35.03.04 - Kecamatan Dongko (10 Desa)
    'Dongko': [
        'Cakul', 'Dongko', 'Ngerdani', 'Pandean', 'Petung', 
        'Pringapus', 'Salam Wates', 'Siki', 'Sumber Bening', 'Watuagung'
    ],
    // 35.03.01 - Kecamatan Panggul (17 Desa)
    'Panggul': [
        'Banjar', 'Barang', 'Besuki', 'Bodag', 'Depok', 
        'Gayam', 'Karangtengah', 'Kertosono', 'Manggis', 'Nglebeng', 
        'Ngrambingan', 'Ngrencak', 'Panggul', 'Sawahan', 'Tangkil', 'Terbis', 'Wonocoyo'
    ],
    // 35.03.02 - Kecamatan Munjungan (11 Desa)
    'Munjungan': [
        'Bangun', 'Bendoroto', 'Besuki', 'Craken', 'Karangturi', 
        'Masaran', 'Munjungan', 'Ngulungkulon', 'Ngulungwetan', 'Sobo', 'Tawing'
    ],
    // 35.03.08 - Kecamatan Watulimo (12 Desa)
    'Watulimo': [
        'Dukuh', 'Gemaharjo', 'Karanggandu', 'Margomulyo', 'Ngembel', 
        'Pakel', 'Prigi', 'Sawahan', 'Slawe', 'Tasikmadu', 'Watuagung', 'Watulimo'
    ]
};

// 5 Kelurahan resmi di Kecamatan Trenggalek
const KELURAHAN_TRENGGALEK = ['Kelutan', 'Ngantru', 'Sumbergedong', 'Surodakan', 'Tamanan'];

function getDesaListForKecamatan(kecamatan) {
    if (!kecamatan) return TRENGGALEK_DESA['Trenggalek'];
    const cleanKec = kecamatan.replace(/\s*\(.*\)/, '').trim();
    return TRENGGALEK_DESA[cleanKec] || TRENGGALEK_DESA['Trenggalek'] || [];
}

function updateDesaRecommendations(kecamatanName, resetDesaInput = false) {
    const list = getDesaListForKecamatan(kecamatanName);
    const cleanKec = kecamatanName ? kecamatanName.replace(/\s*\(.*\)/, '').trim() : 'Trenggalek';

    const inputDesa = document.getElementById('regDesa');
    const badge = document.getElementById('desaValidationBadge');
    const header = document.getElementById('panelDesaHeader');
    const count = document.getElementById('panelDesaCount');

    if (resetDesaInput && inputDesa) {
        inputDesa.value = '';
        if (badge) badge.classList.add('hidden');
    }

    if (inputDesa) {
        inputDesa.placeholder = `Pilih / ketik desa di Kec. ${cleanKec}...`;
    }

    if (header) {
        header.innerHTML = `<i class="fa-solid fa-location-dot text-[#DC2626] mr-1"></i> Rekomendasi di Kec. ${cleanKec}`;
    }
    if (count) {
        count.textContent = `${list.length} Desa/Kelurahan`;
    }

    // Render panel list
    renderDesaListItems(list, inputDesa ? inputDesa.value : '');
}

function renderDesaListItems(list, query = '') {
    const panelList = document.getElementById('panelDesaList');
    if (!panelList) return;

    const qClean = (query || '').trim().toLowerCase();
    const filtered = qClean ? list.filter(d => d.toLowerCase().includes(qClean)) : list;
    const inputDesa = document.getElementById('regDesa');
    const curVal = inputDesa ? inputDesa.value.trim().toLowerCase() : '';

    if (filtered.length === 0) {
        panelList.innerHTML = `
            <div class="px-4 py-3 text-xs text-slate-500 text-center">
                Desa tidak ditemukan di rekomendasi kecamatan ini. Anda tetap dapat melanjutkan dengan nama yang diketik.
            </div>
        `;
        return;
    }

    panelList.innerHTML = filtered.map(d => {
        const isSelected = curVal && d.toLowerCase() === curVal;
        const isKelurahan = KELURAHAN_TRENGGALEK.includes(d);
        const iconClass = isKelurahan ? 'fa-landmark' : 'fa-house-chimney';
        const typeBadge = isKelurahan 
            ? `<span class="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded shrink-0">Kelurahan</span>` 
            : `<span class="text-[10px] font-medium text-slate-400 shrink-0">Desa</span>`;

        return `
            <div onclick="selectDesaOption('${d.replace(/'/g, "\\'")}')"
                class="px-3.5 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between cursor-pointer transition ${isSelected ? 'bg-red-50 text-[#DC2626] font-bold' : 'text-[#0F172A] hover:bg-slate-50 hover:text-[#DC2626]'}">
                <div class="flex items-center gap-2 truncate">
                    <i class="fa-solid ${iconClass} text-xs ${isSelected ? 'text-[#DC2626]' : 'text-slate-400'} shrink-0"></i>
                    <span class="truncate">${d}</span>
                    ${typeBadge}
                </div>
                ${isSelected ? '<i class="fa-solid fa-circle-check text-xs text-[#DC2626] shrink-0 ml-2"></i>' : ''}
            </div>
        `;
    }).join('');
}

function handleDesaInput(val) {
    const kecInput = document.getElementById('regKecamatan');
    const kecName = kecInput ? kecInput.value : 'Trenggalek';
    const list = getDesaListForKecamatan(kecName);

    renderDesaListItems(list, val);
    openDesaDropdown();

    const valClean = (val || '').trim().toLowerCase();
    const badge = document.getElementById('desaValidationBadge');
    const exactMatch = list.find(d => d.toLowerCase() === valClean);

    if (exactMatch) {
        if (badge) badge.classList.remove('hidden');
    } else {
        if (badge) badge.classList.add('hidden');
    }
}

function selectDesaOption(desaName) {
    const inputDesa = document.getElementById('regDesa');
    if (inputDesa) {
        inputDesa.value = desaName;
        inputDesa.dispatchEvent(new Event('change'));
    }

    const badge = document.getElementById('desaValidationBadge');
    if (badge) badge.classList.remove('hidden');

    closeDesaDropdown();
}

function openDesaDropdown() {
    const panel = document.getElementById('panelDesa');
    const chevron = document.getElementById('chevronDesa');
    if (panel) panel.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
}

function closeDesaDropdown() {
    const panel = document.getElementById('panelDesa');
    const chevron = document.getElementById('chevronDesa');
    if (panel) panel.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
}

function toggleDesaDropdown() {
    const panel = document.getElementById('panelDesa');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        const kecInput = document.getElementById('regKecamatan');
        const kecName = kecInput ? kecInput.value : 'Trenggalek';
        const list = getDesaListForKecamatan(kecName);
        const inputDesa = document.getElementById('regDesa');
        renderDesaListItems(list, inputDesa ? inputDesa.value : '');
        openDesaDropdown();
    } else {
        closeDesaDropdown();
    }
}

function toggleCustomSelect(type) {
    const config = CUSTOM_SELECTS[type];
    if (!config) return;
    const panel = document.getElementById(config.panelId);
    const chevron = document.getElementById(config.chevronId);
    if (!panel) return;

    // Tutup select lain yang terbuka
    Object.keys(CUSTOM_SELECTS).forEach(k => {
        if (k !== type) {
            const p = document.getElementById(CUSTOM_SELECTS[k].panelId);
            const c = document.getElementById(CUSTOM_SELECTS[k].chevronId);
            if (p) p.classList.add('hidden');
            if (c) c.classList.remove('rotate-180');
        }
    });

    const isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        if (chevron) chevron.classList.add('rotate-180');
        renderCustomSelectItems(type);
        if (config.searchId) {
            const sInput = document.getElementById(config.searchId);
            if (sInput) {
                sInput.value = '';
                setTimeout(() => sInput.focus(), 50);
            }
        }
    } else {
        panel.classList.add('hidden');
        if (chevron) chevron.classList.remove('rotate-180');
    }
}

function selectCustomOption(type, value, label) {
    const config = CUSTOM_SELECTS[type];
    if (!config) return;

    const input = document.getElementById(config.inputId);
    const labelEl = document.getElementById(config.labelId);
    const panel = document.getElementById(config.panelId);
    const chevron = document.getElementById(config.chevronId);

    if (input) {
        input.value = value;
        input.dispatchEvent(new Event('change'));
    }
    if (labelEl) labelEl.textContent = label;
    if (panel) panel.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');

    if (typeof config.onSelect === 'function') {
        config.onSelect(value);
    }
}

function renderCustomSelectItems(type, query = '') {
    const config = CUSTOM_SELECTS[type];
    if (!config) return;

    const listContainer = document.getElementById(`${config.panelId}List`);
    if (!listContainer) return;

    const currentValue = document.getElementById(config.inputId) ? document.getElementById(config.inputId).value : '';
    const qClean = query.trim().toLowerCase();

    const filtered = config.options.filter(opt =>
        opt.label.toLowerCase().includes(qClean) || (opt.desc && opt.desc.toLowerCase().includes(qClean))
    );

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="px-4 py-3 text-xs text-slate-400 text-center">
                Tidak ada pilihan yang cocok.
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(opt => {
        const isSelected = opt.value === currentValue;
        const iconHtml = (type === 'agama') ? '' : `<i class="fa-solid ${opt.icon || 'fa-location-dot'} text-xs ${isSelected ? 'text-[#DC2626]' : 'text-slate-400'} shrink-0"></i>`;
        return `
            <div onclick="selectCustomOption('${type}', '${opt.value}', '${opt.label.replace(/'/g, "\\'")}')"
                class="px-3.5 py-3 text-xs sm:text-sm font-semibold flex items-center justify-between cursor-pointer transition ${isSelected ? 'bg-red-50 text-[#DC2626] font-bold' : 'text-[#0F172A] hover:bg-slate-50 hover:text-[#DC2626]'}">
                <div class="flex items-center gap-2.5 min-w-0 truncate">
                    ${iconHtml}
                    <span class="truncate">${opt.label}</span>
                </div>
                ${isSelected ? '<i class="fa-solid fa-circle-check text-xs text-[#DC2626] shrink-0 ml-2"></i>' : ''}
            </div>
        `;
    }).join('');
}

// Tutup dropdown saat klik di luar
document.addEventListener('click', (e) => {
    Object.keys(CUSTOM_SELECTS).forEach(k => {
        const config = CUSTOM_SELECTS[k];
        const container = document.getElementById(`container_${config.inputId}`);
        if (container && !container.contains(e.target)) {
            const p = document.getElementById(config.panelId);
            const c = document.getElementById(config.chevronId);
            if (p) p.classList.add('hidden');
            if (c) c.classList.remove('rotate-180');
        }
    });

    // Tutup panel rekomendasi desa jika klik di luar
    const desaContainer = document.getElementById('container_regDesa');
    if (desaContainer && !desaContainer.contains(e.target)) {
        if (typeof closeDesaDropdown === 'function') {
            closeDesaDropdown();
        }
    }
});

function validateWaInline() {
    const waInput = document.getElementById('regWhatsapp');
    const errEl = document.getElementById('waErrorMsg');
    if (!waInput || !errEl) return true;

    const digits = waInput.value.replace(/\D/g, '');
    if (waInput.value.length > 0 && digits.length < 10) {
        errEl.classList.remove('hidden');
        return false;
    } else {
        errEl.classList.add('hidden');
        return true;
    }
}

async function handleAthleteRegistration(e) {
    e.preventDefault();
    if (!validateWaInline()) {
        document.getElementById('regWhatsapp').focus();
        return;
    }

    // 1. Akun Anggota
    const username = document.getElementById('regUsername') ? document.getElementById('regUsername').value.trim() : '';
    const password = document.getElementById('regPassword') ? document.getElementById('regPassword').value : '';
    const password2 = document.getElementById('regPassword2') ? document.getElementById('regPassword2').value : '';

    if (password && password2 && password !== password2) {
        showToast('Validasi Gagal', 'Konfirmasi password tidak cocok.');
        document.getElementById('regPassword2').focus();
        return;
    }

    // 2. Data Pribadi
    const fullName = document.getElementById('regFullName').value.trim();
    const statusPekerjaan = document.getElementById('regStatusPekerjaan') ? document.getElementById('regStatusPekerjaan').value : 'PELAJAR';
    
    let jenjang = '';
    let institution = '';
    if (statusPekerjaan === 'PELAJAR') {
        jenjang = document.getElementById('regJenjang') ? document.getElementById('regJenjang').value : 'SMP';
        institution = document.getElementById('regInstitution') ? document.getElementById('regInstitution').value.trim() : '';
    } else {
        const profesi = document.getElementById('regProfesi') ? document.getElementById('regProfesi').value : 'Umum';
        const tempatKerja = document.getElementById('regTempatKerja') ? document.getElementById('regTempatKerja').value.trim() : '';
        institution = `${profesi} - ${tempatKerja || 'Trenggalek'}`;
    }

    const agama = document.getElementById('regAgama') ? document.getElementById('regAgama').value : '';
    const tempatLahir = document.getElementById('regTempatLahir') ? document.getElementById('regTempatLahir').value.trim() : '';
    const tgl = document.getElementById('regTglLahir') ? String(document.getElementById('regTglLahir').value).padStart(2, '0') : '';
    const bln = document.getElementById('regBlnLahir') ? String(document.getElementById('regBlnLahir').value).padStart(2, '0') : '';
    const thn = document.getElementById('regThnLahir') ? String(document.getElementById('regThnLahir').value).trim() : '';
    const tanggalLahir = (tgl && bln && thn && tgl !== '00' && bln !== '00') ? `${tgl}-${bln}-${thn}` : '';
    
    const genderEl = document.querySelector('input[name="regGender"]:checked');
    const jenisKelamin = genderEl ? genderEl.value : 'Laki-laki';

    // 3. Kontak & Domisili
    const alamat = document.getElementById('regAlamat') ? document.getElementById('regAlamat').value.trim() : '';
    const rt = document.getElementById('regRt') ? document.getElementById('regRt').value.trim() : '';
    const rw = document.getElementById('regRw') ? document.getElementById('regRw').value.trim() : '';
    const kodepos = document.getElementById('regKodepos') ? document.getElementById('regKodepos').value.trim() : '';
    const desa = document.getElementById('regDesa') ? document.getElementById('regDesa').value.trim() : '';
    const kecamatan = document.getElementById('regKecamatan') ? document.getElementById('regKecamatan').value : 'Trenggalek';
    const whatsapp = document.getElementById('regWhatsapp').value.trim();
    const email = document.getElementById('regEmail') ? document.getElementById('regEmail').value.trim() : '';

    // 4. Game Profile
    const nickname = document.getElementById('regNickname').value.trim();
    const gameId = document.getElementById('regGameId').value.trim();
    const division = document.getElementById('regDivision').value;
    const teamInput = document.getElementById('regTeam') ? document.getElementById('regTeam').value.trim() : '';
    const teamName = teamInput !== '' ? teamInput : 'Individu / Non-Tim';

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...';
    }

    try {
        const payload = {
            username,
            password,
            password_hash: password,
            fullName,
            statusPekerjaan,
            jenjang,
            institution,
            agama,
            tempatLahir,
            tanggalLahir,
            jenisKelamin,
            alamat,
            rt,
            rw,
            kodepos,
            desa,
            kecamatan,
            kabupaten: 'Kabupaten Trenggalek',
            provinsi: 'Jawa Timur',
            whatsapp,
            email,
            nickname,
            gameId,
            division,
            teamName
        };

        const created = await Api.createAthlete(payload);

        // Refresh state
        athletes = await Api.getAthletes();

        // Otomatis aktifkan sesi login member yang baru mendaftar
        loggedMember = created;
        localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(created));
        updateHeaderMemberBadge();

        // Tampilkan Ringkasan & Konfirmasi Sukses
        const regNo = getAthleteRegNo(created);
        document.getElementById('regFormCard').classList.add('hidden');
        document.getElementById('regSuccessCard').classList.remove('hidden');

        document.getElementById('regSummaryBox').innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2 border-b border-[#E2E8F0]">
                <div><span class="text-slate-400 block text-[10px]">NO. REGISTRASI:</span><span class="font-extrabold text-[#DC2626] font-mono">${regNo}</span></div>
                <div><span class="text-slate-400 block text-[10px]">USERNAME AKUN:</span><span class="font-bold text-[#0F172A]">${username || '-'}</span></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2 border-b border-[#E2E8F0]">
                <div><span class="text-slate-400 block text-[10px]">NAMA LENGKAP:</span><span class="font-bold text-[#0F172A]">${fullName}</span></div>
                <div><span class="text-slate-400 block text-[10px]">NICKNAME / ID:</span><span class="font-bold text-[#0F172A]">${nickname} (${gameId})</span></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2 border-b border-[#E2E8F0]">
                <div><span class="text-slate-400 block text-[10px]">DIVISI & TIM:</span><span class="font-bold text-[#DC2626]">${division} • ${teamName}</span></div>
                <div><span class="text-slate-400 block text-[10px]">DOMISILI:</span><span class="font-bold text-[#0F172A]">Kec. ${kecamatan}, Trenggalek</span></div>
            </div>
            <div class="pt-2">
                <div><span class="text-slate-400 block text-[10px]">STATUS / INSTANSI:</span><span class="font-bold text-[#0F172A]">${institution}</span></div>
            </div>
        `;

        const waMessage = `Halo Admin ESI Trenggalek, saya baru saja mendaftar sebagai anggota resmi ESI Trenggalek:\n- No. Registrasi: ${regNo}\n- Nama: ${fullName}\n- Nickname: ${nickname} (${gameId})\n- Divisi: ${division}\n- Asal: ${institution}\n- Domisili: Kec. ${kecamatan}, Trenggalek\nMohon validasi pendaftaran saya. Terima kasih!`;
        document.getElementById('waConfirmLink').href = `https://wa.me/6287840800351?text=${encodeURIComponent(waMessage)}`;

        showToast('Pendaftaran Berhasil', 'Data anggota Anda telah tersimpan dan masuk antrean verifikasi.');
    } catch (err) {
        console.error('Registrasi gagal:', err);
        showToast('Pendaftaran Gagal', 'Terjadi kesalahan sistem, silakan coba lagi.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-user-check me-2"></i> Simpan Pendaftaran Anggota';
        }
    }
}

function resetRegForm() {
    document.getElementById('athleteRegForm').reset();
    document.getElementById('regSuccessCard').classList.add('hidden');
    document.getElementById('regFormCard').classList.remove('hidden');
    selectCustomOption('kecamatan', 'Trenggalek', 'Trenggalek (Kota)');
    selectCustomOption('division', 'MLBB', 'Mobile Legends: Bang Bang (MLBB)');
    selectCustomOption('agama', 'Islam', 'Islam');
}

// ==================== 3. CEK DATA ATLET ====================
function setPublicDivFilter(divName) {
    publicDivFilter = divName;
    const select = document.getElementById('publicDivChips');
    if (select && select.value !== divName) select.value = divName;
    renderPublicAthletes();
}

function renderPublicAthletes() {
    const searchEl = document.getElementById('publicAthleteSearch');
    const statusEl = document.getElementById('publicStatusFilter');
    const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    const statusFilter = statusEl ? statusEl.value : 'all';

    const filtered = athletes.filter(a => {
        const matchStatus = statusFilter === 'all' ? true : a.status === statusFilter;
        const matchDiv = publicDivFilter === 'Semua' ? true : a.division === publicDivFilter;
        const regNo = getAthleteRegNo(a).toLowerCase();
        const matchQuery = !query ||
            (a.fullName && a.fullName.toLowerCase().includes(query)) ||
            (a.nickname && a.nickname.toLowerCase().includes(query)) ||
            (a.gameId && a.gameId.toLowerCase().includes(query)) ||
            (a.teamName && a.teamName.toLowerCase().includes(query)) ||
            (a.institution && a.institution.toLowerCase().includes(query)) ||
            regNo.includes(query);
        return matchStatus && matchDiv && matchQuery;
    });

    const countEl = document.getElementById('publicAthleteCount');
    if (countEl) countEl.textContent = `Menampilkan ${filtered.length} data atlet`;

    const tableWrapper = document.getElementById('publicTableWrapper');
    const tableBody = document.getElementById('publicAthleteTableBody');
    const cardList = document.getElementById('publicAthleteCardList');
    const emptyState = document.getElementById('publicAthleteEmpty');

    if (filtered.length === 0) {
        if (tableWrapper) tableWrapper.classList.add('md:hidden');
        if (cardList) cardList.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (tableWrapper) tableWrapper.classList.remove('md:hidden');
    if (cardList) cardList.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    // Desktop Table
    if (tableBody) {
        tableBody.innerHTML = filtered.map((a, idx) => {
            const badge = a.status === 'verified'
                ? `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-[#DCFCE7] text-[#166534]">Verified</span>`
                : `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#92400E]">Pending</span>`;
            const regNo = getAthleteRegNo(a);

            return `
                <tr class="hover:bg-[#F4F6F9] transition">
                    <td class="px-5 py-3.5 text-slate-500 font-semibold">${idx + 1}</td>
                    <td class="px-5 py-3.5">
                        <div class="font-bold text-[#0F172A]">${a.nickname}</div>
                        <div class="text-xs text-slate-500">${a.fullName} • <span class="font-mono text-amber-700 font-bold">${regNo}</span></div>
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="px-2.5 py-1 rounded bg-slate-100 text-[#0F172A] text-xs font-bold">${a.division}</span>
                    </td>
                    <td class="px-5 py-3.5">
                        <div class="font-semibold text-[#0F172A]">${a.teamName}</div>
                        <div class="text-xs text-slate-500">${a.institution}</div>
                    </td>
                    <td class="px-5 py-3.5">${badge}</td>
                </tr>
            `;
        }).join('');
    }

    // Mobile Card List
    if (cardList) {
        cardList.innerHTML = filtered.map(a => {
            const badge = a.status === 'verified'
                ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#DCFCE7] text-[#166534]">Verified</span>`
                : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FEF3C7] text-[#92400E]">Pending</span>`;
            const regNo = getAthleteRegNo(a);

            return `
                <div class="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2.5">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <h3 class="font-extrabold text-base text-[#0F172A]">${a.nickname}</h3>
                            <p class="text-xs text-slate-500">${a.fullName}</p>
                            <span class="inline-block mt-1 text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">${regNo}</span>
                        </div>
                        ${badge}
                    </div>
                    <div class="grid grid-cols-2 gap-2 pt-2 border-t border-[#E2E8F0] text-xs">
                        <div>
                            <span class="text-slate-400 block">Divisi</span>
                            <span class="font-bold text-[#0F172A]">${a.division}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block">Tim / Instansi</span>
                            <span class="font-bold text-[#0F172A]">${a.teamName}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// ==================== 4. JADWAL EVENT ====================
function setEventStatusFilter(status) {
    eventStatusFilter = status;
    document.querySelectorAll('.ev-status-tab').forEach(btn => {
        const isActive = btn.dataset.status === status;
        if (isActive) {
            btn.className = 'ev-status-tab px-4 py-2 rounded-xl text-xs font-black bg-[#DC2626] text-white shadow-sm transition';
        } else {
            btn.className = 'ev-status-tab px-4 py-2 rounded-xl text-xs font-black bg-slate-800 text-slate-300 border border-slate-700 hover:text-slate-200 transition';
        }
    });
    renderEventsView();
}

function renderEventsView() {
    const filtered = events.filter(ev => eventStatusFilter === 'Semua' ? true : ev.status === eventStatusFilter);
    const container = document.getElementById('eventGridContainer');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-3 bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-slate-500">Tidak ada jadwal event untuk kategori status ini.</div>`;
        return;
    }

    container.innerHTML = filtered.map(ev => {
        let statusBadge = '';
        if (ev.status === 'Upcoming') statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#92400E]">Upcoming</span>`;
        else if (ev.status === 'Ongoing') statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-[#DCFCE7] text-[#166534]">Ongoing</span>`;
        else statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">Selesai</span>`;

        const eventUrl = getEventUrl(ev.id);

        return `
            <div class="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-slate-300 transition">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-3">
                        <span class="px-2.5 py-1 rounded bg-[#0F172A] text-white text-[11px] font-bold">${ev.division}</span>
                        ${statusBadge}
                    </div>
                    <h3 class="font-extrabold text-lg text-[#0F172A] leading-snug mb-3">${ev.title}</h3>
                    <div class="space-y-1.5 text-xs text-slate-600 mb-4">
                        <p><i class="fa-regular fa-calendar w-5 text-[#DC2626]"></i> <strong>Tanggal:</strong> ${ev.date}</p>
                        <p><i class="fa-solid fa-location-dot w-5 text-[#D97706]"></i> <strong>Lokasi:</strong> ${ev.location}</p>
                    </div>
                    <p class="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">${ev.description}</p>
                </div>
                <div class="flex flex-col gap-2 mt-auto">
                    <button onclick="openEventDetail('${ev.id}')"
                        class="w-full py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider bg-[#0F172A] hover:bg-slate-700 text-white transition flex items-center justify-center gap-2">
                        <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Lihat Detail & Bagikan
                    </button>
                    ${ev.status !== 'Selesai'
                        ? `<button onclick="openEventRegistration('${ev.id}')" class="w-full py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider bg-[#DC2626] hover:bg-[#B91C1C] text-white transition flex items-center justify-center gap-2"><i class="fa-solid fa-users text-xs"></i> Daftar Tim</button>`
                        : `<button disabled class="w-full py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider bg-slate-100 text-slate-400 cursor-not-allowed">Event Telah Selesai</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// ==================== 5. KLASEMEN ATLET (PRO ZERO-ANIMATION LEADERBOARD) ====================
function setKlasemenDivision(divName) {
    klasemenSelectedDiv = divName || 'all';
    const select = document.getElementById('klasemenDivTabs');
    if (select && select.value !== klasemenSelectedDiv) select.value = klasemenSelectedDiv;
    renderKlasemenView();
}

function filterKlasemenSearch(query) {
    klasemenSearchQuery = (query || '').toLowerCase().trim();
    renderKlasemenView();
}

function renderKlasemenView() {
    const verifiedAthletes = (Array.isArray(athletes) ? athletes : [])
        .filter(a => a.status === 'verified');

    // 1. Update 3 Header Counters (Statis, Bebas Animasi)
    const totalAthletesEl = document.getElementById('klasemenStatTotalAthletes');
    const totalDivsEl = document.getElementById('klasemenStatTotalDivisions');
    const maxPointsEl = document.getElementById('klasemenStatMaxPoints');

    const uniqueDivs = new Set(verifiedAthletes.map(a => a.division).filter(Boolean));
    const highestPoints = verifiedAthletes.length > 0 ? Math.max(...verifiedAthletes.map(a => Number(a.points) || 0)) : 0;

    if (totalAthletesEl) totalAthletesEl.textContent = verifiedAthletes.length;
    if (totalDivsEl) totalDivsEl.textContent = uniqueDivs.size;
    if (maxPointsEl) maxPointsEl.textContent = highestPoints.toLocaleString('id-ID');

    // 2. Render Quick Pills (Semua Divisi + 5 Game Terpopuler)
    const quickPillsContainer = document.getElementById('klasemenQuickPills');
    if (quickPillsContainer) {
        const popularPills = [
            { id: 'all', label: 'Semua Divisi' },
            { id: 'MLBB', label: 'Mobile Legends' },
            { id: 'Free Fire', label: 'Free Fire' },
            { id: 'eFootball', label: 'eFootball' },
            { id: 'PUBG Mobile', label: 'PUBG Mobile' },
            { id: 'Honor of Kings', label: 'Honor of Kings' }
        ];

        quickPillsContainer.innerHTML = popularPills.map(p => {
            const isActive = klasemenSelectedDiv === p.id;
            const activeClass = "bg-[#0F172A] text-white border-[#0F172A]";
            const inactiveClass = "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200";
            return `
                <button type="button" onclick="setKlasemenDivision('${p.id}')"
                    class="px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-colors ${isActive ? activeClass : inactiveClass}">
                    ${p.label}
                </button>
            `;
        }).join('');
    }

    // 3. Filter Data Atlet
    const filtered = verifiedAthletes.filter(a => {
        if (klasemenSelectedDiv !== 'all' && a.division !== klasemenSelectedDiv) {
            return false;
        }
        if (klasemenSearchQuery) {
            const matchNick = (a.nickname || '').toLowerCase().includes(klasemenSearchQuery);
            const matchName = (a.fullName || '').toLowerCase().includes(klasemenSearchQuery);
            const matchTeam = (a.teamName || '').toLowerCase().includes(klasemenSearchQuery);
            const matchDiv = (a.division || '').toLowerCase().includes(klasemenSearchQuery);
            if (!matchNick && !matchName && !matchTeam && !matchDiv) return false;
        }
        return true;
    }).sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));

    // Update Badge Count
    const countBadge = document.getElementById('klasemenCountBadge');
    if (countBadge) countBadge.textContent = `${filtered.length} Atlet Terdaftar`;

    // 4. Render Top 3 Podium Showcase (Statis, Bersih, Bergaya Emas/Perak/Perunggu)
    const podiumContainer = document.getElementById('klasemenPodiumContainer');
    if (podiumContainer) {
        if (filtered.length >= 1 && !klasemenSearchQuery) {
            const top1 = filtered[0];
            const top2 = filtered.length > 1 ? filtered[1] : null;
            const top3 = filtered.length > 2 ? filtered[2] : null;

            podiumContainer.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <!-- JUARA 2 (PERAK) -->
                    ${top2 ? `
                    <div class="bg-white border-2 border-slate-300 rounded-2xl p-5 flex flex-col justify-between shadow-2xs md:order-1">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-3">
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-800 border border-slate-300">
                                    🥈 Peringkat #2
                                </span>
                                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#0F172A] text-white uppercase">
                                    ${top2.division}
                                </span>
                            </div>
                            <div class="flex items-center gap-3.5 mb-2">
                                <div class="w-12 h-12 rounded-2xl bg-slate-200 text-slate-800 font-black text-base flex items-center justify-center shrink-0 border border-slate-300 shadow-inner">
                                    ${(top2.nickname || 'AT').substring(0, 2).toUpperCase()}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-lg font-black text-[#0F172A] truncate leading-tight">${top2.nickname}</h4>
                                    <p class="text-xs text-slate-500 truncate">${top2.fullName}</p>
                                </div>
                            </div>
                            <p class="text-xs font-semibold text-slate-600 truncate flex items-center gap-1.5 mt-2">
                                <i class="fa-solid fa-shield-halved text-slate-400 text-xs"></i>
                                <span>${top2.teamName || 'Individu'}</span>
                            </p>
                        </div>
                        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span class="text-xs text-slate-400 font-bold uppercase">Akumulasi Poin</span>
                            <span class="text-xl font-black text-slate-700">${Number(top2.points).toLocaleString('id-ID')} <span class="text-xs font-bold text-slate-400">PTS</span></span>
                        </div>
                    </div>` : '<div class="hidden md:block md:order-1"></div>'}

                    <!-- JUARA 1 (EMAS - HIGHLIGHT) -->
                    <div class="bg-gradient-to-b from-amber-50/80 to-white border-2 border-amber-400 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-sm md:order-2">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-3">
                                <span class="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 shadow-2xs">
                                    👑 Juara 1 Nasional / Daerah
                                </span>
                                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#DC2626] text-white uppercase">
                                    ${top1.division}
                                </span>
                            </div>
                            <div class="flex items-center gap-4 mb-2">
                                <div class="w-14 h-14 rounded-2xl bg-amber-400 text-amber-950 font-black text-xl flex items-center justify-center shrink-0 border-2 border-amber-300 shadow-sm">
                                    ${(top1.nickname || 'AT').substring(0, 2).toUpperCase()}
                                </div>
                                <div class="min-w-0">
                                    <div class="text-[10px] font-black uppercase tracking-wider text-amber-700">Puncak Klasemen</div>
                                    <h4 class="text-xl sm:text-2xl font-black text-[#0F172A] truncate leading-tight">${top1.nickname}</h4>
                                    <p class="text-xs text-slate-600 truncate font-medium">${top1.fullName}</p>
                                </div>
                            </div>
                            <p class="text-xs font-bold text-slate-700 truncate flex items-center gap-1.5 mt-2">
                                <i class="fa-solid fa-school text-[#DC2626] text-xs"></i>
                                <span>${top1.teamName || top1.institution || 'Individu'} • Kec. ${top1.kecamatan || 'Trenggalek'}</span>
                            </p>
                        </div>
                        <div class="mt-4 pt-3.5 border-t border-amber-200/80 flex items-center justify-between bg-amber-100/50 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-4 rounded-b-2xl">
                            <span class="text-xs font-extrabold text-amber-900 uppercase tracking-wider">Total Skor Resmi</span>
                            <span class="text-2xl font-black text-amber-900">${Number(top1.points).toLocaleString('id-ID')} <span class="text-xs font-bold text-amber-700">POIN</span></span>
                        </div>
                    </div>

                    <!-- JUARA 3 (PERUNGGU) -->
                    ${top3 ? `
                    <div class="bg-white border-2 border-orange-200 rounded-2xl p-5 flex flex-col justify-between shadow-2xs md:order-3">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-3">
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-900 border border-orange-200">
                                    🥉 Peringkat #3
                                </span>
                                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#0F172A] text-white uppercase">
                                    ${top3.division}
                                </span>
                            </div>
                            <div class="flex items-center gap-3.5 mb-2">
                                <div class="w-12 h-12 rounded-2xl bg-orange-100 text-orange-950 font-black text-base flex items-center justify-center shrink-0 border border-orange-200 shadow-inner">
                                    ${(top3.nickname || 'AT').substring(0, 2).toUpperCase()}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-lg font-black text-[#0F172A] truncate leading-tight">${top3.nickname}</h4>
                                    <p class="text-xs text-slate-500 truncate">${top3.fullName}</p>
                                </div>
                            </div>
                            <p class="text-xs font-semibold text-slate-600 truncate flex items-center gap-1.5 mt-2">
                                <i class="fa-solid fa-shield-halved text-slate-400 text-xs"></i>
                                <span>${top3.teamName || 'Individu'}</span>
                            </p>
                        </div>
                        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span class="text-xs text-slate-400 font-bold uppercase">Akumulasi Poin</span>
                            <span class="text-xl font-black text-slate-700">${Number(top3.points).toLocaleString('id-ID')} <span class="text-xs font-bold text-slate-400">PTS</span></span>
                        </div>
                    </div>` : '<div class="hidden md:block md:order-3"></div>'}
                </div>
            `;
            podiumContainer.classList.remove('hidden');
        } else {
            podiumContainer.innerHTML = '';
            podiumContainer.classList.add('hidden');
        }
    }

    // 5. Render Tabel Klasemen Lengkap (Clean Pro Table)
    const tbody = document.getElementById('klasemenTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-10 text-center text-slate-400 text-xs italic">
                    <i class="fa-solid fa-trophy text-3xl mb-2 text-slate-300 block"></i>
                    Belum ada atlet terverifikasi yang cocok dengan kriteria filter klasemen saat ini.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map((player, index) => {
        const rank = index + 1;

        let rankBadge = '';
        if (rank === 1) {
            rankBadge = '<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-400 text-amber-950 font-black text-xs shadow-2xs">#1</span>';
        } else if (rank === 2) {
            rankBadge = '<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-200 text-slate-800 font-black text-xs">#2</span>';
        } else if (rank === 3) {
            rankBadge = '<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-orange-200 text-orange-950 font-black text-xs">#3</span>';
        } else {
            rankBadge = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-extrabold text-xs">#${rank}</span>`;
        }

        const initials = (player.nickname || player.fullName || 'AT').substring(0, 2).toUpperCase();
        const regNo = typeof getAthleteRegNo === 'function' ? getAthleteRegNo(player) : (player.regNumber || 'ESI-TRG');

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-3.5 text-center whitespace-nowrap">
                    ${rankBadge}
                </td>
                <td class="p-3.5">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                            ${initials}
                        </div>
                        <div class="min-w-0">
                            <div class="font-extrabold text-sm text-[#0F172A] truncate flex items-center gap-1.5">
                                <span>${player.nickname}</span>
                                ${rank <= 3 ? '<i class="fa-solid fa-medal text-amber-500 text-xs"></i>' : ''}
                            </div>
                            <div class="text-[11px] text-slate-500 truncate">
                                ${player.fullName}
                                <span class="text-slate-300 font-mono">&bull;</span>
                                <span class="font-mono text-[10px] text-slate-400">${regNo}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="p-3.5 whitespace-nowrap">
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 font-bold text-[11px]">
                        <i class="fa-solid fa-gamepad text-slate-500 text-[10px]"></i>
                        <span>${player.division}</span>
                    </span>
                </td>
                <td class="p-3.5">
                    <div class="font-bold text-slate-800 text-xs truncate">${player.teamName || player.institution || 'Individu'}</div>
                    <div class="text-[11px] text-slate-500 truncate">Kec. ${player.kecamatan || 'Trenggalek'}</div>
                </td>
                <td class="p-3.5 text-right whitespace-nowrap">
                    <span class="font-black text-sm sm:text-base ${rank === 1 ? 'text-amber-600' : 'text-[#0F172A]'}">
                        ${Number(player.points || 0).toLocaleString('id-ID')}
                    </span>
                    <span class="text-[10px] font-bold text-slate-400 ml-0.5">PTS</span>
                </td>
                <td class="p-3.5 text-center whitespace-nowrap">
                    <button type="button" onclick="showAthleteDetail('${player.id}')"
                        class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-[#0F172A] text-slate-700 hover:text-white font-bold text-[11px] transition-colors inline-flex items-center gap-1">
                        <i class="fa-solid fa-id-card text-[10px]"></i>
                        <span>KTA</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}


// ==================== 6. BERITA & ARTIKEL ====================
function setNewsCategory(cat) {
    newsCatFilter = cat;
    document.querySelectorAll('.news-cat-tab').forEach(btn => {
        if (btn.dataset.cat === cat) {
            btn.className = "news-cat-tab px-3.5 py-2 rounded-lg text-xs font-bold bg-[#0F172A] text-white";
        } else {
            btn.className = "news-cat-tab px-3.5 py-2 rounded-lg text-xs font-bold bg-white text-slate-700 border border-[#E2E8F0]";
        }
    });
    renderNewsView();
}

function renderNewsView() {
    const sortedNews = [...(Array.isArray(news) ? news : [])].sort((a, b) => getNewsTimestamp(b) - getNewsTimestamp(a));
    const filtered = sortedNews.filter(n => newsCatFilter === 'Semua' ? true : n.category === newsCatFilter);
    const container = document.getElementById('newsGridContainer');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-3 bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-sm text-slate-500">Belum ada berita dalam kategori ini.</div>`;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const imgThumb = item.imageUrl
            ? `<div class="h-48 -mx-6 -mt-6 mb-4 overflow-hidden rounded-t-xl bg-slate-100 border-b border-slate-100 cursor-pointer" onclick="openNewsArticle(${item.id})">
                <img src="${item.imageUrl}" alt="${item.title}" loading="lazy" decoding="async" class="w-full h-full object-cover hover:scale-105 transition duration-300">
            </div>`
            : '';

        return `
        <article class="bg-white border border-[#E2E8F0] rounded-xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition">
            <div>
                ${imgThumb}
                <div class="flex items-center justify-between gap-2 mb-3">
                    <span class="px-2.5 py-0.5 rounded bg-red-50 text-[#DC2626] text-[11px] font-bold uppercase tracking-wider">${item.category}</span>
                    <span class="text-xs text-slate-400">${item.date}</span>
                </div>
                <h3 class="font-extrabold text-lg text-[#0F172A] leading-snug mb-2.5 cursor-pointer hover:text-[#DC2626] transition" onclick="openNewsArticle(${item.id})">${item.title}</h3>
                <p class="text-xs sm:text-sm text-slate-600 leading-relaxed mb-5">${item.excerpt}</p>
            </div>
            <button onclick="openNewsArticle(${item.id})" class="self-start text-xs font-bold uppercase tracking-wider text-[#DC2626] hover:text-[#B91C1C] flex items-center gap-1.5 transition">
                <span>Baca Artikel Lengkap</span>
                <i class="fa-solid fa-arrow-right"></i>
            </button>
        </article>
    `;
    }).join('');
}

// Format Isi Artikel Berita Jurnalistik (Dukungan Paragraf, Bold, Kutipan Tokoh, List Angka, & Penempatan Gambar)
function formatNewsContent(raw, article) {
    if (!raw) return '';

    // 1. Gambar format [gambar: URL_OR_KEY | Keterangan | align] atau [gambar: URL_OR_KEY | Keterangan] atau ![Keterangan](URL)
    let processed = String(raw).replace(/\n/g, '\n').replace(/\r/g, '\n')
        .replace(/\[gambar:\s*([^\|\]]+)\s*\|\s*([^\|\]]+)(?:\s*\|\s*([^\]]+))?\]/gi, (match, urlOrKey, caption, align) => {
            let cleanUrl = urlOrKey.trim();
            const cleanCaption = caption.trim();
            const cleanAlign = (align || 'center').trim().toLowerCase();

            if (article && article.inlineImages && article.inlineImages[cleanUrl]) {
                cleanUrl = article.inlineImages[cleanUrl];
            } else if (typeof currentDraftInlineImages !== 'undefined' && currentDraftInlineImages[cleanUrl]) {
                cleanUrl = currentDraftInlineImages[cleanUrl];
            }

            let figureClass = 'my-6 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm';
            if (cleanAlign === 'left') {
                figureClass = 'my-4 sm:mr-6 sm:float-left sm:max-w-sm rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm';
            } else if (cleanAlign === 'right') {
                figureClass = 'my-4 sm:ml-6 sm:float-right sm:max-w-sm rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm';
            }

            return `\n\n<figure class="${figureClass}"><img src="${cleanUrl}" alt="${cleanCaption}" loading="lazy" onerror="this.onerror=null;this.src='assets/images/logo-esi.png'" class="w-full max-h-96 object-cover"><figcaption class="py-2.5 px-4 text-center text-xs text-slate-500 italic bg-white border-t border-slate-100 font-medium"><i class="fa-regular fa-image mr-1 text-[#DC2626]"></i> ${cleanCaption}</figcaption></figure>\n\n`;
        })
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/gi, (match, caption, url) => {
            return `\n\n<figure class="my-6 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm"><img src="${url.trim()}" alt="${caption.trim()}" loading="lazy" class="w-full max-h-96 object-cover">${caption ? `<figcaption class="py-2.5 px-4 text-center text-xs text-slate-500 italic bg-white border-t border-slate-100 font-medium"><i class="fa-regular fa-image mr-1 text-[#DC2626]"></i> ${caption.trim()}</figcaption>` : ''}</figure>\n\n`;
        });

    // 2. Teks tebal **text**, teks miring *text*, dan link [text](url)
    processed = processed
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/gi, '<a href="$2" target="_blank" rel="noopener" class="text-[#DC2626] font-semibold underline hover:text-[#B91C1C] transition">$1 <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i></a>');

    // 3. Line-by-line Block Parser: Memastikan semua tipe blok teridentifikasi secara eksplisit
    const lines = processed.split('\n');
    const blocks = [];
    let currentBlock = [];
    let currentType = null; // 'quote', 'heading', 'numbered', 'bullet', 'para', 'figure'

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            if (currentBlock.length > 0) {
                blocks.push({ type: currentType, content: currentBlock.join('\n') });
                currentBlock = [];
                currentType = null;
            }
            continue;
        }

        const isFigure = trimmed.startsWith('<figure');
        const isQuote = /^(?:>|&gt;)\s*/.test(trimmed);
        const isHeading = /^#{1,4}\s+/.test(trimmed);
        const isNumbered = /^\d+\.\s/.test(trimmed);
        const isBullet = /^[•\-\*]\s+/.test(trimmed);

        if (isFigure) {
            if (currentBlock.length > 0) {
                blocks.push({ type: currentType, content: currentBlock.join('\n') });
                currentBlock = [];
                currentType = null;
            }
            blocks.push({ type: 'figure', content: trimmed });
            continue;
        }

        if (isHeading) {
            if (currentBlock.length > 0) {
                blocks.push({ type: currentType, content: currentBlock.join('\n') });
                currentBlock = [];
            }
            blocks.push({ type: 'heading', content: trimmed.replace(/^#{1,4}\s+/, '') });
            currentType = null;
            continue;
        }

        if (isQuote) {
            if (currentType !== 'quote' && currentBlock.length > 0) {
                blocks.push({ type: currentType, content: currentBlock.join('\n') });
                currentBlock = [];
            }
            currentType = 'quote';
            currentBlock.push(trimmed.replace(/^(?:>|&gt;)\s*/, ''));
            continue;
        }

        if (isNumbered) {
            if (currentType !== 'numbered' && currentBlock.length > 0) {
                blocks.push({ type: currentType, content: currentBlock.join('\n') });
                currentBlock = [];
            }
            currentType = 'numbered';
            currentBlock.push(trimmed);
            continue;
        }

        if (isBullet) {
            if (currentType !== 'bullet' && currentBlock.length > 0) {
                blocks.push({ type: currentType, content: currentBlock.join('\n') });
                currentBlock = [];
            }
            currentType = 'bullet';
            currentBlock.push(trimmed.replace(/^[•\-\*]\s+/, ''));
            continue;
        }

        // Paragraf biasa (TIDAK ADA LAGI tebakan arbitrary berbasis panjang kata)
        if (currentType !== 'para' && currentBlock.length > 0) {
            blocks.push({ type: currentType, content: currentBlock.join('\n') });
            currentBlock = [];
            currentType = null;
        }
        currentType = 'para';
        currentBlock.push(trimmed);
    }

    if (currentBlock.length > 0) {
        blocks.push({ type: currentType, content: currentBlock.join('\n') });
    }

    // 4. Render ke HTML
    return blocks.map(b => {
        if (b.type === 'figure') return b.content;

        // A. Sub-Judul Resmi (Hanya jika ditulis dengan ### atau tombol Sub-Judul)
        if (b.type === 'heading') {
            return `
                <h3 class="text-base sm:text-lg font-extrabold text-[#0F172A] pt-4 pb-1 border-b border-slate-100 flex items-center gap-2">
                    <span class="w-1.5 h-4 bg-[#DC2626] rounded-full inline-block"></span>
                    <span>${b.content}</span>
                </h3>
            `;
        }

        // B. Blok Kutipan / Blockquote (> teks)
        if (b.type === 'quote') {
            let quoteText = b.content.replace(/^["“]|["”]$/g, '').trim();
            quoteText = quoteText.replace(/\n/g, '<br>');
            return `
                <blockquote class="my-5 pl-5 border-l-4 border-[#DC2626] bg-slate-50 rounded-r-xl py-3 pr-4 text-slate-700 text-sm sm:text-base leading-relaxed italic">
                    ${quoteText}
                </blockquote>
            `;
        }

        // C. Blok Daftar Poin Bernomor (1. ... 2. ...)
        if (b.type === 'numbered') {
            const items = b.content.split('\n');
            const listHtml = items.map(item => {
                const m = item.match(/^(\d+)\.\s*(.*)/s);
                if (!m) return `<p class="leading-relaxed text-slate-700">${item}</p>`;
                const num = m[1];
                const txt = m[2].trim();
                return `
                    <div class="flex items-start gap-3 p-3 sm:p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 my-2">
                        <span class="w-6 h-6 rounded-lg bg-[#DC2626] text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 shadow-xs">${num}</span>
                        <div class="text-sm sm:text-base text-slate-700 font-medium leading-relaxed">${txt}</div>
                    </div>
                `;
            }).join('');
            return `<div class="space-y-1 my-4">${listHtml}</div>`;
        }

        // D. Blok Daftar Poin Bulat (• atau - atau *)
        if (b.type === 'bullet') {
            const items = b.content.split('\n');
            const listHtml = items.map(item => `
                <div class="flex items-start gap-2.5 text-sm sm:text-base text-slate-700 leading-relaxed">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#DC2626] mt-2 shrink-0"></span>
                    <span>${item}</span>
                </div>
            `).join('');
            return `<div class="space-y-1.5 my-3 pl-2">${listHtml}</div>`;
        }

        // E. Paragraf Standar Berita
        const text = b.content;
        const withBreaks = text.replace(/\n/g, '<br>');
        const styledLead = withBreaks.replace(/^([A-Z\s,–—]+[–—])\s*/, '<strong>$1</strong> ');
        return `<p class="leading-relaxed md:leading-loose text-slate-700 text-sm sm:text-base">${styledLead}</p>`;
    }).join('');
}

// Buka Halaman Baca Berita Lengkap (Model Editorial Modern seperti VIVA Jatim)
function openNewsArticle(id, updateHash = true) {
    activeArticleId = id;
    renderArticleDetailPage(id);
    // Set URL ke #berita/{id} agar bisa di-share / di-bookmark
    if (updateHash) {
        window.location.hash = `berita/${id}`;
    }
    // Tampilkan view baca-berita tanpa update hash lagi (sudah di-set di atas)
    activeView = 'baca-berita';
    sessionStorage.setItem('esi_active_view', 'baca-berita');
    document.querySelectorAll('.spa-view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-baca-berita');
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.nav-link').forEach(btn => {
        const isHidden = btn.dataset.nav === 'daftar' && Boolean(loggedMember);
        const hideClass = isHidden ? ' hidden' : '';
        if (btn.dataset.nav === 'berita') {
            btn.className = `nav-link px-3 py-2 rounded-lg text-sm font-bold bg-[#DC2626] text-white transition${hideClass}`;
        } else {
            btn.className = `nav-link px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-[#1E293B] transition${hideClass}`;
        }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper: dapatkan URL shareable untuk artikel
function renderArticleDetailPage(id) {
    const article = news.find(n => n.id == id) || news[0];
    if (!article) return;

    // 1. Breadcrumbs & Badges
    const bCat = document.getElementById('detailBreadcrumbCat');
    const badge = document.getElementById('detailCatBadge');
    const rTime = document.getElementById('detailReadTime');
    const title = document.getElementById('detailTitle');
    const author = document.getElementById('detailAuthor');
    const date = document.getElementById('detailDate');
    const source = document.getElementById('detailSource');

    if (bCat) bCat.textContent = article.category || 'Berita';
    if (badge) badge.textContent = article.category || 'Berita';
    if (rTime) rTime.innerHTML = `<i class="fa-regular fa-clock"></i> ${article.readTime || '3 menit baca'}`;
    if (title) title.textContent = article.title;
    const authorName = article.author || 'Humas ESI Trenggalek';
    if (author) author.textContent = authorName;

    const detailAvatar = document.getElementById('detailAuthorAvatar');
    if (detailAvatar) {
        const initials = authorName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
        detailAvatar.innerHTML = `<span class="font-black text-xs">${initials || '<i class="fa-solid fa-feather-pointed"></i>'}</span>`;
    }
    if (date) date.innerHTML = `<i class="fa-regular fa-calendar mr-1"></i> ${article.date}`;
    if (source) {
        if (article.sourceUrl) {
            source.innerHTML = `<a href="${article.sourceUrl}" target="_blank" rel="noopener" class="text-[#DC2626] hover:underline font-semibold flex items-center gap-1">Sumber: VIVA Jatim <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i></a>`;
        } else {
            source.textContent = 'Portal Resmi ESI Trenggalek';
        }
    }

    // 2. Featured Image & Editorial Caption
    const imgWrapper = document.getElementById('detailImageWrapper');
    const imgEl = document.getElementById('detailImage');
    const imgCap = document.getElementById('detailImageCaption');
    const imgCred = document.getElementById('detailImageCredit');

    if (imgWrapper && imgEl) {
        if (article.imageUrl) {
            imgEl.src = article.imageUrl;
            imgEl.alt = article.title;
            if (imgCap) imgCap.textContent = article.imageCaption || article.title;
            if (imgCred) imgCred.textContent = article.author ? `Sumber Foto: ${article.author}` : 'Sumber Foto: Dokumentasi ESI Trenggalek';
            imgWrapper.classList.remove('hidden');
        } else {
            imgWrapper.classList.add('hidden');
        }
    }

    // Update URL shareable input di halaman artikel
    const urlInput = document.getElementById('detailArticleUrl');
    if (urlInput) urlInput.value = getArticleUrl(article.id);

    // 3. Body Content
    const bodyEl = document.getElementById('detailBodyContent');
    if (bodyEl) {
        bodyEl.innerHTML = formatNewsContent(article.content, article);
    }

    // 4. Tags / Topik Terkait
    const tagsContainer = document.getElementById('detailTagsList');
    if (tagsContainer) {
        const tags = Array.isArray(article.tags) && article.tags.length > 0
            ? article.tags
            : [article.category, 'ESITrenggalek', 'Esports', 'Trenggalek'];
        tagsContainer.innerHTML = tags.map(tag => {
            const cleanTag = tag.replace(/^#/, '');
            return `<span class="px-3 py-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-[#DC2626] text-slate-600 text-xs font-semibold transition cursor-pointer">#${cleanTag}</span>`;
        }).join('');
    }

    // 5. Berita Terkait Lainnya
    const relatedContainer = document.getElementById('detailRelatedNewsGrid');
    if (relatedContainer) {
        const others = news.filter(n => n.id != article.id).slice(0, 2);
        if (others.length === 0) {
            relatedContainer.innerHTML = '<div class="col-span-2 text-xs text-slate-400 italic">Belum ada berita terkait lainnya.</div>';
        } else {
            relatedContainer.innerHTML = others.map(item => `
                <div class="bg-white border border-[#E2E8F0] rounded-xl p-4 flex gap-3.5 hover:shadow-md transition cursor-pointer group" onclick="openNewsArticle(${item.id})">
                    ${item.imageUrl ? `
                        <div class="w-24 h-20 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                            <img src="${item.imageUrl}" alt="${item.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                        </div>
                    ` : ''}
                    <div class="flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 rounded bg-red-50 text-[#DC2626] text-[10px] font-bold uppercase">${item.category}</span>
                                <span class="text-[10px] text-slate-400">${item.date}</span>
                            </div>
                            <h4 class="font-bold text-xs sm:text-sm text-[#0F172A] line-clamp-2 group-hover:text-[#DC2626] transition">${item.title}</h4>
                        </div>
                        <span class="text-[11px] font-bold text-[#DC2626] flex items-center gap-1 mt-1">
                            <span>Baca Berita</span>
                            <i class="fa-solid fa-arrow-right text-[9px]"></i>
                        </span>
                    </div>
                </div>
            `).join('');
        }
    }
    // 6. Like & Komentar Pembaca
    renderArticleLikes(article.id);
    renderArticleComments(article.id);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==================== FITUR INTERAKSI: LIKE, KOMENTAR & SHARE ARTIKEL ====================

// Bagikan Artikel (WhatsApp, Telegram, Facebook, Salin Tautan, Web Share API)
function shareCurrentArticle(type) {
    const article = news.find(n => n.id == activeArticleId) || news[0];
    const pageUrl = article ? getArticleUrl(article.id) : window.location.href;
    const shareTitle = article ? article.title : 'Berita ESI Trenggalek';

    if (type === 'wa') {
        const text = encodeURIComponent(`*${shareTitle}*\n\nBaca selengkapnya di Portal Resmi ESI Trenggalek:\n${pageUrl}`);
        window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    } else if (type === 'telegram') {
        const text = encodeURIComponent(`*${shareTitle}*\n\nPortal Resmi ESI Trenggalek`);
        window.open(`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${text}`, '_blank');
    } else if (type === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`, '_blank');
    } else if (type === 'native') {
        if (navigator.share) {
            navigator.share({
                title: shareTitle,
                text: `${shareTitle} - Portal Resmi ESI Trenggalek`,
                url: pageUrl
            }).catch(() => {});
        } else {
            shareCurrentArticle('copy');
        }
    } else if (type === 'copy') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pageUrl).then(() => {
                showToast('Tautan Disalin ✅', `Tautan artikel berhasil disalin: ${pageUrl}`);
            }).catch(() => {
                showToast('Tautan Berita', pageUrl);
            });
        } else {
            showToast('Tautan Berita', pageUrl);
        }
    }
}

// -------------------- 1. FITUR LIKE ARTIKEL --------------------
const DEFAULT_ARTICLE_LIKES = {
    2: 42,
    1: 27
};

function getArticleLikes(id) {
    const saved = localStorage.getItem(`esi_likes_${id}`);
    if (saved !== null) {
        return parseInt(saved, 10) || 0;
    }
    return DEFAULT_ARTICLE_LIKES[id] || 12;
}

function hasUserLikedArticle(id) {
    return localStorage.getItem(`esi_user_liked_${id}`) === 'true';
}

function toggleArticleLike() {
    const articleId = activeArticleId;
    if (!articleId) return;

    let likes = getArticleLikes(articleId);
    const hasLiked = hasUserLikedArticle(articleId);

    if (hasLiked) {
        likes = Math.max(0, likes - 1);
        localStorage.setItem(`esi_likes_${articleId}`, likes);
        localStorage.setItem(`esi_user_liked_${articleId}`, 'false');
        showToast('Batal Suka', 'Anda membatalkan apresiasi suka untuk artikel ini.');
    } else {
        likes += 1;
        localStorage.setItem(`esi_likes_${articleId}`, likes);
        localStorage.setItem(`esi_user_liked_${articleId}`, 'true');
        showToast('Disukai! ❤️', 'Terima kasih atas apresiasi Anda untuk artikel ini!');
    }

    renderArticleLikes(articleId);
}

function renderArticleLikes(id) {
    const countEl = document.getElementById('detailLikeCount');
    const iconEl = document.getElementById('detailLikeIcon');
    const btnEl = document.getElementById('btnLikeArticle');

    const likes = getArticleLikes(id);
    const hasLiked = hasUserLikedArticle(id);

    if (countEl) countEl.textContent = likes;

    if (btnEl && iconEl) {
        if (hasLiked) {
            btnEl.className = 'flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-red-600 text-white transition shadow-sm border border-red-600';
            iconEl.className = 'fa-solid fa-heart text-base text-white';
        } else {
            btnEl.className = 'flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white hover:bg-red-50 text-slate-700 hover:text-[#DC2626] border border-slate-200 hover:border-red-200 transition shadow-xs';
            iconEl.className = 'fa-regular fa-heart text-base text-[#DC2626]';
        }
    }
}

// -------------------- 2. FITUR DISKUSI, KOMENTAR & BALASAN (REPLY) --------------------
// Catatan: Hanya Admin / Pengurus resmi yang mendapatkan badge khusus. Pengguna umum, atlet, dan pembaca tidak diberi badge.
const INITIAL_ARTICLE_COMMENTS = {
    2: [
        {
            id: 'c1',
            author: 'Bambang Prasetyo',
            isAdmin: false,
            date: '29 Juli 2025, 14:20',
            content: 'Selamat atas terpilihnya Mas Edi Suripto sebagai Ketua ESI Trenggalek! Semoga pembinaan atlet esports usia muda di Trenggalek semakin maju dan bisa tembus Porprov Jatim.',
            replies: [
                {
                    id: 'r1',
                    author: 'Edi Suripto',
                    isAdmin: false,
                    date: '29 Juli 2025, 16:05',
                    content: 'Terima kasih Mas Bambang atas doa dan dukungannya. Mari kita bersinergi bersama untuk memajukan talenta muda Bumi Menak Sopal!'
                }
            ]
        },
        {
            id: 'c2',
            author: 'Deni Kurniawan',
            isAdmin: false,
            date: '30 Juli 2025, 09:15',
            content: 'Kira-kira kapan piala bupati atau turnamen pelajar tingkat kabupaten berikutnya diadakan lagi min?',
            replies: [
                {
                    id: 'r2',
                    author: 'Humas ESI Trenggalek',
                    isAdmin: true,
                    date: '30 Juli 2025, 10:30',
                    content: 'Halo kak Deni, pantau terus menu "Jadwal Event" di website ini ya. Dalam waktu dekat akan segera dirilis agenda Piala Pelajar Season 2!'
                }
            ]
        }
    ],
    1: [
        {
            id: 'c3',
            author: 'Rifki Pratama',
            isAdmin: false,
            date: '16 November 2026, 11:00',
            content: 'Mantap kolaborasi dengan OSIS! Semoga turnamen pelajar berikutnya semakin ramai dan kompetitif.',
            replies: []
        }
    ]
};

function getArticleComments(id) {
    const raw = localStorage.getItem(`esi_comments_v3_${id}`);
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('Error parsing comments:', e);
        }
    }
    return INITIAL_ARTICLE_COMMENTS[id] ? JSON.parse(JSON.stringify(INITIAL_ARTICLE_COMMENTS[id])) : [];
}

function saveArticleComments(id, comments) {
    localStorage.setItem(`esi_comments_v3_${id}`, JSON.stringify(comments));
}

function countTotalComments(comments) {
    let total = 0;
    (comments || []).forEach(c => {
        total += 1;
        if (Array.isArray(c.replies)) {
            total += c.replies.length;
        }
    });
    return total;
}

function scrollToComments() {
    const sec = document.getElementById('sectionKomentar');
    if (sec) {
        sec.scrollIntoView({ behavior: 'smooth' });
        const input = document.getElementById('commentTextInput');
        if (input) setTimeout(() => input.focus(), 400);
    }
}

function renderCommentsHtml(articleId, comments) {
    const totalCount = countTotalComments(comments);

    // Update Badges
    const badge1 = document.getElementById('detailCommentCountBadge');
    const badge2 = document.getElementById('commentHeaderBadge');
    if (badge1) badge1.textContent = totalCount;
    if (badge2) badge2.textContent = `${totalCount} Komentar`;

    // Render Identity Box Form
    const identityBox = document.getElementById('commentUserIdentityBox');
    if (identityBox) {
        if (isAdminLoggedIn) {
            identityBox.innerHTML = `
                <div class="flex items-center gap-3 bg-white border border-slate-200/90 px-3.5 py-2.5 rounded-xl shadow-2xs w-full">
                    <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#DC2626] to-red-500 text-white flex items-center justify-center text-xs shrink-0 shadow-xs">
                        <i class="fa-solid fa-shield-halved"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="font-extrabold text-xs sm:text-sm text-[#0F172A] leading-tight">Administrator ESI Trenggalek</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-[#DC2626] border border-red-200 inline-flex items-center gap-1 shrink-0">
                                <i class="fa-solid fa-shield-halved text-[9px]"></i> Admin / Pengurus
                            </span>
                        </div>
                        <span class="text-slate-400 text-[10px] block mt-0.5 font-medium">Berkomentar sebagai perwakilan ESI Trenggalek</span>
                    </div>
                </div>
            `;
        } else if (loggedMember) {
            const shortName = loggedMember.nickname || loggedMember.fullName || 'Member';
            identityBox.innerHTML = `
                <div class="flex items-center gap-3 bg-white border border-slate-200/90 px-3.5 py-2.5 rounded-xl shadow-2xs w-full">
                    <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0F172A] to-slate-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        ${shortName.charAt(0).toUpperCase()}
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="font-extrabold text-xs sm:text-sm text-[#0F172A] leading-tight">${escapeHtml(shortName)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1 shrink-0">
                                <i class="fa-solid fa-circle-check text-[9px]"></i> Anggota Terverifikasi
                            </span>
                        </div>
                        <span class="text-slate-400 text-[10px] block mt-0.5 font-medium">Berkomentar sebagai Anggota Resmi ESI</span>
                    </div>
                </div>
            `;
        } else {
            identityBox.innerHTML = `
                <div class="w-full sm:max-w-xs">
                    <label for="commentAuthorInput" class="block text-[11px] font-bold text-[#0F172A] uppercase tracking-wider mb-1.5">
                        Nama Anda <span class="text-[#DC2626]">*</span>
                    </label>
                    <div class="relative">
                        <i class="fa-solid fa-user absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input type="text" id="commentAuthorInput" required placeholder="Ketik nama Anda..."
                            class="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-[#DC2626] focus:outline-none text-xs text-[#0F172A] font-medium shadow-2xs">
                    </div>
                </div>
            `;
        }
    }

    // Render Comments List
    const listEl = document.getElementById('articleCommentsList');
    if (!listEl) return;

    if (comments.length === 0) {
        listEl.innerHTML = `
            <div class="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                <div class="w-12 h-12 rounded-full bg-red-50 text-[#DC2626] flex items-center justify-center mx-auto mb-3 text-lg">
                    <i class="fa-regular fa-comment-dots"></i>
                </div>
                <h4 class="font-bold text-sm text-[#0F172A] mb-1">Belum Ada Komentar</h4>
                <p class="text-xs text-slate-500 max-w-sm mx-auto">Jadilah yang pertama memberikan tanggapan atau ucapan selamat pada artikel ini.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = comments.map(c => {
        const initial = (c.author || 'U').charAt(0).toUpperCase();
        // Hanya Admin / Pengurus yang mendapatkan badge
        const roleBadgeHtml = c.isAdmin
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-[#DC2626] border border-red-200 inline-flex items-center gap-1 shrink-0">
                <i class="fa-solid fa-shield-halved text-[9px]"></i> Admin / Pengurus
               </span>`
            : '';

        // Render Replies
        const repliesHtml = (c.replies && c.replies.length > 0)
            ? `
                <div class="mt-3.5 pt-3 border-t border-slate-100 space-y-2.5">
                    ${c.replies.map(r => {
                        const rInitial = (r.author || 'U').charAt(0).toUpperCase();
                        const rBadge = r.isAdmin
                            ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-[#DC2626] border border-red-200 inline-flex items-center gap-1 shrink-0">
                                <i class="fa-solid fa-shield-halved text-[8px]"></i> Admin
                               </span>`
                            : '';

                        return `
                            <div class="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3 sm:p-3.5">
                                <div class="flex items-start gap-2.5">
                                    <div class="w-7 h-7 rounded-full ${r.isAdmin ? 'bg-gradient-to-tr from-[#DC2626] to-red-500' : 'bg-gradient-to-tr from-[#0F172A] to-slate-700'} text-white flex items-center justify-center font-bold text-[10px] shrink-0 shadow-xs ring-1 ring-white">
                                        ${r.isAdmin ? '<i class="fa-solid fa-shield-halved text-[9px]"></i>' : rInitial}
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                            <span class="font-bold text-xs text-[#0F172A] leading-tight break-words">${escapeHtml(r.author)}</span>
                                            ${rBadge}
                                        </div>
                                        <span class="text-[10px] text-slate-400 mt-0.5 block">${escapeHtml(r.date)}</span>

                                        <div class="mt-1.5 text-xs text-slate-700 leading-relaxed whitespace-pre-line break-words">
                                            ${escapeHtml(r.content)}
                                        </div>
                                        ${isAdminLoggedIn ? `
                                            <div class="mt-2 pt-1.5 border-t border-slate-200/60 flex justify-end">
                                                <button type="button" onclick="deleteArticleReply('${c.id}', '${r.id}')" title="Hapus Balasan (Admin)"
                                                    class="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition">
                                                    <i class="fa-regular fa-trash-can text-[10px]"></i>
                                                    <span>Hapus Balasan</span>
                                                </button>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `
            : '';

        // Form Balasan (Inline Reply Box)
        const replyBoxHtml = `
            <div id="replyBox-${c.id}" class="hidden mt-3 pt-3 border-t border-slate-100 bg-red-50/40 p-3.5 sm:p-4 rounded-xl border border-red-200/80">
                <div class="flex items-center justify-between mb-2.5">
                    <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
                        <i class="fa-solid fa-reply text-xs text-[#DC2626]"></i>
                        <span>Membalas <span class="text-[#DC2626]">@${escapeHtml(c.author)}</span></span>
                    </span>
                    <button type="button" onclick="toggleReplyBox('${c.id}')" class="text-xs text-slate-400 hover:text-slate-700 p-1">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <form onsubmit="handlePostReply(event, '${c.id}')" class="space-y-2.5">
                    ${(!loggedMember && !isAdminLoggedIn) ? `
                        <div>
                            <input type="text" id="replyAuthor-${c.id}" required placeholder="Nama Anda *"
                                class="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-[#DC2626] focus:outline-none text-xs text-[#0F172A] font-medium shadow-2xs">
                        </div>
                    ` : ''}
                    <div>
                        <textarea id="replyText-${c.id}" required rows="2" placeholder="Tulis balasan Anda di sini..."
                            class="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-[#DC2626] focus:outline-none text-xs text-[#0F172A] leading-relaxed resize-y shadow-2xs"></textarea>
                    </div>
                    <div class="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onclick="toggleReplyBox('${c.id}')"
                            class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition">
                            Batal
                        </button>
                        <button type="submit"
                            class="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#DC2626] hover:bg-[#B91C1C] text-white transition flex items-center gap-1.5 shadow-xs">
                            <i class="fa-solid fa-paper-plane text-[10px]"></i>
                            <span>Kirim Balasan</span>
                        </button>
                    </div>
                </form>
            </div>
        `;

        return `
            <div class="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-slate-300 transition">
                <div class="flex items-start gap-3">
                    <!-- Avatar Pinned Top-Left -->
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full ${c.isAdmin ? 'bg-gradient-to-tr from-[#DC2626] to-red-500' : 'bg-gradient-to-tr from-[#0F172A] to-slate-700'} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs ring-2 ring-white">
                        ${c.isAdmin ? '<i class="fa-solid fa-shield-halved text-xs"></i>' : initial}
                    </div>

                    <!-- Right Column: Flow Rapi & Sejajar di Semua Device -->
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="font-extrabold text-xs sm:text-sm text-[#0F172A] leading-tight break-words">${escapeHtml(c.author)}</span>
                            ${roleBadgeHtml}
                        </div>
                        <div class="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                            <i class="fa-regular fa-clock text-[10px]"></i>
                            <span>${escapeHtml(c.date)}</span>
                        </div>

                        <!-- Isi Komentar -->
                        <div class="mt-2.5 text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line break-words">
                            ${escapeHtml(c.content)}
                        </div>

                        <!-- Footer Action Bar: Balas & Hapus -->
                        <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <button type="button" onclick="toggleReplyBox('${c.id}')"
                                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-[#DC2626] hover:bg-red-50/80 active:bg-red-100 transition">
                                <i class="fa-solid fa-reply text-[11px] text-[#DC2626]"></i>
                                <span>Balas</span>
                                ${(c.replies && c.replies.length > 0) ? `<span class="ml-1 px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">${c.replies.length}</span>` : ''}
                            </button>

                            ${isAdminLoggedIn ? `
                                <button type="button" onclick="deleteArticleComment('${c.id}')" title="Hapus Komentar (Admin)"
                                    class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition">
                                    <i class="fa-regular fa-trash-can text-xs"></i>
                                    <span>Hapus</span>
                                </button>
                            ` : ''}
                        </div>

                        <!-- Box Balasan (Form) -->
                        ${replyBoxHtml}

                        <!-- Thread Balasan -->
                        ${repliesHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderArticleComments(articleId) {
    // 1. Tampilkan komentar dari cache lokal segera (instant UI)
    const cached = getArticleComments(articleId);
    renderCommentsHtml(articleId, cached);

    // 2. Ambil update komentar real-time dari Cloud (Vercel Blob / Supabase)
    if (typeof Api !== 'undefined' && typeof Api.getArticleComments === 'function') {
        Api.getArticleComments(articleId).then(freshComments => {
            if (freshComments && activeArticleId == articleId) {
                renderCommentsHtml(articleId, freshComments);
            }
        }).catch(() => {});
    }
}

async function handlePostComment(e) {
    e.preventDefault();
    const articleId = activeArticleId;
    if (!articleId) return;

    const textarea = document.getElementById('commentTextInput');
    const content = (textarea ? textarea.value : '').trim();
    if (!content) return;

    const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
    const oldBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Mengirim...';
    }

    let author = 'Pengunjung ESI';
    let isAdmin = false;

    if (isAdminLoggedIn) {
        author = 'Administrator ESI Trenggalek';
        isAdmin = true;
    } else if (loggedMember) {
        author = loggedMember.nickname || loggedMember.fullName || 'Member ESI';
        isAdmin = false;
    } else {
        const authorInput = document.getElementById('commentAuthorInput');
        if (authorInput && authorInput.value.trim()) {
            author = authorInput.value.trim();
        }
    }

    const nowStr = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date());

    const newComment = {
        id: 'c_' + Date.now(),
        author,
        isAdmin,
        date: nowStr,
        content,
        replies: []
    };

    try {
        let updatedComments = null;
        if (typeof Api !== 'undefined' && typeof Api.postArticleComment === 'function') {
            updatedComments = await Api.postArticleComment(articleId, newComment);
        } else {
            const comments = getArticleComments(articleId);
            comments.unshift(newComment);
            saveArticleComments(articleId, comments);
            updatedComments = comments;
        }

        if (textarea) textarea.value = '';
        const authorInput = document.getElementById('commentAuthorInput');
        if (authorInput) authorInput.value = '';

        renderCommentsHtml(articleId, updatedComments);
        showToast('Komentar Terkirim! 🎉', 'Komentar Anda berhasil dipublikasikan dan dapat dilihat oleh pengunjung lain.');
    } catch (err) {
        console.error('Submit comment error:', err);
        showToast('Gagal Mengirim', 'Terjadi kesalahan saat mengirim komentar.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = oldBtnHtml;
        }
    }
}

function toggleReplyBox(commentId) {
    const box = document.getElementById(`replyBox-${commentId}`);
    if (!box) return;

    const isHidden = box.classList.contains('hidden');
    if (isHidden) {
        box.classList.remove('hidden');
        const textarea = document.getElementById(`replyText-${commentId}`);
        if (textarea) setTimeout(() => textarea.focus(), 150);
    } else {
        box.classList.add('hidden');
    }
}

async function handlePostReply(e, commentId) {
    e.preventDefault();
    const articleId = activeArticleId;
    if (!articleId) return;

    const textarea = document.getElementById(`replyText-${commentId}`);
    const content = (textarea ? textarea.value : '').trim();
    if (!content) return;

    const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
    const oldBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>';
    }

    let author = 'Pengunjung ESI';
    let isAdmin = false;

    if (isAdminLoggedIn) {
        author = 'Administrator ESI Trenggalek';
        isAdmin = true;
    } else if (loggedMember) {
        author = loggedMember.nickname || loggedMember.fullName || 'Member ESI';
        isAdmin = false;
    } else {
        const authorInput = document.getElementById(`replyAuthor-${commentId}`);
        if (authorInput && authorInput.value.trim()) {
            author = authorInput.value.trim();
        }
    }

    const nowStr = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date());

    const newReply = {
        id: 'r_' + Date.now(),
        author,
        isAdmin,
        date: nowStr,
        content
    };

    try {
        let updatedComments = null;
        if (typeof Api !== 'undefined' && typeof Api.postArticleReply === 'function') {
            updatedComments = await Api.postArticleReply(articleId, commentId, newReply);
        } else {
            const comments = getArticleComments(articleId);
            const target = comments.find(c => c.id === commentId);
            if (target) {
                if (!Array.isArray(target.replies)) target.replies = [];
                target.replies.push(newReply);
                saveArticleComments(articleId, comments);
                updatedComments = comments;
            }
        }

        renderCommentsHtml(articleId, updatedComments);
        showToast('Balasan Terkirim! 💬', 'Balasan Anda berhasil dipublikasikan.');
    } catch (err) {
        console.error('Submit reply error:', err);
        showToast('Gagal Membalas', 'Terjadi kesalahan saat mengirim balasan.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = oldBtnHtml;
        }
    }
}

// -------------------- 3. HAPUS KOMENTAR & BALASAN (KHUSUS ADMIN) --------------------
async function deleteArticleComment(commentId) {
    if (!isAdminLoggedIn) {
        showToast('Akses Ditolak', 'Hanya administrator yang dapat menghapus komentar.');
        return;
    }
    if (!confirm('Apakah Anda yakin ingin menghapus komentar ini beserta seluruh balasannya?')) {
        return;
    }
    const articleId = activeArticleId;
    if (!articleId) return;

    let updated = null;
    if (typeof Api !== 'undefined' && typeof Api.deleteArticleComment === 'function') {
        updated = await Api.deleteArticleComment(articleId, commentId);
    } else {
        let comments = getArticleComments(articleId);
        comments = comments.filter(c => c.id !== commentId);
        saveArticleComments(articleId, comments);
        updated = comments;
    }
    renderCommentsHtml(articleId, updated);
    showToast('Komentar Dihapus 🗑️', 'Komentar berhasil dihapus oleh admin.');
}

async function deleteArticleReply(commentId, replyId) {
    if (!isAdminLoggedIn) {
        showToast('Akses Ditolak', 'Hanya administrator yang dapat menghapus balasan.');
        return;
    }
    if (!confirm('Apakah Anda yakin ingin menghapus balasan ini?')) {
        return;
    }
    const articleId = activeArticleId;
    if (!articleId) return;

    let updated = null;
    if (typeof Api !== 'undefined' && typeof Api.deleteArticleComment === 'function') {
        updated = await Api.deleteArticleComment(articleId, replyId);
    } else {
        const comments = getArticleComments(articleId);
        const target = comments.find(c => c.id === commentId);
        if (target && Array.isArray(target.replies)) {
            target.replies = target.replies.filter(r => r.id !== replyId);
            saveArticleComments(articleId, comments);
            updated = comments;
        }
    }
    renderCommentsHtml(articleId, updated);
    showToast('Balasan Dihapus 🗑️', 'Balasan komentar berhasil dihapus oleh admin.');
}

// Tetap dukung openNewsModal dengan mengarahkannya ke openNewsArticle
function openNewsModal(id) {
    openNewsArticle(id);
}

function closeNewsModal() {
    navigateTo('berita');
}

// ==================== DETAIL EVENT (DEEP LINK - ESPORTS TOURNAMENT VIEW) ====================
let activeEventId = null;
let activeEventDetailTab = 'desc'; // 'desc' | 'rules' | 'prizes' | 'contact'

function switchEventDetailTab(tab) {
    activeEventDetailTab = tab;
    document.querySelectorAll('.ev-detail-tab-btn').forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.className = 'ev-detail-tab-btn px-4 py-2.5 rounded-xl text-xs font-black bg-[#0F172A] text-white shadow-sm transition shrink-0';
        } else {
            btn.className = 'ev-detail-tab-btn px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 border border-slate-200 transition shrink-0';
        }
    });

    document.querySelectorAll('.ev-detail-tab-pane').forEach(pane => {
        if (pane.id === `evDetailPane-${tab}`) {
            pane.classList.remove('hidden');
        } else {
            pane.classList.add('hidden');
        }
    });
}

function shareEventWa(id) {
    const ev = events.find(e => e.id == id);
    if (!ev) return;
    const url = getEventUrl(id);
    const text = `🏆 *TURNAMEN ESPORTS RESMI TRENGGALEK*\n\n*${ev.title}*\n📅 Tanggal: ${ev.date}\n📍 Lokasi: ${ev.location}\n🎮 Divisi: ${ev.division}\n\nYuk ikuti dan daftarkan tim kamu sekarang!\nInfo lengkap: ${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function copyEventUrl() {
    const url = activeEventId ? getEventUrl(activeEventId) : window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => showToast('Tautan Disalin ✅', 'Tautan turnamen telah disalin ke clipboard!'));
    } else {
        showToast('Tautan Turnamen', url);
    }
}

function renderEventDetailPage(id) {
    if (!id && events.length > 0) id = events[0].id;
    const ev = events.find(e => String(e.id) === String(id));
    if (!ev) return null;
    activeEventId = id;

    // Fallback data
    const prizePool = ev.prizePool || ev.prize || 'Piala Bergilir & E-Sertifikat Resmi';
    const fee = ev.fee || 'Gratis / Free Entry';
    const slots = ev.slots ? parseInt(ev.slots, 10) : 32;
    const format = ev.format || 'Knockout / Best of 3 (BO3)';
    const organizer = ev.organizer || 'ESI Trenggalek';
    const category = ev.category || 'Umum & Pelajar Trenggalek';
    const rosterFormat = ev.rosterFormat || (
        ev.division && (ev.division.includes('Free Fire') || ev.division.includes('PUBG'))
            ? '4 Pemain Utama + 1 Cadangan'
            : (ev.division && (ev.division.includes('eFootball') || ev.division.includes('Chess')) ? '1 Pemain (Solo)' : '5 Pemain Utama + 1 Cadangan')
    );
    const contact = ev.contact || '';
    const cleanContact = contact.replace(/[^0-9]/g, '');
    const waContact = cleanContact.startsWith('0') ? '62' + cleanContact.slice(1) : cleanContact;
    const shareUrl = `${window.location.origin}${window.location.pathname}#event/${ev.id}`;

    // Data Pendaftar Real-time
    const regs = (typeof Api !== 'undefined' && typeof Api.getLocalTournamentRegistrations === 'function')
        ? Api.getLocalTournamentRegistrations(ev.id)
        : [];
    const registeredCount = regs ? regs.length : 0;
    const remainingSlots = Math.max(0, slots - registeredCount);
    const isOpen = ev.status === 'Upcoming' || ev.status === 'Ongoing';

    // Status Badge
    let statusBadgeHtml = '';
    if (ev.status === 'Upcoming') {
        statusBadgeHtml = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Upcoming
        </span>`;
    } else if (ev.status === 'Ongoing') {
        statusBadgeHtml = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Sedang Berlangsung
        </span>`;
    } else {
        statusBadgeHtml = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <span class="w-2 h-2 rounded-full bg-slate-400"></span> Selesai
        </span>`;
    }

    // Rules
    const defaultRules = [
        "Peserta wajib memahami dan mematuhi seluruh peraturan turnamen yang berlaku.",
        "Setiap peserta hanya diperbolehkan mengikuti satu turnamen untuk tema resmi yang sama.",
        "Dilarang keras menggunakan program pihak ketiga, program ilegal, script, maupun bug game secara sengaja.",
        "Peserta wajib stand by 30 menit sebelum pertandingan dimulai, dengan toleransi keterlambatan maksimal 10 menit.",
        "Segala bentuk kendala teknis dari sisi peserta (koneksi/perangkat) di luar tanggung jawab panitia.",
        "Keputusan panitia wasit bersifat mutlak, resmi, dan tidak dapat diganggu gugat."
    ];
    const rulesList = (ev.rules && ev.rules.trim())
        ? ev.rules.split('\n').map(l => l.trim()).filter(l => l)
        : defaultRules;

    // Poster Renderer
    const hasPoster = ev.imageUrl && ev.imageUrl.trim();
    const posterHtml = hasPoster
        ? `<img src="${ev.imageUrl}" alt="Poster ${ev.title}" class="w-full h-auto max-h-[520px] object-cover rounded-2xl shadow-md border border-slate-200">`
        : `<div class="w-full aspect-[3/4] max-h-[500px] rounded-2xl bg-gradient-to-br from-[#0B1120] via-[#1E293B] to-[#0F172A] p-6 text-white flex flex-col justify-between border-2 border-slate-800 shadow-xl relative overflow-hidden">
            <!-- Background Cyber Grid -->
            <div class="absolute inset-0 opacity-15 pointer-events-none" style="background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0); background-size: 24px 24px;"></div>
            <div class="absolute -top-12 -right-12 w-44 h-44 bg-[#DC2626]/20 rounded-full blur-2xl pointer-events-none"></div>

            <!-- Top Tag -->
            <div class="relative z-10 flex items-center justify-between">
                <span class="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-black uppercase tracking-wider">${ev.division}</span>
                <span class="text-[10px] font-mono text-slate-400 uppercase tracking-widest">ESI OFFICIAL</span>
            </div>

            <!-- Center Artwork & Title -->
            <div class="relative z-10 text-center my-auto py-6">
                <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl text-red-500 shadow-inner">
                    <i class="fa-solid fa-trophy"></i>
                </div>
                <div class="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">TURNAMEN RESMI ESPORTS</div>
                <h3 class="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-md">${ev.title}</h3>
                <div class="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs text-amber-300 font-bold">
                    <i class="fa-solid fa-award"></i> ${prizePool}
                </div>
            </div>

            <!-- Bottom Info -->
            <div class="relative z-10 pt-4 border-t border-slate-800/80 text-xs text-slate-300 flex items-center justify-between">
                <span><i class="fa-regular fa-calendar mr-1.5 text-red-500"></i>${ev.date}</span>
                <span><i class="fa-solid fa-location-dot mr-1.5 text-red-500"></i>${ev.location}</span>
            </div>
        </div>`;

    // 8 Spesifikasi Grid
    const specItems = [
        { icon: 'fa-calendar-days', label: 'Tanggal Pelaksanaan', value: ev.date || '-' },
        { icon: 'fa-location-dot', label: 'Lokasi / Venue', value: ev.location || '-' },
        { icon: 'fa-trophy', label: 'Total Hadiah (Prize Pool)', value: prizePool },
        { icon: 'fa-ticket', label: 'Biaya Pendaftaran', value: fee },
        { icon: 'fa-users', label: 'Kuota Slot Tim', value: `${registeredCount} / ${slots} Tim Terdaftar` },
        { icon: 'fa-user-group', label: 'Susunan Roster', value: rosterFormat },
        { icon: 'fa-chess', label: 'Format Pertandingan', value: format },
        { icon: 'fa-layer-group', label: 'Kategori Peserta', value: category },
    ];

    const specGridHtml = specItems.map(item => `
        <div class="bg-[#F8FAFC] border border-slate-200/90 rounded-xl p-3.5 flex items-start gap-3 transition hover:bg-white hover:border-slate-300">
            <div class="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 text-sm shrink-0 shadow-2xs">
                <i class="fa-solid ${item.icon}"></i>
            </div>
            <div class="min-w-0 flex-1">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">${item.label}</div>
                <div class="text-xs sm:text-sm font-extrabold text-[#0F172A] leading-snug break-words">${item.value}</div>
            </div>
        </div>
    `).join('');

    const bodyEl = document.getElementById('eventDetailPageBody');
    if (!bodyEl) return ev;

    bodyEl.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            <!-- ================= KOLOM KIRI (POSTER & AKSI DAFTAR) ================= -->
            <div class="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
                <!-- Frame Poster -->
                <div class="rounded-2xl overflow-hidden bg-white p-2.5 border border-slate-200 shadow-sm">
                    ${posterHtml}
                </div>

                <!-- Tombol Aksi Registrasi -->
                <div class="space-y-2.5">
                    ${isOpen ? `
                    <button onclick="openEventRegistration('${ev.id}')"
                        class="w-full py-4 px-6 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-red-600/30 hover:shadow-red-600/40 transition flex items-center justify-center gap-2.5 active:scale-[0.99]">
                        <i class="fa-solid fa-clipboard-list text-lg"></i>
                        <span>DAFTAR SEKARANG</span>
                    </button>
                    ` : `
                    <div class="w-full py-4 px-6 rounded-xl bg-slate-200 text-slate-500 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                        <i class="fa-solid fa-lock text-base"></i>
                        <span>PENDAFTARAN DITUTUP</span>
                    </div>
                    `}

                    ${waContact ? `
                    <a href="https://wa.me/${waContact}?text=Halo%20Panitia%20Turnamen%20${encodeURIComponent(ev.title)}%2C%20saya%20ingin%20bertanya%20info%20pendaftaran" target="_blank" rel="noopener"
                        class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition">
                        <i class="fa-brands fa-whatsapp text-base"></i>
                        <span>Hubungi Panitia (WhatsApp)</span>
                    </a>
                    ` : ''}

                    <div class="flex items-center gap-2 pt-1">
                        <button onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>showToast('Link Disalin','Tautan turnamen berhasil disalin!'))"
                            class="flex-1 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs">
                            <i class="fa-solid fa-copy text-xs text-slate-500"></i>
                            <span>Salin Link</span>
                        </button>
                        <a href="https://wa.me/?text=Yuk%20daftar%20turnamen%20esports%20resmi%20ini%3A%20*${encodeURIComponent(ev.title)}*%0A${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener"
                            class="flex-1 py-2.5 px-3 rounded-xl bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-300 text-emerald-700 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs">
                            <i class="fa-brands fa-whatsapp text-sm text-emerald-600"></i>
                            <span>Share WA</span>
                        </a>
                    </div>
                </div>
            </div>

            <!-- ================= KOLOM KANAN (DETAIL & SPESIFIKASI) ================= -->
            <div class="lg:col-span-7 space-y-6">

                <!-- Header Info & Badges -->
                <div class="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <div class="flex flex-wrap items-center gap-2 mb-3">
                        <span class="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#DC2626] text-white">
                            ${ev.division}
                        </span>
                        ${statusBadgeHtml}
                        <span class="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            ${category}
                        </span>
                    </div>

                    <h1 class="text-2xl sm:text-3xl font-black text-[#0F172A] leading-tight mb-2.5">
                        ${ev.title}
                    </h1>

                    <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
                        <span class="flex items-center gap-1.5 font-bold text-slate-700">
                            <i class="fa-solid fa-shield-halved text-[#DC2626]"></i>
                            <span>Penyelenggara: ${organizer}</span>
                        </span>
                        <span class="text-slate-300">&bull;</span>
                        <span><i class="fa-regular fa-clock mr-1 text-slate-400"></i>Musim Kompetisi 2026</span>
                    </div>
                </div>

                <!-- Box: Deskripsi Turnamen -->
                ${ev.description ? `
                <div class="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <h3 class="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
                        <i class="fa-solid fa-align-left text-[#DC2626]"></i>
                        <span>Tentang Turnamen</span>
                    </h3>
                    <p class="text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line">${ev.description}</p>
                </div>
                ` : ''}

                <!-- Box: Informasi Kunci Turnamen (8 Spesifikasi Bersih) -->
                <div class="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <h3 class="text-xs font-black uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-circle-info text-[#DC2626]"></i>
                        <span>Informasi &amp; Format Turnamen</span>
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        ${specGridHtml}
                    </div>
                </div>

                <!-- Box: Kapasitas Slot Tim Real-time -->
                <div class="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <div class="flex items-center justify-between gap-3 mb-2.5">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid fa-users text-[#DC2626]"></i>
                            <span class="text-xs font-black uppercase tracking-wider text-slate-700">Kapasitas Slot Turnamen</span>
                        </div>
                        <span class="text-sm font-black text-[#0F172A]">${registeredCount} <span class="text-xs font-medium text-slate-400">dari ${slots} Tim</span></span>
                    </div>

                    <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all ${registeredCount >= slots ? 'bg-red-600' : 'bg-[#DC2626]'}"
                            style="width: ${Math.min(100, Math.round(registeredCount / slots * 100))}%"></div>
                    </div>

                    <div class="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                        <span><strong class="text-slate-800">${registeredCount} tim</strong> telah terdaftar</span>
                        <span class="text-[#DC2626] font-bold"><i class="fa-solid fa-circle-exclamation mr-1"></i>Sisa ${remainingSlots} slot</span>
                    </div>
                </div>

                <!-- Box: Peraturan Turnamen -->
                <div class="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
                    <h3 class="text-xs font-black uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-scroll text-[#DC2626]"></i>
                        <span>Peraturan &amp; Ketentuan Turnamen</span>
                    </h3>
                    <div class="space-y-3">
                        ${rulesList.map((rule, idx) => `
                        <div class="flex items-start gap-3 text-xs sm:text-sm text-slate-700 leading-relaxed">
                            <span class="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                                ${idx + 1}
                            </span>
                            <span class="flex-1">${rule}</span>
                        </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Banner CTA Bottom -->
                ${isOpen ? `
                <div class="rounded-2xl p-6 sm:p-7 bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg border border-slate-800">
                    <div>
                        <div class="text-[10px] font-black uppercase tracking-wider text-red-400 mb-1">REGISTRASI TERBUKA</div>
                        <h4 class="text-lg font-black text-white">Segera Daftarkan Tim Anda</h4>
                        <p class="text-xs text-slate-400 mt-0.5">Slot terbatas. Amankan posisi skuad Anda di turnamen resmi ini.</p>
                    </div>
                    <button onclick="openEventRegistration('${ev.id}')"
                        class="px-6 py-3 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition shrink-0 active:scale-95">
                        <i class="fa-solid fa-clipboard-list"></i>
                        <span>Daftar Tim Sekarang</span>
                    </button>
                </div>
                ` : ''}

            </div>
        </div>
    `;

    return ev;
}

function openEventDetail(id, updateHash = true) {
    if (!id && events.length > 0) id = events[0].id;

    if (!events || events.length === 0) {
        Api.getEvents().then(list => {
            events = list || [];
            openEventDetail(id, updateHash);
        });
        return;
    }

    const ev = renderEventDetailPage(id);
    if (!ev) return;

    if (updateHash) {
        window.location.hash = `event/${id}`;
    }

    // Navigasi ke view dedicated detail event
    activeView = 'event-detail';
    sessionStorage.setItem('esi_active_view', 'event-detail');
    document.querySelectorAll('.spa-view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('view-event-detail');
    if (target) target.classList.remove('hidden');

    // Update Desktop Nav Active State
    document.querySelectorAll('.nav-link').forEach(btn => {
        const isHidden = btn.dataset.nav === 'daftar' && Boolean(loggedMember);
        const hideClass = isHidden ? ' hidden' : '';
        const isNavActive = btn.dataset.nav === 'event';
        if (isNavActive) {
            btn.className = `nav-link px-3 py-2 rounded-lg text-sm font-bold bg-[#DC2626] text-white transition${hideClass}`;
        } else {
            btn.className = `nav-link px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-[#1E293B] transition${hideClass}`;
        }
    });

    // Update Mobile Bottom Nav
    document.querySelectorAll('.bnav-btn').forEach(btn => {
        const isBNavActive = btn.dataset.bnav === 'event';
        if (isBNavActive) {
            btn.className = "bnav-btn flex flex-col items-center justify-center gap-1 text-[#DC2626] font-bold";
        } else {
            btn.className = "bnav-btn flex flex-col items-center justify-center gap-1 text-slate-500 font-semibold";
        }
    });

    // Scroll mulus ke paling atas halaman
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


function closeEventDetail() {
    activeEventId = null;
    // Kembali ke halaman daftar event
    navigateTo('event');
}


// ==================== 7. PANEL ADMIN ====================
function checkSuperAdminEmail(email) {
    const secBox = document.getElementById('adminSecurityBox');
    if (!secBox) return;
    const clean = (email || '').trim().toLowerCase();
    if (clean === 'robby@rawwy.ae') {
        secBox.classList.remove('hidden');
    } else {
        secBox.classList.add('hidden');
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmailInput').value.trim();
    const pass = document.getElementById('adminPassInput').value.trim();
    const securityAnswer = (document.getElementById('adminSecurityAnswerInput')?.value || '').trim();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Memproses...';
    }

    try {
        const res = await Api.loginAdmin(email, pass, securityAnswer);
        if (res.success) {
            isAdminLoggedIn = true;
            const emailInput = document.getElementById('adminEmailInput');
            const passInput = document.getElementById('adminPassInput');
            const secInput = document.getElementById('adminSecurityAnswerInput');
            const secBox = document.getElementById('adminSecurityBox');
            if (emailInput) emailInput.value = '';
            if (passInput) passInput.value = '';
            if (secInput) secInput.value = '';
            if (secBox) secBox.classList.add('hidden');

            updateHeaderAdminBadge();
            renderAdminView();
            const roleName = res.role === 'superadmin' ? 'Super Admin' : 'Pengurus';
            showToast('Login Berhasil', `Selamat datang di Panel Admin ESI Trenggalek (${roleName}).`);
        } else if (res.requireSecurity) {
            const secBox = document.getElementById('adminSecurityBox');
            const secInput = document.getElementById('adminSecurityAnswerInput');
            if (secBox) secBox.classList.remove('hidden');
            if (secInput) secInput.focus();
            showToast('Verifikasi Keamanan Diperlukan', res.message || 'Masukkan nama belakang anak.');
        } else {
            showToast('Login Gagal', res.message || 'Email atau kata sandi tidak sesuai.');
        }
    } catch (err) {
        showToast('Login Gagal', 'Terjadi kesalahan sistem.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Masuk ke Panel Admin';
        }
    }
}

async function handleAdminLogout() {
    await Api.logoutAdmin();
    isAdminLoggedIn = false;
    const emailInput = document.getElementById('adminEmailInput');
    const passInput = document.getElementById('adminPassInput');
    const secInput = document.getElementById('adminSecurityAnswerInput');
    const secBox = document.getElementById('adminSecurityBox');
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
    if (secInput) secInput.value = '';
    if (secBox) secBox.classList.add('hidden');
    updateHeaderAdminBadge();
    renderAdminView();
    showToast('Keluar Sistem', 'Sesi admin telah diakhiri.');
}

function updateHeaderAdminBadge() {
    const btn = document.getElementById('headerAdminBtn');
    const txt = document.getElementById('headerAdminText');
    const drawerBtn = document.getElementById('mobileDrawerAdminBtn');

    if (isAdminLoggedIn) {
        if (btn) {
            btn.classList.remove('hidden');
            btn.classList.add('flex');
        }
        if (txt) txt.textContent = 'Panel Admin';
        if (drawerBtn) {
            drawerBtn.classList.remove('hidden');
            drawerBtn.classList.add('flex');
        }
    } else {
        if (btn) {
            btn.classList.add('hidden');
            btn.classList.remove('flex');
        }
        if (drawerBtn) {
            drawerBtn.classList.add('hidden');
            drawerBtn.classList.remove('flex');
        }
    }
}

function renderAdminView() {
    const loginBox = document.getElementById('adminLoginBox');
    const workspace = document.getElementById('adminWorkspace');

    if (!isAdminLoggedIn) {
        if (loginBox) loginBox.classList.remove('hidden');
        if (workspace) workspace.classList.add('hidden');
        const emailInput = document.getElementById('adminEmailInput');
        const passInput = document.getElementById('adminPassInput');
        if (emailInput && !emailInput.value) emailInput.value = '';
        if (passInput && !passInput.value) passInput.value = '';
        return;
    }

    if (loginBox) loginBox.classList.add('hidden');
    if (workspace) workspace.classList.remove('hidden');

    // Update Role & User Profile di Top Header
    const adminUser = Api.getCurrentAdminUser() || { name: 'Admin ESI', email: '', role: 'pengurus' };
    const isSuper = adminUser.role === 'superadmin';

    const roleBadge = document.getElementById('adminRoleBadge');
    if (roleBadge) {
        if (isSuper) {
            roleBadge.innerHTML = '<i class="fa-solid fa-crown text-amber-400 mr-1"></i> SUPER ADMIN';
            roleBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40";
        } else {
            roleBadge.innerHTML = '<i class="fa-solid fa-shield text-emerald-400 mr-1"></i> PENGURUS DAERAH';
            roleBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-slate-700";
        }
    }

    const greetingEl = document.getElementById('adminUserGreeting');
    if (greetingEl) {
        greetingEl.textContent = `Login aktif: ${adminUser.name} (${adminUser.email})`;
    }

    // Tampilkan / Sembunyikan tab Kelola Password Pengurus khusus Super Admin
    const tabBtnAkun = document.getElementById('adminTabBtnAkun');
    if (tabBtnAkun) {
        if (isSuper) {
            tabBtnAkun.classList.remove('hidden');
        } else {
            tabBtnAkun.classList.add('hidden');
            if (adminActiveTab === 'akun') {
                switchAdminTab('atlet');
            }
        }
    }

    const pendingCount = athletes.filter(a => a.status === 'pending').length;
    const badgeEl = document.getElementById('adminPendingBadge');
    if (badgeEl) badgeEl.textContent = pendingCount;

    renderAdminAthletes();
    renderAdminEvents();
    renderAdminNews();
    if (isSuper) renderAdminAkunPanel();
}

function switchAdminTab(tabName) {
    adminActiveTab = tabName;
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        if (btn.dataset.admintab === tabName) {
            btn.className = "admin-tab-btn flex-1 lg:flex-none text-left px-4 py-3 rounded-lg text-xs sm:text-sm font-bold bg-[#0F172A] text-white flex items-center justify-between gap-2 whitespace-nowrap";
        } else {
            btn.className = "admin-tab-btn flex-1 lg:flex-none text-left px-4 py-3 rounded-lg text-xs sm:text-sm font-bold text-slate-700 hover:bg-[#F4F6F9] flex items-center justify-between gap-2 whitespace-nowrap";
        }
    });

    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
    const targetPanel = document.getElementById(`admin-panel-${tabName}`);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
        if (tabName === 'event') {
            closeAdminEventForm();
            renderAdminEvents();
        } else if (tabName === 'berita') {
            closeAdminNewsForm();
            renderAdminNews();
        } else if (tabName === 'atlet') {
            renderAdminAthletes();
        } else if (tabName === 'akun') {
            renderAdminAkunPanel();
        }
    }
}

// Controller Fitur Super Admin: Kelola Kata Sandi Pengurus
function renderAdminAkunPanel() {
    const listEl = document.getElementById('adminAccountList');
    const countEl = document.getElementById('adminAccountCount');
    // Legacy compat: juga update status text jika masih ada
    const statusText = document.getElementById('pengurusPasswordStatusText');
    if (statusText) {
        const defPass = Api.getPengurusPassword();
        statusText.innerHTML = defPass !== 'admin123'
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[11px] font-black border border-amber-300"><i class="fa-solid fa-key text-amber-600"></i> Kustom Aktif</span>`
            : `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200"><i class="fa-solid fa-lock text-slate-400"></i> Default (admin123)</span>`;
    }
    if (!listEl) return;

    const accounts = Api.getAdminAccounts();
    if (countEl) countEl.textContent = `${accounts.length} akun terdaftar`;

    listEl.innerHTML = accounts.map(acc => {
        const initials = (acc.name || acc.email).substring(0, 2).toUpperCase();
        const roleBadge = acc.isDefault
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-shield-halved text-[9px]"></i>Utama</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200"><i class="fa-solid fa-user text-[9px]"></i>Pengurus</span>`;
        const deleteBtn = acc.isDefault
            ? `<button disabled title="Akun utama tidak dapat dihapus"
                    class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-300 text-xs font-bold border border-slate-200 cursor-not-allowed">
                    <i class="fa-solid fa-trash text-[10px]"></i><span class="hidden sm:inline">Hapus</span>
                </button>`
            : `<button onclick="handleDeleteAdminAccount('${acc.email}')" title="Hapus akun ini"
                    class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white text-xs font-bold border border-red-200 hover:border-red-600 transition active:scale-95">
                    <i class="fa-solid fa-trash text-[10px]"></i><span class="hidden sm:inline">Hapus</span>
                </button>`;
        return `
            <div class="flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-5 py-3 hover:bg-slate-50/60 transition">
                <div class="w-10 h-10 rounded-xl bg-[#0F172A] text-white font-black text-sm flex items-center justify-center shrink-0">${initials}</div>
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-sm text-[#0F172A] truncate">${acc.name}</div>
                    <div class="text-[11px] text-slate-500 font-mono truncate">${acc.email}</div>
                    <div class="mt-0.5">${roleBadge}</div>
                </div>
                <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <button onclick="openSetAdminPasswordModal('${acc.email}', '${acc.name.replace(/'/g, '\\\'')}')" title="Ubah kata sandi"
                        class="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white text-xs font-bold border border-amber-200 hover:border-amber-500 transition active:scale-95 shadow-2xs">
                        <i class="fa-solid fa-key text-[10px]"></i><span class="hidden sm:inline">Sandi</span>
                    </button>
                    ${deleteBtn}
                </div>
            </div>
        `;
    }).join('');
}

// ── Add Account ──────────────────────────────────────────────────────────────
function openAddAdminAccountModal() {
    const modal = document.getElementById('modalAddAdminAccount');
    if (!modal) return;
    document.getElementById('addAdminName').value = '';
    document.getElementById('addAdminEmail').value = '';
    document.getElementById('addAdminPassword').value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAddAdminAccountModal() {
    const modal = document.getElementById('modalAddAdminAccount');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function handleAddAdminAccount(e) {
    e.preventDefault();
    const name = document.getElementById('addAdminName').value.trim();
    const email = document.getElementById('addAdminEmail').value.trim();
    const password = document.getElementById('addAdminPassword').value;
    try {
        Api.addAdminAccount(email, name, password);
        closeAddAdminAccountModal();
        renderAdminAkunPanel();
        showToast('Akun Admin Ditambahkan', `Akun "${name}" (${email}) berhasil dibuat.`);
    } catch (err) {
        alert(err.message || 'Gagal menambah akun.');
    }
}

// ── Set Password ─────────────────────────────────────────────────────────────
function openSetAdminPasswordModal(email, name) {
    const modal = document.getElementById('modalSetAdminPassword');
    if (!modal) return;
    document.getElementById('modalSetPassTarget').value = email;
    document.getElementById('modalSetPassEmail').textContent = `${name} · ${email}`;
    document.getElementById('modalSetPassNew').value = '';
    document.getElementById('modalSetPassConfirm').value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeSetAdminPasswordModal() {
    const modal = document.getElementById('modalSetAdminPassword');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function handleSetAdminPassword(e) {
    e.preventDefault();
    const email = document.getElementById('modalSetPassTarget').value;
    const p1 = document.getElementById('modalSetPassNew').value;
    const p2 = document.getElementById('modalSetPassConfirm').value;
    if (p1 !== p2) { alert('Konfirmasi kata sandi tidak cocok.'); return; }
    try {
        Api.setAdminAccountPassword(email, p1);
        closeSetAdminPasswordModal();
        renderAdminAkunPanel();
        showToast('Kata Sandi Diperbarui', `Kata sandi untuk ${email} berhasil diubah.`);
    } catch (err) {
        alert(err.message || 'Gagal mengubah kata sandi.');
    }
}

// ── Delete Account ────────────────────────────────────────────────────────────
function handleDeleteAdminAccount(email) {
    if (!confirm(`Hapus akun admin "${email}"? Aksi ini tidak dapat dibatalkan.`)) return;
    try {
        Api.deleteAdminAccount(email);
        renderAdminAkunPanel();
        showToast('Akun Dihapus', `Akun ${email} telah dihapus dari sistem.`);
    } catch (err) {
        alert(err.message || 'Gagal menghapus akun.');
    }
}

// Legacy compat
function handleSuperAdminChangePengurusPassword(e) {
    e.preventDefault();
    const p1 = document.getElementById('newPengurusPassInput')?.value.trim();
    const p2 = document.getElementById('confirmPengurusPassInput')?.value.trim();
    if (!p1 || p1.length < 5) { alert('Kata sandi baru minimal 5 karakter.'); return; }
    if (p1 !== p2) { alert('Konfirmasi kata sandi tidak cocok. Mohon ketik ulang.'); return; }
    try {
        Api.setAdminAccountPassword('admin@esitrenggalek.id', p1);
        e.target.reset();
        renderAdminAkunPanel();
        showToast('Kata Sandi Pengurus Diperbarui', 'Kata sandi untuk akun admin@esitrenggalek.id berhasil diubah.');
    } catch (err) {
        alert(err.message || 'Gagal mengubah kata sandi pengurus.');
    }
}

function handleResetPengurusPasswordToDefault() {
    if (confirm('Reset kata sandi akun pengurus (admin@esitrenggalek.id) kembali ke default "admin123"?')) {
        Api.resetPengurusPassword();
        renderAdminAkunPanel();
        showToast('Kata Sandi Direset', 'Kata sandi pengurus berhasil dikembalikan ke default: admin123.');
    }
}

// Admin Tab 1: Kelola Atlet & Poin
function renderAdminAthletes() {
    const filterEl = document.getElementById('adminAthleteFilter');
    const divFilterEl = document.getElementById('adminAthleteDivFilter');
    const searchEl = document.getElementById('adminAthleteSearch');
    const filter = filterEl ? filterEl.value : 'all';
    const divFilter = divFilterEl ? divFilterEl.value : 'all';
    const searchQ = searchEl ? searchEl.value.trim().toLowerCase() : '';
    const tbody = document.getElementById('adminAthleteTableBody');
    if (!tbody) return;

    let filtered = athletes.filter(a => {
        if (filter !== 'all' && a.status !== filter) return false;
        if (divFilter !== 'all' && a.division !== divFilter) return false;
        if (searchQ) {
            const haystack = [a.nickname, a.fullName, a.division, a.institution, a.teamName, a.kecamatan, a.gameId]
                .filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(searchQ)) return false;
        }
        return true;
    });

    // Summary stats
    const summaryEl = document.getElementById('adminAthleteSummary');
    if (summaryEl) {
        const total = athletes.length;
        const pending = athletes.filter(a => a.status === 'pending').length;
        const verified = athletes.filter(a => a.status === 'verified').length;
        summaryEl.innerHTML = `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-bold"><i class="fa-solid fa-users text-[10px]"></i> ${total} Total</span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold"><i class="fa-solid fa-clock text-[10px]"></i> ${pending} Pending</span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold"><i class="fa-solid fa-circle-check text-[10px]"></i> ${verified} Verified</span>
            ${filtered.length !== total ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold"><i class="fa-solid fa-filter text-[10px]"></i> ${filtered.length} Hasil Filter</span>` : ''}
        `;
    }

    const paginEl = document.getElementById('adminAthletePagination');

    if (filtered.length === 0) {
        const emptyHtml = `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400 italic text-xs">Tidak ada data atlet yang sesuai filter / pencarian.</td></tr>`;
        tbody.innerHTML = emptyHtml;
        const cardList = document.getElementById('adminAthleteCardList');
        if (cardList) cardList.innerHTML = `<div class="text-center py-8 text-slate-400 italic text-sm">Tidak ada data atlet yang sesuai filter / pencarian.</div>`;
        if (paginEl) paginEl.textContent = '';
        return;
    }

    if (paginEl) paginEl.textContent = `Menampilkan ${filtered.length} dari ${athletes.length} data atlet terdaftar`;

    // Render mobile cards
    const cardList = document.getElementById('adminAthleteCardList');

    const rows = filtered.map((a, idx) => {
        const statusBadge = a.status === 'verified'
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#166534]"><i class="fa-solid fa-circle-check text-[9px]"></i>Verified</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E]"><i class="fa-solid fa-clock text-[9px]"></i>Pending</span>`;

        const verifyBtn = a.status === 'pending'
            ? `<button onclick="verifyAthlete(${a.id})" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition" title="Verifikasi"><i class="fa-solid fa-check"></i> Verifikasi</button>`
            : ``;

        const verifyBtnDesk = a.status === 'pending'
            ? `<button onclick="verifyAthlete(${a.id})" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition" title="Verifikasi"><i class="fa-solid fa-check"></i></button>`
            : ``;

        const regNo = getAthleteRegNo(a);

        // ── MOBILE CARD (Tertata Rapi & Proporsional di Semua Layar Mobile) ──
        const mobileCard = `
            <div class="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3.5 transition hover:border-slate-300">
                <!-- Header Card: Avatar, Nama, No. Reg & Badge Status -->
                <div class="flex items-start justify-between gap-2.5">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0F172A] to-slate-800 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs border border-slate-700">
                            ${(a.nickname || 'AT').substring(0, 2).toUpperCase()}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="font-black text-[#0F172A] text-sm truncate leading-tight">${a.nickname}</div>
                            <div class="text-[11px] text-slate-500 truncate mt-0.5">${a.fullName}</div>
                            <div class="mt-1">
                                <span class="inline-block whitespace-nowrap text-[10px] font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shadow-2xs">${regNo}</span>
                            </div>
                        </div>
                    </div>
                    <div class="shrink-0 pt-0.5">
                        ${statusBadge}
                    </div>
                </div>

                <!-- Grid Informasi Atlet -->
                <div class="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    <div>
                        <span class="text-slate-400 uppercase tracking-wider font-bold text-[9px] block">Divisi Gim</span>
                        <div class="font-extrabold text-[#DC2626] truncate">${a.division}</div>
                    </div>
                    <div>
                        <span class="text-slate-400 uppercase tracking-wider font-bold text-[9px] block">Game ID</span>
                        <div class="font-mono font-semibold text-slate-800 truncate">${a.gameId || '-'}</div>
                    </div>
                    <div>
                        <span class="text-slate-400 uppercase tracking-wider font-bold text-[9px] block">Tim Esports</span>
                        <div class="font-semibold text-slate-700 truncate">${a.teamName || 'Non-Tim'}</div>
                    </div>
                    <div>
                        <span class="text-slate-400 uppercase tracking-wider font-bold text-[9px] block">Poin Resmi</span>
                        <div class="font-black text-[#0F172A]">${a.points || 0} PTS</div>
                    </div>
                    <div class="col-span-2 pt-1 border-t border-slate-200/60">
                        <span class="text-slate-400 uppercase tracking-wider font-bold text-[9px] block">Instansi / Asal Daerah</span>
                        <div class="text-slate-700 truncate font-medium">${a.institution || '-'}${a.kecamatan ? ' • Kec. ' + a.kecamatan : ''}</div>
                    </div>
                    <div class="col-span-2">
                        <span class="text-slate-400 uppercase tracking-wider font-bold text-[9px] block">Kontak WhatsApp</span>
                        <a href="https://wa.me/${(a.whatsapp||'').replace(/\D/g,'')}?text=Halo+${encodeURIComponent(a.nickname)}%2C+ini+dari+ESI+Trenggalek." target="_blank"
                            class="inline-flex items-center gap-1.5 text-emerald-700 font-bold hover:underline">
                            <i class="fa-brands fa-whatsapp text-emerald-600 text-xs"></i>
                            <span>${a.whatsapp || '-'}</span>
                        </a>
                    </div>
                </div>

                <!-- Box Edit Poin Klasemen -->
                <div class="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <i class="fa-solid fa-trophy text-amber-500 text-xs shrink-0"></i>
                        <span class="text-[11px] font-bold text-slate-700 whitespace-nowrap">Edit Poin:</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <input type="number" id="ptsInput-${a.id}" value="${a.points || 0}" min="0"
                            class="w-20 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-black text-[#0F172A] text-center focus:bg-white focus:outline-none focus:border-slate-500">
                        <button onclick="updateAthletePoints(${a.id})" title="Simpan Poin"
                            class="px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 active:scale-95 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-2xs">
                            <i class="fa-solid fa-floppy-disk text-[11px]"></i>
                            <span>Simpan</span>
                        </button>
                    </div>
                </div>

                <!-- Tombol Aksi Mobile (Tertata Lega & Proporsional) -->
                <div class="pt-1">
                    ${a.status === 'pending' ? `
                    <!-- Tombol Utama Verifikasi untuk status Pending -->
                    <button onclick="verifyAthlete(${a.id})"
                        class="w-full flex items-center justify-center gap-2 py-2.5 mb-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold shadow-sm transition">
                        <i class="fa-solid fa-circle-check text-sm"></i>
                        <span>Verifikasi & Aktifkan Atlet</span>
                    </button>` : ''}

                    <!-- 3 Tombol Aksi Simetris (Grid 3 Kolom) -->
                    <div class="grid grid-cols-3 gap-2">
                        <button onclick="showAthleteDetail(${a.id})"
                            class="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-bold transition border border-blue-100 active:scale-95">
                            <i class="fa-solid fa-eye text-xs"></i>
                            <span>Detail</span>
                        </button>
                        <button onclick="openAdminSetPasswordPrompt(${a.id})"
                            class="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white text-xs font-bold transition border border-amber-200 active:scale-95">
                            <i class="fa-solid fa-key text-xs"></i>
                            <span>Sandi</span>
                        </button>
                        <button onclick="deleteAthlete(${a.id})"
                            class="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-600 text-red-700 hover:text-white text-xs font-bold transition border border-red-200 active:scale-95">
                            <i class="fa-solid fa-trash text-xs"></i>
                            <span>Hapus</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // ── DESKTOP TABLE ROW ──
        const tableRow = `
            <tr class="border-b border-[#E2E8F0] hover:bg-slate-50/60 transition">
                <td class="px-3 py-2.5 text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                <td class="px-3 py-2.5">
                    <div class="font-bold text-[#0F172A] text-xs leading-tight">${a.nickname}</div>
                    <div class="text-[11px] text-slate-500">${a.fullName}</div>
                    <div class="mt-0.5"><span class="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">${regNo}</span></div>
                </td>
                <td class="px-3 py-2.5">
                    <div class="font-bold text-[#DC2626] text-xs">${a.division}</div>
                    <div class="text-[11px] font-mono text-slate-500">${a.gameId || '-'}</div>
                    <div class="text-[11px] text-slate-400">${a.teamName || 'Non-Tim'}</div>
                </td>
                <td class="px-3 py-2.5 text-[11px] text-slate-600 max-w-[140px]">
                    <div class="truncate">${a.institution || '-'}</div>
                    <div class="text-slate-400">${a.kecamatan ? 'Kec. ' + a.kecamatan : ''}</div>
                </td>
                <td class="px-3 py-2.5">
                    <a href="https://wa.me/${(a.whatsapp||'').replace(/\D/g,'')}?text=Halo+${encodeURIComponent(a.nickname)}%2C+ini+dari+ESI+Trenggalek." target="_blank"
                        class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 transition">
                        <i class="fa-brands fa-whatsapp"></i> ${a.whatsapp || '-'}
                    </a>
                    ${a.email ? `<div class="text-[10px] text-slate-400 truncate max-w-[120px]">${a.email}</div>` : ''}
                </td>
                <td class="px-3 py-2.5">${statusBadge}</td>
                <td class="px-3 py-2.5">
                    <div class="flex items-center gap-1">
                        <input type="number" id="ptsInput-${a.id}" value="${a.points || 0}" min="0"
                            class="w-16 px-2 py-1 rounded bg-[#F4F6F9] border border-[#E2E8F0] text-xs font-bold text-[#0F172A] text-center">
                        <button onclick="updateAthletePoints(${a.id})" title="Simpan Poin"
                            class="px-1.5 py-1 rounded bg-[#0F172A] hover:bg-slate-700 text-white text-[10px] transition">
                            <i class="fa-solid fa-floppy-disk"></i>
                        </button>
                    </div>
                </td>
                <td class="px-3 py-2.5 text-right">
                    <div class="inline-flex items-center gap-1">
                        <button onclick="showAthleteDetail(${a.id})" title="Lihat Detail Lengkap"
                            class="px-2 py-1 rounded bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white text-[10px] font-bold transition">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button onclick="openAdminSetPasswordPrompt(${a.id})" title="Ubah / Reset Kata Sandi User"
                            class="px-2 py-1 rounded bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white text-[10px] font-bold transition">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        ${verifyBtnDesk}
                        <button onclick="deleteAthlete(${a.id})" title="Hapus Data"
                            class="px-2 py-1 rounded bg-red-50 hover:bg-[#DC2626] text-[#DC2626] hover:text-white text-[10px] font-bold transition">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;

        return { mobileCard, tableRow };
    });

    if (cardList) cardList.innerHTML = rows.map(r => r.mobileCard).join('');
    tbody.innerHTML = rows.map(r => r.tableRow).join('');
}

function showAthleteDetail(id) {
    const a = athletes.find(x => x.id == id);
    if (!a) return;
    const regNo = getAthleteRegNo(a);

    const modalRegNo = document.getElementById('modalAthleteDetailRegNo');
    if (modalRegNo) modalRegNo.textContent = `No. Reg: ${regNo}`;

    const statusEl = document.getElementById('modalAthleteDetailStatus');
    if (statusEl) {
        statusEl.innerHTML = a.status === 'verified'
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs"><i class="fa-solid fa-circle-check"></i> VERIFIED</span>`
            : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-xs"><i class="fa-solid fa-clock"></i> PENDING — Belum Diverifikasi</span>`;
    }

    const verifyBtn = document.getElementById('modalAthleteVerifyBtn');
    if (verifyBtn) {
        if (a.status === 'pending') {
            verifyBtn.classList.remove('hidden');
            verifyBtn.onclick = () => { verifyAthlete(id); closeAthleteDetailModal(); };
        } else {
            verifyBtn.classList.add('hidden');
        }
    }

    const body = document.getElementById('modalAthleteDetailBody');
    if (!body) return;

    const row = (label, val) => val ? `
        <div class="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-2">
            <span class="text-[10px] text-slate-400 uppercase tracking-wide font-bold sm:w-32 shrink-0 pt-0.5">${label}</span>
            <span class="text-xs font-semibold text-[#0F172A] flex-1 break-words">${val}</span>
        </div>` : '';

    const section = (title, icon, rows) => `
        <div class="border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div class="bg-[#F4F6F9] px-4 py-2 flex items-center gap-2 border-b border-[#E2E8F0]">
                <i class="fa-solid ${icon} text-[#DC2626] text-xs"></i>
                <span class="text-xs font-black uppercase tracking-wider text-[#0F172A]">${title}</span>
            </div>
            <div class="px-4 py-3 space-y-2">
                ${rows.filter(Boolean).join('')}
            </div>
        </div>`;

    body.innerHTML = `
        ${section('Profil Game', 'fa-gamepad', [
            row('Nickname', a.nickname),
            row('Game ID / UID', a.gameId),
            row('Divisi', a.division),
            row('Tim / Komunitas', a.teamName),
            row('Poin Klasemen', (a.points || 0) + ' poin'),
            row('No. Registrasi', `<span class="font-mono text-amber-700">${regNo}</span>`),
            row('Username Akun', a.username || '-'),
        ])}
        ${section('Data Pribadi', 'fa-user', [
            row('Nama Lengkap', a.fullName),
            row('Jenis Kelamin', a.jenisKelamin),
            row('Tempat Lahir', a.tempatLahir),
            row('Tanggal Lahir', a.tanggalLahir),
            row('Agama', a.agama),
            row('Status', a.statusPekerjaan + (a.jenjang ? ' — ' + a.jenjang : '')),
            row('Instansi / Sekolah', a.institution),
        ])}
        ${section('Kontak & Domisili', 'fa-location-dot', [
            row('WhatsApp', `<a href="https://wa.me/${(a.whatsapp||'').replace(/\D/g,'')}" target="_blank" class="text-emerald-600 hover:underline font-bold"><i class="fa-brands fa-whatsapp mr-1"></i>${a.whatsapp}</a>`),
            row('Email', a.email || '-'),
            row('Alamat', [a.alamat, a.rt ? `RT ${a.rt}` : '', a.rw ? `RW ${a.rw}` : ''].filter(Boolean).join(', ')),
            row('Desa / Kelurahan', a.desa),
            row('Kecamatan', a.kecamatan ? `Kec. ${a.kecamatan}` : ''),
            row('Kabupaten', a.kabupaten || 'Kabupaten Trenggalek'),
            row('Provinsi', a.provinsi || 'Jawa Timur'),
            row('Kode Pos', a.kodepos),
        ])}
        ${section('Akun & Keamanan (Set Password Pengguna)', 'fa-key', [
            row('Username Akun', `<span class="font-bold font-mono text-[#0F172A]">${a.username || a.whatsapp || '-'}</span>`),
            `
            <div class="pt-2 border-t border-slate-100 space-y-2">
                <span class="text-[10px] text-slate-500 uppercase tracking-wide font-bold block">Ubah / Reset Kata Sandi User:</span>
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div class="relative flex-1">
                        <input type="text" id="adminSetPassInput-${a.id}" placeholder="Ketik kata sandi baru untuk user ini..."
                            class="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 focus:border-[#DC2626] text-xs font-mono text-[#0F172A]">
                    </div>
                    <button type="button" onclick="handleAdminSetUserPassword(${a.id})"
                        class="px-3.5 py-2 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 shadow-xs">
                        <i class="fa-solid fa-floppy-disk text-xs"></i> Simpan Password
                    </button>
                    <button type="button" onclick="handleAdminQuickResetPassword(${a.id})"
                        class="px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition flex items-center justify-center gap-1 shrink-0" title="Reset cepat ke ESI123">
                        <i class="fa-solid fa-bolt text-xs"></i> Set 'ESI123'
                    </button>
                </div>
                <p class="text-[10px] text-slate-400">Gunakan fitur ini jika atlet/anggota lupa kata sandi. Setelah disimpan, Anda dapat langsung menginformasikan password baru ke WhatsApp atlet.</p>
            </div>
            `
        ])}
    `;

    const modal = document.getElementById('modalAthleteDetail');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

async function handleAdminSetUserPassword(athleteId) {
    const input = document.getElementById(`adminSetPassInput-${athleteId}`);
    const newPass = (input ? input.value : '').trim();
    if (!newPass) {
        showToast('Password Kosong', 'Harap ketik kata sandi baru untuk pengguna ini.');
        if (input) input.focus();
        return;
    }
    if (newPass.length < 4) {
        showToast('Password Terlalu Pendek', 'Password minimal 4 karakter.');
        return;
    }

    const a = athletes.find(x => x.id == athleteId);
    if (!a) return;

    // Pop-up konfirmasi meyakinkan admin sebelum mengubah kata sandi
    if (!confirm(`Konfirmasi Perubahan Kata Sandi:\n\n• Nama: ${a.fullName} (${a.nickname})\n• Username: ${a.username || a.whatsapp}\n• Kata Sandi Baru: "${newPass}"\n\nApakah Anda yakin ingin menyimpan kata sandi baru ini sekarang?`)) {
        showToast('Dibatalkan', 'Perubahan kata sandi dibatalkan.');
        return;
    }

    await Api.updateAthletePassword(athleteId, newPass);
    athletes = await Api.getAthletes();

    if (loggedMember && loggedMember.id == athleteId) {
        loggedMember.password = newPass;
        loggedMember.password_hash = newPass;
        localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(loggedMember));
    }

    if (input) input.value = '';
    showToast('Password Disimpan! 🔑', `Kata sandi untuk ${a.nickname} (${a.fullName}) berhasil diperbarui.`);

    const waPhone = (a.whatsapp || '').replace(/\D/g, '');
    if (waPhone) {
        const waMsg = `Halo ${a.nickname},\nKata sandi akun portal ESI Trenggalek Anda telah diatur ulang oleh Admin.\n\nUsername: ${a.username || a.whatsapp}\nPassword Baru: ${newPass}\n\nSilakan login di https://esitrenggalek.id. Terima kasih!`;
        const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;
        setTimeout(() => {
            if (confirm(`Password berhasil disimpan!\n\nKirimkan rincian kata sandi baru ke WhatsApp atlet (${a.whatsapp}) sekarang?`)) {
                window.open(waUrl, '_blank');
            }
        }, 300);
    }
}

async function handleAdminQuickResetPassword(athleteId) {
    const defaultPass = 'ESI123';
    const a = athletes.find(x => x.id == athleteId);
    if (!a) return;

    // Pop-up konfirmasi meyakinkan admin sebelum quick reset
    if (!confirm(`Konfirmasi Reset Kata Sandi:\n\n• Nama: ${a.fullName} (${a.nickname})\n• Username: ${a.username || a.whatsapp}\n• Kata Sandi Baru: "${defaultPass}"\n\nApakah Anda yakin ingin mereset kata sandi akun ini ke "${defaultPass}"?`)) {
        showToast('Dibatalkan', 'Reset kata sandi dibatalkan.');
        return;
    }

    await Api.updateAthletePassword(athleteId, defaultPass);
    athletes = await Api.getAthletes();

    if (loggedMember && loggedMember.id == athleteId) {
        loggedMember.password = defaultPass;
        loggedMember.password_hash = defaultPass;
        localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(loggedMember));
    }

    showToast('Password Direset! 🔑', `Password akun ${a.nickname} kini diatur ke: "${defaultPass}"`);

    const waPhone = (a.whatsapp || '').replace(/\D/g, '');
    if (waPhone) {
        const waMsg = `Halo ${a.nickname},\nKata sandi akun portal ESI Trenggalek Anda telah diatur ulang oleh Admin.\n\nUsername: ${a.username || a.whatsapp}\nPassword Baru: ${defaultPass}\n\nSilakan login di https://esitrenggalek.id. Terima kasih!`;
        const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;
        setTimeout(() => {
            if (confirm(`Password telah diatur ke "${defaultPass}".\n\nKirimkan informasi ini ke WhatsApp atlet sekarang?`)) {
                window.open(waUrl, '_blank');
            }
        }, 300);
    }
}

function openAdminSetPasswordPrompt(athleteId) {
    const a = athletes.find(x => x.id == athleteId);
    if (!a) return;

    // 1. Pop-up konfirmasi awal untuk meyakinkan admin
    if (!confirm(`Konfirmasi Reset Kata Sandi:\n\n• Nama Lengkap: ${a.fullName}\n• Nickname: ${a.nickname}\n• Username: ${a.username || a.whatsapp}\n• Divisi: ${a.division || '-'}\n\nApakah Anda yakin ingin mengatur ulang kata sandi akun ini?`)) {
        return;
    }

    // 2. Input kata sandi baru
    const newPass = prompt(`Tentukan Kata Sandi Baru untuk ${a.nickname}:\n(Akun: ${a.fullName} | Username: ${a.username || a.whatsapp})`, 'ESI123');
    if (newPass === null) return;
    const trimmed = newPass.trim();
    if (!trimmed) {
        showToast('Batal', 'Password tidak boleh kosong.');
        return;
    }
    if (trimmed.length < 4) {
        showToast('Password Terlalu Pendek', 'Password minimal 4 karakter.');
        return;
    }

    // 3. Pop-up konfirmasi final sebelum password disimpan
    if (!confirm(`Yakin Simpan Perubahan Kata Sandi?\n\n• Akun: ${a.fullName} (${a.nickname})\n• Username: ${a.username || a.whatsapp}\n• Kata Sandi Baru: "${trimmed}"\n\nKlik OK untuk menerapkan kata sandi baru ini.`)) {
        showToast('Dibatalkan', 'Perubahan kata sandi dibatalkan.');
        return;
    }

    Api.updateAthletePassword(athleteId, trimmed).then(async () => {
        athletes = await Api.getAthletes();
        if (loggedMember && loggedMember.id == athleteId) {
            loggedMember.password = trimmed;
            loggedMember.password_hash = trimmed;
            localStorage.setItem(CONFIG.STORAGE_KEYS.MEMBER_SESSION, JSON.stringify(loggedMember));
        }
        showToast('Password Disimpan! 🔑', `Password untuk ${a.nickname} berhasil diubah menjadi "${trimmed}".`);

        const waPhone = (a.whatsapp || '').replace(/\D/g, '');
        if (waPhone) {
            const waMsg = `Halo ${a.nickname},\nKata sandi akun portal ESI Trenggalek Anda telah diatur ulang oleh Admin.\n\nUsername: ${a.username || a.whatsapp}\nPassword Baru: ${trimmed}\n\nSilakan login di https://esitrenggalek.id. Terima kasih!`;
            const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;
            setTimeout(() => {
                if (confirm(`Password berhasil disimpan!\n\nKirimkan rincian kata sandi baru ke WhatsApp atlet (${a.whatsapp})?`)) {
                    window.open(waUrl, '_blank');
                }
            }, 300);
        }
    });
}

function closeAthleteDetailModal() {
    const modal = document.getElementById('modalAthleteDetail');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function exportAthletesCSV() {
    if (!athletes || athletes.length === 0) {
        showToast('Tidak Ada Data', 'Belum ada data atlet yang bisa diekspor.');
        return;
    }
    const headers = ['No.Reg','Nickname','Nama Lengkap','Jenis Kelamin','Tanggal Lahir','Tempat Lahir','Agama',
        'Status Pekerjaan','Jenjang','Instansi/Sekolah','Divisi','Game ID','Tim','Poin',
        'WhatsApp','Email','Alamat','RT','RW','Desa','Kecamatan','Kode Pos','Status Verifikasi'];
    const rows = athletes.map(a => {
        const reg = getAthleteRegNo(a);
        return [reg, a.nickname, a.fullName, a.jenisKelamin, a.tanggalLahir, a.tempatLahir, a.agama,
            a.statusPekerjaan, a.jenjang, a.institution, a.division, a.gameId, a.teamName, a.points || 0,
            a.whatsapp, a.email, a.alamat, a.rt, a.rw, a.desa, a.kecamatan, a.kodepos, a.status
        ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`);
    });

    const csv = '\uFEFF' + [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Atlet_ESI_Trenggalek_${new Date().toLocaleDateString('id-ID').replace(/\//g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export Berhasil', `${athletes.length} data atlet berhasil diekspor ke file CSV.`);
}

async function verifyAthlete(id) {
    const target = athletes.find(a => a.id == id);
    if (target) {
        await Api.updateAthleteStatus(id, 'verified');
        athletes = await Api.getAthletes();
        renderAdminView();
        showToast('Atlet Diverifikasi', `${target.nickname} kini berstatus Verified dan tampil di database publik.`);
    }
}

async function updateAthletePoints(id) {
    const target = athletes.find(a => a.id == id);
    const input = document.getElementById(`ptsInput-${id}`);
    if (target && input) {
        const val = parseInt(input.value, 10) || 0;
        await Api.updateAthletePoints(id, val);
        athletes = await Api.getAthletes();
        showToast('Poin Diperbarui', `Poin ${target.nickname} diubah menjadi ${val.toLocaleString('id-ID')}.`);
    }
}

async function deleteAthlete(id) {
    const a = athletes.find(x => x.id == id);
    const athleteLabel = a ? `${a.fullName} (${a.nickname})` : 'atlet ini';
    const usernameLabel = a && a.username ? a.username : (a ? a.whatsapp : '-');
    const divLabel = a && a.division ? a.division : '-';

    if (!confirm(`Konfirmasi Hapus Akun Anggota / Atlet:\n\n• Nama Lengkap: ${athleteLabel}\n• Username: ${usernameLabel}\n• Divisi: ${divLabel}\n\n⚠️ PERINGATAN: Tindakan ini permanen. Akun, data keanggotaan, dan akumulasi poin akan dihapus dari sistem.\n\nApakah Anda benar-benar yakin ingin menghapus akun ini?`)) {
        return;
    }

    await Api.deleteAthlete(id);
    athletes = await Api.getAthletes();
    renderAdminView();
    showToast('Akun Dihapus 🗑️', `Data akun ${athleteLabel} telah berhasil dihapus dari sistem.`);
}

// Admin Tab 2: Kelola Event
// =========================================================================
// AUTO IMAGE COMPRESSION & WEBP CONVERTER ENGINE (NEWS & TOURNAMENTS)
// =========================================================================

/**
 * Format ukuran byte ke teks yang mudah dibaca (B, KB, MB)
 */
function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Auto Image Compression & WebP Converter
 * Mengonversi otomatis gambar JPG, JPEG, PNG, dan WebP ke format WebP berkualitas tinggi
 * Target ukuran file <= 500 KB tanpa kehilangan detail/ketajaman visual (Visually Lossless)
 * Preservasi rasio aspek secara presisi untuk banner berita & poster turnamen.
 *
 * @param {File|Blob} file - Objek file gambar input
 * @param {Object} [options] - Opsi kompresi
 * @param {number} [options.maxDimension=1600] - Batas resolusi sisi terpanjang
 * @param {number} [options.targetMaxBytes=512000] - Target ukuran maksimal (500 KB)
 * @param {number} [options.initialQuality=0.82] - Kualitas awal WebP (0.80 - 0.85)
 * @returns {Promise<{
 *   dataUrl: string,
 *   originalSize: number,
 *   compressedSize: number,
 *   width: number,
 *   height: number,
 *   savingsPercent: number,
 *   format: string
 * }>}
 */
function compressImageToWebP(file, options = {}) {
    const maxDim = options.maxDimension || 1600;
    const targetMaxBytes = options.targetMaxBytes || (500 * 1024); // 500 KB
    const initialQuality = options.initialQuality || 0.82;

    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return reject(new Error('File yang dipilih bukan merupakan format gambar yang valid.'));
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Gagal membaca file gambar dari perangkat.'));
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Gagal memproses file gambar. Pastikan file tidak rusak.'));
            img.onload = () => {
                let { width, height } = img;

                // 1. Hitung rasio aspek proporsional (Tanpa merusak rasio/dimensi asli)
                if (width > maxDim || height > maxDim) {
                    if (width >= height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }

                // 2. Siapkan canvas resolusi proporsional
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d', { alpha: true });

                if (!ctx) {
                    return reject(new Error('Konteks Canvas 2D tidak tersedia di browser.'));
                }

                // Interpolasi citra bermutu tinggi untuk ketajaman grafis maksimal
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // 3. Konversi ke WebP dan uji ukuran file secara adaptif
                let currentQuality = initialQuality;
                let dataUrl = '';
                let byteLength = 0;
                let isWebpSupported = true;

                // Verifikasi dukungan WebP di browser
                const testExport = canvas.toDataURL('image/webp', 0.8);
                if (!testExport.startsWith('data:image/webp')) {
                    isWebpSupported = false;
                }

                const mimeType = isWebpSupported ? 'image/webp' : 'image/jpeg';

                // Optimasi bertingkat: capai target <= 500 KB dengan kualitas visual tetap tajam
                while (currentQuality >= 0.55) {
                    dataUrl = canvas.toDataURL(mimeType, currentQuality);
                    const base64Content = dataUrl.split(',')[1] || '';
                    byteLength = Math.round(base64Content.length * 0.75);

                    if (byteLength <= targetMaxBytes || currentQuality <= 0.60) {
                        break;
                    }
                    currentQuality -= 0.08;
                }

                const originalSize = file.size || byteLength;
                const compressedSize = byteLength;
                const savingsPercent = originalSize > compressedSize
                    ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
                    : 0;

                resolve({
                    dataUrl,
                    originalSize,
                    compressedSize,
                    width,
                    height,
                    savingsPercent,
                    format: isWebpSupported ? 'WebP' : 'JPEG (Fallback)'
                });
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ==================== ADMIN: POSTER EVENT UPLOAD ====================
let adminEventPosterBase64 = '';

async function previewEventPoster(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
        showToast('File Terlalu Besar', 'Maksimal ukuran file foto adalah 15MB.');
        input.value = '';
        return;
    }

    const preview = document.getElementById('evPosterPreviewImg');
    const wrap = document.getElementById('evPosterPreviewWrap');
    const prompt = document.getElementById('evPosterUploadPrompt');
    const clearRow = document.getElementById('evPosterClearRow');
    const fileName = document.getElementById('evPosterFileName');

    showToast('Mengompresi Poster...', 'Mengonversi gambar ke format WebP tajam & hemat storage.');

    try {
        const res = await compressImageToWebP(file, {
            maxDimension: 1600,
            targetMaxBytes: 500 * 1024,
            initialQuality: 0.85
        });

        adminEventPosterBase64 = res.dataUrl;

        if (preview) preview.src = res.dataUrl;
        if (wrap) wrap.classList.remove('hidden');
        if (prompt) prompt.classList.add('hidden');
        if (clearRow) clearRow.classList.remove('hidden');
        if (fileName) {
            fileName.innerHTML = `<span class="text-slate-800 font-bold">${file.name}</span> <span class="text-emerald-600 font-bold ml-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">WebP ${formatBytes(res.compressedSize)} (Hemat ${res.savingsPercent}%)</span>`;
        }

        showToast('Poster Teroptimasi Otomatis', `Berhasil dikonversi ke WebP: ${formatBytes(res.originalSize)} ➔ ${formatBytes(res.compressedSize)} (Hemat ${res.savingsPercent}%).`);
    } catch (err) {
        console.error('Error saat kompresi poster turnamen:', err);
        showToast('Gagal Memproses Gambar', err.message || 'Gagal memproses file poster.');
        clearEventPoster();
    }
}

function clearEventPoster() {
    adminEventPosterBase64 = '';
    const input = document.getElementById('evPosterInput');
    if (input) input.value = '';
    const wrap = document.getElementById('evPosterPreviewWrap');
    const prompt = document.getElementById('evPosterUploadPrompt');
    const clearRow = document.getElementById('evPosterClearRow');
    const fileName = document.getElementById('evPosterFileName');
    if (wrap) wrap.classList.add('hidden');
    if (prompt) prompt.classList.remove('hidden');
    if (clearRow) clearRow.classList.add('hidden');
    if (fileName) fileName.innerHTML = '';
}

// ==================== SUB-VIEW CONTROLLER: KELOLA EVENT ====================
function openAdminEventForm(editId = null) {
    const listView = document.getElementById('adminEventListView');
    const formView = document.getElementById('adminEventFormView');
    if (listView) listView.classList.add('hidden');
    if (formView) formView.classList.remove('hidden');

    const editIdInput = document.getElementById('editEventId');
    const form = document.querySelector('#adminEventFormView form');
    const titleEl = document.getElementById('adminEventFormTitle');
    const subEl = document.getElementById('adminEventFormSub');
    const badgeEl = document.getElementById('adminEventEditBadge');
    const submitBtnText = document.getElementById('btnSubmitEventText');

    if (editId) {
        const ev = events.find(e => String(e.id) === String(editId));
        if (ev) {
            if (editIdInput) editIdInput.value = editId;
            if (titleEl) titleEl.textContent = 'Edit Jadwal Turnamen';
            if (subEl) subEl.textContent = 'Perbarui informasi turnamen, lokasi, hadiah, status, atau poster.';
            if (badgeEl) badgeEl.classList.remove('hidden');
            if (submitBtnText) submitBtnText.textContent = 'Simpan Perubahan';

            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined && val !== null ? val : ''; };
            setVal('evTitleInput', ev.title);
            setVal('evDivInput', ev.division || 'Semua Divisi');
            setVal('evDateInput', ev.date);
            setVal('evLocInput', ev.location);
            setVal('evStatusInput', ev.status || 'Upcoming');
            setVal('evPrizeInput', ev.prizePool || ev.prize || '');
            setVal('evFeeInput', ev.fee || 'Gratis');
            setVal('evSlotsInput', ev.slots || 32);
            setVal('evFormatInput', ev.format || '');
            setVal('evDescInput', ev.description || '');
            setVal('evRulesInput', ev.rules || '');
            setVal('evContactInput', ev.contact || '');

            if (ev.imageUrl) {
                adminEventPosterBase64 = ev.imageUrl;
                const wrap = document.getElementById('evPosterPreviewWrap');
                const img = document.getElementById('evPosterPreviewImg');
                const prompt = document.getElementById('evPosterUploadPrompt');
                const clearRow = document.getElementById('evPosterClearRow');
                const nameSpan = document.getElementById('evPosterFileName');
                if (wrap && img) { img.src = ev.imageUrl; wrap.classList.remove('hidden'); }
                if (prompt) prompt.classList.add('hidden');
                if (clearRow) clearRow.classList.remove('hidden');
                if (nameSpan) nameSpan.textContent = 'Poster turnamen tersimpan';
            } else {
                clearEventPoster();
            }
        }
    } else {
        if (editIdInput) editIdInput.value = '';
        if (form) form.reset();
        clearEventPoster();
        if (titleEl) titleEl.textContent = 'Buat Turnamen / Jadwal Event Baru';
        if (subEl) subEl.textContent = 'Lengkapi informasi jadwal, divisi, rules, dan poster turnamen.';
        if (badgeEl) badgeEl.classList.add('hidden');
        if (submitBtnText) submitBtnText.textContent = 'Publikasikan Event';
    }

    if (formView) formView.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAdminEventForm() {
    const listView = document.getElementById('adminEventListView');
    const formView = document.getElementById('adminEventFormView');
    if (formView) formView.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');

    const editIdInput = document.getElementById('editEventId');
    if (editIdInput) editIdInput.value = '';
    const form = document.querySelector('#adminEventFormView form');
    if (form) form.reset();
    clearEventPoster();
}

function editEvent(id) {
    openAdminEventForm(id);
}

async function handleAdminAddEvent(e) {
    e.preventDefault();
    const editId = (document.getElementById('editEventId')?.value || '').trim();

    const evData = {
        title: document.getElementById('evTitleInput').value.trim(),
        division: document.getElementById('evDivInput').value,
        date: document.getElementById('evDateInput').value.trim(),
        location: document.getElementById('evLocInput').value.trim(),
        status: document.getElementById('evStatusInput').value,
        description: document.getElementById('evDescInput').value.trim(),
        prizePool: document.getElementById('evPrizeInput')?.value.trim() || 'Piala Bergilir & E-Sertifikat',
        fee: document.getElementById('evFeeInput')?.value.trim() || 'Gratis',
        slots: parseInt(document.getElementById('evSlotsInput')?.value) || 32,
        format: document.getElementById('evFormatInput')?.value.trim() || 'Knockout / Best of 3 (BO3)',
        rosterFormat: '5 Pemain Utama + 1 Cadangan',
        category: 'Umum & Pelajar Trenggalek',
        organizer: 'ESI Trenggalek',
        rules: document.getElementById('evRulesInput')?.value.trim() || '',
        contact: document.getElementById('evContactInput')?.value.trim() || ''
    };

    if (adminEventPosterBase64) {
        evData.imageUrl = adminEventPosterBase64;
    }

    if (editId) {
        await Api.updateEvent(editId, evData);
        showToast('Turnamen Diperbarui', 'Perubahan jadwal dan data turnamen berhasil disimpan.');
    } else {
        await Api.createEvent({ ...evData, imageUrl: adminEventPosterBase64 || '' });
        showToast('Event Ditambahkan', 'Jadwal turnamen baru telah dipublikasikan.');
    }

    adminEventPosterBase64 = '';
    events = await Api.getEvents();
    closeAdminEventForm();
    renderAdminEvents();
    if (typeof renderEventsView === 'function') renderEventsView();
    if (typeof renderHomeView === 'function') renderHomeView();
}

function renderAdminEvents() {
    const list = document.getElementById('adminEventList');
    if (!list) return;

    const searchQ = (document.getElementById('adminEventSearchInput')?.value || '').trim().toLowerCase();
    const divFilter = document.getElementById('adminEventDivFilter')?.value || 'all';
    const statusFilter = document.getElementById('adminEventStatusFilter')?.value || 'all';

    let filtered = events.filter(ev => {
        if (divFilter !== 'all' && ev.division !== divFilter) return false;
        if (statusFilter !== 'all' && ev.status !== statusFilter) return false;
        if (searchQ) {
            const haystack = [ev.title, ev.location, ev.division, ev.organizer].join(' ').toLowerCase();
            if (!haystack.includes(searchQ)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="p-8 text-center text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
            <i class="fa-solid fa-trophy text-3xl text-slate-300 mb-2 block"></i>
            Tidak ada turnamen yang ditemukan. Silakan sesuaikan filter atau buat turnamen baru.
        </div>`;
        return;
    }

    list.innerHTML = filtered.map(ev => {
        const regs = Api.getLocalTournamentRegistrations(ev.id);
        const totalRegs = regs.length;
        const verifiedCount = regs.filter(r => r.status === 'verified').length;
        const pendingCount = regs.filter(r => r.status === 'pending').length;
        const maxSlots = ev.slots ? parseInt(ev.slots, 10) : 32;

        let statusClass = "bg-amber-50 text-amber-700 border-amber-200";
        if (ev.status === 'Ongoing') statusClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (ev.status === 'Selesai') statusClass = "bg-slate-100 text-slate-600 border-slate-200";

        return `
            <div class="border border-slate-200 hover:border-slate-300 rounded-2xl p-4 sm:p-5 bg-white shadow-sm transition hover:shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded-lg bg-[#0F172A] text-white text-[11px] font-black uppercase tracking-wider">${ev.division}</span>
                        <span class="px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${statusClass}">${ev.status}</span>
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-black">
                            <i class="fa-solid fa-users text-[10px]"></i> ${totalRegs} / ${maxSlots} Tim Terdaftar
                        </span>
                        ${pendingCount > 0 ? `
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-red-50 border border-red-200 text-[#DC2626] text-[11px] font-extrabold animate-pulse">
                            <i class="fa-solid fa-circle-exclamation text-[10px]"></i> ${pendingCount} Menunggu Verifikasi
                        </span>` : ''}
                    </div>

                    <h4 class="font-black text-base sm:text-lg text-[#0F172A] mb-1 truncate">${ev.title}</h4>
                    
                    <div class="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 font-medium">
                        <span><i class="fa-regular fa-calendar text-slate-400 mr-1.5"></i>${ev.date}</span>
                        <span><i class="fa-solid fa-location-dot text-slate-400 mr-1.5"></i>${ev.location}</span>
                        ${ev.prizePool || ev.prize ? `<span><i class="fa-solid fa-award text-amber-500 mr-1.5"></i>${ev.prizePool || ev.prize}</span>` : ''}
                        ${ev.fee ? `<span><i class="fa-solid fa-ticket text-slate-400 mr-1.5"></i>${ev.fee}</span>` : ''}
                    </div>
                </div>

                <div class="pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 flex flex-col sm:flex-row lg:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <!-- Tombol Utama: Kelola Pendaftar -->
                    <button onclick="openAdminTournamentRegsModal(${ev.id})"
                        class="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#DC2626] active:scale-[0.98] text-white text-xs font-black transition flex items-center justify-center gap-2 shadow-sm group">
                        <i class="fa-solid fa-users text-xs group-hover:scale-110 transition-transform"></i>
                        <span>Kelola Pendaftar</span>
                        <span class="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-black">${totalRegs}</span>
                    </button>

                    <!-- Baris Tombol Aksi Pendukung (Edit, Excel, Status, Hapus) -->
                    <div class="flex items-center gap-2 justify-between sm:justify-start">
                        <!-- Tombol Edit Turnamen -->
                        <button onclick="editEvent(${ev.id})" title="Edit Turnamen"
                            class="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95">
                            <i class="fa-solid fa-pen-to-square"></i>
                            <span>Edit</span>
                        </button>

                        <!-- Tombol Ekspor Excel Cepat -->
                        <button onclick="exportTournamentTeamsExcel(${ev.id})"
                            title="Unduh Data Pendaftar Excel (.xls)"
                            class="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 flex items-center justify-center transition shadow-2xs shrink-0 active:scale-95">
                            <i class="fa-solid fa-file-excel text-sm"></i>
                        </button>

                        <!-- Dropdown Ubah Status -->
                        <select onchange="changeEventStatus(${ev.id}, this.value)"
                            class="flex-1 sm:flex-initial h-9 px-2.5 rounded-xl bg-[#F8FAFC] border border-slate-300 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F172A] shadow-2xs">
                            <option value="Upcoming" ${ev.status === 'Upcoming' ? 'selected' : ''}>Upcoming</option>
                            <option value="Ongoing" ${ev.status === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
                            <option value="Selesai" ${ev.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                        </select>

                        <!-- Tombol Hapus Event -->
                        <button onclick="deleteEvent(${ev.id})"
                            title="Hapus Turnamen"
                            class="w-9 h-9 rounded-xl bg-red-50 hover:bg-[#DC2626] text-[#DC2626] hover:text-white border border-red-200 flex items-center justify-center transition shadow-2xs shrink-0 active:scale-95">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function changeEventStatus(id, newStatus) {
    await Api.updateEventStatus(id, newStatus);
    events = await Api.getEvents();
    showToast('Status Event Diubah', `Status turnamen diubah menjadi ${newStatus}.`);
}

async function deleteEvent(id) {
    const ev = events.find(e => e.id == id);
    const evTitle = ev ? ` "${ev.title}"` : '';
    if (confirm(`Apakah Anda yakin ingin menghapus turnamen${evTitle}? Poster dan seluruh file gambar terkait akan dihapus bersih dari storage.`)) {
        await Api.deleteEvent(id);
        events = await Api.getEvents();
        renderAdminEvents();
        if (typeof renderEventsView === 'function') renderEventsView();
        if (typeof renderHomeView === 'function') renderHomeView();
        showToast('Turnamen Dihapus', 'Jadwal turnamen telah dihapus.');
    }
}

// Admin Tab 3: Kelola Berita
let newsSelectedImageBase64 = '';

// ==================== CONTROLLER CROP FOTO SAMPUL BERITA ====================
let _cropperState = {
    rawSource: '',
    img: null,
    aspectRatio: 16 / 9,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartOffsetX: 0,
    dragStartOffsetY: 0,
    listenersAttached: false
};

async function previewNewsImage(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
        showToast('File Terlalu Besar', 'Maksimal ukuran foto adalah 15MB.');
        e.target.value = '';
        return;
    }

    showToast('Membuka Foto...', 'Mempersiapkan alat pemotong foto sampul.');
    const reader = new FileReader();
    reader.onload = function(evt) {
        const rawDataUrl = evt.target.result;
        openCoverCropperModal(rawDataUrl);
    };
    reader.onerror = function() {
        showToast('Gagal Membaca File', 'Terjadi kesalahan saat membaca file foto.');
    };
    reader.readAsDataURL(file);
}

function handleNewsImageUrl(url) {
    const trimmed = url.trim();
    if (!trimmed) {
        clearNewsImagePreview();
    currentDraftInlineImages = {};
        return;
    }
    newsSelectedImageBase64 = trimmed;
    const fileInput = document.getElementById('newsImageFileInput');
    if (fileInput) fileInput.value = '';

    const container = document.getElementById('newsImagePreviewContainer');
    const img = document.getElementById('newsImagePreview');
    const badge = document.getElementById('newsImageOptimizedInfo');
    if (container && img) {
        img.src = trimmed;
        container.classList.remove('hidden');
    }
    if (badge) {
        badge.innerHTML = '<span class="text-[11px] font-medium text-slate-500">Tautan Gambar Eksternal • Klik "Atur / Crop Ulang" jika ingin memotong</span>';
    }
}

function clearNewsImagePreview() {
    newsSelectedImageBase64 = '';
    const fileInput = document.getElementById('newsImageFileInput');
    if (fileInput) fileInput.value = '';
    const urlInput = document.getElementById('newsImageUrlInput');
    if (urlInput) urlInput.value = '';
    const container = document.getElementById('newsImagePreviewContainer');
    if (container) container.classList.add('hidden');
    const badge = document.getElementById('newsImageOptimizedInfo');
    if (badge) badge.innerHTML = '';
}

function openCoverCropperModal(imageSource) {
    let src = imageSource;
    if (!src) {
        src = newsSelectedImageBase64 || (document.getElementById('newsImageUrlInput')?.value || '').trim();
    }
    if (!src) {
        const fileInput = document.getElementById('newsImageFileInput');
        if (fileInput) fileInput.click();
        return;
    }

    _cropperState.rawSource = src;
    _cropperState.zoom = 1;
    _cropperState.offsetX = 0;
    _cropperState.offsetY = 0;
    _cropperState.isDragging = false;

    const slider = document.getElementById('cropperZoomSlider');
    if (slider) slider.value = 1;
    const zoomText = document.getElementById('cropperZoomVal');
    if (zoomText) zoomText.textContent = '100%';

    const modal = document.getElementById('modalCoverCropper');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    showToast('Memuat Gambar...', 'Mempersiapkan editor foto sampul.');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
        _cropperState.img = img;
        initCropperCanvas();
        drawCropper();
    };
    img.onerror = function() {
        showToast('Gagal Memuat Foto', 'URL gambar tidak dapat diakses atau diblokir CORS. Coba unggah file langsung dari perangkat.');
        closeCoverCropperModal();
    };
    img.src = src;
}

function closeCoverCropperModal() {
    const modal = document.getElementById('modalCoverCropper');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    _cropperState.isDragging = false;
}

function initCropperCanvas() {
    const canvas = document.getElementById('cropperCanvas');
    if (!canvas) return;

    if (!_cropperState.listenersAttached) {
        _cropperState.listenersAttached = true;

        canvas.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            _cropperState.isDragging = true;
            _cropperState.dragStartX = e.clientX;
            _cropperState.dragStartY = e.clientY;
            _cropperState.dragStartOffsetX = _cropperState.offsetX;
            _cropperState.dragStartOffsetY = _cropperState.offsetY;
            if (canvas.setPointerCapture) {
                try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            }
        });

        canvas.addEventListener('pointermove', function(e) {
            if (!_cropperState.isDragging) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) return;
            const scaleFactor = canvas.width / rect.width;
            const dx = (e.clientX - _cropperState.dragStartX) * scaleFactor;
            const dy = (e.clientY - _cropperState.dragStartY) * scaleFactor;
            _cropperState.offsetX = _cropperState.dragStartOffsetX + dx;
            _cropperState.offsetY = _cropperState.dragStartOffsetY + dy;
            drawCropper();
        });

        const stopDrag = function(e) {
            _cropperState.isDragging = false;
            if (canvas.releasePointerCapture) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
            }
        };

        canvas.addEventListener('pointerup', stopDrag);
        canvas.addEventListener('pointercancel', stopDrag);

        canvas.addEventListener('wheel', function(e) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.08 : -0.08;
            const newZoom = Math.max(1, Math.min(3, _cropperState.zoom + delta));
            onCropperZoomChange(newZoom);
        }, { passive: false });
    }

    let ratio = _cropperState.aspectRatio;
    if (!ratio || ratio <= 0) {
        ratio = (_cropperState.img && _cropperState.img.naturalWidth && _cropperState.img.naturalHeight)
            ? (_cropperState.img.naturalWidth / _cropperState.img.naturalHeight)
            : (16 / 9);
    }

    const targetWidth = 1280;
    const targetHeight = Math.round(targetWidth / ratio);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const viewport = document.getElementById('cropperViewport');
    if (viewport) {
        viewport.style.aspectRatio = String(ratio);
    }
}

function drawCropper() {
    const canvas = document.getElementById('cropperCanvas');
    if (!canvas || !_cropperState.img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = _cropperState.img;
    const baseScale = Math.max(canvas.width / img.width, canvas.height / img.height);
    const scale = baseScale * _cropperState.zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    const maxOffsetX = Math.max(0, (drawW - canvas.width) / 2);
    const maxOffsetY = Math.max(0, (drawH - canvas.height) / 2);

    _cropperState.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, _cropperState.offsetX));
    _cropperState.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, _cropperState.offsetY));

    const drawX = (canvas.width - drawW) / 2 + _cropperState.offsetX;
    const drawY = (canvas.height - drawH) / 2 + _cropperState.offsetY;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

function setCropperAspectRatio(ratio, btnEl) {
    _cropperState.aspectRatio = ratio;

    const btnContainer = document.getElementById('cropperAspectButtons');
    if (btnContainer) {
        btnContainer.querySelectorAll('button').forEach(b => {
            b.className = "px-3 py-1 rounded-lg text-slate-600 hover:text-slate-900 transition font-bold";
        });
    }
    if (btnEl) {
        btnEl.className = "px-3 py-1 rounded-lg bg-white text-[#DC2626] shadow-sm font-black transition";
    }

    const info = document.getElementById('cropperDimensionInfo');
    if (info) {
        if (Math.abs(ratio - 16/9) < 0.01) info.textContent = '16:9 (Standar Berita)';
        else if (Math.abs(ratio - 4/3) < 0.01) info.textContent = '4:3 (Klasik)';
        else if (Math.abs(ratio - 1) < 0.01) info.textContent = '1:1 (Persegi)';
        else if (Math.abs(ratio - 2) < 0.01) info.textContent = '2:1 (Lebar / Banner)';
        else info.textContent = 'Bebas (Rasio Asli Foto)';
    }

    _cropperState.offsetX = 0;
    _cropperState.offsetY = 0;
    initCropperCanvas();
    drawCropper();
}

function onCropperZoomChange(val) {
    _cropperState.zoom = Math.max(1, Math.min(3, Number(val) || 1));
    const slider = document.getElementById('cropperZoomSlider');
    if (slider) slider.value = _cropperState.zoom;
    const zoomText = document.getElementById('cropperZoomVal');
    if (zoomText) zoomText.textContent = `${Math.round(_cropperState.zoom * 100)}%`;
    drawCropper();
}

function quickAlignCropper(position) {
    if (!_cropperState.img) return;
    const canvas = document.getElementById('cropperCanvas');
    if (!canvas) return;

    const baseScale = Math.max(canvas.width / _cropperState.img.width, canvas.height / _cropperState.img.height);
    const scale = baseScale * _cropperState.zoom;
    const drawH = _cropperState.img.height * scale;
    const maxOffsetY = Math.max(0, (drawH - canvas.height) / 2);

    if (position === 'top') {
        _cropperState.offsetY = maxOffsetY;
    } else if (position === 'bottom') {
        _cropperState.offsetY = -maxOffsetY;
    } else {
        _cropperState.offsetX = 0;
        _cropperState.offsetY = 0;
    }
    drawCropper();
}

function resetCropperTransform() {
    _cropperState.zoom = 1;
    _cropperState.offsetX = 0;
    _cropperState.offsetY = 0;
    const slider = document.getElementById('cropperZoomSlider');
    if (slider) slider.value = 1;
    const zoomText = document.getElementById('cropperZoomVal');
    if (zoomText) zoomText.textContent = '100%';
    drawCropper();
}

function applyCoverCrop() {
    const canvas = document.getElementById('cropperCanvas');
    if (!canvas) return;

    let croppedDataUrl = '';
    try {
        croppedDataUrl = canvas.toDataURL('image/webp', 0.88);
        if (!croppedDataUrl.startsWith('data:image/webp')) {
            croppedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
        }
    } catch (e) {
        console.warn('Canvas export error:', e);
        showToast('Gagal Menyimpan Potongan', 'Tidak dapat mengambil hasil potong dari gambar eksternal karena batasan keamanan browser.');
        closeCoverCropperModal();
        return;
    }

    newsSelectedImageBase64 = croppedDataUrl;

    const previewImg = document.getElementById('newsImagePreview');
    const previewContainer = document.getElementById('newsImagePreviewContainer');
    const badge = document.getElementById('newsImageOptimizedInfo');
    const urlInput = document.getElementById('newsImageUrlInput');

    if (urlInput) urlInput.value = '';
    if (previewImg) previewImg.src = croppedDataUrl;
    if (previewContainer) previewContainer.classList.remove('hidden');

    if (badge) {
        badge.innerHTML = `<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"><i class="fa-solid fa-crop-simple"></i> Foto Sampul Dicrop &amp; Dioptimasi (${canvas.width}x${canvas.height})</span>`;
    }

    closeCoverCropperModal();
    showToast('Foto Sampul Diterapkan', 'Bagian foto yang Anda pilih berhasil dipotong dan siap digunakan sebagai cover.');
}

// Alat Bantu Sisipkan Gambar & Format ke Teks Artikel (Modal Interaktif Tanpa Browser Prompt)
let currentInlinePhotoData = '';
let currentDraftInlineImages = {};

function insertImageToContentPrompt() {
    openInlinePhotoModal();
}

function openInlinePhotoModal() {
    currentInlinePhotoData = '';
    const fileInput = document.getElementById('inlinePhotoFileInput');
    if (fileInput) fileInput.value = '';
    const urlInput = document.getElementById('inlinePhotoUrlInput');
    if (urlInput) urlInput.value = '';
    const capInput = document.getElementById('inlinePhotoCaptionInput');
    if (capInput) capInput.value = '';

    const prevWrap = document.getElementById('inlinePhotoPreviewWrapper');
    if (prevWrap) prevWrap.classList.add('hidden');

    switchInlinePhotoTab('upload');

    const modal = document.getElementById('modalInsertInlinePhoto');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeInlinePhotoModal() {
    const modal = document.getElementById('modalInsertInlinePhoto');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function switchInlinePhotoTab(tab) {
    const uploadBox = document.getElementById('inlinePhotoUploadBox');
    const urlBox = document.getElementById('inlinePhotoUrlBox');
    const tabUpload = document.getElementById('tabUploadInline');
    const tabUrl = document.getElementById('tabUrlInline');

    if (tab === 'upload') {
        if (uploadBox) uploadBox.classList.remove('hidden');
        if (urlBox) urlBox.classList.add('hidden');
        if (tabUpload) {
            tabUpload.className = "py-2 px-3 rounded-xl border-2 border-[#DC2626] bg-red-50/40 text-[#DC2626] font-bold text-xs flex items-center justify-center gap-1.5 transition";
        }
        if (tabUrl) {
            tabUrl.className = "py-2 px-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-xs flex items-center justify-center gap-1.5 transition hover:bg-slate-50";
        }
    } else {
        if (uploadBox) uploadBox.classList.add('hidden');
        if (urlBox) urlBox.classList.remove('hidden');
        if (tabUpload) {
            tabUpload.className = "py-2 px-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-xs flex items-center justify-center gap-1.5 transition hover:bg-slate-50";
        }
        if (tabUrl) {
            tabUrl.className = "py-2 px-3 rounded-xl border-2 border-[#DC2626] bg-red-50/40 text-[#DC2626] font-bold text-xs flex items-center justify-center gap-1.5 transition";
        }
    }
}

async function handleInlinePhotoFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
        showToast('File Terlalu Besar', 'Maksimal ukuran foto adalah 15MB.');
        e.target.value = '';
        return;
    }

    showToast('Mengompresi Foto...', 'Sedang mengonversi dan mengompresi foto ke format WebP.');

    try {
        const res = await compressImageToWebP(file, {
            maxDimension: 1400,
            targetMaxBytes: 400 * 1024,
            initialQuality: 0.82
        });

        currentInlinePhotoData = res.dataUrl;
        const infoText = `WebP ${formatBytes(res.compressedSize)} (Hemat ${res.savingsPercent}%) • Siap disisipkan`;
        showInlinePhotoPreview(currentInlinePhotoData, infoText);
        showToast('Foto Artikel Teroptimasi', `Format WebP: ${formatBytes(res.originalSize)} ➔ ${formatBytes(res.compressedSize)} (Hemat ${res.savingsPercent}%).`);
    } catch (err) {
        console.error('Error saat kompresi foto artikel inline:', err);
        showToast('Gagal Memproses Foto', err.message || 'Gagal memproses foto.');
    }
}

function handleInlinePhotoUrl(val) {
    const url = val.trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('assets/'))) {
        currentInlinePhotoData = url;
        showInlinePhotoPreview(currentInlinePhotoData, 'Foto dari tautan web');
    }
}

function showInlinePhotoPreview(src, infoText) {
    const wrap = document.getElementById('inlinePhotoPreviewWrapper');
    const img = document.getElementById('inlinePhotoPreviewImg');
    const info = document.getElementById('inlinePhotoPreviewInfo');
    if (wrap && img) {
        img.src = src;
        if (info) info.textContent = infoText || 'Foto siap disisipkan';
        wrap.classList.remove('hidden');
    }
}

async function confirmInsertInlinePhoto() {
    if (!currentInlinePhotoData) {
        showToast('Foto Belum Dipilih', 'Silakan pilih foto dari perangkat atau masukkan URL foto terlebih dahulu.');
        return;
    }

    const captionInput = document.getElementById('inlinePhotoCaptionInput');
    const caption = (captionInput?.value || '').trim() || 'Dokumentasi Kegiatan ESI Trenggalek';
    const alignRadio = document.querySelector('input[name="inlinePhotoAlign"]:checked');
    const align = alignRadio ? alignRadio.value : 'center';

    const textarea = document.getElementById('newsContentInput');
    if (!textarea) return;

    let finalPhotoUrl = currentInlinePhotoData;

    // Jika berupa Base64 (upload file), coba upload langsung ke cloud Vercel Blob
    if (currentInlinePhotoData.startsWith('data:')) {
        showToast('Mengunggah Foto...', 'Sedang mengunggah foto dokumentasi ke cloud storage.');
        try {
            const cloudUrl = await Api.uploadStorageImage(currentInlinePhotoData, 'news-inline');
            if (cloudUrl) {
                finalPhotoUrl = cloudUrl;
            }
        } catch (uploadErr) {
            console.warn('Direct upload inline image to storage failed, using draft key:', uploadErr);
        }
    }

    let tag = '';
    if (finalPhotoUrl.startsWith('http://') || finalPhotoUrl.startsWith('https://') || finalPhotoUrl.startsWith('assets/')) {
        tag = `\n\n[gambar: ${finalPhotoUrl} | ${caption} | ${align}]\n\n`;
    } else {
        const count = Object.keys(currentDraftInlineImages).length + 1;
        const photoKey = 'foto-' + count;
        currentDraftInlineImages[photoKey] = finalPhotoUrl;
        tag = `\n\n[gambar: ${photoKey} | ${caption} | ${align}]\n\n`;
    }

    insertTextAtCursor(textarea, tag);

    closeInlinePhotoModal();
    showToast('Foto Berhasil Disisipkan', 'Foto dokumentasi telah disematkan rapi ke naskah artikel.');
}

function insertFormattingToContent(type) {
    const textarea = document.getElementById('newsContentInput');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    if (type === 'quote') {
        if (selected && selected.trim()) {
            const clean = selected.trim().replace(/^["'\s]+|["'\s]+$/g, '');
            insertTextAtCursor(textarea, `\n\n> ${clean}\n\n`);
        } else {
            insertTextAtCursor(textarea, '\n\n> Tuliskan teks kutipan yang ingin ditampilkan di sini.\n\n');
        }
    } else if (type === 'heading') {
        const titleText = selected || 'Sub-Judul Bagian Artikel';
        insertTextAtCursor(textarea, `\n\n### ${titleText}\n\n`);
    } else if (type === 'numbered') {
        if (selected) {
            const lines = selected.split('\n').filter(Boolean);
            const formatted = lines.map((l, i) => `${i + 1}. ${l.replace(/^\d+[\.\)]\s*/, '')}`).join('\n');
            insertTextAtCursor(textarea, `\n${formatted}\n`);
        } else {
            insertTextAtCursor(textarea, '\n1. Konsolidasi organisasi dan komunitas esports daerah.\n2. Penyelenggaraan turnamen berjenjang secara rutin.\n3. Sinergi pembinaan atlet bersama KONI dan Dikpora Trenggalek.\n');
        }
    } else if (type === 'bullet') {
        if (selected) {
            const lines = selected.split('\n').filter(Boolean);
            const formatted = lines.map(l => `• ${l.replace(/^[•\-\*]\s*/, '')}`).join('\n');
            insertTextAtCursor(textarea, `\n${formatted}\n`);
        } else {
            insertTextAtCursor(textarea, '\n• Poin pembahasan pertama\n• Poin pembahasan kedua\n');
        }
    } else if (type === 'bold') {
        const text = selected || 'teks tebal';
        insertTextAtCursor(textarea, `**${text}**`);
    } else if (type === 'italic') {
        const text = selected || 'teks miring';
        insertTextAtCursor(textarea, `*${text}*`);
    } else if (type === 'link') {
        const url = prompt('Masukkan URL Tautan Web:\nContoh: https://suaratrenggalek.com/berita-terkait', 'https://');
        if (url && url.trim() && url !== 'https://') {
            const linkText = selected || 'baca informasi selengkapnya di sini';
            insertTextAtCursor(textarea, `[${linkText}](${url.trim()})`);
        }
    } else if (type === 'lead') {
        insertTextAtCursor(textarea, 'TRENGGALEK, HUMAS ESI — ');
    } else if (type === 'paragraph') {
        insertTextAtCursor(textarea, '\n\n');
    }
}

function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    textarea.value = val.substring(0, start) + text + val.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

// ==================== SUB-VIEW CONTROLLER: KELOLA BERITA ====================
function openAdminNewsForm() {
    const listView = document.getElementById('adminNewsListView');
    const formView = document.getElementById('adminNewsFormView');
    if (listView) listView.classList.add('hidden');
    if (formView) formView.classList.remove('hidden');

    cancelEditNews();
    if (formView) formView.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAdminNewsForm() {
    const listView = document.getElementById('adminNewsListView');
    const formView = document.getElementById('adminNewsFormView');
    if (formView) formView.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');

    cancelEditNews();
}

// Mode Edit Artikel yang Sudah Diterbitkan
function editNews(id) {
    const article = news.find(n => n.id == id);
    if (!article) return;

    const listView = document.getElementById('adminNewsListView');
    const formView = document.getElementById('adminNewsFormView');
    if (listView) listView.classList.add('hidden');
    if (formView) formView.classList.remove('hidden');

    const editIdInput = document.getElementById('editNewsId');
    if (editIdInput) editIdInput.value = id;

    const titleInput = document.getElementById('newsTitleInput');
    if (titleInput) titleInput.value = article.title || '';

    const catInput = document.getElementById('newsCatInput');
    if (catInput) catInput.value = article.category || 'Pengumuman';

    const contentInput = document.getElementById('newsContentInput');
    if (contentInput) contentInput.value = article.content || '';

    const authorInput = document.getElementById('newsAuthorInput');
    if (authorInput) authorInput.value = article.author || '';

    const sourceInput = document.getElementById('newsSourceInput');
    if (sourceInput) sourceInput.value = article.source || article.sourceUrl || '';

    // Muat registry foto inline yang tersimpan
    currentDraftInlineImages = article.inlineImages ? { ...article.inlineImages } : {};

    // Isi foto sampul ke preview
    if (article.imageUrl) {
        newsSelectedImageBase64 = article.imageUrl;
        const container = document.getElementById('newsImagePreviewContainer');
        const img = document.getElementById('newsImagePreview');
        if (container && img) {
            img.src = article.imageUrl;
            container.classList.remove('hidden');
        }
        const urlInput = document.getElementById('newsImageUrlInput');
        if (urlInput) urlInput.value = article.imageUrl.startsWith('data:') ? '' : article.imageUrl;
    } else {
        clearNewsImagePreview();
    }

    // Atur radio posisi gambar
    const pos = article.imagePosition || 'top';
    const radio = document.querySelector(`input[name="newsImagePosition"][value="${pos}"]`);
    if (radio) radio.checked = true;

    // Ubah UI Form Menjadi Mode Edit
    const formTitle = document.getElementById('adminNewsFormTitle');
    if (formTitle) formTitle.textContent = 'Edit Artikel Berita';

    const formSub = document.getElementById('adminNewsFormSub');
    if (formSub) formSub.textContent = 'Perbarui judul, foto sampul, posisi penempatan, kategori, atau isi artikel yang sudah terbit.';

    const editBadge = document.getElementById('adminNewsEditBadge');
    if (editBadge) editBadge.classList.remove('hidden');

    const btnSubmitText = document.getElementById('btnSubmitNewsText');
    if (btnSubmitText) btnSubmitText.textContent = 'Simpan Perubahan';

    const btnCancel = document.getElementById('btnCancelEditNews');
    if (btnCancel) btnCancel.classList.remove('hidden');

    // Scroll ke form
    if (formView) formView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Mode Edit', 'Data artikel telah dimuat ke formulir. Silakan lakukan perubahan.');
}

function cancelEditNews() {
    const editIdInput = document.getElementById('editNewsId');
    if (editIdInput) editIdInput.value = '';

    const form = document.querySelector('#adminNewsFormView form');
    if (form) form.reset();

    clearNewsImagePreview();

    const defaultRadio = document.querySelector('input[name="newsImagePosition"][value="top"]');
    if (defaultRadio) defaultRadio.checked = true;

    const formTitle = document.getElementById('adminNewsFormTitle');
    if (formTitle) formTitle.textContent = 'Tulis Berita / Pengumuman Baru';

    const formSub = document.getElementById('adminNewsFormSub');
    if (formSub) formSub.textContent = 'Publikasikan informasi resmi, liputan turnamen, atau pengumuman organisasi.';

    const editBadge = document.getElementById('adminNewsEditBadge');
    if (editBadge) editBadge.classList.add('hidden');

    const btnSubmitText = document.getElementById('btnSubmitNewsText');
    if (btnSubmitText) btnSubmitText.textContent = '+ Terbitkan Berita';

    const btnCancel = document.getElementById('btnCancelEditNews');
    if (btnCancel) btnCancel.classList.add('hidden');
}

async function handleAdminAddNews(e) {
    e.preventDefault();
    const editId = document.getElementById('editNewsId') ? document.getElementById('editNewsId').value : '';
    const content = document.getElementById('newsContentInput').value.trim();
    const excerpt = content.length > 130 ? content.substring(0, 130) + '...' : content;
    const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const urlInput = document.getElementById('newsImageUrlInput');
    const finalImageUrl = newsSelectedImageBase64 || (urlInput ? urlInput.value.trim() : '');
    const posRadio = document.querySelector('input[name="newsImagePosition"]:checked');
    const imagePosition = posRadio ? posRadio.value : 'top';

    const authorVal = (document.getElementById('newsAuthorInput')?.value || '').trim() || 'Humas ESI Trenggalek';
    const sourceVal = (document.getElementById('newsSourceInput')?.value || '').trim();

    // 1. Resolve semua foto inline draft (foto-X atau data:image) agar menjadi link cloud permanen
    let resolvedContent = content;
    if (typeof currentDraftInlineImages === 'object' && Object.keys(currentDraftInlineImages).length > 0) {
        for (const [key, val] of Object.entries(currentDraftInlineImages)) {
            if (typeof val === 'string') {
                if (val.startsWith('data:')) {
                    try {
                        const cloudUrl = await Api.uploadStorageImage(val, 'news-inline');
                        if (cloudUrl) {
                            currentDraftInlineImages[key] = cloudUrl;
                            resolvedContent = resolvedContent.split(key).join(cloudUrl);
                        }
                    } catch (err) {
                        console.warn('Gagal upload foto inline draft saat publikasi:', err);
                    }
                } else if (val.startsWith('http://') || val.startsWith('https://')) {
                    resolvedContent = resolvedContent.split(key).join(val);
                }
            }
        }
    }

    const articlePayload = {
        title: document.getElementById('newsTitleInput').value.trim(),
        category: document.getElementById('newsCatInput').value,
        author: authorVal,
        source: sourceVal || undefined,
        imageUrl: finalImageUrl,
        imagePosition: imagePosition,
        excerpt,
        content: resolvedContent,
        inlineImages: { ...currentDraftInlineImages }
    };

    if (editId) {
        // Mode Update Artikel Lama
        const existing = news.find(n => n.id == editId);
        // Bersihkan gambar lama dari storage jika foto sampul diganti
        if (existing && existing.imageUrl && existing.imageUrl !== finalImageUrl) {
            await Api.deleteStorageImage(existing.imageUrl);
        }
        articlePayload.date = existing ? existing.date : today;
        await Api.updateNews(editId, articlePayload);
        showToast('Artikel Diperbarui', 'Perubahan berita berhasil disimpan dan diperbarui.');
    } else {
        // Mode Terbitkan Artikel Baru
        articlePayload.date = today;
        await Api.createNews(articlePayload);
        showToast('Berita Diterbitkan', 'Artikel baru telah tampil di portal berita.');
    }

    news = await Api.getNews();
    currentDraftInlineImages = {};
    closeAdminNewsForm();
    renderAdminNews();
    renderNewsView();
}

function viewNewsFromAdmin(id) {
    navigateTo('berita');
    if (typeof openNewsDetail === 'function') openNewsDetail(id);
}

function renderAdminNews() {
    const list = document.getElementById('adminNewsList');
    if (!list) return;

    const searchQ = (document.getElementById('adminNewsSearchInput')?.value || '').trim().toLowerCase();
    const catFilter = document.getElementById('adminNewsCatFilter')?.value || 'all';

    let filtered = news.filter(n => {
        if (catFilter !== 'all' && n.category !== catFilter) return false;
        if (searchQ) {
            const haystack = [n.title, n.author, n.category, n.source].join(' ').toLowerCase();
            if (!haystack.includes(searchQ)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="p-6 text-center text-sm text-slate-500 border border-dashed border-[#E2E8F0] rounded-xl bg-slate-50">
            Tidak ada artikel yang sesuai filter pencarian.
        </div>`;
        return;
    }

    const sortedNews = [...filtered].sort((a, b) => getNewsTimestamp(b) - getNewsTimestamp(a));
    list.innerHTML = sortedNews.map(n => {
        const thumb = n.imageUrl
            ? `<img src="${n.imageUrl}" alt="${n.title}" onerror="this.onerror=null;this.src='assets/images/logo-esi.png'" class="w-14 h-12 object-cover rounded-lg shrink-0 border border-slate-200">`
            : `<div class="w-14 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0"><i class="fa-solid fa-image text-xs"></i></div>`;

        return `
        <div class="border border-[#E2E8F0] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition">
            <div class="flex items-center gap-3 min-w-0">
                ${thumb}
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[11px] font-bold uppercase text-[#DC2626]">${n.category} • ${n.date}</span>
                        <span class="text-[11px] text-slate-400 font-medium">• Penulis: <strong class="text-slate-700">${n.author || 'Humas ESI Trenggalek'}</strong></span>
                    </div>
                    <h4 class="font-bold text-sm text-[#0F172A] mt-0.5 truncate">${n.title}</h4>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-end">
                <button onclick="viewNewsFromAdmin(${n.id})" title="Pratinjau Artikel di Website"
                    class="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs active:scale-95">
                    <i class="fa-solid fa-eye text-[11px]"></i>
                    <span>Lihat</span>
                </button>
                <button onclick="editNews(${n.id})" title="Edit Berita Ini"
                    class="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-95">
                    <i class="fa-solid fa-pen-to-square text-[11px]"></i>
                    <span>Edit</span>
                </button>
                <button onclick="deleteNews(${n.id})" title="Hapus Berita Ini"
                    class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-[#DC2626] text-[#DC2626] hover:text-white text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs active:scale-95">
                    <i class="fa-solid fa-trash-can text-[11px]"></i>
                    <span class="sm:hidden">Hapus</span>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

async function deleteNews(id) {
    const art = news.find(n => n.id == id);
    const artTitle = art ? ` "${art.title}"` : '';
    if (confirm(`Apakah Anda yakin ingin menghapus artikel berita${artTitle}? Foto sampul dan file gambar terkait akan dihapus bersih dari storage.`)) {
        await Api.deleteNews(id);
        news = await Api.getNews();
        renderAdminNews();
        if (typeof renderNewsView === 'function') renderNewsView();
        if (typeof renderHomeView === 'function') renderHomeView();
        showToast('Berita & Gambar Dihapus', 'Artikel berita dan seluruh file gambar terkait telah dihapus bersih dari storage.');
    }
}

// ==================== FITUR PRATINJAU / PREVIEW DRAFT BERITA ====================
function previewCurrentNewsDraft() {
    const title = (document.getElementById('newsTitleInput')?.value || '').trim();
    const category = document.getElementById('newsCatInput')?.value || 'Pengumuman';
    const author = (document.getElementById('newsAuthorInput')?.value || '').trim() || 'Humas ESI Trenggalek';
    const source = (document.getElementById('newsSourceInput')?.value || '').trim();
    const content = (document.getElementById('newsContentInput')?.value || '').trim();
    const imageUrl = (typeof newsSelectedImageBase64 !== 'undefined' && newsSelectedImageBase64)
        || (document.getElementById('newsImageUrlInput')?.value || '').trim();
    const imagePosition = 'top';

    if (!title) {
        showToast('Judul Diperlukan', 'Harap isi Judul Berita sebelum melihat pratinjau.');
        document.getElementById('newsTitleInput')?.focus();
        return;
    }
    if (!content) {
        showToast('Isi Artikel Diperlukan', 'Harap tuliskan teks isi artikel sebelum melihat pratinjau.');
        document.getElementById('newsContentInput')?.focus();
        return;
    }

    const words = content.split(/\s+/).length;
    const readMins = Math.max(1, Math.ceil(words / 180));
    const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

    const draft = {
        title,
        category,
        author,
        source,
        content,
        imageUrl,
        imagePosition,
        date: today,
        readTime: `${readMins} menit baca`,
        inlineImages: { ...currentDraftInlineImages }
    };

    // Isi elemen modal pratinjau
    const catBadge = document.getElementById('prevCatBadge');
    const rTime = document.getElementById('prevReadTime');
    const titleEl = document.getElementById('prevTitle');
    const dateEl = document.getElementById('prevDate');
    const imgWrap = document.getElementById('prevImageWrapper');
    const imgEl = document.getElementById('prevImage');
    const imgCap = document.getElementById('prevImageCaption');
    const bodyEl = document.getElementById('prevBodyContent');

    if (catBadge) catBadge.textContent = draft.category;
    if (rTime) rTime.innerHTML = `<i class="fa-regular fa-clock"></i> ${draft.readTime}`;
    if (titleEl) titleEl.textContent = draft.title;
    if (dateEl) dateEl.innerHTML = `<i class="fa-regular fa-calendar mr-1"></i> ${draft.date}`;

    const prevAuthor = document.getElementById('prevAuthor');
    if (prevAuthor) prevAuthor.textContent = draft.author;

    const prevAvatar = document.getElementById('prevAuthorAvatar');
    if (prevAvatar) {
        const initials = draft.author.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
        prevAvatar.innerHTML = `<span class="font-black text-xs">${initials || '<i class="fa-solid fa-feather-pointed"></i>'}</span>`;
    }

    const prevSource = document.getElementById('prevSource');
    if (prevSource) {
        prevSource.textContent = draft.source || 'Portal Resmi ESI Trenggalek';
    }

    if (imgWrap && imgEl) {
        if (draft.imageUrl && draft.imagePosition === 'top') {
            imgEl.src = draft.imageUrl;
            if (imgCap) imgCap.textContent = `Dokumentasi: ${draft.title}`;
            imgWrap.classList.remove('hidden');
        } else {
            imgWrap.classList.add('hidden');
        }
    }

    if (bodyEl) {
        bodyEl.innerHTML = formatNewsContent(draft.content, draft);
    }

    const modal = document.getElementById('newsPreviewModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeNewsPreviewModal() {
    const modal = document.getElementById('newsPreviewModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function publishFromPreview() {
    closeNewsPreviewModal();
    const btn = document.getElementById('btnSubmitNews');
    if (btn) {
        btn.click();
    }
}

// ==================== 8. AREA ANGGOTA & ATLET ====================
function updateHeaderMemberBadge() {
    const txt = document.getElementById('headerMemberText');
    const btn = document.getElementById('headerMemberBtn');
    const drawerTxt = document.getElementById('mobileDrawerMemberText');
    const navBtnDaftar = document.getElementById('navBtnDaftar') || document.querySelector('#desktopNav [data-nav="daftar"]');
    const heroBtn = document.getElementById('heroBtnDaftar');
    const alreadyCard = document.getElementById('alreadyRegisteredCard');
    const regFormCard = document.getElementById('regFormCard');
    const alreadyName = document.getElementById('alreadyRegisteredName');

    if (loggedMember) {
        const shortName = loggedMember.nickname || (loggedMember.fullName ? loggedMember.fullName.split(' ')[0] : 'Member');
        if (txt) txt.innerHTML = `<span class="truncate max-w-[80px] sm:max-w-none inline-block align-middle">${shortName}</span>`;
        if (btn) {
            btn.className = "h-9 px-2.5 sm:px-3.5 rounded-lg text-xs font-bold bg-[#0F172A] hover:bg-slate-800 text-white border border-slate-700 transition flex items-center gap-1.5 shadow-sm shrink-0 whitespace-nowrap";
            btn.title = `Login sebagai: ${loggedMember.fullName} (${loggedMember.nickname})`;
        }
        if (drawerTxt) drawerTxt.textContent = `Akun Saya (${shortName})`;

        // Sembunyikan tombol "Daftar Atlet" di navbar desktop karena sudah terdaftar & login
        if (navBtnDaftar) {
            navBtnDaftar.classList.add('hidden');
        }

        // Sesuaikan tombol Hero CTA untuk akses KTA / Member
        if (heroBtn) {
            heroBtn.setAttribute('onclick', "navigateTo('member')");
            heroBtn.innerHTML = '<i class="fa-solid fa-id-card"></i> <span>Akses KTA & Member</span>';
        }

        // Jika berada di view pendaftaran, tampilkan banner sudah terdaftar
        if (alreadyCard) {
            alreadyCard.classList.remove('hidden');
            if (alreadyName) {
                alreadyName.textContent = `Halo, ${loggedMember.fullName || loggedMember.nickname}!`;
            }
        }
        if (regFormCard) {
            regFormCard.classList.add('hidden');
        }
    } else {
        if (txt) txt.textContent = 'Login Member';
        if (btn) {
            btn.className = "h-9 px-2.5 sm:px-3.5 rounded-lg text-xs font-bold bg-[#DC2626] hover:bg-[#B91C1C] text-white transition flex items-center gap-1.5 shadow-sm shrink-0 whitespace-nowrap";
            btn.title = 'Login Member / Atlet ESI Trenggalek';
        }
        if (drawerTxt) drawerTxt.textContent = 'Login Member';

        // Tampilkan kembali tombol "Daftar Atlet" saat belum login
        if (navBtnDaftar) {
            navBtnDaftar.classList.remove('hidden');
        }

        // Kembalikan tombol Hero CTA ke Pendaftaran
        if (heroBtn) {
            heroBtn.setAttribute('onclick', "navigateTo('daftar')");
            heroBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> <span>Daftar Atlet Sekarang</span>';
        }

        if (alreadyCard) {
            alreadyCard.classList.add('hidden');
        }
        if (regFormCard) {
            regFormCard.classList.remove('hidden');
        }
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';

    // Update semua icon toggle terkait
    const icons = document.querySelectorAll(`[data-pass-toggle="${inputId}"]`);
    icons.forEach(ic => {
        if (isPass) {
            ic.classList.remove('fa-eye');
            ic.classList.add('fa-eye-slash');
        } else {
            ic.classList.remove('fa-eye-slash');
            ic.classList.add('fa-eye');
        }
    });

    // Update label text (Lihat / Sembunyikan)
    const labels = document.querySelectorAll(`[data-pass-label="${inputId}"]`);
    labels.forEach(lb => {
        lb.textContent = isPass ? 'Sembunyikan' : 'Lihat';
    });
}

function toggleMemberPasswordVisibility() {
    togglePasswordVisibility('memberLoginPass');
}

async function handleMemberLogin(e) {
    e.preventDefault();
    const idInput = document.getElementById('memberLoginId').value.trim();
    const passInput = document.getElementById('memberLoginPass').value.trim();

    const submitBtn = document.getElementById('btnMemberSubmit') || e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Memvalidasi...';
    }

    try {
        const res = await Api.loginMember(idInput, passInput);
        if (res.success) {
            loggedMember = res.member;
            updateHeaderMemberBadge();
            renderMemberView();
            showToast('Login Berhasil', `Selamat datang kembali, ${loggedMember.fullName}!`);
        } else {
            showToast('Login Gagal', res.message || 'Kredensial tidak sesuai.');
        }
    } catch (err) {
        console.error('Login member error:', err);
        showToast('Login Gagal', 'Terjadi kesalahan sistem saat mencoba masuk.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-2"></i> Masuk ke Akun Anggota';
        }
    }
}

function handleMemberLogout() {
    Api.logoutMember();
    loggedMember = null;
    updateHeaderMemberBadge();
    renderMemberView();
    showToast('Keluar Sistem', 'Sesi akun anggota telah diakhiri.');
}

function renderMemberView() {
    const loginBox = document.getElementById('memberLoginBox');
    const dashBox = document.getElementById('memberDashboardBox');

    if (!loggedMember) {
        if (loginBox) loginBox.classList.remove('hidden');
        if (dashBox) dashBox.classList.add('hidden');
        return;
    }

    // Perbarui data member dari state terbaru athletes (misal ada perubahan status/poin oleh admin)
    const freshData = athletes.find(a => a.id == loggedMember.id);
    if (freshData) {
        loggedMember = freshData;
    }

    if (loginBox) loginBox.classList.add('hidden');
    if (dashBox) dashBox.classList.remove('hidden');

    // 1. Render Identitas Sambutan
    const elName = document.getElementById('memberGreetingName');
    const elSub = document.getElementById('memberGreetingSub');
    if (elName) elName.textContent = loggedMember.fullName || 'Atlet ESI Trenggalek';
    if (elSub) elSub.innerHTML = `Divisi: <strong class="text-white">${loggedMember.division}</strong> • Nickname: <strong class="text-red-400">${loggedMember.nickname}</strong> • Tim: <strong class="text-white">${loggedMember.teamName || 'Individu'}</strong>`;

    // 1b. Render Avatar di banner & edit tab
    updateAllAvatarUI(loggedMember.avatarUrl || '');

    // 2. Render Kartu Tanda Anggota (KTA) Digital
    renderMemberKtaCard();

    // 3. Render Tab Aktif
    switchMemberTab(memberActiveTab || 'kta');
}

function renderMemberKtaCard() {
    const m = loggedMember;
    if (!m) return;

    // Hitung peringkat di divisinya
    const divAthletes = athletes
        .filter(a => a.division === m.division && a.status === 'verified')
        .sort((a, b) => (b.points || 0) - (a.points || 0));
    const rankIndex = divAthletes.findIndex(a => a.id == m.id);
    const rankText = rankIndex >= 0 ? `#${rankIndex + 1}` : 'Belum Berperingkat';

    // Nomor Registrasi Urut Anggota ESI Trenggalek
    const regNo = getAthleteRegNo(m);

    // Status Badge
    let statusBadgeHtml = '';
    let statusBannerHtml = '';
    if (m.status === 'verified') {
        statusBadgeHtml = `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-emerald-500 text-white shadow-sm">
                <i class="fa-solid fa-circle-check"></i> Terverifikasi Resmi
            </span>
        `;
    } else if (m.status === 'rejected') {
        statusBadgeHtml = `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-red-600 text-white shadow-sm">
                <i class="fa-solid fa-circle-xmark"></i> Verifikasi Ditolak
            </span>
        `;
        statusBannerHtml = `
            <div class="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-xs text-red-700">
                <i class="fa-solid fa-triangle-exclamation text-base mt-0.5 text-red-600 shrink-0"></i>
                <div class="flex-1">
                    <p class="font-bold text-sm text-red-800">Status Pendaftaran Ditolak / Perlu Perbaikan</p>
                    <p class="mt-0.5">Mohon hubungi Pengurus ESI Trenggalek untuk klarifikasi atau perbaikan berkas pendaftaran Anda.</p>
                </div>
            </div>
        `;
    } else {
        // Pending
        statusBadgeHtml = `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-amber-500 text-white shadow-sm animate-pulse">
                <i class="fa-solid fa-clock"></i> Menunggu Verifikasi
            </span>
        `;
        const waMsg = `Halo Pengurus ESI Trenggalek, saya atas nama ${m.fullName} (${m.nickname} - Divisi ${m.division}) telah mendaftar di sistem ESI Trenggalek (No. Reg: ${regNo}). Mohon info proses verifikasi keanggotaan saya. Terima kasih!`;
        statusBannerHtml = `
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900">
                <div class="flex items-start gap-3">
                    <i class="fa-solid fa-circle-info text-base mt-0.5 text-amber-600 shrink-0"></i>
                    <div>
                        <p class="font-bold text-sm text-amber-900">Akun Anda Dalam Antrean Verifikasi</p>
                        <p class="mt-0.5 text-amber-800">Data Anda sudah tersimpan di database resmi ESI Trenggalek. Agar akun & KTA Anda segera aktif, Anda dapat mengirim konfirmasi via WhatsApp ke Sekretariat ESI.</p>
                    </div>
                </div>
                <a href="https://wa.me/6287840800351?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener"
                    class="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition flex items-center gap-2">
                    <i class="fa-brands fa-whatsapp text-sm"></i>
                    <span>Konfirmasi via WA</span>
                </a>
            </div>
        `;
    }

    const bannerContainer = document.getElementById('memberStatusAlertBox');
    if (bannerContainer) bannerContainer.innerHTML = statusBannerHtml;

    // Render KTA Visual Card
    const ktaContainer = document.getElementById('memberKtaCard');
    if (ktaContainer) {
        ktaContainer.innerHTML = `
            <div class="relative bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white rounded-2xl p-4 sm:p-6 md:p-8 border-2 border-slate-700 shadow-2xl overflow-hidden print:border-black print:text-black print:bg-white">
                <!-- Watermark Background Ornament -->
                <div class="absolute -right-12 -bottom-12 opacity-5 pointer-events-none text-[220px]">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>

                <!-- Card Header -->
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 sm:pb-5 border-b border-slate-700/80 mb-5 sm:mb-6">
                    <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <img src="assets/images/logo-esi.png" alt="Logo Resmi ESI" class="w-11 h-11 sm:w-12 sm:h-12 object-contain drop-shadow-md shrink-0">
                        <div class="min-w-0">
                            <span class="block text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-[#DC2626]">KARTU TANDA ANGGOTA ELEKTRONIK</span>
                            <h2 class="font-extrabold text-sm sm:text-base md:text-lg tracking-tight leading-tight truncate">ESI KABUPATEN TRENGGALEK</h2>
                            <p class="text-[10px] sm:text-[11px] text-slate-400 truncate">Cabang Olahraga Prestasi Esports Indonesia (ESI) Kabupaten Trenggalek</p>
                        </div>
                    </div>
                    <div class="text-left sm:text-right shrink-0 bg-slate-800/60 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg border border-slate-700/50 sm:border-0 w-full sm:w-auto flex sm:block justify-between items-center">
                        <div class="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400">NO. REGISTRASI</div>
                        <div class="font-mono text-xs sm:text-sm font-extrabold text-amber-400">${regNo}</div>
                    </div>
                </div>

                <!-- Card Body -->
                <div class="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 items-center">
                    <!-- Left Photo / Avatar & QR Simulation -->
                    <div class="md:col-span-4 flex flex-col items-center justify-center text-center p-3.5 sm:p-4 bg-slate-900/60 rounded-xl border border-slate-700/60">
                        <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 p-1 mb-2.5 sm:mb-3 shadow-inner cursor-pointer" onclick="openMemberAvatarLightbox()">
                            <div class="w-full h-full rounded-xl bg-[#0F172A] flex items-center justify-center text-2xl sm:text-3xl text-white overflow-hidden">
                                ${m.avatarUrl
                                    ? `<img src="${m.avatarUrl}" alt="Foto Profil" class="w-full h-full object-cover rounded-xl">`
                                    : `<i class="fa-solid fa-gamepad"></i>`
                                }
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-md text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-[#DC2626] text-white mb-1.5">
                            ${m.division}
                        </span>
                        <span class="text-[10px] font-mono text-slate-400">ID: ${m.gameId}</span>
                    </div>

                    <!-- Right Info Details -->
                    <div class="md:col-span-8 space-y-3 sm:space-y-3.5">
                        <div>
                            <span class="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">NAMA LENGKAP ATLET</span>
                            <h3 class="text-lg sm:text-2xl font-black text-white uppercase tracking-tight leading-tight">${m.fullName}</h3>
                            <div class="text-xs sm:text-sm font-bold text-red-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                                <i class="fa-solid fa-at text-xs"></i>
                                <span>${m.nickname}</span>
                                <span class="text-slate-500">•</span>
                                <span class="text-xs text-slate-300">${m.teamName || 'Individu / Non-Tim'}</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-slate-700/60 text-xs">
                            <div class="bg-slate-800/40 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                                <span class="block text-[10px] text-slate-400">ASAL / INSTANSI</span>
                                <span class="font-semibold text-slate-200 block truncate" title="${m.institution}">${m.institution || '-'}</span>
                            </div>
                            <div class="bg-slate-800/40 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                                <span class="block text-[10px] text-slate-400">DOMISILI</span>
                                <span class="font-semibold text-slate-200 block">Kec. ${m.kecamatan || 'Trenggalek'}</span>
                            </div>
                            <div class="bg-slate-800/40 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                                <span class="block text-[10px] text-slate-400">POIN / PERINGKAT</span>
                                <span class="font-bold text-amber-400 block">${m.points || 0} Poin (${rankText})</span>
                            </div>
                        </div>

                        <!-- Card Footer within Card -->
                        <div class="flex items-center justify-between pt-3 border-t border-slate-700/60">
                            <div>
                                ${statusBadgeHtml}
                            </div>
                            <div class="text-[10px] text-slate-400 text-right">
                                ESI Trenggalek 2026
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Toolbar Aksi KTA (Share to Instagram, Unduh HD, Cetak) -->
            <div class="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-white border border-[#E2E8F0] rounded-xl shadow-sm">
                <div class="flex items-center gap-3">
                    <span class="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white flex items-center justify-center text-lg shadow-sm shrink-0">
                        <i class="fa-brands fa-instagram"></i>
                    </span>
                    <div>
                        <p class="text-xs sm:text-sm font-extrabold text-[#0F172A]">Bagikan KTA ke Instagram &amp; Media Sosial</p>
                        <p class="text-[11px] text-slate-500">Tersedia format Instagram Story (9:16) &amp; Kartu ID Dompet resolusi HD siap pakai.</p>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button onclick="openKtaShareModal('story')" class="flex-1 sm:flex-initial min-h-[42px] px-4 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 hover:opacity-95 active:scale-95 text-white shadow-md shadow-pink-600/20 transition flex items-center justify-center gap-2 touch-manipulation">
                        <i class="fa-brands fa-instagram text-sm"></i>
                        <span>Share Story (9:16)</span>
                    </button>
                    <button onclick="openKtaShareModal('card')" class="flex-1 sm:flex-initial min-h-[42px] px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0F172A] hover:bg-slate-800 active:scale-95 text-white transition flex items-center justify-center gap-2 touch-manipulation">
                        <i class="fa-solid fa-download text-amber-400"></i>
                        <span>Unduh HD / Cetak</span>
                    </button>
                </div>
            </div>
        `;
    }

    // 4. Render Form Edit Profil dengan data saat ini
    const editNick = document.getElementById('memberEditNickname');
    const editGameId = document.getElementById('memberEditGameId');
    const editTeam = document.getElementById('memberEditTeam');
    const editWa = document.getElementById('memberEditWhatsapp');
    const editEmail = document.getElementById('memberEditEmail');
    const editAlamat = document.getElementById('memberEditAlamat');

    if (editNick) editNick.value = m.nickname || '';
    if (editGameId) editGameId.value = m.gameId || '';
    renderMemberMultiGameList(m);
    if (editTeam) editTeam.value = m.teamName || '';
    if (editWa) editWa.value = m.whatsapp || '';
    if (editEmail) editEmail.value = m.email || '';
    if (editAlamat) editAlamat.value = m.alamat || '';

    // 5. Render Detail Data Lengkap Anggota
    const fullDataBox = document.getElementById('memberFullDataBox');
    if (fullDataBox) {
        fullDataBox.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div class="p-3 bg-[#F4F6F9] rounded-lg border border-[#E2E8F0]">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Username Akun</span>
                    <span class="font-bold text-[#0F172A] text-sm">${m.username || '-'}</span>
                </div>
                <div class="p-3 bg-[#F4F6F9] rounded-lg border border-[#E2E8F0]">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Status Pekerjaan</span>
                    <span class="font-bold text-[#0F172A] text-sm">${m.statusPekerjaan || 'PELAJAR'} ${m.jenjang ? `(${m.jenjang})` : ''}</span>
                </div>
                <div class="p-3 bg-[#F4F6F9] rounded-lg border border-[#E2E8F0]">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Sekolah / Instansi</span>
                    <span class="font-bold text-[#0F172A] text-sm">${m.institution || '-'}</span>
                </div>
                <div class="p-3 bg-[#F4F6F9] rounded-lg border border-[#E2E8F0]">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Tempat, Tanggal Lahir</span>
                    <span class="font-bold text-[#0F172A] text-sm">${m.tempatLahir || '-'}, ${m.tanggalLahir || '-'}</span>
                </div>
                <div class="p-3 bg-[#F4F6F9] rounded-lg border border-[#E2E8F0]">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Jenis Kelamin & Agama</span>
                    <span class="font-bold text-[#0F172A] text-sm">${m.jenisKelamin || '-'} • ${m.agama || '-'}</span>
                </div>
                <div class="p-3 bg-[#F4F6F9] rounded-lg border border-[#E2E8F0]">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">No. WhatsApp & Email</span>
                    <span class="font-bold text-[#0F172A] text-sm">${m.whatsapp || '-'} <br><span class="text-xs text-slate-500 font-normal">${m.email || 'Tanpa Email'}</span></span>
                </div>
                <div class="sm:col-span-2 lg:col-span-3 p-3 bg-[#F4F6F9] rounded-lg border border-[#E2E8F0]">
                    <span class="text-[10px] font-bold text-slate-400 uppercase block">Alamat Domisili Lengkap</span>
                    <span class="font-bold text-[#0F172A] text-sm">${m.alamat || '-'} ${m.rt ? `RT ${m.rt}` : ''} ${m.rw ? `RW ${m.rw}` : ''}, Desa ${m.desa || '-'}, Kec. ${m.kecamatan || 'Trenggalek'}, Kab. Trenggalek, Jawa Timur ${m.kodepos ? `(${m.kodepos})` : ''}</span>
                </div>
            </div>
        `;
    }

    // 6. Render Turnamen Divisi Ini
    renderMemberTournaments();
}

function renderMemberTournaments() {
    const box = document.getElementById('memberTournamentsBox');
    if (!box || !loggedMember) return;

    const divEvents = events.filter(e => e.division === loggedMember.division || e.division === 'Semua Divisi');
    if (divEvents.length === 0) {
        box.innerHTML = `
            <div class="p-8 text-center bg-[#F4F6F9] rounded-xl border border-[#E2E8F0] text-slate-500 text-sm">
                <i class="fa-solid fa-trophy text-slate-400 text-3xl mb-2"></i>
                <p class="font-bold">Belum ada agenda turnamen resmi untuk divisi ${loggedMember.division}.</p>
                <p class="text-xs text-slate-400 mt-1">Nantikan pengumuman jadwal turnamen dan seleksi daerah berikutnya.</p>
            </div>
        `;
        return;
    }

    box.innerHTML = divEvents.map(ev => {
        let badgeBg = 'bg-blue-50 text-blue-700';
        if (ev.status === 'Ongoing') badgeBg = 'bg-emerald-50 text-emerald-700';
        if (ev.status === 'Completed') badgeBg = 'bg-slate-100 text-slate-600';

        const waMsg = `Halo Admin ESI Trenggalek, saya ${loggedMember.fullName} (${loggedMember.nickname} - Tim ${loggedMember.teamName || 'Individu'}) ingin mendaftar di Turnamen: ${ev.title}.`;

        return `
            <div class="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-[#DC2626] transition">
                <div>
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase ${badgeBg}">${ev.status}</span>
                        <span class="px-2.5 py-0.5 rounded bg-red-50 text-[#DC2626] text-[11px] font-bold uppercase">${ev.division}</span>
                    </div>
                    <h4 class="font-extrabold text-base text-[#0F172A]">${ev.title}</h4>
                    <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1.5">
                        <span><i class="fa-regular fa-calendar mr-1 text-[#DC2626]"></i> ${ev.date}</span>
                        <span><i class="fa-solid fa-location-dot mr-1 text-[#DC2626]"></i> ${ev.location}</span>
                    </div>
                    ${ev.description ? `<p class="text-xs text-slate-600 mt-2">${ev.description}</p>` : ''}
                </div>
                <div class="shrink-0">
                    <a href="https://wa.me/6287840800351?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener"
                        class="min-h-[42px] px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center justify-center gap-2 transition">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                        <span>Ikuti Turnamen</span>
                    </a>
                </div>
            </div>
        `;
    }).join('');
}

function switchMemberTab(tabName) {
    memberActiveTab = tabName;
    document.querySelectorAll('.member-tab-btn').forEach(btn => {
        if (btn.dataset.membertab === tabName) {
            btn.className = "member-tab-btn shrink-0 whitespace-nowrap px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold bg-[#DC2626] text-white transition";
        } else {
            btn.className = "member-tab-btn shrink-0 whitespace-nowrap px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition";
        }
    });

    document.querySelectorAll('.member-tab-content').forEach(c => c.classList.add('hidden'));
    const target = document.getElementById(`member-tab-${tabName}`);
    if (target) target.classList.remove('hidden');
}

async function handleUpdateMemberProfile(e) {
    e.preventDefault();
    if (!loggedMember) return;

    const nickname = document.getElementById('memberEditNickname').value.trim();
    const gameId = document.getElementById('memberEditGameId').value.trim();
    const teamName = document.getElementById('memberEditTeam').value.trim() || 'Individu / Non-Tim';
    const whatsapp = document.getElementById('memberEditWhatsapp').value.trim();
    const email = document.getElementById('memberEditEmail').value.trim();
    const alamat = document.getElementById('memberEditAlamat').value.trim();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...';
    }

    try {
        const res = await Api.updateMemberProfile(loggedMember.id, {
            nickname,
            gameId,
            teamName,
            whatsapp,
            email,
            alamat
        });

        if (res.success) {
            loggedMember = res.member;
            athletes = await Api.getAthletes();
            updateHeaderMemberBadge();
            renderMemberKtaCard();
            updateAllAvatarUI(loggedMember.avatarUrl || '');
            showToast('Profil Diperbarui', 'Data profil akun Anda berhasil disimpan.');
        } else {
            showToast('Gagal Memperbarui', res.message || 'Terjadi kesalahan.');
        }
    } catch (err) {
        console.error('Update profile error:', err);
        showToast('Gagal', 'Terjadi kesalahan sistem.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk me-2"></i> Simpan Pembaruan Profil';
        }
    }
}

// ==================== FITUR AVATAR PROFIL (MLBB ZOOM STYLE) ====================

let _avatarZoomScale = 1.0;

function triggerAvatarUpload() {
    const inp = document.getElementById('athleteAvatarFileInput');
    if (inp) inp.click();
}

async function handleAvatarFileSelected(event) {
    const file = event.target.files[0];
    if (!file || !loggedMember) return;

    showToast('Mengupload...', 'Foto profil sedang diunggah ke cloud.');

    try {
        const cloudUrl = await Api.uploadStorageImage(file, 'avatars');
        if (!cloudUrl) throw new Error('Upload gagal');

        await Api.updateMemberProfile(loggedMember.id, { avatarUrl: cloudUrl });

        // Update local state
        loggedMember.avatarUrl = cloudUrl;
        const inAthletes = athletes.find(a => a.id == loggedMember.id);
        if (inAthletes) inAthletes.avatarUrl = cloudUrl;

        // Update semua elemen UI avatar
        updateAllAvatarUI(cloudUrl);

        // Update lightbox jika terbuka
        const zoomImg = document.getElementById('avatarZoomImg');
        if (zoomImg) { zoomImg.src = cloudUrl; zoomImg.classList.remove('hidden'); }
        const placeholder = document.getElementById('avatarZoomPlaceholder');
        if (placeholder) placeholder.classList.add('hidden');

        showToast('Foto Diperbarui ✅', 'Foto profil berhasil disimpan dan sinkron ke cloud.');
    } catch (err) {
        console.error('Avatar upload error:', err);
        showToast('Gagal Upload', 'Terjadi kesalahan saat mengunggah foto profil.');
    }
    // Reset input agar bisa pilih file yang sama lagi
    event.target.value = '';
}

function updateAllAvatarUI(avatarUrl) {
    const initial = (loggedMember ? (loggedMember.nickname || loggedMember.fullName || 'A') : 'A').charAt(0).toUpperCase();

    // Banner avatar
    const bannerImg = document.getElementById('memberBannerAvatarImg');
    const bannerInit = document.getElementById('memberBannerAvatarInitial');
    if (avatarUrl && bannerImg) {
        bannerImg.src = avatarUrl;
        bannerImg.classList.remove('hidden');
        if (bannerInit) bannerInit.classList.add('hidden');
    } else {
        if (bannerImg) bannerImg.classList.add('hidden');
        if (bannerInit) { bannerInit.textContent = initial; bannerInit.classList.remove('hidden'); }
    }

    // Edit tab avatar
    const editImg = document.getElementById('memberEditAvatarImg');
    const editInit = document.getElementById('memberEditAvatarInitial');
    if (avatarUrl && editImg) {
        editImg.src = avatarUrl;
        editImg.classList.remove('hidden');
        if (editInit) editInit.classList.add('hidden');
    } else {
        if (editImg) editImg.classList.add('hidden');
        if (editInit) { editInit.textContent = initial; editInit.classList.remove('hidden'); }
    }
}

function openMemberAvatarLightbox(athleteId) {
    const m = athleteId ? athletes.find(a => a.id == athleteId) : loggedMember;
    if (!m) return;

    const modal = document.getElementById('modalAvatarZoom');
    if (!modal) return;

    const zoomImg = document.getElementById('avatarZoomImg');
    const placeholder = document.getElementById('avatarZoomPlaceholder');
    const avatarUrl = m.avatarUrl || '';

    if (avatarUrl && zoomImg) {
        zoomImg.src = avatarUrl;
        zoomImg.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
        const dlBtn = document.getElementById('avatarZoomDownloadBtn');
        if (dlBtn) dlBtn.href = avatarUrl;
    } else {
        if (zoomImg) zoomImg.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
    }

    // Player Info
    const regNo = typeof getAthleteRegNo === 'function' ? getAthleteRegNo(m) : (m.regNo || '-');
    const nickEl = document.getElementById('avatarZoomNickname');
    const divEl = document.getElementById('avatarZoomDivision');
    const subEl = document.getElementById('avatarZoomSub');
    if (nickEl) nickEl.textContent = m.nickname || m.fullName || '-';
    if (divEl) divEl.textContent = m.division || '-';
    if (subEl) subEl.textContent = `No. Reg: ${regNo}`;

    // Show "Ganti Foto" button hanya jika ini milik loggedMember
    const uploadBtn = document.getElementById('avatarZoomUploadBtn');
    if (uploadBtn) {
        if (loggedMember && m.id == loggedMember.id) {
            uploadBtn.classList.remove('hidden');
        } else {
            uploadBtn.classList.add('hidden');
        }
    }

    // Reset zoom
    resetAvatarZoom();

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

function closeAvatarLightbox() {
    const modal = document.getElementById('modalAvatarZoom');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    document.body.style.overflow = '';
    resetAvatarZoom();
}

function zoomAvatar(delta) {
    _avatarZoomScale = Math.min(4.0, Math.max(0.5, _avatarZoomScale + delta));
    _applyAvatarZoom();
}

function resetAvatarZoom() {
    _avatarZoomScale = 1.0;
    _applyAvatarZoom();
}

function toggleAvatarZoomLevel() {
    _avatarZoomScale = _avatarZoomScale >= 2.0 ? 1.0 : 2.0;
    _applyAvatarZoom();
}

function _applyAvatarZoom() {
    const img = document.getElementById('avatarZoomImg');
    if (img) img.style.transform = `scale(${_avatarZoomScale})`;
    const pct = document.getElementById('avatarZoomPercentage');
    if (pct) pct.textContent = `${Math.round(_avatarZoomScale * 100)}%`;
}

// ==================== END FITUR AVATAR ====================

async function handleMemberPasswordChange(e) {
    e.preventDefault();
    if (!loggedMember) return;

    const newPass = document.getElementById('memberNewPass').value;
    const confirmPass = document.getElementById('memberConfirmPass').value;

    if (!newPass || newPass.length < 5) {
        showToast('Validasi Gagal', 'Password baru minimal 5 karakter.');
        return;
    }

    if (newPass !== confirmPass) {
        showToast('Validasi Gagal', 'Konfirmasi password baru tidak cocok.');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Menyimpan...';
    }

    try {
        const res = await Api.updateMemberProfile(loggedMember.id, {
            password: newPass
        });

        if (res.success) {
            document.getElementById('memberNewPass').value = '';
            document.getElementById('memberConfirmPass').value = '';
            showToast('Password Berhasil Diubah', 'Kata sandi akun Anda telah diperbarui.');
        } else {
            showToast('Gagal', res.message || 'Gagal mengubah kata sandi.');
        }
    } catch (err) {
        showToast('Gagal', 'Terjadi kesalahan sistem.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-key me-2"></i> Perbarui Kata Sandi';
        }
    }
}

// ==========================================
// MODUL KTA DIGITAL & INSTAGRAM STORY SHARE
// ==========================================
let currentKtaFormat = 'story'; // 'story' | 'card'
let cachedKtaLogo = null;

function loadKtaImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            // Coba muat tanpa crossOrigin jika gagal
            const fallback = new Image();
            fallback.onload = () => resolve(fallback);
            fallback.onerror = () => resolve(null);
            fallback.src = src;
        };
        img.src = src;
    });
}

function drawCanvasRoundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'number') {
        radius = { tl: radius, tr: radius, br: radius, bl: radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

// Gambar Badge Gamer Vektor Tajam (Bebas font emoji sistem)
function drawCanvasGamerBadge(ctx, cx, cy, size, initial) {
    ctx.save();
    const r = size / 2;

    // Lingkaran Luar dengan Gradasi Cyber Dark
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
    grad.addColorStop(0, '#1E293B');
    grad.addColorStop(1, '#0B0F19');
    ctx.fillStyle = grad;
    ctx.fill();

    // Bingkai Luar Berpendar Merah
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = Math.max(3, size * 0.035);
    ctx.stroke();

    // Gambar Game Controller / Gamepad Modern Vektor
    const cw = size * 0.52;
    const ch = size * 0.32;
    const top = cy - ch * 0.42;

    ctx.save();
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = Math.max(2, size * 0.015);

    // Bodi gamepad
    drawCanvasRoundRect(ctx, cx - cw / 2, top, cw, ch, ch * 0.38, true, true);

    // D-Pad kiri
    const dpadSize = cw * 0.22;
    const dpadX = cx - cw * 0.27;
    const dpadY = top + ch * 0.5;
    const armW = dpadSize * 0.34;
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(dpadX - armW / 2, dpadY - dpadSize / 2, armW, dpadSize);
    ctx.fillRect(dpadX - dpadSize / 2, dpadY - armW / 2, dpadSize, armW);

    // 4 Tombol Aksi kanan (Kuning, Hijau, Biru, Merah)
    const btnGroupX = cx + cw * 0.27;
    const btnGroupY = top + ch * 0.5;
    const btnOffset = dpadSize * 0.36;
    const btnR = dpadSize * 0.16;

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath(); ctx.arc(btnGroupX, btnGroupY - btnOffset, btnR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10B981';
    ctx.beginPath(); ctx.arc(btnGroupX, btnGroupY + btnOffset, btnR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3B82F6';
    ctx.beginPath(); ctx.arc(btnGroupX - btnOffset, btnGroupY, btnR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath(); ctx.arc(btnGroupX + btnOffset, btnGroupY, btnR, 0, Math.PI * 2); ctx.fill();

    // Dual Analog Sticks
    const stickR = cw * 0.085;
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx - cw * 0.1, top + ch * 0.72, stickR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + cw * 0.1, top + ch * 0.72, stickR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Inisial atlet di atas gamepad
    if (initial) {
        ctx.fillStyle = '#FBBF24';
        ctx.font = `900 ${Math.round(size * 0.22)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial.toUpperCase(), cx, cy - ch * 0.75);
    }

    ctx.restore();
    ctx.restore();
}

// Fallback Logo ESI jika file aset belum siap
function drawFallbackEsiLogo(ctx, cx, cy, size) {
    ctx.save();
    const w = size;
    const h = size * 1.15;
    const x = cx - w / 2;
    const y = cy - h / 2;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h * 0.6);
    ctx.quadraticCurveTo(x + w, y + h, cx, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h * 0.6);
    ctx.closePath();

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#DC2626');
    grad.addColorStop(1, '#991B1B');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = Math.max(2, size * 0.04);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(size * 0.32)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('ESI', cx, cy - h * 0.1);

    ctx.fillStyle = '#FBBF24';
    ctx.font = `800 ${Math.round(size * 0.12)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText('TRENGGALEK', cx, cy + h * 0.22);
    ctx.restore();
}

function drawSimulatedQr(ctx, x, y, size, seedStr) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    drawCanvasRoundRect(ctx, x, y, size, size, 12, true, false);

    const pad = 12;
    const innerSize = size - pad * 2;
    const cells = 21;
    const cellSize = innerSize / cells;

    let hash = 0;
    const str = seedStr || 'ESI-TRENGGALEK';
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }

    function drawFinder(fx, fy) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(x + pad + fx * cellSize, y + pad + fy * cellSize, 7 * cellSize, 7 * cellSize);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x + pad + (fx + 1) * cellSize, y + pad + (fy + 1) * cellSize, 5 * cellSize, 5 * cellSize);
        ctx.fillStyle = '#DC2626';
        ctx.fillRect(x + pad + (fx + 2) * cellSize, y + pad + (fy + 2) * cellSize, 3 * cellSize, 3 * cellSize);
    }
    drawFinder(0, 0);
    drawFinder(cells - 7, 0);
    drawFinder(0, cells - 7);

    ctx.fillStyle = '#0F172A';
    for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
            if ((r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8)) continue;
            if (r >= 9 && r <= 11 && c >= 9 && c <= 11) continue;
            const bit = Math.abs((hash * (r + 1) + (c + 1) * 37) % 23) > 10;
            if (bit) {
                ctx.fillRect(x + pad + c * cellSize, y + pad + r * cellSize, cellSize * 0.9, cellSize * 0.9);
            }
        }
    }

    // Center emblem dot
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, cellSize * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function openKtaShareModal(format = 'story') {
    if (!loggedMember) {
        showToast('Perlu Login', 'Silakan masuk ke Portal Anggota untuk mengakses dan membagikan KTA Digital Anda.');
        navigateTo('member');
        return;
    }
    const modal = document.getElementById('modalKtaShare');
    if (!modal) {
        console.error('Modal modalKtaShare tidak ditemukan di DOM');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    currentKtaFormat = format;
    updateKtaFormatUi();
    updateKtaCaptionPreview();
    renderKtaCanvas();
}

function closeKtaShareModal() {
    const modal = document.getElementById('modalKtaShare');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function switchKtaFormat(format) {
    if (currentKtaFormat === format) return;
    currentKtaFormat = format;
    updateKtaFormatUi();
    renderKtaCanvas();
}

function updateKtaFormatUi() {
    const storyBtn = document.getElementById('ktaFormatStoryBtn');
    const cardBtn = document.getElementById('ktaFormatCardBtn');
    const wrapper = document.getElementById('ktaPreviewWrapper');

    if (currentKtaFormat === 'story') {
        if (storyBtn) {
            storyBtn.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 bg-white text-[#0F172A] shadow-sm active:scale-95 touch-manipulation';
        }
        if (cardBtn) {
            cardBtn.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 text-slate-400 hover:text-white active:scale-95 touch-manipulation';
        }
        if (wrapper) {
            wrapper.className = 'flex justify-center items-center w-full max-w-[260px] xs:max-w-[280px] sm:max-w-[320px] transition-all duration-300';
        }
    } else {
        if (storyBtn) {
            storyBtn.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 text-slate-400 hover:text-white active:scale-95 touch-manipulation';
        }
        if (cardBtn) {
            cardBtn.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 bg-white text-[#0F172A] shadow-sm active:scale-95 touch-manipulation';
        }
        if (wrapper) {
            wrapper.className = 'flex justify-center items-center w-full max-w-full sm:max-w-[500px] md:max-w-[560px] transition-all duration-300';
        }
    }
}

function updateKtaCaptionPreview() {
    const m = loggedMember;
    if (!m) return;
    const preview = document.getElementById('ktaCaptionPreview');
    if (preview) {
        preview.textContent = `Resmi terdaftar sebagai Atlet Esports ESI Trenggalek! Divisi ${m.division} • ${m.nickname} (#ESITrenggalek)`;
    }
}

let lastRenderedKtaKey = '';

async function renderKtaCanvas(force = false) {
    const canvas = document.getElementById('ktaExportCanvas');
    const m = loggedMember;
    if (!canvas || !m) return;

    const currentKey = `${m.id}-${currentKtaFormat}-${m.division}-${m.points}`;
    if (!force && lastRenderedKtaKey === currentKey && canvas.width > 0) {
        return;
    }

    const loading = document.getElementById('ktaCanvasLoading');
    if (loading) loading.classList.remove('hidden');

    if (document.fonts && document.fonts.ready) {
        try {
            await document.fonts.ready;
        } catch (_) {}
    }

    if (!cachedKtaLogo) {
        cachedKtaLogo = await loadKtaImage('assets/images/logo-esi.png');
    }

    const ctx = canvas.getContext('2d');

    // Rank calculation
    const divAthletes = athletes
        .filter(a => a.division === m.division && a.status === 'verified')
        .sort((a, b) => (b.points || 0) - (a.points || 0));
    const rankIndex = divAthletes.findIndex(a => a.id == m.id);
    const rankText = rankIndex >= 0 ? `#${rankIndex + 1}` : '-';
    const regNo = getAthleteRegNo(m);

    if (currentKtaFormat === 'story') {
        canvas.width = 1080;
        canvas.height = 1920;
        drawStoryCardCanvas(ctx, m, cachedKtaLogo, regNo, rankText);
    } else {
        canvas.width = 1200;
        canvas.height = 750;
        drawHorizontalCardCanvas(ctx, m, cachedKtaLogo, regNo, rankText);
    }

    lastRenderedKtaKey = currentKey;
    if (loading) loading.classList.add('hidden');
}

function drawStoryCardCanvas(ctx, m, logoImg, regNo, rankText) {
    const W = 1080;
    const H = 1920;

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#060B17');
    bgGrad.addColorStop(0.25, '#0F172A');
    bgGrad.addColorStop(0.7, '#151C33');
    bgGrad.addColorStop(1, '#080C18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Radial Glow Accents (Top Red, Bottom Gold)
    const topGlow = ctx.createRadialGradient(W / 2, 280, 20, W / 2, 280, 500);
    topGlow.addColorStop(0, 'rgba(220, 38, 38, 0.35)');
    topGlow.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, W, 800);

    const botGlow = ctx.createRadialGradient(W / 2, 1450, 40, W / 2, 1450, 600);
    botGlow.addColorStop(0, 'rgba(217, 119, 6, 0.22)');
    botGlow.addColorStop(1, 'rgba(217, 119, 6, 0)');
    ctx.fillStyle = botGlow;
    ctx.fillRect(0, 900, W, 1020);

    // 3. Cyber Geometric Tech Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1.5;
    for (let x = -H; x < W + H; x += 70) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + H, H);
        ctx.stroke();
    }
    ctx.restore();

    // 4. Outer Cyber Frame & Corner Accents
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 3;
    drawCanvasRoundRect(ctx, 40, 40, W - 80, H - 80, 28, false, true);

    // Corner Tech Cuts (Red & Gold)
    const cornerSize = 45;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#DC2626';
    // Top Left
    ctx.beginPath();
    ctx.moveTo(40, 40 + cornerSize);
    ctx.lineTo(40, 40);
    ctx.lineTo(40 + cornerSize, 40);
    ctx.stroke();
    // Top Right
    ctx.beginPath();
    ctx.moveTo(W - 40 - cornerSize, 40);
    ctx.lineTo(W - 40, 40);
    ctx.lineTo(W - 40, 40 + cornerSize);
    ctx.stroke();

    ctx.strokeStyle = '#D97706';
    // Bottom Left
    ctx.beginPath();
    ctx.moveTo(40, H - 40 - cornerSize);
    ctx.lineTo(40, H - 40);
    ctx.lineTo(40 + cornerSize, H - 40);
    ctx.stroke();
    // Bottom Right
    ctx.beginPath();
    ctx.moveTo(W - 40 - cornerSize, H - 40);
    ctx.lineTo(W - 40, H - 40);
    ctx.lineTo(W - 40, H - 40 - cornerSize);
    ctx.stroke();
    ctx.restore();

    // 5. Header Area (Logo & Titles)
    if (logoImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(220, 38, 38, 0.6)';
        ctx.shadowBlur = 25;
        ctx.drawImage(logoImg, W / 2 - 60, 110, 120, 120);
        ctx.restore();
    } else {
        drawFallbackEsiLogo(ctx, W / 2, 170, 110);
    }

    ctx.textAlign = 'center';
    // Top organization subtitle
    ctx.fillStyle = '#F59E0B';
    ctx.font = '800 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('CABANG OLAHRAGA PRESTASI', W / 2, 275);

    // Main Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 36px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('ESI KABUPATEN TRENGGALEK', W / 2, 325);

    // E-KTA Badge Pill
    ctx.fillStyle = 'rgba(220, 38, 38, 0.2)';
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 2;
    drawCanvasRoundRect(ctx, W / 2 - 250, 355, 500, 42, 21, true, true);
    ctx.fillStyle = '#FCA5A5';
    ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('KARTU TANDA ANGGOTA ELEKTRONIK (E-KTA)', W / 2, 382);

    // 6. Registration Number Box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.5)';
    ctx.lineWidth = 1.5;
    drawCanvasRoundRect(ctx, W / 2 - 200, 420, 400, 46, 12, true, true);
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`NO. REG: ${regNo}`, W / 2, 450);

    // 7. Player Avatar / Emblem Hero Card
    const avatarY = 505;
    const avatarSize = 250;
    ctx.save();
    ctx.shadowColor = 'rgba(220, 38, 38, 0.7)';
    ctx.shadowBlur = 30;
    const frameGrad = ctx.createLinearGradient(W / 2 - avatarSize / 2, avatarY, W / 2 + avatarSize / 2, avatarY + avatarSize);
    frameGrad.addColorStop(0, '#DC2626');
    frameGrad.addColorStop(1, '#F59E0B');
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = 6;
    ctx.fillStyle = '#0F172A';
    drawCanvasRoundRect(ctx, W / 2 - avatarSize / 2, avatarY, avatarSize, avatarSize, 32, true, true);
    ctx.restore();

    // Inside avatar: Vektor Gamepad Esports
    const initialChar = (m.nickname || m.fullName || 'A').charAt(0);
    drawCanvasGamerBadge(ctx, W / 2, avatarY + avatarSize / 2, avatarSize * 0.82, initialChar);

    // 8. Official Status & Division Badges
    const statusY = avatarY + avatarSize + 30;
    const isVerified = (m.status === 'verified');
    ctx.save();
    if (isVerified) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        drawCanvasRoundRect(ctx, W / 2 - 190, statusY, 380, 44, 22, true, true);
        ctx.fillStyle = '#34D399';
        ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('✓  ATLET RESMI TERVERIFIKASI', W / 2, statusY + 28);
    } else {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        drawCanvasRoundRect(ctx, W / 2 - 180, statusY, 360, 44, 22, true, true);
        ctx.fillStyle = '#FBBF24';
        ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('⏳  DALAM ANTREAN VERIFIKASI', W / 2, statusY + 28);
    }
    ctx.restore();

    // Division Badge
    const divY = statusY + 62;
    ctx.save();
    ctx.fillStyle = '#DC2626';
    drawCanvasRoundRect(ctx, W / 2 - 170, divY, 340, 42, 10, true, false);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText((m.division || 'ESPORTS').toUpperCase(), W / 2, divY + 27);
    ctx.restore();

    // 9. Athlete Names & Identity
    const nameY = divY + 95;
    // Ingame Nickname (Huge & Golden)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FBBF24';
    ctx.font = '900 58px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(m.nickname || 'ATLET', W / 2, nameY);

    // Full Name (Auto-scale jika panjang)
    ctx.fillStyle = '#FFFFFF';
    let nameSize = 32;
    ctx.font = `800 ${nameSize}px "Plus Jakarta Sans", sans-serif`;
    const fullUpper = (m.fullName || '-').toUpperCase();
    while (nameSize > 18 && ctx.measureText(fullUpper).width > (W - 160)) {
        nameSize -= 2;
        ctx.font = `800 ${nameSize}px "Plus Jakarta Sans", sans-serif`;
    }
    ctx.fillText(fullUpper, W / 2, nameY + 50);

    // ID & Team
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`ID INGAME: ${m.gameId || '-'}  •  ${m.teamName || 'Individu'}`, W / 2, nameY + 92);
    ctx.restore();

    // 10. 3 Key Stat Cards in a Row
    const statsY = nameY + 130;
    const cardW = 280;
    const cardH = 110;
    const gap = 20;
    const startX = (W - (cardW * 3 + gap * 2)) / 2;

    const statsData = [
        { label: 'DOMISILI KECAMATAN', val: `Kec. ${m.kecamatan || 'Trenggalek'}`, color: '#FFFFFF' },
        { label: 'ASAL / INSTANSI', val: m.institution || '-', color: '#F1F5F9' },
        { label: 'POIN & PERINGKAT', val: `${m.points || 0} Poin (${rankText})`, color: '#FBBF24' }
    ];

    statsData.forEach((st, idx) => {
        const sx = startX + idx * (cardW + gap);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
        ctx.lineWidth = 1.5;
        drawCanvasRoundRect(ctx, sx, statsY, cardW, cardH, 16, true, true);

        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.label, sx + cardW / 2, statsY + 38);

        ctx.fillStyle = st.color;
        ctx.font = '800 19px "Plus Jakarta Sans", sans-serif';
        let valText = st.val;
        if (ctx.measureText(valText).width > cardW - 20) {
            valText = valText.substring(0, 18) + '...';
        }
        ctx.fillText(valText, sx + cardW / 2, statsY + 76);
    });

    // 11. Security & Official Verification Seal Section
    const secY = statsY + 145;
    const secW = W - 160;
    const secX = 80;
    const secH = 210;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    ctx.lineWidth = 2;
    drawCanvasRoundRect(ctx, secX, secY, secW, secH, 20, true, true);

    // Draw Simulated QR Code on left of security box
    drawSimulatedQr(ctx, secX + 25, secY + 25, 160, `ESI-TGL-${m.id}-${regNo}`);

    // Right of QR: Official Stamp & Legal Texts
    const textLeft = secX + 215;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#F59E0B';
    ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('KEABSAHAN KARTU TANDA ANGGOTA RESMI', textLeft, secY + 55);

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('• Berafiliasi Resmi PBESI & KONI Kabupaten Trenggalek', textLeft, secY + 88);
    ctx.fillText('• Berlaku untuk PORKAB, PORPROV Jatim, & Event Resmi', textLeft, secY + 118);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Verifikasi online mandiri via menu Cek Data: esitrenggalek.id', textLeft, secY + 155);

    // 12. Bottom Social & Hashtags Footer
    const footY = H - 110;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F59E0B';
    ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('#TrenggalekJuara   •   #ESITrenggalek   •   #MenakSopal', W / 2, footY);

    ctx.fillStyle = '#64748B';
    ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Portal Resmi: https://esitrenggalek.id   |   Instagram: @esi_trenggalek', W / 2, footY + 34);
}

function drawHorizontalCardCanvas(ctx, m, logoImg, regNo, rankText) {
    const W = 1200;
    const H = 750;

    // Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0F172A');
    bgGrad.addColorStop(0.5, '#1E293B');
    bgGrad.addColorStop(1, '#0B0F19');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Glowing cyber corner accents
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 4;
    drawCanvasRoundRect(ctx, 30, 30, W - 60, H - 60, 24, false, true);

    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(30, 90); ctx.lineTo(30, 30); ctx.lineTo(90, 30);
    ctx.stroke();

    ctx.strokeStyle = '#D97706';
    ctx.beginPath();
    ctx.moveTo(W - 90, H - 30); ctx.lineTo(W - 30, H - 30); ctx.lineTo(W - 30, H - 90);
    ctx.stroke();
    ctx.restore();

    // Top Header
    if (logoImg) {
        ctx.drawImage(logoImg, 60, 55, 80, 80);
    } else {
        drawFallbackEsiLogo(ctx, 100, 95, 75);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#DC2626';
    ctx.font = '800 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('KARTU TANDA ANGGOTA ELEKTRONIK (E-KTA)', 160, 85);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('ESI KABUPATEN TRENGGALEK', 160, 120);

    // Reg No on Top Right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('NO. REGISTRASI', W - 65, 85);
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(regNo, W - 65, 118);

    // Divider Line
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(60, 155);
    ctx.lineTo(W - 60, 155);
    ctx.stroke();

    // Left Column: Avatar & Game ID (w: 200)
    const leftX = 60;
    const avatarY = 185;
    const avatarSize = 190;
    ctx.fillStyle = '#0B1120';
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 4;
    drawCanvasRoundRect(ctx, leftX, avatarY, avatarSize, avatarSize, 20, true, true);

    const initialChar = (m.nickname || m.fullName || 'A').charAt(0);
    drawCanvasGamerBadge(ctx, leftX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize * 0.85, initialChar);

    // Division pill below avatar
    ctx.fillStyle = '#DC2626';
    drawCanvasRoundRect(ctx, leftX, avatarY + avatarSize + 15, avatarSize, 36, 8, true, false);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 14px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((m.division || 'ESPORTS').toUpperCase(), leftX + avatarSize / 2, avatarY + avatarSize + 38);

    // ID Ingame
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`ID: ${m.gameId || '-'}`, leftX + avatarSize / 2, avatarY + avatarSize + 78);

    // Right Column: Details & Stats
    const rightX = leftX + avatarSize + 40;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('NAMA LENGKAP ATLET', rightX, 205);

    // Full Name auto-fit
    ctx.fillStyle = '#FFFFFF';
    let hNameSize = 36;
    ctx.font = `900 ${hNameSize}px "Plus Jakarta Sans", sans-serif`;
    const fullUpperH = (m.fullName || '-').toUpperCase();
    while (hNameSize > 20 && ctx.measureText(fullUpperH).width > 620) {
        hNameSize -= 2;
        ctx.font = `900 ${hNameSize}px "Plus Jakarta Sans", sans-serif`;
    }
    ctx.fillText(fullUpperH, rightX, 248);

    ctx.fillStyle = '#FBBF24';
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`@${m.nickname || 'atlet'}  •  ${m.teamName || 'Individu'}`, rightX, 290);

    // Grid details (3 columns)
    const gridY = 340;
    const infoCols = [
        { label: 'DOMISILI', val: `Kec. ${m.kecamatan || 'Trenggalek'}` },
        { label: 'ASAL / INSTANSI', val: m.institution || '-' },
        { label: 'POIN & PERINGKAT', val: `${m.points || 0} Poin (${rankText})` }
    ];

    infoCols.forEach((col, idx) => {
        const cx = rightX + idx * 230;
        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(col.label, cx, gridY);

        ctx.fillStyle = idx === 2 ? '#FBBF24' : '#E2E8F0';
        ctx.font = '800 17px "Plus Jakarta Sans", sans-serif';
        let cv = col.val;
        if (ctx.measureText(cv).width > 210) {
            cv = cv.substring(0, 16) + '...';
        }
        ctx.fillText(cv, cx, gridY + 28);
    });

    // Verification Badge & Security Box
    const botY = 445;
    const isVerified = (m.status === 'verified');
    if (isVerified) {
        ctx.fillStyle = '#10B981';
        drawCanvasRoundRect(ctx, rightX, botY, 260, 40, 20, true, false);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 15px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('✓  TERVERIFIKASI RESMI', rightX + 22, botY + 26);
    } else {
        ctx.fillStyle = '#F59E0B';
        drawCanvasRoundRect(ctx, rightX, botY, 260, 40, 20, true, false);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 15px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('⏳  DALAM ANTREAN', rightX + 35, botY + 26);
    }

    // Security Box di samping status badge
    const secBoxX = rightX;
    const secBoxY = botY + 55;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.lineWidth = 1;
    drawCanvasRoundRect(ctx, secBoxX, secBoxY, 410, 80, 12, true, true);

    ctx.fillStyle = '#F59E0B';
    ctx.font = '800 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('KEABSAHAN KARTU TANDA ANGGOTA RESMI', secBoxX + 16, secBoxY + 26);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('• Berafiliasi Resmi PBESI & KONI Kabupaten Trenggalek', secBoxX + 16, secBoxY + 48);
    ctx.fillText('• Verifikasi online mandiri via: https://esitrenggalek.id', secBoxX + 16, secBoxY + 68);

    // QR Code simulation on bottom right
    const qrSize = 160;
    const qrX = W - 220;
    const qrY = 395;
    drawSimulatedQr(ctx, qrX, qrY, qrSize, `ESI-TGL-${m.id}-${regNo}`);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('SCAN VERIFIKASI', qrX + qrSize / 2, qrY + qrSize + 22);
    ctx.restore();

    // Footer note
    ctx.fillStyle = '#64748B';
    ctx.font = '13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Cabang Olahraga Prestasi ESI Trenggalek • Berafiliasi PBESI & KONI • #TrenggalekJuara', rightX, 645);
}

function downloadKtaPng() {
    const canvas = document.getElementById('ktaExportCanvas');
    const m = loggedMember;
    if (!canvas || !m) {
        showToast('Gagal Mengunduh', 'Data atlet atau canvas KTA belum siap.');
        return;
    }

    try {
        const link = document.createElement('a');
        const cleanName = (m.nickname || m.fullName || 'Atlet').replace(/[^a-zA-Z0-9_-]/g, '_');
        link.download = `KTA-ESI-Trenggalek-${cleanName}-${currentKtaFormat}.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('KTA Berhasil Diunduh', 'Gambar HD siap dibagikan ke Instagram Story atau disimpan.');
    } catch (err) {
        console.error('Download error:', err);
        canvas.toBlob((blob) => {
            if (!blob) {
                showToast('Gagal Mengunduh', 'Browser memblokir konversi canvas ke gambar.');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const cleanName = (m.nickname || m.fullName || 'Atlet').replace(/[^a-zA-Z0-9_-]/g, '_');
            link.download = `KTA-ESI-Trenggalek-${cleanName}-${currentKtaFormat}.png`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast('KTA Berhasil Diunduh', 'Gambar HD siap disimpan.');
        }, 'image/png');
    }
}

async function shareKtaDirectly() {
    const canvas = document.getElementById('ktaExportCanvas');
    const m = loggedMember;
    if (!canvas || !m) {
        showToast('Gagal Membagikan', 'Data anggota belum siap.');
        return;
    }

    try {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                downloadKtaPng();
                return;
            }

            const fileName = `KTA-ESI-Trenggalek-${(m.nickname || m.fullName).replace(/[^a-zA-Z0-9_-]/g, '_')}-Story.png`;
            const file = new File([blob], fileName, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'KTA Resmi ESI Kabupaten Trenggalek',
                        text: `Saya resmi terdaftar sebagai Atlet Esports ESI KABUPATEN TRENGGALEK! Divisi ${m.division}. Cek keabsahan data di https://esitrenggalek.id #ESITrenggalek #PBESI`
                    });
                    showToast('KTA Berhasil Dibagikan', 'Pilih Instagram Stories atau media sosial Anda.');
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        return; // Batal oleh pengguna
                    }
                    console.warn('Share error:', err);
                }
            }

            // Fallback desktop / browser tanpa Web Share API
            downloadKtaPng();
            copyKtaCaption();
            showToast('KTA Diunduh & Caption Disalin', 'File KTA otomatis terunduh dan caption telah disalin! Buka Instagram di HP Anda untuk posting Cerita.');
        }, 'image/png');
    } catch (e) {
        console.error('Share error:', e);
        downloadKtaPng();
    }
}

function copyKtaCaption() {
    const m = loggedMember;
    if (!m) return;
    const caption = `Resmi terdaftar sebagai Atlet Esports binaan ESI KABUPATEN TRENGGALEK! 🎮🔥\n\nNama: ${m.fullName}\nIGN: ${m.nickname} (ID: ${m.gameId})\nDivisi: ${m.division}\nTim: ${m.teamName || 'Individu'}\nNo. Reg: ${getAthleteRegNo(m)}\n\nBerafiliasi Resmi PBESI & KONI Trenggalek.\nCek keabsahan atlet di: https://esitrenggalek.id\n\n#ESITrenggalek #PBESI #EsportsIndonesia #TrenggalekJuara #MenakSopal`;

    navigator.clipboard.writeText(caption).then(() => {
        showToast('Caption Disalin', 'Teks caption telah disalin ke clipboard! Siap ditempel di Instagram.');
    }).catch(() => {
        showToast('Gagal Salin', 'Silakan salin teks caption secara manual.');
    });
}

async function printKtaPhysical() {
    const canvas = document.getElementById('ktaExportCanvas');
    const m = loggedMember;
    if (!canvas || !m) return;

    // Pastikan format card untuk cetak fisik ID card
    if (currentKtaFormat !== 'card') {
        currentKtaFormat = 'card';
        updateKtaFormatUi();
        await renderKtaCanvas();
    }

    const dataUrl = canvas.toDataURL('image/png');

    const printWin = window.open('', '_blank');
    if (!printWin) {
        showToast('Pop-up Diblokir', 'Mohon izinkan pop-up peramban untuk mencetak KTA.');
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cetak KTA - ESI Trenggalek</title>
            <style>
                @page { size: auto; margin: 10mm; }
                body { margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: #fff; }
                .card-print { width: 85.6mm; height: 53.98mm; border-radius: 3.18mm; overflow: hidden; box-shadow: 0 0 1px rgba(0,0,0,0.5); }
                img { width: 100%; height: 100%; object-fit: contain; }
                .note { font-size: 11px; color: #666; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="card-print">
                <img src="${dataUrl}" alt="KTA Digital">
            </div>
            <p class="note">Standar Ukuran Kartu ID (CR80: 85.6 x 53.98 mm) - ESI Trenggalek</p>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

// Reset All Data ke Awal
async function resetAllSeedData() {
    if (confirm('Reset seluruh data ke data awal demo?')) {
        await Api.resetToSeedData();
        await refreshAllData();
        renderAdminView();
        showToast('Data Direset', 'Seluruh data dikembalikan ke data awal demo ESI Trenggalek.');
    }
}

// Event Listener Modal Click-outside
document.addEventListener('DOMContentLoaded', () => {
    const newsModal = document.getElementById('newsModal');
    if (newsModal) {
        newsModal.addEventListener('click', function(e) {
            if (e.target === this) closeNewsModal();
        });
    }

    // Modal Detail Atlet — tutup jika klik di luar
    const athleteDetailModal = document.getElementById('modalAthleteDetail');
    if (athleteDetailModal) {
        athleteDetailModal.addEventListener('click', function(e) {
            if (e.target === this) closeAthleteDetailModal();
        });
    }

    // Event Detail — menggunakan full-page view (bukan modal), klik luar tidak berlaku

    // Modal Pratinjau Berita — tutup jika klik di luar
    const newsPreviewModal = document.getElementById('newsPreviewModal');
    if (newsPreviewModal) {
        newsPreviewModal.addEventListener('click', function(e) {
            if (e.target === this) closeNewsPreviewModal();
        });
    }

    // Modal Share KTA — tutup jika klik di luar
    const ktaShareModal = document.getElementById('modalKtaShare');
    if (ktaShareModal) {
        ktaShareModal.addEventListener('click', function(e) {
            if (e.target === this) closeKtaShareModal();
        });
    }

    // Modal Avatar Zoom (MLBB style) — tutup jika klik di luar
    const avatarZoomModal = document.getElementById('modalAvatarZoom');
    if (avatarZoomModal) {
        avatarZoomModal.addEventListener('click', function(e) {
            if (e.target === this) closeAvatarLightbox();
        });
    }

    // Modal Sisipkan Foto Dokumentasi Inline
    const inlinePhotoModal = document.getElementById('modalInsertInlinePhoto');
    if (inlinePhotoModal) {
        inlinePhotoModal.addEventListener('click', function(e) {
            if (e.target === this) closeInlinePhotoModal();
        });
    }

    // Modal Crop & Atur Foto Sampul Berita
    const cropperModal = document.getElementById('modalCoverCropper');
    if (cropperModal) {
        cropperModal.addEventListener('click', function(e) {
            if (e.target === this) closeCoverCropperModal();
        });
    }

    // Bootstrap Aplikasi
    initApp();
});



// ==================== MULTI-GAME PROFILES UNTUK MEMBER ====================

function renderMemberMultiGameList(m) {
    const listEl = document.getElementById('memberMultiGameList');
    if (!listEl) return;

    if (!m) m = loggedMember;
    if (!m) return;

    const profiles = m.gameProfiles || {};
    const entries = Object.entries(profiles);

    if (entries.length === 0) {
        listEl.innerHTML = `
            <div class="sm:col-span-2 p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                <i class="fa-solid fa-gamepad text-2xl text-slate-300 mb-1.5 block"></i>
                Belum ada akun game lain yang ditambahkan. Gunakan formulir di bawah untuk menambahkan ID Free Fire, PUBG, eFootball, dll.
            </div>
        `;
        return;
    }

    listEl.innerHTML = entries.map(([gameName, data]) => `
        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-sm hover:border-[#DC2626]/40 transition">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-sm font-black shrink-0">
                    <i class="fa-solid fa-gamepad text-[#DC2626]"></i>
                </div>
                <div class="min-w-0">
                    <div class="text-xs font-black text-[#0F172A] uppercase tracking-wide truncate">${gameName}</div>
                    <div class="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>Nick: <strong class="text-slate-900">${data.nickname || '-'}</strong></span>
                        <span class="text-slate-300">•</span>
                        <span>ID: <code class="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono font-bold text-red-600">${data.gameId || '-'}</code></span>
                    </div>
                </div>
            </div>
            <button onclick="handleDeleteMultiGameProfile('${gameName}')"
                class="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white flex items-center justify-center text-xs transition shrink-0"
                title="Hapus Akun Game Ini">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');
}

async function handleAddMultiGameProfile() {
    if (!loggedMember) {
        alert('Silakan login terlebih dahulu.');
        return;
    }

    const selectEl = document.getElementById('multiGameSelect');
    const nickEl = document.getElementById('multiGameNickname');
    const idEl = document.getElementById('multiGameId');

    const gameName = selectEl ? selectEl.value : '';
    const nickname = nickEl ? nickEl.value.trim() : '';
    const gameId = idEl ? idEl.value.trim() : '';

    if (!gameName) {
        alert('Pilih cabang game terlebih dahulu.');
        return;
    }
    if (!nickname) {
        alert('Masukkan Nickname in-game untuk game ini.');
        if (nickEl) nickEl.focus();
        return;
    }
    if (!gameId) {
        alert('Masukkan Game ID untuk game ini.');
        if (idEl) idEl.focus();
        return;
    }

    if (!loggedMember.gameProfiles) {
        loggedMember.gameProfiles = {};
    }

    loggedMember.gameProfiles[gameName] = {
        nickname,
        gameId
    };

    try {
        const res = await Api.updateMemberProfile(loggedMember.id, {
            gameProfiles: loggedMember.gameProfiles
        });

        if (res.success) {
            loggedMember = res.member;
            athletes = await Api.getAthletes();
            renderMemberMultiGameList(loggedMember);
            if (nickEl) nickEl.value = '';
            if (idEl) idEl.value = '';
            showToast('Akun Game Disimpan', `ID game untuk ${gameName} berhasil ditambahkan ke profil Anda.`);
        } else {
            showToast('Gagal', res.message || 'Tidak dapat menyimpan akun game.');
        }
    } catch (err) {
        console.error('Error saving multi game profile:', err);
        showToast('Gagal', 'Terjadi kesalahan sistem saat menyimpan.');
    }
}

async function handleDeleteMultiGameProfile(gameName) {
    if (!loggedMember || !loggedMember.gameProfiles) return;
    if (!confirm(`Hapus data akun game ${gameName} dari profil Anda?`)) return;

    delete loggedMember.gameProfiles[gameName];

    try {
        const res = await Api.updateMemberProfile(loggedMember.id, {
            gameProfiles: loggedMember.gameProfiles
        });
        if (res.success) {
            loggedMember = res.member;
            athletes = await Api.getAthletes();
            renderMemberMultiGameList(loggedMember);
            showToast('Akun Dihapus', `Profil ${gameName} telah dihapus.`);
        }
    } catch (err) {
        console.error('Error deleting multi game profile:', err);
    }
}

// ==================== PENDAFTARAN TURNAMEN (PAGE VIEW-DAFTAR-EVENT) ====================


function detectTournamentGame(ev) {
    const branchSel = document.getElementById('regTournamentGameBranch');
    if (branchSel && branchSel.value) {
        return branchSel.value;
    }

    if (!ev) return 'Mobile Legends';
    const div = (ev.division || '').toLowerCase();
    const title = (ev.title || '').toLowerCase();
    const full = div + ' ' + title;

    if (full.includes('free fire') || full.includes('ff')) return 'Free Fire';
    if (full.includes('pubg')) return 'PUBG Mobile';
    if (full.includes('efootball') || full.includes('pes')) return 'eFootball';
    if (full.includes('honor of kings') || full.includes('hok')) return 'Honor of Kings';
    if (full.includes('valorant')) return 'Valorant';
    if (full.includes('ea fc') || full.includes('fifa')) return 'EA FC Mobile';
    if (full.includes('mcgg') || full.includes('magic chess')) return 'MCGG';
    if (full.includes('codm') || full.includes('call of duty')) return 'Call of Duty Mobile';
    if (full.includes('aov') || full.includes('arena of valor')) return 'Arena of Valor';
    if (full.includes('dota')) return 'Dota 2';
    if (full.includes('chess') || full.includes('catur')) return 'Chess';
    if (full.includes('street fighter')) return 'Street Fighter 6';
    if (full.includes('mlbb') || full.includes('mobile legend')) return 'Mobile Legends';

    return 'Mobile Legends';
}

function findAthleteGameProfile(athlete, targetGame) {
    if (!athlete) return null;
    const profiles = athlete.gameProfiles || {};
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNorm = norm(targetGame);

    // 1. Cek di gameProfiles object
    for (const [gName, gData] of Object.entries(profiles)) {
        const gn = norm(gName);
        if (gn === targetNorm || gn.includes(targetNorm) || targetNorm.includes(gn)) {
            if (gData && (gData.gameId || gData.nickname)) {
                return {
                    gameName: gName,
                    nickname: gData.nickname || athlete.nickname,
                    gameId: gData.gameId || ''
                };
            }
        }
    }

    // 2. Cek divisi utama atlet jika sesuai targetGame
    const athleteDivNorm = norm(athlete.division);
    if (athleteDivNorm === targetNorm || athleteDivNorm.includes(targetNorm) || targetNorm.includes(athleteDivNorm)) {
        return {
            gameName: athlete.division || targetGame,
            nickname: athlete.nickname,
            gameId: athlete.gameId || ''
        };
    }

    // 3. Jika tidak ditemukan, kembalikan null
    return null;
}

function handleTournamentGameBranchChange(newGame) {
    const ev = events.find(e => e.id == activeRegisterEventId) || events[0];
    const badgeText = document.getElementById('regEventDivText');
    if (badgeText) badgeText.textContent = newGame;

    // Ambil konfigurasi roster untuk game baru yang dipilih (misal user ganti dari MLBB ke eFootball / Free Fire)
    const newConfig = getTournamentRosterConfig(newGame);
    renderRosterInputsByConfig(newConfig);

    // Autofill jika sedang login member ESI
    if (loggedMember) {
        const p1User = document.getElementById('roster_user_0');
        if (p1User) {
            p1User.value = loggedMember.username || loggedMember.whatsapp || '';
            lookupRosterMember(0, p1User.value);
        }
    }
}

function openEventRegistration(eventId) {
    if (!eventId && events.length > 0) eventId = events[0].id;
    activeRegisterEventId = eventId;
    activeEventId = null;
    window.location.hash = `daftar-event/${eventId}`;
    navigateTo('daftar-event', false);
    renderEventRegistrationPage(eventId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changeRegistrationEvent(eventId) {
    activeRegisterEventId = eventId;
    window.location.hash = `daftar-event/${eventId}`;
    renderEventRegistrationPage(eventId);
}


// ==================== CONFIG ROSTER RESMI PB ESI BERDASARKAN DIVISI GAME ====================
function getTournamentRosterConfig(divisionOrGame) {
    const d = (divisionOrGame || '').toLowerCase().trim();

    // 1. eFootball / PES: Solo (1v1) atau Co-op / Duo (2v2)
    if (d.includes('efootball') || d.includes('pes')) {
        return {
            gameType: 'efootball',
            minPlayers: 1,
            maxPlayers: 2,
            label: '1 Pemain Utama (Solo) / Maks. 2 Pemain (Co-op / Duo)',
            teamLabel: 'Nama Atlet / Tim eFootball',
            teamPlaceholder: 'Contoh: Bambang Prasetyo / Sopal Football Team',
            roles: [
                { role: 'Pemain Utama (Solo / Atlet)', required: true, short: 'P1', desc: 'Wajib' },
                { role: 'Pemain 2 / Partner Co-op (Opsional)', required: false, short: 'P2', desc: 'Opsional' }
            ]
        };
    }

    // 2. Solo / 1v1 Games (EA FC Mobile, Catur / Chess, Street Fighter 6 / Tekken, Magic Chess / MCGG, Clash Royale)
    if (
        d.includes('ea fc') || d.includes('fifa') ||
        d.includes('chess') || d.includes('catur') ||
        d.includes('street fighter') || d.includes('sf6') || d.includes('tekken') ||
        d.includes('magic chess') || d.includes('mcgg') ||
        d.includes('clash royale')
    ) {
        let gameName = 'Solo';
        if (d.includes('chess') || d.includes('catur')) gameName = 'Catur Online';
        else if (d.includes('ea fc') || d.includes('fifa')) gameName = 'EA FC Mobile';
        else if (d.includes('street fighter') || d.includes('sf6')) gameName = 'Street Fighter 6';
        else if (d.includes('magic chess') || d.includes('mcgg')) gameName = 'Magic Chess';
        else if (d.includes('clash royale')) gameName = 'Clash Royale';

        return {
            gameType: 'solo',
            minPlayers: 1,
            maxPlayers: 1,
            label: `1 Pemain Tunggal (Solo ${gameName})`,
            teamLabel: 'Nama Atlet / Peserta',
            teamPlaceholder: 'Contoh: Bambang Prasetyo',
            roles: [
                { role: 'Pemain Utama (Solo / Atlet)', required: true, short: 'P1', desc: 'Wajib' }
            ]
        };
    }

    // 3. Battle Royale Squad 4v4 (Free Fire, PUBG Mobile) -> 4 Pemain Wajib + 3 Cadangan Opsional
    if (d.includes('free fire') || d.includes('ff') || d.includes('pubg')) {
        const gameLabel = d.includes('pubg') ? 'PUBG Mobile' : 'Free Fire';
        return {
            gameType: 'squad4',
            minPlayers: 4,
            maxPlayers: 7,
            label: `4 Pemain Wajib + Hingga 3 Cadangan (${gameLabel} Squad 4v4)`,
            teamLabel: 'Nama Tim / Guild / Skuad',
            teamPlaceholder: `Contoh: Garuda Menak Sopal ${gameLabel === 'PUBG Mobile' ? 'PUBGM' : 'FF'}`,
            roles: [
                { role: 'Kapten Tim (Pemain 1)', required: true, short: 'P1', desc: 'Wajib' },
                { role: 'Pemain 2', required: true, short: 'P2', desc: 'Wajib' },
                { role: 'Pemain 3', required: true, short: 'P3', desc: 'Wajib' },
                { role: 'Pemain 4', required: true, short: 'P4', desc: 'Wajib' },
                { role: 'Cadangan 1 (Sub 1 - Opsional)', required: false, short: 'SUB 1', desc: 'Opsional' },
                { role: 'Cadangan 2 (Sub 2 - Opsional)', required: false, short: 'SUB 2', desc: 'Opsional' },
                { role: 'Cadangan 3 (Sub 3 - Opsional)', required: false, short: 'SUB 3', desc: 'Opsional' }
            ]
        };
    }

    // 4. Clash of Clans (CoC - Clan War) -> 5 Pemain Wajib + 3 Cadangan Opsional
    if (d.includes('clash of clans') || d.includes('coc')) {
        return {
            gameType: 'coc5',
            minPlayers: 5,
            maxPlayers: 8,
            label: '5 Pemain Wajib + Hingga 3 Cadangan (Clan War 5v5)',
            teamLabel: 'Nama Klan / Skuad CoC',
            teamPlaceholder: 'Contoh: Menak Sopal Clan',
            roles: [
                { role: 'Leader Klan (Pemain 1)', required: true, short: 'P1', desc: 'Wajib' },
                { role: 'Co-Leader (Pemain 2)', required: true, short: 'P2', desc: 'Wajib' },
                { role: 'Elder 1 (Pemain 3)', required: true, short: 'P3', desc: 'Wajib' },
                { role: 'Member 1 (Pemain 4)', required: true, short: 'P4', desc: 'Wajib' },
                { role: 'Member 2 (Pemain 5)', required: true, short: 'P5', desc: 'Wajib' },
                { role: 'Cadangan 1 (Sub 1 - Opsional)', required: false, short: 'SUB 1', desc: 'Opsional' },
                { role: 'Cadangan 2 (Sub 2 - Opsional)', required: false, short: 'SUB 2', desc: 'Opsional' },
                { role: 'Cadangan 3 (Sub 3 - Opsional)', required: false, short: 'SUB 3', desc: 'Opsional' }
            ]
        };
    }

    // 5. MOBA 5v5 & Tactical Shooter (MLBB, Honor of Kings, AOV, Valorant, Dota 2, CODM) -> 5 Pemain Wajib + 3 Cadangan Opsional
    let mobaLabel = 'MOBA 5v5';
    if (d.includes('valorant')) mobaLabel = 'Valorant 5v5';
    else if (d.includes('dota')) mobaLabel = 'Dota 2 5v5';
    else if (d.includes('call of duty') || d.includes('codm')) mobaLabel = 'CODM 5v5';
    else if (d.includes('honor of kings') || d.includes('hok')) mobaLabel = 'HOK 5v5';
    else if (d.includes('arena of valor') || d.includes('aov')) mobaLabel = 'AOV 5v5';
    else mobaLabel = 'MLBB 5v5';

    return {
        gameType: 'moba5',
        minPlayers: 5,
        maxPlayers: 8,
        label: `5 Pemain Wajib + Hingga 3 Cadangan (${mobaLabel})`,
        teamLabel: 'Nama Tim / Squad',
        teamPlaceholder: 'Contoh: Menak Sopal Esports',
        roles: [
            { role: 'Kapten Tim (Pemain 1)', required: true, short: 'P1', desc: 'Wajib' },
            { role: 'Pemain 2', required: true, short: 'P2', desc: 'Wajib' },
            { role: 'Pemain 3', required: true, short: 'P3', desc: 'Wajib' },
            { role: 'Pemain 4', required: true, short: 'P4', desc: 'Wajib' },
            { role: 'Pemain 5', required: true, short: 'P5', desc: 'Wajib' },
            { role: 'Cadangan 1 (Sub 1 - Opsional)', required: false, short: 'SUB 1', desc: 'Opsional' },
            { role: 'Cadangan 2 (Sub 2 - Opsional)', required: false, short: 'SUB 2', desc: 'Opsional' },
            { role: 'Cadangan 3 (Sub 3 - Opsional)', required: false, short: 'SUB 3', desc: 'Opsional' }
        ]
    };
}

function renderRosterInputsByConfig(rosterConfig) {
    const subtitleEl = document.getElementById('regRosterSubtitle');
    if (subtitleEl) subtitleEl.textContent = rosterConfig.label;

    const teamLabelEl = document.getElementById('regTeamNameLabel');
    const teamInputEl = document.getElementById('regTeamName');
    if (teamLabelEl) teamLabelEl.innerHTML = `${rosterConfig.teamLabel} <span class="text-red-500">*</span>`;
    if (teamInputEl) teamInputEl.placeholder = rosterConfig.teamPlaceholder;

    const container = document.getElementById('rosterInputsContainer');
    if (!container) return;

    container.innerHTML = rosterConfig.roles.map((r, i) => `
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-lg ${r.required ? 'bg-[#DC2626]' : 'bg-slate-600'} text-white flex items-center justify-center text-xs font-black shadow-sm">${r.short}</span>
                    <span class="text-xs font-black text-[#0F172A]">${r.role}</span>
                    <span class="text-[10px] ${r.required ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-100 border-slate-200'} font-bold uppercase px-1.5 py-0.5 rounded border">${r.desc}</span>
                </div>
                <div id="roster_feedback_${i}" class="text-[11px] font-medium text-slate-400">
                    ${r.required ? 'Ketik username akun ESI untuk memuat nama otomatis' : 'Opsional — boleh dikosongkan jika tidak ada cadangan'}
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div>
                    <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Username Akun ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                    <input type="text" id="roster_user_${i}" ${r.required ? 'required' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Username ${r.required ? '*' : ''}" oninput="lookupRosterMember(${i}, this.value)"
                        class="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-[#DC2626] focus:border-transparent transition">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Nama Lengkap (Otomatis) ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                    <input type="text" id="roster_name_${i}" placeholder="Nama Lengkap Otomatis" readonly
                        class="w-full px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800 font-extrabold focus:outline-none transition">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Nickname In-Game ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                    <input type="text" id="roster_nick_${i}" ${r.required ? 'required' : ''} placeholder="Nickname ${r.required ? '*' : ''}"
                        class="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-[#DC2626] font-extrabold focus:ring-2 focus:ring-[#DC2626] focus:border-transparent transition">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Game ID ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                    <input type="text" id="roster_id_${i}" ${r.required ? 'required' : ''} placeholder="Game ID ${r.required ? '*' : ''}"
                        class="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-[#DC2626] focus:border-transparent transition">
                </div>
            </div>
        </div>
    `).join('');
}

function renderEventRegistrationPage(eventId) {
    const ev = events.find(e => e.id == eventId) || events[0];
    if (!ev) return;

    activeRegisterEventId = ev.id;

    // 1. Update Banner Info
    const titleEl = document.getElementById('regEventTitle');
    const divTextEl = document.getElementById('regEventDivText');
    const descEl = document.getElementById('regEventDescription');
    const orgEl = document.getElementById('regEventOrganizer');
    const dateEl = document.getElementById('regEventDate');
    const locEl = document.getElementById('regEventLocation');
    const feeEl = document.getElementById('regEventFee');
    const slotsEl = document.getElementById('regEventSlots');
    const categoryEl = document.getElementById('regEventCategory');
    const btnDetailEl = document.getElementById('btnViewEventDetailFromReg');

    if (titleEl) titleEl.textContent = ev.title;
    if (divTextEl) divTextEl.textContent = ev.division || 'Esports';
    if (descEl) descEl.textContent = ev.description || 'Pendaftaran tim resmi untuk kejuaraan esports ESI Trenggalek.';
    if (orgEl) orgEl.textContent = ev.organizer || 'ESI Trenggalek';
    if (dateEl) dateEl.textContent = ev.date;
    if (locEl) locEl.textContent = ev.location;
    if (feeEl) feeEl.textContent = ev.fee || 'Gratis / Free Entry';
    if (slotsEl) slotsEl.textContent = (ev.slots || 32) + ' Slot';
    if (categoryEl) categoryEl.textContent = ev.category || 'Pelajar & Umum';
    if (btnDetailEl) btnDetailEl.onclick = () => openEventDetail(ev.id);

    // 1b. Update Tournament Game Branch Selector
    const branchSel = document.getElementById('regTournamentGameBranch');
    if (branchSel) {
        let branchOptions = [];
        if (ev.games && Array.isArray(ev.games) && ev.games.length > 0) {
            branchOptions = ev.games;
        } else if (ev.division && ev.division !== 'Multi-Divisi' && ev.division !== 'Semua Divisi') {
            branchOptions = [ev.division];
        } else {
            branchOptions = ['Mobile Legends', 'Free Fire', 'eFootball', 'PUBG Mobile', 'Honor of Kings'];
        }

        branchSel.innerHTML = branchOptions.map(g => `
            <option value="${g}">${g}</option>
        `).join('');
    }

    // 2. Update Event Switcher Select
    const switcherEl = document.getElementById('regEventSwitcherSelect');
    if (switcherEl) {
        switcherEl.innerHTML = events.map(e => `
            <option value="${e.id}" ${e.id == ev.id ? 'selected' : ''}>
                ${e.title} (${e.division})
            </option>
        `).join('');
    }

    // 3. Konfigurasi Roster Dinamis Sesuai Game / Divisi Turnamen
    const rosterConfig = getTournamentRosterConfig(ev.division);
    const subtitleEl = document.getElementById('regRosterSubtitle');
    if (subtitleEl) subtitleEl.textContent = rosterConfig.label;

    const teamLabelEl = document.getElementById('regTeamNameLabel');
    const teamInputEl = document.getElementById('regTeamName');
    if (teamLabelEl) teamLabelEl.innerHTML = `${rosterConfig.teamLabel} <span class="text-red-500">*</span>`;
    if (teamInputEl) teamInputEl.placeholder = rosterConfig.teamPlaceholder;

    // Render Dinamis Input Roster
    const container = document.getElementById('rosterInputsContainer');
    if (container) {
        container.innerHTML = rosterConfig.roles.map((r, i) => `
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-lg ${r.required ? 'bg-[#DC2626]' : 'bg-slate-600'} text-white flex items-center justify-center text-xs font-black shadow-sm">${r.short}</span>
                        <span class="text-xs font-black text-[#0F172A]">${r.role}</span>
                        <span class="text-[10px] ${r.required ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-100 border-slate-200'} font-bold uppercase px-1.5 py-0.5 rounded border">${r.desc}</span>
                    </div>
                    <div id="roster_feedback_${i}" class="text-[11px] font-medium text-slate-400">
                        ${r.required ? 'Ketik username akun ESI untuk memuat nama otomatis' : 'Opsional — boleh dikosongkan jika tidak ada cadangan'}
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Username Akun ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                        <input type="text" id="roster_user_${i}" ${r.required ? 'required' : ''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Username ${r.required ? '*' : ''}" oninput="lookupRosterMember(${i}, this.value)"
                            class="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-[#DC2626] focus:border-transparent transition">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Nama Lengkap (Otomatis) ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                        <input type="text" id="roster_name_${i}" placeholder="Nama Lengkap Otomatis" readonly
                            class="w-full px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800 font-extrabold focus:outline-none transition">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Nickname In-Game ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                        <input type="text" id="roster_nick_${i}" ${r.required ? 'required' : ''} placeholder="Nickname ${r.required ? '*' : ''}"
                            class="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-[#DC2626] font-extrabold focus:ring-2 focus:ring-[#DC2626] focus:border-transparent transition">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Game ID ${r.required ? '<span class="text-red-500">*</span>' : ''}</label>
                        <input type="text" id="roster_id_${i}" ${r.required ? 'required' : ''} placeholder="Game ID ${r.required ? '*' : ''}"
                            class="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-[#DC2626] focus:border-transparent transition">
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 4. Reset State Tampilan
    const formWrapper = document.getElementById('regTournamentFormWrapper');
    const successWrapper = document.getElementById('regTournamentSuccessWrapper');
    if (formWrapper) formWrapper.classList.remove('hidden');
    if (successWrapper) successWrapper.classList.add('hidden');

    // Autocomplete rekomendasi username dinonaktifkan demi privasi dan keamanan akun anggota

    // 6. Autofill Jika Member Sedang Login
    if (loggedMember) {
        const leadName = document.getElementById('regLeaderName');
        const leadWa = document.getElementById('regLeaderWa');
        const leadEmail = document.getElementById('regLeaderEmail');
        const teamNameEl = document.getElementById('regTeamName');
        const kecEl = document.getElementById('regTeamKecamatan');
        const instEl = document.getElementById('regTeamInstitution');

        if (leadName && !leadName.value) leadName.value = loggedMember.fullName || '';
        if (leadWa && !leadWa.value) leadWa.value = loggedMember.whatsapp || '';
        if (leadEmail && !leadEmail.value) leadEmail.value = loggedMember.email || '';
        if (teamNameEl && !teamNameEl.value) {
            teamNameEl.value = (loggedMember.teamName && loggedMember.teamName !== 'Individu / Non-Tim')
                ? loggedMember.teamName
                : (rosterConfig.gameType === 'solo' || rosterConfig.gameType === 'efootball' ? loggedMember.fullName : '');
        }
        if (kecEl && loggedMember.kecamatan) kecEl.value = loggedMember.kecamatan;
        if (instEl && !instEl.value && loggedMember.institution) instEl.value = loggedMember.institution;

        // Autofill Pemain 1 (Kapten / Atlet Utama)
        const p1User = document.getElementById('roster_user_0');
        if (p1User && !p1User.value) {
            p1User.value = loggedMember.username || loggedMember.whatsapp || '';
            lookupRosterMember(0, p1User.value);
        }
    }
}


function checkUserAlreadyInTournament(username, eventId) {
    if (!username || !eventId) return null;
    const cleanU = username.trim().toLowerCase();
    const existingTeams = Api.getLocalTournamentRegistrations(eventId).filter(t => t.status !== 'rejected');

    for (const team of existingTeams) {
        const roster = team.roster || [];
        for (const player of roster) {
            const playerU = (player.username || '').trim().toLowerCase();
            if (playerU && playerU === cleanU) {
                return {
                    teamName: team.teamName,
                    role: player.role,
                    playerName: player.fullName,
                    regNumber: team.regNumber
                };
            }
        }
    }
    return null;
}

function lookupRosterMember(slotIndex, usernameVal) {
    const nameEl = document.getElementById(`roster_name_${slotIndex}`);
    const nickEl = document.getElementById(`roster_nick_${slotIndex}`);
    const idEl = document.getElementById(`roster_id_${slotIndex}`);
    const feedbackEl = document.getElementById(`roster_feedback_${slotIndex}`);
    if (!nameEl) return;

    const q = (usernameVal || '').trim().toLowerCase();
    if (!q) {
        nameEl.value = '';
        nameEl.readOnly = false;
        nameEl.className = "w-full px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800 font-extrabold focus:outline-none transition";
        if (feedbackEl) feedbackEl.innerHTML = '<span class="text-slate-400">Ketik username akun ESI untuk memuat nama otomatis</span>';
        return;
    }

    // Jika athletes belum ter-load, fetch dulu lalu ulangi lookup
    if (!Array.isArray(athletes) || athletes.length === 0) {
        if (feedbackEl) feedbackEl.innerHTML = '<span class="text-slate-400 animate-pulse"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Memuat data atlet...</span>';
        Api.getAthletes().then(list => {
            athletes = list || [];
            lookupRosterMember(slotIndex, usernameVal);
        }).catch(() => {
            if (feedbackEl) feedbackEl.innerHTML = '<span class="text-amber-600">Gagal memuat data. Ketik nama manual.</span>';
            nameEl.readOnly = false;
        });
        return;
    }

    const roles = [
        'Kapten Tim (Pemain 1)',
        'Pemain 2',
        'Pemain 3',
        'Pemain 4',
        'Pemain 5',
        'Cadangan'
    ];

    // 1. Validasi: Cegah username duplikat di dalam satu tim
    const currentEv = events.find(e => e.id == activeRegisterEventId) || events[0];
    const rConfig = getTournamentRosterConfig(currentEv ? currentEv.division : '');
    const totalSlots = rConfig.roles.length;
    for (let j = 0; j < totalSlots; j++) {
        if (j !== slotIndex) {
            const otherUserEl = document.getElementById(`roster_user_${j}`);
            const otherU = (otherUserEl ? otherUserEl.value : '').trim().toLowerCase();
            if (otherU && otherU === q) {
                nameEl.value = '';
                nameEl.readOnly = false;
                nameEl.className = "w-full px-3 py-2 rounded-lg bg-red-50 border border-red-300 text-xs text-red-900 font-bold focus:outline-none";
                if (idEl) idEl.value = '';
                if (feedbackEl) {
                    feedbackEl.innerHTML = `
                        <span class="inline-flex items-center gap-1.5 text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-300 text-[11px] font-black">
                            <i class="fa-solid fa-triangle-exclamation text-red-600"></i> Duplikat: Username sudah dipakai di ${roles[j]}!
                        </span>
                    `;
                }
                return;
            }
        }
    }

    // 2. Validasi: Cegah pemain yang sudah mendaftar di tim lain pada turnamen ini
    const ev = events.find(e => e.id == activeRegisterEventId) || events[0];
    if (ev) {
        const alreadyRegistered = checkUserAlreadyInTournament(q, ev.id);
        if (alreadyRegistered) {
            nameEl.value = '';
            nameEl.readOnly = false;
            nameEl.className = "w-full px-3 py-2 rounded-lg bg-red-50 border border-red-300 text-xs text-red-900 font-bold focus:outline-none";
            if (idEl) idEl.value = '';
            if (feedbackEl) {
                feedbackEl.innerHTML = `
                    <span class="inline-flex items-center gap-1.5 text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-300 text-[11px] font-black">
                        <i class="fa-solid fa-ban text-red-600"></i> Terkunci: Sudah terdaftar di tim "${alreadyRegistered.teamName}"!
                    </span>
                `;
            }
            return;
        }
    }

    // Cari atlet di database lokal
    const athleteList = Array.isArray(athletes) ? athletes : [];
    const found = athleteList.find(a => 
        (a.username && a.username.toLowerCase() === q) ||
        (a.nickname && a.nickname.toLowerCase() === q) ||
        (a.fullName && a.fullName.toLowerCase() === q) ||
        (a.whatsapp && a.whatsapp.replace(/\D/g, '') === q.replace(/\D/g, '') && q.length >= 7)
    );

    if (found) {
        nameEl.value = found.fullName;
        nameEl.readOnly = true;
        nameEl.className = "w-full px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 font-black shadow-inner transition";

        // Deteksi cabang game turnamen saat ini
        const ev = events.find(e => e.id == activeRegisterEventId) || events[0];
        const targetGame = detectTournamentGame(ev);
        const gameProf = findAthleteGameProfile(found, targetGame);

        if (gameProf && gameProf.gameId) {
            // Profil game tersebut ditemukan: Otomatis masuk!
            idEl.value = gameProf.gameId;
            nickEl.value = gameProf.nickname || found.nickname || '';
            if (feedbackEl) {
                feedbackEl.innerHTML = `
                    <span class="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 text-[11px] font-extrabold animate-fadeIn">
                        <i class="fa-solid fa-circle-check text-emerald-600"></i> Terdaftar: ${found.fullName} (ID ${gameProf.gameName} otomatis dimuat)
                    </span>
                `;
            }
        } else {
            // Belum ada data game tersebut di profil: user harus mengetik manual ID nya
            idEl.value = '';
            nickEl.value = found.nickname || '';
            if (feedbackEl) {
                feedbackEl.innerHTML = `
                    <span class="inline-flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 text-[11px] font-extrabold animate-fadeIn">
                        <i class="fa-solid fa-user-check text-blue-600"></i> Terdaftar: ${found.fullName} (Belum ada ID ${targetGame} di profil, silakan ketik manual)
                    </span>
                `;
            }
        }
    } else {
        nameEl.readOnly = false;
        nameEl.className = "w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-[#DC2626] transition";
        if (feedbackEl) {
            feedbackEl.innerHTML = `
                <span class="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[10px] font-semibold">
                    <i class="fa-solid fa-circle-info"></i> Username belum ada di data atlet (masukkan nama manual)
                </span>
            `;
        }
    }
}

function resetTournamentRegForm() {
    const form = document.querySelector('#regTournamentFormWrapper form');
    if (form) form.reset();
    renderEventRegistrationPage(activeRegisterEventId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleTournamentRegistrationSubmit(e) {
    e.preventDefault();

    const ev = events.find(e => e.id == activeRegisterEventId) || events[0];
    if (!ev) {
        alert('Data turnamen tidak ditemukan.');
        return;
    }

    const teamName = document.getElementById('regTeamName').value.trim();
    const kecamatan = document.getElementById('regTeamKecamatan').value;
    const institution = document.getElementById('regTeamInstitution').value.trim();
    const leaderName = document.getElementById('regLeaderName').value.trim();
    const leaderWa = document.getElementById('regLeaderWa').value.trim();
    const leaderEmail = document.getElementById('regLeaderEmail').value.trim();
    const notes = document.getElementById('regTeamNotes').value.trim();

    // Ambil Konfigurasi Roster Resmi Turnamen Sesuai Divisi Game
    const rosterConfig = getTournamentRosterConfig(ev.division);
    const roster = [];

    for (let i = 0; i < rosterConfig.roles.length; i++) {
        const roleInfo = rosterConfig.roles[i];
        const userInput = document.getElementById(`roster_user_${i}`);
        const nameInput = document.getElementById(`roster_name_${i}`);
        const nickInput = document.getElementById(`roster_nick_${i}`);
        const idInput = document.getElementById(`roster_id_${i}`);

        const pUser = userInput ? userInput.value.trim() : '';
        const pName = nameInput ? nameInput.value.trim() : '';
        const pNick = nickInput ? nickInput.value.trim() : '';
        const pId = idInput ? idInput.value.trim() : '';

        // Jika pemain wajib (misal: MLBB 5 pemain, FF 4 pemain, eFootball 1 pemain)
        if (roleInfo.required) {
            if (!pUser) {
                alert(`Mohon masukkan Username Akun ESI untuk ${roleInfo.role}.`);
                if (userInput) userInput.focus();
                return;
            }
            if (!pName) {
                alert(`Nama Lengkap untuk ${roleInfo.role} belum terisi. Pastikan username akun valid.`);
                if (nameInput) nameInput.focus();
                return;
            }
            if (!pNick) {
                alert(`Mohon isi Nickname In-Game untuk ${roleInfo.role}.`);
                if (nickInput) nickInput.focus();
                return;
            }
            if (!pId) {
                alert(`Mohon isi Game ID untuk ${roleInfo.role}.`);
                if (idInput) idInput.focus();
                return;
            }
        } else {
            // Jika slot opsional diisi sebagian, wajib dilengkapi seluruhnya
            if (pUser || pName || pNick || pId) {
                if (!pUser || !pName || !pNick || !pId) {
                    alert(`Mohon lengkapi seluruh kolom (Username, Nama, Nickname, Game ID) untuk ${roleInfo.role}, atau kosongkan jika tidak ada.`);
                    return;
                }
            }
        }

        if (pUser || pName || pNick || pId) {
            roster.push({
                role: roleInfo.role,
                username: pUser,
                fullName: pName,
                nickname: pNick,
                gameId: pId
            });
        }
    }

    // Minimal pemain wajib terpenuhi
    if (roster.length < rosterConfig.minPlayers) {
        alert(`Turnamen ${ev.division} minimal membutuhkan ${rosterConfig.minPlayers} pemain terdaftar.`);
        return;
    }

    // VALIDASI 1: Cek duplikasi username di dalam tim yang sama
    const userMap = new Map();
    for (let i = 0; i < roster.length; i++) {
        const u = (roster[i].username || '').trim().toLowerCase();
        if (u) {
            if (userMap.has(u)) {
                alert(`Pendaftaran Ditolak:\n\nUsername "${roster[i].username}" digunakan lebih dari 1 kali di dalam tim (${userMap.get(u)} dan ${roster[i].role}).\n\nSetiap anggota tim wajib memiliki akun yang berbeda.`);
                const dupInput = document.getElementById(`roster_user_${i}`);
                if (dupInput) dupInput.focus();
                return;
            }
            userMap.set(u, roster[i].role);
        }
    }

    // VALIDASI 2: Cek apakah ada pemain yang sudah mendaftar di tim lain pada turnamen ini
    for (let i = 0; i < roster.length; i++) {
        const p = roster[i];
        if (p.username) {
            const alreadyInTeam = checkUserAlreadyInTournament(p.username, ev.id);
            if (alreadyInTeam) {
                alert(`Pendaftaran Ditolak:\n\nPemain "${p.fullName || p.username}" (${p.role}) sudah terdaftar membela tim "${alreadyInTeam.teamName}" (No. Reg: ${alreadyInTeam.regNumber}) pada turnamen ini.\n\nSatu pemain tidak diperbolehkan mendaftar di lebih dari satu tim untuk turnamen yang sama.`);
                const lockedInput = document.getElementById(`roster_user_${i}`);
                if (lockedInput) lockedInput.focus();
                return;
            }
        }
    }

    const submitBtn = document.getElementById('btnSubmitTournamentReg');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan Pendaftaran...';
    }

    try {
        const newReg = await Api.createTournamentRegistration({
            eventId: ev.id,
            eventTitle: ev.title,
            division: ev.division,
            teamName,
            institution,
            kecamatan,
            leaderName,
            leaderWa,
            leaderEmail,
            roster,
            notes
        });

        // Tampilkan State Sukses
        const formWrapper = document.getElementById('regTournamentFormWrapper');
        const successWrapper = document.getElementById('regTournamentSuccessWrapper');
        if (formWrapper) formWrapper.classList.add('hidden');
        if (successWrapper) successWrapper.classList.remove('hidden');

        const successTeamName = document.getElementById('successTeamName');
        const successEventTitle = document.getElementById('successEventTitle');
        const successRegNumber = document.getElementById('successRegNumber');
        const waConfirmBtn = document.getElementById('successWaConfirmBtn');

        if (successTeamName) successTeamName.textContent = newReg.teamName;
        if (successEventTitle) successEventTitle.textContent = newReg.eventTitle;
        if (successRegNumber) successRegNumber.textContent = newReg.regNumber;

        if (waConfirmBtn) {
            const waMsg = `Halo Panitia ESI Trenggalek, saya telah mendaftarkan tim untuk turnamen:\n\n*${newReg.eventTitle}*\n- No. Registrasi: *${newReg.regNumber}*\n- Nama Tim: *${newReg.teamName}*\n- Asal: ${newReg.institution} (${newReg.kecamatan})\n- Kapten: ${newReg.leaderName} (${newReg.leaderWa})\n- Jumlah Roster: ${newReg.roster.length} Pemain\n\nMohon verifikasi pendaftaran tim kami. Terima kasih!`;
            waConfirmBtn.href = `https://wa.me/6287840800351?text=${encodeURIComponent(waMsg)}`;
        }

        // Perbarui list dan badge pendaftar di admin jika aktif
        if (typeof renderAdminEvents === 'function') {
            renderAdminEvents();
        }
        if (isAdminLoggedIn && typeof renderAdminTournamentRegistrations === 'function') {
            renderAdminTournamentRegistrations(adminSelectedTournamentId || ev.id);
        }

        showToast('Pendaftaran Berhasil!', `Tim ${newReg.teamName} berhasil didaftarkan (${newReg.regNumber}).`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        console.error('Error submitting tournament reg:', err);
        alert('Terjadi kendala saat menyimpan pendaftaran. Silakan coba kembali.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-base"></i><span>Kirim Pendaftaran Tim Sekarang</span>';
        }
    }
}


// ==================== ADMIN: KELOLA PENDAFTAR TURNAMEN (POPUP & EXCEL) ====================

let adminActiveTournamentId = null;

async function openAdminTournamentRegsModal(eventId) {
    if (!eventId && events.length > 0) eventId = events[0].id;
    adminActiveTournamentId = eventId;
    adminSelectedTournamentId = eventId;

    const ev = events.find(e => e.id == eventId) || events[0];
    if (!ev) return;

    // Set Header Info Modal
    const titleEl = document.getElementById('modalRegsTournamentTitle');
    const divEl = document.getElementById('modalRegsTournamentDiv');
    const statusEl = document.getElementById('modalRegsTournamentStatus');
    const dateLocEl = document.getElementById('modalRegsTournamentDateLoc');

    if (titleEl) titleEl.textContent = ev.title || 'Data Pendaftar Turnamen';
    if (divEl) divEl.textContent = ev.division || 'ESPORTS';
    if (statusEl) {
        statusEl.textContent = ev.status || 'Upcoming';
        if (ev.status === 'Ongoing') {
            statusEl.className = "px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase";
        } else if (ev.status === 'Selesai') {
            statusEl.className = "px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 text-[10px] font-black uppercase";
        } else {
            statusEl.className = "px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase";
        }
    }
    if (dateLocEl) {
        dateLocEl.innerHTML = `<i class="fa-regular fa-calendar mr-1"></i> ${ev.date || '-'} &bull; <i class="fa-solid fa-location-dot ml-1 mr-1"></i> ${ev.location || '-'}`;
    }

    // Reset filter & search
    const filterEl = document.getElementById('modalRegsStatusFilter');
    if (filterEl) filterEl.value = 'all';
    const searchEl = document.getElementById('modalRegsSearchInput');
    if (searchEl) searchEl.value = '';

    // Render instan dari local cache
    renderAdminTournamentRegistrationsInModal(eventId);

    const modal = document.getElementById('modalAdminTournamentRegistrations');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    // Sync data terbaru dari cloud di background
    try {
        const live = await Api.getTournamentRegistrations(eventId);
        if (Array.isArray(live)) {
            renderAdminTournamentRegistrationsInModal(eventId);
        }
    } catch (_) {}
}

function closeAdminTournamentRegsModal() {
    const modal = document.getElementById('modalAdminTournamentRegistrations');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function filterAdminTournamentRegsModal() {
    if (adminActiveTournamentId) {
        renderAdminTournamentRegistrationsInModal(adminActiveTournamentId);
    }
}

function renderAdminTournamentRegistrationsInModal(eventId) {
    if (!eventId) eventId = adminActiveTournamentId;
    if (!eventId && events.length > 0) eventId = events[0].id;
    adminActiveTournamentId = eventId;
    adminSelectedTournamentId = eventId;

    const tbody = document.getElementById('modalRegsTableBody');
    const statsRow = document.getElementById('modalRegsStatsRow');
    const paginEl = document.getElementById('modalRegsPaginationText');
    const footerSummary = document.getElementById('modalRegsFooterSummary');
    if (!tbody) return;

    const allRegs = Api.getLocalTournamentRegistrations(eventId);
    const ev = events.find(e => e.id == eventId) || events[0];

    const totalCount = allRegs.length;
    const verifiedCount = allRegs.filter(r => r.status === 'verified').length;
    const pendingCount = allRegs.filter(r => r.status === 'pending').length;
    const rejectedCount = allRegs.filter(r => r.status === 'rejected').length;
    const maxSlots = (ev && ev.slots) ? parseInt(ev.slots, 10) : 32;
    const remainingSlots = Math.max(0, maxSlots - verifiedCount);

    // Update 4 Mini Stats Cards
    if (statsRow) {
        statsRow.innerHTML = `
            <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Total Pendaftar</div>
                <div class="text-xl font-black text-[#0F172A]">${totalCount} <span class="text-xs font-normal text-slate-400">Tim</span></div>
            </div>
            <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">Terverifikasi</div>
                <div class="text-xl font-black text-emerald-800">${verifiedCount} <span class="text-xs font-normal text-emerald-600">Tim</span></div>
            </div>
            <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <div class="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-0.5">Menunggu (Pending)</div>
                <div class="text-xl font-black text-amber-800">${pendingCount} <span class="text-xs font-normal text-amber-600">Tim</span></div>
            </div>
            <div class="p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                <div class="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-0.5">Sisa Slot Turnamen</div>
                <div class="text-xl font-black text-blue-800">${remainingSlots} <span class="text-xs font-normal text-blue-600">dari ${maxSlots}</span></div>
            </div>
        `;
    }

    // Filter status & search
    const filterEl = document.getElementById('modalRegsStatusFilter');
    const filterVal = filterEl ? filterEl.value : 'all';
    const searchEl = document.getElementById('modalRegsSearchInput');
    const searchVal = (searchEl ? searchEl.value : '').toLowerCase().trim();

    const filtered = allRegs.filter(r => {
        if (filterVal !== 'all' && r.status !== filterVal) return false;
        if (searchVal) {
            const matchName = (r.teamName || '').toLowerCase().includes(searchVal);
            const matchLeader = (r.leaderName || '').toLowerCase().includes(searchVal);
            const matchReg = (r.regNumber || '').toLowerCase().includes(searchVal);
            const matchInst = (r.institution || '').toLowerCase().includes(searchVal);
            if (!matchName && !matchLeader && !matchReg && !matchInst) return false;
        }
        return true;
    });

    if (paginEl) {
        paginEl.textContent = `Menampilkan ${filtered.length} dari ${totalCount} tim terdaftar pada turnamen ini.`;
    }
    if (footerSummary) {
        footerSummary.innerHTML = `<span class="font-bold text-slate-700">${ev ? ev.title : 'Turnamen'}</span> &bull; Terverifikasi: <strong class="text-emerald-600">${verifiedCount}</strong> / Menunggu: <strong class="text-amber-600">${pendingCount}</strong> / Ditolak: <strong class="text-red-600">${rejectedCount}</strong>`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="p-8 text-center text-slate-400 italic text-xs">
                    <i class="fa-solid fa-users text-3xl mb-2 text-slate-300 block"></i>
                    Belum ada data tim yang cocok dengan kriteria filter pada turnamen ini.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map((t, idx) => {
        let statusBadge = '';
        if (t.status === 'verified') {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check text-[9px]"></i>Verified</span>';
        } else if (t.status === 'rejected') {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800"><i class="fa-solid fa-xmark text-[9px]"></i>Ditolak</span>';
        } else {
            statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800"><i class="fa-solid fa-clock text-[9px]"></i>Pending</span>';
        }

        const cleanWa = (t.leaderWa || '').replace(/[^0-9]/g, '');
        const waLink = cleanWa.startsWith('0') ? '62' + cleanWa.slice(1) : cleanWa;
        const rosterCount = (t.roster || []).filter(p => p.fullName).length;

        return `
            <tr class="hover:bg-slate-50/80 transition">
                <td class="p-3 text-center font-bold text-slate-400">${idx + 1}</td>
                <td class="p-3 font-mono text-[11px] font-extrabold text-[#DC2626] whitespace-nowrap">${t.regNumber}</td>
                <td class="p-3">
                    <div class="font-extrabold text-slate-900">${t.teamName}</div>
                    <div class="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <i class="fa-solid fa-school text-[10px] text-slate-400"></i>
                        <span>${t.institution}</span>
                        <span class="text-slate-300">&bull;</span>
                        <span class="text-slate-600">${t.kecamatan}</span>
                    </div>
                </td>
                <td class="p-3">
                    <div class="font-bold text-slate-900">${t.leaderName}</div>
                    <a href="https://wa.me/${waLink}" target="_blank" rel="noopener"
                        class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 mt-0.5">
                        <i class="fa-brands fa-whatsapp text-xs"></i>
                        <span>${t.leaderWa}</span>
                    </a>
                </td>
                <td class="p-3 text-center">
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[11px] font-extrabold">
                        <i class="fa-solid fa-user-group text-[10px]"></i> ${rosterCount}
                    </span>
                </td>
                <td class="p-3 text-[11px] text-slate-500 whitespace-nowrap">${t.createdAt || '-'}</td>
                <td class="p-3 text-center whitespace-nowrap">${statusBadge}</td>
                <td class="p-3 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="showAdminTeamRosterModal('${t.id}')"
                            class="px-2.5 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-[11px] font-bold transition flex items-center gap-1"
                            title="Lihat Detail Roster Lengkap">
                            <i class="fa-solid fa-eye text-[10px]"></i>
                            <span>Roster</span>
                        </button>
                        ${t.status !== 'verified' ? `
                        <button onclick="adminUpdateTeamStatus('${t.id}', 'verified')"
                            class="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white flex items-center justify-center transition"
                            title="Verifikasi Tim">
                            <i class="fa-solid fa-check text-xs"></i>
                        </button>
                        ` : ''}
                        ${t.status !== 'rejected' ? `
                        <button onclick="adminUpdateTeamStatus('${t.id}', 'rejected')"
                            class="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-600 text-amber-600 hover:text-white flex items-center justify-center transition"
                            title="Tolak Tim">
                            <i class="fa-solid fa-ban text-xs"></i>
                        </button>
                        ` : ''}
                        <button onclick="adminDeleteTeam('${t.id}')"
                            class="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white flex items-center justify-center transition"
                            title="Hapus Data Tim">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Backward compatibility alias
function populateAdminTournamentSelector() {}
function handleAdminTournamentSelect(eventId) { openAdminTournamentRegsModal(eventId); }
function filterAdminTeamList() { filterAdminTournamentRegsModal(); }
function renderAdminTournamentRegistrations(eventId) { renderAdminTournamentRegistrationsInModal(eventId); }

function exportActiveTournamentToExcel() {
    exportTournamentTeamsExcel(adminActiveTournamentId || adminSelectedTournamentId);
}


function showAdminTeamRosterModal(regId) {
    const allRegs = Api.getLocalTournamentRegistrations();
    const t = allRegs.find(r => r.id == regId);
    if (!t) return;

    const modal = document.getElementById('modalAdminTeamRoster');
    if (!modal) return;

    const regNoEl = document.getElementById('modalTeamRegNo');
    const titleEl = document.getElementById('modalTeamNameTitle');
    const bodyEl = document.getElementById('modalAdminTeamRosterBody');
    const badgeEl = document.getElementById('modalTeamStatusBadge');
    const actionBtnsEl = document.getElementById('modalTeamActionBtns');

    if (regNoEl) regNoEl.textContent = t.regNumber;
    if (titleEl) titleEl.textContent = t.teamName;

    // Status Badge
    let statusHtml = '';
    if (t.status === 'verified') {
        statusHtml = '<span class="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i>Terverifikasi</span>';
    } else if (t.status === 'rejected') {
        statusHtml = '<span class="px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-800"><i class="fa-solid fa-xmark mr-1"></i>Ditolak</span>';
    } else {
        statusHtml = '<span class="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800"><i class="fa-solid fa-clock mr-1"></i>Menunggu Verifikasi</span>';
    }
    if (badgeEl) badgeEl.innerHTML = statusHtml;

    // Roster Table Rows
    const rosterRows = (t.roster || []).map((p, idx) => `
        <tr class="${(p.role || '').includes('Cadangan') ? 'bg-slate-50/60 italic' : ''}">
            <td class="p-2.5 font-bold text-slate-500">${idx + 1}</td>
            <td class="p-2.5 font-extrabold text-[#0F172A]">${p.role}</td>
            <td class="p-2.5 font-mono text-slate-600 font-bold">${p.username || '-'}</td>
            <td class="p-2.5 font-bold text-slate-800">${p.fullName}</td>
            <td class="p-2.5 font-mono text-[#DC2626] font-bold">${p.nickname}</td>
            <td class="p-2.5 font-mono text-slate-700">${p.gameId}</td>
        </tr>
    `).join('');

    const cleanWa = (t.leaderWa || '').replace(/[^0-9]/g, '');
    const waLink = cleanWa.startsWith('0') ? '62' + cleanWa.slice(1) : cleanWa;

    if (bodyEl) {
        bodyEl.innerHTML = `
            <!-- Ringkasan Info Tim -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                    <span class="text-slate-400 block uppercase font-bold text-[10px]">Turnamen</span>
                    <strong class="text-slate-800 font-extrabold text-sm">${t.eventTitle}</strong>
                </div>
                <div>
                    <span class="text-slate-400 block uppercase font-bold text-[10px]">Asal &amp; Domisili</span>
                    <span class="text-slate-700 font-bold">${t.institution} • Kec. ${t.kecamatan}</span>
                </div>
                <div>
                    <span class="text-slate-400 block uppercase font-bold text-[10px]">Kapten Tim</span>
                    <span class="text-slate-800 font-bold">${t.leaderName}</span>
                </div>
                <div>
                    <span class="text-slate-400 block uppercase font-bold text-[10px]">Kontak WhatsApp</span>
                    <a href="https://wa.me/${waLink}" target="_blank" rel="noopener" class="text-emerald-600 font-bold hover:underline flex items-center gap-1">
                        <i class="fa-brands fa-whatsapp"></i> ${t.leaderWa}
                    </a>
                </div>
                ${t.leaderEmail ? `
                <div class="sm:col-span-2">
                    <span class="text-slate-400 block uppercase font-bold text-[10px]">Email</span>
                    <span class="text-slate-700">${t.leaderEmail}</span>
                </div>
                ` : ''}
                ${t.notes ? `
                <div class="sm:col-span-2 pt-2 border-t border-slate-200">
                    <span class="text-slate-400 block uppercase font-bold text-[10px]">Catatan Tim:</span>
                    <p class="text-slate-600 italic">${t.notes}</p>
                </div>
                ` : ''}
            </div>

            <!-- Tabel Susunan Roster Pemain -->
            <div>
                <h4 class="text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                    <i class="fa-solid fa-user-group text-[#DC2626]"></i>
                    <span>Susunan Roster Pemain (${(t.roster || []).length} Terdaftar)</span>
                </h4>
                <div class="overflow-x-auto border border-slate-200 rounded-xl">
                    <table class="w-full text-left text-xs">
                        <thead class="bg-slate-100 border-b border-slate-200 font-extrabold text-slate-600 uppercase text-[10px]">
                            <tr>
                                <th class="p-2.5 w-8">#</th>
                                <th class="p-2.5">Slot Role</th>
                                <th class="p-2.5">Username</th>
                                <th class="p-2.5">Nama Lengkap</th>
                                <th class="p-2.5">Nickname</th>
                                <th class="p-2.5">Game ID</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${rosterRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    if (actionBtnsEl) {
        actionBtnsEl.innerHTML = `
            <a href="https://wa.me/${waLink}" target="_blank" rel="noopener"
                class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5">
                <i class="fa-brands fa-whatsapp text-sm"></i> Chat Kapten
            </a>
            ${t.status !== 'verified' ? `
            <button onclick="adminUpdateTeamStatus('${t.id}', 'verified')"
                class="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition flex items-center gap-1.5">
                <i class="fa-solid fa-check"></i> Verifikasi Tim
            </button>
            ` : ''}
            ${t.status !== 'rejected' ? `
            <button onclick="adminUpdateTeamStatus('${t.id}', 'rejected')"
                class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center gap-1.5">
                <i class="fa-solid fa-ban"></i> Tolak Tim
            </button>
            ` : ''}
            <button onclick="closeAdminTeamRosterModal()"
                class="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition">
                Tutup
            </button>
        `;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAdminTeamRosterModal() {
    const modal = document.getElementById('modalAdminTeamRoster');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function adminUpdateTeamStatus(regId, newStatus) {
    const res = await Api.updateTournamentRegistrationStatus(regId, newStatus);
    if (res.success) {
        renderAdminTournamentRegistrationsInModal(adminActiveTournamentId || adminSelectedTournamentId);
        renderAdminEvents();
        // Refresh modal if still open
        const modal = document.getElementById('modalAdminTeamRoster');
        if (modal && !modal.classList.contains('hidden')) {
            showAdminTeamRosterModal(regId);
        }
        showToast('Status Diperbarui', `Status pendaftaran tim diubah menjadi ${newStatus}.`);
    }
}

async function adminDeleteTeam(regId) {
    if (confirm('Hapus data pendaftaran tim ini dari turnamen? Tindakan ini tidak dapat dibatalkan.')) {
        await Api.deleteTournamentRegistration(regId);
        closeAdminTeamRosterModal();
        renderAdminTournamentRegistrationsInModal(adminActiveTournamentId || adminSelectedTournamentId);
        renderAdminEvents();
        showToast('Data Tim Dihapus', 'Pendaftaran tim telah dihapus.');
    }
}

function exportTournamentTeamsExcel(eventId) {
    if (!eventId) eventId = adminActiveTournamentId || adminSelectedTournamentId;
    if (!eventId && events.length > 0) eventId = events[0].id;

    const allRegs = Api.getLocalTournamentRegistrations(eventId);
    const ev = events.find(e => e.id == eventId) || events[0];

    if (allRegs.length === 0) {
        showToast('Data Kosong', 'Belum ada tim terdaftar untuk diekspor pada turnamen ini.');
        return;
    }

    const safeTitle = (ev && ev.title ? ev.title : 'Turnamen');
    const division = (ev && ev.division ? ev.division : 'Esports');
    const date = (ev && ev.date ? ev.date : '-');
    const location = (ev && ev.location ? ev.location : '-');
    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });

    let tableRows = '';
    allRegs.forEach((t, i) => {
        // Susun daftar pemain dalam format rapi untuk sel Excel
        const rosterLines = (t.roster || []).map((p, pIdx) => {
            const role = p.role || `Pemain ${pIdx + 1}`;
            const name = p.fullName || '-';
            const nick = p.nickname ? `"${p.nickname}"` : '-';
            const gid = p.gameId || '-';
            const user = p.username ? `[@${p.username}]` : '';
            return `&bull; <strong>${role}:</strong> ${name} ${user} | IGN: ${nick} | ID: ${gid}`;
        }).join('<br style="mso-data-placement:same-cell;" />');

        const statusLabel = t.status === 'verified' ? 'TERVERIFIKASI' : (t.status === 'rejected' ? 'DITOLAK' : 'PENDING');
        const statusColor = t.status === 'verified' ? '#047857' : (t.status === 'rejected' ? '#B91C1C' : '#B45309');
        const statusBg = t.status === 'verified' ? '#ECFDF5' : (t.status === 'rejected' ? '#FEF2F2' : '#FFFBEB');

        tableRows += `
            <tr style="height: 36px; font-size: 10.5pt;">
                <td style="border: 1px solid #CBD5E1; text-align: center; vertical-align: middle; padding: 8px;">${i + 1}</td>
                <td style="border: 1px solid #CBD5E1; font-family: Consolas, monospace; font-weight: bold; color: #DC2626; vertical-align: middle; padding: 8px;">${t.regNumber || '-'}</td>
                <td style="border: 1px solid #CBD5E1; font-weight: bold; vertical-align: middle; padding: 8px; color: #0F172A;">${t.teamName || '-'}</td>
                <td style="border: 1px solid #CBD5E1; vertical-align: middle; padding: 8px;">${t.institution || '-'}</td>
                <td style="border: 1px solid #CBD5E1; vertical-align: middle; padding: 8px;">${t.kecamatan || '-'}</td>
                <td style="border: 1px solid #CBD5E1; font-weight: bold; vertical-align: middle; padding: 8px;">${t.leaderName || '-'}</td>
                <td style="border: 1px solid #CBD5E1; mso-number-format:'\\@'; vertical-align: middle; padding: 8px;">${t.leaderWa || '-'}</td>
                <td style="border: 1px solid #CBD5E1; vertical-align: middle; padding: 8px;">${t.leaderEmail || '-'}</td>
                <td style="border: 1px solid #CBD5E1; text-align: center; font-weight: bold; color: ${statusColor}; background-color: ${statusBg}; vertical-align: middle; padding: 8px;">${statusLabel}</td>
                <td style="border: 1px solid #CBD5E1; text-align: center; font-weight: bold; vertical-align: middle; padding: 8px;">${(t.roster || []).length}</td>
                <td style="border: 1px solid #CBD5E1; vertical-align: top; padding: 8px; font-size: 9.5pt; line-height: 1.5;">${rosterLines}</td>
                <td style="border: 1px solid #CBD5E1; vertical-align: middle; padding: 8px; font-size: 9.5pt; color: #475569;">${t.createdAt || '-'}</td>
                <td style="border: 1px solid #CBD5E1; vertical-align: middle; padding: 8px; font-size: 9.5pt; color: #64748B;">${t.notes || '-'}</td>
            </tr>
        `;
    });

    const excelHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>Pendaftar Turnamen</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; }
                th { background-color: #0F172A; color: #FFFFFF; font-weight: bold; text-align: center; border: 1px solid #334155; padding: 10px; }
            </style>
        </head>
        <body>
            <table style="border-collapse: collapse; width: 100%;">
                <tr>
                    <td colspan="13" style="font-size: 15pt; font-weight: bold; color: #0F172A; padding: 12px 0 4px 0;">DATA PENDAFTAR TURNAMEN - ESI KABUPATEN TRENGGALEK</td>
                </tr>
                <tr>
                    <td colspan="13" style="font-size: 12pt; font-weight: bold; color: #DC2626; padding-bottom: 4px;">${safeTitle} (${division})</td>
                </tr>
                <tr>
                    <td colspan="13" style="font-size: 10pt; color: #475569; padding-bottom: 14px;">Jadwal: ${date} &bull; Lokasi: ${location} &bull; Waktu Ekspor: ${nowStr} &bull; Total Terdaftar: ${allRegs.length} Tim</td>
                </tr>
                <thead>
                    <tr style="height: 38px; background-color: #0F172A; color: #ffffff;">
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 45px;">No</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 140px;">No. Registrasi</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 180px;">Nama Tim</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 180px;">Asal Sekolah / Komunitas</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 120px;">Kecamatan</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 150px;">Kapten Tim</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 140px;">No. WhatsApp</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 160px;">Email</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 130px;">Status</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 70px;">Roster</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 420px;">Susunan Pemain Lengkap (Role, Nama, IGN, Game ID)</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 140px;">Waktu Daftar</th>
                        <th style="background-color: #0F172A; color: #ffffff; border: 1px solid #334155; width: 180px;">Catatan</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob(["\ufeff" + excelHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeFileTitle = safeTitle.replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute("href", url);
    link.setAttribute("download", `Data_Pendaftar_${safeFileTitle}_ESI_Trenggalek.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Ekspor Berhasil', `File Excel pendaftar "${safeTitle}" telah diunduh.`);
}

// Alias backward compatibility
function exportTournamentTeamsCsv(eventId) {
    exportTournamentTeamsExcel(eventId);
}
