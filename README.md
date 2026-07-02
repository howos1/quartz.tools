<div align="center">

<img src="https://quartz.furrysobachka.ru/img/banner.png" alt="quartz.musix" width="100%">

<br/>
<br/>

**A simple, open-source Spotify downloader. Save your favorite music in high quality, completely free and without ads.**

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://cloudflare.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

[**→ Try it**](https://quartz.furrysobachka.ru)

</div>

---

## How it works

You paste a link from a streaming service — quartz.musix finds the track across multiple audio sources and returns it as a file in the format and quality you picked. No redirects, no waiting rooms, no bullshit.

```
you paste  →  https://open.spotify.com/track/...
you get    →  track.flac  (lossless, 1:1 audio)
```

---

## Supported sources

Links from these services are accepted as input. The list keeps growing.

| Service | Status |
|---|---|
| 🟢 Deezer | supported |
| 🟢 YouTube / YouTube Music | supported |
| 🟢 SoundCloud | supported |
| 🟢 Apple Music | supported · hi-res lossless available |
| ➕ *more coming* | [open an issue](../../issues) |

---

## Output formats

Pick what you want before downloading.

| Format | Quality | Best for |
|---|---|---|
| `flac` | Lossless 16-bit / 44.1 kHz · up to 24-bit / 192 kHz hi-res (Apple Music) | Archiving, audiophiles |
| `mp3` | 320 kbps CBR | Universal compatibility |
| `opus` | Variable bitrate, OGG container | Efficient, great on mobile |

---

## Why not just use \<other tool\>?

Most alternatives are broken half the time, wrapped in ads, require you to sign up, or cap you at 128kbps and pretend that's fine.

quartz.musix is different:

- **No account.** Open the page, paste a link, done.
- **No ads.** Zero. Not now, not in a future "premium" tier.
- **Real quality.** Lossless FLAC is the default option — not a locked feature.
- **Multi-source.** Not tied to one backend. If one source is down, others are tried.
- **Open source.** Read the code, self-host it, contribute to it.

## Why is it free?

Because it costs almost nothing to run and we don't want to monetize it. Same reason [cobalt.tools](https://cobalt.tools) is free — some tools should just exist without being a business.

---

## Self-hosting

```bash
git clone https://github.com/howos1/quartz.tools
cd quartz.tools

# backend (Node.js)
npm install
node server.js
```

Open `http://localhost:3131`.


<div align="center">

MIT License · inspired by [cobalt.tools](https://cobalt.tools)

</div>
