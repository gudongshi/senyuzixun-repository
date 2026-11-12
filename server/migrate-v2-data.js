/**
 * 迁移脚本 v2：上传老网站图片到 Supabase Storage，并插入 team/credentials 数据
 *
 * 前置条件：
 *   1. 先执行 migrate-v2-schema.sql（扩展 site_texts 字段 + 创建占位记录）
 *   2. 确保 .env 中有 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
 *   3. 老网站图片位于: D:\集团系统开发\senyu-website\public\images\
 *
 * 用法：
 *   node server/migrate-v2-data.js
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// ── 加载 .env ──
const envPath = path.resolve(__dirname, '.env');
const parsed = dotenv.config({ path: envPath });
if (parsed.error) {
  console.error('❌ 加载 .env 失败:', parsed.error.message);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
// 必须用 service_role key 才能绕过 RLS 写入
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET = 'site_images';

// ── 老网站图片根目录 ──
const OLD_IMAGES_DIR = path.resolve(__dirname, '..', '..', 'senyu-website', 'public', 'images');

// ═══════════════════════════════════════════════════════════════════
//  上传本地图片到 Supabase Storage，返回 public URL
// ═══════════════════════════════════════════════════════════════════
async function uploadLocalImage(localPath, remoteFolder = 'migration') {
  if (!fs.existsSync(localPath)) {
    console.log(`   ⚠️  文件不存在，跳过: ${localPath}`);
    return null;
  }

  const ext = path.extname(localPath).toLowerCase();
  const basename = path.basename(localPath, ext);
  const remoteName = `${remoteFolder}/${basename}${ext}`;

  // 先检查是否已存在
  const { data: existing } = await supabase.storage.from(BUCKET).list(remoteFolder, {
    search: `${basename}${ext}`,
  });

  if (existing && existing.length > 0) {
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(remoteName);
    console.log(`   ⏭️  已存在: ${remoteName}`);
    return urlData.publicUrl;
  }

  const fileBuffer = fs.readFileSync(localPath);
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(remoteName, fileBuffer, { contentType, upsert: true });

  if (error) {
    console.error(`   ❌ 上传失败: ${error.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(remoteName);
  console.log(`   ✅ 上传成功: ${remoteName}`);
  return urlData.publicUrl;
}

// ═══════════════════════════════════════════════════════════════════
//  迁移团队头像
// ═══════════════════════════════════════════════════════════════════
async function migrateTeamAvatar() {
  console.log('\n👤 ── 核心团队 · 徐钢总裁头像 ──');

  const avatarPath = path.join(OLD_IMAGES_DIR, 'team', 'president-card.jpg');
  const avatarUrl = await uploadLocalImage(avatarPath, 'migration/team');

  if (!avatarUrl) {
    console.log('   ⚠️  头像上传失败，跳过更新 team 表');
    return;
  }

  const { error } = await supabase
    .from('site_team')
    .update({ avatar: avatarUrl })
    .eq('name', '徐钢');

  if (error) {
    console.error(`   ❌ 更新团队头像失败: ${error.message}`);
  } else {
    console.log(`   ✅ 徐钢头像已更新: ${avatarUrl}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  迁移荣誉证书图片到 Supabase Storage，并更新 site_credentials 表
// ═══════════════════════════════════════════════════════════════════
async function migrateCredentials() {
  console.log('\n🏅 ── 荣誉资质 · 证书图片 ──');

  const honorDir = path.join(OLD_IMAGES_DIR, 'honor');
  if (!fs.existsSync(honorDir)) {
    console.log('   ⚠️  honor 目录不存在，跳过');
    return;
  }

  const certs = [
    { file: 'system-1.jpg', category: '体系认证', title: '体系认证证书 1' },
    { file: 'system-2.jpg', category: '体系认证', title: '体系认证证书 2' },
    { file: 'system-3.jpg', category: '体系认证', title: '体系认证证书 3' },
    { file: 'cert-1.png',  category: '企业资质', title: '企业资质证书 1' },
    { file: 'cert-2.jpg',  category: '企业资质', title: '企业资质证书 2' },
    { file: 'cert-3.jpg',  category: '企业资质', title: '企业资质证书 3' },
    { file: 'cert-4.jpg',  category: '企业资质', title: '企业资质证书 4' },
    { file: 'cert-5.jpg',  category: '企业资质', title: '企业资质证书 5' },
    { file: 'cert-6.jpg',  category: '企业资质', title: '企业资质证书 6' },
    { file: 'cert-7.jpg',  category: '企业资质', title: '企业资质证书 7' },
    { file: 'cert-8.jpg',  category: '企业资质', title: '企业资质证书 8' },
  ];

  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i];
    const localPath = path.join(honorDir, cert.file);
    console.log(`\n   [${i + 1}/${certs.length}] ${cert.title} (${cert.file})`);

    const url = await uploadLocalImage(localPath, 'migration/credentials');
    if (!url) continue;

    // 更新 site_credentials 表中对应行
    const { error } = await supabase
      .from('site_credentials')
      .update({ image_url: url, title: cert.title })
      .eq('category', cert.category)
      .eq('sort_order', i < 3 ? i : i - 3)
      // 更精确匹配：找 image_url 为空且同分类的那条
      .is('image_url', null);

    // 如果上面按 null 没匹配到，就用最宽松的匹配更新
    if (error) {
      // 降级：直接按 sort_order + category 匹配
      const sortIdx = cert.category === '体系认证' ? i : i - 3;
      const { error: err2 } = await supabase
        .from('site_credentials')
        .update({ image_url: url, title: cert.title })
        .eq('category', cert.category)
        .eq('sort_order', sortIdx);

      if (err2) {
        console.error(`   ❌ 更新失败: ${err2.message}`);
      } else {
        console.log(`   ✅ 已更新`);
      }
    } else {
      console.log(`   ✅ 已更新`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  迁移服务特色配图（about_services 的 PML 体系图）
// ═══════════════════════════════════════════════════════════════════
async function migrateServiceImage() {
  console.log('\n🖼️  ── 服务特色 · PML 体系示意图 ──');

  const imgPath = path.join(OLD_IMAGES_DIR, 'services', 'pml-system.jpg');
  const url = await uploadLocalImage(imgPath, 'migration/services');

  if (!url) {
    console.log('   ⚠️  上传失败，跳过');
    return;
  }

  const { error } = await supabase
    .from('site_texts')
    .update({ cover_image: url })
    .eq('page_key', 'about_services');

  if (error) {
    console.error(`   ❌ 更新失败: ${error.message}`);
  } else {
    console.log(`   ✅ about_services.cover_image 已更新: ${url}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  迁移发展历程配图（about_history 的 development-history.jpg）
// ═══════════════════════════════════════════════════════════════════
async function migrateHistoryImage() {
  console.log('\n📜 ── 发展历程 · 配图 ──');

  const imgPath = path.join(OLD_IMAGES_DIR, 'history', 'development-history.jpg');
  const url = await uploadLocalImage(imgPath, 'migration/history');

  if (!url) {
    console.log('   ⚠️  上传失败，跳过');
    return;
  }

  const { error } = await supabase
    .from('site_texts')
    .update({ cover_image: url })
    .eq('page_key', 'about_history');

  if (error) {
    console.error(`   ❌ 更新失败: ${error.message}`);
  } else {
    console.log(`   ✅ about_history.cover_image 已更新: ${url}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 migrate-v2-data.js — 上传老网站图片 + 写入数据库\n');
  console.log('═══════════════════════════════════════');
  console.log(`   Supabase URL: ${supabaseUrl}`);
  console.log(`   Storage Bucket: ${BUCKET}`);
  console.log(`   图片来源: ${OLD_IMAGES_DIR}`);
  console.log('═══════════════════════════════════════');

  const startTime = Date.now();

  try {
    // 第 1 步：上传团队头像
    await migrateTeamAvatar();

    // 第 2 步：上传荣誉证书
    await migrateCredentials();

    // 第 3 步：上传服务特色配图
    await migrateServiceImage();

    // 第 4 步：上传发展历程配图
    await migrateHistoryImage();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n═══════════════════════════════════════');
    console.log(`🎉 迁移完成！耗时 ${elapsed}s`);
    console.log('═══════════════════════════════════════\n');

    // ── 验证 ──
    console.log('📊 验证结果:');

    const { data: team } = await supabase
      .from('site_team')
      .select('id, name, avatar, sort_order')
      .order('sort_order');
    console.log(`\n   site_team (${team ? team.length : 0} 条):`);
    if (team) team.forEach(t => console.log(`      - ${t.name} | avatar=${t.avatar ? '✅' : '❌'}`));

    const { data: creds } = await supabase
      .from('site_credentials')
      .select('category, title, image_url')
      .order('sort_order');
    console.log(`\n   site_credentials (${creds ? creds.length : 0} 条):`);
    if (creds) {
      const byCat = {};
      creds.forEach(c => {
        if (!byCat[c.category]) byCat[c.category] = { total: 0, withImg: 0 };
        byCat[c.category].total++;
        if (c.image_url) byCat[c.category].withImg++;
      });
      for (const [cat, stats] of Object.entries(byCat)) {
        console.log(`      [${cat}] ${stats.withImg}/${stats.total} 有图片`);
      }
    }

    const { data: texts } = await supabase
      .from('site_texts')
      .select('page_key, big_title, cover_image')
      .order('page_key');
    console.log(`\n   site_texts (${texts ? texts.length : 0} 条):`);
    if (texts) texts.forEach(t => {
      console.log(`      [${t.page_key}] big_title="${t.big_title || ''}" cover=${t.cover_image ? '✅' : '❌'}`);
    });

    console.log('\n✅ 验证完成。');
  } catch (err) {
    console.error('\n❌ 脚本异常:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();