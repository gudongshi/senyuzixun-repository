import { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';

// ============================================================
// 类型
// ============================================================
interface OfficePreviewModalProps {
  source: 'kb' | 'my-files';
  docId: number;
  fileName: string;
  onClose: () => void;
}

// ============================================================
// 组件：Office 文档在线预览弹窗
// ============================================================
export default function OfficePreviewModal({ source, docId, fileName, onClose }: OfficePreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const resp = await fetch(`/api/office-preview/${source}/${docId}`);
        const json = await resp.json();
        if (cancelled) return;
        if (json.success) {
          setHtml(json.html || '');
        } else {
          setError(json.error || '预览失败');
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || '网络错误');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [source, docId]);

  // 键盘关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 头部 ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h3 className="text-sm font-bold text-slate-800 truncate max-w-[80%]" title={fileName}>
            📄 {fileName}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── 内容 ── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-slate-300" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-3 px-4">
              <AlertTriangle size={40} className="text-red-300" />
              <p className="text-sm text-center">{error}</p>
            </div>
          ) : (
            <div
              className="office-preview-content p-6"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>

      {/* ── 注入预览样式 ── */}
      <style>{`
        .office-preview-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
          font-size: 14px;
          line-height: 1.8;
          color: #1e293b;
        }
        .office-preview-content h1, .office-preview-content h2, .office-preview-content h3 {
          margin-top: 1.2em;
          margin-bottom: 0.5em;
          font-weight: 600;
        }
        .office-preview-content h1 { font-size: 1.5em; }
        .office-preview-content h2 { font-size: 1.25em; }
        .office-preview-content h3 { font-size: 1.1em; }
        .office-preview-content p {
          margin: 0.4em 0;
        }
        .office-preview-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.8em 0;
          font-size: 13px;
        }
        .office-preview-content table th,
        .office-preview-content table td {
          border: 1px solid #d1d5db;
          padding: 6px 10px;
          text-align: left;
          vertical-align: top;
        }
        .office-preview-content table th {
          background: #f1f5f9;
          font-weight: 600;
          white-space: nowrap;
        }
        .office-preview-content table tr:nth-child(even) td {
          background: #f8fafc;
        }
        .office-preview-content table tr:hover td {
          background: #e0f2fe;
        }
        .office-preview-content ul, .office-preview-content ol {
          margin: 0.4em 0;
          padding-left: 1.5em;
        }
        .office-preview-content img {
          max-width: 100%;
          height: auto;
        }
        .office-preview-content blockquote {
          border-left: 3px solid #93c5fd;
          padding-left: 1em;
          margin: 0.5em 0;
          color: #64748b;
        }
        .office-preview-content .xlsx-sheet-title {
          margin-top: 1.5em;
          margin-bottom: 0.4em;
          padding: 4px 0;
          border-bottom: 2px solid #3b82f6;
          color: #1e40af;
          font-size: 1.05em;
        }
        .office-preview-content .xlsx-sheet-title:first-child {
          margin-top: 0;
        }
      `}</style>
    </div>
  );
}