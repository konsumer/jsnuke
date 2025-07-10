This is an OPL (IMF, WLF, RAW, DRO, VGM, VGZ) player for the web (and elswhere) based on [opl_plr.js by kvee](http://software.kvee.cz/)

The main changes I made are to make it lighter & simpler (and more universal) using wasi-sdk instead of emscripten, and to use `AudioWorkletProcessor` instead of depracated `ScriptProcessor` for sound-generation. This performs better, and runs in more places.

## installation

You can install in your own project with

```sh
npm i @konsumer/nuked
```

You can add to the web with:

```html
<script type="importmap">
  {
    "imports": {
      "@konsumer/nuked": "https://esm.run/@konsumer/nuked",
      "@konsumer/nuked/nuked-player": "https://esm.run/@konsumer/nuked/nuked-player",
      "pako": "https://esm.run/pako"
    }
  }
</script>
```

Now you can import from these, if your script-tag has `type=module`. If you want optional VGZ support (and are using the web-component) add `pako`. 

## usage

There are a few ways to use it. The easiest is a quick web-component:

```html
<script type="module">
  import '@konsumer/nuked/nuked-player'
</script>

<nuked-player src="song.imf"></nuked-player>
```

There are a few functions exported:


```js
// these create a "queue" from various files (as Uint8Array or ArrayBuffer, or whatever)
imf(imfData, imfRate = 560)
raw(rawData)
dro(droData)
vgm(vgmData, loopRepeat)

// these creates an audio-worklet
createAudioWorklet(audioContext, queue)
```

### worklet

[AudioWorkletProcessor](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor) is a hyper-efficient worker (similar to thread) that will run audio-processing in the background. You can use it like this:

```js
import { imf, createAudioWorklet } from '@konsumer/nuked'

// create an audio-context
const ctx = new AudioContext()

// create a queue from a file
const queue = imf(await fetch('mysong.imf').then(r => r.arrayBuffer()))

// create a worklet from a queue/context
const opl = await createAudioWorklet(ctx, queue)

// connect it to output
opl.connect(ctx.destination)

// stuff you can do
opl.play()
opl.stop()
opl.pause() // toggle pause-state
opl.seek(4) // in seconds

// respond to time-updates
opl.addEventListener('time', ({ current, total }) => {
  console.log({ current, total })
})

// you can also get the time right after parsing it (in case you need time, but can't play it through audio-context)
const total = nuke.getTimeLength(queue)

```


### vgz


VGZ is just gzipped VGM. You can parse it in js like this:

```js
import { vgm } as nuke from '@konsumer/nuked'
import pako from 'pako'

const queue = vgm(pako.ungzip(await fetch('mysong.vgz').then(r => r.arrayBuffer())))
```

I do this in [nuked-player.js](docs/nuked-player.js).


## plans


I would like to make an offline wav-generator, so you can output a sound-file.

Eventually, I would like to minimize any js host requirements, so it can run in more places like:

- [null0](https://github.com/notnullgames/null0)
- [null-units](https://github.com/konsumer/null-units)

And I need to test to make sure it works in other js hosts like:

- [web-audio-api](https://github.com/ircam-ismm/node-web-audio-api)

