/**
 * v17.1.1: 知识库旧数据批量向量化脚本（限流 200ms/篇 + 失败不中断）
 *
 * 用途：将 kb_documents 中"已入库"但尚未向量化的旧文档逐篇重新向量化。
 *
 * 使用方法：
 *   1. 确保后端正在运行
 *   2. 在项目根目录执行：node server/batch-vectorize.js
 *   3. 脚本会依次对每篇已入库文档调用 POST /api/kb/{id}/vectorize
 *
 * 前置条件：
 *   - server/.env 中已配置 DASHSCOPE_API_KEY、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
 *   - 前端 dev server 可选（此脚本直接调用后端 Express 接口）
 */

const https = require('https');
const http = require('http');
const path = require('path');

// 加载 server/.env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_PORT = process.env.PORT || 3001;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，请检查 server/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * 调用后端 /api/kb/:id/vectorize
 */
function callVectorize(docId) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:${BACKEND_PORT}/api/kb/${docId}/vectorize`;

    // 使用 dev-mock-token 绕过后端鉴权
    const options = {
      method: 'POST',
      headers: {
        'Cookie': 'token=dev-mock-token',
        'Content-Type': 'application/json',
        'Content-Length': '0',
      },
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.success) {
            resolve(json.data);
          } else {
            const errDetail = json.error || '未知错误';
            const errDetails = json.details || '';
            reject(new Error(errDetail + (errDetails ? ' | ' + errDetails : '')));
          }
        } catch (e) {
          reject(new Error('JSON 解析失败: ' + body.slice(0, 300)));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('🚀 v17.1.4 批量向量化脚本启动\n');

  // 1. 查询所有"已入库"文档（按 vectorize_status 判断是否已向量化）
  const { data: docs, error } = await supabase
    .from('kb_documents')
    .select('id, file_name, status, vectorize_status')
    .eq('status', '已入库')
    .order('id', { ascending: true });

  if (error) {
    console.error('❌ 查询文档失败:', error.message);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log('📭 没有已入库的文档，无需处理。');
    process.exit(0);
  }

  // 筛选出尚未向量化的（vectorize_status 不是 'done'）
  const pending = docs.filter(d => d.vectorize_status !== 'done');
  const alreadyVec = docs.filter(d => d.vectorize_status === 'done');

  console.log(`📊 已入库文档: ${docs.length} 篇`);
  console.log(`   ✅ 已向量化: ${alreadyVec.length} 篇`);
  console.log(`   ⏳ 待向量化: ${pending.length} 篇\n`);

  if (pending.length === 0) {
    console.log('🎉 所有文档已完成向量化！');
    process.exit(0);
  }

  // 2. 逐篇调用向量化
  let success = 0;
  let failed = 0;
  const failedList = [];

  for (let i = 0; i < pending.length; i++) {
    const doc = pending[i];
    const label = `[${i + 1}/${pending.length}] ${doc.file_name}`;
    process.stdout.write(`\r🔄 ${label} ... `);
    try {
      const result = await callVectorize(doc.id);
      console.log(`\r✅ ${label} → ${result.inserted} 切片`);
      success++;
    } catch (err) {
      console.log(`\r❌ ${label} → ${err.message}`);
      failed++;
      failedList.push({ id: doc.id, name: doc.file_name, error: err.message });
    }
    // v17.1.1: 200ms 限流，防止触发 Embedding API QPS 限制
    if (i < pending.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 3. 汇总
  console.log('\n═══════════════════════════════════');
  console.log(`✅ 成功: ${success} 篇`);
  console.log(`❌ 失败: ${failed} 篇`);
  if (failedList.length > 0) {
    console.log('\n失败列表:');
    failedList.forEach(f => console.log(`  · ${f.name} — ${f.error}`));
  }
  console.log('═══════════════════════════════════');
  console.log('💡 提示：向量化后的文档即可在"智能问答"中被检索到。');
  process.exit(failed > 0 ? 1 : 0);
}

main();