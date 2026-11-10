/**
 * export-dingtalk-users.js
 *
 * 连接钉钉开放平台，递归获取所有部门下的员工列表，
 * 提取「姓名」「userId」「unionId」，输出为多种格式。
 *
 * 用法：
 *   cd server
 *   node export-dingtalk-users.js
 *
 * 输出：
 *   1. console.table 打印列表
 *   2. 可直接复制的 ALLOWED_USERS_MANAGER 白名单数组
 *   3. server/dingtalk_users.csv 文件
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const dotenv = require('dotenv');

// ============================================================
// 加载环境变量
// ============================================================
const envPath = path.join(__dirname, '.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.error('❌ 无法加载 .env 文件，请确认 server/.env 存在');
  process.exit(1);
}

// 优先从命令行参数读取，其次从环境变量读取
const DINGTALK_APP_KEY = process.argv[2] || process.env.DINGTALK_APP_KEY || '';
const DINGTALK_APP_SECRET = process.argv[3] || process.env.DINGTALK_APP_SECRET || '';
if (!DINGTALK_APP_KEY || !DINGTALK_APP_SECRET) {
  console.error('❌ 缺少 DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET');
  console.error('   用法: node export-dingtalk-users.js <AppKey> <AppSecret>');
  console.error('   或设置环境变量 DINGTALK_APP_KEY / DINGTALK_APP_SECRET');
  process.exit(1);
}

// ============================================================
// 获取 Access Token
// ============================================================
async function getAccessToken() {
  console.log('📋 正在获取钉钉 Access Token...');
  try {
    const resp = await axios.get('https://oapi.dingtalk.com/gettoken', {
      params: { appkey: DINGTALK_APP_KEY, appsecret: DINGTALK_APP_SECRET },
    });
    if (resp.data.errcode === 0) {
      console.log(`✅ Access Token 获取成功，有效期 ${resp.data.expires_in}s`);
      return resp.data.access_token;
    } else {
      console.error('❌ 获取 Token 失败:', resp.data);
      return null;
    }
  } catch (err) {
    console.error('❌ 获取 Token 异常:', err.message);
    return null;
  }
}

// ============================================================
// 递归获取所有子部门 ID
// ============================================================
async function getAllDepartmentIds(accessToken, parentDeptId) {
  const allDeptIds = [parentDeptId]; // 包含自身
  try {
    console.log(`📋 获取部门 ${parentDeptId} 的下级部门...`);
    const resp = await axios.post(
      'https://oapi.dingtalk.com/topapi/v2/department/listsub',
      { dept_id: parentDeptId },
      { params: { access_token: accessToken }, headers: { 'Content-Type': 'application/json' } }
    );
    if (resp.data.errcode === 0 && resp.data.result) {
      const children = resp.data.result;
      console.log(`  └─ 子部门 ${children.length} 个`);
      for (const dept of children) {
        const nested = await getAllDepartmentIds(accessToken, dept.dept_id);
        allDeptIds.push(...nested);
      }
    } else {
      console.warn(`  ⚠️ 部门 ${parentDeptId} 无下级或获取失败:`, resp.data.errmsg || '');
    }
  } catch (err) {
    console.warn(`⚠️ 获取部门 ${parentDeptId} 子部门异常: ${err.message}`);
  }
  return allDeptIds;
}

// ============================================================
// 获取部门下所有成员（分页）
// ============================================================
async function getMembersForDept(accessToken, deptId, memberMap) {
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const resp = await axios.post(
        'https://oapi.dingtalk.com/topapi/v2/user/list',
        { dept_id: deptId, cursor, size: 100 },
        { params: { access_token: accessToken }, headers: { 'Content-Type': 'application/json' } }
      );

      if (resp.data.errcode === 0 && resp.data.result) {
        const list = resp.data.result.list || [];
        for (const user of list) {
          const userId = user.userid;
          if (!memberMap.has(userId)) {
            memberMap.set(userId, {
              name: user.name || userId,
              userId: userId,
              unionId: user.unionid || user.union_id || '',
            });
          }
        }
        hasMore = resp.data.result.has_more || false;
        cursor = resp.data.result.next_cursor || 0;
      } else {
        console.warn(`  ⚠️ 部门 ${deptId} 查询失败:`, resp.data.errmsg || '');
        hasMore = false;
      }
    } catch (err) {
      console.warn(`  ⚠️ 部门 ${deptId} 请求异常: ${err.message}`);
      hasMore = false;
    }
  }
}

// ============================================================
// 主流程
// ============================================================
(async () => {
  console.log('🚀 钉钉用户导出脚本启动\n');

  // 1. 获取 Token
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error('❌ 无法获取 Access Token，脚本退出');
    process.exit(1);
  }

  // 2. 递归获取所有部门 ID（从根部门 1 开始）
  console.log('\n📋 开始递归获取所有部门...');
  let departmentIds = [];
  try {
    departmentIds = await getAllDepartmentIds(accessToken, 1);
    // 去重（递归可能重复）
    departmentIds = [...new Set(departmentIds)];
    console.log(`✅ 部门获取完成: 共 ${departmentIds.length} 个部门（含所有层级）\n`);
  } catch (err) {
    console.error('❌ 获取部门列表失败:', err.message);
    process.exit(1);
  }

  // 3. 遍历所有部门获取成员，按 userId 去重
  console.log('📋 开始拉取所有部门成员...');
  const memberMap = new Map();
  for (let i = 0; i < departmentIds.length; i++) {
    const deptId = departmentIds[i];
    process.stdout.write(`\r  处理部门 ${i + 1}/${departmentIds.length} (ID: ${deptId})...`);
    await getMembersForDept(accessToken, deptId, memberMap);
  }
  console.log(`\n✅ 成员拉取完成: 共 ${memberMap.size} 人（已按 userId 去重）\n`);

  if (memberMap.size === 0) {
    console.warn('⚠️ 未获取到任何成员数据，请检查 Token 和权限');
    process.exit(0);
  }

  // 4. 转为数组并排序
  const members = Array.from(memberMap.values());
  members.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  // 5. 输出控制台表格
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 全体员工列表');
  console.log('═══════════════════════════════════════════════════════');
  console.table(members.map(m => ({
    姓名: m.name,
    userId: m.userId,
    unionId: m.unionId || '(无)',
  })));

  // 6. 输出可直接复制的 ALLOWED_USERS_MANAGER 白名单
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📋 以下是可直接复制的白名单代码');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('// ===== 以下是可直接复制的白名单代码 =====');
  console.log('const ALLOWED_USERS_MANAGER = [');
  for (const m of members) {
    console.log(`  "${m.userId}", // ${m.name}`);
  }
  console.log('];\n');

  // 7. 写入 CSV 文件
  const csvHeader = '姓名,userId,unionId';
  const csvRows = members.map(m => `"${m.name}","${m.userId}","${m.unionId || ''}"`);
  const csvContent = [csvHeader, ...csvRows].join('\n');
  const csvPath = path.join(__dirname, 'dingtalk_users.csv');
  fs.writeFileSync(csvPath, csvContent, 'utf-8');
  console.log(`✅ CSV 文件已写入: ${csvPath}`);
  console.log(`   共 ${members.length} 条记录\n`);

  console.log('🎉 导出完成！');
})();