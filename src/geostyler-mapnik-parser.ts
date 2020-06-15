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
  WellKnownName,
  PointSymbolizer,
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
    const props: any = {}
    const isPolygonPatternSymbolizer = !!symbolizer.graphicFill
    const symbolizerName = isPolygonPatternSymbolizer ? 'PolygonPatternSymbolizer' : 'PolygonSymbolizer'
    const graphicFill = symbolizer.graphicFill && this.geoStylerGraphicFillToMapnikFile(symbolizer.graphicFill)

    if (symbolizer.color) props['@_fill'] = symbolizer.color
    if (symbolizer.visibility === false) props['@_fill-opacity'] = 0
    if (symbolizer.antialias) props['@_gamma'] = symbolizer.antialias
    if (graphicFill) props['@_file'] = graphicFill

    return {
      [symbolizerName]: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerIconSymbolizerToMapnik(symbolizer: IconSymbolizer): any {
    return this.geoStylerMarkOrIconSymbolizerToMapnik(symbolizer)
  }

  private geoStylerMarkSymbolizerToMapnik(symbolizer: MarkSymbolizer): any {
    return this.geoStylerMarkOrIconSymbolizerToMapnik(symbolizer)
  }

  private geoStylerLineSymbolizerToMapnik(symbolizer: LineSymbolizer): any {
    const props: any = {}
    const isLinePatternSymbolizer = !!symbolizer.graphicFill
    const symbolizerName = isLinePatternSymbolizer ? 'LinePatternSymbolizer' : 'LineSymbolizer'
    const graphicStroke = symbolizer.graphicStroke && this.geoStylerGraphicFillToMapnikFile(symbolizer.graphicStroke)
    const graphicFill = symbolizer.graphicFill && this.geoStylerGraphicFillToMapnikFile(symbolizer.graphicFill)

    if (symbolizer.color) props['@_stroke'] = symbolizer.color
    if (symbolizer.opacity) props['@_stroke-opacity'] = symbolizer.opacity
    if (symbolizer.width) props['@_stroke-width'] = symbolizer.width
    if (symbolizer.cap) props['@_stroke-linecap'] = symbolizer.cap
    if (symbolizer.dasharray) props['@_stroke-dasharray'] = symbolizer.dasharray.join(',')
    if (symbolizer.join) props['@_stroke-linejoin'] = symbolizer.join
    if (symbolizer.visibility === false) props['@_stroke-opacity'] = 0
    if (graphicStroke) props['@_file'] = graphicStroke
    if (graphicFill) props['@_file'] = graphicFill

    return {
      [symbolizerName]: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerMarkOrIconSymbolizerToMapnik(symbolizer: MarkSymbolizer | IconSymbolizer): any {
    const props: any = {}
    const allowOverlap = this.symbolyzersOptions?.MarkSymbolizer?.allowOverlap

    if (symbolizer.kind === 'Mark') {
      if (allowOverlap) props['@_allow-overlap'] = 'true'
      if (symbolizer.fillOpacity) props['@_opacity'] = symbolizer.fillOpacity
      if (symbolizer.strokeColor) props['@_stroke'] = symbolizer.strokeColor
      if (symbolizer.strokeWidth) props['@_stroke-width'] = symbolizer.strokeWidth
      if (symbolizer.strokeOpacity) props['@_stroke-opacity'] = symbolizer.strokeOpacity
      if (symbolizer.radius) {
        props['@_width'] = symbolizer.radius
        props['@_height'] = symbolizer.radius
      }
      if (symbolizer.wellKnownName) {
        const icon = this.getWellkownSvg(symbolizer.wellKnownName)
        if (icon) props['@_file'] = icon
      }
    }

    if (symbolizer.kind === 'Icon') {
      if (symbolizer.allowOverlap) props['@allow-overlap'] = 'true'
      if (symbolizer.image) props['@_file'] = symbolizer.image
    }

    if (symbolizer.color) props['@_fill'] = symbolizer.color
    if (symbolizer.avoidEdges) props['@_avoid-edges'] = symbolizer.avoidEdges
    if (symbolizer.rotate) props['@_transform'] = `rotate(${symbolizer.rotate}deg)`
    if (symbolizer.visibility === false) props['@_opacity'] = 0

    return {
      MarkersSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerRasterSymbolizerToMapnik(symbolizer: RasterSymbolizer): any {
    const props: any = {}

    if (symbolizer.opacity) props['@_opacity'] = symbolizer.opacity
    if (symbolizer.visibility === false) props['@_opacity'] = 0

    return {
      RasterSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerTextSymbolizerToMapnik(symbolizer: TextSymbolizer): any {
    const props: any = {}

    if (symbolizer.label) props['#text'] = `[${symbolizer.label}]`
    if (symbolizer.opacity) props['@_opacity'] = symbolizer.opacity
    if (symbolizer.allowOverlap) props['@_allow-overlap'] = symbolizer.allowOverlap
    if (symbolizer.avoidEdges) props['@_avoid-edges'] = symbolizer.avoidEdges
    if (symbolizer.color) props['@_fill'] = symbolizer.color
    if (symbolizer.font) props['@_face-name'] = symbolizer.font
    if (symbolizer.size) props['@_size'] = symbolizer.size
    if (symbolizer.haloColor) props['@_halo-fill'] = symbolizer.haloColor
    if (symbolizer.haloWidth) props['@_halo-radius'] = symbolizer.haloWidth
    if (symbolizer.justify) props['@_justify-alignment'] = symbolizer.justify
    if (symbolizer.letterSpacing) props['@_character-spacing'] = symbolizer.letterSpacing
    if (symbolizer.lineHeight) props['@_line-spacing'] = symbolizer.lineHeight
    if (symbolizer.padding) props['@_margin'] = symbolizer.padding
    if (symbolizer.transform) props['@_text-transform'] = symbolizer.transform
    if (symbolizer.maxAngle) props['@_max-char-angle-delta'] = symbolizer.maxAngle
    if (symbolizer.visibility === false) props['@_opacity'] = 0
    if (symbolizer.maxWidth) {
      props['@_wrap-before'] = 'true'
      props['@_wrap-width'] = symbolizer.maxWidth
    }
    if (symbolizer.rotate) {
      props['@_rotate-displacement'] = 'true'
      props['@_orientation'] = symbolizer.rotate
    }
    if (symbolizer.offset) {
      const [x, y] = symbolizer.offset
      props['@_dx'] = x
      props['@_dy'] = y
    }
    if (symbolizer.anchor) {
      switch (symbolizer.anchor) {
        case 'center':
          props['@_vertical-alignment'] = 'middle'
          props['@_horizontal-alignment'] = 'middle'
        case 'right':
          props['@_horizontal-alignment'] = 'right'
          break
        case 'left':
          props['@_horizontal-alignment'] = 'left'
          break
        case 'top':
          props['@_vertical-alignment'] = 'top'
          break
        case 'top-left':
          props['@_vertical-alignment'] = 'top'
          props['@_horizontal-alignment'] = 'left'
          break
        case 'top-right':
          props['@_vertical-alignment'] = 'top'
          props['@_horizontal-alignment'] = 'right'
          break
        case 'bottom':
          props['@_vertical-alignment'] = 'bottom'
          break
        case 'bottom-left':
          props['@_vertical-alignment'] = 'bottom'
          props['@_horizontal-alignment'] = 'left'
          break
        case 'bottom-right':
          props['@_vertical-alignment'] = 'bottom'
          props['@_horizontal-alignment'] = 'right'
          break
      }
    }

    return {
      TextSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerGraphicFillToMapnikFile(graphicFill: PointSymbolizer): string | undefined {
    switch (graphicFill.kind) {
      case 'Mark':
        return this.getWellkownSvg(graphicFill.wellKnownName)
      case 'Icon':
        return graphicFill.image
      // TextSymbolizer for pattern not supported
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

  private getWellkownSvg(name: WellKnownName): string | undefined {
    switch (name) {
      case 'X':
        return 'x.svg'
      case 'Cross':
        return 'cross.svg'
      case 'Square':
        return 'square.svg'
      case 'Star':
        return 'star.svg'
      case 'Triangle':
        return 'triangle.svg'
      case 'shape://backslash':
        return 'shape-backslash.svg'
      case 'shape://carrow':
        return 'shape-carrow.svg'
      case 'shape://dot':
        return 'shape-dot.svg'
      case 'shape://horline':
        return 'shape-horline.svg'
      case 'shape://oarrow':
        return 'shape-oarrow.svg'
      case 'shape://plus':
        return 'shape-plus.svg'
      case 'shape://slash':
        return 'shape-slash.svg'
      case 'shape://times':
        return 'shape-times.svg'
      case 'shape://vertline':
        return 'shape-vertline.svg'
    }
  }

  /**
   * Returns the keys of an object where the value is equal to the passed in value.
   */
  private static keysByValue(object: any, value: any): string[] {
    return Object.keys(object).filter((key) => object[key] === value)
  }
}
