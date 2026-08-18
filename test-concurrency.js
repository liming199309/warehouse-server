// 并发安全测试：验证同一商品多人同时操作不重复、不超卖、不崩
const BASE = 'http://localhost:3000/api'

async function login() {
  const r = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
  return (await r.json()).token
}
async function getStock(token, id) {
  const r = await fetch(BASE + '/inventory/' + id, { headers: { Authorization: 'Bearer ' + token } })
  return (await r.json()).item.quantity
}
async function outbound(token, id, qty, nonce) {
  const r = await fetch(BASE + '/operations/outbound', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ itemId: id, quantity: qty, operator: '并发测试', nonce })
  })
  return r.json()
}

;(async () => {
  const token = await login()
  const id = 'SP008' // 初始 45 件
  const before = await getStock(token, id)
  console.log('开始前库存:', before)

  // 测试1：同一 nonce 提交 50 次（模拟双击/网络重试）
  let ok1 = 0, dup1 = 0
  const sameNonce = 'SAME-NONCE-TEST'
  const p1 = []
  for (let i = 0; i < 50; i++) p1.push(outbound(token, id, 1, sameNonce))
  const r1 = await Promise.all(p1)
  r1.forEach(r => { if (r.success) ok1++; else if (/重复/.test(r.msg)) dup1++ })
  const after1 = await getStock(token, id)
  console.log(`同nonce 50次: 成功 ${ok1} 次 / 重复拒绝 ${dup1} 次 / 库存 ${before}→${after1}`)

  // 测试2：100 个不同 nonce 并发各扣 1，但库存只剩 44，应只成功 44 次
  const p2 = []
  for (let i = 0; i < 100; i++) p2.push(outbound(token, id, 1, 'N' + i))
  const r2 = await Promise.all(p2)
  let ok2 = 0
  r2.forEach(r => { if (r.success) ok2++ })
  const after2 = await getStock(token, id)
  console.log(`并发100次各扣1: 成功 ${ok2} 次 / 最终库存 ${after2} ${after2 < 0 ? '❌负库存' : '✅无超卖'}`)

  console.log(`结论: 期望最终库存 0，实际 ${after2} ${after2 === 0 ? '✅完全正确' : '❌异常'}`)
})()
