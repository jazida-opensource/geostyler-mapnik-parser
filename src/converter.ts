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

export async function mapnik2sld(mapnikString: string) {
  const sldParser = new SLDParser()
  const mapnikParser = new MapnikStyleParser()

  const style = await mapnikParser.readStyle(mapnikString)
  const sld = await sldParser.writeStyle(style)

  return sld
}
