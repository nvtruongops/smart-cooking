/**
 * ProtectedRoute Component Tests
 * Tests authentication and route protection
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProtectedRoute from '../ProtectedRoute';

// Mock AuthContext
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('ProtectedRoute Component - Authenticated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock authenticated state
    jest.doMock('@/contexts/AuthContext', () => ({
      useAuth: () => ({
        user: { id: 'user-123', username: 'testuser' },
        token: 'mock-token',
        loading: false,
      }),
    }));
  });

  it('should render children when user is authenticated', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});

describe('ProtectedRoute Component - Unauthenticated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock unauthenticated state
    jest.doMock('@/contexts/AuthContext', () => ({
      useAuth: () => ({
        user: null,
        token: null,
        loading: false,
      }),
    }));
  });

  it('should redirect to login when user is not authenticated', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );
    
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('should not render children when user is not authenticated', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );
    
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});

describe('ProtectedRoute Component - Loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock loading state
    jest.doMock('@/contexts/AuthContext', () => ({
      useAuth: () => ({
        user: null,
        token: null,
        loading: true,
      }),
    }));
  });

  it('should show loading state while checking authentication', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );
    
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
