import { useState } from 'react';
import { Newspaper, Globe } from 'lucide-react';
import SiteContentManager from '../SiteContentManager';
import SiteCMSManager from '../site/SiteCMSManager';

// ============================================================
// 官网管理总入口 — 合并"官网内容管理"+"官网全站管理"
// 通过内部 Tab 切换，嵌入页面渲染（非模态）
// ============================================================

const HUB_TABS = [
  { key: 'content' as const, label: '📰 新闻/案例', icon: Newspaper },
  { key: 'cms'     as const, label: '⚙️ 全站管理', icon: Globe },
];

type HubTab = typeof HUB_TABS[number]['key'];

export default function SiteHubManager() {
  const [tab, setTab] = useState<HubTab>('content');

  return (
    <div className="flex flex-col h-full">
      {/* 页头 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="size-9 rounded-xl bg-slate-100 flex items-center justify-center">
          <Globe className="size-5 text-slate-800" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">🌐 官网管理</h2>
          <p className="text-xs text-slate-500">管理官网内容、全站文案及资质信息</p>
        </div>
      </div>

      {/* Tab 栏 */}
      <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
        {HUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              tab === t.key
                ? 'border-slate-800 text-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'content' && (
          <div className="p-4">
            <SiteContentManager
              open={true}
              onClose={() => {}}
              embedded
            />
          </div>
        )}
        {tab === 'cms' && (
          <div className="p-4">
            <SiteCMSManager
              open={true}
              onClose={() => {}}
              embedded
            />
          </div>
        )}
      </div>
    </div>
  );
}