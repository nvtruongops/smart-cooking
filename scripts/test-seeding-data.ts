#!/usr/bin/env node
import { VIETNAMESE_INGREDIENTS, normalizeVietnamese } from './seed-master-ingredients';

/**
 * Test the seeding data structure and validation
 */
async function testSeedingData(): Promise<void> {
  console.log('🧪 Testing Master Ingredients Seeding Data');
  console.log('==========================================\n');

  // Test 1: Verify ingredient count
  console.log(`1. Ingredient Count: ${VIETNAMESE_INGREDIENTS.length}`);
  if (VIETNAMESE_INGREDIENTS.length >= 500) {
    console.log('   ✅ Meets requirement of 500+ ingredients');
  } else {
    console.log('   ❌ Does not meet requirement of 500+ ingredients');
    throw new Error('Insufficient ingredients');
  }

  // Test 2: Verify categories
  const categories = Array.from(new Set(VIETNAMESE_INGREDIENTS.map(i => i.category)));
  console.log(`\n2. Categories (${categories.length}): ${categories.join(', ')}`);
  
  const expectedCategories = ['meat', 'seafood', 'vegetable', 'fruit', 'grain', 'legume', 'dairy', 'spice', 'beverage', 'nut', 'processed'];
  const missingCategories = expectedCategories.filter(cat => !categories.includes(cat));
  if (missingCategories.length === 0) {
    console.log('   ✅ All expected categories present');
  } else {
    console.log(`   ⚠️  Missing categories: ${missingCategories.join(', ')}`);
  }

  // Test 3: Verify data structure
  console.log('\n3. Data Structure Validation:');
  let validCount = 0;
  let errorCount = 0;

  for (const ingredient of VIETNAMESE_INGREDIENTS) {
    try {
      // Check required fields
      if (!ingredient.name || typeof ingredient.name !== 'string') {
        throw new Error(`Invalid name: ${ingredient.name}`);
      }
      if (!ingredient.category || typeof ingredient.category !== 'string') {
        throw new Error(`Invalid category: ${ingredient.category}`);
      }
      if (!Array.isArray(ingredient.aliases)) {
        throw new Error(`Invalid aliases: ${ingredient.aliases}`);
      }

      // Check normalization
      const normalized = normalizeVietnamese(ingredient.name);
      if (!normalized || normalized.length === 0) {
        throw new Error(`Normalization failed for: ${ingredient.name}`);
      }

      validCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Error in ingredient "${ingredient.name}": ${errorMessage}`);
      errorCount++;
    }
  }

  console.log(`   ✅ Valid ingredients: ${validCount}`);
  if (errorCount > 0) {
    console.log(`   ❌ Invalid ingredients: ${errorCount}`);
    throw new Error('Data validation failed');
  }

  // Test 4: Check for duplicates
  console.log('\n4. Duplicate Check:');
  const names = VIETNAMESE_INGREDIENTS.map(i => i.name.toLowerCase());
  const uniqueNames = new Set(names);
  const duplicateCount = names.length - uniqueNames.size;
  
  if (duplicateCount === 0) {
    console.log('   ✅ No duplicate ingredient names found');
  } else {
    console.log(`   ⚠️  Found ${duplicateCount} duplicate ingredient names`);
    
    // Find and display duplicates
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    const uniqueDuplicates = Array.from(new Set(duplicates));
    console.log(`   Duplicates: ${uniqueDuplicates.join(', ')}`);
  }

  // Test 5: Alias coverage
  console.log('\n5. Alias Coverage:');
  const totalAliases = VIETNAMESE_INGREDIENTS.reduce((sum, ing) => sum + ing.aliases.length, 0);
  const avgAliases = (totalAliases / VIETNAMESE_INGREDIENTS.length).toFixed(1);
  console.log(`   Total aliases: ${totalAliases}`);
  console.log(`   Average aliases per ingredient: ${avgAliases}`);
  
  const ingredientsWithoutAliases = VIETNAMESE_INGREDIENTS.filter(i => i.aliases.length === 0);
  if (ingredientsWithoutAliases.length > 0) {
    console.log(`   ⚠️  Ingredients without aliases: ${ingredientsWithoutAliases.length}`);
  } else {
    console.log('   ✅ All ingredients have aliases');
  }

  // Test 6: Vietnamese text normalization samples
  console.log('\n6. Normalization Samples:');
  const samples = VIETNAMESE_INGREDIENTS.slice(0, 5);
  samples.forEach(ingredient => {
    const normalized = normalizeVietnamese(ingredient.name);
    console.log(`   "${ingredient.name}" → "${normalized}"`);
  });

  console.log('\n✅ All seeding data tests passed!');
  console.log(`\n📊 Summary:`);
  console.log(`   - Total ingredients: ${VIETNAMESE_INGREDIENTS.length}`);
  console.log(`   - Categories: ${categories.length}`);
  console.log(`   - Total aliases: ${totalAliases}`);
  console.log(`   - Data integrity: ✅ Valid`);
}

// Run tests if this file is executed directly
if (require.main === module) {
  testSeedingData()
    .then(() => {
      console.log('\n🎉 Seeding data validation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Seeding data validation failed:', error.message);
      process.exit(1);
    });
}

export { testSeedingData };