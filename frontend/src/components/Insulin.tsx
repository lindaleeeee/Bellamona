import React, { useState } from 'react';
import { useAppContext } from '../store';

const Insulin = () => {
    const { updateState } = useAppContext();
    const [glucose, setGlucose] = useState('');
    const [meal, setMeal] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Here we'd hook up to backend/glucoseModel routines
        alert('저장되었습니다!');
        updateState({ currentScreen: 'home' });
    };

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
                    <span>🩺</span> 인슐린 관리
                </div>
                <div className="w-[36px]"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-[14px]">
                {/* Description */}
                <div className="mb-6 px-2">
                    <p className="text-[13px] text-[#8e8d89] leading-relaxed">
                        PCOS 관리의 핵심은 인슐린 저항성 개선입니다.<br />
                        식후 혈당 스파이크를 줄이기 위해 식단과 공복혈당을 기록하세요.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white border border-[#eae8e3] rounded-[20px] p-5 shadow-sm space-y-5">
                    {/* Glucose Input */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            공복 혈당 (mg/dL)
                        </label>
                        <input
                            type="number"
                            value={glucose}
                            onChange={(e) => setGlucose(e.target.value)}
                            placeholder="예: 95"
                            className="w-full px-4 py-3 bg-[#fcfbf9] border border-[#eae8e3] rounded-[14px] text-[15px] font-bold focus:outline-none focus:border-[#5bb8f5] focus:ring-1 focus:ring-[#5bb8f5] transition-all"
                        />
                    </div>

                    {/* Meal Input */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            주요 식단
                        </label>
                        <textarea
                            value={meal}
                            onChange={(e) => setMeal(e.target.value)}
                            placeholder="오늘 섭취한 식단(단백질/채소 위주)을 간단히 메모하세요"
                            rows={3}
                            className="w-full px-4 py-3 bg-[#fcfbf9] border border-[#eae8e3] rounded-[14px] text-[14px] focus:outline-none focus:border-[#5bb8f5] focus:ring-1 focus:ring-[#5bb8f5] transition-all resize-none"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-[#1d1b1c] text-white py-[14px] rounded-[16px] font-bold text-[15px] hover:bg-[#333] transition-colors mt-2"
                    >
                        기록 완료
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Insulin;
