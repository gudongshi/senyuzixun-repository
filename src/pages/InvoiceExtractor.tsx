import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, Copy, Check } from 'lucide-react';

// ============================================================
// v16.8.2: 财务发票全字段智能识别 — FormData 直传后端解析
// 打印分摊的同款方案：PDF 由后端 pdfjs-dist 提取文本 + AI 识别
// ============================================================

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InvoiceExtractor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  // ── 拖拽上传 ──
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
      setResult('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
  });

  // ── 识别（v16.8: PDF 前端提取文本 / 图片 Base64 发后端）──
  const handleRecognize = async () => {
    if (!selectedFile) { toast.error('请先上传发票文件'); return; }

    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    console.log(`🧾 [发票提取] 开始识别: ${selectedFile.name}, 类型: ${isPdf ? 'PDF' : '图片'}`);

    setRecognizing(true);
    setResult('');

    try {
      // ══ FormData 直传后端（与打印分摊完全一致）══
      const fd = new FormData();
      fd.append('file', selectedFile);

      const resp = await fetch('/api/finance/invoice-ocr', {
        method: 'POST',
        body: fd,
      });

      const json = await resp.json();
      if (json.success && json.data) {
        console.log('✅ [发票提取] 识别成功');
        setResult(json.data.text);
        toast.success('发票信息识别成功');
      } else {
        console.error('❌ [发票提取] 识别失败:', json);
        toast.error('识别失败: ' + (json.error || json.message || '未知错误'));
      }
    } catch (err: any) {
      console.error('❌ [发票提取] 异常:', err);
      toast.error('识别异常: ' + (err.message || '网络错误'));
    } finally {
      setRecognizing(false);
    }
  };

  // ── 一键复制 ──
  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success('已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.getElementById('invoice-result') as HTMLTextAreaElement;
      if (ta) { ta.select(); document.execCommand('copy'); toast.success('已复制到剪贴板'); }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* ── 标题 ── */}
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <ReceiptIcon size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">🧾 发票全字段智能识别</h1>
            <p className="text-xs text-slate-500 mt-0.5">上传发票图片/PDF · AI 自动提取全部关键字段</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5 max-w-[1000px]">
        {/* ════════════════════════════════════════════════════ */}
        {/* 上传区 */}
        {/* ════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
          <div
            {...getRootProps()}
            className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragActive ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200 hover:border-amber-300 hover:bg-slate-50'
            } ${recognizing ? 'cursor-wait opacity-60' : ''}`}
          >
            <input {...getInputProps()} disabled={recognizing} />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="size-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                  <FileText size={24} className="text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatSize(selectedFile.size)}</p>
                </div>
                {!recognizing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setResult(''); }}
                    className="text-xs text-red-500 hover:text-red-600 underline"
                  >
                    移除文件
                  </button>
                )}
              </div>
            ) : isDragActive ? (
              <div className="flex flex-col items-center gap-2">
                <div className="size-12 rounded-2xl bg-amber-100 flex items-center justify-center animate-bounce">
                  <Upload size={24} className="text-amber-500" />
                </div>
                <p className="text-sm font-medium text-amber-600">释放鼠标以上传发票</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Upload size={24} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-amber-600">点击选择</span> 或拖拽发票文件
                </p>
                <p className="text-xs text-slate-400">
                  支持 JPG / PNG / PDF · PDF 在前端提取文本后发送 AI 识别
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleRecognize}
              disabled={recognizing || !selectedFile}
              className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium
                         hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all flex items-center gap-2 shadow-sm shadow-amber-200"
            >
              {recognizing ? (
                <><Loader2 size={16} className="animate-spin" /> AI 识别中…</>
              ) : (
                <><Upload size={16} /> 开始识别</>
              )}
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* 识别结果 */}
        {/* ════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText size={16} />
              识别结果
            </h2>
            {result && (
              <button
                onClick={handleCopy}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  copied
                    ? 'bg-green-50 text-green-600 border border-green-200'
                    : 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                {copied ? <><Check size={13} /> 已复制</> : <><Copy size={13} /> 一键复制</>}
              </button>
            )}
          </div>

          <div className="p-5">
            {recognizing ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-amber-300" />
                <span className="ml-3 text-sm text-slate-400">AI 正在分析发票，请稍候...</span>
              </div>
            ) : result ? (
              <textarea
                id="invoice-result"
                readOnly
                className="w-full min-h-[280px] bg-slate-50 border border-slate-200 rounded-xl p-4
                           text-sm text-slate-700 font-mono leading-relaxed
                           focus:outline-none resize-y"
                value={result}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <FileText size={48} className="text-slate-200" />
                <p className="text-sm">上传发票后点击"开始识别"，结果将显示在此处</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 内联图标组件
function ReceiptIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}