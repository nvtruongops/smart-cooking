'use client';

import React from 'react';
import { Recipe, getCookingMethodLabel, getCookingMethodColor, formatTime, getTotalTime } from '@/types/recipe';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
}

export default function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  const totalTime = getTotalTime(recipe);
  const source = recipe.is_ai_generated ? 'ai' : 'database';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow cursor-pointer overflow-hidden"
    >
      {/* Recipe Image */}
      <div className="relative h-48 bg-gradient-to-br from-blue-100 to-green-100">
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="h-20 w-20 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
        )}

        {/* Source Badge */}
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            source === 'ai'
              ? 'bg-purple-100 text-purple-800 border border-purple-300'
              : 'bg-blue-100 text-blue-800 border border-blue-300'
          }`}>
            {source === 'ai' ? '🤖 AI' : '📚 DB'}
          </span>
        </div>

        {/* Rating Badge */}
        {recipe.average_rating && recipe.average_rating > 0 && (
          <div className="absolute top-2 left-2 bg-white bg-opacity-90 px-2 py-1 rounded-full flex items-center space-x-1">
            <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">
              {recipe.average_rating.toFixed(1)}
            </span>
            {recipe.rating_count && recipe.rating_count > 0 && (
              <span className="text-xs text-gray-500">
                ({recipe.rating_count})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Recipe Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {recipe.title}
        </h3>

        {/* Description */}
        {recipe.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {recipe.description}
          </p>
        )}

        {/* Cooking Method Badge */}
        <div className="mb-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getCookingMethodColor(recipe.cooking_method)}`}>
            {getCookingMethodLabel(recipe.cooking_method)}
          </span>
        </div>

        {/* Recipe Info */}
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center space-x-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatTime(totalTime)}</span>
          </div>

          <div className="flex items-center space-x-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>{recipe.servings} người</span>
          </div>

          <div className="flex items-center space-x-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>{recipe.ingredients.length} nguyên liệu</span>
          </div>
        </div>

        {/* Nutrition Info (if available) */}
        {recipe.nutritional_info?.calories && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span className="font-medium">Calories:</span>
              <span>{recipe.nutritional_info.calories} kcal</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
