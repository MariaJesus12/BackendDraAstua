const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters
} = require('@azure/storage-blob');

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'yes'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no'].includes(normalized)) {
    return false;
  }

  return fallback;
}

class AzureStorageService {
  constructor() {
    this.containerName = String(process.env.AZURE_STORAGE_CONTAINER_NAME || 'documentos').trim();
    this.sasServiceUrl = String(process.env.AZURE_BLOB_SERVICE_SAS_URL || '').trim();
    this.connectionString = String(process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim();
    this.storeUrlWithSas = toBoolean(process.env.AZURE_STORE_URL_WITH_SAS, true);
    this.accountName = String(process.env.AZURE_STORAGE_ACCOUNT_NAME || '').trim();
    this.accountKey = String(process.env.AZURE_STORAGE_ACCOUNT_KEY || '').trim();

    this.blobServiceClient = null;
    this.containerClient = null;
    this.baseUrl = null;
    this.sasQuery = '';
    this.sharedKeyCredential = null;

    this.initialize();
  }

  parseConnectionStringCredential() {
    if (!this.connectionString) {
      return;
    }

    const parts = this.connectionString.split(';').map((item) => item.trim()).filter(Boolean);
    const values = {};
    for (const part of parts) {
      const [key, ...rest] = part.split('=');
      if (!key || !rest.length) {
        continue;
      }
      values[key] = rest.join('=');
    }

    if (values.AccountName && values.AccountKey) {
      this.accountName = values.AccountName;
      this.accountKey = values.AccountKey;
    }
  }

  setupSharedKeyCredential() {
    if (!this.accountName || !this.accountKey) {
      this.sharedKeyCredential = null;
      return;
    }

    this.sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
  }

  initialize() {
    try {
      this.parseConnectionStringCredential();

      if (this.sasServiceUrl) {
        this.blobServiceClient = new BlobServiceClient(this.sasServiceUrl);
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);

        const parsed = new URL(this.sasServiceUrl);
        this.baseUrl = `${parsed.origin}/${this.containerName}`;
        this.sasQuery = parsed.search ? parsed.search.replace(/^\?/, '') : '';
        this.setupSharedKeyCredential();
        console.log('Azure Blob configurado via SAS URL');
        return;
      }

      if (this.connectionString) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        const accountName = this.blobServiceClient.accountName;
        this.baseUrl = `https://${accountName}.blob.core.windows.net/${this.containerName}`;
        this.sasQuery = String(process.env.AZURE_SAS_TOKEN || '').trim().replace(/^\?/, '');
        this.setupSharedKeyCredential();
        console.log('Azure Blob configurado via connection string');
        return;
      }

      console.warn('Azure Blob no configurado (faltan AZURE_BLOB_SERVICE_SAS_URL o AZURE_STORAGE_CONNECTION_STRING)');
    } catch (error) {
      console.error('Error inicializando Azure Blob:', error.message);
      this.blobServiceClient = null;
      this.containerClient = null;
      this.baseUrl = null;
      this.sasQuery = '';
      this.sharedKeyCredential = null;
    }
  }

  isConfigured() {
    return Boolean(this.containerClient && this.baseUrl);
  }

  canGenerateTemporarySas() {
    return Boolean(this.sharedKeyCredential);
  }

  extractBlobName(fileUrl) {
    const raw = String(fileUrl || '').trim();
    if (!raw) {
      return null;
    }

    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_error) {
      return null;
    }

    const containerPrefix = `/${this.containerName}/`;
    if (!parsed.pathname.startsWith(containerPrefix)) {
      return null;
    }

    const blobName = decodeURIComponent(parsed.pathname.slice(containerPrefix.length));
    return blobName || null;
  }

  async generateTemporaryBlobUrl(fileUrl, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Azure Blob no esta configurado');
    }

    if (!this.canGenerateTemporarySas()) {
      throw new Error('No se puede generar SAS temporal sin credenciales de cuenta (AccountKey)');
    }

    const blobName = this.extractBlobName(fileUrl);
    if (!blobName) {
      throw new Error(`La URL no pertenece al contenedor configurado (${this.containerName})`);
    }

    const expiresInMinutesRaw = Number(options.expiresInMinutes);
    const expiresInMinutes = Number.isFinite(expiresInMinutesRaw) && expiresInMinutesRaw > 0
      ? Math.min(Math.trunc(expiresInMinutesRaw), 24 * 60)
      : 15;

    const startsOn = new Date(Date.now() - (5 * 60 * 1000));
    const expiresOn = new Date(Date.now() + (expiresInMinutes * 60 * 1000));
    const permissions = BlobSASPermissions.parse(String(options.permissions || 'r'));

    const sasQuery = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName,
        startsOn,
        expiresOn,
        permissions,
        protocol: 'https'
      },
      this.sharedKeyCredential
    ).toString();

    return {
      url: `${this.baseUrl}/${encodeURIComponent(blobName).replace(/%2F/g, '/')}` + `?${sasQuery}`,
      expiresOn: expiresOn.toISOString(),
      expiresInMinutes
    };
  }

  async ensureContainerExists() {
    if (!this.containerClient) {
      throw new Error('Azure Blob no esta configurado');
    }

    const autoCreate = toBoolean(process.env.AZURE_AUTO_CREATE_CONTAINER, false);
    if (autoCreate) {
      await this.containerClient.createIfNotExists();
      return;
    }

    const exists = await this.containerClient.exists();
    if (!exists) {
      throw new Error(`El contenedor de Azure no existe: ${this.containerName}`);
    }
  }

  buildFileName(fileName) {
    const safeName = String(fileName || 'documento')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const suffix = Math.random().toString(36).slice(2, 10);
    const baseName = safeName || 'documento';
    return `${Date.now()}_${suffix}_${baseName}`;
  }

  getUrl(cleanUrl) {
    if (!cleanUrl) {
      return cleanUrl;
    }

    if (!this.storeUrlWithSas || !this.sasQuery) {
      return cleanUrl;
    }

    return `${cleanUrl}?${this.sasQuery}`;
  }

  async uploadFile(fileBuffer, fileName, mimeType) {
    if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length) {
      throw new Error('fileBuffer invalido');
    }

    if (!this.containerClient || !this.baseUrl) {
      throw new Error('Azure Blob no esta configurado');
    }

    await this.ensureContainerExists();

    const blobName = this.buildFileName(fileName);
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: {
        blobContentType: String(mimeType || 'application/octet-stream').trim()
      }
    });

    const cleanUrl = `${this.baseUrl}/${blobName}`;
    return this.getUrl(cleanUrl);
  }
}

module.exports = new AzureStorageService();
