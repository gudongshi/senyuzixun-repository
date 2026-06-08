// ============================================================
// Department API Types
// Matches the backend /api/platform/depts/* interfaces
// ============================================================

/** Department item used as the component value */
export interface DeptItem {
  dept_id: string;
  name: string;
}

/** Department tree node returned by getDeptTree */
export interface DeptTreeNode {
  id: string;
  text: string;
  has_children?: boolean;
  deptFullPath?: string;
}

/** getDeptTree API response */
export interface GetDeptTreeResponse {
  deptList: DeptTreeNode[];
  totalCount: number;
}

/** Department search result item returned by searchDepts */
export interface DeptSearchItem {
  emplId: string;
  name: string;
  deptFullPath?: string;
}

/** searchDepts API response */
export interface SearchDeptsResponse {
  values: DeptSearchItem[];
  totalCount: number;
}

/** Standard API response wrapper from backend */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
