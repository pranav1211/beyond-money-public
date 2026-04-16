import express from 'express'
import { exec } from 'child_process'
import crypto from 'crypto'

const app = express()
const scriptPath = '/shellfiles/bmbpull.sh'

// Raw body needed for GitHub signature verification
app.use('/beyondmoneyg', express.raw({ type: 'application/json' }))

function verifyGitHubSignature(payload, signature) {
  const secret = process.env.bmbmoneygitkey

  if (!secret) {
    console.error('Missing env: bmbmoneygitkey')
    return false
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  const actual = signature.replace('sha256=', '')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(actual, 'hex')
    )
  } catch {
    return false
  }
}

// Optional: keep GET for manual trigger
app.get('/beyondmoneyg', (req, res) => {
  exec(`sh ${scriptPath}`, (err, stdout, stderr) => {
    if (err) {
      console.error(err)
      return res.status(500).send('Script failed')
    }

    if (stderr) console.error(stderr)

    res.send(`
      <h2>Manual trigger success</h2>
      <pre>${stdout}</pre>
    `)
  })
})

// GitHub webhook
app.post('/beyondmoneyg', (req, res) => {
  const signature = req.get('X-Hub-Signature-256')

  if (!signature) {
    return res.status(401).json({ error: 'No signature' })
  }

  if (!verifyGitHubSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  console.log('Webhook verified → running deploy')

  exec(`sh ${scriptPath}`, (err, stdout, stderr) => {
    if (err) {
      console.error(err)
      return res.status(500).json({ error: 'Script failed' })
    }

    if (stderr) console.error(stderr)

    res.json({
      status: 'ok',
      time: new Date()
    })
  })
})

app.listen(7020, () => {
  console.log('bmbmoney webhook running on 7020')
})