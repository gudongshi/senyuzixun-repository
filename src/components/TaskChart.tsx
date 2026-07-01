import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface Milestone {
  id: string;
  milestone_name: string;
  planned_date: string;
  actual_date: string | null;
  planned_progress?: number;
}

interface TaskChartProps {
  taskName: string;
  planStart?: string;
  planEnd?: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  milestones: Milestone[];
  currentProgress?: number;
  progressHistory?: { date: string; progress: number }[];
  height?: number;
  showTitle?: boolean;
}

export default function TaskChart({
  taskName,
  planStart,
  planEnd,
  actualStart,
  actualEnd,
  milestones,
  currentProgress = 0,
  progressHistory = [],
  height = 200,
  showTitle = true,
}: TaskChartProps) {
  const lineChartRef = useRef<HTMLDivElement>(null);
  const hasTimeData = (planStart && planEnd) || actualStart;

  useEffect(() => {
    if (!lineChartRef.current || !hasTimeData) return;

    const container = lineChartRef.current;
    const chart = echarts.init(container);

    // 1. 生成 X 轴日期（每周五）
    const getWeekFridays = (start: string, end: string): string[] => {
      const dates: string[] = [];
      const current = new Date(start);
      const last = new Date(end);
      while (current.getDay() !== 5) {
        current.setDate(current.getDate() + 1);
      }
      while (current <= last) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 7);
      }
      return dates;
    };

    const allStart = planStart || actualStart || new Date().toISOString().split('T')[0];
    const allEnd = planEnd || actualEnd || new Date().toISOString().split('T')[0];
    const fridays = getWeekFridays(allStart, allEnd);
    if (fridays.length === 0) fridays.push(allStart);

    // 2. 构建计划进度数据（由里程碑计划进度点 + 端点插值）
    const sortedMilestones = [...milestones]
      .filter(m => m.planned_date && m.planned_progress !== undefined && m.planned_progress !== null)
      .sort((a, b) => new Date(a.planned_date).getTime() - new Date(b.planned_date).getTime());

    const planPoints: { date: string; progress: number }[] = [];

    // 起点：任务计划开始日期，进度 0%
    if (planStart) {
      planPoints.push({ date: planStart, progress: 0 });
    }

    // 里程碑节点
    sortedMilestones.forEach(m => {
      planPoints.push({
        date: m.planned_date,
        progress: Math.min(100, Math.max(0, m.planned_progress || 0)),
      });
    });

    // 终点：任务计划结束日期，进度 100%
    if (planEnd) {
      planPoints.push({ date: planEnd, progress: 100 });
    }

    planPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 对每个周五，插值计算计划进度
    const planData = fridays.map(friday => {
      let before = null, after = null;
      for (const p of planPoints) {
        const d = new Date(p.date).getTime();
        const f = new Date(friday).getTime();
        if (d <= f) before = p;
        if (d >= f && after === null) after = p;
      }
      if (before && after) {
        if (before.date === after.date) return before.progress;
        const t = (new Date(friday).getTime() - new Date(before.date).getTime()) / 
                  (new Date(after.date).getTime() - new Date(before.date).getTime());
        return Math.round(before.progress + (after.progress - before.progress) * t);
      }
      return before ? before.progress : after ? after.progress : null;
    });

    // 3. 构建实际进度数据（来自周报历史 + 当前进度）
    const actualPoints: { date: string; progress: number }[] = [
      ...progressHistory.map(p => ({ date: p.date, progress: Math.min(100, Math.max(0, p.progress)) })),
    ];
    if (currentProgress !== undefined && currentProgress !== null) {
      const today = new Date().toISOString().split('T')[0];
      if (!actualPoints.some(p => p.date === today)) {
        actualPoints.push({ date: today, progress: Math.min(100, Math.max(0, currentProgress)) });
      }
    }
    actualPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const actualData = fridays.map(friday => {
      let latest = null;
      for (const p of actualPoints) {
        if (new Date(p.date).getTime() <= new Date(friday).getTime()) {
          latest = p;
        } else break;
      }
      return latest ? latest.progress : null;
    });

    // 4. 里程碑标记（在计划线上的关键节点）
    const markData = sortedMilestones
      .map(m => {
        const idx = fridays.indexOf(m.planned_date);
        if (idx === -1) return null;
        return {
          name: m.milestone_name,
          coord: [idx, Math.min(100, Math.max(0, m.planned_progress || 0))],
          value: m.planned_progress || 0,
        };
      })
      .filter(item => item !== null);

    // 5. ECharts 配置
    const option = {
      animation: false,
      title: showTitle ? {
        text: '任务进度趋势',
        left: 'center',
        textStyle: { color: '#00f2ff', fontSize: 14 },
      } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          let res = `<div style="font-size:13px;font-weight:bold;">${params[0].axisValue}</div>`;
          params.forEach((p: any) => {
            if (p.value !== null && p.value !== undefined) {
              res += `<div style="color:${p.color};margin-top:2px;">${p.marker} ${p.seriesName}: ${p.value}%</div>`;
            }
          });
          return res;
        },
      },
      legend: {
        data: ['计划进度', '实际进度'],
        textStyle: { color: '#e2e8f0' },
        top: 0,
        right: 10,
      },
      grid: {
        left: '10%',
        right: '5%',
        top: showTitle ? '18%' : '8%',
        bottom: '8%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: fridays,
        name: '日期（每周五）',
        axisLabel: {
          rotate: 30,
          color: '#94a3b8',
          interval: 0,
          formatter: (value: string) => {
            const d = new Date(value);
            return `${d.getMonth()+1}/${d.getDate()}`;
          },
        },
        axisLine: { lineStyle: { color: '#475569' } },
      },
      yAxis: {
        type: 'value',
        name: '完成进度 (%)',
        min: 0,
        max: 100,
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      },
      series: [
        {
          name: '计划进度',
          type: 'line',
          data: planData,
          smooth: false,
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
          symbol: 'circle',
          symbolSize: 4,
          connectNulls: true,
          label: {
            show: true,
            position: 'top',
            formatter: (params: any) => {
              if (params.value === null) return '';
              return params.value + '%';
            },
            color: '#93c5fd',
            fontSize: 10,
          },
          markPoint: {
            data: markData,
            symbol: 'diamond',
            symbolSize: 16,
            itemStyle: { color: '#3b82f6', borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true,
              formatter: (params: any) => {
                return params.name + '\n' + params.value + '%';
              },
              color: '#93c5fd',
              fontSize: 10,
              position: 'top',
            },
          },
        },
        {
          name: '实际进度',
          type: 'line',
          data: actualData,
          smooth: false,
          lineStyle: { color: '#10b981', width: 2 },
          itemStyle: { color: '#10b981' },
          symbol: 'diamond',
          symbolSize: 6,
          connectNulls: true,
          label: {
            show: true,
            position: 'bottom',
            formatter: (params: any) => {
              if (params.value === null) return '';
              return params.value + '%';
            },
            color: '#6ee7b7',
            fontSize: 10,
          },
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => { chart.dispose(); window.removeEventListener('resize', handleResize); };
  }, [planStart, planEnd, actualStart, actualEnd, milestones, currentProgress, progressHistory, hasTimeData, showTitle]);

  if (!hasTimeData) {
    return <div className="bg-slate-700/30 rounded-xl p-6 text-center text-slate-400">暂无时间数据</div>;
  }

  return (
    <div className="space-y-4">
      <div ref={lineChartRef} style={{ width: '100%', height: `${Math.max(height, 300)}px`, minHeight: '300px' }} />
    </div>
  );
}