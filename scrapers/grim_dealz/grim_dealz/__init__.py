from dagster import Definitions, load_assets_from_modules

from . import assets
from .jobs import catalog_job, daily_catalog_schedule, every_4h_schedule, scrape_job

defs = Definitions(
    assets=load_assets_from_modules([assets]),
    jobs=[scrape_job, catalog_job],
    schedules=[every_4h_schedule, daily_catalog_schedule],
)
