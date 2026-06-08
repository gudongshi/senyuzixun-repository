import type React from 'react';
import type { Employee } from '@/types/contacts';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmployeeAvatar } from './EmployeeAvatar';
import { X } from 'lucide-react';

// ============================================================
// EmployeeChip — Wraps ui/Badge as a removable employee tag
// ============================================================

export interface EmployeeChipProps {
  employee: Employee;
  /** Show the remove (×) button. Default: true */
  removable?: boolean;
  onRemove?: (employee: Employee, event: React.MouseEvent) => void;
  className?: string;
}

export function EmployeeChip({
  employee,
  removable = true,
  onRemove,
  className,
}: EmployeeChipProps) {
  return (
    <Badge variant="secondary" className={cn('gap-1 py-0.5 pl-1 pr-1.5 font-normal', className)}>
      <EmployeeAvatar employee={employee} size={18} />
      <span className="text-sm">{employee.name}</span>
      {removable && onRemove && (
        <button
          type="button"
          className="ml-0.5 rounded-full hover:bg-muted p-0.5 cursor-pointer"
          onClick={(event) => onRemove(employee, event)}
          aria-label={`移除 ${employee.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
