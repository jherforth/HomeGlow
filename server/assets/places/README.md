# places.tsv.gz

The towns HomeGlow names a photo's place from (`services/placeLookup.js`):
every place of 1,000 people or more, with its state or region and country.
The lookup runs on the server, so a photo's location never leaves it.

Built by `server/scripts/build-places.js` from GeoNames' `cities1000.zip` and
`admin1CodesASCII.txt` (https://download.geonames.org/export/dump/).

Data: [GeoNames](https://www.geonames.org/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
