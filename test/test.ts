import fs from 'fs'
import path from 'path'
import { sld2mapnik } from '../src/converter'

async function main() {
  const file = path.join(__dirname, '../../test/test.sld.xml')
  const result = await sld2mapnik(fs.readFileSync(file, 'utf8'))
  console.log(result)
}

main()
