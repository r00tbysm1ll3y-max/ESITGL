/**
 * Serverless & Local Handler: Proxy & Serve Vercel Private Blob
 * Mengizinkan gambar dari private blob store ditampilkan di tag <img> publik dengan aman dan cepat (cached).
 */
module.exports = async (req, res) => {
    // Helper status & send untuk kompatibilitas Node HTTP murni dan Vercel Functions
    if (!res.status) {
        res.status = function(code) {
            this.statusCode = code;
            return this;
        };
    }
    if (!res.send) {
        res.send = function(data) {
            this.end(data);
        };
    }

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).send('');
    }

    // Ambil param url baik dari req.query (Vercel) maupun query string URL (Node native)
    let url = req.query ? req.query.url : null;
    if (!url && req.url) {
        try {
            const parsed = new URL(req.url, 'http://localhost:3000');
            url = parsed.searchParams.get('url');
        } catch (_) {}
    }

    if (!url) {
        return res.status(400).send('Parameter url diperlukan');
    }

    // Validasi URL hanya dari domain vercel-storage
    try {
        const parsed = new URL(url);
        if (!parsed.hostname.endsWith('blob.vercel-storage.com')) {
            return res.status(403).send('Origin blob tidak valid');
        }
    } catch (_) {
        return res.status(400).send('Format URL tidak valid');
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN || "vercel_blob_rw_LPwrIMxJmWXm9ltj_vCdKTxYyVZ7Dv2niukddQ1bF0v4J1s";

    try {
        const upstream = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!upstream.ok) {
            return res.status(upstream.status).send(`Gagal mengambil blob: ${upstream.statusText}`);
        }

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);

        // Jika PDF: set Content-Disposition agar browser download (bukan tampilkan inline)
        // Juga support parameter filename opsional dari query: /api/blob?url=...&filename=namafile.pdf
        if (contentType.includes('pdf')) {
            const rawFilename = req.query?.filename || url.split('/').pop().split('?')[0] || 'dokumen.pdf';
            const safeFilename = decodeURIComponent(rawFilename).replace(/[^\w.\- ]/g, '_');
            res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
            res.setHeader('Cache-Control', 'private, no-cache');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }

        const arrayBuffer = await upstream.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error('Blob proxy error:', err);
        return res.status(500).send(err.message || 'Internal server error');
    }
};
