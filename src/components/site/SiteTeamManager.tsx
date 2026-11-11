import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, X, Loader2, ChevronUp, ChevronDown, Upload, EyeOff, Eye } from 'lucide-react';
import { uploadImageToStorage } from '../../lib/upload';

// ============================================================
// 类型
// ============================================================
interface TeamMember {
  id: number;
  name: string;
  avatar: string | null;
  titles: string[];
  bio: string | null;
  sort_order: number;
  is_active: boolean;
}

interface TeamForm {
  name: string;
  avatar: string;
  titles: string;   // 逗号分隔编辑
  bio: string;
}

const EMPTY_FORM: TeamForm = { name: '', avatar: '', titles: '', bio: '' };

export default function SiteTeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);

  // 表单
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);

  // 头像上传
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 重新排序
  const [reorderLoading, setReorderLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/site/team', { credentials: 'same-origin' });
      const result = await resp.json();
      if (result.success) setMembers(result.data || []);
      else toast.error(result.error || '加载失败');
    } catch { toast.error('网络异常'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // 头像上传
  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    setAvatarUploading(true);
    try {
      const url = await uploadImageToStorage(file);
      setForm(f => ({ ...f, avatar: url }));
      toast.success('头像上传成功');
    } catch (err: any) { toast.error(err.message || '上传失败'); }
    finally { setAvatarUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleCreate = () => {
    setFormMode('create'); setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true);
  };

  const handleEdit = (m: TeamMember) => {
    setFormMode('edit'); setEditingId(m.id);
    setForm({
      name: m.name || '',
      avatar: m.avatar || '',
      titles: (m.titles || []).join('、'),
      bio: m.bio || '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('请填写姓名'); return; }
    setFormLoading(true);
    try {
      const body = {
        name: form.name.trim(),
        avatar: form.avatar.trim() || null,
        titles: form.titles.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        bio: form.bio.trim() || null,
      };
      const url = formMode === 'create' ? '/api/site/team' : `/api/site/team/${editingId}`;
      const resp = await fetch(url, {
        method: formMode === 'create' ? 'POST' : 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      if (result.success) {
        toast.success(formMode === 'create' ? '新增成功' : '更新成功');
        setFormOpen(false);
        fetchMembers();
      } else { toast.error(result.error || '操作失败'); }
    } catch { toast.error('网络异常'); }
    finally { setFormLoading(false); }
  };

  // 切换上下架
  const handleToggleActive = async (m: TeamMember) => {
    try {
      const resp = await fetch(`/api/site/team/${m.id}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: m.name, titles: m.titles, is_active: !m.is_active }),
      });
      const result = await resp.json();
      if (result.success) {
        toast.success(m.is_active ? '已下架' : '已上架');
        fetchMembers();
      } else { toast.error(result.error || '操作失败'); }
    } catch { toast.error('网络异常'); }
  };

  // 排序
  const handleReorder = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= members.length) return;
    const newMembers = [...members];
    [newMembers[index], newMembers[targetIndex]] = [newMembers[targetIndex], newMembers[index]];
    setMembers(newMembers);
    setReorderLoading(true);
    try {
      const orders = newMembers.map((c, i) => ({ id: c.id, sort_order: i }));
      const resp = await fetch('/api/site/team/reorder', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      const result = await resp.json();
      if (!result.success) { toast.error(result.error || '排序失败'); fetchMembers(); }
    } catch { toast.error('网络异常'); fetchMembers(); }
    finally { setReorderLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">共 <span className="text-purple-400 font-bold">{members.length}</span> 人</span>
        <div className="flex-1" />
        <button onClick={handleCreate} className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all flex items-center gap-2">
          <Plus size={16} />新增成员
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-8 text-purple-400 animate-spin" /></div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 text-slate-500">暂无成员</div>
      ) : (
        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {members.map((m, i) => (
            <div key={m.id} className={`bg-slate-800/60 border rounded-xl p-4 flex items-start gap-4 transition-colors ${m.is_active ? 'border-slate-700/50 hover:border-purple-500/20' : 'border-red-900/20 opacity-60'}`}>
              <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                <button onClick={() => handleReorder(i, -1)} disabled={i === 0 || reorderLoading}
                  className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronUp size={14} /></button>
                <button onClick={() => handleReorder(i, 1)} disabled={i === members.length - 1 || reorderLoading}
                  className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronDown size={14} /></button>
              </div>

              {m.avatar && (
                <img src={m.avatar} alt={m.name} className="size-14 rounded-xl object-cover border border-slate-700 shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-slate-200 font-medium text-sm">{m.name}</h4>
                  {!m.is_active && <span className="text-xs text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">已下架</span>}
                </div>
                {(m.titles || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {m.titles.map((t, j) => (
                      <span key={j} className="text-xs bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                )}
                {m.bio && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{m.bio}</p>}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleEdit(m)} className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-700/50"><Edit size={16} /></button>
                <button onClick={() => handleToggleActive(m)} className="p-2 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-700/50" title={m.is_active ? '下架' : '上架'}>
                  {m.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 表单弹窗 */}
      {formOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]" onClick={() => setFormOpen(false)} />
          <div className="fixed inset-0 z-[120] flex items-start justify-center pt-16">
            <div className="w-full max-w-lg mx-4 bg-gradient-to-b from-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                <h4 className="text-slate-200 font-semibold">{formMode === 'create' ? '新增' : '编辑'}成员</h4>
                <button onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">姓名 <span className="text-red-400">*</span></label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">头像</label>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  {form.avatar ? (
                    <div className="relative inline-block">
                      <img src={form.avatar} alt="头像" className="size-20 rounded-xl object-cover border border-slate-600" />
                      <button type="button" onClick={() => setForm(f => ({ ...f, avatar: '' }))} className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center"><X size={12} /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={avatarUploading}
                      className="w-full border-2 border-dashed border-slate-600 rounded-xl px-4 py-4 text-slate-500 hover:border-purple-500/50 hover:text-purple-400 transition-all flex flex-col items-center gap-1 disabled:opacity-50">
                      {avatarUploading ? <><Loader2 className="size-6 animate-spin text-purple-400" /><span className="text-xs">上传中...</span></> : <><Upload size={20} /><span className="text-xs">点击上传头像</span></>}
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">头衔标签（用逗号分隔）</label>
                  <input type="text" value={form.titles} onChange={e => setForm(f => ({ ...f, titles: e.target.value }))}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：董事长, 高级工程师" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">个人经历</label>
                  <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={4}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50 resize-y" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setFormOpen(false)} className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-400 text-sm">取消</button>
                  <button type="submit" disabled={formLoading} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                    {formLoading && <Loader2 className="size-4 animate-spin" />}
                    {formMode === 'create' ? '创建' : '保存'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}