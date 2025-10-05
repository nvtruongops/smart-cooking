/**
 * Cooking history and rating types synchronized with backend (lambda/shared/types.ts)
 */

import { Recipe } from './recipe';

export interface CookingHistory {
  history_id: string;
  user_id: string;
  recipe_id: string;
  suggestion_id?: string;
  status: 'cooking' | 'completed';
  personal_rating?: number;
  personal_notes?: string;
  is_favorite?: boolean;
  cook_date?: string;
  created_at: string;
  updated_at: string;
}

export interface CookingHistoryWithRecipe extends CookingHistory {
  recipe?: Recipe;
}

export interface RecipeRating {
  rating_id: string;
  recipe_id: string;
  user_id: string;
  history_id?: string;
  rating: number; // 1-5
  comment?: string;
  is_verified_cook: boolean;
  created_at: string;
  updated_at: string;
}

export interface RatingRequest {
  recipe_id: string;
  rating: number; // 1-5
  comment?: string;
  history_id?: string;
}

export interface RatingResponse {
  success: boolean;
  average_rating: number;
  rating_count: number;
  auto_approved: boolean;
  message: string;
}

export interface StartCookingRequest {
  recipe_id: string;
  suggestion_id?: string;
}

export interface CompleteCookingRequest {
  history_id: string;
  personal_rating?: number;
  personal_notes?: string;
  is_favorite?: boolean;
}

// UI Helper functions
export function getStatusLabel(status: 'cooking' | 'completed'): string {
  return status === 'cooking' ? 'Đang nấu' : 'Hoàn thành';
}

export function getStatusColor(status: 'cooking' | 'completed'): string {
  return status === 'cooking'
    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
    : 'bg-green-100 text-green-800 border-green-300';
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Vừa xong';
  } else if (diffMins < 60) {
    return `${diffMins} phút trước`;
  } else if (diffHours < 24) {
    return `${diffHours} giờ trước`;
  } else if (diffDays === 1) {
    return 'Hôm qua';
  } else if (diffDays < 7) {
    return `${diffDays} ngày trước`;
  } else {
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
}
