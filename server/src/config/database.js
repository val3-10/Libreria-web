/**
 * Conexión a SQL Server para Libreria-web (Booknest).
 * Usa el paquete mssql con pool de conexiones.
 */

const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'Booknest',
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true,
    instanceName: process.env.DB_INSTANCE || undefined,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 15000,
  requestTimeout: 15000,
};

let pool = null;

/**
 * Obtiene el pool de conexiones. Si no existe, lo crea.
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

/**
 * Ejecuta una consulta SQL y devuelve los registros.
 * Para consultas con parámetros, usa getPool().request().input().query().
 * @param {string} queryText - Consulta SQL (ej: 'SELECT 1 AS ok').
 * @returns {Promise<{ recordset: Array, rowsAffected: number }>}
 */
async function query(queryText) {
  const request = (await getPool()).request();
  const result = await request.query(queryText);
  return { recordset: result.recordset || [], rowsAffected: result.rowsAffected?.[0] ?? 0 };
}

/**
 * Ejecuta un procedimiento almacenado.
 * @param {string} name - Nombre del procedimiento.
 * @param {Object} [params] - Parámetros { nombre: { val, type } }.
 * @returns {Promise<{ recordset: Array, recordsets: Array }>}
 */
async function execute(procedureName, params = {}) {
  const conn = (await getPool()).request();
  Object.entries(params).forEach(([key, { val, type }]) => {
    conn.input(key, type || sql.VarChar, val);
  });
  return conn.execute(procedureName);
}

/**
 * Cierra el pool de conexiones (útil al cerrar la aplicación).
 */
async function close() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

/**
 * Verifica que la conexión a SQL Server responda.
 */
async function healthCheck() {
  try {
    const result = await query('SELECT 1 AS ok');
    return result.recordset?.[0]?.ok === 1;
  } catch (err) {
    return false;
  }
}

module.exports = {
  sql,
  getPool,
  query,
  execute,
  close,
  healthCheck,
  config,
};
