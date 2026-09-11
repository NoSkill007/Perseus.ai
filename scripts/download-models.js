const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const MODELS = [
  {
    name: 'Whisper Tiny Q8_0 (Audio ASR)',
    filename: 'whisper-tiny-q8_0.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    expectedSize: 43537433,
  },
  {
    name: 'VisionPsy-Nano 460M Q4_K_M imatrix (Visión Multimodal Calibrada)',
    filename: 'visionpsy-nano-460m-q4_k_m-imat.gguf',
    url: 'https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs/resolve/main/visionpsy-nano-460m-q4_k_m-imat.gguf',
    expectedSize: 303143488,
  },
  {
    name: 'VisionPsy-Nano 460M Flash mmproj Q8 (Proyector Visual)',
    filename: 'mmproj-visionpsy-nano-460m-flash-q8.gguf',
    url: 'https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs/resolve/main/mmproj-visionpsy-nano-460m-flash-q8.gguf',
    expectedSize: 108782144,
  },
];

const TARGET_DIRS = [
  path.resolve(__dirname, '..', 'assets', 'models'),
  path.resolve(__dirname, '..', 'models'),
];

function downloadFileWithRedirects(url, destPath, expectedSize, label) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (Math.abs(stats.size - expectedSize) < 1000000 || stats.size > 10000000) {
        console.log(`  ✅ ${label}: Ya existe (${(stats.size / (1024 * 1024)).toFixed(1)} MB). Omitiendo.`);
        return resolve(destPath);
      }
    }

    console.log(`  ⬇️ Descargando ${label}...`);
    const file = fs.createWriteStream(destPath);

    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 8) {
        return reject(new Error('Demasiadas redirecciones HTTP'));
      }

      https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP error ${res.statusCode} al descargar ${currentUrl}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || expectedSize, 10);
        let downloadedBytes = 0;
        let lastReport = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReport > 1000 || downloadedBytes === totalBytes) {
            lastReport = now;
            const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
            const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
            process.stdout.write(`\r     ⏳ Progreso: ${pct}% (${mb}/${totalMb} MB)`);
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            process.stdout.write('\n');
            console.log(`  ✅ Descarga completa: ${path.basename(destPath)}`);
            resolve(destPath);
          });
        });
      }).on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    }

    get(url);
  });
}

async function main() {
  console.log('\n======================================================');
  console.log('🤖 Perseus.ai — Descarga de Modelos de IA On-Device');
  console.log('======================================================\n');

  for (const dir of TARGET_DIRS) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const primaryDir = TARGET_DIRS[0];

  for (const model of MODELS) {
    const dest = path.join(primaryDir, model.filename);
    try {
      await downloadFileWithRedirects(model.url, dest, model.expectedSize, model.name);

      const secondaryDest = path.join(TARGET_DIRS[1], model.filename);
      if (!fs.existsSync(secondaryDest) && fs.existsSync(dest)) {
        try {
          fs.copyFileSync(dest, secondaryDest);
        } catch {}
      }
    } catch (err) {
      console.error(`  ❌ Error descargando ${model.name}:`, err.message);
    }
  }

  console.log('\n📱 Verificando conexión con dispositivo Android físico vía ADB...');
  try {
    const devicesOutput = execSync('adb devices', { encoding: 'utf8' });
    const lines = devicesOutput.trim().split('\n').slice(1);
    const connectedDevices = lines.filter((l) => l.includes('\tdevice')).map((l) => l.split('\t')[0]);

    if (connectedDevices.length > 0) {
      const deviceId = connectedDevices[0];
      console.log(`  ⚡ Dispositivo detectado: ${deviceId}`);
      console.log('  📲 Inyectando modelos al almacenamiento interno de la app...');

      const remoteTmp = '/data/local/tmp';
      const appInternalModels = '/data/user/0/ai.perseus.app/files/models';

      for (const model of MODELS) {
        const localFile = path.join(primaryDir, model.filename);
        if (fs.existsSync(localFile)) {
          console.log(`     -> Pushing ${model.filename}...`);
          execSync(`adb -s ${deviceId} push "${localFile}" ${remoteTmp}/${model.filename}`, { stdio: 'ignore' });
        }
      }

      const symlinksCmd = [
        `run-as ai.perseus.app ln -sf ${appInternalModels}/visionpsy-nano-460m-flash-iq3_xxs-imat.gguf ${appInternalModels}/visionpsy-nano-460m-q4_0.gguf 2>/dev/null`,
        `run-as ai.perseus.app ln -sf ${appInternalModels}/visionpsy-nano-460m-flash-iq3_xxs-imat.gguf ${appInternalModels}/visionpsy-nano-460m-q8_0.gguf 2>/dev/null`,
        `run-as ai.perseus.app ln -sf ${appInternalModels}/mmproj-visionpsy-nano-460m-flash-q8.gguf ${appInternalModels}/mmproj-visionpsy-nano-460m-q8.gguf 2>/dev/null`,
        `run-as ai.perseus.app ln -sf ${appInternalModels}/mmproj-visionpsy-nano-460m-flash-q8.gguf ${appInternalModels}/mmproj-visionpsy-nano-460m-q8_0.gguf 2>/dev/null`,
      ].join('; ');

      execSync(`adb -s ${deviceId} shell "chmod 777 ${remoteTmp}/*; run-as ai.perseus.app mkdir -p files/models; run-as ai.perseus.app cp ${remoteTmp}/* files/models/ 2>/dev/null; ${symlinksCmd}"`, { stdio: 'ignore' });
      console.log('  ✅ Modelos Flash inyectados exitosamente en el dispositivo Android.');
    } else {
      console.log('  ℹ️ No se detectó dispositivo Android por USB. Los modelos quedan listos en assets/models para el empaquetado del APK.');
    }
  } catch (adbErr) {
    console.log('  ℹ️ ADB no disponible o dispositivo desconectado. Los modelos se conservan en assets/models.');
  }

  console.log('\n🎉 Proceso finalizado. Modelos listos para inferencia 100% on-device.\n');
}

main().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});
