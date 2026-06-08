import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Milestone {
  id: string;
  task_id: string;
  milestone_name: string;
  planned_date: string;
  actual_date: string | null;
  created_at: string;
}

export function useTaskMilestones(taskId: string | null) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setMilestones([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const fetchMilestones = async () => {
      const { data, error } = await supabase
        .from('task_milestones')
        .select('*')
        .eq('task_id', taskId)
        .order('planned_date', { ascending: true });
      if (!cancelled) {
        if (error) {
          console.error('获取里程碑失败:', error);
          setMilestones([]);
        } else {
          setMilestones(data || []);
        }
        setLoading(false);
      }
    };

    fetchMilestones();
    return () => { cancelled = true; };
  }, [taskId]);

  return { milestones, loading };
}