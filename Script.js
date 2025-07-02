const startBtn = document.getElementById('startBtn');
const pitchBar = document.getElementById('pitchBar');
const genderLive = document.getElementById('genderLive');
const statusDiv = document.getElementById('status');

startBtn.onclick = async () => {
  statusDiv.textContent = "Iniciando... habla ahora";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    const sampleRate = audioContext.sampleRate;

    let pitchSum = 0;
    let pitchCount = 0;

    function analyzePitch() {
      analyser.getFloatTimeDomainData(dataArray);
      const pitch = detectPitch(dataArray, sampleRate);
      if (pitch) {
        pitchSum += pitch;
        pitchCount++;

        const percent = Math.min((pitch / 300) * 100, 100);
        pitchBar.style.width = percent + "%";

        genderLive.textContent = pitch > 165 ? "Voz Femenina (aguda)" : "Voz Masculina (grave)";
        genderLive.style.color = pitch > 165 ? "deeppink" : "dodgerblue";
      }
    }

    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event) => {
      const text = event.results[0][0].transcript;
      stream.getTracks().forEach(track => track.stop());
      audioContext.close();
      clearInterval(pitchInterval);

      if (pitchCount === 0) {
        statusDiv.textContent = "No se pudo detectar la frecuencia.";
        return;
      }

      const averagePitch = pitchSum / pitchCount;
      const gender = averagePitch > 2000 ? 'male' : 'female';

      pitchBar.style.width = "0%";
      genderLive.textContent = "Esperando...";
      statusDiv.textContent = `Texto reconocido: "${text}"
Pitch promedio: ${averagePitch.toFixed(2)} Hz
Género detectado: ${gender === 'female' ? 'Femenino' : 'Masculino'}
Reproduciendo voz...`;

      await speakText(text, gender);
    };

    recognition.onerror = (event) => {
      statusDiv.textContent = "Error en el reconocimiento: " + event.error;
      stream.getTracks().forEach(track => track.stop());
      audioContext.close();
      clearInterval(pitchInterval);
    };

    recognition.onend = () => {
      if (pitchCount === 0) {
        statusDiv.textContent = "No se detectó voz o no se entendió.";
        pitchBar.style.width = "0%";
        genderLive.textContent = "Esperando...";
      }
      clearInterval(pitchInterval);
    };

    recognition.start();
    const pitchInterval = setInterval(analyzePitch, 100);

  } catch (e) {
    statusDiv.textContent = "Error al acceder al micrófono: " + e.message;
  }
};

function detectPitch(buffer, sampleRate) {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  let bestOffset = -1;
  let bestCorrelation = 0;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null;

  let lastCorrelation = 1;
  let foundGoodCorrelation = false;

  for (let offset = 0; offset < MAX_SAMPLES; offset++) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - correlation / MAX_SAMPLES;

    if (correlation > 0.9 && correlation > lastCorrelation) {
      foundGoodCorrelation = true;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      return sampleRate / bestOffset;
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01) {
    return sampleRate / bestOffset;
  }
  return null;
}

let voices = [];
function loadVoices() {
  return new Promise(resolve => {
    voices = window.speechSynthesis.getVoices();
    if (voices.length !== 0) {
      resolve(voices);
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        resolve(voices);
      };
    }
  });
}

async function speakText(text, gender) {
  await loadVoices();

  let voice = voices.find(v => {
    if (gender === 'female') {
      return v.name.toLowerCase().includes('female') ||
             v.name.toLowerCase().includes('woman') ||
             v.name.toLowerCase().includes('maria');
    } else {
      return v.name.toLowerCase().includes('male') ||
             v.name.toLowerCase().includes('man') ||
             v.name.toLowerCase().includes('david');
    }
  }) || voices[0];

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = 'es-ES';
  window.speechSynthesis.speak(utterance);
}
