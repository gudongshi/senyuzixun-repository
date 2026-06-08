// ============================================================
// MemberSelector — Barrel export
//
// Import the full component:
//   import { MemberSelector } from './member-selector';
//
// Import atomic sub-components for custom composition:
//   import { EmployeeAvatar, EmployeeChip, SearchDropdown } from './member-selector';
// ============================================================

export { MemberSelector } from './MemberSelector';
export { EmployeeAvatar } from './EmployeeAvatar';
export type { EmployeeAvatarProps } from './EmployeeAvatar';
export { EmployeeChip } from './EmployeeChip';
export type { EmployeeChipProps } from './EmployeeChip';
export { EmployeeDropdownItem } from './EmployeeDropdownItem';
export type { EmployeeDropdownItemProps } from './EmployeeDropdownItem';
export { SearchDropdown } from './SearchDropdown';
export type { SearchDropdownProps } from './SearchDropdown';

// Hooks
export { useEmployeeSearch } from './useEmployeeSearch';
export type { UseEmployeeSearchReturn } from './useEmployeeSearch';
export { useSingleEmployeeResolve, useMultiEmployeeResolve } from './useEmployeeResolve';

// API functions
export { fetchEmployeeById, searchEmployees } from './api';

// Types & constants
export type { MemberSelectorProps, SingleSelectProps, MultiSelectProps, CommonProps } from './types';
export { SEARCH_DEBOUNCE_MS, DEFAULT_PAGE_LIMIT } from './types';
