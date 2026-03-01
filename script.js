const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// ── DOM controls ───────────────────────────────────────────────────────────────
const toggleButton  = document.getElementById('toggleInput');
const videoFileInput = document.getElementById('videoFile');
const charSetSelect = document.getElementById('char-set-select');
const fontSelect    = document.getElementById('font-select');
let isUsingWebcam = true;

// ── Recording button (injected) ───────────────────────────────────────────────
const recordButton = document.createElement('button');
recordButton.textContent = 'Start Recording';
document.querySelector('.input-container').appendChild(recordButton);

// ── Snapshot button — Feature 5 ───────────────────────────────────────────────
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

// Alt set shown on motion (digits)
const altArray = '0123456789'.split('');

// ── Grid state ─────────────────────────────────────────────────────────────────
// Declared before updateGridDimensions so the clear() call is valid
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
    lastCharUpdate.clear(); // stale cell keys become invalid when the grid changes
}
updateGridDimensions();

window.addEventListener('resize', () => {
    resizeCanvas();
    updateGridDimensions(); // keep cols/rows in sync with canvas size
});
sliders.resolution.addEventListener('input', updateGridDimensions);

// Clear cell cache when character set switches so new chars populate immediately
charSetSelect.addEventListener('change', () => lastCharUpdate.clear());

// ── Offscreen canvas — created once, resized only when grid changes ────────────
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
video.autoplay   = true;
video.playsInline = true;
let previousFrameData = null;

// ── Video source toggle ───────────────────────────────────────────────────────
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
    const oldSrc = video.src; // save before clearing — revokeObjectURL needs the original URL
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
recordButton.addEventListener('click', () => {
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
});

// ── Feature 5: Snapshot ───────────────────────────────────────────────────────
snapshotButton.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `lettercam-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    snapshotButton.textContent = '✓ Saved!';
    setTimeout(() => { snapshotButton.textContent = 'Snapshot'; }, 1200);
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

// ── Feature 1a/1b: HSL color processing (hue shift + saturation) ──────────────
function applyHueSat(r, g, b, hueShift, satMult) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l   = (max + min) / 2;

    if (max === min) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }

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
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
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

// ── Animation loop ────────────────────────────────────────────────────────────
let isAnimating = false;

function animate() {
    isAnimating = true;
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

    // Feature 1c: colorSpeed drives how fast characters update
    const motionThreshold = Math.max(50,  Math.round(15000 / colorSpeed)); // ~500ms at speed 30
    const stillThreshold  = Math.max(100, Math.round(30000 / colorSpeed)); // ~1000ms at speed 30

    // Feature 3: trail — semi-transparent fade instead of full clear
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
    offCtx.drawImage(video, 0, 0, cols, rows);
    const currentFrameData = offCtx.getImageData(0, 0, cols, rows).data;

    const motionMap = detectMotion(currentFrameData, previousFrameData);
    previousFrameData = currentFrameData;

    // Feature 1e: wave period for animation direction
    const wavePeriod = 3000; // ms for one full sweep
    const wavePhase  = (currentTime % wavePeriod) / wavePeriod;

    // Cache last ctx state values to skip redundant canvas state changes
    let lastFont = '';
    let lastFill = '';

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = (row * cols + col) * 4;
            let r = currentFrameData[i];
            let g = currentFrameData[i + 1];
            let b = currentFrameData[i + 2];

            // Feature 1a/1b: apply hue shift and saturation to video pixel color
            if (hueShift !== 0 || satMult !== 1) {
                [r, g, b] = applyHueSat(r, g, b, hueShift, satMult);
            }

            // Feature 1e: animationDirection — sine wave ripple across columns
            const colPhase  = col / cols;
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

            // Feature 4: font size scales with pixel brightness
            const lum        = 0.299 * r + 0.587 * g + 0.114 * b;
            const scaledSize = Math.max(4, Math.round(letterSize * (lum / 255)));
            const fontStr    = `${fontWeight} ${scaledSize}px ${fontFamily}`;
            if (fontStr !== lastFont) { ctx.font = fontStr; lastFont = fontStr; }

            const fillStr = `rgb(${r},${g},${b})`;
            if (fillStr !== lastFill) { ctx.fillStyle = fillStr; lastFill = fillStr; }

            // Feature 1d: scatter — random alt characters as visual noise
            const displayChar = Math.random() < scatterRate
                ? altArray[Math.floor(Math.random() * altArray.length)]
                : cellData.char;

            ctx.fillText(displayChar, col * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
        }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(animate);
}
