/**
 * KONFIGURASI SUPABASE & APLIKASI
 * 
 * Untuk menghubungkan ke Supabase:
 * 1. Buat project di https://supabase.com
 * 2. Masuk ke Project Settings -> API
 * 3. Salin Project URL dan anon / public key ke variabel di bawah ini.
 * 
 * Jika SUPABASE_URL atau SUPABASE_ANON_KEY masih bernilai kosong/placeholder,
 * aplikasi otomatis berjalan dalam mode DEMO / LocalStorage tanpa error.
 */

const CONFIG = {
    // Masukkan Supabase Project URL Anda di sini:
    // Contoh: "https://xyzcompany.supabase.co"
    SUPABASE_URL: window.ENV_SUPABASE_URL || "",

    // Masukkan Supabase Anon (Public) Key Anda di sini:
    // Contoh: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    SUPABASE_ANON_KEY: window.ENV_SUPABASE_ANON_KEY || "",

    // Storage keys versi baru (memastikan data dummy lama terhapus bersih)
    STORAGE_KEYS: {
        ATHLETES: 'esi_trenggalek_athletes_v2',
        EVENTS: 'esi_trenggalek_events_v2',
        NEWS: 'esi_trenggalek_news_v2',
        ADMIN_SESSION: 'esi_trenggalek_admin_logged_in',
        MEMBER_SESSION: 'esi_trenggalek_member_session',
        TOURNAMENT_REGISTRATIONS: 'esi_trenggalek_trn_regs_v2'
    },

    // Kredensial Login Admin Demo (digunakan saat offline/mode demo tanpa Supabase Auth)
    DEMO_ADMIN: {
        email: "admin@esitrenggalek.id",
        password: "admin123"
    },

    // Vercel Blob Storage Integration
    VERCEL_BLOB: {
        STORE_ID: window.ENV_BLOB_STORE_ID || "store_LPwrIMxJmWXm9ltj",
        TOKEN: window.ENV_BLOB_READ_WRITE_TOKEN || "vercel_blob_rw_LPwrIMxJmWXm9ltj_vCdKTxYyVZ7Dv2niukddQ1bF0v4J1s",
        ACCESS: "private" // 'private' | 'public' (sesuai tipe store di Vercel Dashboard)
    }
};

// Bersihkan data dummy lama (v1) jika ada di browser
(function clearOldStorage() {
    try {
        localStorage.removeItem('esi_trenggalek_athletes_v1');
        localStorage.removeItem('esi_trenggalek_events_v1');
        localStorage.removeItem('esi_trenggalek_news_v1');
    } catch (e) {
        // ignore
    }
})();

// Cek apakah Vercel Blob sudah dikonfigurasi
function isVercelBlobConfigured() {
    return Boolean(
        CONFIG.VERCEL_BLOB &&
        CONFIG.VERCEL_BLOB.TOKEN &&
        CONFIG.VERCEL_BLOB.TOKEN.startsWith('vercel_blob_') &&
        !CONFIG.VERCEL_BLOB.TOKEN.includes('your-token')
    );
}

// Cek apakah Supabase sudah dikonfigurasi dengan benar
function isSupabaseConfigured() {
    return (
        CONFIG.SUPABASE_URL && 
        CONFIG.SUPABASE_URL.trim() !== "" && 
        !CONFIG.SUPABASE_URL.includes("your-project") &&
        CONFIG.SUPABASE_ANON_KEY && 
        CONFIG.SUPABASE_ANON_KEY.trim() !== "" && 
        !CONFIG.SUPABASE_ANON_KEY.includes("your-anon-key")
    );
}
