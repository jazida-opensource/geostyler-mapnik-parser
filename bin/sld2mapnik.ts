import fs from 'fs'
import path from 'path'
import { sld2mapnik } from '../src/converter'

function printHelp() {
  console.log('\nUsage: sld2mapnik.js <input.sld>')
}

async function main() {
  const inputPath = path.resolve(process.argv[2])

  if (!inputPath) {
    printHelp()
    process.exit(1)
  }

  const result = await sld2mapnik(fs.readFileSync(inputPath, 'utf8'))
  process.stdout.write(result)
}

main()
