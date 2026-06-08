import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 Supabase 配置');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase 配置已加载');

// 钉钉应用配置
const DINGTALK_APP_KEY = process.env.APP_ID || '';
const DINGTALK_APP_SECRET = process.env.APP_SECRET || '';

// AI表格配置（多维表格ID）
const DINGTALK_AI_TABLE_ID = process.env.DINGTALK_AI_TABLE_ID || '';

// 缓存 access_token
let dingtalkAccessToken: string | null = null;
let tokenExpireTime: number = 0;

// 缓存用户姓名
const userNameCache = new Map<string, string>();

// 获取钉钉 Access Token
async function getDingTalkAccessToken(): Promise<string | null> {
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

// 根据 UserId 获取用户姓名
async function getUserNameByUserId(userId: string): Promise<string> {
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
    const url = `https://oapi.dingtalk.com/topapi/v2/user/get`;
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
          userNameCache.delete(firstKey);
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

app.use(cors());

// 调试 + JSON 解析合并
app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    console.log('🔍 原始请求体:', data);
    (req as any).rawBody = data;
    
    let fixedData = data;
    try {
      fixedData = fixedData.replace(/"\["([^"]+)"\]"/g, '["$1"]');
      fixedData = fixedData.replace(/"\[([^\]]+)\]"/g, '[$1]');
      req.body = JSON.parse(fixedData);
      console.log('✅ JSON 解析成功');
    } catch (e) {
      console.error('❌ JSON 解析失败:', e);
      req.body = {};
    }
    next();
  });
});

// 辅助函数
function parseProgress(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const match = value.match(/^([\d.]+)%?$/);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

function timestampToBeijingDate(timestamp: number): string {
  const beijingTimestamp = timestamp + 28800000;
  const date = new Date(beijingTimestamp);
  return date.toISOString().split('T')[0];
}

function parseDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'number') return timestampToBeijingDate(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const timestamp = parseInt(value);
    return timestampToBeijingDate(timestamp);
  }
  const dateStr = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  console.warn(`⚠️ 无法解析的日期: ${value}`);
  return null;
}

function cleanField(value: any): string {
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

function parseMilestones(milestonesArray: any[]): any[] {
  if (!Array.isArray(milestonesArray)) return [];
  return milestonesArray.map(m => {
    const milestoneName = m.TextField_1ET9FKVXORGG0 || m['里程碑名称'] || m['里程碑'] || '';
    let plannedDate = m.DDDateField_1ALJFR1YYQWW0 || m['计划完成日期'] || '';
    let actualDate = m.DDDateField_115E25X500740 || m['实际完成日期'] || '';
    if (plannedDate && typeof plannedDate === 'number') plannedDate = timestampToBeijingDate(plannedDate);
    if (actualDate && typeof actualDate === 'number') actualDate = timestampToBeijingDate(actualDate);
    return {
      milestone_name: milestoneName,
      planned_date: plannedDate || null,
      actual_date: actualDate || null,
    };
  }).filter(m => m.milestone_name);
}

app.post('/api/ai-table-webhook', async (req, res) => {
  try {
    console.log('\n----------------------------------------');
    console.log('📩 收到 AI 表格 Webhook 推送');
    console.log('📦 请求体:', JSON.stringify(req.body, null, 2));

    const data = req.body;
    const taskName = cleanField(data['任务名称'] || data.taskName);
    if (!taskName) {
      console.warn('⚠️ 未找到任务名称字段，跳过更新');
      return res.status(200).json({ success: true, message: 'Ignored' });
    }

    const taskCategory = cleanField(data['任务分类']);
    const project = cleanField(data['所属项目']);
    const status = cleanField(data['状态']) || '未开始';
    let responsible = cleanField(data['责任人']);
    const riskLevel = cleanField(data['风险等级']);
    const remark = cleanField(data['备注']);

    // 实际开始时间和实际结束时间
    const actualStart = parseDate(data['实际开始时间']);
    const actualEnd = parseDate(data['实际结束时间']);

    if (responsible && typeof responsible === 'string' && /^\d+$/.test(responsible)) {
      console.log(`🔄 正在转换责任人 ID: ${responsible} -> 姓名...`);
      const userName = await getUserNameByUserId(responsible);
      if (userName !== responsible) {
        console.log(`✅ 责任人 ID 转换成功: ${responsible} -> ${userName}`);
        responsible = userName;
      }
    }

    const progressRaw = data['当前进度(%)'] || data.progress;
    let progressValue: number | null = null;
    if (progressRaw !== undefined && progressRaw !== null && progressRaw !== '') {
      const progressStr = String(progressRaw).replace('%', '');
      const parsed = parseFloat(progressStr);
      if (!isNaN(parsed)) progressValue = parsed;
    }

    const planStart = parseDate(data['计划开始时间']);
    const planEnd = parseDate(data['计划结束时间']);

    console.log(`📅 日期转换: 计划开始 ${data['计划开始时间']} -> ${planStart}, 计划结束 ${data['计划结束时间']} -> ${planEnd}`);
    console.log(`📅 实际日期: 实际开始 ${data['实际开始时间']} -> ${actualStart}, 实际结束 ${data['实际结束时间']} -> ${actualEnd}`);

    const record: any = {
      '任务名称': taskName,
      title: taskName,
      '状态': status,
      status: status,
    };
    if (progressValue !== null) record['当前进度(%)'] = progressValue;
    if (responsible) { record['责任人'] = responsible; record.assignee = responsible; }
    if (riskLevel) record['风险等级'] = riskLevel;
    if (taskCategory) record['任务分类'] = taskCategory;
    if (project) record['所属项目'] = project;
    if (planStart) record['计划开始时间'] = planStart;
    if (remark) record['备注'] = remark;
    if (planEnd) { record['计划结束时间'] = planEnd; record.due_date = planEnd; }
    // 新增实际时间字段
    if (actualStart) record['实际开始时间'] = actualStart;
    if (actualEnd) record['实际结束时间'] = actualEnd;

    console.log(`🔄 处理任务 "${taskName}":`, record);

    const { data: existing, error: selectError } = await supabase
      .from('tasks')
      .select('id')
      .eq('任务名称', taskName)
      .maybeSingle();

    if (selectError) {
      console.error('❌ 查询失败:', selectError);
      return res.status(500).json({ success: false, error: selectError.message });
    }

    let taskId: string | null = null;
    let error;
    if (existing) {
      const { error: updateError } = await supabase.from('tasks').update(record).eq('任务名称', taskName);
      error = updateError;
      taskId = existing.id;
      console.log(`📝 更新现有任务: ${taskName}`);
    } else {
      const { data: inserted, error: insertError } = await supabase.from('tasks').insert(record).select('id');
      error = insertError;
      if (inserted && inserted.length > 0) taskId = inserted[0].id;
      console.log(`✨ 插入新任务: ${taskName}`);
    }

    if (error) {
      console.error('❌ Supabase 操作失败:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const milestones = data['里程碑明细'];
    if (milestones && Array.isArray(milestones) && taskId) {
      await supabase.from('task_milestones').delete().eq('task_id', taskId);
      const toInsert = parseMilestones(milestones).map(m => ({ ...m, task_id: taskId }));
      if (toInsert.length > 0) {
        const { error: insError } = await supabase.from('task_milestones').insert(toInsert);
        if (insError) console.error('❌ 插入里程碑失败:', insError);
        else console.log(`✅ 插入 ${toInsert.length} 条里程碑`);
      }
    }

    console.log('✅ Supabase 操作成功');
    res.status(200).json({ success: true, message: 'Synced' });
  } catch (err) {
    console.error('❌ 处理异常:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.post('/api/milestones', async (req, res) => {
  try {
    console.log('\n----------------------------------------');
    console.log('📩 收到里程碑数据推送');
    console.log('📦 请求体:', JSON.stringify(req.body, null, 2));

    const { taskName, milestones } = req.body;
    if (!taskName || !Array.isArray(milestones)) {
      console.warn('⚠️ 缺少任务名称或里程碑数组');
      return res.status(400).json({ success: false, error: 'Missing taskName or milestones array' });
    }

    const { data: task, error: findError } = await supabase
      .from('tasks')
      .select('id')
      .eq('任务名称', taskName)
      .maybeSingle();

    if (findError) {
      console.error('❌ 查询任务失败:', findError);
      return res.status(500).json({ success: false, error: findError.message });
    }

    if (!task) {
      console.warn(`⚠️ 未找到任务: ${taskName}`);
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const taskId = task.id;
    await supabase.from('task_milestones').delete().eq('task_id', taskId);
    const milestonesToInsert = parseMilestones(milestones).map(m => ({ ...m, task_id: taskId }));

    if (milestonesToInsert.length > 0) {
      const { error: insError } = await supabase.from('task_milestones').insert(milestonesToInsert);
      if (insError) {
        console.error('❌ 插入里程碑失败:', insError);
        return res.status(500).json({ success: false, error: insError.message });
      }
      console.log(`✅ 已为任务 ${taskName} 插入 ${milestonesToInsert.length} 条里程碑`);
    } else {
      console.log(`⚠️ 里程碑数组为空，已清空任务 ${taskName} 的里程碑`);
    }

    res.status(200).json({ success: true, milestones: milestonesToInsert });
  } catch (err) {
    console.error('❌ 处理里程碑异常:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
});