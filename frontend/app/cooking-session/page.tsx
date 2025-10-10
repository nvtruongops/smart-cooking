'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Recipe } from '@/types/recipe';
import { startCooking, completeCooking } from '@/services/cookingService';
import { CookingHistory } from '@/types/cooking';

export default function CookingSessionPage() {
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [cookingSession, setCookingSession] = useState<CookingHistory | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load recipe from sessionStorage and start cooking session
  useEffect(() => {
    const loadRecipe = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const savedRecipe = sessionStorage.getItem('cooking_recipe');
        if (!savedRecipe) {
          setError('Không tìm thấy công thức. Vui lòng quay lại và chọn công thức.');
          return;
        }

        const parsedRecipe = JSON.parse(savedRecipe);
        setRecipe(parsedRecipe);

        // Start cooking session
        const session = await startCooking({
          recipe_id: parsedRecipe.recipe_id
        });
        setCookingSession(session);
      } catch (err) {
        console.error('Failed to start cooking session:', err);
        setError(err instanceof Error ? err.message : 'Không thể bắt đầu phiên nấu ăn');
      } finally {
        setIsLoading(false);
      }
    };

    loadRecipe();
  }, []);

  const handleNextStep = () => {
    if (recipe && currentStep < recipe.instructions.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!cookingSession) return;

    setIsCompleting(true);
    try {
      await completeCooking({
        session_id: cookingSession.session_id
      });

      // Store session ID for rating page
      sessionStorage.setItem('completed_session', JSON.stringify(cookingSession));

      // Navigate to rating page
      router.push('/cooking-session/rate');
    } catch (err) {
      console.error('Failed to complete cooking session:', err);
      setError(err instanceof Error ? err.message : 'Không thể hoàn thành phiên nấu ăn');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleCancel = () => {
    if (confirm('Bạn có chắc muốn hủy phiên nấu ăn này?')) {
      sessionStorage.removeItem('cooking_recipe');
      router.push('/dashboard');
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Đang tải công thức...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !recipe) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
            <div className="text-center">
              <svg className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Có lỗi xảy ra</h2>
              <p className="text-gray-600 mb-6">{error || 'Không tìm thấy công thức'}</p>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Quay lại Dashboard
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const instruction = recipe.instructions[currentStep];
  const progress = ((currentStep + 1) / recipe.instructions.length) * 100;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900">Đang nấu: {recipe.title}</h1>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleCancel}
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Progress Bar */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Bước {currentStep + 1} / {recipe.instructions.length}
              </span>
              <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Current Instruction */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <div className="flex items-start mb-6">
              <div className="flex-shrink-0 w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                <span className="text-2xl font-bold text-blue-600">{instruction.step_number}</span>
              </div>
              <div className="flex-1">
                <p className="text-xl text-gray-900 leading-relaxed">{instruction.description}</p>
                {instruction.duration && (
                  <p className="text-sm text-gray-600 mt-3 flex items-center">
                    <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ⏱️ {instruction.duration}
                  </p>
                )}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-6 border-t">
              <button
                onClick={handlePreviousStep}
                disabled={currentStep === 0}
                className={`flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                  currentStep === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Bước trước
              </button>

              {currentStep < recipe.instructions.length - 1 ? (
                <button
                  onClick={handleNextStep}
                  className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Bước tiếp theo
                  <svg className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCompleting ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Đang hoàn thành...
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Hoàn thành
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Ingredients Reference */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="h-6 w-6 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Nguyên liệu cần dùng
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {recipe.ingredients.map((ingredient, index) => (
                <div key={index} className="flex items-center text-sm text-gray-700">
                  <svg className="h-4 w-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">{ingredient.ingredient_name}:</span>
                  <span className="ml-1">{ingredient.quantity} {ingredient.unit || ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* All Steps Overview */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tất cả các bước</h3>
            <div className="space-y-3">
              {recipe.instructions.map((step, index) => (
                <div
                  key={step.step_number}
                  className={`flex items-start p-3 rounded-lg transition-colors cursor-pointer ${
                    index === currentStep
                      ? 'bg-blue-50 border-2 border-blue-300'
                      : index < currentStep
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                  onClick={() => setCurrentStep(index)}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                    index === currentStep
                      ? 'bg-blue-600 text-white'
                      : index < currentStep
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}>
                    {index < currentStep ? (
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-sm font-bold">{step.step_number}</span>
                    )}
                  </div>
                  <p className={`text-sm flex-1 ${
                    index === currentStep ? 'text-gray-900 font-medium' : 'text-gray-700'
                  }`}>
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
