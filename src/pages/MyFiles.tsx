import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // v14.2: Office 文档预览弹窗
  const [officePreview, setOfficePreview] = useState<{ docId: number; fileName: string } | null>(null);

  // v16.11.2: 上传中止机制
  const abortRef = useRef(false);
  const ossClientRef = useRef<any>(null);
  const checkpointRef = useRef<{ name: string; uploadId: string } | null>(null);

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
  // v16.11.2: 上传中页面离开拦截
  // ════════════════════════════════════════════════════════
  useEffect(() => {
    (window as any).__isUploading = uploading;
    const handler = (e: BeforeUnloadEvent) => {
      if (uploading) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => { window.removeEventListener('beforeunload', handler); };
  }, [uploading]);

  // v16.11.2: 组件卸载时强制中止 OSS 上传
  useEffect(() => {
    return () => {
      if (abortRef.current || uploading) {
        console.log('🛑 [个人KB] 组件卸载，中止 OSS 上传...');
        abortRef.current = true;
        const cp = checkpointRef.current;
        const oss = ossClientRef.current;
        if (cp && oss) {
          oss.abortMultipartUpload(cp.name, cp.uploadId).catch((e: any) =>
            console.warn('⚠️ [个人KB] abortMultipartUpload 失败:', e.message)
          );
        }
      }
    };
  }, [uploading]);

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
  // v16.11.2: OSS 直传 — STS 凭证 + 分片上传 + 进度条
  // ════════════════════════════════════════════════════════
  const handleUpload = async () => {
    if (!selectedFile) { toast.error('请选择文件'); return; }

    console.log('🚀 [个人KB上传] 开始上传，文件大小:', selectedFile.size, '字节 (', formatSize(selectedFile.size), ')');

    // v16.11.2: 重置中止标记
    abortRef.current = false;
    ossClientRef.current = null;
    checkpointRef.current = null;

    setUploading(true);
    setUploadProgress(0);
    setUploadFileName(selectedFile.name);

    try {
      // v16.11.2: 检查是否已被中止
      if (abortRef.current) { console.log('🛑 [个人KB上传] 已被中止，跳过'); return; }
      // 1. 获取 STS 临时凭证
      console.log('🔄 [个人KB上传] 正在获取 STS 临时凭证...');
      const tokenResp = await fetch('/api/oa/oss-token');
      const tokenJson = await tokenResp.json();
      if (!tokenJson.success) {
        console.error('❌ [个人KB上传] 获取STS失败:', tokenJson);
        toast.error('获取上传凭证失败: ' + (tokenJson.error || '未知错误'));
        return;
      }
      const { credentials, region, bucket } = tokenJson;
      console.log('🔑 [个人KB上传] STS 凭证已获取, region:', region, 'bucket:', bucket);

      // 2. 创建 OSS 客户端
      console.log('📦 [个人KB上传] 正在加载 ali-oss SDK...');
      const OSS = (await import('ali-oss')).default;
      const client = new OSS({
        region,
        accessKeyId: credentials.accessKeyId,
        accessKeySecret: credentials.accessKeySecret,
        stsToken: credentials.securityToken,
        bucket,
        secure: true,
      });
      console.log('📦 [个人KB上传] OSS 实例已创建');
      ossClientRef.current = client; // v16.11.2: 保存引用用于中止

      // 3. 生成 OSS 存储路径
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const ossKey = `personal_kb/${year}/${month}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${selectedFile.name}`;
      console.log('🗂️ [个人KB上传] OSS 存储路径:', ossKey);

      // 4. 分片上传 + 进度回调
      console.log('📤 [个人KB上传] 开始 multipartUpload...');
      const startTime = Date.now();
      await client.multipartUpload(ossKey, selectedFile, {
        progress: (p: number, cp: any) => {
          // v16.11.2: 保存 checkpoint 用于中止
          if (cp && cp.uploadId) checkpointRef.current = { name: ossKey, uploadId: cp.uploadId };
          // v16.11.2: 检查中止信号
          if (abortRef.current) throw new Error('__ABORTED__');
          const pct = Math.floor(p * 100);
          console.log('📈 [个人KB上传] 上传进度:', pct + '%');
          setUploadProgress(pct);
        },
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ [个人KB上传] 上传完成, 耗时: ${elapsed}s`);

      // 5. 保存元数据到后端
      console.log('💾 [个人KB上传] 正在保存文件记录...');
      const saveResp = await fetch('/api/my-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: selectedFile.name,
          oss_key: ossKey,
          file_size: selectedFile.size,
        }),
      });
      const saveJson = await saveResp.json();
      console.log('💾 [个人KB上传] 后端保存结果:', saveJson.success);
      if (saveJson.success) {
        toast.success('文件上传成功 (' + formatSize(selectedFile.size) + ', 耗时 ' + elapsed + 's)');
        setSelectedFile(null);
        loadFiles();
      } else {
        console.error('❌ [个人KB上传] 文件已上传但记录失败:', saveJson);
        toast.error('文件已上传但记录失败: ' + (saveJson.error || '未知错误'));
      }
    } catch (err: any) {
      if (err.message === '__ABORTED__' || abortRef.current) {
        console.log('🛑 [个人KB上传] 用户中止上传');
        // 不弹 toast，静默中止
      } else {
        console.error('❌ [个人KB上传] 上传失败:', err);
        console.error('❌ [个人KB上传] 错误消息:', err.message);
        toast.error('上传失败，请检查网络或打开控制台: ' + (err.message || '网络错误'));
      }
    } finally {
      console.log('🏁 [个人KB上传] finally 清理');
      ossClientRef.current = null;
      checkpointRef.current = null;
      setUploading(false);
      setUploadProgress(0);
      setUploadFileName('');
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
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-mono font-medium border border-violet-100">v17.1.1</span>
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

          {/* v16.11.2: OSS 上传进度条 */}
          {uploading && uploadFileName && (
            <div className="mt-4 w-full">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span className="truncate max-w-[70%]">{uploadFileName}</span>
                <span className="font-mono text-violet-600 font-medium">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-violet-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

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