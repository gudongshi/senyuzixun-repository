import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  FileText, Send, CheckCircle, Ban, Loader2, Plus,
  Clock, UserCheck, ListFilter, ClipboardList,
  Upload, File, Download, X, Eye,
} from 'lucide-react';

// ============================================================
// 类型
// ============================================================
interface OAAttachment {
  id: number;
  file_name: string;
  oss_key: string;
  file_size: number;
}

interface OAApproval {
  id: number;
  title: string;
  type: string;
  applicant_id: string;
  applicant_name: string;
  status: 'pending' | 'approved' | 'rejected';
  current_approver_id: string | null;
  content: string;
  created_at: string;
  oa_attachments: OAAttachment[];
}

const APPROVAL_TYPES = ['报销', '合同', '用印', '请假', '其他'] as const;

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
// 组件
// ============================================================
export default function OAApproval() {
  // 列表
  const [tab, setTab] = useState<'mine' | 'pending'>('mine');
  const [approvals, setApprovals] = useState<OAApproval[]>([]);
  const [loading, setLoading] = useState(true);

  // 发起审批弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createType, setCreateType] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [creating, setCreating] = useState(false);

  // 附件上传
  const [attachments, setAttachments] = useState<OAAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // 处理中
  const [processing, setProcessing] = useState(false);

  // ════════════════════════════════════════════════════════
  // 加载列表
  // ════════════════════════════════════════════════════════
  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/oa/approvals?tab=${tab}`);
      const json = await resp.json();
      if (json.success) {
        setApprovals(json.data || []);
      } else {
        toast.error('加载失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('网络错误: ' + (err.message || '无法连接服务器'));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  // ════════════════════════════════════════════════════════
  // 附件上传
  // ════════════════════════════════════════════════════════
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error('文件大小超过 50MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/oa/upload-attachment', {
        method: 'POST',
        body: formData,
      });
      const json = await resp.json();
      if (json.success) {
        setAttachments(prev => [...prev, json.data]);
        toast.success('附件上传成功');
      } else {
        toast.error('上传失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('上传异常: ' + (err.message || '无法连接服务器'));
    } finally {
      setUploading(false);
      // 重置 input
      e.target.value = '';
    }
  };

  // ════════════════════════════════════════════════════════
  // 附件下载
  // ════════════════════════════════════════════════════════
  const handleDownload = async (attachment: OAAttachment) => {
    try {
      const resp = await fetch(`/api/oa/attachments/${attachment.id}/download`);
      const json = await resp.json();
      if (json.success && json.signedUrl) {
        const a = document.createElement('a');
        a.href = json.signedUrl;
        a.download = attachment.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        toast.error('下载失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('下载异常: ' + (err.message || '无法连接服务器'));
    }
  };

  // ════════════════════════════════════════════════════════
  // 发起审批
  // ════════════════════════════════════════════════════════
  const handleCreate = async () => {
    if (!createTitle.trim()) { toast.error('请填写审批标题'); return; }
    if (!createType) { toast.error('请选择审批类型'); return; }

    setCreating(true);
    try {
      const resp = await fetch('/api/oa/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle.trim(),
          type: createType,
          content: createContent.trim(),
          attachmentIds: attachments.map(a => a.id),
        }),
      });
      const json = await resp.json();
      if (json.success) {
        toast.success('审批已提交');
        setShowCreate(false);
        setCreateTitle('');
        setCreateType('');
        setCreateContent('');
        setAttachments([]);
        setTab('mine');
        loadApprovals();
      } else {
        toast.error('提交失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('提交异常: ' + (err.message || '无法连接服务器'));
    } finally {
      setCreating(false);
    }
  };

  // ════════════════════════════════════════════════════════
  // 审批通过
  // ════════════════════════════════════════════════════════
  const handleApprove = async (id: number) => {
    if (processing) return;
    setProcessing(true);
    try {
      const resp = await fetch(`/api/oa/approvals/${id}/approve`, { method: 'PUT' });
      const json = await resp.json();
      if (json.success) {
        toast.success('已通过');
        loadApprovals();
      } else {
        toast.error('操作失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('操作异常: ' + (err.message || '无法连接服务器'));
    } finally {
      setProcessing(false);
    }
  };

  // ════════════════════════════════════════════════════════
  // 审批驳回
  // ════════════════════════════════════════════════════════
  const handleReject = async (id: number) => {
    if (processing) return;
    if (!window.confirm('确定要驳回该审批吗？')) return;
    setProcessing(true);
    try {
      const resp = await fetch(`/api/oa/approvals/${id}/reject`, { method: 'PUT' });
      const json = await resp.json();
      if (json.success) {
        toast.success('已驳回');
        loadApprovals();
      } else {
        toast.error('操作失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      toast.error('操作异常: ' + (err.message || '无法连接服务器'));
    } finally {
      setProcessing(false);
    }
  };

  // ════════════════════════════════════════════════════════
  // 状态徽章
  // ════════════════════════════════════════════════════════
  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <span className="size-1.5 rounded-full bg-amber-400" />待审批</span>;
      case 'approved':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <span className="size-1.5 rounded-full bg-green-500" />已通过</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <span className="size-1.5 rounded-full bg-red-500" />已驳回</span>;
    }
  };

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* ── 标题 ── */}
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-emerald-50 flex items-center justify-center">
            <ClipboardList size={20} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">📋 OA 审批</h1>
            <p className="text-xs text-slate-500 mt-0.5">审批流管理 · 附件存阿里云 OSS</p>
          </div>
          <div className="ml-auto">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-mono font-medium border border-emerald-100">v15.1</span>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5 max-w-[1200px]">
        {/* ════════════════════════════════════════════════════════ */}
        {/* Tab + 发起按钮 */}
        {/* ════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1">
            <button
              onClick={() => setTab('mine')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === 'mine' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText size={15} />
              我发起的
            </button>
            <button
              onClick={() => setTab('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === 'pending' ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Clock size={15} />
              待我审批
              {approvals.filter(a => a.status === 'pending').length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">
                  {approvals.filter(a => a.status === 'pending').length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium
                       hover:bg-emerald-500 transition-all flex items-center gap-2 shadow-sm shadow-emerald-200"
          >
            <Plus size={16} />
            发起审批
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/* 审批列表 */}
        {/* ════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-slate-300" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <ClipboardList size={48} className="text-slate-200" />
              <p className="text-sm">{tab === 'mine' ? '你还没有发起过审批' : '没有待审批的事项'}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {approvals.map(item => (
                <div key={item.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    {/* 左侧信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-800">{item.title}</h3>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          {item.type}
                        </span>
                        {statusBadge(item.status)}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <UserCheck size={12} />
                          {item.applicant_name}
                        </span>
                        <span>
                          {new Date(item.created_at).toLocaleString('zh-CN')}
                        </span>
                      </div>

                      {item.content && (
                        <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                          {item.content}
                        </p>
                      )}

                      {/* 附件列表 */}
                      {item.oa_attachments && item.oa_attachments.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {item.oa_attachments.map(att => (
                            <button
                              key={att.id}
                              onClick={() => handleDownload(att)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs
                                         bg-blue-50 text-blue-600 border border-blue-100
                                         hover:bg-blue-100 transition-colors"
                              title={`下载 ${att.file_name}`}
                            >
                              <File size={12} />
                              <span className="max-w-[120px] truncate">{att.file_name}</span>
                              <Download size={12} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 右侧操作按钮（仅待审批状态显示） */}
                    {tab === 'pending' && item.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleApprove(item.id)}
                          disabled={processing}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium
                                     hover:bg-emerald-100 border border-emerald-200 transition-colors
                                     flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <CheckCircle size={13} />
                          通过
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          disabled={processing}
                          className="px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-medium
                                     hover:bg-red-100 border border-red-200 transition-colors
                                     flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Ban size={13} />
                          驳回
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 发起审批弹窗 */}
      {/* ════════════════════════════════════════════════════════ */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Send size={16} className="text-emerald-500" />
                发起审批
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* 标题 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                审批标题 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                className={`${inputClass} w-full`}
                placeholder="请输入审批标题…"
                value={createTitle}
                onChange={e => setCreateTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* 类型 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                审批类型 <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {APPROVAL_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCreateType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      createType === t
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 内容 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                审批说明
              </label>
              <textarea
                className={`${textareaClass} w-full h-20`}
                placeholder="可选，补充说明审批内容…"
                value={createContent}
                onChange={e => setCreateContent(e.target.value)}
                maxLength={2000}
              />
            </div>

            {/* 附件 */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-slate-600 mb-2">
                📎 附件（存阿里云 OSS）
              </label>

              {/* 已上传附件 */}
              {attachments.length > 0 && (
                <div className="mb-2 space-y-1">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100">
                      <span className="text-slate-600 truncate max-w-[300px]">{att.file_name}</span>
                      <button
                        onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                        className="text-red-400 hover:text-red-600 ml-2 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 上传按钮 */}
              <label className={`
                inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed
                text-xs font-medium cursor-pointer transition-all
                ${uploading
                  ? 'border-slate-200 bg-slate-50 text-slate-400'
                  : 'border-slate-300 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/30'
                }
              `}>
                {uploading ? (
                  <><Loader2 size={14} className="animate-spin" /> 上传中…</>
                ) : (
                  <><Upload size={14} /> 选择文件</>
                )}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleAttachmentUpload}
                  disabled={uploading}
                />
              </label>
              <span className="ml-2 text-[11px] text-slate-400">单文件最大 50MB</span>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-slate-600 text-sm hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createTitle.trim() || !createType}
                className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium
                           hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-200"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                提交审批
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}