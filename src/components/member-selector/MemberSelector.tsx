import React, { useState, useCallback, useMemo } from 'react';
import type { Employee } from '@/types/contacts';
import { cn } from '@/lib/utils';
import type { MemberSelectorProps, SingleSelectProps, MultiSelectProps } from './types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { EmployeeAvatar } from './EmployeeAvatar';
import { EmployeeChip } from './EmployeeChip';
import { SearchDropdown } from './SearchDropdown';
import { useEmployeeSearch } from './useEmployeeSearch';
import { useSingleEmployeeResolve, useMultiEmployeeResolve } from './useEmployeeResolve';
import { X } from 'lucide-react';

// ============================================================
// MemberSelector — Main composite component
//
// Uses Popover + Command (cmdk) from the ui library.
// Supports single/multi select, controlled/uncontrolled, read-only.
// ============================================================

export function MemberSelector(props: MemberSelectorProps) {
  const {
    multiple,
    readOnly = false,
    placeholder = '搜索人员',
    disabled = false,
    className,
  } = props;

  if (multiple) {
    return (
      <MultiMemberSelector
        {...(props as MultiSelectProps & { readOnly?: boolean; placeholder?: string; disabled?: boolean; className?: string })}
        readOnly={readOnly}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
    );
  }

  return (
    <SingleMemberSelector
      {...(props as SingleSelectProps & { readOnly?: boolean; placeholder?: string; disabled?: boolean; className?: string })}
      readOnly={readOnly}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}

// ============================================================
// SingleMemberSelector
// ============================================================

interface InternalSingleProps extends SingleSelectProps {
  readOnly: boolean;
  placeholder: string;
  disabled: boolean;
  className?: string;
}

function SingleMemberSelector({
  value: controlledValue,
  onChange,
  userId,
  readOnly,
  placeholder,
  disabled,
  className,
}: InternalSingleProps) {
  const [internalValue, setInternalValue] = useState<Employee | null>(null);
  const selectedEmployee = controlledValue !== undefined ? controlledValue : internalValue;

  const emitChange = useCallback(
    (employee: Employee | null) => {
      setInternalValue(employee);
      onChange(employee);
    },
    [onChange],
  );

  useSingleEmployeeResolve(userId ?? null, selectedEmployee, emitChange);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { results, loading, error, hasMore, loadMore } = useEmployeeSearch(query);

  const selectedIds = useMemo(
    () => new Set(selectedEmployee ? [selectedEmployee.emp_id] : []),
    [selectedEmployee],
  );

  function handleSelect(employee: Employee) {
    emitChange(employee);
    setOpen(false);
    setQuery('');
  }

  function handleRemove(event?: React.MouseEvent) {
    event?.stopPropagation();
    emitChange(null);
  }

  if (readOnly) {
    if (!selectedEmployee) {
      return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;
    }
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <EmployeeAvatar employee={selectedEmployee} size={24} />
        <span className="text-sm">{selectedEmployee.name}</span>
        {selectedEmployee.title && (
          <span className="text-xs text-muted-foreground">{selectedEmployee.title}</span>
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 min-h-10 w-full px-3 py-1.5 rounded-md border bg-background text-sm cursor-pointer transition-colors',
            'ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
        >
          {selectedEmployee && !open ? (
            <div className="flex items-center gap-2 py-0.5 flex-1 min-w-0">
              <EmployeeAvatar employee={selectedEmployee} size={24} />
              <span className="text-sm truncate">{selectedEmployee.name}</span>
            </div>
          ) : (
            <span className="flex-1 text-muted-foreground">{placeholder}</span>
          )}

          {selectedEmployee && (
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-muted cursor-pointer shrink-0"
              onClick={handleRemove}
              aria-label="清除选择"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b px-3 py-2">
          <input
            type="text"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>
        <SearchDropdown
          results={results}
          query={query}
          loading={loading}
          error={error}
          selectedIds={selectedIds}
          hasMore={hasMore}
          onSelect={handleSelect}
          onLoadMore={loadMore}
        />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// MultiMemberSelector
// ============================================================

interface InternalMultiProps extends MultiSelectProps {
  readOnly: boolean;
  placeholder: string;
  disabled: boolean;
  className?: string;
}

function MultiMemberSelector({
  value: controlledValue,
  onChange,
  userIds,
  readOnly,
  placeholder,
  disabled,
  className,
}: InternalMultiProps) {
  const [internalValue, setInternalValue] = useState<Employee[]>([]);
  const selectedEmployees = controlledValue !== undefined ? controlledValue : internalValue;

  const emitChange = useCallback(
    (employees: Employee[]) => {
      setInternalValue(employees);
      onChange(employees);
    },
    [onChange],
  );

  useMultiEmployeeResolve(userIds ?? null, selectedEmployees, emitChange);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { results, loading, error, hasMore, loadMore } = useEmployeeSearch(query);

  const selectedIds = useMemo(
    () => new Set(selectedEmployees.map((employee) => employee.emp_id)),
    [selectedEmployees],
  );

  function handleSelect(employee: Employee) {
    const alreadySelected = selectedEmployees.some(
      (existing) => existing.emp_id === employee.emp_id,
    );
    if (alreadySelected) {
      emitChange(selectedEmployees.filter((existing) => existing.emp_id !== employee.emp_id));
    } else {
      emitChange([...selectedEmployees, employee]);
    }
  }

  function handleRemoveEmployee(employee: Employee, event?: React.MouseEvent) {
    event?.stopPropagation();
    emitChange(selectedEmployees.filter((existing) => existing.emp_id !== employee.emp_id));
  }

  function handleClearAll(event: React.MouseEvent) {
    event.stopPropagation();
    emitChange([]);
  }

  if (readOnly) {
    if (selectedEmployees.length === 0) {
      return <span className={cn('text-sm text-muted-foreground', className)}>—</span>;
    }
    return (
      <div className={cn('flex flex-wrap gap-1', className)}>
        {selectedEmployees.map((employee) => (
          <EmployeeChip key={employee.emp_id} employee={employee} removable={false} />
        ))}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 min-h-10 w-full px-3 py-1.5 rounded-md border bg-background text-sm cursor-pointer transition-colors',
            'ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
        >
          {selectedEmployees.map((employee) => (
            <EmployeeChip
              key={employee.emp_id}
              employee={employee}
              onRemove={handleRemoveEmployee}
            />
          ))}

          {selectedEmployees.length === 0 && (
            <span className="text-muted-foreground">{placeholder}</span>
          )}

          <div className="ml-auto flex items-center gap-1 shrink-0">
            {selectedEmployees.length > 0 && (
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted cursor-pointer"
                onClick={handleClearAll}
                aria-label="清除全部"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b px-3 py-2">
          <input
            type="text"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>
        <SearchDropdown
          results={results}
          query={query}
          loading={loading}
          error={error}
          selectedIds={selectedIds}
          multiple
          hasMore={hasMore}
          onSelect={handleSelect}
          onLoadMore={loadMore}
        />
      </PopoverContent>
    </Popover>
  );
}
