import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl p-10 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl">⚠️</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">发现异常冲突</h1>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                系统检测到渲染逻辑冲突或数据断层。
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl text-left">
               <p className="text-[10px] font-mono text-slate-400 uppercase font-bold mb-1">错误诊断:</p>
               <p className="text-[11px] font-mono text-rose-600 line-clamp-2 italic">
                 {this.state.error?.message || '未知渲染异常'}
               </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95"
            >
              尝试自动修复
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
