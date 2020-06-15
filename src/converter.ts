import SLDParser from 'geostyler-sld-parser'
import { MapnikStyleParser } from './geostyler-mapnik-parser'

export async function sld2mapnik(sldString: string) {
  const sldParser = new SLDParser()
  const mapnikParser = new MapnikStyleParser()

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

// function convertFilter(filter?: Filter): Filter | undefined {
//   return filter
// }

// function convertSymbolizer(symbolyzer: Symbolizer): Symbolizer {
//   return symbolyzer
// }

// function convertScaleDenominator(scaleDenominator?: ScaleDenominator): ScaleDenominator | undefined {
//   return scaleDenominator
// }

// function convertRule(rule: Rule): Rule {
//   return {
//     name: rule.name,
//     filter: convertFilter(rule.filter),
//     scaleDenominator: convertScaleDenominator(rule.scaleDenominator),
//     symbolizers: rule.symbolizers.map(convertSymbolizer),
//   }
// }
