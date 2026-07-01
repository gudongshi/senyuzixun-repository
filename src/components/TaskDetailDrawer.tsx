import { X } from 'lucide-react';
import { useTaskMilestones } from '../hooks/useTaskMilestones';
import TaskChart from './TaskChart';
import FullscreenChartModal from './FullscreenChartModal';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TaskDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  task: any;
}

export default function TaskDetailDrawer({ open, onClose, task }: TaskDetailDrawerProps) {
  const { milestones, loading: milestonesLoading } = useTaskMilestones(task?.id || null);
  const [fullscreenChartOpen, setFullscreenChartOpen] = useState(false);
  const [fullscreenChartType, setFullscreenChartType] = useState<'gantt' | 'milestone' | 'both'>('both');

  // 防止背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!task) return null;

  const getStatusColor = (status: string) => {
    if (!status) return 'text-gray-400 bg-gray-500/20';
    switch (status) {
      case '进行中': return 'text-blue-400 bg-blue-500/20';
      case '已完成': return 'text-green-400 bg-green-500/20';
      case '待办': return 'text-yellow-400 bg-yellow-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getRiskColor = (level: string) => {
    if (!level) return 'text-gray-400 bg-gray-500/20';
    if (level === '红灯' || level === '高风险' || level === '高') {
      return 'text-red-400 bg-red-500/20';
    }
    if (level === '黄灯' || level === '中风险' || level === '中') {
      return 'text-yellow-400 bg-yellow-500/20';
    }
    return 'text-green-400 bg-green-500/20';
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '未设置';
    return dateStr;
  };

  const getFieldValue = (task: any, fieldNames: string[]): string => {
    for (const name of fieldNames) {
      const value = task[name];
      if (value !== undefined && value !== null && value !== '') {
        return String(value);
      }
    }
    return '未指定';
  };

  const taskName = task['任务名称'] || task.title || task.name || '未命名';
  const progress = task['当前进度(%)'] ?? task.progress ?? 0;
  const status = getFieldValue(task, ['状态', 'status']);
  const responsible = getFieldValue(task, ['责任人', 'assignee', 'responsible']);
  const riskLevel = getFieldValue(task, ['风险等级', 'riskLevel']);
  const taskCategory = getFieldValue(task, ['任务分类', 'taskCategory']);
  const project = getFieldValue(task, ['所属项目', 'project']);
  const planStart = task['计划开始时间'];
  const planEnd = task['计划结束时间'];
  const actualStart = task['实际开始时间'];
  const actualEnd = task['实际结束时间'];
  const remark = getFieldValue(task, ['备注', 'remark']);
  const createdAt = task.created_at;

  const hasTimeData = (planStart && planEnd) || actualStart;
  const hasMilestoneData = milestones.length > 0;

  const handleChartClick = () => {
    setFullscreenChartType('both');
    setFullscreenChartOpen(true);
  };

  if (!open) return null;

  // 抽屉内容
  const drawerContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '700px',
        backgroundColor: '#1e293b',
        borderLeft: '2px solid #00f2ff',
        boxShadow: '-5px 0 30px rgba(0, 242, 255, 0.3)',
        zIndex: 1001,
        transform: 'translateX(0)',
        transition: 'transform 0.3s ease-out',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid rgba(0, 242, 255, 0.3)',
          backgroundColor: '#1e293b',
        }}
      >
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#00f2ff' }}>任务详情</h2>
        <button
          onClick={onClose}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '2px solid rgba(0, 242, 255, 0.5)',
            background: 'transparent',
            color: '#00f2ff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#00f2ff';
            e.currentTarget.style.backgroundColor = 'rgba(0, 242, 255, 0.2)';
            e.currentTarget.style.transform = 'rotate(90deg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 242, 255, 0.5)';
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.transform = 'rotate(0deg)';
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* 内容区域 - 可滚动 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 任务名称 */}
          <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#00f2ff', marginBottom: '8px' }}>📋 任务名称</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>{taskName}</div>
          </div>

          {/* 核心信息网格 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>📊 当前进度</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#00f2ff' }}>{progress}%</div>
              <div style={{ marginTop: '8px', height: '4px', background: '#334155', borderRadius: '4px' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#00f2ff', borderRadius: '4px' }} />
              </div>
            </div>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>🔖 状态</div>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  background: status === '进行中' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: status === '进行中' ? '#60a5fa' : '#34d399',
                }}
              >
                {status}
              </span>
            </div>
          </div>

          {/* 信息行 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>👤 责任人</div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{responsible}</div>
            </div>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>⚠️ 风险等级</div>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  background: riskLevel === '红灯' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: riskLevel === '红灯' ? '#f87171' : '#34d399',
                }}
              >
                {riskLevel || '未评估'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>🏷️ 任务分类</div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{taskCategory}</div>
            </div>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>📁 所属项目</div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{project}</div>
            </div>
          </div>

          {/* 计划时间 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>📅 计划开始时间</div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{formatDate(planStart)}</div>
            </div>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>📅 计划结束时间</div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{formatDate(planEnd)}</div>
            </div>
          </div>

          {/* 实际时间 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>✅ 实际开始时间</div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{formatDate(actualStart)}</div>
            </div>
            <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>✅ 实际结束时间</div>
              <div style={{ fontSize: '14px', color: '#fff' }}>{formatDate(actualEnd)}</div>
            </div>
          </div>

          {/* 备注 */}
          <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>📝 备注</div>
            <div style={{ fontSize: '14px', color: '#cbd5e1' }}>{remark || '无'}</div>
          </div>

          {/* 图表区域 */}
          {(hasTimeData || hasMilestoneData) && (
            <div
              style={{
                background: 'rgba(51, 65, 85, 0.5)',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
              }}
              onClick={handleChartClick}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>📈 任务图表（点击放大全屏查看）</span>
                <span style={{ fontSize: '10px', color: '#00f2ff' }}>🔍 点击全屏</span>
              </div>
              <TaskChart
                taskName={taskName}
                planStart={planStart}
                planEnd={planEnd}
                actualStart={actualStart}
                actualEnd={actualEnd}
                milestones={milestones}
                height={280}
                showTitle={false}
                showGantt={false}
              />
            </div>
          )}

          {/* 里程碑 */}
          <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>🎯 里程碑</div>
            {milestones.map((milestone: any) => (
  <div key={milestone.id} style={{ borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '12px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#67e8f9' }}>{milestone.milestone_name}</span>
      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', alignItems: 'center' }}>
        <span style={{ color: '#94a3b8' }}>计划: {milestone.planned_date || '未设置'}</span>
        <span style={{ color: milestone.actual_date ? '#34d399' : '#fbbf24' }}>
          实际: {milestone.actual_date || '未完成'}
        </span>
      </div>
    </div>
  </div>
))}
          </div>

          {/* 创建时间 */}
          <div style={{ background: 'rgba(51, 65, 85, 0.5)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>🕐 创建时间</div>
            <div style={{ fontSize: '14px', color: '#cbd5e1' }}>{createdAt ? new Date(createdAt).toLocaleString() : '未知'}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* 遮罩层 - 使用 Portal 渲染到 body */}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            zIndex: 1000,
          }}
          onClick={onClose}
        />,
        document.body
      )}
      {/* 抽屉 - 使用 Portal 渲染到 body */}
      {createPortal(drawerContent, document.body)}
      {/* 全屏图表模态框 */}
      <FullscreenChartModal
        open={fullscreenChartOpen}
        onClose={() => setFullscreenChartOpen(false)}
        task={task}
        milestones={milestones}
        chartType={fullscreenChartType}
      />
    </>
  );
}