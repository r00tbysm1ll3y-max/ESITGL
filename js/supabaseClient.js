/**
 * SUPABASE CLIENT INITIALIZATION
 * Menggunakan library resmi @supabase/supabase-js
 */

let supabaseClient = null;

function initSupabase() {
    if (isSupabaseConfigured() && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            console.log('✅ Supabase Client berhasil diinisialisasi.');
            return true;
        } catch (err) {
            console.error('❌ Gagal menginisialisasi Supabase Client:', err);
            supabaseClient = null;
            return false;
        }
    } else {
        if (!isSupabaseConfigured()) {
            console.info('ℹ️ Supabase belum dikonfigurasi (SUPABASE_URL / ANON_KEY kosong). Aplikasi berjalan dalam mode Offline/LocalStorage.');
        } else if (!window.supabase) {
            console.warn('⚠️ Library Supabase JS SDK belum dimuat. Menggunakan LocalStorage fallback.');
        }
        return false;
    }
}
