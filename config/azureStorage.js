const { BlobServiceClient } = require('@azure/storage-blob');

/**
 * Servicio para gestionar la subida y eliminación de archivos en Azure Blob Storage
 */
class AzureStorageService {
    constructor() {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'imagenes';
        
        if (!connectionString) {
            console.warn('⚠️ AZURE_STORAGE_CONNECTION_STRING no configurado');
            this.blobServiceClient = null;
            this.containerClient = null;
            this.baseUrl = null;
        } else {    
            console.log('✅ Azure Storage configurado');
            this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            this.containerName = containerName;
            this.containerClient = this.blobServiceClient.getContainerClient(containerName);
            
            // Extraer URL base del contenedor (sin SAS token)
            this.baseUrl = `https://imagesperson.blob.core.windows.net/${containerName}`;
        }
    }

    /**
     * Sube un archivo a Azure Blob Storage
     * @param {Buffer} fileBuffer - Contenido del archivo en memoria
     * @param {string} fileName - Nombre original del archivo
     * @param {string} mimeType - Tipo MIME (image/jpeg, image/png, etc.)
     * @returns {Promise<string>} URL pública del archivo (sin SAS token)
     */
    async uploadFile(fileBuffer, fileName, mimeType) {
        try {
            if (!this.containerClient) {
                throw new Error('Azure Storage no está configurado');
            }

            // Sanitizar nombre: remover caracteres especiales y acentos
            const sanitizedFileName = fileName
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Remover acentos
                .replace(/[^a-zA-Z0-9.-]/g, '_'); // Remover caracteres especiales
            
            // Generar nombre único usando timestamp
            const timestamp = Date.now();
            const uniqueFileName = `${timestamp}_${sanitizedFileName}`;

            // Obtener referencia al blob
            const blockBlobClient = this.containerClient.getBlockBlobClient(uniqueFileName);

            // Subir archivo con headers HTTP apropiados
            await blockBlobClient.uploadData(fileBuffer, {
                blobHTTPHeaders: {
                    blobContentType: mimeType
                }
            });

            // Retornar URL base sin SAS token (más corta para BD)
            const cleanUrl = `${this.baseUrl}/${uniqueFileName}`;
            
            return cleanUrl;
        } catch (error) {
            console.error('❌ Error subiendo archivo a Azure:', error);
            throw new Error(`Error al subir la imagen: ${error.message}`);
        }
    }

    /**
     * Elimina un archivo de Azure Blob Storage
     * @param {string} fileUrl - URL del archivo a eliminar (con o sin SAS token)
     * @returns {Promise<boolean>} true si se eliminó exitosamente
     */
    async deleteFile(fileUrl) {
        try {
            if (!this.containerClient || !fileUrl) {
                return false;
            }

            // Extraer nombre del archivo de la URL (antes del query string)
            const fileName = fileUrl.split('/').pop().split('?')[0];
            
            const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
            
            // Eliminar solo si existe (no falla si no existe)
            await blockBlobClient.deleteIfExists();
            
            return true;
        } catch (error) {
            console.error('❌ Error eliminando archivo de Azure:', error);
            return false;
        }
    }

    /**
     * Genera URL completa con SAS token para acceso público
     * @param {string} cleanUrl - URL limpia sin SAS token
     * @returns {string} URL con SAS token para acceso público
     */
    getPublicUrl(cleanUrl) {
        if (!cleanUrl) return null;
        
        // Si ya tiene SAS token, retornarla tal cual
        if (cleanUrl.includes('?')) return cleanUrl;
        
        // Agregar SAS token de las variables de entorno
        const sasToken = process.env.AZURE_SAS_TOKEN || 
            'sp=racwdli&st=2025-12-11T00:17:17Z&se=2026-07-26T08:32:17Z&sv=2024-11-04&sr=c&sig=8Gi%2Fj0UG7m05Opk%2BY2Wy7MXNNViiRJIixsEigYPhCRs%3D';
        
        return `${cleanUrl}?${sasToken}`;
    }

    /**
     * Verifica si el contenedor existe en Azure
     * @returns {Promise<boolean>}
     */
    async containerExists() {
        try {
            return await this.containerClient.exists();
        } catch (error) {
            console.error('Error verificando contenedor:', error);
            return false;
        }
    }
}

module.exports = new AzureStorageService();