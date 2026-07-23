const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./auth');
const dataRoutes = require('./routes/data');
const reportRoutes = require('./routes/report');
const userRoutes = require('./routes/user');
const authMiddleware = require('./middleware/auth');
const cookieParser = require('cookie-parser');

// 환경변수 로드
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.set('trust proxy', 1);   // Cloudtype 프록시 뒤에 있으므로

process.on('unhandledRejection', (r) => console.error('[UNHANDLED REJECTION]', r));
process.on('uncaughtException', (e) => console.error('[UNCAUGHT EXCEPTION]', e));

// 미들웨어 설정
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/report', reportRoutes);

// Protected routes
app.use('/api/user', authMiddleware, userRoutes);

// 기본 헬스체크 라우트
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Bellamona Backend is running' });
});

const { initDB } = require('./init-db');

initDB()
    .then(() => {
        app.listen(port, () => console.log(`Server is running on port ${port}`));
    })
    .catch((err) => {
        console.error('DB init failed, server not started:', err);
        process.exit(1);
    });
