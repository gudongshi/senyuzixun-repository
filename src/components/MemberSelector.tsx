import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Employee, SearchResult, ApiResponse } from '../types/contacts';
import { getAuthHeader } from '../lib/auth';

// ============================================================
// MemberSelector — 通讯录选人组件
//
// 使用方式:
//   最简用法（内部自管理 value，只需传 emp_id + onChange）:
//     单选:
//       <MemberSelector userId={record.owner_emp_id} onChange={(emp) => ...} />
//     多选:
//       <MemberSelector multiple userIds={record.member_ids} onChange={(list) => ...} />
//
//   受控模式（自己管理 value）:
//     <MemberSelector value={selected} onChange={setSelected} />
//     <MemberSelector multiple value={selectedList} onChange={setSelectedList} />
//
//   只读模式（仅展示，不可编辑，按 userId 自动查询渲染）:
//     <MemberSelector readOnly userId="2825767874" onChange={() => {}} />
//     <MemberSelector readOnly multiple userIds={["id1","id2"]} onChange={() => {}} />
//
// 当传入 userId / userIds 且 value 为空时，组件会自动调用
//   GET /api/contacts/employees/:id
// 获取完整员工信息用于回显，无需调用方手动处理。
//
// 数据来源: GET /api/contacts/employees/search?query=keyword
// ============================================================

// ---- Fetch employee by ID ----

async function fetchEmployeeById(id: string): Promise<Employee | null> {
  if (!id) return null;
  try {
    const resp = await fetch(`/api/contacts/employees/${encodeURIComponent(id)}`, {
      headers: { ...getAuthHeader() },
    });
    if (!resp.ok) return null;
    const json: ApiResponse<Employee> = await resp.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

// ---- Props: function overloads for single / multi ----

interface SingleSelectProps {
  multiple?: false;
  /** 受控值，不传则组件内部自管理 */
  value?: Employee | null;
  onChange: (value: Employee | null) => void;
  /** 数据库存储的 emp_id 字符串，value 为空时自动回显 */
  userId?: string | null;
  /** 只读模式：仅展示选中人员，不可搜索/编辑 */
  readOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

interface MultiSelectProps {
  multiple: true;
  /** 受控值，不传则组件内部自管理 */
  value?: Employee[];
  onChange: (value: Employee[]) => void;
  /** 数据库存储的 emp_id 字符串数组，value 为空时自动回显 */
  userIds?: string[] | null;
  /** 只读模式：仅展示选中人员，不可搜索/编辑 */
  readOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

type MemberSelectorProps = SingleSelectProps | MultiSelectProps;

// ---- Constants ----

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 20;

// ---- Helpers ----

async function searchEmployees(query: string, offset = 0, limit = DEFAULT_LIMIT): Promise<SearchResult<Employee>> {
  const params = new URLSearchParams({ query: query, offset: String(offset), limit: String(limit) });
  const resp = await fetch(`/api/contacts/employees/search?${params}`, {
    headers: { ...getAuthHeader() },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Search failed: ${resp.status} ${body}`);
  }
  const json: ApiResponse<SearchResult<Employee>> = await resp.json();
  if (!json.success) throw new Error(json.error || 'Search failed');
  return json.data;
}

/** Render avatar: image if available, otherwise initials on light-blue circle */
function Avatar({ employee, size = 32 }: { employee: Employee; size?: number }) {
  const initial = employee.name?.charAt(0) || '?';
  const hasAvatar = employee.avatar && employee.avatar.trim() !== '';
  const [imgError, setImgError] = useState(false);

  if (hasAvatar && !imgError) {
    return (
      <img
        src={employee.avatar!}
        alt={employee.name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <span
      className="rounded-full flex items-center justify-center text-blue-500 font-medium flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: '#E8F0FE' }}
    >
      {initial}
    </span>
  );
}

// ---- Main Component ----

export default function MemberSelector(props: MemberSelectorProps) {
  const { multiple, onChange, readOnly = false, placeholder = '搜索人员', disabled = false } = props;

  // Internal state for uncontrolled mode (when value prop is not provided)
  const [internalSingle, setInternalSingle] = useState<Employee | null>(null);
  const [internalMulti, setInternalMulti] = useState<Employee[]>([]);

  // Resolve effective value: use prop if provided (controlled), otherwise internal state
  const value = multiple
    ? (Array.isArray(props.value) ? props.value : props.value === undefined ? internalMulti : [])
    : (props.value === undefined ? internalSingle : (props.value ?? null));

  // Wrapped onChange that updates both internal state and notifies parent
  const emitChange = multiple
    ? (v: Employee[]) => { setInternalMulti(v); (onChange as (v: Employee[]) => void)(v); }
    : (v: Employee | null) => { setInternalSingle(v); (onChange as (v: Employee | null) => void)(v); };

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // ---- Auto-resolve emp_id(s) to Employee objects for display ----
  useEffect(() => {
    if (multiple) {
      const userIds = (props as MultiSelectProps).userIds;
      const currentValue = value as Employee[];
      if (!userIds || userIds.length === 0 || currentValue.length > 0) return;
      Promise.all(userIds.map(fetchEmployeeById)).then((results) => {
        const employees = results.filter((e): e is Employee => e !== null);
        if (employees.length > 0) {
          (emitChange as (v: Employee[]) => void)(employees);
        }
      });
    } else {
      const userId = (props as SingleSelectProps).userId;
      const currentValue = value as Employee | null;
      if (!userId || currentValue) return;
      fetchEmployeeById(userId).then((emp) => {
        if (emp) (emitChange as (v: Employee | null) => void)(emp);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    multiple ? (props as MultiSelectProps).userIds?.join(',') : (props as SingleSelectProps).userId,
  ]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(false);

  // Selected emp_ids for quick lookup
  const selectedIds = new Set(
    multiple
      ? (value as Employee[]).map((e: Employee) => e.emp_id)
      : value ? [(value as Employee).emp_id] : []
  );

  // ---- Close dropdown on outside click ----
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- Debounced search ----
  const doSearch = useCallback(async (q: string, append = false) => {
    if (!q.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchEmployees(q, append ? offsetRef.current : 0);
      const items = Array.isArray(data?.items) ? data.items : [];
      offsetRef.current = (append ? offsetRef.current : 0) + items.length;
      hasMoreRef.current = data?.has_more ?? false;
      setResults((prev) => (append ? [...prev, ...items] : items));
    } catch (err: any) {
      setError(err.message || '搜索失败');
      if (!append) setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      offsetRef.current = 0;
      doSearch(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // ---- Load more on scroll ----
  function handleDropdownScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20 && hasMoreRef.current && !loading) {
      doSearch(query, true);
    }
  }

  // ---- Selection handlers ----
  function handleSelect(emp: Employee) {
    if (multiple) {
      const current = value as Employee[];
      const exists = current.find((e: Employee) => e.emp_id === emp.emp_id);
      if (exists) {
        (emitChange as (v: Employee[]) => void)(current.filter((e: Employee) => e.emp_id !== emp.emp_id));
      } else {
        (emitChange as (v: Employee[]) => void)([...current, emp]);
      }
    } else {
      (emitChange as (v: Employee | null) => void)(emp);
      setOpen(false);
      setQuery('');
    }
  }

  function handleRemove(emp: Employee, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (multiple) {
      (emitChange as (v: Employee[]) => void)((value as Employee[]).filter((item: Employee) => item.emp_id !== emp.emp_id));
    } else {
      (emitChange as (v: Employee | null) => void)(null);
    }
  }

  function handleClearAll(e: React.MouseEvent) {
    e.stopPropagation();
    if (multiple) {
      (emitChange as (v: Employee[]) => void)([]);
    } else {
      (emitChange as (v: Employee | null) => void)(null);
    }
  }

  // ---- Keyboard navigation ----
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleSelect(results[highlightIndex]);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
      case 'Backspace':
        if (query === '' && multiple) {
          const list = value as Employee[];
          if (list.length > 0) handleRemove(list[list.length - 1]);
        }
        break;
    }
  }

  // ---- Render ----

  const singleValue = !multiple ? (value as Employee | null) : null;
  const multiValue = multiple ? (Array.isArray(value) ? value : []) : [];

  // ---- ReadOnly mode: compact display without input ----
  if (readOnly) {
    // Single select read-only
    if (!multiple) {
      if (!singleValue) {
        return <span className="text-sm text-gray-400">—</span>;
      }
      return (
        <div className="flex items-center gap-2">
          <Avatar employee={singleValue} size={24} />
          <span className="text-sm text-gray-800">{singleValue.name}</span>
          {singleValue.title && (
            <span className="text-xs text-gray-400">{singleValue.title}</span>
          )}
        </div>
      );
    }
    // Multi select read-only
    if (multiValue.length === 0) {
      return <span className="text-sm text-gray-400">—</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {multiValue.map((emp) => (
          <span
            key={emp.emp_id}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-sm"
          >
            <Avatar employee={emp} size={18} />
            {emp.name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger / Input area */}
      <div
        className={`flex flex-wrap items-center gap-1 min-h-[40px] px-3 py-1.5 border rounded-lg bg-white cursor-text transition-colors
          ${open ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {/* Single select: show selected person or placeholder */}
        {!multiple && singleValue && !open && (
          <div className="flex items-center gap-2 py-0.5">
            <Avatar employee={singleValue} size={24} />
            <span className="text-sm text-gray-800">{singleValue.name}</span>
            <button
              type="button"
              className="ml-1 text-gray-400 hover:text-gray-600"
              onClick={(e) => handleRemove(singleValue, e)}
            >
              ×
            </button>
          </div>
        )}

        {/* Multi select: show selected as chips */}
        {multiple &&
          multiValue.map((emp) => (
            <span
              key={emp.emp_id}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-sm"
            >
              <Avatar employee={emp} size={18} />
              {emp.name}
              <button
                type="button"
                className="ml-0.5 text-blue-400 hover:text-blue-600 leading-none"
                onClick={(e) => handleRemove(emp, e)}
              >
                ×
              </button>
            </span>
          ))}

        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[80px] outline-none border-none bg-transparent text-sm py-0.5"
          placeholder={
            multiple
              ? multiValue.length === 0
                ? placeholder
                : ''
              : !singleValue || open
                ? placeholder
                : ''
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />

        {/* Clear button */}
        {(multiple ? multiValue.length > 0 : singleValue) && query === '' && (
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-1"
            onClick={handleClearAll}
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-[280px] overflow-y-auto"
          onScroll={handleDropdownScroll}
        >
          {loading && results.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">搜索中...</div>
          )}

          {error && (
            <div className="px-4 py-3 text-center text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && query && results.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">未找到匹配人员</div>
          )}

          {!query && results.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">输入姓名搜索</div>
          )}

          {results.map((emp, idx) => {
            const isSelected = selectedIds.has(emp.emp_id);
            const isHighlighted = idx === highlightIndex;
            return (
              <div
                key={emp.emp_id}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors
                  ${isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}
                  ${isSelected ? 'bg-blue-50/60' : ''}`}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseLeave={() => setHighlightIndex(-1)}
                onClick={() => handleSelect(emp)}
              >
                <Avatar employee={emp} size={36} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{emp.name}</span>
                    {emp.title && (
                      <span className="text-xs text-gray-400 truncate">{emp.title}</span>
                    )}
                  </div>
                  {emp.dept_id_list && emp.dept_id_list.length > 0 && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      部门ID: {emp.dept_id_list[0]}
                    </div>
                  )}
                </div>

                {/* Checkbox for multi-select, checkmark for single */}
                {multiple ? (
                  <span
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center
                      ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                ) : (
                  isSelected && (
                    <svg className="w-4 h-4 text-blue-500 flex-shrink-0" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )
                )}
              </div>
            );
          })}

          {/* Loading more indicator */}
          {loading && results.length > 0 && (
            <div className="px-4 py-2 text-center text-gray-400 text-xs">加载更多...</div>
          )}
        </div>
      )}
    </div>
  );
}
