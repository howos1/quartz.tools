let statusTimeout;

document.addEventListener('DOMContentLoaded', () => {
    const audioSelect = document.getElementById('audioFormat');
    const savedAudio = localStorage.getItem('audioFormat');
    if (savedAudio) {
        audioSelect.value = savedAudio;
    }
    audioSelect.addEventListener('change', (e) => {
        localStorage.setItem('audioFormat', e.target.value);
    });

    const imageSelect = document.getElementById('imageFormat');
    const savedImage = localStorage.getItem('imageFormat');
    if (savedImage) {
        imageSelect.value = savedImage;
    }
    imageSelect.addEventListener('change', (e) => {
        localStorage.setItem('imageFormat', e.target.value);
    });

    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const tabs = document.querySelectorAll('.tab-content');
    const headerTitle = document.querySelector('#mainHeader .logo span');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            navItems.forEach(nav => nav.classList.remove('active'));
            tabs.forEach(tab => tab.classList.remove('active'));

            item.classList.add('active');
            
            const tabId = item.getAttribute('data-tab');
            document.getElementById(`${tabId}Tab`).classList.add('active');

            if (tabId === 'music') {
                headerTitle.textContent = 'musix';
            } else if (tabId === 'images') {
                headerTitle.textContent = 'images';
            }
        });
    });

    const imageInput = document.getElementById('imageInput');
    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            const label = document.getElementById('imageLabel');
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = function(ev) {
                    label.innerHTML = `<img src="${ev.target.result}" alt="preview">`;
                };
                reader.readAsDataURL(file);
            } else {
                label.textContent = 'choose an image...';
                label.style.color = 'var(--text-muted)';
            }
        });
    }
});

function toggleSettings() { 
    const grid = document.getElementById('settingsGrid');
    const btn = document.getElementById('settingsToggleBtn');
    grid.classList.toggle('open'); 
    btn.classList.toggle('active');
    btn.classList.add('download-success');
    setTimeout(() => btn.classList.remove('download-success'), 1000);
}

function toggleImageSettings() { 
    const grid = document.getElementById('imageSettingsGrid');
    const btn = document.getElementById('imageSettingsToggleBtn');
    grid.classList.toggle('open'); 
    btn.classList.toggle('active');
    btn.classList.add('download-success');
    setTimeout(() => btn.classList.remove('download-success'), 1000);
}

function onCaptchaSuccess(token) {
    const badge = document.getElementById('captchaBadge');
    badge.className = 'turnstile-badge success';
    badge.innerHTML = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => {
        badge.classList.add('hidden');
    }, 1000);
}

function onCaptchaExpired() {
    resetBadge();
}

function onCaptchaError() {
    const badge = document.getElementById('captchaBadge');
    badge.className = 'turnstile-badge';
    badge.style.color = '#ff453a';
    badge.style.borderColor = 'rgba(255, 69, 58, 0.4)';
    badge.innerHTML = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
}

function resetBadge() {
    const badge = document.getElementById('captchaBadge');
    badge.className = 'turnstile-badge verifying';
    badge.style.color = '';
    badge.style.borderColor = '';
    badge.innerHTML = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M12 6v6l4 2"></path></svg>';
}

async function processDownload() {
    const urlInput = document.getElementById('urlInput');
    const btn = document.getElementById('downloadBtn');
    const loader = document.getElementById('loader');
    const format = document.getElementById('audioFormat').value;
    const url = urlInput.value.trim();

    const turnstileResponse = turnstile.getResponse();

    if (!url) { showStatus('please paste a link', 'error'); return; }
    
    const isSupported = url.includes('spotify.com') || 
                        url.includes('deezer.com') || 
                        url.includes('link.deezer.com') ||
                        url.includes('music.apple.com') || 
                        url.includes('soundcloud.com');
                        
    if (!isSupported) { 
        showStatus('not a valid music platform link', 'error'); 
        return; 
    }

    if (!turnstileResponse) {
        showStatus('please complete the security check', 'error');
        return;
    }

    btn.disabled = true; 
    urlInput.disabled = true; 
    loader.style.display = 'block';
    showStatus('processing on server...', '');

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, format, token: turnstileResponse })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'server error');
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition');
        let filename = `track.${format}`;
        
        if (disposition) {
            const utf8Match = disposition.match(/filename\*=utf-8''([^;\n]*)/i);
            const normalMatch = disposition.match(/filename="?([^;\n"\r]*)"?/i);
            
            if (utf8Match && utf8Match[1]) {
                filename = decodeURIComponent(utf8Match[1]);
            } else if (normalMatch && normalMatch[1]) {
                filename = decodeURIComponent(normalMatch[1]);
            }
        }

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        
        btn.classList.add('download-success');
        setTimeout(() => btn.classList.remove('download-success'), 1000);

        showStatus('done!', 'success');
    } catch (err) {
        showStatus(err.message, 'error');
    } finally {
        btn.disabled = false; 
        urlInput.disabled = false; 
        loader.style.display = 'none';
        turnstile.reset();
        resetBadge();
    }
}

async function processImageConvert() {
    const input = document.getElementById('imageInput');
    const format = document.getElementById('imageFormat').value;
    const btn = document.getElementById('convertBtn');

    const turnstileResponse = turnstile.getResponse();

    if (!input.files || input.files.length === 0) {
        showStatus('please select an image', 'error');
        return;
    }

    if (!turnstileResponse) {
        showStatus('please complete the security check', 'error');
        return;
    }

    btn.disabled = true;
    showStatus('converting image...', '');

    const formData = new FormData();
    formData.append('image', input.files[0]);
    formData.append('format', format);
    formData.append('token', turnstileResponse);

    try {
        const response = await fetch('/api/convert-image', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'conversion error');
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition');
        let filename = `converted.${format}`;
        
        if (disposition) {
            const utf8Match = disposition.match(/filename\*=utf-8''([^;\n]*)/i);
            const normalMatch = disposition.match(/filename="?([^;\n"\r]*)"?/i);
            if (utf8Match && utf8Match[1]) {
                filename = decodeURIComponent(utf8Match[1]);
            } else if (normalMatch && normalMatch[1]) {
                filename = decodeURIComponent(normalMatch[1]);
            }
        }

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        
        btn.classList.add('download-success');
        setTimeout(() => btn.classList.remove('download-success'), 1000);
        showStatus('done!', 'success');
    } catch (err) {
        showStatus(err.message, 'error');
    } finally {
        btn.disabled = false;
        turnstile.reset();
        resetBadge();
    }
}

function showStatus(text, type) {
    const status = document.getElementById('statusMessage');
    
    clearTimeout(statusTimeout);
    
    status.textContent = text;
    status.className = 'status ' + type;
    
    if (text && text !== 'processing on server...' && text !== 'converting image...') {
        statusTimeout = setTimeout(() => {
            status.classList.add('hidden');
            setTimeout(() => {
                if(status.classList.contains('hidden')) {
                    status.textContent = '';
                }
            }, 500);
        }, 5000);
    }
}