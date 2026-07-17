import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Search, RefreshCw, LogOut, LayoutDashboard, Building2, Users,
  Loader2, AlertTriangle, Save, DollarSign, CheckCircle2, Clock
} from 'lucide-react';

// ============================================================
// 类型定义
// ============================================================
interface FinancialPendingItem {
  id: number;
  projectId: number;
  projectName: string;
  businessType: string;
  reportMonth: string;
  pendingFields: string[];
}

interface FinancialEditRow {
  id: number;
  projectName: string;
  businessType: string;
  reportMonth: string;
  monthlyDirectCost: string;
  monthlyDeptCost: string;
  monthlyCompanyCost: string;
  cumulativeDirectCost: string;
  cumulativeDeptCost: string;
  cumulativeCompanyCost: string;
  monthlyTax: string;
  cumulativeTax: string;
  isComplete: boolean;
  dirty: boolean;
}

interface UserInfo {
  userId: string;
  name: string;
  loginTime: number;
}

// ============================================================
// 常量
// ============================================================
const FINANCIAL_FIELDS = [
  { key: 'monthlyDirectCost', label: '本月直接成本' },
  { key: 'monthlyDeptCost', label: '本月部门管理成本' },
  { key: 'monthlyCompanyCost', label: '本月公司分摊成本' },
  { key: 'cumulativeDirectCost', label: '累计直接成本' },
  { key: 'cumulativeDeptCost', label: '累计部门管理成本' },
  { key: 'cumulativeCompanyCost', label: '累计公司分摊成本' },
  { key: 'monthlyTax', label: '本月税金' },
  { key: 'cumulativeTax', label: '累计税金' },
];

// ============================================================
// 主页面组件 FinancialDataManager
// ============================================================
export default function FinancialDataManager() {
  const [rows, setRows] = useState<FinancialEditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [user, setUser] = useState<UserInfo | null>(null);

  // 获取当前用户
  useEffect(() => {
    fetch('/api/dingtalk/me')
      .then(r => r.json())
      .then(d => { if (d.success) setUser(d.user); })
      .catch(() => {});
  }, []);

  // 获取待填财务数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('📋 GET /api/weekly-reports/financial/pending');
      const resp = await fetch('/api/weekly-reports/financial/pending');
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '获取财务数据失败');
      }

      const items: FinancialPendingItem[] = result.data || [];
      console.log(`✅ 财务待填列表返回 ${items.length} 条记录`);

      // 转换为编辑行
      const editRows: FinancialEditRow[] = items.map(item => ({
        id: item.id,
        projectName: item.projectName,
        businessType: item.businessType,
        reportMonth: item.reportMonth,
        monthlyDirectCost: '',
        monthlyDeptCost: '',
        monthlyCompanyCost: '',
        cumulativeDirectCost: '',
        cumulativeDeptCost: '',
        cumulativeCompanyCost: '',
        monthlyTax: '',
        cumulativeTax: '',
        isComplete: item.pendingFields.length === 0,
        dirty: false,
      }));

      setRows(editRows);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || '获取财务数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 更新字段值
  const updateField = (rowIndex: number, field: string, value: string) => {
    setRows(prev => prev.map((row, i) => {
      if (i !== rowIndex) return row;
      return { ...row, [field]: value, dirty: true };
    }));
  };

  // 计算是否有修改
  const dirtyCount = rows.filter(r => r.dirty).length;

  // 批量保存
  const handleSaveAll = async () => {
    const dirtyRows = rows.filter(r => r.dirty);
    if (dirtyRows.length === 0) {
      toast.warning('没有需要保存的修改');
      return;
    }

    const records = dirtyRows.map(row => {
      const record: Record<string, unknown> = { id: row.id };
      FINANCIAL_FIELDS.forEach(f => {
        const val = (row as any)[f.key];
        if (val !== '' && val !== undefined) {
          record[f.key] = parseFloat(val);
        }
      });
      return record;
    });

    setSaving(true);
    try {
      console.log(`📤 PUT /api/weekly-reports/financial/batch - ${records.length} 条`);
      const resp = await fetch('/api/weekly-reports/financial/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '保存失败');
      }

      console.log(`✅ 财务批量更新完成: 成功=${result.data.successCount}, 失败=${result.data.failCount}`);
      toast.success(`保存成功：${result.data.successCount} 条，失败：${result.data.failCount} 条`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 登出
  const handleLogout = async () => {
    try {
      await fetch('/api/dingtalk/logout', { method: 'POST' });
    } catch (err) { /* ignore */ }
    window.location.href = '/';
  };

  // 筛选
  const filteredRows = rows.filter(row => {
    if (search && !row.projectName.includes(search)) return false;
    if (filterMonth && row.reportMonth && !row.reportMonth.startsWith(filterMonth)) return false;
    return true;
  });

  const inputClass = "bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors";
  const cellInputClass = "w-full bg-slate-700/50 border border-slate-600 rounded px-2 py-1.5 text-slate-200 text-xs text-right focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors";

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
            森宇集团 · 财务数据管理
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <a href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900/40 text-cyan-400 text-sm hover:bg-blue-900/20 transition-colors">
            <LayoutDashboard size={16} />
            指挥大屏
          </a>
          <a href="/project-manager"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900/40 text-cyan-400 text-sm hover:bg-blue-900/20 transition-colors">
            <Building2 size={16} />
            项目管理
          </a>
          <a href="/clients"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900/40 text-cyan-400 text-sm hover:bg-blue-900/20 transition-colors">
            <Users size={16} />
            客户管理
          </a>

          {user && (
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {user.name?.charAt(0) || '?'}
              </div>
              <span className="text-slate-300 text-sm">{user.name}</span>
            </div>
          )}

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
          {/* 月份选择器 */}
          <div className="flex items-center gap-2">
            <label className="text-slate-400 text-sm">月份：</label>
            <input type="month" className={inputClass} value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)} />
          </div>

          {/* 搜索 */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <input type="text" className={`${inputClass} pl-9 w-full`}
                placeholder="搜索项目名称..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {/* 刷新 */}
          <button onClick={fetchData}
            className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="刷新">
            <RefreshCw size={18} />
          </button>

          {/* 保存所有 */}
          <button onClick={handleSaveAll} disabled={dirtyCount === 0 || saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 transition-all font-medium shadow-lg shadow-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={18} />}
            保存所有{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
          </button>
        </div>

        {/* 修改提示 */}
        {dirtyCount > 0 && (
          <div className="mt-2 flex items-center gap-2 text-amber-400 text-sm">
            <Clock size={14} />
            有 {dirtyCount} 条记录已修改，请点击"保存所有"提交
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* Data Table */}
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
              <button onClick={fetchData}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                重试
              </button>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-20">
              <CheckCircle2 className="size-12 mx-auto mb-3 text-emerald-500" />
              <p className="text-slate-400 text-lg mb-1">所有项目财务数据已完整</p>
              <p className="text-slate-500 text-sm">没有需要填写的财务数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-blue-900/30 bg-slate-800/80">
                    <th className="text-left px-4 py-3 text-slate-400 text-xs font-medium whitespace-nowrap">项目名称</th>
                    <th className="text-left px-4 py-3 text-slate-400 text-xs font-medium whitespace-nowrap">业务类型</th>
                    <th className="text-left px-4 py-3 text-slate-400 text-xs font-medium whitespace-nowrap">报告月份</th>
                    {FINANCIAL_FIELDS.map(f => (
                      <th key={f.key} className="text-right px-3 py-3 text-slate-400 text-xs font-medium whitespace-nowrap">{f.label}</th>
                    ))}
                    <th className="text-center px-4 py-3 text-slate-400 text-xs font-medium whitespace-nowrap">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr key={row.id} className={`border-b border-slate-700/30 hover:bg-blue-900/10 transition-colors ${row.dirty ? 'bg-amber-900/5' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className="text-slate-200 text-sm font-medium">{row.projectName}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-slate-300 text-sm">{row.businessType || '-'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-slate-400 text-sm">{row.reportMonth || '-'}</span>
                      </td>
                      {FINANCIAL_FIELDS.map(f => (
                        <td key={f.key} className="px-1 py-1">
                          <input
                            type="number"
                            className={cellInputClass}
                            value={(row as any)[f.key]}
                            onChange={e => updateField(idx, f.key, e.target.value)}
                            placeholder="0"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-center">
                        {row.dirty ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-amber-900/20 text-amber-400 border border-amber-500/30">已修改</span>
                        ) : row.isComplete ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-emerald-900/20 text-emerald-400 border border-emerald-500/30">已填</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-red-900/20 text-red-400 border border-red-500/30">待填</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}