import { readFileSync } from 'node:fs'
import { readPsd } from 'ag-psd'
import { summarizePsd, summaryToText, colorModeName, formatBytes, summarizeLayers } from './src/psd.ts'

for (const file of ['/tmp/test.psd', '/tmp/text-simple.psd']) {
  const buf = readFileSync(file)
  const psd = readPsd(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
    skipLayerImageData: true,
    skipThumbnail: true,
    skipCompositeImageData: true,
    logMissingFeatures: false,
  })
  const summary = summarizePsd(psd)
  console.log(`\n${file} (${formatBytes(buf.length)})`)
  console.log('  ', summaryToText(summary))
  console.log('   colorMode:', summary.colorMode, '| bits:', summary.bitsPerChannel, '| channels:', summary.channels, '| alpha:', summary.hasAlpha)
  console.log('   layers:', JSON.stringify(summary.layers))
  console.log('   top-level names:', (psd.children ?? []).slice(0, 5).map(l => `${l.name}${l.hidden ? '(hidden)' : ''}`).join(', '))
}

// 纯函数边界
console.log('\ncolorModeName:', [3,4,9,1,0,7,8,2,42,undefined].map(colorModeName).join(' / '))
console.log('formatBytes:', [0, 999, 1536, 5*1024*1024, 3.4*1024**3].map(formatBytes).join(' / '))
console.log('summarizeLayers(undefined):', JSON.stringify(summarizeLayers(undefined)))
