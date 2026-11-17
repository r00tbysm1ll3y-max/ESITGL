const http = require('http');
const fs = require('fs');
const path = require('path');
const blobHandler = require('./api/blob');
const commentsHandler = require('./api/comments');
const storeHandler = require('./api/store');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    // 1. API Route: /api/blob
    if (pathname === '/api/blob') {
        try {
            await blobHandler(req, res);
            return;
        } catch (err) {
            res.statusCode = 500;
            res.end(`Internal Server Error: ${err.message}`);
            return;
        }
    }

    // 1b. API Route: /api/comments
    if (pathname === '/api/comments') {
        try {
            await commentsHandler(req, res);
            return;
        } catch (err) {
            res.statusCode = 500;
            res.end(`Internal Server Error: ${err.message}`);
            return;
        }
    }

    // 1c. API Route: /api/store
    if (pathname === '/api/store') {
        try {
            await storeHandler(req, res);
            return;
        } catch (err) {
            res.statusCode = 500;
            res.end(`Internal Server Error: ${err.message}`);
            return;
        }
    }

    // 2. Static Files Serving
    let safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!safePath.startsWith(PUBLIC_DIR)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    try {
        let stats = null;
        if (fs.existsSync(safePath)) {
            stats = fs.statSync(safePath);
        }

        // If directory, serve index.html
        if (stats && stats.isDirectory()) {
            safePath = path.join(safePath, 'index.html');
            if (fs.existsSync(safePath)) {
                stats = fs.statSync(safePath);
            } else {
                stats = null;
            }
        }

        // SPA fallback to index.html if file not found and doesn't have an extension
        if (!stats && !path.extname(pathname)) {
            safePath = path.join(PUBLIC_DIR, 'index.html');
            if (fs.existsSync(safePath)) {
                stats = fs.statSync(safePath);
            }
        }

        if (stats && stats.isFile()) {
            const ext = path.extname(safePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            // Disable cache for local dev so changes reflect immediately
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

            const stream = fs.createReadStream(safePath);
            stream.pipe(res);
            return;
        }
    } catch (err) {
        console.error('File serve error:', err);
    }

    // 404
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('404 Not Found');
});

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  PORTAL RESMI PENGKAB ESI TRENGGALEK   `);
    console.log(`  Server aktif di http://localhost:${PORT}`);
    console.log(`  Vercel Blob Proxy: /api/blob AKTIF     `);
    console.log(`========================================\n`);
});
