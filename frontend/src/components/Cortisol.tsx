import React, { useState } from 'react';
import { useAppContext } from '../store';

const Cortisol = () => {
    const { updateState } = useAppContext();
    const [sleepHours, setSleepHours] = useState('');
    const [stressLevel, setStressLevel] = useState('3');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
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
                    <span>🌿</span> 코르티솔 관리
                </div>
                <div className="w-[36px]"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-[14px]">
                {/* Description */}
                <div className="mb-6 px-2">
                    <p className="text-[13px] text-[#8e8d89] leading-relaxed">
                        높은 스트레스와 수면 부족은 체중 증가를 유발합니다.<br />
                        충분한 휴식을 통해 호르몬 균형을 되찾으세요.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white border border-[#eae8e3] rounded-[20px] p-5 shadow-sm space-y-5">
                    {/* Sleep Input */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            수면 시간 (시간)
                        </label>
                        <input
                            type="number"
                            step="0.5"
                            value={sleepHours}
                            onChange={(e) => setSleepHours(e.target.value)}
                            placeholder="예: 7.5"
                            className="w-full px-4 py-3 bg-[#fcfbf9] border border-[#eae8e3] rounded-[14px] text-[15px] font-bold focus:outline-none focus:border-[#ff8a65] focus:ring-1 focus:ring-[#ff8a65] transition-all"
                        />
                    </div>

                    {/* Stress Level */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            오늘의 스트레스 지수 (1~5)
                        </label>
                        <div className="flex gap-2 justify-between mt-3 px-1">
                            {[1, 2, 3, 4, 5].map(num => (
                                <button
                                    type="button"
                                    key={num}
                                    onClick={() => setStressLevel(num.toString())}
                                    className={`w-10 h-10 rounded-full font-bold transition-all ${stressLevel === num.toString() ? 'bg-[#ff8a65] text-white shadow-md transform scale-110' : 'bg-[#eae8e3] text-[#8e8d89]'}`}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-[#1d1b1c] text-white py-[14px] rounded-[16px] font-bold text-[15px] hover:bg-[#333] transition-colors mt-4"
                    >
                        기록 완료
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Cortisol;
