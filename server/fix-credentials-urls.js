/**
 * fix-credentials-urls.js — 终极修复版
 *
 * 本版不做任何过滤/降级，直接查出全部 11 条记录，逐条构造
 * 正确的 Storage 公开 URL 并强行写回。
 *
 * 关键：getPublicUrl 返回 { data: { publicUrl: 'https://...' } }
 *       必须解构 data.publicUrl 拿到字符串。
 *
 * 用法：
 *   node server/fix-credentials-urls.js
 */

const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// ── 加载 .env ──
const envPath = path.resolve(__dirname, '.env');
const parsed = dotenv.config({ path: envPath });
if (parsed.error) {
  console.error('❌ 加载 .env 失败:', parsed.error.message);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET = 'site_images';

// ═══════════════════════════════════════════════════════════════════
//  全部 11 条证书定义（严格按 sort_order 匹配，不做过滤）
// ═══════════════════════════════════════════════════════════════════

const ALL_CERTS = [
  { file: 'system-1.jpg', category: '体系认证', sort_order: 0 },
  { file: 'system-2.jpg', category: '体系认证', sort_order: 1 },
  { file: 'system-3.jpg', category: '体系认证', sort_order: 2 },
  { file: 'cert-1.png',  category: '企业资质', sort_order: 0 },
  { file: 'cert-2.jpg',  category: '企业资质', sort_order: 1 },
  { file: 'cert-3.jpg',  category: '企业资质', sort_order: 2 },
  { file: 'cert-4.jpg',  category: '企业资质', sort_order: 3 },
  { file: 'cert-5.jpg',  category: '企业资质', sort_order: 4 },
  { file: 'cert-6.jpg',  category: '企业资质', sort_order: 5 },
  { file: 'cert-7.jpg',  category: '企业资质', sort_order: 6 },
  { file: 'cert-8.jpg',  category: '企业资质', sort_order: 7 },
];

// ═══════════════════════════════════════════════════════════════════
//  构造 Storage 公开 URL — 严格解构 data.publicUrl
// ═══════════════════════════════════════════════════════════════════

function buildPublicUrl(remotePath) {
  // getPublicUrl 返回 { data: { publicUrl: 'https://...' } }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(remotePath);
  return data.publicUrl;
}

// ═══════════════════════════════════════════════════════════════════
//  主流程：查全部 → 逐条强更 → 验证
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('🔧 fix-credentials-urls.js — 终极修复\n');
  console.log('═'.repeat(55));

  // 查出全部记录（不做任何过滤）
  const { data: allRows, error: queryErr } = await supabase
    .from('site_credentials')
    .select('id, category, sort_order')
    .order('sort_order');

  if (queryErr) {
    console.error('❌ 查询失败:', queryErr.message);
    process.exit(1);
  }

  console.log(`\n📋 查出 ${allRows.length} 条记录，准备全部强更\n`);

  let ok = 0;
  let fail = 0;

  for (const row of allRows) {
    // 在映射表中精准匹配
    const def = ALL_CERTS.find(
      d => d.category === row.category && d.sort_order === row.sort_order
    );

    if (!def) {
      console.log(`   ⚠️  id=${row.id} [${row.category}] sort=${row.sort_order} — 无匹配定义，跳过`);
      fail++;
      continue;
    }

    // 构造远程路径
    const ext = path.extname(def.file);
    const basename = path.basename(def.file, ext);
    const remoteName = `migration/credentials/${basename}${ext}`;

    // ⚠️ 核心：正确解构 data.publicUrl
    const url = buildPublicUrl(remoteName);

    // ── 写入前打印 ──
    console.log(`   📝 id=${row.id} [${row.category}] sort=${row.sort_order}`);
    console.log(`      → ${url}`);

    // 防御：如果不是 https 字符串就报错跳过
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      console.log(`      ❌ URL 非法 (typeof=${typeof url}, value="${url}")，跳过写入\n`);
      fail++;
      continue;
    }

    // 写入数据库
    const { error: updateErr } = await supabase
      .from('site_credentials')
      .update({ image_url: url })
      .eq('id', row.id);

    if (updateErr) {
      console.log(`      ❌ 写入失败: ${updateErr.message}\n`);
      fail++;
    } else {
      console.log(`      ✅ 已写入\n`);
      ok++;
    }
  }

  // ── 验证 ──
  console.log('═'.repeat(55));
  console.log(`📊 强更完成: ✅ ${ok}  ❌ ${fail}`);
  console.log('═'.repeat(55));
  console.log('');

  await verify();

  if (fail > 0) process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
//  验证：逐条打印 image_url，确保全是 https:// 开头
// ═══════════════════════════════════════════════════════════════════

async function verify() {
  console.log('📊 最终验证 — 逐条打印 image_url:\n');

  const { data: rows } = await supabase
    .from('site_credentials')
    .select('id, category, sort_order, image_url')
    .order('sort_order');

  if (!rows || rows.length === 0) {
    console.log('   ⚠️  表为空\n');
    return;
  }

  let good = 0;
  let bad = 0;

  for (const r of rows) {
    const isOk = typeof r.image_url === 'string' && r.image_url.startsWith('https://');
    if (isOk) {
      good++;
      console.log(`   ✅ [${r.category}] sort=${r.sort_order}  →  ${r.image_url}`);
    } else {
      bad++;
      console.log(`   ❌ [${r.category}] sort=${r.sort_order}  →  "${r.image_url}"  ← 非法值`);
    }
  }

  console.log(`\n   合法: ${good}/${rows.length}  |  异常: ${bad}/${rows.length}`);
  console.log(bad === 0 ? '✅ 全部通过\n' : '⚠️  仍有异常\n');
}

main().catch(err => {
  console.error('\n❌ 脚本异常:', err.message);
  process.exit(1);
});