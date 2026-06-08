import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TaskChart from './TaskChart';

interface HoverChartCardProps {
  task: any;
  milestones: any[];
  visible: boolean;
  position: { x: number; y: number };
}

export default function HoverChartCard({ task, milestones, visible }: HoverChartCardProps) {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (visible && task) {
      const timer = setTimeout(() => setShow(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [visible, task]);

  if (!show || !task || !mounted) return null;

  // 调试日志
  console.log('[HoverChartCard] 渲染任务:', task['任务名称'], '里程碑数量:', milestones.length);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '480px',
        backgroundColor: '#0f172a',
        border: '2px solid #00f2ff',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 20px 35px rgba(0,0,0,0.5), 0 0 15px rgba(0,242,255,0.3)',
        zIndex: 100000,
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#00f2ff', marginBottom: '12px', borderBottom: '1px solid #00f2ff', paddingBottom: '8px' }}>
        📊 {task['任务名称']}
      </div>
      <div style={{ minHeight: '280px' }}>
        <TaskChart
          key={milestones.length}
          taskName={task['任务名称']}
          planStart={task['计划开始时间']}
          planEnd={task['计划结束时间']}
          actualStart={task['实际开始时间']}
          actualEnd={task['实际结束时间']}
          milestones={milestones}
          height={220}
          showTitle={false}
          showGantt={false}
        />
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #334155' }}>
        💡 点击任务行查看完整详情
      </div>
    </div>,
    document.body
  );
}