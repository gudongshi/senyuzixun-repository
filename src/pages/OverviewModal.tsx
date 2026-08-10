import { useEffect, useRef, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { X, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// 类型定义
// ============================================================
interface OverviewKPI {
  contractAmount: number;
  targetCost: number;
  receivedAmount: number;
  paymentRate: number;
  completedValue: number;
  expenseContractAmount: number;
  paidAmount: number;
  expensePaymentRate: number;
}

interface CostComparisonItem {
  projectName: string;
  actualCost: number;
  targetCost: number;
  costProgress: number;
}

interface ExpenseCategoryItem {
  category: string;
  actualCost: number;
  targetCost: number;
  costProgress: number;
}

interface OverviewData {
  kpi: OverviewKPI;
  costComparison: CostComparisonItem[];
  expenseCategory: ExpenseCategoryItem[];
  yearlyNewContract: number;
  yearlyNewExpenseContract: number;
  yearlyNewCost: number;
  totalProjects: number;
  lastUpdated: string;
}

// ============================================================
// 业务类型选项
// ============================================================
const BUSINESS_TYPES = [
  '全过程咨询',
  '工程咨询',
  '项目管理',
  '工程监理',
  '综合咨询',
  '招标代理',
  '政府采购',
  '造价咨询',
  '造价鉴定',
];

// ============================================================
// 导航菜单项
// ============================================================
const NAV_ITEMS = [
  { label: '项目档案', icon: '📁' },
  { label: '投标信息', icon: '📋' },
  { label: '项目立项', icon: '🚀' },
  { label: '项目进度看板', icon: '📊' },
  { label: '成本总看板', icon: '💰' },
  { label: '查看全部', icon: '🔍' },
];

// ============================================================
// 工具函数
// ============================================================
function formatWan(amount: number): string {
  const wan = amount / 10000;
  if (wan >= 10000) {
    return `${(wan / 10000).toFixed(2)}亿`;
  }
  return `${wan.toFixed(2)}万`;
}

function formatPercent(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

// ============================================================
// KPI 卡片配置
// ============================================================
const KPI_CARDS: {
  key: keyof OverviewKPI;
  label: string;
  gradient: string;
  borderColor: string;
  isPercent?: boolean;
  isMoney?: boolean;
}[] = [
  { key: 'contractAmount', label: '合同金额', gradient: 'from-blue-600 to-blue-400', borderColor: 'border-blue-500/30', isMoney: true },
  { key: 'targetCost', label: '目标成本', gradient: 'from-cyan-600 to-cyan-400', borderColor: 'border-cyan-500/30', isMoney: true },
  { key: 'receivedAmount', label: '工程回款', gradient: 'from-emerald-600 to-emerald-400', borderColor: 'border-emerald-500/30', isMoney: true },
  { key: 'paymentRate', label: '回款进度', gradient: 'from-purple-600 to-purple-400', borderColor: 'border-purple-500/30', isPercent: true },
  { key: 'completedValue', label: '完成产值', gradient: 'from-orange-600 to-orange-400', borderColor: 'border-orange-500/30', isMoney: true },
  { key: 'expenseContractAmount', label: '支出合同总额', gradient: 'from-red-600 to-red-400', borderColor: 'border-red-500/30', isMoney: true },
  { key: 'paidAmount', label: '付款金额', gradient: 'from-pink-600 to-pink-400', borderColor: 'border-pink-500/30', isMoney: true },
  { key: 'expensePaymentRate', label: '支出支付率', gradient: 'from-slate-600 to-slate-400', borderColor: 'border-slate-500/30', isPercent: true },
];

// ============================================================
// 主组件
// ============================================================
interface OverviewModalProps {
  open?: boolean;
  onClose: () => void;
}

export default function OverviewModal({ open = false, onClose }: OverviewModalProps) {
  // 🔍 调试日志：每次渲染都输出 open 值
  console.log('🔍 OverviewModal 渲染中, open=', open);

  // ---- 状态 ----
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [businessType, setBusinessType] = useState('');

  // ---- 图表 refs ----
  const costChartRef = useRef<HTMLDivElement>(null);
  const expenseChartRef = useRef<HTMLDivElement>(null);
  const costChartInstance = useRef<echarts.ECharts | null>(null);
  const expenseChartInstance = useRef<echarts.ECharts | null>(null);

  // ============================================================
  // 数据获取
  // ============================================================
  const fetchData = useCallback(async () => {
    console.log('🔍 fetchData 被调用, year=', year, 'businessType=', businessType);
    setLoading(true);
    setError(null);
    console.log(`📋 GET /api/stats/overview - 年份: ${year}, 业务类型: ${businessType || '全部'}`);

    try {
      const params = new URLSearchParams();
      params.set('year', String(year));
      if (businessType) params.set('businessType', businessType);

      const resp = await fetch(`/api/stats/overview?${params.toString()}`);
      const result = await resp.json();

      console.log('🔍 API 响应:', JSON.stringify(result).slice(0, 200));

      if (result.success && result.data) {
        console.log(`✅ 经营总看板数据获取成功: ${result.data.totalProjects} 个项目`);
        setData(result.data);
      } else {
        console.error(`❌ 经营总看板数据获取失败: ${result.error || '未知错误'}`);
        setError(result.error || '获取数据失败');
      }
    } catch (err: any) {
      console.error(`❌ 经营总看板请求异常: ${err.message}`);
      setError(err.message || '网络请求失败');
    } finally {
      setLoading(false);
    }
  }, [year, businessType]);

  // ---- 监听 year / businessType 变化自动刷新 ----
  useEffect(() => {
    console.log('🔍 useEffect[open,fetchData] 触发, open=', open);
    if (open) {
      console.log('🔍 open=true，开始调用 fetchData');
      fetchData();
    } else {
      console.log('🔍 open=false，跳过数据获取');
    }
  }, [open, fetchData]);

  // ============================================================
  // 图表渲染
  // ============================================================
  useEffect(() => {
    console.log('🔍 useEffect[data,open] 图表渲染触发, data=', !!data, 'open=', open);
    if (!data || !open) return;

    // --- 成本对比分析图表 ---
    if (costChartRef.current) {
      if (costChartInstance.current) costChartInstance.current.dispose();
      const chart = echarts.init(costChartRef.current);
      costChartInstance.current = chart;

      const projectNames = data.costComparison.map(item => item.projectName);
      const actualCosts = data.costComparison.map(item => item.actualCost);
      const targetCosts = data.costComparison.map(item => item.targetCost);
      const costProgresses = data.costComparison.map(item => item.costProgress);

      chart.setOption({
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          textStyle: { color: '#e2e8f0' },
          formatter: (params: any) => {
            let html = `<div style="font-weight:bold;margin-bottom:4px">${params[0].name}</div>`;
            params.forEach((p: any) => {
              const val = p.seriesName === '成本进度'
                ? `${p.value.toFixed(1)}%`
                : `¥${formatWan(p.value)}`;
              html += `<div>${p.marker} ${p.seriesName}: ${val}</div>`;
            });
            return html;
          },
        },
        legend: {
          data: ['实际成本', '目标成本', '成本进度'],
          textStyle: { color: '#94a3b8' },
          top: 0,
        },
        grid: {
          left: '3%',
          right: '5%',
          bottom: '8%',
          top: '40px',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: projectNames,
          axisLabel: {
            color: '#94a3b8',
            rotate: projectNames.length > 6 ? 30 : 0,
            fontSize: 11,
            formatter: (value: string) => value.length > 6 ? value.slice(0, 6) + '...' : value,
          },
          axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.3)' } },
          axisTick: { show: false },
        },
        yAxis: [
          {
            type: 'value',
            name: '金额（万元）',
            nameTextStyle: { color: '#94a3b8', fontSize: 11 },
            axisLabel: {
              color: '#94a3b8',
              formatter: (value: number) => formatWan(value),
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
          },
          {
            type: 'value',
            name: '百分比',
            max: 100,
            nameTextStyle: { color: '#94a3b8', fontSize: 11 },
            axisLabel: { color: '#94a3b8', formatter: '{value}%' },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: '实际成本',
            type: 'bar',
            data: actualCosts,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#f97316' },
                { offset: 1, color: '#ea580c' },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
            barMaxWidth: 40,
          },
          {
            name: '目标成本',
            type: 'bar',
            data: targetCosts,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#06b6d4' },
                { offset: 1, color: '#0891b2' },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
            barMaxWidth: 40,
          },
          {
            name: '成本进度',
            type: 'line',
            yAxisIndex: 1,
            data: costProgresses,
            lineStyle: { color: '#fbbf24', width: 2.5 },
            itemStyle: { color: '#fbbf24' },
            symbol: 'circle',
            symbolSize: 6,
            label: {
              show: true,
              color: '#fbbf24',
              fontSize: 10,
              formatter: '{c}%',
              position: 'top',
            },
          },
        ],
      });
      chart.resize();
    }

    // --- 支出分类分析图表 ---
    if (expenseChartRef.current) {
      if (expenseChartInstance.current) expenseChartInstance.current.dispose();
      const chart = echarts.init(expenseChartRef.current);
      expenseChartInstance.current = chart;

      const categories = data.expenseCategory.map(item => item.category);
      const actualCosts = data.expenseCategory.map(item => item.actualCost);
      const targetCosts = data.expenseCategory.map(item => item.targetCost);
      const costProgresses = data.expenseCategory.map(item => item.costProgress);

      chart.setOption({
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(56, 189, 248, 0.3)',
          textStyle: { color: '#e2e8f0' },
          formatter: (params: any) => {
            let html = `<div style="font-weight:bold;margin-bottom:4px">${params[0].name}</div>`;
            params.forEach((p: any) => {
              const val = p.seriesName === '成本进度'
                ? `${p.value.toFixed(1)}%`
                : `¥${formatWan(p.value)}`;
              html += `<div>${p.marker} ${p.seriesName}: ${val}</div>`;
            });
            return html;
          },
        },
        legend: {
          data: ['实际成本', '目标成本', '成本进度'],
          textStyle: { color: '#94a3b8' },
          top: 0,
        },
        grid: {
          left: '3%',
          right: '5%',
          bottom: '8%',
          top: '40px',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: categories,
          axisLabel: { color: '#94a3b8', fontSize: 11 },
          axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.3)' } },
          axisTick: { show: false },
        },
        yAxis: [
          {
            type: 'value',
            name: '金额（万元）',
            nameTextStyle: { color: '#94a3b8', fontSize: 11 },
            axisLabel: {
              color: '#94a3b8',
              formatter: (value: number) => formatWan(value),
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
          },
          {
            type: 'value',
            name: '百分比',
            max: 100,
            nameTextStyle: { color: '#94a3b8', fontSize: 11 },
            axisLabel: { color: '#94a3b8', formatter: '{value}%' },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: '实际成本',
            type: 'bar',
            data: actualCosts,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#ef4444' },
                { offset: 1, color: '#dc2626' },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
            barMaxWidth: 50,
          },
          {
            name: '目标成本',
            type: 'bar',
            data: targetCosts,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#8b5cf6' },
                { offset: 1, color: '#7c3aed' },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
            barMaxWidth: 50,
          },
          {
            name: '成本进度',
            type: 'line',
            yAxisIndex: 1,
            data: costProgresses,
            lineStyle: { color: '#34d399', width: 2.5 },
            itemStyle: { color: '#34d399' },
            symbol: 'circle',
            symbolSize: 8,
            label: {
              show: true,
              color: '#34d399',
              fontSize: 11,
              formatter: '{c}%',
              position: 'top',
            },
          },
        ],
      });
      chart.resize();
    }

    // Resize 处理
    const handleResize = () => {
      costChartInstance.current?.resize();
      expenseChartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data, open]);

  // ---- 清理图表实例 ----
  useEffect(() => {
    return () => {
      costChartInstance.current?.dispose();
      expenseChartInstance.current?.dispose();
    };
  }, []);

  // ============================================================
  // 年份选项
  // ============================================================
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - i);

  // ============================================================
  // open 为 false 时，在所有 hooks 之后返回 null
  // ============================================================
  if (!open) {
    console.log('🔍 OverviewModal 因 open=false 提前返回 null');
    return null;
  }

  console.log('🔍 OverviewModal open=true，开始渲染弹窗 DOM');

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* 弹窗主体 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-[90vw] h-[90vh] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl shadow-2xl shadow-blue-900/30 flex flex-col overflow-hidden">
          {/* ============================================================ */}
          {/* 顶部标题栏 + 筛选 */}
          {/* ============================================================ */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-full" />
              <h2 className="text-lg font-bold text-white tracking-wide">
                森宇集团 · 项目经营总看板
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {/* 年份筛选 */}
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500/50 transition-colors"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y} 年</option>
                ))}
              </select>

              {/* 业务类型筛选 */}
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="">全部业务类型</option>
                {BUSINESS_TYPES.map(bt => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>

              {/* 刷新按钮 */}
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-400 transition-all duration-200 disabled:opacity-50"
                title="刷新数据"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>

              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full border border-slate-600 text-slate-400 hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 内容区域 */}
          {/* ============================================================ */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* 加载 / 错误状态 */}
            {loading && (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="size-10 text-cyan-400 animate-spin" />
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <p className="text-red-400 text-lg">❌ {error}</p>
                <button
                  onClick={fetchData}
                  className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
                >
                  重试
                </button>
              </div>
            )}

            {/* 数据展示 */}
            {!loading && !error && data && (
              <>
                {/* ============================================================ */}
                {/* KPI 卡片 - 第一行 */}
                {/* ============================================================ */}
                <div className="grid grid-cols-4 gap-3">
                  {KPI_CARDS.slice(0, 4).map(card => {
                    const value = data.kpi[card.key];
                    const displayValue = card.isPercent
                      ? formatPercent(value as number)
                      : card.isMoney
                        ? `¥${formatWan(value as number)}`
                        : String(value);

                    return (
                      <div
                        key={card.key}
                        className={`relative overflow-hidden rounded-xl border ${card.borderColor} bg-slate-800/60 p-4 group hover:scale-[1.02] transition-transform duration-300`}
                      >
                        {/* 渐变装饰条 */}
                        <div className={`absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r ${card.gradient}`} />
                        <div className="text-2xl font-bold text-white tracking-tight truncate">
                          {displayValue}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{card.label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* KPI 卡片 - 第二行 */}
                <div className="grid grid-cols-4 gap-3">
                  {KPI_CARDS.slice(4).map(card => {
                    const value = data.kpi[card.key];
                    const displayValue = card.isPercent
                      ? formatPercent(value as number)
                      : card.isMoney
                        ? `¥${formatWan(value as number)}`
                        : String(value);

                    return (
                      <div
                        key={card.key}
                        className={`relative overflow-hidden rounded-xl border ${card.borderColor} bg-slate-800/60 p-4 group hover:scale-[1.02] transition-transform duration-300`}
                      >
                        <div className={`absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r ${card.gradient}`} />
                        <div className="text-2xl font-bold text-white tracking-tight truncate">
                          {displayValue}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{card.label}</div>
                      </div>
                    );
                  })}
                </div>

                {/* ============================================================ */}
                {/* 中部：导航菜单 + 图表 */}
                {/* ============================================================ */}
                <div className="flex gap-4" style={{ minHeight: '380px' }}>
                  {/* 左侧导航菜单 */}
                  <div className="w-44 shrink-0 rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 flex flex-col">
                    <div className="text-xs text-slate-500 font-medium mb-3 px-2">
                      📋 项目导航
                    </div>
                    <nav className="flex-1 flex flex-col gap-0.5">
                      {NAV_ITEMS.map(item => (
                        <button
                          key={item.label}
                          onClick={() => toast.info('功能开发中')}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 transition-all duration-200 text-left"
                        >
                          <span className="text-xs">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </nav>
                  </div>

                  {/* 右侧图表区域 */}
                  <div className="flex-1 flex flex-col gap-4">
                    {/* 成本对比分析 */}
                    <div className="flex-1 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 flex flex-col">
                      <div className="text-sm text-slate-300 font-medium mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        成本对比分析
                      </div>
                      <div ref={costChartRef} className="flex-1 min-h-0" />
                    </div>

                    {/* 支出分类分析 */}
                    <div className="flex-1 rounded-xl border border-slate-700/50 bg-slate-800/60 p-4 flex flex-col">
                      <div className="text-sm text-slate-300 font-medium mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        支出分类分析
                      </div>
                      <div ref={expenseChartRef} className="flex-1 min-h-0" />
                    </div>
                  </div>
                </div>

                {/* ============================================================ */}
                {/* 底部年度指标条 */}
                {/* ============================================================ */}
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-xs text-slate-500 mb-1">本年新签合同额</div>
                      <div className="text-lg font-bold text-cyan-400">
                        ¥{formatWan(data.yearlyNewContract)}
                      </div>
                    </div>
                    <div className="text-center border-x border-slate-700/50">
                      <div className="text-xs text-slate-500 mb-1">本年新签支出合同额</div>
                      <div className="text-lg font-bold text-red-400">
                        ¥{formatWan(data.yearlyNewExpenseContract)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-500 mb-1">本年新签成本</div>
                      <div className="text-lg font-bold text-amber-400">
                        ¥{formatWan(data.yearlyNewCost)}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 空数据状态 */}
            {!loading && !error && !data && (
              <div className="flex items-center justify-center h-64">
                <p className="text-slate-500">暂无数据</p>
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* 底部信息栏 */}
          {/* ============================================================ */}
          <div className="flex items-center justify-between px-6 py-2.5 border-t border-slate-700/50 bg-slate-900/60 shrink-0">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {data && (
                <>
                  <span>
                    数据更新时间: {new Date(data.lastUpdated).toLocaleString('zh-CN')}
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>共 {data.totalProjects} 个项目</span>
                </>
              )}
              {!data && (
                <span>等待数据加载...</span>
              )}
            </div>
            <div className="text-xs text-slate-600">
              森宇集团 · 项目经营总看板
            </div>
          </div>
        </div>
      </div>
    </>
  );
}