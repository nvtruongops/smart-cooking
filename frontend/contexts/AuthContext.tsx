'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, UserAttributes } from '@/lib/auth';
import { CognitoUserSession } from 'amazon-cognito-identity-js';

interface AuthContextType {
  user: UserAttributes | null;
  session: CognitoUserSession | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAttributes | null>(null);
  const [session, setSession] = useState<CognitoUserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const currentSession = await authService.getCurrentSession();
      const currentUser = await authService.getCurrentUserAttributes();
      setSession(currentSession);
      setUser(currentUser);
    } catch (error) {
      setSession(null);
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    const session = await authService.signIn({ email, password });
    const user = await authService.getCurrentUserAttributes();
    setSession(session);
    setUser(user);
  };

  const signUp = async (email: string, password: string, name: string) => {
    await authService.signUp({ email, password, name });
  };

  const signOut = async () => {
    await authService.signOut();
    setSession(null);
    setUser(null);
  };

  // Get token from session
  const token = session?.getIdToken().getJwtToken() || null;

  const value = {
    user,
    session,
    token,
    loading,
    signIn,
    signUp,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
