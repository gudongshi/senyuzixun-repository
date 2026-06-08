const WebSocket = require('ws');
const dotenv = require('dotenv');
const https = require('https');

// 1. 加载环境变量
dotenv.config();

const APP_KEY = process.env.APP_ID;     // 对应 .env 中的 APP_ID
const APP_SECRET = process.env.APP_SECRET; // 对应 .env 中的 APP_SECRET

// 2. 获取 Access Token
function getAccessToken() {
    return new Promise((resolve, reject) => {
        const url = `https://oapi.dingtalk.com/gettoken?appkey=${APP_KEY}&appsecret=${APP_SECRET}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.errcode === 0) {
                        resolve(result.access_token);
                    } else {
                        reject(new Error(`获取 Token 失败: ${result.errmsg}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// 3. 获取 Stream 连接端点 (Endpoint 和 Ticket)
function getStreamConfig(accessToken) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            "clientId": APP_KEY,
            "clientSecret": APP_SECRET
        });

        const options = {
            hostname: 'api.dingtalk.com',
            port: 443,
            path: '/v1.0/gateway/connections/open',
            method: 'POST',
            headers: {
                'x-acs-dingtalk-access-token': accessToken,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(result);
                    } else {
                        reject(new Error(`获取连接配置失败: ${JSON.stringify(result)}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 4. 启动 Stream 连接
async function startStream() {
    try {
        console.log('🔄 正在获取 Access Token...');
        const token = await getAccessToken();
        console.log('✅ Token 获取成功');

        console.log('🔄 正在获取 Stream 连接配置...');
        const config = await getStreamConfig(token);
        console.log('✅ 连接配置获取成功');
        
        const { endpoint, ticket } = config;
        const wsUrl = `wss://${endpoint}/connect?ticket=${ticket}`;
        
        console.log(`🔌 正在连接 Stream...`);
        
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            console.log('✅ Stream 连接已建立！');
            
            // 5. 发送订阅请求
            const subscribeMsg = {
                action: 'subscribe',
                topic: '/v1.0/im/bot/messages/get' 
            };
            
            ws.send(JSON.stringify(subscribeMsg));
            console.log('📩 已发送订阅请求: /v1.0/im/bot/messages/get');
        });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            
            // 过滤掉心跳包
            if (message.type === 'SYSTEM') {
                console.log('❤️ 收到心跳');
                return;
            }

            console.log('\n========================================');
            console.log('🤖 收到【机器人】原始消息:');
            console.log('Headers:', JSON.stringify(message.headers, null, 2));
            console.log('Body:', JSON.stringify(message.data, null, 2));
            console.log('========================================\n');
        });

        ws.on('error', (err) => {
            console.error('❌ WebSocket 错误:', err.message);
        });

        ws.on('close', () => {
            console.log('⚠️ 连接已关闭，5秒后尝试重连...');
            setTimeout(startStream, 5000);
        });

    } catch (err) {
        console.error('❌ 启动失败:', err.message);
        console.log('5秒后重试...');
        setTimeout(startStream, 5000);
    }
}

// 启动
startStream();