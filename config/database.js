const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Servicio singleton para gestionar el pool de conexiones a MySQL
 */
class DbService {
    constructor() {
        const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

        let dbConfig;
        if (databaseUrl) {
            const parsed = new URL(databaseUrl);
            dbConfig = {
                host: parsed.hostname,
                user: decodeURIComponent(parsed.username),
                password: decodeURIComponent(parsed.password),
                database: parsed.pathname.replace(/^\//, '') || process.env.DB_NAME,
                port: Number(parsed.port) || 3306
            };
        } else {
            dbConfig = {
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                port: Number(process.env.DB_PORT) || 3306
            };
        }

        // Configuración del pool de conexiones
        this.pool = mysql.createPool({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database,
            port: dbConfig.port,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
            connectTimeout: 60000,
            idleTimeout: 60000,
            maxIdle: 10,
            supportBigNumbers: true,
            bigNumberStrings: true,
            dateStrings: true,
            multipleStatements: false,
            namedPlaceholders: false  // Usar ? en lugar de :name
        });

        // Event listeners solo en desarrollo
        if (process.env.NODE_ENV === 'development') {
            this.pool.on('connection', () => console.log('🔗 Nueva conexión MySQL'));
            this.pool.on('acquire', () => console.log('📌 Conexión adquirida'));
            this.pool.on('release', () => console.log('📤 Conexión liberada'));
        }

        this.pool.on('error', (err) => {
            console.error('❌ Error en el pool de MySQL:', err);
        });
    }

    /**
     * Obtiene la instancia única del servicio (patrón Singleton)
     */
    static getInstance() {
        if (!this.instance) {
            this.instance = new DbService();
        }
        return this.instance;
    }

    /**
     * Ejecuta una consulta SQL parametrizada
     * @param {string} sql - Consulta SQL con placeholders ?
     * @param {Array} params - Parámetros de la consulta
     * @returns {Promise<Array>} Resultados de la consulta
     */
    async query(sql, params = []) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            
            // Convertir parámetros numéricos a enteros si es necesario
            const processedParams = params.map(param => {
                if (typeof param === 'string' && !isNaN(param) && param.trim() !== '') {
                    return parseInt(param, 10);
                }
                return param;
            });
            
            const [rows] = await connection.execute(sql, processedParams);
            return rows;
        } catch (error) {
            console.error('❌ Error en consulta SQL:', error);
            console.error('SQL:', sql);
            console.error('Params:', params);
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * Ejecuta un procedimiento almacenado
     * @param {string} procedureName - Nombre del procedimiento
     * @param {Array} params - Parámetros del procedimiento
     * @returns {Promise<Array>} Primer resultado del procedimiento
     */
    async callProcedure(procedureName, params = []) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            
            const placeholders = params.map(() => '?').join(', ');
            const sql = `CALL ${procedureName}(${placeholders})`;
            
            const [results] = await connection.execute(sql, params);
            
            // Retornar el primer resultset
            return results[0];
        } catch (error) {
            console.error(`❌ Error en procedimiento ${procedureName}:`, error.sqlMessage || error.message);
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * Verifica la conexión a la base de datos
     * @returns {Promise<boolean>} true si la conexión es exitosa
     */
    async testConnection() {
        try {
            const connection = await this.pool.getConnection();
            await connection.execute('SELECT 1 as test');
            const dbName = process.env.DB_NAME || 'desconocida';
            const host = process.env.DB_HOST || 'desconocido';
            const port = process.env.DB_PORT || 3306;
            console.log('✅ Conexión a MySQL exitosa');
            console.log(`📊 Base de datos: ${dbName}`);
            console.log(`🌐 Host: ${host}:${port}`);
            connection.release();
            return true;
        } catch (error) {
            console.error('❌ Error conectando a MySQL:', error.message);
            return false;
        }
    }

    /**
     * Cierra todas las conexiones del pool
     */
    async closePool() {
        try {
            await this.pool.end();
            console.log('🔒 Pool de conexiones cerrado');
        } catch (error) {
            console.error('❌ Error cerrando pool:', error);
        }
    }
}

module.exports = DbService;