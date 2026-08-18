// util.js - 通用工具
function genOrderNo() {
  return 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase()
}

function now() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

module.exports = { genOrderNo, now }
