var wasmBytes = new Uint8Array([WASMBYTES])

class NukedOpl3Processor extends AudioWorkletProcessor {
  constructor(...args) {
    super(...args)

    this.i = 0

    WebAssembly.instantiate(wasmBytes, {}).then(({ instance }) => {
      this.wasm = instance.exports
      this.wasm.reset(sampleRate)
      this.port.postMessage({ type: 'wasm-ready' })
    })

    this.port.onmessage = ({ data: { type, ...args } }) => {
      if (type === 'queue') {
        this.queuedSoundData = args.queue
        this.sendTime(this.queuedSoundData)
        this.port.postMessage({ type: 'queue' })
        this.wasm.reset(sampleRate)
        this.stop()
      } else if (type === 'stop') {
        this.stop()
      } else if (type === 'play') {
        this.play()
      } else if (type === 'pause') {
        this.pause()
      } else if (type === 'seek') {
        this.seek(args.time)
      }
    }
  }

  process(inputs, outputs, parameters) {
    if (!this.wasm) {
      return true
    }

    const bufferSize = outputs[0][0].length

    if (this.queuedSoundData) {
      this.soundData = this.queuedSoundData
      this.queuedSoundData = null
      this.dataIndex = 0
      this.samplePosition = 0
      this.wasm.reset(sampleRate)
    }

    // every 20 data-frames output info about time
    if (this.i++ % 20 === 0) {
      this.sendTime(this.soundData)
    }

    if (!this.soundData || this.softStop > 0) {
      for (var sample = 0; sample < bufferSize; sample++) {
        outputs[0][0][sample] = outputs[0][1][sample] = 0
      }
      return true
    }

    if (this.afterSeek) {
      this.samplePosition = this.bufferSize * Math.floor(this.samplePosition / bufferSize)
      this.afterSeek = false
    }

    const rateFactor = this.soundData.cmdRate / sampleRate

    const v = new DataView(this.wasm.memory.buffer)
    const ptr = this.wasm.buf_ptr()

    if (this.afterSeek) {
      this.samplePosition = bufferSize * Math.floor(this.samplePosition / bufferSize)
      this.afterSeek = false
    }

    for (var sample = 0; sample < bufferSize; sample++) {
      while (this.dataIndex < this.soundData.commands.length && this.soundData.commands[this.dataIndex].t <= this.samplePosition * rateFactor) {
        const command = this.soundData.commands[this.dataIndex++]
        this.wasm.write(command.r, command.v)
      }
      if (this.dataIndex == this.soundData.commands.length) {
        this.stop()
      } else {
        this.samplePosition++
      }
      this.wasm.render()
      outputs[0][0][sample] = v.getInt16(ptr, true) / 32768
      outputs[0][1][sample] = v.getInt16(ptr + 2, true) / 32768
    }

    return true
  }

  sendTime(soundData) {
    const current = (this.samplePosition || 0) / (sampleRate ?? 1)
    const total = !soundData?.commands || soundData.commands.length == 0 ? 0 : soundData.commands[soundData.commands.length - 1].t / soundData.cmdRate
    this.port.postMessage({ type: 'time', total, current })
  }

  pause() {
    this.softStop = this.softStop ? 0 : 1
  }

  stop() {
    this.dataIndex = 0
    this.samplePosition = 0
    this.softStop = 1
  }

  play() {
    this.softStop = 0
  }

  seek(time) {
    console.log(time)
    if (!this.soundData?.commands) {
      return
    }
    const adjTime = time * this.soundData.cmdRate
    this.wasm.reset(sampleRate)
    this.dataIndex = 0
    var registerData = []
    while (this.dataIndex < this.soundData.commands.length && this.soundData.commands[this.dataIndex].t < adjTime) {
      const command = this.soundData.commands[this.dataIndex++]
      registerData[command.r] = command.v
    }
    if (registerData[0x105]) {
      this.wasm.write(0x105, registerData[0x105])
    }
    for (const r in registerData) {
      this.wasm.write(r, registerData[r])
    }
    if (this.dataIndex < this.soundData.commands.length) {
      this.samplePosition = time * sampleRate
      this.afterSeek = true
    } else {
      this.stop()
    }
  }
}

registerProcessor('nuked-opl3-processor', NukedOpl3Processor)
