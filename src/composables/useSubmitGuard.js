import { ref } from 'vue'

// Guards a form submit against accidental double-clicks / double-taps.
//
// The real-world bug: tapping "Add Transaction" twice fires the submit handler
// twice before the view has navigated away, recording the transaction (and any
// downstream side effects like credit-card prepaid updates) two times. A single
// in-flight flag blocks the second run.
//
// `submitting` doubles as the button's :disabled binding so it visibly locks.
// A safety timeout re-enables it if the parent handler neither navigates away
// nor unmounts the form (e.g. an unexpected error), so the button can never get
// permanently stuck.
export function useSubmitGuard(resetMs = 6000) {
  const submitting = ref(false)
  let timer = null

  // Returns false (and does nothing) if a submit is already in flight.
  function run(fn) {
    if (submitting.value) return false
    submitting.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { submitting.value = false }, resetMs)
    fn()
    return true
  }

  function reset() {
    clearTimeout(timer)
    submitting.value = false
  }

  return { submitting, run, reset }
}
