import { useEffect } from 'react';
import type { Employee } from '@/types/contacts';
import { fetchEmployeeById } from './api';

// ============================================================
// useEmployeeResolve — Auto-resolve emp_id(s) → Employee objects
//
// When the component receives userId/userIds but no value,
// this hook fetches full Employee data for display.
// ============================================================

/** Resolve a single emp_id to Employee */
export function useSingleEmployeeResolve(
  userId: string | null | undefined,
  currentValue: Employee | null,
  onResolved: (employee: Employee | null) => void,
): void {
  useEffect(() => {
    if (!userId || currentValue) return;

    let cancelled = false;
    fetchEmployeeById(userId).then((employee) => {
      if (!cancelled && employee) {
        onResolved(employee);
      }
    });
    return () => { cancelled = true; };
    // Only re-run when userId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}

/** Resolve multiple emp_ids to Employee[] */
export function useMultiEmployeeResolve(
  userIds: string[] | null | undefined,
  currentValue: Employee[],
  onResolved: (employees: Employee[]) => void,
): void {
  const joinedIds = userIds?.join(',') ?? '';

  useEffect(() => {
    if (!userIds || userIds.length === 0 || currentValue.length > 0) return;

    let cancelled = false;
    Promise.all(userIds.map(fetchEmployeeById)).then((resolvedList) => {
      if (cancelled) return;
      const employees = resolvedList.filter((item): item is Employee => item !== null);
      if (employees.length > 0) {
        onResolved(employees);
      }
    });
    return () => { cancelled = true; };
    // Only re-run when the joined id string changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedIds]);
}
