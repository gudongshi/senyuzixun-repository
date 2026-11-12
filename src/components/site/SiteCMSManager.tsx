import { useState } from 'react';
import { X, Globe, FileText, LayoutGrid, Users, Award, Phone } from 'lucide-react';
import SiteTextManager from './SiteTextManager';
import SiteCardManager from './SiteCardManager';
import SiteTeamManager from './SiteTeamManager';
import SiteCredentialsManager from './SiteCredentialsManager';
import SiteContactManager from './SiteContactManager';

// ============================================================
// Tab 配置
// ============================================================
const TABS = [
  { key: 'texts',       label: '📝 单页文本',    icon: FileText },
  { key: 'cards',       label: '📇 列表卡片',    icon: LayoutGrid },
  { key: 'team',        label: '👥 核心团队',    icon: Users },
  { key: 'credentials', label: '🏅 荣誉资质',    icon: Award },
  { key: 'contact',     label: '📞 联系信息',    icon: Phone },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function SiteCMSManager({
  open,
  onClose,
  embedded = false,
}: {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>('texts');

  if (!open) return null;

  // ── 内嵌模式（在 SiteHubManager 中渲染）──
  if (embedded) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-4 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
                tab === t.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'texts'       && <SiteTextManager />}
          {tab === 'cards'       && <SiteCardManager />}
          {tab === 'team'        && <SiteTeamManager />}
          {tab === 'credentials' && <SiteCredentialsManager />}
          {tab === 'contact'     && <SiteContactManager />}
        </div>
      </div>
    );
  }

  // ── 默认模态模式 ──
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel — 全屏大尺寸 */}
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6 pb-6 overflow-y-auto">
        <div className="relative w-full max-w-6xl mx-4 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl shadow-purple-900/50 overflow-hidden flex flex-col max-h-[95vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/30 bg-slate-800/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-purple-900/30 flex items-center justify-center">
                <Globe className="size-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-200">⚙️ 官网全站管理</h3>
                <p className="text-xs text-slate-500">管理官网各模块内容：文案、卡片、团队、资质、联系方式</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700/50 px-6 overflow-x-auto shrink-0">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
                  tab === t.key
                    ? 'border-purple-400 text-purple-300'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Body - scrollable */}
          <div className="p-6 overflow-y-auto flex-1">
            {tab === 'texts'       && <SiteTextManager />}
            {tab === 'cards'       && <SiteCardManager />}
            {tab === 'team'        && <SiteTeamManager />}
            {tab === 'credentials' && <SiteCredentialsManager />}
            {tab === 'contact'     && <SiteContactManager />}
          </div>
        </div>
      </div>
    </>
  );
}