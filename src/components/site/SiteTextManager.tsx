import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Upload } from 'lucide-react';
import { uploadImageToStorage } from '../../lib/upload';

// ============================================================
// 类型
// ============================================================
interface SiteText {
  page_key: string;
  content: string;
  big_title?: string | null;
  sub_title?: string | null;
  cover_image?: string | null;
}

const PAGE_KEYS: { key: string; label: string }[] = [
  { key: 'about_intro', label: '🏢 集团简介' },
  { key: 'about_services', label: '🛠️ 服务产品描述' },
  { key: 'about_history', label: '📜 发展历程' },
];

export default function SiteTextManager() {
  const [selectedKey, setSelectedKey] = useState(PAGE_KEYS[0].key);
  const [content, setContent] = useState('');
  const [bigTitle, setBigTitle] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [originalBigTitle, setOriginalBigTitle] = useState('');
  const [originalSubTitle, setOriginalSubTitle] = useState('');
  const [originalCoverImage, setOriginalCoverImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 切换 page_key 时加载对应文本
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/site/texts?page_key=${selectedKey}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(result => {
        if (cancelled) return;
        if (result.success && result.data) {
          const d = result.data;
          setContent(d.content || '');
          setBigTitle(d.big_title || '');
          setSubTitle(d.sub_title || '');
          setCoverImage(d.cover_image || '');
          setOriginalContent(d.content || '');
          setOriginalBigTitle(d.big_title || '');
          setOriginalSubTitle(d.sub_title || '');
          setOriginalCoverImage(d.cover_image || '');
        } else {
          setContent('');
          setBigTitle('');
          setSubTitle('');
          setCoverImage('');
          setOriginalContent('');
          setOriginalBigTitle('');
          setOriginalSubTitle('');
          setOriginalCoverImage('');
        }
      })
      .catch(() => toast.error('加载文本失败'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedKey]);

  // 封面图片上传
  const handleCoverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    setImgUploading(true);
    try {
      const url = await uploadImageToStorage(file);
      setCoverImage(url);
      toast.success('封面图上传成功');
    } catch (err: any) { toast.error(err.message || '上传失败'); }
    finally { setImgUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  // 保存
  const handleSave = async () => {
    const isDirty =
      content !== originalContent ||
      bigTitle !== originalBigTitle ||
      subTitle !== originalSubTitle ||
      coverImage !== originalCoverImage;
    if (!isDirty) { toast.info('内容未修改'); return; }
    setSaving(true);
    try {
      const resp = await fetch(`/api/site/texts/${selectedKey}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          big_title: bigTitle || null,
          sub_title: subTitle || null,
          cover_image: coverImage || null,
        }),
      });
      const result = await resp.json();
      if (result.success) {
        toast.success('保存成功');
        setOriginalContent(content);
        setOriginalBigTitle(bigTitle);
        setOriginalSubTitle(subTitle);
        setOriginalCoverImage(coverImage);
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch {
      toast.error('网络异常');
    } finally {
      setSaving(false);
    }
  };

  // 检查是否有修改
  const isDirty =
    content !== originalContent ||
    bigTitle !== originalBigTitle ||
    subTitle !== originalSubTitle ||
    coverImage !== originalCoverImage;

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
          {/* ── 主标题 + 副标题 + 封面图 ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">📌 主标题（大标题）</label>
              <input
                type="text"
                value={bigTitle}
                onChange={e => setBigTitle(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50"
                placeholder="如：集团简介 / 服务特色"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">💬 副标题（导语）</label>
              <input
                type="text"
                value={subTitle}
                onChange={e => setSubTitle(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500/50"
                placeholder="如：深耕工程咨询行业二十余载..."
              />
            </div>
          </div>

          {/* ── 封面图上传 ── */}
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">🖼️ 顶部封面图</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            {coverImage ? (
              <div className="relative inline-block">
                <img src={coverImage} alt="封面图" className="max-h-40 rounded-xl border border-slate-600 object-cover" />
                <button type="button" onClick={() => setCoverImage('')}
                  className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                  <span className="text-xs leading-none">×</span>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={imgUploading}
                className="w-full border-2 border-dashed border-slate-600 rounded-xl px-4 py-6 text-slate-500 hover:border-slate-300 hover:text-slate-600 transition-all flex flex-col items-center gap-1 disabled:opacity-50">
                {imgUploading ? <><Loader2 className="size-6 animate-spin text-purple-400" /><span className="text-xs">上传中...</span></> : <><Upload size={20} /><span className="text-xs">点击上传封面图片（可选）</span></>}
              </button>
            )}
          </div>

          {/* ── 正文 ── */}
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
              rows={14}
              className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors resize-y text-sm leading-relaxed"
              placeholder="请输入该页面的正文内容..."
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
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