{ pkgs }: {
  deps = [
    # Node.js
    pkgs.nodejs_18
    pkgs.nodePackages.npm
    
    # Playwright/Chromium dependencies
    pkgs.chromium
    pkgs.chromium.sandbox
    
    # Required libraries for Chromium
    pkgs.glib
    pkgs.nss
    pkgs.nspr
    pkgs.atk
    pkgs.at-spi2-atk
    pkgs.cairo
    pkgs.pango
    pkgs.pcre
    pkgs.libdrm
    pkgs.libxkbcommon
    pkgs.libxshmfence
    pkgs.libxcomposite
    pkgs.xdpyinfo
    pkgs.xorg.libX11
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXfixes
    pkgs.xorg.libXrandr
    pkgs.xorg.libxkbfile
    pkgs.xorg.libxcb
    pkgs.xorg.libXext
    pkgs.gtk3
    pkgs.gdk-pixbuf
    pkgs.cups
    pkgs.libcap
    pkgs.alsa-lib
    pkgs.dbus
    pkgs.dbus-glib
    pkgs.expat
    pkgs.fontconfig
    pkgs.freetype
    pkgs.libglvnd
    pkgs.mesa
    pkgs.vulkan-loader
    
    # Fonts
    pkgs.font-awesome
    pkgs.freefont_ttf
    pkgs.liberation_ttf
    
    # Utilities
    pkgs.wget
    pkgs.curl
  ];
  
  env = {
    CHROME_BIN = "${pkgs.chromium}/bin/chromium";
    CHROMIUM_PATH = "${pkgs.chromium}/bin/chromium";
    PLAYWRIGHT_BROWSERS_PATH = "/home/runner/.cache/ms-playwright";
    HEADLESS = "true";
  };
}