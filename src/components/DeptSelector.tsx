import React, { useState, useRef, useEffect, useCallback } from 'react';
import type {
  DeptItem,
  DeptTreeNode,
  GetDeptTreeResponse,
  SearchDeptsResponse,
  ApiResponse,
} from '../types/department';
import { getAuthHeader } from '../lib/auth';

// ============================================================
// DeptSelector — 部门选择组件
//
// 使用方式:
//   单选:
//     <DeptSelector onChange={(dept) => console.log(dept)} />
//   多选:
//     <DeptSelector multiple onChange={(depts) => console.log(depts)} />
//   受控模式:
//     <DeptSelector value={selected} onChange={setSelected} />
//   只读模式:
//     <DeptSelector readOnly value={dept} onChange={() => {}} />
//
// 交互:
//   - 输入框输入文字 → 搜索部门（下拉列表）
//   - 点击右侧树形图标 → 打开弹窗（部门树 + 已选列表）
//   - 弹窗内选择后点击确认回填
// ============================================================

// ---- Props ----

interface SingleSelectProps {
  multiple?: false;
  value?: DeptItem | null;
  onChange: (value: DeptItem | null) => void;
  readOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

interface MultiSelectProps {
  multiple: true;
  value?: DeptItem[];
  onChange: (value: DeptItem[]) => void;
  readOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

type DeptSelectorProps = SingleSelectProps | MultiSelectProps;

// ---- Constants ----

const SEARCH_DEBOUNCE_MS = 300;

// ---- API helpers ----

async function fetchDeptTree(deptId = '-1'): Promise<GetDeptTreeResponse> {
  const params = new URLSearchParams({ deptId });
  const resp = await fetch(`/api/depts/tree?${params}`, { headers: { ...getAuthHeader() } });
  if (!resp.ok) throw new Error(`getDeptTree failed: ${resp.status}`);
  const json: ApiResponse<GetDeptTreeResponse> = await resp.json();
  if (!json.success) throw new Error(json.error || 'getDeptTree failed');
  return json.data;
}

async function searchDepts(key: string, offset = 0, limit = 50): Promise<SearchDeptsResponse> {
  const params = new URLSearchParams({ key, offset: String(offset), limit: String(limit) });
  const resp = await fetch(`/api/depts/search?${params}`, { headers: { ...getAuthHeader() } });
  if (!resp.ok) throw new Error(`searchDepts failed: ${resp.status}`);
  const json: ApiResponse<SearchDeptsResponse> = await resp.json();
  if (!json.success) throw new Error(json.error || 'searchDepts failed');
  return json.data;
}

// ---- Icons ----

function TreeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2V7M10 7H5M10 7H15M5 7V11M15 7V11M5 11H3V14H7V11H5ZM15 11H13V14H17V11H15Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="1" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Main Component ----

export default function DeptSelector(props: DeptSelectorProps) {
  const { multiple, onChange, readOnly = false, placeholder = '请输入关键字进行搜索', disabled = false } = props;

  // ---- Internal state (uncontrolled mode) ----
  const [internalSingle, setInternalSingle] = useState<DeptItem | null>(null);
  const [internalMulti, setInternalMulti] = useState<DeptItem[]>([]);

  const value = multiple
    ? (Array.isArray(props.value) ? props.value : props.value === undefined ? internalMulti : [])
    : (props.value === undefined ? internalSingle : (props.value ?? null));

  const emitChange = multiple
    ? (v: DeptItem[]) => { setInternalMulti(v); (onChange as (v: DeptItem[]) => void)(v); }
    : (v: DeptItem | null) => { setInternalSingle(v); (onChange as (v: DeptItem | null) => void)(v); };

  // ---- Search state ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DeptItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // ---- Modal state ----
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState<DeptItem[]>([]);
  const [modalSearching, setModalSearching] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [currentDepts, setCurrentDepts] = useState<DeptTreeNode[]>([]);
  const [deptStack, setDeptStack] = useState<Array<{ id: string; name: string }>>([]);
  const [tempSelected, setTempSelected] = useState<DeptItem[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const modalDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedIds = new Set(
    multiple
      ? (value as DeptItem[]).map((d) => d.dept_id)
      : value ? [(value as DeptItem).dept_id] : []
  );

  // ---- Close search dropdown on outside click ----
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- Debounced inline search ----
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await searchDepts(q);
      setSearchResults(
        (data.values || []).map((item) => ({
          dept_id: item.emplId,
          name: item.name,
        }))
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // ---- Modal: load dept tree ----
  const loadDeptTree = useCallback(async (deptId = '-1') => {
    setTreeLoading(true);
    try {
      const data = await fetchDeptTree(deptId);
      setCurrentDepts(data.deptList || []);
    } catch {
      setCurrentDepts([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  // ---- Modal: debounced search ----
  const doModalSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setModalSearchResults([]);
      setModalSearching(false);
      return;
    }
    setModalSearching(true);
    try {
      const data = await searchDepts(q);
      setModalSearchResults(
        (data.values || []).map((item) => ({
          dept_id: item.emplId,
          name: item.name,
        }))
      );
    } catch {
      setModalSearchResults([]);
    } finally {
      setModalSearching(false);
    }
  }, []);

  useEffect(() => {
    if (modalDebounceRef.current) clearTimeout(modalDebounceRef.current);
    if (modalOpen) {
      modalDebounceRef.current = setTimeout(() => doModalSearch(modalQuery), SEARCH_DEBOUNCE_MS);
    }
    return () => { if (modalDebounceRef.current) clearTimeout(modalDebounceRef.current); };
  }, [modalQuery, modalOpen, doModalSearch]);

  // ---- Open modal ----
  function openModal() {
    const currentValue = multiple ? (value as DeptItem[]) : (value ? [value as DeptItem] : []);
    setTempSelected([...currentValue]);
    setDeptStack([]);
    setModalQuery('');
    setModalSearchResults([]);
    setModalOpen(true);
    loadDeptTree('-1');
  }

  // ---- Modal: navigate into sub-department ----
  function navigateInto(node: DeptTreeNode) {
    setDeptStack((prev) => [...prev, { id: node.id, name: node.text }]);
    setModalQuery('');
    setModalSearchResults([]);
    loadDeptTree(node.id);
  }

  // ---- Modal: navigate back via breadcrumb ----
  function navigateBack(index: number) {
    if (index < 0) {
      setDeptStack([]);
      loadDeptTree('-1');
    } else {
      const target = deptStack[index];
      setDeptStack((prev) => prev.slice(0, index + 1));
      loadDeptTree(target.id);
    }
    setModalQuery('');
    setModalSearchResults([]);
  }

  // ---- Modal: toggle selection ----
  function toggleTempSelect(dept: DeptItem) {
    if (multiple) {
      const exists = tempSelected.find((d) => d.dept_id === dept.dept_id);
      if (exists) {
        setTempSelected(tempSelected.filter((d) => d.dept_id !== dept.dept_id));
      } else {
        setTempSelected([...tempSelected, dept]);
      }
    } else {
      setTempSelected([dept]);
    }
  }

  const tempSelectedIds = new Set(tempSelected.map((d) => d.dept_id));

  // ---- Modal: confirm ----
  function handleModalConfirm() {
    if (multiple) {
      (emitChange as (v: DeptItem[]) => void)(tempSelected);
    } else {
      (emitChange as (v: DeptItem | null) => void)(tempSelected[0] || null);
    }
    setModalOpen(false);
  }

  // ---- Inline search: select ----
  function handleSearchSelect(dept: DeptItem) {
    if (multiple) {
      const current = value as DeptItem[];
      const exists = current.find((d) => d.dept_id === dept.dept_id);
      if (exists) {
        (emitChange as (v: DeptItem[]) => void)(current.filter((d) => d.dept_id !== dept.dept_id));
      } else {
        (emitChange as (v: DeptItem[]) => void)([...current, dept]);
      }
    } else {
      (emitChange as (v: DeptItem | null) => void)(dept);
      setSearchOpen(false);
      setQuery('');
    }
  }

  // ---- Remove ----
  function handleRemove(dept: DeptItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (multiple) {
      (emitChange as (v: DeptItem[]) => void)((value as DeptItem[]).filter((d) => d.dept_id !== dept.dept_id));
    } else {
      (emitChange as (v: DeptItem | null) => void)(null);
    }
  }

  function handleClearAll(e: React.MouseEvent) {
    e.stopPropagation();
    if (multiple) {
      (emitChange as (v: DeptItem[]) => void)([]);
    } else {
      (emitChange as (v: DeptItem | null) => void)(null);
    }
  }

  // ---- Keyboard ----
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!searchOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setSearchOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, searchResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < searchResults.length) {
          handleSearchSelect(searchResults[highlightIndex]);
        }
        break;
      case 'Escape':
        setSearchOpen(false);
        break;
    }
  }

  const singleValue = !multiple ? (value as DeptItem | null) : null;
  const multiValue = multiple ? (Array.isArray(value) ? value : []) : [];

  // ---- ReadOnly mode ----
  if (readOnly) {
    if (!multiple) {
      if (!singleValue) return <span className="text-sm text-gray-400">-</span>;
      return <span className="text-sm text-gray-800">{singleValue.name}</span>;
    }
    if (multiValue.length === 0) return <span className="text-sm text-gray-400">-</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {multiValue.map((d) => (
          <span key={d.dept_id} className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-sm">
            {d.name}
          </span>
        ))}
      </div>
    );
  }

  // items to show in modal left panel (search results or tree)
  const showModalSearch = modalQuery.trim().length > 0;
  const modalLeftItems: DeptItem[] = showModalSearch
    ? modalSearchResults
    : currentDepts.map((n) => ({ dept_id: n.id, name: n.text }));

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ---- Trigger / Input area ---- */}
      <div
        className={`flex flex-wrap items-center gap-1 min-h-[40px] px-3 py-1.5 border rounded-lg bg-white cursor-text transition-colors
          ${searchOpen ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
        onClick={() => {
          if (disabled) return;
          setSearchOpen(true);
          inputRef.current?.focus();
        }}
      >
        {/* Single value display */}
        {!multiple && singleValue && !searchOpen && (
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-sm text-gray-800">{singleValue.name}</span>
            <button type="button" className="ml-1 text-gray-400 hover:text-gray-600"
              onClick={(e) => handleRemove(singleValue, e)}>
              &times;
            </button>
          </div>
        )}

        {/* Multi value chips */}
        {multiple && multiValue.map((d) => (
          <span key={d.dept_id}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-sm">
            {d.name}
            <button type="button" className="ml-0.5 text-blue-400 hover:text-blue-600 leading-none"
              onClick={(e) => handleRemove(d, e)}>
              &times;
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
              ? (multiValue.length === 0 ? placeholder : '')
              : (!singleValue || searchOpen ? placeholder : '')
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />

        {/* Clear button */}
        {(multiple ? multiValue.length > 0 : singleValue) && query === '' && (
          <button type="button" className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-1"
            onClick={handleClearAll}>
            &times;
          </button>
        )}

        {/* Tree icon button */}
        <button
          type="button"
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            openModal();
          }}
        >
          <TreeIcon />
        </button>
      </div>

      {/* ---- Search Dropdown ---- */}
      {searchOpen && query.trim() && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-[280px] overflow-y-auto">
          {searchLoading && searchResults.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">搜索中...</div>
          )}
          {!searchLoading && query && searchResults.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">未找到匹配部门</div>
          )}
          {searchResults.map((dept, idx) => {
            const isSelected = selectedIds.has(dept.dept_id);
            const isHighlighted = idx === highlightIndex;
            return (
              <div
                key={dept.dept_id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
                  ${isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'}
                  ${isSelected ? 'bg-blue-50/60' : ''}`}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseLeave={() => setHighlightIndex(-1)}
                onClick={() => handleSearchSelect(dept)}
              >
                <span className="text-sm text-gray-800 truncate flex-1">{dept.name}</span>
                {multiple ? (
                  <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center
                    ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
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
        </div>
      )}

      {/* ---- Modal ---- */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[520px] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 pt-5 pb-3">
              <h3 className="text-base font-semibold text-gray-900">选择部门</h3>
            </div>

            {/* Body */}
            <div className="flex flex-1 min-h-0 px-6">
              {/* Left panel */}
              <div className="flex-1 flex flex-col min-w-0 pr-4 border-r border-gray-100">
                {/* Modal search */}
                <div className="relative mb-3">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                    placeholder="搜索部门"
                    value={modalQuery}
                    onChange={(e) => setModalQuery(e.target.value)}
                  />
                </div>

                {/* Breadcrumb */}
                {!showModalSearch && deptStack.length > 0 && (
                  <div className="flex items-center gap-1 mb-2 text-xs text-gray-500 flex-wrap">
                    <button type="button" className="hover:text-blue-600 hover:underline"
                      onClick={() => navigateBack(-1)}>
                      全部
                    </button>
                    {deptStack.map((item, idx) => (
                      <React.Fragment key={item.id}>
                        <ChevronRightIcon />
                        <button type="button"
                          className={`hover:text-blue-600 hover:underline ${idx === deptStack.length - 1 ? 'text-gray-800 font-medium' : ''}`}
                          onClick={() => navigateBack(idx)}>
                          {item.name}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Dept list */}
                <div className="flex-1 overflow-y-auto -mx-1">
                  {(treeLoading || modalSearching) && (
                    <div className="py-8 text-center text-gray-400 text-sm">加载中...</div>
                  )}
                  {!treeLoading && !modalSearching && modalLeftItems.length === 0 && (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      {showModalSearch ? '未找到匹配部门' : '暂无子部门'}
                    </div>
                  )}
                  {!treeLoading && !modalSearching && modalLeftItems.map((dept) => {
                    const isChecked = tempSelectedIds.has(dept.dept_id);
                    const treeNode = !showModalSearch
                      ? currentDepts.find((n) => n.id === dept.dept_id)
                      : null;
                    return (
                      <div key={dept.dept_id}
                        className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-gray-50 transition-colors">
                        {/* Radio / Checkbox */}
                        {multiple ? (
                          <button type="button"
                            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center
                              ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-gray-400'}`}
                            onClick={() => toggleTempSelect(dept)}>
                            {isChecked && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        ) : (
                          <button type="button"
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                              ${isChecked ? 'border-blue-500' : 'border-gray-300 hover:border-gray-400'}`}
                            onClick={() => toggleTempSelect(dept)}>
                            {isChecked && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                          </button>
                        )}

                        {/* Dept name */}
                        <span className="text-sm text-gray-800 truncate flex-1 cursor-pointer"
                          onClick={() => toggleTempSelect(dept)}>
                          {dept.name}
                        </span>

                        {/* Sub-level button: always show in tree mode (lazy-loaded) */}
                        {!showModalSearch && treeNode && (
                          <button type="button"
                            className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 flex-shrink-0 whitespace-nowrap"
                            onClick={() => navigateInto(treeNode)}>
                            <TreeIcon className="w-3.5 h-3.5" />
                            下级
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right panel - selected */}
              <div className="w-[200px] flex flex-col pl-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">已选择({tempSelected.length})</span>
                  {tempSelected.length > 0 && (
                    <button type="button" className="text-sm text-blue-600 hover:text-blue-700"
                      onClick={() => setTempSelected([])}>
                      清空
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {tempSelected.length === 0 && (
                    <div className="py-4 text-center text-gray-400 text-xs">暂无选择</div>
                  )}
                  {tempSelected.map((dept) => (
                    <div key={dept.dept_id}
                      className="flex items-center justify-between py-1.5 group">
                      <span className="text-sm text-gray-700 truncate">{dept.name}</span>
                      <button type="button"
                        className="text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                        onClick={() => setTempSelected(tempSelected.filter((d) => d.dept_id !== dept.dept_id))}>
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 mt-2">
              <button type="button"
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button type="button"
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                onClick={handleModalConfirm}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
