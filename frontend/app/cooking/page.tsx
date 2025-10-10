/**
 * Cooking Page - Combined Ingredients & AI Suggestions
 * All-in-one page for ingredient input and recipe suggestions
 */

'use client';

import { useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navigation from '@/components/Navigation';
import IngredientBatchValidator from '@/components/ingredients/IngredientBatchValidator';
import RecipeCard from '@/components/recipes/RecipeCard';
import RecipeDetailModal from '@/components/recipes/RecipeDetailModal';
import CookingMode from '@/components/cooking/CookingMode';
import { Recipe, AISuggestionResponse } from '@/types/recipe';
import { getAISuggestions, AISuggestionRequest } from '@/services/ingredientService';
import { useRouter } from 'next/navigation';

function CookingPageContent() {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestionResponse | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);

  const handleIngredientsValidated = async (validIngredients: string[]) => {
    if (validIngredients.length === 0) {
      alert('Please add at least one ingredient');
      return;
    }

    if (validIngredients.length > 5) {
      alert('Maximum 5 ingredients allowed');
      return;
    }

    setIngredients(validIngredients);
    await fetchSuggestions(validIngredients);
  };

  const fetchSuggestions = async (ingredientsList: string[], recipeCount: number = 3) => {
    setIsLoading(true);
    setError(null);

    try {
      const request: AISuggestionRequest = {
        ingredients: ingredientsList,
        recipe_count: recipeCount
      };

      const response = await getAISuggestions(request);
      setSuggestions(response);

      if (response.suggestions.length === 0) {
        setError('No recipes found. Try different ingredients.');
      }
    } catch (err) {
      console.error('Failed to get AI suggestions:', err);
      setError(err instanceof Error ? err.message : 'Failed to get recipe suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecipeClick = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setIsModalOpen(true);
  };

  const handleStartCooking = (recipe: Recipe) => {
    setCookingRecipe(recipe);
    setIsModalOpen(false);
  };

  const handleCookingComplete = async (rating: number) => {
    if (!cookingRecipe) return;
    
    try {
      const { startCooking, completeCooking } = await import('@/services/cookingService');
      
      const session = await startCooking({
        recipe_id: cookingRecipe.recipe_id
      });
      
      await completeCooking({
        session_id: session.session_id,
        rating: rating
      });
      
      setCookingRecipe(null);
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to save cooking session:', error);
      setCookingRecipe(null);
      router.push('/dashboard');
    }
  };

  const handleCookingCancel = () => {
    setCookingRecipe(null);
  };

  const handleReset = () => {
    setIngredients([]);
    setSuggestions(null);
    setError(null);
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Instructions */}
            <div className="hidden lg:block lg:col-span-3">
              <div className="sticky top-20 space-y-4">
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <h3 className="font-semibold text-gray-900 text-sm mb-3">How it works</h3>
                  <ol className="space-y-2 text-xs text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <span>Enter your ingredients</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <span>AI finds matching recipes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                      <span>Choose & start cooking</span>
                    </li>
                  </ol>
                </div>

                <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-sm p-4 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h3 className="font-semibold text-sm">AI Powered</h3>
                  </div>
                  <p className="text-xs text-blue-50">
                    Our AI understands typos and finds the best recipes for your ingredients!
                  </p>
                </div>
              </div>
            </div>

            {/* Center - Main Content */}
            <div className="lg:col-span-9">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Find Recipes</h1>
                <p className="text-gray-600 mt-1">Enter your ingredients and let AI suggest recipes</p>
              </div>

              {/* Ingredient Input Section */}
              {!suggestions && (
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                  <IngredientBatchValidator onValidated={handleIngredientsValidated} />
                </div>
              )}

              {/* Selected Ingredients Display */}
              {ingredients.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-sm">Your Ingredients ({ingredients.length})</h3>
                    <button
                      onClick={handleReset}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Change
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ingredients.map((ingredient, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-800 border border-green-300"
                      >
                        {ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="bg-white rounded-lg shadow-sm p-12">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                      <svg className="animate-spin h-16 w-16 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Finding recipes...
                      </h3>
                      <p className="text-sm text-gray-600">
                        AI is analyzing your ingredients
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && !isLoading && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <div className="flex items-start">
                    <svg className="h-6 w-6 text-red-600 mt-0.5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-red-900 mb-2">Error</h3>
                      <p className="text-sm text-red-700 mb-4">{error}</p>
                      <button
                        onClick={handleReset}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Recipe Suggestions */}
              {suggestions && !isLoading && !error && (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm mb-1">
                          Found {suggestions.suggestions.length} recipes
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-gray-700">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            📚 {suggestions.stats.from_database} from database
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                            🤖 {suggestions.stats.from_ai} AI generated
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recipe Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {suggestions.suggestions.map((recipe) => (
                      <RecipeCard
                        key={recipe.recipe_id}
                        recipe={recipe}
                        onClick={() => handleRecipeClick(recipe)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recipe Detail Modal */}
      <RecipeDetailModal
        recipe={selectedRecipe}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStartCooking={handleStartCooking}
      />

      {/* Cooking Mode */}
      {cookingRecipe && (
        <CookingMode
          recipe={cookingRecipe}
          onComplete={handleCookingComplete}
          onCancel={handleCookingCancel}
        />
      )}
    </>
  );
}

export default function CookingPage() {
  return (
    <ProtectedRoute>
      <CookingPageContent />
    </ProtectedRoute>
  );
}
