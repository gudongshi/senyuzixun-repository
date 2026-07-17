import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  Plus, Search, RefreshCw, Edit, Trash2, X,
  LogOut, LayoutDashboard, Building2, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, Users
} from 'lucide-react';

// ============================================================
// 类型定义
// ============================================================
interface Client {
  id: number;
  client_name: string;
  contact_person: string | null;
  contact_phone: string | null;
  responsible_person: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UserInfo {
  userId: string;
  name: string;
  loginTime: number;
}

// ============================================================
// 常量
// ============================================================
const PAGE_SIZE = 15;

// ============================================================
// 工具函数
// ============================================================
function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================
// ConfirmDialog 子组件
// ============================================================
function ConfirmDialog({
  open, title, message, onConfirm, onCancel, loading
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-full bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="size-5 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-red-400">{title}</h3>
        </div>
        <p className="text-slate-300 text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ClientFormModal 子组件（新建/编辑）
// ============================================================
function ClientFormModal({
  open, client, onClose, onSuccess
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    client_name: '',
    contact_person: '',
    contact_phone: '',
    responsible_person: '',
  });

  useEffect(() => {
    if (client) {
      console.log('📋 编辑模式回填客户数据:', client);
      setForm({
        client_name: client.client_name || '',
        contact_person: client.contact_person || '',
        contact_phone: client.contact_phone || '',
        responsible_person: client.responsible_person || '',
      });
    } else {
      setForm({
        client_name: '',
        contact_person: '',
        contact_phone: '',
        responsible_person: '',
      });
    }
  }, [client, open]);

  if (!open) return null;

  const isEdit = !!client;
  const title = isEdit ? '编辑客户' : '新增客户';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.client_name) {
      toast.error('请填写客户名称');
      return;
    }

    setLoading(true);
    try {
      const body = {
        client_name: form.client_name,
        contact_person: form.contact_person || null,
        contact_phone: form.contact_phone || null,
        responsible_person: form.responsible_person || null,
      };

      console.log('📤 提交客户表单:', body);

      const url = isEdit ? `/api/clients/${client.id}` : '/api/clients';
      const method = isEdit ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '操作失败');
      }

      toast.success(isEdit ? '客户更新成功' : '客户创建成功');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const inputClass = "w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors";
  const labelClass = "block text-sm text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-10 overflow-y-auto">
      <div className="bg-slate-800 border border-blue-900/30 rounded-2xl w-full max-w-lg mx-4 shadow-2xl my-10">
        <div className="flex justify-between items-center p-6 border-b border-blue-900/30">
          <h2 className="text-xl font-bold text-cyan-400">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>客户名称 <span className="text-red-400">*</span></label>
            <input type="text" className={inputClass} value={form.client_name}
              onChange={e => updateField('client_name', e.target.value)} placeholder="请输入客户名称" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>联系人</label>
              <input type="text" className={inputClass} value={form.contact_person}
                onChange={e => updateField('contact_person', e.target.value)} placeholder="请输入联系人" />
            </div>
            <div>
              <label className={labelClass}>联系电话</label>
              <input type="text" className={inputClass} value={form.contact_phone}
                onChange={e => updateField('contact_phone', e.target.value)} placeholder="请输入联系电话" />
            </div>
          </div>
          <div>
            <label className={labelClass}>负责人</label>
            <input type="text" className={inputClass} value={form.responsible_person}
              onChange={e => updateField('responsible_person', e.target.value)} placeholder="请输入负责人" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
            <button type="button" onClick={onClose}
              className="px-5 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
              取消
            </button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center gap-2">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? '保存修改' : '创建客户'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// 主页面组件 ClientManager
// ============================================================
export default function ClientManager() {
  // 数据状态
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 搜索状态
  const [search, setSearch] = useState('');

  // 弹窗状态
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 用户状态
  const [user, setUser] = useState<UserInfo | null>(null);

  // 获取当前用户
  useEffect(() => {
    fetch('/api/dingtalk/me')
      .then(r => r.json())
      .then(d => { if (d.success) setUser(d.user); })
      .catch(() => {});
  }, []);

  // 获取客户列表
  const fetchClients = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (search) params.set('search', search);

      console.log(`📋 GET /api/clients - page=${page} search="${search}"`);

      const resp = await fetch(`/api/clients?${params.toString()}`);
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '获取客户列表失败');
      }

      console.log(`✅ 客户列表返回 ${(result.data || []).length} 条记录，共 ${result.pagination?.total || 0} 条`);
      setClients(result.data || []);
      setPagination(result.pagination || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || '获取客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchClients(1);
  }, [fetchClients]);

  // 搜索
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    fetchClients(1);
  };

  // 打开新建弹窗
  const handleCreate = () => {
    setEditingClient(null);
    setFormModalOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormModalOpen(true);
  };

  // 打开删除确认
  const handleDeleteClick = (client: Client) => {
    setDeletingClient(client);
    setDeleteConfirmOpen(true);
  };

  // 确认删除
  const handleDeleteConfirm = async () => {
    if (!deletingClient) return;
    setDeleting(true);
    try {
      console.log(`📋 DELETE /api/clients/${deletingClient.id}`);

      const resp = await fetch(`/api/clients/${deletingClient.id}`, { method: 'DELETE' });
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }

      console.log('✅ 客户已删除:', deletingClient.client_name);
      toast.success('客户已删除');
      setDeleteConfirmOpen(false);
      setDeletingClient(null);
      fetchClients(pagination.page);
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // 登出
  const handleLogout = async () => {
    try {
      await fetch('/api/dingtalk/logout', { method: 'POST' });
    } catch (err) {
      // 即使登出 API 失败也跳转
    }
    window.location.href = '/';
  };

  const inputClass = "bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-200">
      {/* ============================================================ */}
      {/* Header */}
      {/* ============================================================ */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-cyan-500/20 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <img
            src="https://dt-beebot-prod.oss-cn-zhangjiakou.aliyuncs.com/dingtalk_prod_media/20260511/14/22/34/468053ed-51e7-4f77-ab5b-f0c6e1cdd6ee/%E6%A3%AE%E5%AE%87logo-1.jpg"
            alt="森宇集团 Logo"
            className="h-10 w-auto rounded-lg"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-cyan-400 bg-clip-text text-transparent">
            森宇集团 · 客户管理
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* 返回大屏 */}
          <a href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900/40 text-cyan-400 text-sm hover:bg-blue-900/20 transition-colors">
            <LayoutDashboard size={16} />
            指挥大屏
          </a>

          {/* 项目管理 */}
          <a href="/project-manager"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900/40 text-cyan-400 text-sm hover:bg-blue-900/20 transition-colors">
            <Building2 size={16} />
            项目管理
          </a>

          {/* 用户信息 */}
          {user && (
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {user.name?.charAt(0) || '?'}
              </div>
              <span className="text-slate-300 text-sm">{user.name}</span>
            </div>
          )}

          {/* 登出 */}
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-900/20 transition-colors">
            <LogOut size={16} />
            登出
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* Toolbar */}
      {/* ============================================================ */}
      <div className="px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 搜索 */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <input type="text" className={`${inputClass} pl-9 w-full`}
                placeholder="搜索客户名称..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button type="submit"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm hover:from-cyan-400 hover:to-blue-500 transition-all">
              搜索
            </button>
          </form>

          {/* 刷新 */}
          <button onClick={() => fetchClients(pagination.page)}
            className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="刷新">
            <RefreshCw size={18} />
          </button>

          {/* 新增客户 */}
          <button onClick={handleCreate}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all font-medium shadow-lg shadow-blue-900/30">
            <Plus size={18} />
            新增客户
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Client Table */}
      {/* ============================================================ */}
      <div className="px-6 pb-6">
        <div className="bg-slate-800/60 border border-blue-900/30 rounded-2xl overflow-hidden backdrop-blur-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-10 text-cyan-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <AlertTriangle className="size-12 mx-auto mb-3 text-red-400" />
              <p className="text-red-400 mb-3">{error}</p>
              <button onClick={() => fetchClients(1)}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                重试
              </button>
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-20">
              <Users className="size-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-500 mb-4">暂无客户数据</p>
              <button onClick={handleCreate}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all">
                创建第一个客户
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-blue-900/30 bg-slate-800/80">
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">客户名称</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">联系人</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">联系电话</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">负责人</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">创建时间</th>
                      <th className="text-right px-5 py-3.5 text-slate-400 text-sm font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(client => (
                      <tr key={client.id}
                        className="border-b border-slate-700/30 hover:bg-blue-900/10 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="text-slate-200 text-sm font-medium">{client.client_name}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-slate-300 text-sm">{client.contact_person || '-'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-slate-300 text-sm">{client.contact_phone || '-'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-slate-300 text-sm">{client.responsible_person || '-'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-slate-400 text-sm">{formatDateTime(client.created_at)}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => handleEdit(client)}
                              className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors"
                              title="编辑">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => handleDeleteClick(client)}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                              title="删除">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-blue-900/30">
                  <span className="text-slate-500 text-sm">
                    共 {pagination.total} 条记录，第 {pagination.page} / {pagination.totalPages} 页
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => fetchClients(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-slate-400 text-sm px-2">{pagination.page}</span>
                    <button onClick={() => fetchClients(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modals */}
      {/* ============================================================ */}
      <ClientFormModal
        open={formModalOpen}
        client={editingClient}
        onClose={() => { setFormModalOpen(false); setEditingClient(null); }}
        onSuccess={() => fetchClients(pagination.page)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="确认删除"
        message={`确定要删除客户「${deletingClient?.client_name || ''}」吗？此操作不可撤销。`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingClient(null); }}
        loading={deleting}
      />
    </div>
  );
}