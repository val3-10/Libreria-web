/**
 * API REST para Libreria-web (Booknest).
 * Conexión a SQL Server y rutas base.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', require('./routes/auth'));

// Health check (incluye verificación de BD)
app.get('/api/health', async (_req, res) => {
  const dbOk = await db.healthCheck();
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    message: dbOk ? 'API y base de datos operativos' : 'Error de conexión a la base de datos',
    database: dbOk ? 'connected' : 'disconnected',
  });
});

// Ejemplo: prueba de conexión y consulta simple
app.get('/api/ping-db', async (_req, res) => {
  try {
    const result = await db.query('SELECT @@VERSION AS version');
    res.json({ success: true, version: result.recordset?.[0]?.version || 'OK' });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      hint: 'Revisa DB_SERVER, DB_USER, DB_PASSWORD, DB_DATABASE y que SQL Server esté en ejecución.',
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

async function start() {
  try {
    await db.getPool();
    console.log('Conexión a SQL Server establecida.');
  } catch (err) {
    console.error('No se pudo conectar a SQL Server:', err.message);
    console.error('Verifica .env (DB_SERVER, DB_USER, DB_PASSWORD, DB_DATABASE).');
  }

  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
    console.log('  GET /api/health   - Estado API y BD');
    console.log('  GET /api/ping-db  - Prueba de consulta SQL');
  });
}

process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

start().catch((err) => {
  console.error('Error al iniciar:', err);
  process.exit(1);
});
