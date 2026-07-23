import { useAppContext } from '../store';

const Diet = () => {
    const { updateState } = useAppContext();

    return (
        <div className="w-full flex-1 flex flex-col h-full bg-[#fcfbf9]">
            {/* Header section */}
            <div className="px-[14px] pt-[14px] pb-[12px] bg-white border-b border-[#eae8e3] flex items-center justify-between shadow-sm sticky top-0 z-10">
                <button
                    onClick={() => updateState({ currentScreen: 'home' })}
                    className="w-[36px] h-[36px] flex items-center justify-center -ml-2 rounded-full hover:bg-gray-50 transition-colors"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1d1b1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                </button>
                <div className="font-bold text-[18px] text-[#1d1b1c] font-['Playfair_Display'] flex gap-2 items-center">
                    <span>🥗</span> 저당 레시피
                </div>
                <div className="w-[36px]"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-[14px]">
                <div className="grid gap-4">
                    <div className="bg-white rounded-[20px] p-5 shadow-sm border border-[#eae8e3]">
                        <div className="text-[20px] mb-2">🥑</div>
                        <h3 className="font-bold text-[#1d1b1c] mb-1">아보카도 명란 덮밥</h3>
                        <p className="text-[12px] text-[#8e8d89] mb-3">탄수화물을 줄이고 건강한 지방과 단백질을 섭취하세요 (현미밥 권장)</p>
                        <span className="text-[10px] bg-[#e0f2fe] text-[#5bb8f5] px-2 py-1 rounded inline-block font-bold">인슐린 개선</span>
                    </div>

                    <div className="bg-white rounded-[20px] p-5 shadow-sm border border-[#eae8e3]">
                        <div className="text-[20px] mb-2">🥚</div>
                        <h3 className="font-bold text-[#1d1b1c] mb-1">시금치 계란 프리타타</h3>
                        <p className="text-[12px] text-[#8e8d89] mb-3">식이섬유가 프리바이오틱스 역할을 하여 장내 환경을 개선합니다.</p>
                        <span className="text-[10px] bg-[#e8f5e9] text-[#81c784] px-2 py-1 rounded inline-block font-bold">식이섬유</span>
                    </div>

                    <div className="bg-white rounded-[20px] p-5 shadow-sm border border-[#eae8e3]">
                        <div className="text-[20px] mb-2">🐟</div>
                        <h3 className="font-bold text-[#1d1b1c] mb-1">연어 스테이크 샐러드</h3>
                        <p className="text-[12px] text-[#8e8d89] mb-3">오메가3가 염증을 낮춰 PCOS 환자의 호르몬 밸런스를 돕습니다.</p>
                        <span className="text-[10px] bg-[#fff9c4] text-[#ffd54f] px-2 py-1 rounded inline-block font-bold">염증 완화</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Diet;
