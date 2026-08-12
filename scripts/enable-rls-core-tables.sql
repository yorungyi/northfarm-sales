-- ⚠️ 아직 적용되지 않음 — 반드시 아래 순서를 지켜서 실행할 것
--
-- 1) 로그인 기능이 포함된 코드가 Vercel 프로덕션에 배포됨
-- 2) Supabase 대시보드(Authentication > Users)에서 요한님 계정 1개를 생성함
-- 3) 배포된 앱에서 로그인이 정상 동작하는 것을 확인함
-- 4) 그 다음에만 이 SQL을 실행할 것
--
-- 순서를 지키지 않고 먼저 실행하면, 아직 배포되지 않은 구버전 앱(로그인 없음)이
-- anon 권한으로 daily_sales/monthly_closing/closing_target에 접근하지 못해
-- 매출 입력이 즉시 막힌다.

ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_target ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.daily_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON public.monthly_closing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON public.closing_target
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
