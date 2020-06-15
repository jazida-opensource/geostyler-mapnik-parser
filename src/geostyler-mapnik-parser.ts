import {
  StyleParser,
  Style,
  UnsupportedProperties,
  Rule,
  Filter,
  Symbolizer,
  ScaleDenominator,
  ComparisonFilter,
  CombinationFilter,
  FillSymbolizer,
  IconSymbolizer,
  LineSymbolizer,
  MarkSymbolizer,
  RasterSymbolizer,
  TextSymbolizer,
} from 'geostyler-style'
import { parse as xml2json, j2xParser as Json2xmlBuilder } from 'fast-xml-parser'

export type MapOptions = {
  [key: string]: any
}

export interface SymbolizersOptions {
  MarkSymbolizer?: {
    allowOverlap?: boolean
  }
}

export interface MapnikStyleParserOptions {
  outputMap: boolean
  mapOptions?: MapOptions
  symbolizersOptions?: SymbolizersOptions
}

export enum ComparisonEnum {
  Equal = '=',
  Not = 'not',
  Match = 'match',
  LessThan = '&lt;',
  LessThanOrEqual = '&lt;=',
  GreaterThan = '&gt;',
  GreaterThanOrEqual = '&gt;=',
  Modulo = '%',
}

export class MapnikStyleParser implements StyleParser {
  title = 'Mapnik Style Parser'
  static title = 'Mapnik Style Parser'

  readonly outputMap: boolean
  readonly mapOptions?: MapOptions
  readonly symbolyzersOptions?: SymbolizersOptions

  static negationOperatorMap = {
    not: '!',
  }

  static combinationMap = {
    and: '&&',
    or: '||',
  }

  static comparisonMap = {
    not: '!=',
    match: '*=',
    '=': '==',
    '&lt;': '<',
    '&lt;=': '<=',
    '&gt;': '>',
    '&gt;=': '>=',
    '%': '%',
  }

  unsupportedProperties: UnsupportedProperties = {
    Filter: {
      '*=': 'unsupported',
    },
    // TODO:
    Symbolizer: {
      FillSymbolizer: {
        // fillOpacity: undefined,
        // graphicFill: undefined,
        // outlineColor
        // outlineOpacity
        // outlineWidth
        // outlineDasharray
      },
    },
  }

  constructor(
    options: MapnikStyleParserOptions = {
      outputMap: true,
      mapOptions: {
        srs:
          '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
      },
      symbolizersOptions: {
        MarkSymbolizer: {
          allowOverlap: true,
        },
      },
    },
  ) {
    this.outputMap = options.outputMap
    this.mapOptions = options.mapOptions
    this.symbolyzersOptions = options.symbolizersOptions
  }

  // TODO: read style
  async readStyle(inputStyle: string): Promise<Style> {
    const mapnikObj = xml2json(inputStyle)
    return this.mapnikObjectToGeoStyler(mapnikObj)
  }

  async writeStyle(geoStylerStyle: Style): Promise<string> {
    const builder = new Json2xmlBuilder({
      format: true,
      ignoreAttributes: false,
    })

    const mapnikObject = this.geoStylerToMapnikObject(geoStylerStyle)
    const mapnikXmlString = builder.parse(mapnikObject)
    return '<?xml version="1.0" encoding="utf-8"?>\n' + mapnikXmlString
  }

  private geoStylerToMapnikObject(geoStylerStyle: Style): any {
    const mapnikObj: any = {}
    let root = mapnikObj

    if (this.outputMap) {
      if (this.mapOptions) {
        mapnikObj.Map = Object.entries(this.mapOptions).reduce(
          (acc, [key, val]) => ({
            ...acc,
            [`@_${key}`]: val,
          }),
          {},
        )
      } else {
        mapnikObj.Map = {}
      }
      root = mapnikObj.Map
    }

    root.Style = {
      '@_name': geoStylerStyle.name,
      Rule: this.geoStylerRulesToMapnik(geoStylerStyle.rules),
    }

    return mapnikObj
  }

  private geoStylerRulesToMapnik(geoStylerRules: Rule[]): any[] {
    return geoStylerRules.map((rule) => {
      const mapnikSD = rule.scaleDenominator && this.geoStylerScaleDenominatorToMapnik(rule.scaleDenominator)
      const mapnikFilter = rule.filter && this.geoStylerFilterToMapnik(rule.filter)
      return {
        ...mapnikSD,
        ...(mapnikFilter && { Filter: mapnikFilter }),
        ...this.geoStylerSymbolizersToMapnik(rule.symbolizers),
      }
    })
  }

  private geoStylerScaleDenominatorToMapnik(scaleDenominator: ScaleDenominator): Record<string, unknown> {
    return {
      ...(scaleDenominator.max && { MaxScaleDenominator: scaleDenominator.max }),
      ...(scaleDenominator.min && { MinScaleDenominator: scaleDenominator.min }),
    }
  }

  private geoStylerFilterToMapnik(filter: Filter): string | undefined {
    const [operator, ...args] = filter

    if (Object.values(MapnikStyleParser.comparisonMap).includes(operator)) {
      return this.geoStylerComparisonFilterToMapnik(filter as ComparisonFilter)
    } else if (Object.values(MapnikStyleParser.combinationMap).includes(operator)) {
      return this.geoStylerCombinationFilterToMapnik(filter as CombinationFilter)
    } else if (Object.values(MapnikStyleParser.negationOperatorMap).includes(operator)) {
      // TODO: negation
      return 'not' + args.map((subFilter) => this.geoStylerFilterToMapnik(subFilter)).join(' and ')
    }
  }

  private geoStylerCombinationFilterToMapnik(filter: CombinationFilter): string {
    const [operator, ...args] = filter
    const mapnikOperators: string[] = MapnikStyleParser.keysByValue(MapnikStyleParser.combinationMap, operator)
    const combinator = mapnikOperators[0] // and | or
    const expressions = args.map((subFilter) => `(${this.geoStylerFilterToMapnik(subFilter)})`)
    return expressions.join(` ${combinator} `)
  }

  private geoStylerComparisonFilterToMapnik([operator, key, value]: ComparisonFilter): string {
    const mapnikOperators: string[] = MapnikStyleParser.keysByValue(MapnikStyleParser.comparisonMap, operator)
    const mapnikOperator = mapnikOperators[0]
    const mapnikKey = `[${key}]`
    const mapnikValue = value === null ? 'null' : `'${value}'`

    // TODO: match, modulo, negation
    // if (Array.isArray(key) && key[0].startsWith('FN_')) {
    //   key = this.getSldFunctionFilterFromFunctionFilter(key)
    //   propertyKey = 'Function'
    // }

    if (mapnikOperator === ComparisonEnum.Not) {
      return `${mapnikOperator} (${mapnikKey} ${ComparisonEnum.Equal} ${mapnikValue})`
    }

    return [mapnikKey, mapnikOperator, mapnikValue].join(' ')
  }

  private geoStylerSymbolizersToMapnik(symbolizers: Symbolizer[]): { [name: string]: any } {
    return symbolizers.reduce((acc, symbolizer) => {
      let symbl: any

      if (symbolizer.kind === 'Fill') {
        symbl = this.geoStylerFillSymbolizerToMapnik(symbolizer)
      } else if (symbolizer.kind === 'Icon') {
        symbl = this.geoStylerIconSymbolizerToMapnik(symbolizer)
      } else if (symbolizer.kind === 'Line') {
        symbl = this.geoStylerLineSymbolizerToMapnik(symbolizer)
      } else if (symbolizer.kind === 'Mark') {
        symbl = this.geoStylerMarkSymbolizerToMapnik(symbolizer)
      } else if (symbolizer.kind === 'Raster') {
        symbl = this.geoStylerRasterSymbolizerToMapnik(symbolizer)
      } else if (symbolizer.kind === 'Text') {
        symbl = this.geoStylerTextSymbolizerToMapnik(symbolizer)
      }

      return { ...acc, ...symbl }
    }, {})
  }

  private geoStylerFillSymbolizerToMapnik(symbolizer: FillSymbolizer): any {
    const props = {
      ...(symbolizer.color && { '@_fill': symbolizer.color }),
      ...(symbolizer.fillOpacity && { '@_fill-opacity': symbolizer.fillOpacity }),
      ...(symbolizer.antialias && { '@_gamma': symbolizer.antialias }),
    }

    return {
      PolygonSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerIconSymbolizerToMapnik(symbolizer: IconSymbolizer): any {
    const props = {
      ...(symbolizer.image && { '@_file': symbolizer.image }),
    }

    return {
      MarkersSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerLineSymbolizerToMapnik(symbolizer: LineSymbolizer): any {
    const props = {
      ...(symbolizer.color && { '@_stroke': symbolizer.color }),
    }

    return {
      LineSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerMarkSymbolizerToMapnik(symbolizer: MarkSymbolizer): any {
    const props = {
      ...(symbolizer.color && { '@_fill': symbolizer.color }),
      ...(symbolizer.fillOpacity && { '@_opacity': symbolizer.fillOpacity }),
      ...(symbolizer.strokeColor && { '@_stroke': symbolizer.strokeColor }),
      ...(symbolizer.strokeWidth && { '@_stroke-width': symbolizer.strokeWidth }),
      ...(symbolizer.strokeOpacity && { '@_stroke-opacity': symbolizer.strokeOpacity }),
      ...(symbolizer.avoidEdges && { '@_avoid-edges': symbolizer.avoidEdges }),
      ...(this.symbolyzersOptions?.MarkSymbolizer?.allowOverlap && { '@_allow-overlap': 'true' }),
    }

    return {
      MarkersSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerRasterSymbolizerToMapnik(symbolizer: RasterSymbolizer): any {
    const props = {
      ...(symbolizer.opacity && { '@_opacity': symbolizer.opacity }),
    }

    return {
      RasterSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerTextSymbolizerToMapnik(symbolizer: TextSymbolizer): any {
    // TODO:
    // symbolizer.anchor
    const props = {
      ...(symbolizer.label && { '#text': `[${symbolizer.label}]` }),
      ...(symbolizer.opacity && { '@_opacity': symbolizer.opacity }),
      ...(symbolizer.allowOverlap && { '@_allow-overlap': symbolizer.allowOverlap }),
      ...(symbolizer.avoidEdges && { '@_avoid-edges': symbolizer.avoidEdges }),
      ...(symbolizer.color && { '@_fill': symbolizer.color }),
      ...(symbolizer.font && { '@_face-name': symbolizer.font[0] }),
      ...(symbolizer.size && { '@_size': symbolizer.size }),
      ...(symbolizer.haloColor && { '@_halo-fill': symbolizer.haloColor }),
      ...(symbolizer.haloWidth && { '@_halo-radius': symbolizer.haloWidth }),
      ...(symbolizer.justify && { '@_justify-alignment': symbolizer.justify }),
      ...(symbolizer.letterSpacing && { '@_character-spacing': symbolizer.letterSpacing }),
      ...(symbolizer.lineHeight && { '@_line-spacing': symbolizer.lineHeight }),
      ...(symbolizer.padding && { '@_margin': symbolizer.padding }),
      ...(symbolizer.transform && { '@_text-transform': symbolizer.transform }),
      ...(symbolizer.maxWidth && {
        '@_wrap-before': 'true',
        '@_wrap-width': symbolizer.maxWidth,
      }),
      ...(symbolizer.rotate && {
        '@_rotate-displacement': 'true',
        orientation: symbolizer.rotate,
      }),
    }
    symbolizer.offset
    // symbolizer.maxAngle
    // symbolizer.offset

    return {
      TextSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private mapnikObjectToGeoStyler(mapnikObj: any): Style {
    const name = this.getStyleNameFromMapnikObject(mapnikObj)
    const rules = this.getRulesFromMapnikObject(mapnikObj)
    return { name, rules }
  }

  private getStyleNameFromMapnikObject(mapnikObj: any): string {
    return mapnikObj.map.style.name
  }

  private getRulesFromMapnikObject(mapnikObj: any): Rule[] {
    const layers = mapnikObj.map.style.rules
    return []
  }

  /**
   * Returns the keys of an object where the value is equal to the passed in value.
   */
  private static keysByValue(object: any, value: any): string[] {
    return Object.keys(object).filter((key) => object[key] === value)
  }
}
