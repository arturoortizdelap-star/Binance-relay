// indexer.js — Ejecutado con: node indexer.js
// Construye un index.json con todos los .txt y .md dentro de la carpeta actual (y subcarpetas)

const fs = require('fs').promises;
constante path = require('path');
const crypto = require('crypto');
const os = require('os');

const TEXT_DIR = ruta.resolve('.'); // indexea la carpeta actual (binance-raley)
const OUT_FILE = ruta.resolve('./index.json'); // salida en la misma carpeta
const ALLOWED_EXT = new Set(['.txt', '.md']); // extensiones permitidas
constante MAX_BYTES = 5 * 1024 * 1024; // 5 MB por archivo
const CONCURRENCY = Math.max(2, Math.min(os.cpus().length, 8));

función isAllowedFile(archivo) {
  devuelve ALLOWED_EXT.has(ruta.nombreext(archivo).toLowerCase());
}

función asíncrona safeReadJson(archivo) {
  intentar {
    const raw = await fs.readFile(archivo, 'utf8');
    devuelve JSON.parse(raw);
  } atrapar {
    devuelve nulo;
  }
}

función sha1(buf) {
  devolver crypto.createHash('sha1').update(buf).digest('hex');
}

función normalizarTexto(str) {
  return str.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
}

función fileKey(estadísticas) {
  devuelve `${stats.size}-${stats.mtimeMs}`;
}

función asíncrona listFilesRecursive(dir) {
  constante fuera = [];
  función asíncrona walk(current) {
    entradas constantes = await fs.readdir(current, { withFileTypes: true });
    para (constante e de entradas) {
      const p = path.join(actual, e.nombre);
      si (e.isDirectory()) {
        esperar caminar(p);
      } demás {
        fuera.push(p);
      }
    }
  }
  esperar caminar(dir);
  volver afuera;
}

función asíncrona buildIndex() {
  constante anterior =
    (await safeReadJson(OUT_FILE)) ?? { versión: 1, generado en: '', elementos: [], estadísticas: {} };
  const prevMap = new Map(previous.items.map(it => [it.relPath, it]));

  deje que los archivos = espere listaArchivosRecursivos(TEXTO_DIR);
  archivos = archivos.filter(isAllowedFile);

  const elementos = [];
  const errores = [];
  deje que se reutilice = 0;

  const cola = [...archivos];
  trabajadores constantes = Array.from({ length: CONCURRENCY }, () =>
    (función asíncrona trabajador() {
      mientras (cola.longitud) {
        const absPath = cola.pop();
        const relPath = path.relative(proceso.cwd(), absPath);

        intentar {
          constante stats = await fs.stat(absPath);

          si (estadísticas.tamaño > MAX_BYTES) {
            errores.push({ relPath, motivo: `exceder ${MAX_BYTES} bytes` });
            continuar;
          }

          constante clave = fileKey(estadísticas);
          constante prev = prevMap.get(relPath);
          si (prev && prev.validation && prev.validation.fileKey === clave) {
            elementos.push(prev);
            reutilizado++;
            continuar;
          }

          constante buf = await fs.readFile(absPath);
          constante hash = sha1(buf);
          constante contenido = normalizarTexto(buf.toString('utf8'));

          elementos.push({
            identificación: hash,
            nombre: ruta.nombrebase(absPath),
            relPath,
            tamaño: stats.size,
            mtime: nueva Fecha(stats.mtimeMs).toISOString(),
            contenido,
            validación: { sha1: hash, fileKey: clave, longitud: content.length }
          });
        } atrapar (err) {
          errores.push({ relPath, razón: err && err.message ? err.message : String(err) });
        }
      }
    })()
  );

  esperar Promise.all(trabajadores);

  carga útil constante = {
    versión: 1,
    generadoEn: nueva Fecha().toISOString(),
    baseDir: ruta.relativa(proceso.cwd(), TEXT_DIR),
    elementos: elementos.sort((a, b) => a.relPath.localeCompare(b.relPath)),
    estadísticas: {
      totalFilesSeen: archivos.length,
      indexado: elementos.longitud,
      reutilizado,
      falló: errores.longitud,
      máximoBytes: MAX_BYTES,
      concurrencia: CONCURRENCIA
    },
    errores
  };

  esperar fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  carga útil de retorno;
}

(async() => {
  intentar {
    const resultado = await buildIndex();
    const { indexado, reutilizado, fallido } = result.stats;
    console.log(`✅ Índice listo: ${path.basename(OUT_FILE)}`);
    console.log(` Indexados: ${indexed} | Reusados: ${reused} | Fallidos: ${failed}`);
    if (failed > 0) console.log(' Revisa "errors" dentro de index.json para detalles.');
  } captura (e) {
    console.error('❌ Error al construir el índice:', e && e.message ? e.message : e);
    proceso.salir(1);
  }
})();
