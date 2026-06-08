# MemberSelector 通讯录选人组件

通讯录人员选择器，支持单选/多选、受控/非受控、只读模式，所有子组件均可独立导入使用或覆盖样式。

## 目录结构

```
member-selector/
├── index.ts                  # Barrel export
├── types.ts                  # 共享类型 & 常量
├── api.ts                    # API 层（搜索 & 查询）
├── MemberSelector.tsx        # 主组合组件
├── EmployeeAvatar.tsx        # 原子组件：头像
├── EmployeeChip.tsx          # 原子组件：可移除标签
├── EmployeeDropdownItem.tsx  # 原子组件：下拉选项行
├── SearchDropdown.tsx         # 复合组件：搜索结果面板
├── useClickOutside.ts        # Hook：点击外部关闭
├── useEmployeeSearch.ts      # Hook：防抖搜索 + 分页
├── useEmployeeResolve.ts     # Hook：emp_id → Employee 自动回显
└── README.md                 # 本文档
```

## 快速开始

### 导入方式

```tsx
// 方式 1：导入主组件（推荐）
import { MemberSelector } from './member-selector';

// 方式 2：向后兼容（原文件仍可用）
import MemberSelector from './MemberSelector';

// 方式 3：导入原子组件用于自定义组合
import {
  EmployeeAvatar,
  EmployeeChip,
  SearchDropdown,
  EmployeeDropdownItem,
  useEmployeeSearch,
  useClickOutside,
} from './member-selector';
```

## 使用示例

### 单选（最简用法）

组件内部自管理状态，只需传 `userId` + `onChange`：

```tsx
<MemberSelector
  userId={record.owner_emp_id}
  onChange={(employee) => {
    console.log('选中:', employee?.name);
    // employee 是 Employee | null
  }}
/>
```

### 多选

```tsx
<MemberSelector
  multiple
  userIds={record.member_ids}
  onChange={(employees) => {
    console.log('选中人数:', employees.length);
    // employees 是 Employee[]
  }}
/>
```

### 受控模式

由外部完全管理 `value`：

```tsx
const [selected, setSelected] = useState<Employee | null>(null);

<MemberSelector value={selected} onChange={setSelected} />
```

```tsx
const [selectedList, setSelectedList] = useState<Employee[]>([]);

<MemberSelector multiple value={selectedList} onChange={setSelectedList} />
```

### 只读模式

仅展示，不可编辑，传入 `userId` / `userIds` 自动查询渲染：

```tsx
<MemberSelector readOnly userId="2825767874" onChange={() => {}} />

<MemberSelector readOnly multiple userIds={['id1', 'id2']} onChange={() => {}} />
```

### 自定义样式

所有组件支持 `className` prop，与 Tailwind 类合并：

```tsx
<MemberSelector className="max-w-md" onChange={setSelected} />

<EmployeeAvatar employee={emp} size={48} className="ring-2 ring-blue-300" />

<EmployeeChip employee={emp} className="bg-green-50 text-green-700" />
```

### 禁用状态

```tsx
<MemberSelector disabled onChange={() => {}} />
```

## Props 参考

### MemberSelector

| Prop          | 类型                                         | 默认值       | 说明                                            |
| ------------- | -------------------------------------------- | ------------ | ----------------------------------------------- |
| `multiple`    | `boolean`                                    | `false`      | 多选模式                                         |
| `value`       | `Employee \| null` / `Employee[]`            | —            | 受控值，不传则内部自管理                            |
| `onChange`    | `(v: Employee \| null) => void` / `(v: Employee[]) => void` | **必填** | 值变更回调 |
| `userId`      | `string \| null`                             | —            | 单选：数据库 emp_id，自动回显                      |
| `userIds`     | `string[] \| null`                           | —            | 多选：数据库 emp_id 数组，自动回显                  |
| `readOnly`    | `boolean`                                    | `false`      | 只读模式                                         |
| `placeholder` | `string`                                     | `'搜索人员'`  | 输入框占位文本                                    |
| `disabled`    | `boolean`                                    | `false`      | 禁用交互                                         |
| `className`   | `string`                                     | —            | 根容器额外 CSS class                             |

### EmployeeAvatar

| Prop        | 类型       | 默认值 | 说明           |
| ----------- | ---------- | ------ | -------------- |
| `employee`  | `Employee` | **必填** | 员工数据       |
| `size`      | `number`   | `32`   | 像素尺寸       |
| `className` | `string`   | —      | 额外 CSS class |

### EmployeeChip

| Prop        | 类型       | 默认值 | 说明                    |
| ----------- | ---------- | ------ | ----------------------- |
| `employee`  | `Employee` | **必填** | 员工数据               |
| `removable` | `boolean`  | `true` | 是否显示移除按钮        |
| `onRemove`  | `(emp, e) => void` | — | 移除回调             |
| `className` | `string`   | —      | 额外 CSS class         |

### EmployeeDropdownItem

| Prop           | 类型       | 默认值  | 说明                       |
| -------------- | ---------- | ------- | -------------------------- |
| `employee`     | `Employee` | **必填** | 员工数据                   |
| `selected`     | `boolean`  | `false` | 是否已选中                  |
| `highlighted`  | `boolean`  | `false` | 是否高亮（键盘导航）         |
| `showCheckbox` | `boolean`  | `false` | 显示复选框（多选）/ 勾选标记 |
| `onSelect`     | `(emp) => void` | **必填** | 点击选中回调            |
| `className`    | `string`   | —       | 额外 CSS class             |

### SearchDropdown

| Prop            | 类型            | 默认值  | 说明              |
| --------------- | --------------- | ------- | ----------------- |
| `results`       | `Employee[]`    | **必填** | 搜索结果          |
| `query`         | `string`        | **必填** | 当前搜索关键词     |
| `loading`       | `boolean`       | **必填** | 加载状态          |
| `error`         | `string \| null`| **必填** | 错误消息          |
| `selectedIds`   | `Set<string>`   | **必填** | 已选 emp_id 集合  |
| `highlightIndex`| `number`        | **必填** | 高亮行索引         |
| `multiple`      | `boolean`       | `false` | 多选模式          |
| `hasMore`       | `boolean`       | **必填** | 是否有更多数据     |
| `onSelect`      | `(emp) => void` | **必填** | 选中回调          |
| `onLoadMore`    | `() => void`    | **必填** | 加载更多回调       |
| `onHighlight`   | `(i) => void`   | **必填** | 高亮变更回调       |
| `className`     | `string`        | —       | 额外 CSS class    |

## Hooks

### useEmployeeSearch(query: string)

防抖搜索 + 分页，返回 `{ results, loading, error, hasMore, loadMore }`。

```tsx
const { results, loading, error, hasMore, loadMore } = useEmployeeSearch(searchQuery);
```

### useSingleEmployeeResolve(userId, currentValue, onResolved)

自动将 `userId` 解析为 `Employee` 对象用于回显。

### useMultiEmployeeResolve(userIds, currentValue, onResolved)

自动将 `userIds` 数组解析为 `Employee[]` 用于回显。

### useClickOutside\<T\>(() => void)

返回 ref，点击 ref 元素外部时触发回调。

```tsx
const containerRef = useClickOutside<HTMLDivElement>(() => setOpen(false));
```

## API 函数

### fetchEmployeeById(id: string): Promise\<Employee | null\>

按 emp_id 获取单个员工信息。

### searchEmployees(query, offset?, limit?): Promise\<SearchResult\<Employee\>\>

搜索员工，支持分页。

## 自定义组合示例

使用原子组件构建完全自定义的选人 UI：

```tsx
import {
  EmployeeAvatar,
  EmployeeChip,
  EmployeeDropdownItem,
  useEmployeeSearch,
  useClickOutside,
} from './member-selector';

function CustomPeoplePicker() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee[]>([]);
  const { results, loading } = useEmployeeSearch(query);
  const ref = useClickOutside<HTMLDivElement>(() => setShowResults(false));

  return (
    <div ref={ref}>
      {selected.map((emp) => (
        <EmployeeChip
          key={emp.emp_id}
          employee={emp}
          className="bg-purple-50 text-purple-700"
          onRemove={(e) => setSelected((prev) => prev.filter((p) => p.emp_id !== e.emp_id))}
        />
      ))}
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.map((emp) => (
        <EmployeeDropdownItem
          key={emp.emp_id}
          employee={emp}
          selected={selected.some((s) => s.emp_id === emp.emp_id)}
          showCheckbox
          onSelect={(e) => setSelected((prev) => [...prev, e])}
        />
      ))}
    </div>
  );
}
```
