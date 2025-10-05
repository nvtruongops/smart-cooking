'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import IngredientBatchValidator from '@/components/ingredients/IngredientBatchValidator';

export default function IngredientsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleIngredientsValidated = async (validIngredients: string[]) => {
    if (validIngredients.length === 0) {
      alert('Vui lòng thêm ít nhất một nguyên liệu hợp lệ');
      return;
    }

    if (validIngredients.length > 5) {
      alert('Bạn chỉ có thể chọn tối đa 5 nguyên liệu');
      return;
    }

    setIsLoading(true);

    try {
      // Store ingredients in sessionStorage to pass to AI suggestions page
      sessionStorage.setItem('selected_ingredients', JSON.stringify(validIngredients));

      // Navigate to AI suggestions page
      router.push('/ai-suggestions');
    } catch (error) {
      console.error('Error:', error);
      alert('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

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

        {/* Main content */}
        <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Chọn nguyên liệu</h1>
            <p className="mt-2 text-gray-600">
              Nhập các nguyên liệu bạn có trong tủ lạnh để tìm công thức phù hợp
            </p>
          </div>

          {/* Instructions card */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">
              Hướng dẫn sử dụng
            </h2>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start">
                <svg className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Nhập tên nguyên liệu và nhấn Enter hoặc chọn từ gợi ý tự động</span>
              </li>
              <li className="flex items-start">
                <svg className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Thêm từ 1-5 nguyên liệu (càng nhiều càng dễ tìm công thức phù hợp)</span>
              </li>
              <li className="flex items-start">
                <svg className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Nhấn &quot;Kiểm tra nguyên liệu&quot; để xác thực danh sách</span>
              </li>
              <li className="flex items-start">
                <svg className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Chấp nhận hoặc từ chối các đề xuất sửa lỗi (nếu có)</span>
              </li>
              <li className="flex items-start">
                <svg className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Nhấn &quot;Tìm công thức&quot; để nhận gợi ý từ AI</span>
              </li>
            </ul>
          </div>

          {/* Ingredient input section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <IngredientBatchValidator onValidated={handleIngredientsValidated} />
          </div>

          {/* Tips section */}
          <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              💡 Mẹo nhỏ
            </h3>
            <div className="space-y-2 text-sm text-gray-700">
              <p>
                • Hệ thống sử dụng AI và cơ sở dữ liệu công thức có sẵn để đề xuất món ăn phù hợp
              </p>
              <p>
                • Nếu nguyên liệu bạn nhập có lỗi chính tả, hệ thống sẽ tự động gợi ý sửa
              </p>
              <p>
                • Danh sách nguyên liệu sẽ được lưu tạm thời, bạn có thể quay lại sau
              </p>
              <p>
                • Với cùng một bộ nguyên liệu, bạn sẽ nhận được nhiều công thức khác nhau
              </p>
            </div>
          </div>

          {/* Loading overlay */}
          {isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-sm">
                <div className="flex items-center space-x-3">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-lg font-medium text-gray-900">
                    Đang chuyển đến trang gợi ý...
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
