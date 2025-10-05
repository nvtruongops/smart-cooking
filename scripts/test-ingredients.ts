#!/usr/bin/env node
import { VIETNAMESE_INGREDIENTS, normalizeVietnamese } from './seed-master-ingredients';

console.log('🧪 Testing ingredient data model...');
console.log('📊 Total ingredients:', VIETNAMESE_INGREDIENTS.length);

const categories = Array.from(new Set(VIETNAMESE_INGREDIENTS.map(i => i.category)));
console.log('📂 Categories:', categories.join(', '));

console.log('🔍 Testing normalization:');
console.log('  "Thịt gà" ->', normalizeVietnamese('Thịt gà'));
console.log('  "Cà chua" ->', normalizeVietnamese('Cà chua'));
console.log('  "Hành tây" ->', normalizeVietnamese('Hành tây'));

// Test some sample ingredients
console.log('\n📝 Sample ingredients:');
VIETNAMESE_INGREDIENTS.slice(0, 5).forEach(ingredient => {
  console.log(`  - ${ingredient.name} (${ingredient.category}): ${ingredient.aliases.join(', ')}`);
});

// Verify we have 500+ ingredients as required
if (VIETNAMESE_INGREDIENTS.length >= 500) {
  console.log(`✅ Requirement met: ${VIETNAMESE_INGREDIENTS.length} ingredients (>= 500)`);
} else {
  console.log(`❌ Requirement not met: ${VIETNAMESE_INGREDIENTS.length} ingredients (< 500)`);
}

console.log('✅ Data model test completed!');