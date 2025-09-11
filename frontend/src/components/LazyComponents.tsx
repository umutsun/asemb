import dynamic from 'next/dynamic';

// Lazy load heavy components
export const Dashboard = dynamic(() => import('./Dashboard'), {
  loading: () => <div>Loading Dashboard...</div>,
  ssr: false,
});

export const ChatInterface = dynamic(() => import('./ChatInterface'), {
  loading: () => <div>Loading Chat...</div>,
  ssr: false,
});

export const Analytics = dynamic(() => import('./Analytics'), {
  loading: () => <div>Loading Analytics...</div>,
  ssr: false,
});

export const Settings = dynamic(() => import('./Settings'), {
  loading: () => <div>Loading Settings...</div>,
  ssr: false,
});

// Lazy load modals
export const AuthModal = dynamic(() => import('./modals/AuthModal'), {
  loading: () => null,
  ssr: false,
});

export const ConfirmDialog = dynamic(() => import('./modals/ConfirmDialog'), {
  loading: () => null,
  ssr: false,
});