-- path: migrations/S15_007_assets_down.sql
drop table if exists public.asset_documents;
drop table if exists public.asset_usage;
drop table if exists public.asset_depreciation;
drop table if exists public.fixed_assets;
drop table if exists public.asset_categories;
drop function if exists public.kd_asset_depreciation_guard();
drop function if exists public.kd_fixed_asset_guard();
drop function if exists public.kd_asset_category_guard();
