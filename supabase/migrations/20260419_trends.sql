-- ============================================================
-- Insightship 트렌드 테이블
-- 주간 키워드 트렌드 및 분야별 동향 저장
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_type TEXT DEFAULT 'weekly',  -- 'weekly', 'monthly'
    keywords JSONB,         -- [{word, count, change_pct, category}]
    categories JSONB,       -- {category: count}
    hot_topics JSONB,       -- [{title, article_id, score}]
    rising_keywords JSONB,  -- 전주 대비 상승 키워드
    declining_keywords JSONB,
    total_articles INTEGER DEFAULT 0,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    ai_version TEXT,
    UNIQUE(period_start, period_type)
);

CREATE INDEX IF NOT EXISTS idx_trends_period ON public.trends(period_start DESC, period_type);

ALTER TABLE public.trends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read trends" ON public.trends;
CREATE POLICY "Public read trends" ON public.trends
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service write trends" ON public.trends;
CREATE POLICY "Service write trends" ON public.trends
    FOR ALL USING (auth.role() = 'service_role');
