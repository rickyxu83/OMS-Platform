async function loginAsEngineer(page) {
  const response = await page.request.post('http://127.0.0.1:3000/api/v1/auth/login', {
    data: { username: 'engineer', password: process.env.RC_E2E_PASSWORD || '' }
  })
  const body = await response.json()
  const token = body.token
  await page.evaluate((t) => { localStorage.setItem('auth_token', t) }, token)
  return token
}
module.exports = { loginAsEngineer }
