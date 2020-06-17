import path from 'path'
import { parse as xml2json, j2xParser as Json2xmlBuilder } from 'fast-xml-parser'
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

export type OutputRecords = {
  [key: string]: string
}

export interface MapnikSymbolizersOptions {
  PolygonSymbolizer?: OutputRecords
  PolygonPatternSymbolizer?: OutputRecords
  IconSymbolizer?: OutputRecords
  LineSymbolizer?: OutputRecords
  LinePatternSymbolizer?: OutputRecords
  MarkersSymbolizer?: OutputRecords
  RasterSymbolizer?: OutputRecords
  TextSymbolizer?: OutputRecords
}

export interface OutputOptions {
  includeMap?: boolean
  wellKnownBasePath?: string
  map?: OutputRecords
  style?: OutputRecords
  symbolizers?: MapnikSymbolizersOptions
}

export interface MapnikStyleParserOptions {
  output?: OutputOptions
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

  readonly outputOptions: OutputOptions

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

  constructor(options?: MapnikStyleParserOptions) {
    this.outputOptions = options?.output ?? {
      includeMap: true,
    }
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
      supressEmptyNode: true,
    })

    const mapnikObject = this.geoStylerToMapnikObject(geoStylerStyle)
    const mapnikXmlString = builder.parse(mapnikObject)
    return '<?xml version="1.0" encoding="utf-8"?>\n' + mapnikXmlString
  }

  private geoStylerToMapnikObject(geoStylerStyle: Style): any {
    const mapnikObj: any = {}
    let root = mapnikObj

    if (this.outputOptions.includeMap) {
      mapnikObj.Map = {}
      if (this.outputOptions.map) {
        mapnikObj.Map = this.applyOutputOptions(mapnikObj.Map, this.outputOptions.map)
      }
      root = mapnikObj.Map
    }

    root.Style = {
      Rule: this.geoStylerRulesToMapnik(geoStylerStyle.rules),
    }

    root.Style = this.applyOutputOptions(root.Style, this.outputOptions.style)

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
    const outlineProps: any = {}
    const isPolygonPatternSymbolizer = !!symbolizer.graphicFill
    const hasOutline = !!symbolizer.outlineColor
    const symbolizerName = isPolygonPatternSymbolizer ? 'PolygonPatternSymbolizer' : 'PolygonSymbolizer'
    const graphicFill = symbolizer.graphicFill && this.geoStylerGraphicFillToMapnikFile(symbolizer.graphicFill)

    if ('color' in symbolizer) props['@_fill'] = symbolizer.color
    if ('opacity' in symbolizer) props['@_fill-opacity'] = symbolizer.opacity
    if ('antialias' in symbolizer) props['@_gamma'] = symbolizer.antialias
    if (graphicFill) props['@_file'] = graphicFill
    if (symbolizer.visibility === false) props['@_fill-opacity'] = 0

    if ('outlineColor' in symbolizer) outlineProps['@_stroke'] = symbolizer.outlineColor
    if ('outlineOpacity' in symbolizer) outlineProps['@_stroke-opacity'] = symbolizer.outlineOpacity
    if ('outlineWidth' in symbolizer) outlineProps['@_stroke-width'] = symbolizer.outlineWidth
    if ('outlineDasharray' in symbolizer) outlineProps['@_stroke-dasharray'] = symbolizer.outlineDasharray

    return {
      [symbolizerName]: this.applyOutputOptions(
        Object.keys(props).length ? props : null,
        this.outputOptions.symbolizers?.[symbolizerName],
      ),
      ...(hasOutline && {
        LineSymbolizer: this.applyOutputOptions(outlineProps, this.outputOptions.symbolizers?.LineSymbolizer),
      }),
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

    if ('color' in symbolizer) props['@_stroke'] = symbolizer.color
    if ('opacity' in symbolizer) props['@_stroke-opacity'] = symbolizer.opacity
    if ('width' in symbolizer) props['@_stroke-width'] = symbolizer.width
    if ('cap' in symbolizer) props['@_stroke-linecap'] = symbolizer.cap
    if ('join' in symbolizer) props['@_stroke-linejoin'] = symbolizer.join
    if (symbolizer.dasharray) props['@_stroke-dasharray'] = symbolizer.dasharray.join(',')
    if (symbolizer.visibility === false) props['@_stroke-opacity'] = 0
    if (graphicStroke) props['@_file'] = graphicStroke
    if (graphicFill) props['@_file'] = graphicFill

    return {
      [symbolizerName]: this.applyOutputOptions(
        Object.keys(props).length ? props : null,
        this.outputOptions.symbolizers?.[symbolizerName],
      ),
    }
  }

  private geoStylerMarkOrIconSymbolizerToMapnik(symbolizer: MarkSymbolizer | IconSymbolizer): any {
    const props: any = {}

    if (symbolizer.kind === 'Mark') {
      if ('fillOpacity' in symbolizer) props['@_opacity'] = symbolizer.fillOpacity
      if ('strokeColor' in symbolizer) props['@_stroke'] = symbolizer.strokeColor
      if ('strokeWidth' in symbolizer) props['@_stroke-width'] = symbolizer.strokeWidth
      if ('strokeOpacity' in symbolizer) props['@_stroke-opacity'] = symbolizer.strokeOpacity
      if ('radius' in symbolizer) {
        props['@_width'] = symbolizer.radius
        props['@_height'] = symbolizer.radius
      }
      if ('wellKnownName' in symbolizer) {
        const icon = this.getFilePath(this.getWellkownSvg(symbolizer.wellKnownName))
        if (icon) props['@_file'] = icon
      }
    }

    if (symbolizer.kind === 'Icon') {
      if (symbolizer.allowOverlap) props['@allow-overlap'] = 'true'
      if (symbolizer.image) props['@_file'] = symbolizer.image
    }

    if ('color' in symbolizer) props['@_fill'] = symbolizer.color
    if ('avoidEdges' in symbolizer) props['@_avoid-edges'] = symbolizer.avoidEdges
    if ('rotate' in symbolizer && symbolizer.rotate !== 0) props['@_transform'] = `rotate(${symbolizer.rotate}deg)`
    if (symbolizer.visibility === false) props['@_opacity'] = 0

    return {
      MarkersSymbolizer: this.applyOutputOptions(
        Object.keys(props).length ? props : null,
        this.outputOptions.symbolizers?.MarkersSymbolizer,
      ),
    }
  }

  private geoStylerRasterSymbolizerToMapnik(symbolizer: RasterSymbolizer): any {
    const props: any = {}

    if ('opacity' in symbolizer) props['@_opacity'] = symbolizer.opacity
    if (symbolizer.visibility === false) props['@_opacity'] = 0

    return {
      RasterSymbolizer: Object.keys(props).length ? props : null,
    }
  }

  private geoStylerTextSymbolizerToMapnik(symbolizer: TextSymbolizer): any {
    const props: any = {}

    if ('label' in symbolizer) props['#text'] = `[${symbolizer.label}]`
    if ('opacity' in symbolizer) props['@_opacity'] = symbolizer.opacity
    if ('allowOverlap' in symbolizer) props['@_allow-overlap'] = symbolizer.allowOverlap
    if ('avoidEdges' in symbolizer) props['@_avoid-edges'] = symbolizer.avoidEdges
    if ('color' in symbolizer) props['@_fill'] = symbolizer.color
    if ('font' in symbolizer) props['@_face-name'] = symbolizer.font
    if ('size' in symbolizer) props['@_size'] = symbolizer.size
    if ('haloColor' in symbolizer) props['@_halo-fill'] = symbolizer.haloColor
    if ('haloWidth' in symbolizer) props['@_halo-radius'] = symbolizer.haloWidth
    if ('justify' in symbolizer) props['@_justify-alignment'] = symbolizer.justify
    if ('letterSpacing' in symbolizer) props['@_character-spacing'] = symbolizer.letterSpacing
    if ('lineHeight' in symbolizer) props['@_line-spacing'] = symbolizer.lineHeight
    if ('padding' in symbolizer) props['@_margin'] = symbolizer.padding
    if ('transform' in symbolizer) props['@_text-transform'] = symbolizer.transform
    if ('maxAngle' in symbolizer) props['@_max-char-angle-delta'] = symbolizer.maxAngle
    if (symbolizer.visibility === false) props['@_opacity'] = 0
    if ('maxWidth' in symbolizer) {
      props['@_wrap-before'] = 'true'
      props['@_wrap-width'] = symbolizer.maxWidth
    }
    if ('rotate' in symbolizer && symbolizer.rotate !== 0) {
      props['@_rotate-displacement'] = 'true'
      props['@_orientation'] = symbolizer.rotate
    }
    if (symbolizer.offset) {
      const [x, y] = symbolizer.offset
      props['@_dx'] = x
      props['@_dy'] = y
    }
    if ('anchor' in symbolizer) {
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
      TextSymbolizer: this.applyOutputOptions(
        Object.keys(props).length ? props : null,
        this.outputOptions.symbolizers?.TextSymbolizer,
      ),
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

  private applyOutputOptions(xmlObject?: any, outputRecords?: OutputRecords): any {
    if (!xmlObject) return null
    if (!outputRecords) return xmlObject

    return Object.entries(outputRecords).reduce(
      (acc, [key, val]) => ({
        ...acc,
        [`@_${key}`]: val,
      }),
      xmlObject,
    )
  }

  private getFilePath(filePath?: string): string | undefined {
    if (!filePath) return
    return this.outputOptions.wellKnownBasePath ? path.join(this.outputOptions.wellKnownBasePath, filePath) : filePath
  }

  private static keysByValue(object: any, value: any): string[] {
    return Object.keys(object).filter((key) => object[key] === value)
  }
}
