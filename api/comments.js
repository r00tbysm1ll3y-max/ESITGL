const { put } = require('@vercel/blob');

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

const token = process.env.BLOB_READ_WRITE_TOKEN || "vercel_blob_rw_LPwrIMxJmWXm9ltj_vCdKTxYyVZ7Dv2niukddQ1bF0v4J1s";

// Helper helper fetch comments dari Vercel Blob
async function fetchCommentsFromBlob(articleId) {
    const blobUrl = `https://lpwrimxjmwxm9ltj.private.blob.vercel-storage.com/comments/article_${articleId}.json`;
    try {
        const res = await fetch(blobUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) return data;
        }
    } catch (e) {
        // Blob belum ada atau gagal fetch
    }
    // Fallback ke data awal
    return INITIAL_ARTICLE_COMMENTS[articleId] ? JSON.parse(JSON.stringify(INITIAL_ARTICLE_COMMENTS[articleId])) : [];
}

// Helper simpan comments ke Vercel Blob
async function saveCommentsToBlob(articleId, comments) {
    const filename = `comments/article_${articleId}.json`;
    await put(filename, JSON.stringify(comments, null, 2), {
        token,
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true
    });
}

// Helper parse body (kompatibel Vercel Functions dan Node raw HTTP)
function parseRequestBody(req) {
    return new Promise((resolve) => {
        if (req.body && typeof req.body === 'object') {
            return resolve(req.body);
        }
        if (typeof req.body === 'string') {
            try {
                return resolve(JSON.parse(req.body));
            } catch (_) {
                return resolve({});
            }
        }
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (_) {
                resolve({});
            }
        });
    });
}

module.exports = async (req, res) => {
    // Response helper
    if (!res.status) {
        res.status = function(code) {
            this.statusCode = code;
            return this;
        };
    }
    if (!res.json) {
        res.json = function(data) {
            this.setHeader('Content-Type', 'application/json; charset=utf-8');
            this.end(JSON.stringify(data));
        };
    }

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Ambil query parameter
    let articleId = (req.query && req.query.articleId) ? req.query.articleId : null;
    let commentId = (req.query && req.query.commentId) ? req.query.commentId : null;
    if (!articleId && req.url) {
        try {
            const parsed = new URL(req.url, 'http://localhost:3000');
            articleId = parsed.searchParams.get('articleId');
            if (!commentId) commentId = parsed.searchParams.get('commentId');
        } catch (_) {}
    }

    // --- 1. GET: Ambil Komentar ---
    if (req.method === 'GET') {
        if (!articleId) {
            return res.status(400).json({ error: 'Parameter articleId diperlukan' });
        }
        try {
            const comments = await fetchCommentsFromBlob(articleId);
            return res.status(200).json(comments);
        } catch (err) {
            console.error('Error GET comments:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // --- 2. POST: Tambah Komentar atau Balasan ---
    if (req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const targetArticleId = body.articleId || articleId;
            if (!targetArticleId) {
                return res.status(400).json({ error: 'articleId diperlukan' });
            }

            const currentComments = await fetchCommentsFromBlob(targetArticleId);

            if (body.replyToCommentId) {
                // Tambah balasan (reply)
                const target = currentComments.find(c => c.id === body.replyToCommentId);
                if (!target) {
                    return res.status(404).json({ error: 'Komentar yang dibalas tidak ditemukan' });
                }
                if (!Array.isArray(target.replies)) target.replies = [];
                target.replies.push(body.comment);
            } else if (body.comment) {
                // Tambah komentar baru di atas
                currentComments.unshift(body.comment);
            } else {
                return res.status(400).json({ error: 'Payload comment diperlukan' });
            }

            await saveCommentsToBlob(targetArticleId, currentComments);
            return res.status(200).json({ success: true, comments: currentComments });
        } catch (err) {
            console.error('Error POST comment:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // --- 3. DELETE: Hapus Komentar (Admin) ---
    if (req.method === 'DELETE') {
        try {
            const body = await parseRequestBody(req);
            const targetArticleId = body.articleId || articleId;
            const targetCommentId = body.commentId || commentId;

            if (!targetArticleId || !targetCommentId) {
                return res.status(400).json({ error: 'articleId dan commentId diperlukan' });
            }

            let currentComments = await fetchCommentsFromBlob(targetArticleId);
            // Filter komentar utama atau balasan
            currentComments = currentComments.filter(c => c.id !== targetCommentId);
            currentComments.forEach(c => {
                if (Array.isArray(c.replies)) {
                    c.replies = c.replies.filter(r => r.id !== targetCommentId);
                }
            });

            await saveCommentsToBlob(targetArticleId, currentComments);
            return res.status(200).json({ success: true, comments: currentComments });
        } catch (err) {
            console.error('Error DELETE comment:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
