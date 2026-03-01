const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Input controls
const toggleButton = document.getElementById('toggleInput');
const videoFileInput = document.getElementById('videoFile');
let isUsingWebcam = true;

// Recording controls
const recordButton = document.createElement('button');
recordButton.textContent = 'Start Recording';
recordButton.style.marginLeft = '10px';
document.querySelector('.input-container').appendChild(recordButton);

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// Slider controls
const sliders = {
    resolution: document.getElementById('resolution-slider'),
    letterSize: document.getElementById('letter-size-slider'),
    motionSensitivity: document.getElementById('motion-sensitivity-slider'),
    colorSpeed: document.getElementById('color-speed-slider'),
    hue: document.getElementById('hue-slider'),
    saturation: document.getElementById('saturation-slider'),
    scatterFrequency: document.getElementById('scatter-frequency-slider'),
    animationDirection: document.getElementById('animation-direction-slider'),
    gridOpacity: document.getElementById('grid-opacity-slider'),
    fontWeight: document.getElementById('font-weight-slider'),
};

// Characters — altArray is shown on motion
const englishArray = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
const altArray = "1234567890".split('');

// ── Canvas resize ──────────────────────────────────────────────────────────────
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();

// ── Grid dimensions ───────────────────────────────────────────────────────────
// Declared early so updateGridDimensions can reference lastCharUpdate
const lastCharUpdate = new Map();
let cols, rows;

function updateGridDimensions() {
    const cellSize = parseInt(sliders.resolution.value, 10);
    cols = Math.floor(canvas.width / cellSize);
    rows = Math.floor(canvas.height / cellSize);
    lastCharUpdate.clear(); // clear stale cell keys when the grid changes
}
updateGridDimensions();

// FIX: resize also updates grid dimensions so cols/rows stay in sync
window.addEventListener('resize', () => {
    resizeCanvas();
    updateGridDimensions();
});

sliders.resolution.addEventListener('input', updateGridDimensions);

// ── Offscreen canvas — created once, resized only when needed ─────────────────
// FIX: was previously created inside animate(), generating a new element ~60×/sec
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d');

function syncOffCanvas() {
    if (offCanvas.width !== cols || offCanvas.height !== rows) {
        offCanvas.width = cols;
        offCanvas.height = rows;
    }
}

// ── Video element ─────────────────────────────────────────────────────────────
const video = document.createElement('video');
video.autoplay = true;
video.playsInline = true;

let previousFrameData = null;

// ── Toggle video source ───────────────────────────────────────────────────────
toggleButton.addEventListener('click', () => {
    if (isUsingWebcam) {
        videoFileInput.click();
    } else {
        setupWebcam();
    }
});

videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }

    const url = URL.createObjectURL(file);
    video.src = url;
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

// ── Webcam setup ──────────────────────────────────────────────────────────────
function setupWebcam() {
    // FIX: save the URL before clearing video.src, otherwise revokeObjectURL
    // receives an empty string and the original blob URL is never freed
    const oldSrc = video.src;
    if (oldSrc) {
        video.src = '';
        URL.revokeObjectURL(oldSrc);
    }

    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            video.srcObject = stream;
            isUsingWebcam = true;
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
    } else {
        recordedChunks = [];
        const stream = canvas.captureStream(30);
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'lettercam-recording.webm';
            a.click();
            URL.revokeObjectURL(url);
        };

        mediaRecorder.start();
        isRecording = true;
        recordButton.textContent = 'Stop Recording';
    }
});

// ── Motion detection ──────────────────────────────────────────────────────────
function detectMotion(currentFrameData, previousFrameData) {
    const sensitivity = parseInt(sliders.motionSensitivity.value, 10);
    const motionMap = Array.from({ length: rows }, () => Array(cols).fill(false));

    if (!previousFrameData) return motionMap;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = (row * cols + col) * 4;
            const diff =
                Math.abs(currentFrameData[i]     - previousFrameData[i])     +
                Math.abs(currentFrameData[i + 1] - previousFrameData[i + 1]) +
                Math.abs(currentFrameData[i + 2] - previousFrameData[i + 2]);
            if (diff > sensitivity) motionMap[row][col] = true;
        }
    }
    return motionMap;
}

// ── Animation loop ────────────────────────────────────────────────────────────
let isAnimating = false;

function animate() {
    isAnimating = true;
    const currentTime = Date.now();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = parseFloat(sliders.gridOpacity.value);

    const cellSize = parseInt(sliders.resolution.value, 10);
    const letterSize = parseInt(sliders.letterSize.value, 10);

    // FIX: resize offscreen canvas only when dimensions change
    syncOffCanvas();
    offCtx.drawImage(video, 0, 0, cols, rows);
    const currentFrameData = offCtx.getImageData(0, 0, cols, rows).data;

    const motionMap = detectMotion(currentFrameData, previousFrameData);
    previousFrameData = currentFrameData;

    // FIX: set font/alignment once outside the nested loops, not per character
    ctx.font = `${sliders.fontWeight.value} ${letterSize}px "Heebo"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = (row * cols + col) * 4;
            const r = currentFrameData[i];
            const g = currentFrameData[i + 1];
            const b = currentFrameData[i + 2];

            const cellKey = `${row}-${col}`;
            if (!lastCharUpdate.has(cellKey)) {
                lastCharUpdate.set(cellKey, {
                    time: currentTime,
                    char: englishArray[Math.floor(Math.random() * englishArray.length)],
                });
            }

            const cellData = lastCharUpdate.get(cellKey);

            if (motionMap[row][col] && currentTime - cellData.time > 500) {
                cellData.char = altArray[Math.floor(Math.random() * altArray.length)];
                cellData.time = currentTime;
            } else if (!motionMap[row][col] && currentTime - cellData.time > 1000) {
                cellData.char = englishArray[Math.floor(Math.random() * englishArray.length)];
                cellData.time = currentTime;
            }

            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillText(cellData.char, col * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
        }
    }

    requestAnimationFrame(animate);
}
