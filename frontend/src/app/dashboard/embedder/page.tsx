'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function EmbedderPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/dashboard/embeddings');
  }, [router]);


  return null;
}