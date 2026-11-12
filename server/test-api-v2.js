/**
 * API 测试脚本 v2 — 验证官网 CMS 核心接口是否正常
 *
 * 用法：
 *   node server/test-api-v2.js
 *
 * 测试内容：
 *   1. site_texts GET 单条 + PUT Upsert（含 big_title/sub_title/cover_image）
 *   2. site_team GET 列表
 *   3. site_credentials GET 列表
 *
 * 前置条件：服务已启动（npm start 或等效）
 */

const http = require('http');
const https = require('https');

const BASE = 'http://localhost:3000';

// 如需跳过登录验证，可在服务端临时注释 authMiddleware，或先登录获取 cookie
const SKIP_AUTH = process.env.SKIP_AUTH === '1';
const COOKIE = process.env.COOKIE || '';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(COOKIE ? { Cookie: COOKIE } : {}),
      },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  function check(label, condition, detail = '') {
    if (condition) {
      passed++;
      results.push(`  ✅ ${label}`);
    } else {
      failed++;
      results.push(`  ❌ ${label}  ${detail}`);
    }
  }

  function skip(label, reason) {
    skipped++;
    results.push(`  ⏭️  ${label} (${reason})`);
  }

  console.log('🧪 API 测试 — 森宇官网 CMS 核心接口');
  console.log('═'.repeat(60));
  console.log(`   BASE: ${BASE}`);
  console.log(`   SKIP_AUTH: ${SKIP_AUTH}`);
  console.log(`   COOKIE: ${COOKIE ? '已设置' : '(空 — 可能需要登录)'}`);
  console.log('═'.repeat(60));

  // ── 测试 1: site_texts GET ──
  console.log('\n📝 测试 1: GET /api/site/texts?page_key=about_intro');
  try {
    const r1 = await request('GET', '/api/site/texts?page_key=about_intro');
    if (r1.status === 401) {
      skip('GET site_texts', '需要登录，请先获取 Cookie 后设置 COOKIE 环境变量');
    } else {
      check('HTTP 200', r1.status === 200, `实际: ${r1.status}`);
      check('success=true', r1.body.success === true, `实际: ${JSON.stringify(r1.body).slice(0, 100)}`);
      check('data 包含 page_key', r1.body.data && r1.body.data.page_key === 'about_intro');
      check('data 包含 content', r1.body.data && typeof r1.body.data.content === 'string');
      // v2 新增字段检查
      const d = r1.body.data || {};
      console.log(`     📊 big_title="${d.big_title || '(空)'}" sub_title="${d.sub_title || '(空)'}" cover_image=${d.cover_image ? '有值' : '(空)'}`);
    }
  } catch (err) {
    failed++;
    results.push(`  ❌ GET site_texts 网络错误: ${err.message}`);
  }

  // ── 测试 2: site_texts GET about_history ──
  console.log('\n📝 测试 2: GET /api/site/texts?page_key=about_history');
  try {
    const r2 = await request('GET', '/api/site/texts?page_key=about_history');
    if (r2.status === 401) {
      skip('GET about_history', '需要登录');
    } else {
      check('HTTP 200 或 200+null', r2.status === 200, `实际: ${r2.status}`);
      if (r2.body.success && r2.body.data) {
        check('about_history 已迁移', true);
        console.log(`     📊 content=${r2.body.data.content?.length || 0} chars, big_title="${r2.body.data.big_title || ''}"`);
      } else {
        console.log(`     ⚠️  about_history 尚未迁移（请先执行 migrate-v2-schema.sql）`);
        check('about_history 已迁移（skip if not migrated）', r2.body.data !== null, `${JSON.stringify(r2.body).slice(0, 80)}`);
      }
    }
  } catch (err) {
    failed++;
    results.push(`  ❌ GET about_history 网络错误: ${err.message}`);
  }

  // ── 测试 3: site_texts PUT（更新 big_title） ──
  console.log('\n📝 测试 3: PUT /api/site/texts/about_intro (更新大标题)');
  try {
    const r3 = await request('PUT', '/api/site/texts/about_intro', {
      content: '测试正文（由自动化测试写入）',
      big_title: '集团简介（测试）',
      sub_title: '测试副标题',
    });
    if (r3.status === 401) {
      skip('PUT site_texts', '需要登录');
    } else {
      check('HTTP 200', r3.status === 200, `实际: ${r3.status}`);
      check('success=true', r3.body.success === true, `实际: ${JSON.stringify(r3.body).slice(0, 100)}`);
      check('big_title 已保存', r3.body.data && r3.body.data.big_title === '集团简介（测试）',
        `实际 big_title="${r3.body.data?.big_title}"`);
      check('sub_title 已保存', r3.body.data && r3.body.data.sub_title === '测试副标题');
    }
  } catch (err) {
    failed++;
    results.push(`  ❌ PUT site_texts 网络错误: ${err.message}`);
  }

  // ── 测试 4: site_team GET ──
  console.log('\n📝 测试 4: GET /api/site/team');
  try {
    const r4 = await request('GET', '/api/site/team');
    if (r4.status === 401) {
      skip('GET site_team', '需要登录');
    } else {
      check('HTTP 200', r4.status === 200, `实际: ${r4.status}`);
      check('success=true', r4.body.success === true);
      check('返回数组', Array.isArray(r4.body.data));
      const teamCount = r4.body.data?.length || 0;
      console.log(`     📊 团队成员: ${teamCount} 条`);
      if (teamCount > 0) {
        const xu = r4.body.data.find(m => m.name === '徐钢');
        check('徐钢已迁移', !!xu, xu ? `titles=${xu.titles?.length} bio=${xu.bio?.length || 0}chars avatar=${xu.avatar ? '✅' : '❌'}` : '');
      }
    }
  } catch (err) {
    failed++;
    results.push(`  ❌ GET site_team 网络错误: ${err.message}`);
  }

  // ── 测试 5: site_credentials GET ──
  console.log('\n📝 测试 5: GET /api/site/credentials?category=体系认证');
  try {
    const r5 = await request('GET', '/api/site/credentials?category=体系认证');
    if (r5.status === 401) {
      skip('GET site_credentials', '需要登录');
    } else {
      check('HTTP 200', r5.status === 200, `实际: ${r5.status}`);
      check('success=true', r5.body.success === true);
      check('返回数组', Array.isArray(r5.body.data));
      console.log(`     📊 体系认证: ${r5.body.data?.length || 0} 条`);
    }
  } catch (err) {
    failed++;
    results.push(`  ❌ GET site_credentials 网络错误: ${err.message}`);
  }

  // ── 测试 6: site_credentials GET 企业资质 ──
  console.log('\n📝 测试 6: GET /api/site/credentials?category=企业资质');
  try {
    const r6 = await request('GET', '/api/site/credentials?category=企业资质');
    if (r6.status === 401) {
      skip('GET site_credentials(企业资质)', '需要登录');
    } else {
      check('HTTP 200', r6.status === 200, `实际: ${r6.status}`);
      check('返回数组', Array.isArray(r6.body.data));
      console.log(`     📊 企业资质: ${r6.body.data?.length || 0} 条`);
    }
  } catch (err) {
    failed++;
    results.push(`  ❌ GET site_credentials(企业资质) 网络错误: ${err.message}`);
  }

  // ── 汇总 ──
  console.log('\n' + '═'.repeat(60));
  console.log('📊 测试汇总');
  console.log('═'.repeat(60));
  results.forEach(line => console.log(line));
  console.log(`\n  通过: ${passed}  |  失败: ${failed}  |  跳过: ${skipped}`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n⚠️  部分测试失败。常见原因:');
    console.log('   1. 未登录 — 请先登录服务获取 Cookie，通过 COOKIE 环境变量传入');
    console.log('   2. 未执行 SQL 迁移 — 请先在 Supabase SQL Editor 中执行 migrate-v2-schema.sql');
    console.log('   3. 服务未启动 — 请先 npm start');
    process.exit(1);
  } else {
    console.log('\n✅ 所有可执行测试通过！');
    process.exit(0);
  }
}

run();