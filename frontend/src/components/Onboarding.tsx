import { useAppContext } from '../store';

const Onboarding = () => {
    const { state, updateState, api } = useAppContext();

    const handleNext = async () => {
        if (state.obStep < 3) {
            updateState({ obStep: state.obStep + 1 });
        } else {
            // Save data to backend
            await api.saveProfile();
            updateState({ currentScreen: 'home' });
        }
    };

    const handlePrev = () => {
        if (state.obStep > 1) {
            updateState({ obStep: state.obStep - 1 });
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col pt-[16px] px-[16px] bg-[#fcfbf9]">
            {/* Step indicators */}
            <div className="flex gap-[5px] justify-center mb-[16px] shrink-0">
                <div className={`w-[8px] h-[8px] rounded-full ${state.obStep >= 1 ? 'bg-[#5bb8f5] shadow-[0_0_8px_rgba(91,184,245,0.6)]' : 'bg-[#eae8e3]'}`}></div>
                <div className={`w-[8px] h-[8px] rounded-full ${state.obStep >= 2 ? 'bg-[#5bb8f5] shadow-[0_0_8px_rgba(91,184,245,0.6)]' : 'bg-[#eae8e3]'}`}></div>
                <div className={`w-[8px] h-[8px] rounded-full ${state.obStep >= 3 ? 'bg-[#5bb8f5] shadow-[0_0_8px_rgba(91,184,245,0.6)]' : 'bg-[#eae8e3]'}`}></div>
            </div>

            <div className="flex-1 overflow-y-auto w-full">
                {/* Step 1: Basic Info */}
                {state.obStep === 1 && (
                    <div className="w-full max-w-[400px] mx-auto transition-opacity duration-300">
                        <div className="font-['Playfair_Display'] text-[26px] font-bold text-[#1d1b1c] mb-[4px]">안녕하세요 👋</div>
                        <div className="text-[13px] text-[#8e8d89] font-medium mb-[20px]">기본 정보를 입력해주세요</div>
                        <div className="flex flex-col gap-[10px]">
                            <input
                                className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                placeholder="이름"
                                value={state.name}
                                onChange={(e) => updateState({ name: e.target.value })}
                            />
                            <div className="grid grid-cols-2 gap-[8px]">
                                <input
                                    className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                    placeholder="나이"
                                    type="number"
                                    defaultValue="32"
                                />
                                <select className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors text-[#1d1b1c]">
                                    <option>여성</option>
                                    <option>남성</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-[8px]">
                                <input
                                    className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                    placeholder="키 (cm)"
                                    type="number"
                                    defaultValue="165"
                                />
                                <input
                                    className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                    placeholder="현재 체중 (kg)"
                                    type="number"
                                    value={state.initWeight}
                                    onChange={(e) => updateState({ initWeight: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Goal Info */}
                {state.obStep === 2 && (
                    <div className="w-full max-w-[400px] mx-auto transition-opacity duration-300">
                        <div className="font-['Playfair_Display'] text-[26px] font-bold text-[#1d1b1c] mb-[4px]">목표 설정 🎯</div>
                        <div className="text-[13px] text-[#8e8d89] font-medium mb-[20px]">칼로리 목표를 자동 계산해드려요</div>
                        <div className="flex flex-col gap-[10px]">
                            <input
                                className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                placeholder="목표 체중 (kg)"
                                type="number"
                                value={state.goalWeight}
                                onChange={(e) => updateState({ goalWeight: Number(e.target.value) })}
                            />
                            <input
                                className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                placeholder="목표 기간 (개월)"
                                type="number"
                                value={state.goalMonths}
                                onChange={(e) => updateState({ goalMonths: Number(e.target.value) })}
                            />

                            <div className="bg-[#e0f2fe] border border-[rgba(91,184,245,0.3)] rounded-[20px] p-[16px] mb-[10px]">
                                <div className="text-[10px] text-[#8e8d89] tracking-[0.8px] uppercase font-bold mb-[6px]">자동 계산 하루 목표 칼로리</div>
                                <div className="text-[32px] font-extrabold text-[#5bb8f5]">{state.goalCal.toLocaleString()}</div>
                                <div className="text-[11px] text-[#8e8d89] mt-[2px]">
                                    체중 {(state.goalWeight - state.initWeight).toFixed(1)}kg ÷ {state.goalMonths * 30}일 × 7,700kcal
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-[6px]">
                                <span className="px-[12px] py-[5px] rounded-full border border-[#5bb8f5] text-[#5bb8f5] bg-[#e0f2fe] font-bold text-[11px] cursor-pointer">다낭성난소증후군</span>
                                <span className="px-[12px] py-[5px] rounded-full border border-[#5bb8f5] text-[#5bb8f5] bg-[#e0f2fe] font-bold text-[11px] cursor-pointer">임신 준비</span>
                                <span className="px-[12px] py-[5px] rounded-full border border-[#eae8e3] bg-white text-[#8e8d89] font-bold text-[11px] cursor-pointer">저속노화</span>
                                <span className="px-[12px] py-[5px] rounded-full border border-[#eae8e3] bg-white text-[#8e8d89] font-bold text-[11px] cursor-pointer">체지방 감량</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Period Info */}
                {state.obStep === 3 && (
                    <div className="w-full max-w-[400px] mx-auto transition-opacity duration-300">
                        <div className="font-['Playfair_Display'] text-[26px] font-bold text-[#1d1b1c] mb-[4px]">생리주기 🌸</div>
                        <div className="text-[13px] text-[#8e8d89] font-medium mb-[20px]">PCOS 맞춤 분석에 활용돼요</div>
                        <div className="flex flex-col gap-[10px]">
                            <input
                                className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                type="date"
                                defaultValue="2026-04-01"
                            />
                            <input
                                className="bg-white border border-[#eae8e3] rounded-[11px] p-[10px] text-[13px] w-full focus:outline-none focus:border-[#5bb8f5] transition-colors"
                                placeholder="평균 주기 (일, 기본 28)"
                                type="number"
                                defaultValue="28"
                            />
                            <div className="bg-[rgba(244,143,177,0.1)] border-[1.5px] border-[rgba(244,143,177,0.3)] rounded-[13px] p-[12px] text-[12px] text-[#f06292] leading-[1.6] font-semibold mt-[10px]">
                                🌸 생리기·배란기 달력 자동 표시 + 황체기 인슐린 감수성 경고
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-[8px] mt-[20px] max-w-[400px] mx-auto">
                    {state.obStep > 1 && (
                        <button
                            onClick={handlePrev}
                            className="flex-1 py-[7px] px-[14px] text-[12px] rounded-[10px] bg-white border-[1.5px] border-[#eae8e3] text-[#1d1b1c] font-bold hover:bg-gray-50 transition-colors"
                        >
                            이전
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        className="flex-1 py-[7px] px-[14px] text-[12px] rounded-[10px] bg-gradient-to-br from-[#5bb8f5] to-[#d8b4fe] text-white shadow-[0_4px_16px_rgba(91,184,245,0.35)] font-bold transition-opacity hover:opacity-90"
                    >
                        {state.obStep === 3 ? '시작하기' : '다음'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Onboarding;
