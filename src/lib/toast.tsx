import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type ToastType = 'error' | 'success';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-xl border backdrop-blur-sm animate-slide-in ${
                toast.type === 'error'
                  ? 'bg-red-950/90 border-red-800/60 text-red-200'
                  : 'bg-emerald-950/90 border-emerald-800/60 text-emerald-200'
              }`}
            >
              {toast.type === 'error' ? (
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
              ) : (
                <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
              )}
              <p className="text-sm flex-1">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
