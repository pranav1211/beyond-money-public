import { ref } from 'vue'

const CREDENTIAL_KEY = 'bm_biometric_credential'
const ENABLED_KEY = 'bm_biometric_enabled'

const isLocked = ref(false)
const isSupported = ref(false)
const isEnabled = ref(localStorage.getItem(ENABLED_KEY) === 'true')

// Check WebAuthn + platform authenticator support
async function checkSupport() {
  if (!window.PublicKeyCredential) {
    isSupported.value = false
    return
  }
  try {
    isSupported.value = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    isSupported.value = false
  }
}
checkSupport()

function getStoredCredential() {
  try {
    return JSON.parse(localStorage.getItem(CREDENTIAL_KEY))
  } catch {
    return null
  }
}

// Convert base64url string to Uint8Array
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Convert ArrayBuffer to base64url string
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Register a new biometric credential on this device
async function enroll() {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = crypto.getRandomValues(new Uint8Array(16))

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Beyond Money', id: window.location.hostname },
      user: {
        id: userId,
        name: 'app-lock',
        displayName: 'App Lock',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' },  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
    },
  })

  const stored = {
    id: bufferToBase64url(credential.rawId),
    type: credential.type,
  }
  localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(stored))
  localStorage.setItem(ENABLED_KEY, 'true')
  isEnabled.value = true
  isLocked.value = false
  return true
}

// Verify biometrics using stored credential
async function verify() {
  const stored = getStoredCredential()
  if (!stored) {
    // No credential registered — can't verify, unlock
    isLocked.value = false
    return true
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))

  try {
    await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          id: base64urlToBuffer(stored.id),
          type: 'public-key',
          transports: ['internal'],
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    isLocked.value = false
    return true
  } catch {
    // User cancelled or verification failed — stay locked
    return false
  }
}

// Disable biometric lock
function disable() {
  localStorage.removeItem(CREDENTIAL_KEY)
  localStorage.removeItem(ENABLED_KEY)
  isEnabled.value = false
  isLocked.value = false
}

// Lock the app (call on visibility change / app resume)
function lock() {
  if (isEnabled.value) {
    isLocked.value = true
  }
}

// Initialize — lock if enabled (for app startup)
function initLock() {
  if (isEnabled.value && getStoredCredential()) {
    isLocked.value = true
  }
}

export function useBiometricLock() {
  return {
    isLocked,
    isSupported,
    isEnabled,
    enroll,
    verify,
    disable,
    lock,
    initLock,
  }
}
