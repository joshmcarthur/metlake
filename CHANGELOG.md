# Changelog

## [1.1.0](https://github.com/joshmcarthur/metlake/compare/v1.0.0...v1.1.0) (2026-08-15)


### Features

* add historical vehicle map replay from curated GTFS-RT ([3d5d1f1](https://github.com/joshmcarthur/metlake/commit/3d5d1f153981ffb3e14a8aec6236e24b10214d80))
* add on-device performance commentary ([dfc14ea](https://github.com/joshmcarthur/metlake/commit/dfc14eac89a718338513758aa0837491b758ec2b))
* add route deep dive UI ([c244c04](https://github.com/joshmcarthur/metlake/commit/c244c0418e227d76fc4edd211f740f002790858d))
* add route scorecard and query pages ([3b830ad](https://github.com/joshmcarthur/metlake/commit/3b830adc3b5205a08e1723c42de59efab05f9d3b))
* add RT performance splice helpers ([83e460a](https://github.com/joshmcarthur/metlake/commit/83e460ae9a9d061cacbf460efe74e37683bc2ff9))
* add stop-anatomy parquet loaders and query SQL ([3b83482](https://github.com/joshmcarthur/metlake/commit/3b83482850970470e04d25d3a2cc143405a778b7))
* aggregate RT trip census to route-day performance ([16896f4](https://github.com/joshmcarthur/metlake/commit/16896f44b98119882c4af3714113ac225a404ed1))
* aggregate stop-delay into profile, injectors, and hour heat ([6715e27](https://github.com/joshmcarthur/metlake/commit/6715e2745d8fdcf0c2bf5b809605be1e00fa5d68))
* auto-generate commentary at the top of scorecard pages ([5c011c1](https://github.com/joshmcarthur/metlake/commit/5c011c1059c09a7ceb32676014cbd5c07b2c503a))
* cache commentary captions and treat them as captions ([53eac52](https://github.com/joshmcarthur/metlake/commit/53eac52419d6db71def908382220ee303a3fb4a8))
* derive sampled stop-delay spine from trip updates ([6ca8504](https://github.com/joshmcarthur/metlake/commit/6ca8504332ed0dc1e5b740a57534190e7f345e17))
* derive trip-day census from GTFS and trip updates ([a81b013](https://github.com/joshmcarthur/metlake/commit/a81b013a72f41c945d0cb15444bb60b89a604a6a))
* fill overview hour heat and shared choke points from RT anatomy ([4817885](https://github.com/joshmcarthur/metlake/commit/48178851aca6869d0f2d1ba1f4363774c300fdc3))
* implement overview scorecard and network charts ([f9af6e3](https://github.com/joshmcarthur/metlake/commit/f9af6e37208657e30c69b2d8310f39ccc45fa75e))
* label scorecard windows that include live-feed estimates ([939a644](https://github.com/joshmcarthur/metlake/commit/939a64452b617ad261e16e4ab185815cc3b560ac))
* move commentary into a sticky side rail ([5e614c2](https://github.com/joshmcarthur/metlake/commit/5e614c22d1fee507e9e44e8b3b370d5dffa16427))
* publish the frontend image to GHCR on release ([cc1cf0c](https://github.com/joshmcarthur/metlake/commit/cc1cf0cae0a9a862b83920d47f60c87924d469ab))
* replace fixed route nav with inline typeahead picker ([b35f89b](https://github.com/joshmcarthur/metlake/commit/b35f89b2b35652bc4c7296fc3d83e872803f6cef))
* scaffold metlake frontend from UI prototypes ([9b47d14](https://github.com/joshmcarthur/metlake/commit/9b47d14e22365c421155f85800afc31b18365c0e))
* serve frontend with Caddy sidecar ([bbd2b5a](https://github.com/joshmcarthur/metlake/commit/bbd2b5a7994bf0b91c6738b4e5a721221bb864a8))
* splice RT route-day parquet under official days ([dfd40a4](https://github.com/joshmcarthur/metlake/commit/dfd40a4c6949f2b1771e3dae823d8378d697e29b))
* wire DuckDB-WASM to route-performance parquet ([3978fc2](https://github.com/joshmcarthur/metlake/commit/3978fc2eb9803e588aff61738162cabd3516cce6))
* wire route delay anatomy to stop-delay aggregates ([fb2b35c](https://github.com/joshmcarthur/metlake/commit/fb2b35c2355c2d81b5e9a8a043bf30d48971cc71))


### Bug Fixes

* align the commentary rail with a sticky grid ([d85e045](https://github.com/joshmcarthur/metlake/commit/d85e0452a8efc83c5dc41cb41094bcc1b8e9a8fc))
* avoid route metric re-query and sanitize query results ([85e4eeb](https://github.com/joshmcarthur/metlake/commit/85e4eeb1c6c4ce07f94d6df42736bbca72eac0c3))
* census CANCELED trips without STUs and land late-trips derive ([1ece168](https://github.com/joshmcarthur/metlake/commit/1ece16860a054e20a040e19fa7f66857d79fb708))
* drop prototype-only wording from route deep callout ([3ecf28c](https://github.com/joshmcarthur/metlake/commit/3ecf28c81ec9c47dbd5a23843b210f8af7670e0e))
* drop stale route anatomy renders after direction or period change ([46a10d6](https://github.com/joshmcarthur/metlake/commit/46a10d6e9039a9243ff7dc9f3bd718beab03b79f))
* duckdb vite bundles, dynamic routes, compare month union ([d737db2](https://github.com/joshmcarthur/metlake/commit/d737db2150baa4f4057634eb9b5880b7d5516648))
* harden overview calendar grid and init load ([8ed0828](https://github.com/joshmcarthur/metlake/commit/8ed0828644e0c6d3d9eb8ab1e4d07bf7bc4ae1e1))
* keep all-null hour-heat cells and escape choke-point names ([c8386eb](https://github.com/joshmcarthur/metlake/commit/c8386eb7a098ba74264851884f4d621a2c653ba8))
* keep delay injectors and heatmap from crowding each other ([9e86c6e](https://github.com/joshmcarthur/metlake/commit/9e86c6e853cedd6ac20ba77d56d865e10e824a2a))
* land frontend modules the RT splice apps import ([6d02fe0](https://github.com/joshmcarthur/metlake/commit/6d02fe0a29a202f936d253e5ff88617f192c1e55))
* mute empty hour-heat cells like the punctuality calendar ([d7237d4](https://github.com/joshmcarthur/metlake/commit/d7237d49ba9bd041b0469415d4bd320d692e9ea1))
* register route-performance parquet over HTTP for DuckDB-WASM ([d56ca3f](https://github.com/joshmcarthur/metlake/commit/d56ca3f3699a72f96ae754b71148dda5b2fb3a47))
* replace confusing softest/soft punctuality copy ([becc4bc](https://github.com/joshmcarthur/metlake/commit/becc4bcd67eeb3963833b2e4cda32af5f85c31a3))
* say most and least punctual on overview routes ([9cb9e79](https://github.com/joshmcarthur/metlake/commit/9cb9e79beb3423746184dda2f01f56d15c1296cf))
* serve route scorecards from a sibling Caddy handle ([97df69e](https://github.com/joshmcarthur/metlake/commit/97df69e7df79fdb447562cd5442b95ebe930ce0a))
* show commentary as plain prose without chrome ([1d5850b](https://github.com/joshmcarthur/metlake/commit/1d5850bd02304907cb40664a5eeb7c4872ee9b64))
* treat official route-performance as optional and land combined route page ([b56edc8](https://github.com/joshmcarthur/metlake/commit/b56edc8a7e48106196a507f56a3c80edc28ec572))
* use generic route commentary fallback ([297b3c8](https://github.com/joshmcarthur/metlake/commit/297b3c87e9199f1fbf6242d8a7db4e4ebc61ef05))

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
