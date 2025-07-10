// opl_plr.js by kvee
// simplified & modified by konsumer
// this is the entry-point interface that imports the other stuff (bundle this with esbuild)

/*
 * MIT License
 *
 * Copyright (c) 2023 kvee
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// a bit wonky, but it makes esbuild bundle everything, including worker & wasm
import wasmBytes from './nuked.wasm'
import workerSource from './audio.worker.js'
const workletJS = workerSource.replace('WASMBYTES', wasmBytes.join(','))


const debug = false ? console.debug : (()=>{})


/*
 * It targets wasi-compiled code that exposes the following API functions / arrays:
 *
 * - void opl3_reset(uint32_t samplerate)
 * - void opl3_write(uint16_t reg, uint8_t data)
 * - void opl3_render()
 * - int16_t *opl3_buf_ptr()
 *     This buffer points to a static memory location containing current samples after calling opl3_render();
 * - memory
 *     The memory array samples are gathered from
 */

function soundLoad(soundData) {
  // 2xOPL2 -> OPL3
  if (soundData.dualOpl2Mode) {
    // Process relevant register writes
    soundData.commands = soundData.commands.map((c) => {
      if (
        // Command writes into a relevant register...
        (c.r & 0xff) >= 0xc0 &&
        (c.r & 0xff) <= 0xc8 &&
        // ...that has all channel bits off
        // (which means it's likely just plain OPL2 data as expected)
        (c.v & 0xf0) == 0
      )
        // Set channel bits for OPL3 playback
        c.v |= c.r < 0x100 ? 0x10 : 0x20

      return c
    })

    // Enable NEW for stereo
    soundData.commands.unshift({ t: 0, r: 0x105, v: 1 })
  }

  return soundData
}

export function imf(imfData, imfRate = 560) {
  var soundData = {
    commands: [],
    cmdRate: imfRate
  }
  var arr = new Uint8Array(imfData)

  // debug("IMF file rate:", imfRate);

  var time = 0
  var length = arr[0] | (arr[1] << 8)
  var extraSearch = arr[2] | (arr[3] << 8)
  var startOffset = 2

  if (length == 0) {
    length = arr.byteLength
    startOffset = extraSearch == 0 ? 0 : 2
  }

  for (var i = startOffset; i < length; i += 4) {
    soundData.commands.push({ t: time, r: arr[i], v: arr[i + 1] })
    time += arr[i + 2] | (arr[i + 3] << 8)
  }

  return soundLoad(soundData)
}

export function raw(rawData) {
  const pitFreq = 14318180 / 12
  var soundData = {
    commands: [],
    cmdRate: pitFreq
  }
  var arr = new Uint8Array(rawData)

  const get16 = (i) => arr[i] | (arr[i + 1] << 8)
  const get32 = (i) => arr[i] | (arr[i + 1] << 8) | (arr[i + 2] << 16) | (arr[i + 3] << 24)

  if (get32(0) != 0x41574152 /* "RAWA" */ && get32(4) != 0x41544144 /* "DATA" */) {
    console.error('Not a RAW file: Bad file identifier!')
    return soundLoad(soundData)
  }

  // debug("RAW file");

  var time = 0
  var clock = get16(8)
  var regOffset = 0
  for (var i = 10; i < arr.byteLength; i += 2) {
    const r = arr[i + 1]
    const v = arr[i]
    if (r == 0) {
      time += v * clock
      continue
    } else if (r == 2) {
      if (v == 0) {
        // Clock change.
        i += 2
        clock = get16(i)
      } else if (v == 1) {
        // Set low chip / p0
        regOffset = 0
      } else if (v == 2) {
        // Set high chip / p1
        regOffset = 0x100
      }
      continue
    } else {
      soundData.commands.push({ t: time, r: r | regOffset, v: v })
    }
  }

  return soundLoad(soundData)
}

export function dro(droData) {
  var soundData = {
    commands: [],
    cmdRate: 1000,
    dualOpl2Mode: false
  }
  var arr = new Uint8Array(droData)

  const get16 = (i) => arr[i] | (arr[i + 1] << 8)
  const get32 = (i) => arr[i] | (arr[i + 1] << 8) | (arr[i + 2] << 16) | (arr[i + 3] << 24)

  if (get32(0) != 0x41524244 /* "DBRA" */ && get32(4) != 0x4c504f57 /* "WOPL" */) {
    console.error('Not a DRO file: Bad file identifier!')
    return soundLoad(soundData)
  }

  const version = get16(8).toString(16) + '.' + get16(10).toString(16)

  debug('DRO file version:', version == '0.1' ? 1.0 : +version)

  if (version < 2) {
    const hardware = arr[0x14]
    switch (hardware) {
      case 0:
        debug('Chip type: OPL2')
        break
      case 1:
        debug('Chip type: OPL3')
        break
      case 2:
        debug('Chip type: Dual OPL2')
        soundData.dualOpl2Mode = true
        break
      default:
        debug('Unknown chip type!')
        return soundLoad(soundData)
    }
    const dataOffset = get32(0x14) - hardware == 0 ? 0x18 : 0x15

    var time = 0
    var regOffset = 0
    for (var i = dataOffset; i < arr.byteLength; i++) {
      const r = arr[i]
      switch (r) {
        // Delay D
        case 0:
          time += arr[i + 1] + 1
          i++
          break

        // Delay Dl, Dh
        case 1:
          time += (arr[i + 1] | (arr[i + 2] << 8)) + 1
          i += 2
          break

        // Set low chip / p0
        case 2:
          regOffset = 0
          break

        // Set high chip / p1
        case 3:
          regOffset = 0x100
          break

        // Register escape: [E], R, V
        case 4:
          soundData.commands.push({ t: time, r: arr[i + 1] | regOffset, v: arr[i + 2] })
          i += 2
          break

        // R, V
        default:
          soundData.commands.push({ t: time, r: r | regOffset, v: arr[i + 1] })
          i++
          break
      }
    }

    return soundLoad(soundData)
  } else if (version == 2) {
    //0x12
    const hardware = arr[0x14]
    switch (hardware) {
      case 0:
        debug('Chip type: OPL2')
        break
      case 1:
        debug('Chip type: Dual OPL2')
        soundData.dualOpl2Mode = true
        break
      case 2:
        debug('Chip type: OPL3')
        break
      default:
        debug('Unknown chip type!')
        return soundLoad(soundData)
    }

    const format = arr[0x15]
    if (format != 0) {
      console.error('Only interleaved mode is supported!')
      return soundLoad(soundData)
    }

    const compression = arr[0x16]
    if (compression != 0) {
      console.error('Only uncompressed data is supported!')
      return soundLoad(soundData)
    }

    const shortDelayCode = arr[0x17]
    const longDelayCode = arr[0x18]
    const codemapLength = arr[0x19]
    var codes = []
    for (var i = 0; i < codemapLength; i++) codes[i] = arr[0x1a + i]

    var time = 0
    for (var i = 0x1a + codemapLength; i < arr.byteLength; i++) {
      const r = arr[i]
      switch (r) {
        // Delay D
        case shortDelayCode:
          time += arr[i + 1] + 1
          i++
          break

        // 256x delay D
        case longDelayCode:
          time += (arr[i + 1] + 1) << 8
          i++
          break

        // R, V
        default:
          const rc = r & 0x80 ? 0x100 | codes[r & 0x7f] : codes[r]
          soundData.commands.push({ t: time, r: rc, v: arr[i + 1] })
          i++
          break
      }
    }

    return soundLoad(soundData)
  } else {
    console.error('DRO version', +version, 'playback not supported!')
    return soundLoad(soundData)
  }
}

export function vgm(vgmData, loopRepeat) {
  var soundData = {
    commands: [],
    cmdRate: 44100,
    dualOpl2Mode: false
  }
  var arr = new Uint8Array(vgmData)

  const get32 = (i) => arr[i] | (arr[i + 1] << 8) | (arr[i + 2] << 16) | (arr[i + 3] << 24)

  if (get32(0) != 0x206d6756 /* "Vgm " */) {
    console.error('Not a VGM file: Bad file identifier!')
    return soundLoad(soundData)
  }

  const version = get32(8).toString(16)
  const dataOffset = version < 150 ? 0x40 : 0x34 + get32(0x34)

  debug('VGM file version:', +(version / 100).toFixed(2), 'data offset:', dataOffset)

  var loopOffset = get32(0x1c)
  if (loopOffset) loopOffset += 0x1c
  const loopCount = get32(0x20)
  if (loopCount) debug('Loop present:', loopCount, '@', loopOffset)

  const clockOpl2 = get32(0x50) & 0x3fffffff
  const clockOpl3 = get32(0x5c) & 0x3fffffff
  if (clockOpl2 == 3579545) debug('OPL2 detected:', clockOpl2, 'Hz', '(standard clock rate)')
  else if (clockOpl2) debug('OPL2 detected:', clockOpl2, 'Hz')
  if (clockOpl3 == 14318180) debug('OPL3 detected:', clockOpl3, 'Hz', '(standard clock rate)')
  else if (clockOpl3) debug('OPL3 detected:', clockOpl3, 'Hz')

  const dualOpl2 = get32(0x50) & 0x40000000
  const dualOpl3 = get32(0x5c) & 0x40000000
  if (dualOpl2) {
    debug('Dual OPL2 mode!')
    soundData.dualOpl2Mode = true
  }
  if (dualOpl3) {
    console.error('Dual OPL3 mode not supported!')
    return soundLoad(soundData)
  }

  if (clockOpl2 && clockOpl3) {
    console.error('Combined OPL2 and OPL3 playback not supported!')
    return soundLoad(soundData)
  }

  var time = 0
  for (var loop = 0; loop < (loopCount ? 1 + (loopRepeat ?? 1) : 1); loop++) {
    var start = loop == 0 ? dataOffset : loopOffset
    for (var i = start; i < arr.byteLength; i++) {
      if (arr[i] >= 0x70 && arr[i] <= 0x7f) {
        // Delay D
        time += arr[i] & 0x0f
      } else
        switch (arr[i]) {
          case 0x5a:
            // YM3812 R, V
            soundData.commands.push({ t: time, r: arr[i + 1], v: arr[i + 2] })
            i += 2
            break

          case 0x5b:
            // YM3526 R, V
            soundData.commands.push({ t: time, r: arr[i + 1], v: arr[i + 2] })
            i += 2
            break

          case 0x5e:
            // YMF262 p0R, V
            soundData.commands.push({ t: time, r: arr[i + 1], v: arr[i + 2] })
            i += 2
            break

          case 0xaa:
          // YM3812#2 R, V
          // Stored in YMF262 p1. Only allowed because the OPL2 + OPL3 combination is forbidden!
          // case fall-through!
          case 0x5f:
            // YMF262 p1R, V
            soundData.commands.push({ t: time, r: 0x100 | arr[i + 1], v: arr[i + 2] })
            i += 2
            break

          case 0x61:
            // Delay Dl, Dh
            time += arr[i + 1] | (arr[i + 2] << 8)
            i += 2
            break

          case 0x62:
            // Delay 735
            time += 735
            break

          case 0x63:
            // Delay 882
            time += 882
            break

          case 0x66:
            // End of sound data
            i = arr.byteLength
            break

          default:
            console.warn('Unknown command', arr[i].toString(16), 'at offset', i)

            // Skip known reserved ranges
            if (arr[i] >= 0x30 && arr[i] <= 0x3f) i++
            else if (arr[i] >= 0x41 && arr[i] <= 0x4e) i += version < 160 ? 1 : 2
            else if ((arr[i] >= 0xc9 && arr[i] <= 0xcf) || (arr[i] >= 0xd7 && arr[i] <= 0xdf)) i += 3
            else if (arr[i] >= 0xe2 && arr[i] <= 0xff) i += 4
            else return

            break
        }
    }
  }
  return soundLoad(soundData)
}

// wait for an audio-context port-message a certain type
const waitForMessage = (port, type, timeout = 500) =>
  new Promise((resolve, reject) => {
    const cb = ({ data }) => {
      if (data.type === type) {
        clearTimeout(t)
        port.removeEventListener('message', cb)
        resolve(data)
      }
    }
    port.addEventListener('message', cb)
    const t = setTimeout(() => {
      port.removeEventListener('message', cb)
      reject(new Error(`Timeout waiting for ${type}`))
    }, timeout)
  })

class TimeEvent extends Event {
  #total
  #current

  constructor({ total, current }) {
    super('time')
    this.#total = total
    this.#current = current
  }

  get total() {
    return this.#total
  }

  get current() {
    return this.#current
  }
}

// This requires web AudioContext API
export async function createAudioWorklet(audioContext, queue) {
  await audioContext.audioWorklet.addModule(URL.createObjectURL(new Blob([workletJS], { type: 'application/javascript' })))
  const node = new AudioWorkletNode(audioContext, 'nuked-opl3-processor', { numberOfOutputs: 1, outputChannelCount: [2] })

  node.port.start()
  await waitForMessage(node.port, 'wasm-ready')

  node.port.addEventListener('message', ({ data: { type, ...info } }) => {
    if (type === 'time') {
      node.dispatchEvent(new TimeEvent(info))
      node.timeTotal = info.total
      node.timeCurrent = info.current
    }
  })

  node.play = () => node.port.postMessage({ type: 'play' })
  node.stop = () => node.port.postMessage({ type: 'stop' })
  node.pause = () => node.port.postMessage({ type: 'pause' })
  node.seek = (time) => node.port.postMessage({ type: 'seek', time })
  node.queue = async (queue) => {
    node.port.postMessage({ type: 'queue', queue })
    await waitForMessage(node.port, 'queue')
  }

  if (queue) {
    await node.queue(queue)
  }

  return node
}
