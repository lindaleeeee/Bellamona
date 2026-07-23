import { useAppContext } from '../store';

const Dashboard = () => {
    const { updateState } = useAppContext();

    const handleBack = () => {
        updateState({ currentScreen: 'home' });
    };

    return (
        <div className="w-full flex-1 flex flex-col h-full bg-[#fcfbf9]">
            {/* Header section (DASHBOARD) */}
            <div className="px-[14px] pt-[14px] pb-[8px] shrink-0 bg-white border-b border-[#eae8e3] flex justify-between items-center">
                <div>
                    <div className="text-[10px] text-[#8e8d89] tracking-[0.8px] uppercase font-bold mb-[2px]">
                        DASHBOARD
                    </div>
                    <div className="font-['Playfair_Display'] text-[20px] font-bold text-[#1d1b1c]">
                        2026년 4월 성과
                    </div>
                </div>
                <div className="flex gap-[5px]">
                    <button
                        className="bg-white border-[1.5px] border-[#eae8e3] rounded-[9px] w-[30px] h-[30px] text-[#8e8d89] font-bold text-[16px] flex items-center justify-center hover:bg-gray-50 transition-colors"
                        aria-label="Previous month"
                    >
                        ‹
                    </button>
                    <button
                        className="bg-white border-[1.5px] border-[#eae8e3] rounded-[9px] w-[30px] h-[30px] text-[#8e8d89] font-bold text-[16px] flex items-center justify-center hover:bg-gray-50 transition-colors"
                        aria-label="Next month"
                    >
                        ›
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-[14px] pt-[10px]">
                {/* Score Card */}
                <div className="bg-gradient-to-br from-[#e0f2fe] to-[#f3e8ff] rounded-[20px] border border-[rgba(91,184,245,0.2)] p-[16px] mb-[14px]">
                    <div className="flex gap-[14px] items-center mb-[12px]">
                        <div className="relative inline-flex items-center justify-center">
                            <svg width="82" height="82" className="-rotate-90">
                                <circle cx="41" cy="41" r="33" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="7" />
                                <circle cx="41" cy="41" r="33" fill="none" stroke="url(#dg)" strokeWidth="7" strokeDasharray="155 207" strokeLinecap="round" />
                                <defs>
                                    <linearGradient id="dg">
                                        <stop offset="0%" stopColor="#5bb8f5" />
                                        <stop offset="100%" stopColor="#9575cd" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute text-center">
                                <div className="text-[22px] font-extrabold text-[#1d1b1c] leading-none">75</div>
                                <div className="text-[9px] text-[#8e8d89] font-semibold mt-[2px]">/ 100</div>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="text-[13px] font-bold text-[#1d1b1c]">이달 저속노화 점수</div>
                            <div className="text-[11px] text-[#63d179] font-bold mt-[2px]">생물학적 나이 0.4세 ↓</div>
                            <div className="text-[11px] text-[#8e8d89] font-medium mt-[2px]">목표 -4kg · 현재 -0.0kg</div>
                            <div className="mt-[6px]">
                                <div className="h-[5px] bg-white rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-[#5bb8f5] to-[#d8b4fe] w-[0%]"></div>
                                </div>
                                <div className="text-[9px] text-[#8e8d89] font-semibold mt-[3px]">목표 달성률 0%</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Back to Home Button (for navigation demo) */}
                <button
                    onClick={handleBack}
                    className="w-full py-[12px] bg-white border border-[#eae8e3] rounded-[16px] text-[13px] font-bold text-[#8e8d89] hover:bg-gray-50 transition-colors shadow-sm"
                >
                    홈으로 돌아가기
                </button>
            </div>
        </div>
    );
};

export default Dashboard;
