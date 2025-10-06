'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import StarRating from '@/components/StarRating';
import ShareCookingSession from '@/components/cooking/ShareCookingSession';
import { CookingHistoryWithRecipe } from '@/types/cooking';
import { getStatusLabel, getStatusColor, formatDate } from '@/types/cooking';
import { formatTime, getTotalTime } from '@/types/recipe';
import { getCookingHistory, toggleFavorite } from '@/services/cookingService';

type FilterType = 'all' | 'completed' | 'cooking' | 'favorites';

function HistoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [history, setHistory] = useState<CookingHistoryWithRecipe[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<CookingHistoryWithRecipe[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('success') === 'rating_submitted') {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getCookingHistory();
      setHistory(data);
    } catch (err) {
      console.error('Failed to load cooking history:', err);
      setError(err instanceof Error ? err.message : 'Không thể tải lịch sử nấu ăn');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilter = useCallback(() => {
    let filtered = [...history];

    switch (filter) {
      case 'completed':
        filtered = filtered.filter(h => h.status === 'completed');
        break;
      case 'cooking':
        filtered = filtered.filter(h => h.status === 'cooking');
        break;
      case 'favorites':
        filtered = filtered.filter(h => h.is_favorite);
        break;
      case 'all':
      default:
        // No filter
        break;
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setFilteredHistory(filtered);
  }, [history, filter]);

  useEffect(() => {
    applyFilter();
  }, [filter, history, applyFilter]);

  const handleToggleFavorite = async (historyId: string, currentValue: boolean) => {
    try {
      await toggleFavorite(historyId, !currentValue);

      // Update local state
      setHistory(prevHistory =>
        prevHistory.map(h =>
          h.history_id === historyId ? { ...h, is_favorite: !currentValue } : h
        )
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      alert('Không thể cập nhật yêu thích');
    }
  };

  const handleRecipeClick = (historyItem: CookingHistoryWithRecipe) => {
    if (!historyItem.recipe) return;

    // If cooking, navigate to cooking session
    if (historyItem.status === 'cooking') {
      sessionStorage.setItem('cooking_recipe', JSON.stringify(historyItem.recipe));
      router.push('/cooking-session');
    } else {
      // View recipe details - you could implement a recipe detail view
      alert('Recipe detail view - to be implemented');
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Đang tải lịch sử...</p>
          </div>
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
                <a href="/dashboard" className="text-xl font-bold text-gray-900">
                  Smart Cooking
                </a>
              </div>
              <div className="flex items-center space-x-4">
                <a
                  href="/dashboard"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Dashboard
                </a>
                <a
                  href="/profile"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Profile
                </a>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Success Message */}
          {showSuccess && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-green-800 font-medium">Đánh giá của bạn đã được gửi thành công!</p>
              </div>
            </div>
          )}

          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Lịch sử nấu ăn</h1>
            <p className="mt-2 text-gray-600">
              Xem lại các món bạn đã nấu và quản lý yêu thích
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="mb-6 bg-white rounded-lg shadow-sm p-1 flex space-x-1">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Tất cả ({history.length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                filter === 'completed'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Hoàn thành ({history.filter(h => h.status === 'completed').length})
            </button>
            <button
              onClick={() => setFilter('cooking')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                filter === 'cooking'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Đang nấu ({history.filter(h => h.status === 'cooking').length})
            </button>
            <button
              onClick={() => setFilter('favorites')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                filter === 'favorites'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Yêu thích ({history.filter(h => h.is_favorite).length})
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-start">
                <svg className="h-6 w-6 text-red-600 mt-0.5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-red-900 mb-2">Có lỗi xảy ra</h3>
                  <p className="text-red-700 mb-4">{error}</p>
                  <button
                    onClick={loadHistory}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Thử lại
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* History List */}
          {!error && (
            <>
              {filteredHistory.length === 0 ? (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                  <svg className="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {filter === 'all' && 'Chưa có lịch sử nấu ăn'}
                    {filter === 'completed' && 'Chưa có món nào hoàn thành'}
                    {filter === 'cooking' && 'Không có món đang nấu'}
                    {filter === 'favorites' && 'Chưa có món yêu thích'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Bắt đầu nấu ăn ngay để xem lịch sử tại đây!
                  </p>
                  <button
                    onClick={() => router.push('/ingredients')}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Tìm công thức
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredHistory.map((item) => (
                    <div
                      key={item.history_id}
                      className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden"
                    >
                      <div className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3
                                className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                                onClick={() => handleRecipeClick(item)}
                              >
                                {item.recipe?.title || 'Unknown Recipe'}
                              </h3>
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)}`}>
                                {getStatusLabel(item.status)}
                              </span>
                              {item.recipe?.is_ai_generated && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-300">
                                  🤖 AI
                                </span>
                              )}
                            </div>

                            {item.recipe && (
                              <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                                <span className="flex items-center">
                                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {formatTime(getTotalTime(item.recipe))}
                                </span>
                                <span className="flex items-center">
                                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  {item.recipe.servings} người
                                </span>
                                <span className="flex items-center">
                                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {formatDate(item.cook_date || item.created_at)}
                                </span>
                              </div>
                            )}

                            {/* Personal Rating */}
                            {item.status === 'completed' && item.personal_rating && (
                              <div className="flex items-center mb-2">
                                <span className="text-sm text-gray-600 mr-2">Đánh giá của bạn:</span>
                                <StarRating rating={item.personal_rating} size="sm" readonly />
                              </div>
                            )}

                            {/* Personal Notes */}
                            {item.personal_notes && (
                              <p className="text-sm text-gray-600 italic mt-2 bg-gray-50 p-3 rounded-lg">
                                &ldquo;{item.personal_notes}&rdquo;
                              </p>
                            )}
                          </div>

                          {/* Favorite Button */}
                          <button
                            onClick={() => handleToggleFavorite(item.history_id, item.is_favorite || false)}
                            className={`ml-4 p-2 rounded-full transition-colors ${
                              item.is_favorite
                                ? 'text-red-500 hover:bg-red-50'
                                : 'text-gray-400 hover:bg-gray-100 hover:text-red-500'
                            }`}
                            title={item.is_favorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                          >
                            <svg className="h-6 w-6" fill={item.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                        </div>

                        {/* Action Buttons */}
                        {item.status === 'cooking' && (
                          <div className="mt-4 pt-4 border-t">
                            <button
                              onClick={() => handleRecipeClick(item)}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                            >
                              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Tiếp tục nấu
                            </button>
                          </div>
                        )}

                        {/* Share Button for Completed Sessions - Task 17.3 */}
                        {item.status === 'completed' && item.recipe && (
                          <div className="mt-4 pt-4 border-t">
                            <ShareCookingSession
                              sessionId={item.history_id}
                              recipeId={item.recipe.recipe_id}
                              recipeTitle={item.recipe.title}
                              rating={item.personal_rating}
                              notes={item.personal_notes}
                              imageUrl={item.recipe.image_url}
                              autoSuggest={item.personal_rating ? item.personal_rating >= 4 : false}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải...</p>
        </div>
      </div>
    }>
      <HistoryPageContent />
    </Suspense>
  );
}
