'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { validateIngredients, ValidationWarning } from '@/services/ingredientService';
import IngredientInput from './IngredientInput';
import ValidationResults from './ValidationResults';

interface IngredientBatchValidatorProps {
  onValidated: (validIngredients: string[]) => void;
  initialIngredients?: string[];
}

interface IngredientState {
  name: string;
  status: 'pending' | 'validating' | 'valid' | 'invalid' | 'corrected' | 'warning';
  validated?: string;
  warning?: ValidationWarning;
  realTimeValidation?: { valid: boolean; warning?: ValidationWarning };
}

const STORAGE_KEY = 'smart_cooking_ingredients';

export default function IngredientBatchValidator({
  onValidated,
  initialIngredients = []
}: IngredientBatchValidatorProps) {
  const [ingredients, setIngredients] = useState<IngredientState[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    valid: { name: string; validated: string }[];
    invalid: { name: string; warning: ValidationWarning }[];
    warnings: ValidationWarning[];
  } | null>(null);



  // Save to localStorage whenever ingredients change (with validation state)
  useEffect(() => {
    const dataToSave = {
      ingredients: ingredients.map(i => ({
        name: i.name,
        status: i.status,
        validated: i.validated,
        warning: i.warning
      })),
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [ingredients]);

  // Load from localStorage with validation state - ONLY ONCE on mount
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    // Only run once on mount
    if (isInitialized) return;
    
    if (initialIngredients.length > 0) {
      console.log('📦 Loading initial ingredients:', initialIngredients);
      setIngredients(initialIngredients.map(name => ({
        name,
        status: 'pending'
      })));
    }
    // DON'T load from localStorage - parent clears it on mount anyway
    // Just start with empty state
    
    setIsInitialized(true);
  }, []); // Empty dependency - only run once!

  const handleAddIngredient = useCallback((name: string, validation?: { valid: boolean; warning?: ValidationWarning }) => {
    // Accept ALL ingredients regardless of validation - AI will handle interpretation
    // Check duplicate INSIDE setState callback to avoid stale state
    setIngredients(prev => {
      // Check if ingredient already exists (use fresh prev state)
      if (prev.some(i => i.name.toLowerCase() === name.toLowerCase())) {
        return prev; // Return unchanged state - duplicate blocked
      }
      
      const newState: IngredientState[] = [...prev, { 
        name, 
        status: 'pending' as const, // Always pending - AI will handle it
        validated: name,
        realTimeValidation: validation
      }];
      return newState;
    });
  }, []); // Empty deps - function never changes

  const handleRemoveIngredient = (name: string) => {
    setIngredients(prev => prev.filter(i => i.name !== name));

    // Also remove from validation results
    if (validationResults) {
      setValidationResults({
        valid: validationResults.valid.filter(v => v.name !== name),
        invalid: validationResults.invalid.filter(inv => inv.name !== name),
        warnings: validationResults.warnings.filter(w =>
          w.original !== name && w.ingredient !== name
        )
      });
    }
  };

  const handleValidate = async () => {
    if (ingredients.length === 0) return;

    setIsValidating(true);
    setIngredients(prev => prev.map(i => ({ ...i, status: 'validating' as const })));

    try {
      const results = await validateIngredients(ingredients.map(i => i.name));

      // Update ingredient states based on validation results
      setIngredients(prev => prev.map(ingredient => {
        const validResult = results.valid.find(v => v.name === ingredient.name);
        const invalidResult = results.invalid.find(inv => inv.name === ingredient.name);
        const correction = results.warnings.find(w => w.original === ingredient.name);

        if (validResult) {
          return {
            ...ingredient,
            status: correction ? 'corrected' : 'valid',
            validated: validResult.validated,
            warning: correction
          };
        } else if (invalidResult) {
          return {
            ...ingredient,
            status: 'invalid',
            warning: invalidResult.warning
          };
        }

        return ingredient;
      }));

      setValidationResults(results);
    } catch (error) {
      console.error('Validation error:', error);
      alert('Lỗi khi kiểm tra nguyên liệu. Vui lòng thử lại.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAcceptCorrection = (original: string, corrected: string) => {
    setIngredients(prev => prev.map(i =>
      i.name === original
        ? { ...i, name: corrected, validated: corrected, status: 'valid', warning: undefined }
        : i
    ));

    if (validationResults) {
      setValidationResults({
        valid: validationResults.valid.map(v =>
          v.name === original ? { ...v, name: corrected, validated: corrected } : v
        ),
        invalid: validationResults.invalid,
        warnings: validationResults.warnings.filter(w => w.original !== original)
      });
    }
  };

  const handleRejectCorrection = (original: string) => {
    // Keep the original, mark as accepted
    setIngredients(prev => prev.map(i =>
      i.name === original
        ? { ...i, status: 'valid', warning: undefined }
        : i
    ));

    if (validationResults) {
      setValidationResults({
        ...validationResults,
        warnings: validationResults.warnings.filter(w => w.original !== original)
      });
    }
  };

  const handleSubmit = () => {
    // NEW STRATEGY: Allow ALL ingredients, let AI handle interpretation
    // No validation required - AI is smart enough to interpret "ca ro" → "cà rô", etc.
    const allIngredients = ingredients.map(i => i.name);
    onValidated(allIngredients);
  };

  const handleClear = () => {
    setIngredients([]);
    setValidationResults(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const getStatusColor = (status: IngredientState['status']) => {
    switch (status) {
      case 'valid':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'corrected':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'invalid':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'validating':
        return 'bg-blue-100 text-blue-800 border-blue-300 animate-pulse';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: IngredientState['status']) => {
    switch (status) {
      case 'valid':
        return (
          <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'corrected':
      case 'warning':
        return (
          <svg className="h-4 w-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'invalid':
        return (
          <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'validating':
        return (
          <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      default:
        return null;
    }
  };

  const validCount = ingredients.length; // All ingredients are now considered "valid"
  const canSubmit = validCount > 0 && validCount <= 5 && !isValidating;

  return (
    <div className="space-y-6">
      {/* Input section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Thêm nguyên liệu
        </label>
        <IngredientInput
          onAdd={handleAddIngredient}
          placeholder="Nhập tên nguyên liệu (ví dụ: ca ro, hanh la, rau mui...)"
          enableRealTimeValidation={false}
        />
        <p className="mt-1 text-xs text-gray-500">
          Nhập từng nguyên liệu và nhấn Enter. AI sẽ tự động hiểu nguyên liệu của bạn.
        </p>
      </div>

      {/* Popular ingredients quick-add */}
      {ingredients.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            💡 Nguyên liệu phổ biến
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              'Thịt gà', 'Thịt bò', 'Cà chua', 'Hành tây', 'Tỏi', 
              'Gạo', 'Trứng', 'Rau muống', 'Cá', 'Nước mắm'
            ].map((ingredient) => (
              <button
                key={ingredient}
                onClick={() => handleAddIngredient(ingredient)}
                className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-full hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                + {ingredient}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Nhấn để thêm nhanh, hoặc nhập nguyên liệu khác ở trên
          </p>
        </div>
      )}

      {/* Ingredient list */}
      {ingredients.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Danh sách nguyên liệu ({ingredients.length})
            </label>
            <button
              onClick={handleClear}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Xóa tất cả
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {ingredients.map((ingredient, index) => (
              <div
                key={index}
                className={`inline-flex items-center px-3 py-2 border rounded-lg ${getStatusColor(ingredient.status)}`}
              >
                <div className="flex items-center space-x-2">
                  {getStatusIcon(ingredient.status)}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{ingredient.name}</span>
                    {ingredient.validated && ingredient.validated !== ingredient.name && (
                      <span className="text-xs opacity-75">→ {ingredient.validated}</span>
                    )}
                    {ingredient.warning && ingredient.status === 'warning' && (
                      <span className="text-xs opacity-75">{ingredient.warning.message}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveIngredient(ingredient.name)}
                  className="ml-2 hover:bg-black hover:bg-opacity-10 rounded p-0.5"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex items-center justify-end">
            {/* REMOVED: Validation button - AI will handle ingredient interpretation */}
            {/* Direct submit button */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span>Tìm công thức với AI ({validCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* Validation results - HIDDEN: AI handles all validation */}
      {/* {validationResults && (
        <ValidationResults
          valid={validationResults.valid}
          invalid={validationResults.invalid}
          warnings={validationResults.warnings}
          onAcceptCorrection={handleAcceptCorrection}
          onRejectCorrection={handleRejectCorrection}
          onRemoveInvalid={handleRemoveIngredient}
        />
      )} */}

      {/* Submit button - REMOVED: Now integrated above */}
      {/* {validationResults && (
        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-gray-600">
            Bạn có thể sử dụng {validCount} nguyên liệu hợp lệ để tìm công thức
          </p>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Tìm công thức ({validCount})
          </button>
        </div>
      )} */}
    </div>
  );
}
