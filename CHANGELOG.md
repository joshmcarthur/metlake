# Changelog

## 1.0.0 (2026-08-12)


### Features

* add crontab schedule for archive jobs ([1c15824](https://github.com/joshmcarthur/metlake/commit/1c15824f6558c5b490a897e5740fbe28e461442e))
* add DuckDB projections for GTFS and performance ([503292f](https://github.com/joshmcarthur/metlake/commit/503292f77332950f56ed9ea07c87dba04a028264))
* add GTFS-RT hourly/daily/monthly Parquet projections ([a5a467e](https://github.com/joshmcarthur/metlake/commit/a5a467eefe201c9767e72cf6a0acfaaa94bda64b))
* add shared lib and utility scripts ([96d7250](https://github.com/joshmcarthur/metlake/commit/96d7250800b2305a73537295ecb251b9aa56524a))
* add thin derive route-performance script ([151eb73](https://github.com/joshmcarthur/metlake/commit/151eb739784334a52ee9411ea5c31cfd4950b2d0))
* Docker image with supercronic scheduler ([2b4824c](https://github.com/joshmcarthur/metlake/commit/2b4824c8287787693f8ee4e7f3127fdfd5fc98c4))
* implement GTFS-RT JSON capture for three feeds ([a3700d1](https://github.com/joshmcarthur/metlake/commit/a3700d15c7cb40aec3a2d78ca4e73acd149e4af8))
* implement performance CSV daily snapshot capture ([493d36e](https://github.com/joshmcarthur/metlake/commit/493d36e7e6a69d902fc0fa6d6bf131802f2bb7a7))
* implement raw GTFS zip capture ([59b8982](https://github.com/joshmcarthur/metlake/commit/59b89827e68f0afc674888502a26769a5bfcd7d4))


### Bug Fixes

* discover real daily performance CSV asset URL ([cd61007](https://github.com/joshmcarthur/metlake/commit/cd61007b25e35157603d90e1c6225912484aba22))
* drop optional route_color from derive join ([0770639](https://github.com/joshmcarthur/metlake/commit/0770639a806ffce7adab24a84201ec0af2cd97f4))
* run supercronic under tini in the container ([c34ed24](https://github.com/joshmcarthur/metlake/commit/c34ed2491a59bd64520500e8ac1c6b74fa5fa942))
