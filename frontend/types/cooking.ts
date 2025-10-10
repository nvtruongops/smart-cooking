/**
 * Cooking history and rating types synchronized with backend (lambda/shared/types.ts)
 */

import { Recipe } from './recipe';

export interface CookingHistory {
  session_id: string;
  user_id: string;
  recipe_id: string;
  recipe_title?: string;
  status: 'cooking' | 'completed' | 'abandoned';
  started_at: string;
  completed_at?: string;
  abandoned_at?: string;
  cooking_duration_minutes?: number;
  rating?: number;
  review?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CookingHistoryWithRecipe extends CookingHistory {
  recipe?: Recipe;
  is_favorite?: boolean;
  personal_rating?: number;
  personal_notes?: string;
  cook_date?: string;
  history_id?: string;
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
  session_id: string;
  rating?: number;
  review?: string;
  is_favorite?: boolean;
}

// UI Helper functions
export function getStatusLabel(status: 'cooking' | 'completed' | 'abandoned'): string {
  if (status === 'cooking') return 'Đang nấu';
  if (status === 'abandoned') return 'Đã hủy';
  return 'Hoàn thành';
}

export function getStatusColor(status: 'cooking' | 'completed' | 'abandoned'): string {
  if (status === 'cooking') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  if (status === 'abandoned') return 'bg-gray-100 text-gray-800 border-gray-300';
  return 'bg-green-100 text-green-800 border-green-300';
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
