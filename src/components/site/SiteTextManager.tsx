import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

// ============================================================
// 类型
// ============================================================
interface SiteText {
  page_key: string;
  content: string;
}

const PAGE_KEYS: { key: string; label: string }[] = [
  { key: 'about_intro', label: '🏢 集团简介' },
  { key: 'about_services', label: '🛠️ 服务产品描述' },
];

export default function SiteTextManager() {
  const [selectedKey, setSelectedKey] = useState(PAGE_KEYS[0].key);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 切换 page_key 时加载对应文本
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/site/texts?page_key=${selectedKey}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(result => {
        if (cancelled) return;
        if (result.success && result.data) {
          setContent(result.data.content || '');
          setOriginalContent(result.data.content || '');
        } else {
          setContent('');
          setOriginalContent('');
        }
      })
      .catch(() => toast.error('加载文本失败'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey]);

  // 保存
  const handleSave = async () => {
    if (content === originalContent) { toast.info('内容未修改'); return; }
    setSaving(true);
    try {
      const resp = await fetch(`/api/site/texts/${selectedKey}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const result = await resp.json();
      if (result.success) {
        toast.success('保存成功');
        setOriginalContent(content);
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch {
      toast.error('网络异常');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 页面选择 */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400 shrink-0">选择页面：</label>
        <select
          value={selectedKey}
          onChange={e => setSelectedKey(e.target.value)}
          className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50"
        >
          {PAGE_KEYS.map(p => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* 编辑器 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 text-purple-400 animate-spin" />
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400">
                正文内容 <span className="text-xs text-slate-600">（支持换行）</span>
              </label>
              <span className="text-xs text-slate-600">{content.length} 字</span>
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={16}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-colors resize-y text-sm leading-relaxed"
              placeholder="请输入该页面的正文内容..."
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || content === originalContent}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={16} />}
              保存
            </button>
          </div>
        </>
      )}
    </div>
  );
}