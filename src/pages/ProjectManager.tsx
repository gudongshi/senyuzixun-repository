import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  Plus, Search, RefreshCw, Eye, Edit, Trash2, X, FileText,
  LogOut, LayoutDashboard, Building2, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, TrendingUp, Bot
} from 'lucide-react';

// ============================================================
// 类型定义
// ============================================================
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
  reportDate: string;
  currentProgress: number;
  weeklySummary: string;
  issuesEncountered: string;
  nextWeekPlan: string;
  riskSelfAssessment: string;
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

interface UserInfo {
  userId: string;
  name: string;
  loginTime: number;
}

// ============================================================
// 常量
// ============================================================
const SERVICE_CATEGORIES = ['招标代理', '项目管理', '监理', '技术咨询', '造价咨询', '鉴定'];
const PROJECT_STATUSES = ['进行中', '已结项', '暂停', '规划中'];
const RISK_LEVELS = ['低', '中', '高'];
const PAGE_SIZE = 15;

// ============================================================
// 工具函数
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

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  return dateStr;
}

function formatMoney(amount: number | null) {
  if (amount === null || amount === undefined) return '-';
  return amount.toLocaleString('zh-CN');
}

// ============================================================
// ConfirmDialog 子组件
// ============================================================
function ConfirmDialog({
  open, title, message, onConfirm, onCancel, loading
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-full bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="size-5 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-red-400">{title}</h3>
        </div>
        <p className="text-slate-300 text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ProjectFormModal 子组件（新建/编辑）
// ============================================================
function ProjectFormModal({
  open, project, onClose, onSuccess
}: {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    contractNumber: '',
    projectName: '',
    serviceCategory: '',
    contractAmount: '',
    projectLeader: '',
    department: '',
    partnerUnit: '',
    signedDate: '',
    plannedEndDate: '',
    remark: '',
  });

  useEffect(() => {
    if (project) {
      setForm({
        contractNumber: project.contractNumber || '',
        projectName: project.projectName || '',
        serviceCategory: project.serviceCategory || '',
        contractAmount: project.contractAmount?.toString() || '',
        projectLeader: project.projectLeader || '',
        department: project.department || '',
        partnerUnit: project.partnerUnit || '',
        signedDate: project.signedDate || '',
        plannedEndDate: project.plannedEndDate || '',
        remark: project.remark || '',
      });
    } else {
      setForm({
        contractNumber: '',
        projectName: '',
        serviceCategory: '',
        contractAmount: '',
        projectLeader: '',
        department: '',
        partnerUnit: '',
        signedDate: '',
        plannedEndDate: '',
        remark: '',
      });
    }
  }, [project, open]);

  if (!open) return null;

  const isEdit = !!project;
  const title = isEdit ? '编辑项目' : '新建项目';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // 必填校验
    if (!form.contractNumber || !form.projectName || !form.serviceCategory || !form.contractAmount || !form.projectLeader) {
      toast.error('请填写所有必填字段（合同编号、项目名称、服务类别、合同金额、项目负责人）');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        contractNumber: form.contractNumber,
        projectName: form.projectName,
        serviceCategory: form.serviceCategory,
        contractAmount: parseFloat(form.contractAmount),
        projectLeader: form.projectLeader,
        department: form.department || undefined,
        partnerUnit: form.partnerUnit || undefined,
        signedDate: form.signedDate || undefined,
        plannedEndDate: form.plannedEndDate || undefined,
        remark: form.remark || undefined,
      };

      const url = isEdit ? `/api/projects/${project.id}` : '/api/projects';
      const method = isEdit ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '操作失败');
      }

      toast.success(isEdit ? '项目更新成功' : '项目创建成功');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const inputClass = "w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors";
  const labelClass = "block text-sm text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-10 overflow-y-auto">
      <div className="bg-slate-800 border border-blue-900/30 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl my-10">
        <div className="flex justify-between items-center p-6 border-b border-blue-900/30">
          <h2 className="text-xl font-bold text-cyan-400">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>合同编号 <span className="text-red-400">*</span></label>
              <input type="text" className={inputClass} value={form.contractNumber}
                onChange={e => updateField('contractNumber', e.target.value)} placeholder="请输入合同编号" />
            </div>
            <div>
              <label className={labelClass}>项目名称 <span className="text-red-400">*</span></label>
              <input type="text" className={inputClass} value={form.projectName}
                onChange={e => updateField('projectName', e.target.value)} placeholder="请输入项目名称" />
            </div>
            <div>
              <label className={labelClass}>服务类别 <span className="text-red-400">*</span></label>
              <select className={inputClass} value={form.serviceCategory}
                onChange={e => updateField('serviceCategory', e.target.value)}>
                <option value="">请选择</option>
                {SERVICE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>合同金额 <span className="text-red-400">*</span></label>
              <input type="number" className={inputClass} value={form.contractAmount}
                onChange={e => updateField('contractAmount', e.target.value)} placeholder="请输入合同金额" />
            </div>
            <div>
              <label className={labelClass}>项目负责人 <span className="text-red-400">*</span></label>
              <input type="text" className={inputClass} value={form.projectLeader}
                onChange={e => updateField('projectLeader', e.target.value)} placeholder="请输入项目负责人" />
            </div>
            <div>
              <label className={labelClass}>所属部门</label>
              <input type="text" className={inputClass} value={form.department}
                onChange={e => updateField('department', e.target.value)} placeholder="请输入所属部门" />
            </div>
            <div>
              <label className={labelClass}>合作单位</label>
              <input type="text" className={inputClass} value={form.partnerUnit}
                onChange={e => updateField('partnerUnit', e.target.value)} placeholder="请输入合作单位" />
            </div>
            <div>
              <label className={labelClass}>签订日期</label>
              <input type="date" className={inputClass} value={form.signedDate}
                onChange={e => updateField('signedDate', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>计划结束日期</label>
              <input type="date" className={inputClass} value={form.plannedEndDate}
                onChange={e => updateField('plannedEndDate', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>备注</label>
            <textarea className={inputClass} rows={3} value={form.remark}
              onChange={e => updateField('remark', e.target.value)} placeholder="请输入备注" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
            <button type="button" onClick={onClose}
              className="px-5 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
              取消
            </button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center gap-2">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? '保存修改' : '创建项目'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// WeeklyReportModal 子组件
// ============================================================
function WeeklyReportModal({
  open, projectId, projectName, onClose, onSuccess
}: {
  open: boolean;
  projectId: number;
  projectName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    reportDate: new Date().toISOString().split('T')[0],
    currentProgress: '',
    weeklySummary: '',
    issuesEncountered: '',
    nextWeekPlan: '',
    riskSelfAssessment: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        reportDate: new Date().toISOString().split('T')[0],
        currentProgress: '',
        weeklySummary: '',
        issuesEncountered: '',
        nextWeekPlan: '',
        riskSelfAssessment: '',
      });
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.reportDate || form.currentProgress === '' || !form.weeklySummary) {
      toast.error('请填写周报日期、当前进度和本周工作总结');
      return;
    }

    const progress = parseFloat(form.currentProgress);
    if (isNaN(progress) || progress < 0 || progress > 100) {
      toast.error('当前进度需为 0-100 之间的数字');
      return;
    }

    setLoading(true);
    try {
      const body = {
        reportDate: form.reportDate,
        currentProgress: progress,
        weeklySummary: form.weeklySummary,
        issuesEncountered: form.issuesEncountered || undefined,
        nextWeekPlan: form.nextWeekPlan || undefined,
        riskSelfAssessment: form.riskSelfAssessment || undefined,
      };

      const resp = await fetch(`/api/projects/${projectId}/weekly-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '提交失败');
      }

      toast.success('周报提交成功');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || '提交失败');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors";
  const labelClass = "block text-sm text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center pt-10 overflow-y-auto">
      <div className="bg-slate-800 border border-blue-900/30 rounded-2xl w-full max-w-xl mx-4 shadow-2xl my-10">
        <div className="flex justify-between items-center p-6 border-b border-blue-900/30">
          <h2 className="text-xl font-bold text-cyan-400">
            提交周报 — {projectName}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>周报日期 <span className="text-red-400">*</span></label>
              <input type="date" className={inputClass} value={form.reportDate}
                onChange={e => setForm(prev => ({ ...prev, reportDate: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>当前进度 (%) <span className="text-red-400">*</span></label>
              <input type="number" className={inputClass} min="0" max="100" value={form.currentProgress}
                onChange={e => setForm(prev => ({ ...prev, currentProgress: e.target.value }))}
                placeholder="0-100" />
            </div>
          </div>
          <div>
            <label className={labelClass}>本周工作总结 <span className="text-red-400">*</span></label>
            <textarea className={inputClass} rows={3} value={form.weeklySummary}
              onChange={e => setForm(prev => ({ ...prev, weeklySummary: e.target.value }))}
              placeholder="请描述本周完成的主要工作" />
          </div>
          <div>
            <label className={labelClass}>遇到的问题</label>
            <textarea className={inputClass} rows={2} value={form.issuesEncountered}
              onChange={e => setForm(prev => ({ ...prev, issuesEncountered: e.target.value }))}
              placeholder="请描述遇到的问题（如有）" />
          </div>
          <div>
            <label className={labelClass}>下周计划</label>
            <textarea className={inputClass} rows={2} value={form.nextWeekPlan}
              onChange={e => setForm(prev => ({ ...prev, nextWeekPlan: e.target.value }))}
              placeholder="请描述下周工作计划（如有）" />
          </div>
          <div>
            <label className={labelClass}>风险自评</label>
            <select className={inputClass} value={form.riskSelfAssessment}
              onChange={e => setForm(prev => ({ ...prev, riskSelfAssessment: e.target.value }))}>
              <option value="">请选择</option>
              {RISK_LEVELS.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
            <button type="button" onClick={onClose}
              className="px-5 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors">
              取消
            </button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center gap-2">
              {loading && <Loader2 className="size-4 animate-spin" />}
              提交周报
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// ProjectDetailDrawer 子组件
// ============================================================
function ProjectDetailDrawer({
  open, project, onClose, onEdit, onWeeklyReport, onRefresh
}: {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onEdit: () => void;
  onWeeklyReport: () => void;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'reports' | 'ai'>('info');
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [triggeringAI, setTriggeringAI] = useState(false);

  useEffect(() => {
    if (open && project) {
      setActiveTab('info');
      fetchDetail();
      fetchWeeklyReports();
    }
  }, [open, project?.id]);

  const fetchDetail = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/projects/${project.id}`);
      const result = await resp.json();
      if (result.success) {
        setDetail(result.data);
        // 尝试从项目详情中提取 AI 分析结果
        tryFetchAIAnalysis();
      }
    } catch (err) {
      console.error('获取项目详情失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyReports = async () => {
    if (!project) return;
    setReportsLoading(true);
    try {
      const resp = await fetch(`/api/projects/${project.id}/weekly-reports`);
      const result = await resp.json();
      if (result.success) {
        setWeeklyReports(result.data || []);
      }
    } catch (err) {
      console.error('获取周报历史失败:', err);
    } finally {
      setReportsLoading(false);
    }
  };

  const tryFetchAIAnalysis = async () => {
    // 尝试从项目详情中获取 AI 分析结果
    if (!project) return;
    try {
      const resp = await fetch(`/api/projects/${project.id}`);
      const result = await resp.json();
      if (result.success && result.data) {
        // 检查项目中是否有 ai_analysis_result 字段
        if (result.data.aiAnalysisResult) {
          setAiAnalysis(result.data.aiAnalysisResult);
        }
      }
    } catch (err) {
      // 静默失败
    }
  };

  const triggerAIAnalysis = async () => {
    if (!project) return;
    setTriggeringAI(true);
    try {
      const resp = await fetch(`/api/ai/project-analysis/${project.id}`, { method: 'POST' });
      const result = await resp.json();
      if (result.success && result.data) {
        setAiAnalysis(result.data);
        toast.success('AI 分析完成');
      } else {
        toast.error(result.error || 'AI 分析失败');
      }
    } catch (err: any) {
      toast.error(err.message || 'AI 分析触发失败');
    } finally {
      setTriggeringAI(false);
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
                  <span className={fieldValueClass}>{formatDate(detail.signedDate)}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>计划结束日期</span>
                  <span className={fieldValueClass}>{formatDate(detail.plannedEndDate)}</span>
                </div>
                <div className={fieldClass}>
                  <span className={fieldLabelClass}>最近周报日期</span>
                  <span className={fieldValueClass}>{formatDate(detail.lastWeeklyReportAt)}</span>
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
                      <span className="text-cyan-400 font-semibold text-sm">{report.reportDate}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-xs">进度: {report.currentProgress}%</span>
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
                        style={{ width: `${report.currentProgress}%` }} />
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
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* AI 分析 Tab */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {aiAnalysis ? (
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
                        <AlertTriangle size={16} /> 风险预警
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
                        <TrendingUp size={16} /> AI 建议
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
                  <p className="text-slate-500 mb-4">暂无 AI 分析结果</p>
                </div>
              )}

              <button onClick={triggerAIAnalysis} disabled={triggeringAI}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-medium">
                {triggeringAI ? (
                  <><Loader2 className="size-4 animate-spin" /> AI 分析中...</>
                ) : (
                  <><Bot size={18} /> {aiAnalysis ? '重新触发 AI 分析' : '手动触发 AI 分析'}</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="sticky bottom-0 p-6 border-t border-blue-900/30 bg-slate-900/90 backdrop-blur-md flex gap-3">
          <button onClick={onEdit}
            className="flex-1 py-2.5 rounded-lg border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 transition-colors flex items-center justify-center gap-2">
            <Edit size={16} /> 编辑
          </button>
          <button onClick={onWeeklyReport}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2">
            <FileText size={16} /> 提交周报
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// 主页面组件 ProjectManager
// ============================================================
export default function ProjectManager() {
  // 数据状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 筛选状态
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // 弹窗/抽屉状态
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [weeklyReportModalOpen, setWeeklyReportModalOpen] = useState(false);
  const [weeklyReportProject, setWeeklyReportProject] = useState<Project | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 用户状态
  const [user, setUser] = useState<UserInfo | null>(null);

  // 获取当前用户
  useEffect(() => {
    fetch('/api/dingtalk/me')
      .then(r => r.json())
      .then(d => { if (d.success) setUser(d.user); })
      .catch(() => {});
  }, []);

  // 获取项目列表
  const fetchProjects = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (filterCategory) params.set('category', filterCategory);

      const resp = await fetch(`/api/projects?${params.toString()}`);
      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || '获取项目列表失败');
      }

      setProjects(result.data || []);
      setPagination(result.pagination || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message || '获取项目列表失败');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterCategory]);

  useEffect(() => {
    fetchProjects(1);
  }, [fetchProjects]);

  // 搜索
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    fetchProjects(1);
  };

  // 打开新建弹窗
  const handleCreate = () => {
    setEditingProject(null);
    setFormModalOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setDetailDrawerOpen(false);
    setFormModalOpen(true);
  };

  // 打开详情抽屉
  const handleView = (project: Project) => {
    setSelectedProject(project);
    setDetailDrawerOpen(true);
  };

  // 打开周报弹窗
  const handleWeeklyReport = (project?: Project) => {
    const target = project || weeklyReportProject || selectedProject;
    if (target) {
      setWeeklyReportProject(target);
      setWeeklyReportModalOpen(true);
    }
  };

  // 打开删除确认
  const handleDeleteClick = (project: Project) => {
    setDeletingProject(project);
    setDeleteConfirmOpen(true);
  };

  // 确认删除
  const handleDeleteConfirm = async () => {
    if (!deletingProject) return;
    setDeleting(true);
    try {
      const resp = await fetch(`/api/projects/${deletingProject.id}`, { method: 'DELETE' });
      const result = await resp.json();
      if (!resp.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }
      toast.success('项目已删除');
      setDeleteConfirmOpen(false);
      setDeletingProject(null);
      fetchProjects(pagination.page);
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // 登出
  const handleLogout = async () => {
    try {
      await fetch('/api/dingtalk/logout', { method: 'POST' });
    } catch (err) {
      // 即使登出 API 失败也跳转
    }
    window.location.href = '/';
  };

  const inputClass = "bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors";

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
            森宇集团 · 项目管理后台
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* 返回大屏 */}
          <a href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900/40 text-cyan-400 text-sm hover:bg-blue-900/20 transition-colors">
            <LayoutDashboard size={16} />
            指挥大屏
          </a>

          {/* 用户信息 */}
          {user && (
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {user.name?.charAt(0) || '?'}
              </div>
              <span className="text-slate-300 text-sm">{user.name}</span>
            </div>
          )}

          {/* 登出 */}
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
          {/* 搜索 */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
              <input type="text" className={`${inputClass} pl-9 w-full`}
                placeholder="搜索项目名称/合同编号..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button type="submit"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm hover:from-cyan-400 hover:to-blue-500 transition-all">
              搜索
            </button>
          </form>

          {/* 服务类别筛选 */}
          <select className={inputClass} value={filterCategory}
            onChange={e => { setFilterCategory(e.target.value); }}>
            <option value="">全部类别</option>
            {SERVICE_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* 项目状态筛选 */}
          <select className={inputClass} value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); }}>
            <option value="">全部状态</option>
            {PROJECT_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* 刷新 */}
          <button onClick={() => fetchProjects(pagination.page)}
            className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="刷新">
            <RefreshCw size={18} />
          </button>

          {/* 新建项目 */}
          <button onClick={handleCreate}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all font-medium shadow-lg shadow-blue-900/30">
            <Plus size={18} />
            新建项目
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Project Table */}
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
              <button onClick={() => fetchProjects(1)}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                重试
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-20">
              <Building2 className="size-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-500 mb-4">暂无项目数据</p>
              <button onClick={handleCreate}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all">
                创建第一个项目
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-blue-900/30 bg-slate-800/80">
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">项目名称</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">服务类别</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">项目负责人</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">当前进度</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">项目状态</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 text-sm font-medium">最近周报</th>
                      <th className="text-right px-5 py-3.5 text-slate-400 text-sm font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(project => (
                      <tr key={project.id}
                        className="border-b border-slate-700/30 hover:bg-blue-900/10 transition-colors">
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="text-slate-200 text-sm font-medium">{project.projectName || '-'}</p>
                            <p className="text-slate-500 text-xs mt-0.5">{project.contractNumber || '-'}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-slate-300 text-sm">{project.serviceCategory || '-'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-slate-300 text-sm">{project.projectLeader || '-'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 bg-slate-600/50 rounded-full h-2">
                              <div className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${project.currentProgress || 0}%` }} />
                            </div>
                            <span className="text-cyan-400 text-xs font-medium w-10 text-right">
                              {project.currentProgress ?? 0}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-lg text-xs border font-medium ${getStatusColor(project.projectStatus || '')}`}>
                            {project.projectStatus || '-'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-slate-400 text-sm">{formatDate(project.lastWeeklyReportAt)}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => handleView(project)}
                              className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                              title="查看详情">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => handleEdit(project)}
                              className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors"
                              title="编辑">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => {
                              setWeeklyReportProject(project);
                              setWeeklyReportModalOpen(true);
                            }}
                              className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              title="提交周报">
                              <FileText size={16} />
                            </button>
                            <button onClick={() => handleDeleteClick(project)}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                              title="删除">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-blue-900/30">
                  <span className="text-slate-500 text-sm">
                    共 {pagination.total} 条记录，第 {pagination.page} / {pagination.totalPages} 页
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => fetchProjects(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-slate-400 text-sm px-2">{pagination.page}</span>
                    <button onClick={() => fetchProjects(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="p-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modals & Drawers */}
      {/* ============================================================ */}
      <ProjectFormModal
        open={formModalOpen}
        project={editingProject}
        onClose={() => { setFormModalOpen(false); setEditingProject(null); }}
        onSuccess={() => fetchProjects(pagination.page)}
      />

      <ProjectDetailDrawer
        open={detailDrawerOpen}
        project={selectedProject}
        onClose={() => { setDetailDrawerOpen(false); setSelectedProject(null); }}
        onEdit={() => selectedProject && handleEdit(selectedProject)}
        onWeeklyReport={() => {
          if (selectedProject) {
            setWeeklyReportProject(selectedProject);
            setWeeklyReportModalOpen(true);
          }
        }}
        onRefresh={() => fetchProjects(pagination.page)}
      />

      <WeeklyReportModal
        open={weeklyReportModalOpen}
        projectId={weeklyReportProject?.id || 0}
        projectName={weeklyReportProject?.projectName || ''}
        onClose={() => { setWeeklyReportModalOpen(false); setWeeklyReportProject(null); }}
        onSuccess={() => fetchProjects(pagination.page)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="确认删除"
        message={`确定要删除项目「${deletingProject?.projectName || ''}」吗？此操作为软删除，删除后项目状态将变为"已删除"。`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteConfirmOpen(false); setDeletingProject(null); }}
        loading={deleting}
      />
    </div>
  );
}