const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// 환경변수 로드 — 반드시 다른 로컬 모듈을 require하기 전에 실행해야 한다.
// auth.js/routes/*.js는 모듈 로드 시점(require 시점)에 바로 `new Pool({connectionString: process.env.DATABASE_URL})`를
// 실행하므로, dotenv.config()가 이 require들보다 늦게 호출되면 process.env가 아직 비어있는 상태로
// Pool이 만들어져(connectionString: undefined) 이후 모든 DB 쿼리가 실패한다 — 로컬 .env 파일로 개발할 때만
// 드러나는 버그였다(배포 환경은 OS/플랫폼이 프로세스 시작 전에 이미 env를 주입하므로 순서가 문제되지 않았음).
dotenv.config();

const authRoutes = require('./auth');
const dataRoutes = require('./routes/data');
const reportRoutes = require('./routes/report');
const glucoseRoutes = require('./routes/glucose');
const userRoutes = require('./routes/user');
const authMiddleware = require('./middleware/auth');
const cookieParser = require('cookie-parser');

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

console.log('[BOOT] Allowed CORS origins:', allowedOrigins);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn('[CORS] Blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 요청 로깅 미들웨어
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[REQ] ${req.method} ${req.originalUrl} from ${req.ip}`);
    res.on('finish', () => {
        console.log(`[RES] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
});

// 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/glucose', glucoseRoutes);

// Protected routes
app.use('/api/user', authMiddleware, userRoutes);

// 기본 헬스체크 라우트
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Bellamona Backend is running' });
});

const { initDB } = require('./init-db');

console.log('[BOOT] Starting Bellamona backend, initializing DB...');

initDB()
    .then(() => {
        console.log('[BOOT] DB initialized successfully.');
        app.listen(port, () => console.log(`[BOOT] Server is running on port ${port}`));
    })
    .catch((err) => {
        console.error('[BOOT] DB init failed, server not started:', err);
        process.exit(1);
    });
