import type { Employee } from '@/types/contacts';
import { CommandItem } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { EmployeeAvatar } from './EmployeeAvatar';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// EmployeeDropdownItem — Wraps ui/CommandItem for employee rows
// ============================================================

export interface EmployeeDropdownItemProps {
  employee: Employee;
  selected?: boolean;
  showCheckbox?: boolean;
  onSelect: (employee: Employee) => void;
  className?: string;
}

export function EmployeeDropdownItem({
  employee,
  selected = false,
  showCheckbox = false,
  onSelect,
  className,
}: EmployeeDropdownItemProps) {
  return (
    <CommandItem
      value={employee.emp_id}
      onSelect={() => onSelect(employee)}
      className={cn('gap-3 px-3 py-2', selected && 'bg-accent/50', className)}
    >
      <EmployeeAvatar employee={employee} size={36} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{employee.name}</span>
          {employee.title && (
            <span className="text-xs text-muted-foreground truncate">{employee.title}</span>
          )}
        </div>
        {employee.dept_id_list && employee.dept_id_list.length > 0 && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            部门ID: {employee.dept_id_list[0]}
          </div>
        )}
      </div>

      {showCheckbox ? (
        <Checkbox checked={selected} className="pointer-events-none" />
      ) : (
        <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
      )}
    </CommandItem>
  );
}
