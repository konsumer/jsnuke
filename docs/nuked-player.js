// this is a simple web-component to encapsulate loading a simple little player

import * as nuke from '@konsumer/nuked'
import pako from 'pako'

const basename = (f) => f.split('/').pop()

// VGZ is just compressed VGM
const vgzHandler = b => nuke.vgm(pako.ungzip(b))


class NukedPlayer extends HTMLElement {
  static get observedAttributes() {
    return ['src']
  }

  constructor() {
    super()
    const shadow = this.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>
        div {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          font-size: 24px;
        }
        button {
          background: none;
          color: inherit;
          border: none;
          padding: 0;
          font: inherit;
          cursor: pointer;
          outline: inherit;
        }
      </style>
      <div>
        <button>▶️</button>
        <button>⏸️</button>
        <button>⏹️</button>
        <input type="range" value="0" step="0.01" />
        <span>0.00</span> / <span>0.00</span> : 
        <span></span>
      </div>
    `

    const [buttonPlay, buttonPause, buttonStop] = shadow.querySelectorAll('button')
    const timeSlider = shadow.querySelector('input')
    const [timeCurrent, timeTotal, nameSpace] = shadow.querySelectorAll('span')

    this.timeSlider = timeSlider
    this.timeTotal = timeTotal
    this.nameSpace = nameSpace

    this.sliding = false
    timeSlider.addEventListener('mousedown', () => {
      this.sliding = true
    })
    timeSlider.addEventListener('mouseup', () => {
      this.sliding = false
      if (this.opl) {
        this.opl.seek(parseFloat(timeSlider.value))
      }
    })

    shadow.addEventListener('click', async () => {
      const ctx = new AudioContext()
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      if (!this.opl && this.soundq) {
        this.opl = await nuke.createAudioWorklet(ctx, this.soundq)
        delete this.soundq
        this.opl.connect(ctx.destination)
        this.opl.addEventListener('time', ({ current, total }) => {
          if (!this.sliding) {
            timeSlider.value = timeCurrent.innerText = current.toFixed(2)
            timeSlider.max = timeTotal.innerText = total.toFixed(2)
          }
        })
      }
    })

    buttonPlay.addEventListener('click', () => {
      setTimeout(() => this?.opl?.play && this.opl.play(), 100)
    })

    buttonPause.addEventListener('click', () => {
      setTimeout(() => this?.opl?.pause && this.opl.pause(), 100)
    })

    buttonStop.addEventListener('click', () => {
      setTimeout(() => this?.opl?.stop && this.opl.stop(), 100)
    })
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'src' && newValue) {
      let parser
      if (newValue.toLowerCase().endsWith('.imf')) {
        parser = nuke.imf
      } else if (newValue.toLowerCase().endsWith('.dro')) {
        parser = nuke.dro
      } else if (newValue.toLowerCase().endsWith('.vgm')) {
        parser = nuke.vgm
      } else if (newValue.toLowerCase().endsWith('.vgz')) {
        parser = vgzHandler
      } else {
        parser = nuke.raw
      }

      if (parser) {
        fetch(newValue)
          .then((r) => r.arrayBuffer())
          .then((bytes) => {
            this.nameSpace.innerText = basename(newValue)
            this.soundq = parser(bytes)
            // hack to get total before audio-context can start
            const total = !this.soundq?.commands || this.soundq.commands.length == 0 ? 0 : this.soundq.commands[this.soundq.commands.length - 1].t / this.soundq.cmdRate
            this.timeSlider.max = this.timeTotal.innerText = total.toFixed(2)
          })
      }
    }
  }
}

customElements.define('nuked-player', NukedPlayer)
