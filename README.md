This is an OPL (IMF, WLF, RAW, DRO, VGM, VGZ) player for the web (and elswhere) based on [opl_plr.js by kvee](http://software.kvee.cz/)

The main changes I made are to make it lighter & simpler (and more universal) using wasi-sdk instead of emscripten, and to use `AudioWorkletProcessor` instead of depracated `ScriptProcessor` for sound-generation. This performs better, and runs in more places.

Additionally, I would like to make an offline wav-generator, so you can output a sound-file.

Eventuially, I would like to minimize any js host requirements, so it can run in more places like:

- [null0](https://github.com/notnullgames/null0)
- [null-units](https://github.com/konsumer/null-units)
