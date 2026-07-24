const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const authMiddleware = async (req, res, next) => {
    // Check if token exists in cookies
    const fromCookie = !!req.cookies?.token;
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    console.log(`[AUTH MIDDLEWARE] ${req.method} ${req.originalUrl} - token source: ${token ? (fromCookie ? 'cookie' : 'header') : 'none'}`);

    if (!token) {
        console.warn('[AUTH MIDDLEWARE] No token provided, rejecting request');
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('[AUTH MIDDLEWARE] Token valid for user:', { userId: decoded.userId, email: decoded.email });

        const { rows } = await pool.query('SELECT deleted_at FROM users WHERE id = $1', [decoded.userId]);
        if (rows.length === 0 || rows[0].deleted_at) {
            console.warn('[AUTH MIDDLEWARE] 탈퇴한 계정의 접근 차단:', decoded.email);
            return res.status(401).json({ error: 'account_deleted' });
        }

        req.user = decoded; // { userId, email }
        next();
    } catch (err) {
        console.error('[AUTH MIDDLEWARE ERROR]', err.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

module.exports = authMiddleware;
