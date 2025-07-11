[![NPM Version](https://img.shields.io/npm/v/%40konsumer%2Fnuked?style=social)](https://www.npmjs.com/package/@konsumer/nuked)

This is an OPL (IMF, WLF, RAW, DRO, VGM, VGZ) player for the web (and elswhere) based on [opl_plr.js by kvee](http://software.kvee.cz/)

The main changes I made are to make it lighter & simpler (and more universal) using wasi-sdk instead of emscripten, and to use `AudioWorkletProcessor` instead of depracated `ScriptProcessor` for sound-generation. This performs better, and runs in more places. I also added wave-out support, so it can be used in other places.

## installation

You can install in your own project (for bundling with vite, etc) with:

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
imf(imfData, (imfRate = 560))
raw(rawData)
dro(droData)
vgm(vgmData, loopRepeat)

// this creates an audio-worklet for playback
createAudioWorklet(audioContext, queue)

// This generates a Uint8Array of bytes for a WAV-file, and can be used offline
createWave(queue)
```

### wav

You can generate a WAV (RIFF, uncompressed) file for use in anyhting else:

```js
// create a queue from a file
const queue = imf(await fetch('mysong.imf').then((r) => r.arrayBuffer()))

// create WAV-bytes from queue
const wav = await createWave(queue)

// create a URL (on web) suitable for a audio-tag
const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
```

Here is a full nodejs example:

```js
import { imf, createWave } from "@konsumer/nuked";
import { readFile, writeFile } from "node:fs/promises";

const f = await readFile("break_my_heart.imf");
const q = imf(f);
const w = await createWave(q);
await writeFile("break_my_heart.wav", w);

// or 1-line conversion:
await writeFile("break_my_heart.wav", await readFile("break_my_heart.imf").then(imf).then(createWave));
```

Here is a full [bun](https://bun.sh/) (using built-ins) example:

```js
import { imf, createWave } from "@konsumer/nuked"

const f = await Bun.file("break_my_heart.imf")
const b = await f.arrayBuffer()
const q = imf(b)
const w = await createWave(q)
await Bun.write("break_my_heart.wav", w)
```

You can see an example of this, in [test.html](docs/test.html). It's a bit slower than direct-output, but it works in places where you cannot use the worklet (native node/deno/bun/etc.)

### worklet

[AudioWorkletProcessor](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor) is a hyper-efficient worker (similar to thread) that will run audio-processing in the background. You can use it like this:

```js
import { imf, createAudioWorklet } from '@konsumer/nuked'

// create an audio-context
const ctx = new AudioContext()

// create a queue from a file
const queue = imf(await fetch('mysong.imf').then((r) => r.arrayBuffer()))

// create a worklet from a queue/context
const opl = await createAudioWorklet(ctx, queue)

// connect it to output. you can also use effects see https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API
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

I do this in [nuked-player web-component](docs/nuked-player.js).

## plans

Eventually, I would like to minimize any js host requirements, so it can run in more places like:

- [null0](https://github.com/notnullgames/null0)
- [null-units](https://github.com/konsumer/null-units)
- support [many more formats](https://github.com/SudoMaker/adlib2vgm)

And I need to test to make sure it works in other js AudioContext-hosts like:

- [web-audio-api](https://github.com/ircam-ismm/node-web-audio-api)
