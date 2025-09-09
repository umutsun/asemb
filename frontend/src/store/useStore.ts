import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
  context?: string[];
  isTyping?: boolean;
}

interface SystemStatus {
  database: boolean;
  redis: boolean;
  semantic: boolean;
  n8n: boolean;
  responseTime: number;
}

interface DashboardStats {
  database: {
    documents: number;
    conversations: number;
    messages: number;
    size: string;
    embeddings?: number;
    vectors?: number;
  };
  redis: {
    connected: boolean;
    used_memory: string;
    total_commands_processed: number;
    cached_embeddings?: number;
  };
  lightrag: {
    initialized: boolean;
    documentCount: number;
    lastUpdate: string;
    nodeCount?: number;
    edgeCount?: number;
    communities?: number;
  };
  rag: {
    totalChunks?: number;
    avgChunkSize?: number;
    indexStatus?: string;
    lastIndexTime?: string;
  };
  recentActivity: Array<{
    id: string;
    title: string;
    message_count: number;
    created_at: string;
  }>;
}

interface AppStore {
  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  
  // Command Palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  
  // Messages
  messages: Message[];
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  
  // System Status
  systemStatus: SystemStatus;
  updateSystemStatus: (status: Partial<SystemStatus>) => void;
  
  // Dashboard Stats
  dashboardStats: DashboardStats | null;
  setDashboardStats: (stats: DashboardStats) => void;
  
  // Active Context
  activeContext: string[];
  setActiveContext: (context: string[]) => void;
  addContext: (context: string) => void;
  removeContext: (context: string) => void;
  
  // Loading States
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  
  // Query States
  queryText: string;
  setQueryText: (text: string) => void;
  queryMode: 'simple' | 'hybrid' | 'graph';
  setQueryMode: (mode: 'simple' | 'hybrid' | 'graph') => void;
  queryResult: any;
  setQueryResult: (result: any) => void;
  
  // Notifications
  notifications: Array<{ id: string; type: 'success' | 'error' | 'info'; message: string; timestamp: Date }>;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      
      // Command Palette
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      
      // Messages
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: '👋 Merhaba! Ben Alice, AI destekli asistanınızım. Size nasıl yardımcı olabilirim?',
          timestamp: new Date(),
        }
      ],
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      clearMessages: () => set({ 
        messages: [
          {
            id: '1',
            role: 'assistant',
            content: '👋 Merhaba! Ben Alice, AI destekli asistanınızım. Size nasıl yardımcı olabilirim?',
            timestamp: new Date(),
          }
        ] 
      }),
      updateMessage: (id, updates) => set((state) => ({
        messages: state.messages.map(msg => msg.id === id ? { ...msg, ...updates } : msg)
      })),
      
      // System Status
      systemStatus: {
        database: true,
        redis: true,
        semantic: true,
        n8n: true,
        responseTime: 1200, // in milliseconds
      },
      updateSystemStatus: (status) => set((state) => ({
        systemStatus: { ...state.systemStatus, ...status }
      })),
      
      // Dashboard Stats
      dashboardStats: null,
      setDashboardStats: (stats) => set({ dashboardStats: stats }),
      
      // Active Context
      activeContext: [],
      setActiveContext: (context) => set({ activeContext: context }),
      addContext: (context) => set((state) => ({
        activeContext: [...state.activeContext, context]
      })),
      removeContext: (context) => set((state) => ({
        activeContext: state.activeContext.filter(c => c !== context)
      })),
      
      // Loading States
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
      
      // Query States
      queryText: '',
      setQueryText: (text) => set({ queryText: text }),
      queryMode: 'hybrid',
      setQueryMode: (mode) => set({ queryMode: mode }),
      queryResult: null,
      setQueryResult: (result) => set({ queryResult: result }),
      
      // Notifications
      notifications: [],
      addNotification: (type, message) => {
        const id = Date.now().toString();
        set((state) => ({
          notifications: [...state.notifications, { id, type, message, timestamp: new Date() }]
        }));
        // Auto-remove after 5 seconds
        setTimeout(() => {
          get().removeNotification(id);
        }, 5000);
      },
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),
      clearNotifications: () => set({ notifications: [] }),
    }),
    {
      name: 'alice-semantic-bridge-storage',
      partialize: (state) => ({ 
        theme: state.theme,
        messages: state.messages,
        activeContext: state.activeContext,
      }),
    }
  )
);