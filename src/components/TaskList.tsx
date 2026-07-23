import { useRealtimeTasks } from '../hooks/useRealtimeTasks';
import { useTaskMilestones } from '../hooks/useTaskMilestones';
import { useState } from 'react';
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

export default function TaskList({ onTaskClick }: { onTaskClick?: (task: Task) => void }) {
  const { tasks, loading } = useRealtimeTasks();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);
  
  const { milestones: hoverMilestones } = useTaskMilestones(hoveredTask?.id || null);

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
        <h3 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-blue-700 to-cyan-400 rounded-sm"></span>
          任务总表（实时同步）
        </h3>
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
                    暂无任务数据，请在 AI 表格中添加任务。
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