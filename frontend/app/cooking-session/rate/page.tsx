'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import StarRating from '@/components/StarRating';
import { Recipe } from '@/types/recipe';
import { CookingHistory } from '@/types/cooking';
import { submitRating } from '@/services/cookingService';

export default function RatePage() {
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [session, setSession] = useState<CookingHistory | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load recipe and session from sessionStorage
    const savedRecipe = sessionStorage.getItem('cooking_recipe');
    const savedSession = sessionStorage.getItem('completed_session');

    if (!savedRecipe || !savedSession) {
      router.push('/dashboard');
      return;
    }

    try {
      setRecipe(JSON.parse(savedRecipe));
      setSession(JSON.parse(savedSession));
    } catch (err) {
      console.error('Failed to parse session data:', err);
      router.push('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipe || !session) return;

    if (rating === 0) {
      setError('Vui lòng chọn số sao đánh giá');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitRating({
        recipe_id: recipe.recipe_id,
        rating,
        comment: comment.trim() || undefined,
        history_id: session.session_id
      });

      // Clear session data
      sessionStorage.removeItem('cooking_recipe');
      sessionStorage.removeItem('completed_session');

      // Navigate to history with success message
      router.push('/history?success=rating_submitted');
    } catch (err) {
      console.error('Failed to submit rating:', err);
      setError(err instanceof Error ? err.message : 'Không thể gửi đánh giá');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    // Clear session data
    sessionStorage.removeItem('cooking_recipe');
    sessionStorage.removeItem('completed_session');

    // Navigate to history
    router.push('/history');
  };

  if (!recipe || !session) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900">Đánh giá món ăn</h1>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <div className="flex items-start">
              <svg className="h-6 w-6 text-green-600 mt-0.5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-green-900 mb-1">
                  Chúc mừng bạn đã hoàn thành!
                </h3>
                <p className="text-green-800">
                  Bạn vừa nấu xong món <strong>{recipe.title}</strong>. Hãy chia sẻ đánh giá của bạn để giúp cộng đồng nhé!
                </p>
              </div>
            </div>
          </div>

          {/* Rating Form */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Món ăn như thế nào?</h2>

            <form onSubmit={handleSubmit}>
              {/* Star Rating */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Đánh giá của bạn <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-4">
                  <StarRating
                    rating={rating}
                    onRatingChange={setRating}
                    size="lg"
                    showLabel
                  />
                </div>
              </div>

              {/* Comment */}
              <div className="mb-6">
                <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-2">
                  Nhận xét (Tùy chọn)
                </label>
                <textarea
                  id="comment"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Chia sẻ trải nghiệm của bạn với món ăn này..."
                  maxLength={500}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {comment.length}/500 ký tự
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-6 border-t">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="px-6 py-2 text-gray-700 hover:text-gray-900 font-medium"
                >
                  Bỏ qua
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || rating === 0}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Đang gửi...
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Gửi đánh giá
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Info Box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-blue-600 mt-0.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Tại sao nên đánh giá?</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Giúp cải thiện chất lượng công thức</li>
                  <li>Chia sẻ kinh nghiệm với cộng đồng</li>
                  <li>Công thức AI sẽ được tự động duyệt khi đủ đánh giá tốt</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
