const { badRequest } = require('./http-error')

/**
 * 校验并规范化手写签名 dataURL（PNG/JPEG，最大 1MB）。
 * 空值返回空字符串；非法格式抛 400。
 */
function validateSignature(dataUrl) {
  if (!dataUrl) return ''
  const value = String(dataUrl)
  if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw badRequest('签名格式不正确')
  }
  if (Buffer.from(value.split(',')[1], 'base64').length > 1024 * 1024) {
    throw badRequest('签名图片过大')
  }
  return value
}

module.exports = { validateSignature }
