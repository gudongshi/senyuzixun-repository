// ============================================================
// Contacts API Types
// Matches the backend Employee / SearchResult interfaces
// ============================================================

export interface Employee {
  emp_id: string;
  name: string;
  avatar: string | null;
  dept_id_list: string[];
  mobile?: string;
  email?: string;
  title?: string;
  job_number?: string;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  offset: number;
  has_more: boolean;
}

/** Standard API response wrapper from backend */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
