import { useAppContext } from '../store';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

const Home = () => {
    const { state, updateState } = useAppContext();

    const handleLogout = () => {
        localStorage.removeItem('token');
        updateState({ loggedIn: false, currentScreen: 'login' });
    };

    const handleNavigate = (screen: string) => {
        updateState({ currentScreen: screen });
    };

    const minWeight = Math.min(state.goalWeight, state.initWeight) - 2;
    const maxWeight = Math.max(state.goalWeight, state.initWeight) + 2;

    const chartData = state.weights && state.weights.length >= 2
        ? state.weights.map((w, i) => ({ name: `D-${i}`, weight: w.w || w }))
        : [
            { name: '시작', weight: state.initWeight || 55 },
            { name: '최근', weight: state.initWeight ? state.initWeight - (state.initWeight - state.goalWeight) * 0.2 : 54 },
            { name: '목표', weight: state.goalWeight || 48 }
        ];

    const progressPercent = Math.min(100, Math.max(0, 100 - ((state.initWeight - state.goalWeight) > 0
        ? ((state.initWeight - chartData[1].weight) / (state.initWeight - state.goalWeight)) * 100
        : 0)));

    return (
        <div className="w-full flex-1 flex flex-col h-full bg-[#fcfbf9]">
            {/* Header section (TODAY) */}
            <div className="px-[14px] pt-[14px] pb-[10px] shrink-0 bg-white border-b border-[#eae8e3]">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="text-[10px] text-[#8e8d89] tracking-[0.8px] uppercase font-bold mb-[2px]">
                            TODAY
                        </div>
                        <div className="font-['Playfair_Display'] text-[20px] font-bold text-[#1d1b1c]">
                            오늘도 빛나는 {state.name}님 ✨
                        </div>
                    </div>
                    <div className="text-right">
                        <span
                            role="button"
                            tabIndex={0}
                            aria-label="Logout button"
                            onKeyDown={(e) => e.key === 'Enter' && handleLogout()}
                            onClick={handleLogout}
                            className="text-[10px] text-[#ff715a] font-extrabold cursor-pointer block mb-1 hover:opacity-80"
                        >
                            로그아웃
                        </span>
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="View weight details"
                            className="cursor-pointer"
                        >
                            <div className="text-[10px] text-[#8e8d89] font-semibold">현재 몸무게</div>
                            <div className="text-[16px] font-extrabold text-[#1d1b1c]">
                                {chartData[chartData.length - 2].weight.toFixed(1)} kg
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-[14px] pt-[10px]">
                {/* Weight Progress Card */}
                <div className="bg-white border border-[rgba(91,184,245,0.25)] rounded-[20px] p-[16px] mb-[10px] shadow-sm">
                    <div className="flex justify-between items-center mb-[8px]">
                        <div className="text-[10px] text-[#8e8d89] tracking-[0.8px] uppercase font-bold mb-0">몸무게 목표</div>
                        <span className="text-[11px] text-[#5bb8f5] font-bold">
                            {state.goalWeight.toFixed(1)}kg까지 {(chartData[chartData.length - 2].weight - state.goalWeight).toFixed(1)}kg · D-{state.goalMonths * 30}
                        </span>
                    </div>

                    <div className="w-full h-[60px] mb-[6px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <YAxis domain={[minWeight, maxWeight]} hide />
                                <Line
                                    type="monotone"
                                    dataKey="weight"
                                    stroke="#5bb8f5"
                                    strokeWidth={3}
                                    dot={{ r: 3, fill: "#5bb8f5", strokeWidth: 0 }}
                                    activeDot={{ r: 5 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="h-[6px] bg-[#fcfbf9] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#5bb8f5] to-[#d8b4fe] rounded-full transition-all duration-700 ease-out" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                </div>

                {/* Calorie Progress Card */}
                <div className="bg-white border border-[#eae8e3] rounded-[20px] p-[16px] mb-[10px] shadow-sm">
                    <div className="text-[10px] text-[#8e8d89] tracking-[0.8px] uppercase font-bold mb-[6px]">오늘 칼로리</div>
                    <div className="grid grid-cols-4 gap-[5px] mb-[9px]">
                        <div className="text-center bg-[#e0f2fe] rounded-[11px] py-[9px] px-[3px] border border-[rgba(91,184,245,0.25)]">
                            <div className="text-[15px] font-extrabold text-[#5bb8f5]">0</div>
                            <div className="text-[9px] text-[#8e8d89] font-semibold">섭취</div>
                        </div>
                        <div className="text-center bg-[#e8f5e9] rounded-[11px] py-[9px] px-[3px] border border-[rgba(129,199,132,0.25)]">
                            <div className="text-[15px] font-extrabold text-[#81c784]">0</div>
                            <div className="text-[9px] text-[#8e8d89] font-semibold">소모</div>
                        </div>
                        <div className="text-center bg-[#fcfbf9] rounded-[11px] py-[9px] px-[3px] border border-[#eae8e3]">
                            <div className="text-[15px] font-extrabold">0</div>
                            <div className="text-[9px] text-[#8e8d89] font-semibold">NET</div>
                        </div>
                        <div className="text-center bg-[#fcfbf9] rounded-[11px] py-[9px] px-[3px] border-[1.5px] border-[#5bb8f5]">
                            <div className="text-[15px] font-extrabold text-[#1d1b1c]">{state.goalCal}</div>
                            <div className="text-[9px] text-[#8e8d89] font-semibold">목표</div>
                        </div>
                    </div>
                    <div className="h-[6px] bg-[#fcfbf9] rounded-full overflow-hidden mb-[5px]">
                        <div className="h-full bg-gradient-to-r from-[#5bb8f5] to-[#d8b4fe] rounded-full transition-all duration-700 ease-out w-[0%]"></div>
                    </div>
                </div>

                {/* Aging Score / Ring Card */}
                <div className="bg-white border border-[#eae8e3] rounded-[20px] p-[16px] mb-[10px] shadow-sm flex gap-[14px] items-center">
                    <div className="relative inline-flex items-center justify-center">
                        <svg width="74" height="74" className="-rotate-90">
                            <circle cx="37" cy="37" r="29" fill="none" stroke="#fcfbf9" strokeWidth="6" />
                            <circle cx="37" cy="37" r="29" fill="none" stroke="#eae8e3" strokeWidth="6" strokeDasharray="0 182" strokeLinecap="round" />
                        </svg>
                        <div className="absolute text-center">
                            <div className="text-[15px] font-extrabold text-[#1d1b1c]">0%</div>
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="text-[13px] font-bold text-[#1d1b1c]">오늘 저속노화 달성률</div>
                        <div className="text-[11px] text-[#8e8d89] font-medium my-[3px] mb-[8px]">루틴 0 / 16 완료</div>
                        <div className="flex gap-[5px] flex-wrap">
                            <span className="text-[10px] bg-[#fff9c4] text-[#ffdf70] px-[8px] py-[2px] rounded-full font-bold">인슐린 0%</span>
                            <span className="text-[10px] bg-[#e8f5e9] text-[#81c784] px-[8px] py-[2px] rounded-full font-bold">성장 0%</span>
                        </div>
                    </div>
                </div>

                {/* Four hormone cards */}
                <div className="grid grid-cols-2 gap-[8px] mb-[10px]">
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Insulin management"
                        onClick={() => handleNavigate('insulin')}
                        onKeyDown={(e) => e.key === 'Enter' && handleNavigate('insulin')}
                        className="bg-white border border-[rgba(91,184,245,0.3)] rounded-[16px] p-[14px] cursor-pointer shadow-sm hover:scale-[1.02] transition-transform"
                    >
                        <div className="flex justify-between mb-[5px]">
                            <span className="text-[15px]">🩺</span>
                            <span className="text-[12px] font-extrabold text-[#5bb8f5]">0%</span>
                        </div>
                        <div className="text-[12px] font-bold text-[#1d1b1c]">인슐린</div>
                        <div className="text-[10px] text-[#8e8d89] font-medium mb-[5px]">혈당·식단</div>
                        <div className="h-[3px] bg-[#fcfbf9] rounded-full overflow-hidden">
                            <div className="h-full w-[0%] bg-[#5bb8f5] rounded-full"></div>
                        </div>
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Growth hormone management"
                        onClick={() => handleNavigate('growth')}
                        onKeyDown={(e) => e.key === 'Enter' && handleNavigate('growth')}
                        className="bg-white border border-[rgba(129,199,132,0.3)] rounded-[16px] p-[14px] cursor-pointer shadow-sm hover:scale-[1.02] transition-transform"
                    >
                        <div className="flex justify-between mb-[5px]">
                            <span className="text-[15px]">💪</span>
                            <span className="text-[12px] font-extrabold text-[#81c784]">0%</span>
                        </div>
                        <div className="text-[12px] font-bold text-[#1d1b1c]">성장호르몬</div>
                        <div className="text-[10px] text-[#8e8d89] font-medium mb-[5px]">운동·소모</div>
                        <div className="h-[3px] bg-[#fcfbf9] rounded-full overflow-hidden">
                            <div className="h-full w-[0%] bg-[#81c784] rounded-full"></div>
                        </div>
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Cortisol management"
                        onClick={() => handleNavigate('cortisol')}
                        onKeyDown={(e) => e.key === 'Enter' && handleNavigate('cortisol')}
                        className="bg-white border border-[rgba(206,147,216,0.3)] rounded-[16px] p-[14px] cursor-pointer shadow-sm hover:scale-[1.02] transition-transform"
                    >
                        <div className="flex justify-between mb-[5px]">
                            <span className="text-[15px]">🌿</span>
                            <span className="text-[12px] font-extrabold text-[#ff8a65]">0%</span>
                        </div>
                        <div className="text-[12px] font-bold text-[#1d1b1c]">코르티솔</div>
                        <div className="text-[10px] text-[#8e8d89] font-medium mb-[5px]">스트레스·수면</div>
                        <div className="h-[3px] bg-[#fcfbf9] rounded-full overflow-hidden">
                            <div className="h-full w-[0%] bg-[#ff8a65] rounded-full"></div>
                        </div>
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Oxytocin management"
                        onClick={() => handleNavigate('oxytocin')}
                        onKeyDown={(e) => e.key === 'Enter' && handleNavigate('oxytocin')}
                        className="bg-white border border-[rgba(244,143,177,0.3)] rounded-[16px] p-[14px] cursor-pointer shadow-sm hover:scale-[1.02] transition-transform"
                    >
                        <div className="flex justify-between mb-[5px]">
                            <span className="text-[15px]">💗</span>
                            <span className="text-[12px] font-extrabold text-[#ba68c8]">0%</span>
                        </div>
                        <div className="text-[12px] font-bold text-[#1d1b1c]">옥시토신</div>
                        <div className="text-[10px] text-[#8e8d89] font-medium mb-[5px]">유대·감정</div>
                        <div className="h-[3px] bg-[#fcfbf9] rounded-full overflow-hidden">
                            <div className="h-full w-[0%] bg-[#ba68c8] rounded-full"></div>
                        </div>
                    </div>
                </div>

                {/* Diet Button */}
                <div
                    role="button"
                    tabIndex={0}
                    aria-label="View Diet Recipes"
                    onClick={() => handleNavigate('diet')}
                    onKeyDown={(e) => e.key === 'Enter' && handleNavigate('diet')}
                    className="bg-white border border-[rgba(91,184,245,0.25)] rounded-[16px] p-[14px] cursor-pointer shadow-sm flex items-center gap-[10px] hover:scale-[1.01] transition-transform"
                >
                    <span className="text-[22px]">🥗</span>
                    <div>
                        <div className="text-[13px] font-bold text-[#1d1b1c]">저당 레시피 보기</div>
                        <div className="text-[11px] font-semibold text-[#5bb8f5]">건강한 저혈당 식단 →</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;
