import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Milestone {
  id: string;
  task_id: string;
  milestone_name: string;
  planned_date: string;
  actual_date: string | null;
  planned_progress?: number;
  created_at: string;
}

export function useTaskMilestones(taskId: string | null) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('🔍 useTaskMilestones 收到 taskId:', taskId, '类型:', typeof taskId);

    // 如果 taskId 为空、null、undefined，或为 'null' 字符串，返回空
    if (!taskId || taskId === 'null' || taskId === 'undefined') {
      console.log('⚠️ taskId 无效，返回空数组');
      setMilestones([]);
      return;
    }

    const taskIdNum = Number(taskId);
    console.log(`🔍 转换后的 taskIdNum: ${taskIdNum}, 是否有效: ${!isNaN(taskIdNum) && taskIdNum > 0}`);

    if (isNaN(taskIdNum) || taskIdNum <= 0) {
      console.error('❌ taskId 不是有效数字:', taskId);
      setMilestones([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchMilestones = async () => {
      console.log(`🔍 正在查询 task_milestones 表，task_id = ${taskIdNum}`);
      try {
        const { data, error, status, statusText } = await supabase
          .from('task_milestones')
          .select('*')
          .eq('task_id', taskIdNum)
          .order('planned_date', { ascending: true });

        console.log(`🔍 Supabase 响应: status=${status}, statusText=${statusText}, data长度=${data?.length || 0}, error=${error?.message || 'null'}`);
        if (!cancelled) {
          if (error) {
            console.error('❌ 获取里程碑失败:', error);
            setMilestones([]);
          } else {
            console.log(`✅ 获取到里程碑数据: ${data?.length || 0} 条`);
            setMilestones(data || []);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ 查询异常:', err);
        setMilestones([]);
        setLoading(false);
      }
    };

    fetchMilestones();
    return () => { cancelled = true; };
  }, [taskId]);

  return { milestones, loading };
}