'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import useAuthStore from '@/stores/auth.store';
import apiClient from '@/lib/api/client';

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, token, refreshAuth } = useAuthStore();

  useEffect(() => {
    // Set token in API client on mount
    if (token) {
      apiClient.setToken(token);
    }

    // Check auth status on mount
    const checkAuth = async () => {
      if (token && !isAuthenticated) {
        try {
          await refreshAuth();
        } catch (error) {
          console.error('Failed to refresh auth:', error);
          router.push('/login');
        }
      }
    };

    checkAuth();
  }, [token, isAuthenticated, refreshAuth, router]);

  useEffect(() => {
    // Redirect to login if not authenticated and on protected route
    if (!isAuthenticated && !PUBLIC_ROUTES.includes(pathname)) {
      router.push('/login');
    }
  }, [isAuthenticated, pathname, router]);

  // Setup token refresh interval
  useEffect(() => {
    if (!token) return;

    // Refresh token every 15 minutes
    const interval = setInterval(async () => {
      try {
        await refreshAuth();
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token, refreshAuth]);

  return <>{children}</>;
}