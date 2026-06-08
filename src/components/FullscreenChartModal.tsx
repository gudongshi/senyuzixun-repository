import { X } from 'lucide-react';
import TaskChart from './TaskChart';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';

interface FullscreenChartModalProps {
  open: boolean;
  onClose: () => void;
  task: any;
  milestones: any[];
  chartType: 'gantt' | 'milestone' | 'both';
}

export default function FullscreenChartModal({
  open,
  onClose,
  task,
  milestones,
  chartType,
}: FullscreenChartModalProps) {
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

  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open || !task) return null;

  const showGantt = chartType === 'gantt' || chartType === 'both';
  const showMilestone = chartType === 'milestone' || chartType === 'both';
  const chartHeight = showMilestone ? Math.max(500, milestones.length * 45 + 100) : 500;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0f172a',
      }}
    >
      {/* 遮罩层 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          zIndex: 1,
        }}
        onClick={onClose}
      />

      {/* 内容容器 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
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
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
          }}
        >
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#00f2ff' }}>
              {task['任务名称']}
            </h2>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>图表详情（全屏查看）</p>
          </div>
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

        {/* 图表内容 - 可滚动 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          <TaskChart
            taskName={task['任务名称']}
            planStart={task['计划开始时间']}
            planEnd={task['计划结束时间']}
            actualStart={task['实际开始时间']}
            actualEnd={task['实际结束时间']}
            milestones={milestones}
            height={chartHeight}
            showTitle={true}
            showGantt={showGantt}
            ganttTitle="📅 任务时间轴（甘特图）"
            milestoneTitle="🎯 里程碑趋势对比（计划 vs 实际）"
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}