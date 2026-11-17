import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertTriangle, CloudUpload, Database, Printer, Plus, Trash2, Save, Download, Loader2, Calculator, RotateCcw } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// v10.8: 显式引入本地 Worker，避免 CDN 跨版本不兼容
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ══════════════════════════════════════════════════════════════
// localStorage key
// ══════════════════════════════════════════════════════════════
/** 按月隔离草稿：每个月份独立存储，杜绝 A 月数据串到 B 月 */
function getDraftKey(month: string): string {
  return 'print_draft_' + month;
}
const BUILD_VER  = 'v10.8'; // 版本标识：修复 pdfjs Vite Worker 崩溃 + 渲染兜底提示

// ══════════════════════════════════════════════════════════════
// v9.2: AI 识别部门别名映射表
// ══════════════════════════════════════════════════════════════
const deptAliasMap: Record<string, string> = {
  '造价': '工程造价',
  '市场': '市场部',
  '何朝辉': '何总',
  '中心': '风控中心',
  '工程部': '项目管理部',
  '数据中心': '行政', // 特殊：数据中心合并到行政
};

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
  // ── 强制版本日志（F12 第一条就能看到）──
  console.log('🚀 当前前端版本：v10.8');

  // ── 状态 ──
  const [departments, setDepartments]     = useState<Department[]>([]);
  const [rows, setRows]                   = useState<DeptRow[]>([]);
  const [invoiceTotal, setInvoiceTotal]   = useState<string>('');
  const [billingMonth, setBillingMonth]   = useState<string>(() => {
    // 默认当前月份（YYYY-MM）
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading]             = useState(false);
  const [loaded, setLoaded]               = useState(false); // 防止初始化时触发自动保存
  const [saving, setSaving]               = useState(false);
  const [savingDepts, setSavingDepts]     = useState(false); // "保存常用部门" loading
  const [drafting, setDrafting]           = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [ocrLoading, setOcrLoading]       = useState(false); // v9.0: AI 账单识别 loading
  const [ocrInvoiceLoading, setOcrInvoiceLoading] = useState(false); // v9.7: AI 发票识别 loading
  const [message, setMessage]             = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 防草稿误删：记录本次会话是否已有过非空 rows
  const hadDataRef = useRef(false);

  // 新增行临时状态
  const [newName, setNewName]             = useState('');
  const [newLocation, setNewLocation]     = useState('');
  const [newNumber, setNewNumber]         = useState('');
  const deptNameInputRef = useRef<HTMLInputElement>(null);

  // ── 加载部门模板 ──
  useEffect(() => { loadDepartments(); }, []);

  // ══════════════════════════════════════════════════════════════
  // v8.0: 部门模板与月份完全解绑，三步严格切换逻辑
  // ══════════════════════════════════════════════════════════════
  const isSwitchingMonthRef = useRef(false);    // 🔒 互斥锁：阻止 auto-save 串线
  const departmentsRef = useRef<Department[]>([]); // 最新模板引用（避免闭包陷阱）
  const rowsRef = useRef<DeptRow[]>([]);           // 最新 rows 引用（调试用）
  const initialMountRef = useRef(true);            // 首次挂载标记

  // ref 与 state 同步（顺序优先于业务 effect，确保 ref 总是最新）
  useEffect(() => { departmentsRef.current = departments; }, [departments]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // ── 月份切换：三步严格逻辑（依赖仅 billingMonth，不加 loaded）──
  useEffect(() => {
    if (!billingMonth) return;

    // 首次挂载交给 loadDepartments 处理，本 effect 只负责后续手动切换
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }

    console.log('📅 切换月份至:', billingMonth);

    // ── 第一步（同步）：发票清空 + 从部门模板重建零印量 rows ──
    isSwitchingMonthRef.current = true;
    setInvoiceTotal('');
    const depts = departmentsRef.current;
    if (depts.length > 0) {
      setRows(depts.map(d => ({
        key: `dept-${d.id}`,
        dbId: d.id,
        dept_name: d.dept_name,
        machine_location: d.machine_location || '',
        machine_number: d.machine_number || '',
        sort_order: d.sort_order || 0,
        bwPages: 0,
        colorPages: 0,
      })));
    }

    // ── 第二/三步（异步）：查正式账单，查到则覆盖 ──
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/print/records/check?month=' + encodeURIComponent(billingMonth));
        const json = await res.json();
        if (cancelled) return;

        console.log('📅 查询结果:', json.found ? '有数据' : '无数据');

        if (json.success && json.found) {
          const { record, items } = json;
          setInvoiceTotal(String(record.invoice_total));
          if (items && items.length > 0) {
            const curDepts = departmentsRef.current;
            const tplMap = new Map(curDepts.map(d => [d.dept_name, d]));
            const seenDepts = new Set<string>();
            const loadedRows: DeptRow[] = [];

            for (const item of items) {
              const tpl = tplMap.get(item.dept_name);
              seenDepts.add(item.dept_name);
              loadedRows.push({
                key: tpl ? `dept-${tpl.id}` : `hist-${item.id || Math.random().toString(36).slice(2, 8)}`,
                dbId: tpl?.id,
                dept_name: item.dept_name,
                machine_location: item.machine_location || tpl?.machine_location || '',
                machine_number: item.machine_number || tpl?.machine_number || '',
                sort_order: item.sort_order || tpl?.sort_order || 0,
                bwPages: item.bw_pages || 0,
                colorPages: item.color_pages || 0,
              });
            }

            // 模板中有但账单中没有的部门 → 补空白行
            for (const tpl of curDepts) {
              if (!seenDepts.has(tpl.dept_name)) {
                loadedRows.push({
                  key: `dept-${tpl.id}`, dbId: tpl.id, dept_name: tpl.dept_name,
                  machine_location: tpl.machine_location || '',
                  machine_number: tpl.machine_number || '',
                  sort_order: tpl.sort_order || 0,
                  bwPages: 0, colorPages: 0,
                });
              }
            }
            setRows(loadedRows);
          }
          showMessage('success', '✅ 已加载 ' + billingMonth + ' 历史账单（¥' + record.invoice_total + '，' + (items?.length || 0) + ' 个部门）');
          return; // 有正式账单，结束（不检查草稿）
        }

        // ── 第 2 路（v8.2 加强校验）：DB 无账单 → 检查该月份 localStorage 草稿 ──
        const draftKey = getDraftKey(billingMonth);
        const draftStr = localStorage.getItem(draftKey);
        let draft: any = null;
        let draftParseFailed = false;

        if (draftStr) {
          try {
            draft = JSON.parse(draftStr);
            // 校验：draft.rows 必须是数组
            if (!draft || !Array.isArray(draft.rows)) {
              console.warn('🧹 [Draft] ' + draftKey + ' 结构异常（缺 rows 或非数组），自动清理');
              localStorage.removeItem(draftKey);
              draft = null;
              draftParseFailed = true;
            }
          } catch (e) {
            console.warn('🧹 [Draft] ' + draftKey + ' JSON 解析失败，自动清理');
            localStorage.removeItem(draftKey);
            draftParseFailed = true;
          }
        }

        if (!draft || draftParseFailed) {
          // 无有效草稿 → 进入第 3 路
        } else {
          const draftRows: any[] = draft.rows; // 已通过 Array.isArray 校验
          const hasDraftPages = draftRows.some((r: any) => (r.bwPages || 0) > 0 || (r.colorPages || 0) > 0);
          const hasDraftInvoice = draft?.invoiceTotal && parseFloat(draft.invoiceTotal) > 0;

          if (hasDraftPages || hasDraftInvoice) {
            // 有效草稿 → 加载
            setInvoiceTotal(draft.invoiceTotal || '');
            const curDepts2 = departmentsRef.current;
            const tplMap2 = new Map(curDepts2.map(d => [d.dept_name, d]));
            const seenDepts2 = new Set<string>();
            const draftLoadedRows: DeptRow[] = [];

            for (const dr of draftRows) {
              const tpl = tplMap2.get(dr.dept_name);
              seenDepts2.add(dr.dept_name);
              draftLoadedRows.push({
                key: dr.key || `draft-${Math.random().toString(36).slice(2, 8)}`,
                dbId: dr.dbId || tpl?.id,
                dept_name: dr.dept_name || '未知部门',
                machine_location: dr.machine_location || tpl?.machine_location || '',
                machine_number: dr.machine_number || tpl?.machine_number || '',
                sort_order: dr.sort_order || tpl?.sort_order || 0,
                bwPages: dr.bwPages || 0,
                colorPages: dr.colorPages || 0,
              });
            }

            // 模板中有但草稿中没有的部门 → 补空白行
            for (const tpl of curDepts2) {
              if (!seenDepts2.has(tpl.dept_name)) {
                draftLoadedRows.push({
                  key: `dept-${tpl.id}`, dbId: tpl.id, dept_name: tpl.dept_name,
                  machine_location: tpl.machine_location || '',
                  machine_number: tpl.machine_number || '',
                  sort_order: tpl.sort_order || 0,
                  bwPages: 0, colorPages: 0,
                });
              }
            }
            setRows(draftLoadedRows);
            showMessage('success', '📝 已加载 ' + billingMonth + ' 本地草稿（' + draftRows.length + ' 个部门）');
            return;
          }

          // 草稿存在但全零（旧版本竞态写入的空壳）→ 清理
          console.log('🧹 [Draft] ' + draftKey + ' 为全零空壳（v7.x 竞态残留），自动清理');
          localStorage.removeItem(draftKey);
        }

        // ── 第 3 路：既无账单也无草稿 → 第一步的零印量模板就是最终状态 ──
      } catch (err: any) {
        console.error('📅 查询失败，保留干净模板:', err.message);
        // 第一步的干净模板保留，不清空
      } finally {
        if (!cancelled) {
          isSwitchingMonthRef.current = false;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [billingMonth]);

  // ── 调试日志：每次 rows 提交到 DOM 后输出最终渲染结果 ──
  useEffect(() => {
    console.log('📅 当前渲染的部门数量:', rows.length, '首行数据:', rows.length > 0 ? rows[0] : '(空)');
  }, [rows]);

  // ── 自动保存草稿到 localStorage ──
  useEffect(() => {
    if (!loaded) return; // 初始化期间不保存

    // 🔒 防线 0（v7.7）：月份切换期间绝对禁止保存 — 此时 rows 还是旧月数据但 billingMonth 已是新月
    if (isSwitchingMonthRef.current) {
      console.log('🛡️ [AutoSave] 月份切换中，跳过保存（防止旧月数据串入新月 key）');
      return;
    }

    // 防线 1：本次会话已有过数据，但现在 rows 被意外置空 → 绝对拒绝
    if (rows.length === 0 && hadDataRef.current) {
      console.error('🛡️🛡️ [AutoSave] 紧急阻止：本次会话曾有数据，现在 rows 意外变空，拒绝覆盖草稿！');
      return;
    }

    // 防线 2：当前空 + 该月份的 localStorage 中有草稿 → 拒绝覆盖（冷启动保护）
    if (rows.length === 0) {
      const existingStr = localStorage.getItem(getDraftKey(billingMonth));
      if (existingStr) {
        try {
          const existing = JSON.parse(existingStr);
          if (existing.rows && existing.rows.length > 0) {
            console.warn('🛡️ [AutoSave] 阻止覆盖：当前 rows 为空但草稿中有 ' + existing.rows.length + ' 个部门，拒绝覆盖');
            return;
          }
        } catch (e) { /* ignore */ }
      }
    }

    // 标记：本次会话已经有过数据
    if (rows.length > 0) {
      hadDataRef.current = true;
    }

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
      billingMonth,
    };
    localStorage.setItem(getDraftKey(billingMonth), JSON.stringify(draft));
    console.log('💾 [AutoSave] 草稿已保存到 ' + getDraftKey(billingMonth) + '：' + rows.length + ' 个部门, invoiceTotal=' + invoiceTotal, rows);
  }, [rows, invoiceTotal, billingMonth, loaded]);

  async function loadDepartments() {
    setLoading(true);
    try {
      // ── 1. 读取该月份 localStorage 草稿 ──
      let draft: any = null;
      const draftStr = localStorage.getItem(getDraftKey(billingMonth));
      if (draftStr) {
        try { draft = JSON.parse(draftStr); } catch (e) { console.error('❌ [Init] draft JSON 解析失败:', e); }
      }
      // 安全提取 draft.rows：必须是数组才认，否则当空处理
      const draftRows: any[] = (draft && Array.isArray(draft.rows)) ? draft.rows : [];
      console.log('🔍 [Init] localStorage 草稿 (' + getDraftKey(billingMonth) + '):', {
        hasDraft: !!draft,
        rowsType: typeof draft?.rows,
        rowsIsArray: Array.isArray(draft?.rows),
        rowsCount: draftRows.length,
        invoiceTotal: draft?.invoiceTotal,
        billingMonth: draft?.billingMonth,
      });

      // ── 2. 尝试从 API 获取部门模板 ──
      let apiDepts: Department[] = [];
      try {
        const res = await fetch('/api/print/departments');
        const json = await res.json();
        console.log('🔍 [Init] API 返回:', { status: res.status, success: json.success, count: json.data?.length });
        if (json.success && Array.isArray(json.data)) {
          apiDepts = json.data;
          setDepartments(apiDepts);
        }
      } catch (err: any) {
        console.warn('⚠️ [Init] API 获取失败，将回退到草稿:', err.message);
      }

      // ── 3. 构建最终 rows ──
      let finalRows: DeptRow[] = [];

      if (apiDepts.length > 0) {
        // 策略 A：DB 模板为基底，草稿印量合并
        console.log('🔍 [Init] 策略: DB 模板合并（' + apiDepts.length + ' 个模板 + ' + draftRows.length + ' 条草稿）');
        const draftMap = new Map<string, any>();
        for (const dr of draftRows) {
          if (dr.key) draftMap.set(dr.key, dr);
        }
        const usedKeys = new Set<string>();

        finalRows = apiDepts.map(d => {
          const key = `dept-${d.id}`;
          const dr = draftMap.get(key);
          if (dr) usedKeys.add(key);
          return {
            key, dbId: d.id, dept_name: d.dept_name,
            machine_location: d.machine_location || '',
            machine_number: d.machine_number || '',
            sort_order: d.sort_order || 0,
            bwPages: dr ? (dr.bwPages || 0) : 0,
            colorPages: dr ? (dr.colorPages || 0) : 0,
          };
        });

        // 追加草稿特有行
        for (const dr of draftRows) {
          if (dr.key && !usedKeys.has(dr.key)) {
            finalRows.push({
              key: dr.key, dbId: dr.dbId, dept_name: dr.dept_name || '未知部门',
              machine_location: dr.machine_location || '',
              machine_number: dr.machine_number || '',
              sort_order: dr.sort_order || 0,
              bwPages: dr.bwPages || 0, colorPages: dr.colorPages || 0,
            });
          }
        }
      } else if (draftRows.length > 0) {
        // 策略 B：无 DB 模板，直接用草稿
        console.log('🔍 [Init] 策略: 纯草稿回退（' + draftRows.length + ' 个部门）');
        finalRows = draftRows.map((dr: any) => ({
          key: dr.key || `draft-${Math.random().toString(36).slice(2, 8)}`,
          dbId: dr.dbId, dept_name: dr.dept_name || '未知部门',
          machine_location: dr.machine_location || '',
          machine_number: dr.machine_number || '',
          sort_order: dr.sort_order || 0,
          bwPages: dr.bwPages || 0, colorPages: dr.colorPages || 0,
        }));
      }
      // 策略 C：两者都空 → finalRows = []（正常，首次使用）

      console.log('🔍 [Init] 最终渲染: ' + finalRows.length + ' 行', finalRows.map(r => r.dept_name));

      // ── 4. 写入状态（必须在 setLoaded(true) 之前）──
      setRows(finalRows);
      if (draft?.invoiceTotal) setInvoiceTotal(draft.invoiceTotal);
      if (draft?.billingMonth) setBillingMonth(draft.billingMonth);

      // ── 5. 标记初始化完成 ──
      // 关键：只有到这里才允许 AutoSave，此时 rows 已经是正确数据
      setLoaded(true);

      // ── 6. 通知用户 ──
      if (draftRows.length > 0) {
        const hasData = draftRows.some((r: any) => (r.bwPages || 0) > 0 || (r.colorPages || 0) > 0);
        if (hasData || draft?.invoiceTotal) {
          setTimeout(() => showMessage('success', '📝 检测到上次未保存的草稿，已自动为您恢复'), 400);
        }
      }
    } catch (err: any) {
      console.error('❌ [Init] loadDepartments 崩溃:', err);
      showMessage('error', '加载部门列表失败: ' + err.message);
      // 异常时仍需标记 loaded，避免 UI 永远 loading
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  // ── 工具 ──
  function showMessage(type: 'success' | 'error', text: string, duration?: number) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), duration || 3000);
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
      // 焦点回到部门名称输入框，方便连续录入
      setTimeout(() => deptNameInputRef.current?.focus(), 0);
      showMessage('success', '部门已添加');
    } catch (err: any) {
      showMessage('error', '添加失败: ' + err.message);
    }
  }

  // 批量保存当前所有部门到数据库模板（永久固化）
  async function saveDeptTemplate() {
    if (rows.length === 0) return showMessage('error', '当前无部门可保存');
    setSavingDepts(true);
    try {
      const payload = rows.map(r => ({
        dept_name: r.dept_name,
        machine_location: r.machine_location,
        machine_number: r.machine_number,
        sort_order: r.sort_order,
      }));
      const res = await fetch('/api/print/departments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments: payload }),
      });
      const json = await res.json();
      console.log('📝 [saveDeptTemplate] 批量保存响应:', json);
      if (json.success) {
        if (json.count === 0) {
          showMessage('success', '📋 所有 ' + rows.length + ' 个部门已存在于数据库中，无需重复添加');
        } else {
          showMessage('success', `✅ 已固化 ${json.count} 个部门到数据库模板（跳过 ${json.skipped || 0} 个重名）`);
        }
        // 刷新部门模板列表
        loadDepartments();
      } else {
        showMessage('error', '固化失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      showMessage('error', '固化失败: ' + err.message);
    } finally {
      setSavingDepts(false);
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
    // 清除当前月份草稿
    localStorage.removeItem(getDraftKey(billingMonth));
    // 同时清理旧版全局草稿（向前兼容 v7.5 及之前的遗留数据）
    localStorage.removeItem('print_draft_data');
    setInvoiceTotal('');
    // v8.3 fix: 绝对不改变 billingMonth，只清空印量和发票金额
    setRows(prev => prev.map(r => ({ ...r, bwPages: 0, colorPages: 0 })));
    showMessage('success', '数据已清空（' + billingMonth + '）');
  }

  // ── v9.4: 部门名称强力清洗（去掉数字前缀和符号）──
  function cleanDeptName(raw: string): string {
    return raw
      .trim()
      .replace(/^[\d\s\.\-_、，。]+/, '') // 去开头数字/空格/符号: "1 鉴定" → "鉴定"
      .replace(/\s+/g, '')                   // 去所有内部空格: "品控 彩" → "品控彩"
      .trim();
  }

  // ── v9.4: 双向模糊匹配工具 ──
  function fuzzyMatchName(aiName: string, rowNames: string[]): string | null {
    // 先精确匹配
    if (rowNames.includes(aiName)) return aiName;
    // 双向 includes: AI名包含系统名 或 系统名包含AI名
    for (const rn of rowNames) {
      if (aiName.includes(rn) || rn.includes(aiName)) return rn;
    }
    return null;
  }

  // ── AI 视觉识别上传（v9.7 强校验计数 + 不可见空格清洗）──
  const handleOcrUpload = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/print/ocr', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success || !Array.isArray(json.items)) {
        showMessage('error', json.error || '识别失败，请重试', 5000);
        return;
      }
      const rawItems: { dept_name: string; bw_pages: number; color_pages: number }[] = json.items;
      console.log('📷 [OCR] AI 原始返回 (' + rawItems.length + ' 条):', rawItems);

      if (rawItems.length === 0) {
        console.warn('⚠️ [OCR] AI 返回空数组');
        showMessage('success', '🤖 AI 未识别到有效数据，请检查照片是否清晰', 5000);
        return;
      }

      // ── 第一步：强力清洗 → 别名映射 → 同名合并 ──
      const merged = new Map<string, { bw: number; color: number; aliases: string[] }>();
      const cleanedItems: { raw: string; cleaned: string; std: string; bw: number; color: number }[] = [];

      for (const item of rawItems) {
        const raw = (item.dept_name || '').trim();
        if (!raw) continue;
        const cleaned = cleanDeptName(raw);
        const stdName = deptAliasMap[cleaned] || cleaned;
        const bw = Number(item.bw_pages) || 0;
        const color = Number(item.color_pages) || 0;

        // v9.8: 不再过滤零值行 — 零值也是有效数据，必须填入表格清零对应部门

        cleanedItems.push({ raw, cleaned, std: stdName, bw, color });

        const entry = merged.get(stdName);
        if (entry) {
          entry.bw += bw;
          entry.color += color;
          if (raw !== stdName) entry.aliases.push(raw);
        } else {
          merged.set(stdName, { bw, color, aliases: raw !== stdName ? [raw] : [] });
        }
      }
      console.log('🧹 [OCR] 清洗后 (' + cleanedItems.length + ' 条):');
      cleanedItems.forEach(ci => console.log(`   ${ci.raw} → ${ci.std} [bw=${ci.bw}, color=${ci.color}]`));
      console.log('🔗 [OCR] 合并后 (' + merged.size + ' 项):',
        Array.from(merged.entries()).map(([k, v]) =>
          `${k}（bw=${v.bw}, color=${v.color}${v.aliases.length ? ' ← ' + v.aliases.join(',') : ''}）`
        ));

      // ── 第二步：离线精确匹配 + 模糊兜底（先计算，再 setRows）──
      // v9.7 fix: 不能在 setRows 回调里数 filled，React 18 批处理导致计数器始终为 0
      const remaining = new Map(merged);
      type MatchResult = { rowKey: string; bw: number; color: number };
      const matchMap = new Map<string, MatchResult>(); // rowKey → 匹配值
      const matchedLog: string[] = [];

      // 获取当前 rows 的快照（在 setRows 之外，确保是最新值）
      const rowSnapshot = rows.map(r => ({
        key: r.key,
        name: r.dept_name.trim().replace(/\s+/g, ''), // v9.7: 清洗不可见空格
      }));
      console.log('🔍 [OCR] 系统部门名:', rowSnapshot.map(r => r.name));

      for (const row of rowSnapshot) {
        // 精确匹配（用清洗后的名字）
        if (remaining.has(row.name)) {
          const e = remaining.get(row.name)!;
          matchMap.set(row.key, { rowKey: row.key, bw: e.bw, color: e.color });
          matchedLog.push(`${row.name}[精确]`);
          remaining.delete(row.name);
          continue;
        }
        // 精确：remaining 的 key 可能也含空格 → 双向清洗后比较
        let found = false;
        for (const [mk, mv] of remaining.entries()) {
          const cleanMk = mk.trim().replace(/\s+/g, '');
          if (cleanMk === row.name) {
            matchMap.set(row.key, { rowKey: row.key, bw: mv.bw, color: mv.color });
            matchedLog.push(`${mk}≈${row.name}[清洗精确]`);
            remaining.delete(mk);
            found = true;
            break;
          }
        }
        if (found) continue;
        // 模糊匹配兜底
        for (const [mk, mv] of remaining.entries()) {
          if (fuzzyMatchName(mk, [row.name])) {
            matchMap.set(row.key, { rowKey: row.key, bw: mv.bw, color: mv.color });
            matchedLog.push(`${mk}→${row.name}[模糊]`);
            remaining.delete(mk);
            found = true;
            break;
          }
        }
      }

      const filled = matchMap.size;
      console.log('✅ [OCR] 成功匹配 ' + filled + ' 个:', matchedLog);

      // 第三步：一次性 setRows（纯数据驱动，不依赖闭包计数器）
      // v10.2: 合并后强制清洗 — 空白输入框立刻变成 0
      const mergedRows = (filled > 0)
        ? rows.map(r => { const m = matchMap.get(r.key); return m ? { ...r, bwPages: m.bw, colorPages: m.color } : r; })
        : rows;
      // 强制映射：所有 bwPages / colorPages 转数字，null/undefined/NaN → 0
      const sanitized = mergedRows.map(r => ({
        ...r,
        bwPages: Number(r.bwPages) || 0,
        colorPages: Number(r.colorPages) || 0
      }));
      if (filled > 0 || sanitized.length !== rows.length) {
        setRows(sanitized);
      }

      // ── 第四步：Toast ──
      const unmatchedCount = remaining.size;
      if (unmatchedCount > 0) {
        Array.from(remaining.keys()).forEach(n => console.warn('  ⚠️ 未匹配部门:', n));
      }

      if (filled > 0) {
        showMessage('success',
          '🤖 成功填充 ' + filled + ' 个部门' +
          (unmatchedCount > 0 ? '，' + unmatchedCount + ' 个未匹配' : ''),
          5000
        );
      } else {
        showMessage('success', '🤖 识别了 ' + cleanedItems.length + ' 个部门，但均未匹配到系统', 5000);
      }
    } catch (err) {
      showMessage('error', '上传失败: ' + ((err as Error)?.message || '网络错误'), 5000);
    } finally {
      setOcrLoading(false);
    }
  }, [rows]);

  // ── v10.7: 发票金额 OCR — PDF 前端渲染为图片后发送 ──
  const handleInvoiceOcr = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setOcrInvoiceLoading(true);
    try {
      let imageBase64: string;

      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        // ── PDF：用 pdf.js 渲染第一页为 JPEG ──
        showMessage('success', '⏳ 正在解析 PDF 并提取金额...', 10000);
        console.log('📄 [Invoice-OCR] 前端渲染 PDF 第1页...');

        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;

          imageBase64 = canvas.toDataURL('image/jpeg', 0.85);
          console.log('✅ [Invoice-OCR] PDF 已渲染为 JPEG (', (imageBase64.length / 1024).toFixed(1), 'KB)');
        } catch (pdfErr) {
          console.error('❌ [Invoice-OCR] PDF 前端渲染失败:', pdfErr);
          setOcrInvoiceLoading(false);
          showMessage('error', '⚠️ 当前浏览器解析此 PDF 失败，请您用截图工具截取发票画面，保存为 JPG 图片后上传，效果一样好！', 8000);
          return;
        }
      } else {
        // ── 图片：直接读为 data URL ──
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        console.log('🖼️ [Invoice-OCR] 图片已读取 (', (imageBase64.length / 1024).toFixed(1), 'KB)');
      }

      // 发送 JSON（后端只接图片 base64）
      const res = await fetch('/api/print/ocr-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64 }),
      });

      const json = await res.json();
      if (json.success && typeof json.totalAmount === 'number') {
        setInvoiceTotal(String(json.totalAmount));
        showMessage('success', '🧾 已识别发票金额 ¥' + json.totalAmount, 5000);
      } else {
        showMessage('error', json.error || json.message || '发票识别失败，请手动输入', 5000);
      }
    } catch (err) {
      showMessage('error', '上传失败: ' + ((err as Error)?.message || '网络错误'), 5000);
    } finally {
      setOcrInvoiceLoading(false);
    }
  }, []);

  // react-dropzone 配置（v10.1: 双入口）
  // 左：打印账单 OCR（识别表格 → 填入印量）
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'], 'application/pdf': ['.pdf'] },
    maxSize: 5 * 1024 * 1024,
    onDrop: handleOcrUpload,
    disabled: ocrLoading,
  });
  // 右：发票 OCR（识别金额 → 填入总额）
  const { getRootProps: getInvoiceRootProps, getInputProps: getInvoiceInputProps, isDragActive: isInvoiceDragActive } = useDropzone({
    multiple: false,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'], 'application/pdf': ['.pdf'] },
    maxSize: 5 * 1024 * 1024,
    onDrop: handleInvoiceOcr,
    disabled: ocrInvoiceLoading,
  });

  // ── 保存本期账单 ──
  async function saveRecord() {
    if (invoiceVal <= 0) return showMessage('error', '请先输入本次发票总额');
    if (rows.length === 0) return showMessage('error', '无部门数据');
    setSaving(true);
    try {
      // v10.1: 强制清洗 — 确保 bwPages/colorPages 为有效数字，防止脏数据持久化
      const sanitizedRows = rows.map(r => ({
        ...r,
        bwPages: Number(r.bwPages) || 0,
        colorPages: Number(r.colorPages) || 0
      }));
      const sanitized = calculateAllocation(sanitizedRows, invoiceVal);
      const res = await fetch('/api/print/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_month: billingMonth,
          invoice_total: invoiceVal,
          total_bw_pages: sanitized.summary.totalBw,
          total_color_pages: sanitized.summary.totalColor,
          total_pages: sanitized.summary.totalPages,
          bw_total_fee: sanitized.summary.bwTotalFee,
          color_fee: sanitized.summary.colorTotalFee,
          secret_fee: sanitized.summary.secretFee,
          theoretical_total: sanitized.summary.theoreticalTotal,
          difference: sanitized.summary.difference,
          items: sanitized.results.map(r => ({
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
        localStorage.removeItem(getDraftKey(billingMonth));
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

  // ── 保存草稿到数据库 ──
  async function saveDraft() {
    if (rows.length === 0) return showMessage('error', '无部门数据可保存');
    setDrafting(true);
    try {
      // v10.1: 强制清洗
      const sanitizedRows = rows.map(r => ({
        ...r,
        bwPages: Number(r.bwPages) || 0,
        colorPages: Number(r.colorPages) || 0
      }));
      const sanitized = calculateAllocation(sanitizedRows, invoiceVal);
      const res = await fetch('/api/print/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'draft',
          billing_month: billingMonth,
          invoice_total: invoiceVal,
          total_bw_pages: sanitized.summary.totalBw,
          total_color_pages: sanitized.summary.totalColor,
          total_pages: sanitized.summary.totalPages,
          bw_total_fee: sanitized.summary.bwTotalFee,
          color_fee: sanitized.summary.colorTotalFee,
          secret_fee: sanitized.summary.secretFee,
          theoretical_total: sanitized.summary.theoreticalTotal,
          difference: sanitized.summary.difference,
          items: sanitized.results.map(r => ({
            dept_name: r.dept_name, bw_pages: r.bwPages, color_pages: r.colorPages,
            total_pages: r.totalPages, bw_fee_share: r.bwFeeShare, color_fee: r.colorFee,
            secret_fee_share: r.secretFeeShare, difference_share: r.differenceShare,
            actual_fee: r.actualFee, machine_location: r.machine_location,
            machine_number: r.machine_number, sort_order: 0,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        showMessage('success', '☁️ 草稿已保存至云端（' + billingMonth + '）');
      } else {
        showMessage('error', '保存草稿失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      showMessage('error', '保存草稿失败: ' + err.message);
    } finally {
      setDrafting(false);
    }
  }

  // ── 作废整月账单（v7.5: 先查后删，智能防呆）
  async function deleteMonthRecord() {
    setDeleting(true);
    try {
      // 第 1 步：先查询该月是否有账单
      const checkRes = await fetch('/api/print/records/check?month=' + encodeURIComponent(billingMonth));
      const checkJson = await checkRes.json();

      if (!checkJson.success || !checkJson.found) {
        // 该月没有账单，直接提示
        showMessage('error', '📭 ' + billingMonth + ' 没有任何已保存的账单，无需作废');
        setDeleting(false);
        return;
      }

      const { record, items } = checkJson;
      const deptCount = items?.length || 0;
      const confirmMsg = '⚠️ 确定要彻底删除 ' + billingMonth + ' 的账单吗？\n\n' +
        '📋 发票总额：¥' + (record.invoice_total || 0) + '\n' +
        '🏢 部门数量：' + deptCount + ' 个\n\n' +
        '该操作不可逆，删除后所有分摊明细将被清空！';

      if (!window.confirm(confirmMsg)) {
        setDeleting(false);
        return;
      }

      // 第 2 步：确认后执行删除
      const res = await fetch('/api/print/records/month/' + encodeURIComponent(billingMonth), {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        // 清空当前页面数据并重新加载部门模板
        localStorage.removeItem(getDraftKey(billingMonth));
        setInvoiceTotal('');
        setRows([]);
        showMessage('success', '🗑️ ' + billingMonth + ' 账单已彻底删除（共 ' + (json.deleted || 0) + ' 条）');
        // 重置 hadDataRef 避免阻止后续保存
        hadDataRef.current = false;
        loadDepartments();
      } else {
        showMessage('error', '作废失败: ' + (json.error || '未知错误'));
      }
    } catch (err: any) {
      showMessage('error', '作废操作失败: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  // ── 导出 Excel ──
  const exportExcel = useCallback(() => {
    if (rows.length === 0) return showMessage('error', '无数据可导出');
    if (invoiceVal <= 0) return showMessage('error', '请先输入本次发票总额');

    // v10.1: 强制清洗 — 确保 bwPages/colorPages 为有效数字
    const sanitizedRows = rows.map(r => ({
      ...r,
      bwPages: Number(r.bwPages) || 0,
      colorPages: Number(r.colorPages) || 0
    }));
    const sanitized = calculateAllocation(sanitizedRows, invoiceVal);
    const { results: sanitizedResults, summary: sanitizedSummary } = sanitized;

    const bwInRange = Math.min(sanitizedSummary.totalBw, 10000);
    const bwExcess   = Math.max(sanitizedSummary.totalBw - 10000, 0);
    const excessAndColorFee = round2(bwExcess * 0.07 + sanitizedSummary.colorTotalFee);
    const baseFee900 = round2((bwInRange > 0 ? 800 : 0) + 100); // 黑白基础 + 机密

    // ── 数据区 ──
    const sheetData: any[][] = [
      ['序号', '部门', '印量/张', '彩/张', '费用（元）', '机器所在地', '机器编号'],
    ];

    sanitizedResults.forEach((r, i) => {
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

    const desc2 = `说明2：实际费用¥${sanitizedSummary.invoiceTotal}，（实际印量${sanitizedSummary.totalPages}张，超出${sanitizedSummary.totalBw - 10000 > 0 ? sanitizedSummary.totalBw - 10000 : 0}张，基础费用¥${baseFee900}（含机密打印100元），超出及彩色部分¥${excessAndColorFee}。黑白1万张以内0.08元/页，超出0.07元/页。彩色0.7元/页。）`;
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
  }, [rows, invoiceVal]);

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
          <p className="text-xs text-slate-500">部门印量管理 · 阶梯计价 · 抹零分摊
            <span className="ml-2 text-[11px] text-amber-600 font-mono font-semibold select-all bg-amber-50 px-1.5 py-0.5 rounded">{BUILD_VER}</span>
          </p>
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
        {/* 账期月份 */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700 whitespace-nowrap">账期月份</label>
          <input
            type="month"
            value={billingMonth}
            onChange={e => setBillingMonth(e.target.value)}
            className="w-36 bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
          />
        </div>

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
          onClick={saveDraft}
          disabled={drafting || rows.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {drafting ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          保存草稿
        </button>

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

        <button
          onClick={deleteMonthRecord}
          disabled={deleting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 bg-white text-red-500 text-sm font-medium hover:bg-red-50 hover:border-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="彻底删除该月的所有账单数据"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
          作废本月账单
        </button>
      </div>

      {/* ── v10.1: 双入口 AI 上传区 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* 左：上传打印账单 → OCR 识别表格，填入印量 */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl px-6 py-7 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-400 bg-blue-50/50'
              : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
          } ${ocrLoading ? 'cursor-wait opacity-80' : ''}`}
        >
          <input {...getInputProps()} />
          {ocrLoading ? (
            <div className="flex items-center justify-center gap-2 text-slate-500">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">🤖 AI 正在深度识别表格...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-2xl">📄</span>
              <span className="text-sm font-semibold text-slate-700">上传打印账单</span>
              <span className="text-xs text-slate-400">AI 识别表格，自动填入部门印量</span>
              <span className="text-xs text-slate-400">JPG / PNG / PDF，最大 5MB</span>
            </div>
          )}
        </div>

        {/* 右：上传发票 → OCR 识别金额，填入总额 */}
        <div
          {...getInvoiceRootProps()}
          className={`border-2 border-dashed rounded-xl px-6 py-7 text-center cursor-pointer transition-colors ${
            isInvoiceDragActive
              ? 'border-emerald-400 bg-emerald-50/50'
              : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
          } ${ocrInvoiceLoading ? 'cursor-wait opacity-80' : ''}`}
        >
          <input {...getInvoiceInputProps()} />
          {ocrInvoiceLoading ? (
            <div className="flex items-center justify-center gap-2 text-slate-500">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">🤖 AI 正在识别发票金额...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-2xl">🧾</span>
              <span className="text-sm font-semibold text-slate-700">上传发票提取金额</span>
              <span className="text-xs text-slate-400">AI 识别发票，自动填入总额</span>
              <span className="text-xs text-slate-400">JPG / PNG / PDF，最大 5MB</span>
            </div>
          )}
        </div>
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
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">黑白印量</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">彩色印量</th>
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
                            value={r.bwPages}
                            onChange={e => updatePages(r.key, 'bwPages', e.target.value)}
                            className="min-w-[80px] w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min="0"
                            value={r.colorPages}
                            onChange={e => updatePages(r.key, 'colorPages', e.target.value)}
                            className="min-w-[80px] w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
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
                      ref={deptNameInputRef}
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
                      onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
                      placeholder="机器所在地"
                      className="w-28 bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-400/20 transition-colors"
                    />
                    <input
                      type="text"
                      value={newNumber}
                      onChange={e => setNewNumber(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
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
                    <button
                      onClick={saveDeptTemplate}
                      disabled={savingDepts || rows.length === 0}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title="将当前部门列表永久保存到数据库，以后打开页面自动加载"
                    >
                      {savingDepts ? <Loader2 className="size-4 animate-spin" /> : <Database size={15} />}
                      保存为常用部门
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