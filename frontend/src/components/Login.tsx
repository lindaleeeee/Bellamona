const Login = () => {
    const handleLogin = () => {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
        window.location.href = `${apiUrl}/api/auth/google`;
    };

    return (
        <div className="w-full flex flex-col items-center pt-[120px]">
            <div className="text-[42px] font-[700] text-[#1d1b1c] tracking-[-0.5px] leading-none mb-2 font-['Playfair_Display']">
                Bellamona
            </div>
            <div className="text-[11px] text-[#8e8d89] tracking-[2px] font-[600] mb-4">
                벨라모나 · HORMONE BALANCE
            </div>
            <div className="text-[13px] text-[#8e8d89] leading-[1.6] text-center mb-9">
                PCOS 여성을 위한<br />AI 호르몬·혈당·감정 통합 관리
            </div>

            <button
                onClick={handleLogin}
                className="flex items-center justify-center gap-3 w-[280px] h-[48px] bg-white border border-[#eae8e3] rounded-[14px] text-[15px] font-[700] text-[#1d1b1c] hover:bg-gray-50 transition-colors shadow-sm"
            >
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google로 계속하기
            </button>
            <div className="mt-[14px] text-[12px] text-[#8e8d89]">개인정보는 안전하게 보호됩니다</div>
        </div>
    );
};

export default Login;
