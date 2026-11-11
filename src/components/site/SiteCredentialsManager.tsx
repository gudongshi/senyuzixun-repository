import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, X, Loader2, ChevronUp, ChevronDown, Upload } from 'lucide-react';
import { uploadImageToStorage } from '../../lib/upload';

// ============================================================
// 类型
// ============================================================
interface Credential {
  id: number;
  title: string;
  image_url: string;
  category: string;
  sort_order: number;
}

const CATEGORIES = [
  { key: '体系认证', label: '✅ 体系认证' },
  { key: '企业资质', label: '🏆 企业资质' },
];

export default function SiteCredentialsManager() {
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [items, setItems] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);

  // 表单
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 删除
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [reorderLoading, setReorderLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/site/credentials?category=${encodeURIComponent(category)}`, { credentials: 'same-origin' });
      const result = await resp.json();
      if (result.success) setItems(result.data || []);
      else toast.error(result.error || '加载失败');
    } catch { toast.error('网络异常'); }
    finally { setLoading(false); }
  }, [category]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleImgUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    setImgUploading(true);
    try {
      const url = await uploadImageToStorage(file);
      setImageUrl(url);
      toast.success('图片上传成功');
    } catch (err: any) { toast.error(err.message || '上传失败'); }
    finally { setImgUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleCreate = () => {
    setFormMode('create'); setEditingId(null); setTitle(''); setImageUrl(''); setFormOpen(true);
  };

  const handleEdit = (c: Credential) => {
    setFormMode('edit'); setEditingId(c.id); setTitle(c.title); setImageUrl(c.image_url); setFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('请填写资质名称'); return; }
    if (!imageUrl.trim()) { toast.error('请上传证书图片'); return; }
    setFormLoading(true);
    try {
      const body = { title: title.trim(), image_url: imageUrl.trim(), category };
      const url = formMode === 'create' ? '/api/site/credentials' : `/api/site/credentials/${editingId}`;
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
        fetchItems();
      } else { toast.error(result.error || '操作失败'); }
    } catch { toast.error('网络异常'); }
    finally { setFormLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const resp = await fetch(`/api/site/credentials/${deleteTarget.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const result = await resp.json();
      if (result.success) { toast.success('已删除'); setDeleteTarget(null); fetchItems(); }
      else toast.error(result.error || '删除失败');
    } catch { toast.error('网络异常'); }
    finally { setDeleteLoading(false); }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    const ti = index + direction;
    if (ti < 0 || ti >= items.length) return;
    const newItems = [...items];
    [newItems[index], newItems[ti]] = [newItems[ti], newItems[index]];
    setItems(newItems);
    setReorderLoading(true);
    try {
      // 逐个 PUT sort_order
      for (let i = 0; i < newItems.length; i++) {
        const resp = await fetch(`/api/site/credentials/${newItems[i].id}`, {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newItems[i].title, image_url: newItems[i].image_url, category, sort_order: i }),
        });
        const result = await resp.json();
        if (!result.success) { toast.error('排序失败'); fetchItems(); return; }
      }
    } catch { toast.error('网络异常'); fetchItems(); }
    finally { setReorderLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* 分类 Tab + 新增 */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-slate-600">
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${category === c.key ? 'bg-purple-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={handleCreate} className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all flex items-center gap-2">
          <Plus size={16} />新增资质
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-8 text-purple-400 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500">暂无资质证书</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto pr-1">
          {items.map((item, i) => (
            <div key={item.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden group hover:border-purple-500/30 transition-colors">
              <div className="aspect-[3/2] bg-slate-900/50 flex items-center justify-center overflow-hidden relative">
                <img src={item.image_url} alt={item.title} className="max-w-full max-h-full object-contain p-2"
                  onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60" fill="%23475569"><rect width="80" height="60" rx="4"/><text x="40" y="34" text-anchor="middle" fill="%2394a3b8" font-size="10">无图片</text></svg>'; }} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => handleEdit(item)} className="p-1.5 rounded-lg bg-slate-800 text-amber-400 hover:bg-slate-700"><Edit size={14} /></button>
                  <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded-lg bg-slate-800 text-red-400 hover:bg-slate-700"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="p-3 flex items-start gap-2">
                <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                  <button onClick={() => handleReorder(i, -1)} disabled={i === 0 || reorderLoading}
                    className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronUp size={12} /></button>
                  <button onClick={() => handleReorder(i, 1)} disabled={i === items.length - 1 || reorderLoading}
                    className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronDown size={12} /></button>
                </div>
                <p className="text-xs text-slate-300 leading-snug line-clamp-2">{item.title}</p>
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
            <div className="w-full max-w-md mx-4 bg-gradient-to-b from-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                <h4 className="text-slate-200 font-semibold">{formMode === 'create' ? '新增' : '编辑'}资质</h4>
                <button onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">资质名称 <span className="text-red-400">*</span></label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：ISO 9001 质量管理体系认证" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">证书图片 <span className="text-red-400">*</span></label>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImgUpload} className="hidden" />
                  {imageUrl ? (
                    <div className="relative inline-block">
                      <img src={imageUrl} alt="证书" className="max-h-32 rounded-xl border border-slate-600" />
                      <button type="button" onClick={() => setImageUrl('')} className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center"><X size={12} /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={imgUploading}
                      className="w-full border-2 border-dashed border-slate-600 rounded-xl px-4 py-6 text-slate-500 hover:border-purple-500/50 hover:text-purple-400 transition-all flex flex-col items-center gap-1 disabled:opacity-50">
                      {imgUploading ? <><Loader2 className="size-6 animate-spin text-purple-400" /><span className="text-xs">上传中...</span></> : <><Upload size={20} /><span className="text-xs">点击上传证书图片</span></>}
                    </button>
                  )}
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

      {/* 删除确认 */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]" onClick={() => setDeleteTarget(null)} />
          <div className="fixed inset-0 z-[120] flex items-center justify-center">
            <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm mx-4">
              <h4 className="text-slate-200 font-semibold mb-2">确认删除</h4>
              <p className="text-slate-400 text-sm mb-6">删除「{deleteTarget.title}」？不可撤销。</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl border border-slate-600 text-slate-400 text-sm">取消</button>
                <button onClick={handleDelete} disabled={deleteLoading} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                  {deleteLoading && <Loader2 className="size-4 animate-spin" />}确认删除
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}