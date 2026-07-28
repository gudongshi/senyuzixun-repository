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

// ============================================================
// 通用 AI 调用函数（复用通义千问）
// ============================================================
async function callAI(prompt) {
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
  console.log('✅ AI 解析成功');
  return parsed;
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
// 计算并存储整体项目健康度
// ============================================================
async function updateOverallProjectHealth() {
  try {
    console.log('📊 开始计算整体项目健康度...');

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .neq('项目状态', '已删除');

    if (error) throw error;

    const list = projects || [];
    const total = list.length;

    if (total === 0) {
      const value = {
        total: 0,
        inProgress: 0,
        completed: 0,
        avgProgress: 0,
        totalContractAmount: 0,
        paymentRate: 0,
        overdueProjects: 0,
        highRiskProjects: 0,
        lastUpdated: new Date().toISOString()
      };
      await supabase
        .from('system_config')
        .upsert({ key: 'overall_project_health', value, updated_at: new Date().toISOString() });
      console.log('✅ 整体项目健康度已更新（无项目数据）');
      return;
    }

    let inProgress = 0;
    let completed = 0;
    let totalContractAmount = 0;
    let totalReceivedAmount = 0;
    let progressSum = 0;
    let progressCount = 0;
    let overdueProjects = 0;
    let highRiskProjects = 0;
    const today = new Date().toISOString().split('T')[0];

    list.forEach(project => {
      const status = project[FIELD_MAP_TO_DB.projectStatus] || '';
      if (status === '进行中') inProgress++;
      else if (status === '已结项') completed++;

      // 合同金额
      const amount = parseFloat(project[FIELD_MAP_TO_DB.contractAmount]);
      if (!isNaN(amount)) totalContractAmount += amount;

      // 已收款
      const received = parseFloat(project[FIELD_MAP_TO_DB.receivedAmount]);
      if (!isNaN(received)) totalReceivedAmount += received;

      // 进度
      const progress = parseFloat(project[FIELD_MAP_TO_DB.currentProgress]);
      if (!isNaN(progress)) {
        progressSum += progress;
        progressCount++;
      }

      // 超期项目：计划结束日期 < 今天 且 状态不是已结项
      const plannedEndRaw = project[FIELD_MAP_TO_DB.plannedEndDate];
      const plannedEndDate = parseDate(plannedEndRaw);
      if (plannedEndDate && plannedEndDate < today && status !== '已结项') {
        overdueProjects++;
      }

      // 高风险项目：AI 分析结果中风险等级为高风险或极高风险
      const aiResult = project.ai_analysis_result;
      if (aiResult && typeof aiResult === 'object') {
        const riskLevel = aiResult.riskLevel || '';
        if (riskLevel === '高风险' || riskLevel === '极高风险') {
          highRiskProjects++;
        }
      }
    });

    const avgProgress = progressCount > 0
      ? Math.round((progressSum / progressCount) * 10) / 10
      : 0;

    const paymentRate = totalContractAmount > 0
      ? Math.round((totalReceivedAmount / totalContractAmount) * 100)
      : 0;

    const value = {
      total,
      inProgress,
      completed,
      avgProgress,
      totalContractAmount,
      paymentRate,
      overdueProjects,
      highRiskProjects,
      lastUpdated: new Date().toISOString()
    };

    await supabase
      .from('system_config')
      .upsert({ key: 'overall_project_health', value, updated_at: new Date().toISOString() });

    console.log(`📊 整体项目健康度已更新: total=${total}, avgProgress=${avgProgress}%, highRisk=${highRiskProjects}`);
  } catch (err) {
    console.error('❌ 更新整体项目健康度失败:', err);
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
// 白名单配置（双白名单分权）
// ============================================================
// 大屏访问白名单（高管层 / 战略决策者）
const ALLOWED_USERS_DASHBOARD = [
  "RWATGRZfsEJGwSILSZyXvwiEiE",   // 赵莘
  "iPKWiSGfv7mKA0shWMre4AiSAiEiE", // 孙静（企业）
  "ckkeeeBa4sBOISXHkd9QZAiEiE",   // 尹萍（企业）
  "zAjffiPGiPGnP1rbsiiCNfysQiEiE", // 何朝辉（企业）
  "JiPii1oD0VBcPc3eo4Nn3VPAiEiE", // 徐钢
  "JiPii1oD0VBcNGwSILSZyXvwiEiE", // 张劲
];

// 项目管理后台访问白名单（项目操作人员）
const ALLOWED_USERS_MANAGER = [
  "RWATGRZfsEJGwSILSZyXvwiEiE",   // 赵莘
  "iPKWiSGfv7mKA0shWMre4AiSAiEiE", // 孙静（企业）
  "ckkeeeBa4sBOISXHkd9QZAiEiE",   // 尹萍（企业）
  "zAjffiPGiPGnP1rbsiiCNfysQiEiE", // 何朝辉（企业）
  "JiPii1oD0VBcPc3eo4Nn3VPAiEiE", // 徐钢
  "JiPii1oD0VBcNGwSILSZyXvwiEiE", // 张劲
];

// 合并所有授权用户（用于快速判断是否完全无权限）
const ALL_ALLOWED_USERS = [...new Set([...ALLOWED_USERS_DASHBOARD, ...ALLOWED_USERS_MANAGER])];

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
// 钉钉视频会议辅助函数
// ============================================================

// 创建钉钉视频会议
async function createDingTalkMeeting(accessToken, userId, meetingData) {
  const { meetingTitle, startTime, endTime } = meetingData;
  console.log(`📋 创建钉钉视频会议: userId=${userId}, title="${meetingTitle}", startTime=${startTime}, endTime=${endTime}`);
  try {
    const response = await axios.post(
      'https://api.dingtalk.com/v1.0/conference/videoConferences',
      {
        confTitle: meetingTitle,
        startTime: startTime || new Date().toISOString(),
        endTime: endTime || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        userId: userId,
      },
      {
        headers: {
          'x-acs-dingtalk-access-token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    console.log(`✅ 钉钉会议创建成功: userId=${userId}, conferenceId=${response.data.conferenceId}`);
    return response.data;
  } catch (err) {
    const errDetail = err.response?.data || err.message;
    console.error(`❌ 钉钉创建会议 API 调用失败: userId=${userId}, error=${JSON.stringify(errDetail).slice(0, 500)}`);
    throw err;
  }
}

// 查询钉钉会议信息
async function getDingTalkMeetingInfo(accessToken, meetingId) {
  console.log(`📋 查询钉钉会议信息: meetingId=${meetingId}`);
  const response = await axios.get(
    `https://api.dingtalk.com/v1.0/conference/videoConferences/${meetingId}`,
    {
      headers: {
        'x-acs-dingtalk-access-token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  console.log(`✅ 会议信息查询成功: meetingId=${meetingId}, status=${response.data.status}`);
  return response.data;
}

// 关闭钉钉会议
async function closeDingTalkMeeting(accessToken, meetingId) {
  console.log(`📋 关闭钉钉会议: meetingId=${meetingId}`);
  const response = await axios.put(
    `https://api.dingtalk.com/v1.0/conference/videoConferences/${meetingId}/stop`,
    {},
    {
      headers: {
        'x-acs-dingtalk-access-token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  console.log(`✅ 会议已关闭: meetingId=${meetingId}`);
  return response.data;
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
    // 双重检查：token 有效，但用户是否仍在白名单中
    if (!ALL_ALLOWED_USERS.includes(decoded.userId)) {
      console.warn('⛔ 白名单校验失败:', decoded.userId);
      return res.status(403).json({ success: false, error: '您的访问权限已被撤销，请联系管理员' });
    }
    console.log('✅ 白名单校验通过:', decoded.name, 'roles:', decoded.roles);
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
    console.log('🔍 钉钉用户完整信息:', JSON.stringify(user, null, 2));
    // 注意：钉钉 /v1.0/contact/users/me 返回的 openId 字段实际上是 userId，
    // 真正的 openId 是 unionId 字段。会议 API 需要 unionId。
    const userId = user.userId || user.openId || '';
    let openId = user.unionId || user.union_id || user.openId || user.open_id || user.openid || '';
    console.log(`📋 使用的 openId(unionId): ${openId || '(空)'}`);

    // 如果 openId 为空或等于 userId（无效值），通过 userId 查询用户详情获取真正的 openId
    if ((!openId || openId === userId) && userId) {
      try {
        console.log(`📋 openId 无效（当前值: "${openId || '(空)'}"），尝试通过 userId 查询: userId=${userId}`);
        console.log(`📋 当前 accessToken: ${accessToken ? accessToken.slice(0, 20) + '...' : '(空)'}`);
        const userInfoResp = await axios.get(
          `https://api.dingtalk.com/v1.0/contact/users/${userId}`,
          {
            headers: {
              'x-acs-dingtalk-access-token': accessToken,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );
        console.log('🔍 用户详情完整信息:', JSON.stringify(userInfoResp.data, null, 2));
        openId = userInfoResp.data.unionId || userInfoResp.data.union_id || userInfoResp.data.openId || userInfoResp.data.open_id || userInfoResp.data.openid || '';
        console.log(`✅ 通过 userId 查询获取 openId(unionId): ${openId || '(空)'}`);
      } catch (err) {
        console.warn(`⚠️ 通过 userId 查询 openId 失败: ${err.message}`);
      }
    }

    // 如果仍然没有 openId，记录警告
    if (!openId) {
      console.warn(`⚠️ 未能获取用户 openId(unionId)，会议创建将失败`);
    }

    const userName = user.nick || user.name || userId || '未知用户';

    // 白名单校验：检查是否在任意一个白名单中
    if (!ALL_ALLOWED_USERS.includes(userId)) {
      console.warn(`⛔ 拒绝访问: ${userName} (${userId}) 不在白名单中`);
      return res.status(403).json({
        success: false,
        error: '您暂无访问权限，请联系管理员'
      });
    }
    console.log(`✅ 白名单校验通过: ${userName} (${userId}), openId=${openId}`);

    const roles = {
      dashboard: ALLOWED_USERS_DASHBOARD.includes(userId),
      manager: ALLOWED_USERS_MANAGER.includes(userId),
    };

    const sessionToken = jwt.sign(
      { userId, openId, name: userName, roles, loginTime: Date.now() },
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
      user: { userId, name: userName, roles },
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
    user: {
      userId: req.user.userId,
      name: req.user.name,
      roles: req.user.roles,
    },
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
          console.log(`🔍 extractArray 开始: key=${key}`);

          // 方法1：直接查找 key 的完整值（含外层引号，支持转义字符）
          const regex1 = new RegExp(`"${key}":\\s*"((?:[^"\\\\]|\\\\.)*)"`);
          const match1 = rawBody.match(regex1);
          if (match1) {
            console.log(`✅ 方法1匹配到原始字符串: ${match1[1]}`);
            const str = match1[1];
            console.log(`📌 原始字符串长度: ${str.length}`);

            // 如果匹配到的字符串很短，说明正则提前截断了，改用字符串查找方式
            if (str.length < 10) {
              console.log(`📌 匹配到的字符串太短 (${str.length})，改用字符串查找方式`);
              // 在 rawBody 中查找 key 的完整值
              const startIndex = rawBody.indexOf(`"${key}"`);
              if (startIndex !== -1) {
                const valueStart = rawBody.indexOf(':', startIndex) + 1;
                // 从 valueStart 开始，查找匹配的 } 或后面的字段结束
                // 简单方式：查找最近的一个 }（假设里程碑是数组）
                const braceStart = rawBody.indexOf('[', valueStart);
                if (braceStart !== -1) {
                  // 从 braceStart 开始，匹配到最后一个 ]
                  let depth = 0;
                  let braceEnd = -1;
                  for (let i = braceStart; i < rawBody.length; i++) {
                    if (rawBody[i] === '[') depth++;
                    else if (rawBody[i] === ']') {
                      depth--;
                      if (depth === 0) { braceEnd = i; break; }
                    }
                  }
                  if (braceEnd !== -1) {
                    const arrayStr = rawBody.substring(braceStart, braceEnd + 1);
                    console.log(`📌 字符串查找提取到: ${arrayStr}`);
                    try {
                      const parsed = JSON.parse(arrayStr);
                      if (Array.isArray(parsed)) {
                        console.log(`✅ 字符串查找解析成功: ${parsed.length} 条`);
                        return parsed;
                      }
                    } catch (e) {
                      console.log(`❌ 字符串查找解析失败: ${e.message}`);
                    }
                  }
                }
              }
            }

            // 清洗步骤
            let cleanStr = str.trim();
            console.log(`📌 trim后: ${cleanStr}`);
            if (cleanStr.startsWith('"')) {
              cleanStr = cleanStr.slice(1, -1);
              console.log(`📌 去掉外层引号后: ${cleanStr}`);
            }
            cleanStr = cleanStr.replace(/\\/g, '');
            console.log(`📌 去掉转义符后: ${cleanStr}`);

            // 提取数组内容
            const arrayMatch = cleanStr.match(/^(\[[\s\S]*\])/);
            if (arrayMatch) {
              console.log(`📌 提取的数组内容: ${arrayMatch[1]}`);
              try {
                const parsed = JSON.parse(arrayMatch[1]);
                if (Array.isArray(parsed)) {
                  console.log(`✅ 清洗后解析成功: ${parsed.length} 条`);
                  return parsed;
                } else {
                  console.log(`⚠️ 解析结果不是数组: ${typeof parsed}`);
                }
              } catch (e) {
                console.log(`❌ 清洗后解析失败: ${e.message}`);
              }
            } else {
              console.log(`❌ 未提取到数组内容`);
            }
          } else {
            console.log(`❌ 方法1未匹配`);
          }

          // 方法2：查找 key 后面的内容，直到下一个字段
          const regex2 = new RegExp(`"${key}":\\s*"([^"]+)"`);
          const match2 = rawBody.match(regex2);
          if (match2) {
            console.log(`✅ 方法2匹配到: ${match2[1].slice(0, 100)}`);
            const str = match2[1];
            // 提取数组部分
            const arrayMatch = str.match(/^(\[[\s\S]*\])/);
            if (arrayMatch) {
              try {
                const parsed = JSON.parse(arrayMatch[1]);
                if (Array.isArray(parsed)) {
                  console.log(`✅ 方法2数组解析成功: ${parsed.length} 条`);
                  return parsed;
                }
              } catch (e) {
                console.log(`❌ 方法2数组解析失败: ${e.message}`);
              }
            } else {
              console.log(`❌ 方法2未提取到数组`);
            }
          } else {
            console.log(`❌ 方法2未匹配`);
          }

          // 方法3：尝试直接提取 rawBody 中 key 后面的所有内容（直到字段结束）
          const start = rawBody.indexOf(`"${key}"`);
          if (start !== -1) {
            const valueStart = rawBody.indexOf(':', start) + 1;
            const end = rawBody.indexOf('}', valueStart);
            const substr = rawBody.substring(valueStart, end).trim();
            console.log(`✅ 方法3提取: ${substr.slice(0, 100)}`);
            if (substr.startsWith('"')) {
              // 去掉外层引号
              const inner = substr.slice(1, -1);
              const arrayMatch = inner.match(/^(\[[\s\S]*\])/);
              if (arrayMatch) {
                try {
                  const parsed = JSON.parse(arrayMatch[1]);
                  if (Array.isArray(parsed)) {
                    console.log(`✅ 方法3数组解析成功: ${parsed.length} 条`);
                    return parsed;
                  }
                } catch (e) {
                  console.log(`❌ 方法3数组解析失败: ${e.message}`);
                }
              }
            }
          } else {
            console.log(`❌ 方法3未找到 key`);
          }

          console.log(`❌ extractArray 最终返回空数组`);
          return [];
        };

        data = {
          '任务名称': extract('任务名称'),
          '任务分类': extract('任务分类'),
          '所属项目': extract('所属项目'),
          '计划开始时间': extract('计划开始时间'),
          '计划结束时间': extract('计划结束时间'),
          '当前进度(%)': extract('当前进度(%)'),
          '本次完成的里程碑': extract('本次完成的里程碑'),
          '本次完成里程碑时间': extract('本次完成里程碑时间'),
          '状态': extract('状态'),
          '责任人': extract('责任人'),
          '风险等级': extract('风险等级'),
          '所属组织': extract('所属组织'),
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

      // 读取所属组织，决定操作哪个任务表
      const organization = cleanField(data['所属组织']) || '森宇';
      const tasksTableName = organization === '风控中心' ? 'tasks_center' : 'tasks';
      console.log(`📋 接收到任务数据，所属组织: ${organization}，目标表: ${tasksTableName}`);

      const taskName = cleanField(data['任务名称'] || data.taskName);
      if (!taskName) {
        console.warn('⚠️ 周报未找到任务名称字段，跳过处理');
        return res.status(200).json({ success: true, message: 'Weekly report ignored: no task name' });
      }

      // 查找任务表获取任务 id
      const { data: taskRecord, error: taskLookupError } = await supabase
        .from(tasksTableName)
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

      // 可选：同步更新任务表的当前进度(%)
      if (progressValue !== null) {
        const { error: progressUpdateError } = await supabase
          .from(tasksTableName)
          .update({ '当前进度(%)': progressValue })
          .eq('id', taskId);

        if (progressUpdateError) {
          console.error('⚠️ 更新 tasks 表当前进度失败:', progressUpdateError);
        } else {
          console.log(`✅ 已同步更新任务 "${taskName}" 当前进度为 ${progressValue}%`);
        }
      }

      // --- 处理里程碑完成（兼容新旧字段名） ---
      const completedMilestone = cleanField(data['本次完成的里程碑']) || cleanField(data['当前进行中里程碑']);
      const completedDate = data['本次完成里程碑时间'] || data['里程碑完成时间（如完成请填写）'];

      if (taskId && completedMilestone && completedDate) {
        console.log(`🔍 更新里程碑完成: 任务=${taskName}, 里程碑="${completedMilestone}", 完成日期=${completedDate}`);

        // 解析日期（兼容钉钉时间戳格式及带空格的数字字符串）
        let actualDate = completedDate;
        if (typeof completedDate === 'number') {
          const date = new Date(completedDate);
          actualDate = date.toISOString().split('T')[0];
        } else if (typeof completedDate === 'string') {
          // 去除前后空格
          const trimmed = completedDate.trim();
          // 如果是数字字符串，转为数字再处理
          if (/^\d+$/.test(trimmed)) {
            const date = new Date(parseInt(trimmed));
            if (!isNaN(date.getTime())) {
              actualDate = date.toISOString().split('T')[0];
            }
          } else {
            // 尝试解析为日期字符串
            const parsed = new Date(trimmed);
            if (!isNaN(parsed.getTime())) {
              actualDate = parsed.toISOString().split('T')[0];
            }
          }
        }

        console.log(`📌 解析后的完成日期: ${actualDate}`);

        // 更新里程碑的 actual_date
        const { error: milestoneUpdateError } = await supabase
          .from('task_milestones')
          .update({ actual_date: actualDate })
          .eq('task_id', taskId)
          .eq('milestone_name', completedMilestone);

        if (milestoneUpdateError) {
          console.error(`❌ 更新里程碑完成时间失败: ${milestoneUpdateError.message}`);
        } else {
          console.log(`✅ 里程碑 "${completedMilestone}" 完成时间已更新为 ${actualDate}`);
        }
      }

      // 同步触发 AI 风险分析（await 等待完成，确保数据库风险信息已更新）
      console.log(`🤖 开始任务 AI 分析: taskId=${taskId}, 目标表=${tasksTableName}`);
      try {
        const { data: task } = await supabase
          .from(tasksTableName)
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
            .from(tasksTableName)
            .update({
              risk_score: result.riskScore,
              '风险等级': result.riskLevel,
              risk_alerts: result.riskAlerts,
              risk_analysis_updated_at: new Date().toISOString()
            })
            .eq('id', taskId);
          console.log(`✅ 任务 AI 分析完成: taskId=${taskId}, 风险等级=${result.riskLevel}`);
          await updateOverallRiskIndex();
        }
      } catch (err) {
        console.error(`❌ 任务 AI 分析失败 (task ${taskId}):`, err.message);
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

    // 读取所属组织，决定操作哪个任务表
    const organization = cleanField(data['所属组织']) || '森宇';
    const tasksTableName = organization === '风控中心' ? 'tasks_center' : 'tasks';
    console.log(`📋 接收到任务数据，所属组织: ${organization}，目标表: ${tasksTableName}`);

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
      .from(tasksTableName)
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
        .from(tasksTableName)
        .update(record)
        .eq('任务名称', taskName);
      error = updateError;
      taskId = existing.id;
      console.log(`📝 更新现有任务: ${taskName}`);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from(tasksTableName)
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

    console.log(`🔍 任务操作完成: taskId=${taskId}, tasksTableName=${tasksTableName}`);

    // --- 里程碑处理（兼容森宇和风控中心格式） ---
    let milestones = data['里程碑明细'];

    // 如果里程碑是字符串，尝试手动解析（风控中心格式）
    if (typeof milestones === 'string') {
      console.log(`🔍 里程碑是字符串，尝试解析: ${milestones.slice(0, 100)}...`);
      // 去掉外层引号和转义，提取数组内容
      let cleanStr = milestones.replace(/^"|"$/g, '').replace(/\\/g, '');
      const arrayMatch = cleanStr.match(/^(\[[\s\S]*\])/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[1]);
          if (Array.isArray(parsed)) {
            milestones = parsed;
            console.log(`✅ 手动解析里程碑成功: ${milestones.length} 条`);
          }
        } catch (e) {
          console.log(`❌ 手动解析里程碑失败: ${e.message}`);
        }
      } else {
        console.log(`❌ 未找到数组格式`);
      }
    } else {
      console.log(`📋 里程碑类型: ${typeof milestones}，长度: ${milestones?.length || 0}`);
    }

    if (milestones && Array.isArray(milestones)) {
      console.log(`📋 里程碑内容: ${JSON.stringify(milestones)}`);
    }
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

    // 同步触发风险分析（await 等待完成，确保数据库中风险信息已更新）
    if (taskId) {
      try {
        console.log(`🤖 开始任务 AI 分析: taskId=${taskId}, 目标表=${tasksTableName}`);
        const { data: task } = await supabase
          .from(tasksTableName)
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
            .from(tasksTableName)
            .update({
              risk_score: result.riskScore,
              '风险等级': result.riskLevel,
              risk_alerts: result.riskAlerts,
              risk_analysis_updated_at: new Date().toISOString()
            })
            .eq('id', taskId);
          console.log(`✅ 任务 AI 分析完成: taskId=${taskId}, 风险等级=${result.riskLevel}`);
          // 更新整体风险指数
          await updateOverallRiskIndex();
        }
      } catch (err) {
        console.error(`❌ 任务 AI 分析失败 (task ${taskId}):`, err.message);
      }
    }

    console.log(`✅ 任务已写入 ${tasksTableName}`);
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

// 获取整体风险指数（含项目统计）
app.get('/api/overall-risk', async (req, res) => {
  try {
    console.log('📋 GET /api/overall-risk - 获取整体风险指数及项目统计');

    const { data: configData, error: configError } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'overall_risk_index')
      .single();

    if (configError) {
      console.error('❌ 获取整体风险指数失败:', configError.message);
      return res.status(500).json({ success: false, error: configError.message });
    }

    // 查询项目统计
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('项目状态, ai_analysis_result')
      .neq('项目状态', '已删除');

    if (projectError) {
      console.error('❌ 查询项目统计失败:', projectError.message);
      return res.status(500).json({ success: false, error: projectError.message });
    }

    const totalProjects = (projects || []).length;
    const highRiskProjects = (projects || []).filter(p => {
      const aiResult = p.ai_analysis_result;
      if (!aiResult || typeof aiResult !== 'object') return false;
      const riskLevel = aiResult.riskLevel || '';
      return riskLevel === '高风险' || riskLevel === '极高风险';
    }).length;

    const result = {
      ...configData.value,
      totalProjects,
      highRiskProjects,
    };

    console.log(`✅ 整体风险指数: 评分=${configData.value?.score || 0}, 等级=${configData.value?.level || '未知'}, 总任务=${configData.value?.totalTasks || 0}, 高风险任务=${configData.value?.highRiskCount || 0}, 总项目=${totalProjects}, 高风险项目=${highRiskProjects}`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取整体风险指数异常:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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

// 获取所有任务和项目的风险预警（用于实时风险滚动条）
app.get('/api/risk-alerts', async (req, res) => {
  try {
    console.log('📋 GET /api/risk-alerts - 获取风险预警（含任务+项目）');

    // 查询任务预警
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, risk_alerts, 任务名称')
      .not('risk_alerts', 'eq', '{}')
      .not('risk_alerts', 'is', null);

    if (taskError) throw taskError;

    // 查询项目预警
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id, 项目名称, ai_analysis_result')
      .neq('项目状态', '已删除');

    if (projectError) throw projectError;

    const allAlerts = [];

    // 处理任务预警
    (tasks || []).forEach(task => {
      if (task.risk_alerts && Array.isArray(task.risk_alerts)) {
        task.risk_alerts.forEach(alert => {
          allAlerts.push({
            type: 'task',
            id: task.id,
            name: task['任务名称'] || '未知任务',
            issue: alert,
            level: 'high',
          });
        });
      }
    });

    // 处理项目预警
    (projects || []).forEach(project => {
      const aiResult = project.ai_analysis_result;
      if (aiResult && typeof aiResult === 'object') {
        const riskAlerts = aiResult.riskAlerts;
        if (riskAlerts && Array.isArray(riskAlerts)) {
          riskAlerts.forEach(alert => {
            allAlerts.push({
              type: 'project',
              id: project.id,
              name: project['项目名称'] || '未知项目',
              issue: alert,
              level: 'high',
            });
          });
        }
      }
    });

    const taskAlertCount = (tasks || []).reduce((sum, t) =>
      sum + (Array.isArray(t.risk_alerts) ? t.risk_alerts.length : 0), 0);
    const projectAlertCount = (projects || []).reduce((sum, p) => {
      const ai = p.ai_analysis_result;
      return sum + (ai && Array.isArray(ai.riskAlerts) ? ai.riskAlerts.length : 0);
    }, 0);

    console.log(`✅ 风险预警返回 ${taskAlertCount} 条任务预警 + ${projectAlertCount} 条项目预警`);

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
// AI 用户效能分析接口
// ============================================================
app.post('/api/ai/user-analysis', async (req, res) => {
  try {
    const { userName } = req.body;
    if (!userName) {
      return res.status(400).json({ success: false, error: '缺少 userName 参数' });
    }

    console.log(`🔍 开始分析用户效能: ${userName}`);

    // 查询该用户的所有任务
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('责任人', userName);

    if (error) throw error;

    if (!tasks || tasks.length === 0) {
      return res.json({
        success: true,
        data: {
          stats: {
            totalTasks: 0,
            completedTasks: 0,
            avgProgress: 0,
            categoryDistribution: {},
            delayedTasks: 0,
            onTimeDeliveryRate: 0
          },
          aiAnalysis: {
            summary: '该用户暂无任务数据',
            strengths: [],
            weaknesses: [],
            suggestions: []
          },
          tasks: []
        }
      });
    }

    // 计算统计指标
    const totalTasks = tasks.length;
    let completedTasks = 0;
    let progressSum = 0;
    let progressCount = 0;
    const categoryMap = {};
    let delayedTasks = 0;
    const today = new Date().toISOString().split('T')[0];

    tasks.forEach(task => {
      // 已完成任务
      if (task['状态'] === '已完成' || task['状态'] === '完成') {
        completedTasks++;
      }
      // 进度统计
      const progress = parseFloat(task['当前进度(%)']);
      if (!isNaN(progress)) {
        progressSum += progress;
        progressCount++;
      }
      // 任务分类分布
      const cat = task['任务分类'] || '未分类';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
      // 延迟任务：计划结束时间 < 今天且未完成
      if (task['计划结束时间'] && task['计划结束时间'] < today) {
        if (task['状态'] !== '已完成' && task['状态'] !== '完成') {
          delayedTasks++;
        }
      }
    });

    const avgProgress = progressCount > 0 ? Math.round(progressSum / progressCount) : 0;
    const onTimeDeliveryRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const stats = {
      totalTasks,
      completedTasks,
      avgProgress,
      categoryDistribution: categoryMap,
      delayedTasks,
      onTimeDeliveryRate
    };

    console.log(`📊 统计完成: 总任务=${totalTasks}, 已完成=${completedTasks}, 平均进度=${avgProgress}%, 延迟=${delayedTasks}, 准时率=${onTimeDeliveryRate}%`);

    // 构造任务明细列表
    const taskList = tasks.map(task => ({
      id: task.id,
      taskName: task['任务名称'] || '',
      project: task['所属项目'] || '',
      progress: parseFloat(task['当前进度(%)']) || 0,
      status: task['状态'] || '未开始',
      riskLevel: task['风险等级'] || ''
    }));
    console.log(`📋 用户 ${userName} 共有 ${taskList.length} 个任务`);

    // 构造 Prompt 并调用 AI
    const prompt = `你是一位项目效能分析专家。请根据以下数据，分析该员工的效能表现：
- 总任务数：${totalTasks}
- 已完成：${completedTasks}
- 平均进度：${avgProgress}%
- 任务分类分布：${JSON.stringify(categoryMap)}
- 延迟任务：${delayedTasks}个
- 准时交付率：${onTimeDeliveryRate}%

请以 JSON 格式返回：
{
  "summary": "整体评价（一句话）",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["待改进1", "待改进2"],
  "suggestions": ["建议1", "建议2"]
}
请务必只返回纯 JSON，不要包含其他解释文字。`;

    let aiAnalysis;
    try {
      aiAnalysis = await callAI(prompt);
    } catch (aiErr) {
      console.error('❌ AI 分析失败:', aiErr.message);
      aiAnalysis = {
        summary: 'AI 分析暂时不可用，请稍后重试',
        strengths: [],
        weaknesses: [],
        suggestions: []
      };
    }

    res.json({ success: true, data: { stats, aiAnalysis, tasks: taskList } });
  } catch (err) {
    console.error('❌ 用户效能分析失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AI 整体风险分析接口
// ============================================================
app.post('/api/ai/overall-risk-analysis', async (req, res) => {
  try {
    console.log('🔍 开始整体风险分析...');

    // 查询所有任务
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*');

    if (error) throw error;

    if (!tasks || tasks.length === 0) {
      return res.json({
        success: true,
        data: {
          riskComposition: { progressRisk: 0, qualityRisk: 0, costRisk: 0, personnelRisk: 0 },
          aiAnalysis: { summary: '暂无任务数据', suggestions: [] }
        }
      });
    }

    const totalTasks = tasks.length;
    const today = new Date().toISOString().split('T')[0];

    let progressRiskCount = 0;
    let completedCount = 0;
    let overdueCompletedCount = 0;
    let externalDependencyCount = 0;
    let externalDependencySlowCount = 0;
    let unassignedCount = 0;

    tasks.forEach(task => {
      const progress = parseFloat(task['当前进度(%)']) || 0;

      // 进度风险：进度 < 30% 的任务数
      if (progress < 30) progressRiskCount++;

      // 质量风险：已完成任务中，实际结束时间 > 计划结束时间
      if (task['状态'] === '已完成' || task['状态'] === '完成') {
        completedCount++;
        if (task['实际结束时间'] && task['计划结束时间'] && task['实际结束时间'] > task['计划结束时间']) {
          overdueCompletedCount++;
        }
      }

      // 成本风险：任务分类为"外部依赖"且进度 < 50%
      const category = task['任务分类'] || '';
      if (category === '外部依赖') {
        externalDependencyCount++;
        if (progress < 50) externalDependencySlowCount++;
      }

      // 人员风险：责任人未分配
      const responsible = task['责任人'] || '';
      if (!responsible || responsible.trim() === '') {
        unassignedCount++;
      }
    });

    const progressRisk = Math.round((progressRiskCount / totalTasks) * 100);
    const qualityRisk = completedCount > 0 ? Math.round((overdueCompletedCount / completedCount) * 100) : 0;
    const costRisk = externalDependencyCount > 0
      ? Math.round((externalDependencySlowCount / totalTasks) * 100)
      : 0;
    const personnelRisk = Math.round((unassignedCount / totalTasks) * 100);

    const riskComposition = { progressRisk, qualityRisk, costRisk, personnelRisk };

    console.log(`📊 风险构成: 进度=${progressRisk}%, 质量=${qualityRisk}%, 成本=${costRisk}%, 人员=${personnelRisk}%`);

    // 获取整体风险指数
    const { data: configData } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'overall_risk_index')
      .single();

    const overallRisk = configData?.value || { score: 0, level: '低风险' };

    // 构造 Prompt 并调用 AI
    const prompt = `你是一位项目风险管理专家。请根据以下整体项目数据，分析整体风险状况：
- 总任务数：${totalTasks}
- 进度风险（进度<30%的任务占比）：${progressRisk}%
- 质量风险（实际超期完成占比）：${qualityRisk}%
- 成本风险（外部依赖任务占比）：${costRisk}%
- 人员风险（责任人未分配占比）：${personnelRisk}%
- 整体风险指数：${overallRisk.score}
- 整体风险等级：${overallRisk.level}

请以 JSON 格式返回：
{
  "summary": "整体风险状况总结（一句话）",
  "suggestions": ["建议1", "建议2", "建议3"]
}
请务必只返回纯 JSON，不要包含其他解释文字。`;

    let aiAnalysis;
    try {
      aiAnalysis = await callAI(prompt);
    } catch (aiErr) {
      console.error('❌ AI 分析失败:', aiErr.message);
      aiAnalysis = {
        summary: 'AI 分析暂时不可用，请稍后重试',
        suggestions: []
      };
    }

    res.json({ success: true, data: { riskComposition, aiAnalysis } });
  } catch (err) {
    console.error('❌ 整体风险分析失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AI 本月新增任务分析接口
// ============================================================
app.post('/api/ai/monthly-tasks-analysis', async (req, res) => {
  try {
    console.log('🔍 开始本月新增任务分析...');

    const now = new Date();
    const thisMonthFirst = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStr = thisMonthFirst.toISOString().split('T')[0];
    const lastMonthStr = lastMonthFirst.toISOString().split('T')[0];

    // 查询本月新增任务
    const { data: thisMonthTasks, error: thisMonthError } = await supabase
      .from('tasks')
      .select('*')
      .gte('created_at', thisMonthStr);

    if (thisMonthError) throw thisMonthError;

    // 查询上月新增任务数（仅计数）
    const { count: lastMonthCount, error: lastMonthError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', lastMonthStr)
      .lt('created_at', thisMonthStr);

    if (lastMonthError) throw lastMonthError;

    const total = (thisMonthTasks || []).length;
    const lastMonthTotal = lastMonthCount || 0;

    // 计算增长率
    const growthRate = lastMonthTotal > 0
      ? Math.round(((total - lastMonthTotal) / lastMonthTotal) * 100)
      : (total > 0 ? 100 : 0);

    // 统计任务分类分布
    const categoryMap = {};
    (thisMonthTasks || []).forEach(task => {
      const cat = task['任务分类'] || '未分类';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    console.log(`📊 本月新增: ${total}, 上月: ${lastMonthTotal}, 增长率: ${growthRate}%`);

    // 构造 Prompt 并调用 AI
    const prompt = `你是一位项目管理专家。请根据以下本月新增任务数据，分析任务结构和趋势：
- 本月新增任务总数：${total}
- 上月新增任务总数：${lastMonthTotal}
- 增长率：${growthRate}%
- 任务分类分布：${JSON.stringify(categoryMap)}

请以 JSON 格式返回：
{
  "summary": "本月新增任务情况总结（一句话）",
  "suggestions": ["建议1", "建议2", "建议3"]
}
请务必只返回纯 JSON，不要包含其他解释文字。`;

    let aiAnalysis;
    try {
      aiAnalysis = await callAI(prompt);
    } catch (aiErr) {
      console.error('❌ AI 分析失败:', aiErr.message);
      aiAnalysis = {
        summary: 'AI 分析暂时不可用，请稍后重试',
        suggestions: []
      };
    }

    res.json({
      success: true,
      data: {
        total,
        lastMonthTotal,
        growthRate,
        categoryDistribution: categoryMap,
        aiAnalysis
      }
    });
  } catch (err) {
    console.error('❌ 本月新增任务分析失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 项目管理接口
// ============================================================

// 钉钉同步占位函数（后续任务 2.5 完善）
async function syncProjectToDingTalk(projectData) {
  console.log('📤 准备同步到钉钉AI表格:', projectData.contract_number || projectData['合同编号']);
  return { success: true, message: '模拟同步成功' };
}

// 字段映射：英文请求 → 中文数据库字段
const FIELD_MAP_TO_DB = {
  contractNumber: '合同编号',
  projectName: '项目名称',
  serviceCategory: '服务类别',
  projectStatus: '项目状态',
  contractAmount: '合同金额',
  finalContractAmount: '最终合同金额',
  receivedAmount: '已收款',
  invoicedAmount: '已开票',
  projectLeader: '项目负责人',
  department: '所属部门',
  partnerUnit: '合作单位',
  signedDate: '签订日期',
  plannedEndDate: '计划结束日期',
  currentProgress: '当前进度',
  lastWeeklyReportAt: '最近周报日期',
  remark: '备注',
  serviceScope: '服务范围',
  serviceContent: '服务内容',
  paymentTerms: '付款条款',
  plannedStartDate: '计划开始时间',
  targetCost: '目标成本',
  targetProfitRate: '目标利润率',
  actualProjectLeader: '实际项目负责人',
  projectAddress: '项目地址',
  projectTeam: '项目人员组成',
  clientId: '客户ID',
  businessType: '业务类型',
  implementationStatus: '项目实施状态',
  projectDuration: '项目工期',
};

// 字段映射：中文数据库字段 → 英文响应
const FIELD_MAP_FROM_DB = {
  '合同编号': 'contractNumber',
  '项目名称': 'projectName',
  '服务类别': 'serviceCategory',
  '项目状态': 'projectStatus',
  '合同金额': 'contractAmount',
  '最终合同金额': 'finalContractAmount',
  '已收款': 'receivedAmount',
  '已开票': 'invoicedAmount',
  '项目负责人': 'projectLeader',
  '所属部门': 'department',
  '合作单位': 'partnerUnit',
  '签订日期': 'signedDate',
  '计划结束日期': 'plannedEndDate',
  '当前进度': 'currentProgress',
  '最近周报日期': 'lastWeeklyReportAt',
  '备注': 'remark',
  '服务范围': 'serviceScope',
  '服务内容': 'serviceContent',
  '付款条款': 'paymentTerms',
  '计划开始时间': 'plannedStartDate',
  '目标成本': 'targetCost',
  '目标利润率': 'targetProfitRate',
  '实际项目负责人': 'actualProjectLeader',
  '项目地址': 'projectAddress',
  '项目人员组成': 'projectTeam',
  '客户ID': 'clientId',
  '业务类型': 'businessType',
  '项目实施状态': 'implementationStatus',
  '项目工期': 'projectDuration',
  'ai_analysis_result': 'aiAnalysisResult',
};

// 将请求体英文字段映射为中文字段（写入 DB）
function mapRequestToDb(body) {
  const record = {};
  for (const [enKey, cnKey] of Object.entries(FIELD_MAP_TO_DB)) {
    if (body[enKey] !== undefined) {
      record[cnKey] = body[enKey];
    }
  }
  return record;
}

// 将数据库记录中文字段映射为英文字段（返回响应）
function mapDbToResponse(dbRecord) {
  if (!dbRecord) return null;
  const result = { id: dbRecord.id };
  for (const [cnKey, enKey] of Object.entries(FIELD_MAP_FROM_DB)) {
    result[enKey] = dbRecord[cnKey] !== undefined ? dbRecord[cnKey] : null;
  }
  result.aiAnalysisResult = dbRecord.ai_analysis_result;
  result.createdAt = dbRecord.created_at;
  result.updatedAt = dbRecord.updated_at;
  return result;
}

// ============================================================
// 周报字段映射：英文请求 → 数据库字段（project_weekly_reports 表）
// 注意：WEEKLY_REPORT_FIELD_MAP_TO_DB / WEEKLY_REPORT_FIELD_MAP_FROM_DB
// 已在下方"周报/财务接口"区块中统一定义（35 字段完整版），此处不再重复声明。
// ============================================================

// 将周报请求体英文字段映射为数据库字段（写入 project_weekly_reports）
function mapWeeklyReportRequestToDb(body) {
  const record = {};
  for (const [enKey, dbKey] of Object.entries(WEEKLY_REPORT_FIELD_MAP_TO_DB)) {
    if (body[enKey] !== undefined) {
      record[dbKey] = body[enKey];
    }
  }
  return record;
}

// 将周报数据库记录映射为英文响应
function mapWeeklyReportDbToResponse(dbRecord) {
  if (!dbRecord) return null;
  const result = {};
  for (const [dbKey, enKey] of Object.entries(WEEKLY_REPORT_FIELD_MAP_FROM_DB)) {
    result[enKey] = dbRecord[dbKey] !== undefined ? dbRecord[dbKey] : null;
  }
  result.id = dbRecord.id;
  result.projectId = dbRecord.project_id;
  result.createdAt = dbRecord.created_at;
  return result;
}

// AI 项目分析函数（完整实现）
async function triggerProjectAIAnalysis(projectId) {
  console.log(`🤖 开始项目 AI 分析: projectId=${projectId}`);

  try {
    // 1. 查询项目完整信息
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error(`❌ AI 分析失败 - 项目不存在: projectId=${projectId}`, projectError.message);
      return { success: false, error: '项目不存在' };
    }

    const projectName = project[FIELD_MAP_TO_DB.projectName] || '未知项目';
    console.log(`📋 AI 分析项目: ${projectName}`);

    // 2. 查询最近 3 条周报
    const { data: weeklyReports, error: reportsError } = await supabase
      .from('project_weekly_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(3);

    if (reportsError) {
      console.warn(`⚠️ 查询周报失败: ${reportsError.message}`);
    }

    // 3. 查询关联任务（通过 project_id 或 所属项目 匹配）
    let tasks = [];
    const { data: tasksByProjectId, error: tasksError1 } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId);

    if (tasksError1) {
      console.warn(`⚠️ 通过 project_id 查询任务失败，尝试通过项目名称匹配: ${tasksError1.message}`);
      const { data: tasksByName, error: tasksError2 } = await supabase
        .from('tasks')
        .select('*')
        .eq('所属项目', projectName);

      if (!tasksError2) {
        tasks = tasksByName || [];
      } else {
        console.warn(`⚠️ 通过项目名称查询任务也失败: ${tasksError2.message}`);
      }
    } else {
      tasks = tasksByProjectId || [];
    }

    // 4. 构造 Prompt
    const serviceCategory = cleanField(project[FIELD_MAP_TO_DB.serviceCategory]) || '未分类';
    const projectStatus = project[FIELD_MAP_TO_DB.projectStatus] || '未知';
    const contractAmount = parseFloat(project[FIELD_MAP_TO_DB.contractAmount]) || 0;
    const receivedAmount = parseFloat(project[FIELD_MAP_TO_DB.receivedAmount]) || 0;
    const paymentRate = contractAmount > 0 ? Math.round((receivedAmount / contractAmount) * 100) : 0;
    const currentProgress = parseFloat(project[FIELD_MAP_TO_DB.currentProgress]) || 0;
    const plannedEndDate = project[FIELD_MAP_TO_DB.plannedEndDate] || '未设置';

    // 汇总最近周报内容
    let weeklyReportsSummary = '无近期周报';
    if (weeklyReports && weeklyReports.length > 0) {
      const summaries = weeklyReports.map((r, i) => {
        const date = r.report_date || '未知日期';
        const summary = r.weekly_summary || '';
        const issues = r.issues_encountered || '';
        const plan = r.next_week_plan || '';
        return `[第${i + 1}条 - ${date}] 本周完成: ${summary.slice(0, 100)}; 问题: ${issues.slice(0, 80)}; 下周计划: ${plan.slice(0, 80)}`;
      });
      weeklyReportsSummary = summaries.join('\n');
    }

    // 任务统计
    const taskCount = tasks.length;
    let taskProgressSum = 0;
    let taskProgressCount = 0;
    tasks.forEach(t => {
      const p = parseFloat(t['当前进度(%)']);
      if (!isNaN(p)) {
        taskProgressSum += p;
        taskProgressCount++;
      }
    });
    const avgTaskProgress = taskProgressCount > 0 ? Math.round(taskProgressSum / taskProgressCount) : 0;

    const prompt = `你是一位项目风险分析专家。请根据以下项目信息，分析该项目的风险状况，并以 JSON 格式返回结果。

项目信息：
- 项目名称：${projectName}
- 服务类别：${serviceCategory}
- 项目状态：${projectStatus}
- 合同金额：${contractAmount} 元
- 已收款：${receivedAmount} 元（回款率：${paymentRate}%）
- 当前进度：${currentProgress}%
- 计划结束日期：${plannedEndDate}
- 最近周报：${weeklyReportsSummary}
- 关联任务：${taskCount} 个，平均进度 ${avgTaskProgress}%

请返回以下 JSON 格式的分析结果：
{
  "riskScore": 0-100 的数字,
  "riskLevel": "低风险" | "中风险" | "高风险" | "极高风险",
  "riskAlerts": ["预警1", "预警2", ...],
  "suggestions": ["建议1", "建议2", ...],
  "analysisSummary": "简要的风险分析说明"
}

风险评分参考规则：
- 进度滞后（<50%）且无近期周报 → 高风险
- 回款率低于 50% → 中高风险
- 已超计划结束日期且未结项 → 高风险
- 其他情况适当调整。
请务必只返回纯 JSON，不要包含其他解释文字。`;

    // 5. 调用 AI 分析
    let aiResult;
    try {
      aiResult = await callAI(prompt);
      console.log(`✅ AI 分析完成: ${projectName}, 风险等级=${aiResult.riskLevel}, 评分=${aiResult.riskScore}`);
    } catch (aiErr) {
      console.error(`❌ AI 调用失败 (${projectName}):`, aiErr.message);
      aiResult = {
        riskScore: 0,
        riskLevel: '未评估',
        riskAlerts: ['AI 分析暂时不可用'],
        suggestions: [],
        analysisSummary: 'AI 分析失败，请稍后重试'
      };
    }

    // 6. 存储 AI 分析结果到 projects 表
    const analyzedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        ai_analysis_result: aiResult,
        ai_analyzed_at: analyzedAt
      })
      .eq('id', projectId);

    if (updateError) {
      console.error(`❌ 存储 AI 分析结果失败 (${projectName}):`, updateError.message);
    } else {
      console.log(`✅ AI 分析结果已存储: ${projectName}, ai_analyzed_at=${analyzedAt}`);
    }

    return { success: true, data: { ...aiResult, analyzedAt } };
  } catch (err) {
    console.error(`❌ AI 项目分析异常 (projectId=${projectId}):`, err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// GET /api/projects - 获取项目列表
// ============================================================
app.get('/api/projects', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { status, category, leader, search } = req.query;

    console.log(`📋 GET /api/projects - page=${page}, limit=${limit}, status=${status || '-'}, category=${category || '-'}, leader=${leader || '-'}, search=${search || '-'}`);

    let query = supabase.from('projects').select('*', { count: 'exact' });

    // 筛选条件
    if (status) {
      query = query.eq('项目状态', status);
    }
    if (category) {
      query = query.eq('服务类别', category);
    }
    if (leader) {
      query = query.eq('项目负责人', leader);
    }
    if (search) {
      // 模糊匹配项目名称或合同编号
      query = query.or(`项目名称.ilike.%${search}%,合同编号.ilike.%${search}%`);
    }

    // 分页 + 排序
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // 为每个项目统计关联任务数（通过 tasks.所属项目 匹配）
    const projectsWithTaskCount = await Promise.all(
      (data || []).map(async (project) => {
        const projectName = project['项目名称'];
        let taskCount = 0;

        if (projectName) {
          const { count: tc, error: taskError } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('所属项目', projectName);

          if (taskError) {
            console.warn(`⚠️ 统计项目 "${projectName}" 任务数失败:`, taskError.message);
          } else {
            taskCount = tc || 0;
          }
        }

        const mapped = mapDbToResponse(project);
        mapped.taskCount = taskCount;
        return mapped;
      })
    );

    console.log(`✅ 返回 ${projectsWithTaskCount.length} 条项目记录，总数: ${count}`);

    res.json({
      success: true,
      data: projectsWithTaskCount,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error('❌ 获取项目列表失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/projects/high-risk - 获取高风险项目列表
// ============================================================
app.get('/api/projects/high-risk', authMiddleware, async (req, res) => {
  try {
    console.log('📋 GET /api/projects/high-risk - 查询高风险项目');
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .neq('项目状态', '已删除')
      .order('项目名称');

    if (error) throw error;

    // 筛选高风险项目
    const highRisk = (data || []).filter(p => {
      const ai = p.ai_analysis_result;
      if (!ai || typeof ai !== 'object') return false;
      const level = ai.riskLevel || '';
      return level === '高风险' || level === '极高风险';
    });

    // 映射为英文响应
    const mapped = highRisk.map(p => mapDbToResponse(p));
    console.log(`✅ 高风险项目: ${mapped.length} 个`);
    res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('❌ 获取高风险项目失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/projects/:id - 获取项目详情
// ============================================================
app.get('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 GET /api/projects/${id}`);

    // 查询项目
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '项目不存在' });
      }
      throw error;
    }

    const projectName = project['项目名称'];

    // 查询关联任务（通过 tasks.project_id 或 所属项目 匹配）
    let tasks = [];
    const { data: tasksByProjectId, error: tasksError1 } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', id);

    if (tasksError1) {
      // project_id 列可能不存在，尝试通过项目名称匹配
      console.warn('⚠️ 通过 project_id 查询任务失败，尝试通过项目名称匹配:', tasksError1.message);
      const { data: tasksByName, error: tasksError2 } = await supabase
        .from('tasks')
        .select('*')
        .eq('所属项目', projectName);

      if (!tasksError2) {
        tasks = tasksByName || [];
      } else {
        console.warn('⚠️ 通过项目名称查询任务也失败:', tasksError2.message);
      }
    } else {
      tasks = tasksByProjectId || [];
    }

    // 查询关联周报（通过任务关联，按 record_date 倒序）
    let weeklyReports = [];
    if (tasks.length > 0) {
      const taskIds = tasks.map(t => t.id);
      const { data: reports, error: reportsError } = await supabase
        .from('task_progress_history')
        .select('*')
        .in('task_id', taskIds)
        .order('record_date', { ascending: false });

      if (reportsError) {
        console.warn('⚠️ 查询周报失败:', reportsError.message);
      } else {
        weeklyReports = reports || [];
      }
    }

    const result = mapDbToResponse(project);
    result.tasks = tasks;
    result.weeklyReports = weeklyReports;

    console.log(`✅ 项目详情: ${projectName}, 关联任务: ${tasks.length}, 周报: ${weeklyReports.length}`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取项目详情失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/tasks - 获取任务列表（支持多条件筛选 + 分页）
// ============================================================
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const {
      search, status, riskLevel, responsible, category, project,
      startDate, endDate, organization, page, limit
    } = req.query;

    const filters = { search, status, riskLevel, responsible, category, project, startDate, endDate };
    const org = organization || '森宇';
    const tableName = org === '风控中心' ? 'tasks_center' : 'tasks';
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    console.log(`📋 GET /api/tasks - 组织: ${org}, 筛选条件: ${JSON.stringify(filters)}, 分页: page=${pageNum}, limit=${limitNum}`);

    // 构建查询
    let query = supabase.from(tableName).select('*', { count: 'exact' });

    // 关键词搜索
    if (search) {
      query = query.ilike('任务名称', `%${search}%`);
    }

    // 状态（支持逗号分隔多个）
    if (status) {
      const statusArr = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statusArr.length > 0) query = query.in('状态', statusArr);
    }

    // 风险等级（支持逗号分隔多个）
    if (riskLevel) {
      const riskArr = riskLevel.split(',').map(s => s.trim()).filter(Boolean);
      if (riskArr.length > 0) query = query.in('风险等级', riskArr);
    }

    // 责任人
    if (responsible) {
      query = query.eq('责任人', responsible);
    }

    // 任务分类
    if (category) {
      query = query.eq('任务分类', category);
    }

    // 所属项目
    if (project) {
      query = query.eq('所属项目', project);
    }

    // 计划结束时间范围
    if (startDate) {
      query = query.gte('计划结束时间', startDate);
    }
    if (endDate) {
      query = query.lte('计划结束时间', endDate);
    }

    // 排序 + 分页
    query = query.order('created_at', { ascending: false }).range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    console.log(`✅ 任务列表返回 ${data.length} 条，共 ${count} 条`);
    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    });
  } catch (err) {
    console.error('❌ 获取任务列表失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/tasks/options - 动态提取下拉选项
// ============================================================
app.get('/api/tasks/options', authMiddleware, async (req, res) => {
  try {
    const organization = req.query.organization || '森宇';
    const tableName = organization === '风控中心' ? 'tasks_center' : 'tasks';

    console.log(`📋 GET /api/tasks/options - 组织: ${organization}，目标表: ${tableName}`);

    // 并行查询各字段的去重值
    const fields = ['责任人', '任务分类', '所属项目', '状态', '风险等级'];
    const results = await Promise.all(
      fields.map(field =>
        supabase.from(tableName).select(field).not(field, 'is', null)
      )
    );

    const extractValues = (result, field) => {
      if (result.error) {
        console.warn(`⚠️ 查询 ${field} 去重值失败:`, result.error.message);
        return [];
      }
      const values = [...new Set(result.data.map(row => row[field]).filter(Boolean))];
      return values.sort();
    };

    const options = {
      responsible: extractValues(results[0], '责任人'),
      category: extractValues(results[1], '任务分类'),
      project: extractValues(results[2], '所属项目'),
      status: extractValues(results[3], '状态'),
      riskLevel: extractValues(results[4], '风险等级'),
    };

    console.log(`✅ 下拉选项返回: 责任人 ${options.responsible.length} 个, 分类 ${options.category.length} 个, 项目 ${options.project.length} 个`);

    res.json({ success: true, data: options });
  } catch (err) {
    console.error('❌ 获取下拉选项失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/tasks/:id - 获取单个任务详情
// ============================================================
app.get('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 GET /api/tasks/${id}`);

    // 先查森宇表
    let { data: task, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    // 如果森宇表没找到，查风控中心表
    if (!task) {
      const { data: task2, error: error2 } = await supabase
        .from('tasks_center')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error2) throw error2;
      task = task2;
    }

    if (!task) {
      return res.status(404).json({ success: false, error: '任务不存在' });
    }

    // 获取里程碑（task_milestones 是公共表，通过 task_id 关联）
    const { data: milestones, error: milestonesError } = await supabase
      .from('task_milestones')
      .select('*')
      .eq('task_id', task.id)
      .order('planned_date', { ascending: true });

    if (milestonesError) {
      console.warn(`⚠️ 获取里程碑失败: ${milestonesError.message}`);
    } else {
      task.milestones = milestones || [];
      console.log(`✅ 里程碑 ${milestones?.length || 0} 条`);
    }

    console.log(`✅ 任务详情: ${task['任务名称']}`);
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('❌ 获取任务详情失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST /api/projects - 创建项目
// ============================================================
app.post('/api/projects', authMiddleware, async (req, res) => {
  try {
    console.log('📋 POST /api/projects - 请求体:', JSON.stringify(req.body, null, 2));

    const { contractNumber, projectName, serviceCategory, contractAmount, projectLeader } = req.body;

    // 必填字段校验
    const missingFields = [];
    if (!contractNumber) missingFields.push('contractNumber');
    if (!projectName) missingFields.push('projectName');
    if (!serviceCategory) missingFields.push('serviceCategory');
    if (!contractAmount) missingFields.push('contractAmount');
    if (!projectLeader) missingFields.push('projectLeader');

    if (missingFields.length > 0) {
      console.warn('⚠️ 缺少必填字段:', missingFields.join(', '));
      return res.status(400).json({
        success: false,
        error: `缺少必填字段: ${missingFields.join(', ')}`,
      });
    }

    // 英文字段映射为中文字段
    const record = mapRequestToDb(req.body);

    console.log('📝 映射后的数据库记录:', JSON.stringify(record, null, 2));

    const { data, error } = await supabase
      .from('projects')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('❌ 创建项目失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 项目创建成功:', data['合同编号']);

    // 异步同步到钉钉AI表格（不阻塞响应）
    syncProjectToDingTalk(data).then(result => {
      console.log('📤 钉钉同步结果:', result.message);
    }).catch(err => {
      console.error('❌ 钉钉同步异常:', err.message);
    });

    const responseData = mapDbToResponse(data);
    res.status(201).json({ success: true, data: responseData });
  } catch (err) {
    console.error('❌ 创建项目异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// PUT /api/projects/:id - 更新项目
// ============================================================
app.put('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 PUT /api/projects/${id} - 请求体:`, JSON.stringify(req.body, null, 2));

    // 先检查项目是否存在
    const { data: existing, error: findError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '项目不存在' });
      }
      throw findError;
    }

    // 英文字段映射为中文字段
    const record = mapRequestToDb(req.body);

    if (Object.keys(record).length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    console.log('📝 映射后的更新记录:', JSON.stringify(record, null, 2));

    const { data, error } = await supabase
      .from('projects')
      .update(record)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ 更新项目失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 项目更新成功:', data['合同编号']);

    // 异步同步到钉钉AI表格（不阻塞响应）
    syncProjectToDingTalk(data).then(result => {
      console.log('📤 钉钉同步结果:', result.message);
    }).catch(err => {
      console.error('❌ 钉钉同步异常:', err.message);
    });

    const responseData = mapDbToResponse(data);
    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('❌ 更新项目异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// DELETE /api/projects/:id - 删除项目（软删除）
// ============================================================
app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 DELETE /api/projects/${id}`);

    // 先检查项目是否存在
    const { data: existing, error: findError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '项目不存在' });
      }
      throw findError;
    }

    // 软删除：将项目状态更新为"已删除"
    const { data, error } = await supabase
      .from('projects')
      .update({
        '项目状态': '已删除',
        // 预留：删除时间和操作人字段（后续扩展）
        // deleted_at: new Date().toISOString(),
        // deleted_by: req.user?.name || req.user?.userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ 软删除项目失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 项目已软删除:', existing['合同编号'] || existing['项目名称']);

    res.json({ success: true, message: '项目已删除', data: mapDbToResponse(data) });
  } catch (err) {
    console.error('❌ 删除项目异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// GET /api/clients - 客户列表（完整版：分页 + 搜索）
// ============================================================
app.get('/api/clients', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    console.log(`📋 GET /api/clients - 查询客户列表 page=${page} limit=${limit} search="${search}"`);

    let query = supabase
      .from('clients')
      .select('id, client_name, contact_person, contact_phone, responsible_person, created_at', { count: 'exact' });

    if (search) {
      query = query.ilike('client_name', `%${search}%`);
    }

    const { data, error, count } = await query
      .order('client_name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ 获取客户列表失败:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ 客户列表返回 ${(data || []).length} 条记录，共 ${count || 0} 条`);
    res.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error('❌ 获取客户列表异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST /api/clients - 新增客户
// ============================================================
app.post('/api/clients', authMiddleware, async (req, res) => {
  try {
    console.log('📋 POST /api/clients - 请求体:', JSON.stringify(req.body, null, 2));

    const { client_name, contact_person, contact_phone, responsible_person } = req.body;

    if (!client_name) {
      console.warn('⚠️ 缺少必填字段: client_name');
      return res.status(400).json({ success: false, error: '缺少必填字段: client_name' });
    }

    const record = {
      client_name,
      contact_person: contact_person || null,
      contact_phone: contact_phone || null,
      responsible_person: responsible_person || null,
    };

    const { data, error } = await supabase
      .from('clients')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('❌ 创建客户失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 客户创建成功:', data.client_name);
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('❌ 创建客户异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// PUT /api/clients/:id - 更新客户
// ============================================================
app.put('/api/clients/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 PUT /api/clients/${id} - 请求体:`, JSON.stringify(req.body, null, 2));

    // 先检查客户是否存在
    const { data: existing, error: findError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '客户不存在' });
      }
      throw findError;
    }

    const { client_name, contact_person, contact_phone, responsible_person } = req.body;

    const record = {};
    if (client_name !== undefined) record.client_name = client_name;
    if (contact_person !== undefined) record.contact_person = contact_person;
    if (contact_phone !== undefined) record.contact_phone = contact_phone;
    if (responsible_person !== undefined) record.responsible_person = responsible_person;

    if (Object.keys(record).length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    const { data, error } = await supabase
      .from('clients')
      .update(record)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ 更新客户失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 客户更新成功:', data.client_name);
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ 更新客户异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// DELETE /api/clients/:id - 删除客户
// ============================================================
app.delete('/api/clients/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 DELETE /api/clients/${id}`);

    // 先检查客户是否存在
    const { data: existing, error: findError } = await supabase
      .from('clients')
      .select('id, client_name')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '客户不存在' });
      }
      throw findError;
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ 删除客户失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 客户已删除:', existing.client_name);
    res.json({ success: true, message: '客户已删除' });
  } catch (err) {
    console.error('❌ 删除客户异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 周报/财务接口 — 字段映射
// ============================================================
const WEEKLY_REPORT_FIELD_MAP_TO_DB = {
  projectId: 'project_id',
  businessType: 'business_type',
  reportDate: 'report_date',
  weekNumber: 'week_number',
  reportType: 'report_type',
  createdBy: 'created_by',
  currentProgress: 'current_progress',
  weeklySummary: 'weekly_summary',
  issuesEncountered: 'issues_encountered',
  nextWeekPlan: 'next_week_plan',
  riskSelfAssessment: 'risk_self_assessment',
  monthlyCompletedValue: 'monthly_completed_value',
  cumulativeCompletedValue: 'cumulative_completed_value',
  monthlyInvoicedAmount: 'monthly_invoiced_amount',
  cumulativeInvoicedAmount: 'cumulative_invoiced_amount',
  monthlyReceivedAmount: 'monthly_received_amount',
  cumulativeReceivedAmount: 'cumulative_received_amount',
  contractAmount: 'contract_amount',
  supplementalAmount: 'supplemental_amount',
  monthlyDirectCost: 'monthly_direct_cost',
  monthlyDeptCost: 'monthly_dept_cost',
  monthlyCompanyCost: 'monthly_company_cost',
  cumulativeDirectCost: 'cumulative_direct_cost',
  cumulativeDeptCost: 'cumulative_dept_cost',
  cumulativeCompanyCost: 'cumulative_company_cost',
  monthlyExternalPayment: 'monthly_external_payment',
  cumulativeExternalPayment: 'cumulative_external_payment',
  monthlyTax: 'monthly_tax',
  cumulativeTax: 'cumulative_tax',
  contractSettlementAmount: 'contract_settlement_amount',
  documentFee: 'document_fee',
  depositReceived: 'deposit_received',
  depositReturned: 'deposit_returned',
  progressNodes: 'progress_nodes',
  externalPaymentRatio: 'external_payment_ratio',
};

const WEEKLY_REPORT_FIELD_MAP_FROM_DB = {
  project_id: 'projectId',
  business_type: 'businessType',
  report_date: 'reportDate',
  week_number: 'weekNumber',
  report_type: 'reportType',
  created_by: 'createdBy',
  current_progress: 'currentProgress',
  weekly_summary: 'weeklySummary',
  issues_encountered: 'issuesEncountered',
  next_week_plan: 'nextWeekPlan',
  risk_self_assessment: 'riskSelfAssessment',
  monthly_completed_value: 'monthlyCompletedValue',
  cumulative_completed_value: 'cumulativeCompletedValue',
  monthly_invoiced_amount: 'monthlyInvoicedAmount',
  cumulative_invoiced_amount: 'cumulativeInvoicedAmount',
  monthly_received_amount: 'monthlyReceivedAmount',
  cumulative_received_amount: 'cumulativeReceivedAmount',
  contract_amount: 'contractAmount',
  supplemental_amount: 'supplementalAmount',
  monthly_direct_cost: 'monthlyDirectCost',
  monthly_dept_cost: 'monthlyDeptCost',
  monthly_company_cost: 'monthlyCompanyCost',
  cumulative_direct_cost: 'cumulativeDirectCost',
  cumulative_dept_cost: 'cumulativeDeptCost',
  cumulative_company_cost: 'cumulativeCompanyCost',
  monthly_external_payment: 'monthlyExternalPayment',
  cumulative_external_payment: 'cumulativeExternalPayment',
  monthly_tax: 'monthlyTax',
  cumulative_tax: 'cumulativeTax',
  contract_settlement_amount: 'contractSettlementAmount',
  document_fee: 'documentFee',
  deposit_received: 'depositReceived',
  deposit_returned: 'depositReturned',
  progress_nodes: 'progressNodes',
  external_payment_ratio: 'externalPaymentRatio',
};

// 财务专用字段（仅财务接口可更新）
const FINANCIAL_FIELDS = [
  'monthlyDirectCost', 'monthlyDeptCost', 'monthlyCompanyCost',
  'cumulativeDirectCost', 'cumulativeDeptCost', 'cumulativeCompanyCost',
  'monthlyTax', 'cumulativeTax',
];

// 周报请求 → 数据库记录
function mapWeeklyReportToDb(body) {
  const record = {};
  for (const [enKey, dbKey] of Object.entries(WEEKLY_REPORT_FIELD_MAP_TO_DB)) {
    if (body[enKey] !== undefined) {
      record[dbKey] = body[enKey];
    }
  }
  return record;
}

// 数据库记录 → 周报响应
function mapWeeklyReportFromDb(dbRecord) {
  if (!dbRecord) return null;
  const result = { id: dbRecord.id };
  for (const [dbKey, enKey] of Object.entries(WEEKLY_REPORT_FIELD_MAP_FROM_DB)) {
    result[enKey] = dbRecord[dbKey] !== undefined ? dbRecord[dbKey] : null;
  }
  result.createdAt = dbRecord.created_at;
  result.updatedAt = dbRecord.updated_at;
  return result;
}

// ============================================================
// 接口 1：POST /api/weekly-reports - 提交周报/月报
// ============================================================
app.post('/api/weekly-reports', authMiddleware, async (req, res) => {
  try {
    console.log('📋 POST /api/weekly-reports - 请求体:', JSON.stringify(req.body, null, 2));

    const { projectId, businessType, reportDate, reportType, createdBy, weeklySummary } = req.body;

    // 必填字段校验
    const missing = [];
    if (!projectId) missing.push('projectId');
    if (!businessType) missing.push('businessType');
    if (!reportDate) missing.push('reportDate');
    if (!reportType) missing.push('reportType');
    if (!createdBy) missing.push('createdBy');
    if (!weeklySummary) missing.push('weeklySummary');

    if (missing.length > 0) {
      console.warn('⚠️ 缺少必填字段:', missing.join(', '));
      return res.status(400).json({ success: false, error: `缺少必填字段: ${missing.join(', ')}` });
    }

    if (!['weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({ success: false, error: 'reportType 必须为 weekly 或 monthly' });
    }

    // 冲突检查：同一项目同一日期只能有一条记录
    const { data: existing, error: checkError } = await supabase
      .from('weekly_reports')
      .select('id')
      .eq('project_id', projectId)
      .eq('report_date', reportDate)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      console.warn(`⚠️ 周报冲突: projectId=${projectId}, reportDate=${reportDate}`);
      return res.status(409).json({ success: false, error: '该项目在该日期已有周报记录，请勿重复提交' });
    }

    // 月报校验：reportType 为 monthly 时，校验所有字段
    if (reportType === 'monthly') {
      const monthlyFields = [
        'monthlyCompletedValue', 'cumulativeCompletedValue',
        'monthlyInvoicedAmount', 'cumulativeInvoicedAmount',
        'monthlyReceivedAmount', 'cumulativeReceivedAmount',
      ];
      const missingMonthly = monthlyFields.filter(f => req.body[f] === undefined || req.body[f] === null);
      if (missingMonthly.length > 0) {
        console.warn('⚠️ 月报缺少字段:', missingMonthly.join(', '));
        return res.status(400).json({
          success: false,
          error: `月报缺少必填字段: ${missingMonthly.join(', ')}`,
        });
      }
    }

    const record = mapWeeklyReportToDb(req.body);

    const { data, error } = await supabase
      .from('weekly_reports')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('❌ 创建周报失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 周报创建成功:', data.id, '项目ID:', projectId);
    res.status(201).json({ success: true, data: mapWeeklyReportFromDb(data) });
  } catch (err) {
    console.error('❌ 创建周报异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 接口 2：GET /api/weekly-reports - 获取某项目所有周报
// ============================================================
app.get('/api/weekly-reports', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!projectId) {
      return res.status(400).json({ success: false, error: '缺少 projectId 参数' });
    }

    console.log(`📋 GET /api/weekly-reports - projectId=${projectId} page=${page} limit=${limit}`);

    const { data, error, count } = await supabase
      .from('weekly_reports')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ 获取周报列表失败:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ 周报列表返回 ${(data || []).length} 条记录，共 ${count || 0} 条`);
    res.json({
      success: true,
      data: (data || []).map(mapWeeklyReportFromDb),
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) {
    console.error('❌ 获取周报列表异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 接口 3：GET /api/weekly-reports/:id - 获取单条周报详情
// ============================================================
app.get('/api/weekly-reports/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 GET /api/weekly-reports/${id}`);

    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '周报不存在' });
      }
      console.error('❌ 获取周报详情失败:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 周报详情返回:', data.id);
    res.json({ success: true, data: mapWeeklyReportFromDb(data) });
  } catch (err) {
    console.error('❌ 获取周报详情异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 接口 4：PUT /api/weekly-reports/:id - 更新周报（非财务字段）
// ============================================================
app.put('/api/weekly-reports/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 PUT /api/weekly-reports/${id} - 请求体:`, JSON.stringify(req.body, null, 2));

    // 先检查记录是否存在
    const { data: existing, error: findError } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '周报不存在' });
      }
      throw findError;
    }

    // 校验填报人身份
    if (req.body.createdBy && req.body.createdBy !== existing.created_by) {
      return res.status(403).json({ success: false, error: '仅允许填报人修改' });
    }

    // 过滤掉财务字段
    const safeBody = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (!FINANCIAL_FIELDS.includes(key)) {
        safeBody[key] = value;
      }
    }

    const record = mapWeeklyReportToDb(safeBody);

    if (Object.keys(record).length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    const { data, error } = await supabase
      .from('weekly_reports')
      .update(record)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ 更新周报失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 周报更新成功:', data.id);
    res.json({ success: true, data: mapWeeklyReportFromDb(data) });
  } catch (err) {
    console.error('❌ 更新周报异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 接口 5：DELETE /api/weekly-reports/:id - 删除周报
// ============================================================
app.delete('/api/weekly-reports/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 DELETE /api/weekly-reports/${id}`);

    // 先检查记录是否存在
    const { data: existing, error: findError } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: '周报不存在' });
      }
      throw findError;
    }

    // 仅允许填报人删除
    const createdBy = req.query.createdBy || req.body.createdBy;
    if (createdBy && createdBy !== existing.created_by) {
      return res.status(403).json({ success: false, error: '仅允许填报人删除' });
    }

    const { error } = await supabase
      .from('weekly_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ 删除周报失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ 周报已删除:', id);
    res.json({ success: true, message: '周报已删除' });
  } catch (err) {
    console.error('❌ 删除周报异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 接口 6：GET /api/weekly-reports/financial/pending - 财务待填列表
// ============================================================
app.get('/api/weekly-reports/financial/pending', authMiddleware, async (req, res) => {
  try {
    // 权限校验：仅 manager 角色
    if (!req.user || !req.user.roles || !req.user.roles.manager) {
      console.warn('⛔ 财务待填列表权限不足:', req.user?.name);
      return res.status(403).json({ success: false, error: '权限不足，仅项目经理以上可访问' });
    }

    console.log('📋 GET /api/weekly-reports/financial/pending - 查询财务待填列表');

    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('report_type', 'monthly');

    if (error) {
      console.error('❌ 获取财务待填列表失败:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    // 筛选财务字段为空的记录
    const pending = (data || []).filter(r => {
      const financialNull = FINANCIAL_FIELDS.map(f => {
        const dbKey = WEEKLY_REPORT_FIELD_MAP_TO_DB[f];
        return dbKey;
      });
      return financialNull.some(key => r[key] === null || r[key] === undefined);
    });

    // 获取关联的项目名称
    const projectIds = [...new Set(pending.map(r => r.project_id).filter(Boolean))];
    const projectNameMap = {};
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, 项目名称')
        .in('id', projectIds);
      (projects || []).forEach(p => {
        projectNameMap[p.id] = p['项目名称'] || '未知项目';
      });
    }

    const result = pending.map(r => {
      const pendingFields = FINANCIAL_FIELDS.filter(f => {
        const dbKey = WEEKLY_REPORT_FIELD_MAP_TO_DB[f];
        return r[dbKey] === null || r[dbKey] === undefined;
      });
      return {
        id: r.id,
        projectId: r.project_id,
        projectName: projectNameMap[r.project_id] || '未知项目',
        businessType: r.business_type,
        reportMonth: r.report_date,
        pendingFields,
      };
    });

    console.log(`✅ 财务待填列表返回 ${result.length} 条记录`);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取财务待填列表异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 接口 7：PUT /api/weekly-reports/financial/batch - 财务批量更新
// ============================================================
app.put('/api/weekly-reports/financial/batch', authMiddleware, async (req, res) => {
  try {
    // 权限校验：仅 manager 角色
    if (!req.user || !req.user.roles || !req.user.roles.manager) {
      console.warn('⛔ 财务批量更新权限不足:', req.user?.name);
      return res.status(403).json({ success: false, error: '权限不足，仅项目经理以上可访问' });
    }

    const { records } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 records 参数或格式不正确' });
    }

    console.log(`📋 PUT /api/weekly-reports/financial/batch - 批量更新 ${records.length} 条记录`);

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const record of records) {
      try {
        const { id, ...fields } = record;
        if (!id) {
          failCount++;
          errors.push({ id: null, error: '缺少 id' });
          continue;
        }

        // 仅提取财务字段
        const updateData = {};
        for (const [key, value] of Object.entries(fields)) {
          if (FINANCIAL_FIELDS.includes(key)) {
            const dbKey = WEEKLY_REPORT_FIELD_MAP_TO_DB[key];
            updateData[dbKey] = value;
          }
        }

        if (Object.keys(updateData).length === 0) {
          failCount++;
          errors.push({ id, error: '没有可更新的财务字段' });
          continue;
        }

        const { error } = await supabase
          .from('weekly_reports')
          .update(updateData)
          .eq('id', id);

        if (error) {
          failCount++;
          errors.push({ id, error: error.message });
        } else {
          successCount++;
        }
      } catch (err) {
        failCount++;
        errors.push({ id: record.id, error: err.message });
      }
    }

    console.log(`✅ 财务批量更新完成: 成功=${successCount}, 失败=${failCount}`);
    res.json({
      success: true,
      data: { successCount, failCount, total: records.length, errors: errors.length > 0 ? errors : undefined },
    });
  } catch (err) {
    console.error('❌ 财务批量更新异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 统计接口：项目总览 KPI
// ============================================================
app.get('/api/stats/projects-overview', async (req, res) => {
  try {
    console.log('📋 GET /api/stats/projects-overview - 查询项目总览KPI');

    // 查询所有未删除的项目
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .neq('项目状态', '已删除');

    if (error) throw error;

    const list = projects || [];
    const total = list.length;

    let inProgress = 0;
    let completed = 0;
    let paused = 0;
    let planning = 0;
    let totalContractAmount = 0;
    let progressSum = 0;
    let progressCount = 0;
    const categoryCounts = {};

    list.forEach(project => {
      const status = project['项目状态'] || '';
      if (status === '进行中') inProgress++;
      else if (status === '已结项') completed++;
      else if (status === '暂停') paused++;
      else if (status === '规划中') planning++;

      // 合同金额累加
      const amount = parseFloat(project['合同金额']);
      if (!isNaN(amount)) {
        totalContractAmount += amount;
      }

      // 进度统计
      const progress = parseFloat(project['当前进度']);
      if (!isNaN(progress)) {
        progressSum += progress;
        progressCount++;
      }

      // 服务类别分布
      const cat = cleanField(project['服务类别']) || '未分类';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const avgProgress = progressCount > 0
      ? Math.round((progressSum / progressCount) * 10) / 10
      : 0;

    const result = {
      total,
      inProgress,
      completed,
      paused,
      planning,
      totalContractAmount,
      avgProgress,
      categoryCounts,
    };

    console.log(`✅ 项目总览KPI: 总数=${total}, 进行中=${inProgress}, 已结项=${completed}, 暂停=${paused}, 规划中=${planning}, 合同总金额=${totalContractAmount}, 平均进度=${avgProgress}%`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取项目总览KPI失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 统计接口：各项目进度（用于大屏条形图）
// ============================================================
app.get('/api/stats/projects-progress', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    console.log(`📋 GET /api/stats/projects-progress - limit=${limit}`);

    const { data: projects, error } = await supabase
      .from('projects')
      .select('项目名称, 当前进度')
      .neq('项目状态', '已删除')
      .order('当前进度', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const result = (projects || []).map(project => ({
      projectName: project['项目名称'] || '未知项目',
      progress: parseFloat(project['当前进度']) || 0,
    }));

    console.log(`✅ 各项目进度: 返回 ${result.length} 条记录`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取各项目进度失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 统计接口：各服务类别分布（用于大屏饼图）
// ============================================================
app.get('/api/stats/projects-category', async (req, res) => {
  try {
    console.log('📋 GET /api/stats/projects-category - 查询服务类别分布');

    const { data: projects, error } = await supabase
      .from('projects')
      .select('服务类别')
      .neq('项目状态', '已删除');

    if (error) throw error;

    const categoryMap = {};
    (projects || []).forEach(project => {
      const cat = cleanField(project['服务类别']) || '未分类';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const result = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

    console.log(`✅ 服务类别分布: ${result.length} 个类别, 详情: ${JSON.stringify(result)}`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取服务类别分布失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 统计接口：人员负荷率
// ============================================================
app.get('/api/stats/workload', authMiddleware, async (req, res) => {
  try {
    console.log('📋 GET /api/stats/workload - 计算人员负荷率');

    // 查询进行中项目数
    const { count: projectCount, error: projectError } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('项目状态', '进行中');

    if (projectError) throw projectError;

    // 查询进行中任务数（状态为"进行中"或"未开始"）
    const { count: taskCount, error: taskError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .in('状态', ['进行中', '未开始']);

    if (taskError) throw taskError;

    // 读取业务部门人数配置
    let businessPersonnel = 15; // 降级默认值
    const { data: configData, error: configError } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'business_personnel_count')
      .maybeSingle();

    if (!configError && configData && configData.value) {
      const count = typeof configData.value === 'object'
        ? (configData.value.count || configData.value.businessPersonnel || 15)
        : (parseInt(configData.value) || 15);
      businessPersonnel = count;
    }

    const weightedLoad = (projectCount || 0) * 1.0 + (taskCount || 0) * 0.1;
    const loadRate = businessPersonnel > 0
      ? Math.round((weightedLoad / businessPersonnel) * 100)
      : 0;

    console.log(`✅ 人员负荷率: ${loadRate}%, 项目数: ${projectCount || 0}, 任务数: ${taskCount || 0}, 业务人数: ${businessPersonnel}`);

    res.json({
      success: true,
      data: {
        loadRate,
        projectCount: projectCount || 0,
        taskCount: taskCount || 0,
        businessPersonnel,
        weightedLoad,
      },
    });
  } catch (err) {
    console.error('❌ 获取人员负荷率失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 周报接口：提交周报
// ============================================================
app.post('/api/projects/:id/weekly-report', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { reportDate, currentProgress, weeklySummary } = req.body;

    console.log(`📋 POST /api/projects/${id}/weekly-report - reportDate=${reportDate}, currentProgress=${currentProgress}`);

    // 必填字段校验
    const missingFields = [];
    if (!reportDate) missingFields.push('reportDate');
    if (currentProgress === undefined || currentProgress === null) missingFields.push('currentProgress');
    if (!weeklySummary) missingFields.push('weeklySummary');

    if (missingFields.length > 0) {
      console.warn(`⚠️ 缺少必填字段: ${missingFields.join(', ')}`);
      return res.status(400).json({
        success: false,
        error: `缺少必填字段: ${missingFields.join(', ')}`,
      });
    }

    // 验证项目是否存在且未删除
    const { data: project, error: findError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        console.warn(`⚠️ 项目不存在: id=${id}`);
        return res.status(404).json({ success: false, error: '项目不存在' });
      }
      throw findError;
    }

    if (project['项目状态'] === '已删除') {
      console.warn(`⚠️ 项目已删除，无法提交周报: ${project[FIELD_MAP_TO_DB.projectName] || id}`);
      return res.status(400).json({ success: false, error: '项目已删除，无法提交周报' });
    }

    const projectName = project[FIELD_MAP_TO_DB.projectName] || '未知项目';
    console.log(`✅ 项目验证通过: ${projectName} (id=${id})`);

    // 映射周报字段并插入
    const weeklyReportRecord = mapWeeklyReportRequestToDb(req.body);
    weeklyReportRecord.project_id = id;

    const { data: inserted, error: insertError } = await supabase
      .from('project_weekly_reports')
      .insert(weeklyReportRecord)
      .select()
      .single();

    if (insertError) {
      console.error('❌ 插入周报失败:', insertError);
      return res.status(500).json({ success: false, error: insertError.message });
    }

    console.log(`✅ 周报已插入: project=${projectName}, reportDate=${reportDate}`);

    // 更新 projects 表的当前进度和最近周报日期
    const projectUpdate = {};
    projectUpdate[FIELD_MAP_TO_DB.currentProgress] = currentProgress;
    projectUpdate[FIELD_MAP_TO_DB.lastWeeklyReportAt] = reportDate;

    const { error: updateError } = await supabase
      .from('projects')
      .update(projectUpdate)
      .eq('id', id);

    if (updateError) {
      console.error('⚠️ 更新项目进度失败:', updateError);
    } else {
      console.log(`✅ 项目进度已更新: ${projectName}, 当前进度=${currentProgress}%, 最近周报日期=${reportDate}`);
    }

    // 异步触发 AI 项目分析（不阻塞响应）
    triggerProjectAIAnalysis(id).then(result => {
      console.log(`🤖 AI 分析触发结果: ${result.message}`);
    }).catch(err => {
      console.error(`❌ AI 分析触发异常 (project ${id}):`, err.message);
    });

    const responseData = mapWeeklyReportDbToResponse(inserted);
    res.status(201).json({ success: true, data: responseData });
  } catch (err) {
    console.error('❌ 提交周报异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 周报接口：获取项目周报历史
// ============================================================
app.get('/api/projects/:id/weekly-reports', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 GET /api/projects/${id}/weekly-reports`);

    const { data, error } = await supabase
      .from('project_weekly_reports')
      .select('*')
      .eq('project_id', id)
      .order('report_date', { ascending: false });

    if (error) throw error;

    const result = (data || []).map(record => mapWeeklyReportDbToResponse(record));

    console.log(`✅ 周报历史: project=${id}, 共 ${result.length} 条记录`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取周报历史失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 周报接口：获取最新一条周报
// ============================================================
app.get('/api/projects/:id/weekly-report/latest', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 GET /api/projects/${id}/weekly-report/latest`);

    const { data, error } = await supabase
      .from('project_weekly_reports')
      .select('*')
      .eq('project_id', id)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const result = data ? mapWeeklyReportDbToResponse(data) : null;

    console.log(`✅ 最新周报: project=${id}, ${result ? `reportDate=${result.reportDate}` : '无记录'}`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ 获取最新周报失败:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AI 接口：手动触发单个项目 AI 分析
// ============================================================
app.post('/api/ai/project-analysis/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 POST /api/ai/project-analysis/${id}`);

    const result = await triggerProjectAIAnalysis(id);

    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error });
    }

    console.log(`✅ 项目 AI 分析完成: projectId=${id}, riskLevel=${result.data.riskLevel}`);
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('❌ 手动触发项目 AI 分析异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AI 接口：整体项目经营分析
// ============================================================
app.post('/api/ai/projects-overview', authMiddleware, async (req, res) => {
  try {
    console.log('📋 POST /api/ai/projects-overview - 开始整体项目经营分析');

    // 查询所有未删除的项目
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .neq('项目状态', '已删除');

    if (error) throw error;

    const list = projects || [];
    const total = list.length;

    if (total === 0) {
      return res.json({
        success: true,
        data: {
          stats: {
            total: 0,
            inProgress: 0,
            completed: 0,
            paused: 0,
            planning: 0,
            totalContractAmount: 0,
            avgProgress: 0,
            categoryCounts: {},
            overdueProjects: 0
          },
          aiAnalysis: {
            summary: '暂无项目数据',
            keyFindings: [],
            suggestions: []
          }
        }
      });
    }

    // 计算统计指标
    let inProgress = 0;
    let completed = 0;
    let paused = 0;
    let planning = 0;
    let totalContractAmount = 0;
    let totalReceivedAmount = 0;
    let progressSum = 0;
    let progressCount = 0;
    let overdueProjects = 0;
    const categoryCounts = {};
    const today = new Date().toISOString().split('T')[0];

    list.forEach(project => {
      const status = project[FIELD_MAP_TO_DB.projectStatus] || '';
      if (status === '进行中') inProgress++;
      else if (status === '已结项') completed++;
      else if (status === '暂停') paused++;
      else if (status === '规划中') planning++;

      // 合同金额
      const amount = parseFloat(project[FIELD_MAP_TO_DB.contractAmount]);
      if (!isNaN(amount)) totalContractAmount += amount;

      // 已收款
      const received = parseFloat(project[FIELD_MAP_TO_DB.receivedAmount]);
      if (!isNaN(received)) totalReceivedAmount += received;

      // 进度
      const progress = parseFloat(project[FIELD_MAP_TO_DB.currentProgress]);
      if (!isNaN(progress)) {
        progressSum += progress;
        progressCount++;
      }

      // 服务类别分布
      const cat = cleanField(project[FIELD_MAP_TO_DB.serviceCategory]) || '未分类';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      // 超期项目：计划结束日期 < 今天 且 状态不是已结项
      const plannedEndRaw = project[FIELD_MAP_TO_DB.plannedEndDate];
      const plannedEndDate = parseDate(plannedEndRaw);
      if (plannedEndDate && plannedEndDate < today && status !== '已结项') {
        overdueProjects++;
      }
    });

    const avgProgress = progressCount > 0
      ? Math.round((progressSum / progressCount) * 10) / 10
      : 0;

    const paymentRate = totalContractAmount > 0
      ? Math.round((totalReceivedAmount / totalContractAmount) * 100)
      : 0;

    const stats = {
      total,
      inProgress,
      completed,
      paused,
      planning,
      totalContractAmount,
      avgProgress,
      categoryCounts,
      overdueProjects,
      paymentRate
    };

    console.log(`📊 整体统计: 总数=${total}, 进行中=${inProgress}, 已结项=${completed}, 暂停=${paused}, 规划中=${planning}, 合同总金额=${totalContractAmount}, 回款率=${paymentRate}%, 平均进度=${avgProgress}%, 超期=${overdueProjects}`);

    // 构造 Prompt
    const prompt = `你是一位项目经营管理专家。请根据以下公司整体项目数据，分析经营状况：

项目总数：${total}
进行中：${inProgress}，已结项：${completed}，暂停：${paused}，规划中：${planning}
合同总金额：${totalContractAmount} 元
平均进度：${avgProgress}%
回款率：${paymentRate}%
服务类别分布：${JSON.stringify(categoryCounts)}
超期项目数：${overdueProjects}

请返回以下 JSON 格式的分析结果：
{
  "summary": "整体经营状况总结（一句话）",
  "keyFindings": ["发现1", "发现2", "发现3"],
  "suggestions": ["建议1", "建议2", "建议3"]
}
请务必只返回纯 JSON，不要包含其他解释文字。`;

    // 调用 AI
    let aiAnalysis;
    try {
      aiAnalysis = await callAI(prompt);
      console.log(`✅ 整体经营分析完成: summary=${aiAnalysis.summary?.slice(0, 50)}...`);
    } catch (aiErr) {
      console.error('❌ 整体经营 AI 分析失败:', aiErr.message);
      aiAnalysis = {
        summary: 'AI 分析暂时不可用，请稍后重试',
        keyFindings: [],
        suggestions: []
      };
    }

    res.json({ success: true, data: { stats, aiAnalysis } });
  } catch (err) {
    console.error('❌ 整体项目经营分析异常:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AI 接口：人员负荷率分析
// ============================================================
app.post('/api/ai/workload-analysis', authMiddleware, async (req, res) => {
  try {
    const { loadRate, projectCount, taskCount, businessPersonnel } = req.body;
    console.log(`📋 POST /api/ai/workload-analysis - 人员负荷率AI分析, loadRate=${loadRate}%, projectCount=${projectCount}, taskCount=${taskCount}, businessPersonnel=${businessPersonnel}`);

    // 查询项目风险分布
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('ai_analysis_result')
      .neq('项目状态', '已删除');

    if (projectError) throw projectError;

    let highRiskProjects = 0;
    let mediumRiskProjects = 0;
    let lowRiskProjects = 0;

    (projects || []).forEach(p => {
      const ai = p.ai_analysis_result;
      if (ai && typeof ai === 'object') {
        const level = ai.riskLevel || '';
        if (level === '高风险' || level === '极高风险') highRiskProjects++;
        else if (level === '中风险') mediumRiskProjects++;
        else if (level === '低风险') lowRiskProjects++;
      }
    });

    console.log(`📊 项目风险分布: 高风险=${highRiskProjects}, 中风险=${mediumRiskProjects}, 低风险=${lowRiskProjects}`);

    // 查询任务状态分布
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('状态');

    if (taskError) throw taskError;

    let inProgressTasks = 0;
    let completedTasks = 0;
    let notStartedTasks = 0;

    (tasks || []).forEach(t => {
      const status = t['状态'] || '';
      if (status === '进行中') inProgressTasks++;
      else if (status === '已完成' || status === '完成') completedTasks++;
      else if (status === '未开始') notStartedTasks++;
    });

    console.log(`📊 任务状态分布: 进行中=${inProgressTasks}, 已完成=${completedTasks}, 未开始=${notStartedTasks}`);

    // 构造 Prompt
    const prompt = `你是一位人力资源与项目管理专家。请根据以下公司人员负荷数据，分析当前的人力资源配置状况，并以 JSON 格式返回结果。

数据：
- 人员负荷率：${loadRate || 0}%
- 进行中项目数：${projectCount || 0}
- 进行中任务数：${taskCount || 0}
- 业务部门人数：${businessPersonnel || 0}
- 项目风险分布：高风险 ${highRiskProjects} 个，中风险 ${mediumRiskProjects} 个，低风险 ${lowRiskProjects} 个
- 任务状态分布：进行中 ${inProgressTasks} 个，已完成 ${completedTasks} 个，未开始 ${notStartedTasks} 个

请返回以下 JSON 格式的分析结果：
{
  "summary": "整体人员负荷状况总结（一句话）",
  "findings": ["发现1", "发现2", "发现3"],
  "suggestions": ["建议1", "建议2", "建议3"]
}
请务必只返回纯 JSON，不要包含其他解释文字。`;

    // 调用 AI
    let aiAnalysis;
    try {
      aiAnalysis = await callAI(prompt);
      console.log(`✅ 人员负荷率AI分析完成: ${aiAnalysis.summary?.slice(0, 50)}...`);
    } catch (aiErr) {
      console.error('❌ 人员负荷率AI分析失败:', aiErr.message);
      aiAnalysis = {
        summary: 'AI 分析暂时不可用，请稍后重试',
        findings: [],
        suggestions: []
      };
    }

    res.json({ success: true, data: aiAnalysis });
  } catch (err) {
    console.error('❌ 人员负荷率AI分析异常:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// AI 接口：高风险项目综合诊断
// ============================================================
app.post('/api/ai/high-risk-analysis', authMiddleware, async (req, res) => {
  try {
    const { projects } = req.body;
    console.log(`📋 POST /api/ai/high-risk-analysis - 高风险项目综合诊断, 项目数=${(projects || []).length}`);

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      console.warn('⚠️ 请求中无高风险项目数据');
      return res.status(400).json({ success: false, error: '缺少高风险项目数据' });
    }

    // 构建项目详情列表
    const projectDetails = projects.map((p, i) => {
      const alerts = (p.riskAlerts && Array.isArray(p.riskAlerts))
        ? p.riskAlerts.join('、')
        : '无';
      return `${i + 1}. ${p.name || '未知项目'}
   - 合同编号：${p.contractNumber || '无'}
   - 风险等级：${p.riskLevel || '未知'}
   - AI分析摘要：${p.analysisSummary || '无'}
   - 风险预警：${alerts}`;
    }).join('\n\n');

    // 构造 Prompt
    const prompt = `你是一位项目风险管理专家。请对以下所有高风险项目进行综合诊断分析，以 JSON 格式返回结果。

高风险项目列表：
${projectDetails}

请分析：
1. 这些高风险项目的共性问题是什么
2. 整体风险趋势
3. 按优先级给出处理建议

请返回以下 JSON 格式：
{
  "summary": "综合诊断总结（概述整体情况）",
  "keyFindings": ["关键发现1", "关键发现2", "关键发现3"],
  "suggestions": ["优先处理建议1", "建议2", "建议3"]
}
请务必只返回纯 JSON，不要包含其他解释文字。`;

    // 调用 AI
    let aiAnalysis;
    try {
      aiAnalysis = await callAI(prompt);
      console.log(`✅ 高风险项目综合诊断完成: ${aiAnalysis.summary?.slice(0, 50)}...`);
    } catch (aiErr) {
      console.error('❌ 高风险项目综合诊断 AI 调用失败:', aiErr.message);
      aiAnalysis = {
        summary: 'AI 分析暂时不可用，请稍后重试',
        keyFindings: [],
        suggestions: []
      };
    }

    res.json({ success: true, data: aiAnalysis });
  } catch (err) {
    console.error('❌ 高风险项目综合诊断失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 钉钉视频会议管理接口
// ============================================================

// 1. 创建视频会议
app.post('/api/meeting/create', authMiddleware, async (req, res) => {
  try {
    const { projectId, meetingTitle, startTime, duration } = req.body;
    console.log(`📋 POST /api/meeting/create - 创建视频会议: projectId=${projectId}, meetingTitle="${meetingTitle}"`);

    // 校验必填字段
    if (!projectId) {
      console.warn('⚠️ 创建会议失败: 缺少 projectId');
      return res.status(400).json({ success: false, error: '缺少项目ID (projectId)' });
    }
    if (!meetingTitle) {
      console.warn('⚠️ 创建会议失败: 缺少 meetingTitle');
      return res.status(400).json({ success: false, error: '缺少会议标题 (meetingTitle)' });
    }

    // 从 JWT 中获取当前用户钉钉 openId
    const openId = req.user?.openId;
    if (!openId) {
      console.warn('⚠️ 创建会议失败: 无法获取当前用户 openId');
      return res.status(400).json({ success: false, error: '无法获取用户信息，请重新登录' });
    }
    console.log(`📋 会议创建者: openId=${openId}`);

    // 获取钉钉 Access Token
    const accessToken = await getDingTalkAccessToken();
    if (!accessToken) {
      console.error('❌ 创建会议失败: 无法获取钉钉 Access Token');
      return res.status(500).json({ success: false, error: '钉钉认证失败，请稍后重试' });
    }

    // 计算会议时间
    const meetingDuration = duration || 60; // 默认 60 分钟
    const now = new Date();
    const meetingStartTime = startTime || now.toISOString();
    const meetingEndTime = new Date(now.getTime() + meetingDuration * 60 * 1000).toISOString();

    console.log(`📋 会议参数: openId=${openId}, duration=${meetingDuration}分钟, startTime=${meetingStartTime}, endTime=${meetingEndTime}`);

    // 调用钉钉 API 创建会议
    let meetingResult;
    try {
      meetingResult = await createDingTalkMeeting(accessToken, openId, {
        meetingTitle,
        startTime: meetingStartTime,
        endTime: meetingEndTime,
      });
    } catch (dingErr) {
      const errMsg = dingErr.response?.data || dingErr.message;
      console.error(`❌ 钉钉创建会议 API 调用失败: openId=${openId}, error=${JSON.stringify(errMsg).slice(0, 500)}`);
      return res.status(502).json({ success: false, error: `钉钉会议创建失败: ${dingErr.response?.data?.message || dingErr.message}` });
    }

    const meetingId = meetingResult.conferenceId;
    const joinUrl = meetingResult.joinUrl || '';
    const meetingCode = meetingResult.meetingCode || '';

    console.log(`✅ 会议创建成功: openId=${openId}, meetingId=${meetingId}, meetingCode=${meetingCode}`);

    // 将会议信息缓存到 system_config 表
    const cacheValue = {
      meetingId,
      meetingCode,
      joinUrl,
      projectId,
      meetingTitle,
      openId,
      status: 'active',
      participantCount: 0,
      startTime: meetingStartTime,
      endTime: meetingEndTime,
      createdAt: new Date().toISOString(),
    };

    try {
      await supabase
        .from('system_config')
        .upsert({
          key: `meeting_${meetingId}`,
          value: cacheValue,
          updated_at: new Date().toISOString(),
        });
      console.log(`✅ 会议信息已缓存: key=meeting_${meetingId}`);
    } catch (cacheErr) {
      console.warn(`⚠️ 会议信息缓存失败（不影响创建结果）: ${cacheErr.message}`);
    }

    res.json({
      success: true,
      data: {
        meetingId,
        joinUrl,
        meetingCode,
        conferenceId: meetingId,
        status: 'active',
        participantCount: 0,
      },
    });
  } catch (err) {
    console.error('❌ 创建会议失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. 查询会议状态
app.get('/api/meeting/status/:id', authMiddleware, async (req, res) => {
  try {
    const meetingId = req.params.id;
    console.log(`📋 GET /api/meeting/status/${meetingId} - 查询会议状态`);

    // 优先检查本地缓存
    let cachedInfo = null;
    try {
      const { data: cacheData } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', `meeting_${meetingId}`)
        .maybeSingle();
      if (cacheData && cacheData.value) {
        cachedInfo = cacheData.value;
        console.log(`📋 会议状态命中缓存: meetingId=${meetingId}, status=${cachedInfo.status}`);
      }
    } catch (cacheErr) {
      console.warn(`⚠️ 读取会议缓存失败: ${cacheErr.message}`);
    }

    // 异步刷新钉钉最新状态（不阻塞响应）
    getDingTalkAccessToken().then(accessToken => {
      if (!accessToken) return;
      return getDingTalkMeetingInfo(accessToken, meetingId).then(async (dingInfo) => {
        const updatedValue = {
          ...(cachedInfo || {}),
          meetingId,
          status: dingInfo.status || 'active',
          participantCount: dingInfo.participantCount || 0,
          joinUrl: dingInfo.joinUrl || cachedInfo?.joinUrl || '',
          meetingCode: dingInfo.meetingCode || cachedInfo?.meetingCode || '',
          lastRefreshedAt: new Date().toISOString(),
        };
        await supabase
          .from('system_config')
          .upsert({
            key: `meeting_${meetingId}`,
            value: updatedValue,
            updated_at: new Date().toISOString(),
          });
        console.log(`✅ 会议缓存已异步刷新: meetingId=${meetingId}`);
      }).catch(err => {
        console.warn(`⚠️ 异步刷新会议状态失败: meetingId=${meetingId}, error=${err.message}`);
      });
    }).catch(err => {
      console.warn(`⚠️ 异步刷新时获取 Token 失败: ${err.message}`);
    });

    // 优先返回缓存状态
    if (cachedInfo) {
      return res.json({
        success: true,
        data: {
          meetingId,
          joinUrl: cachedInfo.joinUrl || '',
          meetingCode: cachedInfo.meetingCode || '',
          status: cachedInfo.status || 'active',
          participantCount: cachedInfo.participantCount || 0,
          startTime: cachedInfo.startTime || '',
          endTime: cachedInfo.endTime || '',
        },
      });
    }

    // 无缓存时实时查询钉钉
    const accessToken = await getDingTalkAccessToken();
    if (!accessToken) {
      return res.status(500).json({ success: false, error: '钉钉认证失败，请稍后重试' });
    }

    let dingInfo;
    try {
      dingInfo = await getDingTalkMeetingInfo(accessToken, meetingId);
    } catch (dingErr) {
      const errMsg = dingErr.response?.data || dingErr.message;
      console.error(`❌ 钉钉查询会议 API 失败: ${JSON.stringify(errMsg).slice(0, 500)}`);
      return res.status(502).json({ success: false, error: `钉钉会议查询失败: ${dingErr.response?.data?.message || dingErr.message}` });
    }

    res.json({
      success: true,
      data: {
        meetingId,
        joinUrl: dingInfo.joinUrl || '',
        meetingCode: dingInfo.meetingCode || '',
        status: dingInfo.status || 'active',
        participantCount: dingInfo.participantCount || 0,
        startTime: dingInfo.startTime || '',
        endTime: dingInfo.endTime || '',
      },
    });
  } catch (err) {
    console.error('❌ 查询会议状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. 关闭视频会议
app.post('/api/meeting/close/:id', authMiddleware, async (req, res) => {
  try {
    const meetingId = req.params.id;
    console.log(`📋 POST /api/meeting/close/${meetingId} - 关闭视频会议`);

    const accessToken = await getDingTalkAccessToken();
    if (!accessToken) {
      console.error('❌ 关闭会议失败: 无法获取钉钉 Access Token');
      return res.status(500).json({ success: false, error: '钉钉认证失败，请稍后重试' });
    }

    try {
      await closeDingTalkMeeting(accessToken, meetingId);
    } catch (dingErr) {
      const errMsg = dingErr.response?.data || dingErr.message;
      console.error(`❌ 钉钉关闭会议 API 失败: ${JSON.stringify(errMsg).slice(0, 500)}`);
      return res.status(502).json({ success: false, error: `钉钉会议关闭失败: ${dingErr.response?.data?.message || dingErr.message}` });
    }

    // 更新本地缓存状态为已关闭
    try {
      const { data: cacheData } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', `meeting_${meetingId}`)
        .maybeSingle();

      const updatedValue = {
        ...(cacheData?.value || {}),
        meetingId,
        status: 'closed',
        closedAt: new Date().toISOString(),
      };

      await supabase
        .from('system_config')
        .upsert({
          key: `meeting_${meetingId}`,
          value: updatedValue,
          updated_at: new Date().toISOString(),
        });
      console.log(`✅ 会议缓存已更新为已关闭: meetingId=${meetingId}`);
    } catch (cacheErr) {
      console.warn(`⚠️ 更新会议缓存失败: ${cacheErr.message}`);
    }

    console.log(`✅ 会议已关闭: meetingId=${meetingId}`);
    res.json({ success: true, data: { meetingId, status: 'closed' } });
  } catch (err) {
    console.error('❌ 关闭会议失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. 钉钉事件回调接收地址（无需认证）
app.post('/api/meeting/callback', async (req, res) => {
  try {
    console.log('📋 POST /api/meeting/callback - 钉钉会议事件回调');
    console.log('📦 回调数据:', JSON.stringify(req.body).slice(0, 500));

    const eventData = req.body;
    // 处理会议状态变更事件
    if (eventData && eventData.conferenceId) {
      const meetingId = eventData.conferenceId;
      const eventType = eventData.eventType || 'unknown';

      console.log(`📋 会议事件: meetingId=${meetingId}, eventType=${eventType}`);

      // 更新本地缓存
      try {
        const { data: cacheData } = await supabase
          .from('system_config')
          .select('value')
          .eq('key', `meeting_${meetingId}`)
          .maybeSingle();

        const updatedValue = {
          ...(cacheData?.value || {}),
          meetingId,
          status: eventData.status || 'updated',
          participantCount: eventData.participantCount || 0,
          lastEventAt: new Date().toISOString(),
          lastEventType: eventType,
        };

        await supabase
          .from('system_config')
          .upsert({
            key: `meeting_${meetingId}`,
            value: updatedValue,
            updated_at: new Date().toISOString(),
          });
        console.log(`✅ 会议回调缓存已更新: meetingId=${meetingId}, eventType=${eventType}`);
      } catch (cacheErr) {
        console.warn(`⚠️ 回调更新缓存失败: ${cacheErr.message}`);
      }
    }

    // 钉钉回调要求返回加密的 "success"
    res.json({ success: true });
  } catch (err) {
    console.error('❌ 会议回调处理失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 启动服务器
// ============================================================
// ============================================================
// 钉钉消息发送函数
// ============================================================
async function sendDingTalkMessage(message) {
  try {
    const webhookUrl = process.env.DINGTALK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('⚠️ DINGTALK_WEBHOOK_URL 未配置，跳过发送');
      return { success: false, error: 'webhook未配置' };
    }
    const response = await axios.post(webhookUrl, {
      msgtype: 'markdown',
      markdown: {
        title: '📋 周报提交提醒',
        text: message,
      },
    });
    if (response.data.errcode === 0) {
      console.log('✅ 钉钉消息发送成功');
      return { success: true };
    } else {
      console.error('❌ 钉钉消息发送失败:', response.data);
      return { success: false, error: response.data.errmsg };
    }
  } catch (err) {
    console.error('❌ 钉钉消息发送异常:', err.message);
    return { success: false, error: err.message };
  }
}

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`✅ 钉钉 AppKey: ${DINGTALK_APP_KEY.slice(0, 8)}...`);
});

// ============================================================
// 定时任务：每天早上 8:30 全量风险分析
// ============================================================
cron.schedule('30 8 * * *', async () => {
  console.log('⏰ 定时任务启动：全量风险分析');

  // ============================================================
  // 1. 任务系统全量分析
  // ============================================================
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id');
    if (error) throw error;
    console.log(`📋 任务系统分析：共 ${tasks.length} 个任务需要分析`);
    let taskSuccessCount = 0;
    let taskFailCount = 0;
    for (const task of tasks) {
      try {
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
          taskSuccessCount++;
          console.log(`✅ 任务 ${task.id} 分析完成，风险等级: ${result.riskLevel}`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        taskFailCount++;
        console.error(`❌ 任务 ${task.id} 分析失败:`, err.message);
      }
    }
    console.log(`✅ 任务系统完成：成功 ${taskSuccessCount}，失败 ${taskFailCount}`);
    // 更新整体风险指数
    await updateOverallRiskIndex();
  } catch (err) {
    console.error('❌ 任务系统分析阶段失败:', err);
  }

  // ============================================================
  // 2. 项目系统全量分析
  // ============================================================
  try {
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .neq('项目状态', '已删除');

    if (projectError) throw projectError;

    const projectList = projects || [];
    const totalProjects = projectList.length;
    console.log(`📋 项目系统分析：共 ${totalProjects} 个项目需要分析`);

    let projectSuccessCount = 0;
    let projectFailCount = 0;

    for (let i = 0; i < projectList.length; i++) {
      const project = projectList[i];
      const index = i + 1;
      try {
        const result = await triggerProjectAIAnalysis(project.id);
        if (result.success && result.data) {
          projectSuccessCount++;
          console.log(`🤖 项目分析 (${index}/${totalProjects}): projectId=${project.id} → 风险等级: ${result.data.riskLevel}`);
        } else {
          projectFailCount++;
          console.warn(`⚠️ 项目分析 (${index}/${totalProjects}): projectId=${project.id} → 失败: ${result.error || '未知错误'}`);
        }
      } catch (err) {
        projectFailCount++;
        console.error(`❌ 项目分析 (${index}/${totalProjects}): projectId=${project.id} → 异常: ${err.message}`);
      }
      // 间隔 500ms 避免 API 限流
      if (i < projectList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ 项目系统完成：成功 ${projectSuccessCount}，失败 ${projectFailCount}`);

    // 更新整体项目健康度
    await updateOverallProjectHealth();
  } catch (err) {
    console.error('❌ 项目系统分析阶段失败:', err);
  }

  console.log('✅ 定时任务全部完成');
});

// ============================================================
// 周报提交提醒（每周五 16:00）
// ============================================================
cron.schedule('0 16 * * 5', async () => {
  console.log('⏰ 定时任务启动：周报提交提醒');
  try {
    // 获取所有在施项目（排除已删除和已结项）
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, 项目名称, 项目负责人, 实际项目负责人')
      .in('项目状态', ['进行中', '暂停', '规划中']);

    if (error) throw error;

    if (!projects || projects.length === 0) {
      console.log('📋 没有在施项目，跳过提醒');
      return;
    }

    // 构建消息
    const projectList = projects.map(p => {
      const leader = p['实际项目负责人'] || p['项目负责人'] || '未指定';
      return `- **${p['项目名称']}**（负责人：${leader}）`;
    }).join('\n');

    const message = `## 📋 周报提交提醒

各位项目负责人，请于今日下班前提交本周项目周报。

**在施项目列表：**
${projectList}

**提交入口：** [点击进入项目管理后台](https://dashboard.senyuzixun.com/project-manager)

⏰ 提醒时间：${new Date().toLocaleString('zh-CN')}`;

    await sendDingTalkMessage(message);
    console.log('✅ 周报提醒已发送');
  } catch (err) {
    console.error('❌ 周报提醒定时任务失败:', err);
  }
});