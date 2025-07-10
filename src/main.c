/* Nuked OPL3 wrapper for easy Emscripted compilation / usage.
 * Licensed under the same license (LGPL 2.1 or later) as Nuked OPL3,
 * as is required.
 */
#include "opl3.h"

static int16_t sample_buf[4];
static opl3_chip chip;

__attribute__((export_name("reset")))
void opl3_reset(uint32_t samplerate) {
    OPL3_Reset(&chip, samplerate);
}

__attribute__((export_name("write")))
void opl3_write(uint16_t reg, uint8_t data) {
    OPL3_WriteRegBuffered(&chip, reg, data);
}

__attribute__((export_name("render")))
void opl3_render() {
    OPL3_Generate4ChResampled(&chip, &sample_buf[0]);
}

__attribute__((export_name("buf_ptr")))
int16_t *opl3_buf_ptr() {
    return sample_buf;
}
