'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchIngredients, IngredientSearchResult, validateIngredient, ValidationWarning } from '@/services/ingredientService';

interface IngredientInputProps {
  onAdd: (ingredient: string, validation?: { valid: boolean; warning?: ValidationWarning }) => void;
  placeholder?: string;
  className?: string;
  enableRealTimeValidation?: boolean;
}

export default function IngredientInput({ 
  onAdd, 
  placeholder, 
  className = '', 
  enableRealTimeValidation = true 
}: IngredientInputProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<IngredientSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [validationStatus, setValidationStatus] = useState<'none' | 'validating' | 'valid' | 'invalid' | 'warning'>('none');
  const [validationMessage, setValidationMessage] = useState<string>('');
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const validationRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const searchDebounced = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setValidationStatus('none');
      setValidationMessage('');
      return;
    }

    setIsLoading(true);
    try {
      const results = await searchIngredients(query, { limit: 10, fuzzyThreshold: 0.6 });
      setSuggestions(results);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Search error:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced real-time validation
  const validateDebounced = useCallback(async (query: string) => {
    if (!query.trim() || !enableRealTimeValidation) {
      setValidationStatus('none');
      setValidationMessage('');
      return;
    }

    setValidationStatus('validating');
    try {
      const validation = await validateIngredient(query);
      
      if (validation.valid) {
        if (validation.warning) {
          setValidationStatus('warning');
          setValidationMessage(validation.warning.message || '');
        } else {
          setValidationStatus('valid');
          setValidationMessage('Nguyên liệu hợp lệ');
        }
      } else {
        setValidationStatus('invalid');
        setValidationMessage(validation.warning?.message || 'Nguyên liệu không hợp lệ');
      }
    } catch (error) {
      console.error('Validation error:', error);
      setValidationStatus('invalid');
      setValidationMessage('Lỗi khi kiểm tra nguyên liệu');
    }
  }, [enableRealTimeValidation]);

  // Handle input change with debouncing
  const handleInputChange = (value: string) => {
    setInput(value);
    setSelectedIndex(-1);

    // Clear previous timeouts
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (validationRef.current) {
      clearTimeout(validationRef.current);
    }

    // Set new timeout for search
    debounceRef.current = setTimeout(() => {
      searchDebounced(value);
    }, 300);

    // Set new timeout for validation (slightly longer delay)
    if (enableRealTimeValidation) {
      validationRef.current = setTimeout(() => {
        validateDebounced(value);
      }, 500);
    }
  };

  // Handle ingredient selection
  const handleSelect = async (ingredient: string) => {
    // Skip validation on select - just add immediately
    // AI will handle all validation, no need for frontend checks
    onAdd(ingredient, undefined); // No validation object
    
    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    setValidationStatus('none');
    setValidationMessage('');
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && input.trim()) {
        e.preventDefault();
        handleSelect(input.trim());
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelect(suggestions[selectedIndex].name);
        } else if (input.trim()) {
          handleSelect(input.trim());
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get input styling based on validation status
  const getInputStyling = () => {
    const baseClasses = "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent transition-colors text-gray-900";
    
    switch (validationStatus) {
      case 'valid':
        return `${baseClasses} border-green-400 focus:ring-green-500 bg-green-50 text-green-900`;
      case 'warning':
        return `${baseClasses} border-yellow-400 focus:ring-yellow-500 bg-yellow-50 text-yellow-900`;
      case 'invalid':
        return `${baseClasses} border-red-400 focus:ring-red-500 bg-red-50 text-red-900`;
      case 'validating':
        return `${baseClasses} border-blue-400 focus:ring-blue-500 bg-blue-50 text-blue-900`;
      default:
        return `${baseClasses} border-blue-400 focus:ring-blue-500 bg-white text-gray-900 placeholder:text-gray-400`;
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => input && setShowSuggestions(true)}
            placeholder={placeholder || 'Nhập nguyên liệu...'}
            className={getInputStyling()}
          />

          {/* Loading and validation indicators */}
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
            {isLoading && (
              <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            
            {enableRealTimeValidation && validationStatus === 'validating' && !isLoading && (
              <svg className="animate-pulse h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            
            {enableRealTimeValidation && validationStatus === 'valid' && (
              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            
            {enableRealTimeValidation && validationStatus === 'warning' && (
              <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
            
            {enableRealTimeValidation && validationStatus === 'invalid' && (
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
        </div>

        {/* Add Button */}
        <button
          onClick={() => input.trim() && handleSelect(input.trim())}
          disabled={!input.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium whitespace-nowrap"
        >
          Thêm
        </button>
      </div>

      {/* Real-time validation message */}
      {enableRealTimeValidation && validationMessage && validationStatus !== 'none' && (
        <div className={`mt-1 text-xs ${
          validationStatus === 'valid' ? 'text-green-600' :
          validationStatus === 'warning' ? 'text-yellow-600' :
          validationStatus === 'invalid' ? 'text-red-600' :
          'text-blue-600'
        }`}>
          {validationMessage}
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto" style={{ width: 'calc(100% - 88px)' }}>
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSelect(suggestion.name)}
              className={`w-full px-4 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                index === selectedIndex ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{suggestion.name}</span>
                  <div className="text-xs text-gray-500 mt-1">
                    {suggestion.category} • Độ khớp: {(suggestion.match_score * 100).toFixed(0)}%
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ml-2 ${
                  suggestion.match_type === 'exact'
                    ? 'bg-green-100 text-green-800'
                    : suggestion.match_type === 'alias'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {suggestion.match_type === 'exact' ? 'Chính xác' :
                   suggestion.match_type === 'alias' ? 'Tên khác' : 'Gần đúng'}
                </span>
              </div>
              {suggestion.aliases.length > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  Tên khác: {suggestion.aliases.slice(0, 2).join(', ')}
                  {suggestion.aliases.length > 2 && '...'}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showSuggestions && !isLoading && input && suggestions.length === 0 && (
        <div className="absolute z-10 left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500" style={{ width: 'calc(100% - 88px)' }}>
          Không tìm thấy nguyên liệu phù hợp. Nhấn nút &quot;Thêm&quot; hoặc Enter để thêm &quot;{input}&quot;
        </div>
      )}
    </div>
  );
}
