# 🎯 Claude Code - Current Task

## 🚀 Active Task: RAG Chatbot Interface

### 📋 Task Details
- **ID**: UI-CHAT-001
- **Priority**: HIGH
- **Deadline**: September 17, 2025
- **Status**: In Progress

### 🔄 Current Subtask: Setup Next.js 14 project structure

```bash
# Step 1: Create frontend directory
cd C:\xampp\htdocs\alice-semantic-bridge
mkdir frontend

# Step 2: Initialize Next.js
cd frontend
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"

# Step 3: Install shadcn/ui
npx shadcn-ui@latest init

# Step 4: Add essential components
npx shadcn-ui@latest add button card input label textarea scroll-area avatar badge dialog toast
```

### 📦 Dependencies to Install

```bash
# Core dependencies
npm install zustand @tanstack/react-query axios socket.io-client

# Chat UI dependencies  
npm install react-markdown remark-gfm react-syntax-highlighter
npm install @types/react-syntax-highlighter

# Utilities
npm install date-fns react-hot-toast react-intersection-observer
npm install react-hook-form @hookform/resolvers zod

# Development
npm install -D @types/react-markdown
```

### 🏗️ Project Structure to Create

```
frontend/
├── src/
│   ├── app/
│   │   ├── (chat)/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── api/
│   │   │   ├── chat/
│   │   │   │   └── route.ts
│   │   │   └── search/
│   │   │       └── route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/           # shadcn/ui components
│   │   ├── chat/
│   │   │   ├── chat-container.tsx
│   │   │   ├── message-list.tsx
│   │   │   ├── message-item.tsx
│   │   │   ├── chat-input.tsx
│   │   │   ├── typing-indicator.tsx
│   │   │   └── source-citation.tsx
│   │   └── layout/
│   │       ├── header.tsx
│   │       └── sidebar.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   └── chat-client.ts
│   │   ├── hooks/
│   │   │   ├── use-chat.ts
│   │   │   └── use-socket.ts
│   │   ├── store/
│   │   │   └── chat-store.ts
│   │   └── utils/
│   │       ├── cn.ts
│   │       └── format.ts
│   └── types/
│       ├── chat.ts
│       └── api.ts
```

### 🎨 Component Templates

#### 1. Chat Container Component
```typescript
// src/components/chat/chat-container.tsx
'use client';

import { useState } from 'react';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { useChat } from '@/lib/hooks/use-chat';

export function ChatContainer() {
  const { messages, sendMessage, isLoading } = useChat();
  
  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      <MessageList messages={messages} isLoading={isLoading} />
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}
```

#### 2. Message Item Component
```typescript
// src/components/chat/message-item.tsx
import { cn } from '@/lib/utils/cn';
import ReactMarkdown from 'react-markdown';
import { SourceCitation } from './source-citation';

interface MessageItemProps {
  message: {
    role: 'user' | 'assistant';
    content: string;
    sources?: Array<{ title: string; url: string; }>;
  };
}

export function MessageItem({ message }: MessageItemProps) {
  return (
    <div className={cn(
      'flex gap-3 p-4',
      message.role === 'user' ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'rounded-lg px-4 py-2 max-w-[80%]',
        message.role === 'user' 
          ? 'bg-blue-500 text-white' 
          : 'bg-gray-100 text-gray-900'
      )}>
        <ReactMarkdown>{message.content}</ReactMarkdown>
        {message.sources && <SourceCitation sources={message.sources} />}
      </div>
    </div>
  );
}
```

### 🔧 API Route Template

```typescript
// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message, conversationId } = await request.json();
    
    // Call backend API
    const response = await fetch('http://localhost:8080/api/v2/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId })
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Chat API error' },
      { status: 500 }
    );
  }
}
```

### 📝 Next Steps

1. **Initialize Project** ✅
2. **Setup Components** 🔄
3. **Create Chat Store**
4. **API Integration**
5. **WebSocket Setup**
6. **Testing**

### 💬 Communication

Updates will be pushed to Redis:
- Channel: `asb:claude:status`
- Progress: `asb:frontend:progress`
- Blockers: `asb:frontend:blockers`

---

**Current Status**: Setting up Next.js project structure
**Next Action**: Create chat components
**ETA**: 2 days for basic chat UI
