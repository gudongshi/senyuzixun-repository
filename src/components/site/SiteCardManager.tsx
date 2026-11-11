import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, X, Loader2, ChevronUp, ChevronDown } from 'lucide-react';

// ============================================================
// 类型
// ============================================================
interface SiteCard {
  id: number;
  page_key: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  items: string[];
  sort_order: number;
}

interface CardForm {
  title: string;
  subtitle: string;
  icon: string;
  items: string;  // 编辑时用换行分隔的文本
}

const PAGE_KEYS: { key: string; label: string }[] = [
  { key: 'services', label: '🛠️ 服务产品' },
  { key: 'about_feature', label: '🏗️ 企业风貌' },
];

const EMPTY_FORM: CardForm = { title: '', subtitle: '', icon: '', items: '' };

export default function SiteCardManager() {
  const [selectedPage, setSelectedPage] = useState(PAGE_KEYS[0].key);
  const [cards, setCards] = useState<SiteCard[]>([]);
  const [loading, setLoading] = useState(false);

  // 表单
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);

  // 删除
  const [deleteTarget, setDeleteTarget] = useState<SiteCard | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 排序
  const [reorderLoading, setReorderLoading] = useState(false);

  // 加载
  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/site/cards?page_key=${selectedPage}`, { credentials: 'same-origin' });
      const result = await resp.json();
      if (result.success) setCards(result.data || []);
      else toast.error(result.error || '加载失败');
    } catch { toast.error('网络异常'); }
    finally { setLoading(false); }
  }, [selectedPage]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  // 新增
  const handleCreate = () => {
    setFormMode('create'); setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true);
  };

  // 编辑
  const handleEdit = (card: SiteCard) => {
    setFormMode('edit'); setEditingId(card.id);
    setForm({
      title: card.title || '',
      subtitle: card.subtitle || '',
      icon: card.icon || '',
      items: (card.items || []).join('\n'),
    });
    setFormOpen(true);
  };

  // 提交
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('请填写标题'); return; }

    setFormLoading(true);
    try {
      const body = {
        page_key: selectedPage,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        icon: form.icon.trim() || null,
        items: form.items.split('\n').map(s => s.trim()).filter(Boolean),
      };

      const url = formMode === 'create' ? '/api/site/cards' : `/api/site/cards/${editingId}`;
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
        fetchCards();
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch { toast.error('网络异常'); }
    finally { setFormLoading(false); }
  };

  // 删除
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const resp = await fetch(`/api/site/cards/${deleteTarget.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const result = await resp.json();
      if (result.success) { toast.success('已删除'); setDeleteTarget(null); fetchCards(); }
      else toast.error(result.error || '删除失败');
    } catch { toast.error('网络异常'); }
    finally { setDeleteLoading(false); }
  };

  // 上移 / 下移
  const handleReorder = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= cards.length) return;

    const newCards = [...cards];
    [newCards[index], newCards[targetIndex]] = [newCards[targetIndex], newCards[index]];

    // 乐观更新
    setCards(newCards);
    setReorderLoading(true);
    try {
      const orders = newCards.map((c, i) => ({ id: c.id, sort_order: i }));
      const resp = await fetch('/api/site/cards/reorder', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      const result = await resp.json();
      if (!result.success) {
        toast.error(result.error || '排序失败');
        fetchCards(); // 回滚
      }
    } catch { toast.error('网络异常'); fetchCards(); }
    finally { setReorderLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* 页面选择 + 新增 */}
      <div className="flex items-center gap-3">
        <select
          value={selectedPage}
          onChange={e => setSelectedPage(e.target.value)}
          className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50"
        >
          {PAGE_KEYS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={handleCreate} className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all flex items-center gap-2">
          <Plus size={16} />新增卡片
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-8 text-purple-400 animate-spin" /></div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-slate-500">暂无卡片，点击右上角新增</div>
      ) : (
        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {cards.map((card, i) => (
            <div key={card.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-start gap-4 hover:border-purple-500/20 transition-colors">
              {/* 排序按钮 */}
              <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                <button onClick={() => handleReorder(i, -1)} disabled={i === 0 || reorderLoading}
                  className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                  <ChevronUp size={14} /></button>
                <button onClick={() => handleReorder(i, 1)} disabled={i === cards.length - 1 || reorderLoading}
                  className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                  <ChevronDown size={14} /></button>
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <h4 className="text-slate-200 font-medium text-sm">{card.title}</h4>
                {card.subtitle && <p className="text-xs text-slate-500 mt-0.5">{card.subtitle}</p>}
                {card.icon && <span className="text-xs text-purple-400 mt-1 inline-block">🎨 {card.icon}</span>}
                {(card.items || []).length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {card.items.map((item, j) => (
                      <li key={j} className="text-xs text-slate-400 flex items-start gap-1.5">
                        <span className="text-purple-400 shrink-0 mt-0.5">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 操作 */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleEdit(card)} className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-700/50"><Edit size={16} /></button>
                <button onClick={() => setDeleteTarget(card)} className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700/50"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {formOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]" onClick={() => setFormOpen(false)} />
          <div className="fixed inset-0 z-[120] flex items-start justify-center pt-16">
            <div className="w-full max-w-lg mx-4 bg-gradient-to-b from-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                <h4 className="text-slate-200 font-semibold">{formMode === 'create' ? '新增' : '编辑'}卡片</h4>
                <button onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">标题 <span className="text-red-400">*</span></label>
                  <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：招标代理" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">副标题</label>
                  <input type="text" value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="可选" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">图标名（Lucide icon）</label>
                  <input type="text" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50" placeholder="如：Scale, FileText, Shield" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">打勾清单（一行一个）</label>
                  <textarea value={form.items} onChange={e => setForm(f => ({ ...f, items: e.target.value }))} rows={5}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50 resize-y"
                    placeholder="如：&#10;项目全过程管理&#10;合同管理&#10;进度控制" />
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