# 🎯 Claude Code - Frontend Chat Integration Tasks

## 📋 Current Task: Connect RAG Chat to Backend

### 🔧 Step 1: Update Environment Variables

Create `.env.local` file in frontend directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

### 📝 Step 2: Create API Client

Create `frontend/src/lib/api/chat-client.ts`:
```typescript
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const chatApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    id: string;
    title: string;
    excerpt: string;
    sourceTable: string;
    score: number;
  }>;
  timestamp: Date;
}

export interface ChatResponse {
  response: string;
  sources: Array<{
    id: string;
    title: string;
    excerpt: string;
    sourceTable: string;
    score: number;
  }>;
  conversationId: string;
}

export const chatService = {
  sendMessage: async (message: string, conversationId?: string): Promise<ChatResponse> => {
    const response = await chatApi.post('/api/v2/chat', {
      message,
      conversationId,
      userId: 'demo-user'
    });
    return response.data;
  },

  getConversations: async () => {
    const response = await chatApi.get('/api/v2/chat/conversations?userId=demo-user');
    return response.data;
  },

  getConversation: async (conversationId: string) => {
    const response = await chatApi.get(`/api/v2/chat/conversation/${conversationId}`);
    return response.data;
  },

  searchDocuments: async (query: string) => {
    const response = await chatApi.post('/api/v2/search/hybrid', {
      query,
      limit: 5
    });
    return response.data;
  }
};
```

### 🎨 Step 3: Update Chat Component

Update `frontend/src/components/chat/rag-chat.tsx`:
```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, User, Bot, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatService, ChatMessage as ChatMsg } from '@/lib/api/chat-client';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

export function RAGChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatService.sendMessage(input, conversationId);
      
      const assistantMessage: ChatMsg = {
        id: Date.now().toString() + '-ai',
        role: 'assistant',
        content: response.response,
        sources: response.sources,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setConversationId(response.conversationId);
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: 'Hata',
        description: 'Mesaj gönderilemedi. Lütfen tekrar deneyin.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderSources = (sources: ChatMsg['sources']) => {
    if (!sources || sources.length === 0) return null;

    return (
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Kaynaklar:
        </p>
        <div className="space-y-1">
          {sources.map((source, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <FileText className="h-3 w-3 mt-0.5 text-gray-400" />
              <div className="flex-1">
                <span className="font-medium">{source.title}</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {source.sourceTable}
                </Badge>
                <Badge variant="secondary" className="ml-1 text-xs">
                  %{source.score}
                </Badge>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                  {source.excerpt}...
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="flex flex-col h-[700px] max-w-5xl mx-auto">
      <div className="p-4 border-b">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" />
          RAG Hukuk Asistanı
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Türkçe hukuki dokümanlarda arama yapın ve sorularınızı sorun
        </p>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {messages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Bot className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Merhaba! Size nasıl yardımcı olabilirim?</p>
            <div className="mt-4 space-y-2">
              <p className="text-sm">Örnek sorular:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput('ÖZELGE nedir?')}
                >
                  ÖZELGE nedir?
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput('KDV oranları nelerdir?')}
                >
                  KDV oranları nelerdir?
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInput('Elektrik faturası vergileri')}
                >
                  Elektrik faturası vergileri
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`flex gap-3 max-w-[85%] ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={`rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                    {message.content}
                  </ReactMarkdown>
                  {message.sources && renderSources(message.sources)}
                  <p
                    className={`text-xs mt-2 ${
                      message.role === 'user'
                        ? 'text-blue-100'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {format(message.timestamp, 'HH:mm')}
                  </p>
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Sorunuzu yazın..."
            className="flex-1 min-h-[80px] max-h-[200px] resize-none"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="lg"
            disabled={!input.trim() || isLoading}
            className="px-4"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
```

### 🎯 Step 4: Create Main Chat Page

Create `frontend/src/app/chat/page.tsx`:
```typescript
import { RAGChat } from '@/components/chat/rag-chat';
import { SemanticSearch } from '@/components/search/semantic-search';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ChatPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold text-center mb-8">
        Alice Semantic Bridge - RAG System
      </h1>
      
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
          <TabsTrigger value="chat">💬 Sohbet</TabsTrigger>
          <TabsTrigger value="search">🔍 Arama</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat" className="mt-6">
          <RAGChat />
        </TabsContent>
        
        <TabsContent value="search" className="mt-6">
          <SemanticSearch />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 📦 Step 5: Install Dependencies

```bash
cd frontend
npm install axios react-markdown remark-gfm date-fns
npm install @types/react-markdown --save-dev
```

### ✅ Checklist

- [ ] Create `.env.local` with API URL
- [ ] Create chat API client
- [ ] Update RAG chat component
- [ ] Create main chat page
- [ ] Install dependencies
- [ ] Test chat functionality
- [ ] Test search functionality
- [ ] Add error handling
- [ ] Add loading states
- [ ] Test with real data
