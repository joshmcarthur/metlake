# Upstream sources and attribution

Metlake archives public transit open data published for the Wellington region.

**metlake is not affiliated with Metlink or Greater Wellington Regional Council.**

## API

| Item | Value |
| --- | --- |
| Developer portal | https://opendata.metlink.org.nz/ |
| API base | `https://api.opendata.metlink.org.nz/v1` |
| Auth header | `x-api-key: $METLINK_API_KEY` |
| Rate limits (as documented for API keys) | About 10 requests/second, burst ~20 |

## Static GTFS

| Item | Value |
| --- | --- |
| Full schedule ZIP | `https://static.opendata.metlink.org.nz/v1/gtfs/full.zip` |
| Env override | `METLINK_STATIC_GTFS_URL` |

## GTFS-RT (JSON)

Prefer `Accept: application/json`.

| Feed | Path |
| --- | --- |
| Trip updates | `/gtfs-rt/tripupdates` |
| Vehicle positions | `/gtfs-rt/vehiclepositions` |
| Service alerts | `/gtfs-rt/servicealerts` |

## Bus performance CSV

Metlink publishes aggregated bus performance CSVs on:

https://www.metlink.org.nz/about-us/performance-of-our-network

Use the **Bus performance, Daily, CSV** asset. The exact asset URL may change; set `METLINK_PERFORMANCE_CSV_URL` or discover it at fetch time from the page. Metlake stores a daily snapshot of whatever file is retrieved — it does not merge rows with GTFS.

## Licence

Metlink Open Data is typically offered under **Creative Commons Attribution 4.0 (CC-BY-4.0)**. Confirm current terms on the developer portal and Metlink legal pages before redistributing archived data. When publishing an archive, retain attribution to Metlink / Greater Wellington Regional Council as required by the licence.
