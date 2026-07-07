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
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// AI 风险分析（通义千问）
// ============================================================
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

async function callRiskAnalysis(taskData) {
  const prompt = `
你是一个项目风险分析专家。请根据以下任务信息，分析该任务的风险等级和潜在风险点，并以 JSON 格式返回结果。

任务信息：
- 任务名称：${taskData['任务名称'] || taskData.taskName || '未知'}
- 当前进度：${taskData['当前进度(%)'] || taskData.progress || 0}%
- 状态：${taskData['状态'] || taskData.status || '未开始'}
- 当前风险等级：${taskData['风险等级'] || taskData.riskLevel || '未设置'}
- 任务分类：${taskData['任务分类'] || taskData.taskCategory || ''}
- 所属项目：${taskData['所属项目'] || taskData.project || ''}
- 计划开始时间：${taskData['计划开始时间'] || taskData.planStart || ''}
- 计划结束时间：${taskData['计划结束时间'] || taskData.planEnd || ''}
- 里程碑完成情况：${JSON.stringify(taskData.milestones || [])}
- 责任人：${taskData['责任人'] || taskData.responsible || ''}

请返回以下 JSON 格式的分析结果：
{
  "riskScore": 0-100 的数字,
  "riskLevel": "低风险" | "中风险" | "高风险" | "极高风险",
  "riskAlerts": ["预警1", "预警2", ...],
  "suggestions": ["建议1", "建议2", ...],
  "analysisSummary": "简要的风险分析说明"
}

风险评分参考规则：
- 进度严重滞后（<30%）且无实际进展 → 高风险
- 进度略有滞后（30%-60%）→ 中风险
- 进度正常（>60%）→ 低风险
- 存在未完成的里程碑且已超期 → 高风险
- 任务分类为"外部依赖"且进度滞后 → 高风险
- 其他情况适当调整。
请务必只返回纯 JSON，不要包含其他解释文字。
`;

  try {
    console.log('⏳ 正在调用通义千问 API...');
    const response = await axios.post(
      DASHSCOPE_URL,
      {
        model: 'qwen-turbo',
        input: { messages: [{ role: 'user', content: prompt }] },
        parameters: { result_format: 'message' }
      },
      {
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ 通义千问 API 响应成功');
    const resultText = response.data.output.choices[0].message.content;
    console.log('📝 AI 原始响应:', resultText.slice(0, 200));
    let jsonStr = resultText;
    const match = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      jsonStr = match[1];
      console.log('🔧 从 markdown 代码块中提取 JSON');
    }
    const parsed = JSON.parse(jsonStr);
    console.log('✅ AI 分析结果解析成功，风险等级:', parsed.riskLevel, '评分:', parsed.riskScore);
    return parsed;
  } catch (error) {
    console.error('❌ 通义千问 API 调用失败');
    console.error('   错误消息:', error.message);
    console.error('   响应状态:', error.response?.status);
    console.error('   响应数据:', JSON.stringify(error.response?.data || '无响应数据').slice(0, 500));
    if (error.code) console.error('   错误代码:', error.code);
    return {
      riskScore: 0,
      riskLevel: '未评估',
      riskAlerts: ['AI 分析暂时不可用'],
      suggestions: [],
      analysisSummary: '分析失败，请稍后重试'
    };
  }
}

async function updateOverallRiskIndex() {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('risk_score, 风险等级');

    if (error) throw error;

    const total = tasks.length;
    if (total === 0) {
      const value = { score: 0, level: '低风险', lastUpdated: new Date().toISOString(), totalTasks: 0, highRiskCount: 0 };
      await supabase
        .from('system_config')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', 'overall_risk_index');
      return;
    }

    let sumScore = 0;
    let highRiskCount = 0;
    for (const task of tasks) {
      const score = task.risk_score || 0;
      sumScore += score;
      if (task['风险等级'] === '高风险' || task['风险等级'] === '极高风险') {
        highRiskCount++;
      }
    }
    const avgScore = Math.round(sumScore / total);
    let level = '低风险';
    if (avgScore > 70) level = '高风险';
    else if (avgScore > 40) level = '中风险';

    const value = {
      score: avgScore,
      level: level,
      lastUpdated: new Date().toISOString(),
      totalTasks: total,
      highRiskCount: highRiskCount
    };

    await supabase
      .from('system_config')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', 'overall_risk_index');

    console.log('✅ 整体风险指数已更新:', value);
  } catch (err) {
    console.error('❌ 更新整体风险指数失败:', err);
  }
}

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
  return String(value).trim();
}

// 使用本地时区解析日期
function parseDate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const timestamp = parseInt(value);
    if (timestamp > 1e12) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
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
      "zAjffiPGiPGnP1rbsiiCNfysQiEiE", // 何朝辉（企业）
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
            const match = rawBody.match(/"当前进度\(%\)":\s*"\s*(\d+)\s*"/);
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
          source: extract('source'),
          '周报详情': extract('本周任务完成情况详情') || extract('周报详情'),
          '新问题': extract('本周任务出现新问题及解决方案') || extract('新问题'),
          '之前问题解决': extract('之前问题解决情况') || extract('之前问题解决'),
          '跨部门协调': extract('需要跨部门协调的问题') || extract('跨部门协调'),
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

    // ============================================================
    // 周报处理分支
    // ============================================================
    if (data.source === 'weekly_report') {
      console.log('📋 检测到周报推送，进入周报处理分支');

      const taskName = cleanField(data['任务名称'] || data.taskName);
      if (!taskName) {
        console.warn('⚠️ 周报未找到任务名称字段，跳过处理');
        return res.status(200).json({ success: true, message: 'Weekly report ignored: no task name' });
      }

      // 查找 tasks 表获取任务 id
      const { data: taskRecord, error: taskLookupError } = await supabase
        .from('tasks')
        .select('id')
        .eq('任务名称', taskName)
        .maybeSingle();

      if (taskLookupError) {
        console.error('❌ 周报查询任务失败:', taskLookupError);
        return res.status(500).json({ success: false, error: taskLookupError.message });
      }

      if (!taskRecord) {
        console.warn(`⚠️ 周报未找到任务 "${taskName}"，跳过处理`);
        return res.status(200).json({ success: true, message: 'Weekly report ignored: task not found' });
      }

      const taskId = taskRecord.id;
      console.log(`✅ 周报任务匹配: "${taskName}" -> task_id=${taskId}`);

      // 提取当前进度(%)
      let progressValue = null;
      const progressRaw = data['当前进度(%)'] || data.progress;
      if (progressRaw !== undefined && progressRaw !== null && progressRaw !== '') {
        const progressStr = String(progressRaw).replace('%', '');
        const parsed = parseFloat(progressStr);
        if (!isNaN(parsed)) progressValue = parsed;
      }

      // 如果 progressValue 为 null 或 undefined，设置为 0
      if (progressValue === null || progressValue === undefined) {
        progressValue = 0;
      }

      // 提取周报专有字段
      const weeklyDetail = cleanField(data['周报详情'] || data.weeklyDetail || data['weekly_detail']) || '';
      const newIssues = cleanField(data['新问题'] || data.newIssues || data['new_issues']) || '';
      const previousIssuesResolved = cleanField(data['之前问题解决'] || data.previousIssuesResolved || data['previous_issues_resolved']) || '';
      const crossDeptCoordination = cleanField(data['跨部门协调'] || data.crossDeptCoordination || data['cross_department_coordination']) || '';

      console.log(`📋 周报字段: 进度=${progressValue}%, 周报详情="${weeklyDetail.slice(0, 50)}...", 新问题="${newIssues.slice(0, 50)}...", 之前问题解决="${previousIssuesResolved.slice(0, 50)}...", 跨部门协调="${crossDeptCoordination.slice(0, 50)}..."`);

      // 插入 task_progress_history 表
      const progressRecord = {
        task_id: taskId,
        actual_progress: progressValue,
        weekly_detail: weeklyDetail,
        new_issues: newIssues,
        previous_issues_resolved: previousIssuesResolved,
        cross_department_coordination: crossDeptCoordination,
        record_date: new Date().toISOString().split('T')[0],
      };

      const { error: progressInsertError } = await supabase
        .from('task_progress_history')
        .insert(progressRecord);

      if (progressInsertError) {
        console.error('❌ 插入 task_progress_history 失败:', progressInsertError);
        return res.status(500).json({ success: false, error: progressInsertError.message });
      }

      console.log(`✅ 周报进度记录已插入: ${taskName}`);

      // 可选：同步更新 tasks 表的当前进度(%)
      if (progressValue !== null) {
        const { error: progressUpdateError } = await supabase
          .from('tasks')
          .update({ '当前进度(%)': progressValue })
          .eq('id', taskId);

        if (progressUpdateError) {
          console.error('⚠️ 更新 tasks 表当前进度失败:', progressUpdateError);
        } else {
          console.log(`✅ 已同步更新任务 "${taskName}" 当前进度为 ${progressValue}%`);
        }
      }

      return res.status(200).json({ success: true, message: 'Weekly report synced' });
    }

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

    // --- 里程碑处理（含计划进度和实际日期，使用本地时区） ---
    const milestones = data['里程碑明细'];
    if (milestones && Array.isArray(milestones) && taskId) {
      await supabase.from('task_milestones').delete().eq('task_id', taskId);

      const toInsert = milestones.map(m => {
        const name = m.TextField_1ET9FKVXORGG0 || m['里程碑名称'] || m['里程碑'] || '';
        if (!name) return null;

        // 计划日期（本地时区）
        let planned = m.DDDateField_1ALJFR1YYQWW0 || m['计划完成日期'] || '';
        if (planned && typeof planned === 'number') {
          const date = new Date(planned);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          planned = `${year}-${month}-${day}`;
        }

        // 实际日期（本地时区）
        let actual = m.DDDateField_115E25X500740 || m['实际完成日期'] || '';
        console.log(`🔍 里程碑 "${name}" 实际日期原始值: ${m.DDDateField_115E25X500740}, 字段名: ${m['实际完成日期']}`);
        if (actual && typeof actual === 'number') {
          const date = new Date(actual);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
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

    // 异步触发风险分析（不阻塞响应）
    if (taskId) {
      (async () => {
        try {
          const { data: task } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();
          if (task) {
            const { data: milestones } = await supabase
              .from('task_milestones')
              .select('*')
              .eq('task_id', taskId);
            task.milestones = milestones;
            const result = await callRiskAnalysis(task);
            await supabase
              .from('tasks')
              .update({
                risk_score: result.riskScore,
                '风险等级': result.riskLevel,
                risk_alerts: result.riskAlerts,
                risk_analysis_updated_at: new Date().toISOString()
              })
              .eq('id', taskId);
            console.log(`✅ 风险分析完成，任务 ${taskId} 风险等级: ${result.riskLevel}`);
            // 更新整体风险指数
            await updateOverallRiskIndex();
          }
        } catch (err) {
          console.error(`❌ 异步风险分析失败 (task ${taskId}):`, err);
        }
      })();
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

// 手动触发风险分析
app.post('/api/risk-analysis', async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ success: false, error: '缺少 taskId' });
  }

  try {
    const { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error || !task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }

    const { data: milestones } = await supabase
      .from('task_milestones')
      .select('*')
      .eq('task_id', taskId);

    task.milestones = milestones;

    const result = await callRiskAnalysis(task);

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        risk_score: result.riskScore,
        '风险等级': result.riskLevel,
        risk_alerts: result.riskAlerts,
        risk_analysis_updated_at: new Date().toISOString()
      })
      .eq('id', taskId);

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }

    // 异步更新整体风险指数
    updateOverallRiskIndex();

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 风险分析失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取整体风险指数
app.get('/api/overall-risk', async (req, res) => {
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'overall_risk_index')
    .single();
  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, data: data.value });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================================
// 任务进度历史查询
// ============================================================
app.get('/api/task-progress', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.query;
    if (!taskId) {
      return res.status(400).json({ success: false, error: '缺少 taskId 参数' });
    }

    const { data, error } = await supabase
      .from('task_progress_history')
      .select('*')
      .eq('task_id', taskId)
      .order('record_date', { ascending: false });

    if (error) {
      console.error('❌ 查询 task_progress_history 失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`📋 查询任务 ${taskId} 的进度历史，共 ${(data || []).length} 条`);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('❌ 查询任务进度历史异常:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// 获取所有任务的风险预警（用于实时风险滚动条）
app.get('/api/risk-alerts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('risk_alerts, 任务名称')
      .not('risk_alerts', 'eq', '{}')
      .not('risk_alerts', 'is', null);
    if (error) throw error;
    // 收集所有预警并去重
    const allAlerts = [];
    const seen = new Set();
    data.forEach(task => {
      if (task.risk_alerts && Array.isArray(task.risk_alerts)) {
        task.risk_alerts.forEach(alert => {
          const key = alert.trim();
          if (!seen.has(key)) {
            seen.add(key);
            allAlerts.push({
              project: task['任务名称'] || '未知任务',
              issue: alert,
              level: 'high'
            });
          }
        });
      }
    });
    res.json({ success: true, data: allAlerts });
  } catch (err) {
    console.error('❌ 获取风险预警失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 统计接口：本月新增任务数
// ============================================================
app.get('/api/stats/monthly-new-tasks', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

    const { count, error } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonthStr);

    if (error) throw error;
    res.json({ success: true, data: count || 0 });
  } catch (err) {
    console.error('❌ 获取本月新增任务数失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 统计接口：按任务分类统计数量
// ============================================================
app.get('/api/stats/task-categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('任务分类');

    if (error) throw error;

    const categoryMap = {};
    (data || []).forEach(task => {
      const cat = task['任务分类'] || '未分类';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const result = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取任务分类统计失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 统计接口：按责任人统计任务数（TOP 5 + 效能分）
// ============================================================
app.get('/api/stats/user-ranking', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('责任人, 状态, "当前进度(%)"');

    if (error) throw error;

    const userMap = {};
    (data || []).forEach(task => {
      const user = task['责任人'] || '未分配';
      if (!userMap[user]) {
        userMap[user] = { total: 0, completed: 0, progressSum: 0, progressCount: 0 };
      }
      userMap[user].total++;
      if (task['状态'] === '已完成' || task['状态'] === '完成') {
        userMap[user].completed++;
      }
      const progress = parseFloat(task['当前进度(%)']);
      if (!isNaN(progress)) {
        userMap[user].progressSum += progress;
        userMap[user].progressCount++;
      }
    });

    // 计算效能分：完成任务数 × 2 + 平均进度 × 0.5
    const ranking = Object.entries(userMap)
      .map(([name, stats]) => {
        const avgProgress = stats.progressCount > 0 ? stats.progressSum / stats.progressCount : 0;
        const score = Math.round(stats.completed * 2 + avgProgress * 0.5);
        return { name, score, completed: stats.completed };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({ success: true, data: ranking });
  } catch (err) {
    console.error('❌ 获取用户排名失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 启动服务器
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`✅ 钉钉 AppKey: ${DINGTALK_APP_KEY.slice(0, 8)}...`);
});

// ============================================================
// 定时任务：每天早上 8:30 全量风险分析
// ============================================================
cron.schedule('30 8 * * *', async () => {
  console.log('⏰ 定时任务启动：全量风险分析');
  try {
    // 获取所有任务
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id');
    if (error) throw error;
    console.log(`📋 共 ${tasks.length} 个任务需要分析`);
    let successCount = 0;
    let failCount = 0;
    for (const task of tasks) {
      try {
        // 获取任务详情和里程碑
        const { data: taskDetail } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', task.id)
          .single();
        if (taskDetail) {
          const { data: milestones } = await supabase
            .from('task_milestones')
            .select('*')
            .eq('task_id', task.id);
          taskDetail.milestones = milestones;
          const result = await callRiskAnalysis(taskDetail);
          await supabase
            .from('tasks')
            .update({
              risk_score: result.riskScore,
              '风险等级': result.riskLevel,
              risk_alerts: result.riskAlerts,
              risk_analysis_updated_at: new Date().toISOString()
            })
            .eq('id', task.id);
          successCount++;
          console.log(`✅ 任务 ${task.id} 分析完成，风险等级: ${result.riskLevel}`);
          // 延迟 500ms 避免 API 限流
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        failCount++;
        console.error(`❌ 任务 ${task.id} 分析失败:`, err.message);
      }
    }
    console.log(`✅ 定时任务完成：成功 ${successCount}，失败 ${failCount}`);
    // 更新整体风险指数
    await updateOverallRiskIndex();
  } catch (err) {
    console.error('❌ 定时任务失败:', err);
  }
});