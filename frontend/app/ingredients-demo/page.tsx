'use client';

import { useState } from 'react';
import IngredientInput from '@/components/ingredients/IngredientInput';
import IngredientBatchValidator from '@/components/ingredients/IngredientBatchValidator';
import ValidationResults from '@/components/ingredients/ValidationResults';
import { ValidationWarning } from '@/services/ingredientService';

export default function IngredientsDemoPage() {
  const [demoIngredients, setDemoIngredients] = useState<string[]>([]);
  const [showBatchValidator, setShowBatchValidator] = useState(true);

  // Mock validation results for demonstration
  const mockValidationResults = {
    valid: [
      { name: 'thịt gà', validated: 'Thịt gà' },
      { name: 'cà chua', validated: 'Cà chua' }
    ],
    invalid: [
      { 
        name: 'xyz123', 
        warning: { 
          ingredient: 'xyz123', 
          message: 'Không tìm thấy nguyên liệu này trong cơ sở dữ liệu',
          suggestions: ['Thịt gà', 'Cà chua', 'Hành tây']
        } as ValidationWarning 
      }
    ],
    warnings: [
      {
        original: 'thit ga',
        corrected: 'Thịt gà',
        confidence: 0.95,
        message: 'Tên nguyên liệu được tự động sửa dựa trên độ tương đồng'
      } as ValidationWarning,
      {
        original: 'ca chua',
        corrected: 'Cà chua',
        confidence: 0.92,
        message: 'Tên nguyên liệu được chuẩn hóa'
      } as ValidationWarning
    ]
  };

  const handleAddIngredient = (ingredient: string, validation?: { valid: boolean; warning?: ValidationWarning }) => {
    console.log('Added ingredient:', ingredient, validation);
    setDemoIngredients(prev => [...prev, ingredient]);
  };

  const handleValidated = (validIngredients: string[]) => {
    console.log('Validated ingredients:', validIngredients);
    alert(`Đã xác thực ${validIngredients.length} nguyên liệu: ${validIngredients.join(', ')}`);
  };

  const handleAcceptCorrection = (original: string, corrected: string) => {
    console.log('Accepted correction:', original, '->', corrected);
    alert(`Đã chấp nhận sửa: "${original}" → "${corrected}"`);
  };

  const handleRejectCorrection = (original: string) => {
    console.log('Rejected correction for:', original);
    alert(`Đã từ chối sửa cho: "${original}"`);
  };

  const handleRemoveInvalid = (ingredient: string) => {
    console.log('Removed invalid ingredient:', ingredient);
    alert(`Đã xóa nguyên liệu không hợp lệ: "${ingredient}"`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Ingredient Input & Validation Demo
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/ingredients"
                className="text-blue-600 hover:text-blue-800 px-3 py-2 rounded-md text-sm font-medium"
              >
                ← Back to Ingredients
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Demo Controls */}
        <div className="mb-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Demo Controls</h2>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowBatchValidator(!showBatchValidator)}
              className={`px-4 py-2 rounded-lg font-medium ${
                showBatchValidator
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {showBatchValidator ? 'Hide' : 'Show'} Batch Validator
            </button>
            <button
              onClick={() => setDemoIngredients([])}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Clear Demo Data
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Input Components */}
          <div className="space-y-8">
            {/* Single Ingredient Input */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Single Ingredient Input (Real-time Validation)
              </h2>
              <IngredientInput
                onAdd={handleAddIngredient}
                placeholder="Nhập nguyên liệu để thấy validation real-time..."
                enableRealTimeValidation={true}
              />
              <div className="mt-4 text-sm text-gray-600">
                <p><strong>Features:</strong></p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Auto-complete suggestions with fuzzy matching</li>
                  <li>Real-time validation with visual indicators</li>
                  <li>Keyboard navigation (Arrow keys, Enter, Escape)</li>
                  <li>Match type indicators (Exact, Alias, Fuzzy)</li>
                  <li>Confidence scoring</li>
                </ul>
              </div>
            </div>

            {/* Batch Validator */}
            {showBatchValidator && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Batch Ingredient Validator
                </h2>
                <IngredientBatchValidator onValidated={handleValidated} />
                <div className="mt-4 text-sm text-gray-600">
                  <p><strong>Features:</strong></p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Batch validation of multiple ingredients</li>
                    <li>localStorage persistence (24-hour cache)</li>
                    <li>Popular ingredients quick-add buttons</li>
                    <li>Visual status indicators for each ingredient</li>
                    <li>Accept/Reject correction workflow</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Results and Examples */}
          <div className="space-y-8">
            {/* Demo Ingredients List */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Demo Added Ingredients ({demoIngredients.length})
              </h2>
              {demoIngredients.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {demoIngredients.map((ingredient, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                    >
                      {ingredient}
                      <button
                        onClick={() => setDemoIngredients(prev => prev.filter((_, i) => i !== index))}
                        className="ml-2 hover:bg-blue-200 rounded-full p-0.5"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">No ingredients added yet. Try the input above!</p>
              )}
            </div>

            {/* Validation Results Demo */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Validation Results Demo
              </h2>
              <ValidationResults
                valid={mockValidationResults.valid}
                invalid={mockValidationResults.invalid}
                warnings={mockValidationResults.warnings}
                onAcceptCorrection={handleAcceptCorrection}
                onRejectCorrection={handleRejectCorrection}
                onRemoveInvalid={handleRemoveInvalid}
              />
            </div>

            {/* Feature Highlights */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-blue-900 mb-4">
                ✨ Key Features Implemented
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong>Real-time Validation:</strong> Ingredients are validated as you type with visual feedback
                  </div>
                </div>
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong>Fuzzy Matching:</strong> Auto-correct typos and missing Vietnamese tone marks
                  </div>
                </div>
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong>Accept/Reject Workflow:</strong> Users can accept or reject auto-corrections
                  </div>
                </div>
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong>Batch Validation:</strong> Validate multiple ingredients at once with error highlighting
                  </div>
                </div>
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong>Session Persistence:</strong> Ingredients are saved to localStorage for 24 hours
                  </div>
                </div>
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong>No Backend Storage:</strong> All validation is stateless, ingredients go directly to AI suggestion
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Test Instructions */}
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-yellow-900 mb-4">
            🧪 Test Instructions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-medium text-yellow-900 mb-2">Try these valid ingredients:</h3>
              <ul className="space-y-1 text-yellow-800">
                <li>• <code>thịt gà</code> (exact match)</li>
                <li>• <code>ca chua</code> (missing tone marks)</li>
                <li>• <code>hanh tay</code> (fuzzy match)</li>
                <li>• <code>gao</code> (alias match)</li>
                <li>• <code>trung</code> (partial match)</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-yellow-900 mb-2">Try these for error handling:</h3>
              <ul className="space-y-1 text-yellow-800">
                <li>• <code>xyz123</code> (invalid ingredient)</li>
                <li>• <code>abcdef</code> (no suggestions)</li>
                <li>• <code>thit</code> (partial, will suggest)</li>
                <li>• <code>ga</code> (alias, will match)</li>
                <li>• Empty input (validation disabled)</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}