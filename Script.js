const startBtn = document.getElementById("startBtn");
const statusDiv = document.getElementById("status");

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let sourceNode;
let availableVoices = [];

speechSynthesis.onvoiceschanged = () => {
  availableVoices = speechSynthesis.getVoices();
};
speechSynthesis.getVoices();

const recognizer = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognizer.lang = "es-ES";
recognizer.continuous = false;
recognizer.interimResults = false;

startBtn.addEventListener("mousedown", startRecording);
startBtn.addEventListener("mouseup", stopRecording);
startBtn.addEventListener("touchstart", startRecording);
startBtn.addEventListener("touchend", stopRecording);

async function startRecording() {
  try {
    recognizer.abort(); // Previene errores si ya estaba corriendo
  } catch (e) {}

  audioChunks = [];

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.start();

  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode.connect(analyser);

  mediaRecorder.addEventListener("dataavailable", e => {
    audioChunks.push(e.data);
  });

  statusDiv.textContent = "🎙️ Grabando...";

  recognizer.start();
}

function stopRecording() {
  if (!mediaRecorder) return;
  mediaRecorder.stop();
  recognizer.stop();

  mediaRecorder.addEventListener("stop", async () => {
    const audioBlob = new Blob(audioChunks);
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const pitch = detectPitch(audioBuffer);
    const averagePitch = pitch.reduce((a, b) => a + b, 0) / pitch.length || 0;

    let gender = "unknown";
    if (averagePitch > 180) gender = "female";
    else if (averagePitch < 150) gender = "male";
    else gender = "ambiguous";

    recognizer.onresult = (event) => {
      const text = event.results[0][0].transcript;

      const genderText = {
        female: "Femenino (voz aguda)",
        male: "Masculino (voz grave)",
        ambiguous: "Ambiguo (rango intermedio)",
        unknown: "No se pudo determinar"
      }[gender];

      statusDiv.textContent = `📣 Texto: "${text}"
🎼 Pitch promedio: ${averagePitch.toFixed(1)} Hz
🧠 Género detectado: ${genderText}
🔊 Reproduciendo...`;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "es-ES";

      if (gender === "female") {
        utterance.voice = availableVoices.find(v =>
          v.name.toLowerCase().includes("female") ||
          v.name.includes("Mónica") ||
          v.name.includes("Paulina") ||
          v.lang.toLowerCase().includes("es")
        );
  } else if (gender === "male") {
  utterance.voice = availableVoices.find(v =>
    v.name === "Google español de España" || v.name === "Google español"
  );
}


      speechSynthesis.speak(utterance);
    };

    recognizer.onerror = () => {
      statusDiv.textContent = "❌ No se pudo reconocer lo que dijiste.";
    };
  });
}

function detectPitch(audioBuffer) {
  const inputData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = 1024;
  const pitches = [];

  for (let i = 0; i < inputData.length; i += frameSize) {
    const segment = inputData.slice(i, i + frameSize);
    const pitch = autoCorrelate(segment, sampleRate);
    if (pitch > 50 && pitch < 500) pitches.push(pitch);
  }

  return pitches;
}

function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;
  const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < 0.2) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < 0.2) { r2 = SIZE - i; break; }
  }

  const trimmed = buffer.slice(r1, r2);
  const c = new Array(trimmed.length).fill(0);
  for (let i = 0; i < trimmed.length; i++) {
    for (let j = 0; j < trimmed.length - i; j++) {
      c[i] = c[i] + trimmed[j] * trimmed[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < trimmed.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  return sampleRate / maxpos;
}
