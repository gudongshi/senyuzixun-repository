const { DWClient } = require('dingtalk-stream-sdk-nodejs');
const axios = require('axios');
require('dotenv').config();

const APP_KEY = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;

console.log('🚀 正在初始化 Stream SDK...');

const client = new DWClient({
    clientId: APP_KEY,
    clientSecret: APP_SECRET,
});

// ---------- 去重缓存（基于内容 + 发送者 + 时间窗口）----------
const processedCache = new Map(); // key => timestamp
const CACHE_DURATION_MS = 120000; // 2分钟，覆盖钉钉的重推间隔（约60秒）

function isDuplicate(senderId, textContent, currentTime) {
    const key = `${senderId}_${textContent}`;
    const lastTime = processedCache.get(key);
    if (lastTime && (currentTime - lastTime) < CACHE_DURATION_MS) {
        return true;
    }
    processedCache.set(key, currentTime);
    // 清理过期缓存（简单防止内存溢出）
    if (processedCache.size > 1000) {
        const now = Date.now();
        for (let [k, t] of processedCache.entries()) {
            if (now - t > CACHE_DURATION_MS) processedCache.delete(k);
        }
    }
    return false;
}

// ---------- 获取 Access Token ----------
async function getAccessToken() {
    try {
        const url = 'https://oapi.dingtalk.com/gettoken';
        const response = await axios.get(url, {
            params: { appkey: APP_KEY, appsecret: APP_SECRET }
        });
        if (response.data.errcode === 0) return response.data.access_token;
        console.error('❌ 获取 Token 失败:', response.data);
        return null;
    } catch (err) {
        console.error('❌ 获取 Token 异常:', err.message);
        return null;
    }
}

// ---------- 发送群消息 ----------
async function replyToGroup(conversationId, text) {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    try {
        const apiUrl = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send';
        const payload = {
            robotCode: APP_KEY,
            openConversationId: conversationId,
            msgKey: 'sampleText',
            msgParam: JSON.stringify({ content: text })
        };
        const response = await axios.post(apiUrl, payload, {
            headers: {
                'x-acs-dingtalk-access-token': accessToken,
                'Content-Type': 'application/json'
            }
        });
        if (response.status === 200) console.log('✅ 消息发送成功');
        else console.error('❌ 发送失败:', response.data);
    } catch (err) {
        console.error('❌ 请求异常:', err.response?.data || err.message);
    }
}

// ---------- 注册消息监听器 ----------
client.registerCallbackListener('/v1.0/im/bot/messages/get', async (message) => {
    try {
        const data = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
        const senderNick = data.senderNick;
        const senderId = data.senderId;
        const textContent = data.text?.content;
        const conversationId = data.conversationId;
        const msgType = data.msgtype;

        console.log(`\n📨 收到消息 from ${senderNick}: ${textContent || '(非文本)'}`);

        // 忽略机器人自己的消息
        const BOT_NICK_NAMES = ['森宇任务助手', '森宇任务项目管理系统'];
        if (BOT_NICK_NAMES.includes(senderNick)) {
            console.log('⏭️ 忽略机器人自己的消息');
            return;
        }

        // ⭐⭐⭐ 关键去重：基于发送者 + 消息内容 + 时间窗口 ⭐⭐⭐
        if (msgType === 'text' && textContent) {
            const now = Date.now();
            if (isDuplicate(senderId, textContent, now)) {
                console.log('⏭️ 检测到重复推送（60秒内相同内容），已忽略回复');
                return;
            }
            
            const replyText = `你好，${senderNick}！我是森宇任务助手。我收到了：“${textContent}”。`;
            console.log(`🔄 准备回复: ${replyText}`);
            await replyToGroup(conversationId, replyText);
        }
    } catch (err) {
        console.error('❌ 处理消息出错:', err);
    }
});

// 启动连接
client.connect()
    .then(() => console.log('✅ Stream SDK 连接已建立，正在监听消息...'))
    .catch(err => {
        console.error('❌ 连接失败:', err);
        process.exit(1);
    });

process.on('SIGINT', () => {
    console.log('👋 退出程序');
    process.exit(0);
});