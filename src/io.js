#define hwr mem._hwr

#define data32\
  directMemW(mem._hwr.uw, 0x1070)

#define mask32\
  directMemW(mem._hwr.uw, 0x1074)

#define data16\
  directMemH(mem._hwr.uh, 0x1070)

#define mask16\
  directMemH(mem._hwr.uh, 0x1074)

pseudo.CstrHardware = (function() {
  // Exposed class functions/variables
  return {
    write: {
      w(addr, data) {
        addr&=0xffff;

        if (addr >= 0x0000 && addr <= 0x03ff) { // Scratchpad
          directMemW(hwr.uw, addr) = data;
          return;
        }

        if (addr >= 0x1080 && addr <= 0x10e8) { // DMA
          if (addr&8) {
            dma.execute(addr, data);
            return;
          }
          directMemW(hwr.uw, addr) = data;
          return;
        }

        if (addr >= 0x1114 && addr <= 0x1118) { // Rootcounters
          directMemW(hwr.uw, addr) = data;
          return;
        }

        if (addr >= 0x1810 && addr <= 0x1814) { // Graphics
          vs.scopeW(addr, data);
          return;
        }

        switch(addr) {
          case 0x1070:
            data32 &= data&mask32;
            return;

          case 0x10f4:
            icr = (icr&(~((data&0xff000000)|0xffffff)))|(data&0xffffff);
            return;

          /* unused */
          case 0x1000:
          case 0x1004:
          case 0x1008:
          case 0x100c:
          case 0x1010:
          case 0x1014:
          case 0x1018:
          case 0x101c:
          case 0x1020:
          case 0x1060:
          case 0x1074:
          case 0x10f0:
            directMemW(hwr.uw, addr) = data;
            return;
        }
        psx.error('pseudo / Hardware write w '+hex(addr)+' <- '+hex(data));
      },

      h(addr, data) {
        addr&=0xffff;

        if (addr >= 0x1100 && addr <= 0x1128) { // Rootcounters
          directMemH(hwr.uh, addr) = data;
          return;
        }
        
        if (addr >= 0x1c00 && addr <= 0x1dfe) { // Audio
          directMemH(hwr.uh, addr) = data;
          return;
        }

        switch(addr) {
          /* unused */
          case 0x1074:
            directMemH(hwr.uh, addr) = data;
            return;
        }
        psx.error('pseudo / Hardware write h '+hex(addr)+' <- '+hex(data));
      },

      b(addr, data) {
        addr&=0xffff;
        
        switch(addr) {
          /* unused */
          case 0x2041: // DIP Switch?
            directMemB(hwr.ub, addr) = data;
            return;
        }
        psx.error('pseudo / Hardware write b '+hex(addr)+' <- '+hex(data));
      }
    },

    read: {
      w(addr) {
        addr&=0xffff;

        if (addr >= 0x1080 && addr <= 0x10e8) { // DMA
          return directMemW(hwr.uw, addr);
        }

        if (addr >= 0x1110 && addr <= 0x1110) { // Rootcounters
          return directMemW(hwr.uw, addr);
        }

        if (addr >= 0x1810 && addr <= 0x1814) { // Graphics
          return vs.scopeR(addr);
        }

        switch(addr) {
          /* unused */
          case 0x1074:
          case 0x10f0:
          case 0x10f4:
            return directMemW(hwr.uw, addr);
        }
        psx.error('pseudo / Hardware read w '+hex(addr));
      },

      h(addr) {
        addr&=0xffff;

        if (addr >= 0x1c0c && addr <= 0x1dae) { // Audio
          return directMemH(hwr.uh, addr);
        }

        switch(addr) {
          /* unused */
          case 0x1074:
            return directMemH(hwr.uh, addr);
        }
        psx.error('pseudo / Hardware read h '+hex(addr));
      }
    }
  };
})();

#undef hwr