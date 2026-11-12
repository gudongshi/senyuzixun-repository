import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('❌ ErrorBoundary 捕获到渲染错误:', error.message);
    console.error('📚 组件堆栈:', info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-red-50 border border-red-200 rounded-xl text-center">
          <p className="text-red-600 font-medium mb-2">⚠️ 组件渲染异常</p>
          <p className="text-red-500 text-sm mb-1">{this.state.error?.message}</p>
          <p className="text-slate-400 text-xs">
            {this.props.fallbackLabel || '周报'}组件加载失败，请刷新页面或联系管理员
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}