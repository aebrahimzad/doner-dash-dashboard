import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface EBState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React Error Boundary caught:', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#000',
          color: '#fff', padding: '2rem', overflowY: 'auto',
          fontFamily: 'monospace', fontSize: '14px', lineHeight: '1.6',
        }}>
          <div style={{ color: '#f87171', fontSize: '20px', fontWeight: 'bold', marginBottom: '1rem' }}>
            CRASH: {error.message}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#fca5a5' }}>
            {error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
