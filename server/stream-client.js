import { DingTalkStreamClient } from 'dingtalk-stream-sdk-nodejs';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function main() {
  // 从 .env 读取 AppKey 和 AppSecret
  const client = new DingTalkStreamClient({
    clientId: process.env.APP_ID,       // 对应 .env 中的 APP_ID
    clientSecret: process.env.APP_SECRET // 对应 .env 中的 APP_SECRET
  });

  // 注册回调处理器
  // 这里可以处理各种事件，比如卡片回调、机器人消息等
  client.registerCallbackHandler('/v1.0/card/instances/callback', async (headers, body) => {
    console.log('----------------------------------------');
    console.log('📩 收到钉钉 Stream 回调');
    console.log('Headers:', headers);
    console.log('Body:', JSON.stringify(body, null, 2));
    console.log('----------------------------------------');
    
    // 在这里处理你的业务逻辑，比如更新 Supabase 数据
    return {
      code: 200,
      message: 'success'
    };
  });

  // 启动长连接
  await client.start();
  console.log('✅ Stream 客户端已启动，正在监听钉钉消息...');
}

main().catch((err) => {
  console.error('❌ 启动失败:', err);
  process.exit(1);
});