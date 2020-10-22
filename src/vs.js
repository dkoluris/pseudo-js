/* Base structure taken from PCSX-df open source emulator, and improved upon (Credits: Stephen Chao) */

#define ram  mem.__ram
#define hwr  mem.__hwr
#define vram  vs.__vram

#define GPU_DATA   0
#define GPU_STATUS 4

#define GPU_COMMAND(x)\
  (x>>>24)&0xff

#define READIMG(data) {\
  n2: (data[1]>>> 0)&0xffff,\
  n3: (data[1]>>>16)&0xffff,\
  n4: (data[2]>>> 0)&0xffff,\
  n5: (data[2]>>>16)&0xffff,\
}

pseudo.CstrGraphics = (function() {
  const GPU_STAT_ODDLINES         = 0x80000000;
  const GPU_STAT_DMABITS          = 0x60000000;
  const GPU_STAT_READYFORCOMMANDS = 0x10000000;
  const GPU_STAT_READYFORVRAM     = 0x08000000;
  const GPU_STAT_IDLE             = 0x04000000;
  const GPU_STAT_DISPLAYDISABLED  = 0x00800000;
  const GPU_STAT_INTERLACED       = 0x00400000;
  const GPU_STAT_RGB24            = 0x00200000;
  const GPU_STAT_PAL              = 0x00100000;
  const GPU_STAT_DOUBLEHEIGHT     = 0x00080000;
  const GPU_STAT_WIDTHBITS        = 0x00070000;
  const GPU_STAT_MASKENABLED      = 0x00001000;
  const GPU_STAT_MASKDRAWN        = 0x00000800;
  const GPU_STAT_DRAWINGALLOWED   = 0x00000400;
  const GPU_STAT_DITHER           = 0x00000200;

  const GPU_DMA_NONE     = 0;
  const GPU_DMA_MEM2VRAM = 2;
  const GPU_DMA_VRAM2MEM = 3;

  const ret = {
    status: 0,
      data: 0,
  };

  var modeDMA, vpos, vdiff, isVideoPAL, isVideo24Bit;

  // VRAM Operations
  var vrop = {
    h: {},
    v: {},
  };

  // Command Pipe
  var pipe = {
    data: new UintWcap(256)
  };

  // Primitive Size
  var sizePrim = [
    0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x00
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x10
    4, 4, 4, 4, 7, 7, 7, 7, 5, 5, 5, 5, 9, 9, 9, 9, // 0x20
    6, 6, 6, 6, 9, 9, 9, 9, 8, 8, 8, 8,12,12,12,12, // 0x30
    3, 3, 3, 3, 0, 0, 0, 0, 5, 5, 5, 5, 6, 6, 6, 6, // 0x40
    4, 4, 4, 4, 0, 0, 0, 0, 7, 7, 7, 7, 9, 9, 9, 9, // 0x50
    3, 3, 3, 3, 4, 4, 4, 4, 2, 2, 2, 2, 3, 3, 3, 3, // 0x60
    2, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 3, 3, // 0x70
    4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x80
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x90
    3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xa0
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xb0
    3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xc0
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xd0
    0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xe0
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xf0
  ];

  // Resolution Mode
  var resMode = [
    256, 320, 512, 640, 368, 384, 512, 640
  ];

  function pipeReset() {
    pipe.data.fill(0);
    pipe.prim = 0;
    pipe.size = 0;
    pipe.row  = 0;
  }

  var dataMem = {
    write(stream, addr, size) {
      var i = 0;
      
      while (i < size) {
        if (modeDMA === GPU_DMA_MEM2VRAM) {
          if ((i += fetchFromRAM(stream, addr, size-i)) >= size) {
            continue;
          }
          addr += i;
        }
        
        ret.data = stream ? directMemW(ram.uw, addr) : addr;
        addr += 4;
        i++;

        if (!pipe.size) {
          const prim  = GPU_COMMAND(ret.data);
          const count = sizePrim[prim];

          if (count) {
            pipe.data[0] = ret.data;
            pipe.prim = prim;
            pipe.size = count;
            pipe.row  = 1;
          }
          else {
            continue;
          }
        }
        else {
          pipe.data[pipe.row] = ret.data;
          pipe.row++;
        }

        if (pipe.size === pipe.row) {
          pipe.size = 0;
          pipe.row  = 0;

          render.draw(pipe.prim, pipe.data);
        }
      }
    }
  }

  function fetchFromRAM(stream, addr, size) {
    var count = 0;

    // False alarm!
    if (!vrop.enabled) {
      modeDMA = GPU_DMA_NONE;
      return 0;
    }
    size <<= 1;

    while (vrop.v.p < vrop.v.end) {
      while (vrop.h.p < vrop.h.end) {
        // Keep position of vram
        const pos = (vrop.v.p << 10) + vrop.h.p;

        if (isVideo24Bit) {
        }
        else {
        }

        // Check if it`s a 16-bit (stream), or a 32-bit (command) address
        if (stream) {
          vram.uh[pos] = directMemH(ram.uh, addr);
        }
        else { // A dumb hack for now
          if (!(count % 2)) {
            vram.uw[pos >>> 1] = addr;
          }
        }

        addr += 2;
        vrop.h.p++;

        if (++count === size) {
          if (vrop.h.p === vrop.h.end) {
            vrop.h.p = vrop.h.start;
            vrop.v.p++;
          }
          return fetchEnd(count);
        }
      }

      vrop.h.p = vrop.h.start;
      vrop.v.p++;
    }
    return fetchEnd(count);
  }

  function fetchEnd(count) {
    if (vrop.v.p >= vrop.v.end) {
      render.outputVRAM(vrop.raw, vrop.h.start, vrop.v.start, vrop.h.end - vrop.h.start, vrop.v.end - vrop.v.start);
      
      vrop.raw.fill(0);
      vrop.enabled = false;

      modeDMA = GPU_DMA_NONE;
    }

    if (count % 2) {
      count++;
    }
    return count >>> 1;
  }

  // Exposed class functions/variables
  return {
    __vram: union(FRAME_W * FRAME_H * 2),

    reset() {
      vram.uh.fill(0);
      ret.data     = 0x400;
      ret.status   = GPU_STAT_READYFORCOMMANDS | GPU_STAT_IDLE | GPU_STAT_DISPLAYDISABLED | 0x2000;
      modeDMA      = GPU_DMA_NONE;
      vpos         = 0;
      vdiff        = 0;
      isVideoPAL   = false;
      isVideo24Bit = false;

      // VRAM Operations
      vrop.enabled = false;
      vrop.raw     = 0;
      vrop.h.p     = 0;
      vrop.h.start = 0;
      vrop.h.end   = 0;
      vrop.v.p     = 0;
      vrop.v.start = 0;
      vrop.v.end   = 0;

      // Command Pipe
      pipeReset();
    },

    redraw() {
      ret.status ^= GPU_STAT_ODDLINES;
    },

    scopeW(addr, data) {
      switch(addr&0xf) {
        case GPU_DATA:
          dataMem.write(false, data, 1);
          return;

        case GPU_STATUS:
          switch(GPU_COMMAND(data)) {
            case 0x00:
              ret.status   = 0x14802000;
              isVideoPAL   = false;
              isVideo24Bit = false;
              return;

            case 0x01:
              pipeReset();
              return;

            case 0x04:
              modeDMA = data & 3;
              return;

            case 0x05:
              vpos = Math.max(vpos, (data >>> 10) & 0x1ff);
              return;
                
            case 0x07:
              vdiff = ((data >>> 10) & 0x3ff) - (data & 0x3ff);
              return;

            case 0x08:
              isVideoPAL   = ((data) & 8) ? true : false;
              isVideo24Bit = ((data >>> 4) & 1) ? true : false;

              {
                // Basic info
                const w = resMode[(data & 3) | ((data & 0x40) >>> 4)];
                const h = (data & 4) ? 480 : 240;
                
                if ((data >>> 5) & 1) { // No distinction for interlaced
                  render.resize({ w: w, h: h });
                }
                else { // Normal modes
                  if (h == vdiff) {
                    render.resize({ w: w, h: h });
                  }
                  else {
                    vdiff = vdiff == 226 ? 240 : vdiff; // paradox-059
                    render.resize({ w: w, h: vpos ? vpos : vdiff });
                  }
                }
              }
              return;

            case 0x10:
              switch(data & 0xffffff) {
                case 7:
                    ret.data = 2;
                    return;
              }
              return;

            /* unused */
            case 0x02:
            case 0x03:
            case 0x06:
              return;
          }
          psx.error('GPU Write Status ' + psx.hex(GPU_COMMAND(data)));
          return;
      }
    },

    scopeR(addr) {
      switch(addr & 0xf) {
        case GPU_DATA:
          return ret.data;

        case GPU_STATUS:
          return ret.status | GPU_STAT_READYFORVRAM;
      }
    },

    executeDMA(addr) {
      const size = (bcr >>> 16) * (bcr & 0xffff);

      switch(chcr) {
        case 0x00000401: // Disable DMA?
          return;

        case 0x01000200: // Read
          return;

        case 0x01000201:
          dataMem.write(true, madr, size);
          return;

        case 0x01000401:
          while(madr !== 0xffffff) {
            const count = directMemW(ram.uw, madr);
            dataMem.write(true, (madr+4)&0x1ffffc, count>>>24);
            madr = count&0xffffff;
          }
          return;
      }
      psx.error('GPU DMA ' + psx.hex(chcr));
    },

    inread(data) {
      const p = READIMG(data);

      vrop.enabled = true;
      vrop.raw     = new UintWcap(p.n4 * p.n5);

      vrop.h.start = vrop.h.p = p.n2;
      vrop.v.start = vrop.v.p = p.n3;
      vrop.h.end   = vrop.h.p + p.n4;
      vrop.v.end   = vrop.v.p + p.n5;

      modeDMA = GPU_DMA_MEM2VRAM;

      // Cache invalidation
      tcache.invalidate(vrop.h.start, vrop.v.start, vrop.h.end, vrop.v.end);
    }
  };
})();

#undef ram
#undef hwr
#undef vram
