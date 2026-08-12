-- 업장별 비고(메모)·내장객수 동기화용 테이블
-- 기존 localStorage(northfarm_memo_*, northfarm_guest_*)를 대체한다.
-- 실제 Supabase 프로젝트(ulvdlmokrvgxrabfvrza)에는 이미 적용되어 있음 — 이 파일은 재현/기록용.

CREATE TABLE public.daily_notes (
  sale_date    date        PRIMARY KEY,
  guest_count  integer     NOT NULL DEFAULT 0,
  memos        jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- { "클럽하우스": "비고텍스트", ... }
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.daily_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
