from dagster import ScheduleDefinition, define_asset_job, in_process_executor

# Run catalog sync + all stores + revalidation every 4 hours.
# gw_product_catalog runs first (upstream dep), then stores in sequence,
# then revalidate_cache.
# in_process_executor runs all steps in a single process — avoids spawning
# parallel subprocesses which exhausted Pi RAM under the default multiprocess executor.
scrape_job = define_asset_job(
    name="grim_dealz_scrape_job",
    selection=[
        "gw_product_catalog",
        "miniature_market_listings",
        "discount_games_inc_listings",
        "frontline_gaming_listings",
        "game_nerdz_listings",
        "element_games_listings",
        "wayland_games_listings",
        "revalidate_cache",
    ],
    description="Sync GW catalog + scrape prices from all stores + update Supabase.",
    executor_def=in_process_executor,
)

every_4h_schedule = ScheduleDefinition(
    job=scrape_job,
    cron_schedule="0 */4 * * *",
    name="grim_dealz_every_4h",
)

# Standalone daily catalog sync — keeps product catalog fresh even on days
# when the full scrape job isn't running or if you want more frequent catalog updates.
catalog_job = define_asset_job(
    name="gw_catalog_sync_job",
    selection=["gw_product_catalog"],
    description="Sync GW product catalog from Algolia.",
    executor_def=in_process_executor,
)

daily_catalog_schedule = ScheduleDefinition(
    job=catalog_job,
    cron_schedule="0 3 * * *",  # 3 AM daily
    name="gw_catalog_daily",
)
