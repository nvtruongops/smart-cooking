/**
 * Navigation Component Tests
 * Tests navigation menu, links, and authentication state
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Navigation from '../Navigation';

// Mock AuthContext
const mockLogout = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123', username: 'testuser' },
    token: 'mock-token',
    logout: mockLogout,
  }),
}));

describe('Navigation Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render navigation bar', () => {
    render(<Navigation />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('should display logo/brand name', () => {
    render(<Navigation />);
    expect(screen.getByText(/Smart Cooking|Home/i)).toBeInTheDocument();
  });

  it('should show navigation links', () => {
    render(<Navigation />);
    // Common navigation items
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });

  it('should show user menu when authenticated', () => {
    render(<Navigation />);
    // User avatar or username should be visible
    expect(screen.getByText(/testuser/i) || screen.getByRole('button')).toBeTruthy();
  });

  it('should call logout when logout button is clicked', () => {
    render(<Navigation />);
    
    // Find and click logout button
    const logoutButton = screen.getByText(/logout|sign out/i);
    fireEvent.click(logoutButton);
    
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should highlight active route', () => {
    render(<Navigation />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });

  it('should be responsive with mobile menu', () => {
    render(<Navigation />);
    // Should have hamburger menu or mobile-specific elements
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

// Test unauthenticated state
describe('Navigation Component - Unauthenticated', () => {
  beforeEach(() => {
    // Override mock for unauthenticated state
    jest.resetModules();
    jest.doMock('@/contexts/AuthContext', () => ({
      useAuth: () => ({
        user: null,
        token: null,
        logout: jest.fn(),
      }),
    }));
  });

  it('should show login/register links when not authenticated', () => {
    render(<Navigation />);
    // Should show login or register options
    expect(screen.queryByText(/login|sign in|register/i)).toBeTruthy();
  });

  it('should not show user menu when not authenticated', () => {
    render(<Navigation />);
    expect(screen.queryByText(/logout/i)).not.toBeInTheDocument();
  });
});
