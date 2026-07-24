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
  milestones?: Milestone[];
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
  milestones = [],
  currentProgress = 0,
  progressHistory = [],
  height = 200,
  showTitle = true,
}: TaskChartProps) {
  const lineChartRef = useRef<HTMLDivElement>(null);
  const hasTimeData = (planStart && planEnd) || actualStart || milestones.length > 0;

  useEffect(() => {
    if (!lineChartRef.current || !hasTimeData) {
      if (lineChartRef.current) {
        lineChartRef.current.innerHTML = '<div class="text-center text-slate-400 py-8">暂无时间数据</div>';
      }
      return;
    }

    const container = lineChartRef.current;
    const existingChart = echarts.getInstanceByDom(container);
    if (existingChart) {
      existingChart.dispose();
    }

    const chart = echarts.init(container);

    // 1. 确定时间范围
    let startDate = planStart;
    let endDate = planEnd;
    if (!startDate || !endDate) {
      const dates = milestones
        .filter(m => m.planned_date)
        .map(m => new Date(m.planned_date).getTime());
      if (dates.length > 0) {
        const min = new Date(Math.min(...dates));
        const max = new Date(Math.max(...dates));
        startDate = startDate || min.toISOString().split('T')[0];
        endDate = endDate || max.toISOString().split('T')[0];
        if (startDate === endDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() - 7);
          startDate = d.toISOString().split('T')[0];
          d.setDate(d.getDate() + 14);
          endDate = d.toISOString().split('T')[0];
        }
      } else {
        container.innerHTML = '<div class="text-center text-slate-400 py-8">暂无时间数据</div>';
        return;
      }
    }

    // 2. 构建计划进度数据（时间戳 + 进度）
    const sortedMilestones = [...milestones]
      .filter(m => m.planned_date && m.planned_progress !== undefined && m.planned_progress !== null)
      .sort((a, b) => new Date(a.planned_date).getTime() - new Date(b.planned_date).getTime());

    console.log(`📊 [TaskChart] 里程碑数据: 总数=${milestones.length}, 有计划日期=${sortedMilestones.length}, 有实际日期=${milestones.filter(m => m.actual_date).length}`);

    const planPoints: { date: string; progress: number }[] = [];
    planPoints.push({ date: startDate, progress: 0 });
    sortedMilestones.forEach(m => {
      planPoints.push({
        date: m.planned_date,
        progress: Math.min(100, Math.max(0, m.planned_progress || 0)),
      });
    });
    planPoints.push({ date: endDate, progress: 100 });

    // 按日期去重：同一日期保留最高进度
    const planPointsMap = new Map<string, number>();
    planPoints.forEach(p => {
      const existing = planPointsMap.get(p.date);
      if (existing === undefined || p.progress > existing) {
        planPointsMap.set(p.date, p.progress);
      }
    });
    const dedupedPlanPoints = Array.from(planPointsMap.entries())
      .map(([date, progress]) => ({ date, progress }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log(`📊 [TaskChart] 计划进度: 去重前=${planPoints.length}, 去重后=${dedupedPlanPoints.length}`);

    const planData = dedupedPlanPoints.map(p => ({
      value: [new Date(p.date).getTime(), p.progress],
    }));

    // 3. 构建实际进度数据（时间戳 + 进度）
    const actualPoints: { date: string; progress: number }[] = [];

    if (planStart) {
      actualPoints.push({ date: planStart, progress: 0 });
    }

    console.log(`📊 [TaskChart] 周报进度历史: 条数=${progressHistory.length}`);
    progressHistory.forEach(p => {
      actualPoints.push({ date: p.date, progress: Math.min(100, Math.max(0, p.progress)) });
    });

    // 已完成里程碑的 actual_date 作为实际进度数据点
    const completedMilestones = milestones.filter(m => m.actual_date);
    console.log(`📊 [TaskChart] 已完成里程碑: ${completedMilestones.length} 个`);
    completedMilestones.forEach(m => {
      const progress = m.planned_progress ?? 0;
      actualPoints.push({
        date: m.actual_date!,
        progress: Math.min(100, Math.max(0, progress)),
      });
    });

    if (currentProgress !== undefined && currentProgress !== null) {
      const today = new Date().toISOString().split('T')[0];
      if (!actualPoints.some(p => p.date === today)) {
        actualPoints.push({ date: today, progress: Math.min(100, Math.max(0, currentProgress)) });
      }
    }

    // 按日期去重：同一日期保留最高进度（解决周报重复节点问题）
    const actualPointsMap = new Map<string, number>();
    actualPoints.forEach(p => {
      const existing = actualPointsMap.get(p.date);
      if (existing === undefined || p.progress > existing) {
        actualPointsMap.set(p.date, p.progress);
      }
    });
    const dedupedActualPoints = Array.from(actualPointsMap.entries())
      .map(([date, progress]) => ({ date, progress }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log(`📊 [TaskChart] 实际进度: 去重前=${actualPoints.length}, 去重后=${dedupedActualPoints.length}`);

    const actualData = dedupedActualPoints.map(p => ({
      value: [new Date(p.date).getTime(), p.progress],
    }));

    // 4. 里程碑标记（计划线上的蓝色菱形节点）
    const markData = sortedMilestones
      .map(m => {
        const ts = new Date(m.planned_date).getTime();
        return {
          name: m.milestone_name,
          coord: [ts, Math.min(100, Math.max(0, m.planned_progress || 0))],
          value: m.planned_progress || 0,
        };
      })
      .filter(item => item !== null);

    // 5. 已完成里程碑标记（按名称去重，避免重复绘制）
    const completedMarkDataMap = new Map<string, any>();
    completedMilestones.forEach(m => {
      if (!completedMarkDataMap.has(m.milestone_name)) {
        const ts = new Date(m.actual_date!).getTime();
        completedMarkDataMap.set(m.milestone_name, {
          name: `✓ ${m.milestone_name}`,
          coord: [ts, Math.min(100, Math.max(0, m.planned_progress || 0))],
          value: m.planned_progress || 0,
        });
      }
    });
    const completedMarkData = Array.from(completedMarkDataMap.values());

    console.log(`📊 [TaskChart] 已完成里程碑标记: ${completedMarkData.length} 个(去重后)`);

    // 6. ECharts 配置
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
          if (!params || params.length === 0) return '';
          const date = new Date(params[0].value[0]).toLocaleDateString('zh-CN');
          let res = `<div style="font-size:13px;font-weight:bold;">${date}</div>`;
          params.forEach((p: any) => {
            if (p.value !== null && p.value[1] !== undefined) {
              res += `<div style="color:${p.color};margin-top:2px;">${p.marker} ${p.seriesName}: ${p.value[1]}%</div>`;
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
        left: '12%',
        right: '8%',
        top: showTitle ? '18%' : '8%',
        bottom: '15%',
        containLabel: true,
      },
      xAxis: {
        type: 'time',
        name: '日期',
        axisLabel: {
          rotate: 30,
          color: '#94a3b8',
          formatter: (value: number) => {
            const d = new Date(value);
            return `${d.getMonth()+1}/${d.getDate()}`;
          },
          interval: 'auto',
          showMinLabel: true,
          showMaxLabel: true,
        },
        axisLine: { lineStyle: { color: '#475569' } },
        min: new Date(startDate).getTime(),
        max: new Date(endDate).getTime(),
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
              if (params.value[1] === null) return '';
              return params.value[1] + '%';
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
                if (!params.name) return '';
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
              if (params.value[1] === null) return '';
              return params.value[1] + '%';
            },
            color: '#6ee7b7',
            fontSize: 10,
          },
          markPoint: {
            data: completedMarkData,
            symbol: 'rect',
            symbolSize: [14, 14],
            symbolRotate: 0,
            itemStyle: { color: '#22c55e', borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true,
              formatter: (params: any) => {
                if (!params.name) return '';
                return params.name + '\n' + params.value + '%';
              },
              color: '#86efac',
              fontSize: 10,
              position: 'top',
            },
          },
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [planStart, planEnd, actualStart, actualEnd, milestones, currentProgress, progressHistory, hasTimeData, showTitle]);

  return (
    <div className="space-y-4">
      <div ref={lineChartRef} style={{ width: '100%', height: `${Math.max(height, 300)}px`, minHeight: '300px' }} />
    </div>
  );
}