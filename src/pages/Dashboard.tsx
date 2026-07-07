import TaskList from '../components/TaskList';
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { X } from 'lucide-react';

// Mock Data
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

interface KPI {
  label: string;
  value: string | number;
  key: string;
}

export default function Dashboard() {
  const revenueChartRef = useRef<HTMLDivElement>(null);
  const progressChartRef = useRef<HTMLDivElement>(null);
  const categoryChartRef = useRef<HTMLDivElement>(null);
  const centralChartRef = useRef<HTMLDivElement>(null);
  const heatmapChartRef = useRef<HTMLDivElement>(null);
  const gaugeChartRef = useRef<HTMLDivElement>(null);
  const heatmapChartInstance = useRef<echarts.ECharts | null>(null);

  const [kpis, setKpis] = useState<KPI[]>([
    { label: '进行中项目数', value: 24, key: 'ongoing' },
    { label: '本月新增任务', value: 156, key: 'newTasks' },
    { label: '整体风险指数', value: '23%', key: 'risk' },
    { label: '人员负荷率', value: '78%', key: 'load' }
  ]);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [overallRisk, setOverallRisk] = useState<{ score: number; level: string; totalTasks: number; highRiskCount: number; lastUpdated: string } | null>(null);
  const [riskAlerts, setRiskAlerts] = useState<{ project: string; issue: string; level: string }[]>([]);
  const [monthlyNewTasks, setMonthlyNewTasks] = useState<number>(156);
  const [taskCategories, setTaskCategories] = useState<{ name: string; value: number }[]>(mockData.taskHeatmap);
  const [rankingData, setRankingData] = useState<{ name: string; score: number; completed: number }[]>(mockData.rankings);

  // Initialize charts
  useEffect(() => {
    const charts: echarts.ECharts[] = [];

    if (revenueChartRef.current) {
      const chart = echarts.init(revenueChartRef.current);
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
      charts.forEach(chart => chart.resize());
    };
    window.addEventListener('resize', handleResize);

    return () => {
      charts.forEach(chart => chart.dispose());
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Update heatmap when taskCategories changes
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
          // 更新 KPI 中的风险指数卡片
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

  // Auto refresh
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate data refresh for mock KPIs (skip risk — uses real API data)
      setKpis(prev => prev.map(kpi => {
        if (kpi.key === 'ongoing') {
          return { ...kpi, value: Number(kpi.value) + Math.floor(Math.random() * 3) - 1 };
        }
        // risk KPI is driven by real API data, skip mock refresh
        return kpi;
      }));
      // 定期刷新整体风险指数
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
      // 定期刷新本月新增任务数
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
  }, []);

  const handleKPIClick = (target: string) => {
    setSelectedTarget(target);
    setAiPanelOpen(true);
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
        {/* Left Panel */}
        <section className="bg-slate-800/60 border border-blue-900/30 rounded-2xl p-5 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-700 to-cyan-400 rounded-sm"></span>
            项目全景
          </h2>
          
          <div ref={revenueChartRef} className="w-full h-72 mb-5"></div>
          <div ref={progressChartRef} className="w-full h-56 mb-5"></div>
          <div ref={categoryChartRef} className="w-full h-56"></div>
        </section>

        {/* Center Panel */}
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

        {/* Right Panel */}
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

      {/* Overlay Backdrop */}
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
    </div>
  );
}

// AI Analysis Content Component
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
    '本月新增任务': (
      <>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 任务分布分析
          </h3>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 mb-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">开发类任务</span>
              <span className="text-cyan-300 font-bold text-base">68 个</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">测试类任务</span>
              <span className="text-cyan-300 font-bold text-base">42 个</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">设计类任务</span>
              <span className="text-cyan-300 font-bold text-base">28 个</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-300 text-sm">其他任务</span>
              <span className="text-cyan-300 font-bold text-base">18 个</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 本月新增任务量较上月增长 23%，建议评估团队承载能力。
            <br/><br/>
            可考虑将部分低优先级任务延后至下月，或协调跨部门资源支持。
          </div>
        </div>
      </>
    ),
    '整体风险指数': (
      <>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 风险构成
          </h3>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 mb-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">进度风险</span>
              <span className="text-amber-400 font-bold text-base">35%</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">成本风险</span>
              <span className="text-cyan-300 font-bold text-base">18%</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">质量风险</span>
              <span className="text-cyan-300 font-bold text-base">12%</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-300 text-sm">人员风险</span>
              <span className="text-red-400 font-bold text-base">35%</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> AI 建议
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            💡 整体风险指数呈下降趋势，但人员风险仍需重点关注。
            <br/><br/>
            建议启动关键岗位备份计划，降低人员流动对项目的影响。
          </div>
        </div>
      </>
    ),
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

  // Default analysis for person names
  if (!analyses[target]) {
    return (
      <>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> {target} - 效能分析
          </h3>
          <div className="bg-slate-700/50 border border-blue-800/40 rounded-xl p-5 mb-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">本月完成任务</span>
              <span className="text-emerald-400 font-bold text-base">{Math.floor(Math.random() * 20 + 30)} 个</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">平均质量评分</span>
              <span className="text-cyan-300 font-bold text-base">{(Math.random() * 10 + 85).toFixed(1)} 分</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-600/50">
              <span className="text-slate-300 text-sm">准时交付率</span>
              <span className="text-emerald-400 font-bold text-base">{(Math.random() * 15 + 80).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-slate-300 text-sm">团队协作度</span>
              <span className="text-cyan-300 font-bold text-base">{(Math.random() * 10 + 85).toFixed(1)} 分</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-cyan-300 mb-4 flex items-center gap-2">
            <span className="text-blue-500">◆</span> 优势分析
          </h3>
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-l-4 border-cyan-400 rounded-r-xl p-5 text-base text-slate-100 leading-relaxed shadow-lg">
            ✨ {target}在任务执行效率方面表现突出，特别是在复杂问题的解决能力上。
            <br/><br/>
            建议继续保持当前的工作状态，并可以考虑承担更多技术攻关任务。
          </div>
        </div>
      </>
    );
  }

  return analyses[target];
}
