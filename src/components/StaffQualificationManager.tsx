import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  Plus, Search, X, Edit, Trash2, Loader2, RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ============================================================
// 类型定义
// ============================================================
interface StaffQualification {
  id: number;
  name: string | null;
  title: string | null;
  cert_type: string | null;
  cert_major: string | null;
  register_major: string | null;
  education: string | null;
  status: string | null;
  cert_status: string | null;
  cert_expire_date: string | null;
  created_at?: string;
  updated_at?: string;
}

interface QualificationFormData {
  name: string;
  title: string;
  cert_type: string;
  cert_major: string;
  register_major: string;
  education: string;
  status: string;
  cert_status: string;
  cert_expire_date: string;
}

const EMPTY_FORM: QualificationFormData = {
  name: '',
  title: '',
  cert_type: '',
  cert_major: '',
  register_major: '',
  education: '',
  status: '公司在职',
  cert_status: '正常注册',
  cert_expire_date: '',
};

// ============================================================
// StaffQualificationManager 组件
// ============================================================
export default function StaffQualificationManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<StaffQualification[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  // 表单弹窗
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<QualificationFormData>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<StaffQualification | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── 加载数据 ──
  const fetchRecords = useCallback(async (keyword?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from('staff_qualifications')
        .select('*', { count: 'exact' });

      const kw = keyword ?? search;
      if (kw.trim()) {
        query = query.ilike('name', `%${kw.trim()}%`);
      }

      const { data, error, count } = await query
        .order('name', { ascending: true });

      if (error) throw error;
      setRecords(data || []);
      setTotal(count || 0);
    } catch (err: any) {
      console.error('❌ 获取资质列表失败:', err);
      toast.error(err.message || '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch('');
      fetchRecords('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 搜索 ──
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    fetchRecords();
  };

  // ── 打开新增 ──
  const handleCreate = () => {
    setFormMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  // ── 打开编辑 ──
  const handleEdit = (record: StaffQualification) => {
    setFormMode('edit');
    setEditingId(record.id);
    setForm({
      name: record.name || '',
      title: record.title || '',
      cert_type: record.cert_type || '',
      cert_major: record.cert_major || '',
      register_major: record.register_major || '',
      education: record.education || '',
      status: record.status || '公司在职',
      cert_status: record.cert_status || '正常注册',
      cert_expire_date: record.cert_expire_date || '',
    });
    setFormOpen(true);
  };

  // ── 提交表单 ──
  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('请填写姓名');
      return;
    }
    setFormLoading(true);
    try {
      const body: Record<string, string | null> = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        cert_type: form.cert_type.trim() || null,
        cert_major: form.cert_major.trim() || null,
        register_major: form.register_major.trim() || null,
        education: form.education.trim() || null,
        status: form.status || null,
        cert_status: form.cert_status || null,
        cert_expire_date: form.cert_expire_date || null,
      };

      if (formMode === 'create') {
        const { error } = await supabase
          .from('staff_qualifications')
          .insert(body);
        if (error) throw error;
        toast.success('新增成功');
      } else {
        const { error } = await supabase
          .from('staff_qualifications')
          .update(body)
          .eq('id', editingId!);
        if (error) throw error;
        toast.success('更新成功');
      }

      setFormOpen(false);
      fetchRecords();
    } catch (err: any) {
      console.error('❌ 保存失败:', err);
      toast.error(err.message || '保存失败');
    } finally {
      setFormLoading(false);
    }
  };

  // ── 删除 ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from('staff_qualifications')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('删除成功');
      setDeleteTarget(null);
      fetchRecords();
    } catch (err: any) {
      console.error('❌ 删除失败:', err);
      toast.error(err.message || '删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!open) return null;

  const inputClass = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors';
  const labelClass = 'block text-sm text-slate-600 mb-1';

  return (
    <>
      {/* ============================================================ */}
      {/* 主弹窗 */}
      {/* ============================================================ */}
      <div className="fixed inset-0 z-[100] flex flex-col bg-white md:bg-black/50 md:backdrop-blur-sm md:items-center md:justify-center md:p-4">
        <div className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-5xl md:rounded-2xl bg-white border-0 md:border border-slate-200 shadow-0 md:shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <ShieldCheck className="size-5 text-slate-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">📋 人员资质管理</h3>
              <p className="text-xs text-slate-500">增删改查集团人员资质信息</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 md:px-6 py-3 border-b border-slate-100 shrink-0">
          <div className="flex flex-col md:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="按姓名搜索..."
                  className={`${inputClass} pl-9`}
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all shrink-0"
              >
                搜索
              </button>
            </form>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => fetchRecords('')}
                className="p-2.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                title="刷新"
              >
                <RefreshCw size={16} />
              </button>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all shrink-0"
              >
                <Plus size={16} />
                新增人员
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-8 text-slate-400 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="size-12 text-slate-300 mb-3" />
              <p className="text-slate-500 text-base font-medium mb-1">暂无资质记录</p>
              <p className="text-slate-400 text-sm">点击「新增人员」开始添加</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-slate-400 mb-3">共 {total} 条记录</div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-2.5 text-slate-500 text-xs font-semibold whitespace-nowrap">姓名</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 text-xs font-semibold whitespace-nowrap">职称</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 text-xs font-semibold whitespace-nowrap">证书类型</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 text-xs font-semibold whitespace-nowrap">专业</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 text-xs font-semibold whitespace-nowrap">状态</th>
                      <th className="text-left px-4 py-2.5 text-slate-500 text-xs font-semibold whitespace-nowrap">有效期</th>
                      <th className="text-right px-4 py-2.5 text-slate-500 text-xs font-semibold whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-800 text-sm font-medium">{r.name}</td>
                        <td className="px-4 py-2.5">
                          {r.title && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {r.title}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.cert_type && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">{r.cert_type}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-sm max-w-[120px] truncate">
                          {r.cert_major || r.register_major || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.status && (
                            <span className={`text-xs px-2 py-0.5 rounded border ${
                              r.status === '公司在职'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {r.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-sm whitespace-nowrap">
                          {r.cert_expire_date || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(r)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                              title="编辑"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(r)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="删除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 新增/编辑表单弹窗 */}
      {/* ============================================================ */}
      {formOpen && (
        <div className="fixed inset-0 z-[110] flex flex-col bg-white md:bg-black/50 md:backdrop-blur-sm md:items-center md:justify-center md:p-4">
          <div className="w-full h-full flex flex-col md:h-auto md:max-h-[90vh] md:w-[600px] md:rounded-2xl border-0 md:border border-slate-200 shadow-0 md:shadow-xl bg-white">
            <div className="flex justify-between items-center p-5 border-b border-slate-200 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">
                {formMode === 'create' ? '新增人员资质' : '编辑人员资质'}
              </h3>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="flex flex-col h-full min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>姓名 <span className="text-red-400">*</span></label>
                    <input type="text" className={inputClass} value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="请输入姓名" />
                  </div>
                  <div>
                    <label className={labelClass}>职称</label>
                    <input type="text" className={inputClass} value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="如：高级工程师" />
                  </div>
                  <div>
                    <label className={labelClass}>证书类型</label>
                    <input type="text" className={inputClass} value={form.cert_type}
                      onChange={e => setForm(f => ({ ...f, cert_type: e.target.value }))}
                      placeholder="如：注册监理工程师" />
                  </div>
                  <div>
                    <label className={labelClass}>证书专业</label>
                    <input type="text" className={inputClass} value={form.cert_major}
                      onChange={e => setForm(f => ({ ...f, cert_major: e.target.value }))}
                      placeholder="如：房屋建筑工程" />
                  </div>
                  <div>
                    <label className={labelClass}>注册专业</label>
                    <input type="text" className={inputClass} value={form.register_major}
                      onChange={e => setForm(f => ({ ...f, register_major: e.target.value }))}
                      placeholder="如：市政公用工程" />
                  </div>
                  <div>
                    <label className={labelClass}>学历</label>
                    <input type="text" className={inputClass} value={form.education}
                      onChange={e => setForm(f => ({ ...f, education: e.target.value }))}
                      placeholder="如：本科" />
                  </div>
                  <div>
                    <label className={labelClass}>人员状态</label>
                    <select className={inputClass} value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="公司在职">公司在职</option>
                      <option value="已离职">已离职</option>
                      <option value="外聘">外聘</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>证书状态</label>
                    <select className={inputClass} value={form.cert_status}
                      onChange={e => setForm(f => ({ ...f, cert_status: e.target.value }))}>
                      <option value="正常注册">正常注册</option>
                      <option value="待延续">待延续</option>
                      <option value="已过期">已过期</option>
                      <option value="无">无</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>证书有效期</label>
                    <input type="date" className={inputClass} value={form.cert_expire_date}
                      onChange={e => setForm(f => ({ ...f, cert_expire_date: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex justify-end gap-3 p-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                >
                  {formLoading && <Loader2 className="size-4 animate-spin" />}
                  {formMode === 'create' ? '新增' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 删除确认 */}
      {/* ============================================================ */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="size-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="size-5 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">确认删除</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              确定要删除「{deleteTarget.name}」的资质记录吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-5 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-all disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                {deleteLoading && <Loader2 className="size-4 animate-spin" />}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}