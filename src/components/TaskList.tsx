import { useRealtimeTasks } from '../hooks/useRealtimeTasks';
import { useTaskMilestones } from '../hooks/useTaskMilestones';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import TaskDetailDrawer from './TaskDetailDrawer';
import HoverChartCard from './HoverChartCard';

interface Task {
  id: string;
  '任务名称': string;
  '当前进度(%)'?: number;
  '状态': string;
  '风险等级'?: string;
  '责任人'?: string;
  '任务分类'?: string;
  '所属项目'?: string;
  '计划开始时间'?: string;
  '计划结束时间'?: string;
  '实际开始时间'?: string;
  '实际结束时间'?: string;
  '备注'?: string;
  created_at: string;
}

interface FilterOptions {
  responsible: string[];
  category: string[];
  project: string[];
  status: string[];
  riskLevel: string[];
}

export default function TaskList({ onTaskClick }: { onTaskClick?: (task: Task) => void }) {
  const [organization, setOrganization] = useState<'森宇' | '风控中心'>('森宇');
  const tableName = organization === '风控中心' ? 'tasks_center' : 'tasks';
  const { tasks: realtimeTasks, loading: realtimeLoading } = useRealtimeTasks(tableName);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);

  const { milestones: hoverMilestones } = useTaskMilestones(hoveredTask?.id || null);

  // ---- 筛选状态 ----
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    riskLevel: '',
    responsible: '',
    category: '',
    project: '',
    startDate: '',
    endDate: '',
  });
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    responsible: [],
    category: [],
    project: [],
    status: [],
    riskLevel: [],
  });
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  // 判断是否有筛选条件
  const hasFilters = !!(
    filters.search ||
    filters.status ||
    filters.riskLevel ||
    filters.responsible ||
    filters.category ||
    filters.project ||
    filters.startDate ||
    filters.endDate
  );

  // 只有存在筛选条件时才使用 API 数据，否则使用实时数据（支持双表 Realtime）
  const useApiData = hasFilters;
  const tasks = useApiData ? filteredTasks : realtimeTasks;
  const loading = useApiData ? filteredLoading : realtimeLoading;

  const handleTaskClick = (task: Task) => {
    if (onTaskClick) {
      onTaskClick(task);
      return;
    }
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedTask(null);
  };

  const handleMouseEnter = (task: Task, event: React.MouseEvent) => {
    const timer = setTimeout(() => {
      setHoveredTask(task);
      setHoverPosition({ x: event.clientX, y: event.clientY });
    }, 500);
    setHoverTimer(timer);
  };

  const handleMouseLeave = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
    setHoveredTask(null);
  };

  // ---- 动态提取下拉选项 ----
  const fetchFilterOptions = useCallback(async (org: string) => {
    try {
      console.log(`📋 获取筛选选项: organization=${org}`);
      const resp = await fetch(`/api/tasks/options?organization=${encodeURIComponent(org)}`);
      const result = await resp.json();
      if (result.success) {
        setFilterOptions(result.data);
        console.log(`✅ 下拉选项加载成功: 责任人 ${result.data.responsible.length} 个, 分类 ${result.data.category.length} 个`);
      }
    } catch (err) {
      console.error('❌ 获取下拉选项失败:', err);
    }
  }, []);

  // 组件挂载 + 组织切换时获取下拉选项
  useEffect(() => {
    fetchFilterOptions(organization);
  }, [organization, fetchFilterOptions]);

  // ---- 筛选数据请求 ----
  const fetchFilteredTasks = useCallback(async () => {
    setFilteredLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('organization', organization);
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      if (filters.riskLevel) params.set('riskLevel', filters.riskLevel);
      if (filters.responsible) params.set('responsible', filters.responsible);
      if (filters.category) params.set('category', filters.category);
      if (filters.project) params.set('project', filters.project);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      params.set('page', String(pagination.page));
      params.set('limit', '20');

      console.log(`📋 筛选任务: organization=${organization}`, filters);
      const resp = await fetch(`/api/tasks?${params.toString()}`);
      const result = await resp.json();
      if (result.success) {
        setFilteredTasks(result.data);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages,
        }));
        console.log(`✅ 筛选结果: ${result.data.length} 条，共 ${result.pagination.total} 条`);
      }
    } catch (err) {
      console.error('❌ 筛选任务失败:', err);
    } finally {
      setFilteredLoading(false);
    }
  }, [filters, organization, pagination.page]);

  // 筛选条件变化时自动请求
  useEffect(() => {
    if (hasFilters) {
      // 重置到第 1 页
      setPagination(prev => ({ ...prev, page: 1 }));
      fetchFilteredTasks();
    }
  }, [
    filters.search,
    filters.status,
    filters.riskLevel,
    filters.responsible,
    filters.category,
    filters.project,
    filters.startDate,
    filters.endDate,
  ]);

  // 分页变化时请求
  useEffect(() => {
    if (hasFilters && pagination.page > 1) {
      fetchFilteredTasks();
    }
  }, [pagination.page]);

  // ---- 筛选控件变更处理 ----
  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleResetFilters = () => {
    console.log('🔄 重置筛选条件');
    setFilters({
      search: '',
      status: '',
      riskLevel: '',
      responsible: '',
      category: '',
      project: '',
      startDate: '',
      endDate: '',
    });
    setPagination({ page: 1, total: 0, totalPages: 0 });
  };

  const handleRefresh = () => {
    console.log('🔄 手动刷新任务列表');
    if (useApiData) {
      fetchFilteredTasks();
    }
  };

  if (loading && tasks.length === 0) {
    return <div className="text-center py-8 text-slate-400">加载任务中...</div>;
  }

  const getRiskLevelClass = (riskLevel: string | undefined) => {
    if (!riskLevel) return 'bg-gray-500/20 text-gray-300';
    if (riskLevel === '红灯' || riskLevel === '高风险' || riskLevel === '高') {
      return 'bg-red-500/20 text-red-300';
    }
    if (riskLevel === '黄灯' || riskLevel === '中风险' || riskLevel === '中') {
      return 'bg-yellow-500/20 text-yellow-300';
    }
    return 'bg-green-500/20 text-green-300';
  };

  return (
    <>
      <div className="mt-6 bg-slate-800/60 border border-blue-900/30 rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-700 to-cyan-400 rounded-sm"></span>
            任务总表（实时同步）
          </div>
          <div className="flex items-center gap-2">
            {/* 组织切换 */}
            <select
              value={organization}
              onChange={(e) => setOrganization(e.target.value as '森宇' | '风控中心')}
              className="bg-slate-700 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors"
            >
              <option value="森宇">森宇</option>
              <option value="风控中心">风控中心</option>
            </select>
            {/* 刷新按钮 */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>
          </div>
        </h3>

        {/* ============================================================ */}
        {/* 筛选面板 */}
        {/* ============================================================ */}
        <div className="mb-4 space-y-2">
          {/* 筛选控件行 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 任务名称搜索 */}
            <input
              type="text"
              placeholder="🔍 任务名称..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-200 text-xs rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:border-cyan-400 transition-colors placeholder-slate-500"
            />

            {/* 状态下拉 */}
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors"
            >
              <option value="">全部状态</option>
              {filterOptions.status.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* 风险等级下拉 */}
            <select
              value={filters.riskLevel}
              onChange={(e) => handleFilterChange('riskLevel', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors"
            >
              <option value="">全部风险</option>
              {filterOptions.riskLevel.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* 责任人下拉 */}
            <select
              value={filters.responsible}
              onChange={(e) => handleFilterChange('responsible', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors max-w-[120px]"
            >
              <option value="">全部责任人</option>
              {filterOptions.responsible.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* 任务分类下拉 */}
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors max-w-[120px]"
            >
              <option value="">全部分类</option>
              {filterOptions.category.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* 所属项目下拉 */}
            <select
              value={filters.project}
              onChange={(e) => handleFilterChange('project', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors max-w-[120px]"
            >
              <option value="">全部项目</option>
              {filterOptions.project.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* 开始日期 */}
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors"
              title="计划结束时间起始"
            />

            {/* 结束日期 */}
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="bg-slate-700 border border-blue-800/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400 transition-colors"
              title="计划结束时间截止"
            />

            {/* 重置按钮 */}
            <button
              onClick={handleResetFilters}
              className="bg-slate-700 border border-red-800/40 text-red-400 text-xs rounded-lg px-3 py-1.5 hover:bg-red-900/20 hover:border-red-500/50 transition-all"
            >
              🔄 重置
            </button>
          </div>

          {/* 任务统计提示 */}
          <div className="text-xs text-cyan-400 flex items-center gap-2">
            {useApiData ? (
              <>
                <span>📋 {organization} · 筛选结果: {pagination.total} 条</span>
                {pagination.totalPages > 1 && (
                  <span className="text-slate-500">
                    | 第 {pagination.page}/{pagination.totalPages} 页
                  </span>
                )}
              </>
            ) : (
              <span>📋 {organization} · {tasks.length} 条任务（实时同步）</span>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 任务表格 */}
        {/* ============================================================ */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs uppercase bg-slate-700/50 text-cyan-400">
              <tr>
                <th className="px-4 py-3 w-24">任务名称</th>
                <th className="px-4 py-3 w-20">进度 (%)</th>
                <th className="px-4 py-3 w-32">风险等级</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const progress = task['当前进度(%)'] ?? 0;
                const riskLevel = task['风险等级'] || '';

                return (
                  <tr
                    key={task.id}
                    className="border-b border-blue-900/30 hover:bg-blue-900/40 cursor-pointer transition-all duration-200 hover:translate-x-0.5"
                    onClick={() => handleTaskClick(task)}
                    onMouseEnter={(e) => handleMouseEnter(task, e)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <td className="px-4 py-2 font-medium break-words">{task['任务名称']}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-cyan-400 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span>{progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${getRiskLevelClass(riskLevel)}`}>
                        {riskLevel || '未设置'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-slate-400">
                    {hasFilters ? '没有匹配的任务，请调整筛选条件' : `暂无任务数据${organization !== '森宇' ? `（${organization}）` : ''}，请在 AI 表格中添加任务。`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 悬停浮窗 */}
      <HoverChartCard
        task={hoveredTask}
        milestones={hoverMilestones}
        visible={hoveredTask !== null}
        position={hoverPosition}
      />

      {/* 任务详情抽屉（仅当无外部 onTaskClick 时使用内部抽屉） */}
      {!onTaskClick && (
        <TaskDetailDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          task={selectedTask}
        />
      )}
    </>
  );
}