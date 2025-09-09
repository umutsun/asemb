'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { ConfigProvider } from '@/contexts/ConfigContext';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    const token = localStorage.getItem('asb_token');
    const userData = localStorage.getItem('asb_user');
    
    if (!token || !userData) {
      router.push('/login');
      return;
    }

    try {
      setUser(JSON.parse(userData));
    } catch (error) {
      console.error('Failed to parse user data:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear localStorage
    localStorage.removeItem('asb_token');
    localStorage.removeItem('asb_user');
    
    // Clear cookie
    document.cookie = 'asb_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-2 text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <ConfigProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header user={user || undefined} onLogout={handleLogout} />
        <main className="container mx-auto px-4">
          {children}
        </main>
      </div>
    </ConfigProvider>
  );
}