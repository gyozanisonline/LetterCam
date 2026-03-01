const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// ── DOM controls ───────────────────────────────────────────────────────────────
const toggleButton   = document.getElementById('toggleInput');
const videoFileInput = document.getElementById('videoFile');
const charSetSelect  = document.getElementById('char-set-select');
const fontSelect     = document.getElementById('font-select');
const colorThemeSel  = document.getElementById('color-theme-select');
const mirrorBtn      = document.getElementById('mirror-btn');
const invertBtn      = document.getElementById('invert-btn');
const helpBtn        = document.getElementById('help-btn');
const helpOverlay    = document.getElementById('help-overlay');
let isUsingWebcam = true;

// ── Feature 6: mode toggles ───────────────────────────────────────────────────
let isMirrored = false;
let isInverted = false;

mirrorBtn.addEventListener('click', () => {
    isMirrored = !isMirrored;
    mirrorBtn.textContent = isMirrored ? 'On' : 'Off';
    mirrorBtn.classList.toggle('active', isMirrored);
});

invertBtn.addEventListener('click', () => {
    isInverted = !isInverted;
    invertBtn.textContent = isInverted ? 'On' : 'Off';
    invertBtn.classList.toggle('active', isInverted);
});

function toggleHelp() {
    helpOverlay.classList.toggle('hidden');
    helpBtn.textContent = helpOverlay.classList.contains('hidden') ? 'Show' : 'Hide';
}
helpBtn.addEventListener('click', toggleHelp);

// ── Recording button (injected) ───────────────────────────────────────────────
const recordButton = document.createElement('button');
recordButton.textContent = 'Start Recording';
document.querySelector('.input-container').appendChild(recordButton);

// ── Snapshot button ───────────────────────────────────────────────────────────
const snapshotButton = document.createElement('button');
snapshotButton.textContent = 'Snapshot';
document.querySelector('.input-container').appendChild(snapshotButton);

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// ── Sliders ───────────────────────────────────────────────────────────────────
const sliders = {
    resolution:         document.getElementById('resolution-slider'),
    letterSize:         document.getElementById('letter-size-slider'),
    motionSensitivity:  document.getElementById('motion-sensitivity-slider'),
    colorSpeed:         document.getElementById('color-speed-slider'),
    hue:                document.getElementById('hue-slider'),
    saturation:         document.getElementById('saturation-slider'),
    scatterFrequency:   document.getElementById('scatter-frequency-slider'),
    animationDirection: document.getElementById('animation-direction-slider'),
    gridOpacity:        document.getElementById('grid-opacity-slider'),
    fontWeight:         document.getElementById('font-weight-slider'),
    trailDecay:         document.getElementById('trail-decay-slider'),
    fps:                document.getElementById('fps-slider'),
};

// ── Feature 2: Character sets ─────────────────────────────────────────────────
const CHARACTER_SETS = {
    english:  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
    hebrew:   'אבגדהוזחטיכלמנסעפצקרשת'.split(''),
    katakana: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'.split(''),
    arabic:   'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split(''),
    symbols:  '╔╗╚╝║═╬▓▒░█▄▀■□▪▫◆◇○●◉★✦'.split(''),
    binary:   ['0', '1'],
};
const CHAR_SET_KEYS = Object.keys(CHARACTER_SETS); // for number-key shortcuts

const altArray = '0123456789'.split('');

// ── Grid state ────────────────────────────────────────────────────────────────
const lastCharUpdate = new Map();
let cols, rows;

function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();

function updateGridDimensions() {
    const cellSize = parseInt(sliders.resolution.value, 10);
    cols = Math.floor(canvas.width  / cellSize);
    rows = Math.floor(canvas.height / cellSize);
    lastCharUpdate.clear();
}
updateGridDimensions();

window.addEventListener('resize', () => { resizeCanvas(); updateGridDimensions(); });
sliders.resolution.addEventListener('input', updateGridDimensions);
charSetSelect.addEventListener('change', () => lastCharUpdate.clear());

// ── Offscreen canvas ──────────────────────────────────────────────────────────
const offCanvas = document.createElement('canvas');
const offCtx    = offCanvas.getContext('2d');

function syncOffCanvas() {
    if (offCanvas.width !== cols || offCanvas.height !== rows) {
        offCanvas.width  = cols;
        offCanvas.height = rows;
    }
}

// ── Video element ─────────────────────────────────────────────────────────────
const video = document.createElement('video');
video.autoplay    = true;
video.playsInline = true;
let previousFrameData = null;

toggleButton.addEventListener('click', () => {
    if (isUsingWebcam) videoFileInput.click();
    else setupWebcam();
});

videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
    const url = URL.createObjectURL(file);
    video.src  = url;
    video.loop = true;
    video.onloadeddata = () => {
        video.play()
            .then(() => {
                isUsingWebcam = false;
                toggleButton.textContent = 'Switch to Webcam';
                if (!isAnimating) animate();
            })
            .catch(err => console.error('Error playing video:', err));
    };
});

function setupWebcam() {
    const oldSrc = video.src;
    if (oldSrc) { video.src = ''; URL.revokeObjectURL(oldSrc); }
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            isUsingWebcam   = true;
            toggleButton.textContent = 'Switch to Video';
            if (!isAnimating) animate();
        })
        .catch(err => console.error('Webcam access error:', err));
}
setupWebcam();

// ── Recording ─────────────────────────────────────────────────────────────────
function toggleRecording() {
    if (isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        recordButton.textContent = 'Start Recording';
        recordButton.classList.remove('recording');
    } else {
        recordedChunks = [];
        const stream = canvas.captureStream(30);
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'lettercam-recording.webm'; a.click();
            URL.revokeObjectURL(url);
        };
        mediaRecorder.start();
        isRecording = true;
        recordButton.textContent = 'Stop Recording';
        recordButton.classList.add('recording');
    }
}
recordButton.addEventListener('click', toggleRecording);

// ── Snapshot ──────────────────────────────────────────────────────────────────
function takeSnapshot() {
    const a = document.createElement('a');
    a.download = `lettercam-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    snapshotButton.textContent = '✓ Saved!';
    setTimeout(() => { snapshotButton.textContent = 'Snapshot'; }, 1200);
}
snapshotButton.addEventListener('click', takeSnapshot);

// ── Feature 10: Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    // Don't fire when typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch (e.key) {
        case 's': case 'S': takeSnapshot(); break;
        case 'r': case 'R': toggleRecording(); break;
        case 'm': case 'M': mirrorBtn.click(); break;
        case 'i': case 'I': invertBtn.click(); break;
        case '?':           toggleHelp(); break;
        case '1': case '2': case '3':
        case '4': case '5': case '6': {
            const idx = parseInt(e.key, 10) - 1;
            if (idx < CHAR_SET_KEYS.length) {
                charSetSelect.value = CHAR_SET_KEYS[idx];
                lastCharUpdate.clear();
            }
            break;
        }
    }
});

// ── Motion detection ──────────────────────────────────────────────────────────
function detectMotion(curr, prev) {
    const sensitivity = parseInt(sliders.motionSensitivity.value, 10);
    const motionMap = Array.from({ length: rows }, () => Array(cols).fill(false));
    if (!prev) return motionMap;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = (row * cols + col) * 4;
            const diff =
                Math.abs(curr[i]   - prev[i])   +
                Math.abs(curr[i+1] - prev[i+1]) +
                Math.abs(curr[i+2] - prev[i+2]);
            if (diff > sensitivity) motionMap[row][col] = true;
        }
    }
    return motionMap;
}

// ── HSL color processing ──────────────────────────────────────────────────────
function applyHueSat(r, g, b, hueShift, satMult) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l   = (max + min) / 2;
    if (max === min) { const v = Math.round(l * 255); return [v, v, v]; }

    const d = max - min;
    const s = Math.min(1, (l > 0.5 ? d / (2 - max - min) : d / (max + min)) * satMult);
    let h;
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
    h = (h + hueShift / 360) % 1;
    if (h < 0) h += 1;

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    function hue2rgb(t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }
    return [
        Math.round(hue2rgb(h + 1/3) * 255),
        Math.round(hue2rgb(h)       * 255),
        Math.round(hue2rgb(h - 1/3) * 255),
    ];
}

// ── Feature 7: Color themes ───────────────────────────────────────────────────
// Takes original pixel RGB + luminance, returns themed [r, g, b]
function applyTheme(r, g, b, lum, theme) {
    switch (theme) {
        case 'mono':   return [lum, lum, lum];
        case 'matrix': return [0, Math.round(60 + lum * 0.76), 0];
        case 'sepia': {
            const sr = Math.min(255, Math.round(lum * 1.08 + 20));
            const sg = Math.min(255, Math.round(lum * 0.93 + 10));
            const sb = Math.min(255, Math.round(lum * 0.72));
            return [sr, sg, sb];
        }
        case 'fire': {
            const t = lum / 255;
            return [
                Math.min(255, Math.round(t * 2 * 255)),
                Math.min(255, Math.round(Math.max(0, t * 2 - 1) * 255)),
                0,
            ];
        }
        case 'neon': {
            return [
                Math.round(lum * 0.1),
                Math.round(lum * 0.4),
                Math.min(255, Math.round(lum * 1.2 + 40)),
            ];
        }
        default: return [r, g, b]; // 'video' — original colors
    }
}

// ── Feature 8: FPS throttle ───────────────────────────────────────────────────
let lastFrameTime = 0;

// ── Animation loop ────────────────────────────────────────────────────────────
let isAnimating = false;

function animate(timestamp = 0) {
    isAnimating = true;

    // Feature 8: drop frames to match FPS limit
    const targetFps      = parseInt(sliders.fps.value, 10);
    const frameInterval  = 1000 / targetFps;
    if (timestamp - lastFrameTime < frameInterval) {
        requestAnimationFrame(animate);
        return;
    }
    lastFrameTime = timestamp;

    const currentTime = Date.now();

    // Read all slider values once per frame
    const colorSpeed   = parseInt(sliders.colorSpeed.value, 10);
    const hueShift     = parseInt(sliders.hue.value, 10);
    const satMult      = parseInt(sliders.saturation.value, 10) / 100;
    const scatterRate  = parseInt(sliders.scatterFrequency.value, 10) / 500;
    const animDir      = parseFloat(sliders.animationDirection.value);
    const decay        = parseFloat(sliders.trailDecay.value);
    const gridOpacity  = parseFloat(sliders.gridOpacity.value);
    const cellSize     = parseInt(sliders.resolution.value, 10);
    const letterSize   = parseInt(sliders.letterSize.value, 10);
    const fontWeight   = sliders.fontWeight.value;
    const fontFamily   = `"${fontSelect.value}", sans-serif`;
    const primarySet   = CHARACTER_SETS[charSetSelect.value] || CHARACTER_SETS.english;
    const theme        = colorThemeSel.value;

    const motionThreshold = Math.max(50,  Math.round(15000 / colorSpeed));
    const stillThreshold  = Math.max(100, Math.round(30000 / colorSpeed));

    // Feature 3: trail decay
    ctx.globalAlpha = 1;
    if (decay >= 1.0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = `rgba(0,0,0,${decay})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.globalAlpha  = gridOpacity;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    syncOffCanvas();

    // Feature 6a: mirror — flip the offscreen context before drawing video
    offCtx.save();
    if (isMirrored) {
        offCtx.translate(cols, 0);
        offCtx.scale(-1, 1);
    }
    offCtx.drawImage(video, 0, 0, cols, rows);
    offCtx.restore();

    const currentFrameData = offCtx.getImageData(0, 0, cols, rows).data;
    const motionMap = detectMotion(currentFrameData, previousFrameData);
    previousFrameData = currentFrameData;

    const wavePeriod = 3000;
    const wavePhase  = (currentTime % wavePeriod) / wavePeriod;

    let lastFont = '';
    let lastFill = '';

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = (row * cols + col) * 4;
            let r = currentFrameData[i];
            let g = currentFrameData[i + 1];
            let b = currentFrameData[i + 2];

            // Hue + saturation
            if (hueShift !== 0 || satMult !== 1) {
                [r, g, b] = applyHueSat(r, g, b, hueShift, satMult);
            }

            // Luminance (used by brightness sizing and themes)
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            // Feature 7: color theme
            [r, g, b] = applyTheme(r, g, b, lum, theme);

            // Feature 6b: invert — dark pixels big, bright pixels small (or vice-versa)
            const sizeLum = isInverted ? 255 - lum : lum;

            // Animation wave
            const colPhase   = col / cols;
            const waveOffset = animDir !== 0
                ? Math.sin((colPhase - wavePhase) * Math.PI * 2) * 300 * animDir
                : 0;
            const effectiveTime = currentTime + waveOffset;

            // Character state
            const cellKey = `${row}-${col}`;
            if (!lastCharUpdate.has(cellKey)) {
                lastCharUpdate.set(cellKey, {
                    time: currentTime,
                    char: primarySet[Math.floor(Math.random() * primarySet.length)],
                });
            }
            const cellData = lastCharUpdate.get(cellKey);

            if (motionMap[row][col] && effectiveTime - cellData.time > motionThreshold) {
                cellData.char = altArray[Math.floor(Math.random() * altArray.length)];
                cellData.time = currentTime;
            } else if (!motionMap[row][col] && effectiveTime - cellData.time > stillThreshold) {
                cellData.char = primarySet[Math.floor(Math.random() * primarySet.length)];
                cellData.time = currentTime;
            }

            // Feature 4: brightness-driven font size (respects invert mode)
            const scaledSize = Math.max(4, Math.round(letterSize * (sizeLum / 255)));
            const fontStr    = `${fontWeight} ${scaledSize}px ${fontFamily}`;
            if (fontStr !== lastFont) { ctx.font = fontStr; lastFont = fontStr; }

            const fillStr = `rgb(${r},${g},${b})`;
            if (fillStr !== lastFill) { ctx.fillStyle = fillStr; lastFill = fillStr; }

            // Scatter noise
            const displayChar = Math.random() < scatterRate
                ? altArray[Math.floor(Math.random() * altArray.length)]
                : cellData.char;

            ctx.fillText(displayChar, col * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
        }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(animate);
}
