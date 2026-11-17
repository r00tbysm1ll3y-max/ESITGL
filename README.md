# 🎮 Portal Resmi PENGKAB ESI Kabupaten Trenggalek

Portal web resmi Pengurus Kabupaten Esports Indonesia (PENGKAB ESI) Trenggalek untuk pendaftaran atlet, pendataan keanggotaan tim, klasemen peringkat, jadwal kejuaraan resmi, dan berita esports daerah.

Proyek ini telah dimodularisasi menjadi arsitektur JavaScript modern yang **siap dihubungkan ke Supabase** dan **siap di-deploy ke Vercel**.

---

## 📁 Struktur File & Direktori

```text
ESI Trenggalek/
├── index.html                  # Halaman web utama (SPA)
├── vercel.json                 # Konfigurasi routing & header untuk Vercel
├── .env.example                # Contoh environment variable Supabase
├── README.md                   # Dokumentasi & panduan setup
├── js/
│   ├── seedData.js             # Data awal Trenggalek (atlet, turnamen, berita)
│   ├── config.js               # Konfigurasi Supabase URL & Anon Key
│   ├── supabaseClient.js       # Inisialisasi library resmi @supabase/supabase-js
│   ├── api.js                  # Service layer (CRUD Supabase + LocalStorage Fallback)
│   └── app.js                  # Logika aplikasi, navigasi SPA, render views & form
└── supabase/
    └── schema.sql              # Skrip SQL untuk membuat tabel, RLS policy & data awal
```

---

## 🚀 Langkah 1: Hubungkan ke Supabase

Aplikasi ini telah dirancang dengan **Dual-Mode**: jika kunci Supabase belum diisi, aplikasi otomatis menggunakan *LocalStorage Fallback* (sehingga tetap bisa dicoba langsung). 

Untuk menghubungkan ke database PostgreSQL Supabase:

### 1.1 Buat Project di Supabase
1. Buka [https://supabase.com](https://supabase.com) dan login/daftar akun.
2. Klik **New Project**, beri nama (misal: `esi-trenggalek`), pilih region terdekat (misal: `Singapore`), lalu simpan password database.

### 1.2 Eksekusi Skema Database
1. Pada menu sebelah kiri dashboard Supabase, buka menu **SQL Editor**.
2. Klik **New query**.
3. Buka file [`supabase/schema.sql`](supabase/schema.sql), salin seluruh isinya dan tempelkan ke SQL Editor Supabase.
4. Klik tombol **Run** (Ctrl + Enter).
   - Skrip ini akan otomatis membuat 3 tabel: `athletes`, `events`, dan `news`.
   - Mengatur Row Level Security (RLS) agar publik bisa mendaftar & membaca data.
   - Mengisi data awal (seed data) atlet dan turnamen Trenggalek.

### 1.3 Pasang Kunci API Supabase ke Project
1. Di dashboard Supabase, buka menu **Project Settings** (ikon gerigi) -> **API**.
2. Salin **Project URL** dan **anon / public key**.
3. Buka file [`js/config.js`](js/config.js) di editor Anda, lalu masukkan nilainya:

```javascript
const CONFIG = {
    // Masukkan Supabase Project URL Anda:
    SUPABASE_URL: "https://id-project-anda.supabase.co",

    // Masukkan Supabase Anon Key Anda:
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    
    // ...
};
```

Selesai! Sekarang website sudah membaca & menulis data langsung ke Supabase.

---

## ⚡ Langkah 2: Deploy ke Vercel

### Opsi A: Deploy via GitHub (Direkomendasikan)
1. Buat repository baru di [GitHub](https://github.com), lalu push folder proyek ini ke repository Anda.
2. Buka [https://vercel.com](https://vercel.com) dan login menggunakan akun GitHub Anda.
3. Klik **Add New...** -> **Project**.
4. Pilih repository `ESI Trenggalek` Anda, lalu klik **Import**.
5. Framework Preset: pilih **Other** (karena berbasis Vanilla HTML/JS statis).
6. Root Directory: `.`
7. Klik **Deploy**! Website Anda akan langsung online dalam beberapa detik dengan domain gratis `.vercel.app`.

### Opsi B: Deploy Langsung via Vercel CLI
Jika Anda menginstal Vercel CLI:
```bash
npm install -g vercel
vercel
```
Ikuti instruksi di terminal, pilih konfigurasi default, dan deploy selesai!

---

## 🛡️ Kredensial Panel Admin

Untuk mengakses Panel Admin guna memverifikasi atlet baru, menginput poin klasemen, menambah jadwal turnamen, dan menerbitkan berita:

- **Halaman**: Klik menu **Admin** di navigasi atas
- **Email**: `admin@esitrenggalek.id`
- **Kata Sandi**: `admin123`

---

## 🌟 Fitur Utama Sistem

1. **Pendaftaran Atlet Terpadu**: Formulir pendaftaran atlet mandiri dengan validasi nomor WhatsApp Trenggalek dan auto-generate pesan konfirmasi.
2. **Cek Database & Verifikasi**: Publik dapat memantau status atlet (`Pending` atau `Verified`) berdasarkan nama, game ID, atau divisi (MLBB, Free Fire, PUBG Mobile, eFootball).
3. **Klasemen Poin Daerah**: Pemeringkatan dinamis atlet binaan per cabang game untuk seleksi Pelatcab Porprov.
4. **Jadwal Kejuaraan & Seleksi**: Filter jadwal kejuaraan daerah (`Upcoming`, `Ongoing`, `Selesai`).
5. **Portal Berita & Edukasi**: Warta resmi turnamen dan pembinaan atlet.
6. **Responsive & Mobile First**: Menggunakan Tailwind CSS responsif dengan Bottom Navigation khusus smartphone.
