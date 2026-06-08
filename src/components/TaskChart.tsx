import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface Milestone {
  id: string;
  milestone_name: string;
  planned_date: string;
  actual_date: string | null;
}

interface TaskChartProps {
  taskName: string;
  planStart?: string;
  planEnd?: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  milestones: Milestone[];
  height?: number;
  showTitle?: boolean;
  ganttTitle?: string;
  milestoneTitle?: string;
  showGantt?: boolean;
}

export default function TaskChart({
  taskName,
  planStart,
  planEnd,
  actualStart,
  actualEnd,
  milestones,
  height = 200,
  showTitle = true,
  ganttTitle = '任务时间轴',
  milestoneTitle = '里程碑对比',
  showGantt = false,
}: TaskChartProps) {
  const ganttChartRef = useRef<HTMLDivElement>(null);
  const lineChartRef = useRef<HTMLDivElement>(null);
  const milestoneChartRef = useRef<HTMLDivElement>(null);
  const hasTimeData = (planStart && planEnd) || actualStart;
  const hasMilestoneData = milestones.length > 0;

  // 甘特图（可选）
  useEffect(() => {
    if (!showGantt || !ganttChartRef.current || !hasTimeData) return;

    const chart = echarts.init(ganttChartRef.current);
    const data = [];

    if (planStart && planEnd) {
      data.push({
        name: '计划时间',
        value: [planStart, planEnd],
        itemStyle: { color: '#3b82f6' },
      });
    }

    if (actualStart && actualEnd) {
      data.push({
        name: '实际时间',
        value: [actualStart, actualEnd],
        itemStyle: { color: '#10b981' },
      });
    } else if (actualStart && !actualEnd) {
      const today = new Date().toISOString().split('T')[0];
      data.push({
        name: '实际时间（进行中）',
        value: [actualStart, today],
        itemStyle: { color: '#f59e0b' },
      });
    }

    const option = {
      title: showTitle ? {
        text: ganttTitle,
        left: 'center',
        textStyle: { color: '#00f2ff', fontSize: 14 },
      } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const item = params[0];
          const start = item.value[1];
          const end = item.value[2];
          return `${item.name}<br/>开始: ${start}<br/>结束: ${end}`;
        },
      },
      grid: {
        left: '10%',
        right: '5%',
        top: showTitle ? '15%' : '5%',
        bottom: '5%',
        containLabel: true,
      },
      xAxis: {
        type: 'time' as const,
        name: '日期',
        axisLabel: { rotate: 30, formatter: '{yyyy}-{MM}-{dd}', color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#475569' } },
      },
      yAxis: {
        type: 'category' as const,
        data: ['计划时间', '实际时间'],
        axisLabel: { color: '#e2e8f0' },
        axisLine: { lineStyle: { color: '#475569' } },
      },
      series: [{
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const categoryIndex = api.value(0);
          const start = api.value(1);
          const end = api.value(2);
          const coordStart = api.coord([start, categoryIndex]);
          const coordEnd = api.coord([end, categoryIndex]);
          const width = coordEnd[0] - coordStart[0];
          return {
            type: 'rect',
            shape: { x: coordStart[0], y: coordStart[1] - 12, width: width, height: 24 },
            style: api.style(),
            styleEmphasis: { shadowBlur: 10, shadowColor: '#00f2ff' },
          };
        },
        data: data,
        itemStyle: { borderRadius: 4 },
      }],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => { chart.dispose(); window.removeEventListener('resize', handleResize); };
  }, [planStart, planEnd, actualStart, actualEnd, showTitle, ganttTitle, hasTimeData, showGantt]);

  // 折线图：计划时间 vs 实际时间
  useEffect(() => {
    if (!lineChartRef.current || !hasTimeData) return;

    const chart = echarts.init(lineChartRef.current);
    
    const generateDatePoints = (startDate: string, endDate: string) => {
      const points = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        points.push(d.toISOString().split('T')[0]);
      }
      return points;
    };

    let planPoints: string[] = [];
    let planValues: number[] = [];
    if (planStart && planEnd) {
      planPoints = generateDatePoints(planStart, planEnd);
      planValues = planPoints.map((_, idx) => idx + 1);
    }

    let actualPoints: string[] = [];
    let actualValues: number[] = [];
    if (actualStart) {
      const endDate = actualEnd || new Date().toISOString().split('T')[0];
      actualPoints = generateDatePoints(actualStart, endDate);
      actualValues = actualPoints.map((_, idx) => idx + 1);
    }

    const option = {
      title: showTitle ? {
        text: '计划时间 vs 实际时间趋势',
        left: 'center',
        textStyle: { color: '#00f2ff', fontSize: 14 },
      } : undefined,
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' } },
      legend: { 
        data: ['计划进度', '实际进度'], 
        textStyle: { color: '#e2e8f0' },
        top: 0,
        right: 10,
      },
      grid: { left: '10%', right: '5%', top: showTitle ? '18%' : '8%', bottom: '5%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: [...new Set([...planPoints, ...actualPoints])],
        name: '日期',
        axisLabel: { rotate: 30, color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#475569' } },
      },
      yAxis: {
        type: 'value' as const,
        name: '累计天数',
        axisLabel: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      },
      series: [
        {
          name: '计划进度',
          type: 'line',
          data: planPoints.map(date => ({
            value: planValues[planPoints.indexOf(date)],
            name: date,
          })),
          smooth: false,
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
          symbol: 'circle',
          symbolSize: 6,
          connectNulls: false,
        },
        {
          name: '实际进度',
          type: 'line',
          data: actualPoints.map(date => ({
            value: actualValues[actualPoints.indexOf(date)],
            name: date,
          })),
          smooth: false,
          lineStyle: { color: '#10b981', width: 2 },
          itemStyle: { color: '#10b981' },
          symbol: 'diamond',
          symbolSize: 8,
          connectNulls: false,
        },
      ],
    };

    chart.setOption(option);
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => { chart.dispose(); window.removeEventListener('resize', handleResize); };
  }, [planStart, planEnd, actualStart, actualEnd, showTitle, hasTimeData]);

  // 里程碑对比图（修复数据顺序：x 轴为类别，y 轴为时间戳）
  useEffect(() => {
    if (!milestoneChartRef.current) return;

    const existingChart = echarts.getInstanceByDom(milestoneChartRef.current);
    if (existingChart) existingChart.dispose();

    if (milestones.length === 0) {
      milestoneChartRef.current.innerHTML = '<div class="text-center text-slate-400 py-8">暂无里程碑数据</div>';
      return;
    }

    const timer = setTimeout(() => {
      const container = milestoneChartRef.current;
      if (!container) return;
      if (container.clientHeight === 0) {
        requestAnimationFrame(() => {
          if (!container) return;
          initMilestoneChart(container);
        });
      } else {
        initMilestoneChart(container);
      }
    }, 50);

    function initMilestoneChart(container: HTMLDivElement) {
      const oldChart = echarts.getInstanceByDom(container);
      if (oldChart) oldChart.dispose();
      
      const chart = echarts.init(container);
      
      const sortedMilestones = [...milestones].sort((a, b) => 
        new Date(a.planned_date).getTime() - new Date(b.planned_date).getTime()
      );
      
      const milestoneNames = sortedMilestones.map(m => m.milestone_name);
      const plannedTimestamps = sortedMilestones.map(m => new Date(m.planned_date).getTime());
      const actualTimestamps = sortedMilestones.map(m => m.actual_date ? new Date(m.actual_date).getTime() : null);

      // 调试日志（可在控制台查看）
      console.log('里程碑数据（时间戳）:', {
        names: milestoneNames,
        planned: plannedTimestamps,
        actual: actualTimestamps,
      });

      const option = {
        title: showTitle ? {
          text: milestoneTitle,
          left: 'center',
          textStyle: { color: '#00f2ff', fontSize: 14 },
        } : undefined,
        tooltip: {
          trigger: 'axis' as const,
          formatter: (params: any) => {
            if (!params || params.length === 0) return '';
            const item = params[0];
            const date = new Date(item.value[1]).toLocaleDateString('zh-CN');
            return `${item.name}<br/>日期: ${date}`;
          },
        },
        legend: { 
          data: ['计划完成日期', '实际完成日期'], 
          textStyle: { color: '#e2e8f0' },
          top: 0,
          right: 10,
        },
        grid: { 
          left: '12%', 
          right: '8%', 
          top: showTitle ? '18%' : '10%', 
          bottom: '8%', 
          containLabel: true 
        },
        xAxis: {
          type: 'category' as const,
          data: milestoneNames,
          name: '里程碑',
          axisLabel: { 
            rotate: 25, 
            color: '#94a3b8',
            fontSize: 11,
            interval: 0,
          },
          axisLine: { lineStyle: { color: '#475569' } },
        },
        yAxis: {
          type: 'time' as const,
          name: '日期',
          axisLabel: { 
            formatter: (value: number) => {
              return new Date(value).toLocaleDateString('zh-CN');
            },
            color: '#94a3b8',
          },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        },
        series: [
          {
            name: '计划完成日期',
            type: 'scatter',
            data: plannedTimestamps.map((timestamp, idx) => [milestoneNames[idx], timestamp]),
            symbol: 'circle',
            symbolSize: 12,
            itemStyle: { color: '#3b82f6', borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true,
              position: 'right',
              offset: [10, 0],
              formatter: (params: any) => {
                const date = new Date(plannedTimestamps[params.dataIndex]).toLocaleDateString('zh-CN');
                return date;
              },
              color: '#93c5fd',
              fontSize: 10,
            },
          },
          {
            name: '实际完成日期',
            type: 'scatter',
            data: actualTimestamps.map((timestamp, idx) => [milestoneNames[idx], timestamp]),
            symbol: 'diamond',
            symbolSize: 14,
            itemStyle: { color: '#10b981', borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true,
              position: 'left',
              offset: [-10, 0],
              formatter: (params: any) => {
                const ts = actualTimestamps[params.dataIndex];
                if (!ts || isNaN(ts)) return '未完成';
                return new Date(ts).toLocaleDateString('zh-CN');
              },
              color: '#6ee7b7',
              fontSize: 10,
            },
          },
        ],
      };

      chart.setOption(option);
    }

    return () => clearTimeout(timer);
  }, [milestones, showTitle, milestoneTitle]);

  if (!hasTimeData && !hasMilestoneData) {
    return <div className="bg-slate-700/30 rounded-xl p-6 text-center text-slate-400">暂无时间数据</div>;
  }

  return (
    <div className="space-y-8">
      {showGantt && hasTimeData && (
        <div className="border-b border-blue-800/30 pb-4 mb-2">
          <div ref={ganttChartRef} style={{ width: '100%', height: `${height}px` }} />
        </div>
      )}
      {hasTimeData && (
        <div className="border-b border-blue-800/30 pb-4 mb-2">
          <div ref={lineChartRef} style={{ width: '100%', height: `${height}px` }} />
        </div>
      )}
      <div className="pt-4" style={{ position: 'relative', minHeight: '300px' }}>
        <div ref={milestoneChartRef} style={{ width: '100%', height: `${Math.max(280, milestones.length * 55)}px` }} />
        {milestones.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 pointer-events-none">
            暂无里程碑数据
          </div>
        )}
      </div>
    </div>
  );
}