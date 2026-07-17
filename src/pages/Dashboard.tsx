import TaskList from '../components/TaskList';
import { useEffect, useRef, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { X, RefreshCw, ChevronLeft, ChevronRight, FileText, Bot, Loader2, Eye, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ============================================================
// Mock Data（降级数据，API 失败时使用）
// ============================================================
const mockData = {
  revenueDistribution: [
    { value: 35, name: '智慧园区' },
    { value: 28, name: '数字化转型' },
    { value: 22, name: '云平台建设' },
    { value: 10, name: '数据中台' },
    { value: 5, name: '其他' }
  ],
  projectProgress: [
    { name: '智慧园区一期', value: 85 },
    { name: '数字化转型', value: 62 },
    { name: '云平台迁移', value: 45 },
    { name: '数据中台', value: 78 },
    { name: '移动端开发', value: 92 }
  ],
  categoryStats: [
    { name: '进度', value: 85 },
    { name: '质量', value: 78 },
    { name: '成本', value: 92 },
    { name: '风险', value: 65 },
    { name: '资源', value: 88 }
  ],
  taskHeatmap: [
    { name: '开发任务', value: 45 },
    { name: '测试任务', value: 28 },
    { name: '设计任务', value: 18 },
    { name: '文档任务', value: 12 },
    { name: '会议任务', value: 22 },
    { name: '评审任务', value: 15 }
  ],
  rankings: [
    { name: '张伟', score: 98, completed: 45 },
    { name: '李娜', score: 95, completed: 42 },
    { name: '王强', score: 92, completed: 38 },
    { name: '刘芳', score: 89, completed: 36 },
    { name: '陈明', score: 87, completed: 34 }
  ],
  weeklyReport: 87.5,
  riskAlerts: [
    { level: 'high', project: '智慧园区项目', issue: '进度延迟 15%' },
    { level: 'medium', project: '数字化转型项目', issue: '预算超支 8%' },
    { level: 'high', project: '云平台迁移', issue: '关键人员离职' },
    { level: 'medium', project: '数据中台建设', issue: '需求变更频繁' }
  ]
};

// ============================================================
// 类型定义
// ============================================================
interface KPI {
  label: string;
  value: string | number;
  key: string;
}

interface Project {
  id: number;
  contractNumber: string | null;
  projectName: string | null;
  serviceCategory: string | null;
  projectStatus: string | null;
  contractAmount: number | null;
  finalContractAmount: number | null;
  receivedAmount: number | null;
  invoicedAmount: number | null;
  projectLeader: string | null;
  department: string | null;
  partnerUnit: string | null;
  signedDate: string | null;
  plannedEndDate: string | null;
  currentProgress: number | null;
  lastWeeklyReportAt: string | null;
  remark: string | null;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

interface WeeklyReport {
  id: number;
  projectId: number;
  businessType: string | null;
  reportDate: string;
  reportType: string;
  currentProgress: number | null;
  weeklySummary: string;
  issuesEncountered: string | null;
  nextWeekPlan: string | null;
  riskSelfAssessment: string | null;
  monthlyCompletedValue: number | null;
  cumulativeCompletedValue: number | null;
  monthlyInvoicedAmount: number | null;
  cumulativeInvoicedAmount: number | null;
  monthlyReceivedAmount: number | null;
  cumulativeReceivedAmount: number | null;
  createdAt: string;
}

interface AIAnalysis {
  riskScore: number;
  riskLevel: string;
  riskAlerts: string[];
  suggestions: string[];
  analysisSummary: string;
  analyzedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================
// 工具函数（与 ProjectManager.tsx 保持一致）
// ============================================================
function getStatusColor(status: string) {
  switch (status) {
    case '进行中': return 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400';
    case '已结项': return 'bg-blue-900/20 border-blue-500/30 text-blue-400';
    case '暂停': return 'bg-amber-900/20 border-amber-500/30 text-amber-400';
    case '规划中': return 'bg-slate-700/50 border-slate-500/30 text-slate-400';
    default: return 'bg-slate-700/50 border-slate-500/30 text-slate-400';
  }
}

function getRiskColor(level: string) {
  switch (level) {
    case '极高风险': return 'text-red-400 bg-red-900/20 border-red-500/30';
    case '高风险': return 'text-red-400 bg-red-900/20 border-red-500/30';
    case '中风险': return 'text-amber-400 bg-amber-900/20 border-amber-500/30';
    case '低风险': return 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30';
    default: return 'text-slate-400 bg-slate-700/50 border-slate-500/30';
  }
}

function formatMoney(amount: number | null) {
  if (amount === null || amount === undefined) return '-';
  return amount.toLocaleString('zh-CN');
}

// ============================================================
// 简化版项目详情抽屉（Dashboard 专用）
// 仅展示基本信息 + 周报历史 + AI 分析，不含编辑/删除/周报提交
// ============================================================
function ProjectDetailDrawerSimple({
  open, project, onClose
}: {
  open: boolean;
  project: Project | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'reports' | 'ai'>('info');
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (open && project) {
      console.log('[Dashboard] 打开项目详情抽屉, projectId:', project.id);
      setActiveTab('info');
      fetchDetail();
      fetchWeeklyReports();
      fetchAIAnalysis();
    }
  }, [open, project?.id]);

  const fetchDetail = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/projects/${project.id}`);
      const result = await resp.json();
      if (result.success) {
        console.log('[Dashboard] 项目详情:', result.data);
        setDetail(result.data);
      }
    } catch (err) {
      console.error('[Dashboard] 获取项目详情失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyReports = async () => {
    if (!project) return;
    setReportsLoading(true);
    try {
      console.log(`📋 获取项目周报历史 projectId=${project.id}`);
      const resp = await fetch(`/api/weekly-reports?projectId=${project.id}&limit=50`);
      const result = await resp.json();
      if (result.success) {
        console.log(`✅ 周报历史返回 ${result.data?.length || 0} 条记录`);
        setWeeklyReports(result.data || []);
      }
    } catch (err) {
      console.error('❌ 获取周报历史失败:', err);
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchAIAnalysis = async () => {
    if (!project) return;
    setAiLoading(true);
    try {
      const resp = await fetch(`/api/ai/project-analysis/${project.id}`, { method: 'POST' });
      const result = await resp.json();
      if (result.success && result.data) {
        console.log('[Dashboard] AI 分析结果:', result.data);
        setAiAnalysis(result.data);
      }
    } catch (err) {
      console.error('[Dashboard] 获取 AI 分析失败:', err);
    } finally {
      setAiLoading(false);
    }
  };

  if (!open || !project) return null;

  const tabs = [
    { key: 'info' as const, label: '基本信息', icon: Building2 },
    { key: 'reports' as const, label: '周报历史', icon: FileText },
    { key: 'ai' as const, label: 'AI 分析', icon: Bot },
  ];

  const fieldClass = "flex justify-between py-2.5 border-b border-slate-700/30";
  const fieldLabelClass = "text-slate-400 text-sm";
  const fieldValueClass = "text-slate-200 text-sm text-right max-w-[55%]";

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 w-[600px] max-w-[90vw] h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border-l-2 border-cyan-400 z-50 shadow-2xl shadow-blue-900/50 overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-cyan-500/30 bg-slate-800/50 sticky top-0 backdrop-blur-md z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-cyan-400 truncate">
              {project.projectName || '项目详情'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">合同编号: {project.contractNumber || '-'}</p>
          </div>
          <button onClick={onClose}
            className="w-10 h-10 rounded-full border-2 border-cyan-400/50 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-300 transition-all duration-300 hover:rotate-90 flex items-center justify-center shrink-0 ml-4">
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700/50">
          {tabs.map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* 基本信息 Tab */}
          {activeTab === 'info' && (
            loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-8 text-cyan-400 animate-spin" />
              </div>
            ) : detail ? (
              <div className="space-y-1 bg-slate-800/40 border border-blue-900/30 rounded-xl p-5">
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>项目名称</span>
                  <span className={fieldValueClass}>{detail.projectName || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>合同编号</span>
                  <span className={fieldValueClass}>{detail.contractNumber || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>服务类别</span>
                  <span className={fieldValueClass}>{detail.serviceCategory || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>项目状态</span>
                  <span className={`px-2 py-0.5 rounded text-xs border ${getStatusColor(detail.projectStatus || '')}`}>
                    {detail.projectStatus || '-'}
                  </span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>合同金额</span>
                  <span className={fieldValueClass}>¥{formatMoney(detail.contractAmount)}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>已收款</span>
                  <span className={fieldValueClass}>¥{formatMoney(detail.receivedAmount)}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>已开票</span>
                  <span className={fieldValueClass}>¥{formatMoney(detail.invoicedAmount)}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>当前进度</span>
                  <span className={fieldValueClass}>{detail.currentProgress ?? '-'}%</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>项目负责人</span>
                  <span className={fieldValueClass}>{detail.projectLeader || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>所属部门</span>
                  <span className={fieldValueClass}>{detail.department || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>合作单位</span>
                  <span className={fieldValueClass}>{detail.partnerUnit || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>签订日期</span>
                  <span className={fieldValueClass}>{detail.signedDate || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>计划结束日期</span>
                  <span className={fieldValueClass}>{detail.plannedEndDate || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>最近周报日期</span>
                  <span className={fieldValueClass}>{detail.lastWeeklyReportAt || '-'}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>关联任务数</span>
                  <span className={fieldValueClass}>{detail.taskCount ?? 0}</span>
                </div>
                <div className="pt-2.5">
                  <span className={fieldLabelClass}>备注</span>
                  <p className="text-slate-300 text-sm mt-1">{detail.remark || '无'}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-slate-500">加载失败</div>
            )
          )}

          {/* 周报历史 Tab */}
          {activeTab === 'reports' && (
            reportsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="size-8 text-cyan-400 animate-spin" />
              </div>
            ) : weeklyReports.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <FileText className="size-12 mx-auto mb-3 text-slate-600" />
                <p>暂无周报记录</p>
              </div>
            ) : (
              <div className="space-y-4">
                {weeklyReports.map((report) => (
                  <div key={report.id} className="bg-slate-800/40 border border-blue-900/30 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400 font-semibold text-sm">{report.reportDate}</span>
                        <span className={`px-2 py-0.5 rounded text-xs border ${
                          report.reportType === 'monthly'
                            ? 'bg-purple-900/20 text-purple-400 border-purple-500/30'
                            : 'bg-cyan-900/20 text-cyan-400 border-cyan-500/30'
                        }`}>
                          {report.reportType === 'monthly' ? '月报' : '周报'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-xs">进度: {report.currentProgress ?? 0}%</span>
                        {report.riskSelfAssessment && (
                          <span className={`px-2 py-0.5 rounded text-xs border ${
                            report.riskSelfAssessment === '高' ? 'border-red-500/30 text-red-400 bg-red-900/20' :
                            report.riskSelfAssessment === '中' ? 'border-amber-500/30 text-amber-400 bg-amber-900/20' :
                            'border-emerald-500/30 text-emerald-400 bg-emerald-900/20'
                          }`}>
                            风险: {report.riskSelfAssessment}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-slate-600/50 rounded-full h-2 mb-3">
                      <div className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${report.currentProgress ?? 0}%` }} />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">本周总结：</span>
                        <p className="text-slate-300 mt-0.5">{report.weeklySummary || '无'}</p>
                      </div>
                      {report.issuesEncountered && (
                        <div>
                          <span className="text-amber-500">遇到的问题：</span>
                          <p className="text-amber-300/80 mt-0.5">{report.issuesEncountered}</p>
                        </div>
                      )}
                      {report.nextWeekPlan && (
                        <div>
                          <span className="text-blue-500">下周计划：</span>
                          <p className="text-blue-300/80 mt-0.5">{report.nextWeekPlan}</p>
                        </div>
                      )}
                      {/* 月报数据 */}
                      {report.reportType === 'monthly' && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50">
                          <span className="text-purple-400 text-xs font-medium mb-2 block">📊 月报数据</span>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {report.monthlyCompletedValue != null && (
                              <div><span className="text-slate-500">本月产值：</span><span className="text-slate-300">{formatMoney(report.monthlyCompletedValue)}</span></div>
                            )}
                            {report.cumulativeCompletedValue != null && (
                              <div><span className="text-slate-500">累计产值：</span><span className="text-slate-300">{formatMoney(report.cumulativeCompletedValue)}</span></div>
                            )}
                            {report.monthlyInvoicedAmount != null && (
                              <div><span className="text-slate-500">本月开票：</span><span className="text-slate-300">{formatMoney(report.monthlyInvoicedAmount)}</span></div>
                            )}
                            {report.cumulativeInvoicedAmount != null && (
                              <div><span className="text-slate-500">累计开票：</span><span className="text-slate-300">{formatMoney(report.cumulativeInvoicedAmount)}</span></div>
                            )}
                            {report.monthlyReceivedAmount != null && (
                              <div><span className="text-slate-500">本月回款：</span><span className="text-slate-300">{formatMoney(report.monthlyReceivedAmount)}</span></div>
                            )}
                            {report.cumulativeReceivedAmount != null && (
                              <div><span className="text-slate-500">累计回款：</span><span className="text-slate-300">{formatMoney(report.cumulativeReceivedAmount)}</span></div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* AI 分析 Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {aiLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="size-8 text-cyan-400 animate-spin" />
                </div>
              ) : aiAnalysis ? (
                <>
                  {/* 风险评分 */}
                  <div className="bg-slate-800/40 border border-blue-900/30 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-cyan-400 font-semibold">风险评分</h3>
                      <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${getRiskColor(aiAnalysis.riskLevel)}`}>
                        {aiAnalysis.riskLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-bold text-cyan-400">{aiAnalysis.riskScore}</div>
                      <div className="text-slate-500 text-sm">/ 100</div>
                    </div>
                    <div className="w-full bg-slate-600/50 rounded-full h-3 mt-3">
                      <div className={`h-3 rounded-full transition-all ${
                        aiAnalysis.riskScore >= 70 ? 'bg-gradient-to-r from-red-500 to-red-400' :
                        aiAnalysis.riskScore >= 40 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                        'bg-gradient-to-r from-emerald-500 to-emerald-400'
                      }`} style={{ width: `${aiAnalysis.riskScore}%` }} />
                    </div>
                  </div>

                  {/* 分析摘要 */}
                  {aiAnalysis.analysisSummary && (
                    <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5">
                      <p className="text-slate-200 text-sm leading-relaxed">💡 {aiAnalysis.analysisSummary}</p>
                    </div>
                  )}

                  {/* 风险预警 */}
                  {aiAnalysis.riskAlerts && aiAnalysis.riskAlerts.length > 0 && (
                    <div className="bg-red-900/10 border border-red-500/30 rounded-xl p-5">
                      <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                        ⚠️ 风险预警
                      </h3>
                      <ul className="space-y-2">
                        {aiAnalysis.riskAlerts.map((alert, i) => (
                          <li key={i} className="text-red-300/80 text-sm flex items-start gap-2">
                            <span className="text-red-400 mt-0.5">⚠️</span> {alert}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 建议 */}
                  {aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0 && (
                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-5">
                      <h3 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                        💡 AI 建议
                      </h3>
                      <ul className="space-y-2">
                        {aiAnalysis.suggestions.map((s, i) => (
                          <li key={i} className="text-blue-300/80 text-sm flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5">💡</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiAnalysis.analyzedAt && (
                    <p className="text-xs text-slate-600 text-right">
                      分析时间: {new Date(aiAnalysis.analyzedAt).toLocaleString('zh-CN')}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-center py-16">
                  <Bot className="size-16 mx-auto mb-4 text-slate-600" />
                  <p className="text-slate-500">暂无 AI 分析结果</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// 主页面组件 Dashboard
// ============================================================
export default function Dashboard() {
  // ---- 图表 DOM refs ----
  const revenueChartRef = useRef<HTMLDivElement>(null);
  const progressChartRef = useRef<HTMLDivElement>(null);
  const categoryChartRef = useRef<HTMLDivElement>(null);
  const centralChartRef = useRef<HTMLDivElement>(null);
  const heatmapChartRef = useRef<HTMLDivElement>(null);
  const gaugeChartRef = useRef<HTMLDivElement>(null);

  // ---- 图表实例 refs（用于后续 setOption 更新）----
  const revenueChartInstance = useRef<echarts.ECharts | null>(null);
  const progressChartInstance = useRef<echarts.ECharts | null>(null);
  const categoryChartInstance = useRef<echarts.ECharts | null>(null);
  const heatmapChartInstance = useRef<echarts.ECharts | null>(null);

  // ---- 数据是否已请求标记 ----
  const statsFetchedRef = useRef(false);
  const projectsFetchedRef = useRef(false);

  // ---- KPI 状态 ----
  const [kpis, setKpis] = useState<KPI[]>([
    { label: '进行中项目数', value: 24, key: 'ongoing' },
    { label: '本月新增任务', value: 156, key: 'newTasks' },
    { label: '整体风险指数', value: '23%', key: 'risk' },
    { label: '人员负荷率', value: '78%', key: 'load' }
  ]);

  // ---- 面板状态 ----
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [overallRisk, setOverallRisk] = useState<{ score: number; level: string; totalTasks: number; highRiskCount: number; lastUpdated: string } | null>(null);
  const [riskAlerts, setRiskAlerts] = useState<{ project: string; issue: string; level: string }[]>([]);
  const [monthlyNewTasks, setMonthlyNewTasks] = useState<number>(156);
  const [taskCategories, setTaskCategories] = useState<{ name: string; value: number }[]>(mockData.taskHeatmap);
  const [rankingData, setRankingData] = useState<{ name: string; score: number; completed: number }[]>(mockData.rankings);

  // ---- 任务 A：项目总表状态 ----
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectPagination, setProjectPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const projectPageRef = useRef(1);

  // ============================================================
  // 任务 B & C：获取项目统计数据（图表 + KPI）
  // ============================================================
  const fetchProjectStats = useCallback(async () => {
    console.log('[Dashboard] 开始获取项目统计数据...');
    try {
      const [categoryRes, progressRes, overviewRes] = await Promise.all([
        fetch('/api/stats/projects-category').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/stats/projects-progress').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/stats/projects-overview').then(r => r.json()).catch(() => ({ success: false })),
      ]);

      // --- 饼图：服务类别占比 ---
      if (categoryRes.success && categoryRes.data?.length > 0) {
        console.log('[Dashboard] 项目类别数据:', categoryRes.data);
        if (revenueChartInstance.current) {
          revenueChartInstance.current.setOption({
            series: [{
              type: 'pie',
              data: categoryRes.data,
            }]
          });
          revenueChartInstance.current.resize();
        }
      } else {
        console.warn('[Dashboard] 项目类别数据获取失败，使用降级 mock 数据');
      }

      // --- 条形图：项目进度（取前 10 个）---
      if (progressRes.success && progressRes.data?.length > 0) {
        console.log('[Dashboard] 项目进度数据:', progressRes.data);
        if (progressChartInstance.current) {
          progressChartInstance.current.setOption({
            yAxis: {
              type: 'category',
              data: progressRes.data.map((item: { projectName: string; progress: number }) => item.projectName),
            },
            series: [{
              type: 'bar',
              data: progressRes.data.map((item: { projectName: string; progress: number }) => item.progress),
            }]
          });
          progressChartInstance.current.resize();
        }
      } else {
        console.warn('[Dashboard] 项目进度数据获取失败，使用降级 mock 数据');
      }

      // --- 雷达图 + KPI「进行中项目数」---
      if (overviewRes.success && overviewRes.data) {
        const d = overviewRes.data;
        console.log('[Dashboard] 项目概览数据:', d);

        // 任务 C：更新 KPI「进行中项目数」
        if (d.inProgress !== undefined && d.inProgress !== null) {
          setKpis(prev => prev.map(kpi => {
            if (kpi.key === 'ongoing') return { ...kpi, value: d.inProgress };
            return kpi;
          }));
        }

        // 雷达图 5 个维度
        const total = d.total || 1;
        const radarValues = [
          d.avgProgress ?? 0,                                                          // 进度
          d.total ? Math.round(Math.max(0, 100 - ((d.overdueProjects || 0) / total * 100))) : 100,  // 质量（按时完成率）
          d.paymentRate ?? 0,                                                          // 成本（回款率）
          d.total ? Math.round(Math.max(0, 100 - ((d.highRiskProjects || 0) / total * 100))) : 100, // 风险（安全率）
          d.total ? Math.round(((d.inProgress || 0) / total) * 100) : 0,               // 资源（活跃率）
        ];

        if (categoryChartInstance.current) {
          categoryChartInstance.current.setOption({
            series: [{
              type: 'radar',
              data: [{ value: radarValues, name: '项目综合评估' }]
            }]
          });
          categoryChartInstance.current.resize();
        }
      } else {
        console.warn('[Dashboard] 项目概览数据获取失败，使用降级 mock 数据');
      }
    } catch (err) {
      console.error('[Dashboard] 获取项目统计数据失败:', err);
    }
  }, []);

  // ============================================================
  // 任务 A：获取项目列表
  // ============================================================
  const fetchProjects = useCallback(async (page = 1) => {
    console.log(`[Dashboard] 获取项目列表 page=${page} limit=20...`);
    projectPageRef.current = page;
    setProjectsLoading(true);
    try {
      const resp = await fetch(`/api/projects?page=${page}&limit=20`);
      const result = await resp.json();
      if (result.success) {
        console.log('[Dashboard] 项目列表:', result.data?.length, '条, 总计:', result.pagination?.total);
        setProjects(result.data || []);
        setProjectPagination(result.pagination || { page, limit: 20, total: 0, totalPages: 0 });
      } else {
        console.warn('[Dashboard] 项目列表获取失败:', result.error);
      }
    } catch (err) {
      console.error('[Dashboard] 获取项目列表失败:', err);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  // ============================================================
  // 初始化图表（使用 mockData 作为降级数据）
  // ============================================================
  useEffect(() => {
    const charts: echarts.ECharts[] = [];

    if (revenueChartRef.current) {
      const chart = echarts.init(revenueChartRef.current);
      revenueChartInstance.current = chart;
      chart.setOption({
        tooltip: { trigger: 'item' },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center',
          textStyle: { color: '#e2e8f0' }
        },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          data: mockData.revenueDistribution,
          label: { show: false },
          itemStyle: {
            borderRadius: 8,
            borderColor: '#1e293b',
            borderWidth: 2
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 20,
              shadowColor: '#00f2ff'
            }
          }
        }]
      });
      charts.push(chart);
    }

    if (progressChartRef.current) {
      const chart = echarts.init(progressChartRef.current);
      progressChartInstance.current = chart;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
        xAxis: {
          type: 'value',
          max: 100,
          axisLabel: { color: '#94a3b8' },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        yAxis: {
          type: 'category',
          data: mockData.projectProgress.map(item => item.name),
          axisLabel: { color: '#e2e8f0' }
        },
        series: [{
          type: 'bar',
          data: mockData.projectProgress.map(item => item.value),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#0047AB' },
              { offset: 1, color: '#00f2ff' }
            ]),
            borderRadius: [0, 4, 4, 0]
          },
          label: {
            show: true,
            position: 'right',
            color: '#00f2ff',
            formatter: '{c}%'
          }
        }]
      });
      charts.push(chart);
    }

    if (categoryChartRef.current) {
      const chart = echarts.init(categoryChartRef.current);
      categoryChartInstance.current = chart;
      chart.setOption({
        radar: {
          indicator: mockData.categoryStats.map(item => ({
            name: item.name,
            max: 100
          })),
          center: ['50%', '50%'],
          radius: '65%',
          axisName: { color: '#00f2ff' },
          splitLine: { lineStyle: { color: 'rgba(0, 71, 171, 0.3)' } },
          splitArea: { areaStyle: { color: ['rgba(0, 71, 171, 0.1)', 'rgba(0, 71, 171, 0.05)'] } }
        },
        series: [{
          type: 'radar',
          data: [{
            value: mockData.categoryStats.map(item => item.value),
            name: '项目综合评估'
          }],
          lineStyle: { color: '#00f2ff', width: 2 },
          itemStyle: { color: '#00f2ff' },
          areaStyle: {
            color: new (echarts.graphic as any).RadialGradient(0, 0, 1, [
              { offset: 0, color: 'rgba(0, 242, 255, 0.5)' },
              { offset: 1, color: 'rgba(0, 71, 171, 0.2)' }
            ])
          }
        }]
      });
      charts.push(chart);
    }

    if (centralChartRef.current) {
      const chart = echarts.init(centralChartRef.current);
      const trendData = Array.from({ length: 12 }, (_, i) => i + 1);
      const trendValues = [65, 72, 68, 75, 82, 79, 85, 88, 84, 91, 87, 93];
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['项目完成数', '任务完成率'], textStyle: { color: '#e2e8f0' } },
        xAxis: {
          type: 'category',
          data: trendData.map(m => `${m}月`),
          axisLabel: { color: '#94a3b8' }
        },
        yAxis: [
          {
            type: 'value',
            name: '项目数',
            axisLabel: { color: '#94a3b8' },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
          },
          {
            type: 'value',
            name: '完成率',
            max: 100,
            axisLabel: { color: '#94a3b8', formatter: '{c}%' },
            splitLine: { show: false }
          }
        ],
        series: [
          {
            name: '项目完成数',
            type: 'bar',
            data: trendValues.map(v => Math.floor(v / 3)),
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#00f2ff' },
                { offset: 1, color: '#0047AB' }
              ])
            }
          },
          {
            name: '任务完成率',
            type: 'line',
            yAxisIndex: 1,
            data: trendValues,
            smooth: true,
            lineStyle: { color: '#00f2ff', width: 3 },
            itemStyle: { color: '#00f2ff' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(0, 242, 255, 0.3)' },
                { offset: 1, color: 'rgba(0, 242, 255, 0)' }
              ])
            }
          }
        ]
      });
      charts.push(chart);
    }

    if (heatmapChartRef.current) {
      const chart = echarts.init(heatmapChartRef.current);
      heatmapChartInstance.current = chart;
      // @ts-ignore - ECharts treemap options
      chart.setOption({
        series: [{
          type: 'treemap',
          data: mockData.taskHeatmap,
          itemStyle: {
            borderColor: '#1e293b',
            borderWidth: 2,
            color: new (echarts.graphic as any).LinearGradient(0, 0, 1, 1, [
              { offset: 0, color: '#0047AB' },
              { offset: 1, color: '#00f2ff' }
            ])
          },
          label: {
            color: '#fff',
            formatter: '{b}\n{c}个'
          }
        }]
      });
      charts.push(chart);
    }

    if (gaugeChartRef.current) {
      const chart = echarts.init(gaugeChartRef.current);
      // @ts-ignore - ECharts gauge options
      (chart as any).setOption({
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: 100,
          splitNumber: 5,
          itemStyle: { color: '#00f2ff' },
          progress: { show: true, width: 18 },
          pointer: { show: false },
          axisLine: { lineStyle: { width: 18, color: [[1, 'rgba(0, 71, 171, 0.3)']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          title: { show: false },
          detail: {
            offsetCenter: [0, '20%'],
            fontSize: 24,
            fontWeight: 'bold',
            color: '#00f2ff',
            formatter: '{value}%'
          },
          data: [{ value: mockData.weeklyReport }]
        }]
      });
      charts.push(chart);
    }

    // Resize handler
    const handleResize = () => {
      charts.forEach(c => c.resize());
    };
    window.addEventListener('resize', handleResize);

    return () => {
      charts.forEach(c => c.dispose());
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // ============================================================
  // 初始数据加载（仅执行一次）
  // ============================================================
  useEffect(() => {
    if (!statsFetchedRef.current) {
      statsFetchedRef.current = true;
      fetchProjectStats();
    }
    if (!projectsFetchedRef.current) {
      projectsFetchedRef.current = true;
      fetchProjects(1);
    }
  }, [fetchProjectStats, fetchProjects]);

  // ============================================================
  // Supabase Realtime 订阅 projects 表变更
  // ============================================================
  useEffect(() => {
    console.log('[Dashboard] 订阅 Supabase Realtime: projects 表...');
    const channel = supabase
      .channel('dashboard-projects')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        (payload) => {
          console.log('[Dashboard] Realtime projects 变更:', payload.eventType, payload.new);
          // 变更后刷新当前页项目列表
          fetchProjects(projectPageRef.current);
        }
      )
      .subscribe((status) => {
        console.log('[Dashboard] Supabase Realtime 订阅状态:', status);
      });

    return () => {
      console.log('[Dashboard] 取消 Supabase Realtime 订阅');
      supabase.removeChannel(channel);
    };
  }, [fetchProjects]);

  // ============================================================
  // 更新热度图（taskCategories 变更时）
  // ============================================================
  useEffect(() => {
    if (heatmapChartInstance.current && taskCategories.length > 0) {
      heatmapChartInstance.current.setOption({
        series: [{
          type: 'treemap',
          data: taskCategories,
          itemStyle: {
            borderColor: '#1e293b',
            borderWidth: 2,
            color: new (echarts.graphic as any).LinearGradient(0, 0, 1, 1, [
              { offset: 0, color: '#0047AB' },
              { offset: 1, color: '#00f2ff' }
            ])
          },
          label: {
            color: '#fff',
            formatter: '{b}\n{c}个'
          }
        }]
      });
    }
  }, [taskCategories]);

  // Fetch monthly new tasks
  useEffect(() => {
    fetch('/api/stats/monthly-new-tasks')
      .then(res => res.json())
      .then(result => {
        if (result.success && typeof result.data === 'number') {
          setMonthlyNewTasks(result.data);
          setKpis(prev => prev.map(kpi => {
            if (kpi.key === 'newTasks') return { ...kpi, value: result.data };
            return kpi;
          }));
        }
      })
      .catch(err => console.error('获取本月新增任务数失败:', err));
  }, []);

  // Fetch task categories
  useEffect(() => {
    fetch('/api/stats/task-categories')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data && result.data.length > 0) {
          setTaskCategories(result.data);
        }
      })
      .catch(err => console.error('获取任务分类统计失败:', err));
  }, []);

  // Fetch user ranking
  useEffect(() => {
    fetch('/api/stats/user-ranking')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data && result.data.length > 0) {
          setRankingData(result.data);
        }
      })
      .catch(err => console.error('获取用户排名失败:', err));
  }, []);

  // Update time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch overall risk index
  useEffect(() => {
    fetch('/api/overall-risk')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          setOverallRisk(result.data);
          setKpis(prev => prev.map(kpi => {
            if (kpi.key === 'risk') {
              const d = result.data;
              return { ...kpi, value: `风险评分：${d.score}（${d.level}）` };
            }
            return kpi;
          }));
        }
      })
      .catch(err => {
        console.error('获取整体风险指数失败:', err);
      });
  }, []);

  // Fetch risk alerts
  useEffect(() => {
    const fetchRiskAlerts = () => {
      fetch('/api/risk-alerts')
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            setRiskAlerts(result.data);
          }
        })
        .catch(console.error);
    };
    fetchRiskAlerts();
    const interval = setInterval(fetchRiskAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto refresh (60s)
  useEffect(() => {
    const interval = setInterval(() => {
      // 刷新项目统计数据（图表 + KPI）
      fetchProjectStats();
      // 刷新项目列表
      fetchProjects(projectPageRef.current);
      // 刷新 KPI 中非实时数据
      setKpis(prev => prev.map(kpi => {
        // risk KPI 由 API 驱动，不再 mock
        return kpi;
      }));
      // 刷新整体风险指数
      fetch('/api/overall-risk')
        .then(res => res.json())
        .then(result => {
          if (result.success && result.data) {
            setOverallRisk(result.data);
            setKpis(prev => prev.map(kpi => {
              if (kpi.key === 'risk') {
                const d = result.data;
                return { ...kpi, value: `风险评分：${d.score}（${d.level}）` };
              }
              return kpi;
            }));
          }
        })
        .catch(() => {});
      // 刷新本月新增任务数
      fetch('/api/stats/monthly-new-tasks')
        .then(res => res.json())
        .then(result => {
          if (result.success && typeof result.data === 'number') {
            setMonthlyNewTasks(result.data);
            setKpis(prev => prev.map(kpi => {
              if (kpi.key === 'newTasks') return { ...kpi, value: result.data };
              return kpi;
            }));
          }
        })
        .catch(() => {});
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchProjectStats, fetchProjects]);

  // ============================================================
  // 事件处理
  // ============================================================
  const handleKPIClick = (target: string) => {
    setSelectedTarget(target);
    setAiPanelOpen(true);
  };

  const handleProjectPageChange = (newPage: number) => {
    if (newPage < 1 || newPage > projectPagination.totalPages) return;
    fetchProjects(newPage);
  };

  const handleViewProjectDetail = (project: Project) => {
    console.log('[Dashboard] 查看项目详情:', project.id, project.projectName);
    setSelectedProject(project);
    setProjectDrawerOpen(true);
  };

  const handleRefreshProjects = () => {
    console.log('[Dashboard] 手动刷新项目列表');
    fetchProjects(projectPageRef.current);
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const getRankingNumClass = (index: number) => {
    if (index === 0) return 'bg-gradient-to-br from-yellow-400 to-amber-600 text-white';
    if (index === 1) return 'bg-gradient-to-br from-slate-300 to-slate-500 text-white';
    if (index === 2) return 'bg-gradient-to-br from-amber-700 to-amber-900 text-white';
    return 'bg-blue-900/60 text-cyan-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-200 p-5 overflow-x-hidden">
      {/* Header */}
      <header className="flex justify-between items-center pb-5 mb-5 border-b border-cyan-500/20">
        <div className="flex items-center gap-4">
          <img
            src="https://dt-beebot-prod.oss-cn-zhangjiakou.aliyuncs.com/dingtalk_prod_media/20260511/14/22/34/468053ed-51e7-4f77-ab5b-f0c6e1cdd6ee/%E6%A3%AE%E5%AE%87logo-1.jpg"
            alt="森宇集团 Logo"
            className="h-12 w-auto rounded-lg"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-700 to-cyan-400 bg-clip-text text-transparent">
            森宇集团·项目作战指挥大屏
          </h1>
        </div>
        <div className="text-cyan-400 text-lg font-medium tracking-wider drop-shadow-lg">
          {formatDateTime(currentTime)}
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid grid-cols-3 gap-5 min-h-[calc(100vh-140px)]">
        {/* ============================================================ */}
        {/* Left Panel — 项目全景 */}
        {/* ============================================================ */}
        <section className="bg-slate-800/60 border border-blue-900/30 rounded-2xl p-5 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-700 to-cyan-400 rounded-sm"></span>
            项目全景
          </h2>

          <div ref={revenueChartRef} className="w-full h-72 mb-5"></div>
          <div ref={progressChartRef} className="w-full h-56 mb-5"></div>
          <div ref={categoryChartRef} className="w-full h-56"></div>

          {/* ============================================================ */}
          {/* 任务 A：项目总表（实时同步） */}
          {/* ============================================================ */}
          <div className="border-t border-blue-900/30 mt-4 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
                <span className="w-1 h-5 bg-gradient-to-b from-blue-700 to-cyan-400 rounded-sm"></span>
                项目总表（实时同步）
              </h2>
              <button
                onClick={handleRefreshProjects}
                disabled={projectsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={projectsLoading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>

            {/* 项目表格 */}
            {projectsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 text-cyan-400 animate-spin" />
                <span className="ml-2 text-slate-400 text-sm">加载中...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Building2 className="size-10 mx-auto mb-2 text-slate-600" />
                <p className="text-sm">暂无项目数据</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-900/30 text-slate-400 text-xs">
                        <th className="text-left py-2 pr-2 font-medium">项目名称</th>
                        <th className="text-left py-2 px-2 font-medium whitespace-nowrap">服务类别</th>
                        <th className="text-left py-2 px-2 font-medium whitespace-nowrap">负责人</th>
                        <th className="text-left py-2 px-2 font-medium">进度</th>
                        <th className="text-left py-2 px-2 font-medium">状态</th>
                        <th className="text-center py-2 pl-2 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((proj) => (
                        <tr key={proj.id} className="border-b border-slate-700/30 hover:bg-blue-900/10 transition-colors">
                          <td className="py-2.5 pr-2">
                            <span className="text-slate-200 truncate block max-w-[140px]" title={proj.projectName || ''}>
                              {proj.projectName || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className="text-slate-400 text-xs">{proj.serviceCategory || '-'}</span>
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className="text-slate-400 text-xs">{proj.projectLeader || '-'}</span>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-[50px] bg-slate-600/50 rounded-full h-1.5">
                                <div
                                  className="bg-gradient-to-r from-cyan-500 to-blue-600 h-1.5 rounded-full transition-all"
                                  style={{ width: `${proj.currentProgress ?? 0}%` }}
                                />
                              </div>
                              <span className="text-cyan-400 text-xs w-8 text-right">{proj.currentProgress ?? 0}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded text-xs border ${getStatusColor(proj.projectStatus || '')}`}>
                              {proj.projectStatus || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 pl-2 text-center">
                            <button
                              onClick={() => handleViewProjectDetail(proj)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs hover:bg-cyan-500/10 transition-colors"
                            >
                              <Eye size={12} />
                              查看详情
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 分页 */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-blue-900/20">
                  <span className="text-xs text-slate-500">
                    共 {projectPagination.total} 个项目
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleProjectPageChange(projectPagination.page - 1)}
                      disabled={projectPagination.page <= 1}
                      className="p-1 rounded border border-slate-600/50 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-slate-400">
                      {projectPagination.page} / {projectPagination.totalPages || 1}
                    </span>
                    <button
                      onClick={() => handleProjectPageChange(projectPagination.page + 1)}
                      disabled={projectPagination.page >= projectPagination.totalPages}
                      className="p-1 rounded border border-slate-600/50 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ============================================================ */}
        {/* Center Panel — 核心态势 */}
        {/* ============================================================ */}
        <section className="bg-slate-800/60 border border-blue-900/30 rounded-2xl p-5 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-700 to-cyan-400 rounded-sm"></span>
            核心态势
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-5">
            {kpis.map((kpi) => (
              <div
                key={kpi.key}
                onClick={() => handleKPIClick(kpi.label)}
                className="bg-gradient-to-br from-blue-900/30 to-cyan-500/10 border border-blue-900/40 rounded-xl p-5 text-center cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-900/40"
              >
                <div className={`font-bold bg-gradient-to-r from-cyan-400 to-blue-700 bg-clip-text text-transparent ${kpi.key === 'risk' ? 'text-xl' : 'text-4xl'}`}>
                  {kpi.value}
                </div>
                <div className="text-sm text-slate-400 mt-2">{kpi.label}</div>
              </div>
            ))}
          </div>

          {overallRisk && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '24px',
              marginBottom: '16px',
              padding: '10px 16px',
              background: 'rgba(0, 242, 255, 0.05)',
              borderRadius: '10px',
              border: '1px solid rgba(0, 242, 255, 0.15)',
            }}>
              <span style={{ color: '#f87171', fontSize: '13px', fontWeight: '600' }}>
                高风险任务数：{overallRisk.highRiskCount}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>|</span>
              <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: '600' }}>
                总任务数：{overallRisk.totalTasks}
              </span>
            </div>
          )}

          <div ref={centralChartRef} className="w-full h-96 mb-5"></div>

          {/* Risk Alert Bar */}
          <div className="bg-red-900/10 border border-red-500/30 rounded-xl p-4 overflow-hidden">
            <div className="text-red-400 text-sm mb-3 flex items-center gap-2">
              <span>⚠️</span> 实时风险预警
            </div>
            <div className="overflow-hidden">
              <div className="flex animate-scroll-left">
                {riskAlerts.length > 0 ? [...riskAlerts, ...riskAlerts].map((alert, idx) => (
                  <div
                    key={idx}
                    className="flex-shrink-0 bg-red-900/20 rounded-lg px-4 py-2 mr-3 text-sm text-red-300 whitespace-nowrap"
                  >
                    {alert.level === 'high' ? '🔴' : '🟡'} {alert.project} - {alert.issue}
                  </div>
                )) : (
                  <div className="flex-shrink-0 text-slate-400 px-4 py-2">暂无风险预警</div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Right Panel — 任务效能 */}
        {/* ============================================================ */}
        <section className="bg-slate-800/60 border border-blue-900/30 rounded-2xl p-5 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-700 to-cyan-400 rounded-sm"></span>
            任务效能
          </h2>

          <div ref={heatmapChartRef} className="w-full h-56 mb-5"></div>

          <div className="mb-5">
            <h3 className="text-base text-cyan-400 mb-3">个人效能排行榜 TOP 5</h3>
            <ul className="space-y-2">
              {(rankingData.length > 0 ? rankingData : mockData.rankings).map((item, index) => (
                <li
                  key={item.name}
                  onClick={() => handleKPIClick(item.name)}
                  className="flex items-center bg-blue-900/20 rounded-lg p-3 cursor-pointer transition-all duration-300 hover:bg-blue-900/40 hover:translate-x-1"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm mr-3 ${getRankingNumClass(index)}`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200">{item.name}</div>
                    <div className="text-xs text-cyan-400 mt-1">
                      效能分：{item.score} | 完成任务：{item.completed}个
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div ref={gaugeChartRef} className="w-full h-56"></div>
          {/* 新增任务列表 */}
          <TaskList />
        </section>
      </main>

      {/* ============================================================ */}
      {/* AI Diagnostic Panel Overlay */}
      {/* ============================================================ */}
      {aiPanelOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setAiPanelOpen(false)}
        />
      )}

      {/* AI Diagnostic Panel */}
      <div
        className={`fixed top-0 right-0 w-[600px] h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border-l-2 border-cyan-400 z-50 transition-all duration-500 ease-out overflow-y-auto shadow-2xl shadow-blue-900/50 ${
          aiPanelOpen ? 'right-0' : 'right-[-600px]'
        }`}
      >
        <div className="flex justify-between items-center p-6 border-b border-cyan-500/30 bg-slate-800/50 sticky top-0 backdrop-blur-md z-10">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-700 bg-clip-text text-transparent">
            AI 深度诊断面板
          </h2>
          <button
            onClick={() => setAiPanelOpen(false)}
            className="w-10 h-10 rounded-full border-2 border-cyan-400/50 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-300 transition-all duration-300 hover:rotate-90 flex items-center justify-center"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <AIAnalysisContent target={selectedTarget} />
        </div>
      </div>

      {/* ============================================================ */}
      {/* 任务 A：简化版项目详情抽屉 */}
      {/* ============================================================ */}
      <ProjectDetailDrawerSimple
        open={projectDrawerOpen}
        project={selectedProject}
        onClose={() => setProjectDrawerOpen(false)}
      />
    </div>
  );
}

// ============================================================
// Person Analysis Component (real API data)
// ============================================================
function PersonAnalysis({ target }: { target: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    stats: { totalTasks: number; completedTasks: number; avgProgress: number; categoryDistribution: Record<string, number>; delayedTasks: number; onTimeDeliveryRate: number };
    aiAnalysis: { summary: string; strengths: string[]; weaknesses: string[]; suggestions: string[] };
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/ai/user-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: target })
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || '分析失败');
        }
      })
      .catch(err => setError(err.message || '网络错误'))
      .finally(() => setLoading(false));
  }, [target]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-cyan-400 text-lg animate-pulse mb-3">⏳ AI 正在分析效能数据...</div>
        <div className="text-slate-500 text-sm">正在为 {target} 生成分析报告</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
        <div className="text-red-400 text-lg mb-2">⚠️ 分析失败</div>
        <div className="text-slate-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, aiAnalysis } = data;

  return (
    <>
      {/* 统计卡片 */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
          <span className="text-blue-500">◆</span> {target} - 效能统计
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-cyan-300">{stats.totalTasks}</div>
            <div className="text-xs text-slate-400 mt-1">总任务数</div>
          </div>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.completedTasks}</div>
            <div className="text-xs text-slate-400 mt-1">已完成</div>
          </div>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-cyan-300">{stats.avgProgress}%</div>
            <div className="text-xs text-slate-400 mt-1">平均进度</div>
          </div>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.onTimeDeliveryRate}%</div>
            <div className="text-xs text-slate-400 mt-1">准时交付率</div>
          </div>
        </div>
      </div>

      {/* AI 综合评估 */}
      {aiAnalysis.summary && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 综合评估
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 {aiAnalysis.summary}
          </div>
        </div>
      )}

      {/* 优势分析 */}
      {aiAnalysis.strengths.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
            <span className="text-emerald-500">◆</span> 优势分析
          </h3>
          <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-5">
            <ul className="space-y-2">
              {aiAnalysis.strengths.map((s, i) => (
                <li key={i} className="text-sm text-emerald-300 flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✅</span> {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 待改进 */}
      {aiAnalysis.weaknesses.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
            <span className="text-amber-500">◆</span> 待改进
          </h3>
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-5">
            <ul className="space-y-2">
              {aiAnalysis.weaknesses.map((w, i) => (
                <li key={i} className="text-sm text-amber-300 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">⚠️</span> {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* AI 建议 */}
      {aiAnalysis.suggestions.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-5">
            <ul className="space-y-2">
              {aiAnalysis.suggestions.map((s, i) => (
                <li key={i} className="text-sm text-blue-300 flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">💡</span> {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// Overall Risk Analysis Component (real API data)
// ============================================================
function OverallRiskAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    riskComposition: { progressRisk: number; qualityRisk: number; costRisk: number; personnelRisk: number };
    aiAnalysis: { summary: string; suggestions: string[] };
  } | null>(null);

  useEffect(() => {
    fetch('/api/ai/overall-risk-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || '分析失败');
        }
      })
      .catch(err => setError(err.message || '网络错误'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-cyan-400 text-lg animate-pulse mb-3">⏳ AI 正在分析整体风险...</div>
        <div className="text-slate-500 text-sm">正在汇总全量任务数据</div>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 风险构成
          </h3>
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
            <div className="text-red-400 text-lg mb-2">⚠️ 分析失败</div>
            <div className="text-slate-400 text-sm">{error}</div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 请稍后重试，或联系管理员检查服务状态。
          </div>
        </div>
      </>
    );
  }

  if (!data) return null;

  const { riskComposition, aiAnalysis } = data;

  const riskItems = [
    { label: '进度风险', value: riskComposition.progressRisk, color: 'amber' },
    { label: '成本风险', value: riskComposition.costRisk, color: 'cyan' },
    { label: '质量风险', value: riskComposition.qualityRisk, color: 'cyan' },
    { label: '人员风险', value: riskComposition.personnelRisk, color: 'red' },
  ];

  const getBarColor = (color: string) => {
    switch (color) {
      case 'amber': return 'bg-amber-500';
      case 'red': return 'bg-red-500';
      case 'cyan': return 'bg-cyan-500';
      default: return 'bg-cyan-500';
    }
  };

  const getTextColor = (color: string) => {
    switch (color) {
      case 'amber': return 'text-amber-400';
      case 'red': return 'text-red-400';
      case 'cyan': return 'text-cyan-300';
      default: return 'text-cyan-300';
    }
  };

  return (
    <>
      {/* 风险构成 */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
          <span className="text-blue-500">◆</span> 风险构成
        </h3>
        <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 space-y-4">
          {riskItems.map(item => (
            <div key={item.label}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-slate-300 text-sm">{item.label}</span>
                <span className={`${getTextColor(item.color)} font-bold text-sm`}>{item.value}%</span>
              </div>
              <div className="w-full bg-slate-600/50 rounded-full h-2.5">
                <div
                  className={`${getBarColor(item.color)} h-2.5 rounded-full transition-all duration-700`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI 综合评估 */}
      {aiAnalysis.summary && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 综合评估
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 {aiAnalysis.summary}
          </div>
        </div>
      )}

      {/* AI 建议 */}
      {aiAnalysis.suggestions.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            {aiAnalysis.suggestions.map((s, i) => (
              <div key={i} className={i > 0 ? 'mt-3' : ''}>
                💡 {s}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// Monthly Tasks Analysis Component (real API data)
// ============================================================
function MonthlyTasksAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    total: number;
    lastMonthTotal: number;
    growthRate: number;
    categoryDistribution: Record<string, number>;
    aiAnalysis: { summary: string; suggestions: string[] };
  } | null>(null);

  useEffect(() => {
    fetch('/api/ai/monthly-tasks-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || '分析失败');
        }
      })
      .catch(err => setError(err.message || '网络错误'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-cyan-400 text-lg animate-pulse mb-3">⏳ AI 正在分析本月新增任务...</div>
        <div className="text-slate-500 text-sm">正在统计任务数据</div>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 任务分布分析
          </h3>
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 text-center">
            <div className="text-red-400 text-lg mb-2">⚠️ 分析失败</div>
            <div className="text-slate-400 text-sm">{error}</div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 请稍后重试，或联系管理员检查服务状态。
          </div>
        </div>
      </>
    );
  }

  if (!data) return null;

  const { total, lastMonthTotal, growthRate, categoryDistribution, aiAnalysis } = data;
  const isGrowthPositive = growthRate >= 0;
  const categoryEntries = Object.entries(categoryDistribution);

  return (
    <>
      {/* 本月新增任务统计 */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
          <span className="text-blue-500">◆</span> 任务分布分析
        </h3>
        <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-center flex-1">
              <div className="text-3xl font-bold text-cyan-300">{total}</div>
              <div className="text-xs text-slate-400 mt-1">本月新增</div>
            </div>
            <div className="text-slate-600 text-2xl px-4">|</div>
            <div className="text-center flex-1">
              <div className="text-2xl font-bold text-slate-400">{lastMonthTotal}</div>
              <div className="text-xs text-slate-500 mt-1">上月新增</div>
            </div>
            <div className="text-slate-600 text-2xl px-4">|</div>
            <div className="text-center flex-1">
              <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${isGrowthPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isGrowthPositive ? '+' : ''}{growthRate}%
                <span className="text-sm">{isGrowthPositive ? '↑' : '↓'}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">增长率</div>
            </div>
          </div>

          {categoryEntries.length > 0 && (
            <div className="border-t border-slate-600/30 pt-3 mt-3">
              <div className="text-xs text-slate-400 mb-2">任务分类分布</div>
              <div className="space-y-1.5">
                {categoryEntries.map(([cat, count]) => (
                  <div key={cat} className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">- {cat}</span>
                    <span className="text-sm text-cyan-300 font-medium">{count} 个</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI 综合评估 */}
      {aiAnalysis.summary && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 综合评估
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 {aiAnalysis.summary}
          </div>
        </div>
      )}

      {/* AI 建议 */}
      {aiAnalysis.suggestions.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            {aiAnalysis.suggestions.map((s, i) => (
              <div key={i} className={i > 0 ? 'mt-3' : ''}>
                💡 {s}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// AI Analysis Content Component
// ============================================================
function AIAnalysisContent({ target }: { target: string }) {
  const analyses: Record<string, JSX.Element> = {
    '进行中项目数': (
      <>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 风险分析
          </h3>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 mb-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">高风险项目</span>
              <span className="text-red-400 font-bold text-base">3 个</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">中风险项目</span>
              <span className="text-amber-400 font-bold text-base">5 个</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-300 text-sm">低风险项目</span>
              <span className="text-emerald-400 font-bold text-base">16 个</span>
            </div>
          </div>
        </div>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 进度分析
          </h3>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 mb-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">平均进度</span>
              <span className="text-cyan-300 font-bold text-base">72.5%</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">延期项目</span>
              <span className="text-amber-400 font-bold text-base">4 个</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-300 text-sm">提前项目</span>
              <span className="text-emerald-400 font-bold text-base">8 个</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 建议优先关注「智慧园区项目」的进度延迟问题，已滞后关键路径 15%。
            <br/><br/>
            可考虑增加 2-3 名后端开发人员支援，预计可在 2 周内追回进度。
          </div>
        </div>
      </>
    ),
    '本月新增任务': <MonthlyTasksAnalysis />,
    '整体风险指数': <OverallRiskAnalysis />,
    '人员负荷率': (
      <>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 负荷分布
          </h3>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 mb-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">高负荷 (&gt;90%)</span>
              <span className="text-red-400 font-bold text-base">8 人</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">中等负荷 (70-90%)</span>
              <span className="text-amber-400 font-bold text-base">15 人</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-300 text-sm">正常负荷 (&lt;70%)</span>
              <span className="text-emerald-400 font-bold text-base">21 人</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 当前人员负荷率 78% 处于健康区间，但部分成员负荷过高。
            <br/><br/>
            建议对高负荷人员进行任务重新分配，避免长期加班导致效率下降。
          </div>
        </div>
      </>
    )
  };

  // Default analysis for person names — use real API data
  if (!analyses[target]) {
    return <PersonAnalysis target={target} />;
  }

  return analyses[target];
}