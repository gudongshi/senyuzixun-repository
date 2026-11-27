import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, Copy, Check } from 'lucide-react';

// ============================================================
// v16.9: 通用 OCR 组件 — 拖拽上传 → 后端 AI 识别 → 结果展示
//
// Props:
//   title       页面标题
//   prompt      发送给 AI 的提取指令
//   accept      可选，限制文件类型（默认图片+PDF）
//   resultTitle 可选，结果区标题（默认"识别结果"）
//
// 工作流：
//   1. 用户拖拽/选择文件 → FormData 上传
//   2. 后端检测 PDF/图片 → 提取文本或 Base64 → 调用 AI
//   3. AI 返回结果 → 填入文本框 + 一键复制
//
// 新建功能只需：
//   <UniversalOcr title="合同识别" prompt="请提取合同中的甲方、乙方、金额..." />
// ============================================================

interface Props {
  title: string;
  prompt: string;
  accept?: Record<string, string[]>;
  resultTitle?: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UniversalOcr({ title, prompt, accept, resultTitle = '识别结果' }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  const defaultAccept = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'application/pdf': ['.pdf'],
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) { setFile(acceptedFiles[0]); setResult(''); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: accept || defaultAccept,
  });

  const handleExtract = async () => {
    if (!file) { toast.error('请先选择文件'); return; }
    setLoading(true);
    setResult('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('prompt', prompt);

      console.log(`🔍 [${title}] 上传:`, file.name, formatSize(file.size));
      const resp = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await resp.json();

      if (json.success && json.data) {
        setResult(json.data.text);
        toast.success('识别完成');
      } else {
        toast.error('识别失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      console.error(`❌ [${title}] 异常:`, err);
      toast.error('异常: ' + (err.message || '网络错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success('已复制');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.getElementById('ocr-result') as HTMLTextAreaElement;
      if (ta) { ta.select(); document.execCommand('copy'); }
    }
  };

  // 根据标题选主题色
  const theme = title.includes('发票') ? 'amber' : 'blue';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className={`size-9 rounded-xl bg-${theme}-50 flex items-center justify-center`}>
            <FileText size={20} className={`text-${theme}-600`} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500 mt-0.5">上传文件 · AI 自动提取</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5 max-w-[1000px]">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
          <div
            {...getRootProps()}
            className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
              isDragActive ? `border-${theme}-400 bg-${theme}-50/50` : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            } ${loading ? 'cursor-wait opacity-60' : ''}`}
          >
            <input {...getInputProps()} disabled={loading} />
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <FileText size={24} className={`text-${theme}-500`} />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
                {!loading && (
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(''); }}
                    className="text-xs text-red-500 hover:text-red-600 underline">移除文件</button>
                )}
              </div>
            ) : isDragActive ? (
              <p className="text-sm font-medium text-slate-600">释放鼠标以上传</p>
            ) : (
              <div>
                <Upload size={24} className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm"><span className={`font-medium text-${theme}-600`}>点击选择</span> 或拖拽文件</p>
                <p className="text-xs text-slate-400 mt-1">支持 JPG / PNG / PDF</p>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={handleExtract} disabled={loading || !file}
              className={`px-5 py-2.5 rounded-xl bg-${theme}-600 text-white text-sm font-medium hover:bg-${theme}-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm`}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> 识别中…</> : <><Upload size={16} /> 开始识别</>}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">{resultTitle}</h2>
            {result && (
              <button onClick={handleCopy}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  copied ? 'bg-green-50 text-green-600 border border-green-200' : `bg-${theme}-50 text-${theme}-600 border border-${theme}-200 hover:bg-${theme}-100`
                }`}>
                {copied ? <><Check size={13} /> 已复制</> : <><Copy size={13} /> 一键复制</>}
              </button>
            )}
          </div>
          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-slate-300" />
                <span className="ml-3 text-sm text-slate-400">AI 正在分析，请稍候...</span>
              </div>
            ) : result ? (
              <textarea id="ocr-result" readOnly
                className="w-full min-h-[280px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 font-mono leading-relaxed focus:outline-none resize-y"
                value={result} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <FileText size={48} className="text-slate-200" />
                <p className="text-sm">上传文件后点击"开始识别"</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}