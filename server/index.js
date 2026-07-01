// ============================================================
// 强制加载 .env 并打印调试信息
// ============================================================
const dotenv = require('dotenv');
const path = require('path');
const result = dotenv.config({ path: path.join(__dirname, '.env') });
if (result.error) {
  console.error('❌ 加载 .env 失败:', result.error);
} else {
  console.log('✅ .env 加载成功，变量数量:', Object.keys(result.parsed || {}).length);
}
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY);

const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 中间件（先不加载 express.json()）
// ============================================================
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// ============================================================
// Supabase 配置
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 Supabase 配置');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { transport: ws }
});
console.log('✅ Supabase 配置已加载');

// ============================================================
// 钉钉配置
// ============================================================
const DINGTALK_APP_KEY = process.env.DINGTALK_APP_KEY;
const DINGTALK_APP_SECRET = process.env.DINGTALK_APP_SECRET;
if (!DINGTALK_APP_KEY || !DINGTALK_APP_SECRET) {
  console.error('❌ 缺少 DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET 环境变量');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'senyu-dashboard-jwt-secret-2024';

// ============================================================
// 钉钉 Token 缓存
// ============================================================
let dingtalkAccessToken = null;
let tokenExpireTime = 0;

async function getDingTalkAccessToken() {
  if (dingtalkAccessToken && Date.now() < tokenExpireTime) {
    return dingtalkAccessToken;
  }
  try {
    const url = 'https://oapi.dingtalk.com/gettoken';
    const response = await axios.get(url, {
      params: { appkey: DINGTALK_APP_KEY, appsecret: DINGTALK_APP_SECRET }
    });
    if (response.data.errcode === 0) {
      dingtalkAccessToken = response.data.access_token;
      tokenExpireTime = Date.now() + (response.data.expires_in - 300) * 1000;
      console.log('✅ 钉钉 Access Token 获取成功');
      return dingtalkAccessToken;
    } else {
      console.error('❌ 获取钉钉 Token 失败:', response.data);
      return null;
    }
  } catch (err) {
    console.error('❌ 获取钉钉 Token 异常:', err);
    return null;
  }
}

// ============================================================
// 用户姓名缓存
// ============================================================
const userNameCache = new Map();

async function getUserNameByUserId(userId) {
  if (userNameCache.has(userId)) {
    const cached = userNameCache.get(userId);
    if (cached) return cached;
  }
  const accessToken = await getDingTalkAccessToken();
  if (!accessToken) {
    console.warn(`⚠️ 无法获取 Access Token，返回 UserId: ${userId}`);
    return userId;
  }
  try {
    const url = 'https://oapi.dingtalk.com/topapi/v2/user/get';
    const response = await axios.post(
      url,
      { userid: userId },
      { params: { access_token: accessToken }, headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data.errcode === 0 && response.data.result) {
      const userName = response.data.result.name;
      if (userName) {
        userNameCache.set(userId, userName);
        if (userNameCache.size > 1000) {
          const firstKey = userNameCache.keys().next().value;
          if (firstKey) userNameCache.delete(firstKey);
        }
        console.log(`✅ 用户 ID ${userId} -> 姓名: ${userName}`);
        return userName;
      }
    }
    console.warn(`⚠️ 获取用户姓名失败: ${response.data.errmsg}`);
    return userId;
  } catch (err) {
    console.error(`❌ 调用钉钉 API 异常:`, err);
    return userId;
  }
}

// ============================================================
// JWT 验证中间件
// ============================================================
function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: '登录已过期' });
  }
}

// ============================================================
// 工具函数
// ============================================================
function cleanField(value) {
  if (!value) return '';
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'object' && parsed[0].label) return parsed[0].label;
        return String(parsed[0]);
      }
    } catch (e) {}
  }
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value) && value.length > 0) {
      if (typeof value[0] === 'object' && value[0].label) return value[0].label;
      return String(value[0]);
    }
    return value.label || value.value || String(value);
  }
  return String(value);
}

// 统一使用 UTC 解析日期
function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = new Date(value);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const timestamp = parseInt(value);
    if (timestamp > 1e12) {
      const date = new Date(timestamp);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
}

// ============================================================
// 钉钉 OAuth 登录
// ============================================================
app.get('/api/dingtalk/login', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: '缺少 code 参数' });
    }

    const tokenResp = await axios.post(
      'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
      {
        clientId: DINGTALK_APP_KEY,
        clientSecret: DINGTALK_APP_SECRET,
        code,
        grantType: 'authorization_code',
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const { accessToken } = tokenResp.data;
    if (!accessToken) {
      console.error('❌ 换取 userAccessToken 失败:', tokenResp.data);
      return res.status(401).json({ success: false, error: '钉钉认证失败' });
    }

    const userResp = await axios.get('https://api.dingtalk.com/v1.0/contact/users/me', {
      headers: { 'x-acs-dingtalk-access-token': accessToken },
    });

    const user = userResp.data;
    const userId = user.userId || user.openId || '';
    const userName = user.nick || user.name || userId || '未知用户';

    // 白名单校验
    const ALLOWED_USERS = [
      "RWATGRZfsEJGwSILSZyXvwiEiE",   // 赵莘
      "iPKWiSGfv7mKA0shWMre4AiSAiEiE", // 孙静（企业）
      "ckkeeeBa4sBOISXHkd9QZAiEiE",   // 尹萍（企业）
    ];
    if (!ALLOWED_USERS.includes(userId)) {
      console.warn(`⛔ 拒绝访问: ${userName} (${userId}) 不在白名单中`);
      return res.status(403).json({
        success: false,
        error: '您暂无访问权限，请联系管理员'
      });
    }
    console.log(`✅ 白名单校验通过: ${userName} (${userId})`);

    const sessionToken = jwt.sign(
      { userId, name: userName, loginTime: Date.now() },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', sessionToken, {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 3600 * 1000,
      sameSite: 'lax',
      path: '/',
    });

    res.json({
      success: true,
      token: sessionToken,
      user: { userId, name: userName },
    });
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('❌ 钉钉登录异常:', JSON.stringify(detail).slice(0, 300));
    res.status(500).json({ success: false, error: '登录服务异常，请稍后重试' });
  }
});

app.get('/api/dingtalk/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

app.post('/api/dingtalk/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true, message: '已登出' });
});

// ============================================================
// 钉钉 AI 表格 Webhook（自定义中间件 + 完整字段提取）
// ============================================================
app.post('/api/ai-table-webhook', (req, res, next) => {
  let rawBody = '';
  req.on('data', chunk => rawBody += chunk);
  req.on('end', () => {
    console.log('📦 原始请求体（中间件）:', rawBody);
    console.log('📦 原始请求体长度:', rawBody.length);

    let data = null;

    // 1. 尝试标准 JSON 解析
    try {
      data = JSON.parse(rawBody);
      console.log('✅ 中间件 JSON 解析成功');
    } catch (e) {
      console.error('❌ 中间件 JSON 解析失败:', e.message);
      // 2. 手动提取所有字段
      try {
        const extract = (key) => {
          // 针对数组字段，提取完整的数组字符串（如 ["内部研发"]）
          if (['任务分类', '所属项目', '责任人'].includes(key)) {
            const regex = new RegExp(`"${key}":\\s*"(\\[.*?\\])"`);
            const match = rawBody.match(regex);
            if (match) {
              return match[1];
            }
            return '';
          }
          // 针对当前进度(%) 字段，因为字段名含特殊字符，使用更精确的正则
          if (key === '当前进度(%)') {
            const match = rawBody.match(/"当前进度\(%\)":\s*"(\d+)"?/);
            if (match) {
              return match[1];
            }
            return '';
          }
          // 普通字段（非数组，非进度）
          const regex = new RegExp(`"${key}":\\s*"([^"]*)"`);
          const match = rawBody.match(regex);
          return match ? match[1] : '';
        };
        const extractArray = (key) => {
          const regex = new RegExp(`"${key}":\\s*(\\[[\\s\\S]*?\\])`);
          const match = rawBody.match(regex);
          if (match) {
            try { return JSON.parse(match[1]); } catch (e) { return []; }
          }
          return [];
        };

        data = {
          '任务名称': extract('任务名称'),
          '任务分类': extract('任务分类'),
          '所属项目': extract('所属项目'),
          '计划开始时间': extract('计划开始时间'),
          '计划结束时间': extract('计划结束时间'),
          '当前进度(%)': extract('当前进度(%)'),
          '状态': extract('状态'),
          '责任人': extract('责任人'),
          '风险等级': extract('风险等级'),
          '备注': extract('备注'),
          '里程碑明细': extractArray('里程碑明细'),
        };
        console.log('✅ 手动提取所有字段成功');
        console.log('📦 提取的数据:', JSON.stringify(data, null, 2));
      } catch (e2) {
        console.error('❌ 手动提取失败:', e2.message);
        return res.status(400).json({ success: false, error: 'Invalid JSON' });
      }
    }

    if (!data) {
      return res.status(400).json({ success: false, error: 'Invalid JSON' });
    }

    // 将解析结果挂载到 req.body
    req.body = data;
    next();
  });
}, async (req, res) => {
  // ============================================================
  // 实际的 Webhook 处理逻辑
  // ============================================================
  try {
    console.log('\n----------------------------------------');
    console.log('📩 收到 AI 表格 Webhook 推送');
    console.log('📦 解析后的请求体:', JSON.stringify(req.body, null, 2));

    const data = req.body;

    // --- 提取任务名称 ---
    const taskName = cleanField(data['任务名称'] || data.taskName);
    if (!taskName) {
      console.warn('⚠️ 未找到任务名称字段，跳过更新');
      return res.status(200).json({ success: true, message: 'Ignored' });
    }

    // --- 提取所有字段 ---
    const taskCategory = cleanField(data['任务分类']) || '';
    const project = cleanField(data['所属项目']) || '';
    const status = cleanField(data['状态']) || '未开始';
    let responsible = cleanField(data['责任人']) || '';
    const riskLevel = cleanField(data['风险等级']) || '';
    const remark = cleanField(data['备注']) || '';

    const planStart = parseDate(data['计划开始时间']);
    const planEnd = parseDate(data['计划结束时间']);
    const actualStart = data['实际开始时间'] ? parseDate(data['实际开始时间']) : null;
    const actualEnd = data['实际结束时间'] ? parseDate(data['实际结束时间']) : null;

    let progressValue = null;
    const progressRaw = data['当前进度(%)'] || data.progress;
    if (progressRaw !== undefined && progressRaw !== null && progressRaw !== '') {
      const progressStr = String(progressRaw).replace('%', '');
      const parsed = parseFloat(progressStr);
      if (!isNaN(parsed)) progressValue = parsed;
    }

    // --- 转换责任人 ID 为姓名 ---
    if (responsible && /^\d+$/.test(responsible)) {
      console.log(`🔄 正在转换责任人 ID: ${responsible} -> 姓名...`);
      const userName = await getUserNameByUserId(responsible);
      if (userName !== responsible) {
        console.log(`✅ 责任人 ID 转换成功: ${responsible} -> ${userName}`);
        responsible = userName;
      }
    }

    // --- 构建记录 ---
    const record = {
      '任务名称': taskName,
      title: taskName,
      '状态': status,
      status: status,
      '任务分类': taskCategory,
      '所属项目': project,
      '责任人': responsible,
      assignee: responsible,
      '风险等级': riskLevel,
      '备注': remark,
    };
    if (progressValue !== null) record['当前进度(%)'] = progressValue;
    if (planStart) record['计划开始时间'] = planStart;
    if (planEnd) { record['计划结束时间'] = planEnd; record.due_date = planEnd; }
    if (actualStart) record['实际开始时间'] = actualStart;
    if (actualEnd) record['实际结束时间'] = actualEnd;

    console.log(`🔄 处理任务 "${taskName}":`, record);

    // --- 查询或插入任务 ---
    const { data: existing, error: selectError } = await supabase
      .from('tasks')
      .select('id')
      .eq('任务名称', taskName)
      .maybeSingle();

    if (selectError) {
      console.error('❌ 查询失败:', selectError);
      return res.status(500).json({ success: false, error: selectError.message });
    }

    let taskId = null;
    let error;
    if (existing) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update(record)
        .eq('任务名称', taskName);
      error = updateError;
      taskId = existing.id;
      console.log(`📝 更新现有任务: ${taskName}`);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('tasks')
        .insert(record)
        .select('id');
      error = insertError;
      if (inserted && inserted.length > 0) taskId = inserted[0].id;
      console.log(`✨ 插入新任务: ${taskName}`);
    }

    if (error) {
      console.error('❌ Supabase 操作失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // --- 里程碑处理（含计划进度和实际日期，统一 UTC 转换） ---
    const milestones = data['里程碑明细'];
    if (milestones && Array.isArray(milestones) && taskId) {
      await supabase.from('task_milestones').delete().eq('task_id', taskId);

      const toInsert = milestones.map(m => {
        const name = m.TextField_1ET9FKVXORGG0 || m['里程碑名称'] || m['里程碑'] || '';
        if (!name) return null;

        // 计划日期（UTC 转换）
        let planned = m.DDDateField_1ALJFR1YYQWW0 || m['计划完成日期'] || '';
        if (planned && typeof planned === 'number') {
          const date = new Date(planned);
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          planned = `${year}-${month}-${day}`;
        }

        // 实际日期（UTC 转换）
        let actual = m.DDDateField_115E25X500740 || m['实际完成日期'] || '';
        console.log(`🔍 里程碑 "${name}" 实际日期原始值: ${m.DDDateField_115E25X500740}, 字段名: ${m['实际完成日期']}`);
        if (actual && typeof actual === 'number') {
          const date = new Date(actual);
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          actual = `${year}-${month}-${day}`;
          console.log(`✅ 里程碑 "${name}" 实际日期转换: ${actual}`);
        }

        // 计划进度
        let progress = 
          m.NumberField_1ZGO1PPMJ76O0 ||
          m['计划里程碑完成时，整体任务完成度%'] ||
          m['计划进度(%)'] ||
          m['计划进度'] ||
          m['planned_progress'] ||
          0;
        if (typeof progress === 'string') {
          progress = parseFloat(progress.replace('%', '').trim());
        }
        if (isNaN(progress)) progress = 0;
        progress = Math.min(100, Math.max(0, progress));

        console.log(`📌 里程碑 "${name}" 计划进度: ${progress}%, 计划日期: ${planned}, 实际日期: ${actual}`);

        return {
          task_id: taskId,
          milestone_name: name,
          planned_date: planned || null,
          actual_date: actual || null,
          planned_progress: progress,
        };
      }).filter(m => m !== null && m.milestone_name);

      if (toInsert.length > 0) {
        const { error: insError } = await supabase
          .from('task_milestones')
          .insert(toInsert);
        if (insError) {
          console.error('❌ 插入里程碑失败:', insError);
        } else {
          console.log(`✅ 插入 ${toInsert.length} 条里程碑（含计划进度和实际日期）`);
        }
      }
    }

    console.log('✅ Supabase 操作成功');
    res.status(200).json({ success: true, message: 'Synced' });
  } catch (err) {
    console.error('❌ 处理异常:', err.stack || err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// ============================================================
// 其他路由（使用 express.json()）
// ============================================================
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================================
// 启动服务器
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`✅ 钉钉 AppKey: ${DINGTALK_APP_KEY.slice(0, 8)}...`);
});