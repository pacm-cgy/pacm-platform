-- ============================================================
-- Insightship 주간 보고서 테이블
-- 매주 월요일 자동 생성되는 주간 인사이트 보고서 저장
-- ============================================================

CREATE TABLE IF NOT EXISTS public.weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    article_count INTEGER DEFAULT 0,
    top_categories JSONB,
    top_keywords JSONB,
    key_numbers JSONB,
    top_article_ids JSONB,
    summary_markdown TEXT,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    ai_version TEXT,
    UNIQUE(week_start)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week_start ON public.weekly_reports(week_start DESC);

-- RLS
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read weekly_reports" ON public.weekly_reports;
CREATE POLICY "Public read weekly_reports" ON public.weekly_reports
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service write weekly_reports" ON public.weekly_reports;
CREATE POLICY "Service write weekly_reports" ON public.weekly_reports
    FOR ALL USING (auth.role() = 'service_role');
