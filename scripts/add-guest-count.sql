-- daily_sales 테이블에 내장객 수 컬럼 추가
-- Supabase SQL Editor에서 실행하세요
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS guest_count INTEGER NOT NULL DEFAULT 0;
