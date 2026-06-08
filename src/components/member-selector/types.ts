import type { Employee } from '@/types/contacts';

// ============================================================
// MemberSelector — Shared types & constants
// ============================================================

/** Single-select props (multiple is false or omitted) */
export interface SingleSelectProps {
  multiple?: false;
  /** Controlled value; omit for internal state management */
  value?: Employee | null;
  onChange: (value: Employee | null) => void;
  /** Stored emp_id string — auto-resolves to Employee when value is empty */
  userId?: string | null;
  userIds?: never;
}

/** Multi-select props (multiple is true) */
export interface MultiSelectProps {
  multiple: true;
  /** Controlled value; omit for internal state management */
  value?: Employee[];
  onChange: (value: Employee[]) => void;
  /** Stored emp_id string array — auto-resolves to Employee[] when value is empty */
  userIds?: string[] | null;
  userId?: never;
}

/** Common props shared by both select modes */
export interface CommonProps {
  /** Read-only mode: display only, no search/edit */
  readOnly?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Additional CSS class for the root container */
  className?: string;
}

/** Discriminated union of single/multi + common props */
export type MemberSelectorProps = (SingleSelectProps | MultiSelectProps) & CommonProps;

// ---- Constants ----

export const SEARCH_DEBOUNCE_MS = 300;
export const DEFAULT_PAGE_LIMIT = 20;
export const SCROLL_THRESHOLD_PX = 20;
