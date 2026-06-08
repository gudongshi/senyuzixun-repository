**MemberSelector 使用规范：**
适用于表单选人、详情页展示、表格列渲染，支持单选/多选/只读模式。
```tsx
// 表单 — 单选（如：负责人）
<MemberSelector userId={formData.owner_emp_id} onChange={(emp) => setFormData(prev => ({ ...prev, owner_user_id: emp?.user_id || null }))} />

// 表单 — 多选（如：参与成员）
<MemberSelector multiple userIds={formData.member_emp_ids} onChange={(list) => setFormData(prev => ({ ...prev, member_user_ids: list.map(e => e.user_id) }))} />

// 详情页 / 表格列 — 只读展示
<MemberSelector readOnly userId={record.owner_emp_id} onChange={() => {}} />
<MemberSelector readOnly multiple userIds={record.member_emp_ids} onChange={() => {}} />
```

**CurrentUser 使用规范：**
如果要展示当前登录人或者退出登录，使用 CurrentUser 组件，不要额外写组件。
数据来源：`GET /api/contacts/employees/me`。
- 展示为 28×28 圆形头像，点击弹出 Popover 显示用户姓名、职位和登出按钮。
- 头像为空时自动降级为 name 首字符 + 浅蓝背景圆圈。
- 接口报错时点击头像会展示错误提示。
```tsx
// 基础用法（无登出按钮）
<CurrentUser />

// 带登出回调
<CurrentUser onLogout={() => {
  // 清除 token、跳转登录页等
  window.location.href = '/login';
}} />

// 自定义样式
<CurrentUser onLogout={handleLogout} className="ml-auto" />



