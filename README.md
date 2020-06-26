# geostyler-mapnik-parser

[GeoStyler](https://github.com/terrestris/geostyler/) Style Parser implementation for [Mapnik XML](https://github.com/mapnik/mapnik/wiki/XMLConfigReference)

## How to use

### Converting SLD to Mapnk XML

#### CLI

```bash
npm install

npm run build

node dist/bin/sld2mapnik.js input.sld > output.mapnik.xml
```

#### Programatically

```javascript
import SLDParser from 'geostyler-sld-parser'
import { MapnikStyleParser } from './geostyler-mapnik-parser'

export async function sld2mapnik(sldString: string) {
  const sldParser = new SLDParser()
  const mapnikParser = new MapnikStyleParser({
    output: {
      includeMap: true,
      wellKnownBasePath: 'icons',
      map: {
        srs: '+init=epsg:3857',
      },
      style: {
        name: 'style',
      },
      symbolizers: {
        MarkersSymbolizer: {
          'allow-overlap': 'true',
          'avoid-edges': 'true',
        },
      },
    },
  })

  const style = await sldParser.readStyle(sldString)
  const xml = await mapnikParser.writeStyle(style)

  return xml
}
```
