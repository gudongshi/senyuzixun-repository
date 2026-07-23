import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// 定义任务数据的类型（包含所有需要的字段）
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
  risk_score?: number;
  risk_alerts?: string[];
}

export function useRealtimeTasks(tableName: string = 'tasks') {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      // 关键：选择所有需要的字段，包括中文列名
      const { data, error } = await supabase
        .from(tableName)
        .select(`
          id,
          "任务名称",
          "当前进度(%)",
          "状态",
          "风险等级",
          "责任人",
          "任务分类",
          "所属项目",
          "计划开始时间",
          "计划结束时间",
          "实际开始时间",
          "实际结束时间",
          "备注",
          created_at,
          risk_score,
          risk_alerts
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('获取任务列表失败:', error);
      } else {
        console.log(`✅ 获取到任务数据 (${tableName}):`, data);
        setTasks(data || []);
      }
      setLoading(false);
    };

    fetchTasks();

    // 订阅指定表的实时变更
    const channel = supabase
      .channel(`realtime-${tableName}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload) => {
          console.log(`Realtime 变更 (${tableName}):`, payload);
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => [payload.new as Task, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) =>
              prev.map((task) => (task.id === payload.new.id ? (payload.new as Task) : task))
            );
          } else if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter((task) => task.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName]);

  return { tasks, loading };
}