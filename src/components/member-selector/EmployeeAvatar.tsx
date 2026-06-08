import type { Employee } from '@/types/contacts';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// ============================================================
// EmployeeAvatar — Wraps the generic ui/Avatar for employee data
// ============================================================

export interface EmployeeAvatarProps {
  employee: Employee;
  /** Pixel size (width & height). Default: 32 */
  size?: number;
  className?: string;
}

export function EmployeeAvatar({ employee, size = 32, className }: EmployeeAvatarProps) {
  const initial = employee.name?.charAt(0) || '?';
  const sizeClass = `h-[${size}px] w-[${size}px]`;

  return (
    <Avatar className={cn(sizeClass, 'shrink-0', className)} style={{ width: size, height: size }}>
      {employee.avatar?.trim() && (
        <AvatarImage src={employee.avatar} alt={employee.name} />
      )}
      <AvatarFallback
        className="bg-blue-50 text-blue-500 font-medium"
        style={{ fontSize: size * 0.42 }}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
