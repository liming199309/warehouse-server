// upload.js - 图片上传（货好照片/快递单照片/发票），以 base64 接收，存到 data/uploads
// Render 唯一可写目录是 /tmp，所以用 UPLOADS_DIR 环境变量切换
const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')
const auth = require('../auth')

const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.env.RENDER ? '/tmp/uploads' : path.join(__dirname, '..', 'data', 'uploads'))

router.post('/', auth.authRequired, (req, res) => {
  const { filename, content } = req.body // content: base64
  if (!content) return res.status(400).json({ success: false, msg: '缺少文件内容' })
  try {
    const ext = (filename || 'img').split('.').pop().replace(/[^a-zA-Z0-9]/g, '').slice(0, 5) || 'png'
    const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(content, 'base64'))
    res.json({ success: true, url: '/uploads/' + name })
  } catch (e) { res.status(500).json({ success: false, msg: e.message }) }
})

module.exports = router

