/**
 * Friendship Management Types
 */

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export interface Friendship {
  friendship_id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  requested_at: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FriendRequest {
  addressee_id: string;
  message?: string;
}

export interface AcceptFriendRequest {
  friendship_id: string;
}

export interface RejectFriendRequest {
  friendship_id: string;
  reason?: string;
}

export interface RemoveFriendRequest {
  friendship_id: string;
}

export interface GetFriendsRequest {
  status_filter?: FriendshipStatus;
  limit?: number;
  start_key?: string;
}

export interface FriendProfile {
  user_id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  friendship_status: FriendshipStatus;
  requested_at: string;
  responded_at?: string;
}
