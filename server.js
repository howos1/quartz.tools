const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const stringSimilarity = require('string-similarity');
const multer = require('multer');
const sharp = require('sharp');

let pngToIco = require('png-to-ico');
if (pngToIco.default) pngToIco = pngToIco.default;

let fetch;
if (globalThis.fetch) {
    fetch = globalThis.fetch;
} else {
    fetch = require('node-fetch');
}

const { getPreview } = require('spotify-url-info')(fetch);

const app = express();
const PORT = 3131;

const TURNSTILE_SECRET_KEY = ' ';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function matchTracks(base, candidates) {
    if (!candidates || !candidates.length) return null;

    const SCORE_THRESHOLD = 0.70;
    let bestCandidate = null;
    let highestScore = 0;

    for (const cand of candidates) {
        if (!cand) continue;

        if (base.isrc && cand.isrc && base.isrc === cand.isrc) {
            return cand; 
        }

        let score = 0;

        const durationDiff = Math.abs(base.duration - cand.duration);
        if (durationDiff <= 3) {
            score += 0.4; 
        } else if (durationDiff <= 8) {
            score += 0.2;
        } else if (durationDiff > 12) {
            continue; 
        }

        const titleSim = stringSimilarity.compareTwoStrings(base.title.toLowerCase(), cand.title.toLowerCase());
        const artistSim = stringSimilarity.compareTwoStrings(base.artist.toLowerCase(), cand.artist.toLowerCase());
        
        score += (titleSim * 0.4) + (artistSim * 0.2);

        if (score > highestScore && score >= SCORE_THRESHOLD) {
            highestScore = score;
            bestCandidate = cand;
        }
    }

    return bestCandidate;
}

async function searchAppleMusic(queryText) {
    try {
        const res = await fetch(`https://apple-dl.vercel.app/api/search?q=${encodeURIComponent(queryText)}&storefront=ru`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            return data[0];
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function requestAppleDownload(songId, sessionId) {
    try {
        const res = await fetch('https://apple-dl.vercel.app/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                song_id: songId,
                fingerprint: sessionId,
                codec: 'alac',
                output_format: 'flac',
                storefront: 'ru'
            })
        });
        const data = await res.json();
        if (data && data.status === 'success' && data.audio_url) {
            return {
                url: `https://apple-dl.vercel.app${data.audio_url}`,
                title: data.title,
                artist: data.artist
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function searchDeezer({ title, artist, isrc }) {
    try {
        let url = `https://api.deezer.com/track/isrc:${isrc}`;
        let res = await fetch(url);
        let data = await res.json();

        if (data.error) {
            const query = encodeURIComponent(`${artist} ${title}`);
            url = `https://api.deezer.com/search?q=${query}&limit=3`;
            res = await fetch(url);
            data = await res.json();
            if (!data.data || !data.data.length) return null;
            
            return data.data.map(track => ({
                source: 'deezer',
                url: track.link,
                title: track.title,
                artist: track.artist.name,
                duration: track.duration,
                isrc: null
            }));
        }

        return [{
            source: 'deezer',
            url: data.link,
            title: data.title,
            artist: data.artist.name,
            duration: data.duration,
            isrc: data.isrc
        }];
    } catch (e) {
        return null;
    }
}

async function searchSoundCloud({ title, artist }) {
    try {
        const query = encodeURIComponent(`${artist} ${title}`);
        const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${query}&client_id=IL74gVkYFMI2UQ9uM9av997v8wI6vVp6&limit=3`);
        const data = await res.json();
        
        if (!data.collection || !data.collection.length) return null;

        return data.collection.map(track => ({
            source: 'soundcloud',
            url: track.permalink_url,
            title: track.title,
            artist: track.user.username,
            duration: Math.floor(track.duration / 1000),
            isrc: track.isrc || null
        }));
    } catch (e) {
        return null;
    }
}

async function fetchDeezerDirect(trackId) {
    try {
        const res = await fetch(`https://api.deezer.com/track/${trackId}`);
        const data = await res.json();
        if (data.error) return null;
        return {
            title: data.title,
            artist: data.artist.name,
            url: data.link
        };
    } catch (e) {
        return null;
    }
}

app.post('/api/convert-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'error: no image uploaded' });
        }

        const token = req.body.token;
        if (!token) {
            return res.status(400).json({ error: 'error: missing captcha verification token' });
        }

        try {
            const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
            const captchaResponse = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: TURNSTILE_SECRET_KEY,
                    response: token,
                    remoteip: req.ip
                })
            });
            const captchaResult = await captchaResponse.json();
            if (!captchaResult.success) {
                return res.status(403).json({ error: 'captcha verification failed: bot detected' });
            }
        } catch (captchaError) {
            console.error('Turnstile verification error:', captchaError);
            return res.status(500).json({ error: 'security verification service error' });
        }

        const requestedFormat = typeof req.body.format === 'string' ? req.body.format.toLowerCase() : 'png';
        const allowedFormats = ['png', 'jpg', 'webp', 'ico'];
        const outputFormat = allowedFormats.includes(requestedFormat) ? requestedFormat : 'png';

        let convertedBuffer;
        let mimeType;
        let filename;

        if (outputFormat === 'ico') {
            const squarePng = await sharp(req.file.buffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();

            convertedBuffer = await pngToIco(squarePng);
            mimeType = 'image/x-icon';
            filename = 'converted.ico';
        } else {
            const sharpFormat = outputFormat === 'jpg' ? 'jpeg' : outputFormat;
            convertedBuffer = await sharp(req.file.buffer)
                .toFormat(sharpFormat, { quality: 95 })
                .toBuffer();

            mimeType = outputFormat === 'jpg'
                ? 'image/jpeg'
                : outputFormat === 'png'
                    ? 'image/png'
                    : 'image/webp';

            filename = `converted.${outputFormat}`;
        }

        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('Content-Type', mimeType);
        res.send(convertedBuffer);
    } catch (err) {
        console.error('Image conversion error:', err);
        res.status(500).json({ error: 'error while converting image' });
    }
});

app.post('/api/download', async (req, res) => {
    let { url, format, token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'error: missing captcha verification token' });
    }

    try {
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const captchaResponse = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: TURNSTILE_SECRET_KEY,
                response: token,
                remoteip: req.ip
            })
        });

        const captchaResult = await captchaResponse.json();
        if (!captchaResult.success) {
            return res.status(403).json({ error: 'captcha verification failed: bot detected' });
        }
    } catch (captchaError) {
        console.error('Turnstile verification error:', captchaError);
        return res.status(500).json({ error: 'security verification service error' });
    }

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'error: invalid link' });
    }

    if (url.includes('link.deezer.com') || url.includes('deezer.page.link')) {
        try {
            const redirectRes = await fetch(url, { 
                method: 'GET', 
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            url = redirectRes.url; 
        } catch (e) {
            console.error('Deezer link expand error:', e);
        }
    }

    const allowedFormats = ['mp3', 'flac', 'opus'];
    const fileFormat = allowedFormats.includes(format) ? format : 'mp3';

    const sessionId = crypto.randomBytes(16).toString('hex');
    const tempDir = path.join(__dirname, 'temp', sessionId);
    
    try {
        fs.mkdirSync(tempDir, { recursive: true });
    } catch (err) {
        return res.status(500).json({ error: 'internal server error while creating cache' });
    }

    try {
        let downloadUrl = '';
        let metaTitle = 'Track';
        let metaArtist = 'Unknown Artist';

        if (url.includes('spotify.com') && url.includes('/track/')) {
            const spotifyData = await getPreview(url);
            const spotifyMeta = {
                title: spotifyData.title,
                artist: spotifyData.artist,
                duration: Math.floor(spotifyData.duration / 1000), 
                isrc: spotifyData.isrc || null
            };

            metaTitle = spotifyMeta.title;
            metaArtist = spotifyMeta.artist;

            const searchQuery = `${metaArtist} - ${metaTitle}`;
            
            const [appleRes, deezerRes, scRes] = await Promise.all([
                searchAppleMusic(searchQuery).catch(() => null),
                searchDeezer(spotifyMeta).catch(() => null),
                searchSoundCloud(spotifyMeta).catch(() => null)
            ]);

            const appleCandidates = appleRes && appleRes.id ? [{
                source: 'apple',
                id: appleRes.id,
                url: `https://music.apple.com/ru/song/${appleRes.id}`,
                title: appleRes.title || appleRes.name || '',
                artist: appleRes.artist || (appleRes.artists && appleRes.artists[0]?.name) || '',
                duration: spotifyMeta.duration,
                isrc: appleRes.isrc || null
            }] : [];

            const candidates = [
                ...appleCandidates,
                ...(deezerRes || []),
                ...(scRes || [])
            ];

            let bestSource = matchTracks(spotifyMeta, candidates);

            if (!bestSource) {
                downloadUrl = `ytsearch1:${spotifyMeta.artist} - ${spotifyMeta.title} audio`;
            } else if (bestSource.source === 'apple') {
                const appleDownloadInfo = await requestAppleDownload(bestSource.id, sessionId);
                 if (appleDownloadInfo) {
                     downloadUrl = appleDownloadInfo.url;
                     metaTitle = appleDownloadInfo.title || metaTitle;
                     metaArtist = appleDownloadInfo.artist || metaArtist;
                 } else {
                    const backupCandidates = candidates.filter(c => c.source !== 'apple');
                    let backupSource = matchTracks(spotifyMeta, backupCandidates);
                    downloadUrl = backupSource ? backupSource.url : `ytsearch1:${spotifyMeta.artist} - ${spotifyMeta.title} audio`;
                 }
            } else {
                downloadUrl = bestSource.url;
            }

        } else if (url.includes('deezer.com') && url.includes('/track/')) {
            const match = url.match(/\/track\/(\d+)/);
            if (!match) throw new Error('invalid deezer track link');
            const info = await fetchDeezerDirect(match[1]);
            if (!info) throw new Error('deezer track not found');
            metaTitle = info.title;
            metaArtist = info.artist;
            downloadUrl = info.url;

        } else if (url.includes('music.apple.com')) {
            let appleSongId = null;
            
            const songMatch = url.match(/\/song\/.*\/(\d+)/) || url.match(/[\?&]i=(\d+)/) || url.match(/\/album\/.*\/(\d+)/);
            if (songMatch) {
                appleSongId = songMatch[1];
            } else {
                const appleTrack = await searchAppleMusic(url);
                if (appleTrack) appleSongId = appleTrack.id;
            }

            if (!appleSongId) throw new Error('invalid apple music track link');

            const appleDownloadInfo = await requestAppleDownload(appleSongId, sessionId);
            if (!appleDownloadInfo) {
                throw new Error('apple music track not found or wrapper api error');
            }

            metaTitle = appleDownloadInfo.title;
            metaArtist = appleDownloadInfo.artist;
            downloadUrl = appleDownloadInfo.url;

        } else if (url.includes('soundcloud.com')) {
            downloadUrl = url;
            const outputNameArgs = [
                url,
                '--print', 'title',
                '--print', 'uploader'
            ];
            try {
                const metaResult = await new Promise((resolve, reject) => {
                    execFile('yt-dlp', outputNameArgs, (err, stdout) => {
                        if (err) reject(err);
                        else resolve(stdout.trim().split('\n'));
                    });
                });
                if (metaResult && metaResult.length >= 2) {
                    metaTitle = metaResult[0] || 'Track';
                    metaArtist = metaResult[1] || 'SoundCloud Artist';
                }
            } catch (e) {
                metaTitle = 'SoundCloud Track';
                metaArtist = 'SoundCloud';
            }
        } else {
            fs.rmSync(tempDir, { recursive: true, force: true });
            return res.status(400).json({ error: 'error: unsupported music platform link' });
        }

        const cleanTitle = metaTitle.replace(/[\\/:*?"<>|]/g, '');
        const cleanArtist = metaArtist.replace(/[\\/:*?"<>|]/g, '');
        const outputFilenameTemplate = `${cleanArtist} - ${cleanTitle}.%(ext)s`;
        
        const args = [
            downloadUrl,
            '--no-update',                                           
            '--no-check-certificates',                              
            '--extractor-args', 'youtube:player_client=android,web', 
            '-x',                                                    
            '--audio-format', fileFormat,                            
            '--audio-quality', '0',                                  
            '-o', outputFilenameTemplate                            
        ];

        execFile('yt-dlp', args, { cwd: tempDir }, (error, stdout, stderr) => {
            if (error) {
                console.error("--- YT-DLP ERROR ---", stderr || error.message);
                fs.rmSync(tempDir, { recursive: true, force: true });
                return res.status(500).json({ error: 'error during download or conversion process' });
            }

            try {
                const files = fs.readdirSync(tempDir);
                const downloadedFile = files.find(file => file.endsWith(`.${fileFormat}`));

                if (!downloadedFile) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    return res.status(404).json({ error: 'resulting audio file not found' });
                }

                const filePath = path.join(tempDir, downloadedFile);
                const encodedFilename = encodeURIComponent(downloadedFile);
                
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
                
                res.download(filePath, downloadedFile, (downloadErr) => {
                    try {
                        if (fs.existsSync(tempDir)) {
                            fs.rmSync(tempDir, { recursive: true, force: true });
                        }
                    } catch (err) {}
                });

            } catch (dirErr) {
                try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (err) {}
                return res.status(500).json({ error: 'error reading file cache' });
            }
        });

    } catch (err) {
        console.error("Global error:", err);
        try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
        return res.status(500).json({ error: err.message || 'failed to process track or fetch metadata' });
    }
});

app.listen(PORT, () => {
    console.log(`Server successfully started: http://localhost:${PORT}`);
});