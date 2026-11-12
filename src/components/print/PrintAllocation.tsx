import { useState, useEffect, useMemo, useCallback } from 'react';
import { Printer, Plus, Trash2, Save, Download, Loader2, Calculator, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';

// ══════════════════════════════════════════════════════════════
// localStorage key
// ══════════════════════════════════════════════════════════════
const DRAFT_KEY = 'print_draft_data';

// ══════════════════════════════════════════════════════════════
// 类型定义
// ══════════════════════════════════════════════════════════════

interface Department {
  id?: number;          // DB id（已有）或 undefined（新增）
  dept_name: string;
  machine_location: string;
  machine_number: string;
  sort_order: number;
}

/** 前端编辑态部门行 */
interface DeptRow {
  key: string;          // 临时唯一键（React key）
  dbId?: number;
  dept_name: string;
  machine_location: string;
  machine_number: string;
  sort_order: number;
  bwPages: number;      // 黑白印量
  colorPages: number;   // 彩色印量
}

/** 单部门计算结果 */
interface DeptResult {
  dept_name: string;
  bwPages: number;
  colorPages: number;
  totalPages: number;
  bwFeeShare: number;       // 黑白费分摊
  colorFee: number;         // 彩色费
  secretFeeShare: number;   // 机密费分摊
  differenceShare: number;  // 抹零差额分摊
  actualFee: number;        // 最终实际费用
  machine_location: string;
  machine_number: string;
}

// ══════════════════════════════════════════════════════════════
// 计算逻辑
// ══════════════════════════════════════════════════════════════

/** 计算全公司黑白总费（阶梯计价） */
function calcBwTotal(totalBw: number): number {
  if (totalBw <= 0) return 0;
  if (totalBw <= 10000) return 800;
  return 10000 * 0.08 + (totalBw - 10000) * 0.07;
}

/** 计算各部门分摊结果 */
function calculateAllocation(
  rows: DeptRow[],
  invoiceTotal: number
): { results: DeptResult[]; summary: AllocationSummary } {
  const results: DeptResult[] = [];
  let totalBw = 0;
  let totalColor = 0;

  for (const r of rows) {
    totalBw += r.bwPages;
    totalColor += r.colorPages;
  }

  const totalPages = totalBw + totalColor;
  const bwTotalFee = calcBwTotal(totalBw);
  const colorTotalFee = totalColor * 0.7;
  const secretFee = 100;
  const theoreticalTotal = bwTotalFee + colorTotalFee + secretFee;
  const difference = invoiceTotal - theoreticalTotal;

  for (const r of rows) {
    const deptTotalPages = r.bwPages + r.colorPages;

    // 黑白费：按本部门黑白印量比例分摊
    const bwFeeShare = totalBw > 0
      ? round2(bwTotalFee * (r.bwPages / totalBw))
      : 0;

    // 彩色费：0.7 × 本部门彩色印量
    const colorFee = round2(r.colorPages * 0.7);

    // 机密费：按总印量比例分摊
    const secretFeeShare = totalPages > 0
      ? round2(secretFee * (deptTotalPages / totalPages))
      : 0;

    // 抹零差额：按总印量比例分摊
    const differenceShare = totalPages > 0
      ? round2(difference * (deptTotalPages / totalPages))
      : 0;

    // 最终实际费用
    const actualFee = round2(bwFeeShare + colorFee + secretFeeShare + differenceShare);

    results.push({
      dept_name: r.dept_name,
      bwPages: r.bwPages,
      colorPages: r.colorPages,
      totalPages: deptTotalPages,
      bwFeeShare,
      colorFee,
      secretFeeShare,
      differenceShare,
      actualFee,
      machine_location: r.machine_location,
      machine_number: r.machine_number,
    });
  }

  // 浮点修正：让各部门 actualFee 之和精确等于 invoiceTotal
  const sumActual = results.reduce((s, r) => s + r.actualFee, 0);
  const roundingError = round2(invoiceTotal - sumActual);
  if (roundingError !== 0 && results.length > 0) {
    // 将四舍五入误差补到印量最大的部门
    let maxIdx = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i].totalPages > results[maxIdx].totalPages) maxIdx = i;
    }
    results[maxIdx].actualFee = round2(results[maxIdx].actualFee + roundingError);
    results[maxIdx].differenceShare = round2(results[maxIdx].differenceShare + roundingError);
  }

  const summary: AllocationSummary = {
    totalBw,
    totalColor,
    totalPages,
    bwTotalFee: round2(bwTotalFee),
    colorTotalFee: round2(colorTotalFee),
    secretFee,
    theoreticalTotal: round2(theoreticalTotal),
    difference: round2(difference),
    invoiceTotal: round2(invoiceTotal),
    sumActual: round2(results.reduce((s, r) => s + r.actualFee, 0)),
  };

  return { results, summary };
}

interface AllocationSummary {
  totalBw: number;
  totalColor: number;
  totalPages: number;
  bwTotalFee: number;
  colorTotalFee: number;
  secretFee: number;
  theoreticalTotal: number;
  difference: number;
  invoiceTotal: number;
  sumActual: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ══════════════════════════════════════════════════════════════
// 组件
// ══════════════════════════════════════════════════════════════

export default function PrintAllocation() {
  // ── 状态 ──
  const [departments, setDepartments]     = useState<Department[]>([]);
  const [rows, setRows]                   = useState<DeptRow[]>([]);
  const [invoiceTotal, setInvoiceTotal]   = useState<string>('');
  const [loading, setLoading]             = useState(false);
  const [loaded, setLoaded]               = useState(false); // 防止初始化时触发自动保存
  const [saving, setSaving]               = useState(false);
  const [message, setMessage]             = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 新增行临时状态
  const [newName, setNewName]             = useState('');
  const [newLocation, setNewLocation]     = useState('');
  const [newNumber, setNewNumber]         = useState('');

  // ── 加载部门模板 ──
  useEffect(() => { loadDepartments(); }, []);

  // ── 自动保存草稿到 localStorage ──
  useEffect(() => {
    if (!loaded) return; // 初始化期间不保存
    const draft = {
      rows: rows.map(r => ({
        key: r.key,
        dbId: r.dbId,
        dept_name: r.dept_name,
        machine_location: r.machine_location,
        machine_number: r.machine_number,
        sort_order: r.sort_order,
        bwPages: r.bwPages,
        colorPages: r.colorPages,
      })),
      invoiceTotal,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [rows, invoiceTotal, loaded]);

  async function loadDepartments() {
    setLoading(true);
    try {
      // 先读取草稿（如果有）
      let draft: any = null;
      const draftStr = localStorage.getItem(DRAFT_KEY);
      if (draftStr) {
        try { draft = JSON.parse(draftStr); } catch (e) { /* 解析失败则忽略 */ }
      }

      const res = await fetch('/api/print/departments');
      const json = await res.json();
      if (json.success) {
        const depts: Department[] = json.data || [];
        setDepartments(depts);

        // 构建 rows，如果有草稿则合并印量数据
        setRows(() =>
          depts.map(d => {
            const draftRow = draft?.rows?.find((dr: any) => dr.key === `dept-${d.id}`);
            return {
              key: `dept-${d.id}`,
              dbId: d.id,
              dept_name: d.dept_name,
              machine_location: d.machine_location || '',
              machine_number: d.machine_number || '',
              sort_order: d.sort_order || 0,
              bwPages: draftRow ? (draftRow.bwPages || 0) : 0,
              colorPages: draftRow ? (draftRow.colorPages || 0) : 0,
            };
          })
        );

        // 恢复发票总额
        if (draft?.invoiceTotal) {
          setInvoiceTotal(draft.invoiceTotal);
        }

        // 通知用户
        if (draft && draft.rows?.length > 0) {
          const hasData = draft.rows.some((r: any) => (r.bwPages || 0) > 0 || (r.colorPages || 0) > 0);
          if (hasData || draft.invoiceTotal) {
            setTimeout(() => showMessage('success', '📝 检测到上次未保存的草稿，已自动为您恢复'), 400);
          }
        }
      }
    } catch (err: any) {
      showMessage('error', '加载部门列表失败: ' + err.message);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  // ── 工具 ──
  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  // 更新印量
  function updatePages(key: string, field: 'bwPages' | 'colorPages', val: string) {
    const num = parseInt(val, 10) || 0;
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: num } : r));
  }

  // 删除行
  async function removeRow(key: string) {
    const row = rows.find(r => r.key === key);
    if (!row) return;
    if (row.dbId) {
      try {
        await fetch(`/api/print/departments/${row.dbId}`, { method: 'DELETE' });
      } catch (err: any) {
        showMessage('error', '删除失败: ' + err.message);
        return;
      }
    }
    setRows(prev => prev.filter(r => r.key !== key));
    setDepartments(prev => prev.filter(d => d.id !== row.dbId));
    showMessage('success', '已删除部门');
  }

  // 添加新行
  async function addRow() {
    const name = newName.trim();
    if (!name) return showMessage('error', '请输入部门名称');
    try {
      const res = await fetch('/api/print/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dept_name: name,
          machine_location: newLocation.trim(),
          machine_number: newNumber.trim(),
          sort_order: departments.length,
        }),
      });
      const json = await res.json();
      if (!json.success) return showMessage('error', '添加失败: ' + json.error);
      const d = json.data;
      setDepartments(prev => [...prev, d]);
      setRows(prev => [...prev, {
        key: `dept-${d.id}`,
        dbId: d.id,
        dept_name: d.dept_name,
        machine_location: d.machine_location || '',
        machine_number: d.machine_number || '',
        sort_order: d.sort_order || 0,
        bwPages: 0,
        colorPages: 0,
      }]);
      setNewName('');
      setNewLocation('');
      setNewNumber('');
      showMessage('success', '部门已添加');
    } catch (err: any) {
      showMessage('error', '添加失败: ' + err.message);
    }
  }

  // ── 实时计算 ──
  const invoiceVal = parseFloat(invoiceTotal) || 0;
  const { results, summary } = useMemo(
    () => calculateAllocation(rows, invoiceVal),
    [rows, invoiceVal]
  );

  // ── 清空数据和草稿 ──
  function clearAll() {
    localStorage.removeItem(DRAFT_KEY);
    setInvoiceTotal('');
    setRows(prev => prev.map(r => ({ ...r, bwPages: 0, colorPages: 0 })));
    showMessage('success', '数据已清空');
  }

  // ── 保存本期账单 ──
  async function saveRecord() {
    if (invoiceVal <= 0) return showMessage('error', '请先输入本次发票总额');
    if (rows.length === 0) return showMessage('error', '无部门数据');
    setSaving(true);
    try {
      const res = await fetch('/api/print/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_total: invoiceVal,
          total_bw_pages: summary.totalBw,
          total_color_pages: summary.totalColor,
          total_pages: summary.totalPages,
          bw_total_fee: summary.bwTotalFee,
          color_fee: summary.colorTotalFee,
          secret_fee: summary.secretFee,
          theoretical_total: summary.theoreticalTotal,
          difference: summary.difference,
          items: results.map(r => ({
            dept_name: r.dept_name,
            bw_pages: r.bwPages,
            color_pages: r.colorPages,
            total_pages: r.totalPages,
            bw_fee_share: r.bwFeeShare,
            color_fee: r.colorFee,
            secret_fee_share: r.secretFeeShare,
            difference_share: r.differenceShare,
            actual_fee: r.actualFee,
            machine_location: r.machine_location,
            machine_number: r.machine_number,
            sort_order: 0,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        localStorage.removeItem(DRAFT_KEY);
        showMessage('success', '✅ 本期账单已保存');
      } else {
        showMessage('error', '保存失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      showMessage('error', '保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── 导出 Excel ──
  const exportExcel = useCallback(() => {
    if (rows.length === 0) return showMessage('error', '无数据可导出');
    if (invoiceVal <= 0) return showMessage('error', '请先输入本次发票总额');

    const bwInRange = Math.min(summary.totalBw, 10000);
    const bwExcess   = Math.max(summary.totalBw - 10000, 0);
    const excessAndColorFee = round2(bwExcess * 0.07 + summary.colorTotalFee);
    const baseFee900 = round2((bwInRange > 0 ? 800 : 0) + 100); // 黑白基础 + 机密

    // ── 数据区 ──
    const sheetData: any[][] = [
      ['序号', '部门', '印量/张', '彩/张', '费用（元）', '机器所在地', '机器编号'],
    ];

    results.forEach((r, i) => {
      sheetData.push([
        i + 1,
        r.dept_name,
        r.bwPages,
        r.colorPages,
        r.actualFee,
        r.machine_location || '',
        r.machine_number || '',
      ]);
    });

    // 空行
    sheetData.push([]);
    // 说明行
    const desc1 = '说明：Public为打印的公共账号,管理时偶尔使用，1为初始时设置的账号，现已不用。';
    sheetData.push([desc1]);

    const desc2 = `说明2：实际费用¥${summary.invoiceTotal}，（实际印量${summary.totalPages}张，超出${summary.totalBw - 10000 > 0 ? summary.totalBw - 10000 : 0}张，基础费用¥${baseFee900}（含机密打印100元），超出及彩色部分¥${excessAndColorFee}。黑白1万张以内0.08元/页，超出0.07元/页。彩色0.7元/页。）`;
    sheetData.push([desc2]);

    // ── 创建工作簿 ──
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // 设置列宽
    ws['!cols'] = [
      { wch: 6 },   // 序号
      { wch: 16 },  // 部门
      { wch: 10 },  // 印量
      { wch: 8 },   // 彩
      { wch: 12 },  // 费用
      { wch: 16 },  // 机器所在地
      { wch: 14 },  // 机器编号
    ];

    XLSX.utils.book_append_sheet(wb, ws, '打印费分摊');
    XLSX.writeFile(wb, `打印费分摊_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showMessage('success', '✅ Excel 已导出');
  }, [rows, results, summary, invoiceVal]);

  // ══════════════════════════════════════════════════════════
  // 渲染
  // ══════════════════════════════════════════════════════════

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* ── 页头 ── */}
      <div className="flex items-center gap-3 mb-6">
        <div className="size-9 rounded-xl bg-slate-100 flex items-center justify-center">
          <Printer className="size-5 text-slate-800" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">🖨️ 打印费分摊</h2>
          <p className="text-xs text-slate-500">部门印量管理 · 阶梯计价 · 抹零分摊</p>
        </div>
      </div>

      {/* ── 消息提示 ── */}
      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* ── 顶部工具栏 ── */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        {/* 发票总额 */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700 whitespace-nowrap">本次发票总额</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={invoiceTotal}
            onChange={e => setInvoiceTotal(e.target.value)}
            placeholder="¥ 0.00"
            className="w-36 bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
          />
        </div>

        <button
          onClick={clearAll}
          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-500 text-xs hover:text-slate-700 hover:bg-slate-50 transition-colors"
          title="清空所有数据并删除草稿"
        >
          <RotateCcw size={13} />
          清空数据
        </button>

        <div className="flex-1" />

        <button
          onClick={saveRecord}
          disabled={saving || invoiceVal <= 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存本期账单
        </button>

        <button
          onClick={exportExcel}
          disabled={rows.length === 0 || invoiceVal <= 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="size-4" />
          一键导出 Excel
        </button>
      </div>

      {/* ── 主内容：部门列表 + 计算面板 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 左：部门列表 */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-8 text-slate-400 animate-spin" />
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">部门</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">黑白印量</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">彩色印量</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">所在地</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">编号</th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                          暂无部门数据，请在下方添加
                        </td>
                      </tr>
                    )}
                    {rows.map(r => (
                      <tr key={r.key} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{r.dept_name}</td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min="0"
                            value={r.bwPages || ''}
                            onChange={e => updatePages(r.key, 'bwPages', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min="0"
                            value={r.colorPages || ''}
                            onChange={e => updatePages(r.key, 'colorPages', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 text-xs">{r.machine_location}</td>
                        <td className="px-4 py-2.5 text-slate-600 text-xs">{r.machine_number}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => removeRow(r.key)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 新增部门 */}
                <div className="border-t border-slate-200 px-4 py-3 bg-slate-50/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="部门名称"
                      className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
                      onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
                    />
                    <input
                      type="text"
                      value={newLocation}
                      onChange={e => setNewLocation(e.target.value)}
                      placeholder="机器所在地"
                      className="w-28 bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
                    />
                    <input
                      type="text"
                      value={newNumber}
                      onChange={e => setNewNumber(e.target.value)}
                      placeholder="机器编号"
                      className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
                    />
                    <button
                      onClick={addRow}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all"
                    >
                      <Plus size={15} />
                      新增
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 右：实时计算面板 */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="size-4 text-slate-600" />
              <h3 className="text-sm font-bold text-slate-800">实时计算</h3>
            </div>

            {/* 汇总 */}
            <div className="space-y-2 mb-4 pb-4 border-b border-slate-100">
              <SummaryRow label="黑白总量" value={`${summary.totalBw} 张`} />
              <SummaryRow label="彩色总量" value={`${summary.totalColor} 张`} />
              <SummaryRow label="总印量" value={`${summary.totalPages} 张`} />
              <div className="h-px bg-slate-100 my-1" />
              <SummaryRow label="黑白费" value={`¥ ${summary.bwTotalFee}`} bold />
              <SummaryRow label="彩色费" value={`¥ ${summary.colorTotalFee}`} />
              <SummaryRow label="机密费" value="¥ 100.00" />
              <SummaryRow label="理论总计" value={`¥ ${summary.theoreticalTotal}`} />
              <SummaryRow
                label="差额（抹零）"
                value={`¥ ${summary.difference}`}
                highlight={summary.difference !== 0}
              />
              <div className="h-px bg-slate-100 my-1" />
              <SummaryRow label="发票总额（实付）" value={`¥ ${summary.invoiceTotal}`} bold large />
              <SummaryRow
                label="合计校验"
                value={`¥ ${summary.sumActual}`}
                muted
              />
            </div>

            {/* 各部门明细 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">各部门费用</p>
              {results.length === 0 && (
                <p className="text-xs text-slate-400">暂无数据</p>
              )}
              {results.map((r, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-slate-800">{r.dept_name}</span>
                    <span className="text-sm font-bold text-slate-900">¥ {r.actualFee}</span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>印量：{r.bwPages} 黑白 + {r.colorPages} 彩色 = {r.totalPages} 张</span>
                    </div>
                    <div className="flex justify-between">
                      <span>黑白费分摊</span>
                      <span>¥ {r.bwFeeShare}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>彩色费</span>
                      <span>¥ {r.colorFee}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>机密费分摊</span>
                      <span>¥ {r.secretFeeShare}</span>
                    </div>
                    {r.differenceShare !== 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>抹零分摊</span>
                        <span>{r.differenceShare > 0 ? '+' : ''}¥ {r.differenceShare}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 小部件
// ══════════════════════════════════════════════════════════════

function SummaryRow({
  label, value, bold, large, highlight, muted
}: {
  label: string; value: string; bold?: boolean; large?: boolean;
  highlight?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${muted ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
      <span className={`${large ? 'text-base' : 'text-sm'} ${
        muted ? 'text-slate-400'
          : highlight ? 'text-amber-600'
          : bold ? 'text-slate-800 font-bold'
          : 'text-slate-700'
      }`}>{value}</span>
    </div>
  );
}