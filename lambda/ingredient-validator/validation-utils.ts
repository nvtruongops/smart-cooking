/**
 * Utility functions for ingredient validation
 */

/**
 * Normalize Vietnamese text for search and comparison
 * Removes diacritics, converts to lowercase, handles special characters
 */
export function normalizeVietnamese(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .trim()
    // Normalize Unicode to decomposed form
    .normalize('NFD')
    // Remove diacritical marks
    .replace(/[\u0300-\u036f]/g, '')
    // Handle Vietnamese specific characters
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean and prepare ingredient name for processing
 */
export function cleanIngredientName(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .trim()
    // Remove common prefixes/suffixes that don't affect ingredient identity
    .replace(/^(thịt|thit)\s+/i, '') // Remove "thịt" prefix for meat
    .replace(/\s+(tươi|tuoi|khô|kho|đông lạnh|dong lanh)$/i, '') // Remove freshness indicators
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract ingredient variations and aliases
 */
export function generateIngredientVariations(name: string): string[] {
  const variations = new Set<string>();
  const cleanName = cleanIngredientName(name);
  
  // Add original name
  variations.add(name);
  variations.add(cleanName);
  
  // Add normalized versions
  variations.add(normalizeVietnamese(name));
  variations.add(normalizeVietnamese(cleanName));
  
  // Add common variations
  const words = cleanName.toLowerCase().split(/\s+/);
  
  // Single word variations
  if (words.length > 1) {
    words.forEach(word => {
      if (word.length > 2) { // Skip very short words
        variations.add(word);
        variations.add(normalizeVietnamese(word));
      }
    });
  }
  
  // Remove empty strings
  variations.delete('');
  
  return Array.from(variations);
}

/**
 * Calculate confidence score for ingredient matching
 */
export function calculateMatchConfidence(
  input: string,
  candidate: string,
  aliases: string[] = []
): number {
  const normalizedInput = normalizeVietnamese(input);
  const normalizedCandidate = normalizeVietnamese(candidate);
  
  // Exact match gets highest score
  if (normalizedInput === normalizedCandidate) {
    return 1.0;
  }
  
  // Check aliases for exact match
  for (const alias of aliases) {
    if (normalizedInput === normalizeVietnamese(alias)) {
      return 0.95;
    }
  }
  
  // Calculate similarity scores
  let maxScore = 0;
  
  // Check main name similarity
  const mainScore = stringSimilarity(normalizedInput, normalizedCandidate);
  maxScore = Math.max(maxScore, mainScore);
  
  // Check alias similarities
  for (const alias of aliases) {
    const aliasScore = stringSimilarity(normalizedInput, normalizeVietnamese(alias));
    maxScore = Math.max(maxScore, aliasScore);
  }
  
  // Boost score for substring matches
  if (normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate)) {
    // Only boost if not an exact match
    if (normalizedInput !== normalizedCandidate) {
      maxScore = Math.min(0.99, maxScore + 0.15);
    }
  }
  
  // Check aliases for substring matches
  for (const alias of aliases) {
    const normalizedAlias = normalizeVietnamese(alias);
    if (normalizedAlias.includes(normalizedInput) || normalizedInput.includes(normalizedAlias)) {
      maxScore = Math.min(1.0, maxScore + 0.1);
      break;
    }
  }
  
  return maxScore;
}

/**
 * Calculate string similarity using a combination of algorithms
 */
function stringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;
  
  // Use Jaro-Winkler similarity for better results with Vietnamese text
  const jaroScore = jaroWinklerSimilarity(str1, str2);
  
  // Also calculate Levenshtein-based similarity
  const levenScore = 1 - (levenshteinDistance(str1, str2) / Math.max(str1.length, str2.length));
  
  // Return weighted average, favoring Jaro-Winkler for Vietnamese text
  return (jaroScore * 0.7) + (levenScore * 0.3);
}

/**
 * Jaro-Winkler similarity algorithm
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);
  
  if (jaro < 0.7) return jaro;
  
  // Calculate common prefix length (up to 4 characters)
  let prefix = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }
  
  return jaro + (0.1 * prefix * (1 - jaro));
}

/**
 * Jaro similarity algorithm
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0 || len2 === 0) return 0.0;
  
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (matchWindow < 0) return 0.0;
  
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0.0;
  
  // Find transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    
    while (!s2Matches[k]) k++;
    
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Validate ingredient name format and content
 */
export function isValidIngredientFormat(name: string): { isValid: boolean; reason?: string } {
  if (!name || typeof name !== 'string') {
    return { isValid: false, reason: 'Ingredient name must be a non-empty string' };
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, reason: 'Ingredient name cannot be empty' };
  }
  
  if (trimmed.length > 100) {
    return { isValid: false, reason: 'Ingredient name too long (max 100 characters)' };
  }
  
  if (trimmed.length < 2) {
    return { isValid: false, reason: 'Ingredient name too short (min 2 characters)' };
  }
  
  // Check for suspicious patterns
  if (/^\d+$/.test(trimmed)) {
    return { isValid: false, reason: 'Ingredient name cannot be only numbers' };
  }
  
  if (/^[^\w\s\u00C0-\u024F\u1E00-\u1EFF]+$/.test(trimmed)) {
    return { isValid: false, reason: 'Ingredient name contains only special characters' };
  }
  
  return { isValid: true };
}

/**
 * Extract meaningful keywords from ingredient name for search
 */
export function extractSearchKeywords(name: string): string[] {
  const normalized = normalizeVietnamese(name);
  const words = normalized.split(/\s+/).filter(word => word.length > 1);
  
  const keywords = new Set<string>();
  
  // Add individual words
  words.forEach(word => keywords.add(word));
  
  // Add word combinations for multi-word ingredients
  if (words.length > 1) {
    for (let i = 0; i < words.length - 1; i++) {
      keywords.add(words[i] + ' ' + words[i + 1]);
    }
  }
  
  return Array.from(keywords);
}