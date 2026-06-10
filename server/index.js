require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// ======================== 钉钉配置 ========================
const DINGTALK_APP_KEY = process.env.DINGTALK_APP_KEY;
const DINGTALK_APP_SECRET = process.env.DINGTALK_APP_SECRET;

if (!DINGTALK_APP_KEY || !DINGTALK_APP_SECRET) {
    console.error('❌ 缺少 DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET 环境变量');
    process.exit(1);
}

// 简单的内存 session 存储（生产环境单个 PM2 实例足够）
const sessions = new Map();

// ======================== 钉钉登录回调 ========================
app.get('/api/dingtalk/login', async (req, res) => {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, error: '缺少 code 参数' });
    }

    console.log('🔑 收到 code:', code);

    try {
        // 1. 用 code 换取 accessToken
        const tokenResp = await axios.post(
            'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
            {
                clientId: DINGTALK_APP_KEY,
                clientSecret: DINGTALK_APP_SECRET,
                code,
                grantType: 'authorization_code'
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const { accessToken, expireIn } = tokenResp.data;
        if (!accessToken) {
            console.error('❌ 换取 accessToken 失败，响应:', tokenResp.data);
            return res.status(401).json({ success: false, error: '钉钉认证失败，请检查 AppKey/Secret' });
        }

        console.log('✅ 获取到 accessToken');

        // 2. 用 accessToken 获取用户信息
        const userResp = await axios.get(
            'https://api.dingtalk.com/v1.0/contact/users/me',
            { headers: { 'x-acs-dingtalk-access-token': accessToken } }
        );

        const user = userResp.data;
        const userId = user.userId || user.openId || '';
        const userName = user.nick || user.name || userId || '未知用户';

        console.log(`👤 用户登录: ${userName} (${userId})`);
	// ======================== 白名单校验 ========================
	const ALLOWED_USERS = [
    		"08546128611156291",   // 赵莘
    		"264308123",           // 赵莘（企业）
    		"0560546843796434",    // 徐钢
    		"0560546841776082",    // 张劲
    		"589041342",           // 张劲（企业）
    		"055915192420361454",  // 何朝辉
		 "RWATGRZfsEJGwSILSZyXvwiEiE",   // 赵莘（个人）
	        "iPKWiSGfv7mKA0shWMre4AiSAiEiE", // 孙静（企业）
	];

	if (!ALLOWED_USERS.includes(userId)) {
    	console.warn(`⛔ 拒绝访问: ${userName} (${userId}) 不在白名单中`);
    	return res.status(403).json({
        	success: false,
        	error: '您暂无访问权限，请联系管理员'
    	});
	}
	console.log(`✅ 白名单校验通过: ${userName} (${userId})`);
	// ======================== 白名单校验结束 ========================

        // 3. 生成 session token
        const sessionToken = Buffer.from(`${userId}:${Date.now()}`).toString('base64');
        sessions.set(sessionToken, {
            userId,
            name: userName,
            loginTime: Date.now()
        });

        // 设置 cookie（有效期 7 天）
        res.cookie('session_token', sessionToken, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });

        return res.json({
            success: true,
            user: { userId, name: userName, loginTime: Date.now() }
        });

    } catch (error) {
        console.error('❌ 钉钉登录异常:', error.response?.data || error.message);
        return res.status(500).json({ success: false, error: '登录服务异常，请稍后重试' });
    }
});

// ======================== 检查登录态 ========================
app.get('/api/dingtalk/me', (req, res) => {
    const sessionToken = req.cookies.session_token;
    if (!sessionToken || !sessions.has(sessionToken)) {
        return res.status(401).json({ success: false, error: '未登录' });
    }

    const user = sessions.get(sessionToken);
    return res.json({
        success: true,
        user: {
            userId: user.userId,
            name: user.name,
            loginTime: user.loginTime
        }
    });
});

// ======================== 登出 ========================
app.post('/api/dingtalk/logout', (req, res) => {
    const sessionToken = req.cookies.session_token;
    if (sessionToken) {
        sessions.delete(sessionToken);
        res.clearCookie('session_token');
    }
    res.json({ success: true });
});

// ======================== 健康检查 ========================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`);
    console.log(`✅ 钉钉 AppKey: ${DINGTALK_APP_KEY.slice(0, 8)}...`);
});
