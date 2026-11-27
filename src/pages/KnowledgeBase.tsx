import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { useAuthUser } from '../components/AuthGate';
import OfficePreviewModal from '../components/OfficePreviewModal';
import {
  Eye, Trash2, Upload, FileText, Loader2, X,
  BookOpen, Search, RefreshCw, Download, File,
  CheckCircle, Ban, Send, AlertTriangle, ShieldAlert,
  ListFilter, Clock,
} from 'lucide-react';

// ============================================================
// 常量
// ============================================================
const CATEGORIES = ['监理', '造价', '招标代理', '综合'] as const;
const DOC_TYPES = ['规范', '制度', '模板', '报告', '其他'] as const;
const SECURITY_LEVELS = ['公开', '内部', '机密'] as const;
const DEPARTMENTS = ['数智部', '监理部', '造价部', '招标代理部', '市场部', '行政部', '财务部'] as const;

/**
 * v12.2 文件名规范（修复全角/半角误杀）：
 *   业务_类型_名称_V版本号_日期.扩展名
 *   示例：监理_规范_建设工程监理规范_V1.0_20261118.pdf
 *
 *   - 使用 一-龥 替代字符表述，避免编辑器编码干扰
 *   - V/v 均允许（不区分大小写）
 *   - 前端执行 trim() 后再校验，防御不可见字符
 */
const FILE_NAME_REGEX = /^[一-龥]+_[一-龥]+_.+_[Vv]\d+\.\d+_\d{8}\.[a-zA-Z0-9]+$/;

// ============================================================
// 类型
// ============================================================
interface KbDocument {
  id: number;
  file_name: string;
  file_url: string;
  category: string;
  doc_type: string;
  security_level: string;
  uploader: string;
  uploader_id?: string;
  department?: string;
  reject_reason?: string;
  experience_risk?: string;
  experience_strategy?: string;
  experience_motto?: string;
  status: '待审核' | '已打回' | '已入库';
  created_at: string;
}

// ============================================================
// 样式常量
// ============================================================
const inputClass = 'bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-colors';
const textareaClass = 'bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 transition-colors resize-none';

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================
// 状态映射
// ============================================================
const STATUS_CONFIG: Record<string, { label: string; bg: string; dot: string; border: string }> = {
  '待审核': { label: '待审核', bg: 'bg-amber-50', dot: 'bg-amber-400', border: 'border-amber-200' },
  '已打回': { label: '已打回', bg: 'bg-red-50',   dot: 'bg-red-500',   border: 'border-red-200' },
  '已入库': { label: '已入库', bg: 'bg-green-50',  dot: 'bg-green-500',  border: 'border-green-200' },
};

// ============================================================
// 组件
// ============================================================
export default function KnowledgeBase() {
  const user = useAuthUser();
  const isDashboardUser = user?.roles?.dashboard ?? false;

  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'pending'>('all'); // v12.4: Tab 切换

  // 上传表单
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState('');
  const [docType, setDocType] = useState('');
  const [securityLevel, setSecurityLevel] = useState('内部');
  const [department, setDepartment] = useState('');

  // 经验提炼表单（v12.1 新增）
  const [expRisk, setExpRisk] = useState('');
  const [expStrategy, setExpStrategy] = useState('');
  const [expMotto, setExpMotto] = useState('');

  // v16.11.2: 上传中止机制
  const abortRef = useRef(false);
  const ossClientRef = useRef<any>(null);
  const checkpointRef = useRef<{ name: string; uploadId: string } | null>(null);

  // 打回弹窗
  const [rejectTarget, setRejectTarget] = useState<KbDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // v14.2: Office 文档预览弹窗
  const [officePreview, setOfficePreview] = useState<{ docId: number; fileName: string } | null>(null);

  // ════════════════════════════════════════════════════════
  // 数据加载
  // ════════════════════════════════════════════════════════
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/kb/documents');
      const json = await resp.json();
      if (json.success) {
        setDocs(json.data || []);
      } else {
        toast.error('加载文档列表失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('网络错误: ' + (err.message || '无法连接服务器'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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
        console.log('🛑 [企业KB] 组件卸载，中止 OSS 上传...');
        abortRef.current = true;
        const cp = checkpointRef.current;
        const oss = ossClientRef.current;
        if (cp && oss) {
          oss.abortMultipartUpload(cp.name, cp.uploadId).catch((e: any) =>
            console.warn('⚠️ [企业KB] abortMultipartUpload 失败:', e.message)
          );
        }
      }
    };
  }, [uploading]);

  // ════════════════════════════════════════════════════════
  // 拖拽上传
  // ════════════════════════════════════════════════════════
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    },
  });

  // ════════════════════════════════════════════════════════
  // v16.11.2: OSS 直传 — STS 凭证 + 分片上传 + 进度条
  // ════════════════════════════════════════════════════════
  const handleUpload = async () => {
    if (!selectedFile) { toast.error('请先选择文件'); return; }
    if (!category) { toast.error('请选择业务大类'); return; }
    if (!docType) { toast.error('请选择文档类型'); return; }
    if (!securityLevel) { toast.error('请选择密级'); return; }
    if (!department) { toast.error('请选择所属部门'); return; }
    if (!expRisk.trim()) { toast.error('请填写"隐蔽风险"'); return; }
    if (!expStrategy.trim()) { toast.error('请填写"化解策略"'); return; }
    if (!expMotto.trim()) { toast.error('请填写"避坑箴言"'); return; }

    const cleanedName = selectedFile.name.trim();
    console.log('🔍 [KB 校验] 原始文件名:', JSON.stringify(selectedFile.name));
    if (!FILE_NAME_REGEX.test(cleanedName)) {
      toast.error(
        '文件名格式不符合规范！\n\n'
        + '正确格式：业务_类型_名称_V版本号_日期.扩展名\n'
        + '示例：监理_规范_建设工程监理规范_V1.0_20261118.pdf\n\n'
        + '💡 提示：请检查文件名中的下划线、数字和字母是否为英文半角状态（中文输入法下按 Shift 切换）',
        { duration: 10000 }
      );
      return;
    }

    console.log('🚀 [企业KB上传] 开始上传，文件大小:', selectedFile.size, '字节 (', formatSize(selectedFile.size), ')');

    // v16.11.2: 重置中止标记
    abortRef.current = false;
    ossClientRef.current = null;
    checkpointRef.current = null;

    setUploading(true);
    setUploadProgress(0);
    setUploadFileName(selectedFile.name);

    try {
      if (abortRef.current) { console.log('🛑 [企业KB上传] 已被中止，跳过'); return; }
      // 1. 获取 STS 临时凭证
      console.log('🔄 [企业KB上传] 正在获取 STS 临时凭证...');
      const tokenResp = await fetch('/api/oa/oss-token');
      const tokenJson = await tokenResp.json();
      if (!tokenJson.success) {
        console.error('❌ [企业KB上传] 获取STS失败:', tokenJson);
        toast.error('获取上传凭证失败: ' + (tokenJson.error || '未知错误'));
        return;
      }
      const { credentials, region, bucket } = tokenJson;
      console.log('🔑 [企业KB上传] STS 凭证已获取, region:', region, 'bucket:', bucket);

      // 2. 创建 OSS 客户端
      console.log('📦 [企业KB上传] 正在加载 ali-oss SDK...');
      const OSS = (await import('ali-oss')).default;
      const client = new OSS({
        region,
        accessKeyId: credentials.accessKeyId,
        accessKeySecret: credentials.accessKeySecret,
        stsToken: credentials.securityToken,
        bucket,
        secure: true,
      });
      console.log('📦 [企业KB上传] OSS 实例已创建');
      ossClientRef.current = client; // v16.11.2: 保存引用用于中止

      // 3. 生成 OSS 存储路径
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const ossKey = `kb_documents/${year}/${month}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${selectedFile.name}`;
      console.log('🗂️ [企业KB上传] OSS 存储路径:', ossKey);

      // 4. 分片上传 + 进度回调
      console.log('📤 [企业KB上传] 开始 multipartUpload...');
      const startTime = Date.now();
      await client.multipartUpload(ossKey, selectedFile, {
        progress: (p: number, cp: any) => {
          if (cp && cp.uploadId) checkpointRef.current = { name: ossKey, uploadId: cp.uploadId };
          if (abortRef.current) throw new Error('__ABORTED__');
          const pct = Math.floor(p * 100);
          console.log('📈 [企业KB上传] 上传进度:', pct + '%');
          setUploadProgress(pct);
        },
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ [企业KB上传] 上传完成, 耗时: ${elapsed}s`);

      // 5. 保存元数据到后端（仅传 oss_key，不传文件流）
      console.log('💾 [企业KB上传] 正在保存文档记录...');
      const saveResp = await fetch('/api/kb/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: selectedFile.name,
          oss_key: ossKey,
          file_size: selectedFile.size,
          category,
          doc_type: docType,
          security_level: securityLevel,
          department,
          experience_risk: expRisk.trim(),
          experience_strategy: expStrategy.trim(),
          experience_motto: expMotto.trim(),
        }),
      });
      const saveJson = await saveResp.json();
      console.log('💾 [企业KB上传] 后端保存结果:', saveJson.success);
      if (saveJson.success) {
        toast.success('文档已提交，等待审核入库');
        setSelectedFile(null);
        setCategory('');
        setDocType('');
        setSecurityLevel('内部');
        setDepartment('');
        setExpRisk('');
        setExpStrategy('');
        setExpMotto('');
        loadDocuments();
      } else {
        if (saveJson.findings) {
          const detail = saveJson.findings.map((f: any) => `• ${f.type}: ${f.value}`).join('\n');
          toast.error(
            `${saveJson.error}\n\n检测到的敏感信息：\n${detail}`,
            { duration: 10000 }
          );
        } else {
          console.error('❌ [企业KB上传] 文件已上传但记录失败:', saveJson);
          toast.error('文件已上传但记录失败: ' + (saveJson.error || '未知错误'));
        }
      }
    } catch (err: any) {
      if (err.message === '__ABORTED__' || abortRef.current) {
        console.log('🛑 [企业KB上传] 用户中止上传');
      } else {
        console.error('❌ [企业KB上传] 上传失败:', err);
        console.error('❌ [企业KB上传] 错误消息:', err.message);
        toast.error('上传失败，请检查网络或打开控制台: ' + (err.message || '网络错误'));
      }
    } finally {
      console.log('🏁 [企业KB上传] finally 清理');
      ossClientRef.current = null;
      checkpointRef.current = null;
      setUploading(false);
      setUploadProgress(0);
      setUploadFileName('');
    }
  };

  // ════════════════════════════════════════════════════════
  // 审批：确认入库
  // ════════════════════════════════════════════════════════
  const handleApprove = async (id: number) => {
    try {
      const resp = await fetch(`/api/kb/documents/${id}/approve`, { method: 'PUT' });
      const json = await resp.json();
      if (json.success) {
        toast.success('文档已审核入库 ✅');
        loadDocuments();
      } else {
        toast.error('审批失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('审批异常: ' + (err.message || '无法连接服务器'));
    }
  };

  // ════════════════════════════════════════════════════════
  // 审批：打回
  // ════════════════════════════════════════════════════════
  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { toast.error('请填写打回原因'); return; }

    setRejecting(true);
    try {
      const resp = await fetch(`/api/kb/documents/${rejectTarget.id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const json = await resp.json();
      if (json.success) {
        toast.success('文档已打回，上传人将收到通知');
        setRejectTarget(null);
        setRejectReason('');
        loadDocuments();
      } else {
        toast.error('打回失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('打回异常: ' + (err.message || '无法连接服务器'));
    } finally {
      setRejecting(false);
    }
  };

  // ════════════════════════════════════════════════════════
  // 删除
  // ════════════════════════════════════════════════════════
  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除该文档吗？删除后不可恢复。')) return;

    try {
      const resp = await fetch(`/api/kb/documents/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (json.success) {
        toast.success('文档已删除');
        loadDocuments();
      } else {
        toast.error('删除失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('删除异常: ' + (err.message || '无法连接服务器'));
    }
  };

  // ════════════════════════════════════════════════════════
  // v14.2: 判断文件是否支持浏览器预览（PDF/图片/Office 文档）
  // ════════════════════════════════════════════════════════
  const isPreviewable = (fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'docx', 'xlsx', 'xls'].includes(ext);
  };

  // ════════════════════════════════════════════════════════
  // v14.2: 预览 — PDF/图片用新窗口，Office 文档用弹窗
  // ════════════════════════════════════════════════════════
  const handlePreview = async (doc: KbDocument) => {
    if (!isPreviewable(doc.file_name)) {
      toast.error('该格式不支持浏览器预览，请使用"下载"按钮查看');
      return;
    }

    const ext = doc.file_name.split('.').pop()?.toLowerCase() || '';
    // Office 文档 → 弹窗预览
    if (['docx', 'xlsx', 'xls'].includes(ext)) {
      setOfficePreview({ docId: doc.id, fileName: doc.file_name });
      return;
    }

    // PDF/图片 → 新窗口
    try {
      const resp = await fetch(`/api/kb/documents/${doc.id}/preview`);
      const json = await resp.json();
      console.log('🔍 [KB PREVIEW 前端] 后端返回:', JSON.stringify(json));
      if (json.success && json.signedUrl) {
        console.log('🔍 [KB PREVIEW 前端] 即将 window.open:', json.signedUrl);
        window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('预览失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('请求异常: ' + (err.message || '无法连接服务器'));
    }
  };

  // ════════════════════════════════════════════════════════
  // v13.3: 下载 — 100% 用 signedUrl + fetch Blob + <a download>
  // ════════════════════════════════════════════════════════
  const handleDownload = async (doc: KbDocument) => {
    try {
      const resp = await fetch(`/api/kb/documents/${doc.id}/preview?download=1`);
      const json = await resp.json();
      console.log('🔍 [KB DOWNLOAD 前端] 后端返回:', JSON.stringify(json));
      if (json.success && json.signedUrl) {
        console.log('🔍 [KB DOWNLOAD 前端] 原始文件名:', doc.file_name);
        // v13.3: fetch Blob 后用 <a download> 强制指定中文名
        try {
          const blobResp = await fetch(json.signedUrl);
          const blob = await blobResp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = doc.file_name;  // 强制使用数据库里的中文原名
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
  const filteredDocs = docs.filter(d => {
    // v12.4: Tab 筛选
    if (tab === 'pending') {
      if (d.status !== '待审核') return false;
    }
    // 搜索筛选
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.file_name.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      d.uploader.toLowerCase().includes(q) ||
      (d.department || '').toLowerCase().includes(q)
    );
  });

  // ════════════════════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* ── 页面标题 ── */}
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <BookOpen size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">📚 企业知识库</h1>
            <p className="text-xs text-slate-500 mt-0.5">规范上传 · 审批流转 · 智能检索 · 内部沉淀</p>
          </div>
          <div className="ml-auto">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-mono font-medium border border-blue-100">v16.12.1</span>
          </div>
        </div>
      </div>

      {/* ── v12.4: Tab 切换 ── */}
      <div className="px-4 md:px-6 pt-4 bg-white border-b border-slate-100">
        <div className="max-w-[1400px] flex items-center gap-1">
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all flex items-center gap-2 ${
              tab === 'all'
                ? 'bg-slate-50 text-slate-900 border-b-2 border-blue-500'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ListFilter size={15} />
            全部文档
          </button>
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all flex items-center gap-2 ${
              tab === 'pending'
                ? 'bg-slate-50 text-slate-900 border-b-2 border-amber-500'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Clock size={15} />
            我的待办
            {docs.filter(d => d.status === '待审核').length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === 'pending'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {docs.filter(d => d.status === '待审核').length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5 max-w-[1400px]">
        {/* ════════════════════════════════════════════════════════ */}
        {/* 上传区域 */}
        {/* ════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Upload size={16} />
            上传文档
          </h2>

          {/* 拖拽区 */}
          <div
            {...getRootProps()}
            className={`
              relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer
              transition-all duration-200
              ${isDragActive
                ? 'border-blue-400 bg-blue-50/50'
                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
              }
            `}
          >
            <input {...getInputProps()} />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="size-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <File size={24} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
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
                <div className="size-12 rounded-2xl bg-blue-100 flex items-center justify-center animate-bounce">
                  <Upload size={24} className="text-blue-500" />
                </div>
                <p className="text-sm font-medium text-blue-600">释放鼠标以上传文件</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Upload size={24} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-blue-600">点击选择</span>
                  {' '}或拖拽文件到此处
                </p>
                <p className="text-xs text-slate-400">
                  支持 PDF / Word / Excel / PPT / TXT，大文件自动分片上传
                </p>
              </div>
            )}
          </div>

          {/* 分类选择（4列） */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                业务大类 <span className="text-red-400">*</span>
              </label>
              <select className={`${inputClass} w-full`} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">请选择</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                文档类型 <span className="text-red-400">*</span>
              </label>
              <select className={`${inputClass} w-full`} value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="">请选择</option>
                {DOC_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                密级 <span className="text-red-400">*</span>
              </label>
              <select className={`${inputClass} w-full`} value={securityLevel} onChange={e => setSecurityLevel(e.target.value)}>
                {SECURITY_LEVELS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                所属部门 <span className="text-red-400">*</span>
              </label>
              <select className={`${inputClass} w-full`} value={department} onChange={e => setDepartment(e.target.value)}>
                <option value="">请选择</option>
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* v12.1: 经验提炼表单（3个必填） */}
          <div className="mt-4 bg-amber-50/30 border border-amber-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
              <ShieldAlert size={14} />
              经验提炼表单 <span className="text-xs font-normal text-amber-500">（三项必填，用于知识沉淀）</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  ⚠️ 隐蔽风险 <span className="text-red-400">*</span>
                </label>
                <textarea
                  className={`${textareaClass} w-full h-20`}
                  placeholder="项目实施中不易察觉的风险点…"
                  value={expRisk}
                  onChange={e => setExpRisk(e.target.value)}
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  🛡️ 化解策略 <span className="text-red-400">*</span>
                </label>
                <textarea
                  className={`${textareaClass} w-full h-20`}
                  placeholder="应对上述风险的具体做法…"
                  value={expStrategy}
                  onChange={e => setExpStrategy(e.target.value)}
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  💡 避坑箴言 <span className="text-red-400">*</span>
                </label>
                <textarea
                  className={`${textareaClass} w-full h-20`}
                  placeholder="一句话总结核心教训…"
                  value={expMotto}
                  onChange={e => setExpMotto(e.target.value)}
                  maxLength={500}
                />
              </div>
            </div>
          </div>

          {/* v16.11.2: OSS 上传进度条 */}
          {uploading && uploadFileName && (
            <div className="mt-4 w-full">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span className="truncate max-w-[70%]">{uploadFileName}</span>
                <span className="font-mono text-blue-600 font-medium">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* 格式说明 + 上传按钮 */}
          <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
            <div className="text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
              📋 命名规范：
              <code className="ml-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-mono text-[11px] border border-amber-200">
                业务_类型_名称_V版本号_日期.扩展名
              </code>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium
                           hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all flex items-center gap-2 shadow-sm shadow-blue-200"
              >
                {uploading ? (
                  <><Loader2 size={16} className="animate-spin" /> 上传中…</>
                ) : (
                  <><Send size={16} /> 提交审核</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* 文档列表 */}
        {/* ════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* 工具栏 */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText size={16} />
              文档列表
              <span className="text-xs font-normal text-slate-400 ml-1">
                (共 {docs.length} 篇，入库 {docs.filter(d => d.status === '已入库').length} 篇)
              </span>
            </h2>

            <div className="flex-1" />

            {/* 搜索 */}
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
              <input
                type="text"
                className={`${inputClass} pl-9 w-full text-xs`}
                placeholder="搜索文件名/分类/部门…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <button
              onClick={loadDocuments}
              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="刷新"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {/* 表格 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-slate-300" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <FileText size={48} className="text-slate-200" />
              <p className="text-sm">{search ? '没有匹配的文档' : '暂无文档，请上传第一篇知识库文档'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">文件名</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">分类</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">部门</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">上传人</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">审批状态</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">上传时间</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 w-[180px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map(doc => {
                    const sc = STATUS_CONFIG[doc.status] || STATUS_CONFIG['待审核'];
                    const isPending = doc.status === '待审核';
                    const isRejected = doc.status === '已打回';
                    const isApproved = doc.status === '已入库';

                    return (
                      <tr
                        key={doc.id}
                        className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${isRejected ? 'bg-red-50/20' : ''}`}
                      >
                        {/* 文件名 */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <File size={14} className="text-slate-400 shrink-0" />
                            <span className="text-slate-800 truncate max-w-[260px]" title={doc.file_name}>
                              {doc.file_name}
                            </span>
                          </div>
                        </td>
                        {/* 分类 */}
                        <td className="px-5 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                            {doc.category}
                          </span>
                          <span className="ml-1 text-xs text-slate-400">{doc.doc_type}</span>
                        </td>
                        {/* 部门 */}
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {doc.department || '-'}
                        </td>
                        {/* 上传人 */}
                        <td className="px-5 py-3 text-slate-500 text-xs">{doc.uploader}</td>
                        {/* 审批状态 */}
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.bg} ${sc.border}`}>
                              <span className={`size-1.5 rounded-full ${sc.dot}`} />
                              <span className={
                                isPending ? 'text-amber-700' :
                                isRejected ? 'text-red-700' : 'text-green-700'
                              }>{sc.label}</span>
                            </span>
                            {isRejected && doc.reject_reason && (
                              <span
                                className="text-[11px] text-red-500 cursor-help truncate max-w-[160px]"
                                title={doc.reject_reason}
                              >
                                💬 {doc.reject_reason}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* 上传时间 */}
                        <td className="px-5 py-3 text-xs text-slate-400">
                          {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                        </td>
                        {/* 操作 */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1">
                            {/* v13.3: 预览 — 签名 URL */}
                            <button
                              onClick={() => handlePreview(doc)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="在线预览"
                            >
                              <Eye size={15} />
                            </button>

                            {/* v13.3: 下载 — 签名 URL + fetch Blob */}
                            <button
                              onClick={() => handleDownload(doc)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="下载（签名 URL）"
                            >
                              <Download size={15} />
                            </button>

                            {/* v12.1: 高管审批 — 确认入库 */}
                            {isPending && isDashboardUser && (
                              <button
                                onClick={() => handleApprove(doc.id)}
                                className="p-1.5 rounded-lg text-green-500 hover:text-white hover:bg-green-500 transition-colors"
                                title="确认入库"
                              >
                                <CheckCircle size={15} />
                              </button>
                            )}

                            {/* v12.1: 高管审批 — 打回 */}
                            {isPending && isDashboardUser && (
                              <button
                                onClick={() => { setRejectTarget(doc); setRejectReason(''); }}
                                className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-colors"
                                title="打回重传"
                              >
                                <Ban size={15} />
                              </button>
                            )}

                            {/* 删除 */}
                            <button
                              onClick={() => handleDelete(doc.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="删除"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* 文件命名规范说明 */}
        {/* ════════════════════════════════════════════════════════ */}
        <div className="mt-6 bg-amber-50/50 border border-amber-200 rounded-xl p-4 text-sm">
          <h3 className="font-semibold text-amber-800 mb-2">📋 文件命名规范说明</h3>
          <div className="text-amber-700 space-y-1 text-xs leading-relaxed">
            <p><strong>格式：</strong><code className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">业务_类型_名称_V版本号_日期.扩展名</code></p>
            <p><strong>示例：</strong>监理_规范_建设工程监理规范_V1.0_20261118.pdf</p>
            <p><strong>规则：</strong></p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>前两段必须是中文（业务大类、文档类型）</li>
              <li>版本号格式：V + 大版本.小版本（如 V1.0、V2.3）</li>
              <li>日期为 8 位数字（YYYYMMDD）</li>
              <li>段之间用 1 个下划线 _ 连接</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* v12.1: 打回原因弹窗 */}
      {/* ════════════════════════════════════════════════════════ */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Ban size={16} className="text-red-500" />
                打回文档
              </h3>
              <button
                onClick={() => setRejectTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              文档：<strong className="text-slate-700">{rejectTarget.file_name}</strong>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                打回原因 <span className="text-red-400">*</span>
              </label>
              <textarea
                className={`${textareaClass} w-full h-24`}
                placeholder="请说明打回原因，上传人将收到此反馈…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium
                           hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all flex items-center gap-1.5"
              >
                {rejecting ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                确认打回
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* v14.2: Office 文档在线预览弹窗 */}
      {/* ════════════════════════════════════════════════════════ */}
      {officePreview && (
        <OfficePreviewModal
          source="kb"
          docId={officePreview.docId}
          fileName={officePreview.fileName}
          onClose={() => setOfficePreview(null)}
        />
      )}
    </div>
  );
}