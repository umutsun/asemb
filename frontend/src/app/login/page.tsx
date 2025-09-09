'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Brain, Lock, Mail, Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login attempt:', { email, password });
    setLoading(true);
    setError('');

    try {
      // For demo purposes, using hardcoded credentials
      // In production, this should validate against a real auth backend
      if (email === 'admin@asb.com' && password === 'admin123') {
        console.log('Login successful');
        
        // Store auth token in both localStorage and cookie
        const token = 'demo-token-' + Date.now();
        localStorage.setItem('asb_token', token);
        localStorage.setItem('asb_user', JSON.stringify({
          id: '1',
          name: 'Admin',
          email: email,
          role: 'admin'
        }));
        
        // Set cookie for middleware
        document.cookie = `asb_token=${token}; path=/; max-age=86400`; // 24 hours
        
        console.log('Redirecting to dashboard...');
        // Add small delay to ensure cookie is set
        setTimeout(() => {
          router.push('/dashboard');
        }, 100);
      } else {
        console.log('Invalid credentials');
        setError('Geçersiz email veya şifre');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Giriş işlemi başarısız oldu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
            <Brain className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            Alice Semantic Bridge
          </h1>
          <p className="text-muted-foreground mt-2">Intelligent RAG System Dashboard</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Giriş Yap</CardTitle>
            <CardDescription>
              Dashboard'a erişmek için giriş yapın
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@asb.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : (
                  'Giriş Yap'
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                <p>Demo Kullanıcı:</p>
                <p>Email: admin@asb.com</p>
                <p>Şifre: admin123</p>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t text-center">
              <Link href="/" className="text-sm text-primary hover:underline">
                Ana Sayfaya Dön
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}