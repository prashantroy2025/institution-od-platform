const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(process.env.LEARNING_UPLOAD_DIR || path.join(__dirname, '..', 'private-learning-files'));
const SAFE_TYPES = new Map([
    ['pdf', ['application/pdf']], ['doc', ['application/msword']], ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
    ['ppt', ['application/vnd.ms-powerpoint']], ['pptx', ['application/vnd.openxmlformats-officedocument.presentationml.presentation']],
    ['xls', ['application/vnd.ms-excel']], ['xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']], ['mp4', ['video/mp4']],
    ['txt', ['text/plain']], ['png', ['image/png']], ['jpg', ['image/jpeg']], ['jpeg', ['image/jpeg']]
]);
const normalizeTypes = (value) => String(value || 'pdf,doc,docx,ppt,pptx,xls,xlsx,txt,png,jpg,jpeg').split(',').map((item) => item.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
const validateUpload = (file, allowedTypes, maxSize) => { if (!file || !Buffer.isBuffer(file.buffer)) { const error = new Error('A file is required'); error.status = 400; throw error; } if (file.size > maxSize) { const error = new Error(`File exceeds the ${maxSize} byte limit`); error.status = 400; throw error; } const extension = path.extname(file.originalname || '').toLowerCase().slice(1); const types = normalizeTypes(allowedTypes); if (!SAFE_TYPES.has(extension) || !types.includes(extension) || !SAFE_TYPES.get(extension).includes(file.mimetype)) { const error = new Error('File type is not allowed'); error.status = 400; throw error; } return extension; };
async function save(file) { await fs.mkdir(ROOT, { recursive: true }); const storageKey = `${crypto.randomUUID()}-${crypto.randomBytes(12).toString('hex')}`; const fullPath = path.join(ROOT, storageKey); await fs.writeFile(fullPath, file.buffer, { flag: 'wx', mode: 0o600 }); return storageKey; }
async function read(storageKey) { if (typeof storageKey !== 'string' || !/^[a-f0-9-]+$/i.test(storageKey) || storageKey.includes('..') || path.basename(storageKey) !== storageKey) { const error = new Error('Invalid storage key'); error.status = 400; throw error; } return fs.readFile(path.join(ROOT, storageKey)); }
async function remove(storageKey) { if (!storageKey) return; try { await fs.unlink(path.join(ROOT, path.basename(storageKey))); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
module.exports = { ROOT, SAFE_TYPES, normalizeTypes, validateUpload, save, read, remove };