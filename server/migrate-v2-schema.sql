-- ═══════════════════════════════════════════════════════════════════
--  迁移脚本 v2：扩展 site_texts + 插入 team/credentials/新 page_key
--  执行方式：在 Supabase SQL Editor 中全选 → Run
--  幂等安全：多次执行结果一致
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
--  第 1 步：扩展 site_texts 表结构（添加 big_title / sub_title / cover_image）
-- ═══════════════════════════════════════════════════════════════════

-- 仅在字段不存在时添加（Supabase PG 不直接支持 IF NOT EXISTS for ALTER COLUMN，用 DO 块兜底）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='site_texts' AND column_name='big_title') THEN
    ALTER TABLE site_texts ADD COLUMN big_title TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='site_texts' AND column_name='sub_title') THEN
    ALTER TABLE site_texts ADD COLUMN sub_title TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='site_texts' AND column_name='cover_image') THEN
    ALTER TABLE site_texts ADD COLUMN cover_image TEXT;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
--  第 2 步：给已有 site_texts 记录补默认主标题/副标题（Upsert 增量更新）
-- ═══════════════════════════════════════════════════════════════════

-- 集团简介：设置大标题和导语（不覆盖已人工修改过的内容）
UPDATE site_texts
SET
  big_title  = COALESCE(big_title,  '集团简介'),
  sub_title  = COALESCE(sub_title,  '深耕工程咨询行业二十余载，以专业铸就品质，以诚信赢得信赖')
WHERE page_key = 'about_intro';

-- 服务产品描述：设置大标题和导语
UPDATE site_texts
SET
  big_title  = COALESCE(big_title,  '服务特色'),
  sub_title  = COALESCE(sub_title,  '以 PML+ 集成化风控运筹体系，赋能工程全生命周期')
WHERE page_key = 'about_services';

-- ═══════════════════════════════════════════════════════════════════
--  第 3 步：新增 page_key = about_history（发展历程）
--         纯文本，适合放 site_texts
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO site_texts (page_key, content, big_title, sub_title)
VALUES (
  'about_history',
  '森宇集团未来将形成以符合国际惯例的前沿咨询理念和手段为主导，为建设及相关行业和领域提供将金融资本、规划、设计、项目管理等专业技术与相关法律紧密结合为核心竞争力的高水平、高品质服务，打造国内外知名品牌的专业化、国际化、规模化咨询集团公司。',
  '发展历程',
  '回首过去，展望未来，步履不停'
)
ON CONFLICT (page_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
--  第 4 步：插入团队核心成员 — 徐钢总裁（site_team）
--  头像 URL 需要先上传到 Supabase Storage，此处用占位符；
--  实际 URL 由 migrate-v2-data.js 脚本写入，或手动在后台编辑。
-- ═══════════════════════════════════════════════════════════════════

-- 先清理已有数据（幂等：仅插入一次）
DELETE FROM site_team WHERE name = '徐钢' AND id NOT IN (
  SELECT id FROM site_team ORDER BY id LIMIT 1
);

-- 如果"徐钢"不存在才插入
INSERT INTO site_team (name, avatar, titles, bio, sort_order, is_active)
SELECT
  '徐钢',
  NULL,  -- 头像需通过后台手动上传，或参考 migrate-v2-data.js
  ARRAY[
    '天津市森宇集团 总裁',
    '天津市森宇集团 党总支书记',
    '天津市森宇建筑技术法律咨询有限公司 董事长',
    '天津市建联建设工程调解中心主任',
    '天津市中创蓝德建设运营风控中心主任',
    '天津市人民检察院专家咨询委员会委员'
  ],
  '多年从事建设领域咨询服务的理论研究及咨询服务实践过程中，主持和参与多项国家及地方法律法规、重大创新研发课题的编制和制定、修订工作；曾多年担任天津市建委首席法律顾问，主持解决多项本市及外省市社会影响重大公共危机处置及法律关系复杂的典型建设领域纠纷案例。' || E'\n\n' ||
  '擅长专注于用前沿性的视觉捕捉市场潜在需求，指导制定多项理论及实践结合的可操作性方案。专注创新企业管理"法人治理及内控制度维度"指导建立现代企业制度一体化解决方案。专注处置复杂技术、法律综合争议、争端事务咨询，实现通过调解、综合处置手段的解决方案。专注制定对各级政府及大型国有管理行为风险分析、制定过程预控及风险处置的可操作性方案。',
  0,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM site_team WHERE name = '徐钢'
);

-- ═══════════════════════════════════════════════════════════════════
--  第 5 步：插入荣誉资质（site_credentials）— 占位数据
--  实际图片 URL 需要先上传；此处插入标题占位行，
--  之后在后台编辑上传实际证书图片。
--  老图片路径（需上传到 Supabase Storage 后替换）：
--    体系认证: system-1.jpg, system-2.jpg, system-3.jpg
--    企业资质: cert-1.png ~ cert-8.jpg
-- ═══════════════════════════════════════════════════════════════════

-- 仅在 site_credentials 表完全为空时才插入占位数据
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM site_credentials) = 0 THEN
    -- 体系认证（3 张）
    INSERT INTO site_credentials (title, image_url, category, sort_order) VALUES
    ('体系认证证书 1', '', '体系认证', 0),
    ('体系认证证书 2', '', '体系认证', 1),
    ('体系认证证书 3', '', '体系认证', 2);

    -- 企业资质（8 张）
    INSERT INTO site_credentials (title, image_url, category, sort_order) VALUES
    ('企业资质证书 1', '', '企业资质', 0),
    ('企业资质证书 2', '', '企业资质', 1),
    ('企业资质证书 3', '', '企业资质', 2),
    ('企业资质证书 4', '', '企业资质', 3),
    ('企业资质证书 5', '', '企业资质', 4),
    ('企业资质证书 6', '', '企业资质', 5),
    ('企业资质证书 7', '', '企业资质', 6),
    ('企业资质证书 8', '', '企业资质', 7);
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
--  验证查询（在 COMMIT 之后执行，确认迁移结果）
-- ═══════════════════════════════════════════════════════════════════

SELECT 'site_texts' AS tbl, page_key, big_title, sub_title,
       length(content) AS chars, length(cover_image) AS img_len
FROM site_texts
ORDER BY page_key;

SELECT 'site_team' AS tbl, id, name, array_length(titles, 1) AS title_count,
       length(bio) AS bio_chars, sort_order, is_active
FROM site_team
ORDER BY sort_order;

SELECT 'site_credentials' AS tbl, category, count(*) AS cnt
FROM site_credentials
GROUP BY category
ORDER BY category;