'use client';

import { useState, useEffect, useRef } from 'react';
import { getCookingHistory } from '@/services/cookingService';
import { CookingHistoryWithRecipe } from '@/types/cooking';

interface HistoryDropdownProps {
  onSelectHistory: (recipeName: string, recipeId: string) => void;
}

export default function HistoryDropdown({ onSelectHistory }: HistoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<CookingHistoryWithRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load history from API
  useEffect(() => {
    console.log('🔧 HistoryDropdown mounted, loading history...');
    loadHistory();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      console.log('🔍 Loading cooking history...');
      // Load only completed cooking sessions (món đã nấu xong)
      const sessions = await getCookingHistory('completed', 10);
      console.log('✅ Cooking history loaded:', sessions.length, 'sessions');
      console.log('📋 Sessions:', sessions);
      setHistory(sessions);
    } catch (error) {
      console.error('❌ Failed to load cooking history:', error);
      // Show empty state if user not logged in or error
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectHistory = (entry: CookingHistoryWithRecipe) => {
    // Navigate to recipe detail page with cooking history data
    const recipeId = entry.recipe_id;

    // Store recipe data in sessionStorage for the detail page
    sessionStorage.setItem('recipe_from_history', JSON.stringify({
      recipe_id: recipeId,
      title: entry.recipe?.title,
      ingredients: entry.recipe?.ingredients,
      instructions: entry.recipe?.instructions,
      cooking_method: entry.recipe?.cooking_method,
      personal_rating: entry.personal_rating,
      cook_date: entry.cook_date || entry.created_at,
      is_favorite: entry.is_favorite
    }));

    // Navigate to recipe detail page
    window.location.href = `/recipes/${recipeId}`;
  };

  const formatCookDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const clearHistory = () => {
    // Cannot delete from DynamoDB here - just hide or refresh
    setHistory([]);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="w-full">
      {/* History Menu Item */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && history.length === 0) {
            loadHistory(); // Load khi mở lần đầu
          }
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center space-x-3">
          <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">Lịch sử đã nấu</span>
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable History List */}
      {isOpen && (
        <div className="mt-2 ml-4 space-y-1">
          {isLoading ? (
            <div className="px-4 py-6 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-xs text-gray-500 mt-2">Đang tải...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400">
              <svg className="h-10 w-10 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs">Chưa có lịch sử</p>
              <p className="text-xs text-gray-300 mt-1">Món đã nấu sẽ hiện ở đây</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center px-4 py-2">
                <span className="text-xs text-gray-500">{history.length} món gần đây</span>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                  >
                    Ẩn
                  </button>
                )}
              </div>
              {history.map((entry, index) => (
                <button
                  key={entry.history_id || index}
                  onClick={() => handleSelectHistory(entry)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-md transition-colors group border border-gray-100"
                >
                  {/* Recipe Name */}
                  <div className="font-medium text-sm text-gray-800 mb-1">
                    {entry.recipe?.title || 'Món ăn không rõ tên'}
                  </div>

                  {/* Rating */}
                  {entry.personal_rating && (
                    <div className="flex items-center gap-1 mb-1">
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className={`h-3 w-3 ${i < entry.personal_rating! ? 'text-yellow-400' : 'text-gray-300'}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                      <span className="text-xs text-gray-500 ml-1">({entry.personal_rating}/5)</span>
                    </div>
                  )}

                  {/* Cook Date */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">
                      🍳 {formatCookDate(entry.cook_date || entry.created_at)}
                    </span>
                    {entry.is_favorite && (
                      <span className="text-xs text-red-500">❤️</span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
