const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // Check if token exists in cookies
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { userId, email }
        next();
    } catch (err) {
        console.error('[AUTH MIDDLEWARE ERROR]', err.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

module.exports = authMiddleware;
