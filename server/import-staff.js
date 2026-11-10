// ============================================================
// import-staff.js — 从 Excel 导入人员资质到 Supabase
// 用法: node server/import-staff.js
// ============================================================
const path = require('path');
const dotenv = require('dotenv');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// -------------------------------------------------------
// 1. 加载 .env 配置
// -------------------------------------------------------
const envPath = path.join(__dirname, '.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('❌ 加载 .env 失败:', result.error.message);
  process.exit(1);
}
console.log('✅ .env 加载成功');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_KEY 环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase 客户端已创建');
console.log(`   URL: ${supabaseUrl}`);

// -------------------------------------------------------
// 2. Excel 列名映射
// -------------------------------------------------------
const COLUMN_MAP = {
  '姓名':      'name',
  '证书类型':  'cert_type',
  '学历':      'education',
  '职称':      'title',
  '人员状态':  'status',
  '证书状态':  'cert_status',
  '证书有效期':'cert_expire_date',
  '证书专业':  'cert_major',
  '注册专业':  'register_major',
};

// -------------------------------------------------------
// 3. 读取 Excel
// -------------------------------------------------------
function readExcel(filePath) {
  console.log(`\n📋 正在读取 Excel: ${filePath}`);
  if (!require('fs').existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  console.log(`📋 Sheet: "${sheetName}", 共 ${wb.SheetNames.length} 个 sheet`);

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
  if (!rows || rows.length < 2) {
    console.error('❌ Excel 至少需要表头+1 行数据');
    process.exit(1);
  }

  const headers = rows[0];
  console.log(`📋 表头字段 (${headers.length} 列):`, headers.filter(Boolean).join(', '));

  // 建立列名 → 列索引映射
  const headerIndex = {};
  headers.forEach((h, i) => {
    if (h && COLUMN_MAP[h]) {
      headerIndex[COLUMN_MAP[h]] = i;
    }
  });

  console.log('📋 映射关系:');
  Object.entries(headerIndex).forEach(([dbCol, idx]) => {
    console.log(`   Excel[${idx}] → ${dbCol}`);
  });

  // 从第 1 行开始读取数据
  const dataRows = rows.slice(1).filter(row => {
    // 跳过全空行
    return row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
  });

  const records = dataRows.map((row, rowIdx) => {
    const record = {};
    Object.entries(headerIndex).forEach(([dbCol, idx]) => {
      const raw = row[idx];
      // 转为字符串并 trim，null/undefined → ''
      record[dbCol] = raw !== null && raw !== undefined ? String(raw).trim() : '';
    });
    return record;
  });

  console.log(`✅ 读取完成: ${records.length} 条有效记录`);
  return records;
}

// -------------------------------------------------------
// 4. 查询已存在的记录（用于去重）
// -------------------------------------------------------
async function getExistingRecords() {
  console.log('\n📋 查询 Supabase 已有记录...');
  const { data, error } = await supabase
    .from('staff_qualifications')
    .select('id, name, cert_type, cert_major');

  if (error) {
    console.error('❌ 查询已有记录失败:', error.message);
    throw error;
  }

  // 用 name+cert_type+cert_major 拼接作为唯一键
  const existing = new Set();
  (data || []).forEach(r => {
    const key = `${r.name}|||${r.cert_type}|||${r.cert_major}`;
    existing.add(key);
  });

  console.log(`✅ 已有 ${existing.size} 条记录`);
  return existing;
}

// -------------------------------------------------------
// 5. 批量插入
// -------------------------------------------------------
async function batchInsert(records, existingKeys) {
  // 去重
  const newRecords = records.filter(r => {
    const key = `${r.name}|||${r.cert_type}|||${r.cert_major || ''}`;
    return !existingKeys.has(key);
  });

  const skippedCount = records.length - newRecords.length;

  console.log('\n📋 去重结果:');
  console.log(`   Excel 总记录: ${records.length}`);
  console.log(`   跳过(已存在): ${skippedCount}`);
  console.log(`   待插入新记录: ${newRecords.length}`);

  if (newRecords.length === 0) {
    console.log('✅ 无新记录需要插入，全部已存在');
    return { inserted: 0, skipped: skippedCount, errors: 0 };
  }

  // 分批插入（每批 20 条）
  const BATCH_SIZE = 20;
  let insertedTotal = 0;
  let errorTotal = 0;
  const totalBatches = Math.ceil(newRecords.length / BATCH_SIZE);

  for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = newRecords.slice(i, i + BATCH_SIZE);

    process.stdout.write(`📋 正在插入第 ${batchNum}/${totalBatches} 批 (${batch.length} 条)... `);

    const { data, error } = await supabase
      .from('staff_qualifications')
      .insert(batch)
      .select('id');

    if (error) {
      console.log('❌ 失败');
      console.error(`   错误: ${error.message}`);

      // 逐条重试，找出哪条有问题
      for (let j = 0; j < batch.length; j++) {
        const { error: singleError } = await supabase
          .from('staff_qualifications')
          .insert(batch[j])
          .select('id');

        if (singleError) {
          errorTotal++;
          console.error(`   ❌ 单条失败 [${batch[j].name}]: ${singleError.message}`);
        } else {
          insertedTotal++;
        }
      }
    } else {
      const count = (data || []).length;
      insertedTotal += count;
      console.log(`✅ 成功 (${count} 条)`);
    }
  }

  return { inserted: insertedTotal, skipped: skippedCount, errors: errorTotal };
}

// -------------------------------------------------------
// 6. 主流程
// -------------------------------------------------------
async function main() {
  console.log('========================================');
  console.log('  人员资质数据导入 — import-staff.js');
  console.log('========================================');

  const startTime = Date.now();

  try {
    // 读取 Excel
    const excelPath = path.join(__dirname, '..', 'result_final_clean.xlsx');
    const records = readExcel(excelPath);

    // 打印前 3 条预览
    console.log('\n📋 数据预览（前 3 条）:');
    records.slice(0, 3).forEach((r, i) => {
      console.log(`   [${i + 1}] name="${r.name}", cert_type="${r.cert_type}", title="${r.title}", status="${r.status}"`);
    });

    // 获取已有记录
    const existingKeys = await getExistingRecords();

    // 批量插入
    const { inserted, skipped, errors } = await batchInsert(records, existingKeys);

    // 校验最终数量
    const { count, error: countError } = await supabase
      .from('staff_qualifications')
      .select('*', { count: 'exact', head: true });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n========================================');
    console.log('  导入完成');
    console.log('========================================');
    console.log(`  耗时: ${elapsed}s`);
    console.log(`  新增: ${inserted} 条`);
    console.log(`  跳过: ${skipped} 条（已存在）`);
    if (errors > 0) console.log(`  失败: ${errors} 条`);

    if (!countError) {
      console.log(`  数据库总记录: ${count} 条`);
    }

    console.log('========================================\n');
  } catch (err) {
    console.error('\n❌ 导入流程异常:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();