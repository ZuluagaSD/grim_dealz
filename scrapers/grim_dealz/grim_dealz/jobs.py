from dagster import ScheduleDefinition, define_asset_job, in_process_executor

# Run catalog sync + enrichment + all stores + revalidation every 4 hours.
# gw_product_catalog runs first (upstream dep), then enrich_catalog_codes,
# then stores in sequence, then revalidate_cache.
# in_process_executor runs all steps in a single process — avoids spawning
# parallel subprocesses which exhausted Pi RAM under the default multiprocess executor.
scrape_job = define_asset_job(
    name="grim_dealz_scrape_job",
    selection=[
        "gw_product_catalog",
        "enrich_catalog_codes_asset",
        "miniature_market_listings",
        "discount_games_inc_listings",
        "frontline_gaming_listings",
        "game_nerdz_listings",
        "revalidate_cache",
        "price_alert_notifications",
    ],
    description="Sync GW catalog + scrape prices from all stores + update Supabase + send price alerts.",
    executor_def=in_process_executor,
)

every_4h_schedule = ScheduleDefinition(
    job=scrape_job,
    cron_schedule="0 */4 * * *",
    name="grim_dealz_every_4h",
)
