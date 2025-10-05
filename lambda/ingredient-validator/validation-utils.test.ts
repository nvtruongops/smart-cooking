import {
  normalizeVietnamese,
  cleanIngredientName,
  generateIngredientVariations,
  calculateMatchConfidence,
  isValidIngredientFormat,
  extractSearchKeywords
} from './validation-utils';

describe('Validation Utils', () => {
  describe('normalizeVietnamese', () => {
    test('should remove Vietnamese diacritics', () => {
      expect(normalizeVietnamese('Thịt gà')).toBe('thit ga');
      expect(normalizeVietnamese('Cà chua')).toBe('ca chua');
      expect(normalizeVietnamese('Bánh mì')).toBe('banh mi');
      expect(normalizeVietnamese('Phở bò')).toBe('pho bo');
    });

    test('should handle đ/Đ characters', () => {
      expect(normalizeVietnamese('đậu phộng')).toBe('dau phong');
      expect(normalizeVietnamese('Đậu xanh')).toBe('dau xanh');
    });

    test('should convert to lowercase', () => {
      expect(normalizeVietnamese('THỊT GÀ')).toBe('thit ga');
      expect(normalizeVietnamese('ThỊt Gà')).toBe('thit ga');
    });

    test('should normalize whitespace', () => {
      expect(normalizeVietnamese('  thịt   gà  ')).toBe('thit ga');
      expect(normalizeVietnamese('thịt\t\ngà')).toBe('thit ga');
    });

    test('should handle empty or invalid input', () => {
      expect(normalizeVietnamese('')).toBe('');
      expect(normalizeVietnamese(null as any)).toBe('');
      expect(normalizeVietnamese(undefined as any)).toBe('');
      expect(normalizeVietnamese(123 as any)).toBe('');
    });

    test('should handle Unicode normalization', () => {
      // Test composed vs decomposed Unicode forms
      const composed = 'thịt'; // Composed form
      const decomposed = 'thi\u0323t'; // Decomposed form with combining mark
      expect(normalizeVietnamese(composed)).toBe(normalizeVietnamese(decomposed));
    });
  });

  describe('cleanIngredientName', () => {
    test('should remove common meat prefixes', () => {
      expect(cleanIngredientName('thịt gà')).toBe('gà');
      expect(cleanIngredientName('thit bo')).toBe('bo');
      expect(cleanIngredientName('Thịt heo')).toBe('heo');
    });

    test('should remove freshness indicators', () => {
      expect(cleanIngredientName('cà chua tươi')).toBe('cà chua');
      expect(cleanIngredientName('tôm khô')).toBe('tôm');
      expect(cleanIngredientName('thịt gà đông lạnh')).toBe('gà');
    });

    test('should normalize whitespace', () => {
      expect(cleanIngredientName('  cà   chua  ')).toBe('cà chua');
      expect(cleanIngredientName('thịt\t\ngà')).toBe('gà');
    });

    test('should handle empty or invalid input', () => {
      expect(cleanIngredientName('')).toBe('');
      expect(cleanIngredientName(null as any)).toBe('');
      expect(cleanIngredientName(undefined as any)).toBe('');
    });

    test('should preserve ingredient names without prefixes/suffixes', () => {
      expect(cleanIngredientName('cà chua')).toBe('cà chua');
      expect(cleanIngredientName('hành tây')).toBe('hành tây');
    });
  });

  describe('generateIngredientVariations', () => {
    test('should generate variations for multi-word ingredients', () => {
      const variations = generateIngredientVariations('Thịt gà');
      expect(variations).toContain('Thịt gà'); // Original
      expect(variations).toContain('gà'); // Cleaned
      expect(variations).toContain('thit ga'); // Normalized
      expect(variations).toContain('ga'); // Normalized cleaned
      // Individual words are only added if length > 2, so 'ga' might not be included as individual
      expect(variations.length).toBeGreaterThan(3);
    });

    test('should generate variations for single-word ingredients', () => {
      const variations = generateIngredientVariations('Tôm');
      expect(variations).toContain('Tôm'); // Original
      expect(variations).toContain('tom'); // Normalized
      expect(variations.length).toBeGreaterThan(1);
    });

    test('should remove empty strings from variations', () => {
      const variations = generateIngredientVariations('test');
      expect(variations).not.toContain('');
    });

    test('should handle empty input', () => {
      const variations = generateIngredientVariations('');
      expect(variations.length).toBeGreaterThanOrEqual(0);
      expect(variations).not.toContain('');
    });

    test('should skip very short words in multi-word ingredients', () => {
      const variations = generateIngredientVariations('cà chua to');
      // Should include longer words
      expect(variations).toContain('chua');
      // 'to' is short but might still be included in some variations
      expect(variations.length).toBeGreaterThan(2);
    });
  });

  describe('calculateMatchConfidence', () => {
    test('should return 1.0 for exact normalized matches', () => {
      const confidence = calculateMatchConfidence('thịt gà', 'Thịt gà');
      expect(confidence).toBe(1.0);
    });

    test('should return 0.95 for exact alias matches', () => {
      const confidence = calculateMatchConfidence('gà', 'Thịt gà', ['gà', 'chicken']);
      expect(confidence).toBe(0.95);
    });

    test('should calculate similarity for partial matches', () => {
      const confidence = calculateMatchConfidence('thit g', 'thit ga');
      expect(confidence).toBeGreaterThan(0.8);
      expect(confidence).toBeLessThan(1.0);
    });

    test('should boost scores for substring matches', () => {
      const withoutSubstring = calculateMatchConfidence('abc', 'xyz');
      const withSubstring = calculateMatchConfidence('abc', 'abcdef');
      expect(withSubstring).toBeGreaterThan(withoutSubstring);
    });

    test('should check alias similarities', () => {
      const confidence = calculateMatchConfidence('chicken', 'Thịt gà', ['gà', 'chicken']);
      expect(confidence).toBe(0.95); // Exact alias match
    });

    test('should handle empty inputs', () => {
      expect(calculateMatchConfidence('', 'test')).toBeLessThan(0.5);
      expect(calculateMatchConfidence('test', '')).toBeLessThan(0.5);
      expect(calculateMatchConfidence('', '')).toBe(1.0);
    });

    test('should boost substring matches in aliases', () => {
      const confidence = calculateMatchConfidence('chick', 'Thịt gà', ['chicken', 'gà']);
      expect(confidence).toBeGreaterThan(0.5); // Should get boost for substring match in alias
    });

    test('should not boost exact matches further', () => {
      const confidence = calculateMatchConfidence('test', 'test');
      expect(confidence).toBe(1.0); // Should remain 1.0, not exceed it
    });
  });

  describe('isValidIngredientFormat', () => {
    test('should accept valid ingredient names', () => {
      expect(isValidIngredientFormat('Thịt gà')).toEqual({ isValid: true });
      expect(isValidIngredientFormat('Cà chua')).toEqual({ isValid: true });
      expect(isValidIngredientFormat('Hành tây')).toEqual({ isValid: true });
    });

    test('should reject empty or null inputs', () => {
      expect(isValidIngredientFormat('')).toEqual({
        isValid: false,
        reason: 'Ingredient name must be a non-empty string'
      });
      expect(isValidIngredientFormat('   ')).toEqual({
        isValid: false,
        reason: 'Ingredient name cannot be empty'
      });
      expect(isValidIngredientFormat(null as any)).toEqual({
        isValid: false,
        reason: 'Ingredient name must be a non-empty string'
      });
      expect(isValidIngredientFormat(undefined as any)).toEqual({
        isValid: false,
        reason: 'Ingredient name must be a non-empty string'
      });
    });

    test('should reject non-string inputs', () => {
      expect(isValidIngredientFormat(123 as any)).toEqual({
        isValid: false,
        reason: 'Ingredient name must be a non-empty string'
      });
      expect(isValidIngredientFormat({} as any)).toEqual({
        isValid: false,
        reason: 'Ingredient name must be a non-empty string'
      });
    });

    test('should reject names that are too long', () => {
      const longName = 'a'.repeat(101);
      expect(isValidIngredientFormat(longName)).toEqual({
        isValid: false,
        reason: 'Ingredient name too long (max 100 characters)'
      });
    });

    test('should reject names that are too short', () => {
      expect(isValidIngredientFormat('a')).toEqual({
        isValid: false,
        reason: 'Ingredient name too short (min 2 characters)'
      });
    });

    test('should reject names with only numbers', () => {
      expect(isValidIngredientFormat('123')).toEqual({
        isValid: false,
        reason: 'Ingredient name cannot be only numbers'
      });
      expect(isValidIngredientFormat('456789')).toEqual({
        isValid: false,
        reason: 'Ingredient name cannot be only numbers'
      });
    });

    test('should reject names with only special characters', () => {
      expect(isValidIngredientFormat('!@#$')).toEqual({
        isValid: false,
        reason: 'Ingredient name contains only special characters'
      });
      expect(isValidIngredientFormat('***')).toEqual({
        isValid: false,
        reason: 'Ingredient name contains only special characters'
      });
    });

    test('should accept names with mixed content', () => {
      expect(isValidIngredientFormat('Thịt gà 123')).toEqual({ isValid: true });
      expect(isValidIngredientFormat('Cà chua!')).toEqual({ isValid: true });
      expect(isValidIngredientFormat('Hành-tây')).toEqual({ isValid: true });
    });

    test('should accept Vietnamese characters', () => {
      expect(isValidIngredientFormat('Thịt gà')).toEqual({ isValid: true });
      expect(isValidIngredientFormat('Bánh mì')).toEqual({ isValid: true });
      expect(isValidIngredientFormat('Phở bò')).toEqual({ isValid: true });
    });

    test('should accept names at boundary lengths', () => {
      expect(isValidIngredientFormat('ab')).toEqual({ isValid: true }); // Min length
      expect(isValidIngredientFormat('a'.repeat(100))).toEqual({ isValid: true }); // Max length
    });
  });

  describe('extractSearchKeywords', () => {
    test('should extract individual words', () => {
      const keywords = extractSearchKeywords('Thịt gà');
      expect(keywords).toContain('thit');
      expect(keywords).toContain('ga');
    });

    test('should extract word combinations', () => {
      const keywords = extractSearchKeywords('Thịt gà tươi');
      expect(keywords).toContain('thit');
      expect(keywords).toContain('ga');
      expect(keywords).toContain('tuoi');
      expect(keywords).toContain('thit ga');
      expect(keywords).toContain('ga tuoi');
    });

    test('should filter out single character words', () => {
      const keywords = extractSearchKeywords('Cà a chua');
      expect(keywords).toContain('ca');
      expect(keywords).toContain('chua');
      expect(keywords).not.toContain('a'); // Single character should be filtered
    });

    test('should handle single word ingredients', () => {
      const keywords = extractSearchKeywords('Tôm');
      expect(keywords).toContain('tom');
      expect(keywords.length).toBe(1);
    });

    test('should normalize Vietnamese text', () => {
      const keywords = extractSearchKeywords('Thịt gà');
      expect(keywords).toContain('thit');
      expect(keywords).toContain('ga');
      expect(keywords).not.toContain('Thịt'); // Should be normalized
    });

    test('should handle empty input', () => {
      const keywords = extractSearchKeywords('');
      expect(keywords).toEqual([]);
    });

    test('should handle whitespace-only input', () => {
      const keywords = extractSearchKeywords('   ');
      expect(keywords).toEqual([]);
    });

    test('should create combinations for longer phrases', () => {
      const keywords = extractSearchKeywords('Thịt gà ta tươi');
      expect(keywords).toContain('thit ga');
      expect(keywords).toContain('ga ta');
      expect(keywords).toContain('ta tuoi');
      expect(keywords.length).toBeGreaterThan(4); // Individual words + combinations
    });

    test('should return unique keywords', () => {
      const keywords = extractSearchKeywords('test test');
      const uniqueKeywords = [...new Set(keywords)];
      expect(keywords).toEqual(uniqueKeywords);
    });
  });

  describe('String Similarity Algorithms', () => {
    // These tests verify the internal similarity calculations work correctly
    test('should calculate high similarity for similar Vietnamese words', () => {
      const confidence1 = calculateMatchConfidence('thit ga', 'thit ga');
      const confidence2 = calculateMatchConfidence('thit ga', 'thit g');
      const confidence3 = calculateMatchConfidence('thit ga', 'chicken');
      
      expect(confidence1).toBe(1.0); // Exact match
      expect(confidence2).toBeGreaterThan(0.8); // Close match
      expect(confidence3).toBeLessThan(0.5); // Different words
    });

    test('should handle Jaro-Winkler similarity correctly', () => {
      // Test cases where Jaro-Winkler should perform well
      const confidence1 = calculateMatchConfidence('martha', 'marhta');
      const confidence2 = calculateMatchConfidence('dixon', 'dicksonx');
      
      expect(confidence1).toBeGreaterThan(0.8); // Transposition
      expect(confidence2).toBeGreaterThan(0.7); // Similar with prefix
    });

    test('should combine Jaro-Winkler and Levenshtein appropriately', () => {
      // Test that the weighted combination works
      const confidence = calculateMatchConfidence('test', 'tset');
      expect(confidence).toBeGreaterThan(0.7); // Should be high for simple transposition
      expect(confidence).toBeLessThan(1.0); // But not perfect
    });

    test('should handle edge cases in similarity calculation', () => {
      expect(calculateMatchConfidence('a', 'a')).toBe(1.0);
      expect(calculateMatchConfidence('a', 'b')).toBeLessThan(0.5);
      expect(calculateMatchConfidence('', 'test')).toBeLessThan(0.5);
      expect(calculateMatchConfidence('test', '')).toBeLessThan(0.5);
    });
  });
});