import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { Separator } from './ui/separator';
import { cn } from '../lib/utils';
import type { Employee, ApiResponse } from '../types/contacts';
import { getAuthHeader } from '../lib/auth';

// ============================================================
// CurrentUser — 当前登录人头像组件
//
// 使用方式:
//   <CurrentUser />
//   <CurrentUser onLogout={() => { /* 清除 token，跳转登录页等 */ }} />
//
// 数据来源: GET /api/contacts/employees/me
// 展示: 28×28 圆形头像，点击弹出 Popover 显示用户信息 + 登出按钮
// ============================================================

interface CurrentUserProps {
  /** 点击登出按钮时的回调，不传则不显示登出按钮 */
  onLogout?: () => void;
  /** 自定义 className，覆盖容器样式 */
  className?: string;
  /** 弹层水平对齐方式，默认 "end" */
  popoverAlign?: 'start' | 'center' | 'end';
  /** 弹层弹出方向，默认 "bottom" */
  popoverSide?: 'top' | 'right' | 'bottom' | 'left';
}

export default function CurrentUser({ onLogout, className, popoverAlign = 'end', popoverSide = 'bottom' }: CurrentUserProps) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/contacts/employees/me', {
      headers: { ...getAuthHeader() },
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          throw new Error(`请求失败: ${resp.status} ${body}`);
        }
        return resp.json() as Promise<ApiResponse<Employee>>;
      })
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setEmployee(json.data);
        } else {
          setError(json.error || '获取用户信息失败');
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || '获取用户信息失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className={className}>
        <div className="size-7 rounded-full bg-muted animate-pulse" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <div className={cn("cursor-pointer w-fit", className)}>
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">?</AvatarFallback>
            </Avatar>
          </div>
        </PopoverTrigger>
        <PopoverContent align={popoverAlign} side={popoverSide} className="w-52 p-2">
          <div className="px-2 py-1.5">
            <p className="text-sm text-muted-foreground">
              {error || '未获取到用户'}
            </p>
          </div>
          {onLogout && (
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 cursor-pointer select-none transition-colors hover:bg-muted hover:text-foreground"
              onClick={onLogout}
            >
              <LogOut className="size-4 shrink-0" />
              <span>退出登录</span>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  const initial = employee.name?.charAt(0) || '?';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className={cn("cursor-pointer w-fit", className)}>
          <Avatar className="size-7">
            {employee.avatar ? (
              <AvatarImage src={employee.avatar} alt={employee.name} />
            ) : null}
            <AvatarFallback className="text-xs bg-blue-50 text-blue-600">
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>
      </PopoverTrigger>
      <PopoverContent align={popoverAlign} side={popoverSide} className="w-52 p-2">
        <div className="px-2 py-1.5 space-y-1">
          <p className="text-sm font-medium leading-tight truncate">{employee.name}</p>
        </div>
        {onLogout && (
          <>
            <Separator className="my-1" />
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 cursor-pointer select-none transition-colors hover:bg-muted hover:text-foreground"
              onClick={onLogout}
            >
              <LogOut className="size-4 shrink-0" />
              <span>退出登录</span>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
