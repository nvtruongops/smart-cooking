'use client';

import { useState, useEffect } from 'react';
import { Recipe } from '@/types/recipe';

interface CookingModeProps {
  recipe: Recipe;
  onComplete: (rating: number) => void;
  onCancel: () => void;
}

export default function CookingMode({ recipe, onComplete, onCancel }: CookingModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [timer, setTimer] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  const totalSteps = recipe.instructions.length;
  const currentInstruction = recipe.instructions[currentStep];

  // Auto-set timer for first step on mount
  useEffect(() => {
    if (currentInstruction.duration_minutes) {
      setTimer(currentInstruction.duration_minutes * 60);
      setIsTimerRunning(true);
    }
  }, []); // Only run once on mount

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setIsTimerRunning(false);
            // Play sound notification (optional)
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStepComplete = () => {
    setCompletedSteps([...completedSteps, currentStep]);
    if (currentStep < totalSteps - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setTimer(0);
      setIsTimerRunning(false);
      
      // Auto-set timer if next step has duration_minutes
      const nextInstruction = recipe.instructions[nextStep];
      if (nextInstruction.duration_minutes) {
        setTimer(nextInstruction.duration_minutes * 60);
        setIsTimerRunning(true);
      }
    } else {
      // All steps completed
      setShowRating(true);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      setTimer(0);
      setIsTimerRunning(false);
      
      // Auto-set timer if previous step has duration_minutes
      const prevInstruction = recipe.instructions[prevStep];
      if (prevInstruction.duration_minutes) {
        setTimer(prevInstruction.duration_minutes * 60);
      }
    }
  };

  const handleSetTimer = (minutes: number) => {
    setTimer(minutes * 60);
    setIsTimerRunning(true);
  };

  const handleRatingSubmit = () => {
    if (rating > 0) {
      onComplete(rating);
    }
  };

  if (showRating) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Hoàn thành!</h2>
            <p className="text-gray-600 mb-6">Bạn đã nấu xong món {recipe.title}</p>

            {/* Rating */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Đánh giá món ăn</p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="transition-transform hover:scale-110"
                  >
                    <svg
                      className={`h-10 w-10 ${
                        star <= (hoverRating || rating)
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                      />
                    </svg>
                  </button>
                ))}
              </div>
              {rating >= 4 && (
                <p className="text-sm text-green-600 mt-2">
                  ⭐ Công thức tuyệt vời! Sẽ được lưu vào cơ sở dữ liệu
                </p>
              )}
            </div>

            <button
              onClick={handleRatingSubmit}
              disabled={rating === 0}
              className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Hoàn thành
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onCancel}
              className="text-gray-600 hover:text-gray-900"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{recipe.title}</h1>
            <div className="w-6" /> {/* Spacer */}
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Bước {currentStep + 1}/{totalSteps}</span>
              <span>{completedSteps.length}/{totalSteps} hoàn thành</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedSteps.length / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Current Step */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex items-center mb-6">
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
              {currentStep + 1}
            </div>
            <div className="ml-4 flex-1">
              <h2 className="text-2xl font-bold text-gray-900">
                {currentInstruction.description}
              </h2>
              {currentInstruction.duration_minutes && (
                <p className="text-blue-600 mt-1 font-medium">
                  ⏱️ Thời gian: {currentInstruction.duration_minutes} phút
                  {isTimerRunning && timer > 0 && ' (đang đếm ngược)'}
                </p>
              )}
              {currentInstruction.tips && (
                <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                  <p className="text-sm text-yellow-800">
                    💡 <span className="font-medium">Mẹo:</span> {currentInstruction.tips}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Timer */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Hẹn giờ</h3>
              {currentInstruction.duration_minutes && isTimerRunning && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  Tự động đặt {currentInstruction.duration_minutes} phút
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-bold flex-1 text-center ${
                isTimerRunning ? 'text-blue-600' : 'text-gray-900'
              }`}>
                {timer > 0 ? formatTime(timer) : '--:--'}
              </div>
              <div className="flex gap-2">
                {[1, 3, 5, 10].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => handleSetTimer(mins)}
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
            {isTimerRunning && (
              <button
                onClick={() => setIsTimerRunning(false)}
                className="mt-3 w-full bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Dừng hẹn giờ
              </button>
            )}
            {timer === 0 && !isTimerRunning && currentInstruction.duration_minutes && (
              <button
                onClick={() => handleSetTimer(currentInstruction.duration_minutes!)}
                className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Bắt đầu hẹn giờ {currentInstruction.duration_minutes} phút
              </button>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-4">
            <button
              onClick={handlePreviousStep}
              disabled={currentStep === 0}
              className="flex-1 bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Bước trước
            </button>
            <button
              onClick={handleStepComplete}
              className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-green-700"
            >
              {currentStep === totalSteps - 1 ? 'Hoàn thành' : 'Bước tiếp theo'}
            </button>
          </div>
        </div>

        {/* Ingredients Reference */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Nguyên liệu cần dùng</h3>
          <div className="grid grid-cols-2 gap-3">
            {recipe.ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center text-sm">
                <div className="w-2 h-2 bg-green-600 rounded-full mr-2" />
                <span className="text-gray-900">{ing.ingredient_name}</span>
                <span className="text-gray-600 ml-auto">
                  {ing.quantity} {ing.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
