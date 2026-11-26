import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import OfficePreviewModal from '../components/OfficePreviewModal';
import {
  Eye, Trash2, Upload, FileText, Loader2, X,
  FolderOpen, Search, RefreshCw, Download, File,
} from 'lucide-react';

// ============================================================
// 类型
// ============================================================
interface PersonalFile {
  id: number;
  file_name: string;
  file_url: string;
  file_size: number;
  uploader_id: string;
  created_at: string;
}

// ============================================================
// 样式
// ============================================================
const inputClass = 'bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-colors';

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================
// 组件
// ============================================================
export default function MyFiles() {
  const [files, setFiles] = useState<PersonalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // v14.2: Office 文档预览弹窗
  const [officePreview, setOfficePreview] = useState<{ docId: number; fileName: string } | null>(null);

  // ════════════════════════════════════════════════════════
  // 加载
  // ════════════════════════════════════════════════════════
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/my-files');
      const json = await resp.json();
      if (json.success) {
        setFiles(json.data || []);
      } else {
        toast.error('加载失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('网络错误: ' + (err.message || '无法连接服务器'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ════════════════════════════════════════════════════════
  // 拖拽
  // ════════════════════════════════════════════════════════
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) setSelectedFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    // 不限格式
  });

  // ════════════════════════════════════════════════════════
  // 上传
  // ════════════════════════════════════════════════════════
  const handleUpload = async () => {
    if (!selectedFile) { toast.error('请选择文件'); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      // v12.6: 显式传递原始文件名，避免 Content-Disposition 编码导致中文乱码
      formData.append('file_name', selectedFile.name);

      const resp = await fetch('/api/my-files', {
        method: 'POST',
        body: formData,
      });
      const json = await resp.json();
      if (json.success) {
        toast.success('文件上传成功');
        setSelectedFile(null);
        loadFiles();
      } else {
        toast.error('上传失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('上传异常: ' + (err.message || '无法连接服务器'));
    } finally {
      setUploading(false);
    }
  };

  // ════════════════════════════════════════════════════════
  // 删除
  // ════════════════════════════════════════════════════════
  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除该文件吗？')) return;
    try {
      const resp = await fetch(`/api/my-files/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (json.success) {
        toast.success('文件已删除');
        loadFiles();
      } else {
        toast.error('删除失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('删除异常: ' + (err.message || '无法连接服务器'));
    }
  };

  // ════════════════════════════════════════════════════════
  // v14.2: 判断文件是否支持浏览器预览（PDF/图片/文本/Office 文档）
  const isPreviewable = (fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'txt', 'docx', 'xlsx', 'xls'].includes(ext);
  };

  // v14.2: 预览 — PDF/图片/文本用新窗口，Office 文档用弹窗
  // ════════════════════════════════════════════════════════
  const handlePreview = async (file: PersonalFile) => {
    if (!isPreviewable(file.file_name)) {
      toast.error('该格式不支持浏览器预览，请使用"下载"按钮查看');
      return;
    }

    const ext = file.file_name.split('.').pop()?.toLowerCase() || '';
    // Office 文档 → 弹窗预览
    if (['docx', 'xlsx', 'xls'].includes(ext)) {
      setOfficePreview({ docId: file.id, fileName: file.file_name });
      return;
    }

    // PDF/图片/文本 → 新窗口
    try {
      const resp = await fetch(`/api/my-files/${file.id}/preview`);
      const json = await resp.json();
      console.log('🔍 [MyFiles PREVIEW 前端] 后端返回:', JSON.stringify(json));
      if (json.success && json.signedUrl) {
        console.log('🔍 [MyFiles PREVIEW 前端] 即将 window.open:', json.signedUrl);
        window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('预览失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('请求异常: ' + (err.message || '无法连接服务器'));
    }
  };

  // v13.1: 下载（独立函数，不走 isPreviewable，100% 用 signedUrl）
  // ════════════════════════════════════════════════════════
  const handleDownload = async (file: PersonalFile) => {
    try {
      // v13.2: 传 download=1 让后端设定原始中文文件名
      const resp = await fetch(`/api/my-files/${file.id}/preview?download=1`);
      const json = await resp.json();
      console.log('🔍 [MyFiles DOWNLOAD 前端] 后端返回:', JSON.stringify(json));
      if (json.success && json.signedUrl) {
        console.log('🔍 [MyFiles DOWNLOAD 前端] 原始文件名:', file.file_name);
        // v13.2: fetch Blob 后用 <a download> 强制指定中文名
        try {
          const blobResp = await fetch(json.signedUrl);
          const blob = await blobResp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = file.file_name;  // 强制使用数据库里的中文原名
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch {
          // 降级：直接 window.open（后端已设 download header）
          window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        toast.error('下载失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('下载异常: ' + (err.message || '无法连接服务器'));
    }
  };

  // ════════════════════════════════════════════════════════
  // 筛选
  // ════════════════════════════════════════════════════════
  const filtered = files.filter(f => {
    if (!search) return true;
    return f.file_name.toLowerCase().includes(search.toLowerCase());
  });

  // ════════════════════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* ── 标题 ── */}
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-violet-50 flex items-center justify-center">
            <FolderOpen size={20} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">🗂️ 个人知识库</h1>
            <p className="text-xs text-slate-500 mt-0.5">个人文档存储 · 随时演示调取</p>
          </div>
          <div className="ml-auto">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-mono font-medium border border-violet-100">v14.2</span>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5 max-w-[1200px]">
        {/* ════════════════════════════════════════════════════ */}
        {/* 上传区 */}
        {/* ════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Upload size={16} />
            上传文件
          </h2>

          <div
            {...getRootProps()}
            className={`
              relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200
              ${isDragActive ? 'border-violet-400 bg-violet-50/50' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'}
            `}
          >
            <input {...getInputProps()} />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="size-12 rounded-2xl bg-violet-50 flex items-center justify-center">
                  <File size={24} className="text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                  className="text-xs text-red-500 hover:text-red-600 underline"
                >
                  移除文件
                </button>
              </div>
            ) : isDragActive ? (
              <div className="flex flex-col items-center gap-2">
                <div className="size-12 rounded-2xl bg-violet-100 flex items-center justify-center animate-bounce">
                  <Upload size={24} className="text-violet-500" />
                </div>
                <p className="text-sm font-medium text-violet-600">释放鼠标以上传</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Upload size={24} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-violet-600">点击选择</span> 或拖拽文件到此处
                </p>
                <p className="text-xs text-slate-400">不限格式，大文件自动分片上传</p>
              </div>
            )}
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium
                         hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all flex items-center gap-2 shadow-sm shadow-violet-200"
            >
              {uploading ? <><Loader2 size={16} className="animate-spin" /> 上传中…</> : <><Upload size={16} /> 上传文件</>}
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* 文件列表 */}
        {/* ════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText size={16} />
              文件列表
              <span className="text-xs font-normal text-slate-400 ml-1">(共 {files.length} 个)</span>
            </h2>
            <div className="flex-1" />
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
              <input type="text" className={`${inputClass} pl-9 w-full text-xs`}
                placeholder="搜索文件名…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button onClick={loadFiles} className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="刷新">
              <RefreshCw size={16} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-slate-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <FileText size={48} className="text-slate-200" />
              <p className="text-sm">{search ? '没有匹配的文件' : '暂无文件，请上传你的第一个文件'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">文件名</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">大小</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">上传时间</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 w-[140px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(file => (
                    <tr key={file.id} className="border-b border-slate-50 hover:bg-violet-50/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <File size={14} className="text-slate-400 shrink-0" />
                          <span className="text-slate-800 truncate max-w-[400px]" title={file.file_name}>
                            {file.file_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatSize(file.file_size)}</td>
                      <td className="px-5 py-3 text-xs text-slate-400">
                        {new Date(file.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePreview(file)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                            title="预览"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="下载（签名 URL）"
                          >
                            <Download size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(file.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="删除"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* v14.2: Office 文档在线预览弹窗 */}
      {/* ════════════════════════════════════════════════════════ */}
      {officePreview && (
        <OfficePreviewModal
          source="my-files"
          docId={officePreview.docId}
          fileName={officePreview.fileName}
          onClose={() => setOfficePreview(null)}
        />
      )}
    </div>
  );
}