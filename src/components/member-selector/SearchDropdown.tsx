import type React from 'react';
import { useRef, useCallback } from 'react';
import type { Employee } from '@/types/contacts';
import { cn } from '@/lib/utils';
import { Command, CommandList, CommandEmpty, CommandGroup } from '@/components/ui/command';
import { Spinner } from '@/components/ui/spinner';
import { EmployeeDropdownItem } from './EmployeeDropdownItem';
import { SCROLL_THRESHOLD_PX } from './types';

// ============================================================
// SearchDropdown — Wraps ui/Command as floating results panel
// ============================================================

export interface SearchDropdownProps {
  results: Employee[];
  query: string;
  loading: boolean;
  error: string | null;
  selectedIds: Set<string>;
  multiple?: boolean;
  hasMore: boolean;
  onSelect: (employee: Employee) => void;
  onLoadMore: () => void;
  className?: string;
}

export function SearchDropdown({
  results,
  query,
  loading,
  error,
  selectedIds,
  multiple = false,
  hasMore,
  onSelect,
  onLoadMore,
  className,
}: SearchDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const isNearBottom =
        element.scrollTop + element.clientHeight >= element.scrollHeight - SCROLL_THRESHOLD_PX;
      if (isNearBottom && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore],
  );

  const showEmpty = !loading && !error && results.length === 0;

  return (
    <Command
      shouldFilter={false}
      className={cn('rounded-lg border shadow-md', className)}
    >
      <CommandList
        ref={listRef}
        className="max-h-[280px]"
        onScroll={handleScroll}
      >
        {/* Loading spinner (initial) */}
        {loading && results.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            搜索中…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="py-6 text-center text-sm text-destructive">{error}</div>
        )}

        {/* Empty states */}
        {showEmpty && (
          <CommandEmpty>{query ? '未找到匹配人员' : '输入姓名搜索'}</CommandEmpty>
        )}

        {/* Result items */}
        {results.length > 0 && (
          <CommandGroup>
            {results.map((employee) => (
              <EmployeeDropdownItem
                key={employee.emp_id}
                employee={employee}
                selected={selectedIds.has(employee.emp_id)}
                showCheckbox={multiple}
                onSelect={onSelect}
              />
            ))}
          </CommandGroup>
        )}

        {/* Loading more */}
        {loading && results.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Spinner className="h-3 w-3" />
            加载更多…
          </div>
        )}
      </CommandList>
    </Command>
  );
}
