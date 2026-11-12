import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, X, Loader2, Search,
  Newspaper, Briefcase, Eye, Upload, ImageIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ============================================================
// 类型定义
// ============================================================
interface NewsItem {
  id: number;
  title: string;
  cover_image: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
}

interface CaseItem {
  id: number;
  title: string;
  cover_image: string | null;
  content: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

type TabKey = 'news' | 'cases';

interface NewsForm {
  title: string;
  cover_image: string;
  content: string;
}

interface CaseForm {
  title: string;
  cover_image: string;
  content: string;
  tags: string;
}

const EMPTY_NEWS: NewsForm = { title: '', cover_image: '', content: '' };
const EMPTY_CASE: CaseForm = { title: '', cover_image: '', content: '', tags: '' };

// ============================================================
// 图片压缩（Canvas，最大宽度 1200px，JPEG quality 0.85）
// ============================================================
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_W = 1200;
      let w = img.width;
      let h = img.height;
      if (w > MAX_W) {
        h = Math.round(h * (MAX_W / w));
        w = MAX_W;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 不可用')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('压缩失败')),
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

// ============================================================
// 上传图片到 Supabase Storage，返回 public URL
// ============================================================
async function uploadCoverImage(file: File): Promise<string> {
  // 压缩
  const compressed = await compressImage(file);

  // 生成唯一文件名
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('site_images')
    .upload(filename, compressed, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw error;

  // 获取公开 URL
  const { data: urlData } = supabase.storage
    .from('site_images')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

// ============================================================
// 组件
// ============================================================
export default function SiteContentManager({
  open,
  onClose,
  embedded = false,
}: {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
}) {
  // ---- Tab 状态 ----
  const [tab, setTab] = useState<TabKey>('news');

  // ---- 新闻状态 ----
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [newsPage, setNewsPage] = useState(1);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSearch, setNewsSearch] = useState('');

  // ---- 案例状态 ----
  const [casesList, setCasesList] = useState<CaseItem[]>([]);
  const [casesTotal, setCasesTotal] = useState(0);
  const [casesPage, setCasesPage] = useState(1);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesSearch, setCasesSearch] = useState('');

  // ---- 表单状态 ----
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newsForm, setNewsForm] = useState<NewsForm>(EMPTY_NEWS);
  const [caseForm, setCaseForm] = useState<CaseForm>(EMPTY_CASE);
  const [formLoading, setFormLoading] = useState(false);

  // ---- 图片上传状态 ----
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- 删除确认 ----
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string; type: TabKey } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ---- 预览 ----
  const [previewItem, setPreviewItem] = useState<NewsItem | CaseItem | null>(null);
  const [previewType, setPreviewType] = useState<TabKey>('news');

  const PAGE_SIZE = 10;

  // ==========================================================
  // 加载新闻列表
  // ==========================================================
  const fetchNews = useCallback(async (page = 1) => {
    setNewsLoading(true);
    try {
      const resp = await fetch(`/api/site/news?page=${page}&limit=${PAGE_SIZE}`, {
        credentials: 'same-origin',
      });
      const result = await resp.json();
      if (result.success) {
        setNewsList(result.data || []);
        setNewsTotal(result.total || 0);
        setNewsPage(page);
      } else {
        toast.error(result.error || '加载新闻失败');
      }
    } catch (err: any) {
      toast.error('网络异常');
    } finally {
      setNewsLoading(false);
    }
  }, []);

  // ==========================================================
  // 加载案例列表
  // ==========================================================
  const fetchCases = useCallback(async (page = 1) => {
    setCasesLoading(true);
    try {
      const resp = await fetch(`/api/site/cases?page=${page}&limit=${PAGE_SIZE}`, {
        credentials: 'same-origin',
      });
      const result = await resp.json();
      if (result.success) {
        setCasesList(result.data || []);
        setCasesTotal(result.total || 0);
        setCasesPage(page);
      } else {
        toast.error(result.error || '加载案例失败');
      }
    } catch (err: any) {
      toast.error('网络异常');
    } finally {
      setCasesLoading(false);
    }
  }, []);

  // ==========================================================
  // 弹窗打开时拉数据，关闭时清状态
  // ==========================================================
  useEffect(() => {
    if (open) {
      fetchNews(1);
      fetchCases(1);
      setNewsSearch('');
      setCasesSearch('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================================
  // 打开新增表单
  // ==========================================================
  const handleCreate = () => {
    setFormMode('create');
    setEditingId(null);
    if (tab === 'news') {
      setNewsForm(EMPTY_NEWS);
    } else {
      setCaseForm(EMPTY_CASE);
    }
    setFormOpen(true);
  };

  // ==========================================================
  // 打开编辑表单
  // ==========================================================
  const handleEdit = (item: NewsItem | CaseItem) => {
    setFormMode('edit');
    setEditingId(item.id);
    if (tab === 'news') {
      const n = item as NewsItem;
      setNewsForm({
        title: n.title || '',
        cover_image: n.cover_image || '',
        content: n.content || '',
      });
    } else {
      const c = item as CaseItem;
      setCaseForm({
        title: c.title || '',
        cover_image: c.cover_image || '',
        content: c.content || '',
        tags: c.tags || '',
      });
    }
    setFormOpen(true);
  };

  // ==========================================================
  // 图片上传处理
  // ==========================================================
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 文件类型校验
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    setUploadLoading(true);
    try {
      const publicUrl = await uploadCoverImage(file);
      // 写入当前 Tab 的表单
      if (tab === 'news') {
        setNewsForm(f => ({ ...f, cover_image: publicUrl }));
      } else {
        setCaseForm(f => ({ ...f, cover_image: publicUrl }));
      }
      toast.success('封面上传成功');
    } catch (err: any) {
      console.error('❌ 图片上传失败:', err.message);
      toast.error(err.message || '图片上传失败');
    } finally {
      setUploadLoading(false);
      // 清空 input 以便重复选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ==========================================================
  // 移除封面图
  // ==========================================================
  const handleRemoveCover = () => {
    if (tab === 'news') {
      setNewsForm(f => ({ ...f, cover_image: '' }));
    } else {
      setCaseForm(f => ({ ...f, cover_image: '' }));
    }
  };

  // ==========================================================
  // 提交表单
  // ==========================================================
  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const currentForm = tab === 'news' ? newsForm : caseForm;
    if (!currentForm.title.trim()) {
      toast.error('请填写标题');
      return;
    }

    setFormLoading(true);
    try {
      const endpoint = `/api/site/${tab}`;
      const method = formMode === 'create' ? 'POST' : 'PUT';
      const url = formMode === 'create' ? endpoint : `${endpoint}/${editingId}`;

      const body: Record<string, string> = {};
      if (tab === 'news') {
        body.title = newsForm.title.trim();
        body.cover_image = newsForm.cover_image.trim();
        body.content = newsForm.content;
      } else {
        body.title = caseForm.title.trim();
        body.cover_image = caseForm.cover_image.trim();
        body.content = caseForm.content;
        body.tags = caseForm.tags.trim();
      }

      const resp = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();

      if (result.success) {
        toast.success(formMode === 'create' ? '新增成功' : '更新成功');
        setFormOpen(false);
        tab === 'news' ? fetchNews(newsPage) : fetchCases(casesPage);
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (err: any) {
      toast.error('网络异常');
    } finally {
      setFormLoading(false);
    }
  };

  // ==========================================================
  // 删除
  // ==========================================================
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const resp = await fetch(`/api/site/${deleteTarget.type}/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const result = await resp.json();
      if (result.success) {
        toast.success('已删除');
        setDeleteTarget(null);
        deleteTarget.type === 'news' ? fetchNews(newsPage) : fetchCases(casesPage);
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (err: any) {
      toast.error('网络异常');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ==========================================================
  // 搜索过滤（前端简单过滤）
  // ==========================================================
  const filteredNews = newsSearch.trim()
    ? newsList.filter(n => n.title.includes(newsSearch.trim()))
    : newsList;
  const filteredCases = casesSearch.trim()
    ? casesList.filter(c => c.title.includes(casesSearch.trim()))
    : casesList;

  // ==========================================================
  // 分页控件
  // ==========================================================
  const totalPages = tab === 'news'
    ? Math.max(1, Math.ceil(newsTotal / PAGE_SIZE))
    : Math.max(1, Math.ceil(casesTotal / PAGE_SIZE));
  const currentPage = tab === 'news' ? newsPage : casesPage;

  // ==========================================================
  // 渲染
  // ==========================================================
  if (!open) return null;

  // ── 内嵌模式（在 SiteHubManager 中渲染）──
  if (embedded) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4">
          {([
            { key: 'news' as TabKey, label: '📰 新闻管理', icon: Newspaper },
            { key: 'cases' as TabKey, label: '🏗️ 案例管理', icon: Briefcase },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                tab === t.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Toolbar */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                value={tab === 'news' ? newsSearch : casesSearch}
                onChange={e => tab === 'news' ? setNewsSearch(e.target.value) : setCasesSearch(e.target.value)}
                placeholder={tab === 'news' ? '搜索新闻标题...' : '搜索案例标题...'}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-500/20 transition-colors text-sm"
              />
            </div>
            <button
              onClick={handleCreate}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-all flex items-center gap-2 shrink-0"
            >
              <Plus size={16} />
              新增{tab === 'news' ? '新闻' : '案例'}
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
            <span className="text-sm text-slate-500 whitespace-nowrap">
              共 <span className="text-indigo-600 font-bold">{tab === 'news' ? newsTotal : casesTotal}</span> 条记录
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          </div>

          {/* Loading */}
          {(tab === 'news' ? newsLoading : casesLoading) && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-10 text-indigo-400 animate-spin" />
            </div>
          )}

          {/* Empty */}
          {!(tab === 'news' ? newsLoading : casesLoading) && (tab === 'news' ? filteredNews : filteredCases).length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="size-14 text-slate-300 mb-4" />
              <p className="text-slate-400 text-lg font-medium mb-1">暂无{tab === 'news' ? '新闻' : '案例'}内容</p>
              <p className="text-slate-500 text-sm">点击右上角按钮新增</p>
            </div>
          )}

          {/* List */}
          {!(tab === 'news' ? newsLoading : casesLoading) && (tab === 'news' ? filteredNews : filteredCases).length > 0 && (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {(tab === 'news' ? filteredNews : filteredCases).map((item: any) => (
                <div
                  key={item.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-slate-800 font-medium text-sm mb-1 line-clamp-1">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{new Date(item.created_at).toLocaleDateString('zh-CN')}</span>
                        {tab === 'cases' && item.tags && (
                          <span className="text-indigo-600">🏷️ {item.tags}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setPreviewItem(item); setPreviewType(tab); }}
                        className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="预览"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="编辑"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: item.id, title: item.title, type: tab })}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => tab === 'news' ? fetchNews(currentPage - 1) : fetchCases(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-sm hover:border-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                上一页
              </button>
              <span className="text-sm text-slate-500 px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => tab === 'news' ? fetchNews(currentPage + 1) : fetchCases(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-sm hover:border-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-10 overflow-y-auto">
        <div className="relative w-full max-w-5xl mx-4 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl shadow-purple-900/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/30 bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-purple-900/30 flex items-center justify-center">
                <Newspaper className="size-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-200">✍️ 官网内容管理</h3>
                <p className="text-xs text-slate-500">管理官网新闻和经典案例内容</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700/50 px-6">
            {([
              { key: 'news' as TabKey, label: '📰 新闻管理', icon: Newspaper },
              { key: 'cases' as TabKey, label: '🏗️ 案例管理', icon: Briefcase },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                  tab === t.key
                    ? 'border-purple-400 text-purple-300'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Toolbar */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                <input
                  type="text"
                  value={tab === 'news' ? newsSearch : casesSearch}
                  onChange={e => tab === 'news' ? setNewsSearch(e.target.value) : setCasesSearch(e.target.value)}
                  placeholder={tab === 'news' ? '搜索新闻标题...' : '搜索案例标题...'}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-xl pl-10 pr-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-colors text-sm"
                />
              </div>
              <button
                onClick={handleCreate}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all flex items-center gap-2 shrink-0"
              >
                <Plus size={16} />
                新增{tab === 'news' ? '新闻' : '案例'}
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
              <span className="text-sm text-slate-400 whitespace-nowrap">
                共 <span className="text-purple-400 font-bold">{tab === 'news' ? newsTotal : casesTotal}</span> 条记录
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
            </div>

            {/* Loading */}
            {(tab === 'news' ? newsLoading : casesLoading) && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-10 text-purple-400 animate-spin" />
              </div>
            )}

            {/* Empty */}
            {!(tab === 'news' ? newsLoading : casesLoading) && (tab === 'news' ? filteredNews : filteredCases).length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="size-14 text-slate-600 mb-4" />
                <p className="text-slate-400 text-lg font-medium mb-1">暂无{tab === 'news' ? '新闻' : '案例'}内容</p>
                <p className="text-slate-600 text-sm">点击右上角按钮新增</p>
              </div>
            )}

            {/* List */}
            {!(tab === 'news' ? newsLoading : casesLoading) && (tab === 'news' ? filteredNews : filteredCases).length > 0 && (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {(tab === 'news' ? filteredNews : filteredCases).map((item: any) => (
                  <div
                    key={item.id}
                    className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:border-purple-500/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-slate-200 font-medium text-sm mb-1 line-clamp-1">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>{new Date(item.created_at).toLocaleDateString('zh-CN')}</span>
                          {tab === 'cases' && item.tags && (
                            <span className="text-purple-400">🏷️ {item.tags}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setPreviewItem(item); setPreviewType(tab); }}
                          className="p-2 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-slate-700/50 transition-colors"
                          title="预览"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-700/50 transition-colors"
                          title="编辑"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: item.id, title: item.title, type: tab })}
                          className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700/50 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => tab === 'news' ? fetchNews(currentPage - 1) : fetchCases(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-sm hover:border-purple-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <span className="text-sm text-slate-400 px-2">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => tab === 'news' ? fetchNews(currentPage + 1) : fetchCases(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-sm hover:border-purple-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* 新增/编辑弹窗 */}
      {/* ========================================================== */}
      {formOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]" onClick={() => setFormOpen(false)} />
          <div className="fixed inset-0 z-[120] flex items-start justify-center pt-16 overflow-y-auto">
            <div className="relative w-full max-w-2xl mx-4 bg-gradient-to-b from-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                <h4 className="text-slate-200 font-semibold">
                  {formMode === 'create' ? '新增' : '编辑'}{tab === 'news' ? '新闻' : '案例'}
                </h4>
                <button onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                {/* 标题 */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">标题 <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={tab === 'news' ? newsForm.title : caseForm.title}
                    onChange={e => tab === 'news'
                      ? setNewsForm(f => ({ ...f, title: e.target.value }))
                      : setCaseForm(f => ({ ...f, title: e.target.value }))
                    }
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-colors"
                    placeholder="请输入标题"
                  />
                </div>

                {/* 封面图 */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">封面图</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {(tab === 'news' ? newsForm.cover_image : caseForm.cover_image) ? (
                    /* 已有封面：显示预览 + 更换/移除按钮 */
                    <div className="relative inline-block">
                      <img
                        src={tab === 'news' ? newsForm.cover_image : caseForm.cover_image}
                        alt="封面预览"
                        className="rounded-xl max-h-48 object-cover border border-slate-600"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadLoading}
                          className="px-2 py-1 rounded-lg bg-slate-900/80 text-xs text-slate-300 border border-slate-600 hover:border-purple-400 transition-colors"
                        >
                          {uploadLoading ? '上传中...' : '更换'}
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveCover}
                          className="px-2 py-1 rounded-lg bg-slate-900/80 text-xs text-red-400 border border-slate-600 hover:border-red-400 transition-colors"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 未上传：显示上传区域 */
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLoading}
                      className="w-full border-2 border-dashed border-slate-600 rounded-xl px-4 py-8 text-slate-500 hover:border-purple-500/50 hover:text-purple-400 transition-all flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadLoading ? (
                        <>
                          <Loader2 className="size-8 animate-spin text-purple-400" />
                          <span className="text-sm text-purple-400">正在压缩并上传...</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="size-8" />
                          <span className="text-sm">点击上传封面图</span>
                          <span className="text-xs text-slate-600">支持 JPG / PNG / WebP，自动压缩至 1200px 宽</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* 标签（仅案例） */}
                {tab === 'cases' && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">标签</label>
                    <input
                      type="text"
                      value={caseForm.tags}
                      onChange={e => setCaseForm(f => ({ ...f, tags: e.target.value }))}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-colors"
                      placeholder='用逗号分隔，如：监理,造价'
                    />
                  </div>
                )}

                {/* 正文 */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">正文</label>
                  <textarea
                    value={tab === 'news' ? newsForm.content : caseForm.content}
                    onChange={e => tab === 'news'
                      ? setNewsForm(f => ({ ...f, content: e.target.value }))
                      : setCaseForm(f => ({ ...f, content: e.target.value }))
                    }
                    rows={8}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-colors resize-y"
                    placeholder="请输入正文内容..."
                  />
                </div>

                {/* 按钮 */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-400 text-sm hover:border-slate-500 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {formLoading && <Loader2 className="size-4 animate-spin" />}
                    {formMode === 'create' ? '创建' : '保存'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* 预览弹窗 */}
      {/* ========================================================== */}
      {previewItem && (
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110]" onClick={() => setPreviewItem(null)} />
          <div className="fixed inset-0 z-[120] flex items-start justify-center pt-10 overflow-y-auto">
            <div className="relative w-full max-w-3xl mx-4 bg-gradient-to-b from-slate-800 to-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
                <h4 className="text-slate-200 font-semibold">预览{previewType === 'news' ? '新闻' : '案例'}</h4>
                <button onClick={() => setPreviewItem(null)} className="text-slate-500 hover:text-slate-300">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {(previewItem as any).cover_image && (
                  <img
                    src={(previewItem as any).cover_image}
                    alt={previewItem.title}
                    className="w-full rounded-xl max-h-64 object-cover border border-slate-700"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <h3 className="text-xl font-bold text-slate-100">{previewItem.title}</h3>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{new Date(previewItem.created_at).toLocaleDateString('zh-CN')}</span>
                  {previewType === 'cases' && (previewItem as CaseItem).tags && (
                    <span className="text-purple-400">🏷️ {(previewItem as CaseItem).tags}</span>
                  )}
                </div>
                <div className="border-t border-slate-700/50 pt-4">
                  <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {previewItem.content || '(无正文内容)'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* 删除确认弹窗 */}
      {/* ========================================================== */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]" onClick={() => setDeleteTarget(null)} />
          <div className="fixed inset-0 z-[120] flex items-center justify-center">
            <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
              <h4 className="text-slate-200 font-semibold mb-2">确认删除</h4>
              <p className="text-slate-400 text-sm mb-6">
                确定要删除「{deleteTarget.title}」吗？此操作不可撤销。
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-600 text-slate-400 text-sm hover:border-slate-500 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {deleteLoading && <Loader2 className="size-4 animate-spin" />}
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}